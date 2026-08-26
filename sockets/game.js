const sessions = require('../sessions');
const engine = require('../engine-adapter');

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

            // Check for duplicate civilizations
            const usedCivs = new Set();
            for (const p of session.players) {
                if (usedCivs.has(p.civ)) return ack?.({ error: `Die Nation '${p.civ}' wurde mehrfach gewählt!` });
                usedCivs.add(p.civ);
            }

            try {
                session.state = engine.createGame(session);
                session.status = 'playing';
            } catch (err) {
                console.error('Error creating game:', err);
                return ack?.({ error: 'Fehler beim Spielstart: ' + err.message });
            }

            ack?.({ ok: true });

            // Send initial state to each player
            for (const lobbyPlayer of session.players) {
                if (lobbyPlayer.socketId) {
                    // engine.js sorts players by civ in newGame(), so we must find their updated index in the state!
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
                return ack?.({ error: 'Kein Spielstand.' });
            sessions.recordActivity(sessionId);

            const { type, params } = data || {};
            if (!type) return ack?.({ error: 'Aktionstyp fehlt.' });

            // playerIndex is the Lobby join index! Map it to the sorted state index.
            const lobbyCiv = session.players[playerIndex].civ;
            const stateIndex = session.state.players.findIndex(p => p.civ === lobbyCiv);

            if (stateIndex === -1) return ack?.({ error: 'Spieler nicht in der Partie.' });

            const err = engine.applyAction(session.state, stateIndex, type, params || {});
            if (err) return ack?.({ error: err });

            ack?.({ ok: true });

            // Broadcast updated state to all players
            broadcastState(io, session);

            // Check for game over
            if (session.state.over) {
                session.status = 'finished';
                io.to(sessionId).emit('game:over', session.state.over);
            }
        });

        // ── Disconnect ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            if (session && session.players[playerIndex]) {
                const isHost = session.hostIndex === playerIndex;
                const pName = session.players[playerIndex].name;

                if (session.status === 'lobby') {
                    sessions.kickPlayer(sessionId, playerIndex, true);

                    if (session.players.length === 0) {
                        sessions.removeSession(sessionId);
                    } else {
                        if (isHost) {
                            session.hostIndex = 0; // After kick reindex, 0 is the new Host
                        }
                        io.to(sessionId).emit('player:left', {
                            playerIndex,
                            name: pName,
                            players: publicPlayers(session),
                            newHostIndex: session.hostIndex
                        });
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
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function publicPlayers(session) {
    return session.players.map(p => ({
        index: p.index,
        name: p.name,
        civ: p.civ,
        ability: p.ability,
        connected: p.connected,
    }));
}

function broadcastState(io, session) {
    for (const p of session.players) {
        if (p.socketId) {
            const stateIndex = session.state.players.findIndex(sp => sp.civ === p.civ);
            io.to(p.socketId).emit('state:update', {
                state: engine.stateForPlayer(session.state, stateIndex),
                currentPlayer: session.state.cur,
                round: session.state.round,
            });
        }
    }
}
