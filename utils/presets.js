/**
 * Lobby presets (F25): a host keeps lobby settings under a name with the account and loads them
 * in a live lobby or the "Neues Rundenspiel" form (client/presets.js). Stored in
 * users.lobbyPresets, read and written through GET/PUT /api/account/presets (routes/account.js).
 *
 *   preset = { name, s: { map: '0' | 'tiles' | 'marathon' | 'eigene', customName, hexTiles,
 *                         events, eventMode, wonders, total, ki, randomCivs, difficulty,
 *                         turnTime (live, seconds), turnDays (Rundenspiel), playerBots,
 *                         playerBotLimit, isPublic, ranked } }
 *
 * One preset serves both kinds of game: a value only one of them knows (turnTime / turnDays)
 * stays when the other saves over it. The settings are only stored here – a lobby still checks
 * them when they are applied (sockets/game.js lobby:config, async/logic.js create).
 */
const MAX = 10;
const NAME_MAX = 40;
const MAPS = ['0', 'tiles', 'marathon', 'eigene'];
const TURN_TIMES = [0, 60, 120, 180, 300, 600];
const TURN_DAYS = [1, 3, 7];

const bool = v => (typeof v === 'boolean' ? v : undefined);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const str = (v, max, re) => (typeof v === 'string' && v.length && v.length <= max && (!re || re.test(v)) ? v : undefined);

/** Only the known settings, each in range; anything else is dropped. */
function cleanSettings(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return {};
    const out = {
        map: MAPS.includes(s.map) ? s.map : undefined,
        customName: s.map === 'eigene' ? str(s.customName, 60) : undefined,
        hexTiles: bool(s.hexTiles),
        events: bool(s.events),
        eventMode: s.eventMode === 'easy' || s.eventMode === 'hard' ? s.eventMode : undefined,
        wonders: bool(s.wonders),
        total: int(s.total, 2, 8),
        ki: int(s.ki, 0, 7),
        randomCivs: bool(s.randomCivs),
        difficulty: str(s.difficulty, 20, /^[a-z0-9_-]+$/i),
        turnTime: TURN_TIMES.includes(s.turnTime) ? s.turnTime : undefined,
        turnDays: TURN_DAYS.includes(s.turnDays) ? s.turnDays : undefined,
        playerBots: bool(s.playerBots),
        playerBotLimit: s.playerBotLimit === null ? null : int(s.playerBotLimit, 1, 8),
        isPublic: bool(s.isPublic),
        ranked: bool(s.ranked),
    };
    Object.keys(out).forEach(k => out[k] === undefined && delete out[k]);
    return out;
}

/** A list from the client: names trimmed and unique (the last one wins), at most MAX. */
function cleanList(list) {
    if (!Array.isArray(list)) return null;
    const byName = new Map();
    for (const p of list) {
        if (!p || typeof p !== 'object') continue;
        const name = typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
        if (!name) continue;
        byName.delete(name);
        byName.set(name, { name, s: cleanSettings(p.s) });
    }
    const out = [...byName.values()];
    return out.length > MAX ? null : out;
}

module.exports = { cleanList, cleanSettings, MAX, NAME_MAX };
