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
                civ: hostInfo.civ,
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
    if (session.status !== 'lobby') return 'Spiel hat bereits begonnen.';
    if (session.password !== password) return 'Falsches Passwort.';
    if (session.players.length >= config.MAX_PLAYERS) return 'Sitzung ist voll.';
    // Prevent duplicate civ
    if (session.players.some(p => p.civ === playerInfo.civ))
        return `${playerInfo.civ} ist schon vergeben.`;

    const playerIndex = session.players.length;
    session.players.push({
        index: playerIndex,
        name: playerInfo.name || `Spieler ${playerIndex + 1}`,
        civ: playerInfo.civ,
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

module.exports = {
    createSession,
    joinSession,
    getSession,
    getSessionByCode,
    removeSession,
    cleanup,
};
