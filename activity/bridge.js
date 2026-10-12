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

const notify = msg => (typeof toast === 'function' ? toast(msg) : console.log('[Activity]', msg));

async function postJson(url, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
    return data;
}

// ── Discord handshake ────────────────────────────────────────────────────────

async function authenticate() {
    const res = await fetch('/api/activity/config');
    if (!res.ok) throw new Error('Discord-Activity ist auf diesem Server nicht eingerichtet.');
    state.config = await res.json();

    state.sdk = new DiscordSDK(state.config.clientId);
    await state.sdk.ready();

    const { code } = await state.sdk.commands.authorize({
        client_id: state.config.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
    });
    const { access_token } = await postJson('/api/activity/token', { code });
    const auth = await state.sdk.commands.authenticate({ access_token });
    if (!auth || !auth.user) throw new Error('Discord-Anmeldung fehlgeschlagen.');

    state.accessToken = access_token;
    state.user = auth.user;
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
    if (!state.accessToken) return start();
    if (state.joining) return;
    state.joining = true;
    setStatus('Trete der Lobby bei …');
    try {
        await domReady;
        const seat = await postJson('/api/activity/lobby', { instanceId: state.sdk.instanceId }, state.accessToken);

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

        await MP.connect();
        watchSocket();

        const ack = await new Promise(resolve => MP.socket.emit('session:connect', {
            sessionId: MP.sessionId,
            clientId: seat.clientId,
            password: MP.password,
        }, resolve));
        if (!ack || ack.error) throw new Error((ack && ack.error) || 'Verbindung zur Lobby fehlgeschlagen.');

        // Same as mp.js after joining by code
        MP.lobbyIndex = ack.playerIndex;
        MP.active = true;
        MP.players = ack.players;
        MP.gameConfig = ack.gameConfig || {};
        MP.hostIndex = ack.hostIndex !== undefined ? ack.hostIndex : 0;
        const credBox = $('mp-cred-box');
        if (credBox) credBox.textContent = `Code: ${MP.joinCode}  PW: ${MP.password}`;

        if (ack.status === 'lobby') {
            await MP.showLobby();
            MP.setMode('waiting');
            notify(seat.created ? 'Lobby erstellt – deine Gruppe tritt automatisch bei.' : 'Lobby beigetreten.');
        } else {
            notify('Spiel läuft, lade Zustand …');        // mp.js receives 'game:start'
        }
        setStatus(`Lobby ${MP.joinCode}`);
    } catch (err) {
        console.error('[Activity] Lobby:', err);
        notify(err.message);
        setStatus('Keine Lobby');
    } finally {
        state.joining = false;
    }
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
    bar.querySelector('.dc-status').textContent = state.status;
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
        btn.textContent = 'Mit der Discord-Gruppe spielen';
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

    renderBar();
}

// ── Start ────────────────────────────────────────────────────────────────────

let starting = null;
function start() {
    if (starting) return starting;
    starting = (async () => {
        try {
            setStatus('Verbinde mit Discord …');
            await authenticate();
            setStatus('Angemeldet');
            await joinGroupLobby();
        } catch (err) {
            console.error('[Activity] Discord:', err);
            setStatus('Discord-Anmeldung fehlgeschlagen – Button erneut drücken');
            notify(err.message || 'Discord-Anmeldung fehlgeschlagen.');
        } finally {
            starting = null;
        }
    })();
    return starting;
}

if (IN_DISCORD) {
    domReady.then(() => {
        if (typeof MP === 'undefined') {
            console.error('[Activity] mp.js is not loaded – multiplayer is unavailable.');
            return;
        }
        injectUi();
    });
    start();
}
