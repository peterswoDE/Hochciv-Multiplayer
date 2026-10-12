const config = require('../config');

/**
 * Relying party for WebAuthn. Taken from BASE_URL when it is configured, so a forged
 * Host header cannot change what the passkey is checked against.
 */
function rp(req) {
    if (config.WEBAUTHN) return config.WEBAUTHN;
    return { rpID: req.hostname, origin: req.protocol + '://' + req.get('host') };
}

module.exports = { rp };
