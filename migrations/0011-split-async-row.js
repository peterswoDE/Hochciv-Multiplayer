/**
 * The row of a Rundenspiel in parts (scalability P1.4): until now every save wrote the whole of
 * `data` – chat, statistics, marks and scenes included – with every move.
 *
 *   · async_chat: one row per chat message (insert per message, the last 200 per game kept);
 *     the messages go with their game (ON DELETE CASCADE) and are deleted when it ends.
 *   · async_games.stats, .marks, .scenes: their own columns. async/service.js writes only the
 *     columns that changed, and these three once per turn (at the latest a minute after a change),
 *     not with every move.
 *
 * The existing chats, statistics, marks and scenes move out of `data`.
 */
exports.up = async db => {
    await db.query(`CREATE TABLE IF NOT EXISTS async_chat (
        id bigserial PRIMARY KEY,
        "gameId" uuid NOT NULL REFERENCES async_games(id) ON DELETE CASCADE,
        msg jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await db.query('CREATE INDEX IF NOT EXISTS async_chat_game ON async_chat ("gameId", id)');
    await db.query(`INSERT INTO async_chat ("gameId", msg)
        SELECT g.id, m.msg FROM async_games g
         CROSS JOIN LATERAL jsonb_array_elements(g.data->'chat') WITH ORDINALITY AS m(msg, n)
         WHERE jsonb_typeof(g.data->'chat') = 'array' AND g.status NOT IN ('finished', 'cancelled')
         ORDER BY g.id, m.n`);

    for (const col of ['stats', 'marks', 'scenes']) {
        await db.query(`ALTER TABLE async_games ADD COLUMN IF NOT EXISTS ${col} jsonb`);
    }
    await db.query(`UPDATE async_games SET
            stats = CASE WHEN jsonb_typeof(data->'stats') = 'object' THEN data->'stats' END,
            marks = CASE WHEN jsonb_typeof(data->'marks') = 'object' THEN data->'marks' END,
            scenes = CASE WHEN jsonb_typeof(data->'scenes') = 'object' AND status = 'playing' THEN data->'scenes' END,
            data = data - 'chat' - 'stats' - 'marks' - 'scenes'
        WHERE data ?| ARRAY['chat', 'stats', 'marks', 'scenes']`);
};
