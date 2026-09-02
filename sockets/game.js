const sessions = require('../sessions');
const engine = require('../engine-adapter');
const { User, Game } = require('../models');
const { calculateMMR } = require('../utils/mmr');
/**
 * Register Socket.IO event handlers on the given server instance.
 * @param {import('socket.io').Server} io
 */
module.exports = function registerHandlers(io) {

    io.on('connection', (socket) => {
        let sessionId = null;
        let playerIndex = null;
        let session = null;

        // ── Authenticate / bind to a session ─────────────────────────────────
        socket.on('session:connect', (data, ack) => {
            const s = sessions.getSession(data.sessionId);
            if (!s) return ack?.({ error: 'Sitzung nicht gefunden.' });
            if (data.playerIndex == null || !s.players[data.playerIndex])
                return ack?.({ error: 'Ungültiger Spielerindex.' });
            if (s.password !== data.password)
                return ack?.({ error: 'Falsches Passwort.' });

            sessionId = s.id;
            playerIndex = data.playerIndex;
            session = s;

            sessions.recordActivity(sessionId);

            const oldHostOffline = !s.players[s.hostIndex].connected;

            // Mark connected
            s.players[playerIndex].connected = true;
            s.players[playerIndex].socketId = socket.id;
            if (socket.request.user) {
                s.players[playerIndex].dbUserId = socket.request.user.id;
                s.players[playerIndex].dbUsername = socket.request.user.username;
                s.players[playerIndex].mmr = socket.request.user.mmr;
            }

            // Reclaim host if the lobby was abandoned
            if (oldHostOffline && s.hostIndex !== playerIndex) {
                s.hostIndex = playerIndex;
            }

            // Join a Socket.IO room for this session
            socket.join(sessionId);

            ack?.({ ok: true, status: s.status, players: publicPlayers(s), gameConfig: s.gameConfig, hostIndex: s.hostIndex });

            // Tell everyone a player (re-)connected
            io.to(sessionId).emit('player:joined', {
                playerIndex,
                name: s.players[playerIndex].name,
                civ: s.players[playerIndex].civ,
                players: publicPlayers(s),
                newHostIndex: s.hostIndex
            });

            // If game is already playing, send current state to the reconnecting player right away
            if (s.status === 'playing' && s.state) {
                const sortedStateIndex = s.state.players.findIndex(p => p.civ === s.players[playerIndex].civ);
                socket.emit('game:start', {
                    state: engine.stateForPlayer(s.state, sortedStateIndex),
                    yourIndex: sortedStateIndex,
                });
            }
        });

        // ── Kick Player (Host only) ──────────────────────────────────────────
        socket.on('session:kick', (data, ack) => {
            if (!session) return ack?.({ error: 'Nicht verbunden.' });
            if (playerIndex !== session.hostIndex) return ack?.({ error: 'Nur der Host kann kicken.' });
            sessions.recordActivity(sessionId);

            const targetIndex = data.playerIndex;
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

                ack?.({ ok: true });
                io.to(sessionId).emit('player:left', {
                    playerIndex: targetIndex,
                    name: kickedPlayer ? kickedPlayer.name : 'Spieler',
                    players: publicPlayers(session),
                });
            } else {
                ack?.({ error: 'Konnte Spieler nicht kicken.' });
            }
        });

        // ── Update Lobby Config (Host only) ──────────────────────────────────
        socket.on('lobby:config', (newConfig, ack) => {
            if (!session) return ack?.({ error: 'Nicht verbunden.' });
            if (playerIndex !== session.hostIndex) return ack?.({ error: 'Nur der Host kann Einstellungen ändern.' });
            sessions.recordActivity(sessionId);

            const updated = sessions.updateConfig(sessionId, newConfig);
            if (updated) {
                ack?.({ ok: true });
                io.to(sessionId).emit('lobby:config:update', updated);
            } else {
                ack?.({ error: 'Konnte Einstellungen nicht aktualisieren.' });
            }
        });

        // ── Update Player Config (Lobby) ─────────────────────────────────────
        socket.on('lobby:player:update', (updates, ack) => {
            if (!session) return ack?.({ error: 'Nicht verbunden.' });
            if (session.status !== 'lobby') return ack?.({ error: 'Spiel läuft bereits.' });
            sessions.recordActivity(sessionId);

            const updated = sessions.updatePlayer(sessionId, playerIndex, updates);
            if (updated) {
                ack?.({ ok: true });
                io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
            } else {
                ack?.({ error: 'Konnte Einstellungen nicht aktualisieren.' });
            }
        });

        // ── Start the game (host only) ───────────────────────────────────────
        socket.on('game:start', (_data, ack) => {
            if (!session) return ack?.({ error: 'Nicht verbunden.' });
            if (playerIndex !== session.hostIndex)
                return ack?.({ error: 'Nur der Host kann das Spiel starten.' });
            if (session.status !== 'lobby')
                return ack?.({ error: 'Spiel läuft bereits.' });
            if (session.players.filter(p => p.kind === 'human').length < 1)
                return ack?.({ error: 'Mindestens ein Spieler nötig.' });
            sessions.recordActivity(sessionId);

            const isPlaettchen = session.gameConfig.mapKey === 'plaettchen' || session.gameConfig.mapKey === 'random';

            // Check for duplicate civilizations (only if not on a random map)
            if (!isPlaettchen) {
                const usedCivs = new Set();
                for (const p of session.players) {
                    if (p.civ === 'random' || p.civ === 'zufall') return ack?.({ error: 'Zufällige Zivilisationen sind nur auf der Zufallskarte erlaubt!' });
                    if (usedCivs.has(p.civ)) return ack?.({ error: `Die Nation '${p.civ}' wurde mehrfach gewählt! Dies ist nur auf der Zufallskarte erlaubt.` });
                    usedCivs.add(p.civ);
                }
            }

            // Fill empty lobby slots with bots up to exactly 4 players
            while (session.players.length < 4) {
                session.players.push({
                    index: session.players.length,
                    kind: 'bot',
                    name: `Bot ${session.players.length}`,
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
            session.players.forEach((p, i) => {
                if (p.civ !== 'random' && p.civ !== 'zufall') return;
                const pool = allCivs.filter(k => isPlaettchen || !session.players.some((q, j) => j !== i && q.civ === k));
                p.civ = pick(pool.length > 0 ? pool : allCivs);
            });
            session.players.forEach(p => {
                if (p.ability !== 'random' && p.ability !== 'zufall') return;
                const civDef = CIVS.find(c => c.k === p.civ) || { abilities: [{ k: 'basis' }] };
                p.ability = pick(civDef.abilities).k;
            });

            const zaehler = {};
            session.players.forEach(p => { zaehler[p.civ] = (zaehler[p.civ] || 0) + 1; });
            const belegt = new Set();
            session.players.forEach(p => { if (!belegt.has(p.civ)) { belegt.add(p.civ); p.colorOf = p.civ; } });
            session.players.forEach(p => {
                if (p.colorOf) return;
                const frei = CIVS.map(c => c.k).find(k => !belegt.has(k)) || p.civ;
                belegt.add(frei); p.colorOf = frei;
            });
            const lauf = {};
            session.players.forEach(p => {
                const civ = CIVS.find(c => c.k === p.civ);
                p.color = p.colorOf === p.civ ? null : (CIVS.find(c => c.k === p.colorOf) || {}).color;
                delete p.colorOf;
                if (zaehler[p.civ] > 1 && civ) {
                    const k = lauf[p.civ] = (lauf[p.civ] || 0) + 1;
                    const ROMAN = ['I', 'II', 'III', 'IV'];
                    p.mappedName = `${civ.n} ${ROMAN[k - 1] || k}`;
                }
            });

            // Update clients immediately with finalized synced randomly rolled names & abilities
            io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));

            try {
                if (isPlaettchen) {
                    const seed = session.gameConfig.seed || Math.floor(Math.random() * 2 ** 31);
                    const plan = engineApi.tilePlan(session.players.map(p => p.civ), seed);
                    if (!plan) return ack?.({ error: 'Für diese Spielerzahl gibt es keine Plättchenkarte.' });

                    const rnd = engineApi.mapRng(seed + 12345);
                    const humanSeats = [];
                    plan.seats.forEach(seat => {
                        const spl = session.players[seat.idx];
                        if (spl && spl.kind === 'bot') {
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

                    ack?.({ ok: true });
                    io.to(sessionId).emit('placement:start', {
                        cfg: session.gameConfig,
                        seed,
                        queue: humanSeats,
                        at: 0,
                        plan
                    });
                    return;
                }

                session.state = engine.createGame(session);
                session.status = 'playing';
            } catch (err) {
                console.error('Error creating game:', err);
                return ack?.({ error: 'Fehler beim Spielstart: ' + err.message });
            }

            ack?.({ ok: true });

            for (const lobbyPlayer of session.players) {
                if (lobbyPlayer.socketId) {
                    const sortedStateIndex = session.state.players.findIndex(p => p.civ === lobbyPlayer.civ);
                    io.to(lobbyPlayer.socketId).emit('game:start', {
                        state: engine.stateForPlayer(session.state, sortedStateIndex),
                        yourIndex: sortedStateIndex,
                    });
                }
            }
        });

        // ── Game action ──────────────────────────────────────────────────────
        socket.on('action', (data, ack) => {
            if (!session) return ack?.({ error: 'Nicht verbunden.' });
            if (session.status !== 'playing')
                return ack?.({ error: 'Spiel läuft nicht.' });
            if (!session.state)
                return ack?.({ error: 'Spielstatus fehlt.' });

            const lobbyPlayer = session.players[playerIndex];
            const expectedName = lobbyPlayer.mappedName || lobbyPlayer.name || (engine.getEngine().CIVS.find(c => c.k === lobbyPlayer.civ) || {}).n;
            let sortedStateIndex = session.state.players.findIndex(p => p.name === expectedName);
            const finalIndex = sortedStateIndex === -1 ? session.state.players.findIndex(p => p.civ === lobbyPlayer.civ) : sortedStateIndex;

            if (session.state.cur !== finalIndex)
                return ack?.({ error: 'Du bist nicht am Zug.' });

            const err = engine.applyAction(session.state, finalIndex, data.type, data.params, () => {
                broadcastState(io, session);
                if (session.state.over) {
                    session.status = 'finished';
                    io.to(sessionId).emit('game:over', session.state.over);
                }
            });
            if (err) return ack?.({ error: err });

            ack?.({ ok: true });

            // Re-sync all connected clients immediately after a valid action
            broadcastState(io, session);

            // Check for game over
            if (session.state.over) {
                session.status = 'finished';
                io.to(sessionId).emit('game:over', session.state.over);

                // If the game was flagged as ranked, compile the MMR data
                if (session.gameConfig && session.gameConfig.ranked) {
                    processGameOverMmr(session, io, sessionId);
                }
            }
        });

        // ── Placement actions (for simultaneous plaettchen map) ─────────────────────
        socket.on('placement:action', (data, ack) => {
            if (!session || session.status !== 'placement') return ack?.({ error: 'Falscher Status' });

            const st = session.placementState;
            const seat = st.humanSeats.find(s => s.idx === playerIndex);

            if (!seat) return ack?.({ error: 'Kein Startplatz für dich reserviert.' });
            if (seat.cell != null) return ack?.({ error: 'Du hast dein Startplättchen bereits platziert.' });

            const err = engine.getEngine().placeSeat(st.plan, seat, data.o, data.cell);
            if (err) return ack?.({ error: err });

            st.placedCount++;
            ack?.({ ok: true });

            if (st.placedCount >= st.humanSeats.length) {
                // All players have placed! Generate map!
                session.gameConfig.map = engine.getEngine().tileMap(st.plan);
                try {
                    session.state = engine.createGame(session);
                    session.status = 'playing';

                    for (const lobbyPlayer of session.players) {
                        if (lobbyPlayer.socketId) {
                            const expectedName = lobbyPlayer.mappedName || lobbyPlayer.name || (engine.getEngine().CIVS.find(c => c.k === lobbyPlayer.civ) || {}).n;
                            let sortedStateIndex = session.state.players.findIndex(p => p.name === expectedName);
                            const finalIndex = sortedStateIndex === -1 ? session.state.players.findIndex(p => p.civ === lobbyPlayer.civ) : sortedStateIndex;
                            io.to(lobbyPlayer.socketId).emit('game:start', {
                                state: engine.stateForPlayer(session.state, finalIndex),
                                yourIndex: finalIndex,
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error starting game after placement', e);
                }
            }
        });

        // ── Disconnect ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            if (session && session.players[playerIndex]) {
                const isHost = session.hostIndex === playerIndex;
                const pName = session.players[playerIndex].name;

                if (session.status === 'lobby') {
                    if (isHost) {
                        sessions.removeSession(sessionId);
                        io.to(sessionId).emit('session:kicked', { reason: 'Der Host hat die Lobby geschlossen.' });
                    } else {
                        sessions.kickPlayer(sessionId, playerIndex, true);
                        if (session.players.length === 0) {
                            sessions.removeSession(sessionId);
                        } else {
                            io.to(sessionId).emit('player:left', {
                                playerIndex,
                                name: pName,
                                players: publicPlayers(session),
                                newHostIndex: session.hostIndex
                            });
                        }
                    }
                } else {
                    session.players[playerIndex].connected = false;
                    session.players[playerIndex].socketId = null;

                    if (isHost) {
                        const nextHost = session.players.find(p => p.connected && p.index !== playerIndex);
                        if (nextHost) {
                            session.hostIndex = nextHost.index;
                        }
                    }

                    io.to(sessionId).emit('player:left', {
                        playerIndex,
                        name: pName,
                        players: publicPlayers(session),
                        newHostIndex: session.hostIndex
                    });
                }
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
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function publicPlayers(session) {
    return session.players.map(p => ({
        index: p.index,
        name: p.name,
        civ: p.civ,
        ability: p.ability,
        connected: p.connected,
        mmr: p.mmr || 1000
    }));
}

function broadcastState(io, session) {
    if (!session || !session.state) return;

    // Instead of deep cloning per-player in a loop, clone the state exactly once.
    // The engine's stateForPlayer currently treats the state as fully visible for all players.
    const sharedState = engine.stateForPlayer(session.state, 0);

    // Broadcast universally to everyone in the room. This avoids individual serialization per socket.
    io.to(session.id).emit('state:update', {
        state: sharedState,
        currentPlayer: session.state.cur,
        round: session.state.round,
    });
}

/**
 * Handle game over stats processing, database persistence, and Rating scaling.
 */
async function processGameOverMmr(session, io, sessionId) {
    try {
        if (!engine.getEngine().victoryScore) return console.error('victoryScore function not exposed from engine');

        // Compile participant data
        const playersData = [];
        for (let i = 0; i < session.players.length; i++) {
            const lp = session.players[i];
            const sp = session.state.players[i];

            let points = 0;
            try {
                points = engine.getEngine().victoryScore(session.state, i);
            } catch (e) {
                console.error('Error fetching score for player', i, e);
            }

            playersData.push({
                dbUserId: lp.dbUserId,
                dbUsername: lp.dbUsername,
                name: lp.name,
                civ: lp.civ,
                ability: lp.ability,
                isBot: lp.kind === 'bot',
                points: points
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

        // Log the Historic Match Record
        await Game.create({
            version: engine.getEngine().APP_VERSION || 'Unknown',
            durationRounds: session.state.round,
            winnerUsername: session.state.over && session.state.over.id ? playersData.find(p => p.civ === session.state.over.id)?.dbUsername : null,
            participants: playersData
        });

        console.log(`[MMR] Successfully processed ranked game ${sessionId}. Ratings updated.`);

    } catch (err) {
        console.error('[MMR] Failed to process game over logic:', err);
    }
}
