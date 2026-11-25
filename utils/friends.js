/**
 * Friends list (F8): requests, the list with online status and what friends do, suggestions
 * from recent games, and invitations of online friends into a live lobby.
 *
 * Rows: models/Friendship.js. Online status: utils/presence.js. Live games: sessions.js.
 * Changes are pushed to the affected accounts' sockets as 'friends:changed'; an invitation as
 * 'friends:invited'. Live invitations are kept in memory for INVITE_TTL_MS and listed with the
 * friends until the lobby starts or closes.
 *
 * Bot accounts (utils/bots.js) can be friends: a person asks, the bot's program accepts or
 * declines over the same API (bots never send requests). Inviting a bot friend into a live lobby
 * needs a lobby that takes one more player-bot (sessions.playerBotPolicy) and whose bot filter
 * lets this bot in (utils/botfilter.js); the bot finds the invitation in GET /api/friends or as
 * 'friends:invited' and joins with POST /api/sessions/join.
 */
const { Op } = require('sequelize');
const { sequelize, User, Game, Friendship } = require('../models');
const presence = require('./presence');
const GamePlayers = require('./gameplayers');
const sessions = require('../sessions');
const BotFilter = require('./botfilter');

const MAX_FRIENDS = 200;                 // friends and open requests together
const INVITE_TTL_MS = 15 * 60 * 1000;
const SUGGESTIONS = 8;

let io = null;
const liveInvites = new Map();           // inviteeId → [{ fromId, fromName, joinCode, password, hostName, at }]
const inviteCount = new Map();           // inviterId → [ms…] for a soft rate limit

const pairWhere = (a, b) => ({ [Op.or]: [{ userId: a, friendId: b }, { userId: b, friendId: a }] });
const blocks = (u, otherId) => (u.blockedPlayers || []).some(x => x && x.id === otherId);

/** Push to every open page of these accounts. */
function emitTo(userIds, event, data) {
    if (!io) return;
    for (const id of userIds) for (const sid of presence.socketsOf(id)) io.to(sid).emit(event, data);
}

function init(server) { io = server; }

// ── The list ──────────────────────────────────────────────────────────────────

/** The live invitations an account still has (lobbies that are still waiting). */
function invitesOf(userId) {
    const now = Date.now();
    const list = (liveInvites.get(userId) || []).filter(i => {
        if (now - i.at > INVITE_TTL_MS) return false;
        const s = sessions.lobbyByCode(i.joinCode);
        return !!s && s.status === 'lobby' && s.password === i.password;
    });
    if (list.length) liveInvites.set(userId, list); else liveInvites.delete(userId);
    return list.map(({ fromId, fromName, joinCode, password, hostName, at }) => ({ fromId, fromName, joinCode, password, hostName, at }));
}

/** Accounts the player met in their last games, who are not friends (or asked) yet. */
async function suggestionsFor(user, related) {
    const gameIds = await GamePlayers.gameIdsOf(user.id, { limit: 20, own: true });
    const games = gameIds.length ? GamePlayers.inOrder(gameIds, await Game.findAll({ where: { id: gameIds }, attributes: ['id', 'participants', 'matchDate'] })) : [];
    const seen = new Map();
    for (const g of games) {
        for (const p of g.participants || []) {
            if (!p.dbUserId || p.dbUserId === user.id || p.isBot || p.botAccount || related.has(p.dbUserId) || seen.has(p.dbUserId)) continue;
            if (blocks(user, p.dbUserId)) continue;
            seen.set(p.dbUserId, { id: p.dbUserId, username: p.dbUsername || p.name, lastGame: g.matchDate });
        }
    }
    const ids = [...seen.keys()].slice(0, SUGGESTIONS * 2);
    if (!ids.length) return [];
    // names may have changed, accounts may be gone or bots
    const alive = await User.findAll({ where: { id: ids, accountType: { [Op.ne]: 'bot' } }, attributes: ['id', 'username'] });
    return alive.map(u => ({ ...seen.get(u.id), username: u.username }))
        .sort((a, b) => new Date(b.lastGame) - new Date(a.lastGame)).slice(0, SUGGESTIONS);
}

async function list(user) {
    const rows = await Friendship.findAll({ where: { [Op.or]: [{ userId: user.id }, { friendId: user.id }] } });
    const otherOf = r => r.userId === user.id ? r.friendId : r.userId;
    const ids = rows.map(otherOf);
    const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'username', 'mmr', 'accountType'] }) : [];
    const byId = new Map(users.map(u => [u.id, u]));
    const friends = [], incoming = [], outgoing = [];
    for (const r of rows) {
        const u = byId.get(otherOf(r));
        if (!u) continue;
        const base = { id: u.id, username: u.username, since: r.updatedAt, bot: u.accountType === 'bot' };
        if (r.status === 'accepted') {
            const online = presence.isOnline(u.id);
            friends.push({ ...base, mmr: u.mmr, online, seen: online ? null : presence.seen(u.id), activity: online ? sessions.activityOf(u.id) : null });
        } else if (r.friendId === user.id) incoming.push(base);
        else outgoing.push(base);
    }
    // online first, then by name
    friends.sort((a, b) => (b.online - a.online) || a.username.localeCompare(b.username));
    return {
        friends, incoming, outgoing,
        invites: invitesOf(user.id),
        suggestions: await suggestionsFor(user, new Set(ids)),
        max: MAX_FRIENDS,
    };
}

// ── Requests ──────────────────────────────────────────────────────────────────

/** Ask `target` (username or { id }). Accepts right away when they asked us already. */
async function request(user, target) {
    if (user.accountType === 'bot') return { error: 'Bots schicken keine Freundschaftsanfragen.' };
    let other = null;
    if (target && target.id) other = await User.findByPk(String(target.id));
    else {
        const name = String((target && target.username) || '').trim();
        if (!name) return { error: 'Bitte einen Spielernamen eingeben.' };
        other = await User.findOne({ where: { username: name } })
            || await User.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('username')), name.toLowerCase()) });
    }
    if (!other) return { error: 'Diesen Spieler gibt es nicht.' };
    if (other.id === user.id) return { error: 'Du kannst dich nicht selbst als Freund hinzufügen.' };
    if (blocks(user, other.id) || blocks(other, user.id) || other.isBanned) return { error: 'Das geht bei diesem Spieler nicht.' };

    const row = await Friendship.findOne({ where: pairWhere(user.id, other.id) });
    if (row && row.status === 'accepted') return { error: 'Ihr seid schon befreundet.' };
    if (row && row.userId === user.id) return { error: 'Deine Anfrage läuft schon.' };
    if (row) return accept(user, other.id);           // they asked first: that's a yes

    const count = await Friendship.count({ where: { [Op.or]: [{ userId: user.id }, { friendId: user.id }] } });
    if (count >= MAX_FRIENDS) return { error: `Mehr als ${MAX_FRIENDS} Freunde und Anfragen gehen nicht.` };
    await Friendship.create({ userId: user.id, friendId: other.id, status: 'pending' });
    emitTo([other.id], 'friends:changed', { type: 'request', from: user.username });
    return { ok: true, status: 'pending', username: other.username };
}

async function accept(user, otherId) {
    const row = await Friendship.findOne({ where: { userId: String(otherId), friendId: user.id, status: 'pending' } });
    if (!row) return { error: 'Diese Anfrage gibt es nicht mehr.' };
    row.status = 'accepted';
    await row.save();
    emitTo([row.userId], 'friends:changed', { type: 'accepted', from: user.username });
    emitTo([user.id], 'friends:changed', { type: 'self' });
    return { ok: true, status: 'accepted' };
}

/** Decline a request, withdraw one's own, or end a friendship – whatever is between the two. */
async function remove(user, otherId) {
    const n = await Friendship.destroy({ where: pairWhere(user.id, String(otherId)) });
    if (!n) return { error: 'Diese Freundschaft gibt es nicht.' };
    emitTo([String(otherId)], 'friends:changed', { type: 'removed' });
    return { ok: true };
}

// ── Live invitations ──────────────────────────────────────────────────────────

/** From a live lobby the inviter sits in, to an accepted friend who is online. */
async function invite(user, otherId, joinCode) {
    otherId = String(otherId || '');
    const s = sessions.lobbyByCode(joinCode);
    if (!s || s.status !== 'lobby') return { error: 'Die Lobby gibt es nicht mehr oder das Spiel läuft schon.' };
    if (!s.players.some(p => p.dbUserId === user.id && p.connected)) return { error: 'Du bist nicht in dieser Lobby.' };
    const row = await Friendship.findOne({ where: { ...pairWhere(user.id, otherId), status: 'accepted' } });
    if (!row) return { error: 'Ihr seid nicht befreundet.' };
    if (!presence.isOnline(otherId)) return { error: 'Dein Freund ist gerade nicht online.' };
    if (s.players.some(p => p.dbUserId === otherId)) return { error: 'Dein Freund ist schon in der Lobby.' };
    const other = await User.findByPk(otherId, { attributes: ['id', 'accountType', 'ownerId'] });
    if (other && other.accountType === 'bot') {
        // the same rule as joining (sessions.joinSession): the host decides about player-bots
        const policy = sessions.playerBotPolicy(s);
        if (!policy.allowed) return { error: 'In dieser Lobby sind keine Spieler-Bots erlaubt.' };
        if (policy.free <= 0) return { error: 'In dieser Lobby ist kein Platz mehr für Spieler-Bots.' };
        // and which bots (utils/botfilter.js) – friends of the host, not of the one who invites
        const refused = BotFilter.reason(s, { id: other.id, ownerId: other.ownerId, friend: await BotFilter.isHostFriend(s, other.id) });
        if (refused) return { error: refused };
    }
    const now = Date.now();
    const recent = (inviteCount.get(user.id) || []).filter(t => now - t < 60000);
    if (recent.length >= 10) return { error: 'Zu viele Einladungen. Bitte warte einen Moment.' };
    inviteCount.set(user.id, recent.concat(now));

    const hostName = s.players[s.hostIndex] ? s.players[s.hostIndex].name : user.username;
    const inv = { fromId: user.id, fromName: user.username, joinCode: s.joinCode, password: s.password, hostName, at: now };
    const list = (liveInvites.get(otherId) || []).filter(i => !(i.fromId === user.id && i.joinCode === s.joinCode));
    liveInvites.set(otherId, list.concat(inv).slice(-10));
    emitTo([otherId], 'friends:invited', inv);
    return { ok: true };
}

/** Account deleted: its friendships go with it. */
async function removeUser(userId, transaction) {
    liveInvites.delete(userId);
    await Friendship.destroy({ where: { [Op.or]: [{ userId }, { friendId: userId }] }, transaction });
}

/** Discord Activity account merged into a real one: its friends move over (no doubles). */
async function mergeUser(fromId, intoId, transaction) {
    const rows = await Friendship.findAll({ where: { [Op.or]: [{ userId: fromId }, { friendId: fromId }] }, transaction });
    for (const r of rows) {
        const other = r.userId === fromId ? r.friendId : r.userId;
        const clash = other === intoId || await Friendship.count({ where: pairWhere(intoId, other), transaction });
        if (clash) { await r.destroy({ transaction }); continue; }
        if (r.userId === fromId) r.userId = intoId; else r.friendId = intoId;
        await r.save({ transaction });
    }
}

module.exports = { init, list, request, accept, remove, invite, removeUser, mergeUser, emitTo, MAX_FRIENDS };
