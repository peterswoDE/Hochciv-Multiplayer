/**
 * Asynchronous games: persistence, locking, live updates, notifications, MMR and the
 * inactivity scheduler. The rules themselves are in ./logic.js.
 *
 * Every change runs through withGame(): one change at a time per game (queue), the game is
 * saved to the database after every action and after every automatic (bot / KI) turn, and
 * everyone who has the game open gets the new view over Socket.IO.
 */
const { Op } = require('sequelize');
const crypto = require('crypto');
const { AsyncGame, User, Game, sequelize } = require('../models');
const L = require('./logic');
const engine = require('../engine-adapter');
const { notify } = require('../utils/notify');
const { calculateMMR } = require('../utils/mmr');

const DAY = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = Number(process.env.ASYNC_TIMEOUT_MS) || 7 * DAY;
const REMINDER_MS = Number(process.env.ASYNC_REMINDER_MS) || 5 * DAY;
const SWEEP_MS = Number(process.env.ASYNC_SWEEP_MS) || 10 * 60 * 1000;
const ACTIVE = ['setup', 'placement', 'draft', 'playing'];
const MAX_ACTIVE_PER_USER = 30;
const MAX_PENDING_INVITES = 6;

let io = null;
const cache = new Map();          // id → { g, queue, touched, busy }
const room = id => `async:${id}`;

// ── Loading and saving ───────────────────────────────────────────────────────

function fromRow(row) {
    const d = row.data || {};
    return {
        id: row.id, joinCode: row.joinCode, hostUserId: row.hostUserId, status: row.status,
        config: d.config, seats: d.seats || [], invites: d.invites || [], pre: d.pre || null,
        hold: !!d.hold, result: d.result || null, meta: d.meta || {},
        state: row.state || null,
        waitSince: row.waitSince ? new Date(row.waitSince).getTime() : Date.now(),
        reminded: !!row.reminded,
    };
}

function rowFields(g) {
    const w = L.waitingOn(g);
    const S = g.state;
    g.meta = {
        waitingFor: w.label,
        winners: S && S.over ? (S.over.winners || []).map(i => S.players[i] && g.seats[S.players[i].slot])
            .filter(Boolean).map(s => s.name || s.civ) : [],
    };
    return {
        status: g.status,
        isPublic: !!g.config.isPublic,
        participantIds: [...new Set(g.seats.map(s => s.userId).filter(Boolean))],
        invitedIds: g.invites.filter(i => i.status === 'pending').map(i => i.userId),
        waitingIds: w.userIds,
        waitSince: new Date(g.waitSince),
        reminded: !!g.reminded,
        round: S ? S.round : 0,
        data: { config: g.config, seats: g.seats, invites: g.invites, pre: g.pre, hold: g.hold, result: g.result, meta: g.meta },
        state: S,
    };
}

/** Something that changes whenever the game moves on – restarts the 7-day clock. */
function waitKey(g) {
    const w = L.waitingOn(g);
    const S = g.state;
    return JSON.stringify([g.status, w.userIds, w.label, S && S.cur, S && S.round, g.hold,
        g.pre && g.pre.draft && g.pre.draft.D.at]);
}

async function getEntry(id) {
    let e = cache.get(id);
    if (!e) {
        e = { g: null, queue: null, touched: Date.now(), busy: 0 };
        e.queue = AsyncGame.findByPk(id).then(row => { e.g = row ? fromRow(row) : null; });
        cache.set(id, e);
        await e.queue.catch(() => cache.delete(id));
    } else {
        await e.queue.catch(() => {});
    }
    e.touched = Date.now();
    return e;
}

async function save(g) {
    await AsyncGame.update(rowFields(g), { where: { id: g.id } });
}

/**
 * Run `fn(g)` exclusively for this game, then save, drive automatic turns, broadcast and
 * notify. Returns fn's result. Throws 'not found' as { error }.
 */
async function withGame(id, fn) {
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    e.busy++;
    const run = e.queue.then(async () => {
        const g = e.g;
        const before = { key: waitKey(g), waiting: L.waitingOn(g).userIds, status: g.status };
        const res = await fn(g);
        if (res && res.error) return res;
        await settle(g, before);
        // Bots, KI, released holds – saved and broadcast after every automatic turn
        if (g.status === 'playing') {
            await L.drive(g, async () => { await settle(g, null); });
            await settle(g, before);
        }
        return res;
    });
    e.queue = run.catch(() => {}).finally(() => { e.busy--; });
    return run;
}

/** Save + broadcast; with `before`, also restart the clock and send notifications. */
async function settle(g, before) {
    if (before) {
        const key = waitKey(g);
        if (key !== before.key) { g.waitSince = Date.now(); g.reminded = false; }
    }
    if (g.status === 'finished' && !g.result) await processResult(g);
    await save(g);
    await broadcast(g);
    if (!before) return;
    const now = L.waitingOn(g).userIds;
    const fresh = now.filter(u => !before.waiting.includes(u));
    before.waiting = now;                 // settle runs twice per change – notify once
    before.key = waitKey(g);
    if (fresh.length) {
        const viewing = await viewers(g.id);
        const absent = fresh.filter(u => !viewing.has(u));
        notify(absent, {
            type: 'turn', gameId: g.id,
            subject: 'Du bist am Zug',
            text: g.status === 'placement' ? 'Lege dein Startplättchen in deinem Rundenspiel.'
                : g.status === 'draft' ? 'Du bist im Draft deines Rundenspiels dran.'
                    : `Du bist in deinem Rundenspiel am Zug (Runde ${g.state ? g.state.round : 1}).`,
        });
    }
    if (before.status !== g.status && (g.status === 'finished' || g.status === 'cancelled')) {
        const ids = g.seats.map(s => s.userId).filter(Boolean);
        before.status = g.status;
        notify(ids, {
            type: 'finished', gameId: g.id,
            subject: g.status === 'finished' ? 'Rundenspiel beendet' : 'Rundenspiel abgebrochen',
            text: g.status === 'finished'
                ? `Das Rundenspiel ist vorbei. Gewonnen: ${(g.meta.winners || []).join(', ') || '—'}.`
                : 'Der Host hat das Rundenspiel abgebrochen.',
        });
    }
}

// ── Live view (Socket.IO) ─────────────────────────────────────────────────────

async function viewers(id) {
    if (!io) return new Set();
    const sockets = await io.in(room(id)).fetchSockets();
    return new Set(sockets.map(s => s.data.userId).filter(Boolean));
}

async function broadcast(g) {
    if (!io) return;
    const sockets = await io.in(room(g.id)).fetchSockets();
    const views = new Map();
    for (const s of sockets) {
        const uid = s.data.userId;
        if (!views.has(uid)) views.set(uid, JSON.parse(JSON.stringify(L.view(g, uid))));
        s.emit('async:update', views.get(uid));
    }
}

// ── Results and MMR ───────────────────────────────────────────────────────────

async function processResult(g) {
    const S = g.state;
    const E = engine.getEngine();
    const over = S.over || {};
    const ranked = !!g.config.ranked;
    try {
        const players = g.seats.map(seat => {
            const i = L.stateIndex(g, seat.slot);
            let points = 0, scoreDetails = null;
            try { scoreDetails = E.victoryScore(S, i); points = scoreDetails ? scoreDetails.total : 0; } catch (_) { }
            const active = seat.userId && !seat.replaced;
            return {
                dbUserId: active ? seat.userId : null,
                dbUsername: active ? seat.name : null,
                name: seat.name || seat.civ, civ: seat.civ, ability: seat.ability, drafted: seat.drafted || null,
                isBot: seat.kind === 'bot', replaced: !!seat.replaced, replacedUserId: seat.replaced ? seat.userId : null,
                penalty: seat.penalty || 0, points, scoreDetails,
                isWinner: Array.isArray(over.winners) && over.winners.includes(i),
                async: true,
            };
        });
        for (const p of players) {
            const u = p.dbUserId ? await User.findByPk(p.dbUserId) : null;
            p.mmr = u ? u.mmr : 1000;
        }
        if (ranked) {
            for (const r of calculateMMR(players)) {
                const p = players.find(x => x.dbUserId && x.dbUserId === r.dbUserId);
                if (!p) continue;
                Object.assign(p, { mmrShift: r.mmrChange, oldMmr: r.oldMmr, newMmr: r.newMmr });
                await User.update({ mmr: r.newMmr, gamesPlayed: sequelize.literal('"gamesPlayed" + 1') }, { where: { id: p.dbUserId } });
            }
        } else {
            for (const p of players.filter(x => x.dbUserId))
                await User.update({ gamesPlayed: sequelize.literal('"gamesPlayed" + 1') }, { where: { id: p.dbUserId } });
        }
        await Game.create({
            version: E.APP_VERSION || 'Unknown',
            durationRounds: S.round,
            winnerUsername: players.find(p => p.isWinner && p.dbUsername)?.dbUsername || null,
            participants: players,
        });
        g.result = { winners: players.filter(p => p.isWinner).map(p => p.name), ranked, players: players.map(p => ({ name: p.name, points: p.points, mmrShift: p.mmrShift || 0, replaced: p.replaced })) };
    } catch (err) {
        console.error(`[Async] Result processing failed for ${g.id}:`, err);
        g.result = { error: true };
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

const userOf = u => ({ id: u.id, username: u.username });

function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
    return code;
}

async function create(user, body) {
    const active = await AsyncGame.count({ where: { status: ACTIVE, participantIds: { [Op.contains]: [user.id] } } });
    if (active >= MAX_ACTIVE_PER_USER) return { error: `Höchstens ${MAX_ACTIVE_PER_USER} laufende Rundenspiele.` };
    const { g, error } = L.create(userOf(user), body || {});
    if (error) return { error };
    g.joinCode = generateJoinCode();
    g.waitSince = Date.now();
    g.reminded = false;
    const row = await AsyncGame.create(Object.assign({ joinCode: g.joinCode, hostUserId: user.id }, rowFields(g)));
    g.id = row.id;
    cache.set(g.id, { g, queue: Promise.resolve(), touched: Date.now(), busy: 0 });
    const inviteErr = [];
    for (const name of (body.invite || []).slice(0, 3)) {
        const r = await invite(user, g.id, name);
        if (r && r.error) inviteErr.push(r.error);
    }
    return { id: g.id, joinCode: g.joinCode, inviteErrors: inviteErr };
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

function join(user, id, body) {
    return withGame(id, g => {
        if (!canSee(g, user.id, body && body.code)) return { error: 'Kein Zugriff auf dieses Spiel.' };
        const err = L.join(g, userOf(user), body || {});
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
    const res = await withGame(id, g => {
        if (!g.seats.some(s => s.userId === user.id)) return { error: 'Nur Mitspieler können einladen.' };
        if (!L.freeSeats(g).length) return { error: 'Es ist kein Platz mehr frei.' };
        if (g.seats.some(s => s.userId === target.id)) return { error: `${target.username} spielt schon mit.` };
        // Every invitation sends an e-mail – keep the number per game small
        if (g.invites.filter(i => i.status === 'pending').length >= MAX_PENDING_INVITES) {
            return { error: 'Zu viele offene Einladungen für dieses Spiel.' };
        }
        const inv = g.invites.find(i => i.userId === target.id);
        if (inv) inv.status = 'pending';
        else g.invites.push({ userId: target.id, username: target.username, status: 'pending', by: user.username });
        return { ok: true };
    });
    if (res && res.ok) {
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

/** The game list: own games, invitations, open public games. */
async function list(user) {
    const attrs = { exclude: ['state'] };
    const summarize = row => {
        const g = fromRow(row);
        const s = L.summary(g, user.id);
        Object.assign(s, {
            waitingFor: g.meta.waitingFor || s.waitingFor,
            yourTurn: (row.waitingIds || []).includes(user.id),
            round: row.round, winners: g.meta.winners || [], result: g.result,
            updatedAt: row.updatedAt,
            deadline: ACTIVE.includes(g.status) ? g.waitSince + TIMEOUT_MS : null,
        });
        return s;
    };
    const mine = await AsyncGame.findAll({
        // Finished games are listed in the account's game history, not here
        where: { participantIds: { [Op.contains]: [user.id] }, status: { [Op.notIn]: ['cancelled', 'finished'] } },
        attributes: attrs, order: [['updatedAt', 'DESC']], limit: 100,
    });
    const invites = await AsyncGame.findAll({
        where: { invitedIds: { [Op.contains]: [user.id] }, status: { [Op.in]: ['setup', 'playing'] } },
        attributes: attrs, order: [['updatedAt', 'DESC']], limit: 50,
    });
    const open = await AsyncGame.findAll({
        where: { isPublic: true, status: { [Op.in]: ['setup', 'playing'] }, [Op.not]: { participantIds: { [Op.contains]: [user.id] } } },
        attributes: attrs, order: [['updatedAt', 'DESC']], limit: 50,
    });
    const u = await User.findByPk(user.id);
    return {
        notifyEmail: u ? u.notifyEmail : true,
        timeoutDays: TIMEOUT_MS / DAY,
        mine: mine.map(summarize),
        invites: invites.map(summarize).filter(s => s.freeSeats.length && s.mySlot == null),
        open: open.map(summarize).filter(s => s.freeSeats.length),
    };
}

/** A socket opens a game: participants only (also after a KI takeover, to watch). */
async function open(user, id) {
    const e = await getEntry(id);
    if (!e.g) return { error: 'Spiel nicht gefunden.' };
    if (!e.g.seats.some(s => s.userId === user.id)) return { error: 'Du spielst in diesem Spiel nicht mit.' };
    return { view: JSON.parse(JSON.stringify(L.view(e.g, user.id))) };
}

function action(user, id, type, params) {
    return withGame(id, g => {
        const err = L.action(g, user.id, type, params);
        return err ? { error: err } : { ok: true };
    });
}

function place(user, id, o, cell) {
    return withGame(id, g => {
        const err = L.place(g, user.id, o, cell);
        return err ? { error: err } : { ok: true };
    });
}

function draftPick(user, id, abilityId) {
    return withGame(id, g => {
        const err = L.draftPick(g, user.id, abilityId);
        return err ? { error: err } : { ok: true };
    });
}

// ── Scheduler: reminders after 5 days, takeover after 7 ───────────────────────

async function sweep() {
    try {
        const now = Date.now();
        const rows = await AsyncGame.findAll({
            where: { status: { [Op.in]: ACTIVE }, waitSince: { [Op.lt]: new Date(now - REMINDER_MS) } },
            attributes: ['id'],
        });
        for (const row of rows) {
            let penalized = [], replaced = [];
            await withGame(row.id, g => {
                if (!ACTIVE.includes(g.status)) return;
                const age = Date.now() - g.waitSince;
                if (age < REMINDER_MS) return;        // the in-memory copy is authoritative
                const w = L.waitingOn(g);
                if (age >= TIMEOUT_MS) {
                    ({ penalized, replaced } = L.timeout(g));
                    console.log(`[Async] Game ${g.id}: 7-day timeout (${g.status}), replaced: ${replaced.length}`);
                } else if (!g.reminded) {
                    g.reminded = true;
                    const days = Math.max(1, Math.round((TIMEOUT_MS - age) / DAY));
                    const to = w.userIds.length ? w.userIds : [g.hostUserId];
                    notify(to, {
                        type: 'reminder', gameId: g.id,
                        subject: 'Erinnerung: dein Rundenspiel wartet',
                        text: w.userIds.length
                            ? `Dein Rundenspiel wartet seit ${Math.round(age / DAY)} Tagen auf dich. Spielst du nicht innerhalb von ${days} Tag(en), übernimmt die KI deinen Platz` +
                            (g.config.ranked ? ` und du verlierst ${L.MMR_PENALTY} MMR.` : '.')
                            : `Dein Rundenspiel wartet auf ${w.label}. In ${days} Tag(en) wird der Platz mit einem Bot besetzt.`,
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
                    text: 'Du hast 7 Tage lang nicht gespielt. Die KI spielt deinen Platz weiter; das Spiel zählt als Niederlage' +
                        (penalized.length ? ` (−${L.MMR_PENALTY} MMR).` : '.'),
                });
            }
        }
        // Evict idle games from memory
        for (const [id, e] of cache) if (!e.busy && Date.now() - e.touched > 30 * 60 * 1000) cache.delete(id);
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
}

async function setNotifyEmail(user, on) {
    await User.update({ notifyEmail: !!on }, { where: { id: user.id } });
    return { ok: true, notifyEmail: !!on };
}

/** Drop a game from memory (it is reloaded from the database on next use). */
function evict(id) {
    const e = cache.get(id);
    if (e && !e.busy) cache.delete(id);
}

module.exports = {
    init, evict, create, info, join, leave, cancel, invite, decline, list, open, action, place, draftPick,
    setNotifyEmail, sweep, room,
};
