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
const { checkOrigin, allowSocket } = require('./utils/origin');
const Assets = require('./utils/assets');

// ── Passport Configuration ──────────────────────────────────────────────────
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
            if (!user || !user.password_hash) return done(null, false, { message: 'Incorrect username or email.' });
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
        // A banned (or deleted) user is logged out on the next request
        done(null, user && !user.isBanned ? user : false);
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

// gzip for pages, scripts and API answers (Socket.IO handles its own traffic before Express)
app.use(compression());
app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
// Changing requests only from this site's pages (utils/origin.js): staging is the same site
app.use(checkOrigin);
app.use(express.json({ limit: '20kb' }));
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        // Like X-Frame-Options: SAMEORIGIN, but Discord may frame the game as an Activity
        'Content-Security-Policy': "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com",
        'Referrer-Policy': 'same-origin',
    });
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
app.use('/client', express.static(path.join(__dirname, 'client'), staticOpts));

// Explicit routes for legal pages at root
app.get('/impressum.html', (req, res) => res.sendFile(path.join(__dirname, 'client/impressum.html')));
app.get('/datenschutz.html', (req, res) => res.sendFile(path.join(__dirname, 'client/datenschutzerklaerung.html')));
app.get('/datenschutzerklaerung.html', (req, res) => res.sendFile(path.join(__dirname, 'client/datenschutzerklaerung.html')));
app.get('/nutzungsbedingungen.html', (req, res) => res.sendFile(path.join(__dirname, 'client/nutzungsbedingungen.html')));
app.get('/nutzungserklaerung.html', (req, res) => res.sendFile(path.join(__dirname, 'client/nutzungsbedingungen.html')));

// The older versions (/v96/, /v93/, /v83/ – Rundenspiele started on them) get the same no-op service
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
    res.set('Cache-Control', Assets.isCurrent(req, ACTIVITY_BUNDLE) ? Assets.YEAR : 'no-cache');
    res.sendFile(ACTIVITY_BUNDLE, err => {
        if (err && !res.headersSent) res.type('application/javascript').send('/* Discord Activity bundle not built */');
    });
});

// The game with mp.js (public/, scripts/build-public.js) – this makes the game the root /
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

const sessionMiddleware = session({
    store: new pgSession({ pool: pgPool, tableName: 'session' }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

// Initialize ORM
sequelize.sync({ alter: true }).then(() => {
    console.log('[DB] Sequelize synced tables.');
    // facts of older matches for the overall statistics (needs the column `facts`)
    require('./utils/facts').startBackfill();
    // the admins' words for the chat filter (utils/profanity.js)
    require('./utils/profanity').reload().catch(err => console.error('[Chat filter] Loading the word list failed:', err));
    sequelize.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
        )
        WITH (OIDS=FALSE);
    `).then(() => {
        sequelize.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`).catch(() => { });
    }).catch(e => console.error('[DB] Session table init error', e));

    // Load OAuth strategies from database
    refreshOAuthStrategies().catch(err => console.error('[OAuth] Initial strategy load failed:', err));
});

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
});

app.locals.io = io;
io.engine.use(sessionMiddleware);
io.engine.use(passport.initialize());
io.engine.use(passport.session());

registerGame(io);
registerAsync(io);
// Ranked matchmaking (sockets/match.js)
require('./sockets/match')(io);

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(config.PORT, () => {
    console.log(`Hochciv Multiplayer-Server läuft auf Port ${config.PORT}`);
    console.log(`  REST:   http://localhost:${config.PORT}/api/sessions`);
    console.log(`  WS:     ws://localhost:${config.PORT}`);
    console.log(`  Health: http://localhost:${config.PORT}/health`);
});
