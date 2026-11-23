/**
 * Creates the two database roles the server uses and hands the existing tables to the owner.
 * Runs as the database superuser – in Docker as the one-shot container `…-db-setup` at every
 * `docker compose up` (idempotent), before the server starts:
 *
 *   hochciv_owner  owns the tables; runs the migrations (MIGRATION_DATABASE_URL, entrypoint.sh)
 *   hochciv_app    the server: SELECT/INSERT/UPDATE/DELETE on the tables, nothing else (DATABASE_URL)
 *
 * Neither is a superuser, can create databases or roles. The superuser's password stays with the
 * database container and this script; the server never gets it.
 *
 * Environment: DB_HOST (default hochciv-db), DB_PORT (5432), POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
 * POSTGRES_OWNER_PASSWORD, POSTGRES_APP_PASSWORD.
 */
const { Client } = require('pg');

const OWNER = 'hochciv_owner';
const APP = 'hochciv_app';

function env(name, fallback) {
    const v = process.env[name] || fallback;
    if (!v) { console.error(`[DB setup] ${name} is not set`); process.exit(1); }
    return v;
}

async function connect(cfg, attempts = 20) {
    for (let i = 1; ; i++) {
        const client = new Client(cfg);
        try { await client.connect(); return client; } catch (err) {
            await client.end().catch(() => { });
            if (i >= attempts) throw err;
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

async function main() {
    const database = env('POSTGRES_DB', 'hochciv');
    const passwords = { [OWNER]: env('POSTGRES_OWNER_PASSWORD'), [APP]: env('POSTGRES_APP_PASSWORD') };
    if (passwords[OWNER] === passwords[APP]) throw new Error('POSTGRES_OWNER_PASSWORD and POSTGRES_APP_PASSWORD must differ');
    // The compose files put both into URLs (DATABASE_URL, MIGRATION_DATABASE_URL) unencoded: a
    // character like @ / # % : would leave the server unable to parse them ("Invalid URL") – refuse
    // here, before the server starts with them
    for (const [name, pw] of [['POSTGRES_OWNER_PASSWORD', passwords[OWNER]], ['POSTGRES_APP_PASSWORD', passwords[APP]]]) {
        if (!/^[A-Za-z0-9._~-]+$/.test(pw)) throw new Error(`${name} may only contain letters, digits and . _ ~ - (it goes into a URL) – e.g. openssl rand -hex 24`);
    }
    const db = await connect({
        host: env('DB_HOST', 'hochciv-db'), port: Number(process.env.DB_PORT) || 5432, database,
        user: env('POSTGRES_USER', 'hochciv'), password: env('POSTGRES_PASSWORD'),
    });
    const q = (text, params) => db.query(text, params);
    // Statements with identifiers and literals that pg can't bind: quoted by the server itself
    const exec = async (fmt, ...args) =>
        q((await q(`SELECT format($1${args.map((_, i) => `, $${i + 2}::text`).join('')}) AS s`, [fmt, ...args])).rows[0].s);
    try {
        await q('BEGIN');
        for (const role of [OWNER, APP]) {
            const { rowCount } = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
            await exec(`${rowCount ? 'ALTER' : 'CREATE'} ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L`, role, passwords[role]);
            console.log(`[DB setup] Role ${role} ${rowCount ? 'updated' : 'created'}`);
        }
        await exec('GRANT CONNECT ON DATABASE %I TO %I, %I', database, OWNER, APP);
        await exec('GRANT USAGE, CREATE ON SCHEMA public TO %I', OWNER);
        await exec('GRANT USAGE ON SCHEMA public TO %I', APP);
        await exec('REVOKE CREATE ON SCHEMA public FROM PUBLIC, %I', APP);
        // The migration log, before the first migration: the loop below hands it to the owner, and the
        // app may only read it
        await q(require('../utils/migrate').TABLE);

        // Everything in public that someone else owns (before: the superuser, which created it all)
        // goes to the owner – tables first (their sequences and indexes follow), then the rest
        let moved = 0;
        const objects = async kinds => (await q(`
            SELECT c.relname, c.relkind FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = ANY($1)
              AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = $2)
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i', 'e'))`,
        [kinds, OWNER])).rows;
        for (const o of await objects(['r', 'p', 'v', 'm', 'f'])) { await exec(`ALTER ${o.relkind === 'v' ? 'VIEW' : o.relkind === 'm' ? 'MATERIALIZED VIEW' : 'TABLE'} public.%I OWNER TO %I`, o.relname, OWNER); moved++; }
        for (const o of await objects(['S'])) { await exec('ALTER SEQUENCE public.%I OWNER TO %I', o.relname, OWNER); moved++; }
        const types = (await q(`
            SELECT t.typname FROM pg_type t
            WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd')
              AND t.typowner <> (SELECT oid FROM pg_roles WHERE rolname = $1)`, [OWNER])).rows;
        for (const t of types) { await exec('ALTER TYPE public.%I OWNER TO %I', t.typname, OWNER); moved++; }
        if (moved) console.log(`[DB setup] ${moved} object(s) handed to ${OWNER}`);

        // The app reads and writes rows – today's tables and every table a migration creates later
        await exec('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', APP);
        await exec('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', APP);
        await exec('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', OWNER, APP);
        await exec('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', OWNER, APP);
        // … but not the migration log
        await exec('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migrations FROM %I', APP);
        // Monitoring (docs/operations/monitoring.md): the postgres-exporter reads the statistics
        // views as the app role (pg_monitor: read-only), the slowest queries from
        // pg_stat_statements – only there when the database was started with it preloaded
        await exec('GRANT pg_monitor TO %I', APP);
        const preload = (await q("SELECT current_setting('shared_preload_libraries') AS v")).rows[0].v || '';
        if (preload.split(',').map(s => s.trim()).includes('pg_stat_statements')) await q('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
        else console.log('[DB setup] pg_stat_statements is not preloaded – no query statistics (docker-compose.yml: command)');
        await q('COMMIT');
        console.log('[DB setup] Done');
    } catch (err) {
        await q('ROLLBACK').catch(() => { });
        throw err;
    } finally {
        await db.end().catch(() => { });
    }
}

main().then(() => process.exit(0), err => { console.error('[DB setup] Failed: ' + err.message); process.exit(1); });
