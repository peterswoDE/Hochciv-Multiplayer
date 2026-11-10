/**
 * Live games (F27): the host pauses the game, or lets it go on as a Rundenspiel. Loaded after
 * mp.js (inject.js), which calls PAUSE.attach(socket), PAUSE.set(paused) with every state and
 * PAUSE.menu(…) when the game menu (☰) opens.
 *
 *   Pause:  'game:pause' { pause } (host). Nobody can act (MP.isMyTurn is false), the turn timer
 *           stands still; a banner tells everyone, the host's banner has "Fortsetzen".
 *   Rundenspiel: 'game:toAsync' { turnDays } (host, logged in). The server moves the game to a
 *           Rundenspiel (async/service.js fromLive) and sends 'game:toAsync' { asyncId }: players
 *           with an account open it, guests (their empires go to the KI) and spectators are told.
 */
(function () {
    'use strict';
    if (window.PAUSE) return;
    const $ = id => document.getElementById(id);
    const tx = (de, ...a) => HC_I18N.t(de, ...a);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const PAUSE = {
        attach: function (socket) {
            socket.on('game:paused', d => { if (!MP.asyncId) this.set(d && d.paused); });
            socket.on('game:toAsync', d => { if (!MP.asyncId && d && d.asyncId) this.moved(d); });
        },

        isHost: () => !MP.asyncId && !MP.spectator && !MP.replay && MP.lobbyIndex != null && MP.lobbyIndex === MP.hostIndex,
        running: () => MP.active && !MP.asyncId && !MP.replay && typeof S !== 'undefined' && !!S && !S.over,

        /** The pause state from the server: null, or { by, at }. */
        set: function (p) {
            const was = !!MP.paused;
            MP.paused = p || null;
            this.draw();
            if (was !== !!MP.paused) {
                if (MP.paused && !this.isHost()) toast(tx('%s hat das Spiel angehalten.', MP.paused.by || tx('Der Host')));
                if (!MP.paused && was) toast(tx('Weiter geht’s!'));
                if (typeof MP.syncTurnBlocker === 'function') MP.syncTurnBlocker();
                if (typeof MP.drawTurnClock === 'function') MP.drawTurnClock();
            }
        },

        draw: function () {
            let el = $('mp-pause-banner');
            const show = !!MP.paused && this.running();
            if (!show) { if (el) el.hidden = true; return; }
            if (!el) {
                el = document.createElement('div');
                el.id = 'mp-pause-banner';
                el.setAttribute('role', 'status');
                document.body.appendChild(el);
            }
            el.hidden = false;
            el.innerHTML = `<span>⏸ ${esc(tx('Pause'))} – ${esc(this.isHost() ? tx('du hast das Spiel angehalten.') : tx('%s hat das Spiel angehalten.', MP.paused.by || tx('Der Host')))}</span>
                ${this.isHost() ? `<button type="button" class="btn small primary" id="mp-pause-resume">▶ ${esc(tx('Fortsetzen'))}</button>` : ''}`;
            const b = $('mp-pause-resume');
            if (b) b.onclick = () => this.toggle(false);
        },

        toggle: function (pause) {
            MP.socket.emit('game:pause', { pause }, res => { if (res && res.error) toast(TXS(res.error)); });
        },

        /** The host's buttons in the game menu (☰), before `before`. */
        menu: function (parent, before) {
            if (!this.isHost() || !this.running() || $('mm-pause')) return;
            const add = (id, text, fn, cls) => {
                const b = document.createElement('button');
                b.className = 'btn wide ' + (cls || 'ghost');
                b.id = id;
                b.textContent = text;
                b.onclick = fn;
                parent.insertBefore(b, before);
            };
            add('mm-pause', MP.paused ? '▶ ' + tx('Fortsetzen') : '⏸ ' + tx('Pause'), () => { closeModal(); this.toggle(!MP.paused); });
            if (MP.user) add('mm-to-async', '📨 ' + tx('Als Rundenspiel fortsetzen'), () => this.askToAsync());
        },

        askToAsync: function () {
            const guests = (MP.players || []).filter(p => !p.isBot && !p.userId && !p.resigned).map(p => p.name);
            modal(tx('Als Rundenspiel fortsetzen'), `
                <p>${esc(tx('Keine Zeit mehr? Das Spiel geht als Rundenspiel weiter: Jeder zieht, wann er Zeit hat, und bekommt Bescheid, wenn er dran ist. Alles bleibt, wie es ist – Karte, Reiche, Runde, Statistik.'))}</p>
                ${guests.length ? `<p class="hint">⚠ ${esc(tx('Rundenspiele gibt es nur mit Anmeldung – die Reiche der Gäste (%s) spielt ab jetzt die KI.', guests.join(', ')))}</p>` : ''}
                <label class="row"><span>${esc(tx('Zeit pro Zug'))}</span><select id="mp-to-async-days">
                  <option value="1">${esc(tx('1 Tag'))}</option><option value="3" selected>${esc(tx('%s Tage', 3))}</option><option value="7">${esc(tx('%s Tage', 7))}</option></select></label>
                <button class="btn wide primary" id="mp-to-async-go">📨 ${esc(tx('Als Rundenspiel fortsetzen'))}</button>
                <button class="btn wide ghost" onclick="closeModal()">${esc(tx('Abbrechen'))}</button>`);
            $('mp-to-async-go').onclick = () => {
                const btn = $('mp-to-async-go');
                btn.disabled = true;
                MP.socket.emit('game:toAsync', { turnDays: +$('mp-to-async-days').value }, res => {
                    if (res && res.error) { btn.disabled = false; toast(TXS(res.error)); }
                });
            };
        },

        /** The game is a Rundenspiel now: players with an account open it, the others are told. */
        moved: function (d) {
            const me = (MP.players || []).find(p => p.index === MP.lobbyIndex);
            const mine = !MP.spectator && MP.user && me && me.userId && !me.resigned;
            MP.paused = null;
            this.draw();
            if (mine) {
                toast(tx('Das Spiel geht als Rundenspiel weiter.'));
                setTimeout(() => { location.href = location.pathname + '?async=' + encodeURIComponent(d.asyncId); }, 600);
                return;
            }
            const text = MP.spectator ? tx('%s hat das Spiel als Rundenspiel fortgesetzt. Hier gibt es nichts mehr zu sehen.', d.by || tx('Der Host'))
                : me && me.resigned ? tx('%s hat das Spiel als Rundenspiel fortgesetzt. Du hattest aufgegeben – die KI spielt dein Reich weiter.', d.by || tx('Der Host'))
                    : tx('%s hat das Spiel als Rundenspiel fortgesetzt. Rundenspiele gibt es nur mit Anmeldung – dein Reich spielt jetzt die KI.', d.by || tx('Der Host'));
            modal(tx('Als Rundenspiel fortgesetzt'), `<p id="mp-moved-text">${esc(text)}</p>
                <button class="btn wide primary" onclick="location.href = location.pathname">${esc(tx('Zum Hauptmenü'))}</button>`);
        },
    };

    const css = document.createElement('style');
    css.textContent = `
        #mp-pause-banner { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 56px); left: 50%; transform: translateX(-50%); z-index: 9500;
            display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 32px); box-sizing: border-box;
            background: #2f3b4a; color: #fff; padding: 8px 14px; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.3); font-size: 14px; }
        #mp-pause-banner[hidden] { display: none; }
    `;
    document.head.appendChild(css);

    window.PAUSE = PAUSE;
})();
