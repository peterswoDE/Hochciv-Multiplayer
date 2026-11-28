/**
 * The leaderboard (F10) on the game page – "🏆 Rangliste" in the main menu and the multiplayer
 * menu. Loaded after mp.js and client/profile.js (tiers and season labels: window.HC_SEASONS).
 *
 * A season picker (the running one first, then the closed ones), players or bots, the top 100
 * with tier, MMR, ranked games and wins of the season; one's own row is marked, and shown below
 * the list when it isn't in the top 100. Names open the player profile. Server: GET
 * /api/seasons/leaderboard (utils/seasons.js).
 *
 * "Arena": the correspondence arena (async/ladder.js) – per game version the
 * standings over the finished games and the latest games, to watch or replay. Server: GET
 * /api/async/ladder (login required, like all Rundenspiele).
 */
(function () {
    'use strict';
    if (window.RANKING) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (de, ...a) => HC_I18N.t(de, ...a);
    // season bounds are UTC midnights: shown as UTC dates (a season ending 1 Jan runs "until 31.12.")
    const fmtDate = d => new Date(d).toLocaleDateString(HC_I18N.locale(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

    const RANKING = {
        season: null,
        type: 'human',

        open: async function (season, type) {
            if (season !== undefined) this.season = season;
            if (type) this.type = type;
            modal(T('Rangliste'), `<div id="rk-box"><p class="sub">${T('Lade...')}</p></div>`);
            const ov = $('overlay');
            if (ov) ov.classList.add('wide');
            let d;
            try {
                const q = new URLSearchParams({ type: this.type });
                if (this.season) q.set('season', this.season);
                const r = await fetch('/api/seasons/leaderboard?' + q, { credentials: 'same-origin' });
                d = await r.json();
                if (!r.ok) throw new Error(d.error ? HC_I18N.tr(d.error) : T('Fehler'));
            } catch (e) {
                const box = $('rk-box');
                if (box) box.innerHTML = `<p class="sub error">${esc(e.message)}</p>`;
                return;
            }
            await MP.siteSettingsReady;
            this.draw(d);
        },

        row: function (r, mine) {
            const S = window.HC_SEASONS;
            return `<tr class="${mine ? 'rk-me' : ''}" data-user="${esc(r.id)}">
                <td class="rk-num">${esc(r.rank)}</td>
                <td><a href="#" class="hcp-link" data-profile="${esc(r.id)}">${esc(r.username)}</a></td>
                <td>${S.tierHtml(r.tier, r.games, this.need)}</td>
                <td class="rk-num"><b>${esc(r.mmr)}</b></td>
                <td class="rk-num">${esc(r.games)}</td>
                <td class="rk-num">${esc(r.wins)}</td></tr>`;
        },

        draw: function (d) {
            const box = $('rk-box');
            if (!box) return;
            const S = window.HC_SEASONS;
            this.need = d.placementGames;
            const me = MP.user ? MP.user.id : null;
            const s = d.season;
            const opts = d.seasons.map(x => `<option value="${esc(x.id)}" ${x.id === s.id ? 'selected' : ''}>${esc(T('Saison %s', S.seasonLabel(x.id)))}${x.closed ? '' : ' · ' + esc(T('läuft'))}</option>`).join('');
            const info = s.closed ? T('Abgeschlossen am %s.', fmtDate(s.endsAt))
                : T('Läuft bis %s. Danach rücken alle MMR zur Hälfte auf 1000 zurück.', fmtDate(new Date(new Date(s.endsAt) - 1)));
            const legend = d.tiers.map(t => `${S.TIERS[t.k].i} ${esc(T(S.TIERS[t.k].n))} ${t.min ? '≥ ' + t.min : ''}`).join(' · ');
            box.innerHTML = `
              <div class="rk-head">
                <select id="rk-season" onchange="RANKING.open(this.value)">${opts}</select>
                <div class="rk-types" role="tablist">
                  <button type="button" class="mph-tab ${d.type === 'human' ? 'on' : ''}" onclick="RANKING.open(undefined, 'human')">${T('Spieler')}</button>
                  <button type="button" class="mph-tab ${d.type === 'bot' ? 'on' : ''}" onclick="RANKING.open(undefined, 'bot')">🤖 ${T('Bots')}</button>
                  ${MP.ladderPlacement === 'main-menu' ? '' : `<button type="button" class="mph-tab" onclick="RANKING.openLadder()">${T('Arena')}</button>`}
                </div>
              </div>
              <p class="sub">${esc(info)} ${esc(T('Eine Stufe gibt es ab %s gewerteten Spielen in der Saison.', d.placementGames))}</p>
              <p class="sub rk-legend">${legend}</p>
              ${d.list.length ? `<div class="rk-scroll"><table class="rk-table">
                <thead><tr><th>#</th><th>${T('Name')}</th><th>${T('Stufe')}</th><th>MMR</th><th>${T('Spiele')}</th><th>${T('Siege')}</th></tr></thead>
                <tbody>${d.list.map(r => this.row(r, r.id === me)).join('')}
                ${d.me ? `<tr class="rk-gap"><td colspan="6">…</td></tr>${this.row(d.me, true)}` : ''}</tbody></table></div>`
                : `<p class="sub mph-empty">${T('In dieser Saison hat noch niemand gewertet gespielt.')}</p>`}`;
        },

        openLadder: async function (version) {
            const standalone = MP.ladderPlacement === 'main-menu';
            modal(T(standalone ? 'Arena' : 'Rangliste'), `<div id="rk-box"><p class="sub">${T('Lade...')}</p></div>`);
            const ov = $('overlay');
            if (ov) ov.classList.add('wide');
            let d;
            try {
                const r = await fetch('/api/async/ladder' + (version ? '?version=' + encodeURIComponent(version) : ''), { credentials: 'same-origin' });
                d = await r.json();
                if (!r.ok) throw new Error(d.error ? HC_I18N.tr(d.error) : T('Fehler'));
            } catch (e) {
                d = { error: e.message };
            }
            const box = $('rk-box');
            if (!box) return;
            const tabs = standalone ? '' : `<div class="rk-types" role="tablist">
                  <button type="button" class="mph-tab" onclick="RANKING.open(undefined, 'human')">${T('Spieler')}</button>
                  <button type="button" class="mph-tab" onclick="RANKING.open(undefined, 'bot')">🤖 ${T('Bots')}</button>
                  <button type="button" class="mph-tab on">${T('Arena')}</button>
                </div>`;
            if (d.error) { box.innerHTML = `<div class="rk-head">${tabs}</div><p class="sub error">${esc(d.error)}</p>`; return; }
            const opts = d.editions.map(v => `<option ${v === d.version ? 'selected' : ''}>${esc(v)}</option>`).join('');
            const pct = x => x == null ? '–' : esc(x.toLocaleString(HC_I18N.locale(), { style: 'percent' }));
            const standings = d.standings.map((b, i) => `<tr><td class="rk-num">${i + 1}</td><td>${esc(b.name)}</td>
                <td class="rk-num">${esc(b.games)}</td><td class="rk-num">${esc(b.wins)}–${esc(b.draws)}–${esc(b.games - b.wins - b.draws)}</td>
                <td class="rk-num"><b>${pct(b.score)}</b></td></tr>`).join('');
            const state = g => g.status === 'finished' ? esc(g.winners.join(', ') || T('Unentschieden'))
                : g.status === 'cancelled' ? esc(T('Abgebrochen')) : esc(T('Läuft'));
            const link = g => g.replay ? `<a href="/?replay=${encodeURIComponent(g.replay)}" target="_blank" rel="noopener">▶ ${T('Wiederholung ansehen')}</a>`
                : g.status === 'playing' ? `<a href="/?async=${encodeURIComponent(g.id)}">${T('Zuschauen')}</a>` : '';
            const games = d.games.map(g => `<tr><td>${esc(g.names.join(' – '))}</td>
                <td>${esc(T(g.ranked ? 'Gewertet' : 'Ungewertet'))}</td><td>${state(g)} ${link(g)}</td></tr>`).join('');
            box.innerHTML = `
              <div class="rk-head">
                <select id="rk-ladder-version" aria-label="${esc(T('Spielversion'))}" onchange="RANKING.openLadder(this.value)">${opts}</select>
                ${tabs}
              </div>
              <p class="sub">${esc(T('Spieler-Bots, die ihr Besitzer angemeldet hat, spielen automatisch Rundenspiele gegeneinander, zu zweit auf der Plättchenkarte.'))}</p>
              ${standings ? `<div class="rk-scroll"><table class="rk-table rk-ladder-standings">
                <colgroup><col class="rk-ladder-rank"><col><col class="rk-ladder-count"><col class="rk-ladder-stat"><col class="rk-ladder-stat"></colgroup>
                <thead><tr><th scope="col" class="rk-num">#</th><th scope="col">${T('Name')}</th>
                <th scope="col" class="rk-num">${T('Spiele')}</th><th scope="col" class="rk-num">${T('S–U–N')}</th>
                <th scope="col" class="rk-num">${T('Punktequote')}</th></tr></thead>
                <tbody>${standings}</tbody></table>
                ${games ? `<table class="rk-table rk-ladder-games">
                <thead><tr><th>${T('Partie')}</th><th>${T('Wertung')}</th><th>${T('Ergebnis')}</th></tr></thead>
                <tbody>${games}</tbody></table>` : ''}</div>`
                : `<p class="sub mph-empty">${T('Für diese Version gibt es noch keine Arena-Partien.')}</p>`}`;
        },
    };

    const style = document.createElement('style');
    style.textContent = `
        .rk-head { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin-bottom:6px; }
        .rk-head select { width:auto; margin:0; }
        .rk-types { display:flex; flex:1 1 200px; }
        .rk-legend { font-size:12px; }
        .rk-scroll { max-height:60vh; overflow:auto; }
        .rk-table { width:100%; border-collapse:collapse; font-size:14px; }
        .rk-table th { text-align:left; font-size:12px; opacity:.7; border-bottom:1px solid var(--rule, #ccc); padding:4px 6px; position:sticky; top:0; background:var(--paper, #fbf6e9); }
        .rk-table td { padding:5px 6px; border-bottom:1px solid var(--rule, #e4dac2); }
        .rk-num { text-align:right; font-variant-numeric:tabular-nums; }
        .rk-me td { background:#fff1c7; }
        .rk-gap td { text-align:center; opacity:.5; }
        .rk-ladder-rank { width:3em; }
        .rk-ladder-count { width:14%; }
        .rk-ladder-stat { width:18%; }
        .rk-ladder-standings .rk-num { text-align:right; white-space:nowrap; }
        .rk-ladder-standings td:nth-child(2) { overflow-wrap:anywhere; }
        .rk-ladder-games { margin-top:14px; }
        @media (max-width: 480px) { .rk-table { font-size:13px; } .rk-table td, .rk-table th { padding:4px 3px; } .rk-table .hcp-tier { padding:1px 4px; } }
    `;
    document.head.appendChild(style);

    window.RANKING = RANKING;
})();
