/**
 * Overall statistics over all finished matches (F13) – win rates per nation, ability and turn
 * position, victory types, what winners have at the end, technologies and wonders.
 * Loaded by the game (menu button "Statistiken", mp.js) and by the account page (admin tab).
 *
 *   GAMESTATS.open()                 – the public statistics in their own overlay
 *   GAMESTATS.render(el, { admin })  – draw them into `el`; admin adds matches per version,
 *                                      KI levels, the sources, export and recompute
 *
 * Data: GET /api/stats (routes/stats.js) or GET /api/admin/stats, built by utils/gamestats.js.
 * Every bar has its number next to it, so the tables are the accessible view as well.
 */
(function () {
    'use strict';
    if (window.GAMESTATS) return;

    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const tx = (de, ...args) => HC_I18N.t(de, ...args);
    const en = () => HC_I18N.lang() === 'en';
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    const SMALL = 5;             // fewer seats than this: shown, but greyed out

    const CSS = `
        #hcg-overlay { position: fixed; inset: 0; z-index: 10040; background: rgba(30,24,12,.55);
            display: none; align-items: center; justify-content: center; padding: 16px;
            font-family: var(--sans, -apple-system, "Segoe UI", Roboto, sans-serif); }
        #hcg-overlay.show { display: flex; }
        #hcg-box { background: var(--paper, #f5efdf); color: var(--ink, #2a2721); border-radius: 10px;
            width: min(780px, 100%); max-height: min(88vh, 900px); display: flex; flex-direction: column;
            box-shadow: 0 10px 40px rgba(0,0,0,.35); overflow: hidden; }
        #hcg-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px;
            border-bottom: 1px solid var(--rule, #c9bb98); }
        #hcg-head .hcg-title { flex: 1; font-family: var(--serif, Georgia, serif); font-size: 18px; font-weight: 700; }
        #hcg-head button { background: none; border: 0; font-size: 22px; line-height: 1; cursor: pointer;
            color: inherit; padding: 4px 8px; border-radius: 6px; }
        #hcg-head button:hover { background: rgba(0,0,0,.06); }
        #hcg-body { overflow-y: auto; padding: 14px 16px 18px; }
        .hcg { color: var(--ink, #2a2721); font-size: 14px; }
        .hcg-filters { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 14px; align-items: end; }
        .hcg-filters label { display: flex; flex-direction: column; font-size: 12px; color: var(--ink-soft, #6f6551); gap: 2px; }
        .hcg-filters select { font: inherit; font-size: 14px; padding: 5px 6px; border-radius: 6px;
            border: 1px solid var(--rule, #c9bb98); background: var(--paper-2, #efe6ce); color: var(--ink, #2a2721); }
        .hcg-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .hcg-tile { background: var(--paper-2, #efe6ce); border-radius: 8px; padding: 8px 6px; text-align: center; }
        .hcg-tile b { display: block; font-size: 22px; font-family: var(--serif, Georgia, serif); }
        .hcg-tile span { font-size: 12px; color: var(--ink-soft, #6f6551); }
        .hcg h3 { font-family: var(--serif, Georgia, serif); font-size: 16px; margin: 18px 0 4px; }
        .hcg-note { font-size: 12px; color: var(--ink-soft, #6f6551); margin: 0 0 6px; }
        .hcg-scroll { overflow-x: auto; }
        .hcg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .hcg-table th, .hcg-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid rgba(0,0,0,.06); white-space: nowrap; }
        .hcg-table th { font-weight: 600; color: var(--ink-soft, #6f6551); }
        .hcg-table td.num, .hcg-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .hcg-table tr.small td { color: var(--ink-soft, #6f6551); opacity: .7; }
        .hcg-table tr:hover td { background: rgba(0,0,0,.03); }
        .hcg-bar { display: flex; align-items: center; gap: 6px; min-width: 130px; }
        .hcg-track { flex: 1; height: 8px; background: rgba(0,0,0,.06); border-radius: 4px; overflow: hidden; }
        .hcg-fill { height: 100%; background: #4f6d8a; border-radius: 0 4px 4px 0; }
        .hcg-bar b { min-width: 34px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
        .hcg-empty { color: var(--ink-soft, #6f6551); padding: 10px 0; }
        .hcg-btn { font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; cursor: pointer;
            border: 1px solid var(--rule, #c9bb98); background: var(--paper-2, #efe6ce); color: inherit; text-decoration: none; display: inline-block; }
        .hcg-table td small { display: block; font-size: 11px; color: var(--ink-soft, #6f6551); }
        @media (max-width: 480px) {
            .hcg-tile b { font-size: 18px; }
            .hcg-table th, .hcg-table td { padding: 4px 3px; }
            .hcg-bar { min-width: 64px; gap: 4px; }
            .hcg-bar b { min-width: 30px; }
        }
    `;
    let styled = false;
    function style() {
        if (styled) return;
        styled = true;
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ── names ──────────────────────────────────────────────────────────────────────────────
    const pick = pair => (pair ? (en() ? pair[1] : pair[0]) : null);
    const civName = (N, k) => pick(N.civ[k]) || k;
    const abilName = (N, civ, k) => pick(N.abil[civ] && N.abil[civ][k]) || k;
    const techRow = (N, k) => N.tech.find(t => t[0] === k);
    const wonderRow = (N, k) => N.wonder.find(w => w[0] === k);
    const VICTORY = { military: 'Militärsieg', science: 'Forschungssieg', economy: 'Wirtschaftssieg', culture: 'Kultursieg', other: 'Sonstige' };

    // ── pieces ─────────────────────────────────────────────────────────────────────────────
    const bar = (v, max) => v == null ? '–'
        : `<div class="hcg-bar"><div class="hcg-track"><div class="hcg-fill" style="width:${Math.max(0, Math.min(100, (v / (max || 100)) * 100))}%"></div></div><b>${v}${max ? '' : '%'}</b></div>`;
    const table = (head, rows) => rows.length
        ? `<div class="hcg-scroll"><table class="hcg-table"><thead><tr>${head.map(h => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
        : `<p class="hcg-empty">${tx('Noch keine Daten.')}</p>`;
    // one row of "games / wins / win rate"
    const winRow = (label, games, wins) => `<tr class="${games < SMALL ? 'small' : ''}" title="${esc(tx('%s Siege in %s Spielen', wins, games))}">
        <td>${label}</td><td class="num">${games}</td><td class="num">${wins}</td><td>${bar(pct(wins, games))}</td></tr>`;
    const WIN_HEAD = () => [[tx('Spiele'), 'num'], [tx('Siege'), 'num'], [tx('Siegquote')]];

    // ── sections ───────────────────────────────────────────────────────────────────────────
    function sections(d) {
        const N = d.names;
        const out = [];
        out.push(`<div class="hcg-tiles">
            <div class="hcg-tile"><b>${d.games}</b><span>${tx('Partien')}</span></div>
            <div class="hcg-tile"><b>${d.seats}</b><span>${d.query.seats === 'all' ? tx('Plätze') : tx('Menschliche Plätze')}</span></div>
            <div class="hcg-tile"><b>${d.rounds.avg == null ? '–' : d.rounds.avg}</b><span>${tx('Ø Runden')}</span></div></div>`);
        if (!d.games) return out.join('') + `<p class="hcg-empty">${tx('Für diese Auswahl gibt es noch keine beendeten Partien.')}</p>`;

        // victory types
        const vt = Object.entries(d.victory).sort((a, b) => b[1] - a[1]);
        const vtSum = vt.reduce((n, x) => n + x[1], 0);
        out.push(`<h3>${tx('Wie gewonnen wird')}</h3>` + table([[tx('Siegart')], [tx('Partien'), 'num'], [tx('Anteil')]],
            vt.map(([k, n]) => `<tr><td>${tx(VICTORY[k] || k)}</td><td class="num">${n}</td><td>${bar(pct(n, vtSum))}</td></tr>`)));

        // nations
        out.push(`<h3>${tx('Siegquote je Nation')}</h3>` + table([[tx('Nation')], ...WIN_HEAD()],
            d.civs.slice().sort((a, b) => pct(b.wins, b.games) - pct(a.wins, a.games) || b.games - a.games)
                .map(c => winRow(esc(civName(N, c.civ || c.k)), c.games, c.wins))));

        // abilities
        out.push(`<h3>${tx('Siegquote je Fähigkeit')}</h3>` + table([[tx('Fähigkeit')], ...WIN_HEAD()],
            d.abilities.slice().sort((a, b) => a.civ.localeCompare(b.civ) || pct(b.wins, b.games) - pct(a.wins, a.games))
                .map(a => winRow(`${esc(abilName(N, a.civ, a.k))}<small>${esc(civName(N, a.civ))}</small>`, a.games, a.wins))));

        // turn position
        const pos = Object.entries(d.positions).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        out.push(`<h3>${tx('Siegquote je Startplatz')}</h3><p class="hcg-note">${tx('1. = Startspieler, danach in Zugfolge. Getrennt nach Zahl der Reiche.')}</p>` +
            (pos.length ? pos.map(([n, rows]) => `<p class="hcg-note"><b>${tx('%s Reiche', n)}</b></p>` +
                table([[tx('Startplatz')], ...WIN_HEAD()], rows.map(r => winRow(r.pos + '.', r.games, r.wins)))).join('')
                : `<p class="hcg-empty">${tx('Noch keine Daten.')}</p>`));

        // winners vs the others
        const W = d.winners.won, L = d.winners.lost;
        const metric = (label, k) => `<tr><td>${label}</td><td class="num"><b>${W[k] == null ? '–' : W[k]}</b></td><td class="num">${L[k] == null ? '–' : L[k]}</td></tr>`;
        out.push(`<h3>${tx('Sieger am Spielende')}</h3><p class="hcg-note">${tx('Durchschnitt je Platz: Sieger gegen alle anderen.')}</p>` +
            table([[''], [tx('Sieger'), 'num'], [tx('Andere'), 'num']], [
                metric(tx('Städte'), 'cities'), metric(tx('Bevölkerung'), 'pop'), metric(tx('Technologien'), 'techs'),
                metric(tx('Weltwunder'), 'wonders'), metric(tx('Armeen'), 'armies'), metric(tx('Punkte'), 'score'),
            ]));
        const hist = Object.entries(d.winners.cities).map(([c, n]) => [+c, n]).sort((a, b) => a[0] - b[0]);
        const histMax = Math.max(1, ...hist.map(h => h[1]));
        out.push(`<p class="hcg-note" style="margin-top:10px"><b>${tx('Mit wie vielen Städten gewonnen wird')}</b></p>` +
            table([[tx('Städte')], [tx('Siege')]], hist.map(([c, n]) => `<tr><td>${c}</td><td>${bar(n, histMax)}</td></tr>`)));

        // technologies
        const T = d.techs;
        const lost = T.seats - T.won;
        const techs = T.list.map(x => {
            const row = techRow(N, x.k);
            return {
                k: x.k, name: row ? (en() ? row[2] : row[1]) : x.k, age: row ? row[4] : null, order: row ? N.tech.indexOf(row) : 999,
                won: pct(x.hadWon, T.won), lost: pct(x.had - x.hadWon, lost), rate: pct(x.hadWon, x.had), had: x.had, round: x.round,
            };
        });
        const ages = N.ages[en() ? 1 : 0] || [];
        out.push(`<h3>${tx('Technologien')}</h3><p class="hcg-note">${tx('Wie oft Sieger und andere eine Technologie am Ende hatten, die Siegquote mit ihr und die Runde, in der Sieger sie im Schnitt erforscht haben. Aus %s Plätzen mit Wiederholung.', T.seats)}</p>
            <div class="hcg-filters"><label>${tx('Sortieren')}<select data-hcg-sort>
              <option value="gap">${tx('Vorsprung der Sieger')}</option><option value="won">${tx('Bei Siegern')}</option>
              <option value="rate">${tx('Siegquote')}</option><option value="round">${tx('Ø Runde')}</option><option value="tree">${tx('Techbaum')}</option>
            </select></label></div><div data-hcg-techs></div>`);
        out.techs = { techs, ages };

        // wonders
        out.push(`<h3>${tx('Weltwunder')}</h3>` + table([[tx('Wunder')], [tx('Gebaut'), 'num'], [tx('Siege'), 'num'], [tx('Siegquote')]],
            d.wonders.slice().sort((a, b) => b.built - a.built).map(w => {
                const row = wonderRow(N, w.k);
                return winRow(esc(row ? (en() ? row[2] : row[1]) : w.k), w.built, w.wins);
            })));
        return out;
    }

    function techTable(state, sort) {
        const by = {
            gap: (a, b) => ((b.won || 0) - (b.lost || 0)) - ((a.won || 0) - (a.lost || 0)),
            won: (a, b) => (b.won || 0) - (a.won || 0),
            rate: (a, b) => (b.rate || 0) - (a.rate || 0),
            round: (a, b) => (a.round == null ? 99 : a.round) - (b.round == null ? 99 : b.round),
            tree: (a, b) => a.order - b.order,
        }[sort] || (() => 0);
        return table([[tx('Technologie')], [tx('Bei Siegern')], [tx('Bei anderen')], [tx('Siegquote mit'), 'num'], [tx('Ø Runde'), 'num']],
            state.techs.slice().sort(by).map(t => `<tr class="${t.had < SMALL ? 'small' : ''}" title="${esc(tx('%s Plätze hatten sie', t.had))}">
                <td>${esc(t.name)}<small>${esc(state.ages[t.age] || '')}</small></td><td>${bar(t.won)}</td><td>${bar(t.lost)}</td>
                <td class="num">${t.rate == null ? '–' : t.rate + '%'}</td><td class="num">${t.round == null ? '–' : t.round}</td></tr>`));
    }

    function adminSection(d) {
        const D = d.detail || {};
        const src = D.sources || {};
        return `<h3>${tx('Admin')}</h3>
            <p class="hcg-note">${tx('Quelle der Daten: %s aus Wiederholungen (vollständig), %s aus dem Spielbericht (ohne Technologien und Startplatz), %s ohne Daten.', src.replay || 0, src.record || 0, src.none || 0)}</p>
            ${table([[tx('Version')], [tx('Partien'), 'num']], (D.byVersion || []).sort((a, b) => parseInt(b.ver.slice(1)) - parseInt(a.ver.slice(1)) || 0)
                .map(v => `<tr><td>${esc(v.ver)}</td><td class="num">${v.games}</td></tr>`))}
            <p class="hcg-note" style="margin-top:10px"><b>${tx('KI und Bots nach Stufe')}</b> (${tx('in den gefilterten Partien')})</p>
            ${table([[tx('Art')], [tx('Stufe')], ...WIN_HEAD()], (D.levels || []).sort((a, b) => a.kind.localeCompare(b.kind) || a.lvl.localeCompare(b.lvl))
                .map(l => winRow(`${esc(l.kind === 'ki' ? 'KI' : 'Bot')}</td><td>${esc(l.lvl)}`, l.games, l.wins)))}
            <p style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
              <a class="hcg-btn" href="/api/admin/stats/export" download>${tx('Rohdaten exportieren (JSON)')}</a>
              <button class="hcg-btn" type="button" data-hcg-recompute>${tx('Neu berechnen')}</button></p>`;
    }

    // ── render ─────────────────────────────────────────────────────────────────────────────
    const NS = [['all', 'Alle'], ['2', '2'], ['3', '3'], ['4', '4'], ['5+', '5–8']];
    // each game type on its own (their rules differ), or all together
    const MODES = [['all', 'Alle'], ['normal', 'Normal'], ['duel', '1 gegen 1'], ['marathon', 'Marathon']];

    async function render(el, opts) {
        style();
        opts = opts || {};
        const q = el._hcgQuery || (el._hcgQuery = { mode: 'all', seats: 'humans', n: 'all', ver: 'all' });
        el.classList.add('hcg');
        el.innerHTML = `<p class="hcg-empty">${tx('Lädt...')}</p>`;
        let d;
        try {
            const res = await fetch((opts.admin ? '/api/admin/stats?' : '/api/stats?') + new URLSearchParams(q), { credentials: 'same-origin' });
            d = await res.json();
            if (!res.ok) throw new Error(d.error || res.status);
        } catch (e) {
            el.innerHTML = `<p class="hcg-empty">${tx('Fehler beim Laden.')}</p>`;
            return;
        }
        const sel = (key, label, opts2) => `<label>${label}<select data-hcg-q="${key}">${opts2.map(([v, t]) =>
            `<option value="${esc(v)}"${q[key] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
        const filters = `<div class="hcg-filters">
            ${sel('mode', tx('Spielart'), MODES.map(([v, t]) => [v, tx(t)]))}
            ${sel('seats', tx('Gezählt'), [['humans', tx('Nur Menschen')], ['all', tx('Alle Plätze (mit KI)')]])}
            ${q.mode !== 'duel' ? sel('n', tx('Reiche'), NS.filter(([v]) => q.mode !== 'normal' || v !== '2').map(([v, t]) => [v, tx(t)])) : ''}
            ${sel('ver', tx('Version'), [['all', tx('Alle')], ...d.filters.versions.map(v => [v, v + (v === d.filters.current ? ' ' + tx('(aktuell)') : '')])])}
        </div>`;
        const parts = sections(d);
        el.innerHTML = filters + (Array.isArray(parts) ? parts.join('') : parts) + (opts.admin ? adminSection(d) : '');
        el.querySelectorAll('[data-hcg-q]').forEach(s => s.onchange = () => { q[s.dataset.hcgQ] = s.value; if (s.dataset.hcgQ === 'mode') q.n = 'all'; render(el, opts); });
        const techBox = el.querySelector('[data-hcg-techs]'), sortSel = el.querySelector('[data-hcg-sort]');
        if (techBox && parts.techs) {
            const draw = () => { techBox.innerHTML = techTable(parts.techs, sortSel.value); };
            sortSel.onchange = draw;
            draw();
        }
        const re = el.querySelector('[data-hcg-recompute]');
        if (re) re.onclick = async () => {
            if (!confirm(tx('Alle Statistikdaten neu berechnen? Das läuft im Hintergrund.'))) return;
            const r = await fetch('/api/admin/stats/recompute', { method: 'POST', credentials: 'same-origin' });
            alert(r.ok ? tx('Wird neu berechnet – in einer Minute neu laden.') : tx('Nur für Superadmins.'));
        };
    }

    // ── overlay (game page) ────────────────────────────────────────────────────────────────
    let overlay = null;
    function open() {
        style();
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'hcg-overlay';
            overlay.innerHTML = `<div id="hcg-box" role="dialog" aria-modal="true" aria-labelledby="hcg-title">
                <div id="hcg-head"><span class="hcg-title" id="hcg-title"></span>
                  <button id="hcg-close" aria-label="${tx('Schließen')}">×</button></div>
                <div id="hcg-body"></div></div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
            overlay.querySelector('#hcg-close').onclick = close;
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && overlay.classList.contains('show')) { e.stopPropagation(); close(); }
            }, true);
        }
        overlay.querySelector('#hcg-title').textContent = tx('Statistiken');
        overlay.querySelector('#hcg-close').title = tx('Schließen');
        overlay.classList.add('show');
        render(overlay.querySelector('#hcg-body'));
    }
    function close() { if (overlay) overlay.classList.remove('show'); }

    window.GAMESTATS = { open, close, render };
})();
