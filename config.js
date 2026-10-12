// Public URL of the server (no trailing slash). Used for OAuth callbacks, e-mail links and
// as the fixed WebAuthn origin. If unset, WebAuthn falls back to the request's host.
const RAW_BASE_URL = (process.env.BASE_URL || '').trim();

/** BASE_URL must be exactly scheme + host (+ port), e.g. https://hochciv.example – typos fail at startup. */
function parseBaseUrl(raw) {
    let u;
    try { u = new URL(raw); } catch (e) { u = null; }
    if (!u || !['http:', 'https:'].includes(u.protocol) || !/^[a-z0-9.-]+$/i.test(u.hostname)
        || u.pathname !== '/' || u.search || u.hash || u.username || u.password) {
        throw new Error(`Invalid BASE_URL "${raw}". Expected only scheme and host, e.g. https://hochciv.example (no path, no trailing characters).`);
    }
    return u;
}

let BASE_URL = '';
let WEBAUTHN = null;
if (RAW_BASE_URL) {
    const u = parseBaseUrl(RAW_BASE_URL);
    BASE_URL = u.origin;
    WEBAUTHN = { rpID: u.hostname, origin: u.origin };
}

module.exports = {
    PORT: process.env.PORT || 3000,
    BASE_URL: BASE_URL || 'http://localhost:3000',
    WEBAUTHN,
    CORS_ORIGINS: '*',
    JOIN_CODE_LENGTH: 6,
    PASSWORD_LENGTH: 6,        // 6-digit numeric password
    MAX_PLAYERS: 4,
    MAX_SESSIONS: 500,         // in-memory lobbies/games at once
    MAX_NAME_LENGTH: 30,
    SESSION_TIMEOUT_MS: 2 * 60 * 60 * 1000,  // 2 hours
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,       // check every 5 min
};
