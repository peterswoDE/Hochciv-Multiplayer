/**
 * Applies the pending database migrations (utils/migrate.js) and exits. entrypoint.sh runs it
 * before the server, with the owner role:
 *
 *   node scripts/migrate.js            – MIGRATION_DATABASE_URL, else DATABASE_URL
 */
const { migrate } = require('../utils/migrate');

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || 'postgres://hochciv:password123@hochciv-db:5432/hochciv';

migrate(url).then(done => {
    console.log(done.length ? `[DB] ${done.length} migration(s) applied` : '[DB] Schema is current');
    process.exit(0);
}).catch(err => {
    console.error('[DB] ' + err.message);
    process.exit(1);
});
