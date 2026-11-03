/**
 * Weekly challenge (F21) on the game page – loaded after mp.js (inject.js).
 *
 * A button in the multiplayer menu opens the week's challenge: its setup (map, nation and
 * ability, three KI, events, wonders), the time left, one's own attempt (start, continue, or the
 * result) and the leaderboard; the previous week can be looked at too. The attempt itself is a
 * Rundenspiel (ASYNC.open). Server: utils/challenge.js, GET /api/challenge, POST
 * /api/challenge/start.
 */
(function () {
    'use strict';
    if (window.CHALLENGE) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (de, ...a) => HC_I18N.t(de, ...a);
    const TS = m => HC_I18N.tr(m);
    const weekLabel = id => { const m = /^(\d{4})-W(\d{2})$/.exec(id || ''); return m ? T('Woche %s/%s', +m[2], m[1]) : String(id || ''); };

    const CHALLENGE = {
        data: null,

        hubButton: function () {
            return `<button class="btn ghost mph-maps mph-challenge" onclick="CHALLENGE.open()">📅 ${T('Wochen-Challenge')}<small>${T('Jede Woche dieselbe Aufgabe für alle: allein gegen drei KI, ein Versuch.')}</small></button>`;
        },

        load: async function (week) {
            const r = await fetch('/api/challenge' + (week ? '?week=' + encodeURIComponent(week) : ''), { credentials: 'same-origin' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error ? TS(d.error) : T('Fehler'));
            return d;
        },

        open: async function (week) {
            modal(T('Wochen-Challenge'), `<div id="ch-box"><p class="sub">${T('Lade...')}</p></div>`);
            const ov = $('overlay');
            if (ov) ov.classList.add('wide');
            try { this.data = await this.load(week); }
            catch (e) { const b = $('ch-box'); if (b) b.innerHTML = `<p class="sub error">${esc(e.message)}</p>`; return; }
            this.draw();
        },

        setupHtml: function (s) {
            const civ = (typeof CIVS !== 'undefined' ? CIVS : []).find(c => c.k === s.civ);
            const ab = civ && (civ.abilities || []).find(a => a.k === s.ability);
            const lvl = (typeof KI_LEVELS !== 'undefined' ? KI_LEVELS : []).find(l => l.k === s.difficulty);
            const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
            return `<table class="ch-setup">
                ${row(T('Karte'), ASYNC.mapName(s.mapKey, {}))}
                ${row(T('Deine Nation'), `<b>${esc(civ ? civ.n : s.civ)}</b>${ab ? ' · ' + esc(ab.n) : ''}`)}
                ${row(T('Gegner'), esc(T('%s KI · %s', s.kiCount, lvl ? lvl.n : s.difficulty)))}
                ${row(T('Ereignisse'), s.events ? (s.eventMode === 'easy' ? T('Leicht (selten)') : T('Hart (jede Runde)')) : T('Ohne'))}
                ${row(T('Weltwunder'), s.wonders ? T('Mit') : T('Ohne'))}</table>`;
        },

        meHtml: function (d) {
            if (!d.week.current) return '';
            if (!MP.user) return `<p>${T('Die Wochen-Challenge gibt es nur mit Anmeldung.')}</p>
                <button class="btn wide" onclick="MP.showAuthModal()">${T('Anmelden')}</button>`;
            const me = d.me;
            if (!me) return `<button class="btn wide primary" id="ch-start" onclick="CHALLENGE.start()">${T('Challenge starten')}</button>`;
            if (me.status === 'playing') return `<p>${T('Dein Versuch läuft.')}</p>
                <button class="btn wide primary" id="ch-continue" onclick="CHALLENGE.continue_('${esc(me.asyncId)}')">${T('Weiterspielen')}</button>`;
            return `<p class="ch-mine" id="ch-result">${T('Dein Ergebnis: Platz %s', me.rank)} · ${this.resultText(me)}</p>`;
        },

        resultText: function (r) {
            return r.won ? T('Sieg in %s Runden', r.rounds) : T('%s Punkte, kein Sieg', r.points);
        },

        draw: function () {
            const box = $('ch-box'), d = this.data;
            if (!box || !d) return;
            const me = MP.user ? MP.user.id : null;
            const left = d.week.endsAt ? Math.max(0, new Date(d.week.endsAt) - Date.now()) : 0;
            const leftText = left >= 864e5 ? T('noch %s Tag(e)', Math.ceil(left / 864e5)) : T('noch %s Std.', Math.max(1, Math.ceil(left / 36e5)));
            box.innerHTML = `
              <p class="ch-head"><b>${esc(weekLabel(d.week.id))}</b>${d.week.current ? ' · ' + esc(leftText) : ' · ' + esc(T('abgeschlossen'))}</p>
              ${this.setupHtml(d.setup)}
              <p class="sub">${T('Ein Versuch pro Woche, allein gegen drei KI als Rundenspiel – spiel in deinem Tempo. Gewertet wird ein Sieg, dann weniger Runden, dann mehr Punkte. Aufgeben zählt als Niederlage.')}</p>
              ${this.meHtml(d)}
              <h4 class="mpa-h">${T('Bestenliste')} <span class="sub">${esc(T('%s fertig, %s spielen noch', d.finished, d.playing))}</span></h4>
              ${d.list.length ? `<table class="rk-table ch-table"><thead><tr><th>#</th><th>${T('Name')}</th><th>${T('Ergebnis')}</th><th>${T('Runden')}</th><th>${T('Punkte')}</th></tr></thead><tbody>
                ${d.list.map(r => `<tr class="${r.userId === me ? 'rk-me' : ''}" data-user="${esc(r.userId)}"><td class="rk-num">${esc(r.rank)}</td>
                  <td><a href="#" class="hcp-link" data-profile="${esc(r.userId)}">${esc(r.username)}</a></td>
                  <td>${r.won ? '✓ ' + esc(T('Sieg')) : '–'}</td><td class="rk-num">${esc(r.rounds)}</td><td class="rk-num">${esc(r.points)}</td></tr>`).join('')}
              </tbody></table>` : `<p class="sub mph-empty">${T('Noch hat niemand die Challenge dieser Woche beendet.')}</p>`}
              <p class="ch-nav">${d.week.previous ? `<a href="#" onclick="CHALLENGE.open('${esc(d.week.previous)}'); return false">← ${T('Letzte Woche')}</a>`
                : `<a href="#" onclick="CHALLENGE.open(); return false">${T('Zur aktuellen Woche')} →</a>`}</p>`;
        },

        start: async function () {
            const btn = $('ch-start');
            if (btn) btn.disabled = true;
            try {
                const r = await fetch('/api/challenge/start', { method: 'POST', credentials: 'same-origin' });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error ? TS(d.error) : T('Fehler'));
                this.continue_(d.asyncId);
            } catch (e) {
                toast(e.message);
                if (btn) btn.disabled = false;
            }
        },
        continue_: function (asyncId) {
            if (typeof closeModal === 'function') closeModal();
            ASYNC.open(asyncId);
        },
    };

    const style = document.createElement('style');
    style.textContent = `
        .ch-head { margin:0 0 8px; }
        .ch-setup { border-collapse:collapse; margin:0 0 10px; font-size:14px; }
        .ch-setup th { text-align:left; font-weight:400; opacity:.7; padding:3px 14px 3px 0; white-space:nowrap; }
        .ch-setup td { padding:3px 0; }
        .ch-mine { font-weight:600; }
        .ch-nav { margin:10px 0 0; font-size:13px; }
        .mph-challenge { margin-top:-8px; }
    `;
    document.head.appendChild(style);

    window.CHALLENGE = CHALLENGE;
})();
