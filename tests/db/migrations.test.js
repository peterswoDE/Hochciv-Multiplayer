/**
 * Database roles and migrations on an EMPTY database (the test fills it):
 *   · scripts/db-setup.js creates hochciv_owner and hochciv_app, twice in a row (idempotent)
 *   · every migration applies as the owner; a second run finds nothing to do
 *   · the models match the schema – fails when a model changed without a migration
 *   · the app role may read and write rows, but not change the schema or the migration log,
 *     and is no superuser
 *
 * Runs in CI (.github/workflows/checks.yml, Postgres service container). Locally:
 *
 *   docker run -d --name pg-migrations -e POSTGRES_USER=hochciv -e POSTGRES_PASSWORD=pw \
 *       -e POSTGRES_DB=hochciv -p 127.0.0.1:55432:5432 postgres:15-alpine
 *   DB_PORT=55432 POSTGRES_PASSWORD=pw node tests/db/migrations.test.js
 *   docker rm -f pg-migrations
 *
 * Environment: DB_HOST (localhost), DB_PORT (5432), POSTGRES_USER (hochciv), POSTGRES_PASSWORD,
 * POSTGRES_DB (hochciv).
 */
const { execFileSync } = require('child_process');
const path = require('path');

const host = process.env.DB_HOST || 'localhost', port = process.env.DB_PORT || '5432';
const db = process.env.POSTGRES_DB || 'hochciv';
const env = Object.assign({}, process.env, {
    DB_HOST: host, DB_PORT: port, POSTGRES_USER: process.env.POSTGRES_USER || 'hochciv', POSTGRES_DB: db,
    POSTGRES_OWNER_PASSWORD: 'owner' + Date.now(), POSTGRES_APP_PASSWORD: 'app' + Date.now(),
});
const OWNER_URL = `postgres://hochciv_owner:${env.POSTGRES_OWNER_PASSWORD}@${host}:${port}/${db}`;
const APP_URL = `postgres://hochciv_app:${env.POSTGRES_APP_PASSWORD}@${host}:${port}/${db}`;

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const denied = async (q, sql) => { try { await q(sql); return false; } catch (err) { return err.original ? err.original.code : err.code; } };

(async () => {
    try {
        const setup = () => execFileSync(process.execPath, [path.join(__dirname, '../../scripts/db-setup.js')], { env }).toString();
        ok(/Done/.test(setup()), 'db-setup creates the roles');
        ok(/Done/.test(setup()), 'db-setup runs again (idempotent)');

        const { migrate, names } = require('../../utils/migrate');
        const applied = await migrate(OWNER_URL, { log: () => { } });
        ok(applied.length === names().length && applied[0] === '0001-baseline', 'all migrations apply as the owner', applied.join(', '));
        ok((await migrate(OWNER_URL)).length === 0, 'a second run finds nothing to do');

        process.env.DATABASE_URL = APP_URL;
        const { sequelize, User } = require('../../models');
        const q = s => sequelize.query(s);
        ok((await migrate(APP_URL)).length === 0, 'the app role sees the schema as current');
        const problems = await require('../../utils/schema-check').check(sequelize);
        ok(problems.length === 0, 'the models match the schema (else: a migration is missing)', problems.join('; '));

        const u = await User.create({ username: 'mig_' + Date.now(), email: `mig${Date.now()}@example.com` });
        ok(u.mmr === 1000, 'the app role writes rows (defaults from the schema)');
        await u.destroy();
        const [[me]] = await q('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
        ok(!me.rolsuper && !me.rolcreatedb && !me.rolcreaterole, 'the app role is no superuser and creates no databases or roles');
        ok(await denied(q, 'CREATE TABLE evil (x int)') === '42501', 'the app role may not create tables');
        ok(await denied(q, 'ALTER TABLE users ADD COLUMN evil int') === '42501', 'the app role may not change tables');
        ok(await denied(q, 'DROP TABLE users') === '42501', 'the app role may not drop tables');
        ok(await denied(q, "DELETE FROM schema_migrations") === '42501', 'the app role may not change the migration log');
        ok(await denied(q, "COPY (SELECT 1) TO PROGRAM 'id'") === '42501', 'the app role may not run programs');
        await sequelize.close();
    } catch (err) {
        console.error(err);
        failed++;
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
    process.exit(failed ? 1 : 0);
})();
