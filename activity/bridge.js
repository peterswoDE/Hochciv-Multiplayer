/**
 * Discord Activity bridge – runs inside the game page after mp.js (added by inject.js, served
 * as /js/activity.js). Outside Discord (no ?frame_id=…) it does nothing.
 *
 * 1. Embedded App SDK handshake: ready → authorize → token exchange → authenticate.
 * 2. Seats the player in the shared lobby of this activity instance (/api/activity/lobby) and
 *    drives mp.js into that lobby, so nobody has to type join codes.
 * 3. Adapts the page to Discord: no account login (OAuth cannot leave the iframe), external
 *    links open through Discord.
 *
 * Globals used from the game / mp.js: MP, $, toast, show.
 */
import { DiscordSDK } from '@discord/embedded-app-sdk';

const params = new URLSearchParams(location.search);
// Discord starts the Activity with ?frame_id=…&instance_id=…; anywhere else this does nothing.
const IN_DISCORD = params.has('frame_id');
const FRAME_ID = params.get('frame_id') || '';
const INSTANCE_ID = params.get('instance_id') || '';

const state = {
    sdk: null,
    config: null,
    accessToken: null,
    user: null,
    joining: false,
    status: 'Verbinde mit Discord …',
};

const domReady = new Promise(resolve => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve, { once: true });
    else resolve();
});

/* What players see goes through client/i18n.js (loaded before this bundle); the log stays German. */
const i18n = msg => (window.HC_I18N ? window.HC_I18N.tr(msg) : msg);
const notify = msg => (typeof toast === 'function' ? toast(i18n(msg)) : console.log('[Activity]', msg));

/** Progress and errors go to the console and the server log (docker logs) – Discord's own
 *  console is hard to open while testing. */
function report(msg, level = 'info') {
    (level === 'error' ? console.error : console.log)('[Activity]', msg);
    if (!IN_DISCORD) return;
    try {
        fetch('/api/activity/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, msg: String(msg), frame: params.get('frame_id') || '' }),
            keepalive: true,
        }).catch(() => { });
    } catch (e) { /* ignore */ }
}

/** Reject if a step hangs, naming the step – the bar then shows where it got stuck. */
function withTimeout(promise, ms, step) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${step}: keine Antwort nach ${ms / 1000} s`)), ms); }),
    ]).finally(() => clearTimeout(timer));
}

function step(text) {
    report(text);
    setStatus(text);
}

async function postJson(url, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
    return data;
}

// ── Login of this Activity window ────────────────────────────────────────────
// After a reload Discord does not answer the SDK handshake again, so the login is kept in
// sessionStorage for this frame and reused (it only lives as long as the Activity window).

const AUTH_KEY = 'hochciv-activity-auth';

function saveAuth() {
    try {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({ frame: FRAME_ID, accessToken: state.accessToken, user: state.user }));
    } catch (e) { /* storage blocked */ }
}

function loadAuth() {
    try {
        const a = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
        return a && a.frame === FRAME_ID && a.accessToken && a.user ? a : null;
    } catch (e) {
        return null;
    }
}

function clearAuth() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* storage blocked */ }
    state.accessToken = null;
}

/** With a stored login: connect the SDK in the background, only for openExternalLink. */
async function connectSdkQuietly() {
    try {
        const res = await withTimeout(fetch('/api/activity/config'), 15000, 'Konfiguration');
        if (!res.ok) return;
        state.config = await res.json();
        const sdk = new DiscordSDK(state.config.clientId);
        await withTimeout(sdk.ready(), 20000, 'Discord ready');
        state.sdk = sdk;
        report('Discord-SDK nach Neuladen verbunden');
    } catch (err) {
        report(`Discord-SDK nach Neuladen nicht verfügbar (${err.message}) – Links öffnen nicht extern`);
    }
}

// ── Discord handshake ────────────────────────────────────────────────────────

async function authenticate() {
    step('Lade Konfiguration …');
    const res = await withTimeout(fetch('/api/activity/config'), 15000, 'Konfiguration');
    if (!res.ok) throw new Error('Discord-Activity ist auf diesem Server nicht eingerichtet.');
    state.config = await res.json();

    step('Verbinde mit Discord (ready) …');
    state.sdk = new DiscordSDK(state.config.clientId);
    await withTimeout(state.sdk.ready(), 20000, 'Discord ready');

    // May show Discord's consent dialog – the user can take their time, so no timeout here
    step('Warte auf Discord-Freigabe (authorize) …');
    const { code } = await state.sdk.commands.authorize({
        client_id: state.config.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
    });
    step('Tausche Code gegen Token …');
    const { access_token } = await withTimeout(postJson('/api/activity/token', { code }), 20000, 'Token');
    step('Melde bei Discord an (authenticate) …');
    const auth = await withTimeout(state.sdk.commands.authenticate({ access_token }), 20000, 'Discord authenticate');
    if (!auth || !auth.user) throw new Error('Discord-Anmeldung fehlgeschlagen.');
    report(`Angemeldet als Discord-Nutzer ${auth.user.id}`);

    state.accessToken = access_token;
    state.user = auth.user;
    saveAuth();
    // mp.js prefills its name fields from here
    try { localStorage.setItem('mp-name', auth.user.global_name || auth.user.username); } catch (e) { /* storage blocked */ }
}

// ── Shared lobby of this activity instance ───────────────────────────────────

/** Leave the socket of an earlier session, so its room no longer pushes states to us. */
function resetSocket() {
    if (MP.socket) {
        MP.socket.disconnect();
        MP.socket = null;
    }
    MP.active = false;
    MP.renderLobby = null;
}

/** When the host closes the lobby before the start, everyone moves on to a fresh one. */
function watchSocket() {
    if (!MP.socket || MP.socket.__activityWatched) return;
    MP.socket.__activityWatched = true;
    MP.socket.on('session:kicked', data => {
        // Without a reason the host kicked this player on purpose – then stay out.
        if (data && data.reason) setTimeout(joinGroupLobby, 400 + Math.random() * 800);
    });
}

async function joinGroupLobby() {
    if (!state.accessToken) {
        if (starting) return notify(`Noch nicht verbunden: ${state.status}`);
        return start();
    }
    if (state.joining) return;
    state.joining = true;
    step('Trete der Lobby bei …');
    try {
        await domReady;
        const seat = await withTimeout(
            postJson('/api/activity/lobby', { instanceId: (state.sdk && state.sdk.instanceId) || INSTANCE_ID }, state.accessToken), 20000, 'Lobby');
        report(`Lobby ${seat.joinCode}, Platz ${seat.playerIndex}${seat.created ? ' (neu, Host)' : ''}`);

        if (MP.sessionId && MP.sessionId !== seat.sessionId) {
            resetSocket();
            if (typeof show === 'function') show('screen-menu');
        }
        // mp.js identifies the seat by this secret id (sessionStorage 'mp-clientId')
        sessionStorage.setItem('mp-clientId', seat.clientId);
        MP.sessionId = seat.sessionId;
        MP.lobbyIndex = seat.playerIndex;
        MP.joinCode = seat.joinCode;
        MP.password = seat.password;

        step('Verbinde mit dem Spielserver (Socket.IO) …');
        await withTimeout(MP.connect(), 20000, 'Socket.IO');
        watchSocket();

        const ack = await withTimeout(new Promise(resolve => MP.socket.emit('session:connect', {
            sessionId: MP.sessionId,
            clientId: seat.clientId,
            password: MP.password,
        }, resolve)), 20000, 'Lobby-Verbindung');
        if (!ack || ack.error) throw new Error((ack && ack.error) || 'Verbindung zur Lobby fehlgeschlagen.');

        // Same as mp.js after joining by code (or to watch: the game runs or the lobby is full)
        if (ack.status === 'lobby') await MP.showLobby();
        MP.enterSession(ack);
        if (ack.spectator) notify(ack.status === 'lobby' ? 'Die Lobby ist voll – du schaust zu.' : 'Das Spiel läuft schon – du schaust zu.');
        else if (ack.status === 'lobby') notify(seat.created ? 'Lobby erstellt – deine Gruppe tritt automatisch bei.' : 'Lobby beigetreten.');
        else notify('Spiel läuft, lade Zustand …');        // mp.js receives 'game:start'
        step(`Lobby ${MP.joinCode}`);
    } catch (err) {
        report(`Lobby fehlgeschlagen: ${err && err.message}`, 'error');
        // Token expired: forget it, the next click logs in again
        if (err && err.status === 401) clearAuth();
        notify(err.message);
        setStatus('Keine Lobby');
    } finally {
        state.joining = false;
    }
}

// ── Back to the menu without reloading ──────────────────────────────────────
// The game leaves a finished or quit game with location.reload(). Inside Discord a reloaded
// page gets no SDK handshake, so these buttons return to the menu directly instead.

function backToMenu() {
    if (typeof store === 'function') store('hochciv.save', null);      // as the game does
    if (MP.socket || MP.active) resetSocket();
    MP.sessionId = null;
    MP.asyncId = null;
    document.body.classList.remove('mp-waiting');
    const log = $('mp-persistent-log-container');
    if (log) log.style.display = 'none';
    const cred = $('mp-cred-box');
    if (cred) cred.textContent = '';
    const cont = $('m-continue');
    if (cont) cont.hidden = true;
    if (typeof closeModal === 'function') closeModal();
    show('screen-menu');
    setStatus('Bereit');
}

function interceptReloads() {
    document.addEventListener('click', e => {
        const btn = e.target.closest && e.target.closest('#go-menu, #mm-quit, #go-again');
        if (!btn) return;
        // "Nochmal spielen" stays as it is in single player; in multiplayer it means a new group round
        if (btn.id === 'go-again' && !MP.active) return;
        e.preventDefault();
        e.stopPropagation();        // capture phase: the game's own onclick does not run
        const again = btn.id === 'go-again';
        backToMenu();
        if (again) joinGroupLobby();
    }, true);
}

// ── Inline event handlers ────────────────────────────────────────────────────
// Discord's proxy sends a Content-Security-Policy whose script-src only allows scripts from
// this origin and with a nonce – inline handlers like onclick="MP.startGame()" (used all over
// mp.js) are blocked. It does allow 'unsafe-eval', so each handler attribute is compiled into
// a handler function and set as the element's property, which the policy permits. Same
// semantics: one handler slot per event type, `this` is the element, `return false` cancels.

const HANDLER_ATTRS = ['onclick', 'ondblclick', 'onchange', 'oninput', 'onsubmit', 'onkeydown', 'onkeyup',
    'onkeypress', 'onmousedown', 'onmouseup', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
    'onpointerdown', 'onpointerup', 'ontouchstart', 'ontouchend', 'onfocus', 'onblur', 'oncontextmenu',
    'onwheel', 'onload', 'onerror'];
const HANDLER_SELECTOR = HANDLER_ATTRS.map(a => `[${a}]`).join(',');
const compiled = new WeakMap();     // element → { attr: source it was compiled from }

function compileHandlers(el) {
    let done = compiled.get(el);
    for (const attr of HANDLER_ATTRS) {
        const code = el.getAttribute(attr);
        if (code == null || (done && done[attr] === code)) continue;
        try {
            el[attr] = new Function('event', code);
        } catch (err) {
            report(`Inline-Handler ${attr} nicht übersetzbar: ${err.message}`, 'error');
            continue;
        }
        if (!done) compiled.set(el, done = {});
        done[attr] = code;
    }
}

function compileTree(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(HANDLER_SELECTOR)) compileHandlers(root);
    root.querySelectorAll(HANDLER_SELECTOR).forEach(compileHandlers);
}

function enableInlineHandlers() {
    compileTree(document.documentElement);
    // Modals and lobby lists are rendered with innerHTML – compile whatever appears later
    new MutationObserver(records => {
        for (const r of records) {
            if (r.type === 'attributes') compileHandlers(r.target);
            else r.addedNodes.forEach(compileTree);
        }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: HANDLER_ATTRS });
}

// ── Page adjustments ─────────────────────────────────────────────────────────

function setStatus(text) {
    state.status = text;
    renderBar();
}

function renderBar() {
    const bar = document.getElementById('dc-bar');
    if (!bar) return;
    const u = state.user;
    const name = u ? (u.global_name || u.username) : '';
    bar.querySelector('.dc-name').textContent = u ? `Discord: ${name}` : '';
    bar.querySelector('.dc-status').textContent = i18n(state.status);
}

function injectUi() {
    const style = document.createElement('style');
    style.textContent = `
        /* Account login and Rundenspiele need the website's login – not available inside Discord */
        #mp-main-auth-container, #mp-async-btn { display: none !important; }
        #dc-bar {
            position: absolute; top: 0; left: 0; right: 0; z-index: 1000;
            display: flex; justify-content: flex-end; align-items: center; gap: 12px;
            padding: 10px 20px; font-size: 14px; color: rgba(255,255,255,.9);
            background: rgba(0,0,0,.4); border-bottom: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(5px);
        }
        #dc-bar .dc-status { opacity: .7; }
        #dc-bar .dc-name { font-weight: bold; }
    `;
    document.head.appendChild(style);

    const menu = $('screen-menu');
    if (menu) {
        const bar = document.createElement('div');
        bar.id = 'dc-bar';
        bar.innerHTML = '<span class="dc-name"></span><span class="dc-status"></span>';
        menu.appendChild(bar);
    }

    const mNew = $('m-new');
    if (mNew) {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.id = 'dc-group-btn';
        btn.textContent = i18n('Mit der Discord-Gruppe spielen');
        btn.onclick = () => joinGroupLobby();
        mNew.parentNode.insertBefore(btn, mNew);
    }

    // Inside Discord links cannot open new tabs – hand them to Discord (it asks the user first)
    document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || !state.sdk) return;
        const url = new URL(a.getAttribute('href'), location.href);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
        const external = url.origin !== location.origin;
        if (!external && a.target !== '_blank') return;
        e.preventDefault();
        // Pages of the game itself open on its public website, if configured
        const target = external ? url.href
            : state.config && state.config.publicSiteUrl ? state.config.publicSiteUrl + url.pathname : null;
        if (target) state.sdk.commands.openExternalLink({ url: target }).catch(() => { });
    }, true);

    interceptReloads();
    renderBar();
}

// ── Start ────────────────────────────────────────────────────────────────────

let starting = null;
function start() {
    if (starting) return starting;
    starting = (async () => {
        try {
            const saved = loadAuth();
            if (saved) {
                state.accessToken = saved.accessToken;
                state.user = saved.user;
                report('Seite neu geladen – Discord-Anmeldung dieses Fensters wird weiterverwendet');
                connectSdkQuietly();
            } else {
                await authenticate();
            }
            starting = null;            // joinGroupLobby must not see the start as still running
            await joinGroupLobby();
        } catch (err) {
            report(`Anmeldung fehlgeschlagen: ${(err && err.message) || err}`, 'error');
            setStatus(`Fehler: ${(err && err.message) || err} – Button erneut drücken`);
            notify(err.message || 'Discord-Anmeldung fehlgeschlagen.');
        } finally {
            starting = null;
        }
    })();
    return starting;
}

if (IN_DISCORD) {
    report(`Bridge geladen (${navigator.userAgent})`);
    // Errors anywhere on the page (game, mp.js) – visible in the server log while testing
    window.addEventListener('error', e => report(`JS-Fehler: ${e.message} @ ${e.filename}:${e.lineno}`, 'error'));
    window.addEventListener('unhandledrejection', e => {
        const r = e.reason;
        report(`Unbehandelter Fehler: ${(r && (r.stack || r.message)) || r}`, 'error');
    });
    // Anything the CSP still blocks shows up in the server log, too
    document.addEventListener('securitypolicyviolation', e => {
        report(`CSP blockiert ${e.violatedDirective}: ${e.blockedURI || 'inline'} ${(e.sample || '').slice(0, 80)}`, 'error');
    });
    enableInlineHandlers();
    domReady.then(() => {
        if (typeof MP === 'undefined') {
            report('mp.js ist nicht geladen – Multiplayer nicht verfügbar.', 'error');
            return;
        }
        injectUi();
        // Toasts carry the server's answers ("Nur der Host …") – mirror them into the log
        if (typeof window.toast === 'function') {
            const origToast = window.toast;
            window.toast = function (msg) {
                report(`Toast: ${msg}`);
                return origToast.apply(this, arguments);
            };
        }
    });
    start();
}
