exports.up = async db => {
    await db.query('ALTER TABLE users ADD COLUMN "arenaLadderOptIn" boolean NOT NULL DEFAULT false');
};
