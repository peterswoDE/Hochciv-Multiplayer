/**
 * The engine's log of a Rundenspiel in async_log (scalability P1.4, migration 0012) against the
 * local docker setup – the checks run inside the server container (async/service.js in-process,
 * the database of the stack):
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   node tests/turns/engine-log.test.js
 *
 *   · a running game's `state` is written without its log; async_log holds it, one row per seq
 *   · a game loaded again (evicted from memory) has its whole log: the next write adds only the
 *     new entries and keeps the old ones
 *   · a row whose `state` still holds its log (written before 0012) is split with its next write
 *   · the engine keeps the last 600 entries: the older rows go
 *   · when the game ends the log is back in `state` and its rows are gone
 *
 * The test accounts and the game are deleted afterwards.
 */
const CONTAINER = 'hochciv-multiplayer-local';

if (!process.env.HOCHCIV_IN_SERVER) {
    const { spawnSync } = require('child_process');
    const r = spawnSync('docker', ['exec', '-i', '-e', 'HOCHCIV_IN_SERVER=1', '-w', '/app', CONTAINER, 'node', '-'],
        { input: require('fs').readFileSync(__filename), stdio: ['pipe', 'inherit', 'inherit'] });
    process.exit(r.status === null ? 1 : r.status);
}

// ── In the server container ──────────────────────────────────────────────────
const crypto = require('crypto');
const { sequelize, User } = require('./models');
const service = require('./async/service');
require('./utils/terms').accepted = () => true;

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const one = async (sql, bind) => (await sequelize.query(sql, { bind, type: sequelize.QueryTypes.SELECT }))[0];
const TECHS = ['philosophie', 'bewaesserung', 'mathematik', 'astronomie', 'schrift', 'landwirtschaft', 'fischerei', 'rad', 'taktik', 'keramik', 'papier', 'segeln'];

(async () => {
    const users = [];
    let gameId = null;
    try {
        for (let i = 0; i < 2; i++) {
            const name = 'log_' + crypto.randomBytes(3).toString('hex');
            const u = await User.create({ username: name, email: name + '@example.com', password_hash: 'x', isActive: true,
                emailOtpEnabled: false, notifyEmail: false, termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() });
            users.push({ id: u.id, username: name, termsAcceptedAt: new Date() });
        }
        const [a, b] = users;
        service.init({ in: () => ({ fetchSockets: async () => [] }), to: () => ({ emit: () => {} }) });
        const made = await service.create(a, { config: { mapKey: '0', civMode: 'fixed', playerCount: 2, kiCount: 0, turnDays: 3 }, civ: 'griechenland', ability: 'basis' });
        if (made.error) throw new Error(made.error);
        gameId = made.id;
        const j = await service.join(b, gameId, { code: made.joinCode, civ: 'russland', ability: 'basis' });
        if (j && j.error) throw new Error(j.error);

        const turns = async n => {
            for (let t = 0; t < n; t++) {
                const row = await one('SELECT "waitingIds", status FROM async_games WHERE id = $1', [gameId]);
                if (row.status !== 'playing') throw new Error('status ' + row.status);
                const u = row.waitingIds.includes(a.id) ? a : b;
                for (const tech of TECHS) { const x = await service.action(u, gameId, 'research', { tech }); if (x && x.ok) break; }
                const e = await service.action(u, gameId, 'endTurn', {});
                if (!e || !e.ok) throw new Error('endTurn: ' + JSON.stringify(e));
                await service.flushAll();
            }
        };
        const logRows = async () => one(`SELECT count(*)::int AS n, min(seq) AS lo, max(seq) AS hi,
            count(DISTINCT seq)::int AS seqs FROM async_log WHERE "gameId" = $1`, [gameId]);
        const stateOf = async () => one(`SELECT jsonb_exists(state, 'log') AS has, (state->>'logSeq')::int AS "logSeq",
            jsonb_array_length(CASE WHEN jsonb_exists(state, 'log') THEN state->'log' ELSE '[]' END) AS len, status
            FROM async_games WHERE id = $1`, [gameId]);
        const entries = async () => (await sequelize.query('SELECT seq, entry::text AS t FROM async_log WHERE "gameId" = $1 ORDER BY seq',
            { bind: [gameId], type: sequelize.QueryTypes.SELECT }));

        // a running game: the state without its log, the log in async_log
        await turns(6);
        let s = await stateOf(), r = await logRows();
        ok(!s.has && r.n > 0 && r.hi === s.logSeq && r.hi - r.lo + 1 === r.n,
            'the state is written without its log, async_log holds it', `${r.n} rows ${r.lo}–${r.hi}, logSeq ${s.logSeq}`);

        // loaded again: the whole log, only new entries are added
        const before = await entries();
        service.evict(gameId);
        await turns(2);
        let after = await entries();
        r = await logRows();
        s = await stateOf();
        const kept = before.every((x, i) => after[i] && after[i].seq === x.seq && after[i].t === x.t);
        ok(!s.has && kept && after.length > before.length && r.hi === s.logSeq && r.hi - r.lo + 1 === r.n,
            'loaded again: the old entries stay, the new ones are added', `${before.length} → ${after.length} rows, logSeq ${s.logSeq}`);

        // a row written before 0012: the log in its state, no rows
        await sequelize.query(`UPDATE async_games SET state = state || jsonb_build_object('log',
            (SELECT jsonb_agg(entry ORDER BY seq) FROM async_log WHERE "gameId" = $1)) WHERE id = $1`, { bind: [gameId] });
        await sequelize.query('DELETE FROM async_log WHERE "gameId" = $1', { bind: [gameId] });
        service.evict(gameId);
        await turns(1);
        s = await stateOf();
        r = await logRows();
        after = await entries();
        ok(!s.has && r.hi === s.logSeq && r.hi - r.lo + 1 === r.n && after.slice(0, before.length).every((x, i) => x.t === before[i].t),
            'a row with its log in the state is split with its next write', `${r.n} rows ${r.lo}–${r.hi}`);

        // the engine keeps the last 600 entries: the older rows go
        for (let i = 0; i < 400 && (await logRows()).hi < 640; i++) await turns(1);
        r = await logRows();
        s = await stateOf();
        ok(r.n === 600 && r.seqs === 600 && r.hi === s.logSeq && r.lo === s.logSeq - 599,
            'the last 600 entries only', `${r.n} rows ${r.lo}–${r.hi}, logSeq ${s.logSeq}`);
        const last = await entries();

        // the game ends: the log back in the state, the rows gone
        const res = await service.resign(a, gameId);
        await service.flushAll();
        s = await stateOf();
        r = await logRows();
        // the log in the state: the entries of the rows (resigning may have added some)
        const log = (await one(`SELECT state->'log' AS log FROM async_games WHERE id = $1`, [gameId])).log || [];
        const bySeq = new Map(log.map(x => [x.seq, JSON.stringify(x)]));
        const same = last.filter(x => bySeq.has(x.seq)).every(x => bySeq.get(x.seq) === JSON.stringify(JSON.parse(x.t)));
        ok(res.ok && s.status !== 'playing' && s.has && log.length >= 590 && bySeq.has(last[last.length - 1].seq) && same && r.n === 0,
            'the game ended: its log is back in the state, the rows are gone', `${s.status}, ${s.len} entries in the state, ${r.n} rows`);
    } catch (err) {
        console.error(err);
        failed++;
    } finally {
        if (gameId) await sequelize.query('DELETE FROM async_games WHERE id = $1', { bind: [gameId] });
        for (const u of users) await sequelize.query('DELETE FROM users WHERE id = $1', { bind: [u.id] }).catch(() => {});
    }
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
