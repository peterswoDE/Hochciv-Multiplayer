/**
 * Asynchronous games: persistence, locking, live updates, notifications, MMR and the
 * inactivity scheduler. The rules themselves are in ./logic.js.
 *
 * Every change runs through withGame(): one change at a time per game (queue), everyone who has
 * the game open gets the new view over Socket.IO, and the game is saved: once per change (the
 * automatic bot / KI turns it starts included), written ASYNC_FLUSH_MS later so a burst of moves
 * costs one write – at once when it ends or when something the game list selects by changes.
 * The cached copy is authoritative; flushAll() writes what is left at shutdown.
 */
const { Op } = require('sequelize');
const crypto = require('crypto');
const { AsyncGame, User, sequelize } = require('../models');
const L = require('./logic');
const engine = require('../engine-adapter');
const { notify } = require('../utils/notify');
const Rating = require('../utils/rating');
const { finalPoints } = require('../utils/score');
const chatLib = require('../utils/chat');
const reports = require('../utils/reports');
const terms = require('../utils/terms');
const Bots = require('../utils/bots');
const Limits = require('../utils/account-limits');

const ENDED = ['finished', 'cancelled'];
const Stats = require('../utils/stats');
const Facts = require('../utils/facts');
const Replay = require('../utils/replay');
const Summary = require('../utils/summary');
const Scenes = require('../utils/scenes');
const Discord = require('../utils/discord');
const BotFilter = require('../utils/botfilter');

const DAY = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = Number(process.env.ASYNC_TIMEOUT_MS) || 7 * DAY;
const ENDED_LIST_DAYS = 14;        // ended Rundenspiele stay in the game list until opened, at most this long
const REMINDER_MS = Number(process.env.ASYNC_REMINDER_MS) || 5 * DAY;
const SWEEP_MS = Number(process.env.ASYNC_SWEEP_MS) || 10 * 60 * 1000;
/* The host's time per turn (F19, config.turnDays: 1, 3 or 7) scales both: 7 days are the base,
   the reminder comes at 5/7 of the time. Finding players (setup) always has the full 7 days. */
const daysOf = g => g.status === 'setup' ? 7 : (g.config.turnDays || 7);
const timeoutOf = g => TIMEOUT_MS * daysOf(g) / 7;
const reminderOf = g => REMINDER_MS * daysOf(g) / 7;
/** "3 Tage" / "17 Stunden" for the e-mails. */
function duration(ms) {
    const days = Math.round(ms / DAY);
    if (days >= 1) return days === 1 ? '1 Tag' : `${days} Tage`;
    const hours = Math.max(1, Math.round(ms / 3600000));
    return hours === 1 ? '1 Stunde' : `${hours} Stunden`;
}
const ACTIVE = ['setup', 'civdraft', 'placement', 'draft', 'playing'];
const MAX_ACTIVE_PER_USER = 30;
const MAX_PENDING_INVITES = 6;
const INVITE_AGAIN_MS = 24 * 60 * 60 * 1000;     // a declined invitation is sent again at most daily

const metrics = require('../utils/metrics').async;
/* Saving (P1.3): a move marks the game dirty; the row is written FLUSH_MS later, so a burst of
   moves costs one write. The end of a game and whatever the game list selects by (listKey) are
   written at once. 0 = write every save at once (the old behaviour). */
const FLUSH_MS = process.env.ASYNC_FLUSH_MS !== undefined && process.env.ASYNC_FLUSH_MS !== '' ? Number(process.env.ASYNC_FLUSH_MS) : 2000;
const MAX_CACHED = Number(process.env.ASYNC_MAX_CACHED) || 200;    // games kept in memory (LRU)
const IDLE_MS = 30 * 60 * 1000;                                     // … and dropped after this long unused
const STEP_BROADCAST_MS = 500;       // while bots / the KI play several turns: a view at most this often

const HOLD_MS = Number(process.env.ASYNC_HOLD_MS) || 60 * 1000;    // statistics, marks, scenes: written at the latest this long after a change

let io = null;
/* id → { g, queue, touched, busy, dirty, timer, writing, pending, listKey, written, held, holdTimer, logSplit, logHead }
   queue: the game's changes one after another; writing: its row writes in order;
   written: a hash of every JSON column as last written, and the turn then (flush);
   logSplit: the row's `state` is without its log, which is in async_log up to logHead { seq, hash } */
const cache = new Map();
const room = id => `async:${id}`;
let closing = false;                 // shutting down (flushAll): every save is written at once
const newEntry = g => ({ g, queue: Promise.resolve(), touched: Date.now(), busy: 0, dirty: false, timer: null, writing: Promise.resolve(), pending: 0, listKey: null,
    written: {}, held: false, holdTimer: null, force: false, logSplit: false, logHead: null });

// ── Loading and saving ───────────────────────────────────────────────────────

function fromRow(row) {
    const d = row.data || {};
    return {
        id: row.id, joinCode: row.joinCode, hostUserId: row.hostUserId, status: row.status,
        engine: d.engine || null,          // null: started before versions were recorded = v83
        config: d.config, seats: d.seats || [], invites: d.invites || [], pre: d.pre || null,
        // the chat is in async_chat (getEntry loads it); statistics, marks and scenes have their own columns
        hold: !!d.hold, result: d.result || null, meta: d.meta || {}, chat: [], chatMutes: d.chatMutes || {}, stats: row.stats || null,
        replay: d.replay || null, marks: row.marks || null, scenes: row.scenes || null,
        endSeen: d.endSeen || [],          // players who opened the game after it ended (the game list keeps it until then)
        state: row.state || null,
        waitSince: row.waitSince ? new Date(row.waitSince).getTime() : Date.now(),
        reminded: !!row.reminded,
    };
}

/** The names of the winners of an ended game ([] while it runs). */
function winnersOf(g) {
    const S = g.state;
    return S && S.over ? (S.over.winners || []).map(i => S.players[i] && g.seats[S.players[i].slot])
        .filter(Boolean).map(s => s.name || s.civ) : [];
}

function rowFields(g) {
    const w = L.waitingOn(g);
    const S = g.state;
    g.meta = { waitingFor: w.label, winners: winnersOf(g) };
    return {
        status: g.status,
        isPublic: !!g.config.isPublic,
        arenaLadder: !!g.config.arenaLadder,
        participantIds: [...new Set(g.seats.map(s => s.userId).filter(Boolean))],
        invitedIds: g.invites.filter(i => i.status === 'pending').map(i => i.userId),
        waitingIds: w.userIds,
        waitSince: new Date(g.waitSince),
        reminded: !!g.reminded,
        round: S ? S.round : 0,
        data: { engine: g.engine || null, config: g.config, seats: g.seats, invites: g.invites, pre: g.pre, hold: g.hold, result: g.result, meta: g.meta, chatMutes: g.chatMutes || {}, replay: g.replay || null, endSeen: g.endSeen || [] },
        state: S,
        stats: g.stats || null,
        marks: g.marks || null,
        scenes: g.status === 'playing' ? g.scenes || null : null,
    };
}

/** Something that changes whenever the game moves on – restarts the 7-day clock. */
function waitKey(g) {
    const w = L.waitingOn(g);
    const S = g.state;
    return JSON.stringify([g.status, w.userIds, w.label, S && S.cur, S && S.round, g.hold,
        g.pre && g.pre.draft && g.pre.draft.D.at, g.pre && g.pre.civdraft && g.pre.civdraft.at]);
}

async function getEntry(id) {
    let e = cache.get(id);
    if (!e) {
        e = newEntry(null);
        e.loading = true;
        e.queue = AsyncGame.findByPk(id).then(async row => {
            const g = row ? fromRow(row) : null;
            if (g && !ENDED.includes(g.status)) g.chat = await loadChat(id);
            // a state written without its log: the log is in async_log
            if (g && g.state && !Array.isArray(g.state.log)) {
                g.state.log = await loadLog(id);
                e.logSplit = true;
                e.logHead = headOf(g.state.log);
            }
            e.g = g;
            if (g) wrote(e);
        }).finally(() => { e.loading = false; });
        cache.set(id, e);
        trimCache(id);
        await e.queue.catch(() => cache.delete(id));
    } else {
        cache.delete(id); cache.set(id, e);          // most recently used last (trimCache)
        await e.queue.catch(() => {});
    }
    e.touched = Date.now();
    return e;
}

/** A game just created (AsyncGame.create of its rowFields): cached as written. */
function cacheCreated(g) {
    const e = newEntry(g);
    wrote(e);
    cache.set(g.id, e);
    trimCache(g.id);
}

/** Can the game leave memory? Not while it runs, has unwritten changes or somebody has it open. */
function evictable(id, e) {
    if (e.busy || e.dirty || e.timer || e.pending || e.loading || e.held) return false;
    const rooms = io && io.sockets && io.sockets.adapter && io.sockets.adapter.rooms;
    return !(rooms && rooms.get(room(id)) && rooms.get(room(id)).size);
}

/** At most MAX_CACHED games in memory: the least recently used ones that may go are dropped. */
function trimCache(keep) {
    if (cache.size <= MAX_CACHED) return;
    for (const [id, e] of cache) {
        if (cache.size <= MAX_CACHED) break;
        if (id !== keep && evictable(id, e)) cache.delete(id);
    }
}

/** What the game list and the scheduler select by: a change is written at once. */
const listKey = f => JSON.stringify([f.status, f.isPublic, f.participantIds, f.invitedIds, f.waitingIds]);

const UPDATE_CORE = `UPDATE async_games SET status = $2, "isPublic" = $3, "participantIds" = $4::uuid[],
    "invitedIds" = $5::uuid[], "waitingIds" = $6::uuid[], "waitSince" = $7, reminded = $8, round = $9, "updatedAt" = now()`;
const JSON_COLUMNS = ['data', 'state', 'stats', 'marks', 'scenes'];
const ONCE_PER_TURN = new Set(['stats', 'marks', 'scenes']);   // written when the turn changes (or HOLD_MS later)
const DROP_CHAT = 'gone AS (DELETE FROM async_chat WHERE "gameId" = $1)';

const hashOf = text => (text == null ? '-' : crypto.createHash('sha1').update(text).digest('base64'));
const turnOf = g => JSON.stringify([g.status, g.state && g.state.cur, g.state && g.state.round]);
/* `split`: the state without its log (splitLog) */
const jsonOf = (f, split) => Object.fromEntries(JSON_COLUMNS.map(c => [c, f[c] == null ? null
    : JSON.stringify(c === 'state' && split ? withoutLog(f[c]) : f[c])]));

/* ── The engine's log in async_log (migration 0012) ──────────────────────────
   S.log is most of the engine state: the engine appends to it (seq one up per entry) and keeps
   the last 600. While a game runs, `state` is written without it and async_log gets the entries
   that are new since the last write; the ones the engine dropped go. An ended game has its log
   back in `state`. A log the engine did not number throughout stays in `state`. */
const withoutLog = S => { const { log, ...rest } = S; return rest; };
function splitLog(S) {
    const log = S && S.log;
    if (!Array.isArray(log)) return null;
    for (let i = 0; i < log.length; i++) {
        if (!log[i] || !Number.isInteger(log[i].seq) || (i && log[i].seq !== log[i - 1].seq + 1)) return null;
    }
    return log;
}
const headOf = log => (log.length ? { seq: log[log.length - 1].seq, hash: hashOf(JSON.stringify(log[log.length - 1])) } : null);
/* The rows outside the log's seq range ($n … $n+1) go, the new entries ($n+2) come in. */
const logCtes = n => [
    `log_gone AS (DELETE FROM async_log WHERE "gameId" = $1 AND (seq < $${n} OR seq > $${n + 1}))`,
    `log_new AS (INSERT INTO async_log ("gameId", seq, entry) SELECT $1, (x->>'seq')::int, x FROM jsonb_array_elements($${n + 2}::jsonb) x
        ON CONFLICT ("gameId", seq) DO UPDATE SET entry = EXCLUDED.entry)`,
];
const LOG_DROP = 'log_gone AS (DELETE FROM async_log WHERE "gameId" = $1)';

async function loadLog(gameId) {
    const rows = await sequelize.query('SELECT entry FROM async_log WHERE "gameId" = $1 ORDER BY seq DESC LIMIT 600',
        { bind: [gameId], type: sequelize.QueryTypes.SELECT });
    return rows.map(r => r.entry).reverse();
}

/** The game as it is in the database (just loaded or created): what flush compares with. */
function wrote(e) {
    const json = jsonOf(rowFields(e.g), e.logSplit);
    e.written = Object.fromEntries(JSON_COLUMNS.map(c => [c, hashOf(json[c])]));
    e.written.turn = turnOf(e.g);
    e.listKey = listKey(rowFields(e.g));
}

/**
 * Write the row of the cached game now – only the columns that changed (scalability P1.4): the
 * core columns always, `data` and `state` when they changed, statistics, marks and scenes once per
 * turn (when the player or the round changed, the game ended, at shutdown, at the latest HOLD_MS
 * after a change). The row is serialised right away (a later change can't slip into it); the
 * writes of a game go out one after another (e.writing). On failure the game stays dirty and is
 * written again later, all of it.
 */
function flush(e, reason) {
    clearTimeout(e.timer);
    e.timer = null;
    if ((!e.dirty && !e.held) || !e.g) return e.writing;
    const g = e.g;
    const f = rowFields(g);
    const w = e.written;
    const turn = turnOf(g);
    const ended = ENDED.includes(g.status);
    const log = ended ? null : splitLog(g.state);
    const json = jsonOf(f, !!log);
    const due = e.force || closing || ended || w.turn !== turn;
    const bind = [g.id, f.status, f.isPublic, f.participantIds, f.invitedIds, f.waitingIds, f.waitSince, f.reminded, f.round];
    const sets = [];
    let bytes = 0, held = false;
    const next = { ...w };
    for (const c of JSON_COLUMNS) {
        const h = hashOf(json[c]);
        if (h === w[c]) continue;
        if (ONCE_PER_TURN.has(c) && !due) { held = true; continue; }
        bind.push(json[c]);
        sets.push(`${c} = $${bind.length}::jsonb`);
        next[c] = h;
        bytes += json[c] ? Buffer.byteLength(json[c]) : 0;
    }
    if (due) { next.turn = turn; e.force = false; }
    // the chat ends with the game (in the same statement); reports keep their own copy (utils/reports.js)
    const dropChat = ended && !w.chatGone;
    if (dropChat) next.chatGone = true;
    const ctes = dropChat ? [DROP_CHAT] : [];
    // the state written: its log as new rows of async_log (split), or back in it
    const stateSet = sets.some(s => s.startsWith('state '));
    let logSplit = e.logSplit, logHead = e.logHead;
    if (stateSet && log) {
        const at = logSplit && logHead ? log.findIndex(x => x.seq === logHead.seq) : -1;
        const fresh = at >= 0 && hashOf(JSON.stringify(log[at])) === logHead.hash ? log.slice(at + 1) : log;
        const text = JSON.stringify(fresh);
        bind.push(log.length ? log[0].seq : 1, log.length ? log[log.length - 1].seq : 0, text);
        ctes.push(...logCtes(bind.length - 2));
        bytes += fresh.length ? Buffer.byteLength(text) : 0;
        logSplit = true;
        logHead = headOf(log);
    } else if (stateSet) {
        if (logSplit) ctes.push(LOG_DROP);
        logSplit = false;
        logHead = null;
    }
    const sql = (ctes.length ? 'WITH ' + ctes.join(', ') + ' ' : '') + UPDATE_CORE + sets.map(s => ', ' + s).join('') + ' WHERE id = $1';
    e.written = next;
    e.logSplit = logSplit;
    e.logHead = logHead;
    e.held = held || (!due && e.held);
    if (!e.held) { clearTimeout(e.holdTimer); e.holdTimer = null; }
    else if (!e.holdTimer) e.holdTimer = setTimeout(() => holdOver(e), HOLD_MS);
    e.dirty = false;
    e.listKey = listKey(f);
    e.pending++;
    const run = e.writing.then(async () => {
        const end = metrics.save.startTimer();
        await sequelize.query(sql, { bind });
        end();
        metrics.writes.inc({ reason });
        metrics.saveBytes.observe(bytes);
    });
    e.writing = run.catch(() => {}).finally(() => { e.pending--; });
    return run.catch(err => {
        e.dirty = true;
        e.written = {};                 // not known what is in the row: the next write writes all of it
        e.logSplit = false;             // … the log too
        e.logHead = null;
        e.listKey = null;               // … and at once
        if (!e.timer) e.timer = setTimeout(() => flushLater(e, 'retry'), Math.max(FLUSH_MS, 1000));
        throw err;
    });
}

/** Statistics, marks or scenes waited HOLD_MS for the turn to change: they are written now. */
function holdOver(e) {
    e.holdTimer = null;
    if (!e.held) return;
    e.force = true;
    e.dirty = true;
    if (!e.timer) flushLater(e, 'held');
}

/** The timer of a dirty game: write it in the game's queue, so it never cuts into a change. */
function flushLater(e, reason = 'delayed') {
    e.timer = null;
    if (!e.dirty) return;
    e.busy++;
    const run = e.queue.then(() => flush(e, reason));
    e.queue = run.catch(err => console.error(`[Async] Saving ${e.g && e.g.id} failed:`, err)).finally(() => { e.busy--; });
}

/**
 * Save the game: at once when it ended, when something the game list selects by changed
 * (listKey) or with `now`; else FLUSH_MS later (flushLater). `defer`: only mark it unless it ended –
 * a save later in the same change decides (withGame before the KI turns).
 */
async function save(g, { now = false, defer = false } = {}) {
    // the chat ends with the game (flush deletes its rows); reports keep their own copy (utils/reports.js)
    if (ENDED.includes(g.status)) Object.assign(g, { chat: [], chatMutes: {} });
    metrics.saveRequests.inc();
    let e = cache.get(g.id);
    if (!e || e.g !== g) e = newEntry(g);          // not (or no longer) the cached copy: write it as it is
    listTouched(g, e);
    e.dirty = true;
    const atOnce = closing || ENDED.includes(g.status) || !defer && (now || FLUSH_MS <= 0 || cache.get(g.id) !== e
        || listKey(rowFields(g)) !== e.listKey);
    if (atOnce) return flush(e, 'immediate');
    if (!e.timer) e.timer = setTimeout(() => flushLater(e), FLUSH_MS);
}

/** Write every game with unwritten changes (shutdown) and wait for the writes under way. */
async function flushAll() {
    closing = true;
    const runs = [];
    for (const e of cache.values()) {
        runs.push(e.dirty || e.held ? flush(e, 'shutdown').catch(err => console.error(`[Async] Saving ${e.g && e.g.id} at shutdown failed:`, err)) : e.writing);
    }
    await Promise.all(runs);
}

metrics.cacheGauge(() => {
    let dirty = 0;
    for (const e of cache.values()) if (e.dirty) dirty++;
    return { cached: cache.size, dirty };
});

/** At the start of the server: the chats of games that ended before they were deleted with the game. */
async function purgeEndedChats() {
    const [, meta] = await sequelize.query(
        `UPDATE async_games SET data = data - 'chat' - 'chatMutes'
         WHERE status IN (:ended) AND (jsonb_exists(data, 'chat') OR jsonb_exists(data, 'chatMutes'))`,
        { replacements: { ended: ENDED } });
    const [, gone] = await sequelize.query(
        `DELETE FROM async_chat c USING async_games g WHERE c."gameId" = g.id AND g.status IN (:ended)`,
        { replacements: { ended: ENDED } });
    // the log of an ended game is back in its state (flush)
    await sequelize.query(
        `DELETE FROM async_log l USING async_games g WHERE l."gameId" = g.id AND g.status IN (:ended) AND jsonb_exists(g.state, 'log')`,
        { replacements: { ended: ENDED } });
    const n = (meta && meta.rowCount) || 0, m = (gone && gone.rowCount) || 0;
    if (n || m) console.log(`[Async] Deleted the chats of ended games (${n} games, ${m} messages).`);
}

// ── The chat of a game: one row per message in async_chat (scalability P1.4) ─────

async function loadChat(gameId) {
    const rows = await sequelize.query('SELECT msg FROM async_chat WHERE "gameId" = $1 ORDER BY id',
        { bind: [gameId], type: sequelize.QueryTypes.SELECT });
    return rows.map(r => r.msg).slice(-chatLib.ASYNC_HISTORY);
}

/** A new message; beyond the last ASYNC_HISTORY the oldest rows go. */
async function storeChat(gameId, msgs, trim) {
    await sequelize.query(`INSERT INTO async_chat ("gameId", msg)
        SELECT $1, m FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(m, n) ORDER BY n`,
    { bind: [gameId, JSON.stringify(msgs)] });
    if (trim) {
        await sequelize.query(`DELETE FROM async_chat WHERE "gameId" = $1 AND id <= (SELECT id FROM async_chat
            WHERE "gameId" = $1 ORDER BY id DESC OFFSET $2 LIMIT 1)`, { bind: [gameId, chatLib.ASYNC_HISTORY] });
    }
}

/** Only the messages still in memory stay (logic.removeUser took some out). */
async function syncChat(g) {
    await sequelize.query(`DELETE FROM async_chat WHERE "gameId" = $1 AND NOT (msg->>'id' = ANY($2::text[]))`,
        { bind: [g.id, (g.chat || []).map(m => String(m.id))] });
}

/**
 * Run `fn(g)` exclusively for this game, then save, drive automatic turns, broadcast and
 * notify. Returns fn's result. Throws 'not found' as { error }.
 */
async function withGame(id, fn, label = 'other', by = null) {
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    e.busy++;
    const run = e.queue.then(async () => {
        const end = metrics.action.startTimer({ action: label });
        const g = e.g;
        const before = { key: waitKey(g), waiting: L.waitingOn(g).userIds, status: g.status };
        const res = await fn(g);
        if (res && res.error) return res;
        const playing = g.status === 'playing';
        // the KI turns below save the game once at their end: here it is only marked
        await settle(g, before, { defer: playing });
        // Bots, KI, released holds: the statistics after every automatic turn, a view at most
        // every STEP_BROADCAST_MS, saved once when they are through (P1.2)
        if (playing) {
            const key = waitKey(g);
            let steps = 0, sent = Date.now();
            await L.drive(g, async () => {
                steps++;
                if (g.state && g.state.over) return;       // the end: settle below
                await recordStats(g);
                if (Date.now() - sent >= STEP_BROADCAST_MS) { sent = Date.now(); await broadcast(g); }
            });
            if (steps || g.status !== 'playing' || waitKey(g) !== key) await settle(g, before);
            else await save(g);
        }
        // a bot pays the engine time of its move – the KI turns it set off included (P1.11)
        const secs = end();
        if (by) Limits.spend(by, secs);
        return res;
    });
    e.queue = run.catch(() => {}).finally(() => { e.busy--; });
    return run;
}

/** Display names by state index: the players (also after a KI takeover), null for KI seats. */
function stateNames(g) {
    return g.state.players.map(sp => {
        const seat = g.seats[sp.slot];
        return seat && (seat.kind === 'human' || seat.replaced) ? seat.name : null;
    });
}

/**
 * Statistics over the rounds (utils/stats.js): a new round adds a point, the end the final one.
 * The replay keeps a frame per turn until the game ends (utils/replay.js).
 */
async function recordStats(g) {
    if (!g.state || !['playing', 'finished'].includes(g.status)) return;
    if (g.stats && g.stats.final) return;
    try {
        g.stats = Stats.record(g.stats, L.ENG(g).getEngine(), g.state, stateNames(g), g.status === 'finished');
    } catch (err) {
        console.error(`[Async] Statistics failed for ${g.id}:`, err);
    }
    if (g.status === 'playing' || !g.result) {           // … and the final frame, before the match is booked
        try {
            await Replay.addAsync(g);
        } catch (err) {
            console.error(`[Async] Replay frame failed for ${g.id}:`, err);
        }
    }
    if (g.status === 'playing') {
        try {
            g.marks = Summary.track(g.marks, L.ENG(g).getEngine(), g.state);       // "since your last turn"
            Scenes.trim(g.scenes, g.marks, g.state);                               // … and its scenes
        } catch (err) {
            console.error(`[Async] Summary tracking failed for ${g.id}:`, err);
        }
    }
}

/** Save + broadcast; with `before`, also restart the clock and send notifications. */
async function settle(g, before, { defer = false } = {}) {
    // the game just ended (a move or an automatic turn): finished right away, so the first view
    // of the end already carries the statistics and the result – not only the next one
    if (g.status === 'playing' && g.state && g.state.over) g.status = 'finished';
    await recordStats(g);
    if (before) {
        const key = waitKey(g);
        if (key !== before.key) { g.waitSince = Date.now(); g.reminded = false; }
    }
    if (g.status === 'finished' && !g.result) {
        await processResult(g);
        // who has the game open sees the end right now – the game list does not keep it for them
        g.endSeen = g.endSeen || [];
        for (const u of await viewers(g.id)) {
            if (g.seats.some(s => s.userId === u) && !g.endSeen.includes(u)) g.endSeen.push(u);
        }
    }
    await save(g, { defer });
    const viewing = await broadcast(g);
    if (!before) return;
    const now = L.waitingOn(g).userIds;
    const fresh = now.filter(u => !before.waiting.includes(u));
    before.waiting = now;                 // settle runs twice per change – notify once
    before.key = waitKey(g);
    if (fresh.length) {
        const absent = fresh.filter(u => !viewing.has(u));
        const text = g.status === 'placement' ? 'Lege dein Startplättchen in deinem Rundenspiel.'
            : g.status === 'draft' ? 'Du bist im Draft deines Rundenspiels dran.'
            : g.status === 'civdraft' ? 'Du wählst jetzt deine Nation in deinem Rundenspiel.'
                : `Du bist in deinem Rundenspiel am Zug (Runde ${g.state ? g.state.round : 1}).`;
        // each with what happened since their last turn (utils/summary.js)
        for (const u of absent) notify([u], { type: 'turn', gameId: g.id, subject: 'Du bist am Zug', text, ...L.summaryText(g, u) });
    }
    if (before.status !== g.status && (g.status === 'finished' || g.status === 'cancelled')) {
        const ids = g.seats.map(s => s.userId).filter(Boolean);
        before.status = g.status;
        notify(ids, {
            type: 'finished', gameId: g.id,
            subject: g.status === 'finished' ? 'Rundenspiel beendet' : 'Rundenspiel abgebrochen',
            text: g.status === 'finished'
                ? `Das Rundenspiel ist vorbei. Gewonnen: ${(g.meta.winners || []).join(', ') || '—'}.`
                : g.cancelReason || 'Der Host hat das Rundenspiel abgebrochen.',
        });
    }
}

// ── Live view (Socket.IO) ─────────────────────────────────────────────────────

async function viewers(id) {
    if (!io) return new Set();
    const sockets = await io.in(room(id)).fetchSockets();
    return new Set(sockets.map(s => s.data.userId).filter(Boolean));
}

let measured = 0;
/**
 * Send everyone who has the game open their view. L.view copies what it hands out and emit
 * encodes at once, so the view is sent as it is (no extra JSON copy). Returns the viewers.
 */
async function broadcast(g) {
    const who = new Set();
    if (!io) return who;
    const sockets = await io.in(room(g.id)).fetchSockets();
    const views = new Map();
    for (const s of sockets) {
        const uid = s.data.userId;
        if (uid) who.add(uid);
        let v = views.get(uid);
        if (!v) {
            v = L.view(g, uid);
            views.set(uid, v);
            if (++measured % 20 === 0) metrics.broadcastBytes.observe(Buffer.byteLength(JSON.stringify(v)));
        }
        s.emit('async:update', v);
        metrics.broadcasts.inc();
    }
    return who;
}

// ── Results and MMR ───────────────────────────────────────────────────────────

async function processResult(g) {
    const S = g.state;
    const E = L.ENG(g).getEngine();      // score with the rules the game was played with
    const over = S.over || {};
    const ranked = !!g.config.ranked;
    try {
        const players = g.seats.map(seat => {
            const i = L.stateIndex(g, seat.slot);
            const isWinner = Array.isArray(over.winners) && over.winners.includes(i);
            let scoreDetails = null;
            try { scoreDetails = E.victoryScore(S, i) || null; } catch (_) { }
            const points = finalPoints(scoreDetails, isWinner);   // × WIN_FACTOR for the winner
            const active = seat.userId && !seat.replaced;
            return {
                dbUserId: active ? seat.userId : null,
                dbUsername: active ? seat.name : null,
                name: seat.name || seat.civ, civ: seat.civ, ability: seat.ability, drafted: seat.drafted || null,
                isBot: seat.kind === 'bot' || (seat.kind === 'ki' && !seat.replaced), replaced: !!seat.replaced, replacedUserId: seat.replaced ? seat.userId : null,
                botAccount: !!seat.botAccount && !seat.replaced,
                penalty: seat.penalty || 0, points, scoreDetails,
                isWinner,
                async: true,
            };
        });
        // MMR, games played, the match record and the result marker of the game row in one
        // transaction (utils/rating.js, R-18): a restart before save(g) finds the result and
        // doesn't count the game twice
        let result;
        const game = await Rating.book({
            players,
            ranked,
            record: ps => ({
                version: E.APP_VERSION || 'Unknown',
                durationRounds: S.round,
                winnerUsername: ps.find(p => p.isWinner && p.dbUsername)?.dbUsername || null,
                participants: ps,
                stats: Stats.publicStats(g.stats),
            }),
            after: async (created, transaction) => {
                result = { winners: players.filter(p => p.isWinner).map(p => p.name), ranked, players: players.map(p => ({ name: p.name, points: p.points, mmrShift: p.mmrShift || 0, replaced: p.replaced })),
                    gameId: created.id, replay: false };
                await sequelize.query(`UPDATE async_games SET data = jsonb_set(data, '{result}', CAST(:result AS jsonb)) WHERE id = :id`,
                    { replacements: { result: JSON.stringify(result), id: g.id }, transaction });
                if (g.config.arenaLadder) await require('./ladder').book(g, result.winners, transaction);   // the arena standings
            },
        });
        g.result = result;
        let replay = false;
        try {
            replay = await Replay.saveAsync(g, game.id, E.APP_VERSION || null, stateNames(g));
        } catch (err) {
            console.error(`[Async] Replay failed for ${g.id}:`, err);
        }
        Facts.storeLater(game.id);                     // overall statistics (utils/facts.js), from the replay
        if (g.config.challenge) {
            try { await require('../utils/challenge').recordResult(g, players, game.id); }
            catch (err) { console.error(`[Challenge] Result of ${g.id} failed:`, err); }
        }
        g.result = { ...result, replay };
        if (g.config.arenaLadder) require('./ladder').changed();
    } catch (err) {
        console.error(`[Async] Result processing failed for ${g.id}:`, err);
        // nothing was booked: the sweep tries again (retryResults)
        if (!g.result || g.result.error) g.result = { error: true, tries: ((g.result && g.result.tries) || 0) + 1 };
    }
}

/** Finished games whose result failed (processResult): evaluated again, up to RESULT_TRIES times. */
const RESULT_TRIES = 5;
async function retryResults() {
    const rows = await AsyncGame.findAll({
        where: {
            status: 'finished',
            [Op.and]: sequelize.literal(`(data->'result'->>'error') = 'true' AND COALESCE((data->'result'->>'tries')::int, 1) < ${RESULT_TRIES}`),
        },
        attributes: ['id'],
    });
    for (const row of rows) {
        await withGame(row.id, async g => {
            if (g.status !== 'finished' || !g.result || !g.result.error) return;
            if (!g.result.tries) g.result.tries = 1;
            await processResult(g);
            console.log(`[Async] Game ${g.id}: result evaluated again – ${g.result.error ? 'failed (' + g.result.tries + ')' : 'booked'}.`);
        });
    }
}

/** 7-day takeover in a ranked game: a fixed −15 MMR, counts as a played (lost) game. */
async function applyPenalties(userIds) {
    for (const id of userIds) {
        await User.update({
            mmr: sequelize.literal(`GREATEST("mmr" - ${L.MMR_PENALTY}, 0)`),
            gamesPlayed: sequelize.literal('"gamesPlayed" + 1'),
        }, { where: { id } });
    }
}

// ── Public API (routes / sockets) ─────────────────────────────────────────────

const userOf = u => ({ id: u.id, username: u.username, isBot: u.accountType === 'bot', ownerId: u.ownerId || null });
/** A bot account for the host's bot filter (async/logic.js playerBotRoom), null for people. */
async function botOf(u) {
    return u && u.accountType === 'bot' ? { id: u.id, ownerId: u.ownerId || null, friendIds: await BotFilter.friendIdsOf(u.id) } : null;
}

function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
    return code;
}

/** `internal`: set by the server only (the weekly challenge, utils/challenge.js), never by a request. */
async function create(user, body, internal) {
    const active = await AsyncGame.count({ where: { status: ACTIVE, participantIds: { [Op.contains]: [user.id] } } });
    if (active >= MAX_ACTIVE_PER_USER) return { error: `Höchstens ${MAX_ACTIVE_PER_USER} laufende Rundenspiele.` };
    // the bots of one owner together (utils/account-limits.js)
    const tooMany = await Limits.gamesAllowed(user, { create: true });
    if (tooMany) return tooMany;
    // arena: only createLadderGame (the bot ladder) sets it, never a request
    const opts = Object.assign({}, body || {}, { challenge: internal && internal.challenge || undefined, seed: internal && internal.seed || undefined, arena: undefined });
    const { g, error } = L.create(userOf(user), opts);
    if (error) return { error };
    g.joinCode = generateJoinCode();
    g.waitSince = Date.now();
    g.reminded = false;
    const row = await AsyncGame.create(Object.assign({ joinCode: g.joinCode, hostUserId: user.id }, rowFields(g)));
    g.id = row.id;
    cacheCreated(g);
    const inviteErr = [];
    for (const name of (body.invite || []).slice(0, 3)) {
        const r = await invite(user, g.id, name);
        if (r && r.error) inviteErr.push(r.error);
    }
    return { id: g.id, joinCode: g.joinCode, inviteErrors: inviteErr };
}

/** The bot ladder (async/ladder.js): a game between two bot accounts, both seated from the start. */
async function createLadderGame(a, b, options) {
    const { g, error } = L.createLadderGame(userOf(a), userOf(b), options);
    if (error) return { error };
    g.joinCode = generateJoinCode();
    g.waitSince = Date.now();
    g.reminded = false;
    const row = await AsyncGame.create(Object.assign({ joinCode: g.joinCode, hostUserId: a.id }, rowFields(g)));
    g.id = row.id;
    await require('./ladder').enter(g).catch(err => console.error('[Ladder] Standings row:', err.message));
    cacheCreated(g);
    notify(L.waitingOn(g).userIds, { type: 'turn', gameId: g.id,
        subject: 'Du bist am Zug', text: 'Lege dein Startplättchen in deinem Rundenspiel.' });
    return { id: g.id };
}

/**
 * A running live game goes on as a Rundenspiel (F27, sockets/game.js 'game:toAsync'): the same
 * state, statistics, chat and replay frames. Players with an account keep their seats (also
 * player-bots); guests can't play Rundenspiele, so the KI takes their empires, as it plays the
 * seats of players who resigned (they keep their lost game and, ranked, the penalty). The
 * host's time per turn (`turnDays`, 1 / 3 / 7) holds from now on. Returns { id, guests } or
 * { error }.
 *
 * `opts.restart` (the server shuts down, sockets/game.js convertAllOnShutdown): no limit of
 * running Rundenspiele – the game would be lost otherwise – and the state is copied at once,
 * before anything else can still change it.
 */
async function fromLive(hostUser, session, opts) {
    const restart = !!(opts && opts.restart);
    const S = JSON.parse(JSON.stringify(session.state));
    if (!restart) {
        const active = await AsyncGame.count({ where: { status: ACTIVE, participantIds: { [Op.contains]: [hostUser.id] } } });
        if (active >= MAX_ACTIVE_PER_USER) return { error: `Höchstens ${MAX_ACTIVE_PER_USER} laufende Rundenspiele.` };
    }
    const gc = session.gameConfig || {};
    const ranked = gc.ranked === true;
    const takeover = ranked ? 'schwer' : 'mittel';
    const now = Date.now();
    const guests = [];
    const seats = session.players.map((lp, slot) => {
        const i = engine.stateIndexOf(S, slot, lp);
        const sp = i >= 0 ? S.players[i] : null;
        const seat = {
            slot, civ: lp.civ, ability: lp.ability, drafted: lp.drafted || null, kind: 'ki', userId: null, name: null,
            roman: sp ? sp.roman || null : null, color: sp ? sp.color || null : null,
            kiLevel: (sp && sp.kiLevel) || lp.kiLevel || engine.kiLevelFor(gc.difficulty),
            started: true, replaced: false, penalty: 0, joinedAt: now,
        };
        if (lp.kind === 'human' && lp.dbUserId && !lp.resigned) {
            // an account: plays on (also when the KI held the seat for a while – it waits now)
            Object.assign(seat, { kind: 'human', userId: lp.dbUserId, name: lp.dbUsername || lp.name, botAccount: !!lp.playerBot, kiLevel: null });
            if (sp) sp.kind = 'human';
        } else if (lp.kind === 'human' && lp.dbUserId) {
            // resigned: the KI plays on, the player keeps the lost game
            Object.assign(seat, { userId: lp.dbUserId, name: lp.dbUsername || lp.name, replaced: true, resigned: true, kiLevel: takeover, penalty: ranked ? -L.MMR_PENALTY : 0 });
        } else if (lp.kind === 'human') {
            // a guest: no Rundenspiele without an account – the KI takes the empire
            guests.push(lp.name);
            seat.kiLevel = takeover;
            if (sp) Object.assign(sp, { kind: 'ki', kiLevel: takeover });
        }
        return seat;
    });
    if (!seats.some(s => s.kind === 'human' && s.userId === hostUser.id)) return { error: 'Du spielst in diesem Spiel nicht mit.' };
    const humans = seats.filter(s => s.kind === 'human').length;
    const mapKey = gc.mapKey === 'random' ? 'plaettchen' : ['0', 'plaettchen', 'marathon', 'eigene'].includes(gc.mapKey) ? gc.mapKey : '0';
    const config = {
        mapKey, civMode: gc.randomCivs ? 'random' : 'fixed', events: !!gc.events, eventMode: gc.eventMode === 'easy' ? 'easy' : 'hard',
        wonders: !!gc.wonders, hexTiles: !!gc.hexTiles, expCivs: !!gc.expCivs, difficulty: engine.kiLevelFor(gc.difficulty), ranked, isPublic: false,
        turnDays: L.TURN_DAYS.includes(opts && opts.turnDays) ? opts.turnDays : 3,
        seed: gc.seed || 0, playerCount: seats.length, humanCount: humans, noKi: false, duel: seats.length === 2,
        playerBots: gc.playerBots === true, playerBotLimit: gc.playerBotLimit || null,
        playerBotFilter: gc.playerBots === true ? gc.playerBotFilter || null : null,
        ...(hostUser.accountType === 'bot' ? { hostBotOwnerId: hostUser.ownerId || null } : {}),
        startPlayer: 0, fromLive: session.joinCode || true,
    };
    if (gc.customMap) config.customMap = gc.customMap;
    const g = {
        engine: engine.version(), hostUserId: hostUser.id, status: 'playing', config, seats,
        invites: [], pre: null, hold: false, result: null, state: S,
        chat: (session.chat || []).slice(-200), chatMutes: {},
        stats: session.stats ? JSON.parse(JSON.stringify(session.stats)) : null,
        marks: null, scenes: null, replay: null,
    };
    g.joinCode = generateJoinCode();
    g.waitSince = now;
    g.reminded = false;
    const row = await AsyncGame.create(Object.assign({ joinCode: g.joinCode, hostUserId: hostUser.id }, rowFields(g)));
    g.id = row.id;
    if (g.chat.length) await storeChat(g.id, g.chat, false);
    // the replay so far: the live frames become the Rundenspiel's frame rows (utils/replay.js)
    const rec = session.replay;
    if (rec && rec.frames && rec.frames.length) {
        const { ReplayFrame } = require('../models');
        await ReplayFrame.bulkCreate(rec.frames.map((data, seq) => ({ gameKey: g.id, seq, data })));
        g.replay = { key: rec.key, seq: rec.frames.length };
    }
    cacheCreated(g);
    // Seats resigned in the live game: the live result (processGameOverMmr) never comes, so their
    // ranked penalty is booked now, as a resign in a Rundenspiel does (R-07 of the findings report)
    const resigned = seats.filter(s => s.resigned && s.userId && s.penalty).map(s => s.userId);
    if (resigned.length) await applyPenalties(resigned);
    // saved, the KI moves on if it is its turn, the players whose turn it is are notified
    await withGame(g.id, () => ({ ok: true }));
    const others = seats.filter(s => s.kind === 'human' && s.userId && s.userId !== hostUser.id).map(s => s.userId);
    if (others.length) notify(others, {
        type: 'invite', gameId: g.id,
        subject: 'Euer Spiel geht als Rundenspiel weiter',
        text: `${hostUser.username} hat euer Live-Spiel als Rundenspiel fortgesetzt. Ziehe, wann es dir passt – ${config.turnDays === 1 ? '1 Tag' : config.turnDays + ' Tage'} pro Zug.`
            + (ranked ? ' Wer in dieser Zeit nicht zieht, dessen Reich übernimmt die KI – ohne MMR-Abzug, weil ihr diese Regeln nicht gewählt habt.' : ''),
    });
    return { id: g.id, guests };
}

const canSee = (g, uid, code) => g.seats.some(s => s.userId === uid) ||
    g.invites.some(i => i.userId === uid) || g.config.isPublic || (code && code.toUpperCase() === g.joinCode);

/** Game info for the join dialog (by id with code / invitation / public, or by code). */
async function info(user, id, code) {
    if (!id && code) {
        const row = await AsyncGame.findOne({ where: { joinCode: String(code).toUpperCase() }, attributes: ['id'] });
        if (!row) return { error: 'Kein Rundenspiel mit diesem Code.' };
        id = row.id;
    }
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    if (!canSee(e.g, user.id, code)) return { error: 'Kein Zugriff auf dieses Spiel.' };
    return L.summary(e.g, user.id);
}

async function join(user, id, body) {
    const tooMany = await Limits.gamesAllowed(user);
    if (tooMany) return tooMany;
    const u = Object.assign(userOf(user), await botOf(user));
    return withGame(id, async g => {
        if (!canSee(g, user.id, body && body.code)) return { error: 'Kein Zugriff auf dieses Spiel.' };
        const err = L.join(g, u, body || {});
        return err ? { error: err } : { ok: true };
    });
}

function leave(user, id) {
    return withGame(id, g => {
        const err = L.leave(g, user.id);
        return err ? { error: err } : { ok: true };
    });
}

function cancel(user, id) {
    return withGame(id, g => {
        const err = L.cancel(g, user.id);
        return err ? { error: err } : { ok: true };
    });
}

async function invite(user, id, username) {
    const target = await User.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('username')), String(username || '').toLowerCase()) });
    if (!target) return { error: `Spieler „${username}" nicht gefunden.` };
    const bot = await botOf(target);
    const res = await withGame(id, g => {
        if (!g.seats.some(s => s.userId === user.id)) return { error: 'Nur Mitspieler können einladen.' };
        if (!L.freeSeats(g).length) return { error: 'Es ist kein Platz mehr frei.' };
        if (g.seats.some(s => s.userId === target.id)) return { error: `${target.username} spielt schon mit.` };
        if (target.accountType === 'bot') {
            const why = L.playerBotRoom(g, bot);
            if (why) return { error: why };
        }
        // Every invitation sends an e-mail – keep the number per game small
        if (g.invites.filter(i => i.status === 'pending').length >= MAX_PENDING_INVITES) {
            return { error: 'Zu viele offene Einladungen für dieses Spiel.' };
        }
        // one e-mail / push per invitation: inviting again while it is open sends nothing, and a
        // declined one can be renewed once a day (else anybody could flood anybody's inbox)
        const inv = g.invites.find(i => i.userId === target.id);
        if (inv && inv.status === 'pending') return { ok: true, already: true };
        if (inv && inv.notifiedAt && Date.now() - inv.notifiedAt < INVITE_AGAIN_MS) {
            return { error: `${target.username} wurde gerade erst eingeladen.` };
        }
        if (inv) Object.assign(inv, { status: 'pending', notifiedAt: Date.now() });
        else g.invites.push({ userId: target.id, username: target.username, status: 'pending', by: user.username, notifiedAt: Date.now() });
        return { ok: true };
    });
    if (res && res.ok && !res.already) {
        notify([target.id], {
            type: 'invite', gameId: id,
            subject: `${user.username} lädt dich zu einem Rundenspiel ein`,
            text: `${user.username} hat dich zu einem Hochciv-Rundenspiel eingeladen. Wähle deinen Platz und spiele deinen Zug, wann es dir passt.`,
        });
    }
    return res;
}

function decline(user, id) {
    return withGame(id, g => {
        const inv = g.invites.find(i => i.userId === user.id && i.status === 'pending');
        if (!inv) return { error: 'Keine offene Einladung.' };
        inv.status = 'declined';
        return { ok: true };
    });
}

/* ── The game list (scalability P1.5) ──
   Read by every client and every bot again and again. The rows come without the heavy parts
   (state, chat, stats, replay, marks, scenes, the map in the config), the five lists in parallel,
   and the answer is kept LIST_TTL_MS per account: saving a game drops it for its players and
   invited (listTouched); a change of a public game (status, seats taken) drops every kept list
   (publicGen). Express answers a repeat with 304 (weak ETag). */
const LIST_TTL_MS = process.env.ASYNC_LIST_CACHE_MS !== undefined && process.env.ASYNC_LIST_CACHE_MS !== ''
    ? Math.max(0, Number(process.env.ASYNC_LIST_CACHE_MS) || 0) : 10 * 1000;
const MAX_LISTS = 5000;
const lists = new Map();             // userId → { at, gen, value } (value null: being computed)
let publicGen = 0;

function dropLists(ids) { for (const id of ids) if (id) lists.delete(id); }

/** A game changed: the kept lists of its players and invited, and on a public game every list. */
function listTouched(g, e) {
    dropLists(g.seats.map(s => s.userId));
    dropLists((g.invites || []).map(i => i.userId));
    const key = JSON.stringify([!!g.config.isPublic, g.status, g.seats.filter(s => s.userId).length, !!g.hold]);
    if (e.publicKey !== key) {
        if (g.config.isPublic || (e.publicKey && JSON.parse(e.publicKey)[0])) publicGen++;
        e.publicKey = key;
    }
}
// new rows (create) and changes past save(): bulk changes drop every list
AsyncGame.addHook('afterCreate', row => {
    dropLists(row.participantIds || []); dropLists(row.invitedIds || []);
    if (row.isPublic) publicGen++;
});
for (const h of ['afterDestroy', 'afterBulkUpdate', 'afterBulkDestroy']) AsyncGame.addHook(h, () => { lists.clear(); publicGen++; });
// the notification switches are part of the list
User.addHook('afterSave', u => lists.delete(u.id));

/** The game list: own games, invitations, open public games. */
async function list(user) {
    const end = metrics.list.startTimer();
    try {
        const hit = lists.get(user.id);
        if (hit && hit.value && hit.gen === publicGen && Date.now() - hit.at < LIST_TTL_MS) {
            if (Bots.isBot(user)) require('./ladder').seen(user);
            return hit.value;
        }
        // a save while it is computed drops `mark` – then the answer is not kept
        const mark = { at: Date.now(), gen: publicGen, value: null };
        if (LIST_TTL_MS > 0) {
            if (lists.size >= MAX_LISTS) lists.delete(lists.keys().next().value);
            lists.set(user.id, mark);
        }
        const value = await listOf(user);
        if (lists.get(user.id) === mark) mark.value = value;
        return value;
    } finally { end(); }
}

/* The columns of a list row: `data` with only what L.summary needs (no chat, stats, replay,
   marks, scenes, endSeen; the config without the rolled map and setup, a custom map by its name
   and marathon flag). Parentheses throughout: `-` binds tighter than `->`. */
const LIST_COLS = `id, "joinCode", "hostUserId", status, "waitingIds", round, "waitSince", reminded, "updatedAt",
    jsonb_build_object(
        'engine', data->'engine',
        'config', ((data->'config') - 'map' - 'setup' - 'customMap') || CASE
            WHEN jsonb_typeof((data->'config')->'customMap') = 'object'
            THEN jsonb_build_object('customMap', jsonb_build_object('name', ((data->'config')->'customMap')->'name',
                                                                   'marathon', ((data->'config')->'customMap')->'marathon'))
            ELSE '{}'::jsonb END,
        'seats', data->'seats', 'invites', data->'invites', 'pre', data->'pre', 'hold', data->'hold',
        'result', data->'result', 'meta', data->'meta') AS data`;
const ME = `"participantIds" @> ARRAY[$1]::uuid[]`;          // uses the GIN index
const listRows = (where, bind, limit) => sequelize.query(
    `SELECT ${LIST_COLS} FROM async_games WHERE ${where} ORDER BY "updatedAt" DESC LIMIT ${limit}`,
    { bind, type: sequelize.QueryTypes.SELECT });

async function listOf(user) {
    const summarize = (row, bot) => {
        // a game in memory is newer than its row (saving waits FLUSH_MS): its turn, round, winners
        const live = cache.get(row.id);
        const mem = live && live.g && live.g.status === row.status ? live.g : null;
        const g = mem || fromRow(row);
        const s = L.summary(g, user.id);
        // asked by a bot: may it take a seat now (allowed, room under the limit, the host's filter)?
        if (bot) s.playerBotsForYou = !L.playerBotRoom(g, bot);
        const w = mem ? L.waitingOn(mem) : null;
        Object.assign(s, {
            waitingFor: (w ? w.label : g.meta.waitingFor) || s.waitingFor,
            yourTurn: (w ? w.userIds : row.waitingIds || []).includes(user.id),
            round: mem ? (mem.state ? mem.state.round : 0) : row.round,
            winners: (mem ? winnersOf(mem) : g.meta.winners) || [], result: g.result,
            updatedAt: row.updatedAt,
            // an ended game the player has not opened since: did they win?
            won: g.status === 'finished' ? ((mem ? winnersOf(mem) : g.meta.winners) || []).includes((g.seats.find(x => x.userId === user.id) || {}).name) : undefined,
            deadline: ACTIVE.includes(g.status) ? g.waitSince + timeoutOf(g) : null,
        });
        return s;
    };
    const since = new Date(Date.now() - ENDED_LIST_DAYS * DAY);
    const [bot, u, mine, ended, invites, open, watch] = await Promise.all([
        botOf(user),
        User.findByPk(user.id),
        // Finished games are listed in the account's game history, not here …
        listRows(`${ME} AND status NOT IN ('cancelled', 'finished')`, [user.id], 100),
        // … except the ones that ended in the last ENDED_LIST_DAYS and that the player has not
        // opened since (open() marks them): one last click to see who won
        listRows(`${ME} AND status = 'finished' AND "updatedAt" > $2
                  AND NOT (COALESCE(data->'endSeen', '[]'::jsonb) @> to_jsonb($1::text))`, [user.id, since], 20),
        listRows(`"invitedIds" @> ARRAY[$1]::uuid[] AND status IN ('setup', 'playing')`, [user.id], 50),
        listRows(`"isPublic" AND status IN ('setup', 'playing') AND NOT (${ME})`, [user.id], 50),
        // Spectator mode: public games that are being played, to watch
        listRows(`"isPublic" AND status = 'playing' AND NOT (${ME})`, [user.id], 20),
    ]);
    if (Bots.isBot(u)) require('./ladder').seen(u);     // a bot that asks for its games is there to play
    const sum = row => summarize(row, bot);
    return {
        notifyEmail: u ? u.notifyEmail : true,
        notifyPush: u ? u.notifyPush : true,
        // the Discord switch is shown only with a linked Discord account and a bot token
        notifyDiscord: u ? u.notifyDiscord : false,
        discord: !!(u && u.discordId) && await Discord.enabled(),
        timeoutDays: TIMEOUT_MS / DAY,
        mine: mine.map(sum),
        ended: ended.map(sum),
        invites: invites.map(sum).filter(s => s.freeSeats.length && s.mySlot == null),
        open: open.map(sum).filter(s => s.freeSeats.length),
        watch: watch.map(sum).filter(s => !s.freeSeats.length),
    };
}

/**
 * A socket opens a game: its players (also after a KI takeover), and anybody for a public game
 * that is being played (spectator mode – the view has no seat, actions and chat are refused).
 */
async function open(user, id) {
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    const watchable = e.g.config.isPublic && ['playing', 'finished'].includes(e.g.status);
    if (!e.g.seats.some(s => s.userId === user.id) && !watchable) return { error: 'Du spielst in diesem Spiel nicht mit.' };
    // the last click on an ended game: from now on it is only in the game history
    e.g.endSeen = e.g.endSeen || [];
    if (e.g.status === 'finished' && e.g.seats.some(s => s.userId === user.id) && !e.g.endSeen.includes(user.id)) {
        e.g.endSeen.push(user.id);
        await save(e.g).catch(err => console.error(`[Async] Saving endSeen failed for ${e.g.id}:`, err));
    }
    return { view: JSON.parse(JSON.stringify(L.view(e.g, user.id))), chat: e.g.chat || [], chatMute: (e.g.chatMutes || {})[user.id] || null };
}

/**
 * Chat message of a participant (utils/chat.js). Kept with the game (last 200, pings not) and
 * sent to everyone who has it open as 'async:chat' – not as a whole new view.
 */
async function chat(user, id, payload) {
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    if (ENDED.includes(e.g.status)) return { error: 'Das Spiel ist beendet, der Chat ist geschlossen.' };
    const seat = e.g.seats.find(s => s.userId === user.id);
    if (!seat) return { error: 'Nur Mitspieler können schreiben.' };
    const mute = (e.g.chatMutes || {})[user.id] || null;
    const isText = payload.kind !== 'emote' && payload.kind !== 'ping';
    if (isText && !terms.accepted(user)) return { error: terms.NEEDED };
    if (isText && reports.muteActive(mute)) return { error: 'Du kannst gerade keine Texte schreiben.', mute };
    const r = chatLib.build({ slot: seat.slot, name: user.username, uid: user.id }, payload, `async:${id}:${user.id}`);
    if (r.error) return { error: r.error };
    if (r.msg.kind === 'text') {
        const v = await reports.moderate({ source: 'async', sourceId: id, history: e.g.chat, msg: r.msg, sender: { id: user.id, name: user.username }, mute });
        if (v) {
            // kept with the game (in its queue, like a message): the timeout outlasts a restart
            const cur = await getEntry(id);       // the moderation awaited: the game may have left memory
            if (!cur.g) return v;
            cur.busy++;
            const run = cur.queue.then(async () => {
                cur.g.chatMutes = { ...(cur.g.chatMutes || {}), [user.id]: v.mute };
                await save(cur.g, { now: true });
            });
            cur.queue = run.catch(() => {}).finally(() => { cur.busy--; });
            await run;
            return v;
        }
    }
    if (r.msg.kind !== 'ping') {
        // in the game's queue, so it can't overwrite a move saved at the same time
        const cur = await getEntry(id);
        if (!cur.g) return { error: 'Spiel nicht gefunden.' };
        cur.busy++;
        const run = cur.queue.then(async () => {
            // one row per message – the game's row is not written (scalability P1.4)
            cur.g.chat = chatLib.remember(cur.g.chat, r.msg, chatLib.ASYNC_HISTORY);
            await storeChat(id, [r.msg], cur.g.chat.length >= chatLib.ASYNC_HISTORY);
        });
        cur.queue = run.catch(() => {}).finally(() => { cur.busy--; });
        await run;
    }
    if (io) io.to(room(id)).emit('async:chat', { id, msg: r.msg });
    return { ok: true };
}

/** Report a chat message (utils/reports.js) – whoever may open the game: players and spectators. */
async function report(user, id, msgId, reason) {
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    const seat = e.g.seats.find(s => s.userId === user.id);
    const watchable = e.g.config.isPublic && ['playing', 'finished'].includes(e.g.status);     // as open()
    if (!seat && !watchable) return { error: 'Du spielst in diesem Spiel nicht mit.' };
    return reports.report({
        source: 'async', sourceId: id, history: e.g.chat || [], msgId, reason,
        reporter: { id: user.id, name: user.username, slot: seat ? seat.slot : -1 },
    });
}

function action(user, id, type, params) {
    return withGame(id, g => {
        const err = L.action(g, user.id, type, params);
        return err ? { error: err } : { ok: true };
    }, type === 'endTurn' ? 'end_turn' : 'move', user);
}

function place(user, id, o, cell) {
    return withGame(id, g => {
        const err = L.place(g, user.id, o, cell);
        return err ? { error: err } : { ok: true };
    }, 'place', user);
}

function draftPick(user, id, abilityId) {
    return withGame(id, g => {
        const err = L.draftPick(g, user.id, abilityId);
        return err ? { error: err } : { ok: true };
    }, 'draft', user);
}

/** Nation draft (F34): a human picks a nation (and its ability). */
function civDraftPick(user, id, pickId, ability) {
    return withGame(id, g => {
        const err = L.civDraftPick(g, user.id, pickId, ability);
        return err ? { error: err } : { ok: true };
    }, 'civdraft', user);
}

/** Resign (F16): the KI plays the seat to the end; ranked games cost the takeover penalty. */
async function resign(user, id) {
    let penalized = null;
    const r = await withGame(id, g => {
        const res = L.resign(g, user.id);
        if (res.error) return res;
        penalized = res.penalized;
        return { ok: true };
    });
    if (r && r.error) return r;
    if (penalized) await applyPenalties([penalized]);
    else await User.update({ gamesPlayed: sequelize.literal('"gamesPlayed" + 1') }, { where: { id: user.id } });
    return { ok: true };
}

// ── Scheduler: reminders after 5 days, takeover after 7 ───────────────────────

async function sweep() {
    try {
        const now = Date.now();
        const rows = await AsyncGame.findAll({
            // the shortest reminder of any game (1 day per turn); each game is checked below
            where: { status: { [Op.in]: ACTIVE }, waitSince: { [Op.lt]: new Date(now - REMINDER_MS / 7) } },
            attributes: ['id'],
        });
        for (const row of rows) {
            let penalized = [], replaced = [], takeoverText = '';
            await withGame(row.id, g => {
                if (!ACTIVE.includes(g.status)) return;
                const age = Date.now() - g.waitSince;
                if (age < reminderOf(g)) return;      // the in-memory copy is authoritative
                const w = L.waitingOn(g);
                takeoverText = `Du hast ${duration(timeoutOf(g))} lang nicht gespielt.`;
                if (age >= timeoutOf(g)) {
                    ({ penalized, replaced } = L.timeout(g));
                    console.log(`[Async] Game ${g.id}: timeout (${g.status}, ${daysOf(g)} days per turn), replaced: ${replaced.length}`);
                } else if (!g.reminded) {
                    g.reminded = true;
                    const left = duration(timeoutOf(g) - age);
                    const to = w.userIds.length ? w.userIds : [g.hostUserId];
                    notify(to, {
                        type: 'reminder', gameId: g.id,
                        subject: 'Erinnerung: dein Rundenspiel wartet',
                        text: w.userIds.length
                            ? `Dein Rundenspiel wartet seit ${duration(age)} auf dich. Spielst du nicht innerhalb von ${left}, übernimmt die KI deinen Platz` +
                            (g.config.ranked && !g.config.fromLive ? ` und du verlierst ${L.MMR_PENALTY} MMR.` : '.')
                            : g.config.noKi
                                ? `Dein Rundenspiel wartet auf ${w.label}. In ${left} beginnt es mit den Spielern, die da sind – oder wird abgebrochen, wenn es zu wenige sind.`
                                : `Dein Rundenspiel wartet auf ${w.label}. In ${left} wird der Platz mit der KI besetzt.`,
                    });
                }
            });
            if (penalized.length) await applyPenalties(penalized);
            const freeOnly = replaced.filter(u => !penalized.includes(u));
            for (const u of freeOnly) await User.update({ gamesPlayed: sequelize.literal('"gamesPlayed" + 1') }, { where: { id: u } });
            if (replaced.length) {
                notify(replaced, {
                    type: 'takeover', gameId: row.id,
                    subject: 'Die KI hat deinen Platz übernommen',
                    text: `${takeoverText} Die KI spielt deinen Platz weiter; das Spiel zählt als Niederlage` +
                        (penalized.length ? ` (−${L.MMR_PENALTY} MMR).` : '.'),
                });
            }
        }
        await retryResults();
        // Evict idle games from memory
        for (const [id, e] of cache) if (Date.now() - e.touched > IDLE_MS && evictable(id, e)) cache.delete(id);
    } catch (err) {
        console.error('[Async] Sweep failed:', err);
    }
}

/** After a restart: continue games that were in the middle of bot / KI turns. */
async function resume() {
    try {
        const rows = await AsyncGame.findAll({
            where: { status: 'playing', [Op.and]: sequelize.where(sequelize.fn('cardinality', sequelize.col('waitingIds')), 0) },
            attributes: ['id'],
        });
        for (const row of rows) await withGame(row.id, () => {});
    } catch (err) {
        console.error('[Async] Resume failed:', err);
    }
}

function init(ioServer) {
    io = ioServer;
    const t = setInterval(sweep, SWEEP_MS);
    t.unref();
    setTimeout(() => { resume().then(sweep); }, 15000).unref();
    require('./ladder').start();
}

async function setNotifyEmail(user, on) {
    await User.update({ notifyEmail: !!on }, { where: { id: user.id } });
    return { ok: true, notifyEmail: !!on };
}

/**
 * Discord direct messages. Switching on sends a test message first: if the bot can't write to the
 * player (no shared server, DMs from server members off), the switch stays off and the answer says why.
 */
async function setNotifyDiscord(user, on) {
    const u = await User.findByPk(user.id);
    if (!u) return { error: 'Konto nicht gefunden.' };
    if (on) {
        if (!u.discordId) return { error: 'Verknüpfe zuerst dein Discord-Konto (Mein Konto).' };
        if (!(await Discord.enabled())) return { error: 'Discord-Nachrichten sind auf diesem Server nicht eingerichtet.' };
        const result = await Discord.sendDm(u.discordId, Discord.messageFor({
            subject: 'Discord-Nachrichten an',
            text: 'Ab jetzt bekommst du hier eine Nachricht, wenn du in einem Rundenspiel am Zug bist, eingeladen wirst oder ein Spiel endet.',
        }));
        if (result !== 'sent') {
            return {
                error: result === 'closed'
                    ? 'Der Hochciv-Bot kann dir keine Direktnachricht schicken. Tritt dem Hochciv-Discord bei und erlaube dort Direktnachrichten von Servermitgliedern.'
                    : 'Discord ist gerade nicht erreichbar. Bitte versuche es später erneut.',
                invite: Discord.INVITE_URL || undefined,
            };
        }
    }
    await User.update({ notifyDiscord: !!on }, { where: { id: u.id } });
    return { ok: true, notifyDiscord: !!on };
}

/**
 * Account deletion: take the player out of every Rundenspiel, invitations included
 * (logic.removeUser). Nothing changes if one of them can't be left right now – returns { error }.
 */
async function removeUser(userId) {
    const invited = `"data"->'invites' @> ${sequelize.escape(JSON.stringify([{ userId }]))}::jsonb`;
    const rows = await AsyncGame.findAll({
        where: { [Op.or]: [{ participantIds: { [Op.contains]: [userId] } }, sequelize.literal(invited)] },
        attributes: ['id', 'status', 'participantIds'],
    });
    if (rows.some(r => ['civdraft', 'placement', 'draft'].includes(r.status) && r.participantIds.includes(userId))) {
        return { error: L.IN_PREPHASE };
    }
    for (const row of rows) {
        let names = [];
        const res = await withGame(row.id, g => {
            names = g.seats.filter(s => s.userId === userId && s.name).map(s => s.name);
            const err = L.removeUser(g, userId);
            if (err) return { error: err };
            return syncChat(g).then(() => ({ ok: true }));       // their messages left the chat
        });
        if (res && res.error) return res;
        // the frames recorded so far for the replay (utils/replay.js)
        for (const from of names) await Replay.renameInFrames(row.id, from, L.DELETED_NAME);
    }
    return { ok: true };
}

/** Drop a game from memory (it is reloaded from the database on next use). */
function evict(id) {
    const e = cache.get(id);
    if (e && evictable(id, e)) cache.delete(id);
}

module.exports = {
    init, evict, flushAll, create, createLadderGame, fromLive, info, join, leave, cancel, invite, decline, list, open, action, place, draftPick, civDraftPick, chat, report, resign,
    setNotifyEmail, setNotifyDiscord, sweep, room, removeUser, purgeEndedChats,
    ACTIVE, MAX_ACTIVE_PER_USER,
    processResult,      // for tests/score
};
