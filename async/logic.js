/**
 * Asynchronous games ("Rundenspiele") – the rules of the meta game, without database or
 * sockets. Everything works on a plain object `g`:
 *
 *   g = {
 *     id, joinCode, hostUserId, status, engine (version the game is played with, see ENG),      // setup → placement | draft → playing → finished | cancelled
 *     config: { mapKey, civMode, humanCount, events, eventMode, wonders, difficulty, ranked,
 *               isPublic, noKi, duel, seed, startPlayer, order, map?, setup?, marathon? },
 *     seats:  [{ slot, civ, ability, kind, userId, name, roman, color, drafted, kiLevel,
 *                started, replaced, penalty, joinedAt }],   // index = slot = newGame() players index
 *     invites: [{ userId, username, status }],
 *     chat:   [message] – the last 200 chat messages (utils/chat.js),
 *     pre:    null | { plan } (tile map placement) | { draft: { V, D } } (Marathon),
 *     hold:   true while the game waits for an unclaimed seat (S.cur is that seat, its
 *             beginTurn has not run yet),
 *     state:  the engine state S, or null before the game itself starts,
 *   }
 *
 * Seats: `kind` 'human' with a userId is a player; 'human' without userId is a free seat
 * (placeholder in the engine state); 'ki' fills seats beyond the player amount (level from
 * config.difficulty) and takes over a human seat after 7 days of inactivity (`replaced`).
 * 'bot' only appears in games created before KI fill-ins.
 */
const engine = require('../engine-adapter');
const E = () => engine.getEngine();
/* Each game plays with the engine version it was started on (g.engine): games from before
   the game shipped with this server have none and are v83. New games get the current one. */
const engineVersionOf = g => (g && g.engine) || engine.LEGACY_VERSION;
const ENG = g => engine.forVersion(engineVersionOf(g));

const MAP_KEYS = ['0', 'gross', 'plaettchen', 'marathon', 'eigene'];
const KI_TAKEOVER_LEVEL = { ranked: 'schwer', normal: 'mittel' };
const MMR_PENALTY = 15;

const isTile = g => g.config.mapKey === 'plaettchen';
const isCustom = g => g.config.mapKey === 'eigene';
// the standard Marathon map, or a custom map set to the marathon rules (map editor)
const isMarathon = g => g.config.mapKey === 'marathon' || (isCustom(g) && !!(g.config.customMap && g.config.customMap.marathon));
const hasPrephase = g => isTile(g) || isMarathon(g);
/* Nation chosen freely, also several times: the tile map and custom maps – their start points
   belong to no nation. On the fixed maps and the standard Marathon every nation sits once. */
const freeCivs = g => isTile(g) || isCustom(g);
/* Players (multiplayer extension): config.playerCount empires in all, config.humanCount of them humans, the rest
   KI (kiCount, chosen when creating). noKi = no KI at all: the game waits until everybody has
   joined. Games from before the extension have no playerCount: 4, or exactly the humans without KI. */
const playerCount = g => g.config.playerCount || (g.config.noKi ? g.config.humanCount : 4);
/** How many empires a map allows (mapLimits in engine.js) – v83 engines don't know it. */
function limitsOf(g, mapKey, customMap) {
    const fn = (g && ENG(g).getEngine().mapLimits) || E().mapLimits;
    return fn ? fn(mapKey, customMap) : { min: 2, max: 4, marathon: mapKey === 'marathon' };
}
const countError = (lim, n) => n < lim.min || n > lim.max
    ? (lim.min === lim.max ? `Auf dieser Karte spielen genau ${lim.min} Reiche.` : `Auf dieser Karte spielen ${lim.min} bis ${lim.max} Reiche.`)
    : null;
const shuffle = list => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** n nations, as evenly as possible: each nation once before any comes twice. */
const dealCivs = (civs, n) => { const out = []; while (out.length < n) out.push(...shuffle(civs)); return out.slice(0, n); };
const isFree = s => s.kind === 'human' && !s.userId;
const claimedCount = g => g.seats.filter(s => s.userId).length;
const seatOf = (g, userId) => g.seats.find(s => s.userId === userId && !s.replaced) || null;
const civKeys = () => (E().CIVS || []).map(c => c.k);
const civDef = k => (E().CIVS || []).find(c => c.k === k) || null;
const pick = list => list[Math.floor(Math.random() * list.length)];
const deepCopy = x => JSON.parse(JSON.stringify(x));

/** The adapter functions expect a live-lobby session: { gameConfig, players, draft }. */
const lobbyOf = g => ({ gameConfig: g.config, players: g.seats, draft: g.pre && g.pre.draft });

/** State index of a seat (newGame sorts into turn order and records the slot). */
const stateIndex = (g, slot) => g.state ? g.state.players.findIndex(p => p.slot === slot) : -1;

/** KI levels for the computer seats, easy → hard (KI_LEVELS in data.js). */
function kiLevels() {
    return engine.engineConst('KI_LEVELS') || [{ k: 'leicht' }, { k: 'mittel' }, { k: 'schwer' }];
}

/** Resolve "random" and check an ability key against a civ. Returns the key or null. */
function resolveAbility(civ, ability) {
    const def = civDef(civ);
    if (!def) return null;
    if (!ability || ability === 'random' || ability === 'zufall') return pick(def.abilities).k;
    return def.abilities.some(a => a.k === ability) ? ability : null;
}

function resolveCiv(civ, taken) {
    if (!civ || civ === 'random' || civ === 'zufall') {
        const free = civKeys().filter(k => !taken.includes(k));
        return pick(free.length ? free : civKeys());
    }
    return civKeys().includes(civ) ? civ : null;
}

// ── Creating ──────────────────────────────────────────────────────────────────

/**
 * Build a new game for `host` ({ id, username }). `opts` = { config, civ, ability }.
 * Returns { g } or { error }. Fixed maps start right away – the host plays turn 1.
 */
function create(host, opts) {
    if (!engine.ensureEngineLoaded()) return { error: 'Die Spiel-Engine ist noch nicht bereit.' };
    const raw = (opts && opts.config) || {};
    const config = {
        mapKey: MAP_KEYS.includes(raw.mapKey) ? raw.mapKey : '0',
        civMode: raw.civMode === 'random' ? 'random' : 'fixed',
        events: !!raw.events,
        eventMode: raw.eventMode === 'easy' ? 'easy' : 'hard',
        wonders: !!raw.wonders,
        // older clients still send a bot difficulty – kiLevelFor maps it
        difficulty: engine.kiLevelFor(raw.difficulty),
        ranked: !!raw.ranked,
        isPublic: !!raw.isPublic,
        seed: Math.floor(Math.random() * 2 ** 31),
    };
    // Ranked: KI on the hardest level (as in live lobbies)
    if (config.ranked) config.difficulty = kiLevels()[kiLevels().length - 1].k;
    if (config.mapKey === 'marathon' && !engine.marathonAvailable())
        return { error: 'Diese Hochciv-Version kennt den Marathon noch nicht.' };
    // Custom map (the host's map library, or loaded by its code): its start points take any
    // nation, as many empires as it has start points. Only the checked, clean copy is stored.
    if (config.mapKey === 'eigene') {
        const r = engine.checkCustomMap(raw.customMap);
        if (r.error) return { error: 'Eigene Karte: ' + r.error };
        config.customMap = r.map;
    }
    // Empires in all and how many of them the KI plays. Older clients send humanCount (+ noKi).
    let total = parseInt(raw.playerCount, 10), ki = parseInt(raw.kiCount, 10);
    if (!Number.isInteger(total)) {
        const h = Math.max(2, Math.min(4, parseInt(raw.humanCount, 10) || 2));
        total = raw.noKi ? h : 4;
        ki = total - h;
    }
    if (!Number.isInteger(ki) || ki < 0) ki = 0;
    const lim = limitsOf(null, config.mapKey, config.customMap);
    const cErr = countError(lim, total);
    if (cErr) return { error: cErr };
    if (total - ki < 2) return { error: 'Ein Rundenspiel braucht mindestens zwei Menschen.' };
    Object.assign(config, { playerCount: total, humanCount: total - ki, noKi: ki === 0 });

    const g = {
        engine: engine.version(),           // played with this engine version to the end
        hostUserId: host.id, status: 'setup', config,
        seats: [], invites: [], pre: null, hold: false, state: null, result: null,
    };
    const blank = slot => ({
        slot, civ: null, ability: 'basis', kind: 'human', userId: null, name: null,
        roman: null, color: null, started: false, replaced: false, penalty: 0, joinedAt: null,
    });
    const civs = civKeys();
    const kiSeats = total - config.humanCount;
    const kiSeat = s => Object.assign(s, {
        kind: 'ki', kiLevel: engine.kiLevelFor(config.difficulty),
        ability: isMarathon(g) ? 'basis' : resolveAbility(s.civ, 'random'),
    });
    let hostSlot = 0;

    if (config.civMode === 'random') {
        // Nations are dealt now (random for everyone); turn positions are taken in join order
        // (host first), the last ones in turn order are the KI.
        const dealt = freeCivs(g) ? dealCivs(civs, total) : shuffle(civs).slice(0, total);
        g.seats = dealt.map((civ, slot) => Object.assign(blank(slot), { civ }));
        const order = engine.turnOrderSlots(dealt, 0);
        order.forEach((slot, pos) => {
            const s = g.seats[slot];
            if (pos >= config.humanCount) kiSeat(s);
            else s.ability = isMarathon(g) ? 'basis' : resolveAbility(s.civ, 'random');
        });
        config.order = order;
    } else if (freeCivs(g)) {
        // Tile map / custom map: any nation, also twice – the host takes slot 0, the others
        // choose on joining; the KI seats (the last ones) get a nation now
        g.seats = Array.from({ length: total }, (_, slot) => blank(slot));
        const civ = resolveCiv(opts.civ, []);
        if (!civ) return { error: 'Unbekannte Nation.' };
        g.seats[0].civ = civ;
        g.seats[0].ability = isMarathon(g) ? 'basis' : (resolveAbility(civ, opts.ability) || 'basis');
        const kiCivs = dealCivs(civs, kiSeats);
        g.seats.slice(total - kiSeats).forEach((s, i) => { s.civ = kiCivs[i]; kiSeat(s); });
    } else {
        // Fixed map / Marathon: one seat per nation, the host picks one. Which of the others
        // the KI plays and which leave (fewer than four empires) is settled once all humans
        // are there (fillBots).
        g.seats = civs.map((civ, slot) => Object.assign(blank(slot), { civ }));
        const civ = resolveCiv(opts.civ, []);
        if (!civ) return { error: 'Unbekannte Nation.' };
        hostSlot = civs.indexOf(civ);
        if (!isMarathon(g)) g.seats[hostSlot].ability = resolveAbility(civ, opts.ability) || 'basis';
    }

    Object.assign(g.seats[hostSlot], { userId: host.id, name: host.username, joinedAt: Date.now() });
    config.startPlayer = hostSlot;          // the host always moves first

    /* Start right away (the host plays turn 1 while the others join) when the seats are
       final already: nations dealt at random, or all four nations of a fixed map. Otherwise –
       and always without KI – the game starts once everybody is there. */
    const seatsFinal = config.civMode === 'random' || (!freeCivs(g) && total === 4);
    if (!hasPrephase(g) && !config.noKi && seatsFinal) startGame(g);
    return { g };
}

/** Create the engine state (all pre-phases done) and mark the first seat as started. */
function startGame(g) {
    g.config.duel = g.seats.length === 2;     // two empires: duel thresholds, on any map
    ENG(g).assignDoubles(g.seats);            // a nation twice: Roman numerals, own colours
    g.state = ENG(g).createGame(lobbyOf(g));
    g.status = 'playing';
    g.hold = false;
    g.pre = null;
    markStarted(g);
}

function markStarted(g) {
    const p = g.state.players[g.state.cur];
    if (p && g.seats[p.slot]) g.seats[p.slot].started = true;
}

// ── Joining and leaving ───────────────────────────────────────────────────────

/** Which seats can a joiner take right now? (for the join dialog) */
function freeSeats(g) {
    if (!['setup', 'playing'].includes(g.status) || claimedCount(g) >= g.config.humanCount) return [];
    if (g.config.civMode === 'random') return [nextRandomSeat(g)].filter(Boolean).map(s => ({ slot: s.slot, civ: s.civ }));
    if (freeCivs(g)) return civKeys().map(civ => ({ slot: null, civ }));
    return g.seats.filter(isFree).map(s => ({ slot: s.slot, civ: s.civ }));
}

function nextRandomSeat(g) {
    return (g.config.order || []).map(i => g.seats[i]).find(isFree) || null;
}

/**
 * `user` ({ id, username }) takes a seat. `opts` = { civ, ability } (fixed mode only).
 * Returns an error message or null.
 */
function join(g, user, opts) {
    opts = opts || {};
    if (g.seats.some(s => s.userId === user.id)) return 'Du bist schon in diesem Spiel.';
    if (!['setup', 'playing'].includes(g.status)) return 'Diesem Spiel kann man nicht mehr beitreten.';
    if (claimedCount(g) >= g.config.humanCount) return 'Das Spiel ist schon voll.';

    let seat, ability;
    if (g.config.civMode === 'random') {
        seat = nextRandomSeat(g);
        ability = seat && seat.ability;
    } else if (freeCivs(g)) {
        const civ = resolveCiv(opts.civ, []);
        if (!civ) return 'Unbekannte Nation.';
        seat = g.seats.find(s => isFree(s) && !s.civ);
        if (seat) seat.civ = civ;
        ability = isMarathon(g) ? 'basis' : resolveAbility(civ, opts.ability);
    } else {
        const taken = g.seats.filter(s => !isFree(s)).map(s => s.civ);
        const civ = resolveCiv(opts.civ, taken);
        seat = g.seats.find(s => s.civ === civ && isFree(s));
        if (!seat) return 'Diese Nation ist schon vergeben.';
        ability = isMarathon(g) ? 'basis' : resolveAbility(civ, opts.ability);
    }
    if (!seat) return 'Kein freier Platz mehr.';
    if (!ability) return 'Unbekannte Fähigkeit.';

    Object.assign(seat, { userId: user.id, name: user.username, ability, joinedAt: Date.now() });
    const inv = g.invites.find(i => i.userId === user.id);
    if (inv) inv.status = 'accepted';

    if (g.state) {
        const i = stateIndex(g, seat.slot);
        g.state.players[i].name = user.username;
        // Fixed mode: the ability is chosen now. The seat has not had a turn yet (the game
        // waits before an unclaimed seat's turn begins), so newGame's start effects are redone.
        if (g.config.civMode === 'fixed' && !seat.started) ENG(g).applyLateAbility(g.state, i, ability);
    }
    if (claimedCount(g) >= g.config.humanCount) fillBots(g);
    if (g.status === 'setup' && claimedCount(g) >= g.config.humanCount) startPrephase(g);
    return null;
}

/**
 * Without KI: the nations nobody took leave the game before it starts. Seats are renumbered
 * (slot = index into newGame's players); the host keeps the first move. Two empires play
 * as a duel (higher victory thresholds), like "1 gegen 1" in a local game.
 */
function dropFreeSeats(g) {
    const host = g.seats.find(s => s.userId === g.hostUserId);
    g.seats = g.seats.filter(s => !isFree(s));
    g.seats.forEach((s, i) => { s.slot = i; });
    g.config.startPlayer = Math.max(0, g.seats.indexOf(host));
    g.config.order = ENG(g).turnOrderSlots(g.seats.map(s => s.civ), 0);
    g.config.playerCount = g.seats.length;
    g.config.humanCount = claimedCount(g);
    g.config.duel = g.seats.length === 2;
}

/** Leaving is free until your seat has had its first turn (or the pre-phase began). */
function leave(g, userId) {
    const seat = seatOf(g, userId);
    if (!seat) return 'Du bist nicht in diesem Spiel.';
    if (userId === g.hostUserId) return 'Der Host kann das Spiel nur abbrechen, nicht verlassen.';
    const free = g.status === 'setup' || (g.status === 'playing' && !seat.started);
    if (!free) return 'Nach deinem ersten Zug kannst du das Spiel nicht mehr verlassen.';

    Object.assign(seat, { userId: null, name: null, joinedAt: null });
    if (g.config.civMode === 'fixed') {
        seat.ability = 'basis';
        if (freeCivs(g)) seat.civ = null;
    }
    if (g.state) {
        const i = stateIndex(g, seat.slot);
        g.state.players[i].name = null;
        if (g.config.civMode === 'fixed') ENG(g).applyLateAbility(g.state, i, 'basis');
    }
    // Seats that became bots because the game was full stay bots; the freed seat is open again.
    return null;
}

/** Host cancels: allowed until another human has played a turn / before the pre-phase. */
function cancel(g, userId) {
    if (userId !== g.hostUserId) return 'Nur der Host kann das Spiel abbrechen.';
    const others = g.seats.filter(s => s.userId && s.userId !== userId);
    const ok = g.status === 'setup' || (g.status === 'playing' && others.every(s => !s.started));
    if (!ok) return 'Das Spiel läuft schon – abbrechen geht nicht mehr.';
    g.status = 'cancelled';
    return null;
}

/**
 * The humans are complete: free seats are filled with KI players up to playerCount, the rest
 * leave (a fixed map with fewer than four empires, a game without KI). A game that runs
 * already keeps every seat – the KI plays the free ones.
 */
function fillBots(g) {
    const free = shuffle(g.seats.filter(isFree));
    const computer = g.seats.filter(s => s.kind !== 'human').length;
    const need = g.state ? free.length : Math.max(0, playerCount(g) - claimedCount(g) - computer);
    free.slice(0, need).forEach(s => makeKi(g, s));
    if (g.seats.some(isFree)) dropFreeSeats(g);
}

/**
 * A seat nobody claimed becomes a KI player. It has not had a turn yet (the game waits
 * before an unclaimed seat's turn begins), so it still gets an ability like a human
 * (Marathon: drafted later).
 */
function makeKi(g, s) {
    if (!s.civ) s.civ = pick(civKeys());
    const ability = isMarathon(g) ? 'basis' : resolveAbility(s.civ, 'random');
    Object.assign(s, { kind: 'ki', kiLevel: ENG(g).kiLevelFor(g.config.difficulty), ability, name: null });
    if (g.state) {
        const i = stateIndex(g, s.slot);
        Object.assign(g.state.players[i], { kind: 'ki', kiLevel: s.kiLevel, name: null });
        ENG(g).applyLateAbility(g.state, i, ability);
    }
}

// ── Pre-phases: tile placement and Marathon draft ─────────────────────────────

function startPrephase(g) {
    g.config.duel = g.seats.length === 2;
    ENG(g).assignDoubles(g.seats);
    if (isTile(g)) {
        const seed = g.config.seed;
        const plan = ENG(g).getEngine().tilePlan(g.seats.map(s => s.civ), seed);
        if (!plan) throw new Error('Für diese Spielerzahl gibt es keine Plättchenkarte.');
        g.config.setup = ENG(g).rollSetup(lobbyOf(g), seed);
        const rnd = ENG(g).getEngine().mapRng(seed + 12345);
        plan.seats.forEach(ps => {
            const seat = g.seats[ps.idx];
            if (seat.kind === 'ki') {
                const err = typeof ENG(g).getEngine().kiPlaceSeat === 'function'
                    ? ENG(g).getEngine().kiPlaceSeat(plan, ps, { civ: seat.civ, ability: seat.ability }, g.config.setup) : 'no ki';
                if (err) ENG(g).getEngine().botPlaceSeat(plan, ps, rnd);
            } else if (seat.kind === 'bot') ENG(g).getEngine().botPlaceSeat(plan, ps, rnd);
        });
        g.pre = { plan: deepCopy(plan) };
        g.status = 'placement';
        if (plan.seats.every(ps => ps.cell != null)) finishPlacement(g);
    } else if (isMarathon(g)) {
        const lobby = lobbyOf(g);
        ENG(g).startDraft(lobby);
        g.pre = { draft: deepCopy(lobby.draft) };
        g.status = 'draft';
        if (ENG(g).isDraftDone(lobbyOf(g))) finishDraft(g);
    } else if (!g.state) {
        startGame(g);                       // waited until everybody was there
    }
}

/** A human places their start tile. */
function place(g, userId, o, cell) {
    if (g.status !== 'placement') return 'Gerade wird nicht gelegt.';
    const seat = seatOf(g, userId);
    if (!seat) return 'Du bist nicht in diesem Spiel.';
    const ps = g.pre.plan.seats.find(x => x.idx === seat.slot);
    if (!ps) return 'Kein Startplatz für dich.';
    if (ps.cell != null) return 'Du hast dein Startplättchen schon gelegt.';
    const err = ENG(g).getEngine().placeSeat(g.pre.plan, ps, +o, +cell);
    if (err) return err;
    if (g.pre.plan.seats.every(x => x.cell != null)) finishPlacement(g);
    return null;
}

function finishPlacement(g) {
    g.pre.plan.revealed = true;
    g.config.map = ENG(g).getEngine().tileMap(g.pre.plan);
    startGame(g);
}

/** A human picks a Marathon ability. */
function draftPick(g, userId, id) {
    if (g.status !== 'draft') return 'Gerade wird nicht gedraftet.';
    const seat = seatOf(g, userId);
    if (!seat) return 'Du bist nicht in diesem Spiel.';
    const lobby = lobbyOf(g);
    const err = ENG(g).draftPick(lobby, seat.slot, id);
    if (err) return err;
    if (ENG(g).isDraftDone(lobby)) finishDraft(g);
    return null;
}

function finishDraft(g) {
    // D.picks are by index into V.players (turn order); seats are by slot
    const { V, D } = g.pre.draft;
    V.players.forEach((p, i) => { if (p.kind !== 'bot') g.seats[p.slot].drafted = D.picks[i].slice(); });
    startGame(g);
}

// ── Turns ─────────────────────────────────────────────────────────────────────

/**
 * End the current turn: combat/victory (finishTurn), then move on. If the next seat is
 * still free, stop BEFORE its beginTurn and wait (g.hold).
 */
function finishAndAdvance(g) {
    const S = g.state;
    if (ENG(g).getEngine().finishTurn(S)) return;
    const next = ENG(g).peekNext(S);
    const seat = g.seats[S.players[next].slot];
    if (seat && isFree(seat)) {
        ENG(g).advanceWithoutBegin(S);
        if (!S.over) g.hold = true;
        return;
    }
    ENG(g).getEngine().advanceTurn(S);
    if (!S.over) markStarted(g);
}

/** A human acts in their own turn. Returns an error message or null. */
function action(g, userId, type, params) {
    if (g.status !== 'playing' || !g.state) return 'Das Spiel läuft nicht.';
    const S = g.state;
    if (S.over) return 'Das Spiel ist vorbei.';
    const seat = seatOf(g, userId);
    if (!seat) return 'Du bist nicht in diesem Spiel.';
    const pi = stateIndex(g, seat.slot);
    if (g.hold || S.cur !== pi) return 'Du bist nicht am Zug.';
    if (type === 'endTurn') {
        if (typeof ENG(g).getEngine().blockingIssues === 'function') {
            const stop = ENG(g).getEngine().blockingIssues(S, pi);
            if (stop && stop.length) return stop[0];
        }
        finishAndAdvance(g);
        return null;
    }
    return ENG(g).applyAction(S, pi, type, params || {}, null);
}

/**
 * Play everything that needs no human: release a hold whose seat got resolved, bots and KI
 * turns, eliminated players. Yields between automatic turns (KI turns can take seconds).
 * `onStep` is called after every automatic step (live broadcast).
 */
async function drive(g, onStep) {
    const S = g.state;
    if (!S || g.status !== 'playing') return;
    let guard = 0;
    while (!S.over && guard++ < 400) {
        const p = S.players[S.cur];
        const seat = g.seats[p.slot];
        if (g.hold) {
            if (isFree(seat)) break;                // still waiting for someone to join
            p.kind = seat.kind;
            if (seat.kind === 'ki') p.kiLevel = seat.kiLevel || KI_TAKEOVER_LEVEL.normal;
            g.hold = false;
            ENG(g).getEngine().beginTurn(S);
            markStarted(g);
            if (onStep) await onStep();
            continue;
        }
        if (p.dead) { finishAndAdvance(g); continue; }
        if (!ENG(g).isAutoPlayer(p)) break;         // a human's turn
        await new Promise(resolve => setImmediate(resolve));
        try {
            ENG(g).autoTurn(S);
        } catch (err) {
            console.error(`[Async] ${p.kind} turn failed in game ${g.id}:`, err);
        }
        finishAndAdvance(g);
        if (onStep) await onStep();
    }
    if (S.over) g.status = 'finished';
}

// ── Inactivity (7 days) ───────────────────────────────────────────────────────

/** Who does the game wait for? { userIds, label } */
function waitingOn(g) {
    const name = s => s.name || (civDef(s.civ) || {}).n || 'Spieler';
    if (g.status === 'setup') {
        const missing = g.config.humanCount - claimedCount(g);
        return { userIds: [], label: `${missing} Mitspieler` };
    }
    if (g.status === 'placement') {
        const open = g.seats.filter(s => s.kind === 'human' && s.userId && !s.replaced &&
            g.pre.plan.seats.some(ps => ps.idx === s.slot && ps.cell == null));
        return { userIds: open.map(s => s.userId), label: open.map(name).join(', ') };
    }
    if (g.status === 'draft') {
        const D = g.pre.draft.D;
        const cur = D.at < D.order.length ? D.order[D.at] : null;
        const seat = cur != null ? g.seats[g.pre.draft.V.players[cur].slot] : null;
        return seat && seat.userId && !seat.replaced ? { userIds: [seat.userId], label: name(seat) } : { userIds: [], label: '' };
    }
    if (g.status === 'playing' && g.state && !g.state.over) {
        const seat = g.seats[g.state.players[g.state.cur].slot];
        if (g.hold) return { userIds: [], label: `freier Platz (${(civDef(seat.civ) || {}).n || seat.civ})` };
        if (seat.kind === 'human' && seat.userId) return { userIds: [seat.userId], label: name(seat) };
    }
    return { userIds: [], label: '' };
}

/** A human seat is taken over by the KI. Returns the userId when it costs MMR. */
function replaceSeat(g, seat) {
    seat.kind = 'ki';
    seat.replaced = true;
    seat.kiLevel = g.config.ranked ? KI_TAKEOVER_LEVEL.ranked : KI_TAKEOVER_LEVEL.normal;
    seat.penalty = g.config.ranked ? -MMR_PENALTY : 0;
    return g.config.ranked ? seat.userId : null;
}

/**
 * Nobody acted for 7 days: resolve whatever the game waits for.
 * Returns { replaced: [userId…], penalized: [userId…] }; call drive() afterwards.
 */
function timeout(g) {
    const replaced = [], penalized = [];
    const takeOver = seat => {
        replaced.push(seat.userId);
        const u = replaceSeat(g, seat);
        if (u) penalized.push(u);
    };
    if (g.status === 'setup' && g.config.noKi) {
        // Without KI: play with those who are there if the map allows it, otherwise cancel
        g.config.playerCount = claimedCount(g);
        if (countError(limitsOf(g, g.config.mapKey, g.config.customMap), claimedCount(g))) {
            g.status = 'cancelled';
            g.cancelReason = 'Es sind nicht genug Mitspieler beigetreten.';
        }
        else {
            fillBots(g);
            if (g.config.humanCount < 2) g.config.ranked = false;
            startPrephase(g);
        }
    } else if (g.status === 'setup') {
        // Nobody else joined in time: play with those who are there, the KI fills up
        g.config.humanCount = Math.max(1, claimedCount(g));
        if (g.config.humanCount < 2) g.config.ranked = false;
        fillBots(g);
        startPrephase(g);
    } else if (g.status === 'placement') {
        const plan = g.pre.plan;
        const rnd = ENG(g).getEngine().mapRng(g.config.seed + 777);
        for (const ps of plan.seats) {
            const seat = g.seats[ps.idx];
            if (ps.cell != null || seat.kind !== 'human') continue;
            takeOver(seat);
            const err = typeof ENG(g).getEngine().kiPlaceSeat === 'function'
                ? ENG(g).getEngine().kiPlaceSeat(plan, ps, { civ: seat.civ, ability: seat.ability }, g.config.setup) : 'no ki';
            if (err) ENG(g).getEngine().botPlaceSeat(plan, ps, rnd);
        }
        if (plan.seats.every(x => x.cell != null)) finishPlacement(g);
    } else if (g.status === 'draft') {
        const { V, D } = g.pre.draft;
        const cur = D.at < D.order.length ? D.order[D.at] : null;
        if (cur != null) {
            const seat = g.seats[V.players[cur].slot];
            if (seat.kind === 'human' && seat.userId) {
                takeOver(seat);
                V.players[cur].kind = 'ki';
                ENG(g).advanceDraft(lobbyOf(g));
                if (ENG(g).isDraftDone(lobbyOf(g))) finishDraft(g);
            }
        }
    } else if (g.status === 'playing' && g.state && !g.state.over) {
        const S = g.state;
        const seat = g.seats[S.players[S.cur].slot];
        if (g.hold && isFree(seat)) {
            // Nobody picked this nation: the KI plays it, one player fewer
            makeKi(g, seat);
            g.config.humanCount = Math.max(claimedCount(g), g.config.humanCount - 1);
            if (claimedCount(g) >= g.config.humanCount) fillBots(g);
        } else if (seat.kind === 'human' && seat.userId) {
            takeOver(seat);
            S.players[S.cur].kind = 'ki';
            S.players[S.cur].kiLevel = seat.kiLevel;
        }
    }
    return { replaced, penalized };
}

// ── Account deletion ─────────────────────────────────────────────────────────

const DELETED_NAME = 'Gelöschter Spieler';
const IN_PREPHASE = 'Ein Rundenspiel ist gerade in der Startphase (Plättchen legen / Draft). Bitte warte, bis sie abgeschlossen ist.';

/**
 * The player's account is deleted. A running game goes on without them: a seat that has not
 * played yet is free again (the host's game in setup is cancelled), otherwise the KI plays it
 * to the end. Placement and draft cannot be left – returns an error message then. Afterwards no
 * seat, invitation or name points to the account any more (also in finished games).
 */
function removeUser(g, userId) {
    const seats = g.seats.filter(s => s.userId === userId);
    if (seats.length && (g.status === 'placement' || g.status === 'draft')) {
        return IN_PREPHASE;
    }
    g.invites = g.invites.filter(i => i.userId !== userId);
    const seat = seatOf(g, userId);
    if (seat && g.status === 'setup' && userId === g.hostUserId) {
        g.status = 'cancelled';
    } else if (seat && userId !== g.hostUserId && (g.status === 'setup' || (g.status === 'playing' && !seat.started))) {
        leave(g, userId);
    } else if (seat && g.status === 'playing') {
        replaceSeat(g, seat);
        seat.penalty = 0;
        const p = g.state.players[stateIndex(g, seat.slot)];
        p.kind = 'ki';
        p.kiLevel = seat.kiLevel;
    }
    for (const s of g.seats.filter(x => x.userId === userId)) {
        const old = s.name;
        // their chat messages go with the account
        if (g.chat) g.chat = g.chat.filter(m => !(m.slot === s.slot && m.name === old));
        Object.assign(s, { userId: null, name: DELETED_NAME });
        const i = stateIndex(g, s.slot);
        if (i >= 0 && g.state.players[i].name) g.state.players[i].name = DELETED_NAME;
        if (old && g.result) {
            for (const r of g.result.players || []) if (r.name === old) r.name = DELETED_NAME;
            if (g.result.winners) g.result.winners = g.result.winners.map(n => n === old ? DELETED_NAME : n);
        }
    }
    return null;
}

// ── Views ─────────────────────────────────────────────────────────────────────

/** Short info for the game list. */
function summary(g, userId) {
    const w = waitingOn(g);
    const mine = seatOf(g, userId) || g.seats.find(s => s.userId === userId) || null;
    const S = g.state;
    return {
        id: g.id,
        engine: engineVersionOf(g),        // the client opens games of an older version in it (/v88/, /v87/, /v83/)
        joinCode: g.joinCode,
        status: g.status,
        isHost: g.hostUserId === userId,
        config: publicConfig(g),
        seats: publicSeats(g),
        mySlot: mine ? mine.slot : null,
        replaced: !!(mine && mine.replaced),
        yourTurn: w.userIds.includes(userId),
        waitingFor: w.label,
        round: S ? S.round : 0,
        waitSince: g.waitSince || null,
        freeSeats: freeSeats(g),
        invited: g.invites.some(i => i.userId === userId && i.status === 'pending'),
        winners: S && S.over ? (S.over.winners || []).map(i => S.players[i] && g.seats[S.players[i].slot])
            .filter(Boolean).map(s => s.name || (civDef(s.civ) || {}).n) : [],
    };
}

function publicConfig(g) {
    const { map, setup, seed, order, customMap, ...rest } = g.config;
    void map; void setup; void seed; void order;
    // lists only need the name of a custom map; the rows are in the game state
    if (customMap) rest.customMapName = customMap.name;
    return rest;
}

function publicSeats(g) {
    return g.seats.map(s => ({
        slot: s.slot, civ: s.civ, kind: s.kind, name: s.name, userId: s.userId,
        ability: s.ability, drafted: s.drafted || null, roman: s.roman, color: s.color,
        replaced: !!s.replaced, started: !!s.started,
    }));
}

/**
 * Everything a participant's client needs to show the game. During placement the other
 * players' start tiles are hidden (o / cell stripped).
 */
function view(g, userId) {
    const out = summary(g, userId);
    out.hold = !!g.hold;
    out.invites = g.hostUserId === userId ? g.invites : undefined;
    const mine = seatOf(g, userId);
    if (g.status === 'placement') {
        const plan = deepCopy(g.pre.plan);
        plan.seats.forEach(ps => { if (!mine || ps.idx !== mine.slot) { ps.o = null; ps.cell = null; } });
        const ps = mine ? g.pre.plan.seats.find(x => x.idx === mine.slot) : null;
        out.placement = {
            plan, setup: g.config.setup,
            placed: !!(ps && ps.cell != null),
            players: g.seats.map(s => ({ civ: s.civ, kind: s.kind, ability: s.ability, name: s.name, roman: s.roman, color: s.color })),
            wonders: g.config.wonders,
        };
    }
    if (g.status === 'draft') out.draft = deepCopy(g.pre.draft);
    if (g.state) {
        out.state = g.state;
        out.myIndex = mine ? stateIndex(g, mine.slot) : -1;
    }
    return out;
}

module.exports = {
    create, join, leave, cancel, place, draftPick, action, drive, timeout, removeUser, DELETED_NAME, IN_PREPHASE,
    waitingOn, summary, view, freeSeats, seatOf, stateIndex, isFree, engineVersionOf, ENG,
    MMR_PENALTY,
};
