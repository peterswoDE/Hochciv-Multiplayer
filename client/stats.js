/**
 * Post-game statistics (F6): the score of every empire over the rounds, key moments and the
 * numbers as a table. Data from utils/stats.js – live games send it as 'game:stats', a finished
 * Rundenspiel has it in its view, the match history loads it from GET /api/games/:id.
 * Loaded on the game page after mp.js (inject.js), and on the account page for the match history
 * (with TX, TXS and escHtml defined there; nation names and colours then come with the match).
 *
 * Chart: one value per empire and round – points, or cities, population, techs, armies, wonders,
 * income and stock of science, food and coins (the selector above the chart; older matches have
 * what was recorded then). One line per empire in its nation's colour (the colour it has on the
 * map). Those colours are not told apart reliably by everyone, so every line also has its own
 * marker shape, the legend and the end labels name it, a crosshair tooltip lists every empire at
 * a round, and the table view has all values.
 */
const STATS = {
    SHAPES: ['circle', 'square', 'triangle', 'diamond', 'down', 'hexagon', 'cross', 'star'],
    // what the chart can show: the key in a point of utils/stats.js and its title
    METRICS: [
        ['s', 'Punkte je Runde'], ['c', 'Städte'], ['pop', 'Bevölkerung'], ['t', 'Technologien'],
        ['a', 'Armeen'], ['w', 'Weltwunder'],
        ['ys', 'Wissenschaft je Runde'], ['yf', 'Nahrung je Runde'], ['yc', 'Münzen je Runde'],
        ['rs', 'Wissenschaft im Vorrat'], ['rf', 'Nahrung im Vorrat'], ['rc', 'Münzen im Vorrat'],
    ],
    names: null,             // { civ: { k: [de, en, colour] }, wonder: { k: [de, en] } } – from GET /api/games/:id

    civ: function (p) {
        if (typeof civOf === 'function') return civOf({ civ: p.civ, roman: p.roman, color: p.color });
        const c = typeof CIV_BY_KEY !== 'undefined' && CIV_BY_KEY[p.civ];
        const n = this.names && this.names.civ && this.names.civ[p.civ];
        const name = c ? c.n : n ? (HC_I18N.lang() === 'en' ? n[1] : n[0]) : p.civ;
        return { n: name + (p.roman ? ' ' + p.roman : ''), color: p.color || (c ? c.color : n && n[2]) || '#888' };
    },
    /** The metrics this match has values for. */
    metrics: function (stats, ids) {
        return this.METRICS.filter(([k]) => stats.rounds.some(rd => ids.some(i => rd.p[i] && rd.p[i][k] != null)));
    },
    label: function (stats, i) {
        const p = stats.players[i], c = this.civ(p);
        return p.name ? `${p.name} (${c.n})` : c.n;
    },
    short: function (stats, i) { const p = stats.players[i]; return p.name || this.civ(p).n; },
    series: stats => stats.players.map((p, i) => i).filter(i => stats.players[i].kind !== 'barbar'),

    /** SVG path of a marker shape around (0,0), radius r. */
    shapePath: function (shape, r) {
        const poly = (n, rot, rr) => Array.from({ length: n }, (_, k) => {
            const a = rot + k * 2 * Math.PI / n;
            return `${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`;
        }).join(' ');
        switch (shape) {
            case 'square': return `<rect x="${-r * 0.85}" y="${-r * 0.85}" width="${r * 1.7}" height="${r * 1.7}"/>`;
            case 'triangle': return `<polygon points="${poly(3, -Math.PI / 2, r * 1.15)}"/>`;
            case 'down': return `<polygon points="${poly(3, Math.PI / 2, r * 1.15)}"/>`;
            case 'diamond': return `<polygon points="${poly(4, 0, r * 1.15)}"/>`;
            case 'hexagon': return `<polygon points="${poly(6, 0, r)}"/>`;
            case 'cross': {
                const a = r * 0.4, b = r * 1.05;
                return `<polygon points="${-a},${-b} ${a},${-b} ${a},${-a} ${b},${-a} ${b},${a} ${a},${a} ${a},${b} ${-a},${b} ${-a},${a} ${-b},${a} ${-b},${-a} ${-a},${-a}"/>`;
            }
            case 'star': return `<polygon points="${Array.from({ length: 10 }, (_, k) => {
                const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.5 : r * 1.2;
                return `${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`;
            }).join(' ')}"/>`;
            default: return `<circle r="${r}"/>`;
        }
    },
    swatch: function (i, color) {
        return `<svg class="hcs-swatch" viewBox="-7 -7 14 14" aria-hidden="true"><line x1="-7" x2="7" y1="0" y2="0" stroke="${color}" stroke-width="2"/>
            <g fill="${color}" stroke="var(--paper, #f5efdf)" stroke-width="1.5">${this.shapePath(this.SHAPES[i % 8], 4)}</g></svg>`;
    },

    niceMax: function (v) {
        if (v <= 0) return 4;
        const step = Math.pow(10, Math.floor(Math.log10(v)));
        for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
        return 10 * step;
    },

    /** The chart, legend, key moments and table into `el`. */
    render: function (el, stats) {
        if (!el) return;
        if (!stats || !stats.rounds || stats.rounds.length < 1) {
            el.innerHTML = `<p class="sub">${TX('Für dieses Spiel gibt es keine Statistik.')}</p>`;
            return;
        }
        const ids = this.series(stats);
        const metrics = this.metrics(stats, ids);
        let k = metrics.length ? metrics[0][0] : 's';
        const select = metrics.length > 1 ? `<label class="hcs-metric">${TX('Anzeigen')} <select>${metrics.map(([key, n]) =>
            `<option value="${key}">${escHtml(TX(n))}</option>`).join('')}</select></label>` : '';
        el.innerHTML = `<div class="hcs-head"><h4 class="hcs-title">${TX('Punkte je Runde')}</h4>${select}</div><div class="hcs-legend">${ids.map(i => `<span>${this.swatch(i, this.civ(stats.players[i]).color)}${escHtml(this.label(stats, i))}</span>`).join('')}</div>
            <div class="hcs-plot"><div class="hcs-tip" hidden></div></div>
            <div class="hcs-moments"></div>
            <button type="button" class="btn small hcs-table-btn">${TX('Als Tabelle')}</button>
            <div class="hcs-tables" hidden></div>`;
        const plot = el.querySelector('.hcs-plot'), title = el.querySelector('.hcs-title');
        const btn = el.querySelector('.hcs-table-btn'), tables = el.querySelector('.hcs-tables');
        const draw = () => {
            title.textContent = TX((this.METRICS.find(m => m[0] === k) || this.METRICS[0])[1]);
            this.chart(plot, stats, ids, k);
            if (!tables.hidden) tables.innerHTML = this.tables(stats, ids, k);
        };
        draw();
        const sel = el.querySelector('.hcs-metric select');
        if (sel) sel.onchange = () => { k = sel.value; tables.innerHTML = ''; draw(); };
        this.moments(el.querySelector('.hcs-moments'), stats);
        btn.onclick = () => {
            tables.hidden = !tables.hidden;
            btn.textContent = tables.hidden ? TX('Als Tabelle') : TX('Tabelle ausblenden');
            if (!tables.hidden && !tables.innerHTML) tables.innerHTML = this.tables(stats, ids, k);
        };
    },

    chart: function (box, stats, ids, k) {
        k = k || 's';
        const old = box.querySelector(':scope > svg');
        if (old) old.remove();
        const rounds = stats.rounds;
        const val = (rd, i) => (rd.p[i] && rd.p[i][k] != null ? rd.p[i][k] : null);
        const title = TX((this.METRICS.find(m => m[0] === k) || this.METRICS[0])[1]);
        const W = Math.max(300, Math.min(720, box.clientWidth || 600)), H = 240;
        const labels = W >= 440;                             // end labels need room on the right
        const m = { l: 34, r: labels ? 110 : 12, t: 10, b: 28 };
        const pw = W - m.l - m.r, ph = H - m.t - m.b;
        const all = rounds.flatMap(rd => ids.map(i => val(rd, i))).filter(v => v != null);
        // food income can be negative: the axis then starts below zero
        const low = Math.min(0, ...all);
        const minS = low < 0 ? -this.niceMax(-low) : 0;
        const maxS = this.niceMax(Math.max(1, ...all));
        const r0 = rounds[0].r, r1 = rounds[rounds.length - 1].r;
        const x = r => m.l + (r1 === r0 ? pw / 2 : (r - r0) / (r1 - r0) * pw);
        const y = v => m.t + ph - (v - minS) / (maxS - minS) * ph;
        const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((minS + f * (maxS - minS)) * 10) / 10);
        const every = Math.max(1, Math.ceil(rounds.length / Math.floor(pw / 32)));
        const grid = ticks.map(v => `<line x1="${m.l}" x2="${m.l + pw}" y1="${y(v)}" y2="${y(v)}" class="hcs-grid"/>
            <text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="hcs-axis">${v}</text>`).join('');
        const xt = rounds.filter((rd, k) => k % every === 0 || k === rounds.length - 1)
            .map(rd => `<text x="${x(rd.r)}" y="${H - 8}" text-anchor="middle" class="hcs-axis">${rd.r}</text>`).join('');
        const markersEvery = rounds.length > 24 ? Math.ceil(rounds.length / 12) : 1;
        const lines = ids.map(i => {
            const color = this.civ(stats.players[i]).color;
            const pts = rounds.filter(rd => val(rd, i) != null).map(rd => [x(rd.r), y(val(rd, i))]);
            if (!pts.length) return '';
            const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
            const marks = pts.filter((p, k) => k % markersEvery === 0 || k === pts.length - 1)
                .map(p => `<g transform="translate(${p[0].toFixed(1)},${p[1].toFixed(1)})">${this.shapePath(this.SHAPES[i % 8], 4)}</g>`).join('');
            return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                <g fill="${color}" stroke="var(--paper, #f5efdf)" stroke-width="2">${marks}</g>`;
        }).join('');
        // End labels: only where they don't collide – the legend and tooltip carry the rest
        let ends = '';
        if (labels) {
            const last = rounds[rounds.length - 1];
            const placed = [];
            ids.map(i => ({ i, v: val(last, i) }))
                .filter(e => e.v != null).sort((a, b) => b.v - a.v)
                .forEach(e => {
                    const yy = y(e.v);
                    if (placed.some(p => Math.abs(p - yy) < 13)) return;
                    placed.push(yy);
                    const name = this.short(stats, e.i);
                    ends += `<text x="${x(last.r) + 9}" y="${yy + 4}" class="hcs-end">${escHtml(name.length > 14 ? name.slice(0, 13) + '…' : name)} ${e.v}</text>`;
                });
        }
        box.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escHtml(title)}">
            ${grid}${xt}
            ${lines}${ends}
            <line class="hcs-cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" visibility="hidden"/>
            <rect class="hcs-hit" x="${m.l - 10}" y="0" width="${pw + 20}" height="${H}" fill="transparent"/></svg>`);

        // Crosshair + tooltip: every empire at the round under the pointer, highest first
        const svg = box.querySelector('svg'), cross = svg.querySelector('.hcs-cross'), tip = box.querySelector('.hcs-tip');
        const move = ev => {
            const rect = svg.getBoundingClientRect();
            const px = (ev.clientX - rect.left) / rect.width * W;
            let best = rounds[0];
            for (const rd of rounds) if (Math.abs(x(rd.r) - px) < Math.abs(x(best.r) - px)) best = rd;
            cross.setAttribute('x1', x(best.r)); cross.setAttribute('x2', x(best.r));
            cross.setAttribute('visibility', 'visible');
            tip.innerHTML = '';
            const head = document.createElement('div');
            head.className = 'hcs-tip-head';
            head.textContent = TX('Runde %s', best.r);
            tip.appendChild(head);
            ids.filter(i => val(best, i) != null).sort((a, b) => val(best, b) - val(best, a)).forEach(i => {
                const row = document.createElement('div');
                row.innerHTML = this.swatch(i, this.civ(stats.players[i]).color);
                const v = document.createElement('b'); v.textContent = val(best, i);
                const n = document.createElement('span'); n.textContent = this.short(stats, i);
                row.append(v, n);
                tip.appendChild(row);
            });
            tip.hidden = false;
            const left = x(best.r) / W * rect.width;
            tip.style.left = (left > rect.width / 2 ? left - tip.offsetWidth - 12 : left + 12) + 'px';
        };
        const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
        const hit = svg.querySelector('.hcs-hit');
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerdown', move);
        hit.addEventListener('pointerleave', hide);
    },

    /** Key moments: wonders, conquered cities (grouped per round), empires out, new leader, biggest jump. */
    moments: function (box, stats) {
        const name = i => escHtml(this.short(stats, i));
        const wonder = k => {
            const w = typeof WONDER_BY_KEY !== 'undefined' && WONDER_BY_KEY[k];
            const n = !w && this.names && this.names.wonder && this.names.wonder[k];
            return escHtml(w ? (typeof T === 'function' ? T(w.n) : w.n) : n ? (HC_I18N.lang() === 'en' ? n[1] : n[0]) : k);
        };
        const list = [];
        const caps = {};
        for (const e of stats.events || []) {
            if (e.k === 'capture') {
                const key = `${e.r}:${e.pi}:${e.from}`;
                if (caps[key]) { caps[key].n++; continue; }
                caps[key] = { r: e.r, k: 'capture', pi: e.pi, from: e.from, n: 1 };
                list.push(caps[key]);
            } else list.push(e);
        }
        // the biggest gain of one empire in one round
        let jump = null;
        const ids = this.series(stats);
        for (let k = 1; k < stats.rounds.length; k++) {
            for (const i of ids) {
                const a = stats.rounds[k - 1].p[i], b = stats.rounds[k].p[i];
                if (!a || !b || a.s == null || b.s == null) continue;
                const d = b.s - a.s;
                if (d > 0 && (!jump || d > jump.d)) jump = { r: stats.rounds[k - 1].r, k: 'jump', pi: i, d };
            }
        }
        if (jump) list.push(jump);
        list.sort((a, b) => a.r - b.r);
        const text = e => ({
            wonder: () => `🏛 ${TX('%s baut %s.', name(e.pi), wonder(e.w))}`,
            capture: () => `⚔ ${e.n > 1 ? TX('%s erobert %s Städte von %s.', name(e.pi), e.n, name(e.from)) : TX('%s erobert eine Stadt von %s.', name(e.pi), name(e.from))}`,
            out: () => `☠ ${TX('%s scheidet aus.', name(e.pi))}`,
            lead: () => `👑 ${TX('%s übernimmt die Führung.', name(e.pi))}`,
            jump: () => `📈 ${TX('Größter Sprung: %s, +%s Punkte.', name(e.pi), e.d)}`,
        }[e.k] || (() => ''))();
        const shown = list.length > 15 ? list.filter(e => e.k !== 'capture').slice(0, 15) : list;
        box.innerHTML = `<h4>${TX('Wichtige Momente')}</h4>` + (shown.length
            ? `<ul>${shown.map(e => `<li><span class="hcs-r">${TX('Runde %s', e.r)}</span><span>${text(e)}</span></li>`).join('')}</ul>`
            : `<p class="sub">${TX('Keine besonderen Ereignisse.')}</p>`);
    },

    tables: function (stats, ids, k) {
        k = k || 's';
        const cell = (rd, i, key) => (rd.p[i] && rd.p[i][key] != null ? rd.p[i][key] : '–');
        const head = ids.map(i => `<th>${this.swatch(i, this.civ(stats.players[i]).color)} ${escHtml(this.short(stats, i))}</th>`).join('');
        const rows = stats.rounds.map(rd => `<tr><td>${rd.r}</td>${ids.map(i => `<td class="hcs-num">${cell(rd, i, k)}</td>`).join('')}</tr>`).join('');
        const last = stats.rounds[stats.rounds.length - 1];
        const counts = this.metrics(stats, ids).filter(([key]) => key !== 's');
        const end = counts.map(([key, n]) => `<tr><td>${TX(n)}</td>${ids.map(i => `<td class="hcs-num">${cell(last, i, key)}</td>`).join('')}</tr>`).join('');
        return `<h4>${TX((this.METRICS.find(m => m[0] === k) || this.METRICS[0])[1])}</h4><div class="hcs-scroll"><table class="tbl"><tr><th>${TX('Runde')}</th>${head}</tr>${rows}</table></div>
            <h4>${TX('Am Ende')}</h4><div class="hcs-scroll"><table class="tbl"><tr><th></th>${head}</tr>${end}</table></div>`;
    },

    // ── End screen: "Statistik" opens the section below the result ────────────────
    addToEndScreen: function (stats) {
        const body = $('ov-body');
        if (!body || !stats || $('mp-stats-btn') || !$('go-menu')) return;
        const btn = document.createElement('button');
        btn.className = 'btn wide';
        btn.id = 'mp-stats-btn';
        btn.textContent = '📊 ' + TX('Statistik');
        const box = document.createElement('div');
        box.id = 'mp-stats-box';
        box.hidden = true;
        const anchor = $('mp-rematch-box') || $('go-menu');
        anchor.parentNode.insertBefore(btn, anchor);
        anchor.parentNode.insertBefore(box, anchor);
        btn.onclick = () => {
            box.hidden = !box.hidden;
            if (!box.hidden) {
                $('overlay').classList.add('wide');
                if (!box.innerHTML) this.render(box, stats);
            }
        };
    },

    /** A stored match (profile / match history): load and draw. */
    loadInto: async function (el, gameId) {
        el.innerHTML = `<p class="sub">${TX('Lade...')}</p>`;
        try {
            const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ? TXS(data.error) : TX('Fehler'));
            if (data.names) this.names = data.names;
            this.render(el, data.stats);
        } catch (e) {
            el.innerHTML = `<p class="sub">${escHtml(e.message)}</p>`;
        }
    },
};

window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .hcs-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; margin: 8px 0 2px; }
        .hcs-title { margin: 0; }
        .hcs-metric { font-size: 13px; color: var(--ink-soft, #6f6551); display: inline-flex; align-items: center; gap: 6px; }
        .hcs-metric select { font: inherit; font-size: 14px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--rule, #c9bb98);
            background: var(--paper-2, #efe6ce); color: var(--ink, #2a2721); }
        .hcs-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; margin: 6px 0; color: var(--ink, #2a2721); }
        .hcs-legend > span { display: inline-flex; align-items: center; gap: 5px; }
        .hcs-swatch { width: 18px; height: 14px; flex: 0 0 auto; vertical-align: middle; }
        .hcs-plot { position: relative; }
        .hcs-plot svg { display: block; touch-action: pan-y; }
        .hcs-grid { stroke: rgba(42,39,33,0.12); stroke-width: 1; }
        .hcs-cross { stroke: rgba(42,39,33,0.45); stroke-width: 1; }
        .hcs-axis { font-size: 11px; fill: var(--ink-soft, #6f6551); font-variant-numeric: tabular-nums; }
        .hcs-end { font-size: 12px; fill: var(--ink, #2a2721); }
        .hcs-tip { position: absolute; top: 6px; background: var(--paper, #f5efdf); border: 1px solid rgba(42,39,33,0.25); border-radius: 6px;
            padding: 6px 8px; font-size: 12px; pointer-events: none; box-shadow: 0 3px 10px rgba(0,0,0,0.15); min-width: 120px; z-index: 2; }
        .hcs-tip[hidden] { display: none; }
        .hcs-tip > div { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .hcs-tip b { min-width: 2.2em; text-align: right; font-variant-numeric: tabular-nums; }
        .hcs-tip-head { color: var(--ink-soft, #6f6551); margin-bottom: 2px; }
        .hcs-moments h4, .hcs-tables h4 { margin: 12px 0 4px; }
        .hcs-moments ul { list-style: none; padding: 0; margin: 0; font-size: 13px; }
        .hcs-moments li { display: grid; grid-template-columns: 5.5em 1fr; gap: 6px; padding: 2px 0; }
        .hcs-r { color: var(--ink-soft, #6f6551); }
        .hcs-table-btn { margin: 10px 0 0; width: auto; }
        .hcs-tables[hidden] { display: none; }
        .hcs-scroll { overflow-x: auto; }
        .hcs-tables th { white-space: nowrap; font-size: 12px; }
        .hcs-num { text-align: right; font-variant-numeric: tabular-nums; }
        #mp-stats-box { margin: 4px 0 12px; }
        #mp-stats-box[hidden] { display: none; }
    `;
    document.head.appendChild(style);
});
