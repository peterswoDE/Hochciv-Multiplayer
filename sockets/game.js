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

            // Mark connected
            s.players[playerIndex].connected = true;
            s.players[playerIndex].socketId = socket.id;

            // Join a Socket.IO room for this session
            socket.join(sessionId);

            ack?.({ ok: true, status: s.status, players: publicPlayers(s), gameConfig: s.gameConfig });

            // Tell everyone a player (re-)connected
            io.to(sessionId).emit('player:joined', {
                playerIndex,
                name: s.players[playerIndex].name,
                civ: s.players[playerIndex].civ,
                players: publicPlayers(s),
            });
        });

        // ── Kick Player (Host only) ──────────────────────────────────────────
        socket.on('session:kick', (data, ack) => {
            if (!session) return ack?.({ error: 'Nicht verbunden.' });
            if (playerIndex !== session.hostIndex) return ack?.({ error: 'Nur der Host kann kicken.' });

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

            const updated = sessions.updateConfig(sessionId, newConfig);
            if (updated) {
                ack?.({ ok: true });
                io.to(sessionId).emit('lobby:config:update', updated);
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

            try {
                session.state = engine.createGame(session);
                session.status = 'playing';
            } catch (err) {
                console.error('Error creating game:', err);
                return ack?.({ error: 'Fehler beim Spielstart: ' + err.message });
            }

            ack?.({ ok: true });

            // Send initial state to each player
            for (const p of session.players) {
                if (p.socketId) {
                    io.to(p.socketId).emit('game:start', {
                        state: engine.stateForPlayer(session.state, p.index),
                        yourIndex: p.index,
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

            const { type, params } = data || {};
            if (!type) return ack?.({ error: 'Aktionstyp fehlt.' });

            const err = engine.applyAction(session.state, playerIndex, type, params || {});
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
                session.players[playerIndex].connected = false;
                session.players[playerIndex].socketId = null;
                io.to(sessionId).emit('player:left', {
                    playerIndex,
                    name: session.players[playerIndex].name,
                    players: publicPlayers(session),
                });
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
        connected: p.connected,
    }));
}

function broadcastState(io, session) {
    for (const p of session.players) {
        if (p.socketId) {
            io.to(p.socketId).emit('state:update', {
                state: engine.stateForPlayer(session.state, p.index),
                currentPlayer: session.state.cur,
                round: session.state.round,
            });
        }
    }
}
