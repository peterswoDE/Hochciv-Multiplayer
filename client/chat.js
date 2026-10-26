/**
 * In-game chat for live games and Rundenspiele (server: utils/chat.js, sockets/game.js,
 * async/service.js). Loaded on the game page after mp.js (inject.js).
 *
 *   · a panel at the bottom left, collapsible to a "💬 Chat" pill with the number of unread messages;
 *   · text, a row of quick emotes, and map pings: 📍, then tap a hex – it pulses on every screen;
 *   · tapping another player's message opens a menu (CHAT.menuItems): report the message to the
 *     admins, block the player. Blocked players' messages and pings are hidden; the list is kept
 *     with the account (/api/account/blocks), for guests on this device. Shown under the chat.
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
    LOCAL_KEY: 'hochciv.chat.blocked',  // guests: [{ id, name }] on this device
    OLD_MUTED_KEY: 'hochciv.chat.muted',    // the earlier mute list (names) – read as blocks
    blocks: [],                 // the account's list [{ key, id, name }] (logged in)
    blocksOf: null,             // … loaded for this user id
    menuMsg: null,              // the message the open menu is about

    // ── Messages ────────────────────────────────────────────────────────────────────
    /** Called by mp.js for every new socket. */
    attach: function (socket) {
        socket.on('chat:history', data => {
            if (!data || (data.id && data.id !== MP.asyncId) || (!data.id && MP.asyncId)) return;
            this.list = Array.isArray(data.list) ? data.list : [];
            const seen = this.seen();
            this.unread = this.isOpen() ? 0 : this.list.filter(m => m.t > seen && !this.mine(m) && !this.isBlocked(m)).length;
            if (this.isOpen()) this.markSeen();
            this.render();
        });
        socket.on('chat:msg', msg => { if (!MP.asyncId) this.receive(msg); });
        socket.on('async:chat', data => { if (data && data.id === MP.asyncId) this.receive(data.msg); });
    },

    receive: function (msg) {
        if (!msg || this.isBlocked(msg)) return;
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

    // ── Blocking ─────────────────────────────────────────────────────────────────────
    // An entry with an id blocks that account, one without blocks the name of a guest.
    localBlocks: function () {
        let list = [];
        try {
            list = JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '[]');
            JSON.parse(localStorage.getItem(this.OLD_MUTED_KEY) || '[]').forEach(name => {
                if (!list.some(b => !b.id && b.name === name)) list.push({ id: null, name });
            });
        } catch (_) { }
        return list.map(b => ({ key: b.id ? 'id:' + b.id : 'name:' + b.name, id: b.id || null, name: b.name, local: true }));
    },
    saveLocal: function (list) {
        try {
            localStorage.setItem(this.LOCAL_KEY, JSON.stringify(list.map(b => ({ id: b.id, name: b.name }))));
            localStorage.removeItem(this.OLD_MUTED_KEY);
        } catch (_) { }
    },
    /** Everything blocked: the account's list (logged in) and this device's. */
    blocked: function () {
        const local = this.localBlocks();
        const own = MP.user ? this.blocks : [];
        return own.concat(local.filter(b => !own.some(o => o.key === b.key)));
    },
    matches: (b, m) => (b.id ? b.id === m.uid : !m.uid && b.name === m.name),
    isBlocked: function (m) { return !this.mine(m) && this.blocked().some(b => this.matches(b, m)); },

    /** The account's list, once per login. */
    loadBlocks: function () {
        const uid = MP.user ? MP.user.id : null;
        if (!uid || this.blocksOf === uid) return;
        this.blocksOf = uid;
        fetch('/api/account/blocks').then(r => (r.ok ? r.json() : null)).then(d => {
            if (d && Array.isArray(d.list) && this.blocksOf === uid) { this.blocks = d.list; this.render(); }
        }).catch(() => { });
    },

    block: async function (m) {
        const entry = { id: m.uid || null, name: m.name };
        if (MP.user) {
            const res = await fetch('/api/account/blocks', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
            }).catch(() => null);
            const d = res ? await res.json().catch(() => ({})) : { error: 'Keine Verbindung zum Server.' };
            if (!res || !res.ok) return toast(TXS(d.error || 'Serverfehler'));
            this.blocks = d.list;
        } else {
            const list = this.localBlocks();
            if (!list.some(b => this.matches(b, m))) this.saveLocal(list.concat(entry));
        }
        toast(TX('%s ist blockiert.', m.name));
        this.render();
    },

    unblock: async function (key) {
        const b = this.blocked().find(x => x.key === key);
        if (!b) return;
        if (b.local) this.saveLocal(this.localBlocks().filter(x => x.key !== key));
        else {
            const res = await fetch('/api/account/blocks/' + encodeURIComponent(key), { method: 'DELETE' }).catch(() => null);
            if (!res || !res.ok) return toast(TX('Serverfehler'));
            this.blocks = (await res.json()).list;
        }
        toast(TX('%s ist nicht mehr blockiert.', b.name));
        this.render();
    },

    // ── Reporting ────────────────────────────────────────────────────────────────────
    report: function (m, reason) {
        const done = res => {
            if (res && res.error) return toast(TXS(res.error));
            toast(TX('Danke! Ein Admin sieht sich die Nachricht an.'));
        };
        if (MP.asyncId) MP.socket.emit('async:report', { id: MP.asyncId, msgId: m.id, reason }, done);
        else MP.socket.emit('chat:report', { id: m.id, reason }, done);
    },

    // ── Menu on another player's message ────────────────────────────────────────────
    /**
     * Entries of the menu, in order. More can be added: { id, icon, label (German, translated),
     * when(m) → shown for this message?, run(m) }. `run` may return a step ({ html, init(el) })
     * to show in the menu instead of closing it.
     */
    menuItems: [
        {
            id: 'report', icon: '🚩', label: 'Nachricht melden',
            when: m => m.kind === 'text' || m.kind === 'emote',
            run: m => ({
                html: `<p class="mp-chat-menu-q">${TX('Diese Nachricht an die Admins melden? Sie sehen dazu den Chat-Verlauf dieses Spiels.')}</p>
                    <input id="mp-chat-reason" maxlength="300" placeholder="${TX('Grund (freiwillig)')}">
                    <div class="mp-chat-menu-btns"><button type="button" data-step="cancel">${TX('Abbrechen')}</button>
                    <button type="button" class="primary" data-step="send">${TX('Melden')}</button></div>`,
                init: el => {
                    const input = el.querySelector('#mp-chat-reason');
                    el.querySelector('[data-step="send"]').addEventListener('click', () => { CHAT.report(m, input.value); CHAT.closeMenu(); });
                    el.querySelector('[data-step="cancel"]').addEventListener('click', () => CHAT.closeMenu());
                },
            }),
        },
        { id: 'block', icon: '🚫', label: 'Spieler blockieren', when: () => true, run: m => { CHAT.block(m); } },
    ],

    openMenu: function (m) {
        const menu = $('mp-chat-menu');
        if (!menu) return;
        this.cancelPing();
        this.menuMsg = m;
        const quote = m.kind === 'emote' ? escHtml(m.emote) : escHtml(m.text);
        const items = this.menuItems.filter(it => it.when(m));
        menu.innerHTML = `<div class="mp-chat-menu-head"><b>${escHtml(m.name)}</b><span>${quote}</span></div>
            <div class="mp-chat-menu-body">${items.map(it => `<button type="button" data-item="${escHtml(it.id)}">${it.icon} ${escHtml(TX(it.label))}</button>`).join('')}</div>`;
        menu.hidden = false;
        $('mp-chat').classList.add('mp-menu-open');
        menu.querySelectorAll('[data-item]').forEach(btn => btn.addEventListener('click', e => {
            e.stopPropagation();
            const it = this.menuItems.find(x => x.id === btn.dataset.item);
            const step = it && this.menuMsg ? it.run(this.menuMsg) : null;
            if (!step || !step.html) return this.closeMenu();
            const body = menu.querySelector('.mp-chat-menu-body');
            body.innerHTML = step.html;
            if (step.init) step.init(body);
            const first = body.querySelector('input, textarea');
            if (first) first.focus();
        }));
    },
    closeMenu: function () {
        const menu = $('mp-chat-menu');
        if (menu) { menu.hidden = true; menu.innerHTML = ''; }
        const box = $('mp-chat');
        if (box) box.classList.remove('mp-menu-open');
        this.menuMsg = null;
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
        else { this.cancelPing(); this.closeMenu(); }
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
        this.loadBlocks();
        const blocked = this.blocked();
        const rows = this.list.filter(m => !this.isBlocked(m)).map(m => {
            const me = this.mine(m);
            const body = m.kind === 'emote' ? `<span class="mp-chat-emote">${escHtml(m.emote)}</span>`
                : `<span class="mp-chat-txt">${escHtml(m.text)}</span>`;
            const attrs = me ? '' : ` data-msg="${escHtml(m.id)}" title="${TX('Optionen')}" tabindex="0"`;
            return `<div class="mp-chat-msg${me ? ' me' : ''}"${attrs}><span class="mp-pl-dot" style="background:${escHtml(this.colorOf(m.slot))}"></span>
                <span><b>${escHtml(m.name)}</b> ${body}</span>${me ? '' : '<span class="mp-chat-more">⋯</span>'}</div>`;
        });
        list.innerHTML = rows.join('') || `<p class="mp-chat-empty">${TX('Noch keine Nachrichten.')}</p>`;
        const foot = $('mp-chat-blocked');
        if (foot) {
            foot.hidden = !blocked.length;
            foot.innerHTML = blocked.length ? TX('Blockiert: %s', blocked.map(b =>
                `<span class="mp-chat-blk">${escHtml(b.name)} <a href="#" data-unblock="${escHtml(b.key)}" title="${TX('Entblocken')}">✕</a></span>`).join(', ')) : '';
        }
        if (this.menuMsg && !this.list.some(m => m.id === this.menuMsg.id && !this.isBlocked(m))) this.closeMenu();
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
            <p id="mp-chat-blocked" hidden></p>
            <div id="mp-chat-menu" hidden></div>
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
        $('mp-chat-list').addEventListener('keydown', e => {
            const row = e.target.closest && e.target.closest('[data-msg]');
            if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.menuMsg) this.closeMenu(); });
        box.addEventListener('click', e => {
            if (box.classList.contains('mp-log-minimized')) return this.setOpen(true);
            if (e.target.closest('#mp-chat-menu')) return;
            const un = e.target.closest('[data-unblock]');
            if (un) { e.preventDefault(); return this.unblock(un.dataset.unblock); }
            const row = e.target.closest('[data-msg]');
            if (row) {
                const m = this.list.find(x => x.id === row.dataset.msg);
                if (m) return this.menuMsg && this.menuMsg.id === m.id ? this.closeMenu() : this.openMenu(m);
            }
            if (this.menuMsg) this.closeMenu();
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
            .mp-chat-msg[data-msg] { cursor: pointer; border-radius: 4px; }
            .mp-chat-msg[data-msg]:hover, .mp-chat-msg[data-msg]:focus { background: rgba(0,0,0,0.06); outline: none; }
            .mp-chat-more { opacity: 0; font-size: 13px; padding: 0 2px; color: #6f6551; }
            .mp-chat-msg[data-msg]:hover .mp-chat-more, .mp-chat-msg[data-msg]:focus .mp-chat-more { opacity: 0.8; }
            @media (hover: none) { .mp-chat-more { opacity: 0.5; } }
            /* the menu on a message: over the messages, below the header; the panel grows for it */
            #mp-chat.mp-menu-open #mp-chat-list { min-height: 200px; }
            #mp-chat-menu { position: absolute; left: 6px; right: 6px; top: 36px; bottom: 6px; z-index: 2; display: flex; flex-direction: column;
                pointer-events: none; overflow-y: auto; }
            #mp-chat-menu > * { pointer-events: auto; background: #fffdf3; border: 1px solid #a89f91; }
            #mp-chat-menu > :first-child { margin-top: auto; border-radius: 6px 6px 0 0; box-shadow: 0 -2px 10px rgba(0,0,0,0.15); }
            #mp-chat-menu > :last-child { border-top: none; border-radius: 0 0 6px 6px; box-shadow: 0 6px 12px rgba(0,0,0,0.2); }
            #mp-chat-menu[hidden] { display: none; }
            .mp-chat-menu-head { padding: 6px 10px; background: #efe8d4; display: flex; gap: 6px; min-width: 0; }
            .mp-chat-menu-head span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
            .mp-chat-menu-body { display: flex; flex-direction: column; }
            .mp-chat-menu-body > button { text-align: left; border: none; border-top: 1px solid #eee; background: none; padding: 8px 10px; font-size: 14px; cursor: pointer; }
            .mp-chat-menu-body > button:hover, .mp-chat-menu-body > button:focus { background: rgba(0,0,0,0.06); }
            .mp-chat-menu-q { margin: 8px 10px 6px; font-size: 13px; }
            #mp-chat-reason { margin: 0 10px; font-size: 14px; padding: 4px 6px; }
            .mp-chat-menu-btns { display: flex; justify-content: flex-end; gap: 6px; padding: 8px 10px; }
            .mp-chat-menu-btns button { border: 1px solid #ccc; background: #fff; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 14px; }
            .mp-chat-menu-btns button.primary { background: #9d3b2f; border-color: #9d3b2f; color: #fff; }
            .mp-chat-blk { white-space: nowrap; }
            .mp-chat-blk a { text-decoration: none; color: #9d3b2f; }
            .mp-chat-empty { margin: 4px 0; opacity: 0.6; }
            #mp-chat-blocked { margin: 0; padding: 2px 8px; font-size: 11px; opacity: 0.8; }
            #mp-chat-emotes { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 6px; border-top: 1px solid #ddd; }
            #mp-chat-emotes[hidden], #mp-chat-form[hidden], #mp-chat-blocked[hidden] { display: none; }
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
