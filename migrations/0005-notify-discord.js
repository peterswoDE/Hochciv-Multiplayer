/**
 * Rundenspiel notifications as a Discord direct message (utils/discord.js): opt-in, so off for
 * every existing account.
 */
exports.up = async db => {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "notifyDiscord" boolean DEFAULT false NOT NULL');
};
