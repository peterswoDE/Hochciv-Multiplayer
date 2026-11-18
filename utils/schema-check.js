/**
 * Compares the models with the database: a table or column a model expects but the database lacks
 * means a migration is missing (models/ changed without a new file in migrations/). The server
 * logs the result at startup; tests/db/roles.test.js fails on it.
 */
async function check(sequelize) {
    const [rows] = await sequelize.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
    const have = new Map();
    for (const r of rows) {
        if (!have.has(r.table_name)) have.set(r.table_name, new Set());
        have.get(r.table_name).add(r.column_name);
    }
    const problems = [];
    for (const model of Object.values(sequelize.models)) {
        const table = model.getTableName();
        const name = typeof table === 'string' ? table : table.tableName;
        const cols = have.get(name);
        if (!cols) { problems.push(`table "${name}" (${model.name}) is missing`); continue; }
        for (const a of Object.values(model.getAttributes())) {
            const col = a.field || a.fieldName;
            if (!cols.has(col)) problems.push(`column "${name}"."${col}" (${model.name}) is missing`);
        }
    }
    return problems;
}

module.exports = { check };
