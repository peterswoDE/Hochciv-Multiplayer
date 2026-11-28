/**
 * Limits per account (scalability P1.11). utils/socket-limit.js and the express limiters count
 * per socket or per route; a bot with several sockets, or many bots of one owner, got past them.
 * Here the account (and for games the bot's owner) is counted:
 *
 *   · moves (async:action, :place, :draft, :civdraft): 5/s, burst 30 per account; 10/s per game
 *   · engine time of a bot's moves (the KI turns they drive included): 10 s per minute, burst 30 s
 *   · game list (GET /api/async): 6/min for bots, 30/min for people – a 304 is not counted
 *   · every other Rundenspiel call of a bot (REST and socket): 30/min
 *   · chat of a bot (async:chat, chat:send): 1 per 10 s
 *   · sockets at once: 3 per bot, 5 per person
 *   · Rundenspiele of a bot owner's bots: 60 running, 5 open (setup) hosted, 20 new per hour
 *
 * When a bucket is empty the call is first delayed (the next token is due within MAX_DELAY_MS
 * and no other call of the account waits), else refused – REST with 429 and Retry-After, a socket
 * acknowledgement with { error, code, retryAfter }. Every refusal is a strike; a bot that
 * collects SUSPEND_STRIKES (they fade, one per STRIKE_FADE_MS) is suspended for SUSPEND_MS
 * (users.suspendedUntil → botBlockedReason: no login, no session, its sockets are closed) and the
 * admins get a report (kind 'limit').
 *
 * Codes: rate_limited, engine_budget, too_many_sockets, too_many_games, suspended.
 * The buckets live in this process (one instance); see docs/reference/security.md (Limits).
 */
const { Op } = require('sequelize');

const per = (n, seconds) => n / seconds;
const LIMITS = {
    move: { bot: { burst: 30, rate: 5 }, human: { burst: 30, rate: 5 } },
    game: { burst: 30, rate: 10 },                                        // per game, everybody together
    engine: { bot: { burst: 30, rate: per(10, 60) } },                    // seconds of engine time
    list: { bot: { burst: 6, rate: per(6, 60) }, human: { burst: 30, rate: per(30, 60) } },
    call: { bot: { burst: 30, rate: per(30, 60) } },
    chat: { bot: { burst: 1, rate: per(1, 10) } },
};
const SOCKETS = { bot: 3, human: 5 };
const GAMES = { active: 60, lobbies: 5, perHour: 20 };
const MAX_DELAY_MS = 2000;
const SUSPEND_STRIKES = 30;
const STRIKE_FADE_MS = 20 * 1000;
const SUSPEND_MS = Number(process.env.BOT_SUSPEND_MS) || 60 * 60 * 1000;
const IDLE_MS = 10 * 60 * 1000;
// ACCOUNT_LIMITS_SCALE multiplies every rate, burst and count (2 = twice as much); 0 switches the limits off
const SCALE = process.env.ACCOUNT_LIMITS_SCALE !== undefined && process.env.ACCOUNT_LIMITS_SCALE !== ''
    ? Math.max(0, Number(process.env.ACCOUNT_LIMITS_SCALE) || 0) : 1;
const OFF = SCALE === 0;          // buckets of accounts gone quiet are forgotten

const MESSAGES = {
    rate_limited: 'Zu viele Anfragen – warte einen Moment.',
    engine_budget: 'Dein Bot hat seine Rechenzeit verbraucht – warte einen Moment.',
    too_many_sockets: 'Zu viele Verbindungen für dieses Konto.',
    suspended: 'Dieser Bot ist wegen zu vieler Anfragen für eine Stunde gesperrt.',
};

const isBot = u => !!u && u.accountType === 'bot';
const typeOf = u => (isBot(u) ? 'bot' : 'human');

const buckets = new Map();           // 'kind:id' → { tokens, burst, rate, at, waiting }
const strikes = new Map();           // account id → { n, at, by: { code/kind: count } }
const suspended = new Map();         // bot id → until (ms), mirrors users.suspendedUntil
const sockets = new Map();           // account id → open sockets

let hooks = { suspend: null };       // set by init: (bot, until, summary) => …

function bucketOf(key, spec) {
    let b = buckets.get(key);
    if (!b) {
        const burst = Math.max(1, spec.burst * SCALE);
        b = { tokens: burst, burst, rate: spec.rate * SCALE, at: Date.now(), waiting: 0 };
        buckets.set(key, b);
    }
    const now = Date.now();
    b.tokens = Math.min(b.burst, b.tokens + (now - b.at) / 1000 * b.rate);
    b.at = now;
    return b;
}

const refusal = (code, retryAfterMs) => ({ error: MESSAGES[code], code, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** null while `user` (a bot) is not suspended, else the end of the suspension (ms). */
function suspendedUntil(user) {
    if (!isBot(user)) return null;
    const mem = suspended.get(user.id);
    const db = user.suspendedUntil ? new Date(user.suspendedUntil).getTime() : 0;
    const until = Math.max(mem || 0, db);
    if (until > Date.now()) return until;
    if (mem) suspended.delete(user.id);
    return null;
}

/** A refusal: one strike; a bot with SUSPEND_STRIKES is suspended. */
function strike(user, what) {
    if (!user) return;
    const now = Date.now();
    const s = strikes.get(user.id) || { n: 0, at: now, by: {} };
    s.n = Math.max(0, s.n - (now - s.at) / STRIKE_FADE_MS) + 1;
    s.at = now;
    s.by[what] = (s.by[what] || 0) + 1;
    strikes.set(user.id, s);
    if (isBot(user) && s.n >= SUSPEND_STRIKES && !suspendedUntil(user)) {
        const until = now + SUSPEND_MS;
        suspended.set(user.id, until);
        strikes.delete(user.id);
        console.warn(`[Limits] Bot ${user.username} (${user.id}) suspended until ${new Date(until).toISOString()}: ${JSON.stringify(s.by)}`);
        if (hooks.suspend) Promise.resolve().then(() => hooks.suspend(user, until, s.by))
            .catch(err => console.error('[Limits] Suspending failed:', err));
    }
}

/**
 * Take one token of `kind` for `user` (and with `gameId` of the game's move bucket). Resolves
 * with null – possibly after a short delay – or with a refusal { error, code, retryAfter }.
 */
async function take(user, kind, { gameId } = {}) {
    if (!user || OFF) return null;
    const until = suspendedUntil(user);
    if (until) return refusal('suspended', until - Date.now());
    const spec = LIMITS[kind] && LIMITS[kind][typeOf(user)];
    const list = [];
    if (spec) list.push(bucketOf(`${kind}:${user.id}`, spec));
    if (kind === 'move' && gameId) list.push(bucketOf(`game:${gameId}`, LIMITS.game));
    if (kind === 'move' && isBot(user)) {
        const e = bucketOf(`engine:${user.id}`, LIMITS.engine.bot);
        if (e.tokens <= 0) { strike(user, 'engine_budget'); return refusal('engine_budget', -e.tokens / e.rate * 1000 + 1000); }
    }
    if (!list.length) return null;
    const wait = Math.max(...list.map(b => (b.tokens >= 1 ? 0 : (1 - b.tokens) / b.rate * 1000)));
    if (wait === 0) { list.forEach(b => { b.tokens -= 1; }); return null; }
    // first step: wait for the token – one call per bucket at a time
    if (wait <= MAX_DELAY_MS && list.every(b => !b.waiting)) {
        list.forEach(b => { b.tokens -= 1; b.waiting++; });
        await sleep(wait);
        list.forEach(b => { b.waiting--; });
        return null;
    }
    strike(user, `${kind}`);
    return refusal('rate_limited', wait);
}

/** Give a token back (a 304 of the game list does not count). */
function refund(user, kind) {
    const spec = user && LIMITS[kind] && LIMITS[kind][typeOf(user)];
    if (!spec) return;
    const b = bucketOf(`${kind}:${user.id}`, spec);
    b.tokens = Math.min(b.burst, b.tokens + 1);
}

/** Engine time a bot's move cost (async/service.js withGame): taken from its budget. */
function spend(user, seconds) {
    if (!isBot(user) || !(seconds > 0)) return;
    bucketOf(`engine:${user.id}`, LIMITS.engine.bot).tokens -= seconds;
}

// ── REST and Socket.IO ──────────────────────────────────────────────────────────────────────

function sendRefusal(res, r) {
    res.set('Retry-After', String(r.retryAfter));
    res.status(r.code === 'suspended' ? 403 : 429).json(r);
}

/** Express middleware for routes/async.js (after the login check). */
function asyncRoutes(req, res, next) {
    const list = req.method === 'GET' && (req.path === '/' || req.path === '');
    const kind = list ? 'list' : 'call';
    take(req.user, kind).then(r => {
        if (r) return sendRefusal(res, r);
        if (list) res.on('finish', () => { if (res.statusCode === 304) refund(req.user, 'list'); });
        next();
    }, next);
}

const MOVES = new Set(['async:action', 'async:place', 'async:draft', 'async:civdraft']);
const CHATS = new Set(['async:chat', 'chat:send']);

/** A connected socket: the account's socket count, and the limits on its events. */
function attach(socket) {
    const user = socket.request && socket.request.user;
    if (!user) return;
    if (OFF) return;
    const n = (sockets.get(user.id) || 0) + 1;
    const max = Math.round(SOCKETS[typeOf(user)] * SCALE);
    const until = suspendedUntil(user);
    if (until || n > max) {
        const r = until ? refusal('suspended', until - Date.now()) : refusal('too_many_sockets', 10 * 1000);
        if (!until) strike(user, 'too_many_sockets');
        socket.emit('limit', r);
        socket.disconnect(true);
        return;
    }
    sockets.set(user.id, n);
    socket.on('disconnect', () => {
        const left = (sockets.get(user.id) || 1) - 1;
        if (left > 0) sockets.set(user.id, left); else sockets.delete(user.id);
    });
    socket.use((packet, next) => {
        const event = packet[0];
        const kind = MOVES.has(event) ? 'move' : CHATS.has(event) ? 'chat' : String(event).startsWith('async:') ? 'call' : null;
        if (!kind) return next();
        const data = packet[1];
        const gameId = data && typeof data === 'object' && typeof data.id === 'string' ? data.id : null;
        take(user, kind, { gameId }).then(r => {
            if (!r) return next();
            const ack = packet[packet.length - 1];
            if (typeof ack === 'function') ack(r);
            if (r.code === 'suspended') socket.disconnect(true);
        }, () => next());
    });
}

// ── Rundenspiele per bot owner ──────────────────────────────────────────────────────────────

/**
 * May bot `user` take part in one more Rundenspiel (`create`: also host a new one)? null, or
 * { error, code: 'too_many_games' }. Counts the games of all the owner's bots.
 */
async function gamesAllowed(user, { create = false } = {}) {
    if (!isBot(user) || OFF) return null;
    const { User, AsyncGame } = require('../models');
    const max = n => Math.round(n * SCALE);
    const { ACTIVE } = require('../async/service');
    const bots = user.ownerId
        ? (await User.findAll({ where: { ownerId: user.ownerId, accountType: 'bot' }, attributes: ['id'], raw: true })).map(b => b.id)
        : [user.id];
    if (!bots.includes(user.id)) bots.push(user.id);
    const no = error => ({ error, code: 'too_many_games' });
    const active = await AsyncGame.count({ where: { status: ACTIVE, participantIds: { [Op.overlap]: bots } } });
    if (active >= max(GAMES.active)) return no(`Die Bots dieses Besitzers spielen schon ${max(GAMES.active)} Rundenspiele.`);
    if (!create) return null;
    const open = await AsyncGame.count({ where: { status: 'setup', hostUserId: bots } });
    if (open >= max(GAMES.lobbies)) return no(`Die Bots dieses Besitzers haben schon ${max(GAMES.lobbies)} offene Rundenspiele.`);
    const lastHour = await AsyncGame.count({ where: { hostUserId: bots, createdAt: { [Op.gt]: new Date(Date.now() - 3600 * 1000) } } });
    if (lastHour >= max(GAMES.perHour)) return no(`Die Bots dieses Besitzers haben in der letzten Stunde schon ${max(GAMES.perHour)} Rundenspiele eröffnet.`);
    return null;
}

// ── Suspension ──────────────────────────────────────────────────────────────────────────────

/**
 * Wire the suspension: store it on the bot (botBlockedReason refuses its login and session from
 * then on), close its sockets and report it to the admins.
 */
function init(io) {
    hooks.suspend = async (bot, until, by) => {
        const { User, Report } = require('../models');
        await User.update({ suspendedUntil: new Date(until) }, { where: { id: bot.id } });
        await require('./detachUser').disconnectSessions(io, bot.id);
        const owner = bot.ownerId ? await User.findByPk(bot.ownerId, { attributes: ['username'] }) : null;
        await Report.create({
            kind: 'limit', source: 'limits', sourceId: bot.id, auto: true, penalty: 'suspended',
            reporterId: null, reporterName: 'Limits',
            reportedId: bot.id, reportedName: bot.username,
            message: { until: new Date(until).toISOString(), owner: owner ? owner.username : null },
            context: Object.entries(by).map(([what, n]) => ({ what, n })),
        });
    };
}

// forget quiet accounts now and then
setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (!b.waiting && now - b.at > IDLE_MS) buckets.delete(k);
    for (const [k, s] of strikes) if (now - s.at > IDLE_MS) strikes.delete(k);
    for (const [k, t] of suspended) if (t <= now) suspended.delete(k);
}, 60 * 1000).unref();

/** Tests (POST /api/test/reset): forget every count. */
function resetAll() {
    buckets.clear(); strikes.clear(); suspended.clear();
}

module.exports = {
    take, refund, spend, attach, asyncRoutes, gamesAllowed, init, resetAll, suspendedUntil,
    LIMITS, SOCKETS, GAMES, MESSAGES, SUSPEND_STRIKES, SCALE,
};
