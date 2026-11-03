/**
 * Weekly challenge (F21) on the game page – loaded after mp.js (inject.js).
 *
 * A button in the multiplayer menu opens the week's challenge: its setup (map, nation and
 * ability, three KI, events, wonders), the time left, one's own attempts (start, play again,
 * continue or start over, the results) and the leaderboard. Past weeks can be picked and played
 * too; their leaderboard is closed, so those attempts are practice. An attempt is a Rundenspiel
 * (ASYNC.open). Server: utils/challenge.js, GET /api/challenge, POST /api/challenge/start.
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
            return `<button class="btn ghost mph-maps mph-challenge" onclick="CHALLENGE.open()">📅 ${T('Wochen-Challenge')}<small>${T('Jede Woche dieselbe Aufgabe für alle: allein gegen drei KI, so oft du willst.')}</small></button>`;
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
            if (!MP.user) return `<p>${T('Die Wochen-Challenge gibt es nur mit Anmeldung.')}</p>
                <button class="btn wide" onclick="MP.showAuthModal()">${T('Anmelden')}</button>`;
            const me = d.me || {};
            const lines = [];
            if (me.ranked) lines.push(`<p class="ch-mine" id="ch-result">${T('Dein Ergebnis: Platz %s', me.ranked.rank)} · ${this.resultText(me.ranked)}</p>`);
            if (me.best) lines.push(`<p class="ch-mine ch-practice" id="ch-best">${T('Bester Versuch außer Wertung')} · ${this.resultText(me.best)}</p>`);
            if (me.attempts) lines.push(`<p class="sub" id="ch-attempts">${T('%s Versuch(e) beendet', me.attempts)}</p>`);
            if (me.running) lines.push(`<p>${T('Dein Versuch läuft.')}</p>
                <div class="ch-actions"><button class="btn primary" id="ch-continue" onclick="CHALLENGE.continue_('${esc(me.running)}')">${T('Weiterspielen')}</button>
                <button class="btn ghost" id="ch-restart" onclick="CHALLENGE.start(true)">${T('Neu starten')}</button></div>`);
            else lines.push(`<button class="btn wide primary" id="ch-start" onclick="CHALLENGE.start()">${me.attempts ? T('Nochmal spielen') : T('Challenge starten')}</button>`);
            return lines.join('');
        },

        resultText: function (r) {
            return r.won ? T('Sieg in %s Runden', r.rounds) : T('%s Punkte, kein Sieg', r.points);
        },

        draw: function () {
            const box = $('ch-box'), d = this.data;
            if (!box || !d) return;
            const me = MP.user ? MP.user.id : null;
            const left = Math.max(0, new Date(d.week.endsAt) - Date.now());
            const leftText = left >= 864e5 ? T('noch %s Tag(e)', Math.ceil(left / 864e5)) : T('noch %s Std.', Math.max(1, Math.ceil(left / 36e5)));
            const weeks = d.weeks && d.weeks.length ? d.weeks : [d.week.id];
            box.innerHTML = `
              <p class="ch-head"><select id="ch-week" onchange="CHALLENGE.open(this.value)" aria-label="${esc(T('Woche'))}">
                ${weeks.map((w, i) => `<option value="${esc(w)}"${w === d.week.id ? ' selected' : ''}>${esc(weekLabel(w))}${i === 0 ? ' · ' + esc(T('aktuell')) : ''}</option>`).join('')}
              </select> ${d.week.current ? esc(T('Bestenliste offen, %s', leftText)) : esc(T('abgeschlossen'))}</p>
              ${this.setupHtml(d.setup)}
              <p class="sub">${T('So oft du willst, allein gegen drei KI als Rundenspiel – spiel in deinem Tempo. In die Bestenliste kommt dein bester Versuch, der vor dem Ende der Woche fertig ist; danach ist sie geschlossen. Gewertet wird ein Sieg, dann weniger Runden, dann mehr Punkte. Aufgeben zählt als Niederlage.')}</p>
              ${d.week.current ? '' : `<p class="ch-closed" id="ch-closed">${T('Diese Woche ist vorbei: Die Bestenliste ist geschlossen, neue Versuche sind Übung.')}</p>`}
              ${this.meHtml(d)}
              <h4 class="mpa-h">${T('Bestenliste')} <span class="sub">${esc(d.week.current ? T('%s Spieler, %s Versuche laufen', d.finished, d.playing) : T('%s Spieler', d.finished))}</span></h4>
              ${d.list.length ? `<table class="rk-table ch-table"><thead><tr><th>#</th><th>${T('Name')}</th><th>${T('Ergebnis')}</th><th>${T('Runden')}</th><th>${T('Punkte')}</th></tr></thead><tbody>
                ${d.list.map(r => `<tr class="${r.userId === me ? 'rk-me' : ''}" data-user="${esc(r.userId)}"><td class="rk-num">${esc(r.rank)}</td>
                  <td><a href="#" class="hcp-link" data-profile="${esc(r.userId)}">${esc(r.username)}</a></td>
                  <td>${r.won ? '✓ ' + esc(T('Sieg')) : '–'}</td><td class="rk-num">${esc(r.rounds)}</td><td class="rk-num">${esc(r.points)}</td></tr>`).join('')}
              </tbody></table>` : `<p class="sub mph-empty">${d.week.current ? T('Noch hat niemand die Challenge dieser Woche beendet.') : T('In dieser Woche hat niemand die Challenge beendet.')}</p>`}
              <p class="ch-nav">${d.week.previous ? `<a href="#" id="ch-prev" onclick="CHALLENGE.open('${esc(d.week.previous)}'); return false">← ${T('Vorherige Woche')}</a>` : ''}
                ${d.week.next ? `<a href="#" id="ch-next" onclick="CHALLENGE.open('${esc(d.week.next)}'); return false">${T('Nächste Woche')} →</a>` : ''}</p>`;
        },

        start: async function (restart) {
            if (restart && !confirm(T('Den laufenden Versuch aufgeben und neu beginnen? Er zählt als Niederlage.'))) return;
            const btn = $(restart ? 'ch-restart' : 'ch-start');
            if (btn) btn.disabled = true;
            try {
                const r = await fetch('/api/challenge/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week: this.data && this.data.week.id, restart: !!restart }) });
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
        .ch-head select { font:inherit; font-weight:600; margin-right:6px; max-width:100%; }
        .ch-mine { font-weight:600; margin:4px 0; }
        .ch-practice { font-weight:400; opacity:.85; }
        .ch-closed { margin:0 0 8px; padding:6px 10px; border-radius:6px; background:rgba(127,127,127,.15); font-size:13px; }
        .ch-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .ch-actions .btn { flex:1 1 140px; }
        .ch-nav { margin:10px 0 0; font-size:13px; display:flex; justify-content:space-between; gap:12px; }
        .mph-challenge { margin-top:-8px; }
    `;
    document.head.appendChild(style);

    window.CHALLENGE = CHALLENGE;
})();
