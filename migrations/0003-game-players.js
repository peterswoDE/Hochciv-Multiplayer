/**
 * Performance of everything that looks up an account's matches (profiles, badges, seasons,
 * statistics, friends): until now each of those read the whole `games` table and cast every
 * row's participants JSON – seconds per profile of a bot with thousands of matches.
 *
 *   · game_players: one row per account and match – the seat's player (dbUserId) and, for a seat
 *     the KI took over, the account that left (replacedUserId, `replaced`). Indexed by account
 *     and date. A trigger on `games` keeps it in step with `participants` whatever writes them
 *     (end of a game, single-player results, account merges, deletions, renames), and the rows
 *     go with their match (ON DELETE CASCADE).
 *   · games: an index on the participants (for the few lookups that still search the JSON) and
 *     one on matchDate (newest first, season ranges).
 */
exports.up = async db => {
    await db.query(`CREATE TABLE IF NOT EXISTS game_players (
        "gameId" uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        "userId" uuid NOT NULL,
        seat smallint NOT NULL,
        replaced boolean NOT NULL DEFAULT false,
        won boolean NOT NULL DEFAULT false,
        solo boolean NOT NULL DEFAULT false,
        ranked boolean NOT NULL DEFAULT false,
        "botAccount" boolean NOT NULL DEFAULT false,
        "matchDate" timestamptz
    )`);
    await db.query('CREATE INDEX IF NOT EXISTS game_players_user_date ON game_players ("userId", "matchDate" DESC) INCLUDE (won, solo, replaced, ranked)');
    await db.query('CREATE INDEX IF NOT EXISTS game_players_game ON game_players ("gameId")');
    await db.query('CREATE INDEX IF NOT EXISTS game_players_ranked_date ON game_players ("matchDate") WHERE ranked AND NOT replaced');

    // The rows of one match from its participants. A seat counts as won only for its own player;
    // `solo` is the match (a single-player game), `ranked` the seat (it has its MMR change).
    await db.query(`CREATE OR REPLACE FUNCTION game_players_rows(g games) RETURNS TABLE (
            "gameId" uuid, "userId" uuid, seat smallint, replaced boolean, won boolean, solo boolean,
            ranked boolean, "botAccount" boolean, "matchDate" timestamptz) LANGUAGE sql STABLE AS $$
        WITH seats AS (SELECT p, (n - 1)::smallint AS seat FROM json_array_elements(g.participants) WITH ORDINALITY AS e(p, n)),
             game AS (SELECT EXISTS (SELECT 1 FROM seats WHERE (p->>'solo') = 'true') AS solo)
        SELECT g.id, (s.p->>'dbUserId')::uuid, s.seat, false, coalesce(s.p->>'isWinner', 'false') = 'true', game.solo,
               (s.p::jsonb ? 'oldMmr'), coalesce(s.p->>'botAccount', 'false') = 'true', g."matchDate"
          FROM seats s, game WHERE s.p->>'dbUserId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        UNION ALL
        SELECT g.id, (s.p->>'replacedUserId')::uuid, s.seat, true, false, game.solo, false, false, g."matchDate"
          FROM seats s, game WHERE s.p->>'replacedUserId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $$`);
    await db.query(`CREATE OR REPLACE FUNCTION game_players_sync() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF NEW.participants::text = OLD.participants::text AND NEW."matchDate" IS NOT DISTINCT FROM OLD."matchDate" THEN
                    RETURN NEW;
                END IF;
                DELETE FROM game_players WHERE "gameId" = NEW.id;
            END IF;
            INSERT INTO game_players SELECT * FROM game_players_rows(NEW);
            RETURN NEW;
        END $$`);
    await db.query('DROP TRIGGER IF EXISTS games_game_players ON games');
    await db.query(`CREATE TRIGGER games_game_players AFTER INSERT OR UPDATE OF participants, "matchDate" ON games
        FOR EACH ROW EXECUTE FUNCTION game_players_sync()`);

    // the matches so far
    await db.query('DELETE FROM game_players');
    await db.query('INSERT INTO game_players SELECT r.* FROM games g, LATERAL game_players_rows(g) r');
    await db.query('ANALYZE game_players');

    await db.query('CREATE INDEX IF NOT EXISTS games_participants ON games USING gin ((participants::jsonb) jsonb_path_ops)');
    await db.query('CREATE INDEX IF NOT EXISTS games_match_date ON games ("matchDate" DESC)');
};
