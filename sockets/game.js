const sessions = require('../sessions');
const engine = require('../engine-adapter');
const Rating = require('../utils/rating');
const { finalPoints } = require('../utils/score');
const config = require('../config');
const chat = require('../utils/chat');
const reports = require('../utils/reports');
const terms = require('../utils/terms');
const Stats = require('../utils/stats');
const Facts = require('../utils/facts');
const Replay = require('../utils/replay');
const Summary = require('../utils/summary');
const Scenes = require('../utils/scenes');
const Resign = require('../utils/resign');
const CivDraft = require('../utils/civdraft');

/* Turn timer (host setting gameConfig.turnTime, in seconds; 0 = no limit). When the time is up
   the turn ends as the player left it (player feedback: the KI must not change what they did in
   time); a player who isn't connected has the KI play the turn. After AFK_AFTER such turns in a
   row the KI keeps the seat until the player hands it back ('turn:reclaim'). */
const TURN_TIMES = [0, 60, 120, 180, 300, 600];
const AFK_AFTER = config.TURN_TIMER_AFK_AFTER;        // 3 (tests may shorten it)
const AFK_KI_LEVEL = { ranked: 'schwer', normal: 'mittel' };
/* Nation draft (F34): a pick has the turn time – without a turn timer this much – and then
   a random nation is picked for the player. */
const CIVDRAFT_PICK_MS = 120000;
// Placing the start tiles without a turn timer: 3 minutes, then the KI places (R-24)
const PLACEMENT_MS = 3 * 60 * 1000;

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
            // the sessionId is only known to who joined; compared in constant time (R-16)
            if (!sessions.passwordMatches(s, data.password)) return ack({ error: 'Falsches Passwort.' });
            const player = typeof data.clientId === 'string'
                ? s.players.find(p => p.kind === 'human' && p.clientId === data.clientId) : null;
            const spectator = !player && typeof data.clientId === 'string'
                ? (s.spectators || []).find(w => w.clientId === data.clientId) : null;
            if (spectator) return watch(s, spectator, ack);
            if (!player) return ack({ error: 'Ungültiger Spieler. Bitte erneut beitreten.' });
            // A bot account plays only the seat it joined as a bot, and that seat only it
            // (sessions.js playerBotPolicy) – a bot can't come in as a guest and log in afterwards
            const u = socket.request.user;
            const isBotUser = !!u && u.accountType === 'bot';
            if (isBotUser !== !!player.playerBot || (player.playerBot && player.botUserId !== u.id))
                return ack({ error: isBotUser ? 'Bot-Konten treten nur als Spieler-Bot bei.' : 'Dieser Platz gehört einem Spieler-Bot.' });
            // Once the game has started, a seat belongs to the account that held it at the start:
            // reconnecting with the same clientId from another account would book the result
            // (MMR) to that account (R-02 of the findings report).
            const started = s.status !== 'lobby';
            if (!started && u && sessions.isBanned(s, player.clientId, u.id)) {
                // joined with a new tab as a guest, then logged in with the kicked account (R-23)
                const idx = s.players.indexOf(player);
                if (sessions.kickPlayer(s.id, idx, true)) {
                    fixHostAfterRemoval(s, idx);
                    io.to(s.id).emit('player:left', { playerIndex: idx, name: player.name, players: publicPlayers(s), newHostIndex: s.hostIndex });
                    sendIndices(io, s);
                }
                return ack({ error: sessions.BANNED });
            }
            if (started && u && player.dbUserId && u.id !== player.dbUserId)
                return ack({ error: 'Dieser Platz gehört einem anderen Konto. Melde dich mit dem Konto an, mit dem du das Spiel begonnen hast.' });

            // Bound to another session (or another seat) before: give that one up first (R-08)
            if (session && (session !== s || (me && me !== player) || watcher)) release();
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
            // the account is taken over in the lobby only; after the start it stays bound (R-02)
            if (socket.request.user && !started) {
                me.dbUserId = socket.request.user.id;
                me.dbUsername = socket.request.user.username;
                me.mmr = socket.request.user.mmr;
                // a bot account counts as its owner in ranked games (startGame)
                me.dbOwnerId = socket.request.user.ownerId || null;
            }

            // Reclaim host if the lobby was abandoned
            if (oldHostOffline && s.hostIndex !== playerIndex) {
                s.hostIndex = playerIndex;
            }

            // Join a Socket.IO room for this session
            socket.join(sessionId);

            ack({ ok: true, playerIndex, status: s.status, players: publicPlayers(s), gameConfig: s.gameConfig, hostIndex: s.hostIndex, spectators: sessions.spectatorCount(s) });
            socket.emit('chat:history', { list: s.chat || [], guest: !me.dbUserId, mute: me.chatMute || null });

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
            // Nation draft (F34) in progress
            if (s.status === 'civdraft' && s.civDraft) socket.emit('civdraft:update', civDraftPayload(s));

            if (s.status === 'finished' && s.stats) socket.emit('game:stats', { stats: Stats.publicStats(s.stats) });
            if (s.status === 'finished' && s.gameRecord) socket.emit('game:record', s.gameRecord);

            // If game is already playing, send current state to the reconnecting player right away
            if (s.status === 'playing' && s.state) {
                const sortedStateIndex = engine.stateIndexOf(s.state, playerIndex, me);
                socket.emit('game:start', {
                    state: engine.stateForPlayer(s.state, sortedStateIndex),
                    yourIndex: sortedStateIndex,
                    turn: turnInfo(s), paused: s.paused || null,
                    // back in the middle of one's own turn: its summary again
                    summary: s.lastSummary && s.lastSummary.me === sortedStateIndex ? s.lastSummary : undefined,
                });
            }
        });

        /** Spectator mode: bind this socket as a viewer – sees everything, can't act or write. */
        function watch(s, w, ack) {
            if (session && (session !== s || me || watcher !== w)) release();     // R-08
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
            if (s.status === 'civdraft' && s.civDraft) socket.emit('civdraft:update', civDraftPayload(s));
            if (s.status === 'playing' && s.state) {
                socket.emit('game:start', { state: engine.stateForPlayer(s.state, -1), yourIndex: -1, turn: turnInfo(s), paused: s.paused || null });
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
                sessions.banFromSession(session, kickedPlayer);     // no rejoin (R-23)
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
                // F34: nation mode and turn order; randomCivs stays in step for older readers
                if (newConfig.civMode !== undefined) {
                    if (!CivDraft.CIV_MODES.includes(newConfig.civMode)) delete newConfig.civMode;
                    else newConfig.randomCivs = newConfig.civMode === 'random';
                } else if (newConfig.randomCivs !== undefined) {
                    newConfig.civMode = newConfig.randomCivs ? 'random' : 'fixed';
                }
                if (newConfig.turnOrder !== undefined && !CivDraft.TURN_ORDERS.includes(newConfig.turnOrder)) delete newConfig.turnOrder;
                if (newConfig.turnTime !== undefined) newConfig.turnTime = TURN_TIMES.includes(newConfig.turnTime) ? newConfig.turnTime : 0;
                // player-bots (sessions.js playerBotPolicy): on/off, at most so many (null = no limit)
                if (newConfig.playerBots !== undefined) newConfig.playerBots = newConfig.playerBots === true;
                if (newConfig.playerBotLimit !== undefined) newConfig.playerBotLimit = int(newConfig.playerBotLimit, 1, 8) || null;
                if (newConfig.isPublic !== undefined) newConfig.isPublic = newConfig.isPublic === true;
                if (newConfig.hexTiles !== undefined) newConfig.hexTiles = newConfig.hexTiles === true;
                if (newConfig.expCivs !== undefined) newConfig.expCivs = newConfig.expCivs === true;
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
                // a nation the game no longer offers (experimental ones switched off, another map,
                // no wonders) becomes a random one
                const offered = new Set(engine.civsFor(updated).map(c => c.k));
                const out = session.players.filter(p => p.civ && p.civ !== 'random' && p.civ !== 'zufall' && !offered.has(p.civ));
                out.forEach(p => { p.civ = 'random'; p.ability = 'random'; });
                if (out.length) io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
                // ready check (F17): new settings have to be confirmed again
                if (session.players.some(p => p.ready)) {
                    session.players.forEach(p => { p.ready = false; });
                    io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
                }
            } else {
                ack({ error: 'Konnte Einstellungen nicht aktualisieren.' });
            }
        });

        // ── Update Player Config (Lobby) ─────────────────────────────────────
        on(socket, 'lobby:player:update', (updates, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'lobby') return ack({ error: 'Spiel läuft bereits.' });
            sessions.recordActivity(sessionId);
            // Turn position (F34): one player per position
            if (updates && Number.isInteger(updates.pos) && session.players.some(p => p !== me && p.pos === updates.pos))
                return ack({ error: 'Diese Position ist schon vergeben.' });
            // Nation and ability must exist in the engine and belong together (a new nation resets
            // the ability, so only the nation counts then)
            if (updates && (updates.civ !== undefined || updates.ability !== undefined)) {
                const civ = updates.civ !== undefined ? updates.civ : me.civ;
                const ability = updates.civ !== undefined && updates.civ !== me.civ ? 'basis'
                    : (updates.ability !== undefined ? updates.ability : me.ability);
                const bad = engine.checkCivChoice(civ, ability, session.gameConfig);
                if (bad) return ack({ error: bad });
            }

            const updated = sessions.updatePlayer(sessionId, myIndex(), updates);
            if (updated) {
                ack({ ok: true });
                io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
            } else {
                ack({ error: 'Konnte Einstellungen nicht aktualisieren.' });
            }
        });

        // ── Ready check (F17): a player confirms the lobby; the host may start anyway ──
        on(socket, 'lobby:ready', (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'lobby') return ack({ error: 'Spiel läuft bereits.' });
            sessions.recordActivity(sessionId);
            me.ready = data.ready !== false;
            ack({ ok: true, ready: me.ready });
            io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
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

        // ── Nation draft (F34): a human picks a nation (and its ability) ────────
        on(socket, 'civdraft:pick', (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (session.status !== 'civdraft' || !session.civDraft) return ack({ error: 'Kein Draft aktiv.' });
            sessions.recordActivity(sessionId);
            const err = CivDraft.pick(session.civDraft.D, myIndex(), String(data.id),
                data.ability == null ? null : String(data.ability), engine.civsFor(session.gameConfig), Math.random);
            if (err) return ack({ error: err });
            ack({ ok: true });
            advanceCivDraft(io, session);
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

            if (me.resigned) return ack({ error: 'Du hast aufgegeben.' });
            if (session.paused) return ack({ error: 'Das Spiel ist pausiert.' });
            if (session.converting) return ack({ error: 'Das Spiel wird gerade als Rundenspiel fortgesetzt.' });
            if (session.state.cur !== finalIndex)
                return ack({ error: 'Du bist nicht am Zug.' });

            engine.attachScenes(session.state, session);      // what everybody sees played (utils/scenes.js)
            const err = engine.applyAction(session.state, finalIndex, data.type, params, () => {
                broadcastState(io, session);
                checkGameOver(io, session);
            });
            // Refused (F30): the client already played the move on its own copy, so it gets the
            // authoritative state back with the reason and puts its board back.
            if (err) return ack({ error: err, state: engine.stateForPlayer(session.state, finalIndex) });

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
            // integers only (as the action parameters, engine-adapter.js checkParams)
            if (!data || !Number.isInteger(data.o) || !Number.isInteger(data.cell)) return ack({ error: 'Ungültige Lage.' });

            const err = engine.getEngine().placeSeat(st.plan, seat, data.o, data.cell);
            if (err) return ack({ error: err });

            sessions.recordActivity(sessionId);
            st.placedCount++;
            ack({ ok: true });

            if (st.placedCount >= st.humanSeats.length) finishPlacement(io, session);
        });

        // ── Chat: text, emotes, map pings (utils/chat.js) ────────────────────
        on(socket, 'chat:send', async (data, ack) => {
            if (watcher) return ack({ error: 'Zuschauer können nicht schreiben.' });
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            // texts: only with an account, and not during a timeout of the word filter
            if (data.kind !== 'emote' && data.kind !== 'ping') {
                if (!me.dbUserId) return ack({ error: reports.GUEST_TEXT, guest: true });
                if (!(await terms.acceptedById(me.dbUserId))) return ack({ error: terms.NEEDED });
                if (reports.muteActive(me.chatMute)) return ack({ error: 'Du kannst gerade keine Texte schreiben.', mute: me.chatMute });
            }
            const r = chat.build({ slot: myIndex(), name: me.name, uid: me.dbUserId }, data, `live:${sessionId}:${me.clientId}`);
            if (r.error) return ack({ error: r.error });
            if (r.msg.kind === 'text') {
                const v = await reports.moderate({ source: 'live', sourceId: session.id, history: session.chat, msg: r.msg, sender: { id: me.dbUserId, name: me.name }, mute: me.chatMute });
                if (v) { me.chatMute = v.mute; return ack(v); }
            }
            session.chat = chat.remember(session.chat, r.msg, chat.LIVE_HISTORY);
            ack({ ok: true });
            io.to(sessionId).emit('chat:msg', r.msg);
        });

        // Report another player's message (utils/reports.js): players and spectators
        on(socket, 'chat:report', async (data, ack) => {
            const who = bound() ? me : watcher;
            if (!session || !who) return ack({ error: 'Nicht verbunden.' });
            const u = socket.request.user;
            const r = await reports.report({
                source: 'live', sourceId: session.id, history: session.chat, msgId: data && data.id, reason: data && data.reason,
                reporter: { id: u ? u.id : null, name: u ? u.username : who.name, slot: bound() ? myIndex() : -1 },
            }).catch(err => { console.error('[Reports]', err); return { error: 'Serverfehler' }; });
            ack(r);
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
            if (!me.afk || me.resigned) return ack({ ok: true });
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

        // ── Pause (F27): the host stops the game – nobody can act, the turn timer stands still ──
        on(socket, 'game:pause', (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (!isHost()) return ack({ error: 'Nur der Host kann das Spiel anhalten.' });
            const S = session.state;
            if (session.status !== 'playing' || !S || S.over) return ack({ error: 'Spiel läuft nicht.' });
            const pause = data.pause !== false;
            if (!!session.paused === pause) return ack({ ok: true });
            const tc = session.turnClock;
            if (pause) {
                // the time left of the running turn waits with the game
                if (tc && tc.deadline) { tc.left = Math.max(0, tc.deadline - Date.now()); tc.deadline = null; }
                session.paused = { by: me.name, at: Date.now() };
            } else {
                if (tc && tc.left != null) { tc.deadline = Date.now() + tc.left; tc.left = null; }
                session.paused = null;
            }
            sessions.recordActivity(sessionId);
            console.log(`[Pause] Session ${sessionId}: ${pause ? 'paused' : 'resumed'} by ${me.name}`);
            ack({ ok: true });
            io.to(sessionId).emit('game:paused', { paused: session.paused });
            broadcastState(io, session);
        });

        // ── Continue as a Rundenspiel (F27): the running game moves to async/service.js ──
        on(socket, 'game:toAsync', async (data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            if (!isHost()) return ack({ error: 'Nur der Host kann das Spiel als Rundenspiel fortsetzen.' });
            const S = session.state;
            if (session.status !== 'playing' || !S || S.over || session.converting) return ack({ error: 'Spiel läuft nicht.' });
            if (!me.dbUserId) return ack({ error: 'Rundenspiele gibt es nur mit Anmeldung.' });
            // a KI turn being played right now would go on in the old game
            if (engine.isAutoPlayer(S.players[S.cur])) return ack({ error: 'Die KI zieht gerade – versuche es gleich noch einmal.' });
            session.converting = true;
            let r;
            try {
                r = await require('../async/service').fromLive(socket.request.user, session, { turnDays: data.turnDays });
            } catch (err) {
                console.error(`[ToAsync] Session ${sessionId}:`, err);
                r = { error: 'Das Spiel konnte nicht umgewandelt werden.' };
            }
            if (r.error) { session.converting = false; return ack(r); }
            session.converted = r.id;
            session.turnClock = null;
            console.log(`[ToAsync] Session ${sessionId} → Rundenspiel ${r.id}`);
            ack({ ok: true, asyncId: r.id });
            io.to(sessionId).emit('game:toAsync', { asyncId: r.id, by: me.name, guests: r.guests });
            setTimeout(() => sessions.removeSession(sessionId), 2000);
        });

        // ── Resign (F16): the KI plays the seat to the end ───────────────────
        // The player report (client/report.js): points and counts over the rounds so far, for
        // players and spectators. Only the public part (Stats.trend); the end has 'game:stats'.
        on(socket, 'game:trend', (_data, ack) => {
            if (!session || (!bound() && !watcher)) return ack({ error: 'Nicht verbunden.' });
            if (!session.stats) return ack({ trend: null });
            ack({ trend: session.status === 'finished' ? Stats.publicStats(session.stats) : Stats.trend(session.stats) });
        });

        on(socket, 'game:resign', (_data, ack) => {
            if (!bound()) return ack({ error: 'Nicht verbunden.' });
            const S = session.state;
            if (session.status !== 'playing' || !S || S.over) return ack({ error: 'Spiel läuft nicht.' });
            if (me.resigned) return ack({ ok: true });
            const pi = engine.stateIndexOf(S, myIndex(), me);
            if (pi === -1) return ack({ error: 'Ungültiger Spieler.' });
            const level = session.gameConfig.ranked ? AFK_KI_LEVEL.ranked : AFK_KI_LEVEL.normal;
            me.resigned = true;
            me.afk = false;
            me.missedTurns = 0;
            Object.assign(S.players[pi], { kind: 'ki', kiLevel: level });
            sessions.recordActivity(sessionId);
            console.log(`[Resign] Session ${sessionId}: ${me.name} resigned`);
            engine.attachScenes(S, session);
            Resign.logResign(engine.getEngine(), S, me.name);
            const humans = session.players
                .map((p, i) => p.kind === 'human' && !p.resigned ? engine.stateIndexOf(S, i, p) : -1)
                .filter(i => i !== -1);
            const startedWithKi = session.players.some(p => p.kind !== 'human');
            const end = Resign.endAfterResign(engine.getEngine(), S, humans, startedWithKi);
            ack({ ok: true });
            io.to(sessionId).emit('game:resigned', { index: myIndex(), name: me.name });
            io.to(sessionId).emit('lobby:player:updated', publicPlayers(session));
            if (end) S.over = end;
            else if (S.cur === pi) {
                // it was our turn: the KI plays it now, then the game goes on
                session.turnClock = null;
                engine.finishTurnForAbsent(S, level, true, () => {
                    broadcastState(io, session);
                    checkGameOver(io, session);
                });
            }
            broadcastState(io, session);
            checkGameOver(io, session);
        });

        /**
         * Give up this socket's seat or spectator place: on disconnect, and before the socket binds
         * to another session (R-08 – otherwise the old seat stayed "connected" with a dead socket,
         * the socket kept getting the old room's updates and the old game never handed over host).
         */
        function release() {
            const s = session, sid = sessionId, p = me, w = watcher;
            session = null; sessionId = null; me = null; watcher = null;
            if (!s) return;
            socket.leave(sid);
            if (w) {
                if (w.socketId !== socket.id) return;     // replaced by a newer connection
                w.connected = false;
                w.socketId = null;
                io.to(sid).emit('spectators:update', { count: sessions.spectatorCount(s) });
                return;
            }
            // Ignore if this socket was kicked or replaced by a newer connection of the same player
            const playerIndex = p ? s.players.indexOf(p) : -1;
            if (playerIndex === -1 || p.socketId !== socket.id) return;
            p.connected = false;
            p.socketId = null;

            if (s.status === 'lobby') {
                // R-12: a reload, a short network drop or a phone in the background must not cost
                // the seat – it stays (shown as offline) and is only given up after a grace period
                io.to(sid).emit('lobby:player:updated', publicPlayers(s));
                const since = p.offlineSince = Date.now();
                const t = setTimeout(() => lobbyGraceOver(io, s, p, since), config.LOBBY_GRACE_MS);
                if (t.unref) t.unref();
                return;
            }
            if (s.hostIndex === playerIndex) {
                const nextHost = s.players.find(q => q.connected && q !== p);
                if (nextHost) s.hostIndex = s.players.indexOf(nextHost);
            }
            io.to(sid).emit('player:left', {
                playerIndex,
                name: p.name,
                players: publicPlayers(s),
                newHostIndex: s.hostIndex
            });
        }

        // ── Disconnect ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            try {
                release();
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
        // like the turn timer: the loop alone must not keep the process alive (tests, shutdown)
        io.__syncInterval.unref();
    }
    // Turn timer: once a second, end the turns whose time is up
    if (!io.__turnInterval) {
        io.__turnInterval = setInterval(() => {
            const now = Date.now();
            for (const session of sessions.getAllSessions().values()) {
                const cd = session.status === 'civdraft' && session.civDraft;
                if (cd && cd.deadline && now >= cd.deadline) {
                    try { civDraftTimeout(io, session); } catch (err) { console.error(`[Turn timer] Draft timeout in session ${session.id}:`, err); }
                    continue;
                }
                const ps = session.status === 'placement' && session.placementState;
                if (ps && ps.deadline && now >= ps.deadline) {
                    try { placementTimeout(io, session); } catch (err) { console.error(`[Turn timer] Placement timeout in session ${session.id}:`, err); }
                    continue;
                }
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
 *
 * R-09: the start changes the lobby (KI seats, seat order, nations, settings). A start that fails
 * – here, or later after the nation draft, the Marathon draft or the tile placement – puts the
 * lobby back as it was (restoreLobby), so the next attempt starts from the players' choices.
 */
function startGame(io, session) {
    // kept until the game runs (emitGameStart): a draft or the placement may still fail
    const snap = session.startSnapshot = lobbySnapshot(session);
    let err;
    try {
        err = beginGame(io, session);
    } catch (e) {
        console.error(`[Start] Session ${session.id}:`, e);
        err = 'Fehler beim Spielstart.';
    }
    if (err) restoreLobby(io, session, snap);
    return err || null;
}

// what a seat keeps when the lobby is restored: the connection may have changed meanwhile
const LIVE_SEAT_FIELDS = ['connected', 'socketId', 'offlineSince'];

/** The lobby before a start (R-09): the seat objects themselves – a socket finds its seat by
 *  reference – with a copy of their fields, the host and the settings. */
function lobbySnapshot(session) {
    return {
        players: session.players.slice(),
        fields: session.players.map(p => ({ ...p })),
        hostIndex: session.hostIndex,
        gameConfig: structuredClone(session.gameConfig),
    };
}

/**
 * A start failed (R-09): back to the lobby as it was before. `error` (draft, placement – the
 * clients have left the lobby screen): every seat is sent back to the lobby with the message.
 */
function restoreLobby(io, session, snap, error) {
    const left = ['placement', 'draft'].includes(session.status);
    session.players.splice(0, session.players.length, ...snap.players);
    snap.players.forEach((p, i) => {
        const live = {};
        LIVE_SEAT_FIELDS.forEach(k => { live[k] = p[k]; });
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, snap.fields[i], live);
    });
    session.hostIndex = snap.hostIndex;
    session.gameConfig = snap.gameConfig;
    Object.assign(session, { status: 'lobby', startSnapshot: null, civDraft: null, placementState: null, draft: null, state: null, turnClock: null });
    if (!error) {
        // the host has the error as the answer to game:start
        io.to(session.id).emit('lobby:player:updated', publicPlayers(session));
        sendIndices(io, session);
        return;
    }
    console.error(`[Start] Session ${session.id}: back to the lobby – ${error}`);
    if (!left) {
        // the nation draft is a dialog over the lobby
        io.to(session.id).emit('lobby:player:updated', publicPlayers(session));
        sendIndices(io, session);
        io.to(session.id).emit('game:startFailed', { error });
        return;
    }
    // placement and Marathon draft show the game: the way back is the rematch's
    session.players.forEach((p, i) => {
        if (p.socketId) io.to(p.socketId).emit('session:rematch', { playerIndex: i, hostIndex: session.hostIndex, players: publicPlayers(session), gameConfig: session.gameConfig, error });
    });
    for (const w of session.spectators || []) {
        if (w.connected && w.socketId) io.to(w.socketId).emit('session:rematch', { playerIndex: -1, spectator: true, hostIndex: session.hostIndex, players: publicPlayers(session), gameConfig: session.gameConfig, error });
    }
}

/** A failed step after startGame (nation draft, Marathon draft, placement): restore the lobby. */
function startFailed(io, session, error) {
    if (session.startSnapshot) return restoreLobby(io, session, session.startSnapshot, error);
    // no snapshot (cannot happen – startGame keeps one until the game runs): at least out of the dead end
    session.status = 'lobby';
    io.to(session.id).emit('game:startFailed', { error });
}

/** startGame's checks and preparation (see there). */
function beginGame(io, session) {
    if (session.players.filter(p => p.kind === 'human').length < 1)
        return 'Mindestens ein Spieler nötig.';
    // the host turned player-bots off or lowered the limit after they joined: kick them first
    const bots = sessions.playerBotPolicy(session);
    if (bots.count > 0 && !bots.allowed) return 'In der Lobby sitzen Spieler-Bots, obwohl sie nicht erlaubt sind.';
    if (bots.free < 0) return `In der Lobby sitzen ${bots.count} Spieler-Bots – erlaubt sind ${bots.limit}.`;
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
    if (gc.ranked && !isPlaettchen) return 'Gewertete Spiele werden auf der Plättchenkarte gespielt.';
    if (gc.ranked && total > config.MAX_RANKED_EMPIRES)
        return `Gewertete Spiele haben höchstens ${config.MAX_RANKED_EMPIRES} Reiche.`;
    // a KI seat counts as 1000 MMR: alone against the KI, MMR could be farmed (Rundenspiele check
    // the same in async/logic.js; matchmaking only starts with two)
    if (gc.ranked && session.players.filter(p => p.kind === 'human').length < 2)
        return 'Gewertete Spiele brauchen mindestens 2 Spieler.';
    // … and they are rated between different people: no guest seats (a second tab of the host
    // would just resign) and no account twice; a bot account is a player of its own, also against
    // its owner
    if (gc.ranked) {
        const seats = session.players.filter(p => p.kind === 'human');
        if (seats.some(p => !p.dbUserId)) return 'Gewertete Spiele gibt es nur mit angemeldeten Spielern.';
        const accounts = seats.map(p => p.dbUserId);
        if (new Set(accounts).size !== accounts.length) return 'In gewerteten Spielen spielt niemand gegen sich selbst.';
    }
    gc.playerCount = total;
    gc.duel = total === 2;

    // Each player's own lobby choice, for a rematch ("random" is resolved below)
    session.players.forEach(p => { p.choice = { civ: p.civ, ability: p.ability }; });

    // Nation mode and turn order (F34); a draft needs positions, so it never has the classic order
    const modes = CivDraft.modesOf(gc);
    Object.assign(gc, modes, { randomCivs: modes.civMode === 'random' });
    const drafting = CivDraft.isDraft(modes.civMode);

    // "Random nations for everyone": the host's setting overrides every player's choice
    if (gc.randomCivs || drafting) session.players.forEach(p => { p.civ = 'random'; p.ability = 'random'; });

    // Every seat's nation and ability exist and belong together: the lobby checks updates, but a
    // seat also gets them when it is created or joins (REST), and the engine only compares keys
    for (const p of session.players) {
        const bad = engine.checkCivChoice(p.civ, p.ability, gc);
        if (bad) return `${p.name || 'Spieler'}: ${bad}`;
    }

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

    // Turn positions (F34): the seats in position order, position 1 moves first
    if (modes.turnOrder !== 'classic') arrangeSeats(io, session, modes.turnOrder);

    const opts = { freeCivs, isPlaettchen, isMarathon };
    if (drafting) {
        startCivDraft(io, session, opts);
        return null;
    }
    return launch(io, session, opts);
}

/**
 * The second half of the start, once every seat is there (and, with a draft, has its nation):
 * deal what is random, then the tile placement, the Marathon draft or the game itself.
 */
function launch(io, session, { freeCivs, isPlaettchen, isMarathon }) {
    // Sync resolveRandom & nameDoubles on server before progressing so all clients align natively
    const engineApi = engine.getEngine();
    const CIVS = engine.civsFor(session.gameConfig);       // with the experimental ones, if switched on
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
            const plan = engineApi.tilePlan(session.players.map(p => p.civ), seed,
                // experimental tile mode: v107 reads `shape` (14 triangles, four empires), older engines `hex`
                session.gameConfig.hexTiles ? { hex: true, shape: 'tri14' } : {});
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
            // placing has the turn time, without a turn timer PLACEMENT_MS – one player must not
            // hold up everyone (R-24); then the KI places what is missing (placementTimeout)
            const ms = turnTimeMs(session) || PLACEMENT_MS * config.TURN_TIMER_SCALE;
            session.placementState = {
                plan, seed, rnd,
                humanSeats,
                placedCount: 0,
                deadline: Date.now() + ms,
            };

            const { setup: _setup, ...publicCfg } = session.gameConfig;
            io.to(session.id).emit('placement:start', {
                // the game rebuilds the plan from cfg: v107+ reads tileShape (14 triangles), older games hexTiles
                cfg: { ...publicCfg, tileShape: session.gameConfig.hexTiles ? 'tri14' : null,
                    // turn positions (F34): the placement's world view shows the turn order by seat
                    seatOrder: CivDraft.modesOf(session.gameConfig).turnOrder !== 'classic' },
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


/**
 * Turn positions (F34): arrange session.players in position order – wishes of the players
 * with 'pick', everybody else (and everybody with 'random') at random. Lobby indices change,
 * so every player gets their new one; position 1 moves first.
 */
function arrangeSeats(io, session, mode) {
    const host = session.players[session.hostIndex];
    const wishes = session.players.map(p => (p.kind === 'human' && Number.isInteger(p.pos) ? p.pos : null));
    const perm = CivDraft.arrange(session.players.length, mode, wishes, Math.random);
    const seated = perm.map(i => session.players[i]);
    session.players.splice(0, session.players.length, ...seated);
    session.players.forEach((p, i) => { p.index = i; });
    session.hostIndex = Math.max(0, session.players.indexOf(host));
    session.gameConfig.startPlayer = 0;
    sendIndices(io, session);
    io.to(session.id).emit('lobby:player:updated', publicPlayers(session));
}

/** Nation draft (F34): open it; KI seats pick on their own (advanceCivDraft). */
function startCivDraft(io, session, opts) {
    const gc = session.gameConfig;
    const D = CivDraft.newDraft({
        mode: gc.civMode, n: session.players.length, civs: engine.civsFor(gc),
        // a fixed map has one start point per nation; Marathon drafts the abilities afterwards
        uniqueCivs: !opts.freeCivs, noAbility: opts.isMarathon, rnd: Math.random,
    });
    session.civDraft = { D, opts, deadline: null };
    session.status = 'civdraft';
    advanceCivDraft(io, session);
}

/** After a pick: the KI and forced picks, then the next pick's clock – or the game. */
function advanceCivDraft(io, session) {
    const cd = session.civDraft;
    const civs = engine.civsFor(session.gameConfig);
    CivDraft.settle(cd.D, civs, Math.random, seat => engine.isAutoPlayer(session.players[seat]));
    if (CivDraft.done(cd.D)) return finishCivDraft(io, session);
    cd.deadline = Date.now() + civDraftPickMs(session);
    io.to(session.id).emit('civdraft:update', civDraftPayload(session));
}

const civDraftPickMs = session => turnTimeMs(session) || CIVDRAFT_PICK_MS * config.TURN_TIMER_SCALE;

function civDraftTimeout(io, session) {
    const cd = session.civDraft;
    cd.deadline = null;                             // once
    const seat = CivDraft.current(cd.D);
    const p = session.players[seat] || {};
    CivDraft.autoPick(cd.D, engine.civsFor(session.gameConfig), Math.random);
    console.log(`[Turn timer] Session ${session.id}: draft time up, a random nation for ${p.name || seat}`);
    advanceCivDraft(io, session);
}

/** Everybody has a nation: hand the picks to the seats and go on with the start. */
function finishCivDraft(io, session) {
    const { D, opts } = session.civDraft;
    session.players.forEach((p, i) => {
        const pk = D.picks[i];
        if (pk) { p.civ = pk.civ; p.ability = pk.ability || 'basis'; }
    });
    io.to(session.id).emit('civdraft:update', civDraftPayload(session));
    session.civDraft = null;
    let err;
    try { err = launch(io, session, opts); } catch (e) { console.error(`[Draft] Session ${session.id}:`, e); err = 'Fehler beim Spielstart.'; }
    if (err) startFailed(io, session, err);
}

/** The nation draft for the clients: the draft, who sits where, and the pick's time. */
function civDraftPayload(session) {
    const cd = session.civDraft;
    if (!cd) return null;
    return {
        ...CivDraft.payload(cd.D),
        seats: session.players.map(p => ({ index: p.index, name: p.name, kind: p.kind, botAccount: !!p.playerBot })),
        turn: { total: civDraftPickMs(session), left: cd.deadline ? Math.max(0, cd.deadline - Date.now()) : null },
    };
}

/** A lobby player was removed at `removedIndex` – keep hostIndex pointing at the same player. */
/**
 * R-12: a lobby seat whose player stayed away for LOBBY_GRACE_MS is given up – as a disconnect in
 * the lobby used to do at once. Nobody left: the lobby is closed; the host gone: the next
 * connected player takes over.
 */
function lobbyGraceOver(io, session, player, since) {
    // back in the meantime (perhaps gone again since: then that later timer decides)
    if (player.connected || player.offlineSince !== since || session.status !== 'lobby' || sessions.getSession(session.id) !== session) return;
    const playerIndex = session.players.indexOf(player);
    if (playerIndex === -1) return;
    const wasHost = playerIndex === session.hostIndex;
    sessions.kickPlayer(session.id, playerIndex, true);
    const next = session.players.findIndex(p => p.kind === 'human' && p.connected);
    if (next === -1) {
        io.to(session.id).emit('session:kicked', { reason: 'Der Host hat die Lobby geschlossen.' });
        sessions.removeSession(session.id);
        return;
    }
    if (wasHost) session.hostIndex = next;
    else fixHostAfterRemoval(session, playerIndex);
    io.to(session.id).emit('player:left', {
        playerIndex,
        name: player.name,
        players: publicPlayers(session),
        newHostIndex: session.hostIndex
    });
    sendIndices(io, session);
}

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
    if (!session.state.over || session.gameOverProcessed || session.converted) return;
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
                turn: turnInfo(session), paused: session.paused || null,
            });
        }
    });
    for (const w of session.spectators || []) {
        if (!w.connected || !w.socketId) continue;
        io.to(w.socketId).emit('game:start', { state: engine.stateForPlayer(session.state, -1), yourIndex: -1, turn: turnInfo(session), paused: session.paused || null });
    }
    session.startSnapshot = null;           // the game runs: no way back to the lobby (R-09)
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
        startFailed(io, session, 'Fehler beim Spielstart.');
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
        botAccount: !!p.playerBot,      // a bot account plays this human seat (utils/bots.js)
        isBot: p.kind === 'bot' || p.kind === 'ki',     // computer seat (KI fill-in)
        afk: !!p.afk,                   // turn timer: the KI plays this absent player's seat
        resigned: !!p.resigned,         // gave up: the KI plays the seat to the end
        pos: Number.isInteger(p.pos) ? p.pos : null,    // turn position asked for (F34, 0-based)
        ready: !!p.ready || !!p.playerBot,      // lobby ready check; player-bots are always ready
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
    // WARNING: everyone in the room gets this one copy. If the game ever gets hidden information
    // (fog of war, secret cards), this must become one stateForPlayer per player.
    const sharedState = engine.stateForPlayer(session.state, 0);

    // Broadcast universally to everyone in the room. This avoids individual serialization per socket.
    io.to(session.id).emit('state:update', {
        state: sharedState,
        currentPlayer: session.state.cur,
        round: session.state.round,
        turn: turnInfo(session), paused: session.paused || null,
        summary: turnSummary(session),
        scenes: newScenes(session),
    });
}

/**
 * The scenes since the last broadcast (utils/scenes.js, client/scenes.js): everyone in the room
 * watches the game live, so each update carries only what is new, and nothing older is kept.
 */
function newScenes(session) {
    const log = Scenes.logOf(session.state);
    if (!log) return undefined;
    try {
        const chain = Scenes.chain(log, { afterN: log.sent || log.n0 });
        log.sent = Scenes.lastN(log);
        Scenes.fold(log, log.frames.length);
        return chain || undefined;
    } catch (err) {
        console.error(`[Scenes] Failed in session ${session.id}:`, err);
        return undefined;
    }
}

// ── Turn timer ────────────────────────────────────────────────────────────────

/** Everyone has a start tile: the map is made and the game begins. */
function finishPlacement(io, session) {
    const st = session.placementState;
    try {
        session.gameConfig.map = engine.getEngine().tileMap(st.plan);
        session.state = engine.createGame(session);
        session.status = 'playing';
        emitGameStart(io, session);
    } catch (e) {
        console.error('Error starting game after placement', e);
        startFailed(io, session, 'Fehler beim Spielstart.');
    }
}

/**
 * The time for placing start tiles is up (the turn time, or PLACEMENT_MS without a turn timer):
 * the KI places the tiles still missing – as for its own seats – and the game
 * begins. Without it one player who doesn't place would hold up everyone.
 */
function placementTimeout(io, session) {
    const st = session.placementState;
    st.deadline = null;                              // once
    const E = engine.getEngine();
    for (const seat of st.humanSeats) {
        if (seat.cell != null) continue;
        const lp = session.players[seat.idx] || {};
        const err = typeof E.kiPlaceSeat === 'function'
            ? E.kiPlaceSeat(st.plan, seat, { civ: lp.civ, ability: lp.ability }, session.gameConfig.setup) : 'no ki';
        if (err) E.botPlaceSeat(st.plan, seat, st.rnd);
        st.placedCount++;
        console.log(`[Turn timer] Session ${session.id}: placing time up, the KI placed the start tile of ${lp.name || seat.idx}`);
    }
    finishPlacement(io, session);
}

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
    // paused (F27): the new turn's time waits until the game goes on
    session.turnClock = session.paused ? { key, deadline: null, left: ms && human ? ms : null }
        : { key, deadline: ms && human ? Date.now() + ms : null };
}

/** For the clients: { total, left } in ms (left null: no clock running now), or null without a limit. */
function turnInfo(session) {
    updateTurnClock(session);
    const total = turnTimeMs(session);
    if (!total) return null;
    const tc = session.turnClock;
    if (session.paused) return { total, left: tc && tc.left != null ? tc.left : null, paused: true };
    return { total, left: tc && tc.deadline ? Math.max(0, tc.deadline - Date.now()) : null };
}

/**
 * The current player's time is up. Connected: the turn ends as they left it, the KI does
 * nothing for them (engine.endTurnAsIs). Not connected: the KI plays the rest of the turn.
 * After AFK_AFTER such turns in a row the KI keeps the seat – unless nobody else would be left
 * to play, then only this turn is played for them.
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
    const othersActive = session.players.some(p => p !== lp && p.kind === 'human' && !p.afk && !p.resigned);
    lp.afk = lp.missedTurns >= AFK_AFTER && othersActive;
    const level = session.gameConfig.ranked ? AFK_KI_LEVEL.ranked : AFK_KI_LEVEL.normal;
    console.log(`[Turn timer] Session ${session.id}: time up for ${lp.name} (${lp.missedTurns} in a row${lp.afk ? ', KI keeps the seat' : ''})`);

    sessions.recordActivity(session.id);
    const asIs = !lp.afk && lp.connected && !!lp.socketId;
    if (lp.socketId) io.to(lp.socketId).emit('turn:timeout', { afk: lp.afk, asIs });
    engine.attachScenes(S, session);
    const changed = () => {
        broadcastState(io, session);
        checkGameOver(io, session);
    };
    if (asIs) engine.endTurnAsIs(S, changed);
    else engine.finishTurnForAbsent(S, level, lp.afk, changed);
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
            const points = finalPoints(scoreDetails, isWinner);   // × WIN_FACTOR for the winner

            // a player who resigned is out of the rating, like a Rundenspiel seat the KI took over
            const gaveUp = !!lp.resigned;
            playersData.push({
                dbUserId: gaveUp ? null : lp.dbUserId,
                dbUsername: gaveUp ? null : lp.dbUsername,
                replaced: gaveUp || undefined,
                replacedUserId: gaveUp ? lp.dbUserId || null : undefined,
                resigned: gaveUp || undefined,
                name: lp.name,
                civ: lp.civ,
                ability: lp.ability,
                drafted: lp.drafted || null,
                isBot: lp.kind === 'bot' || lp.kind === 'ki',
                botAccount: !!lp.playerBot,
                points: points,
                scoreDetails: scoreDetails,
                isWinner: isWinner
            });
        }

        // One account on several seats would rate itself against itself – no MMR then; a bot
        // account rates as a player of its own, also against its owner (as in startGame)
        const userIds = session.players.filter(lp => !lp.resigned && lp.dbUserId).map(lp => lp.dbUserId);
        if (isRanked && new Set(userIds).size !== userIds.length) {
            console.warn(`[Stats] Game ${sessionId}: one account held several seats – not rated.`);
            isRanked = false;
        }

        // MMR, games played, the resign penalty and the match record in one transaction
        // (utils/rating.js, R-18); resigned accounts: a played (lost) game, ranked a fixed penalty
        const resigned = playersData.filter(x => x.resigned && x.replacedUserId);
        if (isRanked) resigned.forEach(p => { p.penalty = -Resign.MMR_PENALTY; });
        const version = engine.getEngine().APP_VERSION || 'Unknown';
        const game = await Rating.book({
            players: playersData,
            ranked: isRanked,
            penalty: { userIds: resigned.map(p => p.replacedUserId), mmr: Resign.MMR_PENALTY },
            record: players => ({
                version,
                durationRounds: session.state.round,
                winnerUsername: players.find(p => p.isWinner)?.dbUsername || null,
                participants: players,
                stats: Stats.publicStats(session.stats),
            }),
        });

        // The replay (utils/replay.js) – then the end screen can offer it
        let replay = false;
        try {
            replay = await Replay.save(game.id, version, stateNames(session), session.replay && session.replay.frames);
        } catch (err) {
            console.error(`[Replay] Saving failed for ${sessionId}:`, err);
        }
        session.replay = null;
        Facts.storeLater(game.id);                     // overall statistics (utils/facts.js), from the replay
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
