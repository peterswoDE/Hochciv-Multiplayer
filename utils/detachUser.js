/**
 * An account that is deleted or banned leaves the running parts at once, not only at its next
 * login (utils/deleteAccount.js, routes/admin.js ban):
 *
 *   · live games: the seat plays on, but without the account – no result, MMR or chat texts for
 *     it any more (a seat without an account is a guest's: emotes only);
 *   · open sockets (live games, Rundenspiele, matchmaking) are disconnected. A new connection
 *     loads the login again, and a banned or deleted account has none.
 */
const sessions = require('../sessions');

async function detachUser(io, userId) {
    for (const s of sessions.getAllSessions().values()) {
        for (const p of s.players) if (p.dbUserId === userId) Object.assign(p, { dbUserId: null, dbUsername: null });
    }
    if (!io) return;
    for (const s of await io.fetchSockets()) {
        const u = s.request && s.request.user;
        if ((u && u.id === userId) || s.data.userId === userId || s.data.matchUserId === userId) s.disconnect(true);
    }
}

/**
 * The password changed (or was reset): close the open sockets of `userId` except those of the
 * session `keepSid`. A socket keeps the login it had when it connected, so deleting the other
 * sessions in the database alone would leave their sockets logged in.
 */
async function disconnectSessions(io, userId, keepSid = null) {
    if (!io) return;
    for (const s of await io.fetchSockets()) {
        const u = s.request && s.request.user;
        if (u && u.id === userId && (!keepSid || s.request.sessionID !== keepSid)) s.disconnect(true);
    }
}

module.exports = { detachUser, disconnectSessions };
