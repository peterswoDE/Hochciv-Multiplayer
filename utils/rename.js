/**
 * Account deletion: a player's name out of a game state – in every text of it: the player's
 * name, the log ("Kampf um Xs Stadt"), the result ("Hauptstadt von X erobert"), … Used for the
 * running Rundenspiel (async/logic.js removeUser) and its replay frames (utils/replay.js).
 */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `S` (changed in place) with every `from` renamed to `to`. */
function renameInState(S, from, to) {
    if (!from) return S;
    // the whole name, also in the genitive ("Wolframs Stadt"), not inside a longer word
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escRe(from)}(?=s?(?:[^\\p{L}\\p{N}_]|$))`, 'gu');
    const walk = v => {
        if (typeof v === 'string') return v.includes(from) ? v.replace(re, `$1${to}`) : v;
        if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
        if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
        return v;
    };
    return walk(S);
}

module.exports = { renameInState };
