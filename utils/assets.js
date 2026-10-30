/**
 * Long caching for the page's scripts and styles. inject.js writes a content hash into every
 * script and stylesheet tag of index.html (js/ui.js?v=<hash>); server.js lets the browser keep
 * such a file for a year as long as the hash still matches the file. A new deploy changes the
 * hash, so the browser fetches the new file – index.html itself is always checked again.
 *
 * These files are also gzipped only once (and again when one changes), not on every request:
 * a first visit asks for ~30 of them at the same time.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const YEAR = 'public, max-age=31536000, immutable';
const memo = new Map();                    // file → { key, hash }

/** The first 12 hex digits of the file's SHA-1; null when it does not exist. */
function hashOf(file, stat) {
    try {
        stat = stat || fs.statSync(file);
        const key = `${stat.mtimeMs}:${stat.size}`;
        const m = memo.get(file);
        if (m && m.key === key) return m.hash;
        const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
        memo.set(file, { key, hash });
        return hash;
    } catch (e) {
        return null;
    }
}

/** True when `?v=` of the request is the hash of the file being sent. */
const isCurrent = (req, file, stat) => !!req.query.v && req.query.v === hashOf(file, stat);

/**
 * The tags of `html` with `?v=<hash>` on every local .js / .css. `resolve(url)` names the file
 * behind a url, or null to leave it as it is. Hashes written before are replaced.
 */
function versioned(html, resolve) {
    return html.replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")([^"?#]+\.(?:js|css))(?:\?v=[^"]*)?"/g, (all, head, url) => {
        const file = /^[a-z]+:|^\/\//i.test(url) ? null : resolve(url);
        const hash = file && hashOf(file);
        return hash ? `${head}${url}?v=${hash}"` : `${head}${url}"`;
    });
}

const zipped = new Map();                  // file → { key, body, etag }

function gzipOf(file, stat) {
    const key = `${stat.mtimeMs}:${stat.size}`;
    let z = zipped.get(file);
    if (z && z.key === key) return z;
    try {
        const body = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
        z = { key, body, etag: `W/"${hashOf(file, stat)}-gz"` };
        zipped.set(file, z);
        return z;
    } catch (e) {
        return null;
    }
}

/**
 * Sends `file` gzipped from memory when the browser accepts gzip. False when it does not (or
 * the file is missing) – then the caller sends it as before.
 */
function sendGzipped(req, res, file, stat) {
    if (!req.acceptsEncodings('gzip')) return false;
    try { stat = stat || fs.statSync(file); } catch (e) { return false; }
    const z = stat.isFile() && gzipOf(file, stat);
    if (!z) return false;
    res.set({
        'Content-Type': res.type(path.extname(file)).get('Content-Type'),
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding',
        'ETag': z.etag,
        'Cache-Control': isCurrent(req, file, stat) ? YEAR : 'public, max-age=0',
    });
    res.send(z.body);                      // 304 when the browser's copy is still current
    return true;
}

/** The scripts and styles under `root` gzipped from memory; everything else goes on (express.static). */
function gzipped(root) {
    root = path.resolve(root);
    return (req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || !/\.(?:js|css)$/.test(req.path)) return next();
        let file;
        try { file = path.join(root, decodeURIComponent(req.path)); } catch (e) { return next(); }
        if (!file.startsWith(root + path.sep)) return next();
        fs.stat(file, (err, stat) => {
            if (err || !sendGzipped(req, res, file, stat)) next();
        });
    };
}

module.exports = { YEAR, hashOf, isCurrent, versioned, sendGzipped, gzipped };
