/**
 * Runs the server tests one after another against the local server, without the minute-long
 * pauses between them: before each test it resets every rate limit of the server
 * (POST /api/test/reset – only there with TEST_HOOKS=on outside production, which
 * docker-compose.local.yml sets).
 *
 *   node tests/run-all.js [filter …] [--url http://localhost:3000]
 *
 * Without a filter it runs every test that works with the default server settings. A filter
 * (part of the path, e.g. `security` or `maps/maps`) runs the matching tests, including those that
 * need another server setting – start the server for them as their header says.
 * The tests' own screenshot (review-admin.png) is restored afterwards.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const urlAt = args.indexOf('--url');
const BASE = (urlAt >= 0 ? args.splice(urlAt, 2)[1] : 'http://localhost:3000').replace(/\/$/, '');
const filters = args;

// Need other server settings, an override file or their own database (docs/development/testing.md)
const SPECIAL = ['auth/google-app-login', 'db/migrations', 'deadline/deadline', 'filter/filter', 'match/match',
    'push/push', 'security/regression', 'terms/terms', 'timer/turn-timer'];
const TIMEOUT_MS = 15 * 60 * 1000;

const all = fs.readdirSync(__dirname, { withFileTypes: true }).filter(d => d.isDirectory())
    .flatMap(d => fs.readdirSync(path.join(__dirname, d.name)).filter(f => f.endsWith('.test.js')).map(f => `${d.name}/${f}`))
    .sort();
const tests = filters.length
    ? all.filter(t => filters.some(f => t.includes(f)))
    : all.filter(t => !SPECIAL.includes(t.replace(/\.test\.js$/, '')));

async function resetLimits() {
    const r = await fetch(BASE + '/api/test/reset', { method: 'POST' });
    if (!r.ok) throw new Error(`POST /api/test/reset: ${r.status} – is the server started with TEST_HOOKS=on (docker-compose.local.yml)?`);
}

function run(test) {
    return new Promise(resolve => {
        const out = [];
        const child = spawn(process.execPath, [path.join('tests', test), BASE], { cwd: ROOT, env: process.env });
        const timer = setTimeout(() => { out.push(Buffer.from(`\n[run-all] killed after ${TIMEOUT_MS / 60000} minutes\n`)); child.kill(); }, TIMEOUT_MS);
        child.stdout.on('data', d => out.push(d));
        child.stderr.on('data', d => out.push(d));
        child.on('close', code => { clearTimeout(timer); resolve({ code, output: Buffer.concat(out).toString() }); });
    });
}

(async () => {
    if (!tests.length) { console.error('No test matches', filters.join(' ')); process.exit(2); }
    const results = [];
    const start = Date.now();
    for (const test of tests) {
        await resetLimits();
        const t0 = Date.now();
        const { code, output } = await run(test);
        const secs = Math.round((Date.now() - t0) / 1000);
        results.push({ test, ok: code === 0, secs });
        console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${test}  (${secs} s)`);
        if (code !== 0) {
            const lines = output.split('\n').filter(l => /FAIL|Error|error|Timeout/.test(l)).slice(0, 15);
            console.log((lines.length ? lines : output.split('\n').slice(-15)).map(l => '      ' + l).join('\n'));
        }
    }
    try { execFileSync('git', ['checkout', '--', 'review-admin.png'], { cwd: ROOT, stdio: 'ignore' }); } catch (_) { /* not a checkout */ }
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed in ${Math.round((Date.now() - start) / 60000)} min`);
    if (!filters.length) console.log(`Not run (need other server settings): ${SPECIAL.join(', ')}`);
    if (failed.length) console.log('Failed: ' + failed.map(r => r.test).join(', '));
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(2); });
