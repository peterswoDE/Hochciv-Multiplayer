const { generateSecret, generateURI, verifySync, createGuardrails } = require('otplib');

// otplib v12 created 10-byte secrets; v13 rejects anything under 16 bytes by default.
// Accept the old size so authenticator apps set up before the upgrade keep working.
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

const newSecret = () => generateSecret();

const keyUri = (label, issuer, secret) => generateURI({ label, issuer, secret });

const checkToken = (token, secret) => {
    try {
        return verifySync({ secret, token: String(token).trim(), guardrails }).valid;
    } catch (err) {
        // malformed token (wrong length, non-digits) or secret
        return false;
    }
};

/** Does `token` match one of the user's authenticator apps (legacy secret or TotpToken)? */
async function checkUserToken(user, token) {
    if (user.totpSecret && checkToken(token, user.totpSecret)) return true;
    const { TotpToken } = require('../models');
    const tokens = await TotpToken.findAll({ where: { UserId: user.id } });
    return tokens.some(t => checkToken(token, t.secret));
}

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

/**
 * checkUserToken with a limit per account (the IP limit alone lets someone with the password keep
 * guessing from many addresses): after MAX_ATTEMPTS wrong codes in a row, no code is accepted for
 * LOCK_MS. Returns null when the code is right, else the error (German, translated by the client).
 */
async function checkLimited(user, token) {
    const { sequelize } = require('../models');
    const LOCKED = 'Zu viele falsche Codes. Versuche es in 15 Minuten erneut.';
    // Count the attempt in the database first, in one statement: parallel guesses each get their
    // own number, so no more than MAX_ATTEMPTS are checked before the lock. A locked account
    // returns no row.
    const [rows] = await sequelize.query(
        `UPDATE users SET "totpAttempts" = COALESCE("totpAttempts", 0) + 1
         WHERE id = :id AND ("totpLockedUntil" IS NULL OR "totpLockedUntil" <= now())
         RETURNING "totpAttempts" AS n`,
        { replacements: { id: user.id } });
    const lock = () => sequelize.query(
        `UPDATE users SET "totpAttempts" = 0, "totpLockedUntil" = now() + make_interval(secs => :secs) WHERE id = :id`,
        { replacements: { id: user.id, secs: LOCK_MS / 1000 } });
    if (!rows || !rows.length) return LOCKED;
    if (rows[0].n > MAX_ATTEMPTS) { await lock(); return LOCKED; }
    if (await checkUserToken(user, token)) {
        await sequelize.query(`UPDATE users SET "totpAttempts" = 0, "totpLockedUntil" = NULL WHERE id = :id`, { replacements: { id: user.id } });
        return null;
    }
    if (rows[0].n >= MAX_ATTEMPTS) { await lock(); return LOCKED; }
    return 'Ungültiger Code';
}

module.exports = { newSecret, keyUri, checkToken, checkUserToken, checkLimited, MAX_ATTEMPTS };
