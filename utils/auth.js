/**
 * Shared helpers for the auth-related routes: login guard, the user object the client
 * gets back, request-input validation and one-time codes.
 */
const crypto = require('crypto');

// Usernames are shown in many places (lobbies, admin panel, e-mails) – keep them plain.
const USERNAME_RE = /^[A-Za-z0-9_-]{3,30}$/;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;
// Changes to how someone logs in (2FA, passkeys, e-mail, first password) need a login or
// re-confirmation within this window – a stolen session cookie alone is not enough.
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Nicht eingeloggt' });
}

/** Call after a successful login or re-confirmation (password, TOTP, passkey, OAuth). */
function markAuthenticated(req) {
    req.session.authAt = Date.now();
}

function recentlyAuthenticated(req) {
    const at = req.session && req.session.authAt;
    return typeof at === 'number' && Date.now() - at < REAUTH_WINDOW_MS;
}

/**
 * Middleware: the user must have logged in or confirmed their identity recently. The client
 * answers `reauthRequired` with POST /api/account/reauth and then repeats the request.
 */
function requireRecentAuth(req, res, next) {
    if (recentlyAuthenticated(req)) return next();
    res.status(403).json({
        error: 'Bitte bestätige zuerst deine Identität.',
        reauthRequired: true,
        methods: { password: !!req.user.password_hash, totp: !!req.user.totpEnabled },
    });
}

/** The user fields the client is allowed to see. */
function userJson(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        mmr: user.mmr,
        gamesPlayed: user.gamesPlayed,
        role: user.role,
        // Only whether an account is linked – the provider ids stay on the server
        googleLinked: !!user.googleId,
        discordLinked: !!user.discordId,
    };
}

/**
 * Request values must be plain strings. Arrays or objects in a Sequelize `where`
 * become `IN (...)` / operators, so everything from req.body goes through here first.
 */
function str(value, maxLength = 200) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function validPassword(pw) {
    return typeof pw === 'string' && pw.length >= MIN_PASSWORD_LENGTH && pw.length <= 200;
}

/** 6-digit one-time code from a CSPRNG. */
function generateCode() {
    return crypto.randomInt(100000, 1000000).toString();
}

function codesEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Store a new one-time code in `field` (e.g. 'resetCode'), valid for `ttlMs`. Each code type has
 * its own attempt counter (`<field>Attempts`), so requesting one kind of code never resets
 * the attempts on another. Returns the code; the caller saves the user.
 */
function issueCode(user, field, expiryField, ttlMs) {
    const code = generateCode();
    user[field] = code;
    user[expiryField] = new Date(Date.now() + ttlMs);
    user[`${field}Attempts`] = 0;
    return code;
}

/**
 * Check a one-time code stored on the user (`field`, `expiryField`). Every wrong guess
 * counts; after MAX_CODE_ATTEMPTS the code is burnt and a new one must be requested.
 * Returns null on success or an error message.
 */
async function consumeCode(user, field, expiryField, code) {
    const attempts = `${field}Attempts`;
    if (!user[field]) return 'Kein gültiger Code vorhanden. Bitte fordere einen neuen an.';
    if (user[expiryField] && user[expiryField] < new Date()) return 'Der Code ist abgelaufen. Bitte fordere einen neuen an.';
    if (!codesEqual(user[field], code)) {
        user[attempts] = (user[attempts] || 0) + 1;
        if (user[attempts] >= MAX_CODE_ATTEMPTS) {
            user[field] = null;
            user[attempts] = 0;
            await user.save();
            return 'Zu viele Fehlversuche. Bitte fordere einen neuen Code an.';
        }
        await user.save();
        return 'Ungültiger Code.';
    }
    user[field] = null;
    user[attempts] = 0;
    return null;
}

/** Log out every other session of this user (after password change / reset). */
async function destroyOtherSessions(sequelize, userId, keepSid = null) {
    await sequelize.query(
        `DELETE FROM "session" WHERE sess::jsonb #>> '{passport,user}' = :userId AND sid <> :keepSid`,
        { replacements: { userId: String(userId), keepSid: keepSid || '' } }
    );
}

module.exports = {
    USERNAME_RE, EMAIL_RE, MIN_PASSWORD_LENGTH,
    isAuthenticated, markAuthenticated, recentlyAuthenticated, requireRecentAuth,
    userJson, str, validPassword,
    generateCode, issueCode, consumeCode, destroyOtherSessions,
};
