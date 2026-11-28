/**
 * Overall statistics over all finished matches (F13): win rates per nation, ability and turn
 * position, how games are won, what winners have at the end and which technologies and wonders
 * they own. Built from the facts of each match (utils/facts.js); GET /api/stats sends it
 * (routes/stats.js), client/gamestats.js draws it.
 *
 *   aggregate(rows, { seats: 'humans' | 'bots' | 'players' | 'ki' | 'all', n: 'all' | '2' … | '5+', mode, ver, user }, detail)
 *
 * `origin` (F28): 'all' (default), 'online' – live games and Rundenspiele –, or 'solo' – the
 * single-player games of logged-in players (utils/solo.js). Works with every other filter.
 *
 * `user` (an account id, F23): only that account's seats count, whatever `seats` says, and only
 * its matches – the personal statistics. "How games are won" then counts the matches it won.
 *
 * Every match counts under its game type – normal, 1 gegen 1 or Marathon, whose rules differ
 * (Marathon: drafted abilities, dearer techs; 1 gegen 1: higher economic threshold) – so each can
 * be viewed on its own (`mode`); 'all' (default) puts them together. Matches whose facts have no
 * mode (older ones from the match record) get it from what is known: drafted abilities →
 * Marathon, two empires → 1 gegen 1, otherwise normal.
 *
 * A "seat" is one empire in one match. `seats` picks which seats count (SEATS below): with
 * 'humans' only real people – KI and bots still play in those matches, they are just not counted. A shared win counts as a win for
 * every winner. `detail` (admin) adds the matches per version, the KI levels, the sources and
 * per technology the win rate of seats that could research it against those that could not
 * (`techAvail`, from the facts' av/nav – matches stored before have none until recomputed).
 */
const { Op } = require('sequelize');
const { Game } = require('../models');
const engine = require('../engine-adapter');
const Facts = require('./facts');
const GamePlayers = require('./gameplayers');

// All matches are read once and kept for ten minutes. A stored match is added to the cache in
// place (Facts.onChange with its id) – until now every finished match threw the whole cache away,
// and with bots playing around the clock the table was read again on nearly every request.
// Without an id (deletions, merges) the cache is dropped.
const CACHE_MS = 10 * 60 * 1000;
const ATTRS = ['id', 'version', 'matchDate', 'facts', 'participants'];
let cache = null;            // { at, rows }
let loading = null;          // the load in progress, shared by the requests waiting for it
let gen = 0;                 // bumped on every drop, so a load started before it is not kept

const toRow = g => ({
    id: g.id, date: g.matchDate, ver: g.version,
    solo: Array.isArray(g.participants) && g.participants.some(p => p && p.solo),     // a single-player game (F28)
    f: Facts.markAccounts(Facts.markPlayerBots(g.facts, g.participants), g.participants),
});
const usable = x => x.f && x.f.p && x.f.p.length;
const newestFirst = (a, b) => (new Date(b.date) - new Date(a.date)) || (a.id < b.id ? 1 : -1);

async function patch(gameId) {
    const g = await Game.findByPk(gameId, { attributes: ATTRS });
    if (!cache) return;
    const rest = cache.rows.filter(x => x.id !== gameId);
    if (g && g.facts) {
        const x = toRow(g);
        if (usable(x)) rest.push(x);
        rest.sort(newestFirst);
    }
    cache.rows = rest;
}

Facts.onChange(gameId => {
    if (!gameId || !cache) { cache = null; gen++; return; }
    patch(gameId).catch(() => { cache = null; gen++; });
});

/** Matches → rows, newest first. */
async function load(where) {
    const list = await Game.findAll({ where: Object.assign({ facts: { [Op.ne]: null } }, where || {}), attributes: ATTRS, order: [['matchDate', 'DESC']] });
    return list.map(toRow).filter(usable);
}

/** The facts of all matches, newest first (cached). */
async function rows() {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    if (!loading) {
        const mine = gen;
        loading = load().then(out => {
            if (mine === gen) cache = { at: Date.now(), rows: out };
            return out;
        }).finally(() => { loading = null; });
    }
    return loading;
}

/** One account's matches only (F23): from game_players, without reading all matches. */
async function rowsOf(userId) {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const ids = await GamePlayers.gameIdsOf(userId, { limit: 100000 });
    return ids.length ? load({ id: ids }) : [];
}

/** Names of nations, abilities, techs and wonders – German and English – from the current game. */
let namesCache = null;
function names() {
    if (namesCache) return namesCache;
    const get = n => { try { return engine.engineConst(n); } catch (_) { return undefined; } };
    const CIVS = get('ALL_CIVS') || get('CIVS') || [], WONDERS = get('WONDERS') || [];
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
const MODES = ['normal', 'duel', 'marathon'];
const ORIGINS = ['all', 'online', 'solo'];
/** The game type of a match (see above). */
const modeOf = f => f.mode || (f.p.some(p => Array.isArray(p.ab)) ? 'marathon' : f.n === 2 ? 'duel' : 'normal');
const avg = (sum, n) => (n ? Math.round((sum / n) * 10) / 10 : null);

/**
 * Which seats count (`seats`): 'humans' – real people only; 'bots' – player-bots (bot accounts,
 * utils/bots.js, `pb` from Facts.markPlayerBots); 'players' – both, every seat a player took;
 * 'ki' – the computer players of the game itself (its KI and bots); 'all' – every seat.
 */
const SEATS = {
    humans: p => p.kind === 'human' && !p.pb,
    bots: p => p.kind === 'human' && !!p.pb,
    players: p => p.kind === 'human',
    ki: p => p.kind !== 'human',
    all: () => true,
};

/** Ability keys of a seat: 'basis' → 'civ:basis'; drafted (Marathon) are 'civ:ability' already. */
const abilityKeys = p => (Array.isArray(p.ab) ? p.ab : [p.civ + ':' + (p.ab || 'basis')]);

function aggregate(all, q, detail) {
    q = q || {};
    const seatsMode = Object.prototype.hasOwnProperty.call(SEATS, q.seats) ? q.seats : 'humans';
    const mode = MODES.includes(q.mode) ? q.mode : 'all';
    const user = q.user ? String(q.user) : null;
    const origin = ORIGINS.includes(q.origin) ? q.origin : 'all';
    const keepGame = x => (!user || x.f.p.some(p => p.uid === user))
        && (origin === 'all' || (origin === 'solo') === !!x.solo)
        && (!q.n || q.n === 'all' || bucket(x.f.n) === q.n)
        && (mode === 'all' || modeOf(x.f) === mode)
        && (!q.ver || q.ver === 'all' || (x.f.ver || x.ver) === q.ver);
    const keepSeat = user ? p => p.uid === user : SEATS[seatsMode];
    // a match counts only if a counted seat played in it – otherwise "Nur Menschen" and
    // "Spieler-Bots" showed the same number of games (and rounds, victory types)
    const games = all.filter(x => keepGame(x) && x.f.p.some(keepSeat));

    const civs = {}, abil = {}, pos = {}, win = {}, wonders = {}, techs = {};
    const avail = {};            // admin: win rate with a tech researchable or not (facts av/nav)
    let seatsWithAvail = 0;
    const sums = { won: { n: 0 }, lost: { n: 0 } };
    const cityHist = {};
    let seats = 0, seatsWithTech = 0, wonWithTech = 0, roundsSum = 0;
    const roundsByMode = {};
    const STAT = ['c', 'pop', 's', 'a'];

    for (const g of games) {
        const f = g.f;
        roundsSum += f.r || 0;
        const m = modeOf(f);
        roundsByMode[m] = roundsByMode[m] || { games: 0, rounds: 0 };
        roundsByMode[m].games++; roundsByMode[m].rounds += f.r || 0;
        // victory types: the matches the selected group won (with `user`: that account's wins)
        if (f.win && f.p.some(p => keepSeat(p) && p.won)) win[f.win] = (win[f.win] || 0) + 1;
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
            if (Array.isArray(p.av) && Array.isArray(p.nav)) {
                seatsWithAvail++;
                const count = (list, key) => {
                    for (const k of list) {
                        const x = (avail[k] = avail[k] || { av: 0, avWon: 0, nav: 0, navWon: 0 });
                        x[key]++; x[key + 'Won'] += won;
                    }
                };
                count(p.av, 'av'); count(p.nav, 'nav');
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
        query: { seats: user ? 'user' : seatsMode, n: q.n || 'all', mode, ver: q.ver || 'all', origin },
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
        // KI and bot seats by level, in the matches of the current filter (any of their seats, not just counted ones)
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
            // per tech: seats where it was researchable (av) or rolled but not (nav), and their wins
            techAvail: { seats: seatsWithAvail, list: Object.entries(avail).map(([k, v]) => ({ k, ...v })) },
        };
    }
    return out;
}

async function overall(q, detail) {
    return aggregate(await (q && q.user ? rowsOf(String(q.user)) : rows()), q, detail);
}

module.exports = { aggregate, overall, rows, names, modeOf, SEATS: Object.keys(SEATS) };
