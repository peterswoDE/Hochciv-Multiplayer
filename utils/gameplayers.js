/**
 * An account's matches through `game_players` (migrations/0003-game-players.js): one row per
 * account and match, kept in step with games.participants by a trigger and indexed by account and
 * date – instead of searching the participants JSON of every match.
 *
 * `replaced` rows are seats the KI took over from the account (replacedUserId); `own` leaves
 * them out (only seats the account itself played to the end, dbUserId).
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

/** Ids of the account's matches, newest first. */
async function gameIdsOf(userId, { limit = 50, offset = 0, own = false } = {}) {
    const rows = await sequelize.query(`
        SELECT "gameId", max("matchDate") AS d FROM game_players
        WHERE "userId" = :userId ${own ? 'AND NOT replaced' : ''}
        GROUP BY "gameId" ORDER BY d DESC NULLS LAST, "gameId" DESC LIMIT :limit OFFSET :offset`,
    { replacements: { userId, limit, offset }, type: QueryTypes.SELECT });
    return rows.map(r => r.gameId);
}

/** The account's numbers: matches (also taken over), single-player matches, wins in both. */
async function countsOf(userId) {
    const [r] = await sequelize.query(`
        SELECT count(DISTINCT "gameId")::int AS total,
               count(*) FILTER (WHERE solo AND NOT replaced)::int AS "soloGames",
               count(*) FILTER (WHERE won AND NOT solo AND NOT replaced)::int AS wins,
               count(*) FILTER (WHERE won AND solo AND NOT replaced)::int AS "soloWins"
        FROM game_players WHERE "userId" = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT });
    return r || { total: 0, soloGames: 0, wins: 0, soloWins: 0 };
}

/** Accounts in a match. */
async function usersOf(gameId) {
    const rows = await sequelize.query('SELECT DISTINCT "userId" FROM game_players WHERE "gameId" = :gameId',
        { replacements: { gameId }, type: QueryTypes.SELECT });
    return rows.map(r => r.userId);
}

/** Games in `rows` (Game instances) in the order of `ids`. */
const inOrder = (ids, rows) => {
    const byId = new Map(rows.map(g => [g.id, g]));
    return ids.map(id => byId.get(id)).filter(Boolean);
};

module.exports = { gameIdsOf, countsOf, usersOf, inOrder };
