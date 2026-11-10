/**
 * Weekly challenge (F21) on the game page – loaded after mp.js (inject.js).
 *
 * A button in the multiplayer menu opens the week's challenge: its setup (map, nation and
 * ability, three KI, events, wonders), the time left, one's own attempts (start, play again,
 * continue or start over, the results) and the leaderboard. Past weeks can be picked and played
 * too; their leaderboard is closed, so those attempts are practice. One attempt runs at a time:
 * starting another resigns it (after asking). An attempt is a Rundenspiel
 * (ASYNC.open). Server: utils/challenge.js, GET /api/challenge, POST /api/challenge/start.
 *
 * Compare (F26): an attempt next to the week's best – the challenger's points (or cities, techs
 * …) per round in one chart (client/stats.js) and where the gap grew. From one's result in the
 * dialog, from a row of the leaderboard, and from the end screen of an attempt.
 * GET /api/challenge/compare.
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

        hubText: () => T('Jede Woche dieselbe Aufgabe für alle: allein gegen drei KI, so oft du willst.'),

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
            if ((me.ranked || me.best) && d.list.length && !(me.ranked && me.ranked.rank === 1 && !me.best))
                lines.push(`<p><a href="#" id="ch-compare" onclick="CHALLENGE.compare('${esc(d.week.id)}'); return false">📈 ${T('Mit der Bestleistung vergleichen')}</a></p>`);
            const run = me.running;
            if (run && run.week === d.week.id) lines.push(`<p>${T('Dein Versuch läuft.')}</p>
                <div class="ch-actions"><button class="btn primary" id="ch-continue" onclick="CHALLENGE.continue_('${esc(run.asyncId)}')">${T('Weiterspielen')}</button>
                <button class="btn ghost" id="ch-restart" onclick="CHALLENGE.start()">${T('Neu starten')}</button></div>`);
            else {
                if (run) lines.push(`<p class="sub" id="ch-other">${T('Dein Versuch in %s läuft noch.', esc(weekLabel(run.week)))}
                    <a href="#" onclick="CHALLENGE.continue_('${esc(run.asyncId)}'); return false">${T('Weiterspielen')}</a></p>`);
                lines.push(`<button class="btn wide primary" id="ch-start" onclick="CHALLENGE.start()">${me.attempts ? T('Nochmal spielen') : T('Challenge starten')}</button>`);
            }
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
              ${d.list.length ? `<table class="rk-table ch-table"><thead><tr><th>#</th><th>${T('Name')}</th><th>${T('Ergebnis')}</th><th>${T('Runden')}</th><th>${T('Punkte')}</th><th><span class="ch-sr">${T('Vergleich')}</span></th></tr></thead><tbody>
                ${d.list.map(r => `<tr class="${r.userId === me ? 'rk-me' : ''}" data-user="${esc(r.userId)}"><td class="rk-num">${esc(r.rank)}</td>
                  <td><a href="#" class="hcp-link" data-profile="${esc(r.userId)}">${esc(r.username)}</a></td>
                  <td>${r.won ? '✓ ' + esc(T('Sieg')) : '–'}</td><td class="rk-num">${esc(r.rounds)}</td><td class="rk-num">${esc(r.points)}</td>
                  <td>${r.rank > 1 && r.gameId ? `<button type="button" class="ch-cmp" data-game="${esc(r.gameId)}" onclick="CHALLENGE.compare('${esc(d.week.id)}', this.dataset.game)" title="${esc(T('Mit der Bestleistung vergleichen'))}" aria-label="${esc(T('%s mit der Bestleistung vergleichen', r.username))}">📈</button>` : ''}</td></tr>`).join('')}
              </tbody></table>` : `<p class="sub mph-empty">${d.week.current ? T('Noch hat niemand die Challenge dieser Woche beendet.') : T('In dieser Woche hat niemand die Challenge beendet.')}</p>`}
              <p class="ch-nav">${d.week.previous ? `<a href="#" id="ch-prev" onclick="CHALLENGE.open('${esc(d.week.previous)}'); return false">← ${T('Vorherige Woche')}</a>` : ''}
                ${d.week.next ? `<a href="#" id="ch-next" onclick="CHALLENGE.open('${esc(d.week.next)}'); return false">${T('Nächste Woche')} →</a>` : ''}</p>`;
        },

        start: async function () {
            const run = this.data && this.data.me && this.data.me.running;
            if (run && !confirm(T('Dein laufender Versuch (%s) wird aufgegeben und zählt als Niederlage. Neu beginnen?', weekLabel(run.week)))) return;
            const btn = $(run && run.week === this.data.week.id ? 'ch-restart' : 'ch-start');
            if (btn) btn.disabled = true;
            try {
                const r = await fetch('/api/challenge/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week: this.data && this.data.week.id }) });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error ? TS(d.error) : T('Fehler'));
                this.continue_(d.asyncId);
            } catch (e) {
                toast(e.message);
                if (btn) btn.disabled = false;
            }
        },
        /** The comparison in its own dialog (back to the week). */
        compare: function (week, gameId) {
            modal(T('Vergleich mit der Bestleistung'), `<div id="ch-cmp-box"><p class="sub">${T('Lade...')}</p></div>
                <button class="btn wide ghost" onclick="CHALLENGE.open('${esc(week)}')">${T('Zurück')}</button>`);
            const ov = $('overlay');
            if (ov) ov.classList.add('wide');
            this.renderCompare($('ch-cmp-box'), week, gameId);
        },

        /** An attempt (`gameId`, or one's best) next to the week's best, into `el`. */
        renderCompare: async function (el, week, gameId) {
            let d;
            try {
                const q = new URLSearchParams({ week: week || '' });
                if (gameId) q.set('game', gameId);
                const r = await fetch('/api/challenge/compare?' + q, { credentials: 'same-origin' });
                d = await r.json();
                if (!r.ok) throw new Error(d.error ? TS(d.error) : T('Fehler'));
            } catch (e) {
                el.innerHTML = `<p class="sub error">${esc(e.message)}</p>`;
                return;
            }
            const A = d.attempt, B = d.best;
            const result = x => (x.won ? T('Sieg in %s Runden', x.rounds) : T('%s Punkte, kein Sieg', x.points)) + (x.rank ? ' · ' + T('Platz %s', x.rank) : '');
            const mine = A && MP.user && A.userId === MP.user.id;
            const who = x => (MP.user && x.userId === MP.user.id ? T('Du') : x.username);
            if (!B) { el.innerHTML = `<p class="sub">${T('In dieser Woche gibt es noch keine Bestleistung.')}</p>`; return; }
            if (!A) { el.innerHTML = `<p class="sub">${T('Du hast in dieser Woche noch keinen Versuch beendet.')}</p>`; return; }
            const head = `<p class="ch-cmp-sum"><b>${esc(T('Bestleistung'))}</b>: ${esc(B.username)} – ${esc(result(B))}<br>
                <b>${esc(mine ? T('Dein Versuch') : T('Versuch von %s', A.username))}</b>: ${esc(result(A))}</p>`;
            if (d.same) {
                el.innerHTML = head + `<p id="ch-cmp-note">${esc(mine ? T('Das ist die Bestleistung der Woche – niemand war besser.') : T('Das ist die Bestleistung der Woche.'))}</p>`;
                return;
            }
            el.innerHTML = head + `<ul class="ch-cmp-notes" id="ch-cmp-notes">${this.gapNotes(A, B, mine).map(t => `<li>${esc(t)}</li>`).join('')}</ul><div class="ch-cmp-chart"></div>`;
            if (typeof STATS === 'undefined') return;
            // two "players" for the chart of client/stats.js: own colours and shapes, the same nation
            const byR = new Map();
            const put = (x, i) => x.series.forEach(p => {
                const row = byR.get(p.r) || { r: p.r, p: [{}, {}] };
                const { r, ...v } = p; void r;
                row.p[i] = v;
                byR.set(p.r, row);
            });
            put(A, 0); put(B, 1);
            const stats = {
                players: [
                    { civ: A.civ || B.civ, color: '#a33a2a', name: mine ? T('Dein Versuch') : A.username, kind: 'human' },
                    { civ: B.civ || A.civ, color: '#2f6690', name: T('Bestleistung (%s)', B.username), kind: 'human' },
                ],
                rounds: [...byR.values()].sort((a, b) => a.r - b.r),
                events: [],
            };
            STATS.render(el.querySelector('.ch-cmp-chart'), stats, { noMoments: true });
        },

        /** Where the attempt fell behind the best one, in points per round. */
        gapNotes: function (A, B, mine) {
            const b = new Map(B.series.filter(p => p.s != null).map(p => [p.r, p.s]));
            const common = A.series.filter(p => p.s != null && b.has(p.r)).map(p => ({ r: p.r, gap: b.get(p.r) - p.s, a: p.s, b: b.get(p.r) }));
            const out = [];
            if (!common.length) return out;
            let level = null, worst = null, maxGap = null;
            common.forEach((x, k) => {
                if (x.gap <= 0) level = x;
                if (k && (!worst || x.gap - common[k - 1].gap > worst.d)) worst = { r: common[k - 1].r, d: x.gap - common[k - 1].gap };
                if (!maxGap || x.gap > maxGap.gap) maxGap = x;
            });
            if (level && level.r > common[0].r) out.push(mine ? T('Bis Runde %s lagst du gleichauf oder vorn.', level.r) : T('Bis Runde %s lag %s gleichauf oder vorn.', level.r, A.username));
            else if (!level) out.push(T('Die Bestleistung lag von Anfang an vorn.'));
            if (worst && worst.d > 0) out.push(T('Am meisten Boden verloren in Runde %s: %s Punkte in einer Runde.', worst.r, worst.d));
            if (maxGap && maxGap.gap > 0) out.push(T('Größter Rückstand: %s Punkte in Runde %s (%s gegen %s).', maxGap.gap, maxGap.r, maxGap.a, maxGap.b));
            return out;
        },

        /** End screen of an attempt: compare it with the week's best, below the result. */
        addToEndScreen: function (record) {
            const v = typeof ASYNC !== 'undefined' && ASYNC.view;
            if (!record || !v || !v.config || !v.config.challenge || $('ch-end-cmp-btn') || !$('go-menu')) return;
            const btn = document.createElement('button');
            btn.className = 'btn wide';
            btn.id = 'ch-end-cmp-btn';
            btn.textContent = '📈 ' + T('Mit der Bestleistung vergleichen');
            const box = document.createElement('div');
            box.id = 'ch-end-cmp';
            box.hidden = true;
            const anchor = $('mp-stats-btn') || $('mp-replay-btn') || $('go-menu');
            anchor.parentNode.insertBefore(btn, anchor);
            anchor.parentNode.insertBefore(box, anchor);
            btn.onclick = () => {
                box.hidden = !box.hidden;
                if (!box.hidden) {
                    $('overlay').classList.add('wide');
                    if (!box.innerHTML) this.renderCompare(box, v.config.challenge, record.id);
                }
            };
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
        .ch-cmp { border:1px solid #c9bfa8; background:#fff; border-radius:5px; min-width:32px; min-height:28px; cursor:pointer; padding:0 4px; }
        .ch-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
        .ch-cmp-sum { margin:0 0 8px; line-height:1.5; }
        .ch-cmp-notes { margin:0 0 10px; padding-left:20px; }
        .ch-cmp-notes li { margin:2px 0; }
        #ch-end-cmp { margin:8px 0; text-align:left; }
    `;
    document.head.appendChild(style);

    window.CHALLENGE = CHALLENGE;
})();
