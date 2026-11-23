/**
 * Performance figures for Prometheus and the Grafana dashboards in the admin page
 * (monitoring/, docs/operations/monitoring.md).
 *
 *   · process: CPU, memory, garbage collection, event-loop lag (prom-client's defaults)
 *   · HTTP: duration of every answer by route (the Express route pattern, not the URL, so ids
 *     don't make a series each)
 *   · database: duration of every query by type (SELECT, INSERT …) and the pool (in use, idle,
 *     waiting)
 *   · the game: open sockets, live games, matches of the last 24 hours (people, bots only,
 *     single-player)
 *
 * The figures are served on their own port (METRICS_PORT, default 9464) – reachable only inside
 * the Docker network, where Prometheus reads them; nginx doesn't proxy it.
 */
const http = require('http');
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'hochciv_' });

const httpDuration = new client.Histogram({
    name: 'hochciv_http_request_duration_seconds',
    help: 'Duration of HTTP answers by route',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
});
const dbDuration = new client.Histogram({
    name: 'hochciv_db_query_duration_seconds',
    help: 'Duration of database queries by type',
    labelNames: ['type'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
});

/** The route of an answer: the Express pattern (/api/profile/:id), else a coarse group. */
function routeOf(req) {
    if (req.route && req.route.path) return (req.baseUrl || '') + req.route.path;
    const p = req.path || '';
    if (p.startsWith('/admin/grafana')) return '/admin/grafana';
    if (p.startsWith('/client/') || /\.\w+$/.test(p)) return 'static';
    if (p.startsWith('/api/')) return p.split('/').slice(0, 3).join('/') + '/*';
    return 'other';
}

/** Express middleware: times every answer. */
function httpMiddleware(req, res, next) {
    const end = httpDuration.startTimer();
    res.on('finish', () => end({ method: req.method, route: routeOf(req), status: String(res.statusCode)[0] + 'xx' }));
    next();
}

/** Times every query of `sequelize` (models and raw queries go through sequelize.query). */
function instrumentSequelize(sequelize) {
    const query = sequelize.query;
    sequelize.query = function (sql, options) {
        const end = dbDuration.startTimer();
        const type = (options && options.type) || (typeof sql === 'string' ? (sql.trim().split(/\s+/)[0] || 'RAW').toUpperCase() : 'RAW');
        const done = () => end({ type: String(type).slice(0, 20) });
        const p = query.apply(this, arguments);
        p.then(done, done);
        return p;
    };
    const pool = () => sequelize.connectionManager && sequelize.connectionManager.pool;
    new client.Gauge({
        name: 'hochciv_db_pool_connections',
        help: 'Connections of the database pool',
        labelNames: ['state'],
        registers: [register],
        collect() {
            const p = pool();
            if (!p) return;
            this.set({ state: 'using' }, p.using || 0);
            this.set({ state: 'idle' }, p.available || 0);
            this.set({ state: 'waiting' }, p.waiting || 0);
        },
    });
}

/** Live figures of the game: sockets, live games, matches of the last day. */
function instrumentGame({ io, sessions, sequelize }) {
    new client.Gauge({
        name: 'hochciv_sockets', help: 'Open Socket.IO connections', registers: [register],
        collect() { this.set(io.engine.clientsCount || 0); },
    });
    new client.Gauge({
        name: 'hochciv_live_sessions', help: 'Live lobbies and games in memory', registers: [register],
        collect() { this.set(sessions.getAllSessions().size || 0); },
    });
    // read at most once a minute: Prometheus asks every 15 seconds
    let last = null, at = 0;
    new client.Gauge({
        name: 'hochciv_matches_24h',
        help: 'Matches stored in the last 24 hours: with people, bots only, single-player',
        labelNames: ['kind'],
        registers: [register],
        async collect() {
            if (!last || Date.now() - at > 60 * 1000) {
                try {
                    const [[r]] = await sequelize.query(`
                        SELECT count(*) FILTER (WHERE solo)::int AS solo,
                               count(*) FILTER (WHERE NOT solo AND people = 0)::int AS bots,
                               count(*) FILTER (WHERE NOT solo AND people > 0)::int AS people
                        FROM (SELECT EXISTS (SELECT 1 FROM json_array_elements(g.participants) p WHERE (p->>'solo') = 'true') AS solo,
                                     (SELECT count(*) FROM json_array_elements(g.participants) p
                                      WHERE coalesce(p->>'isBot', 'false') <> 'true' AND coalesce(p->>'botAccount', 'false') <> 'true') AS people
                              FROM games g WHERE g."matchDate" > now() - interval '24 hours') m`);
                    last = r; at = Date.now();
                } catch (_) { /* the database is away: keep the last figures */ }
            }
            if (last) for (const k of ['people', 'bots', 'solo']) this.set({ kind: k }, last[k] || 0);
        },
    });
}

/** The figures on their own port, for Prometheus only. */
function serve(port = Number(process.env.METRICS_PORT) || 9464) {
    if (process.env.METRICS_PORT === 'off') return null;
    const server = http.createServer(async (req, res) => {
        if (req.url !== '/metrics') { res.writeHead(404).end(); return; }
        try {
            const body = await register.metrics();
            res.writeHead(200, { 'Content-Type': register.contentType }).end(body);
        } catch (err) {
            res.writeHead(500).end(String(err && err.message));
        }
    });
    server.on('error', err => console.error('[Metrics] Port', port, err.message));
    server.listen(port, () => console.log(`[Metrics] Prometheus figures on port ${port} (/metrics)`));
    return server;
}

module.exports = { register, httpMiddleware, instrumentSequelize, instrumentGame, serve, routeOf };
