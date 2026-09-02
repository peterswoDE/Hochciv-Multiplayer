/**
 * Engine Adapter – loads the Hochciv game engine in Node.js and wraps it
 * for server-side authoritative state management.
 *
 * The original JS files use global scope.  We eval them inside a shared
 * sandbox so they can see each other's globals (TERRAIN, TECHS, neighbors, …).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Build the engine sandbox ─────────────────────────────────────────────────

const FILES = ['data.js', 'civs.js', 'i18n.js', 'hex.js', 'tiles.js', 'engine.js', 'expansion.js', 'bots.js'];

// The sandbox shares a single global object so every file can see the
// constants and functions defined by the previous one – just like a browser.
const sandbox = {
    console, Math, JSON, Set, Map, Array, Object, Number,
    String, Infinity, parseInt, parseFloat, isNaN, isFinite,
    Error, TypeError, RangeError, RegExp, Date, Symbol,
    setTimeout, clearTimeout, setInterval, clearInterval,
    T: function (str, ...args) {
        let out = str;
        args.forEach(a => { if (out && out.replace) out = out.replace('%s', a); });
        return out;
    }
};
vm.createContext(sandbox);

let isLoaded = false;
let lastMtime = 0;

function checkUpdateTrigger() {
    try {
        const triggerPath = path.resolve(__dirname, '.update_trigger');
        if (fs.existsSync(triggerPath)) {
            const stat = fs.statSync(triggerPath);
            if (stat.mtimeMs > lastMtime) {
                lastMtime = stat.mtimeMs;
                console.log('[Engine Adapter] .update_trigger modified, forcing engine reload.');
                isLoaded = false;
            }
        }
    } catch (err) {}
}

function resolveEngineDir() {
    let dir = path.resolve(__dirname, 'public', 'js');
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'engine.js'))) {
        return dir;
    }
    dir = path.resolve(__dirname, 'public_bundled', 'js');
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'engine.js'))) {
        return dir;
    }
    dir = path.resolve(__dirname, '..', 'Hochciv', 'js');
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'engine.js'))) {
        return dir;
    }
    return null;
}

function ensureEngineLoaded() {
    checkUpdateTrigger();
    if (isLoaded) return true;
    const dir = resolveEngineDir();
    if (!dir) {
        return false;
    }
    try {
        for (const file of FILES) {
            const filePath = path.join(dir, file);
            if (!fs.existsSync(filePath)) return false;
            const code = fs.readFileSync(filePath, 'utf8');
            vm.runInContext(code, sandbox, { filename: file });
        }
        isLoaded = true;

        // Expose CIVS and other consts directly into sandbox if needed
        try {
            sandbox.CIVS = vm.runInContext('CIVS', sandbox);
            sandbox.APP_VERSION = vm.runInContext('typeof APP_VERSION !== "undefined" ? APP_VERSION : "Unknown"', sandbox);
            sandbox.victoryScore = vm.runInContext('typeof victoryScore === "function" ? victoryScore : null', sandbox);
        } catch (e) { }

        console.log(`[Engine Adapter] Loaded Hochciv game engine from ${dir}`);
        return true;
    } catch (err) {
        console.error(`[Engine Adapter] Error loading game engine from ${dir}:`, err);
        return false;
    }
}

// Attempt initial load
ensureEngineLoaded();

// ── Expose engine functions ──────────────────────────────────────────────────

const E = sandbox;   // shorthand

/**
 * Create a new game from the lobby configuration.
 * @param {object} session – the session object from sessions.js
 * @returns {object} The game state S
 */
function createGame(session) {
    if (!ensureEngineLoaded()) {
        throw new Error('Game Engine ist noch nicht bereit (Frontend-Dateien fehlen). Bitte kurz warten.');
    }
    const cfg = session.gameConfig || {};

    // Build the players array from session.players (lobby order)
    const players = session.players.map(p => ({
        civ: p.civ,
        kind: p.kind || 'human',
        ability: p.ability || 'basis',
        name: p.name || null,
        diff: cfg.difficulty || 'prinz',
    }));

    // Fill remaining slots with bots
    const allCivs = ['russland', 'griechenland', 'england', 'wikinger'];
    const taken = new Set(players.map(p => p.civ));
    if (!cfg.duel) {
        for (const civ of allCivs) {
            if (!taken.has(civ)) {
                players.push({
                    civ, kind: 'bot', ability: 'basis',
                    diff: cfg.difficulty || 'prinz'
                });
            }
        }
    }

    // Determine map
    // Determine map
    let map;
    if (cfg.map) {
        map = cfg.map; // Honor map passed from interactive placement or custom setup
    } else if (cfg.duel && players.length === 2) {
        map = E.duelMap(players[0].civ, players[1].civ, cfg.seed);
    } else if (cfg.mapKey === 'gross') {
        map = JSON.parse(JSON.stringify(vm.runInContext('MAP_GROSS', sandbox)));
    } else if (cfg.customMap) {
        map = JSON.parse(JSON.stringify(cfg.customMap));
    } else {
        map = JSON.parse(JSON.stringify(vm.runInContext('DEFAULT_MAP', sandbox)));
    }

    const gameCfg = {
        players,
        map,
        seed: cfg.seed,
        duel: !!cfg.duel,
        events: !!cfg.events,
        eventMode: cfg.eventMode || 'hard',
        wonders: !!cfg.wonders,
        startPlayer: cfg.startPlayer ?? 0,
    };

    return E.newGame(gameCfg);
}

// ── Action dispatch ──────────────────────────────────────────────────────────

/**
 * Validate and apply a player action on the authoritative state.
 * @param {object} state   – the current game state S
 * @param {number} pi      – player index claiming to act
 * @param {string} action  – action type key
 * @param {object} params  – action-specific parameters
 * @param {function} onStateChanged - callback for async state changes
 * @returns {string|null}  error message or null on success
 */
function applyAction(state, pi, action, params, onStateChanged) {
    if (!ensureEngineLoaded()) return 'Game Engine ist noch nicht bereit (Frontend-Dateien fehlen).';
    // Only the current player may act
    if (state.cur !== pi) return 'Du bist nicht am Zug.';
    if (state.over) return 'Das Spiel ist vorbei.';
    // Bots are not controllable
    if (state.players[pi].kind === 'bot') return 'Bot-Spieler werden automatisch gesteuert.';

    try {
        switch (action) {
            // ── Research ──────────────────────────────────────────────
            case 'research':
                return E.doResearch(state, pi, params.tech);

            case 'freeTech':
                return E.useFreeTech(state, pi, params.tech);

            case 'freePick':
                return E.useFreePick(state, pi, params.tech);

            case 'backPick':
                return E.useBackPick(state, pi, params.tech);

            case 'copyTech':
                return E.copyTech(state, pi, params.tech, params.mode);

            // ── Cities ────────────────────────────────────────────────
            case 'foundCity':
                return E.foundCity(state, pi, params.r, params.c);

            case 'growCity': {
                const city = state.cities.find(c => c.id === params.cityId);
                if (!city) return 'Stadt nicht gefunden.';
                return E.growCity(state, pi, city, params.mode);
            }

            case 'sacrifice': {
                const city = state.cities.find(c => c.id === params.cityId);
                if (!city) return 'Stadt nicht gefunden.';
                return E.sacrifice(state, pi, city);
            }

            // ── Armies ────────────────────────────────────────────────
            case 'buildArmy': {
                const city = state.cities.find(c => c.id === params.cityId);
                if (!city) return 'Stadt nicht gefunden.';
                return E.buildArmy(state, pi, city);
            }

            case 'moveArmy': {
                const army = state.armies.find(a => a.id === params.armyId);
                if (!army) return 'Armee nicht gefunden.';
                if (army.owner !== pi) return 'Nicht deine Armee.';
                return E.moveArmy(state, army, params.r, params.c);
            }

            // ── Economy ───────────────────────────────────────────────
            case 'buyPower':
                return E.buyPower(state, pi, params.n || 1);

            case 'buildRoad':
                return E.buildRoad(state, pi, params.r, params.c, params.target);

            case 'buyTile':
                return E.buyTile(state, pi, params.r, params.c);

            case 'coverPop':
                return E.coverPop(state, pi, params.kind, params.amount);

            case 'uncoverPop':
                return E.uncoverPop(state, pi, params.kind, params.amount);

            // ── Wonders ───────────────────────────────────────────────
            case 'buildWonder': {
                const city = state.cities.find(c => c.id === params.cityId);
                if (!city) return 'Stadt nicht gefunden.';
                return E.buildWonder(state, pi, city, params.wonder);
            }

            // ── Combat ────────────────────────────────────────────────
            case 'nuke':
                return E.nuke(state, pi, params.r, params.c);

            // ── Turn ──────────────────────────────────────────────────
            case 'endTurn':
                E.endTurn(state);
                // Auto-play bot turns
                runBots(state, onStateChanged);
                return null;

            default:
                return `Unbekannte Aktion: ${action}`;
        }
    } catch (err) {
        console.error(`[Engine] Ausnahme bei Aktion '${action}' von PI ${pi}:`, err);
        return 'Server-Fehler bei der Ausführung.';
    }
}

/**
 * After a human ends their turn, auto-play all consecutive bot turns asynchronously.
 */
function runBots(state, onStateChanged) {
    if (!E.botTurn) return;
    const processBots = async () => {
        let guard = 0;
        while (!state.over && state.players[state.cur].kind === 'bot' && guard < 50) {
            await new Promise(resolve => setImmediate(resolve));
            if (state.over || state.players[state.cur].kind !== 'bot') break;
            
            E.botTurn(state, state.cur);
            E.endTurn(state);
            guard++;
            
            if (onStateChanged) {
                onStateChanged(state);
            }
        }
    };
    processBots().catch(err => console.error('[Engine Adapter] Bot run error:', err));
}

/**
 * Return a sanitised copy of the state for a specific player.
 * Currently sends the full state (the board game has no hidden info
 * beyond dice-roll results, which are seeded).
 */
function stateForPlayer(state, _pi) {
    // Full state – the client needs everything to render.
    // Deep-clone so mutations don't leak.
    return JSON.parse(JSON.stringify(state));
}

module.exports = { createGame, applyAction, stateForPlayer, getEngine: () => E };
