/**
 * Chat moderation: reports, the word filter's auto-reports, and blocks.
 *
 *   · Report: a player reports another player's chat message (live game: sockets/game.js,
 *     Rundenspiel: async/service.js). The game's chat history is stored with it, as the server
 *     has it, and an admin reviews it on the account page (routes/admin.js /reports).
 *   · Auto-report (moderate): a text with bad language (utils/profanity.js) is not sent but
 *     reported, and its sender can't write texts for 5 minutes – after a second one, for the
 *     rest of the game. Emotes and pings stay possible.
 *   · Guests (no account) can't write texts at all, only emotes and pings.
 *   · Block: a player stops seeing an account's messages and pings. The list is kept with the
 *     account (users.blockedPlayers), for guests on the device; the client hides the messages
 *     (client/chat.js). Guests can't be blocked – only muted for the running game, on the device.
 *
 * Reports are kept while the reported account exists; without one (a guest, a deleted account)
 * KEEP_YEARS after the report.
 */
const { Op } = require('sequelize');
const { Report, User } = require('../models');
const { renameInState } = require('./rename');
const profanity = require('./profanity');

const KEEP_YEARS = Number(process.env.REPORT_KEEP_YEARS) || 3;    // reports without an account
const MUTE_MS = Number(process.env.CHAT_MUTE_MS) || 5 * 60 * 1000;  // first strike
const AUTO_REPORTER = 'Wortfilter';
const GUEST_TEXT = 'Gäste können nur Emojis senden. Melde dich an, um zu schreiben.';
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

// ── Word filter: auto-report and the writing timeout ───────────────────────────────────────
// mute = { strikes, until (ms, first strike) | null, game: true (rest of the game) } | null

const muteActive = (mute, now = Date.now()) => !!mute && (mute.game || (mute.until || 0) > now);

/**
 * Checks a text message before it is sent. Returns null (fine) or { error, mute } after the
 * message was auto-reported: not sent, the sender gets the next strike.
 * `history`: the game's chat so far, `sender`: { id, name }.
 */
async function moderate({ source, sourceId, history, msg, sender, mute }) {
    const words = profanity.check(msg.text);
    if (!words.length) return null;
    const strikes = ((mute && mute.strikes) || 0) + 1;
    const next = strikes >= 2 ? { strikes, until: null, game: true } : { strikes, until: Date.now() + MUTE_MS, game: false };
    await Report.create({
        kind: 'chat', source, sourceId, auto: true, matches: words, penalty: next.game ? 'game' : 'timeout',
        reporterId: null, reporterName: AUTO_REPORTER,
        reportedId: sender.id || null, reportedName: sender.name,
        message: msg,
        context: (history || []).filter(m => m && m.kind !== 'ping').concat(msg),
    });
    console.log(`[Reports] Word filter: message of ${sender.name} blocked (${source} ${sourceId}, strike ${strikes}).`);
    return {
        error: next.game ? 'Unangemessene Sprache: nicht gesendet. Du kannst in diesem Spiel keine Texte mehr schreiben.'
            : 'Unangemessene Sprache: nicht gesendet. Du kannst 5 Minuten lang keine Texte schreiben.',
        mute: next,
    };
}

// forget idle reporters now and then
setInterval(() => {
    const now = Date.now();
    for (const [k, list] of recent) if (!list.some(t => now - t < RATE_WINDOW_MS)) recent.delete(k);
}, 10 * 60 * 1000).unref();

// ── Blocks (logged-in players) ─────────────────────────────────────────────────────────────

const blockKey = b => 'id:' + b.id;
// entries from before guests could no longer be blocked (by name) are left out
const accountBlocks = user => (user.blockedPlayers || []).filter(b => b && b.id);

/** The list as the client gets it: [{ key, id, name, at }]. */
const publicBlocks = user => accountBlocks(user).map(b => ({ key: blockKey(b), id: b.id, name: b.name, at: b.at }));

/** Block an account. Guests can't be blocked. Returns { list } or { error }. */
async function block(user, { id }) {
    if (typeof id !== 'string' || !id) return { error: 'Gäste kannst du nicht blockieren.' };
    const other = await User.findByPk(id, { attributes: ['id', 'username'] }).catch(() => null);
    if (!other) return { error: 'Spieler nicht gefunden.' };
    if (id === user.id) return { error: 'Du kannst dich nicht selbst blockieren.' };
    const list = accountBlocks(user);
    const entry = { id, name: other.username, at: new Date().toISOString() };
    if (list.some(b => blockKey(b) === blockKey(entry))) return { list: publicBlocks(user) };
    if (list.length >= MAX_BLOCKED) return { error: 'Du hast schon zu viele Spieler blockiert.' };
    user.blockedPlayers = list.concat(entry);
    await user.save();
    return { list: publicBlocks(user) };
}

async function unblock(user, key) {
    user.blockedPlayers = accountBlocks(user).filter(b => blockKey(b) !== key);
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

/** Reports about an account stay while it exists; the others go KEEP_YEARS after the report. */
async function cleanup() {
    try {
        const before = new Date();
        before.setFullYear(before.getFullYear() - KEEP_YEARS);
        const n = await Report.destroy({ where: { reportedId: null, createdAt: { [Op.lt]: before } } });
        if (n) console.log(`[Reports] Deleted ${n} report(s) without an account, older than ${KEEP_YEARS} years.`);
    } catch (err) {
        console.error('[Reports] Cleanup failed:', err);
    }
}

function startCleanup() {
    setTimeout(cleanup, 90 * 1000).unref();
    setInterval(cleanup, 6 * 60 * 60 * 1000).unref();
}

module.exports = {
    report, moderate, muteActive, block, unblock, publicBlocks, list, update, removeUser, cleanup, startCleanup,
    KEEP_YEARS, MUTE_MS, STATUSES, GUEST_TEXT, AUTO_REPORTER,
};
