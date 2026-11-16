/**
 * Shared helpers for the auth-related routes: login guard, the user object the client
 * gets back, request-input validation and one-time codes.
 */
const crypto = require('crypto');
const { Passkey } = require('../models');
const terms = require('./terms');
const { canCreateBots } = require('./bots');

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

/** Middleware: account settings (e-mail, password, 2FA, linked logins) are for humans only. */
function noBots(req, res, next) {
    if (req.user && req.user.accountType === 'bot') return res.status(403).json({ error: 'Bot-Konten haben keine Kontoeinstellungen.' });
    next();
}

/** The second factors of an account – { totp, passkey, email } – or null if it has none. */
async function secondFactors(user) {
    const passkey = (await Passkey.count({ where: { UserId: user.id } })) > 0;
    const methods = { totp: !!user.totpEnabled, passkey, email: !!user.emailOtpEnabled };
    return methods.totp || methods.passkey || methods.email ? methods : null;
}

/**
 * Call after a successful login or re-confirmation (password, TOTP, passkey). Google/Discord only
 * count for accounts without a second factor: on the others they log in, but sensitive changes
 * still ask for the password or the second factor.
 */
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
        accountType: user.accountType || 'human',
        canCreateBots: canCreateBots(user),
        // Only whether an account is linked – the provider ids stay on the server
        googleLinked: !!user.googleId,
        discordLinked: !!user.discordId,
        termsAccepted: terms.accepted(user),
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

/*
 * How often a code of one kind may be sent to one account: every new code allows another
 * MAX_CODE_ATTEMPTS guesses, so without this limit requesting codes over and over (from many
 * addresses) would allow any number of guesses. In memory – the server is one process.
 */
const CODES_PER_WINDOW = 3;
const CODE_WINDOW_MS = 60 * 60 * 1000;
const codeIssues = new Map();          // `${field}:${userId}` → [ms, …]

/** True if `user` may get another code of kind `field` now (and counts it). */
function mayIssueCode(user, field) {
    const key = `${field}:${user.id}`;
    const now = Date.now();
    const times = (codeIssues.get(key) || []).filter(t => now - t < CODE_WINDOW_MS);
    if (times.length >= CODES_PER_WINDOW) { codeIssues.set(key, times); return false; }
    codeIssues.set(key, times.concat(now));
    return true;
}
const _codeIssuesSweep = setInterval(() => {
    const now = Date.now();
    for (const [k, times] of codeIssues) if (!times.some(t => now - t < CODE_WINDOW_MS)) codeIssues.delete(k);
}, CODE_WINDOW_MS);
_codeIssuesSweep.unref();

/**
 * Store a new one-time code in `field` (e.g. 'resetCode'), valid for `ttlMs`. Each code type has
 * its own attempt counter (`<field>Attempts`), so requesting one kind of code never resets
 * the attempts on another. A code that replaces one still valid keeps its failed attempts.
 * Returns the code; the caller saves the user. Callers limit how often with mayIssueCode.
 */
function issueCode(user, field, expiryField, ttlMs) {
    const code = generateCode();
    const live = !!user[field] && user[expiryField] instanceof Date && user[expiryField] > new Date();
    user[field] = code;
    user[expiryField] = new Date(Date.now() + ttlMs);
    if (!live) user[`${field}Attempts`] = 0;
    return code;
}

/**
 * Check a one-time code stored on the user (`field`, `expiryField`). Every wrong guess
 * counts; after MAX_CODE_ATTEMPTS the code is burnt and a new one must be requested.
 * The attempt is counted in the database first, in one statement, so parallel guesses each get
 * their own number (no read-modify-write race), and a right code is used up only once.
 * Returns null on success or an error message. `field` / `expiryField` are server constants.
 */
async function consumeCode(user, field, expiryField, code) {
    const { sequelize } = require('../models');
    const attempts = `${field}Attempts`;
    const [rows] = await sequelize.query(
        `UPDATE users SET "${attempts}" = COALESCE("${attempts}", 0) + 1 WHERE id = :id
         RETURNING "${attempts}" AS n, "${field}" AS c, "${expiryField}" AS e`,
        { replacements: { id: user.id } });
    const row = rows && rows[0];
    if (!row || !row.c) return 'Kein gültiger Code vorhanden. Bitte fordere einen neuen an.';
    if (row.e && new Date(row.e) < new Date()) return 'Der Code ist abgelaufen. Bitte fordere einen neuen an.';
    if (row.n > MAX_CODE_ATTEMPTS) {
        await sequelize.query(`UPDATE users SET "${field}" = NULL, "${attempts}" = 0 WHERE id = :id`, { replacements: { id: user.id } });
        user[field] = null;
        return 'Zu viele Fehlversuche. Bitte fordere einen neuen Code an.';
    }
    if (!codesEqual(row.c, code)) {
        if (row.n >= MAX_CODE_ATTEMPTS) {
            await sequelize.query(`UPDATE users SET "${field}" = NULL, "${attempts}" = 0 WHERE id = :id`, { replacements: { id: user.id } });
            user[field] = null;
            return 'Zu viele Fehlversuche. Bitte fordere einen neuen Code an.';
        }
        return 'Ungültiger Code.';
    }
    // single use: of two parallel right guesses only one gets through
    const [, meta] = await sequelize.query(
        `UPDATE users SET "${field}" = NULL, "${attempts}" = 0 WHERE id = :id AND "${field}" = :code`,
        { replacements: { id: user.id, code } });
    if (!meta || meta.rowCount !== 1) return 'Kein gültiger Code vorhanden. Bitte fordere einen neuen an.';
    // the row is up to date already; the caller's save must not write the old values back
    user.setDataValue(field, null);
    user.setDataValue(attempts, 0);
    if (user.changed) { user.changed(field, false); user.changed(attempts, false); }
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
    isAuthenticated, noBots, secondFactors, markAuthenticated, recentlyAuthenticated, requireRecentAuth,
    userJson, str, validPassword,
    generateCode, issueCode, mayIssueCode, consumeCode, destroyOtherSessions,
};
