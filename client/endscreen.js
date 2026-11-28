/**
 * The end screen's info panel, after Civilization IV's end of game: under the result and the
 * players, four tabs –
 *
 *   Punkteverlauf  the chart of client/stats.js (points, cities, population … over the rounds)
 *   Demografie     every measure of the own empire (a spectator: the winner's) with its rank and
 *                  the best, the average and the worst of the empires still in the game
 *   Wunder & Städte  every world wonder (who, in which round, in which city) and the five
 *                  biggest cities
 *   Chronik        all key moments of the game in order, and its end
 *   Zeitraffer     the game once more, round by round: the map, the points and the log side by
 *                  side (Civ IV's replay), from the stored match (client/replay.js; live games and
 *                  Rundenspiele – single-player games keep no frames)
 *
 * Loaded on the game page after client/stats.js and client/solo.js (inject.js). Multiplayer
 * (live, Rundenspiel, replay): mp.js's gameOver() patch calls STATS.addToEndScreen, which lands
 * here – with the statistics, or without them while 'game:stats' is still on its way (then once
 * more when it comes). Single-player games: this file's gameOver() patch, with the points
 * client/solo.js recorded on this device. Demografie and Wunder & Städte read the final state S.
 */
(function () {
    'use strict';
    if (window.ENDSCREEN) return;
    const T = (de, ...a) => HC_I18N.t(de, ...a);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = id => document.getElementById(id);
    const TAB_KEY = 'hochciv.endscreen.tab';
    const TABS = [['graph', '📈', 'Punkteverlauf'], ['demo', '📋', 'Demografie'], ['wonders', '🏛', 'Wunder & Städte'], ['chronicle', '📜', 'Chronik'], ['timelapse', '🎞', 'Zeitraffer']];
    const mp = () => typeof MP !== 'undefined' && MP.active;

    const ENDSCREEN = {
        stats: null,
        tab: null,
        record: null,           // the stored match { id, replay } (mp.js MP.lastRecord, 'game:record')
        frames: null,           // its states, one per round (Zeitraffer)
        loading: null,
        tl: null,               // the Zeitraffer's player: { at, timer, log, x }

        /** Build the panel (once per end screen) or give it the statistics that came later. */
        add: function (stats) {
            if (typeof S === 'undefined' || !S || !S.over || !$('ov-body') || !$('go-menu')) return;
            if (stats) this.stats = stats;
            let box = $('hce-panel');
            if (!box) {
                if (!stats) this.stats = null;
                box = document.createElement('div');
                box.id = 'hce-panel';
                const tabs = TABS.filter(t => t[0] !== 'timelapse' || mp());
                const saved = (() => { try { return localStorage.getItem(TAB_KEY); } catch (e) { return null; } })();
                this.tab = tabs.some(t => t[0] === saved) ? saved : 'graph';
                this.record = mp() ? MP.lastRecord || null : null;
                this.frames = null; this.loading = null;
                box.innerHTML = `<div class="hce-tabs" role="tablist">${tabs.map(([k, icon, n]) =>
                    `<button type="button" role="tab" data-tab="${k}">${icon} ${esc(T(n))}</button>`).join('')}</div><div class="hce-body"></div>`;
                box.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => this.show(b.dataset.tab); });
                const body = $('ov-body');
                const anchor = $('mp-go-players') ? $('mp-go-players').nextSibling : body.querySelector('.tip') || $('mp-rematch-box') || $('go-again') || $('go-menu');
                anchor ? anchor.parentNode.insertBefore(box, anchor) : body.appendChild(box);
                const ov = $('overlay');
                if (ov) ov.classList.add('wide');
            }
            this.show(this.tab);
        },

        show: function (k) {
            const box = $('hce-panel');
            if (!box) return;
            this.tab = k;
            try { localStorage.setItem(TAB_KEY, k); } catch (e) { /* private window */ }
            box.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === k ? 'true' : 'false'));
            const body = box.querySelector('.hce-body');
            this.stop();
            body.innerHTML = '';
            try {
                ({ graph: () => this.graph(body), demo: () => this.demo(body), wonders: () => this.wonders(body), chronicle: () => this.chronicle(body), timelapse: () => this.timelapse(body) })[k]();
            } catch (e) {
                body.innerHTML = `<p class="sub">${esc(T('Das lässt sich für dieses Spiel nicht anzeigen.'))}</p>`;
            }
        },

        // ── who is who ─────────────────────────────────────────────────────────────
        /** Index of "you": the own empire, a spectator sees the winner's. */
        me: function () {
            if (mp() && Number.isInteger(MP.playerIndex) && MP.playerIndex >= 0) return MP.playerIndex;
            if (!mp()) {
                const h = S.players.findIndex(p => p.kind === 'human');
                if (h >= 0 && S.players.filter(p => p.kind === 'human').length === 1) return h;
            }
            return S.over.winner != null ? S.over.winner : 0;
        },
        civName: i => (typeof civOf === 'function' ? civOf(S.players[i]).n : S.players[i].civ),
        color: i => (typeof civOf === 'function' ? civOf(S.players[i]).color : '#888'),
        /** The player's name (multiplayer) and the empire, or only the empire. */
        name: function (i) {
            const lp = mp() && typeof MP.lobbyPlayerOf === 'function' ? MP.lobbyPlayerOf(S.players[i]) : null;
            const civ = this.civName(i);
            return lp && lp.name && lp.name !== civ ? `${lp.name} (${civ})` : civ;
        },
        dot: function (i) { return `<i class="hce-dot" style="background:${esc(this.color(i))}"></i>`; },
        empires: () => S.players.map((p, i) => i).filter(i => S.players[i].kind !== 'barbar'),

        // ── Punkteverlauf ──────────────────────────────────────────────────────────
        graph: function (body) {
            if (!this.stats || !this.stats.rounds || !this.stats.rounds.length) {
                body.innerHTML = `<p class="sub">${esc(mp() && !MP.replay ? T('Die Statistik wird geladen …') : T('Für dieses Spiel gibt es keine Statistik.'))}</p>`;
                return;
            }
            STATS.render(body, this.stats, { noMoments: true });
        },

        // ── Demografie ─────────────────────────────────────────────────────────────
        measures: function () {
            const sc = i => { try { return typeof victoryScore === 'function' ? victoryScore(S, i).total : null; } catch (e) { return null; } };
            const inc = {};
            const yields = i => {
                if (!(i in inc)) { try { inc[i] = typeof income === 'function' && !S.players[i].dead ? income(S, i) : null; } catch (e) { inc[i] = null; } }
                return inc[i];
            };
            const cities = i => S.cities.filter(c => c.owner === i);
            return [
                ['Punkte', sc],
                ['Städte', i => cities(i).length],
                ['Bevölkerung', i => cities(i).reduce((n, c) => n + (c.pop || 0), 0)],
                ['Größte Stadt', i => cities(i).reduce((n, c) => Math.max(n, c.pop || 0), 0)],
                ['Technologien', i => Object.keys(S.players[i].techs || {}).filter(k => S.players[i].techs[k]).length],
                ['Armeen', i => S.armies.filter(a => a.owner === i).length],
                ['Weltwunder', i => (S.wonders || []).filter(w => w.owner === i).length],
                ['Wissenschaft je Runde', i => (yields(i) ? yields(i).sci : null)],
                ['Nahrung je Runde', i => (yields(i) ? yields(i).food : null)],
                ['Münzen je Runde', i => (yields(i) ? yields(i).coins : null)],
            ];
        },
        demo: function (body) {
            const me = this.me();
            // out of the game: dead, or without a city (an empire whose capital fell)
            const alive = this.empires().filter(i => !S.players[i].dead && S.cities.some(c => c.owner === i));
            const field = alive.length ? alive : this.empires();
            const fmt = v => (v == null ? '–' : Math.round(v * 10) / 10);
            const rows = this.measures().map(([n, f]) => {
                const vals = field.map(i => ({ i, v: f(i) })).filter(x => x.v != null);
                if (!vals.length) return '';
                vals.sort((a, b) => b.v - a.v);
                const mine = f(me);
                const rank = mine == null || !field.includes(me) ? '–' : 1 + vals.filter(x => x.v > mine).length;
                const best = vals[0], worst = vals[vals.length - 1];
                const avg = vals.reduce((s, x) => s + x.v, 0) / vals.length;
                const who = x => `${this.dot(x.i)}${esc(this.civName(x.i))}`;
                return `<tr><td>${esc(T(n))}</td><td class="hcs-num"><b>${fmt(mine)}</b></td><td class="hcs-num">${rank}</td>
                    <td class="hcs-num">${fmt(best.v)}</td><td class="hce-who">${who(best)}</td>
                    <td class="hcs-num">${fmt(avg)}</td>
                    <td class="hcs-num">${fmt(worst.v)}</td><td class="hce-who">${who(worst)}</td></tr>`;
            }).join('');
            body.innerHTML = `<h4>${this.dot(me)}${esc(T('Demografie: %s', this.name(me)))}</h4>
                <div class="hcs-scroll"><table class="tbl hce-demo"><tr><th></th><th class="hcs-num">${esc(T('Wert'))}</th><th class="hcs-num">${esc(T('Rang'))}</th>
                <th colspan="2" class="hce-l">${esc(T('Bester'))}</th><th class="hcs-num">${esc(T('Schnitt'))}</th><th colspan="2" class="hce-l">${esc(T('Schlechtester'))}</th></tr>${rows}</table></div>
                <p class="sub">${esc(T('Verglichen mit den %s Reichen, die bis zum Ende im Spiel waren.', field.length))}</p>`;
        },

        // ── Wunder & Städte ────────────────────────────────────────────────────────
        wonderName: k => {
            const w = typeof WONDER_BY_KEY !== 'undefined' && WONDER_BY_KEY[k];
            return w ? (typeof T === 'function' ? T(w.n) : w.n) : k;
        },
        wonders: function (body) {
            const built = {};
            for (const e of (this.stats && this.stats.events) || []) if (e.k === 'wonder' && built[e.w] == null) built[e.w] = e.r;
            const cityOf = id => S.cities.find(c => c.id === id);
            const ws = (S.wonders || []).slice().sort((a, b) => (built[a.k] || 0) - (built[b.k] || 0));
            const wrows = ws.map(w => {
                const c = cityOf(w.cityId);
                return `<tr><td>${esc(this.wonderName(w.k))}</td><td>${this.dot(w.owner)}${esc(this.name(w.owner))}</td>
                    <td class="hcs-num">${built[w.k] != null ? built[w.k] : '–'}</td>
                    <td class="hcs-num">${c ? (c.cap ? '★ ' : '') + (c.pop || 0) : '–'}</td></tr>`;
            }).join('');
            const top = S.cities.filter(c => S.players[c.owner] && S.players[c.owner].kind !== 'barbar')
                .slice().sort((a, b) => (b.pop || 0) - (a.pop || 0) || a.id - b.id).slice(0, 5);
            const crows = top.map((c, k) => {
                const wn = (S.wonders || []).filter(w => w.cityId === c.id).map(w => this.wonderName(w.k));
                return `<tr><td class="hcs-num">${k + 1}.</td><td>${esc(c.cap ? T('Hauptstadt') : T('Stadt'))}</td>
                    <td>${this.dot(c.owner)}${esc(this.name(c.owner))}</td><td class="hcs-num">${c.pop || 0}</td><td>${esc(wn.join(', ')) || '–'}</td></tr>`;
            }).join('');
            body.innerHTML = `<h4>${esc(T('Weltwunder'))}</h4>` + (wrows
                ? `<div class="hcs-scroll"><table class="tbl"><tr><th>${esc(T('Wunder'))}</th><th>${esc(T('Erbaut von'))}</th><th class="hcs-num">${esc(T('Runde'))}</th><th class="hcs-num">${esc(T('Stadtgröße'))}</th></tr>${wrows}</table></div>`
                : `<p class="sub">${esc(T('In diesem Spiel wurde kein Weltwunder gebaut.'))}</p>`)
                + `<h4>${esc(T('Die größten Städte'))}</h4>` + (crows
                ? `<div class="hcs-scroll"><table class="tbl"><tr><th></th><th></th><th>${esc(T('Reich'))}</th><th class="hcs-num">${esc(T('Einwohner'))}</th><th>${esc(T('Wunder'))}</th></tr>${crows}</table></div>`
                : `<p class="sub">–</p>`);
        },

        // ── Chronik ────────────────────────────────────────────────────────────────
        chronicle: function (body) {
            const box = document.createElement('div');
            box.className = 'hcs-moments';
            body.appendChild(box);
            if (this.stats && this.stats.rounds && this.stats.rounds.length) STATS.moments(box, this.stats, { all: true });
            else box.innerHTML = `<h4>${esc(T('Wichtige Momente'))}</h4>`;
            let ul = box.querySelector('ul');
            if (!ul) {
                const p = box.querySelector('p'); if (p) p.remove();
                ul = document.createElement('ul');
                box.appendChild(ul);
            }
            const o = S.over;
            const names = (o.winners || [o.winner]).map(i => this.name(i)).join(T(' und '));
            const li = document.createElement('li');
            li.className = 'hce-end';
            li.innerHTML = `<span class="hcs-r">${esc(T('Runde %s', o.round || S.round))}</span><span>🏆 ${esc(o.shared ? T('%s gewinnen gemeinsam.', names) : T('%s gewinnt.', names))}${o.how ? ` <small>${esc(o.how)}</small>` : ''}</span>`;
            ul.appendChild(li);
        },

        // ── Zeitraffer ─────────────────────────────────────────────────────────────
        /** The stored match arrived (live games: 'game:record' in mp.js, a moment after the end). */
        setRecord: function (record) {
            if (!record || !record.replay || (this.record && this.record.id === record.id)) return;
            this.record = record;
            if (this.tab === 'timelapse' && $('hce-panel')) this.show('timelapse');
        },
        /** The states, one per round (the last of each round, and the end). */
        load: function () {
            if (this.frames) return Promise.resolve(this.frames);
            if (this.loading) return this.loading;
            const pick = all => all.filter((F, k) => F && F.map && (k === all.length - 1 || !all[k + 1] || all[k + 1].round !== F.round || F.over));
            // watching a replay (?replay=…): its frames are here already
            if (mp() && MP.replay && typeof REPLAY !== 'undefined' && REPLAY.doc && REPLAY.doc.frames) {
                this.frames = pick(REPLAY.doc.frames);
                return Promise.resolve(this.frames);
            }
            if (!this.record || !this.record.replay) return Promise.resolve(null);
            this.loading = fetch(`/api/games/${encodeURIComponent(this.record.id)}/replay`)
                .then(r => (r.ok ? r.json() : null))
                .then(doc => { this.frames = doc && doc.frames && doc.frames.length ? pick(doc.frames) : []; return this.frames; })
                .catch(() => { this.frames = []; return this.frames; })
                .finally(() => { this.loading = null; });
            return this.loading;
        },
        timelapse: function (body) {
            if (!this.record && mp() && MP.lastRecord && MP.lastRecord.replay) this.record = MP.lastRecord;
            const can = this.record || (mp() && MP.replay);
            // a live game is stored a moment after its end ('game:record' → setRecord)
            const soon = !can && mp() && !MP.asyncId && !MP.replay;
            body.innerHTML = `<p class="sub">${esc(can ? T('Die Wiederholung wird geladen …') : soon ? T('Das Spiel wird gespeichert …') : T('Für dieses Spiel gibt es keine Wiederholung.'))}</p>`;
            if (!can) return;
            this.load().then(frames => {
                if (this.tab !== 'timelapse' || !body.isConnected) return;
                if (!frames || !frames.length) { body.innerHTML = `<p class="sub">${esc(T('Für dieses Spiel gibt es keine Wiederholung.'))}</p>`; return; }
                body.innerHTML = `<div class="hce-tl">
                    <div class="hce-tl-bar"><button type="button" class="btn small hce-tl-play"></button>
                        <input type="range" class="hce-tl-range" min="0" max="${frames.length - 1}" step="1" aria-label="${esc(T('Runde'))}">
                        <b class="hce-tl-round"></b></div>
                    <div class="hce-tl-grid">
                        <div class="hce-tl-left"><svg class="hce-tl-map" role="img" data-no-zoom="1"></svg><svg class="hce-tl-score" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true"></svg></div>
                        <div class="hce-tl-log"><div class="hce-tl-lines"></div></div>
                    </div></div>`;
                this.tl = { at: 0, timer: null, log: this.allLog(frames), x: null };
                const range = body.querySelector('.hce-tl-range');
                range.oninput = () => { this.stop(); this.frame(+range.value); };
                body.querySelector('.hce-tl-play').onclick = () => (this.tl && this.tl.timer ? this.stop() : this.play());
                this.scoreArea(body.querySelector('.hce-tl-score'));
                this.frame(0);
                this.play();
            });
        },
        /** All log lines of the game (each state keeps only its last 600), without the dice. */
        allLog: function (frames) {
            const seen = new Map();
            for (const F of frames) for (const e of F.log || []) if (e && e.seq != null && e.c !== 'roll' && !seen.has(e.seq)) seen.set(e.seq, e);
            return [...seen.values()].sort((a, b) => a.seq - b.seq);
        },
        frame: function (k) {
            const box = $('hce-panel') && $('hce-panel').querySelector('.hce-tl');
            if (!box || !this.frames || !this.tl) return;
            k = Math.max(0, Math.min(this.frames.length - 1, k));
            this.tl.at = k;
            const F = this.frames[k];
            const svg = box.querySelector('.hce-tl-map');
            try {
                drawMap(svg, F.map, { state: F, turn: -1 });
                const w = svg.querySelector('#world');
                if (w) w.removeAttribute('id');                     // the game's own map keeps its id
                const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
                if (vb.length === 4 && vb[2] && vb[3]) svg.style.aspectRatio = `${vb[2]} / ${vb[3]}`;
            } catch (e) { svg.innerHTML = ''; }
            box.querySelector('.hce-tl-range').value = k;
            box.querySelector('.hce-tl-round').textContent = F.over ? T('Ende (Runde %s)', F.round) : T('Runde %s', F.round);
            const cur = box.querySelector('.hce-tl-cursor');
            if (cur && this.tl.x) { cur.setAttribute('x1', this.tl.x(F.round)); cur.setAttribute('x2', this.tl.x(F.round)); }
            const upto = F.logSeq != null ? F.logSeq : Infinity;
            const lines = this.tl.log.filter(e => e.seq <= upto).slice(-150);
            const log = box.querySelector('.hce-tl-lines');
            log.innerHTML = typeof logHtml === 'function' ? logHtml(lines) : lines.map(e => `<div class="logline ${esc(e.c)}">${esc(e.m)}</div>`).join('');
            log.scrollTop = log.scrollHeight;
            this.playLabel();
        },
        play: function () {
            if (!this.frames || !this.tl) return;
            if (this.tl.at >= this.frames.length - 1) this.frame(0);
            clearInterval(this.tl.timer);
            this.tl.timer = setInterval(() => {
                if (!$('hce-panel') || this.tab !== 'timelapse' || this.tl.at >= this.frames.length - 1) return this.stop();
                this.frame(this.tl.at + 1);
                if (this.tl.at >= this.frames.length - 1) this.stop();
            }, 700);
            this.playLabel();
        },
        stop: function () {
            if (this.tl && this.tl.timer) { clearInterval(this.tl.timer); this.tl.timer = null; }
            this.playLabel();
        },
        playLabel: function () {
            const b = $('hce-panel') && $('hce-panel').querySelector('.hce-tl-play');
            if (b) b.textContent = this.tl && this.tl.timer ? '⏸ ' + T('Pause') : '▶ ' + T('Abspielen');
        },
        /** The points of all empires stacked (shares) over the rounds; a line marks the round shown. */
        scoreArea: function (svg) {
            const st = this.stats;
            const rounds = st && st.rounds && st.rounds.length > 1 ? st.rounds : null;
            if (!rounds) { svg.remove(); return; }
            const ids = STATS.series(st);
            const W = 400, H = 110, r0 = rounds[0].r, r1 = rounds[rounds.length - 1].r;
            const x = r => (Math.max(r0, Math.min(r1, r)) - r0) / Math.max(1, r1 - r0) * W;
            const val = (rd, i) => Math.max(0, (rd.p[i] && rd.p[i].s) || 0);
            const tot = rounds.map(rd => ids.reduce((n, i) => n + val(rd, i), 0));
            const base = rounds.map(() => 0);
            const y = (v, k) => H - (tot[k] ? v / tot[k] * H : 0);
            let out = '';
            for (const i of ids) {
                const top = rounds.map((rd, k) => base[k] + val(rd, i));
                const pts = rounds.map((rd, k) => `${x(rd.r).toFixed(1)},${y(top[k], k).toFixed(1)}`)
                    .concat(rounds.map((rd, k) => `${x(rd.r).toFixed(1)},${y(base[k], k).toFixed(1)}`).reverse());
                out += `<polygon points="${pts.join(' ')}" fill="${esc(STATS.civ(st.players[i]).color || '#888')}"><title>${esc(STATS.short(st, i))}</title></polygon>`;
                top.forEach((v, k) => { base[k] = v; });
            }
            svg.innerHTML = out + `<line class="hce-tl-cursor" x1="0" x2="0" y1="0" y2="${H}" stroke="#fff" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
            this.tl.x = x;
        },

        /** A single-player game: the points client/solo.js recorded, as statistics. */
        soloStats: function () {
            const rec = typeof SOLO !== 'undefined' && typeof SOLO.current === 'function' ? SOLO.current() : null;
            if (!rec || !Array.isArray(rec.rounds) || !rec.rounds.length || rec.rounds[0].p.length !== S.players.length) return null;
            return {
                players: S.players.map((p, i) => ({ civ: p.civ, slot: p.slot != null ? p.slot : i, name: null, roman: p.roman || null, color: p.color || null, kind: p.kind })),
                rounds: rec.rounds, events: [],
            };
        },
    };

    // the old "📊 Statistik" button of the end screen opens this panel instead
    if (typeof STATS !== 'undefined') STATS.addToEndScreen = stats => ENDSCREEN.add(stats);

    // Single-player games (outermost wrapper: client/solo.js has stored the final point by now)
    if (typeof window.gameOver === 'function') {
        const over = window.gameOver;
        window.gameOver = function () {
            const r = over.apply(this, arguments);
            try {
                if (typeof S !== 'undefined' && S && S.over && !S.fg) {
                    if (!mp()) ENDSCREEN.add(ENDSCREEN.soloStats());
                    else if (!$('hce-panel')) ENDSCREEN.add(MP.lastStats || null);
                }
            } catch (e) { /* never in the game's way */ }
            return r;
        };
    }

    const css = document.createElement('style');
    css.textContent = `
        #hce-panel { margin: 12px 0 6px; border: 1px solid var(--rule, #c9bb98); border-radius: 10px; background: var(--paper-2, #efe6ce); }
        .hce-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; border-bottom: 1px solid var(--rule, #c9bb98); }
        .hce-tabs button { flex: 1 1 auto; font: inherit; font-size: 14px; padding: 8px 10px; border: 0; border-radius: 7px; cursor: pointer;
            background: transparent; color: var(--ink-soft, #6f6551); white-space: nowrap; }
        .hce-tabs button[aria-selected="true"] { background: var(--paper, #f5efdf); color: var(--ink, #2a2721); font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
        .hce-body { padding: 4px 12px 12px; min-height: 120px; }
        .hce-body h4 { margin: 12px 0 6px; }
        .hce-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: baseline; border: 1px solid rgba(0,0,0,.25); }
        #hce-panel td, #hce-panel th { padding: 3px 8px; text-align: left; }
        #hce-panel td:first-child, #hce-panel th:first-child { padding-left: 0; }
        #hce-panel .hcs-num { text-align: right; }
        .hce-demo td, .hce-demo th { white-space: nowrap; }
        .hce-demo td.hcs-num + .hce-who { padding-left: 4px; }
        .hce-demo td:nth-child(4), .hce-demo td:nth-child(7) { padding-left: 18px; }
        .hce-demo .hce-l { text-align: left; padding-left: 18px; }
        .hce-who { font-size: 12px; color: var(--ink-soft, #6f6551); }
        .hce-end { font-weight: 700; }
        .hce-end small { font-weight: 400; color: var(--ink-soft, #6f6551); }
        .hce-tl-bar { display: flex; align-items: center; gap: 10px; margin: 10px 0 8px; }
        .hce-tl-range { flex: 1; min-width: 0; }
        .hce-tl-round { min-width: 7em; text-align: right; font-variant-numeric: tabular-nums; }
        .hce-tl-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 10px; }
        .hce-tl-left { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .hce-tl-map { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; max-height: 56vh; background: #e4dbbe; border-radius: 8px; border: 1px solid var(--rule, #c9bb98); }
        .hce-tl-score { display: block; width: 100%; height: 64px; border-radius: 6px; background: #2a2721; }
        .hce-tl-log { position: relative; min-height: 220px; border-radius: 8px; border: 1px solid var(--rule, #c9bb98); background: var(--paper, #f5efdf); }
        .hce-tl-lines { position: absolute; inset: 0; overflow-y: auto; padding: 4px 8px; }
        @media (max-width: 720px) { .hce-tl-grid { grid-template-columns: minmax(0, 1fr); } .hce-tl-log { min-height: 0; height: 32vh; } }
        @media (max-width: 520px) { .hce-tabs button { font-size: 13px; padding: 7px 6px; } .hce-body { padding: 4px 8px 10px; } }
    `;
    document.head.appendChild(css);

    window.ENDSCREEN = ENDSCREEN;
})();
