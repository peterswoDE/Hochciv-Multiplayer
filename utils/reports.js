/**
 * Chat moderation: reports and blocks.
 *
 *   · Report: a player reports another player's chat message (live game: sockets/game.js,
 *     Rundenspiel: async/service.js). The game's chat history is stored with it, as the server
 *     has it, and an admin reviews it on the account page (routes/admin.js /reports).
 *   · Block: a logged-in player stops seeing someone's messages and pings. The list is kept with
 *     the account (users.blockedPlayers) – accounts by id, guests by name – and the client hides
 *     the messages (client/chat.js). Guests keep their list on the device.
 */
const { Op } = require('sequelize');
const { Report, User } = require('../models');
const { renameInState } = require('./rename');

const KEEP_DAYS = Number(process.env.REPORT_KEEP_DAYS) || 180;    // closed reports
const MAX_REASON = 300;
const MAX_BLOCKED = 200;
const RATE_COUNT = 10;                     // reports …
const RATE_WINDOW_MS = 60 * 60 * 1000;     // … per hour and reporter
const STATUSES = ['open', 'resolved', 'dismissed'];

const recent = new Map();                  // reporter key → timestamps of their reports

/**
 * Report message `msgId` of a chat `history`. `reporter`: { id (account) | null, name, slot }.
 * Returns { ok } or { error } (German, translated by the client).
 */
async function report({ source, sourceId, history, msgId, reporter, reason }) {
    const msg = (history || []).find(m => m && m.id === msgId);
    if (!msg || (msg.kind !== 'text' && msg.kind !== 'emote')) return { error: 'Nachricht nicht gefunden.' };
    if (msg.slot === reporter.slot && msg.name === reporter.name) return { error: 'Eigene Nachrichten kannst du nicht melden.' };

    const key = reporter.id || `${source}:${sourceId}:${reporter.name}`;
    const where = { kind: 'chat', source, sourceId, 'message.id': msgId };
    if (reporter.id) where.reporterId = reporter.id; else where.reporterName = reporter.name;
    if (await Report.count({ where })) return { error: 'Du hast diese Nachricht schon gemeldet.' };
    const now = Date.now();
    const times = (recent.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (times.length >= RATE_COUNT) return { error: 'Zu viele Meldungen – versuche es später noch einmal.' };
    recent.set(key, times.concat(now));

    const text = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON) : '';
    await Report.create({
        kind: 'chat', source, sourceId,
        reporterId: reporter.id || null, reporterName: reporter.name,
        reportedId: msg.uid || null, reportedName: msg.name,
        reason: text || null,
        message: msg,
        context: history.filter(m => m && m.kind !== 'ping'),
    });
    console.log(`[Reports] ${reporter.name} reported a message of ${msg.name} (${source} ${sourceId}).`);
    return { ok: true };
}

// forget idle reporters now and then
setInterval(() => {
    const now = Date.now();
    for (const [k, list] of recent) if (!list.some(t => now - t < RATE_WINDOW_MS)) recent.delete(k);
}, 10 * 60 * 1000).unref();

// ── Blocks (logged-in players) ─────────────────────────────────────────────────────────────

const blockKey = b => (b.id ? 'id:' + b.id : 'name:' + b.name);

/** The list as the client gets it: [{ key, id, name, at }]. */
const publicBlocks = user => (user.blockedPlayers || []).map(b => ({ key: blockKey(b), id: b.id || null, name: b.name, at: b.at }));

/** Block an account (`id`) or a guest (`name`). Returns { list } or { error }. */
async function block(user, { id, name }) {
    id = typeof id === 'string' && id ? id : null;
    name = typeof name === 'string' ? name.trim().slice(0, 50) : '';
    if (id) {
        const other = await User.findByPk(id, { attributes: ['id', 'username'] }).catch(() => null);
        if (!other) return { error: 'Spieler nicht gefunden.' };
        name = other.username;
    }
    if (!name) return { error: 'Spieler nicht gefunden.' };
    if (id === user.id) return { error: 'Du kannst dich nicht selbst blockieren.' };
    const list = (user.blockedPlayers || []).slice();
    const entry = { id, name, at: new Date().toISOString() };
    if (list.some(b => blockKey(b) === blockKey(entry))) return { list: publicBlocks(user) };
    if (list.length >= MAX_BLOCKED) return { error: 'Du hast schon zu viele Spieler blockiert.' };
    user.blockedPlayers = list.concat(entry);
    await user.save();
    return { list: publicBlocks(user) };
}

async function unblock(user, key) {
    user.blockedPlayers = (user.blockedPlayers || []).filter(b => blockKey(b) !== key);
    await user.save();
    return { list: publicBlocks(user) };
}

// ── Admin ──────────────────────────────────────────────────────────────────────────────────

/** Reports with `status` ('open' or 'closed'), newest first. */
async function list({ status = 'open', offset = 0, limit = 50 } = {}) {
    const where = status === 'closed' ? { status: { [Op.ne]: 'open' } } : { status: 'open' };
    const { rows, count } = await Report.findAndCountAll({
        where, order: [['createdAt', status === 'closed' ? 'DESC' : 'ASC']],
        offset: Math.max(0, Number(offset) || 0), limit,
    });
    const open = status === 'open' ? count : await Report.count({ where: { status: 'open' } });
    // the reported accounts: name now, banned or not – for the admin's action buttons
    const ids = [...new Set(rows.map(r => r.reportedId).filter(Boolean))];
    const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'username', 'isBanned', 'role'] }) : [];
    const byId = new Map(users.map(u => [u.id, u]));
    return {
        total: count, open,
        reports: rows.map(r => {
            const u = r.reportedId && byId.get(r.reportedId);
            return {
                ...r.toJSON(),
                reportedAccount: u ? { id: u.id, username: u.username, isBanned: u.isBanned, role: u.role } : null,
            };
        }),
    };
}

/** Close or reopen a report, with an optional note. Returns null or an error. */
async function update(id, { status, note }, admin) {
    if (!STATUSES.includes(status)) return 'Ungültiger Status';
    const r = await Report.findByPk(id).catch(() => null);
    if (!r) return 'Meldung nicht gefunden';
    r.status = status;
    if (typeof note === 'string') r.note = note.trim().slice(0, 1000) || null;
    r.handledBy = status === 'open' ? null : admin.username;
    r.handledAt = status === 'open' ? null : new Date();
    await r.save();
    return null;
}

/** Account deletion: the account's name out of the reports and the block lists of others. */
async function removeUser(user, deletedName) {
    const reports = await Report.findAll({ where: { [Op.or]: [{ reporterId: user.id }, { reportedId: user.id }] } });
    for (const r of reports) {
        const doc = renameInState({ message: r.message, context: r.context }, user.username, deletedName);
        if (r.reporterId === user.id) Object.assign(r, { reporterId: null, reporterName: deletedName });
        if (r.reportedId === user.id) Object.assign(r, { reportedId: null, reportedName: deletedName });
        r.message = doc.message;
        r.context = doc.context;
        r.changed('message', true);
        r.changed('context', true);
        await r.save();
    }
    const blockers = await User.findAll({ where: { blockedPlayers: { [Op.contains]: [{ id: user.id }] } } });
    for (const u of blockers) {
        u.blockedPlayers = u.blockedPlayers.filter(b => b.id !== user.id);
        await u.save();
    }
}

async function cleanup() {
    try {
        const before = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
        const n = await Report.destroy({ where: { status: { [Op.ne]: 'open' }, handledAt: { [Op.lt]: before } } });
        if (n) console.log(`[Reports] Deleted ${n} closed report(s) older than ${KEEP_DAYS} days.`);
    } catch (err) {
        console.error('[Reports] Cleanup failed:', err);
    }
}

function startCleanup() {
    setTimeout(cleanup, 90 * 1000).unref();
    setInterval(cleanup, 6 * 60 * 60 * 1000).unref();
}

module.exports = { report, block, unblock, publicBlocks, list, update, removeUser, cleanup, startCleanup, KEEP_DAYS, STATUSES };
