/**
 * R-19 of the findings report: a push device remembers the login that registered it (a SHA-256
 * of the session id – not the id itself). Another account takes the device over only after that
 * login has ended (routes/push.js). Nullable: existing devices have none and move as before.
 */
exports.up = async db => {
    await db.query('ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS "sessionHash" varchar(64)');
};
