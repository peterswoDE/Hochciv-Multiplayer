/**
 * Server settings an admin sets in the admin panel (routes/admin.js GET/POST /settings), stored
 * in the `settings` table (models/Setting.js) so they survive a restart. Kept in memory after the
 * first read; a write updates the table and the copy in memory.
 *
 *   get(key)                 – the value, or null
 *   set(key, value, by)      – store (null / '' removes it); value checked by its key's rule
 *   publicSettings()         – what every page may know (GET /api/settings)
 *
 * Settings:
 *   discordInvite – the Discord server's invite link, shown in the game's main menu and the
 *                   footers (mp.js, client/index.html); stored as https://discord.gg/<code>
 */
const { Setting } = require('../models');

/** A Discord invite in any of its usual spellings → https://discord.gg/<code>, or null. */
function discordInvite(v) {
    const m = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/i.exec(String(v).trim());
    return m ? 'https://discord.gg/' + m[1] : null;
}

// key → function that returns the value to store, or null if it is not valid
const RULES = {
    discordInvite,
};
const ERRORS = {
    discordInvite: 'Kein gültiger Discord-Einladungslink (z. B. https://discord.gg/abc123).',
};

let cache = null;
async function load() {
    if (cache) return cache;
    const rows = await Setting.findAll();
    cache = new Map(rows.map(r => [r.key, r.value]));
    return cache;
}

async function get(key) {
    const c = await load();
    return c.has(key) ? c.get(key) : null;
}

/** @returns {{ value: string|null } | { error: string }} */
async function set(key, value, by) {
    if (!RULES[key]) return { error: 'Unbekannte Einstellung.' };
    const c = await load();
    if (value == null || String(value).trim() === '') {
        await Setting.destroy({ where: { key } });
        c.delete(key);
        return { value: null };
    }
    const clean = RULES[key](value);
    if (clean == null) return { error: ERRORS[key] || 'Ungültiger Wert.' };
    await Setting.upsert({ key, value: clean, updatedBy: by || null });
    c.set(key, clean);
    return { value: clean };
}

async function publicSettings() {
    return { discordInvite: await get('discordInvite') };
}

/** For tests: forget the copy in memory. */
function reset() { cache = null; }

module.exports = { get, set, publicSettings, discordInvite, reset, KEYS: Object.keys(RULES) };
