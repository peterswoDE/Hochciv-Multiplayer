/**
 * Finds duplicate UNIQUE constraints (same table, same columns) and, with --fix, drops all but
 * one. They piled up because sequelize.sync({ alter: true }) re-added `unique: true` columns as a
 * new constraint on every server start (users_email_key, users_email_key1, …).
 *
 *   node scripts/dedupe-constraints.js         – report only
 *   node scripts/dedupe-constraints.js --fix   – drop the duplicates (one transaction)
 *
 * Kept per group: the constraint a foreign key depends on (e.g. games.winnerUsername →
 * users.username), otherwise the original one (shortest name). The kept one is renamed to the
 * original name, which the models use (see `indexes` there).
 */
const { sequelize } = require('../models');

const ident = name => `"${name.replace(/"/g, '""')}"`;

async function main() {
    const fix = process.argv.includes('--fix');
    const [groups] = await sequelize.query(`
        SELECT c.conrelid::regclass::text AS tbl, pg_get_constraintdef(c.oid) AS def,
               array_agg(c.conname::text ORDER BY length(c.conname), c.conname) AS names,
               array_agg(c.conname::text) FILTER (WHERE EXISTS (
                   SELECT 1 FROM pg_constraint f WHERE f.contype = 'f' AND f.conindid = c.conindid
               )) AS referenced
        FROM pg_constraint c
        WHERE c.contype = 'u' AND c.connamespace = 'public'::regnamespace
        GROUP BY 1, 2
        HAVING count(*) > 1
        ORDER BY 1, 2`);

    if (!groups.length) {
        console.log('No duplicate unique constraints.');
        return;
    }
    let total = 0;
    for (const g of groups) {
        g.keep = (g.referenced && g.referenced[0]) || g.names[0];
        g.drop = g.names.filter(n => n !== g.keep);
        total += g.drop.length;
        console.log(`${g.tbl} ${g.def}: ${g.names.length} copies – keep ${g.keep}`
            + (g.keep !== g.names[0] ? ` (renamed to ${g.names[0]})` : '') + `, drop ${g.drop.length}`);
    }
    if (!fix) {
        console.log(`\n${total} duplicates. Run with --fix to drop them.`);
        return;
    }
    await sequelize.transaction(async transaction => {
        for (const g of groups) {
            for (const name of g.drop) {
                await sequelize.query(`ALTER TABLE ${g.tbl} DROP CONSTRAINT ${ident(name)}`, { transaction });
            }
            if (g.keep !== g.names[0]) {
                await sequelize.query(`ALTER TABLE ${g.tbl} RENAME CONSTRAINT ${ident(g.keep)} TO ${ident(g.names[0])}`, { transaction });
            }
        }
    });
    console.log(`\nDropped ${total} duplicate constraints.`);
}

main()
    .catch(err => { console.error(err); process.exitCode = 1; })
    .finally(() => sequelize.close());
