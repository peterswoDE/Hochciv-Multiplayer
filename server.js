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
const { sequelize, User } = require('./models');

// ── Passport Configuration ──────────────────────────────────────────────────
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const user = await User.findOne({ where: { username } });
            if (!user) return done(null, false, { message: 'Incorrect username.' });
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
const pgPool = new pg.Pool({ connectionString: dbUrl });

app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
app.use(express.json());

const sessionMiddleware = session({
    store: new pgSession({ pool: pgPool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'hochciv_super_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
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
          "expire" timestamp(6) NOT NULL
        )
        WITH (OIDS=FALSE);
    `).then(() => {
        sequelize.query(`ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;`).catch(() => { });
        sequelize.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`).catch(() => { });
    });
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// REST API
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Host static frontend files from 'public' directory
const path = require('path');
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
