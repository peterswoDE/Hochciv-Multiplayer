/**
 * Books a finished game (R-18 of the findings report): the MMR of every rated account, the
 * "games played" counters and the match record (games) in one database transaction – either all
 * of it is stored or nothing. The accounts' rows are locked (SELECT … FOR UPDATE, in id order)
 * and their MMR read inside the transaction, so a live and a Rundenspiel result of the same
 * account at the same time can't overwrite each other.
 *
 * Used by the live games (sockets/game.js processGameOverMmr) and the Rundenspiele
 * (async/service.js processResult).
 *
 *   book({ players, ranked, penalty, record, after }) → the created Game
 *
 *   players  – participants { dbUserId, points, isWinner, … }; gets mmr (and mmrShift, oldMmr,
 *              newMmr when ranked)
 *   penalty  – { userIds, mmr } – resigned accounts: a played game, in ranked games −mmr
 *   record   – players → the fields of the Game row
 *   after    – (game, transaction) → more writes that belong to the same result
 */
const { sequelize, User, Game } = require('../models');
const { calculateMMR } = require('./mmr');

const BASE_MMR = 1000;
const PLAYED = () => sequelize.literal('"gamesPlayed" + 1');

async function book({ players, ranked, penalty, record, after }) {
    return sequelize.transaction(async transaction => {
        const penalized = (penalty && penalty.userIds) || [];
        const ids = [...new Set(players.map(p => p.dbUserId).filter(Boolean).concat(penalized))].sort();
        const rows = ids.length ? await User.findAll({
            where: { id: ids }, attributes: ['id', 'mmr'], order: [['id', 'ASC']],
            lock: transaction.LOCK.UPDATE, transaction,
        }) : [];
        const mmr = new Map(rows.map(r => [r.id, r.mmr]));
        for (const p of players) p.mmr = p.dbUserId && mmr.has(p.dbUserId) ? mmr.get(p.dbUserId) : BASE_MMR;

        if (ranked) {
            for (const r of calculateMMR(players)) {
                const p = players.find(x => x.dbUserId != null && x.dbUserId === r.dbUserId);
                if (!p) continue;
                Object.assign(p, { mmrShift: r.mmrChange, oldMmr: r.oldMmr, newMmr: r.newMmr });
                await User.update({ mmr: r.newMmr, gamesPlayed: PLAYED() }, { where: { id: p.dbUserId }, transaction });
            }
        } else {
            for (const p of players.filter(x => x.dbUserId))
                await User.update({ gamesPlayed: PLAYED() }, { where: { id: p.dbUserId }, transaction });
        }
        for (const id of penalized) {
            await User.update({
                gamesPlayed: PLAYED(),
                ...(ranked && penalty.mmr ? { mmr: sequelize.literal(`GREATEST("mmr" - ${Number(penalty.mmr)}, 0)`) } : {}),
            }, { where: { id }, transaction });
        }

        const game = await Game.create(record(players), { transaction });
        if (after) await after(game, transaction);
        return game;
    });
}

module.exports = { book, BASE_MMR };
