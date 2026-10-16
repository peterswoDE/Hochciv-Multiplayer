const sessions = require('../sessions');
const engine = require('../engine-adapter');
const { User, Game, sequelize } = require('../models');
const { calculateMMR } = require('../utils/mmr');

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
            if (!player) return ack({ error: 'Ungültiger Spieler. Bitte erneut beitreten.' });

            sessionId = s.id;
            session = s;
            me = player;
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

            ack({ ok: true, playerIndex, status: s.status, players: publicPlayers(s), gameConfig: s.gameConfig, hostIndex: s.hostIndex });

            // Tell everyone a player (re-)connected
            io.to(sessionId).emit('player:joined', {
                playerIndex,
                name: me.name,
                civ: me.civ,
                players: publicPlayers(s),
                newHostIndex: s.hostIndex
            });

            // Marathon draft in progress: show the reconnecting player the draft screen
            if (s.status === 'draft' && s.draft) {
                socket.emit('draft:update', engine.draftPayload(s));
            }

            // If game is already playing, send current state to the reconnecting player right away
            if (s.status === 'playing' && s.state) {
                const sortedStateIndex = engine.stateIndexOf(s.state, playerIndex, me);
                socket.emit('game:start', {
                    state: engine.stateForPlayer(s.state, sortedStateIndex),
                    yourIndex: sortedStateIndex,
                });
            }
        });

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
            if (session.players.filter(p => p.kind === 'human').length < 1)
                return ack({ error: 'Mindestens ein Spieler nötig.' });
            sessions.recordActivity(sessionId);

            const isPlaettchen = session.gameConfig.mapKey === 'plaettchen' || session.gameConfig.mapKey === 'random';
            // Marathon (v83): random map 24 × 36, always four realms, abilities are drafted
            const isMarathon = session.gameConfig.mapKey === 'marathon';
            if (isMarathon && !engine.marathonAvailable())
                return ack({ error: 'Diese Hochciv-Version kennt den Marathon noch nicht.' });

            // Check for duplicate civilizations (only if not on a random map).
            // On the marathon map "random" is fine – it is resolved to a civ nobody else has.
            if (!isPlaettchen) {
                const usedCivs = new Set();
                for (const p of session.players) {
                    if (p.civ === 'random' || p.civ === 'zufall') {
                        if (isMarathon) continue;
                        return ack({ error: 'Zufällige Zivilisationen sind nur auf der Zufallskarte erlaubt!' });
                    }
                    if (usedCivs.has(p.civ)) return ack({ error: `Die Nation '${p.civ}' wurde mehrfach gewählt! Dies ist nur auf der Zufallskarte erlaubt.` });
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

            engine.assignDoubles(session.players);

            // Update clients immediately with finalized synced randomly rolled names & abilities
            io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));

            try {
                if (isPlaettchen) {
                    const seed = Number.isInteger(session.gameConfig.seed) ? session.gameConfig.seed : Math.floor(Math.random() * 2 ** 31);
                    const plan = engineApi.tilePlan(session.players.map(p => p.civ), seed);
                    if (!plan) return ack({ error: 'Für diese Spielerzahl gibt es keine Plättchenkarte.' });

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

                    // v66+: starting techs and wonder pools are rolled before placement
                    // (the clients roll the same thing locally from the same seed).
                    session.gameConfig.seed = seed;
                    session.gameConfig.setup = engine.rollSetup(session, seed);

                    session.status = 'placement';
                    session.placementState = {
                        plan, seed, rnd,
                        humanSeats,
                        placedCount: 0
                    };

                    ack({ ok: true });
                    const { setup: _setup, ...publicCfg } = session.gameConfig;
                    io.to(sessionId).emit('placement:start', {
                        cfg: publicCfg,
                        seed,
                        queue: humanSeats,
                        at: 0,
                        plan
                    });
                    return;
                }

                if (isMarathon) {
                    // Map + starting techs first; everyone sees them and drafts abilities
                    engine.startDraft(session);
                    session.status = 'draft';
                    ack({ ok: true });
                    if (engine.isDraftDone(session)) return finishDraft(io, session);
                    io.to(sessionId).emit('draft:update', engine.draftPayload(session));
                    return;
                }

                session.state = engine.createGame(session);
                session.status = 'playing';
            } catch (err) {
                console.error('Error creating game:', err);
                return ack({ error: 'Fehler beim Spielstart.' });
            }

            ack({ ok: true });
            emitGameStart(io, session);
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

        // ── Disconnect ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            try {
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
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    io.to(session.id).emit('game:over', session.state.over);
    // Always record history, calculate MMR only if ranked
    const isRanked = session.gameConfig && session.gameConfig.ranked === true;
    processGameOverMmr(session, io, session.id, isRanked);
}

/** Send every connected player the fresh game state and their own state index. */
function emitGameStart(io, session) {
    session.players.forEach((lobbyPlayer, lobbyIndex) => {
        if (lobbyPlayer.socketId) {
            const finalIndex = engine.stateIndexOf(session.state, lobbyIndex, lobbyPlayer);
            io.to(lobbyPlayer.socketId).emit('game:start', {
                state: engine.stateForPlayer(session.state, finalIndex),
                yourIndex: finalIndex,
            });
        }
    });
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
        isBot: p.kind === 'bot',
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
async function processGameOverMmr(session, io, sessionId, isRanked = false) {
    try {
        if (!engine.getEngine().victoryScore) return console.error('victoryScore function not exposed from engine');

        // Compile participant data
        const playersData = [];
        for (let i = 0; i < session.players.length; i++) {
            const lp = session.players[i];
            
            // Map lobby player to state player (indexes can differ due to sorting/barbarians)
            const finalIndex = engine.stateIndexOf(session.state, i, lp);

            let points = 0;
            let scoreDetails = null;
            
            if (finalIndex !== -1) {
                try {
                    const scoreObj = engine.getEngine().victoryScore(session.state, finalIndex);
                    scoreDetails = scoreObj || null;
                    points = scoreObj ? scoreObj.total : 0;
                } catch (e) {
                    console.error('Error fetching score for player', finalIndex, e);
                }
            }

            // S.over = { winner, winners: [stateIndex, ...], how, ... } (current engine);
            // very old engines used { id: civ }.
            const over = session.state.over || {};
            const isWinner = Array.isArray(over.winners) ? (finalIndex !== -1 && over.winners.includes(finalIndex))
                : over.id ? (lp.civ === over.id) : false;

            playersData.push({
                dbUserId: lp.dbUserId,
                dbUsername: lp.dbUsername,
                name: lp.name,
                civ: lp.civ,
                ability: lp.ability,
                drafted: lp.drafted || null,
                isBot: lp.kind === 'bot',
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
        await Game.create({
            version: engine.getEngine().APP_VERSION || 'Unknown',
            durationRounds: session.state.round,
            winnerUsername: playersData.find(p => p.isWinner)?.dbUsername || null,
            participants: playersData
        });

        console.log(`[Stats] Successfully processed game ${sessionId}. Ranked: ${isRanked}. History saved.`);

    } catch (err) {
        console.error('[Stats] Failed to process game over logic:', err);
    }
}
