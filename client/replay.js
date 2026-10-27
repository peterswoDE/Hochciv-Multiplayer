/**
 * Replay viewer (F7): a finished match turn by turn – the game page opened with ?replay=<id>.
 * The frames (one game state per turn, utils/replay.js) come from GET /api/games/:id/replay;
 * each is shown with the game's own screens, read-only like a spectator (MP.spectator, see
 * mp.js), and a timeline steps through them. A match is opened in the game version it was
 * played with (/v88/ etc. for older ones, as Rundenspiele are).
 *
 * The local single-player save stays untouched: mp.js stops the game's saveGame while MP.active
 * and makes the end screen's "Zurück zum Menü" only leave.
 */
const REPLAY = {
    id: null,
    doc: null,
    at: 0,
    timer: null,
    SPEED_MS: 1200,

    open: async function (id) {
        let doc, meta = null;
        try {
            const res = await fetch(`/api/games/${encodeURIComponent(id)}/replay`);
            doc = await res.json();
            if (!res.ok) throw new Error(doc.error ? TXS(doc.error) : TX('Fehler'));
            const m = await fetch(`/api/games/${encodeURIComponent(id)}`);
            if (m.ok) meta = await m.json();
        } catch (e) {
            return toast(e.message || TX('Fehler'));
        }
        if (!doc.frames || !doc.frames.length) return toast(TX('Für dieses Spiel gibt es keine Wiederholung.'));
        // the version the match was played with (OLD_VERSIONS / APP_VERSION_HERE in mp.js)
        const here = OLD_VERSIONS.includes(APP_VERSION_HERE) ? APP_VERSION_HERE : null;
        const want = OLD_VERSIONS.includes(doc.version) ? doc.version : null;
        if (here !== want) { location.href = (want ? '/' + want + '/' : '/') + '?replay=' + encodeURIComponent(id); return; }

        this.id = id;
        this.doc = doc;
        const first = doc.frames[0];
        Object.assign(MP, { active: true, replay: true, spectator: true, playerIndex: -1, lobbyIndex: null, asyncId: null, sessionId: null });
        MP.players = first.players.map((p, i) => ({
            index: p.slot != null ? p.slot : i, name: (doc.names || [])[i] || null, civ: p.civ,
            isBot: p.kind === 'ki' || p.kind === 'bot', connected: true,
        }));
        MP.lastStats = meta && meta.stats || null;
        const cred = $('mp-cred-box');
        if (cred) cred.textContent = '▶ ' + TX('Wiederholung');
        this.buildBar();
        this.go(0, true);
    },

    /** Show frame k. */
    go: function (k, first) {
        const frames = this.doc.frames;
        this.at = Math.max(0, Math.min(frames.length - 1, k));
        S = JSON.parse(JSON.stringify(frames[this.at]));        // the game's screens may change S
        if (typeof ui !== 'undefined' && ui) { ui.army = null; ui.sel = null; ui.mode = null; }
        if (first) { closeModal(); startGameScreen(); } else { closeModal(); if (typeof closeSheet === 'function') closeSheet(); redraw(); }
        MP.syncTurnBlocker();
        MP.updateHudDelayed();
        MP.updatePlayerList();
        this.drawBar();
        // the end screen (mp.js keeps the local game safe: no saveGame, "Zurück zum Menü" only leaves)
        if (S.over && this.at === frames.length - 1) {
            this.pause();
            gameOver();
        }
    },

    play: function () {
        if (this.timer) return this.pause();
        if (this.at >= this.doc.frames.length - 1) this.go(0);
        this.timer = setInterval(() => {
            if (this.at >= this.doc.frames.length - 1) return this.pause();
            this.go(this.at + 1);
        }, this.SPEED_MS);
        this.drawBar();
    },
    pause: function () {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.drawBar();
    },
    /** Jump to the first turn of the previous / next round. */
    round: function (dir) {
        const frames = this.doc.frames, r = frames[this.at].round;
        let k = this.at;
        if (dir > 0) { while (k < frames.length - 1 && frames[k].round <= r) k++; }
        else {
            while (k > 0 && frames[k - 1].round >= r) k--;          // start of this round
            if (k === this.at && k > 0) { const pr = frames[k - 1].round; k--; while (k > 0 && frames[k - 1].round === pr) k--; }
        }
        this.pause();
        this.go(k);
    },
    copyLink: function () {
        const url = location.origin + '/?replay=' + encodeURIComponent(this.id);
        const done = () => toast(TX('Link kopiert.'));
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt(TX('Link zur Wiederholung:'), url));
        else prompt(TX('Link zur Wiederholung:'), url);
    },

    buildBar: function () {
        if ($('mp-replay-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'mp-replay-bar';
        bar.innerHTML = `
            <div class="mpr-row">
              <button type="button" data-act="first" title="${TX('Anfang')}">⏮</button>
              <button type="button" data-act="prev-round" title="${TX('Vorige Runde')}">⏪</button>
              <button type="button" data-act="prev" title="${TX('Voriger Zug')}">◀</button>
              <button type="button" data-act="play" class="mpr-play" title="${TX('Abspielen')}">▶</button>
              <button type="button" data-act="next" title="${TX('Nächster Zug')}">▶|</button>
              <button type="button" data-act="next-round" title="${TX('Nächste Runde')}">⏩</button>
              <button type="button" data-act="last" title="${TX('Ende')}">⏭</button>
              <input type="range" id="mpr-slider" min="0" value="0" aria-label="${TX('Zug')}">
            </div>
            <div class="mpr-row mpr-info"><span id="mpr-label"></span>
              <span class="mpr-links"><a href="#" data-act="copy">${TX('Link kopieren')}</a> · <a href="${location.pathname}">${TX('Beenden')}</a></span></div>`;
        document.body.appendChild(bar);
        document.documentElement.classList.add('mp-replay');
        bar.addEventListener('click', e => {
            const b = e.target.closest('[data-act]');
            if (!b) return;
            const act = b.dataset.act, n = this.doc.frames.length;
            if (act === 'copy') { e.preventDefault(); return this.copyLink(); }
            if (act === 'play') return this.play();
            this.pause();
            if (act === 'first') this.go(0);
            if (act === 'last') this.go(n - 1);
            if (act === 'prev') this.go(this.at - 1);
            if (act === 'next') this.go(this.at + 1);
            if (act === 'prev-round') this.round(-1);
            if (act === 'next-round') this.round(1);
        });
        const slider = $('mpr-slider');
        slider.max = String(this.doc.frames.length - 1);
        // read the value first: pause() redraws the bar and sets the slider back to the shown turn
        slider.addEventListener('input', () => { const k = +slider.value; this.pause(); this.go(k); });

        const style = document.createElement('style');
        style.textContent = `
            #mp-replay-bar {
                position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(var(--bar-h, 58px) + 10px); z-index: 29;
                width: min(640px, calc(100% - 32px)); box-sizing: border-box; background: rgba(255,255,240,0.97);
                border: 2px solid #a89f91; border-radius: 8px; padding: 6px 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                font-size: 13px; color: #333;
            }
            .mpr-row { display: flex; align-items: center; gap: 4px; }
            .mpr-row button { border: 1px solid #c9bfa8; background: #fff; border-radius: 5px; min-width: 34px; min-height: 32px; cursor: pointer; font-size: 14px; padding: 0 6px; }
            .mpr-row button.mpr-play { background: #9d3b2f; color: #fff; border-color: #9d3b2f; min-width: 42px; }
            #mpr-slider { flex: 1; min-width: 60px; margin-left: 6px; }
            .mpr-info { justify-content: space-between; margin-top: 4px; flex-wrap: wrap; gap: 2px 10px; }
            .mpr-links a { color: inherit; }
            /* replay: nothing to chat; the HUD says "Wiederholung", the turn blocker toast need not */
            html.mp-replay #mp-chat, html.mp-replay #mp-afk-banner, html.mp-replay .mp-waiting-toast { display: none !important; }
        `;
        document.head.appendChild(style);
    },

    drawBar: function () {
        if (!this.doc || !$('mp-replay-bar')) return;
        const frames = this.doc.frames, f = frames[this.at];
        const p = f.players[f.cur];
        const who = p ? (MP.lobbyPlayerOf(p) || {}).name || (typeof civOf === 'function' ? civOf(p).n : p.civ) : '';
        $('mpr-label').textContent = (f.over ? TX('Runde %s · Spielende', f.round) : TX('Runde %s · %s am Zug', f.round, who))
            + ' · ' + TX('Zug %s von %s', this.at + 1, frames.length);
        $('mpr-slider').value = String(this.at);
        const play = document.querySelector('#mp-replay-bar .mpr-play');
        play.textContent = this.timer ? '⏸' : '▶';
        play.title = this.timer ? TX('Anhalten') : TX('Abspielen');
        const wait = document.querySelector('.mp-waiting-toast');
        if (wait) wait.textContent = TX('Wiederholung');
    },

    /** End screen of a live game / Rundenspiel: watch this match again. */
    addToEndScreen: function (record) {
        if (!record || !record.replay || MP.replay || $('mp-replay-btn') || !$('go-menu')) return;
        const box = document.createElement('div');
        box.id = 'mp-replay-btn';
        box.innerHTML = `<button class="btn wide" type="button">▶ ${TX('Wiederholung ansehen')}</button>`;
        box.querySelector('button').onclick = () => {
            const url = '/?replay=' + encodeURIComponent(record.id);
            const w = window.open(url, '_blank');
            if (!w) location.href = url;                       // blocked (Discord): open it here
        };
        const anchor = $('mp-stats-btn') || $('mp-rematch-box') || $('go-menu');
        anchor.parentNode.insertBefore(box, anchor);
    },
};
