const fs = require('fs');

let mfaJs = fs.readFileSync('routes/mfa.js', 'utf8');

const newTokensEndpoint = \
router.get('/tokens', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const tokens = [];
        if (user.totpEnabled) tokens.push({ type: 'totp', name: 'Authenticator App (TOTP)' });
        if (user.emailOtpEnabled) tokens.push({ type: 'email', name: 'E-Mail OTP' });
        
        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });
        passkeys.forEach(pk => tokens.push({ type: 'passkey', id: pk.id, name: 'Passkey (' + new Date(pk.createdAt).toLocaleDateString() + ')' }));
        
        res.json(tokens);
    } catch(err) {
        res.status(500).json({error: 'Fehler'});
    }
});
\;
mfaJs = mfaJs.replace(/router\.get\('\\/passkeys'[\s\S]*?\}\);/, newTokensEndpoint);
fs.writeFileSync('routes/mfa.js', mfaJs);

