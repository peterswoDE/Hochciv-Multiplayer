/**
 * Single-player games (F28): a finished game against the KI (or hotseat) that a logged-in player
 * played in the browser or offline in the Android app. client/solo.js records it while it is
 * played and sends it here (POST /api/solo/games, routes/solo.js):
 *
 *   { cid,          – the game's id on the device (each game is stored once per account)
 *     ver,          – the game version it was played with ('v106', 'v100' …)
 *     state,        – the final state, compact: round, startIdx, over, players, cities
 *                     ({ owner, pop }), armies ({ owner }), wonders ({ owner, k }), map name,
 *                     ev / wo / marathon / duel
 *     t,            – per state player { tech: round in which the device first saw it }
 *     rounds }      – per round { r, p: [{ s, c, pop, t, a, w, d }] } for the post-game chart
 *
 * The game ran on the device, so the server can't check the moves – only that the result is
 * plausible: a known version, sane numbers, a finish the engine can score. It is stored as a
 * match (games) with every participant marked `solo` (and `soloId` = cid), the match statistics
 * and the facts (utils/facts.js, src 'solo'). The player's seat carries the account – one human
 * seat only: in a hotseat game (several people on one device) nobody's seat does, it only counts
 * in the overall statistics. No MMR, no "games played", no seasons; badges of their own
 * (utils/badges.js).
 */
const { sequelize, Game } = require('../models');
const engine = require('../engine-adapter');
const Facts = require('./facts');
const { finalPoints } = require('./score');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9_-]{1,40}$/i;
const KINDS = ['human', 'ki', 'bot', 'barbar'];
const STAT_KEYS = ['s', 'c', 'pop', 't', 'a', 'w', 'd'];
const MAX_ROUND = 2000;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** The game versions this server can score: the current one and the older ones it keeps. */
const versions = () => [engine.version(), ...(engine.OLD_VERSIONS || [])].filter(Boolean);

/** A tech map { key: true } / { key: round }: known-looking keys only. */
function techKeys(o, max) {
    if (!isObj(o)) return null;
    const keys = Object.keys(o);
    if (keys.length > max || !keys.every(k => KEY_RE.test(k))) return null;
    return keys;
}

/** Checks an upload and returns { S, ver, t, rounds, cid, hotseat } or { error }. */
function check(body) {
    const b = isObj(body) ? body : {};
    const bad = why => ({ error: 'Ungültiges Einzelspiel: ' + why });
    if (typeof b.cid !== 'string' || !UUID_RE.test(b.cid)) return bad('Kennung');
    if (!versions().includes(b.ver)) return { error: 'Unbekannte Spielversion.' };
    const s = b.state;
    if (!isObj(s)) return bad('Spielstand');
    if (!int(s.round, 1, MAX_ROUND)) return bad('Runde');
    if (!Array.isArray(s.players) || s.players.length < 2 || s.players.length > 12) return bad('Reiche');
    const players = [];
    for (const p of s.players) {
        if (!isObj(p) || !KEY_RE.test(String(p.civ || '')) || !KINDS.includes(p.kind)) return bad('Reich');
        const techs = techKeys(p.techs || {}, 300);
        if (!techs) return bad('Technologien');
        const clean = {
            civ: p.civ, kind: p.kind, techs: Object.fromEntries(techs.filter(k => p.techs[k]).map(k => [k, true])),
            ability: KEY_RE.test(String(p.ability || '')) ? p.ability : 'basis',
            dead: !!p.dead,
        };
        if (Array.isArray(p.drafted)) clean.drafted = p.drafted.filter(k => typeof k === 'string' && k.length <= 80).slice(0, 4);
        if (str(p.kiLevel, 20)) clean.kiLevel = p.kiLevel;
        if (p.diff != null && (str(p.diff, 20) || int(p.diff, 0, 10))) clean.diff = p.diff;
        if (str(p.roman, 6)) clean.roman = p.roman;
        if (str(p.color, 20)) clean.color = p.color;
        if (int(p.slot, 0, 12)) clean.slot = p.slot;
        players.push(clean);
    }
    const empires = players.filter(p => p.kind !== 'barbar');
    if (empires.length < 2 || empires.length > 8) return bad('Zahl der Reiche');
    const humans = empires.filter(p => p.kind === 'human').length;
    if (!humans) return bad('kein Mensch');
    const n = players.length;
    const o = s.over;
    if (!isObj(o) || !Array.isArray(o.winners) || !o.winners.length || !o.winners.every(i => int(i, 0, n - 1) && players[i].kind !== 'barbar'))
        return bad('Spielende');
    const over = { winners: o.winners.slice(), winner: o.winners[0], how: str(o.how, 300) || '', shared: o.winners.length > 1 };
    if (o.military) over.military = true;
    if (o.resign) over.resign = true;
    const list = (a, max) => (Array.isArray(a) && a.length <= max ? a : null);
    const cities = list(s.cities, 600), armies = list(s.armies, 3000), wonders = list(s.wonders || [], 120);
    if (!cities || !armies || !wonders) return bad('Karte');
    if (!cities.every(c => isObj(c) && int(c.owner, -1, n - 1) && Number.isFinite(c.pop) && c.pop >= 0 && c.pop <= 200)) return bad('Städte');
    if (!armies.every(a => isObj(a) && int(a.owner, -1, n - 1))) return bad('Armeen');
    if (!wonders.every(w => isObj(w) && int(w.owner, -1, n - 1) && KEY_RE.test(String(w.k || '')))) return bad('Weltwunder');
    const S = {
        round: s.round, cur: int(s.cur, 0, n - 1) ? s.cur : 0, startIdx: int(s.startIdx, 0, n - 1) ? s.startIdx : 0,
        over, players,
        cities: cities.map(c => ({ owner: c.owner, pop: c.pop })),
        armies: armies.map(a => ({ owner: a.owner })),
        wonders: wonders.map(w => ({ owner: w.owner, k: w.k })),
        map: { name: isObj(s.map) ? str(s.map.name, 80) : null },
        ev: !!s.ev, wo: !!s.wo, marathon: !!s.marathon, duel: !!s.duel,
    };
    // the round each empire got each technology (as the device saw it)
    if (!Array.isArray(b.t) || b.t.length !== n) return bad('Technologie-Runden');
    const t = [];
    for (let i = 0; i < n; i++) {
        const keys = techKeys(b.t[i] || {}, 300);
        if (!keys || !keys.every(k => int(b.t[i][k], 1, S.round))) return bad('Technologie-Runden');
        t.push(Object.fromEntries(keys.filter(k => players[i].techs[k]).map(k => [k, b.t[i][k]])));
    }
    // the chart over the rounds: optional, numbers only
    const rounds = [];
    if (Array.isArray(b.rounds)) {
        if (b.rounds.length > MAX_ROUND) return bad('Verlauf');
        for (const rd of b.rounds) {
            if (!isObj(rd) || !int(rd.r, 1, S.round) || !Array.isArray(rd.p) || rd.p.length !== n) return bad('Verlauf');
            if (rounds.length && rd.r <= rounds[rounds.length - 1].r) return bad('Verlauf');
            rounds.push({
                r: rd.r,
                p: rd.p.map(x => Object.fromEntries(STAT_KEYS.filter(k => isObj(x) && Number.isFinite(x[k]) && Math.abs(x[k]) <= 1e6).map(k => [k, x[k]]))),
            });
        }
    }
    // the engine of that version must be able to score it
    const E = engine.forVersion(b.ver).getEngine();
    try {
        players.forEach((p, i) => { if (p.kind !== 'barbar') E.victoryScore(S, i); });
    } catch (err) {
        return bad('Wertung');
    }
    return { S, ver: b.ver, t, rounds, cid: b.cid, hotseat: humans > 1 };
}

/** Stores a checked upload for `user`. Returns { ok, id, duplicate? } or { error }. */
async function store(user, body) {
    const c = check(body);
    if (c.error) return c;
    const dup = await Game.findOne({
        where: sequelize.literal(`"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ soloId: c.cid }]))}::jsonb`),
        attributes: ['id'],
    });
    if (dup) return { ok: true, id: dup.id, duplicate: true };
    const { S, ver, t, rounds, cid, hotseat } = c;
    const E = engine.forVersion(ver).getEngine();
    const civName = k => { const x = (E.CIVS || []).find(v => v.k === k); return x ? x.n : k; };
    const participants = [], statsPlayers = [];
    S.players.forEach((p, i) => {
        statsPlayers.push({ civ: p.civ, slot: i, name: p.kind === 'human' && !hotseat ? user.username : null, roman: p.roman || null, color: p.color || null, kind: p.kind });
        if (p.kind === 'barbar') return;
        const isWinner = S.over.winners.includes(i);
        let scoreDetails = null;
        try { scoreDetails = E.victoryScore(S, i) || null; } catch (_) { /* checked above */ }
        const mine = p.kind === 'human' && !hotseat;
        participants.push({
            name: mine ? user.username : civName(p.civ) + (p.roman ? ' ' + p.roman : ''),
            dbUserId: mine ? user.id : null, dbUsername: mine ? user.username : null,
            civ: p.civ, ability: p.ability, drafted: p.drafted || null,
            isBot: p.kind !== 'human', isWinner, points: finalPoints(scoreDetails, isWinner), scoreDetails,
            solo: true, soloId: cid, hotseat: hotseat || undefined,
        });
    });
    // the facts: from the final state, with the rounds of the techs the device recorded
    const facts = Facts.fromStates([S], ver);
    let k = 0;
    S.players.forEach((p, i) => { if (p.kind !== 'barbar') facts.p[k++].t = t[i]; });
    facts.src = 'solo';
    const me = participants.find(p => p.dbUserId);
    const game = await Game.create({
        version: ver, durationRounds: S.round,
        winnerUsername: me && me.isWinner ? user.username : null,
        participants,
        stats: rounds.length ? { players: statsPlayers, rounds, events: [] } : null,
        facts,
    });
    Facts.changed();
    return { ok: true, id: game.id };
}

module.exports = { check, store, versions };
