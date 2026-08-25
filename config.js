module.exports = {
    PORT: process.env.PORT || 3000,
    CORS_ORIGINS: '*',
    JOIN_CODE_LENGTH: 6,
    PASSWORD_LENGTH: 6,        // 6-digit numeric password
    MAX_PLAYERS: 4,
    SESSION_TIMEOUT_MS: 2 * 60 * 60 * 1000,  // 2 hours
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,       // check every 5 min
};
