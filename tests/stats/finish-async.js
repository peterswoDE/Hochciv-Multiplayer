/**
 * TEST ONLY – runs inside the server container, called by stats.test.js (stdin → node -).
 *
 * Creates a real Rundenspiel of two accounts through async/service.js, then lets the 7-day
 * takeover (shortened to 1 ms here) hand both seats to the KI, which plays the game to its end –
 * every step goes through the service's own save path, which records the statistics. Prints the
 * stored statistics, the finished view and the match record as JSON.
 *
 * Env: USER_A, NAME_A, USER_B, NAME_B.
 */
process.env.ASYNC_TIMEOUT_MS = '1';
process.env.ASYNC_REMINDER_MS = '1';
const service = require('./async/service');
const L = require('./async/logic');
const { AsyncGame, Game } = require('./models');

(async () => {
    const a = { id: process.env.USER_A, username: process.env.NAME_A };
    const b = { id: process.env.USER_B, username: process.env.NAME_B };
    const made = await service.create(a, { config: { mapKey: '0', civMode: 'random', playerCount: 2, kiCount: 0 } });
    if (made.error) throw new Error(made.error);
    const joined = await service.join(b, made.id, { code: made.joinCode });
    if (joined && joined.error) throw new Error(joined.error);

    let row = null;
    for (let n = 0; n < 30; n++) {
        await new Promise(r => setTimeout(r, 5));
        await service.sweep();
        row = await AsyncGame.findByPk(made.id);
        if (row.status === 'finished') break;
    }
    const stats = row.data.stats;
    service.evict(made.id);
    const game = await Game.findOne({ where: { id: (await Game.findAll({ order: [['createdAt', 'DESC']], limit: 5 })).find(g => (g.participants || []).some(p => p.replacedUserId === a.id || p.dbUserId === a.id)).id } });
    const view = L.view({ ...row.data, id: row.id, status: row.status, state: row.state, seats: row.data.seats, invites: row.data.invites || [], config: row.data.config, hostUserId: row.hostUserId }, a.id);
    console.log(JSON.stringify({
        id: made.id, status: row.status, round: row.round,
        stats: stats && { rounds: stats.rounds.map(r => r.r), final: !!stats.final, events: stats.events.length, players: stats.players.map(p => p.name), hasOwners: !!stats.owners },
        lastScores: stats && stats.rounds[stats.rounds.length - 1].p.map(p => p.s),
        viewStats: !!view.stats && !view.stats.owners && view.stats.rounds.length,
        game: game && { id: game.id, rounds: game.stats && game.stats.rounds.length, owners: !!(game.stats && game.stats.owners) },
    }));
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
