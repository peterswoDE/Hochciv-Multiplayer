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

module.exports = { detachUser };
