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
const { Op } = require('sequelize');
const { refreshOAuthStrategies } = require('./utils/oauth');
const { str } = require('./utils/auth');
const { botUsable } = require('./utils/bots');
const { checkOrigin, allowSocket } = require('./utils/origin');
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

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findByPk(id);
        // A banned (or deleted) user is logged out on the next request – a bot also when its
        // owner is banned or may no longer run bots (utils/bots.js)
        if (!user || user.isBanned) return done(null, false);
        if (user.accountType === 'bot') {
            const owner = user.ownerId ? await User.findByPk(user.ownerId) : null;
            if (botUsable(user, owner)) return done(null, false);
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
    if (sessionSecret.length < 32) console.warn('[Security] SESSION_SECRET is shorter than 32 characters.');
    if (!config.WEBAUTHN) {
        console.warn('[Config] BASE_URL is not set – Google/Discord login will redirect to http://localhost:3000 and fail. ' +
            'Set BASE_URL=https://<your domain> in the .env next to docker-compose.yml.');
    }
}

const pgPool = new pg.Pool({ connectionString: dbUrl });

// gzip for pages and API answers – scripts and styles are gzipped once (utils/assets.js);
// Socket.IO handles its own traffic before Express
app.use(compression());
app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
// Changing requests only from this site's pages (utils/origin.js): staging is the same site
app.use(checkOrigin);
// JSON bodies up to 20 KB – a finished single-player game (routes/solo.js, F28) up to 2 MB
const jsonSmall = express.json({ limit: '20kb' }), jsonSolo = express.json({ limit: '2mb' });
app.use((req, res, next) => (req.path.startsWith('/api/solo/') ? jsonSolo : jsonSmall)(req, res, next));
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

// The older versions (/v107/, /v106/, /v100/, /v98/ – Rundenspiele started on them) get the same no-op service
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
    store: new pgSession({ pool: pgPool, tableName: 'session' }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    // Every answer renews the cookie (and the store's expiry): the 30 days count from the last
    // visit, not from the login. Without it, players – the app most of all – were logged out
    // 30 days after logging in, however often they played.
    rolling: true,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

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
process.on('unhandledRejection', err => console.error('[Process] Unhandled rejection:', err));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

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
        origin: config.CORS_ORIGINS,
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
io.engine.use(sessionMiddleware);
io.engine.use(passport.initialize());
io.engine.use(passport.session());

registerGame(io);
registerAsync(io);
// Ranked matchmaking (sockets/match.js)
require('./sockets/match')(io);
// Friends: online status and live invitations (sockets/friends.js)
require('./sockets/friends')(io);

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(config.PORT, () => {
    console.log(`Hochciv Multiplayer-Server läuft auf Port ${config.PORT}`);
    console.log(`  REST:   http://localhost:${config.PORT}/api/sessions`);
    console.log(`  WS:     ws://localhost:${config.PORT}`);
    console.log(`  Health: http://localhost:${config.PORT}/health`);
});
