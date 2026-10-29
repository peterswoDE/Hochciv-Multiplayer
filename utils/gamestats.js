/**
 * Overall statistics over all finished matches (F13): win rates per nation, ability and turn
 * position, how games are won, what winners have at the end and which technologies and wonders
 * they own. Built from the facts of each match (utils/facts.js); GET /api/stats sends it
 * (routes/stats.js), client/gamestats.js draws it.
 *
 *   aggregate(rows, { seats: 'humans' | 'all', n: 'all' | '2' … | '5+', mode, ver }, detail)
 *
 * A "seat" is one empire in one match. With seats = 'humans' only human seats count – KI and
 * bots still play in those matches, they are just not counted. A shared win counts as a win for
 * every winner. `detail` (admin) adds the matches per version, the KI levels and the sources.
 */
const { Op } = require('sequelize');
const { Game } = require('../models');
const engine = require('../engine-adapter');
const Facts = require('./facts');

const CACHE_MS = 60 * 1000;
let cache = null;            // { at, rows }
Facts.setOnChange(() => { cache = null; });

/** The facts of all matches, newest first (cached for a minute). */
async function rows() {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const list = await Game.findAll({
        where: { facts: { [Op.ne]: null } },
        attributes: ['id', 'version', 'matchDate', 'facts'],
        order: [['matchDate', 'DESC']],
    });
    const out = list.map(g => ({ id: g.id, date: g.matchDate, ver: g.version, f: g.facts }))
        .filter(x => x.f && x.f.p && x.f.p.length);
    cache = { at: Date.now(), rows: out };
    return out;
}

/** Names of nations, abilities, techs and wonders – German and English – from the current game. */
let namesCache = null;
function names() {
    if (namesCache) return namesCache;
    const get = n => { try { return engine.engineConst(n); } catch (_) { return undefined; } };
    const CIVS = get('CIVS') || [], WONDERS = get('WONDERS') || [];
    // the Singularity is a technology of its own outside TECHS
    const TECHS = (get('TECHS') || []).concat(get('SINGULARITY') ? [get('SINGULARITY')] : []);
    const EN = get('DATA_EN') || {}, ageOfCost = get('ageOfCost');
    const en = (tab, k) => (tab && tab[k] ? (Array.isArray(tab[k]) ? tab[k][0] : tab[k]) : null);
    namesCache = {
        // [de, en, colour on the map]
        civ: Object.fromEntries(CIVS.map(c => [c.k, [c.n, en(EN.civ, c.k) || c.n, c.color]])),
        abil: Object.fromEntries(CIVS.map(c => [c.k, Object.fromEntries(c.abilities.map(a =>
            [a.k, [a.n, en(EN.abil && EN.abil[c.k], a.k) || a.n]]))])),
        // [de, en, field, age] in the order of the tech tree
        tech: TECHS.map(t => [t.k, t.n, en(EN.tech, t.k) || t.n, t.f, typeof ageOfCost === 'function' ? ageOfCost(t.c) : null]),
        wonder: WONDERS.map(w => [w.k, w.n, en(EN.wonder, w.k) || w.n, w.lvl]),
        fields: [get('FIELDS') || [], (EN.fields || [])],
        ages: [get('AGES') || [], (EN.ages || [])],
    };
    return namesCache;
}

const bucket = n => (n >= 5 ? '5+' : String(n));
const avg = (sum, n) => (n ? Math.round((sum / n) * 10) / 10 : null);

/** Ability keys of a seat: 'basis' → 'civ:basis'; drafted (Marathon) are 'civ:ability' already. */
const abilityKeys = p => (Array.isArray(p.ab) ? p.ab : [p.civ + ':' + (p.ab || 'basis')]);

function aggregate(all, q, detail) {
    q = q || {};
    const seatsMode = q.seats === 'all' ? 'all' : 'humans';
    const keepGame = x => (!q.n || q.n === 'all' || bucket(x.f.n) === q.n)
        && (!q.mode || q.mode === 'all' || x.f.mode === q.mode)
        && (!q.ver || q.ver === 'all' || (x.f.ver || x.ver) === q.ver);
    const keepSeat = p => seatsMode === 'all' || p.kind === 'human';
    const games = all.filter(keepGame);

    const civs = {}, abil = {}, pos = {}, win = {}, wonders = {}, techs = {};
    const sums = { won: { n: 0 }, lost: { n: 0 } };
    const cityHist = {};
    let seats = 0, seatsWithTech = 0, wonWithTech = 0, roundsSum = 0;
    const roundsByMode = {};
    const STAT = ['c', 'pop', 's', 'a'];

    for (const g of games) {
        const f = g.f;
        roundsSum += f.r || 0;
        const m = f.mode || 'unknown';
        roundsByMode[m] = roundsByMode[m] || { games: 0, rounds: 0 };
        roundsByMode[m].games++; roundsByMode[m].rounds += f.r || 0;
        if (f.win) win[f.win] = (win[f.win] || 0) + 1;
        for (const p of f.p) {
            if (!keepSeat(p)) continue;
            seats++;
            const won = p.won ? 1 : 0;
            (civs[p.civ] = civs[p.civ] || { games: 0, wins: 0 }).games++;
            civs[p.civ].wins += won;
            for (const k of abilityKeys(p)) {
                (abil[k] = abil[k] || { games: 0, wins: 0 }).games++;
                abil[k].wins += won;
            }
            if (p.pos) {
                const b = bucket(f.n);
                const row = (pos[b] = pos[b] || {});
                (row[p.pos] = row[p.pos] || { games: 0, wins: 0 }).games++;
                row[p.pos].wins += won;
            }
            // what winners and the others have at the end
            const side = sums[won ? 'won' : 'lost'];
            side.n++;
            for (const k of STAT) if (p[k] != null) { side[k] = (side[k] || 0) + p[k]; side[k + 'n'] = (side[k + 'n'] || 0) + 1; }
            if (p.t) { side.t = (side.t || 0) + Object.keys(p.t).length; side.tn = (side.tn || 0) + 1; }
            if (p.w) { side.w = (side.w || 0) + p.w.length; side.wn = (side.wn || 0) + 1; }
            if (won && p.c != null) cityHist[p.c] = (cityHist[p.c] || 0) + 1;
            if (p.w) for (const k of p.w) {
                (wonders[k] = wonders[k] || { built: 0, wins: 0 }).built++;
                wonders[k].wins += won;
            }
            if (p.t) {
                seatsWithTech++; wonWithTech += won;
                for (const k in p.t) {
                    const x = (techs[k] = techs[k] || { had: 0, hadWon: 0, roundWon: 0 });
                    x.had++;
                    if (won) { x.hadWon++; x.roundWon += p.t[k]; }
                }
            }
        }
    }

    const side = s => ({
        seats: s.n, cities: avg(s.c, s.cn), pop: avg(s.pop, s.popn), score: avg(s.s, s.sn),
        armies: avg(s.a, s.an), techs: avg(s.t, s.tn), wonders: avg(s.w, s.wn),
    });
    const out = {
        filters: {
            versions: [...new Set(all.map(x => x.f.ver || x.ver).filter(Boolean))].sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1))),
            current: engine.version(),
        },
        query: { seats: seatsMode, n: q.n || 'all', mode: q.mode || 'all', ver: q.ver || 'all' },
        games: games.length, seats,
        rounds: { avg: avg(roundsSum, games.length), byMode: Object.fromEntries(Object.entries(roundsByMode).map(([k, v]) => [k, { games: v.games, avg: avg(v.rounds, v.games) }])) },
        victory: win,
        civs: Object.entries(civs).map(([k, v]) => ({ k, ...v })),
        abilities: Object.entries(abil).map(([k, v]) => ({ civ: k.split(':')[0], k: k.split(':')[1], ...v })),
        positions: Object.fromEntries(Object.entries(pos).map(([b, row]) => [b, Object.entries(row).map(([p, v]) => ({ pos: +p, ...v })).sort((a, b) => a.pos - b.pos)])),
        winners: { won: side(sums.won), lost: side(sums.lost), cities: cityHist },
        techs: { seats: seatsWithTech, won: wonWithTech, list: Object.entries(techs).map(([k, v]) => ({ k, had: v.had, hadWon: v.hadWon, round: avg(v.roundWon, v.hadWon) })) },
        wonders: Object.entries(wonders).map(([k, v]) => ({ k, ...v })),
        names: names(),
    };
    if (detail) {
        const byVer = {}, src = {}, lvl = {};
        for (const x of all) {
            const v = x.f.ver || x.ver || '?';
            byVer[v] = (byVer[v] || 0) + 1;
            src[x.f.src] = (src[x.f.src] || 0) + 1;
        }
        // KI and bot seats by level, in the matches of the current filter (ignores `seats`)
        for (const g of games) for (const p of g.f.p) {
            if (p.kind === 'human') continue;
            const k = p.kind + ':' + (p.lvl || '?');
            (lvl[k] = lvl[k] || { games: 0, wins: 0 }).games++;
            lvl[k].wins += p.won ? 1 : 0;
        }
        out.detail = {
            byVersion: Object.entries(byVer).map(([ver, n]) => ({ ver, games: n })),
            sources: src,
            levels: Object.entries(lvl).map(([k, v]) => ({ kind: k.split(':')[0], lvl: k.split(':')[1], ...v })),
        };
    }
    return out;
}

async function overall(q, detail) {
    return aggregate(await rows(), q, detail);
}

module.exports = { aggregate, overall, rows, names };
