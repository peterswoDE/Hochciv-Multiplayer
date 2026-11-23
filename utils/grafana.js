/**
 * The Grafana dashboards inside the admin page (client/admin.js, tab "Leistung"): Grafana runs in
 * its own container on the internal Docker network only, and this server passes /admin/grafana/…
 * through to it – for admins only. Grafana trusts the header X-WEBAUTH-USER (auth.proxy) and has
 * no login of its own; the header a browser sends is always replaced.
 *
 * GRAFANA_URL (e.g. http://hochciv-grafana:3000): without it the tab says monitoring is off.
 * See docs/operations/monitoring.md.
 */
const http = require('http');

const PREFIX = '/admin/grafana';
const ADMIN_ROLES = ['admin', 'superadmin', 'reviewadmin'];
// headers that only concern this hop
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

const target = () => {
    const raw = process.env.GRAFANA_URL;
    if (!raw) return null;
    try { return new URL(raw); } catch (_) { return null; }
};
const enabled = () => !!target();

/** Only Grafana's own cookies go to Grafana – not the game's session. */
const grafanaCookies = cookie => (cookie || '').split(';').map(c => c.trim()).filter(c => c.startsWith('grafana_')).join('; ');

function proxy(req, res) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !ADMIN_ROLES.includes(req.user.role)) {
        res.status(403).send('Nur für Administratoren');
        return;
    }
    const t = target();
    if (!t) { res.status(503).send('Monitoring ist nicht eingerichtet (GRAFANA_URL).'); return; }

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (!HOP.has(k) && !k.startsWith('x-webauth-') && k !== 'cookie') headers[k] = v;
    }
    const cookies = grafanaCookies(req.headers.cookie);
    if (cookies) headers.cookie = cookies;
    headers['x-webauth-user'] = req.user.username;
    // the super admin may edit dashboards, everybody else looks (the review admin as well)
    headers['x-webauth-role'] = req.user.role === 'superadmin' ? 'Admin' : 'Viewer';
    headers['x-forwarded-for'] = req.ip;

    const up = http.request({
        protocol: t.protocol, hostname: t.hostname, port: t.port || 80,
        method: req.method, path: req.originalUrl, headers,
    }, r => {
        const out = {};
        for (const [k, v] of Object.entries(r.headers)) if (!HOP.has(k)) out[k] = v;
        res.writeHead(r.statusCode, out);
        r.pipe(res);
    });
    up.setTimeout(60 * 1000, () => up.destroy(new Error('timeout')));
    up.on('error', err => {
        if (!res.headersSent) res.status(502).send('Grafana ist nicht erreichbar.');
        else res.end();
        console.error('[Grafana]', err.message);
    });
    req.pipe(up);
}

module.exports = { PREFIX, proxy, enabled, grafanaCookies };
