/**
 * Ranked matchmaking (F9): "Gewertetes Spiel suchen" puts a logged-in player in a queue. The
 * queue pairs players by MMR – the allowed gap starts at ±100 and grows by 50 every 15 seconds.
 * Four players who fit form a game at once; two or three once the one waiting longest has
 * waited GROUP_WAIT_MS. Everyone confirms within CONFIRM_MS, then the server creates a lobby
 * with the ranked settings, everyone joins it and the game starts as soon as they are there.
 *
 *   client → server   match:join, match:leave, match:accept { matchId }, match:decline { matchId }
 *   server → client   match:status { waiting, window, queued }      while in the queue
 *                     match:found { matchId, players, confirmMs }    confirm now
 *                     match:progress { accepted, total }
 *                     match:cancelled { reason, requeued }           someone didn't confirm
 *                     match:ready { sessionId, joinCode, password, clientId }   join the lobby
 *
 * Whoever doesn't confirm (declines, lets the time run out, disconnects) leaves the queue; the
 * others go back to it with their waiting time. Queue and pending matches live in memory.
 *
 * Bot accounts (utils/bots.js) queue like players. A player who joins with { allowBots: true }
 * may get bots in the game; a group with a bot has only such players (or bots only).
 */
const crypto = require('crypto');
const sessions = require('../sessions');
const engine = require('../engine-adapter');
const serverState = require('../utils/serverState');
const game = require('./game');

const MIN_HUMANS = 2;
const MAX_HUMANS = 4;
const EMPIRES = 4;                         // free seats up to four empires are KI
const WINDOW_START = 100, WINDOW_STEP = 50, WINDOW_EVERY_MS = 15000, WINDOW_MAX = 1000;
const GROUP_WAIT_MS = Number(process.env.MATCH_GROUP_WAIT_MS) || 20000;
const CONFIRM_MS = Number(process.env.MATCH_CONFIRM_MS) || 20000;
const CONNECT_MS = 30000;                  // to join the created lobby
const TICK_MS = 2000;

const queue = new Map();                   // userId → { userId, name, mmr, socketId, since }
const matches = new Map();                 // matchId → { id, users, accepted, timer }

/** The lobby settings of a matched game: original map, random nations, KI at its hardest, 3 minutes per turn. */
function matchConfig(withBots = false) {
    const levels = engine.engineConst('KI_LEVELS') || [{ k: 'schwer' }];
    return {
        mapKey: '0', playerCount: EMPIRES, kiCount: 0, randomCivs: true, ranked: true,
        difficulty: levels[levels.length - 1].k, turnTime: 180,
        events: false, eventMode: 'hard', wonders: false, isPublic: false,
        seed: crypto.randomInt(2 ** 31), matchmaking: true,
        playerBots: withBots, playerBotLimit: null,
    };
}

const windowOf = (e, now) => Math.min(WINDOW_MAX, WINDOW_START + WINDOW_STEP * Math.floor((now - e.since) / WINDOW_EVERY_MS));

/** May `o` join `group`? A bot only with players who allow bots, a player who doesn't only without bots. */
const fitsBots = (group, o) => (o.isBot ? group.every(g => g.isBot || g.allowBots) : o.allowBots || !group.some(g => g.isBot));

module.exports = function registerMatchHandlers(io) {
    const emitTo = (socketId, event, data) => { if (socketId) io.to(socketId).emit(event, data); };

    /** Find groups: the one waiting longest first, the closest MMR around them. */
    function tick() {
        const now = Date.now();
        const list = [...queue.values()].sort((a, b) => a.since - b.since);
        const used = new Set();
        for (const e of list) {
            if (used.has(e.userId)) continue;
            const w = windowOf(e, now);
            const near = list.filter(o => o !== e && !used.has(o.userId) && Math.abs(o.mmr - e.mmr) <= Math.min(w, windowOf(o, now)))
                .sort((a, b) => Math.abs(a.mmr - e.mmr) - Math.abs(b.mmr - e.mmr));
            const fit = [];
            for (const o of near) if (fit.length < MAX_HUMANS - 1 && fitsBots([e, ...fit], o)) fit.push(o);
            const size = fit.length + 1;
            if (size >= MAX_HUMANS || (size >= MIN_HUMANS && now - e.since >= GROUP_WAIT_MS)) {
                const group = [e, ...fit];
                group.forEach(g => used.add(g.userId));
                propose(group);
            }
        }
        for (const e of queue.values()) {
            emitTo(e.socketId, 'match:status', { waiting: now - e.since, window: windowOf(e, now), queued: queue.size });
        }
    }

    function propose(group) {
        const match = { id: crypto.randomUUID(), users: group, accepted: new Set(), timer: null };
        group.forEach(u => queue.delete(u.userId));
        matches.set(match.id, match);
        match.timer = setTimeout(() => cancel(match, group.filter(u => !match.accepted.has(u.userId)).map(u => u.userId),
            'Nicht rechtzeitig bestätigt.'), CONFIRM_MS);
        const players = group.map(u => ({ name: u.name, mmr: u.mmr, isBot: !!u.isBot }));
        group.forEach(u => emitTo(u.socketId, 'match:found', { matchId: match.id, players, confirmMs: CONFIRM_MS }));
        console.log(`[Match] Proposed ${match.id}: ${group.map(u => `${u.name} (${u.mmr})`).join(', ')}`);
    }

    /** Those in `out` leave; everyone else goes back into the queue (with their waiting time). */
    function cancel(match, out, reason) {
        if (!matches.has(match.id)) return;
        clearTimeout(match.timer);
        matches.delete(match.id);
        for (const u of match.users) {
            if (out.includes(u.userId)) {
                emitTo(u.socketId, 'match:cancelled', { reason, requeued: false });
            } else {
                queue.set(u.userId, u);
                emitTo(u.socketId, 'match:cancelled', { reason: 'Jemand hat nicht bestätigt – du bist wieder in der Warteschlange.', requeued: true });
            }
        }
    }

    /** Everyone confirmed: the lobby, then the game as soon as all have joined it. */
    function create(match) {
        clearTimeout(match.timer);
        matches.delete(match.id);
        const ids = new Map(match.users.map(u => [u.userId, crypto.randomUUID()]));
        const [host, ...rest] = match.users;
        // a bot's seat is bound to its account, as when it joins a lobby (sessions.js)
        const info = u => ({ name: u.name, clientId: ids.get(u.userId), botUserId: u.isBot ? u.userId : undefined });
        const r = sessions.createSession(matchConfig(match.users.some(u => u.isBot)), info(host));
        if (typeof r === 'string') {
            match.users.forEach(u => { queue.set(u.userId, u); emitTo(u.socketId, 'match:cancelled', { reason: r, requeued: true }); });
            return;
        }
        for (const u of rest) sessions.joinSession(r.joinCode, r.password, info(u));
        const session = sessions.getSession(r.sessionId);
        session.match = {
            id: match.id,
            onConnect: () => tryStart(session, false),          // called by sockets/game.js session:connect
            timer: setTimeout(() => tryStart(session, true), CONNECT_MS),
        };
        match.users.forEach(u => emitTo(u.socketId, 'match:ready', {
            sessionId: r.sessionId, joinCode: r.joinCode, password: r.password, clientId: ids.get(u.userId),
        }));
        console.log(`[Match] ${match.id} → lobby ${r.joinCode}`);
    }

    /** Start once everyone is there – after CONNECT_MS with those who came (at least two). */
    function tryStart(session, force) {
        if (!session.match || session.status !== 'lobby') return;
        const there = session.players.filter(p => p.connected);
        if (!force && there.length < session.players.length) return;
        clearTimeout(session.match.timer);
        session.match.onConnect = null;
        if (there.length < MIN_HUMANS) {
            io.to(session.id).emit('session:kicked', { reason: 'Zu wenige Spieler sind gekommen. Das Spiel wurde abgesagt.' });
            sessions.removeSession(session.id);
            return;
        }
        // whoever didn't come is not part of it – the KI takes the free seats
        for (let i = session.players.length - 1; i >= 0; i--) if (!session.players[i].connected) sessions.kickPlayer(session.id, i, true);
        session.hostIndex = 0;
        io.to(session.id).emit('lobby:player:updated', game.publicPlayers(session));
        const err = game.startGame(io, session);
        if (err) console.error(`[Match] Start failed in ${session.id}:`, err);
    }

    const on = (socket, event, handler) => socket.on(event, (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => { };
        try {
            reply(handler(data && typeof data === 'object' ? data : {}) || { ok: true });
        } catch (err) {
            console.error(`[Match] ${event} failed:`, err);
            reply({ error: 'Serverfehler' });
        }
    });

    io.on('connection', socket => {
        const user = () => socket.request.user || null;

        on(socket, 'match:join', data => {
            const u = user();
            if (!u) return { error: 'Für gewertete Spiele musst du angemeldet sein.' };
            if (serverState.state.maintenanceMode) return { error: 'Der Server befindet sich im Wartungsmodus.' };
            for (const m of matches.values()) if (m.users.some(x => x.userId === u.id)) return { ok: true, pending: true };
            const was = queue.get(u.id);
            queue.set(u.id, {
                userId: u.id, name: u.username, mmr: u.mmr || 1000, socketId: socket.id, since: was ? was.since : Date.now(),
                isBot: u.accountType === 'bot', allowBots: data.allowBots === true,
            });
            socket.data.matchUserId = u.id;
            return { ok: true, queued: queue.size };
        });

        on(socket, 'match:leave', () => {
            const u = user();
            if (u && queue.get(u.id) && queue.get(u.id).socketId === socket.id) queue.delete(u.id);
            return { ok: true };
        });

        on(socket, 'match:accept', data => {
            const u = user();
            const m = matches.get(data.matchId);
            if (!u || !m || !m.users.some(x => x.userId === u.id)) return { error: 'Dieses Spiel gibt es nicht mehr.' };
            m.accepted.add(u.id);
            m.users.forEach(x => emitTo(x.socketId, 'match:progress', { accepted: m.accepted.size, total: m.users.length }));
            if (m.accepted.size === m.users.length) create(m);
            return { ok: true };
        });

        on(socket, 'match:decline', data => {
            const u = user();
            const m = matches.get(data.matchId);
            if (u && m && m.users.some(x => x.userId === u.id)) cancel(m, [u.id], 'Du hast abgelehnt.');
            return { ok: true };
        });

        socket.on('disconnect', () => {
            const uid = socket.data.matchUserId;
            if (!uid) return;
            const q = queue.get(uid);
            if (q && q.socketId === socket.id) queue.delete(uid);
            for (const m of [...matches.values()]) {
                const me = m.users.find(x => x.userId === uid && x.socketId === socket.id);
                if (me && !m.accepted.has(uid)) cancel(m, [uid], 'Verbindung verloren.');
            }
        });
    });

    if (!io.__matchInterval) {
        io.__matchInterval = setInterval(() => {
            try { tick(); } catch (err) { console.error('[Match] Tick failed:', err); }
        }, TICK_MS);
        io.__matchInterval.unref();
    }
};

// for tests
module.exports.windowOf = windowOf;
module.exports.matchConfig = matchConfig;
module.exports.fitsBots = fitsBots;
