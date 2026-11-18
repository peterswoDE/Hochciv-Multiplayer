/**
 * The starting point: the schema as `sequelize.sync({ alter: true })` kept it up to this release.
 * An empty database gets it from 0001-baseline.sql. A database from before migrations already has
 * it (the server synced it at every start) – there this only does what server.js still did at
 * startup until then.
 */
const fs = require('fs');
const path = require('path');

exports.up = async db => {
    const { rows: [r] } = await db.query("SELECT to_regclass('public.users') IS NOT NULL AS existing");
    if (!r.existing) {
        await db.query(fs.readFileSync(path.join(__dirname, '0001-baseline.sql'), 'utf8'));
        return;
    }
    // Login sessions (connect-pg-simple) – server.js created the table at every start
    await db.query(`CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE)`);
    await db.query('CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")');
    // Weekly challenge: many attempts per week (utils/challenge.js dropped the old unique index at every start)
    await db.query('DROP INDEX IF EXISTS "challenge_results_week_user_key"');
};
