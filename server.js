const express = require('express');
const http = require('http');
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

app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
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
// Asynchronous games ("Rundenspiele", play by turn)
app.use('/api/async', require('./routes/async'));
// Custom maps in the account, published with a code (maps/service.js)
app.use('/api/maps', require('./routes/maps'));
// Discord Activity (Embedded App SDK)
app.use('/api/activity', require('./routes/activity'));

// Host static frontend files 
const path = require('path');
app.use('/client', express.static(path.join(__dirname, 'client')));

// Explicit routes for legal pages at root
app.get('/impressum.html', (req, res) => res.sendFile(path.join(__dirname, 'client/impressum.html')));
app.get('/datenschutz.html', (req, res) => res.sendFile(path.join(__dirname, 'client/datenschutzerklaerung.html')));
app.get('/datenschutzerklaerung.html', (req, res) => res.sendFile(path.join(__dirname, 'client/datenschutzerklaerung.html')));
app.get('/nutzungsbedingungen.html', (req, res) => res.sendFile(path.join(__dirname, 'client/nutzungsbedingungen.html')));
app.get('/nutzungserklaerung.html', (req, res) => res.sendFile(path.join(__dirname, 'client/nutzungsbedingungen.html')));

// /v83/ (Rundenspiele started on v83) gets the same no-op service worker and Activity bridge
app.get(['/sw.js', '/v83/sw.js'], (req, res) => {
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
const fs = require('fs');
if (!fs.existsSync(ACTIVITY_BUNDLE)) {
    console.warn('[Activity] Bridge bundle missing – run "npm run build:activity". The Discord Activity is unavailable.');
}
app.get(['/js/activity.js', '/v83/js/activity.js'], (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(ACTIVITY_BUNDLE, err => {
        if (err && !res.headersSent) res.type('application/javascript').send('/* Discord Activity bundle not built */');
    });
});

// 3. Serve public game assets (js, css) as a fallback (this makes the game the root /)
app.use(express.static(path.join(__dirname, 'public')));


// ── HTTP + Socket.IO ─────────────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: config.CORS_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true
    },
});

app.locals.io = io;
io.engine.use(sessionMiddleware);
io.engine.use(passport.initialize());
io.engine.use(passport.session());

registerGame(io);
registerAsync(io);

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(config.PORT, () => {
    console.log(`Hochciv Multiplayer-Server läuft auf Port ${config.PORT}`);
    console.log(`  REST:   http://localhost:${config.PORT}/api/sessions`);
    console.log(`  WS:     ws://localhost:${config.PORT}`);
    console.log(`  Health: http://localhost:${config.PORT}/health`);
});
