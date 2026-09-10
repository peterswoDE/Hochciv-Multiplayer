
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
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// REST API
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);

  // Host static frontend files
  const path = require('path');
  
  // 1. Serve custom portal first (shadows public/index.html)
  
app.get('/sw.js', (req, res) => {
    res.type('application/javascript');
    res.send(`
        self.addEventListener('install', e => { self.skipWaiting(); });
        self.addEventListener('activate', e => {
            e.waitUntil(self.registration.unregister().then(() => self.clients.claim()));
        });
        self.addEventListener('fetch', e => {
            e.respondWith(fetch(e.request));
        });
    `);
});

app.use(express.static(path.join(__dirname, 'client')));

  
  // 2. Explicitly serve the game at /game
  app.get('/account', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'account.html'));
});

app.get('/game', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  // 3. Serve public game assets (js, css) as a fallback
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
