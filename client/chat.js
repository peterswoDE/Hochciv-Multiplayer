/**
 * In-game chat for live games and Rundenspiele (server: utils/chat.js, sockets/game.js,
 * async/service.js). Loaded on the game page after mp.js (inject.js).
 *
 *   · a panel at the bottom left, collapsible to a "💬 Chat" pill with the number of unread messages;
 *   · text, a row of quick emotes, and map pings: 📍, then tap a hex – it pulses on every screen;
 *   · muting a player hides their messages and pings on this device (localStorage).
 *
 * The server sends the history as 'chat:history' after joining (live: session:connect,
 * Rundenspiel: async:open), new messages as 'chat:msg' (live) / 'async:chat' (Rundenspiel).
 * A Rundenspiel remembers per device which messages were seen ('hochciv.chat.seen.<id>').
 */
const CHAT = {
    list: [],
    unread: 0,
    pingMode: false,
    pings: [],                  // active pings { r, c, color, until }
    PING_MS: 6000,
    EMOTES: ['👍', '👎', '😂', '😮', '😢', '😡', '🤝', '⚔️', '🙏', '🎉', '🤔', '👋'],     // as utils/chat.js
    MUTED_KEY: 'hochciv.chat.muted',

    // ── Messages ────────────────────────────────────────────────────────────────────
    /** Called by mp.js for every new socket. */
    attach: function (socket) {
        socket.on('chat:history', data => {
            if (!data || (data.id && data.id !== MP.asyncId) || (!data.id && MP.asyncId)) return;
            this.list = Array.isArray(data.list) ? data.list : [];
            const seen = this.seen();
            this.unread = this.isOpen() ? 0 : this.list.filter(m => m.t > seen && !this.mine(m) && !this.isMuted(m)).length;
            if (this.isOpen()) this.markSeen();
            this.render();
        });
        socket.on('chat:msg', msg => { if (!MP.asyncId) this.receive(msg); });
        socket.on('async:chat', data => { if (data && data.id === MP.asyncId) this.receive(data.msg); });
    },

    receive: function (msg) {
        if (!msg || this.isMuted(msg)) return;
        if (msg.kind === 'ping') this.showPing(msg);
        else this.list = this.list.concat(msg).slice(-200);
        if (!this.mine(msg) && msg.kind !== 'ping') {
            if (this.isOpen()) this.markSeen(); else this.unread++;
        }
        this.render();
    },

    send: function (payload) {
        const done = res => { if (res && res.error) toast(TXS(res.error)); };
        if (MP.asyncId) MP.socket.emit('async:chat', Object.assign({ id: MP.asyncId }, payload), done);
        else MP.socket.emit('chat:send', payload, done);
    },

    submit: function () {
        const input = $('mp-chat-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        this.send({ kind: 'text', text });
    },

    mine: m => m.slot === MP.lobbyIndex,

    // ── Muting (this device) ─────────────────────────────────────────────────────────
    muted: function () {
        try { return new Set(JSON.parse(localStorage.getItem(this.MUTED_KEY) || '[]')); } catch (_) { return new Set(); }
    },
    isMuted: function (m) { return !this.mine(m) && this.muted().has(m.name); },
    toggleMute: function (name) {
        const set = this.muted();
        if (set.has(name)) set.delete(name); else set.add(name);
        try { localStorage.setItem(this.MUTED_KEY, JSON.stringify([...set])); } catch (_) { }
        toast(set.has(name) ? TX('%s ist stummgeschaltet.', name) : TX('%s ist nicht mehr stummgeschaltet.', name));
        this.render();
    },

    // ── Seen / unread (Rundenspiele remember it per device) ─────────────────────────
    seenKey: () => 'hochciv.chat.seen.' + (MP.asyncId || 'live'),
    seen: function () {
        if (!MP.asyncId) return Infinity;      // live: the history from before joining counts as read
        try { return +localStorage.getItem(this.seenKey()) || 0; } catch (_) { return 0; }
    },
    markSeen: function () {
        this.unread = 0;
        if (!MP.asyncId) return;
        const last = this.list.length ? this.list[this.list.length - 1].t : Date.now();
        try { localStorage.setItem(this.seenKey(), String(last)); } catch (_) { }
    },

    // ── Panel ──────────────────────────────────────────────────────────────────────
    isOpen: () => { const el = $('mp-chat'); return !!el && !el.classList.contains('mp-log-minimized') && el.style.display !== 'none'; },
    setOpen: function (open) {
        $('mp-chat').classList.toggle('mp-log-minimized', !open);
        try { localStorage.setItem('mp-chat-open', open ? '1' : '0'); } catch (_) { }
        if (open) { this.markSeen(); this.render(); this.scrollDown(); MP.fitPanels($('mp-chat')); }
        else this.cancelPing();
    },

    colorOf: function (slot) {
        const sp = typeof S !== 'undefined' && S && S.players ? S.players.find(p => p.slot === slot) : null;
        return sp && typeof civOf === 'function' ? civOf(sp).color : '#999';
    },

    render: function () {
        const box = $('mp-chat');
        if (!box) return;
        const inGame = MP.active && $('screen-game') && $('screen-game').classList.contains('show');
        const appears = inGame && box.style.display === 'none';
        box.style.display = inGame ? '' : 'none';
        if (appears) MP.fitPanels();
        box.dataset.unread = this.unread > 0 ? (this.unread > 9 ? '9+' : String(this.unread)) : '';
        const spectator = !!MP.spectator;
        $('mp-chat-form').hidden = spectator;
        const list = $('mp-chat-list');
        if (!list) return;
        const atBottom = list.scrollHeight - list.clientHeight <= list.scrollTop + 10;
        const muted = this.muted();
        const rows = this.list.filter(m => !this.isMuted(m)).map(m => {
            const me = this.mine(m);
            const body = m.kind === 'emote' ? `<span class="mp-chat-emote">${escHtml(m.emote)}</span>`
                : `<span class="mp-chat-txt">${escHtml(m.text)}</span>`;
            const mute = me ? '' : `<button class="mp-chat-mute" title="${TX('Stummschalten')}" data-name="${escHtml(m.name)}">🔇</button>`;
            return `<div class="mp-chat-msg${me ? ' me' : ''}"><span class="mp-pl-dot" style="background:${escHtml(this.colorOf(m.slot))}"></span>
                <span><b>${escHtml(m.name)}</b> ${body}</span>${mute}</div>`;
        });
        list.innerHTML = rows.join('') || `<p class="mp-chat-empty">${TX('Noch keine Nachrichten.')}</p>`;
        const foot = $('mp-chat-muted');
        if (foot) {
            foot.hidden = !muted.size;
            foot.innerHTML = muted.size ? TX('Stumm: %s', [...muted].map(n => `<a href="#" data-unmute="${escHtml(n)}">${escHtml(n)}</a>`).join(', ')) : '';
        }
        if (atBottom) this.scrollDown();
    },
    scrollDown: function () { const l = $('mp-chat-list'); if (l) l.scrollTop = l.scrollHeight; },

    // ── Map pings ──────────────────────────────────────────────────────────────────
    startPing: function () {
        if (this.pingMode) return this.cancelPing();
        this.pingMode = true;
        document.documentElement.classList.add('mp-ping-mode');
        toast(TX('Tippe auf ein Feld der Karte.'));
    },
    cancelPing: function () {
        this.pingMode = false;
        document.documentElement.classList.remove('mp-ping-mode');
    },
    showPing: function (msg) {
        const until = Date.now() + this.PING_MS;
        this.pings = this.pings.filter(p => p.until > Date.now() && !(p.r === msg.r && p.c === msg.c)).concat({ r: msg.r, c: msg.c, color: this.colorOf(msg.slot), until });
        if (!this.mine(msg)) toast(TX('%s zeigt auf ein Feld.', msg.name));
        this.drawPings();
        setTimeout(() => this.drawPings(), this.PING_MS + 50);
    },
    /** Pings on the game map (#map); drawn again after every drawMap. */
    drawPings: function (svg) {
        svg = svg || $('map');
        const world = svg && svg.querySelector('#world');
        if (!world || typeof hexCenter !== 'function' || typeof HEX === 'undefined') return;
        world.querySelectorAll('.mp-ping').forEach(el => el.remove());
        const now = Date.now();
        this.pings = this.pings.filter(p => p.until > now);
        for (const p of this.pings) {
            const [x, y] = hexCenter(p.r, p.c, HEX);
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'mp-ping');
            g.setAttribute('transform', `translate(${x},${y})`);
            g.setAttribute('pointer-events', 'none');
            g.innerHTML = `<circle r="${HEX * 0.9}" fill="none" stroke="${p.color}" stroke-width="5" class="mp-ping-ring"></circle>
                <circle r="${HEX * 0.25}" fill="${p.color}" stroke="#fff" stroke-width="2"></circle>`;
            world.appendChild(g);
        }
    },

    // ── Setup ──────────────────────────────────────────────────────────────────────
    build: function () {
        if ($('mp-chat')) return;
        const box = document.createElement('div');
        box.id = 'mp-chat';
        box.style.display = 'none';
        box.innerHTML = `
            <div id="mp-chat-header"><span id="mp-chat-title">${TX('Chat')}</span><span style="font-size:16px">✖</span></div>
            <div id="mp-chat-list"></div>
            <p id="mp-chat-muted" hidden></p>
            <div id="mp-chat-emotes" hidden>${this.EMOTES.map(e => `<button type="button" data-emote="${e}">${e}</button>`).join('')}</div>
            <form id="mp-chat-form" autocomplete="off">
              <button type="button" id="mp-chat-emote-btn" title="${TX('Emoji senden')}">🙂</button>
              <button type="button" id="mp-chat-ping-btn" title="${TX('Auf ein Feld zeigen')}">📍</button>
              <input id="mp-chat-input" maxlength="300" placeholder="${TX('Nachricht …')}">
              <button type="submit" id="mp-chat-send" title="${TX('Senden')}">➤</button>
            </form>`;
        document.body.appendChild(box);
        let open = false;
        try { open = localStorage.getItem('mp-chat-open') === '1'; } catch (_) { }
        box.classList.toggle('mp-log-minimized', !open);

        $('mp-chat-header').addEventListener('click', e => { this.setOpen(false); e.stopPropagation(); });
        box.addEventListener('click', e => {
            if (box.classList.contains('mp-log-minimized')) return this.setOpen(true);
            const mute = e.target.closest('[data-name]');
            if (mute) return this.toggleMute(mute.dataset.name);
            const un = e.target.closest('[data-unmute]');
            if (un) { e.preventDefault(); return this.toggleMute(un.dataset.unmute); }
            const em = e.target.closest('[data-emote]');
            if (em) { this.send({ kind: 'emote', emote: em.dataset.emote }); $('mp-chat-emotes').hidden = true; }
        });
        $('mp-chat-form').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
        $('mp-chat-emote-btn').addEventListener('click', () => { $('mp-chat-emotes').hidden = !$('mp-chat-emotes').hidden; });
        $('mp-chat-ping-btn').addEventListener('click', () => this.startPing());

        // Ping mode: the next tap on the game map points at that hex instead of opening it
        const host = $('map-host');
        if (host) host.addEventListener('click', e => {
            if (!this.pingMode) return;
            const el = e.target.closest ? e.target.closest('[data-r]') : null;
            if (!el) return;
            e.stopPropagation();
            e.preventDefault();
            this.cancelPing();
            this.send({ kind: 'ping', r: +el.dataset.r, c: +el.dataset.c });
        }, true);

        const style = document.createElement('style');
        style.textContent = `
            #mp-chat {
                position: fixed; left: 10px; bottom: calc(var(--bar-h, 58px) + 10px); width: 280px; max-width: calc(45% - 10px);
                background: rgba(255,255,240,0.96); border: 2px solid #a89f91; border-radius: 6px; z-index: 29;   /* below the game's dialogs (30), like the log */
                box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-size: 13px; color: #333; overflow: hidden; pointer-events: auto;
                display: flex; flex-direction: column;
            }
            /* collapsed: a labelled pill like the player list and the log (mp.js) */
            #mp-chat.mp-log-minimized {
                width: auto !important; height: 34px !important; border-radius: 17px !important; border: none !important; padding: 0 12px;
                background: #a89f91 !important; cursor: pointer !important; justify-content: center; align-items: center; overflow: visible;
            }
            #mp-chat.mp-log-minimized > * { display: none !important; }
            #mp-chat.mp-log-minimized::before { content: "💬 " var(--mp-lbl-chat, "Chat"); }
            #mp-chat.mp-log-minimized:not([data-unread=""])::after {
                content: attr(data-unread); position: absolute; top: -2px; right: -2px; background: #c0392b; color: #fff;
                border-radius: 9px; min-width: 18px; height: 18px; font-size: 11px; font-weight: bold; line-height: 18px; text-align: center; padding: 0 4px;
            }
            #mp-chat-header { background: #a89f91; color: #fff; padding: 6px 10px; cursor: pointer; font-weight: bold; display: flex; justify-content: space-between; user-select: none; }
            #mp-chat-list { max-height: 28vh; min-height: 60px; overflow-y: auto; padding: 6px 8px; }
            /* phone held upright: the game turns the page (html.turn) – its height is the screen's width */
            html.turn #mp-chat-list { max-height: 18vw; }
            .mp-chat-msg { display: grid; grid-template-columns: 12px 1fr auto; gap: 0 6px; align-items: start; padding: 2px 0; overflow-wrap: anywhere; }
            .mp-chat-msg .mp-pl-dot { margin-top: 3px; }
            .mp-chat-msg.me b { color: #9d3b2f; }
            .mp-chat-emote { font-size: 20px; line-height: 1; }
            .mp-chat-mute { border: none; background: none; cursor: pointer; opacity: 0; font-size: 12px; padding: 0 2px; }
            .mp-chat-msg:hover .mp-chat-mute, .mp-chat-mute:focus { opacity: 0.6; }
            .mp-chat-empty { margin: 4px 0; opacity: 0.6; }
            #mp-chat-muted { margin: 0; padding: 2px 8px; font-size: 11px; opacity: 0.75; }
            #mp-chat-emotes { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 6px; border-top: 1px solid #ddd; }
            #mp-chat-emotes[hidden], #mp-chat-form[hidden], #mp-chat-muted[hidden] { display: none; }
            #mp-chat-emotes button { border: none; background: none; font-size: 20px; cursor: pointer; padding: 2px 4px; border-radius: 4px; }
            #mp-chat-emotes button:hover { background: rgba(0,0,0,0.08); }
            #mp-chat-form { display: flex; gap: 4px; padding: 6px; border-top: 1px solid #ddd; }
            #mp-chat-form input { flex: 1; min-width: 0; font-size: 14px; padding: 4px 6px; }
            #mp-chat-form button { border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; padding: 2px 6px; font-size: 15px; }
            html.mp-ping-mode #mp-chat-ping-btn { background: #9d3b2f; color: #fff; }
            html.mp-ping-mode #map { cursor: crosshair; }
            .mp-ping-ring { animation: mpPing 1.2s ease-out infinite; transform-box: fill-box; transform-origin: center; }
            @keyframes mpPing { 0% { transform: scale(0.4); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
        `;
        document.head.appendChild(style);
    },

    applyLang: function () {
        const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
        set('mp-chat-title', TX('Chat'));
        const attr = (id, a, text) => { const el = $(id); if (el) el.setAttribute(a, text); };
        attr('mp-chat-input', 'placeholder', TX('Nachricht …'));
        attr('mp-chat-emote-btn', 'title', TX('Emoji senden'));
        attr('mp-chat-ping-btn', 'title', TX('Auf ein Feld zeigen'));
        attr('mp-chat-send', 'title', TX('Senden'));
        this.render();
    },
};

// The game map is redrawn often – the pings go on top every time
(function () {
    const orig = window.drawMap;
    if (!orig) return;
    window.drawMap = function (svg) {
        const out = orig.apply(this, arguments);
        if (svg && svg.id === 'map' && CHAT.pings.length) CHAT.drawPings(svg);
        return out;
    };
})();
// Show / hide with the game screen (show() switches screens)
(function () {
    const orig = window.show;
    if (!orig) return;
    window.show = function () {
        const out = orig.apply(this, arguments);
        CHAT.render();
        return out;
    };
})();
window.addEventListener('DOMContentLoaded', () => CHAT.build());
