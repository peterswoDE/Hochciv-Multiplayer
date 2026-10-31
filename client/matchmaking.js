/**
 * Ranked matchmaking (F9) on the game page – the server side is sockets/match.js. Loaded after
 * mp.js (inject.js); mp.js attaches it to every new socket and offers "Gewertetes Spiel suchen"
 * in the multiplayer menu.
 *
 *   search → "Spiel gefunden" (confirm within the countdown) → waiting for the others
 *          → the server's lobby: joined like a code from a friend, the game starts by itself
 *
 * Closing the search dialog keeps searching; "Spiel gefunden" opens it again, and the menu
 * button brings it back.
 */
const MATCH = {
    state: null,            // null | 'queue' | 'found' | 'accepted'
    status: null,           // { waiting, window, queued } from the server
    found: null,            // { matchId, players, confirmMs, until }
    progress: null,         // { accepted, total }
    timer: null,

    /** May the search put player-bots (bot accounts) into my game? The checkbox in the menu, remembered. */
    allowBots: function () {
        const box = $('mpm-allow-bots');
        if (box) try { localStorage.setItem('hochciv.matchBots', box.checked ? '1' : '0'); } catch (_) { }
        try { return localStorage.getItem('hochciv.matchBots') === '1'; } catch (_) { return !!(box && box.checked); }
    },

    attach: function (socket) {
        socket.on('connect', () => { if (this.state === 'queue') socket.emit('match:join', { allowBots: this.allowBots() }); });     // back after a reconnect
        // only the numbers – a closed dialog stays closed (the search goes on; "found" opens it again)
        socket.on('match:status', s => { if (this.state !== 'queue') return; this.status = Object.assign(s, { at: Date.now() }); this.tickView(); });
        socket.on('match:found', f => {
            this.state = 'found';
            this.found = Object.assign(f, { until: Date.now() + f.confirmMs });
            this.progress = { accepted: 0, total: f.players.length };
            this.render();
            if (typeof navigator.vibrate === 'function') try { navigator.vibrate(200); } catch (_) { }
        });
        socket.on('match:progress', p => { this.progress = p; this.render(); });
        socket.on('match:cancelled', c => {
            toast(TXS(c.reason));
            if (c.requeued) { this.state = 'queue'; this.found = null; this.render(); } else this.stop(true);
        });
        socket.on('match:ready', r => this.joinLobby(r));
    },

    start: async function () {
        if (this.state) return this.render();          // already searching (dialog closed meanwhile)
        await MP.fetchUser();
        if (!MP.user) { toast(TX('Für gewertete Spiele musst du angemeldet sein.')); return MP.showAuthModal(); }
        await MP.connect();
        MP.socket.emit('match:join', { allowBots: this.allowBots() }, res => {
            if (res && res.error) return toast(TXS(res.error));
            this.state = 'queue';
            this.status = { waiting: 0, window: 100, queued: res.queued || 1, at: Date.now() };
            this.render();
        });
    },

    /** Leave the queue (or the confirmation) and go back to the multiplayer menu. */
    stop: function (quiet) {
        if (!quiet && MP.socket) {
            if (this.state === 'found' && this.found) MP.socket.emit('match:decline', { matchId: this.found.matchId });
            else MP.socket.emit('match:leave', {});
        }
        this.state = null;
        this.found = null;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (MP.setMode) MP.setMode('menu'); else closeModal();
    },

    accept: function () {
        if (!this.found) return;
        MP.socket.emit('match:accept', { matchId: this.found.matchId }, res => {
            if (res && res.error) { toast(TXS(res.error)); return this.stop(true); }
            this.state = 'accepted';
            this.render();
        });
    },

    /** The server made the lobby: join it like with a code – the game starts once all are there. */
    joinLobby: async function (r) {
        this.state = null;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        sessionStorage.setItem('mp-clientId', r.clientId);
        MP.sessionId = r.sessionId;
        MP.joinCode = r.joinCode;
        MP.password = r.password;
        await MP.showLobby();
        MP.socket.emit('session:connect', { sessionId: r.sessionId, clientId: r.clientId, password: r.password }, ack => {
            if (!ack || ack.error) return toast(TXS((ack && ack.error) || TX('Fehler')));
            MP.enterSession(ack);
            toast(TX('Alle haben bestätigt – das Spiel startet, sobald alle da sind.'));
        });
    },

    render: function () {
        if (!this.state) return;
        if (!this.timer) this.timer = setInterval(() => this.tickView(), 250);
        const mmr = MP.user ? MP.user.mmr : '–';
        let h;
        if (this.state === 'queue') {
            h = `<p>${TX('Suche Mitspieler mit ähnlicher Wertung …')}</p>
                <div class="mpm-box"><div class="mpm-spinner" aria-hidden="true"></div>
                  <div><b id="mpm-wait">0:00</b><br><small id="mpm-info"></small></div></div>
                <p class="sub">${TX('Gespielt wird auf der Originalkarte, mit zufälligen Nationen, 3 Minuten pro Zug und der KI auf der schwersten Stufe für freie Plätze. Deine Wertung: %s MMR.', escHtml(mmr))}</p>
                <button class="btn wide ghost" onclick="MATCH.stop()">${TX('Suche abbrechen')}</button>`;
        } else {
            const f = this.found, p = this.progress || { accepted: 0, total: f.players.length };
            h = `<p><b>${TX('Spiel gefunden!')}</b> ${TX('Mitspieler:')}</p>
                <ul class="mpm-players">${f.players.map(x => `<li>${escHtml(x.name)} ${x.isBot ? MP.botBadge() : ''} <small>(${escHtml(x.mmr)} MMR)</small></li>`).join('')}</ul>
                <div class="mpm-bar"><div id="mpm-left"></div></div>
                <p class="sub" id="mpm-progress">${TX('%s von %s haben bestätigt.', p.accepted, p.total)}</p>
                ${this.state === 'found'
        ? `<button class="btn wide primary" onclick="MATCH.accept()">${TX('Annehmen')}</button>
                   <button class="btn wide ghost" onclick="MATCH.stop()">${TX('Ablehnen')}</button>`
        : `<p>${TX('Angenommen – warte auf die anderen …')}</p>`}`;
        }
        modal(TX('Gewertetes Spiel'), h);
        this.tickView();
    },

    /** Clocks without a server round trip: waiting time / confirmation countdown. */
    tickView: function () {
        if (this.state === 'queue' && this.status && $('mpm-wait')) {
            const s = Math.floor((this.status.waiting + Date.now() - this.status.at) / 1000);
            $('mpm-wait').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
            $('mpm-info').textContent = TX('MMR-Spanne ±%s · %s in der Warteschlange', this.status.window, this.status.queued);
        }
        if ((this.state === 'found' || this.state === 'accepted') && this.found && $('mpm-left')) {
            const left = Math.max(0, this.found.until - Date.now());
            $('mpm-left').style.width = (100 * left / this.found.confirmMs) + '%';
        }
        if (!this.state && this.timer) { clearInterval(this.timer); this.timer = null; }
        // the confirmation runs out while the dialog is closed: the server cancels, nothing to do here
    },
};

window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .mpm-box { display: flex; align-items: center; gap: 14px; margin: 14px 0; font-size: 15px; }
        .mpm-box b { font-size: 22px; font-variant-numeric: tabular-nums; }
        .mpm-spinner { width: 34px; height: 34px; border-radius: 50%; border: 4px solid rgba(157,59,47,0.2); border-top-color: #9d3b2f; animation: mpmSpin 1s linear infinite; }
        @keyframes mpmSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .mpm-spinner { animation: none; } }
        .mpm-players { padding-left: 18px; margin: 6px 0 10px; }
        .mpm-bar { height: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden; margin: 8px 0; }
        .mpm-bar > div { height: 100%; background: #9d3b2f; transition: width 0.25s linear; }
    `;
    document.head.appendChild(style);
});
