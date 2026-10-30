/**
 * Long caching for the page's scripts and styles. inject.js writes a content hash into every
 * script and stylesheet tag of index.html (js/ui.js?v=<hash>); server.js lets the browser keep
 * such a file for a year as long as the hash still matches the file. A new deploy changes the
 * hash, so the browser fetches the new file – index.html itself is always checked again.
 */
const crypto = require('crypto');
const fs = require('fs');

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

module.exports = { YEAR, hashOf, isCurrent, versioned };
