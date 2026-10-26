/**
 * Delete an account – by the user (account page) or by an admin. The game history stays for the
 * other players, but no game points to the account any more: its seats are anonymized, running
 * Rundenspiele go on without it (async/logic.js removeUser), live games drop the account link.
 */
const { sequelize, User, Game, Passkey, TotpToken, DeviceToken } = require('../models');
const sessions = require('../sessions');
const asyncService = require('../async/service');
const mapService = require('../maps/service');
const replay = require('./replay');
const reports = require('./reports');
const { DELETED_NAME } = require('../async/logic');
const { destroyOtherSessions } = require('./auth');
const { sendMail } = require('./mailer');

/** A real address that mails can go to (not the placeholder of OAuth accounts without e-mail). */
const mailable = email => !!email && !email.endsWith('@oauth.local');

/**
 * Returns an error message if the account can't be deleted right now, null when it is gone.
 * `byAdmin`: the username of the admin, for the log and the e-mail.
 */
async function deleteAccount(user, { io = null, byAdmin = null } = {}) {
    if (user.role === 'superadmin' && (await User.count({ where: { role: 'superadmin' } })) <= 1) {
        return 'Das ist der letzte Super-Administrator. Ernenne zuerst einen anderen.';
    }
    const removed = await asyncService.removeUser(user.id);
    if (removed.error) return removed.error;

    const renamed = [];         // { gameId, from } – the replays are rewritten after the transaction
    await sequelize.transaction(async transaction => {
        // Game history: the seats stay (other players' results), without name and account
        const has = field => `"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ [field]: user.id }]))}::jsonb`;
        const games = await Game.findAll({ where: sequelize.literal(`(${has('dbUserId')} OR ${has('replacedUserId')})`), transaction });
        for (const g of games) {
            const names = g.participants.filter(p => p.dbUserId === user.id || p.replacedUserId === user.id).map(p => p.name);
            g.participants = g.participants.map(p => {
                if (p.dbUserId === user.id) return { ...p, dbUserId: null, dbUsername: null, name: DELETED_NAME };
                if (p.replacedUserId === user.id) return { ...p, replacedUserId: null, name: DELETED_NAME };
                return p;
            });
            if (g.winnerUsername === user.username) g.winnerUsername = null;
            // the statistics over the rounds name the players too (utils/stats.js)
            if (g.stats && g.stats.players) {
                g.stats = { ...g.stats, players: g.stats.players.map(p => (names.includes(p.name) ? { ...p, name: DELETED_NAME } : p)) };
            }
            await g.save({ transaction });
            for (const from of names) renamed.push({ gameId: g.id, from });
        }
        await Passkey.destroy({ where: { UserId: user.id }, transaction });
        await mapService.removeOwner(user.id, transaction);      // own maps, published ones too
        await TotpToken.destroy({ where: { UserId: user.id }, transaction });
        await DeviceToken.destroy({ where: { UserId: user.id }, transaction });
        await user.destroy({ transaction });
    });
    await destroyOtherSessions(sequelize, user.id);

    // Chat reports keep the conversation, without the name; nobody blocks the account any more
    try { await reports.removeUser(user, DELETED_NAME); } catch (err) { console.error('[Accounts] Reports cleanup failed:', err); }

    // Replays name the players in every state and in the log (utils/replay.js)
    for (const { gameId, from } of renamed) {
        try { await replay.renameInReplay(gameId, from, DELETED_NAME); } catch (err) { console.error('[Accounts] Replay rename failed:', err); }
    }

    // Live games in memory: the seat plays on, but its result no longer goes to the account
    for (const s of sessions.getAllSessions().values()) {
        for (const p of s.players) if (p.dbUserId === user.id) Object.assign(p, { dbUserId: null, dbUsername: null });
    }
    if (io) {
        for (const s of await io.fetchSockets()) {
            const u = s.request && s.request.user;
            if ((u && u.id === user.id) || s.data.userId === user.id) s.disconnect(true);
        }
    }

    console.log(`[Accounts] Deleted account ${user.username} (${user.id})${byAdmin ? ` by admin ${byAdmin}` : ''}.`);
    if (mailable(user.email)) {
        const text = byAdmin
            ? `Dein Hochciv-Konto ${user.username} wurde von einem Administrator gelöscht.`
            : `Dein Hochciv-Konto ${user.username} wurde gelöscht. Schade, dass du gehst!`;
        sendMail(user.email, 'Hochciv-Konto gelöscht', text, text)
            .catch(err => console.error('[Accounts] Deletion mail failed:', err));
    }
    return null;
}

module.exports = { deleteAccount };
