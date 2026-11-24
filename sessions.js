const crypto = require('crypto');
const config = require('./config');
const CivDraft = require('./utils/civdraft');

// ─── In-memory session store ─────────────────────────────────────────────────

const sessions = new Map();      // sessionId → session
const codeIndex = new Map();     // joinCode → sessionId

function generateId() {
    return crypto.randomUUID();
}

function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I confusion
    let code;
    do {
        code = '';
        for (let i = 0; i < config.JOIN_CODE_LENGTH; i++)
            code += chars[crypto.randomInt(chars.length)];
    } while (codeIndex.has(code));
    return code;
}

/** Display names are plain text of limited length. */
function cleanName(name, fallback) {
    const n = typeof name === 'string' ? name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, config.MAX_NAME_LENGTH) : '';
    return n || fallback;
}

/** civ / ability keys: short identifiers only. */
function cleanKey(key, fallback) {
    return typeof key === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(key) ? key : fallback;
}

/**
 * The settings a host may set (lobby UI, presets, bots: docs/bots/writing-a-bot.md). Everything
 * else in gameConfig is the server's: the seed, the map and setup of the start, fixedDice and
 * startPlayer (weekly challenge), matchmaking. Unknown keys from a client are dropped.
 */
const HOST_CONFIG_KEYS = new Set([
    'mapKey', 'customMap', 'hexTiles', 'expCivs', 'events', 'eventMode', 'wonders', 'difficulty', 'ranked',
    'playerCount', 'kiCount', 'noKi', 'civMode', 'randomCivs', 'turnOrder', 'turnTime',
    'playerBots', 'playerBotLimit', 'isPublic',
]);
function cleanHostConfig(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) if (HOST_CONFIG_KEYS.has(k)) out[k] = raw[k];
    return out;
}

function generatePassword() {
    let pw = '';
    for (let i = 0; i < config.PASSWORD_LENGTH; i++)
        pw += crypto.randomInt(10).toString();
    return pw;
}

/**
 * The secret clientId that finds a seat: a non-empty string, at most 100 characters. Anything
 * else is refused here as well (not only in routes/api.js) – String(undefined) would make
 * "undefined" a seat key anyone could send.
 */
const INVALID_CLIENT = 'Ungültige Client-ID.';
function clientIdOf(info) {
    const id = info && info.clientId;
    return typeof id === 'string' && id.trim() ? id.slice(0, 100) : null;
}

/**
 * Create a new multiplayer session.
 * @param {object} gameConfig  – map, mode, wonders, events, etc.
 * @param {object} hostInfo    – { name, civ, ability }
 * @returns {object} { sessionId, joinCode, password }
 */
function createSession(gameConfig, hostInfo) {
    if (sessions.size >= config.MAX_SESSIONS) return 'Der Server ist voll. Bitte versuche es später erneut.';
    const hostClientId = clientIdOf(hostInfo);
    if (!hostClientId) return INVALID_CLIENT;
    const sessionId = generateId();
    const joinCode = generateJoinCode();
    const password = generatePassword();

    const session = {
        id: sessionId,
        joinCode,
        password,                     // 6-digit numeric, shared out-of-band
        gameConfig,                   // raw setup data from host
        isPublic: gameConfig.isPublic === true,
        status: 'lobby',              // lobby → playing → finished
        createdAt: Date.now(),
        lastActivity: Date.now(),
        emptySince: null,
        hostIndex: 0,
        players: [
            {
                index: 0,
                name: cleanName(hostInfo.name, 'Host'),
                clientId: hostClientId,
                civ: cleanKey(hostInfo.civ, 'griechenland'),
                ability: cleanKey(hostInfo.ability, 'basis'),
                kind: 'human',
                connected: false,
                socketId: null,
                ...botSeat(hostInfo),
            },
        ],
        state: null,                  // filled when game starts
        spectators: [],               // { clientId, name, socketId, connected } – see addSpectator
    };

    sessions.set(sessionId, session);
    codeIndex.set(joinCode, sessionId);
    // Nobody connected within UNUSED_LOBBY_MS: the lobby was never used – free its slot now instead
    // of at the second cleanup (5–10 minutes), so a few addresses can't fill MAX_SESSIONS
    setTimeout(() => {
        const s = sessions.get(sessionId);
        if (s && s.status === 'lobby' && !s.players.some(p => p.connected) && !(s.spectators || []).some(w => w.connected)) removeSession(sessionId);
    }, config.UNUSED_LOBBY_MS).unref();
    return { sessionId, joinCode, password };
}

/**
 * Join an existing session.
 * @param {string} joinCode
 * @param {string} password  – 6-digit numeric
 * @param {object} playerInfo – { name, civ, ability, clientId, userId (the logged-in account, R-23) }
 * @param {object} [opts] – { trusted: true } for the server's own callers (R-16, checkPassword)
 * @returns {object|string} { sessionId, playerIndex } or error string
 */
function joinSession(joinCode, password, playerInfo, opts) {
    const clientId = clientIdOf(playerInfo);
    if (!clientId) return INVALID_CLIENT;
    const sessionId = codeIndex.get(String(joinCode || '').toUpperCase());
    if (!sessionId) return 'Ungültiger Beitrittscode.';
    const session = sessions.get(sessionId);
    if (!session) return 'Sitzung nicht gefunden.';
    const pwError = checkPassword(session, password, clientId, opts);
    if (pwError) return pwError;

    // Check if player is reconnecting
    const existingPlayer = session.players.find(p => p.clientId === clientId);
    if (existingPlayer) {
        // It's a reconnection
        return { sessionId, playerIndex: existingPlayer.index };
    }

    // kicked by the host: not again into this lobby, neither from the same tab nor the same account (R-23)
    if (isBanned(session, clientId, playerInfo.userId)) return BANNED;
    // a seat is found by the secret clientId (sessionStorage of the tab), never by the name
    if (session.status !== 'lobby') return 'Das Spiel hat schon begonnen. Zurück auf deinen Platz kommst du nur im selben Browser-Tab, in dem du beigetreten bist.';
    if (session.players.length >= humanSeats(session)) return 'Sitzung ist voll.';
    if (playerInfo.botUserId) {
        const policy = playerBotPolicy(session);
        if (!policy.allowed) return 'In dieser Lobby sind keine Spieler-Bots erlaubt.';
        if (policy.free <= 0) return 'In dieser Lobby ist kein Platz mehr für Spieler-Bots.';
    }

    const playerIndex = session.players.length;
    let fallbackName = cleanName(playerInfo.name, `Spieler ${playerIndex + 1}`);

    // Safety check for duplicate names upon initial join to prevent reconnect mixing
    if (session.players.some(p => p.name === fallbackName)) {
        fallbackName = fallbackName + " (2)";
    }

    // a spectator who takes a free seat stops watching
    if (session.spectators) session.spectators = session.spectators.filter(w => w.clientId !== clientId);
    session.players.push({
        index: playerIndex,
        name: fallbackName,
        clientId,
        civ: cleanKey(playerInfo.civ, 'griechenland'),
        ability: cleanKey(playerInfo.ability, 'basis'),
        kind: 'human',
        connected: false,
        socketId: null,
        ...botSeat(playerInfo),
    });

    return { sessionId, playerIndex };
}

/**
 * Watch a session without a seat (spectator mode): with code and password, in any phase.
 * A spectator can't act and can't write in the chat. Up to MAX_SPECTATORS at once; the same
 * clientId comes back as the same spectator (reconnect). A player of the session stays a player.
 * @returns {object|string} { sessionId, spectator: true } or error string
 */
function addSpectator(joinCode, password, info, opts) {
    const clientId = clientIdOf(info);
    if (!clientId) return INVALID_CLIENT;
    const sessionId = codeIndex.get(String(joinCode || '').toUpperCase());
    if (!sessionId) return 'Ungültiger Beitrittscode.';
    const session = sessions.get(sessionId);
    if (!session) return 'Sitzung nicht gefunden.';
    const pwError = checkPassword(session, password, clientId, opts);
    if (pwError) return pwError;
    if (session.players.some(p => p.clientId === clientId)) return { sessionId, spectator: false };
    if (!session.spectators) session.spectators = [];
    if (session.spectators.some(w => w.clientId === clientId)) return { sessionId, spectator: true };
    // room for a new one: forget spectators who are gone
    if (spectatorCount(session) >= config.MAX_SPECTATORS) return 'Es schauen schon zu viele zu.';
    session.spectators = session.spectators.filter(w => w.connected);
    session.spectators.push({ clientId, name: cleanName(info.name, 'Zuschauer'), socketId: null, connected: false });
    return { sessionId, spectator: true };
}

function spectatorCount(session) {
    return (session.spectators || []).filter(w => w.connected).length;
}

/**
 * Player-bots (bot accounts, utils/bots.js) sit on human seats – first come, first served – and
 * never on the KI seats. The host allows them (gameConfig.playerBots) and may limit them
 * (gameConfig.playerBotLimit, null = every free human seat). A bot hosting the lobby always
 * allows them and doesn't count itself. A seat of a bot account is bound to that account
 * (botUserId, checked by sockets/game.js session:connect).
 */
function botSeat(info) {
    return info && typeof info.botUserId === 'string' ? { playerBot: true, botUserId: info.botUserId } : {};
}

function playerBotPolicy(session) {
    const cfg = session.gameConfig || {};
    const host = session.players[session.hostIndex];
    const hostIsBot = !!(host && host.playerBot);
    const allowed = hostIsBot || cfg.playerBots === true;
    const limit = Number.isInteger(cfg.playerBotLimit) && cfg.playerBotLimit > 0 ? cfg.playerBotLimit : null;
    const count = session.players.filter(p => p.playerBot && p !== host).length;
    const free = !allowed ? 0 : limit == null ? Infinity : limit - count;
    return { allowed, limit, count, free, hostIsBot };
}

/**
 * How many humans a lobby takes: the empires in all minus the seats the host gave the KI
 * (gameConfig.playerCount / kiCount); without that setting the server maximum.
 */
function humanSeats(session) {
    const cfg = session.gameConfig || {};
    const total = Number.isInteger(cfg.playerCount) ? cfg.playerCount : config.MAX_PLAYERS;
    const ki = Number.isInteger(cfg.kiCount) ? cfg.kiCount : 0;
    return Math.max(1, Math.min(config.MAX_PLAYERS, total - ki));
}

function getSession(sessionId) {
    return sessions.get(sessionId) || null;
}

function removeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        codeIndex.delete(session.joinCode);
        sessions.delete(sessionId);
    }
}

/** Purge expired sessions */
function cleanup() {
    const now = Date.now();
    for (const [id, s] of sessions) {
        let shouldTerminate = false;

        // No absolute lifetime: a session ends when it is empty or idle for too long.
        const running = ['civdraft', 'placement', 'draft', 'playing'].includes(s.status);
        // a paused game waits for its players – a lunch or dinner break (R-11)
        const paused = running && !!s.paused;

        // 1. Empty: a lobby or a finished game nobody is connected to goes at the next run
        // (empty for one whole cleanup interval, 5–10 min). A running game survives an outage
        // where everyone is offline for EMPTY_RUNNING_GRACE_MS – a dropped LAN-party Wi-Fi, phones
        // in the background (R-10) –, a paused one as long as the pause may last.
        const hasConnectedPlayers = s.players.some(p => p.connected);
        if (!hasConnectedPlayers) {
            const grace = paused ? config.PAUSE_TIMEOUT_MS : running ? config.EMPTY_RUNNING_GRACE_MS : 0;
            if (!s.emptySince) {
                s.emptySince = now;
            } else if (now - s.emptySince >= grace) {
                shouldTerminate = true;
            }
        } else {
            s.emptySince = null;
        }

        // 2. Inactivity: a running game may sit still longer (no turn timer, a player thinking)
        // than a lobby or a finished game, a paused one longer still
        const idleLimit = paused ? config.PAUSE_TIMEOUT_MS : running ? config.SESSION_TIMEOUT_MS : config.LOBBY_TIMEOUT_MS;
        if (s.lastActivity && now - s.lastActivity > idleLimit) {
            shouldTerminate = true;
        }

        if (shouldTerminate) {
            removeSession(id);
        }
    }
}

// Run cleanup periodically
const _cleanupTimer = setInterval(cleanup, config.CLEANUP_INTERVAL_MS);
_cleanupTimer.unref();   // don't prevent Node from exiting

/**
 * R-16: the lobby password (6 digits) against guessing. Wrong passwords are counted per lobby:
 * PASSWORD_MAX_FAILS within PASSWORD_WINDOW_MS lock the lobby for PASSWORD_LOCK_MS – for
 * everyone who is not in it yet, right password or not, so a lock gives a guesser nothing.
 * Players and spectators of the lobby (their secret clientId) still get back in; the server's
 * own callers (Discord Activity, matchmaking) pass { trusted: true }. Compared in constant time.
 */
const PASSWORD_MAX_FAILS = 10;
const PASSWORD_WINDOW_MS = 10 * 60 * 1000;
const PASSWORD_LOCK_MS = 5 * 60 * 1000;
const WRONG_PASSWORD = 'Falsches Passwort.';
const PASSWORD_LOCKED = 'Zu viele falsche Passwörter für diese Lobby. Versuche es in ein paar Minuten erneut.';
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
function passwordMatches(session, password) {
    return typeof password === 'string' && crypto.timingSafeEqual(sha(password), sha(session.password));
}
/** null if `password` opens `session`, else the error. */
function checkPassword(session, password, clientId, opts = {}) {
    const known = !!opts.trusted || (typeof clientId === 'string' && (session.players.some(p => p.clientId === clientId)
        || (session.spectators || []).some(w => w.clientId === clientId)));
    const now = Date.now();
    const g = session.passwordGuard || (session.passwordGuard = { fails: 0, since: now, lockedUntil: 0 });
    if (!known && g.lockedUntil > now) return PASSWORD_LOCKED;
    if (passwordMatches(session, password)) return null;
    if (!known) {
        if (now - g.since > PASSWORD_WINDOW_MS) Object.assign(g, { fails: 0, since: now });
        if (++g.fails >= PASSWORD_MAX_FAILS) Object.assign(g, { fails: 0, since: now, lockedUntil: now + PASSWORD_LOCK_MS });
    }
    return WRONG_PASSWORD;
}

/**
 * R-23: the host's kick bans the seat's tab (clientId) and account from the session – before, the
 * kicked player could rejoin at once with code and password. A guest in a new tab gets past it
 * (a new clientId); the host can kick again. Lasts as long as the session.
 */
const BANNED = 'Der Host hat dich aus dieser Lobby entfernt.';
function banFromSession(session, player) {
    if (!player || player.kind !== 'human') return;
    const b = session.banned || (session.banned = { clientIds: [], userIds: [] });
    if (player.clientId && !b.clientIds.includes(player.clientId)) b.clientIds.push(player.clientId);
    for (const id of [player.dbUserId, player.botUserId]) if (id && !b.userIds.includes(id)) b.userIds.push(id);
}
function isBanned(session, clientId, userId) {
    const b = session.banned;
    return !!b && (b.clientIds.includes(clientId) || (!!userId && b.userIds.includes(userId)));
}

function kickPlayer(sessionId, playerIndex, force = false) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'lobby') return false;
    if (!session.players[playerIndex]) return false;
    // the host's own seat – after a rematch with turn positions it need not be seat 0
    if (playerIndex === session.hostIndex && !force) return false;

    session.players.splice(playerIndex, 1);
    // Reindex remaining players
    for (let i = 0; i < session.players.length; i++) {
        session.players[i].index = i;
    }
    return true;
}

function updateConfig(sessionId, newConfig) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'lobby') return false;
    if (!newConfig || typeof newConfig !== 'object' || Array.isArray(newConfig)) return false;
    if (JSON.stringify(newConfig).length > 10000) return false;
    const allowed = cleanHostConfig(newConfig);        // seed, map, setup … are the server's
    session.gameConfig = { ...session.gameConfig, ...allowed };
    if (typeof allowed.isPublic === 'boolean') session.isPublic = allowed.isPublic;   // the host switches it in the lobby
    return session.gameConfig;
}

function updatePlayer(sessionId, playerIndex, updates) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'lobby') return false;
    const player = session.players[playerIndex];
    if (!player) return false;

    let civChanged = false;
    const civ = cleanKey(updates && updates.civ, null);
    const ability = cleanKey(updates && updates.ability, null);
    if (civ && player.civ !== civ) {
        player.civ = civ;
        civChanged = true;
    }

    // If the civ changed, forcefully reset the ability to 'basis' since the old ability key is invalid for the new civ.
    if (civChanged) {
        player.ability = player.civ === 'random' ? 'random' : 'basis';
    } else if (ability) {
        player.ability = ability;
    }
    // Turn position (F34, turn order 'pick'): 0-based, null = none; the socket checks it is free
    if (updates && updates.pos !== undefined) player.pos = Number.isInteger(updates.pos) && updates.pos >= 0 && updates.pos < 8 ? updates.pos : null;
    return true;
}

/**
 * Rematch: a finished game goes back to its lobby. The connected humans keep their seats
 * (re-indexed) and their lobby choice of nation and ability; KI seats and players who left
 * are dropped. Same code, password and settings, a new seed.
 * @returns {object|string} the session, or an error message
 */
function resetForRematch(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return 'Sitzung nicht gefunden.';
    if (session.status !== 'finished') return 'Die Partie ist noch nicht vorbei.';
    const host = session.players[session.hostIndex];
    session.players = session.players.filter(p => p.kind === 'human' && p.connected);
    session.players.forEach((p, i) => {
        const choice = p.choice || {};
        Object.assign(p, {
            index: i, civ: choice.civ || p.civ, ability: choice.ability || p.ability,
            afk: false, missedTurns: 0, resigned: false, ready: false, drafted: null, roman: null, color: null,
            chatMute: null,             // the word filter's timeout lasts for one game
        });
        delete p.mappedName;
    });
    session.hostIndex = Math.max(0, session.players.indexOf(host));
    // map / setup are set by the server at the start (tile map, Marathon), the seed is new
    const { map, setup, ...gameConfig } = session.gameConfig;
    session.gameConfig = { ...gameConfig, seed: crypto.randomInt(2 ** 31) };
    Object.assign(session, {
        status: 'lobby', state: null, gameOverProcessed: false, stats: null, replay: null, gameRecord: null,
        chat: [], marks: null, summaryKey: null, lastSummary: null,
        placementState: null, draft: null, turnClock: null, paused: null, converting: false, converted: null,
    });
    recordActivity(sessionId);
    return session;
}

/** Public lobbies to join, and public games that are running (to watch: status ≠ 'lobby'). */
function getPublicSessions() {
    const list = [];
    for (const [, s] of sessions) {
        // nobody connected: abandoned, removed by the next cleanup – nothing to join or watch
        if (!s.isPublic || s.status === 'finished' || !s.players.some(p => p.connected)) continue;
        list.push(sessionSummary(s));
    }
    return list;
}

/**
 * Invite link (?join=CODE&pw=…): what the invited player sees before joining. Needs the password,
 * like joining; works for private lobbies too. Never returns the password.
 * @returns {object|string} summary or error string
 */
function previewSession(joinCode, password) {
    const sessionId = codeIndex.get(String(joinCode).toUpperCase());
    if (!sessionId) return 'Ungültiger Beitrittscode.';
    const s = sessions.get(sessionId);
    if (!s) return 'Sitzung nicht gefunden.';
    const pwError = checkPassword(s, password, null);
    if (pwError) return pwError;
    const { password: _pw, id: _id, ...summary } = sessionSummary(s);
    summary.players = s.players.map(p => p.name);
    return summary;
}

/** One live session as the list of open games and the invite preview show it. */
function sessionSummary(s) {
    const bots = playerBotPolicy(s);
    const cfg = s.gameConfig;
    // empires in all as the lobby shows them (mp.js lobbyCounts); a new lobby has none set yet
    const empires = Math.min(config.MAX_PLAYERS, Number.isInteger(cfg.playerCount) ? cfg.playerCount
        : cfg.noKi ? s.players.length : Math.max(4, s.players.length));
    return {
        id: s.id,
        joinCode: s.joinCode,
        password: s.password,
        status: s.status,
        hostName: s.players[s.hostIndex] ? s.players[s.hostIndex].name : 'Host',
        playersCount: s.players.length,
        maxPlayers: humanSeats(s),
        mapKey: s.gameConfig.mapKey || '0',
        round: s.state ? s.state.round : null,
        spectators: spectatorCount(s),
        // player-bots: allowed at all, and how many more may join (null = no limit)
        playerBots: bots.allowed,
        playerBotsFree: bots.free === Infinity ? null : Math.max(0, bots.free),
        // the lobby's settings, for the filters of the list (mp.js lobbyTraits)
        customMapName: cfg.mapKey === 'eigene' && cfg.customMap ? cfg.customMap.name : null,
        empires,
        kiCount: Math.max(0, Math.min(empires - 1, Number.isInteger(cfg.kiCount) ? cfg.kiCount : 0)),
        difficulty: cfg.difficulty || null,
        randomCivs: !!cfg.randomCivs,
        civMode: CivDraft.modesOf(cfg).civMode,
        turnOrder: CivDraft.modesOf(cfg).turnOrder,
        events: !!cfg.events,
        eventMode: cfg.eventMode === 'easy' ? 'easy' : 'hard',
        wonders: !!cfg.wonders,
        expCivs: CivDraft.expCivsOn(cfg),
        hexTiles: !!cfg.hexTiles && (cfg.mapKey === 'random' || cfg.mapKey === 'plaettchen'),
        ranked: !!cfg.ranked,
        turnTime: cfg.turnTime || 0,
    };
}

/**
 * Friends list (utils/friends.js): what an account does in a live game right now – null, or
 * { status: 'lobby' | 'playing', round, hostName } plus code and password of a public session
 * (those are in the public list anyway).
 */
function activityOf(userId) {
    for (const [, s] of sessions) {
        if (s.status === 'finished') continue;
        const p = s.players.find(x => x.dbUserId === userId && x.connected && x.kind === 'human' && !x.resigned);
        if (!p) continue;
        const out = {
            status: s.status === 'lobby' ? 'lobby' : 'playing',
            round: s.state ? s.state.round : null,
            hostName: s.players[s.hostIndex] ? s.players[s.hostIndex].name : null,
        };
        if (s.isPublic) Object.assign(out, { joinCode: s.joinCode, password: s.password, full: s.players.length >= humanSeats(s) });
        return out;
    }
    return null;
}

/** A live lobby by code, for invitations from it (utils/friends.js). */
function lobbyByCode(joinCode) {
    const id = codeIndex.get(String(joinCode || '').toUpperCase());
    const s = id ? sessions.get(id) : null;
    return s || null;
}

function recordActivity(sessionId) {
    const s = sessions.get(sessionId);
    if (s) {
        s.lastActivity = Date.now();
        s.emptySince = null;
    }
}

module.exports = {
    createSession,
    joinSession,
    addSpectator,
    spectatorCount,
    playerBotPolicy,
    getSession,
    removeSession,
    cleanup,
    kickPlayer,
    banFromSession,
    isBanned,
    BANNED,
    checkPassword,
    passwordMatches,
    PASSWORD_LOCKED,
    PASSWORD_MAX_FAILS,
    cleanHostConfig,
    previewSession,
    activityOf,
    lobbyByCode,
    updateConfig,
    updatePlayer,
    resetForRematch,
    getPublicSessions,
    recordActivity,
    getAllSessions: () => sessions,
};
