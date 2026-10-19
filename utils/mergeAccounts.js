/**
 * Discord Activity players get an account automatically (no e-mail, no password, origin
 * 'activity'). When someone links that Discord account to their real account, the Activity
 * account is merged into it: game history, Rundenspiele, games played and MMR move over and the
 * Activity account is deleted.
 */
const { Op } = require('sequelize');
const { sequelize, User, Game, AsyncGame, Passkey } = require('../models');
const sessions = require('../sessions');
const { destroyOtherSessions } = require('./auth');
const mapService = require('../maps/service');

const ACTIVE_ASYNC = ['setup', 'placement', 'draft', 'playing'];

/** Only untouched Activity accounts are merged – once someone made it a real account, it stays. */
async function isMergeable(user) {
    return user.origin === 'activity' && !user.email && !user.password_hash && !user.googleId
        && !user.totpEnabled && user.role === 'user' && !user.isBanned
        && (await Passkey.count({ where: { UserId: user.id } })) === 0;
}

/**
 * Move everything of `from` (the Activity account) into `into`, then delete `from`.
 * Returns an error message instead if it can't be merged right now.
 */
async function mergeInto(into, from) {
    const activeAsync = await AsyncGame.count({
        where: { status: { [Op.in]: ACTIVE_ASYNC }, participantIds: { [Op.contains]: [from.id] } },
    });
    if (activeAsync) {
        return 'Das Discord-Konto spielt noch laufende Rundenspiele. Bitte beende sie zuerst und verknüpfe danach erneut.';
    }

    await sequelize.transaction(async transaction => {
        // Game history: seats of `from` become seats of `into`
        const has = field => `"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ [field]: from.id }]))}::jsonb`;
        const games = await Game.findAll({ where: sequelize.literal(`(${has('dbUserId')} OR ${has('replacedUserId')})`), transaction });
        for (const g of games) {
            g.participants = g.participants.map(p => {
                if (p.dbUserId === from.id) return { ...p, dbUserId: into.id, dbUsername: into.username };
                if (p.replacedUserId === from.id) return { ...p, replacedUserId: into.id };
                return p;
            });
            if (g.winnerUsername === from.username) g.winnerUsername = into.username;
            await g.save({ transaction });
        }

        // Finished / cancelled Rundenspiele (running ones were refused above)
        for (const col of ['participantIds', 'invitedIds', 'waitingIds']) {
            await sequelize.query(
                `UPDATE async_games SET "${col}" = array_replace("${col}", :from::uuid, :into::uuid) WHERE :from::uuid = ANY("${col}")`,
                { replacements: { from: from.id, into: into.id }, transaction });
        }
        await AsyncGame.update({ hostUserId: into.id }, { where: { hostUserId: from.id }, transaction });

        // Custom maps (with their codes) move over; equal names get a number
        await mapService.moveOwner(from.id, into.id, transaction);

        // Games played add up; the MMR the Activity account won or lost carries over
        into.gamesPlayed += from.gamesPlayed;
        into.mmr += from.mmr - 1000;
        const discordId = from.discordId;
        if (!into.avatarUrl && from.avatarUrl) into.avatarUrl = from.avatarUrl;
        await destroyOtherSessions(sequelize, from.id);
        await from.destroy({ transaction });
        into.discordId = discordId;
        await into.save({ transaction });
    });

    // Live games in memory: the seat now belongs to the merged account
    for (const s of sessions.getAllSessions().values()) {
        for (const p of s.players) {
            if (p.dbUserId === from.id) Object.assign(p, { dbUserId: into.id, dbUsername: into.username, mmr: into.mmr });
        }
    }
    console.log(`[Accounts] Merged Activity account ${from.username} (${from.id}) into ${into.username} (${into.id}).`);
    return null;
}

module.exports = { isMergeable, mergeInto };
