/**
 * Server settings an admin changes in the admin panel and that survive a restart – a key and a
 * text value per row (utils/settings.js). First one: the Discord invite link (`discordInvite`).
 */
exports.up = async db => {
    await db.query(`CREATE TABLE IF NOT EXISTS settings (
        key varchar(60) PRIMARY KEY,
        value text,
        "updatedBy" varchar(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
};
