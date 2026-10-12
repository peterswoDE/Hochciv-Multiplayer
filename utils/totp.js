const { generateSecret, generateURI, verifySync, createGuardrails } = require('otplib');

// otplib v12 created 10-byte secrets; v13 rejects anything under 16 bytes by default.
// Accept the old size so authenticator apps set up before the upgrade keep working.
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

const newSecret = () => generateSecret();

const keyUri = (label, issuer, secret) => generateURI({ label, issuer, secret });

const checkToken = (token, secret) => {
    try {
        return verifySync({ secret, token: String(token).trim(), guardrails }).valid;
    } catch (err) {
        // malformed token (wrong length, non-digits) or secret
        return false;
    }
};

module.exports = { newSecret, keyUri, checkToken };
