/**
 * The arena (async/ladder.js) no longer reads every ladder game for its standings (scalability P1.6):
 *
 *   · async_games."arenaLadder": a ladder game (its data.config.arenaLadder, set once at creation),
 *     with a partial index – the ladder finds its games without searching the JSON of every row.
 *   · arena_standings: one row per game version and bot – games counted, wins, draws. A bot's row
 *     is made when it gets its first ladder game of a version (games 0) and counted when a game is
 *     booked (async/service.js processResult, in the booking's transaction).
 *
 * The existing ladder games are marked and counted here, with the rules of ladder.standingsOf: a
 * game counts once it is finished and booked (data.result.gameId); a bot the KI replaced lost; one
 * winner wins, more than one is a draw for every bot that played to the end; the name is the
 * bot's name in its first game.
 */
exports.up = async db => {
    await db.query('ALTER TABLE async_games ADD COLUMN IF NOT EXISTS "arenaLadder" boolean NOT NULL DEFAULT false');
    await db.query(`UPDATE async_games SET "arenaLadder" = true WHERE data @> '{"config":{"arenaLadder":true}}'`);
    await db.query('CREATE INDEX IF NOT EXISTS async_games_arena_ladder ON async_games ("createdAt", id) WHERE "arenaLadder"');

    await db.query(`CREATE TABLE IF NOT EXISTS arena_standings (
        version varchar(32) NOT NULL,
        "userId" uuid NOT NULL,
        name varchar(255) NOT NULL,
        games integer NOT NULL DEFAULT 0,
        wins integer NOT NULL DEFAULT 0,
        draws integer NOT NULL DEFAULT 0,
        PRIMARY KEY (version, "userId")
    )`);
    await db.query(`INSERT INTO arena_standings (version, "userId", name, games, wins, draws)
        SELECT g.data->>'engine', (s.seat->>'userId')::uuid,
               (array_agg(coalesce(s.seat->>'name', '') ORDER BY g."createdAt", g.id))[1],
               count(*) FILTER (WHERE c.counted),
               count(*) FILTER (WHERE c.counted AND NOT c.replaced AND c.winners = 1 AND (g.data->'result'->'winners') ? (s.seat->>'name')),
               count(*) FILTER (WHERE c.counted AND NOT c.replaced AND c.winners <> 1)
          FROM async_games g
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(g.data->'seats') = 'array' THEN g.data->'seats' ELSE '[]' END) AS s(seat)
         CROSS JOIN LATERAL (SELECT
                g.status = 'finished' AND g.data->'result'->>'gameId' IS NOT NULL AS counted,
                coalesce(s.seat->>'replaced', 'false') = 'true' AS replaced,
                CASE WHEN jsonb_typeof(g.data->'result'->'winners') = 'array' THEN jsonb_array_length(g.data->'result'->'winners') ELSE 0 END AS winners) c
         WHERE g."arenaLadder" AND g.data->>'engine' IS NOT NULL
           AND s.seat->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         GROUP BY 1, 2
        ON CONFLICT DO NOTHING`);
};
