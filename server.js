const express = require('express');
const compression = require('compression');
const fs = require('fs');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const apiRoutes = require('./routes/api');
const registerGame = require('./sockets/game');
const registerAsync = require('./sockets/async');

const pg = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./models');
// Performance figures for Prometheus / Grafana (utils/metrics.js, docs/operations/monitoring.md)
const Metrics = require('./utils/metrics');
const Grafana = require('./utils/grafana');
require('./utils/monitoringSync').syncOnStart();
Metrics.instrumentSequelize(sequelize);
const { Op } = require('sequelize');
const { refreshOAuthStrategies } = require('./utils/oauth');
const { str } = require('./utils/auth');
const { botBlockedReason } = require('./utils/bots');
const { allowedOrigin, checkOrigin, allowSocket } = require('./utils/origin');
const Assets = require('./utils/assets');

// ── Passport Configuration ──────────────────────────────────────────────────
const DUMMY_HASH = bcrypt.hashSync('no account has this password', 10);
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const login = str(username), pw = str(password);
            if (!login || !pw) return done(null, false, { message: 'Missing credentials.' });
            const user = await User.findOne({
                where: {
                    [Op.or]: [
                        { username: login },
                        { email: login }
                    ]
                }
            });
            if (!user || !user.password_hash) {
                // as slow as a wrong password, so the answer time doesn't tell which accounts exist
                await bcrypt.compare(pw, DUMMY_HASH);
                return done(null, false, { message: 'Incorrect username or email.' });
            }
            const match = await bcrypt.compare(pw, user.password_hash);
            if (!match) return done(null, false, { message: 'Incorrect password.' });
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

// the user and a bot's owner from a short cache (utils/session-cost.js, P1.7)
const SessionCost = require('./utils/session-cost');
const loadUser = SessionCost.makeLoader(User);
passport.deserializeUser(async (id, done) => {
    try {
        const user = await loadUser(id);
        // A banned (or deleted) user is logged out on the next request – a bot also when its
        // owner is banned or may no longer run bots (utils/bots.js)
        if (!user || user.isBanned) return done(null, false);
        if (user.accountType === 'bot') {
            const owner = user.ownerId ? await loadUser(user.ownerId) : null;
            if (botBlockedReason(user, owner)) return done(null, false);
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// ── Express ──────────────────────────────────────────────────────────────────

const app = express();

const dbUrl = process.env.DATABASE_URL || 'postgres://hochciv:password123@hochciv-db:5432/hochciv';
const sessionSecret = process.env.SESSION_SECRET || 'hochciv_super_secret';
if (process.env.NODE_ENV === 'production') {
    if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
        throw new Error('CRITICAL: DATABASE_URL and SESSION_SECRET environment variables are required in production mode!');
    }
    // These values are public (in this repository) – refuse to run with them
    const KNOWN_DEFAULTS = ['hochciv_super_secret', 'hochciv_prod_secret_h7b82x9q', 'replace_this_with_a_long_random_string'];
    if (KNOWN_DEFAULTS.includes(sessionSecret)) {
        throw new Error('CRITICAL: SESSION_SECRET is a publicly known default. Set a long random value.');
    }
    // A short secret can be guessed offline and session cookies forged: below 25 characters the
    // server refuses to start, below 32 it warns (the generated 64 hex characters are far above)
    if (sessionSecret.length < 25) {
        throw new Error('CRITICAL: SESSION_SECRET is shorter than 25 characters. Set a long random value (docs/operations/configuration.md).');
    }
    if (sessionSecret.length < 32) console.warn('[Security] SESSION_SECRET is shorter than 32 characters – use a longer random value.');
    if (!config.WEBAUTHN) {
        console.warn('[Config] BASE_URL is not set – Google/Discord login will redirect to http://localhost:3000 and fail. ' +
            'Set BASE_URL=https://<your domain> in the .env next to docker-compose.yml.');
    }
}

const pgPool = new pg.Pool({ connectionString: dbUrl });

// gzip for pages and API answers – scripts and styles are gzipped once (utils/assets.js);
// Socket.IO handles its own traffic before Express
app.use(Metrics.httpMiddleware);
app.use(compression());
// CORS answers only the pages that utils/origin.js allows (never `*` – with credentials a
// reflected or wildcard origin would let any site read the visitor's account data)
app.use(cors((req, cb) => cb(null, { origin: allowedOrigin(req.get('origin'), req.get('host')), credentials: true })));
// Changing requests only from this site's pages (utils/origin.js): staging is the same site
app.use(checkOrigin);
// JSON bodies up to 20 KB – a finished single-player game (routes/solo.js, F28) up to 2 MB
const jsonSmall = express.json({ limit: '20kb' }), jsonSolo = express.json({ limit: '2mb' });
app.use((req, res, next) => {
    // Grafana's requests go through untouched (utils/grafana.js)
    if (req.path.startsWith(Grafana.PREFIX + '/')) return next();
    // Express 5 leaves req.body undefined without a JSON body; the routes expect {} (as in Express 4)
    return (req.path.startsWith('/api/solo/') ? jsonSolo : jsonSmall)(req, res, err => {
        if (req.body === undefined) req.body = {};
        next(err);
    });
});
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        // Like X-Frame-Options: SAMEORIGIN, but Discord may frame the game as an Activity
        'Content-Security-Policy': "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com",
        'Referrer-Policy': 'same-origin',
    });
    // HTTPS only from now on (production runs behind TLS; req.secure via trust proxy)
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
});

// Enable trust proxy for Nginx reverse proxy so HTTPS session secure cookies work
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// ── Static files ─────────────────────────────────────────────────────────────
// Before the session: the page's ~30 files would otherwise each read the session, the user and
// update the session in the database. None of them depends on who is logged in.

// Scripts and styles with the current content hash (?v=…, written by inject.js) are kept for a year
const staticOpts = { setHeaders: (res, file, stat) => { if (Assets.isCurrent(res.req, file, stat)) res.set('Cache-Control', Assets.YEAR); } };
app.get('/.well-known/assetlinks.json', (req, res) => res.json(require('./utils/webauthn').assetLinks()));
app.use('/client', Assets.gzipped(path.join(__dirname, 'client')), express.static(path.join(__dirname, 'client'), staticOpts));

// Explicit routes for legal pages at root
app.get('/impressum.html', (req, res) => res.sendFile(path.join(__dirname, 'client/impressum.html')));
app.get('/datenschutz.html', (req, res) => res.sendFile(path.join(__dirname, 'client/datenschutzerklaerung.html')));
app.get('/datenschutzerklaerung.html', (req, res) => res.sendFile(path.join(__dirname, 'client/datenschutzerklaerung.html')));
app.get('/nutzungsbedingungen.html', (req, res) => res.sendFile(path.join(__dirname, 'client/nutzungsbedingungen.html')));
app.get('/nutzungserklaerung.html', (req, res) => res.sendFile(path.join(__dirname, 'client/nutzungsbedingungen.html')));

// The older versions (/v112/, /v110/, /v108/, /v107/ – Rundenspiele started on them) get the same no-op service
// worker and Activity bridge
const OLD_GAME_PATHS = ['', ...require('./engine-adapter').OLD_VERSIONS.map(v => '/' + v)];
app.get(OLD_GAME_PATHS.map(p => p + '/sw.js'), (req, res) => {
    res.type('application/javascript');
    res.send(`
        self.addEventListener('install', e => { self.skipWaiting(); });
        self.addEventListener('activate', e => {
            e.waitUntil(
                caches.keys().then(cacheNames => {
                    return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                })
            );
            self.clients.claim();
        });
        self.addEventListener('fetch', e => {});
    `);
});

// Discord Activity bridge, bundled by activity/build.js (does nothing outside Discord)
const { OUT_FILE: ACTIVITY_BUNDLE } = require('./activity/build');
if (!fs.existsSync(ACTIVITY_BUNDLE)) {
    console.warn('[Activity] Bridge bundle missing – run "npm run build:activity". The Discord Activity is unavailable.');
}
app.get(OLD_GAME_PATHS.map(p => p + '/js/activity.js'), (req, res) => {
    if (Assets.sendGzipped(req, res, ACTIVITY_BUNDLE)) return;
    res.set('Cache-Control', Assets.isCurrent(req, ACTIVITY_BUNDLE) ? Assets.YEAR : 'no-cache');
    res.sendFile(ACTIVITY_BUNDLE, err => {
        if (err && !res.headersSent) res.type('application/javascript').send('/* Discord Activity bundle not built */');
    });
});

// The game with mp.js (public/, scripts/build-public.js) – this makes the game the root /
app.use(Assets.gzipped(path.join(__dirname, 'public')), express.static(path.join(__dirname, 'public'), staticOpts));

const sessionMiddleware = session({
    // no write of the expiry on every answer: refreshSession renews it at most every 15 minutes
    store: new pgSession({ pool: pgPool, tableName: 'session', disableTouch: true }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    // The 30 days count from the last visit, not from the login (without that, players – the app
    // most of all – were logged out 30 days after logging in, however often they played). Not by
    // `rolling` (a cookie and a database write on every answer): SessionCost.refreshSession
    // renews cookie and expiry at most every 15 minutes.
    rolling: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());
app.use(SessionCost.refreshSession);

// The Grafana dashboards of the admin page (tab "Leistung"), for admins only
app.use(Grafana.PREFIX, Grafana.proxy);

// Database schema: migrations (migrations/, utils/migrate.js). In Docker entrypoint.sh has applied
// them already with the owner role – this finds nothing to do; the server's own role (DATABASE_URL)
// can't change the schema. Waits for the database at a cold start.
require('./utils/migrate').migrate(dbUrl).then(async () => {
    const problems = await require('./utils/schema-check').check(sequelize);
    for (const p of problems) console.warn(`[DB] Schema: ${p} – a migration is missing (docs/reference/database.md)`);
    if (!problems.length) console.log('[DB] Schema is current.');
    // facts of older matches for the overall statistics (needs the column `facts`)
    require('./utils/facts').startBackfill();
    // ranked seasons: the current quarter, closing the last one (utils/seasons.js)
    require('./utils/seasons').start();
    // the maps that belong to nobody (maps/builtin.js)
    require('./maps/service').seedBuiltin().catch(err => console.error('[Maps] Seeding the built-in maps failed:', err));
    // the chat ends with the game (async/service.js)
    require('./async/service').purgeEndedChats().catch(err => console.error('[Async] Deleting old chats failed:', err));
    // the admins' words for the chat filter (utils/profanity.js)
    require('./utils/profanity').reload().catch(err => console.error('[Chat filter] Loading the word list failed:', err));

    // Load OAuth strategies from database
    refreshOAuthStrategies().catch(err => console.error('[OAuth] Initial strategy load failed:', err));
}).catch(err => {
    console.error('[DB] Database not ready – giving up:', err.message || err);
    process.exit(1);
});

// A database restart or a failed background task must not end the process (and every live game
// in memory with it): log it and go on
pgPool.on('error', err => console.error('[DB] Idle session-store connection failed:', err.message));
SessionCost.listen(pgPool);              // the user cache follows every change of a users row
process.on('unhandledRejection', err => console.error('[Process] Unhandled rejection:', err));

// Health check
// public, so no uptime: it would reveal restart and deploy times (admins see it in the dashboard)
app.get('/health', (_req, res) => res.json({ ok: true }));

// Local tests only (tests/run-all.js, docs/development/testing.md): forgets every rate-limit counter,
// so each test starts with a full budget, and the caches of what was read from matches, so matches a
// test wrote straight into the database count at once. Never in production, whatever the environment says.
if (process.env.TEST_HOOKS === 'on' && process.env.NODE_ENV !== 'production') {
    console.warn('[Test] TEST_HOOKS=on – POST /api/test/reset resets all rate limits and match caches');
    app.post('/api/test/reset', async (_req, res) => {
        require('./utils/facts').changed();
        require('./utils/account-limits').resetAll();
        require('./async/ladder').changed();
        res.json({ limiters: await require('./utils/rateLimit').resetAll() });
    });
}

// REST API
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');
const mfaRoutes = require('./routes/mfa');
app.use('/api/account', accountRoutes);
// Bot accounts of the logged-in owner (routes/bots.js)
app.use('/api/bots', require('./routes/bots'));
app.use('/api/admin', adminRoutes);
app.use('/api/mfa', mfaRoutes);
// Public player profiles (client/profile.js)
app.use('/api/profile', require('./routes/profile'));
// Finished matches with their statistics and replays (routes/games.js); old replays are deleted
app.use('/api/games', require('./routes/games'));
// Overall statistics over all matches (F13)
app.use('/api/stats', require('./routes/stats'));
require('./utils/replay').startCleanup();
require('./utils/reports').startCleanup();
// Asynchronous games ("Rundenspiele", play by turn)
app.use('/api/async', require('./routes/async'));
// Push notifications of the Android app
app.use('/api/push', require('./routes/push'));
// Custom maps in the account, published with a code (maps/service.js)
app.use('/api/maps', require('./routes/maps'));
// Friends list (utils/friends.js)
app.use('/api/friends', require('./routes/friends'));
// Ranked seasons and the leaderboard (utils/seasons.js)
app.use('/api/seasons', require('./routes/seasons'));
// Weekly challenge (utils/challenge.js)
app.use('/api/challenge', require('./routes/challenge'));
// Single-player games for the statistics (F28, utils/solo.js)
app.use('/api/solo', require('./routes/solo'));
// Discord Activity (Embedded App SDK)
app.use('/api/activity', require('./routes/activity'));

// ── HTTP + Socket.IO ─────────────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        // same rule as Express; same-origin requests need no CORS headers (utils/origin.js)
        origin: (origin, cb) => cb(null, allowedOrigin(origin)),
        methods: ['GET', 'POST'],
        credentials: true
    },
    // CORS doesn't cover WebSockets: only this site's pages may connect (utils/origin.js)
    allowRequest: allowSocket,
    // the largest real message is a custom map in lobby:config (≈ 10 KB, sessions.js caps the
    // config at 10 000 characters); the default 1 MB would let any socket make the server parse
    // megabytes per message
    maxHttpBufferSize: 100 * 1024,
    // Compress larger messages: a game state is mostly its log (in German, plus its parts for
    // every language – utils/logtext.js) and shrinks to about a fifth
    perMessageDeflate: { threshold: 1024 },
});

app.locals.io = io;
// only the handshake: socket.request keeps its session and user, the polls after it skip them
io.engine.use(SessionCost.onlyForHandshake(sessionMiddleware));
io.engine.use(SessionCost.onlyForHandshake(passport.initialize()));
io.engine.use(SessionCost.onlyForHandshake(passport.session()));
io.engine.use(SessionCost.onlyForHandshake(SessionCost.refreshSession));
// A rate limit for every event of every socket (utils/socket-limit.js, R-15)
io.on('connection', socket => require('./utils/socket-limit').attach(socket));
// Limits per account: sockets at once, moves, a bot's calls and chat (utils/account-limits.js, P1.11)
const AccountLimits = require('./utils/account-limits');
AccountLimits.init(io);
io.on('connection', socket => AccountLimits.attach(socket));

registerGame(io);
registerAsync(io);
// Ranked matchmaking (sockets/match.js)
require('./sockets/match')(io);
// Friends: online status and live invitations (sockets/friends.js)
require('./sockets/friends')(io);
Metrics.instrumentGame({ io, sessions: require('./sessions'), sequelize });
Metrics.serve();

// ── Start ────────────────────────────────────────────────────────────────────

// Shutting down (a deploy, Watchtower, a reboot: Docker sends SIGTERM and waits stop_grace_period,
// docker-compose*.yml): running live games are kept as Rundenspiele (sockets/game.js), then exit.
let stopping = false;
async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`[Shutdown] ${signal}: live games go on as Rundenspiele`);
    setTimeout(() => process.exit(0), 50 * 1000).unref();          // never hang past Docker's grace period
    try {
        const done = await registerGame.convertAllOnShutdown(io);
        console.log(`[Shutdown] ${done.filter(x => x.asyncId).length} of ${done.length} live games converted`);
    } catch (err) {
        console.error('[Shutdown] Converting live games failed:', err);
    }
    // Rundenspiele with changes not yet written (saving waits ASYNC_FLUSH_MS); from now on at once
    try {
        await require('./async/service').flushAll();
    } catch (err) {
        console.error('[Shutdown] Saving Rundenspiele failed:', err);
    }
    setTimeout(() => process.exit(0), 1000);                         // the 'game:toAsync' messages still go out
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(config.PORT, () => {
    console.log(`Hochciv Multiplayer-Server läuft auf Port ${config.PORT}`);
    console.log(`  REST:   http://localhost:${config.PORT}/api/sessions`);
    console.log(`  WS:     ws://localhost:${config.PORT}`);
    console.log(`  Health: http://localhost:${config.PORT}/health`);
});
