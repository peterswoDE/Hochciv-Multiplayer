const crypto = require('crypto');
const config = require('./config');

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

function generatePassword() {
    let pw = '';
    for (let i = 0; i < config.PASSWORD_LENGTH; i++)
        pw += crypto.randomInt(10).toString();
    return pw;
}

/**
 * Create a new multiplayer session.
 * @param {object} gameConfig  – map, mode, wonders, events, etc.
 * @param {object} hostInfo    – { name, civ, ability }
 * @returns {object} { sessionId, joinCode, password }
 */
function createSession(gameConfig, hostInfo) {
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
                name: hostInfo.name || 'Host',
                clientId: hostInfo.clientId,
                civ: hostInfo.civ || 'griechenland',
                ability: hostInfo.ability || 'basis',
                kind: 'human',
                connected: false,
                socketId: null,
            },
        ],
        state: null,                  // filled when game starts
    };

    sessions.set(sessionId, session);
    codeIndex.set(joinCode, sessionId);
    return { sessionId, joinCode, password };
}

/**
 * Join an existing session.
 * @param {string} joinCode
 * @param {string} password  – 6-digit numeric
 * @param {object} playerInfo – { name, civ, ability }
 * @returns {object|string} { sessionId, playerIndex } or error string
 */
function joinSession(joinCode, password, playerInfo) {
    const sessionId = codeIndex.get(joinCode.toUpperCase());
    if (!sessionId) return 'Ungültiger Beitrittscode.';
    const session = sessions.get(sessionId);
    if (!session) return 'Sitzung nicht gefunden.';
    if (session.password !== password) return 'Falsches Passwort.';

    // Check if player is reconnecting
    const existingPlayer = session.players.find(p => p.clientId === playerInfo.clientId);
    if (existingPlayer) {
        // It's a reconnection
        return { sessionId, playerIndex: existingPlayer.index };
    }

    if (session.status !== 'lobby') return 'Spiel hat bereits begonnen. Wenn du dich wiederverbinden willst, musst du deinen exakten, ursprünglichen Spielernamen verwenden.';
    if (session.players.length >= config.MAX_PLAYERS) return 'Sitzung ist voll.';

    const playerIndex = session.players.length;
    let fallbackName = playerInfo.name || `Spieler ${playerIndex + 1}`;

    // Safety check for duplicate names upon initial join to prevent reconnect mixing
    if (session.players.some(p => p.name === fallbackName)) {
        fallbackName = fallbackName + " (2)";
    }

    session.players.push({
        index: playerIndex,
        name: fallbackName,
        clientId: playerInfo.clientId,
        civ: playerInfo.civ || 'griechenland',
        ability: playerInfo.ability || 'basis',
        kind: 'human',
        connected: false,
        socketId: null,
    });

    return { sessionId, playerIndex };
}

function getSession(sessionId) {
    return sessions.get(sessionId) || null;
}

function getSessionByCode(code) {
    const id = codeIndex.get(code.toUpperCase());
    return id ? sessions.get(id) : null;
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

        // 1. Session absolute timeout
        if (now - s.createdAt > config.SESSION_TIMEOUT_MS) {
            shouldTerminate = true;
        }

        // 2. Empty room termination
        const hasConnectedPlayers = s.players.some(p => p.connected);
        if (!hasConnectedPlayers) {
            if (!s.emptySince) {
                s.emptySince = now;
            } else if (now - s.emptySince > 10 * 1000) { // 10 seconds empty grace period
                shouldTerminate = true;
            }
        } else {
            s.emptySince = null;
        }

        // 3. Inactivity termination (10 mins)
        if (s.lastActivity && now - s.lastActivity > 10 * 60 * 1000) {
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

function kickPlayer(sessionId, playerIndex, force = false) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'lobby') return false;
    if (playerIndex === 0 && !force) return false;

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
    session.gameConfig = { ...session.gameConfig, ...newConfig };
    return session.gameConfig;
}

function updatePlayer(sessionId, playerIndex, updates) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'lobby') return false;
    const player = session.players[playerIndex];
    if (!player) return false;

    let civChanged = false;
    if (updates.civ && player.civ !== updates.civ) {
        player.civ = updates.civ;
        civChanged = true;
    }

    // If the civ changed, forcefully reset the ability to 'basis' since the old ability key is invalid for the new civ.
    if (civChanged) {
        player.ability = 'basis';
    } else if (updates.ability) {
        player.ability = updates.ability;
    }
    return true;
}

function getPublicSessions() {
    const list = [];
    for (const [id, s] of sessions) {
        if (s.status === 'lobby' && s.isPublic) {
            list.push({
                id: s.id,
                joinCode: s.joinCode,
                password: s.password,
                hostName: s.players[s.hostIndex] ? s.players[s.hostIndex].name : 'Host',
                playersCount: s.players.length,
                maxPlayers: config.MAX_PLAYERS,
                mapKey: s.gameConfig.mapKey || '0',
            });
        }
    }
    return list;
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
    getSession,
    getSessionByCode,
    removeSession,
    cleanup,
    kickPlayer,
    updateConfig,
    updatePlayer,
    getPublicSessions,
    recordActivity,
};
