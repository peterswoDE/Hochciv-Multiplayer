// A bot that keeps running into the limits per account (utils/account-limits.js) is suspended for
// an hour: until then botBlockedReason refuses its login and session.
exports.up = async db => {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "suspendedUntil" timestamptz');
};
