/**
 * Asynchronous games ("Rundenspiele") – the rules of the meta game, without database or
 * sockets. Everything works on a plain object `g`:
 *
 *   g = {
 *     id, joinCode, hostUserId, status,      // setup → placement | draft → playing → finished | cancelled
 *     config: { mapKey, civMode, humanCount, events, eventMode, wonders, difficulty, ranked,
 *               isPublic, seed, startPlayer, order, map?, setup?, marathon? },
 *     seats:  [{ slot, civ, ability, kind, userId, name, roman, color, drafted, kiLevel,
 *                started, replaced, penalty, joinedAt }],   // index = slot = newGame() players index
 *     invites: [{ userId, username, status }],
 *     pre:    null | { plan } (tile map placement) | { draft: { V, D } } (Marathon),
 *     hold:   true while the game waits for an unclaimed seat (S.cur is that seat, its
 *             beginTurn has not run yet),
 *     state:  the engine state S, or null before the game itself starts,
 *   }
 *
 * Seats: `kind` 'human' with a userId is a player; 'human' without userId is a free seat
 * (placeholder in the engine state); 'bot' fills seats beyond the player amount; 'ki' is a
 * human seat taken over after 7 days of inactivity (`replaced`).
 */
const engine = require('../engine-adapter');
const E = () => engine.getEngine();

const MAP_KEYS = ['0', 'gross', 'plaettchen', 'marathon'];
const KI_TAKEOVER_LEVEL = { ranked: 'schwer', normal: 'mittel' };
const MMR_PENALTY = 15;

const isTile = g => g.config.mapKey === 'plaettchen';
const isMarathon = g => g.config.mapKey === 'marathon';
const hasPrephase = g => isTile(g) || isMarathon(g);
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

function difficulties() {
    return engine.engineConst('DIFFICULTIES') || [{ k: 'prinz' }];
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
        humanCount: Math.max(2, Math.min(4, parseInt(raw.humanCount, 10) || 2)),
        events: !!raw.events,
        eventMode: raw.eventMode === 'easy' ? 'easy' : 'hard',
        wonders: !!raw.wonders,
        difficulty: difficulties().some(d => d.k === raw.difficulty) ? raw.difficulty : 'prinz',
        ranked: !!raw.ranked,
        isPublic: !!raw.isPublic,
        seed: Math.floor(Math.random() * 2 ** 31),
    };
    // Ranked: bots on the hardest difficulty (as in live lobbies)
    if (config.ranked) config.difficulty = difficulties()[difficulties().length - 1].k;
    if (config.mapKey === 'marathon' && !engine.marathonAvailable())
        return { error: 'Diese Hochciv-Version kennt den Marathon noch nicht.' };

    const g = {
        hostUserId: host.id, status: 'setup', config,
        seats: [], invites: [], pre: null, hold: false, state: null, result: null,
    };
    const blank = slot => ({
        slot, civ: null, ability: 'basis', kind: 'human', userId: null, name: null,
        roman: null, color: null, started: false, replaced: false, penalty: 0, joinedAt: null,
    });
    const civs = civKeys();
    let hostSlot = 0;

    if (config.civMode === 'random') {
        // Nations are dealt now; turn positions are taken in join order (host first).
        const dealt = isTile(g) ? [0, 1, 2, 3].map(() => pick(civs))
            : civs.slice().sort(() => Math.random() - 0.5);
        g.seats = dealt.map((civ, slot) => Object.assign(blank(slot), { civ }));
        const order = engine.turnOrderSlots(dealt, 0);
        order.forEach((slot, pos) => {
            const s = g.seats[slot];
            if (pos >= config.humanCount) Object.assign(s, { kind: 'bot', ability: 'basis' });
            else s.ability = isMarathon(g) ? 'basis' : resolveAbility(s.civ, 'random');
        });
        config.order = order;
    } else if (isTile(g)) {
        // Tile map: any nation, also twice – the host takes slot 0, the others choose on joining
        g.seats = [0, 1, 2, 3].map(blank);
        const civ = resolveCiv(opts.civ, []);
        if (!civ) return { error: 'Unbekannte Nation.' };
        g.seats[0].civ = civ;
        g.seats[0].ability = resolveAbility(civ, opts.ability) || 'basis';
    } else {
        // Fixed map / Marathon: one seat per nation, the host picks one
        g.seats = civs.map((civ, slot) => Object.assign(blank(slot), { civ }));
        const civ = resolveCiv(opts.civ, []);
        if (!civ) return { error: 'Unbekannte Nation.' };
        hostSlot = civs.indexOf(civ);
        if (!isMarathon(g)) g.seats[hostSlot].ability = resolveAbility(civ, opts.ability) || 'basis';
    }

    Object.assign(g.seats[hostSlot], { userId: host.id, name: host.username, joinedAt: Date.now() });
    config.startPlayer = hostSlot;          // the host always moves first

    if (!hasPrephase(g)) startGame(g);
    return { g };
}

/** Create the engine state (all pre-phases done) and mark the first seat as started. */
function startGame(g) {
    g.state = engine.createGame(lobbyOf(g));
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
    if (isTile(g)) return civKeys().map(civ => ({ slot: null, civ }));
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
    } else if (isTile(g)) {
        const civ = resolveCiv(opts.civ, []);
        if (!civ) return 'Unbekannte Nation.';
        seat = g.seats.find(s => isFree(s) && !s.civ);
        if (seat) seat.civ = civ;
        ability = resolveAbility(civ, opts.ability);
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
        if (g.config.civMode === 'fixed' && !seat.started) engine.applyLateAbility(g.state, i, ability);
    }
    if (claimedCount(g) >= g.config.humanCount) fillBots(g);
    if (g.status === 'setup' && claimedCount(g) >= g.config.humanCount) startPrephase(g);
    return null;
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
        if (isTile(g)) seat.civ = null;
    }
    if (g.state) {
        const i = stateIndex(g, seat.slot);
        g.state.players[i].name = null;
        if (g.config.civMode === 'fixed') engine.applyLateAbility(g.state, i, 'basis');
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

/** The player amount is reached: every free seat becomes a bot. */
function fillBots(g) {
    g.seats.filter(isFree).forEach(s => {
        if (!s.civ) s.civ = pick(civKeys());
        Object.assign(s, { kind: 'bot', ability: 'basis', name: null });
        if (g.state) {
            const p = g.state.players[stateIndex(g, s.slot)];
            p.kind = 'bot';
            p.ability = 'basis';
            p.diff = g.config.difficulty;
        }
    });
}

// ── Pre-phases: tile placement and Marathon draft ─────────────────────────────

function startPrephase(g) {
    if (isTile(g)) {
        engine.assignDoubles(g.seats);
        const seed = g.config.seed;
        const plan = E().tilePlan(g.seats.map(s => s.civ), seed);
        if (!plan) throw new Error('Für diese Spielerzahl gibt es keine Plättchenkarte.');
        g.config.setup = engine.rollSetup(lobbyOf(g), seed);
        const rnd = E().mapRng(seed + 12345);
        plan.seats.forEach(ps => { if (g.seats[ps.idx].kind === 'bot') E().botPlaceSeat(plan, ps, rnd); });
        g.pre = { plan: deepCopy(plan) };
        g.status = 'placement';
        if (plan.seats.every(ps => ps.cell != null)) finishPlacement(g);
    } else if (isMarathon(g)) {
        const lobby = lobbyOf(g);
        engine.startDraft(lobby);
        g.pre = { draft: deepCopy(lobby.draft) };
        g.status = 'draft';
        if (engine.isDraftDone(lobbyOf(g))) finishDraft(g);
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
    const err = E().placeSeat(g.pre.plan, ps, +o, +cell);
    if (err) return err;
    if (g.pre.plan.seats.every(x => x.cell != null)) finishPlacement(g);
    return null;
}

function finishPlacement(g) {
    g.pre.plan.revealed = true;
    g.config.map = E().tileMap(g.pre.plan);
    startGame(g);
}

/** A human picks a Marathon ability. */
function draftPick(g, userId, id) {
    if (g.status !== 'draft') return 'Gerade wird nicht gedraftet.';
    const seat = seatOf(g, userId);
    if (!seat) return 'Du bist nicht in diesem Spiel.';
    const lobby = lobbyOf(g);
    const err = engine.draftPick(lobby, seat.slot, id);
    if (err) return err;
    if (engine.isDraftDone(lobby)) finishDraft(g);
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
    if (E().finishTurn(S)) return;
    const next = engine.peekNext(S);
    const seat = g.seats[S.players[next].slot];
    if (seat && isFree(seat)) {
        engine.advanceWithoutBegin(S);
        if (!S.over) g.hold = true;
        return;
    }
    E().advanceTurn(S);
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
        if (typeof E().blockingIssues === 'function') {
            const stop = E().blockingIssues(S, pi);
            if (stop && stop.length) return stop[0];
        }
        finishAndAdvance(g);
        return null;
    }
    return engine.applyAction(S, pi, type, params || {}, null);
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
            E().beginTurn(S);
            markStarted(g);
            if (onStep) await onStep();
            continue;
        }
        if (p.dead) { finishAndAdvance(g); continue; }
        if (!engine.isAutoPlayer(p)) break;         // a human's turn
        await new Promise(resolve => setImmediate(resolve));
        try {
            engine.autoTurn(S);
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
    if (g.status === 'setup') {
        // Nobody else joined in time: play with those who are there
        g.config.humanCount = Math.max(1, claimedCount(g));
        if (g.config.humanCount < 2) g.config.ranked = false;
        fillBots(g);
        startPrephase(g);
    } else if (g.status === 'placement') {
        const plan = g.pre.plan;
        const rnd = E().mapRng(g.config.seed + 777);
        for (const ps of plan.seats) {
            const seat = g.seats[ps.idx];
            if (ps.cell != null || seat.kind !== 'human') continue;
            takeOver(seat);
            const err = typeof E().kiPlaceSeat === 'function'
                ? E().kiPlaceSeat(plan, ps, { civ: seat.civ, ability: seat.ability }, g.config.setup) : 'no ki';
            if (err) E().botPlaceSeat(plan, ps, rnd);
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
                engine.advanceDraft(lobbyOf(g));
                if (engine.isDraftDone(lobbyOf(g))) finishDraft(g);
            }
        }
    } else if (g.status === 'playing' && g.state && !g.state.over) {
        const S = g.state;
        const seat = g.seats[S.players[S.cur].slot];
        if (g.hold && isFree(seat)) {
            // Nobody picked this nation: it becomes a bot, one player fewer
            seat.kind = 'bot'; seat.ability = 'basis';
            Object.assign(S.players[S.cur], { kind: 'bot', ability: 'basis', diff: g.config.difficulty });
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
    const { map, setup, seed, order, ...rest } = g.config;
    void map; void setup; void seed; void order;
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
    waitingOn, summary, view, freeSeats, seatOf, stateIndex, isFree,
    MMR_PENALTY,
};
