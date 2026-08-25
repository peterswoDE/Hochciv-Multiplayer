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
        status: 'lobby',              // lobby → playing → finished
        createdAt: Date.now(),
        hostIndex: 0,
        players: [
            {
                index: 0,
                name: hostInfo.name || 'Host',
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
    // Check if player is reconnecting
    const existingPlayer = session.players.find(p => p.name === playerInfo.name);
    if (existingPlayer) {
        // It's a reconnection
        return { sessionId, playerIndex: existingPlayer.index };
    }

    if (session.status !== 'lobby') return 'Spiel hat bereits begonnen.';
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
        if (now - s.createdAt > config.SESSION_TIMEOUT_MS) {
            removeSession(id);
        }
    }
}

// Run cleanup periodically
const _cleanupTimer = setInterval(cleanup, config.CLEANUP_INTERVAL_MS);
_cleanupTimer.unref();   // don't prevent Node from exiting

function kickPlayer(sessionId, playerIndex) {
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'lobby' || playerIndex === 0) return false;

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
};
