/**
 * Who is online (F8 friends list): logged-in accounts with an open Socket.IO connection – the
 * game page connects as soon as a player is logged in (client/friends.js). Kept in memory; after
 * a restart everybody is offline until their page reconnects.
 */
const online = new Map();      // userId → Set of socket ids
const lastSeen = new Map();    // userId → ms of the last disconnect

function add(userId, socketId) {
    if (!online.has(userId)) online.set(userId, new Set());
    online.get(userId).add(socketId);
}

function remove(userId, socketId) {
    const set = online.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (!set.size) {
        online.delete(userId);
        lastSeen.set(userId, Date.now());
    }
}

const isOnline = userId => online.has(userId);
const socketsOf = userId => [...(online.get(userId) || [])];
const seen = userId => lastSeen.get(userId) || null;

module.exports = { add, remove, isOnline, socketsOf, seen };
