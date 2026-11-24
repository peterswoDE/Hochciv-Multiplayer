/**
 * Nation names in both languages for the game lists (profile, account history, admin) – the
 * stored participants only carry the civ key ("griechenland"). The names come from the current
 * game (utils/gamestats.js names(): ALL_CIVS and DATA_EN), the key stands in for an unknown one.
 *
 *   label(key)        – { de, en } (both the key if unknown, both null without a key)
 *   withNames(game)   – plain copy of a Game with civDe/civEn on each participant
 */
const GameStats = require('./gamestats');

function label(key) {
    if (!key) return { de: null, en: null };
    let row = null;
    try { row = GameStats.names().civ[key]; } catch (_) { /* no engine: the key */ }
    return row ? { de: row[0], en: row[1] || row[0] } : { de: key, en: key };
}

function withNames(game) {
    const g = game && typeof game.toJSON === 'function' ? game.toJSON() : { ...game };
    g.participants = (g.participants || []).map(p => {
        const l = label(p.civ);
        return { ...p, civDe: l.de, civEn: l.en };
    });
    return g;
}

module.exports = { label, withNames };
