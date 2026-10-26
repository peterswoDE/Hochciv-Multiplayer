const sessions = require('../sessions');
const engine = require('../engine-adapter');
const { User, Game, sequelize } = require('../models');
const { calculateMMR } = require('../utils/mmr');
const { finalPoints } = require('../utils/score');
const config = require('../config');
const chat = require('../utils/chat');
const Stats = require('../utils/stats');
const Replay = require('../utils/replay');
const Summary = require('../utils/summary');

/* Turn timer (host setting gameConfig.turnTime, in seconds; 0 = no limit). When the time is up
   the KI plays the rest of the turn; after AFK_AFTER such turns in a row it keeps the seat
   until the player hands it back ('turn:reclaim'). */
const TURN_TIMES = [0, 60, 120, 180, 300, 600];
const AFK_AFTER = 3;
const AFK_KI_LEVEL = { ranked: 'schwer', normal: 'mittel' };

/**
 * Register a socket event handler that cannot take the process down: the payload is
 * always an object, `ack` is always a function and any exception is logged and acked.
 */
function on(socket, event, handler) {
    socket.on(event, (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => { };
        const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        try {
            const r = handler(payload, reply);
            if (r && typeof r.catch === 'function') {
                r.catch(err => { console.error(`[Socket] ${event} failed:`, err); reply({ error: 'Serverfehler' }); });
            }
        } catch (err) {
            console.error(`[Socket] ${event} failed:`, err);
            reply({ error: 'Serverfehler' });
        }
    });
}

/**
 * Register Socket.IO event handlers on the given server instance.
 * @param {import('socket.io').Server} io
 */
module.exports = function registerHandlers(io) {

    io.on('connection', (socket) => {
        let sessionId = null;
        let session = null;
        let me = null;          // this socket's player object in session.players
        let watcher = null;     // … or its spectator object in session.spectators (spectator mode)

        // Players are re-indexed when someone leaves the lobby, so the index is always looked up
        const myIndex = () => (session ? session.players.indexOf(me) : -1);
        const bound = () => !!session && myIndex() !== -1;
        const isHost = () => bound() && myIndex() === session.hostIndex;

        // ── Authenticate / bind to a session ─────────────────────────────────
        // The seat is found by the client's secret clientId (from /api/sessions or /join),
        // never by an index the client picks.
        on(socket, 'session:connect', (data, ack) => {
            const s = sessions.getSession(data.sessionId);
            if (!s) return ack({ error: 'Sitzung nicht gefunden.' });
            if (typeof data.password !== 'string' || s.password !== data.password)
                return ack({ error: 'Falsches Passwort.' });
            const player = typeof data.clientId === 'string'
                ? s.players.find(p => p.kind === 'human' && p.clientId === data.clientId) : null;
            const spectator = !player && typeof data.clientId === 'string'
                ? (s.spectators || []).find(w => w.clientId === data.clientId) : null;
            if (spectator) return watch(s, spectator, ack);
            if (!player) return ack({ error: 'Ungültiger Spieler. Bitte erneut beitreten.' });

            sessionId = s.id;
            session = s;
            me = player;
            watcher = null;
            const playerIndex = myIndex();

            sessions.recordActivity(sessionId);

            const host = s.players[s.hostIndex];
            const oldHostOffline = !host || !host.connected;

            // Mark connected
            me.connected = true;
            me.socketId = socket.id;
            if (socket.request.user) {
                me.dbUserId = socket.request.user.id;
                me.dbUsername = socket.request.user.username;
                me.mmr = socket.request.user.mmr;
            }

            // Reclaim host if the lobby was abandoned
            if (oldHostOffline && s.hostIndex !== playerIndex) {
                s.hostIndex = playerIndex;
            }

            // Join a Socket.IO room for this session
            socket.join(sessionId);

            ack({ ok: true, playerIndex, status: s.status, players: publicPlayers(s), gameConfig: s.gameConfig, hostIndex: s.hostIndex, spectators: sessions.spectatorCount(s) });
            socket.emit('chat:history', { list: s.chat || [] });

            // Tell everyone a player (re-)connected
            io.to(sessionId).emit('player:joined', {
                playerIndex,
                name: me.name,
                civ: me.civ,
                players: publicPlayers(s),
                newHostIndex: s.hostIndex
            });

            // A lobby of the matchmaking starts as soon as everyone is there (sockets/match.js)
            if (s.match && s.match.onConnect) s.match.onConnect();

            // Marathon draft in progress: show the reconnecting player the draft screen
            if (s.status === 'draft' && s.draft) {
                socket.emit('draft:update', engine.draftPayload(s));
            }

            if (s.status === 'finished' && s.stats) socket.emit('game:stats', { stats: Stats.publicStats(s.stats) });
            if (s.status === 'finished' && s.gameRecord) socket.emit('game:record', s.gameRecord);

            // If game is already playing, send current state to the reconnecting player right away
            if (s.status === 'playing' && s.state) {
                const sortedStateIndex = engine.stateIndexOf(s.state, playerIndex, me);
                socket.emit('game:start', {
                    state: engine.stateForPlayer(s.state, sortedStateIndex),
                    yourIndex: sortedStateIndex,
                    turn: turnInfo(s),
                    // back in the middle of one's own turn: its summary again
                    summary: s.lastSummary && s.lastSummary.me === sortedStateIndex ? s.lastSummary : undefined,
                });
            }
        });

        /** Spectator mode: bind this socket as a viewer – sees everything, can't act or write. */
        function watch(s, w, ack) {
            sessionId = s.id;
            session = s;
            me = null;
            watcher = w;
            w.connected = true;
            w.socketId = socket.id;
            socket.join(sessionId);
            ack({ ok: true, spectator: true, playerIndex: -1, status: s.status, players: publicPlayers(s), gameConfig: s.gameConfig, hostIndex: s.hostIndex, spectators: sessions.spectatorCount(s) });
            socket.emit('chat:history', { list: s.chat || [] });
            io.to(sessionId).emit('spectators:update', { count: sessions.spectatorCount(s) });
            if (s.status === 'draft' && s.draft) socket.emit('draft:update', engine.draftPayload(s));
            if (s.status === 'playing' && s.state) {
                socket.emit('game:start', { state: engine.stateForPlayer(s.state, -1), yourIndex: -1, turn: turnInfo(s) });
            }
        }

        // ── Kick Player (Host only) ──────────────────────────────────────────
        on(socket, 'session:kick', (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (!isHost()) return ack({ error: 'Nur der Host kann kicken.' });
            sessions.recordActivity(sessionId);

            const targetIndex = data.playerIndex;
            if (!Number.isInteger(targetIndex) || targetIndex === myIndex()) return ack({ error: 'Ungültiger Spieler.' });
            const kickedPlayer = session.players[targetIndex];

            if (sessions.kickPlayer(sessionId, targetIndex)) {
                // If the kicked player is currently connected, disconnect them
                if (kickedPlayer && kickedPlayer.socketId) {
                    const targetSocket = io.sockets.sockets.get(kickedPlayer.socketId);
                    if (targetSocket) {
                        targetSocket.emit('session:kicked');
                        targetSocket.leave(sessionId);
                    }
                }
                fixHostAfterRemoval(session, targetIndex);

                ack({ ok: true });
                io.to(sessionId).emit('player:left', {
                    playerIndex: targetIndex,
                    name: kickedPlayer ? kickedPlayer.name : 'Spieler',
                    players: publicPlayers(session),
                    newHostIndex: session.hostIndex
                });
                sendIndices(io, session);
            } else {
                ack({ error: 'Konnte Spieler nicht kicken.' });
            }
        });

        // ── Update Lobby Config (Host only) ──────────────────────────────────
        on(socket, 'lobby:config', (newConfig, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (!isHost()) return ack({ error: 'Nur der Host kann Einstellungen ändern.' });
            sessions.recordActivity(sessionId);

            // Empires in all / KI seats: whole numbers in range, the rest is checked at the start
            if (newConfig && typeof newConfig === 'object') {
                const int = (v, lo, hi) => Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : undefined;
                if (newConfig.playerCount !== undefined) newConfig.playerCount = int(newConfig.playerCount, 2, 8);
                if (newConfig.kiCount !== undefined) newConfig.kiCount = int(newConfig.kiCount, 0, 7);
                if (newConfig.randomCivs !== undefined) newConfig.randomCivs = !!newConfig.randomCivs;
                if (newConfig.turnTime !== undefined) newConfig.turnTime = TURN_TIMES.includes(newConfig.turnTime) ? newConfig.turnTime : 0;
            }
            // A custom map comes from the host's browser: only a checked, clean copy is kept
            if (newConfig && newConfig.customMap !== undefined) {
                const r = engine.checkCustomMap(newConfig.customMap);
                if (r.error) return ack({ error: r.error });
                newConfig = { ...newConfig, customMap: r.map };
            }
            const updated = sessions.updateConfig(sessionId, newConfig);
            if (updated) {
                ack({ ok: true });
                io.to(sessionId).emit('lobby:config:update', updated);
            } else {
                ack({ error: 'Konnte Einstellungen nicht aktualisieren.' });
            }
        });

        // ── Update Player Config (Lobby) ─────────────────────────────────────
        on(socket, 'lobby:player:update', (updates, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'lobby') return ack({ error: 'Spiel läuft bereits.' });
            sessions.recordActivity(sessionId);

            const updated = sessions.updatePlayer(sessionId, myIndex(), updates);
            if (updated) {
                ack({ ok: true });
                io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
            } else {
                ack({ error: 'Konnte Einstellungen nicht aktualisieren.' });
            }
        });

        // ── Start the game (host only) ───────────────────────────────────────
        on(socket, 'game:start', (_data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (!isHost())
                return ack({ error: 'Nur der Host kann das Spiel starten.' });
            if (session.status !== 'lobby')
                return ack({ error: 'Spiel läuft bereits.' });
            const err = startGame(io, session);
            ack(err ? { error: err } : { ok: true });
        });

        // ── Marathon draft: a human picks an ability ─────────────────────────
        on(socket, 'draft:pick', (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'draft') return ack({ error: 'Kein Draft aktiv.' });
            sessions.recordActivity(sessionId);

            const err = engine.draftPick(session, myIndex(), data.id);
            if (err) return ack({ error: err });
            ack({ ok: true });

            if (engine.isDraftDone(session)) return finishDraft(io, session);
            io.to(sessionId).emit('draft:update', engine.draftPayload(session));
        });

        // ── Game action ──────────────────────────────────────────────────────
        on(socket, 'action', (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'playing')
                return ack({ error: 'Spiel läuft nicht.' });
            if (!session.state)
                return ack({ error: 'Spielstatus fehlt.' });
            if (typeof data.type !== 'string') return ack({ error: 'Ungültige Aktion.' });
            const params = data.params && typeof data.params === 'object' ? data.params : {};

            const finalIndex = engine.stateIndexOf(session.state, myIndex(), me);

            if (session.state.cur !== finalIndex)
                return ack({ error: 'Du bist nicht am Zug.' });

            const err = engine.applyAction(session.state, finalIndex, data.type, params, () => {
                broadcastState(io, session);
                checkGameOver(io, session);
            });
            if (err) return ack({ error: err });

            sessions.recordActivity(sessionId);
            me.missedTurns = 0;             // acting is being there (turn timer)
            ack({ ok: true });

            // Re-sync all connected clients immediately after a valid action
            broadcastState(io, session);
            checkGameOver(io, session);
        });

        // ── Placement actions (for simultaneous plaettchen map) ─────────────────────
        on(socket, 'placement:action', (data, ack) => {
            if (!bound() || session.status !== 'placement') return ack({ error: 'Falscher Status' });

            const st = session.placementState;
            const seat = st.humanSeats.find(s => s.idx === myIndex());

            if (!seat) return ack({ error: 'Kein Startplatz für dich reserviert.' });
            if (seat.cell != null) return ack({ error: 'Du hast dein Startplättchen bereits platziert.' });

            const err = engine.getEngine().placeSeat(st.plan, seat, data.o, data.cell);
            if (err) return ack({ error: err });

            sessions.recordActivity(sessionId);
            st.placedCount++;
            ack({ ok: true });

            if (st.placedCount >= st.humanSeats.length) {
                // All players have placed! Generate map!
                session.gameConfig.map = engine.getEngine().tileMap(st.plan);
                try {
                    session.state = engine.createGame(session);
                    session.status = 'playing';
                    emitGameStart(io, session);
                } catch (e) {
                    console.error('Error starting game after placement', e);
                }
            }
        });

        // ── Chat: text, emotes, map pings (utils/chat.js) ────────────────────
        on(socket, 'chat:send', (data, ack) => {
            if (watcher) return ack({ error: 'Zuschauer können nicht schreiben.' });
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            const r = chat.build({ slot: myIndex(), name: me.name }, data, `live:${sessionId}:${me.clientId}`);
            if (r.error) return ack({ error: r.error });
            session.chat = chat.remember(session.chat, r.msg, chat.LIVE_HISTORY);
            ack({ ok: true });
            io.to(sessionId).emit('chat:msg', r.msg);
        });

        // ── Rematch (host only): the finished game goes back to its lobby ─────
        on(socket, 'session:rematch', (_data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (!isHost()) return ack({ error: 'Nur der Host kann eine Revanche starten.' });
            const r = sessions.resetForRematch(sessionId);
            if (typeof r === 'string') return ack({ error: r });
            ack({ ok: true });
            // Players who left are no longer in the lobby; everyone else gets their new seat
            session.players.forEach((p, i) => {
                if (!p.socketId) return;
                io.to(p.socketId).emit('session:rematch', {
                    playerIndex: i, hostIndex: session.hostIndex,
                    players: publicPlayers(session), gameConfig: session.gameConfig,
                });
            });
            // spectators keep watching: the lobby, then the next game
            for (const w of session.spectators || []) {
                if (!w.connected || !w.socketId) continue;
                io.to(w.socketId).emit('session:rematch', {
                    playerIndex: -1, spectator: true, hostIndex: session.hostIndex,
                    players: publicPlayers(session), gameConfig: session.gameConfig,
                });
            }
        });

        // ── Turn timer: an absent player takes their seat back from the KI ───
        on(socket, 'turn:reclaim', (_data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'playing' || !session.state) return ack({ error: 'Spiel läuft nicht.' });
            if (!me.afk) return ack({ ok: true });
            const S = session.state;
            const pi = engine.stateIndexOf(S, myIndex(), me);
            if (pi === -1) return ack({ error: 'Ungültiger Spieler.' });
            me.afk = false;
            me.missedTurns = 0;
            S.players[pi].kind = 'human';
            // The KI may already sit in this turn (its loop stops at a human): the clock starts anew
            if (S.cur === pi) session.turnClock = null;
            sessions.recordActivity(sessionId);
            ack({ ok: true });
            io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
            broadcastState(io, session);
        });

        // ── Disconnect ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            try {
                if (watcher) {
                    if (watcher.socketId !== socket.id) return;     // replaced by a newer connection
                    watcher.connected = false;
                    watcher.socketId = null;
                    io.to(sessionId).emit('spectators:update', { count: sessions.spectatorCount(session) });
                    return;
                }
                // Ignore if this socket was kicked or replaced by a newer connection of the same player
                if (!bound() || me.socketId !== socket.id) return;
                const playerIndex = myIndex();
                const wasHost = session.hostIndex === playerIndex;
                const pName = me.name;

                if (session.status === 'lobby') {
                    if (wasHost) {
                        sessions.removeSession(sessionId);
                        io.to(sessionId).emit('session:kicked', { reason: 'Der Host hat die Lobby geschlossen.' });
                    } else {
                        sessions.kickPlayer(sessionId, playerIndex, true);
                        if (session.players.length === 0) {
                            sessions.removeSession(sessionId);
                        } else {
                            fixHostAfterRemoval(session, playerIndex);
                            io.to(sessionId).emit('player:left', {
                                playerIndex,
                                name: pName,
                                players: publicPlayers(session),
                                newHostIndex: session.hostIndex
                            });
                            sendIndices(io, session);
                        }
                    }
                } else {
                    me.connected = false;
                    me.socketId = null;

                    if (wasHost) {
                        const nextHost = session.players.find(p => p.connected && p !== me);
                        if (nextHost) {
                            session.hostIndex = session.players.indexOf(nextHost);
                        }
                    }

                    io.to(sessionId).emit('player:left', {
                        playerIndex,
                        name: pName,
                        players: publicPlayers(session),
                        newHostIndex: session.hostIndex
                    });
                }
            } catch (err) {
                console.error('[Socket] disconnect failed:', err);
            }
        });
    });
    // Start the global 15-second synchronization loop
    if (!io.__syncInterval) {
        io.__syncInterval = setInterval(() => {
            const now = Date.now();
            for (const session of sessions.getAllSessions().values()) {
                if (session.status === 'playing' && session.state) {
                    try {
                        if (now - session.lastActivity < 30000) {
                            broadcastState(io, session);
                        }
                    } catch (err) {
                        console.error(`[Sync] Error syncing session ${session.id}:`, err);
                    }
                }
            }
        }, 15000);
    }
    // Turn timer: once a second, end the turns whose time is up
    if (!io.__turnInterval) {
        io.__turnInterval = setInterval(() => {
            const now = Date.now();
            for (const session of sessions.getAllSessions().values()) {
                const tc = session.turnClock;
                if (!tc || !tc.deadline || now < tc.deadline) continue;
                try {
                    timeOutTurn(io, session);
                } catch (err) {
                    console.error(`[Turn timer] Error in session ${session.id}:`, err);
                }
            }
        }, 1000);
        io.__turnInterval.unref();
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Start the game of a lobby: check the settings, fill the free seats with KI, deal random
 * nations and abilities, then the tile placement, the Marathon draft or the game itself.
 * Called by the host's 'game:start' and by the matchmaking (sockets/match.js).
 * Returns an error message (German) or null.
 */
function startGame(io, session) {
    if (session.players.filter(p => p.kind === 'human').length < 1)
        return 'Mindestens ein Spieler nötig.';
    sessions.recordActivity(session.id);

    const gc = session.gameConfig;
    const isPlaettchen = gc.mapKey === 'plaettchen' || gc.mapKey === 'random';
    const isCustom = gc.mapKey === 'eigene';
    if (isCustom && !gc.customMap) return 'Es ist noch keine eigene Karte gewählt.';
    // Marathon (v83): the standard random map 24 × 36 (four realms) or a custom map set
    // to the marathon rules; abilities are drafted
    const isMarathon = gc.mapKey === 'marathon' || (isCustom && !!gc.customMap.marathon);
    // nations chosen freely, also twice: tile map and custom maps (start points, not stars)
    const freeCivs = isPlaettchen || isCustom;
    if (isMarathon && !engine.marathonAvailable())
        return 'Diese Hochciv-Version kennt den Marathon noch nicht.';

    /* Empires: playerCount in all, kiCount of them reserved for the KI; free human
       seats are filled with KI as well. Older lobbies: 4 (or, "Nur Menschen", exactly the
       humans). The map decides how many are possible (mapLimits in engine.js). */
    const humans = session.players.length;
    const total = Number.isInteger(gc.playerCount) ? gc.playerCount : (gc.noKi ? humans : Math.max(4, humans));
    const kiSeats = Number.isInteger(gc.kiCount) ? gc.kiCount : 0;
    const lim = engine.getEngine().mapLimits(isPlaettchen ? 'plaettchen' : gc.mapKey, gc.customMap);
    if (total < lim.min || total > lim.max)
        return lim.min === lim.max ? `Auf dieser Karte spielen genau ${lim.min} Reiche.` : `Auf dieser Karte spielen ${lim.min} bis ${lim.max} Reiche.`;
    if (humans > total - kiSeats)
        return `Es sind ${humans} Spieler in der Lobby – eingestellt sind ${total} Reiche, davon ${kiSeats} für die KI.`;
    gc.playerCount = total;
    gc.duel = total === 2;

    // Each player's own lobby choice, for a rematch ("random" is resolved below)
    session.players.forEach(p => { p.choice = { civ: p.civ, ability: p.ability }; });

    // "Random nations for everyone": the host's setting overrides every player's choice
    if (gc.randomCivs) session.players.forEach(p => { p.civ = 'random'; p.ability = 'random'; });

    // Check for duplicate civilizations (fixed maps: every nation once; "random" is
    // resolved below to a nation nobody else has)
    if (!freeCivs) {
        const usedCivs = new Set();
        for (const p of session.players) {
            if (p.civ === 'random' || p.civ === 'zufall') continue;
            if (usedCivs.has(p.civ)) return `Die Nation '${p.civ}' wurde mehrfach gewählt! Auf dieser Karte sitzt jede Nation genau einmal.`;
            usedCivs.add(p.civ);
        }
    }

    // Fill the empty seats with KI players up to the number of empires
    while (session.players.length < total) {
        session.players.push({
            index: session.players.length,
            kind: 'ki',
            kiLevel: engine.kiLevelFor(session.gameConfig.difficulty),
            name: `KI ${session.players.length}`,
            civ: 'random',
            ability: 'random',
            connected: false
        });
    }

    // Sync resolveRandom & nameDoubles on server before progressing so all clients align natively
    const engineApi = engine.getEngine();
    const CIVS = engineApi.CIVS || [];
    const allCivs = CIVS.map(c => c.k).filter(k => k !== 'random' && k !== 'zufall');
    const pick = list => list[Math.floor(Math.random() * list.length)];
    // Random nations: fixed maps take one nobody has; free maps the least used ones, so
    // with more than four empires every nation comes once before any comes twice
    session.players.forEach((p, i) => {
        if (p.civ !== 'random' && p.civ !== 'zufall') return;
        const used = k => session.players.filter((q, j) => j !== i && q.civ === k).length;
        const fewest = Math.min(...allCivs.map(used));
        const pool = allCivs.filter(k => freeCivs ? used(k) === fewest : used(k) === 0);
        p.civ = pick(pool.length > 0 ? pool : allCivs);
    });
    session.players.forEach(p => {
        if (p.ability !== 'random' && p.ability !== 'zufall') return;
        const civDef = CIVS.find(c => c.k === p.civ) || { abilities: [{ k: 'basis' }] };
        p.ability = pick(civDef.abilities).k;
    });

    engine.assignDoubles(session.players);

    // Update clients immediately with finalized synced randomly rolled names & abilities
    io.to(session.id).emit('lobby:player:updated', publicPlayers(session));

    try {
        if (isPlaettchen) {
            const seed = Number.isInteger(session.gameConfig.seed) ? session.gameConfig.seed : Math.floor(Math.random() * 2 ** 31);
            const plan = engineApi.tilePlan(session.players.map(p => p.civ), seed);
            if (!plan) return 'Für diese Spielerzahl gibt es keine Plättchenkarte.';

            // v66+: starting techs and wonder pools are rolled before placement
            // (the clients roll the same thing locally from the same seed).
            session.gameConfig.seed = seed;
            session.gameConfig.setup = engine.rollSetup(session, seed);

            // Computer seats place right away: the KI looks at what a human in its
            // seat would see (needs the setup above); bot rules are the fallback.
            const rnd = engineApi.mapRng(seed + 12345);
            const humanSeats = [];
            plan.seats.forEach(seat => {
                const spl = session.players[seat.idx];
                if (spl && spl.kind === 'ki') {
                    const err = typeof engineApi.kiPlaceSeat === 'function'
                        ? engineApi.kiPlaceSeat(plan, seat, { civ: spl.civ, ability: spl.ability }, session.gameConfig.setup) : 'no ki';
                    if (err) engineApi.botPlaceSeat(plan, seat, rnd);
                } else if (spl && spl.kind === 'bot') {
                    engineApi.botPlaceSeat(plan, seat, rnd);
                } else {
                    humanSeats.push(seat);
                }
            });

            session.status = 'placement';
            session.placementState = {
                plan, seed, rnd,
                humanSeats,
                placedCount: 0
            };

            const { setup: _setup, ...publicCfg } = session.gameConfig;
            io.to(session.id).emit('placement:start', {
                cfg: publicCfg,
                seed,
                queue: humanSeats,
                at: 0,
                plan
            });
            return null;
        }

        if (isMarathon) {
            // Map + starting techs first; everyone sees them and drafts abilities
            engine.startDraft(session);
            session.status = 'draft';
            if (engine.isDraftDone(session)) { finishDraft(io, session); return null; }
            io.to(session.id).emit('draft:update', engine.draftPayload(session));
            return null;
        }

        session.state = engine.createGame(session);
        session.status = 'playing';
    } catch (err) {
        console.error('Error creating game:', err);
        return 'Fehler beim Spielstart.';
    }

    emitGameStart(io, session);
    return null;
}


/** A lobby player was removed at `removedIndex` – keep hostIndex pointing at the same player. */
function fixHostAfterRemoval(session, removedIndex) {
    if (session.hostIndex > removedIndex) session.hostIndex--;
    if (session.hostIndex >= session.players.length) session.hostIndex = 0;
}

/** After re-indexing, tell every connected player their new lobby index. */
function sendIndices(io, session) {
    session.players.forEach((p, i) => {
        if (p.socketId) io.to(p.socketId).emit('session:index', { playerIndex: i, hostIndex: session.hostIndex });
    });
}

/** Finish the game once: notify everyone and record history / MMR. */
function checkGameOver(io, session) {
    if (!session.state.over || session.gameOverProcessed) return;
    session.gameOverProcessed = true;
    session.status = 'finished';
    recordStats(session, true);
    io.to(session.id).emit('game:over', session.state.over);
    io.to(session.id).emit('game:stats', { stats: Stats.publicStats(session.stats) });
    // Always record history, calculate MMR only if ranked
    const isRanked = session.gameConfig && session.gameConfig.ranked === true;
    processGameOverMmr(session, io, session.id, isRanked);
}

/** Send every connected player the fresh game state and their own state index (spectators: -1). */
function emitGameStart(io, session) {
    recordStats(session, false);            // the start is the first point / frame
    session.players.forEach((lobbyPlayer, lobbyIndex) => {
        if (lobbyPlayer.socketId) {
            const finalIndex = engine.stateIndexOf(session.state, lobbyIndex, lobbyPlayer);
            io.to(lobbyPlayer.socketId).emit('game:start', {
                state: engine.stateForPlayer(session.state, finalIndex),
                yourIndex: finalIndex,
                turn: turnInfo(session),
            });
        }
    });
    for (const w of session.spectators || []) {
        if (!w.connected || !w.socketId) continue;
        io.to(w.socketId).emit('game:start', { state: engine.stateForPlayer(session.state, -1), yourIndex: -1, turn: turnInfo(session) });
    }
}

/** Marathon: all abilities are drafted – start the real game with them. */
function finishDraft(io, session) {
    try {
        session.state = engine.finishDraft(session);
        session.status = 'playing';
        io.to(session.id).emit('lobby:player:updated', publicPlayers(session));
        emitGameStart(io, session);
    } catch (e) {
        console.error('Error starting game after draft', e);
    }
}

function publicPlayers(session) {
    return session.players.map(p => ({
        index: p.index,
        name: p.name,
        civ: p.civ,
        ability: p.ability,
        drafted: p.drafted || null,     // Marathon: the two drafted abilities
        connected: p.connected,
        mmr: p.mmr || 1000,
        userId: p.dbUserId || null,     // account for the player profile (client/profile.js)
        kind: p.kind,                   // 'human' | 'ki' (the client places KI seats like the server)
        isBot: p.kind === 'bot' || p.kind === 'ki',     // computer seat (KI fill-in)
        afk: !!p.afk,                   // turn timer: the KI plays this absent player's seat
    }));
}

/** Statistics over the rounds (utils/stats.js) – names from the lobby, KI seats show their nation. */
/** Display names by state index: the lobby name of humans, null for KI seats (their nation is shown). */
function stateNames(session) {
    return session.state.players.map(sp => {
        const lp = session.players[sp.slot];
        return lp && lp.kind === 'human' ? lp.name : null;
    });
}

/** Statistics over the rounds (utils/stats.js) and the replay frame of a new turn (utils/replay.js). */
function recordStats(session, final) {
    const S = session.state;
    if (!S) return;
    try {
        session.stats = Stats.record(session.stats, engine.getEngine(), S, stateNames(session), final);
    } catch (err) {
        console.error(`[Stats] Recording failed in session ${session.id}:`, err);
    }
    try {
        session.replay = Replay.addLive(session.replay, S);
    } catch (err) {
        console.error(`[Replay] Recording failed in session ${session.id}:`, err);
    }
    try {
        session.marks = Summary.track(session.marks, engine.getEngine(), S);
    } catch (err) {
        console.error(`[Summary] Tracking failed in session ${session.id}:`, err);
    }
}

/**
 * "Since your last turn" (utils/summary.js): when a human's turn begins, what happened since
 * their last one – sent once with that state update (public information, derived from the state).
 */
function turnSummary(session) {
    const S = session.state;
    const key = S.round + ':' + S.cur;
    if (session.summaryKey === key) return undefined;
    session.summaryKey = key;
    session.lastSummary = null;
    if (S.over || engine.isAutoPlayer(S.players[S.cur])) return undefined;
    try {
        session.lastSummary = Summary.summarize(engine.getEngine(), S, session.marks, S.cur);
    } catch (err) {
        console.error(`[Summary] Failed in session ${session.id}:`, err);
    }
    return session.lastSummary || undefined;
}

function broadcastState(io, session) {
    if (!session || !session.state) return;
    recordStats(session, false);

    // Instead of deep cloning per-player in a loop, clone the state exactly once.
    // The engine's stateForPlayer currently treats the state as fully visible for all players.
    const sharedState = engine.stateForPlayer(session.state, 0);

    // Broadcast universally to everyone in the room. This avoids individual serialization per socket.
    io.to(session.id).emit('state:update', {
        state: sharedState,
        currentPlayer: session.state.cur,
        round: session.state.round,
        turn: turnInfo(session),
        summary: turnSummary(session),
    });
}

// ── Turn timer ────────────────────────────────────────────────────────────────

const turnTimeMs = session => {
    const t = session.gameConfig && session.gameConfig.turnTime;
    return TURN_TIMES.includes(t) && t > 0 ? t * 1000 * config.TURN_TIMER_SCALE : 0;
};

/**
 * Keep session.turnClock = { key, deadline } in step with the state: a new turn (round and
 * player) of a human starts the clock, KI / bot turns and games without a limit have none.
 */
function updateTurnClock(session) {
    const S = session.state;
    if (!S || S.over || session.status !== 'playing') { session.turnClock = null; return; }
    const key = S.round + ':' + S.cur;
    if (session.turnClock && session.turnClock.key === key) return;
    const ms = turnTimeMs(session);
    const human = !engine.isAutoPlayer(S.players[S.cur]);
    session.turnClock = { key, deadline: ms && human ? Date.now() + ms : null };
}

/** For the clients: { total, left } in ms (left null: no clock running now), or null without a limit. */
function turnInfo(session) {
    updateTurnClock(session);
    const total = turnTimeMs(session);
    if (!total) return null;
    const tc = session.turnClock;
    return { total, left: tc && tc.deadline ? Math.max(0, tc.deadline - Date.now()) : null };
}

/**
 * The current player's time is up: the KI plays the rest of the turn and ends it. After
 * AFK_AFTER such turns in a row the KI keeps the seat – unless nobody else would be left to
 * play, then only this turn is played for them.
 */
function timeOutTurn(io, session) {
    const S = session.state;
    session.turnClock.deadline = null;              // once per turn
    if (!S || S.over || session.status !== 'playing') return;
    const pi = S.cur;
    if (engine.isAutoPlayer(S.players[pi])) return;
    const lp = session.players.find((p, i) => engine.stateIndexOf(S, i, p) === pi);
    if (!lp) return;

    lp.missedTurns = (lp.missedTurns || 0) + 1;
    const othersActive = session.players.some(p => p !== lp && p.kind === 'human' && !p.afk);
    lp.afk = lp.missedTurns >= AFK_AFTER && othersActive;
    const level = session.gameConfig.ranked ? AFK_KI_LEVEL.ranked : AFK_KI_LEVEL.normal;
    console.log(`[Turn timer] Session ${session.id}: time up for ${lp.name} (${lp.missedTurns} in a row${lp.afk ? ', KI keeps the seat' : ''})`);

    sessions.recordActivity(session.id);
    if (lp.socketId) io.to(lp.socketId).emit('turn:timeout', { afk: lp.afk });
    engine.finishTurnForAbsent(S, level, lp.afk, () => {
        broadcastState(io, session);
        checkGameOver(io, session);
    });
    if (lp.afk) io.to(session.id).emit('lobby:player:updated', publicPlayers(session));
    broadcastState(io, session);
    checkGameOver(io, session);
}

/**
 * Handle game over stats processing, database persistence, and Rating scaling.
 */
async function processGameOverMmr(session, io, sessionId, isRanked = false) {
    try {
        if (!engine.getEngine().victoryScore) return console.error('victoryScore function not exposed from engine');

        // Compile participant data
        const playersData = [];
        for (let i = 0; i < session.players.length; i++) {
            const lp = session.players[i];
            
            // Map lobby player to state player (indexes can differ due to sorting/barbarians)
            const finalIndex = engine.stateIndexOf(session.state, i, lp);

            // S.over = { winner, winners: [stateIndex, ...], how, ... } (current engine);
            // very old engines used { id: civ }.
            const over = session.state.over || {};
            const isWinner = Array.isArray(over.winners) ? (finalIndex !== -1 && over.winners.includes(finalIndex))
                : over.id ? (lp.civ === over.id) : false;

            let scoreDetails = null;
            if (finalIndex !== -1) {
                try {
                    scoreDetails = engine.getEngine().victoryScore(session.state, finalIndex) || null;
                } catch (e) {
                    console.error('Error fetching score for player', finalIndex, e);
                }
            }
            const points = finalPoints(scoreDetails, isWinner);   // + WIN_BONUS for the winner

            playersData.push({
                dbUserId: lp.dbUserId,
                dbUsername: lp.dbUsername,
                name: lp.name,
                civ: lp.civ,
                ability: lp.ability,
                drafted: lp.drafted || null,
                isBot: lp.kind === 'bot' || lp.kind === 'ki',
                points: points,
                scoreDetails: scoreDetails,
                isWinner: isWinner
            });
        }

        // Fetch current MMR for all human users from DB
        for (let p of playersData) {
            if (p.dbUserId) {
                const u = await User.findByPk(p.dbUserId);
                p.mmr = u ? u.mmr : 1000;
            } else {
                p.mmr = 1000; // Fill bot MMR or missing user as baseline
            }
        }

        // One account on several seats would rate itself against itself – no MMR then
        const userIds = playersData.map(p => p.dbUserId).filter(Boolean);
        if (isRanked && new Set(userIds).size !== userIds.length) {
            console.warn(`[Stats] Game ${sessionId}: one account held several seats – not rated.`);
            isRanked = false;
        }

        if (isRanked) {
            // Execute Custom ELO/MMR Engine
            const mmrResults = calculateMMR(playersData);

            // Map results back for DB persistence
            for (let res of mmrResults) {
                const p = playersData.find(x => x.dbUserId === res.dbUserId && x.dbUserId != null);
                if (p) {
                    p.mmrShift = res.mmrChange;
                    p.oldMmr = res.oldMmr;
                    p.newMmr = res.newMmr;

                    // Persist new MMR to DB
                    await User.update({
                        mmr: res.newMmr,
                        gamesPlayed: sequelize.literal('"gamesPlayed" + 1')
                    }, { where: { id: p.dbUserId } });
                }
            }
        } else {
            // Unranked games just increment gamesPlayed
            for (let p of playersData) {
                if (p.dbUserId) {
                    await User.update({
                        gamesPlayed: sequelize.literal('"gamesPlayed" + 1')
                    }, { where: { id: p.dbUserId } });
                }
            }
        }

        // Log the Historic Match Record
        const version = engine.getEngine().APP_VERSION || 'Unknown';
        const game = await Game.create({
            version,
            durationRounds: session.state.round,
            winnerUsername: playersData.find(p => p.isWinner)?.dbUsername || null,
            participants: playersData,
            stats: Stats.publicStats(session.stats),
        });

        // The replay (utils/replay.js) – then the end screen can offer it
        let replay = false;
        try {
            replay = await Replay.save(game.id, version, stateNames(session), session.replay && session.replay.frames);
        } catch (err) {
            console.error(`[Replay] Saving failed for ${sessionId}:`, err);
        }
        session.replay = null;
        session.gameRecord = { id: game.id, replay };
        if (io) io.to(sessionId).emit('game:record', session.gameRecord);

        console.log(`[Stats] Successfully processed game ${sessionId}. Ranked: ${isRanked}. History saved.`);

    } catch (err) {
        console.error('[Stats] Failed to process game over logic:', err);
    }
}

// for tests/score
module.exports.processGameOverMmr = processGameOverMmr;
// for the matchmaking (sockets/match.js)
module.exports.startGame = startGame;
module.exports.publicPlayers = publicPlayers;
