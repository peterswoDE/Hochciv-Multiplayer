const fs = require('fs');
let code = fs.readFileSync('routes/auth.js', 'utf8');

const passwordlessCode = \

// --- Passwordless WebAuthn ---
router.post('/login/passkey/options-passwordless', rateLimit, async (req, res) => {
    try {
        const options = await generateAuthenticationOptions({
            rpID: req.hostname,
            userVerification: 'preferred',
            // No allowCredentials array to allow discoverable credentials
        });

        // Store challenge globally for anonymous flow
        req.session.passwordlessChallenge = options.challenge;

        res.json(options);
    } catch (err) {
        res.status(500).json({ error: 'Fehler' });
    }
});

router.post('/login/passkey/verify-passwordless', rateLimit, async (req, res) => {
    try {
        const challenge = req.session.passwordlessChallenge;
        if (!challenge) return res.status(400).json({ error: 'Sitzung abgelaufen' });

        const body = req.body;
        // Find passkey by credential ID
        const passkeys = await Passkey.findAll();
        const passkey = passkeys.find(pk => Buffer.from(pk.credentialID, 'base64url').toString('base64url') === body.id || pk.credentialID === body.id);

        if (!passkey) return res.status(400).json({ error: 'Unbekannter Passkey' });

        const user = await User.findByPk(passkey.UserId);
        if (!user || !user.isActive) return res.status(403).json({ error: 'Konto nicht aktiviert' });

        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge: challenge,
            expectedOrigin: req.protocol + '://' + req.get('host'),
            expectedRPID: req.hostname,
            authenticator: {
                credentialPublicKey: passkey.credentialPublicKey,
                credentialID: Buffer.from(passkey.credentialID, 'base64url'),
                counter: Number(passkey.counter),
            }
        });

        if (verification.verified) {
            passkey.counter = verification.authenticationInfo.newCounter;
            await passkey.save();
            req.session.passwordlessChallenge = null;

            req.login(user, (err) => {
                if (err) return res.status(500).json({ error: 'Login failed' });
                return res.json({ id: user.id, username: user.username, email: user.email, mmr: user.mmr, gamesPlayed: user.gamesPlayed, role: user.role });
            });
        } else {
            res.status(400).json({ error: 'Verifizierung fehlgeschlagen' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Fehler' });
    }
});
\;

code = code.replace(/\/\/ Password reset request/, passwordlessCode + '\n// Password reset request');
fs.writeFileSync('routes/auth.js', code);

