/**
 * The engine's log of a running Rundenspiel in its own table (scalability P1.4): the log
 * (`state.log`, up to 600 entries, most of the engine state) was written again with every move.
 *
 *   · async_log: one row per entry, by its `seq` (the engine counts them one up). While a game
 *     runs, async/service.js writes `state` without its log and inserts only the new entries;
 *     the oldest beyond the engine's 600 go. When the game ends the log goes back into `state`
 *     and its rows are deleted.
 *
 * Nothing moves here: a game whose `state` still holds its log is split with its next write.
 */
exports.up = async db => {
    await db.query(`CREATE TABLE IF NOT EXISTS async_log (
        "gameId" uuid NOT NULL REFERENCES async_games(id) ON DELETE CASCADE,
        seq integer NOT NULL,
        entry jsonb NOT NULL,
        PRIMARY KEY ("gameId", seq)
    )`);
};
