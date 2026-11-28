/**
 * What a logged-in request costs (scalability P1.7). Without this every answer and every
 * Socket.IO poll read the session, read the user (and a bot's owner) and wrote the session's
 * expiry back to the database.
 *
 *   · refreshSession – the 30 days of a session count from the last visit (as with `rolling`),
 *     but the cookie and the store's expiry are renewed at most every REFRESH_MS, not on every
 *     answer. Needs `rolling: false` and the store's `disableTouch`.
 *   · loadUser       – passport's deserializeUser with a short cache (USER_TTL_MS). Every request
 *     gets its own model instance (built from the cached row), so nothing one request changes
 *     leaks into another. Every change of a users row – the model, a raw query, psql – drops it
 *     at once: a trigger announces it on the channel hochciv_user_changed (migration 0008), which
 *     `listen` follows. While that listener is not connected nothing is cached.
 *   · onlyForHandshake – Express middleware for io.engine: only the Socket.IO handshake needs the
 *     session (socket.request keeps it); the later polls and the upgrade carry a sid and skip it.
 */
const REFRESH_MS = 15 * 60 * 1000;
const USER_TTL_MS = Number(process.env.USER_CACHE_MS) >= 0 && process.env.USER_CACHE_MS !== undefined && process.env.USER_CACHE_MS !== ''
    ? Number(process.env.USER_CACHE_MS) : 60 * 1000;
const MAX_USERS = 5000;

/** After passport.session(): renew a logged-in session at most every REFRESH_MS. */
function refreshSession(req, res, next) {
    const s = req.session;
    if (s && s.passport && s.passport.user && !(Date.now() - (s.seenAt || 0) < REFRESH_MS)) {
        s.seenAt = Date.now();          // a change: express-session saves it and sets the cookie anew
    }
    next();
}

function onlyForHandshake(mw) {
    return (req, res, next) => {
        const isHandshake = req._query && req._query.sid === undefined;
        if (isHandshake) mw(req, res, next); else next();
    };
}

const CHANNEL = 'hochciv_user_changed';
const rows = new Map();          // id → { row (plain values), at, done (false: being read) }
let listening = false;           // the cache is used only while changes are announced to us

/**
 * Follow the changes of users rows (a connection of its own from `pool`, a pg.Pool). On a lost
 * connection the cache is emptied and switched off until the listener is back (retry 5 s).
 */
function listen(pool) {
    if (!(USER_TTL_MS > 0)) return;
    let client = null;
    const retry = () => setTimeout(start, 5000).unref();
    const lost = err => {
        if (!client) return;
        listening = false;
        rows.clear();
        console.warn('[Users] Change listener lost, user cache off:', err && err.message);
        const c = client; client = null;
        c.removeAllListeners('notification');
        try { c.release(true); } catch (_) { /* gone already */ }
        retry();
    };
    async function start() {
        try {
            client = await pool.connect();
            client.on('notification', n => { if (n.channel === CHANNEL) rows.delete(String(n.payload)); });
            client.on('error', lost);
            client.on('end', () => lost(new Error('connection ended')));
            await client.query(`LISTEN ${CHANNEL}`);
            rows.clear();
            listening = true;
        } catch (err) {
            if (client) lost(err); else { console.warn('[Users] Change listener failed:', err.message); retry(); }
        }
    }
    start();
}

function makeLoader(User) {
    const drop = id => { if (id) rows.delete(String(id)); };
    User.addHook('afterSave', u => drop(u.id));
    User.addHook('afterDestroy', u => drop(u.id));
    // User.update / User.destroy with a where: the ids if the where names them, else everything
    const dropWhere = options => {
        const id = options && options.where && options.where.id;
        if (typeof id === 'string' || typeof id === 'number') drop(id);
        else if (Array.isArray(id)) id.forEach(drop);
        else rows.clear();
    };
    User.addHook('afterBulkUpdate', dropWhere);
    User.addHook('afterBulkDestroy', dropWhere);

    /** The user, from the cache if it is fresh; null if there is none. */
    return async function loadUser(id) {
        if (id == null) return null;
        const key = String(id);
        const hit = rows.get(key);
        if (hit && hit.done && listening && Date.now() - hit.at < USER_TTL_MS) {
            return hit.row ? User.build(structuredClone(hit.row), { isNewRecord: false, raw: true }) : null;
        }
        // a change while the row is read drops `mark` – then the row is not kept
        const mark = { row: null, at: Date.now(), done: false };
        if (listening) {
            if (rows.size >= MAX_USERS) rows.delete(rows.keys().next().value);
            rows.set(key, mark);
        }
        const user = await User.findByPk(id);
        if (rows.get(key) === mark) Object.assign(mark, { row: user ? user.get({ plain: true }) : null, done: true });
        return user;
    };
}

module.exports = { refreshSession, onlyForHandshake, makeLoader, listen, REFRESH_MS, USER_TTL_MS };
