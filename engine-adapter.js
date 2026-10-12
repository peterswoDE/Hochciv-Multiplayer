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

// Same order as the <script> tags in Hochciv's index.html (minus the DOM-only tutorial.js/ui.js).
// ki.js (KI players, kiPlaceSeat) and marathon.js (v83) are pure rule code and must be loaded too.
const FILES = ['data.js', 'civs.js', 'i18n.js', 'hex.js', 'tiles.js', 'engine.js', 'expansion.js', 'bots.js', 'ki.js', 'marathon.js'];
const OPTIONAL_FILES = new Set(['ki.js', 'marathon.js']);

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
            if (!fs.existsSync(filePath)) {
                if (OPTIONAL_FILES.has(file)) continue; // older Hochciv versions
                return false;
            }
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
    const players = buildPlayers(session);

    // Fill remaining slots with bots (only if the lobby has fewer than 4 seats; the
    // socket layer normally fills the lobby up to 4 already). Never add a 5th player –
    // on tile maps the same civ may appear twice, so "missing civs" is not a criterion.
    const allCivs = ['russland', 'griechenland', 'england', 'wikinger'];
    const taken = new Set(players.map(p => p.civ));
    if (!cfg.duel) {
        for (const civ of allCivs) {
            if (players.length >= 4) break;
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
    } else if (cfg.duel && players.length === 2 && typeof E.duelMap === 'function') {
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
        // Marathon (v83): bigger tech costs; the map and drafted abilities come from the draft
        marathon: !!cfg.marathon,
    };
    // Tile maps (v66+) and Marathon: starting techs / wonder pools were rolled BEFORE
    // placement / the draft (rollSetup) so players could see them. Reuse that roll.
    if (cfg.setup) {
        if (cfg.setup.avail) gameCfg.avail = cfg.setup.avail;
        if (cfg.setup.wpool) gameCfg.wpool = cfg.setup.wpool;
    }

    return E.newGame(gameCfg);
}

/**
 * Players array for newGame() from session.players (lobby order).
 * IMPORTANT: newGame() stores the position in this array as `slot` on every state
 * player. Tile maps (Plättchen) and Marathon maps place capitals by slot, and the server
 * maps lobby players to state players by slot – so the order here must equal lobby order.
 */
function buildPlayers(session) {
    const cfg = session.gameConfig || {};
    return session.players.map(p => {
        const pc = {
            civ: p.civ,
            kind: p.kind || 'human',
            ability: p.ability || 'basis',
            // Humans keep their player name; bots show the nation name (or "England II").
            name: (p.kind || 'human') === 'human' ? (p.name || null) : null,
            roman: p.roman || null,
            color: p.color || null,
            diff: cfg.difficulty || 'prinz',
        };
        // Marathon: the two abilities chosen in the draft replace the lobby ability
        if (cfg.marathon && Array.isArray(p.drafted)) pc.drafted = p.drafted.slice();
        return pc;
    });
}

// ── Marathon (v83): map, starting techs and ability draft ────────────────────
// Mirrors startMarathon()/draftAdvance()/draftGo() in Hochciv's ui.js, but the server
// holds the draft: { V: preview state without abilities, D: pool / order / picks }.
// D.picks and D.order use indices into V.players (turn order), not lobby seats.

function marathonAvailable() {
    return ensureEngineLoaded() && typeof E.marathonMap === 'function' && typeof E.draftNew === 'function';
}

const draftCurrent = D => D.at < D.order.length ? D.order[D.at] : null;
const draftDone = D => D.at >= D.order.length;

/** Generate the map, roll starting techs and open the draft. Stores it on session.draft. */
function startDraft(session) {
    if (!marathonAvailable()) throw new Error('Diese Hochciv-Version kennt den Marathon noch nicht.');
    const cfg = session.gameConfig;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const base = {
        players: buildPlayers(session),
        map: E.marathonMap(seed),
        seed, marathon: true,
        events: !!cfg.events, eventMode: cfg.eventMode || 'hard',
        wonders: !!cfg.wonders,
        startPlayer: cfg.startPlayer ?? 0,
    };
    const setup = E.rollSetup(base);
    base.avail = setup.avail; base.wpool = setup.wpool;
    const V = E.draftView(base);                 // the same game, still without abilities
    const D = E.draftNew(V, seed + 1);

    // createGame() later starts the real game with exactly this map and these rolls
    Object.assign(cfg, { seed, marathon: true, map: base.map, setup });
    session.players.forEach(p => { delete p.drafted; });
    session.draft = { V, D };
    advanceDraft(session);
}

/** KI seats pick immediately when it is their turn (bots do not draft). */
function advanceDraft(session) {
    const { V, D } = session.draft;
    while (!draftDone(D) && V.players[draftCurrent(D)].kind === 'ki') {
        const pi = draftCurrent(D);
        E.draftPick(D, pi, E.kiDraftPick(V, D, pi));
    }
}

/** A lobby player picks ability `id`. Returns an error message or null. */
function draftPick(session, lobbyIndex, id) {
    if (!session.draft) return 'Kein Draft aktiv.';
    const { V, D } = session.draft;
    const vi = stateIndexOf(V, lobbyIndex, session.players[lobbyIndex]);
    if (vi === -1 || draftCurrent(D) !== vi) return 'Du bist nicht am Zug.';
    const err = E.draftPick(D, vi, String(id));
    if (err) return err;
    advanceDraft(session);
    return null;
}

function isDraftDone(session) {
    return !!session.draft && draftDone(session.draft.D);
}

/** Hand the drafted abilities to the lobby players and create the real game. */
function finishDraft(session) {
    const { V, D } = session.draft;
    V.players.forEach((p, i) => {
        if (p.kind !== 'bot' && session.players[p.slot]) session.players[p.slot].drafted = D.picks[i].slice();
    });
    const state = createGame(session);
    session.draft = null;
    return state;
}

/** What the clients need to draw the draft screen (deep copy). */
function draftPayload(session) {
    if (!session.draft) return null;
    return JSON.parse(JSON.stringify({ V: session.draft.V, D: session.draft.D }));
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
    // Bots / KI are not controllable
    if (isAutoPlayer(state.players[pi])) return 'Bot-Spieler werden automatisch gesteuert.';

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
            case 'endTurn': {
                // v80+: an army still standing in a city blocks the end of the turn.
                if (typeof E.blockingIssues === 'function') {
                    const stop = E.blockingIssues(state, pi);
                    if (stop && stop.length) return stop[0];
                }
                E.endTurn(state);
                // Auto-play bot turns
                runBots(state, onStateChanged);
                return null;
            }

            default:
                return `Unbekannte Aktion: ${action}`;
        }
    } catch (err) {
        console.error(`[Engine] Ausnahme bei Aktion '${action}' von PI ${pi}:`, err);
        return 'Server-Fehler bei der Ausführung.';
    }
}

/** Bots (bot rules) and KI players (human rules, js/ki.js) both move on their own. */
function isAutoPlayer(p) {
    if (typeof E.isAuto === 'function') return E.isAuto(p);
    return !!p && (p.kind === 'bot' || p.kind === 'ki');
}

/**
 * After a human ends their turn, auto-play all consecutive bot / KI turns asynchronously.
 * Mirrors runBots()/afterAutoTurn() in Hochciv's ui.js: move, finishTurn (combat +
 * victory check), advanceTurn.
 */
function runBots(state, onStateChanged) {
    if (!E.botTurn) return;
    const processBots = async () => {
        let guard = 0;
        while (!state.over && isAutoPlayer(state.players[state.cur]) && guard < 50) {
            await new Promise(resolve => setImmediate(resolve));
            if (state.over || !isAutoPlayer(state.players[state.cur])) break;

            const p = state.players[state.cur];
            try {
                if (p.kind === 'ki' && typeof E.kiTurn === 'function') E.kiTurn(state, state.cur);
                else E.botTurn(state, state.cur);
            } catch (err) {
                console.error(`[Engine Adapter] ${p.kind} turn failed for player ${state.cur}:`, err);
            }
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
 * Map a lobby seat (index in session.players) to the index in state.players.
 * newGame() sorts players into turn order and records the original seat as `slot`.
 */
function stateIndexOf(state, lobbyIndex, lobbyPlayer) {
    if (!state || !state.players) return -1;
    let i = state.players.findIndex(p => p.slot === lobbyIndex);
    if (i === -1 && lobbyPlayer) i = state.players.findIndex(p => p.civ === lobbyPlayer.civ); // pre-v66 states
    return i;
}

/** Roll starting techs / wonder pools for a tile-map game before placement (v66+). */
function rollSetup(session, seed) {
    if (!ensureEngineLoaded() || typeof E.rollSetup !== 'function') return null;
    const cfg = session.gameConfig || {};
    return E.rollSetup({
        players: session.players.map(p => ({ civ: p.civ, kind: p.kind || 'human', ability: p.ability || 'basis' })),
        seed, wonders: !!cfg.wonders, events: !!cfg.events, eventMode: cfg.eventMode || 'hard',
    });
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

module.exports = {
    createGame, applyAction, stateForPlayer, stateIndexOf, rollSetup,
    marathonAvailable, startDraft, draftPick, isDraftDone, finishDraft, draftPayload,
    getEngine: () => E,
};
