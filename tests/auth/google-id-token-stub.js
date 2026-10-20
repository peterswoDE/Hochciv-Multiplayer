/**
 * TEST ONLY – never load this in production.
 *
 * Loaded by the local test run of tests/auth/google-app-login.test.js through
 * NODE_OPTIONS=--require. Real Google ID tokens can only come from Google, so this replaces the
 * signature check: a token "test.<base64url JSON payload>" is accepted if its `aud` is the
 * expected client ID. Everything after it – nonce, account logic, session – runs unchanged.
 */
const { OAuth2Client } = require('google-auth-library');

OAuth2Client.prototype.verifyIdToken = async function ({ idToken, audience }) {
    const m = /^test\.([A-Za-z0-9_-]+)$/.exec(idToken || '');
    if (!m) throw new Error('stub: not a test token');
    const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    if (payload.aud !== audience) throw new Error('stub: wrong audience');
    return { getPayload: () => payload };
};

console.warn('[TEST] Google ID token stub active – signatures are NOT checked. Never use this in production.');
