/**
 * Database migrations: the numbered files in migrations/ (0001-baseline.js, 0002-….js, …) run once
 * each, in order, every one in its own transaction, and are recorded in `schema_migrations`.
 *
 * In Docker they run before the server starts (entrypoint.sh → scripts/migrate.js) as the owner
 * role from MIGRATION_DATABASE_URL. The server itself connects with the app role (DATABASE_URL),
 * which may read and write rows but not change the schema – it calls migrate() too, which then
 * finds nothing to do. Without MIGRATION_DATABASE_URL (`npm start`, an installation that has not
 * set up the roles yet) both use DATABASE_URL. See docs/reference/database.md.
 *
 * A migration exports `up(db)`: `db` is a pg client inside the migration's transaction.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', 'migrations');
// pg_advisory_lock key: one process migrates a database at a time
const LOCK = 731_013;

// The migration log. scripts/db-setup.js creates it too, so that the app role can only read it
const TABLE = 'CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(255) PRIMARY KEY, "appliedAt" timestamptz NOT NULL DEFAULT now())';

const names = () => fs.readdirSync(DIR).filter(f => /^\d{4}-[\w-]+\.js$/.test(f)).sort().map(f => f.slice(0, -3));

/** Connect – with retries: at a cold start the database may not take connections yet. */
async function connect(url, attempts = 10) {
    for (let i = 1; ; i++) {
        const client = new Client({ connectionString: url });
        try {
            await client.connect();
            return client;
        } catch (err) {
            await client.end().catch(() => { });
            if (i >= attempts) throw err;
            console.warn(`[DB] Not reachable yet (${err.message}), attempt ${i} of ${attempts} – retrying in 3 s`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

/** Names of the migrations not applied yet. */
async function pending(db) {
    const { rows: [t] } = await db.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok");
    const done = new Set(t.ok ? (await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name) : []);
    return { table: t.ok, todo: names().filter(n => !done.has(n)) };
}

/** Apply the pending migrations; resolves with their names (empty: the schema is current). */
async function migrate(url, { log = console.log } = {}) {
    const db = await connect(url);
    try {
        await db.query('SELECT pg_advisory_lock($1)', [LOCK]);
        const { table, todo } = await pending(db);
        if (!todo.length) return [];
        if (!table) await db.query(TABLE);
        for (const name of todo) {
            await db.query('BEGIN');
            try {
                await require(path.join(DIR, name + '.js')).up(db);
                await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
                await db.query('COMMIT');
            } catch (err) {
                await db.query('ROLLBACK').catch(() => { });
                const hint = err.code === '42501' ? ' – this role may not change the schema; run the migrations with the owner role (MIGRATION_DATABASE_URL)' : '';
                throw new Error(`Migration ${name} failed: ${err.message}${hint}`);
            }
            log(`[DB] Migration ${name} applied`);
        }
        return todo;
    } finally {
        await db.end().catch(() => { }); // also releases the lock
    }
}

module.exports = { migrate, names, TABLE };
