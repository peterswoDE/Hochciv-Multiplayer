/**
 * Engine Adapter – loads the Hochciv game engine in Node.js and wraps it
 * for server-side authoritative state management.
 *
 * The original JS files use global scope.  We eval them inside a shared
 * sandbox so they can see each other's globals (TERRAIN, TECHS, neighbors, …).
 *
 * The game ships with this repository (no download): HochCiv/ is the current version,
 * HochCiv-v93/, HochCiv-v88/ and HochCiv-v83/ versions deployed before it. Every version gets its own sandbox
 * (makeAdapter). Live games and new Rundenspiele use the current one; Rundenspiele that were
 * started on an older version keep playing with its rules (forVersion, async/logic.js).
 * This module itself is the adapter of the current version, as before.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Build the engine sandbox ─────────────────────────────────────────────────

// Same order as the <script> tags in Hochciv's index.html (minus the DOM-only tutorial.js/ui.js).
// ki.js (KI players, kiPlaceSeat) and marathon.js (v83) are pure rule code and must be loaded too.
const FILES = ['data.js', 'civs.js', 'i18n.js', 'hex.js', 'tiles.js', 'engine.js', 'expansion.js', 'bots.js', 'ki.js', 'marathon.js'];
const OPTIONAL_FILES = new Set(['ki.js', 'marathon.js']);

/* Older versions stay as long as Rundenspiele started on them are running – remove an entry
   (and its folder, scripts/build-public.js, OLD_VERSIONS in mp.js) once none is left. */
const GAME_DIRS = {
    current: path.resolve(__dirname, 'HochCiv', 'js'),
    v93: path.resolve(__dirname, 'HochCiv-v93', 'js'),
    v88: path.resolve(__dirname, 'HochCiv-v88', 'js'),
    v83: path.resolve(__dirname, 'HochCiv-v83', 'js'),
};
const OLD_VERSIONS = Object.keys(GAME_DIRS).filter(v => v !== 'current');
// Rundenspiele from before the version was recorded were started on v83
const LEGACY_VERSION = 'v83';

function makeAdapter(engineDir, label) {
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

    function ensureEngineLoaded() {
        if (isLoaded) return true;
        const dir = engineDir;
        if (!fs.existsSync(path.join(dir, 'engine.js'))) {
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

            console.log(`[Engine Adapter] Loaded Hochciv game engine ${label} from ${dir}`);
            return true;
        } catch (err) {
            console.error(`[Engine Adapter] Error loading game engine ${label} from ${dir}:`, err);
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

        /* Fill up to the number of empires with KI players. The lobby layer does that already
           (sockets/game.js, async/logic.js); this is the safety net. playerCount is the
           number in all; older configs: 4, or exactly the lobby without KI / in a duel. Fixed
           maps take the nations nobody has, the others any nation (also twice). */
        const want = cfg.playerCount || (cfg.duel || cfg.noKi ? players.length : 4);
        const allCivs = (E.CIVS || []).map(c => c.k);
        const freeMap = cfg.mapKey === 'eigene' || cfg.mapKey === 'plaettchen' || cfg.mapKey === 'random';
        for (let i = 0; players.length < want && i < 64; i++) {
            const free = allCivs.filter(c => !players.some(p => p.civ === c));
            if (!free.length && !freeMap) break;
            const civ = free.length ? free[0] : allCivs[i % allCivs.length];
            players.push({ civ, kind: 'ki', ability: randomAbility(civ), kiLevel: kiLevelFor(cfg.difficulty) });
        }

        // Determine map
        let map;
        if (cfg.map) {
            map = cfg.map; // Honor map passed from interactive placement or custom setup
        } else if (cfg.duel && players.length === 2 && typeof E.duelMap === 'function') {
            map = E.duelMap(players[0].civ, players[1].civ, cfg.seed);
        } else if (cfg.mapKey === 'gross') {
            map = JSON.parse(JSON.stringify(vm.runInContext('MAP_GROSS', sandbox)));
        } else if (cfg.mapKey === 'eigene' || cfg.customMap) {
            // Custom map from the host's map library: checked again – it came from a client.
            // Its start points become the capitals of this many empires (mapForPlayers).
            map = customPlayMap(cfg, players.length);
        } else {
            map = JSON.parse(JSON.stringify(vm.runInContext('DEFAULT_MAP', sandbox)));
        }

        const gameCfg = {
            players,
            map,
            seed: cfg.seed,
            duel: !!cfg.duel || players.length === 2,
            events: !!cfg.events,
            eventMode: cfg.eventMode || 'hard',
            wonders: !!cfg.wonders,
            startPlayer: cfg.startPlayer ?? 0,
            // Marathon (v83): bigger tech costs; the map and drafted abilities come from the draft
            marathon: !!cfg.marathon || !!(cfg.mapKey === 'eigene' && cfg.customMap && cfg.customMap.marathon),
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
                // Humans keep their player name; bots and KI show the nation name (or "England II").
                name: (p.kind || 'human') === 'human' ? (p.name || null) : null,
                roman: p.roman || null,
                color: p.color || null,
                diff: cfg.difficulty || 'prinz',
            };
            if (p.kind === 'ki') pc.kiLevel = p.kiLevel || kiLevelFor(cfg.difficulty);
            // Marathon: the two abilities chosen in the draft replace the lobby ability
            if (cfg.marathon && Array.isArray(p.drafted)) pc.drafted = p.drafted.slice();
            return pc;
        });
    }

    // ── Marathon (v83): map, starting techs and ability draft ────────────────────
    // Mirrors startMarathon()/draftAdvance()/draftGo() in Hochciv's ui.js, but the server
    // holds the draft: { V: preview state without abilities, D: pool / order / picks }.
    // D.picks and D.order use indices into V.players (turn order), not lobby seats.

    /** The play map of a custom map for n empires (checked again, start points by seat). */
    function customPlayMap(cfg, n) {
        const r = checkCustomMap(cfg.customMap);
        if (r.error) throw new Error('Eigene Karte: ' + r.error);
        if (typeof E.mapForPlayers !== 'function') throw new Error('Diese Hochciv-Version kennt keine eigenen Karten.');
        if (!Number.isInteger(cfg.seed)) cfg.seed = Math.floor(Math.random() * 2 ** 31);
        const map = E.mapForPlayers(r.map, n, cfg.seed);
        if (!map) throw new Error(`Die Karte hat nur ${r.map.spawns.length} Startpunkte.`);
        return map;
    }

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
        const players = buildPlayers(session);
        const base = {
            players,
            // the standard Marathon map – or a custom map set to the marathon rules
            map: cfg.mapKey === 'eigene' && cfg.customMap
                ? customPlayMap(Object.assign({}, cfg, { seed }), players.length) : E.marathonMap(seed),
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
    /**
     * The engine was written for a trusted local client. Over the network every parameter
     * must be a plain value: keys are short identifiers (never __proto__ & co.), counts are
     * small positive integers, coordinates/ids are finite numbers.
     */
    const KEY_PARAMS = ['tech', 'mode', 'kind', 'wonder'];
    const COUNT_PARAMS = ['n', 'amount'];
    const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
    function checkParams(params) {
        for (const [k, v] of Object.entries(params)) {
            if (v === null || v === undefined || typeof v === 'boolean') continue;
            if (KEY_PARAMS.includes(k)) {
                if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(v) || FORBIDDEN_KEYS.has(v)) return `Ungültiger Parameter: ${k}`;
            } else if (COUNT_PARAMS.includes(k)) {
                if (!Number.isInteger(v) || v < 1 || v > 100000) return `Ungültiger Parameter: ${k}`;
            } else if (typeof v === 'number') {
                if (!Number.isFinite(v)) return `Ungültiger Parameter: ${k}`;
            } else if (typeof v !== 'string' || v.length > 100 || FORBIDDEN_KEYS.has(v)) {
                return `Ungültiger Parameter: ${k}`;
            }
        }
        return null;
    }

    function applyAction(state, pi, action, params, onStateChanged) {
        if (!ensureEngineLoaded()) return 'Game Engine ist noch nicht bereit (Frontend-Dateien fehlen).';
        if (typeof action !== 'string') return 'Ungültige Aktion.';
        params = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
        const paramErr = checkParams(params);
        if (paramErr) return paramErr;
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

    /**
     * Level of a computer seat. Multiplayer fills empty seats with KI players; `difficulty`
     * holds a KI level (leicht/mittel/schwer). Configs from before that still carry a bot
     * difficulty – mapped as calibrated in data.js (KI_LEVELS): Leicht ≈ Prinz, Mittel ≈ König,
     * Schwer ≈ David.
     */
    const BOT_DIFF_TO_KI = { siedler: 'leicht', haeuptling: 'leicht', prinz: 'leicht', koenig: 'mittel', david: 'schwer' };
    function kiLevelFor(difficulty) {
        const levels = (engineConst('KI_LEVELS') || []).map(l => l.k);
        if (levels.includes(difficulty)) return difficulty;
        return BOT_DIFF_TO_KI[difficulty] || engineConst('KI_DEFAULT_LEVEL') || 'mittel';
    }

    /** A random ability of `civ` – KI players get one like humans (bots play without). */
    function randomAbility(civ) {
        const def = (engineConst('CIVS') || []).find(c => c.k === civ);
        const list = def && def.abilities && def.abilities.length ? def.abilities : [{ k: 'basis' }];
        return list[Math.floor(Math.random() * list.length)].k;
    }

    /**
     * A custom map (map editor, "Meine Karten") checked by the engine's own rule (checkCustomMap
     * in engine.js): { map } – a clean copy with name, rows and capitals only – or { error }.
     */
    function checkCustomMap(m) {
        if (!ensureEngineLoaded() || typeof E.checkCustomMap !== 'function')
            return { error: 'Diese Hochciv-Version kennt keine eigenen Karten.' };
        try { return E.checkCustomMap(m); } catch { return { error: 'Das ist keine Karte.' }; }
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
     * Duplicate civs (tile maps): "England I/II" and a free colour for the second one.
     * Mutates the lobby-style players ({ civ, roman, color, mappedName }).
     */
    function assignDoubles(players) {
        const CIVS = E.CIVS || [];
        if (typeof E.markDoubles === 'function') {
            // up to eight empires – Roman numerals and colours from the engine (markDoubles)
            E.markDoubles(players);
            players.forEach(p => {
                delete p.mappedName;
                const civ = CIVS.find(c => c.k === p.civ);
                if (p.roman && civ) p.mappedName = `${civ.n} ${p.roman}`;
            });
            return;
        }
        const zaehler = {};
        players.forEach(p => { zaehler[p.civ] = (zaehler[p.civ] || 0) + 1; });
        const belegt = new Set();
        players.forEach(p => { if (!belegt.has(p.civ)) { belegt.add(p.civ); p.colorOf = p.civ; } });
        players.forEach(p => {
            if (p.colorOf) return;
            const frei = CIVS.map(c => c.k).find(k => !belegt.has(k)) || p.civ;
            belegt.add(frei); p.colorOf = frei;
        });
        const lauf = {};
        const ROMAN = ['I', 'II', 'III', 'IV'];
        players.forEach(p => {
            const civ = CIVS.find(c => c.k === p.civ);
            p.color = p.colorOf === p.civ ? null : (CIVS.find(c => c.k === p.colorOf) || {}).color;
            delete p.colorOf;
            p.roman = null; delete p.mappedName;
            if (zaehler[p.civ] > 1 && civ) {
                const k = lauf[p.civ] = (lauf[p.civ] || 0) + 1;
                p.roman = ROMAN[k - 1] || String(k);
                p.mappedName = `${civ.n} ${p.roman}`;
            }
        });
    }

    // ── Asynchronous games (play by turn) ────────────────────────────────────────
    // The engine runs a turn as finishTurn → advanceTurn (→ beginTurn of the next player).
    // An async game may have to wait for a seat nobody has claimed yet. It waits BEFORE that
    // seat's beginTurn, so a late joiner's ability already counts for its first income.

    /** A constant declared with const/let in the engine files (not visible on the sandbox). */
    function engineConst(name) {
        ensureEngineLoaded();
        return vm.runInContext(`typeof ${name} !== 'undefined' ? ${name} : undefined`, sandbox);
    }

    /** Lobby slots in turn order, starting with `startSlot` – the same sort as newGame(). */
    function turnOrderSlots(civs, startSlot) {
        const ORDER = engineConst('ORDER') || [];
        const slots = civs.map((_, i) => i).sort((a, b) => ORDER.indexOf(civs[a]) - ORDER.indexOf(civs[b]));
        const k = Math.max(0, slots.indexOf(startSlot));
        return slots.slice(k).concat(slots.slice(0, k));
    }

    /** Index of the player advanceTurn() would move to (skips eliminated players). */
    function peekNext(S) {
        let i = S.cur, guard = 0;
        do { i = (i + 1) % S.players.length; guard++; } while (S.players[i].dead && guard < 20);
        return i;
    }

    /** advanceTurn() without the beginTurn() of the next player (round change etc. included). */
    function advanceWithoutBegin(S) {
        const begin = sandbox.beginTurn;
        sandbox.beginTurn = () => {};
        try { E.advanceTurn(S); } finally { sandbox.beginTurn = begin; }
    }

    /**
     * A seat claimed after newGame() gets its ability now. Only valid while the seat has not
     * had a turn yet. Redoes what newGame() derives from the ability: Siedlertrecks (capital
     * starts with 2 pop) and the free Viking army.
     */
    function applyLateAbility(S, pi, ability) {
        const p = S.players[pi];
        p.ability = ability || 'basis';
        const cap = S.cities.find(c => c.owner === pi && c.cap);
        if (!cap) return;
        cap.pop = E.isAbil(p, 'siedler') ? 2 : 1;
        const wantArmy = E.hasAbil(p, 'wikinger', 'basis');
        const has = S.armies.some(a => a.owner === pi);
        if (wantArmy && !has) S.armies.push({ id: S.nextId++, owner: pi, r: cap.r, c: cap.c, mp: 0, born: S.round });
        if (!wantArmy) S.armies = S.armies.filter(a => a.owner !== pi);
    }

    /** Play the automatic part of the current player's turn (bot or KI), without ending it. */
    function autoTurn(S) {
        const p = S.players[S.cur];
        if (p.kind === 'ki' && typeof E.kiTurn === 'function') E.kiTurn(S, S.cur);
        else E.botTurn(S, S.cur);
    }

    /**
     * Live turn timer (sockets/game.js): the time of the current human is up. The KI plays the
     * rest of the turn at `kiLevel`, the turn ends and the bots / KI after it move. With `keepKi`
     * the seat stays a KI seat (absent player) until it is handed back.
     */
    function finishTurnForAbsent(state, kiLevel, keepKi, onStateChanged) {
        if (!ensureEngineLoaded() || state.over) return;
        const p = state.players[state.cur];
        const before = { kind: p.kind, kiLevel: p.kiLevel };
        Object.assign(p, { kind: 'ki', kiLevel });
        try {
            autoTurn(state);
        } catch (err) {
            console.error(`[Engine Adapter] KI turn for absent player ${state.cur} failed:`, err);
        }
        if (!keepKi) Object.assign(p, before);
        E.endTurn(state);
        runBots(state, onStateChanged);
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

    return {
        createGame, applyAction, stateForPlayer, stateIndexOf, rollSetup,
        marathonAvailable, startDraft, draftPick, isDraftDone, finishDraft, draftPayload,
        advanceDraft, assignDoubles, isAutoPlayer, kiLevelFor, randomAbility, checkCustomMap,
        engineConst, turnOrderSlots, peekNext, advanceWithoutBegin, applyLateAbility, autoTurn,
        finishTurnForAbsent, ensureEngineLoaded,
        getEngine: () => E,
        version: () => engineConst('APP_VERSION') || label,
    };
}

const current = makeAdapter(GAME_DIRS.current, 'current');
const older = {};

/** The adapter for a game's engine version: an older one for games started on it, otherwise the current one. */
function forVersion(v) {
    if (!OLD_VERSIONS.includes(v)) return current;
    return older[v] || (older[v] = makeAdapter(GAME_DIRS[v], v));
}

module.exports = Object.assign({}, current, { forVersion, LEGACY_VERSION, OLD_VERSIONS, GAME_DIRS });
