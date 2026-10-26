/**
 * Which web pages may use a visitor's login here. The session cookie is SameSite=Lax: other
 * sites never send it, but pages of the same site do – staging.hochciv.de is the same site as
 * hochciv.de. CORS doesn't cover WebSockets, and simple POSTs (forms) get through before CORS
 * blocks the answer. So Socket.IO connections and changing API requests (POST, PUT, PATCH, DELETE)
 * from a page must come from:
 *
 *   · this server itself (the Origin's host is the request's Host – nginx forwards it) or
 *     BASE_URL;
 *   · the Discord Activity: Discord serves the game from <app id>.discordsays.com and forwards the
 *     requests. That is another site, so the browser sends no cookie from there anyway;
 *   · the extra origins in ALLOWED_ORIGINS (comma-separated, e.g. a second domain).
 *
 * Requests without an Origin header come from no web page (the Android app's native code,
 * scripts, curl) and pass – a browser always sends one with these requests.
 */
const config = require('../config');

const DISCORD_ACTIVITY = /^https:\/\/[a-z0-9-]+\.discordsays\.com$/i;
const EXTRA = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function allowedOrigin(origin, host) {
    if (!origin) return true;
    let url;
    try { url = new URL(origin); } catch (_) { return false; }
    if (host && url.host === host) return true;
    if (config.BASE_URL && url.origin === new URL(config.BASE_URL).origin) return true;
    return DISCORD_ACTIVITY.test(url.origin) || EXTRA.includes(url.origin);
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Express: refuse changing requests from foreign pages. */
function checkOrigin(req, res, next) {
    if (SAFE.has(req.method) || allowedOrigin(req.get('origin'), req.get('host'))) return next();
    console.warn(`[Security] Refused ${req.method} ${req.originalUrl} from origin ${req.get('origin')}`);
    res.status(403).json({ error: 'Anfrage von einer fremden Seite abgelehnt.' });
}

/** Socket.IO `allowRequest`: the handshake must come from an allowed page too. */
function allowSocket(req, callback) {
    const ok = allowedOrigin(req.headers.origin, req.headers.host);
    if (!ok) console.warn(`[Security] Refused a socket connection from origin ${req.headers.origin}`);
    callback(null, ok);
}

module.exports = { allowedOrigin, checkOrigin, allowSocket };
