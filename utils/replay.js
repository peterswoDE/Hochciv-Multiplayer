/**
 * Replays (F7): the game state after every turn, so a finished match can be watched again.
 *
 *   · Live games keep their frames in memory (session.replay), each one compressed on its own.
 *   · Rundenspiele run for days and survive restarts: their frames are rows in replay_frames.
 *   · At the end the frames become one Replay row: a Brotli-compressed JSON document
 *     { v: 1, version, names, frames: [S, …] } – consecutive states compress very well together
 *     (about 15 KB for a whole game). GET /api/games/:id/replay sends it as it is stored.
 *
 * A frame is taken when a new turn begins (round and player change) and once more at the end.
 * Replays are deleted after KEEP_DAYS; frames of Rundenspiele that were cancelled go as well.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { Op } = require('sequelize');
const { sequelize, Replay, ReplayFrame } = require('../models');
const { renameInState } = require('./rename');

const compress = promisify(zlib.brotliCompress);
const decompress = promisify(zlib.brotliDecompress);
const FAST = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } };       // a frame, during the game
const SMALL = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } };      // the whole replay, once
const KEEP_DAYS = Number(process.env.REPLAY_KEEP_DAYS) || 180;
const MAX_FRAMES = 3000;                     // a safety net – real games have a few hundred turns

const turnKey = S => `${S.round}:${S.cur}${S.over ? ':over' : ''}`;
const pack = S => zlib.brotliCompressSync(JSON.stringify(S), FAST);

/** Live game: add the state as a frame if a new turn has begun. Returns the recorder. */
function addLive(rec, S) {
    if (!S) return rec;
    rec = rec || { key: null, frames: [] };
    const key = turnKey(S);
    if (key === rec.key || rec.frames.length >= MAX_FRAMES) return rec;
    rec.key = key;
    rec.frames.push(pack(S));
    return rec;
}

/**
 * Rundenspiel: store the state as a frame row if a new turn has begun since the last one.
 * Keeps g.replay = { key, seq } (saved with the game).
 */
async function addAsync(g) {
    const S = g.state;
    if (!S || !g.id) return;
    const r = g.replay || { key: null, seq: 0 };
    const key = turnKey(S);
    if (key === r.key || r.seq >= MAX_FRAMES) return;
    await ReplayFrame.create({ gameKey: g.id, seq: r.seq, data: pack(S) });
    g.replay = { key, seq: r.seq + 1 };
}

/** Compressed frames (Buffers) → one Replay row for the match `gameId`. Returns true if stored. */
async function save(gameId, version, names, frames) {
    if (!gameId || !frames || !frames.length) return false;
    const states = await Promise.all(frames.map(f => decompress(f)));
    const doc = `{"v":1,"version":${JSON.stringify(version || null)},"names":${JSON.stringify(names || [])},"frames":[${states.map(b => b.toString('utf8')).join(',')}]}`;
    const data = await compress(Buffer.from(doc, 'utf8'), SMALL);
    await Replay.upsert({ gameId, version: version || null, frames: frames.length, data });
    return true;
}

/** Rundenspiel at its end: its frame rows (plus the final state) → a Replay; the rows go. */
async function saveAsync(g, gameId, version, names) {
    const rows = await ReplayFrame.findAll({ where: { gameKey: g.id }, order: [['seq', 'ASC']] });
    const frames = rows.map(r => r.data);
    if (g.state && (!g.replay || g.replay.key !== turnKey(g.state))) frames.push(pack(g.state));
    const ok = await save(gameId, version, names, frames);
    await ReplayFrame.destroy({ where: { gameKey: g.id } });
    return ok;
}

// ── Account deletion: the player's name goes from replays too (utils/rename.js) ─────

/** Stored replay of the match `gameId`: `from` → `to` in its names and every state. */
async function renameInReplay(gameId, from, to) {
    const r = await Replay.findByPk(gameId);
    if (!r || !from) return;
    const doc = JSON.parse((await decompress(r.data)).toString('utf8'));
    doc.names = (doc.names || []).map(n => (n === from ? to : n));
    for (const S of doc.frames || []) renameInState(S, from, to);
    r.data = await compress(Buffer.from(JSON.stringify(doc), 'utf8'), SMALL);
    await r.save();
}

/** Frames of a Rundenspiel that is still running: `from` → `to`. */
async function renameInFrames(gameKey, from, to) {
    if (!from) return;
    const rows = await ReplayFrame.findAll({ where: { gameKey } });
    for (const row of rows) {
        const S = JSON.parse(zlib.brotliDecompressSync(row.data).toString('utf8'));
        row.data = pack(renameInState(S, from, to));
        await row.save();
    }
}

/** Old replays, and frames of Rundenspiele that no longer run (cancelled, deleted). */
async function cleanup() {
    try {
        const old = await Replay.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - KEEP_DAYS * 86400000) } } });
        const [, orphans] = await sequelize.query(`DELETE FROM replay_frames WHERE "gameKey" NOT IN
            (SELECT id FROM async_games WHERE status IN ('setup', 'placement', 'draft', 'playing'))`);
        if (old || (orphans && orphans.rowCount)) console.log(`[Replay] Cleanup: ${old} old replays, ${orphans ? orphans.rowCount : 0} orphaned frames removed.`);
    } catch (err) {
        console.error('[Replay] Cleanup failed:', err);
    }
}

function startCleanup() {
    setTimeout(cleanup, 60 * 1000).unref();
    setInterval(cleanup, 6 * 60 * 60 * 1000).unref();
}

module.exports = {
    addLive, addAsync, save, saveAsync, cleanup, startCleanup, turnKey, KEEP_DAYS,
    renameInReplay, renameInFrames,
};
