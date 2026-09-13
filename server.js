const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const apiRoutes = require('./routes/api');
const registerGame = require('./sockets/game');

const pg = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { sequelize, User, OAuthProvider } = require('./models');
const { Op } = require('sequelize');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;

// ── Passport Configuration ──────────────────────────────────────────────────
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const user = await User.findOne({
                where: {
                    [Op.or]: [
                        { username: username },
                        { email: username }
                    ]
                }
            });
            if (!user) return done(null, false, { message: 'Incorrect username or email.' });
            const match = await bcrypt.compare(password, user.password_hash);
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
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// ── Express ──────────────────────────────────────────────────────────────────

const app = express();

const dbUrl = process.env.DATABASE_URL || 'postgres://hochciv:password123@hochciv-db:5432/hochciv';
const sessionSecret = process.env.SESSION_SECRET || 'hochciv_super_secret';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (process.env.NODE_ENV === 'production' && (!process.env.DATABASE_URL || !process.env.SESSION_SECRET)) {
    throw new Error('CRITICAL: DATABASE_URL and SESSION_SECRET environment variables are required in production mode!');
}

const pgPool = new pg.Pool({ connectionString: dbUrl });

app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
app.use(express.json());

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

// Host static frontend files 
const path = require('path');
app.use('/client', express.static(path.join(__dirname, 'client')));

app.get('/sw.js', (req, res) => {
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

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(config.PORT, () => {
    console.log(`Hochciv Multiplayer-Server läuft auf Port ${config.PORT}`);
    console.log(`  REST:   http://localhost:${config.PORT}/api/sessions`);
    console.log(`  WS:     ws://localhost:${config.PORT}`);
    console.log(`  Health: http://localhost:${config.PORT}/health`);
});

// ── Dynamic OAuth Strategy Loading ──────────────────────────────────────────

async function handleOAuthProfile(req, provider, idField, profile, done) {
    try {
        const providerIdValue = profile.id;
        const email = (profile.emails && profile.emails.length > 0) ? profile.emails[0].value : null;
        const displayName = profile.displayName || profile.username || (email ? email.split('@')[0] : `${provider}_user_${providerIdValue.slice(0, 6)}`);
        const avatar = (profile.photos && profile.photos.length > 0) ? profile.photos[0].value : null;

        // 0. Manual explicit link if already logged in via session
        if (req.user) {
            let user = req.user;
            user[idField] = providerIdValue;
            if (avatar && !user.avatarUrl) user.avatarUrl = avatar;
            await user.save();
            return done(null, user);
        }

        // 1. Find by provider ID
        let user = await User.findOne({ where: { [idField]: providerIdValue } });
        if (user) {
            if (avatar && !user.avatarUrl) {
                user.avatarUrl = avatar;
                await user.save();
            }
            return done(null, user);
        }

        // 2. Find by email and link
        if (email) {
            user = await User.findOne({ where: { email } });
            if (user) {
                user[idField] = providerIdValue;
                if (avatar && !user.avatarUrl) user.avatarUrl = avatar;
                await user.save();
                return done(null, user);
            }
        }

        // 3. Create new user
        // Ensure unique username
        let username = displayName.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
        const existingUsername = await User.findOne({ where: { username } });
        if (existingUsername) {
            username = `${username}_${providerIdValue.slice(0, 5)}`;
        }

        user = await User.create({
            username,
            email: email || `${provider}_${providerIdValue}@oauth.local`,
            password_hash: null,
            isActive: true,
            [idField]: providerIdValue,
            avatarUrl: avatar,
        });

        return done(null, user);
    } catch (err) {
        console.error(`[OAuth] ${provider} profile handling error:`, err);
        return done(err);
    }
}

async function refreshOAuthStrategies() {
    try {
        const providers = await OAuthProvider.findAll();

        for (const p of providers) {
            if (!p.clientId || !p.clientSecret) continue;

            if (p.provider === 'google') {
                // Unregister old strategy if exists
                if (passport._strategies && passport._strategies['google']) delete passport._strategies['google'];
                if (p.enabled) {
                    passport.use('google', new GoogleStrategy({
                        clientID: p.clientId,
                        clientSecret: p.clientSecret,
                        callbackURL: `${BASE_URL}/api/auth/google/callback`,
                        scope: ['profile', 'email'],
                        passReqToCallback: true,
                    }, (req, accessToken, refreshToken, profile, done) => {
                        handleOAuthProfile(req, 'google', 'googleId', profile, done);
                    }));
                    console.log('[OAuth] Google strategy registered.');
                }
            } else if (p.provider === 'discord') {
                if (passport._strategies && passport._strategies['discord']) delete passport._strategies['discord'];
                if (p.enabled) {
                    passport.use('discord', new DiscordStrategy({
                        clientID: p.clientId,
                        clientSecret: p.clientSecret,
                        callbackURL: `${BASE_URL}/api/auth/discord/callback`,
                        scope: ['identify', 'email'],
                        passReqToCallback: true,
                    }, (req, accessToken, refreshToken, profile, done) => {
                        handleOAuthProfile(req, 'discord', 'discordId', profile, done);
                    }));
                    console.log('[OAuth] Discord strategy registered.');
                }
            }
        }
    } catch (err) {
        console.error('[OAuth] Failed to refresh strategies:', err);
    }
}

module.exports = { refreshOAuthStrategies };
