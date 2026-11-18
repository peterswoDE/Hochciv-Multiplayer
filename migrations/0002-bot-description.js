/**
 * F38: optional public description on bot profiles (routes/bots.js, routes/profile.js).
 * Nullable, so existing bots start without one and older images keep working.
 */
exports.up = async db => {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "botDescription" varchar(280)');
};
