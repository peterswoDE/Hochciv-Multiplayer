const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const apiRoutes = require('./routes/api');
const registerGame = require('./sockets/game');

// ── Express ──────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: config.CORS_ORIGINS }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// REST API
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
    },
});

registerGame(io);

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(config.PORT, () => {
    console.log(`Hochciv Multiplayer-Server läuft auf Port ${config.PORT}`);
    console.log(`  REST:   http://localhost:${config.PORT}/api/sessions`);
    console.log(`  WS:     ws://localhost:${config.PORT}`);
    console.log(`  Health: http://localhost:${config.PORT}/health`);
});
