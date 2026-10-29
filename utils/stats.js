/**
 * Statistics of a game over the rounds, for the end screen and the match history (F6).
 * Recorded by live games (sockets/game.js) and Rundenspiele (async/service.js) whenever the state
 * changes; only a new round adds a point, so calling it often is cheap.
 *
 *   stats = {
 *     players: [{ civ, slot, name, roman, color, kind }],         // by state index
 *     rounds:  [{ r, p: [{ s, c, pop, t, a, w, d,                // score, cities, population,
 *                          ys, yf, yc, rs, rf, rc }] }],         //   techs, armies, wonders, out (1),
 *                                                                //   income per round (science, food,
 *                                                                //   coins) and the stock of each
 *     events:  [{ r, k: 'wonder' | 'capture' | 'out' | 'lead', pi, from?, w? }],
 *     owners:  { cityId: owner },  wonders: [key]                // to find the events
 *   }
 *
 * A point is taken when a round begins (r = that round), so it shows the empires after everyone
 * has moved in the round before; the first one is the start. At the end of the game the last
 * round's point is taken again (final). Events carry the round they happened in.
 * `E` is the engine the game is played with.
 */

function snapshot(E, S) {
    return {
        r: S.round,
        p: S.players.map((p, i) => {
            let score = null, inc = null;
            try { score = E.victoryScore ? E.victoryScore(S, i) : null; } catch (_) { /* engine without it */ }
            try { inc = typeof E.income === 'function' && !p.dead ? E.income(S, i) : null; } catch (_) { /* engine without it */ }
            const cities = S.cities.filter(c => c.owner === i);
            const res = p.res || {};
            return {
                s: score ? score.total : null,
                c: cities.length,
                pop: cities.reduce((n, c) => n + (c.pop || 0), 0),
                t: Object.keys(p.techs || {}).filter(k => p.techs[k]).length,
                a: S.armies.filter(a => a.owner === i).length,
                w: (S.wonders || []).filter(w => w.owner === i).length,
                d: p.dead ? 1 : 0,
                ys: inc ? inc.sci : null, yf: inc ? inc.food : null, yc: inc ? inc.coins : null,
                rs: res.sci != null ? res.sci : null, rf: res.food != null ? res.food : null, rc: res.coins != null ? res.coins : null,
            };
        }),
    };
}

const leaderOf = snap => {
    let best = -1, top = -Infinity, tie = false;
    snap.p.forEach((x, i) => {
        if (x.s == null) return;
        if (x.s > top) { top = x.s; best = i; tie = false; } else if (x.s === top) tie = true;
    });
    return tie ? -1 : best;
};

/** What happened between two points: wonders, conquered cities, empires out, a new leader. */
function events(stats, E, S, prev, cur) {
    const out = [];
    const r = prev.r;                                  // it happened during that round
    for (const w of S.wonders || []) {
        if (!stats.wonders.includes(w.k)) { stats.wonders.push(w.k); out.push({ r, k: 'wonder', pi: w.owner, w: w.k }); }
    }
    for (const c of S.cities) {
        const was = stats.owners[c.id];
        if (was != null && was !== c.owner) out.push({ r, k: 'capture', pi: c.owner, from: was });
        stats.owners[c.id] = c.owner;
    }
    cur.p.forEach((x, i) => { if (x.d && !prev.p[i].d) out.push({ r, k: 'out', pi: i }); });
    const a = leaderOf(prev), b = leaderOf(cur);
    if (b !== -1 && a !== b && prev.r > 1) out.push({ r, k: 'lead', pi: b });
    return out;
}

/**
 * Record the state: a new round (or `final`) adds a point. `names[i]` is the display name of the
 * state player i (lobby / seat name; null → the client shows the nation). Returns the stats object.
 */
function record(stats, E, S, names, final) {
    if (!S || !S.players) return stats;
    if (!stats || !stats.players || stats.players.length !== S.players.length) {
        stats = {
            players: S.players.map((p, i) => ({ civ: p.civ, slot: p.slot, name: (names && names[i]) || null, roman: p.roman || null, color: p.color || null, kind: p.kind })),
            rounds: [], events: [], owners: {}, wonders: (S.wonders || []).map(w => w.k),
        };
        for (const c of S.cities) stats.owners[c.id] = c.owner;
    }
    if (names) stats.players.forEach((p, i) => { if (names[i]) p.name = names[i]; });
    const last = stats.rounds[stats.rounds.length - 1];
    if (last && last.r === S.round && !final) return stats;
    const snap = snapshot(E, S);
    if (last) stats.events.push(...events(stats, E, S, last, snap));
    if (last && last.r === S.round) stats.rounds[stats.rounds.length - 1] = snap;      // final point of the last round
    else stats.rounds.push(snap);
    if (final) stats.final = true;
    return stats;
}

/**
 * Statistics recorded before the income and stock were (or of a replayed match): add them to the
 * stored points from the replay's states – a point of round r is the first state of round r, the
 * final point the last state. Returns the statistics, or null if nothing changed.
 */
function enrich(stats, E, states) {
    if (!stats || !stats.rounds || !stats.rounds.length || !states || !states.length) return null;
    if (stats.rounds.every(rd => rd.p.every(x => 'ys' in x))) return null;
    const firstOf = {};
    states.forEach(st => { if (firstOf[st.round] == null) firstOf[st.round] = st; });
    const lastState = states[states.length - 1];
    let changed = false;
    stats.rounds.forEach((rd, k) => {
        const final = stats.final && k === stats.rounds.length - 1;
        const S = final ? lastState : firstOf[rd.r];
        if (!S || S.players.length !== rd.p.length) return;
        const snap = snapshot(E, S);
        rd.p.forEach((x, i) => {
            for (const key of ['ys', 'yf', 'yc', 'rs', 'rf', 'rc']) x[key] = snap.p[i][key];
        });
        changed = true;
    });
    return changed ? stats : null;
}

/** The part the clients and the match history need (no bookkeeping). */
function publicStats(stats) {
    if (!stats) return null;
    const { owners, wonders, ...rest } = stats;
    void owners; void wonders;
    return rest;
}

module.exports = { record, publicStats, snapshot, enrich };
