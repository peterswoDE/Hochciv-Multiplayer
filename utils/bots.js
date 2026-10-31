/**
 * Bot accounts: accounts of programs that play like a player (the Hochciv-KI online client and
 * the like). A bot belongs to an owner – a bot creator (role 'botcreator') or an admin – and
 * logs in with a secret token instead of a password (POST /api/auth/bot):
 *
 *   · the token is shown once when the bot is created or its token renewed; only its SHA-256
 *     is stored, so the token is random enough to need no slow hash;
 *   · a bot works only while its owner may create bots and is not banned (botUsable): banning
 *     the owner or taking the role away stops all their bots, giving it back starts them again;
 *     deleting the owner deletes the bots (utils/deleteAccount.js);
 *   · bots play in lobbies and Rundenspiele whose host allows player-bots (sessions.js,
 *     async/logic.js) and in matchmaking with players who allow them (sockets/match.js). They
 *     share the MMR with everyone, but have their own leaderboard (GET /api/leaderboard?type=bot).
 *
 * The owner manages the bots on the account page (routes/bots.js, client/account.js).
 */
const crypto = require('crypto');
const config = require('../config');

const BOT_CREATOR_ROLES = ['botcreator', 'admin', 'superadmin'];
const isAdminRole = role => role === 'admin' || role === 'superadmin';

const isBot = user => !!user && user.accountType === 'bot';

/** May this account create and own bots? */
function canCreateBots(user) {
    return !!user && !isBot(user) && BOT_CREATOR_ROLES.includes(user.role);
}

/** How many bots `user` may own (Infinity for admins). */
function botLimitOf(user) {
    if (!canCreateBots(user)) return 0;
    if (isAdminRole(user.role)) return Infinity;
    return Number.isInteger(user.botLimit) ? user.botLimit : config.BOTS_PER_OWNER;
}

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

/** A new token: shown to the owner, the hash goes into botTokenHash. */
function newToken() {
    const token = 'hcbot_' + crypto.randomBytes(32).toString('base64url');
    return { token, hash: hashToken(token) };
}

/**
 * null if the bot may play now, else why not. `owner` is the bot's owner (or null if it has
 * none any more).
 */
function botUsable(bot, owner) {
    if (bot.isBanned) return 'Dieser Bot ist gesperrt.';
    if (!owner) return 'Dieser Bot hat keinen Besitzer.';
    if (owner.isBanned) return 'Der Besitzer dieses Bots ist gesperrt.';
    if (!canCreateBots(owner)) return 'Der Besitzer dieses Bots darf keine Bots mehr betreiben.';
    return null;
}

module.exports = { isBot, canCreateBots, botLimitOf, hashToken, newToken, botUsable, BOT_CREATOR_ROLES };
