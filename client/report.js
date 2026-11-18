/**
 * Player report (#184): a tap on a row of the in-game player list (mp.js updatePlayerList) shows
 * that empire in this game. The name in the row still opens the account profile.
 *
 *   · current score (population + wonders + techs) and rank
 *   · progress towards each victory: economy (share of the world population against the
 *     empire's threshold), military (capitals), culture (wonder levels), science (Singularity),
 *     and a claim already made
 *   · cities, population, armies, power, techs per age, wonders, the nation's abilities
 *   · a button for the empire's tech tree (read-only, without the cost colours: no science in hand)
 *   · the trend over the rounds and the key moments – from the server (utils/stats.js trend):
 *     live via 'game:trend', Rundenspiele in their view; a finished game has its full statistics
 *
 * Only what is public: no resources in hand, no income. Engine functions are checked before use,
 * the page also runs older game versions for Rundenspiele started on them.
 * Loaded on the game page after mp.js and client/stats.js (inject.js).
 */
const REPORT = {
    pi: null,            // the empire on screen

    /** Can the report be shown with this game version? */
    ok: function () {
        return typeof victoryScore === 'function' && typeof civOf === 'function' && typeof S !== 'undefined' && !!S && !!S.players;
    },

    /* Engine helpers – some are const (not on window), so each is looked up by name here */
    E: function () {
        const f = x => (typeof x === 'function' ? x : null);
        return {
            worldPop: typeof worldPop !== 'undefined' ? f(worldPop) : null,
            popOf: typeof popOf !== 'undefined' ? f(popOf) : null,
            victoryOption: typeof victoryOption !== 'undefined' ? f(victoryOption) : null,
            capitalsTaken: typeof capitalsTaken !== 'undefined' ? f(capitalsTaken) : null,
            capitalsToWin: typeof capitalsToWin !== 'undefined' ? f(capitalsToWin) : null,
            wonderCounts: typeof wonderCounts !== 'undefined' ? f(wonderCounts) : null,
            wondersOf: typeof wondersOf !== 'undefined' ? f(wondersOf) : null,
            powerOf: typeof powerOf !== 'undefined' ? f(powerOf) : null,
            abilInfos: typeof abilInfos !== 'undefined' ? f(abilInfos) : null,
        };
    },

    /** Points of every empire still in the game, highest first. */
    ranking: function () {
        return S.players.map((p, i) => ({ i, s: victoryScore(S, i), out: !!p.dead || p.kind === 'barbar' }))
            .filter(x => !x.out).sort((a, b) => b.s.total - a.s.total);
    },

    name: function (i) {
        const sp = S.players[i];
        const lp = (MP.lobbyPlayerOf && MP.lobbyPlayerOf(sp)) || {};
        return lp.name || civOf(sp).n;
    },

    /** The report for empire i, in the game's overlay. */
    open: function (i) {
        if (!this.ok() || !S.players[i]) return;
        this.pi = i;
        const p = S.players[i], civ = civOf(p);
        const T_ = TX, E = this.E();
        const sc = victoryScore(S, i);
        const rank = this.ranking();
        const place = rank.findIndex(x => x.i === i);
        const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;

        // ── score
        let h = `<div class="mp-rep">
            <div class="mp-rep-head"><span class="mp-pl-dot" style="background:${escHtml(civ.color)}"></span>
              <b>${escHtml(this.name(i))}</b> <span class="mp-rep-civ">${escHtml(civ.n)}</span>
              ${i === MP.playerIndex ? `<small>(${T_('du')})</small>` : ''}${p.dead ? ` <span class="mp-pl-tag off">${T_('ausgeschieden')}</span>` : ''}</div>
            <div class="mp-rep-score"><span class="mp-rep-big">${sc.total}</span> <span>${T_('Punkte')}</span>
              ${place >= 0 ? `<span class="mp-rep-rank">${T_('Platz %s von %s', place + 1, rank.length)}</span>` : ''}
              <div class="mp-rep-sub">${T_('%s Bevölkerung + %s Weltwunder + %s Technologien', sc.pop, sc.wonders, sc.techs)}</div></div>`;

        // ── victory
        const claim = (S.claims || []).find(c => c.pi === i);
        const v = [];
        if (claim) v.push(`<li class="mp-rep-claim">🏁 ${T_('Sieg angemeldet: %s', escHtml(TXS(claim.how)))}</li>`);
        const { worldPop, popOf, victoryOption } = E;
        if (worldPop && popOf && victoryOption) {
            const w = worldPop(S), mine = popOf(S, i), o = victoryOption(S, p);
            const pct = w > 0 ? Math.round(mine / w * 100) : 0;
            v.push(`<li>💰 ${T_('Wirtschaft: %s von %s Weltbevölkerung (%s %), nötig mehr als %s', mine, w, pct, escHtml(o.label))}
                ${this.bar(w > 0 ? mine / w / o.frac : 0)}</li>`);
        }
        const { capitalsTaken, capitalsToWin } = E;
        if (capitalsTaken && capitalsToWin) {
            const n = capitalsTaken(p), need = capitalsToWin(S);
            v.push(`<li>⚔ ${T_('Militär: %s von %s gegnerischen Hauptstädten erobert', n, need)}${this.bar(n / need)}</li>`);
        }
        const { wonderCounts } = E;
        if (S.wo && wonderCounts) {
            const c = wonderCounts(S, i);
            v.push(`<li>🏛 ${T_('Kultur: Weltwunder der Stufe 1: %s · Stufe 2: %s · Stufe 3: %s', c[1], c[2], c[3])}</li>`);
        }
        if (typeof TECHS !== 'undefined' && typeof FIELDS !== 'undefined') {
            const fields = FIELDS.filter((_, f) => TECHS.some(t => t.f === f && t.age === 3 && p.techs[t.k])).length;
            v.push(`<li>🔬 ${p.techs.singularitaet ? T_('Forschung: Singularität erforscht')
                : T_('Forschung: %s von %s Feldern im letzten Zeitalter (für die Singularität)', fields, FIELDS.length)}${this.bar(p.techs.singularitaet ? 1 : fields / FIELDS.length)}</li>`);
        }
        h += `<h4>${T_('Auf dem Weg zum Sieg')}</h4><ul class="mp-rep-list">${v.join('')}</ul>`;

        // ── empire
        const cities = S.cities.filter(c => c.owner === i);
        const armies = (S.armies || []).filter(a => a.owner === i).length;
        const { powerOf } = E;
        const techs = Object.keys(p.techs || {}).filter(k => p.techs[k]).length;
        let perAge = '';
        if (typeof TECHS !== 'undefined' && typeof AGES !== 'undefined') {
            perAge = AGES.map((a, k) => `${escHtml(a)} ${TECHS.filter(t => t.age === k && p.techs[t.k]).length}`).join(' · ');
        }
        const { wondersOf } = E;
        const wonders = S.wo && wondersOf ? wondersOf(S, i).map(w => {
            const d = typeof WONDER_BY_KEY !== 'undefined' && WONDER_BY_KEY[w.k];
            return escHtml(d ? d.n : w.k) + (w.lvl ? ` <small>(${T_('Stufe %s', w.lvl)})</small>` : '');
        }) : [];
        h += `<h4>${T_('Reich')}</h4><table class="mp-rep-tbl">
            ${row(T_('Städte'), `${cities.length}${cities.some(c => c.cap) ? '' : ` <small>(${T_('ohne Hauptstadt')})</small>`}`)}
            ${row(T_('Bevölkerung'), cities.reduce((n, c) => n + (c.pop || 0), 0))}
            ${row(T_('Armeen'), armies)}
            ${powerOf ? row(T_('Macht'), powerOf(S, i)) : ''}
            ${row(T_('Technologien'), `${techs}${perAge ? `<div class="mp-rep-sub">${perAge}</div>` : ''}`)}
            ${S.wo ? row(T_('Weltwunder'), wonders.length ? wonders.join(', ') : '–') : ''}
          </table>`;

        // ── abilities
        const { abilInfos } = E;
        const abils = abilInfos ? abilInfos(p) : [];
        if (abils && abils.length) {
            h += `<h4>${T_('Fähigkeiten')}</h4><ul class="mp-rep-list">${abils.map(a =>
                `<li><b>${escHtml(a.n)}</b>${a.e ? ` – ${escHtml(a.e)}` : ''}</li>`).join('')}</ul>`;
        }

        if (typeof techBoardHTML === 'function') h += `<button class="btn wide" id="mp-rep-techs">${T_('Technologiebaum ansehen')}</button>`;
        h += `<div id="mp-rep-trend"><p class="sub">${T_('Lädt …')}</p></div>`;          // the chart has its own title
        h += `<h4>${T_('Wichtige Momente')}</h4><ul class="mp-rep-list" id="mp-rep-moments"><li class="sub">${T_('Lädt …')}</li></ul></div>`;

        modal(T_('Bericht: %s', this.name(i)), h);
        $('overlay').classList.add('wide');
        $('ov-body').scrollTop = 0;
        const tb = $('mp-rep-techs');
        if (tb) tb.onclick = () => this.techs(i);
        this.loadTrend(data => {
            if (this.pi !== i || !$('mp-rep-trend')) return;           // closed or another report meanwhile
            this.drawTrend(data, i);
        });
    },

    /** A progress bar, 0 … 1 (more is full). */
    bar: function (f) {
        const pct = Math.max(0, Math.min(1, f || 0)) * 100;
        return `<span class="mp-rep-bar"><span style="width:${pct.toFixed(0)}%"></span></span>`;
    },

    /** The empire's tech tree, read-only and without the cost colours. */
    techs: function (i) {
        const civ = civOf(S.players[i]);
        modal(TX('Technologien · %s', `${this.name(i)} (${civ.n})`),
            `<button class="btn small" id="mp-rep-back">← ${TX('Zurück zum Bericht')}</button>
             <div class="tech-main" style="margin-top:8px">${techBoardHTML(S, i, { plain: true, readonly: true })}</div>`);
        $('overlay').classList.add('wide');
        $('ov-body').scrollTop = 0;
        $('mp-rep-back').onclick = () => this.open(i);
    },

    /** The statistics so far: Rundenspiel view, finished live game, or ask the server. */
    loadTrend: function (cb) {
        if (MP.replay) return cb(null);                     // a replay frame: the statistics would tell the future
        if (MP.asyncId) {
            const view = typeof ASYNC !== 'undefined' && ASYNC.view;
            return cb(view ? view.trend || view.stats || null : null);
        }
        if (S.over && MP.lastStats) return cb(MP.lastStats);
        if (!MP.socket) return cb(null);
        let done = false;
        const once = v => { if (!done) { done = true; cb(v); } };
        setTimeout(() => once(null), 8000);
        MP.socket.emit('game:trend', {}, res => once(res && !res.error ? res.trend : null));
    },

    drawTrend: function (stats, i) {
        const box = $('mp-rep-trend'), list = $('mp-rep-moments');
        if (!stats || !stats.rounds || stats.rounds.length < 2 || typeof STATS === 'undefined') {
            box.innerHTML = `<p class="sub">${TX(MP.replay ? 'In der Wiederholung gibt es keinen Verlauf.' : 'Noch kein Verlauf – er beginnt mit der zweiten Runde.')}</p>`;
        } else {
            STATS.render(box, stats, { noMoments: true });
        }
        const evs = ((stats && stats.events) || []).filter(e => e.pi === i || e.from === i);
        if (!evs.length) { list.innerHTML = `<li class="sub">${TX('Noch nichts.')}</li>`; return; }
        const nm = k => escHtml(stats.players[k] && stats.players[k].name ? stats.players[k].name : this.name(k));
        const wonder = k => {
            const w = typeof WONDER_BY_KEY !== 'undefined' && WONDER_BY_KEY[k];
            return escHtml(w ? w.n : k);
        };
        list.innerHTML = evs.map(e => {
            const t = e.k === 'wonder' ? `🏛 ${TX('%s baut %s.', nm(e.pi), wonder(e.w))}`
                : e.k === 'capture' ? `⚔ ${TX('%s erobert eine Stadt von %s.', nm(e.pi), nm(e.from))}`
                : e.k === 'out' ? `☠ ${TX('%s scheidet aus.', nm(e.pi))}`
                : e.k === 'lead' ? `👑 ${TX('%s übernimmt die Führung.', nm(e.pi))}` : '';
            return t ? `<li><span class="mp-rep-r">${TX('Runde %s', e.r)}</span><span>${t}</span></li>` : '';
        }).join('');
    },
};

/* A tap on a row of the player list (the name link keeps opening the profile) */
document.addEventListener('click', ev => {
    const row = ev.target.closest && ev.target.closest('#mp-players-content [data-report]');
    if (!row || ev.target.closest('[data-profile], a, button')) return;
    REPORT.open(+row.dataset.report);
});
document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const row = ev.target.closest && ev.target.closest('#mp-players-content [data-report]');
    if (row && ev.target === row) { ev.preventDefault(); REPORT.open(+row.dataset.report); }
});

(function () {
    const st = document.createElement('style');
    st.textContent = `
        #mp-players-content [data-report] { cursor: pointer; }
        #mp-players-content [data-report]:hover { background: rgba(0,0,0,0.05); }
        #mp-players-content [data-report]:focus-visible { outline: 2px solid #702010; outline-offset: -2px; }
        .mp-rep h4 { margin: 14px 0 4px; }
        .mp-rep-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 16px; }
        .mp-rep-civ { opacity: 0.75; }
        .mp-rep-score { margin: 8px 0 2px; }
        .mp-rep-big { font-size: 28px; font-weight: 700; }
        .mp-rep-rank { margin-left: 10px; padding: 1px 8px; border-radius: 10px; background: rgba(0,0,0,0.08); font-size: 13px; }
        .mp-rep-sub { font-size: 12px; opacity: 0.75; }
        .mp-rep-list { list-style: none; padding: 0; margin: 0; font-size: 14px; }
        .mp-rep-list li { padding: 3px 0; }
        .mp-rep-list li:has(.mp-rep-r) { display: grid; grid-template-columns: 5.5em 1fr; gap: 6px; }
        .mp-rep-claim { font-weight: 700; }
        .mp-rep-bar { display: block; height: 6px; margin-top: 3px; border-radius: 3px; background: rgba(0,0,0,0.1); overflow: hidden; max-width: 320px; }
        .mp-rep-bar > span { display: block; height: 100%; background: #702010; }
        .mp-rep-tbl { border-collapse: collapse; font-size: 14px; }
        .mp-rep-tbl th { text-align: left; font-weight: 600; padding: 3px 14px 3px 0; vertical-align: top; }
        .mp-rep-tbl td { padding: 3px 0; }
        #mp-rep-techs { margin-top: 14px; }
        .mp-rep-r { opacity: 0.7; }
    `;
    document.head.appendChild(st);
})();
