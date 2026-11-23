/**
 * express-rate-limit, with one difference: every limiter keeps its counters in a store this module
 * knows, so the local test runner can reset all of them before each test (tests/run-all.js,
 * POST /api/test/reset – only with TEST_HOOKS=on outside production, see server.js).
 *
 * Use it exactly like express-rate-limit: `require('../utils/rateLimit')({ windowMs, max, … })`.
 */
const { rateLimit, MemoryStore } = require('express-rate-limit');

const stores = [];

function limiter(options = {}) {
    const store = options.store || new MemoryStore();
    stores.push(store);
    return rateLimit({ ...options, store });
}

/** Forgets every counter of every limiter. */
async function resetAll() {
    await Promise.all(stores.map(s => (s.resetAll ? s.resetAll() : null)));
    return stores.length;
}

module.exports = limiter;
module.exports.resetAll = resetAll;
