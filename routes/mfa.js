const express = require('express');
const router = express.Router();
const { User, Passkey, TotpToken } = require('../models');
const totp = require('../utils/totp');
const qrcode = require('qrcode');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');
const { isAuthenticated, noBots, requireRecentAuth, str } = require('../utils/auth');
const { rp } = require('../utils/webauthn');

router.use(isAuthenticated, noBots);
// Adding or removing a factor changes how the account logs in: needs a recent login/re-confirmation
router.use((req, res, next) => (req.method === 'GET' ? next() : requireRecentAuth(req, res, next)));

// --- TOTP (Authenticator App) ---

router.post('/setup-totp', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const secret = totp.newSecret();
        const uri = totp.keyUri(user.email || user.username, 'Hochciv', secret);
        const qrCodeUrl = await qrcode.toDataURL(uri);

        // Temporarily store the secret until they verify it
        req.session.pendingTotpSecret = secret;

        res.json({ qrCodeUrl, secret });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler beim Setup' });
    }
});

router.post('/verify-totp', async (req, res) => {
    try {
        const token = str(req.body.token, 10);
        const secret = req.session.pendingTotpSecret;

        if (!secret || !token) {
            return res.status(400).json({ error: 'Kein Setup im Gange oder Token fehlt' });
        }

        const isValid = totp.checkToken(token, secret);
        if (!isValid) {
            return res.status(400).json({ error: 'Ungültiger Code' });
        }

        const user = await User.findByPk(req.user.id);
        
        await TotpToken.create({
            secret: secret,
            UserId: user.id,
            name: 'Authenticator App (' + new Date().toLocaleDateString() + ')'
        });
        
        user.totpEnabled = true;
        await user.save();

        req.session.pendingTotpSecret = null;
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler' });
    }
});

router.delete('/totp/:id?', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const tokenId = req.params.id;
        
        if (tokenId && tokenId !== 'null') {
            await TotpToken.destroy({ where: { id: tokenId, UserId: user.id } });
        } else {
            user.totpSecret = null;
        }
        
        // Check if any TOTP tokens are left
        const remaining = await TotpToken.count({ where: { UserId: user.id } });
        if (remaining === 0 && !user.totpSecret) {
            user.totpEnabled = false;
        }
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler' });
    }
});

router.post('/toggle-email-otp', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (req.body.enabled && (!user.email || user.email.endsWith('@oauth.local'))) {
            return res.status(400).json({ error: 'Hinterlege zuerst eine E-Mail-Adresse.' });
        }
        user.emailOtpEnabled = !!req.body.enabled;
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler' });
    }
});

// --- Passkeys (WebAuthn) ---

const rpName = 'Hochciv';

router.get('/tokens', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const tokens = [];
        if (user.totpSecret) tokens.push({ type: 'totp', id: null, name: 'Authenticator App (Legacy)' });
        
        const totpTokens = await TotpToken.findAll({ where: { UserId: user.id } });
        totpTokens.forEach(t => tokens.push({ type: 'totp', id: t.id, name: t.name }));
        
        if (user.emailOtpEnabled) tokens.push({ type: 'email', name: 'E-Mail OTP' });
        
        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });
        passkeys.forEach(pk => tokens.push({ type: 'passkey', id: pk.id, name: 'Passkey (' + new Date(pk.createdAt).toLocaleDateString() + ')' }));
        
        res.json(tokens);
    } catch(err) {
        res.status(500).json({error: 'Fehler'});
    }
});

router.post('/passkey/generate-registration', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });

        const options = await generateRegistrationOptions({
            rpName,
            rpID: rp(req).rpID,
            // v9 used the UTF-8 bytes of the id string as user handle – keep it that way
            userID: new Uint8Array(Buffer.from(user.id, 'utf8')),
            userName: user.email || user.username,
            timeout: 60000,
            attestationType: 'none',
            excludeCredentials: passkeys.map(pk => ({
                id: pk.credentialID,
                transports: pk.transports || []
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
            supportedAlgorithmIDs: [-7, -257],
        });

        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler beim Generieren der Passkey-Optionen' });
    }
});

router.post('/passkey/verify-registration', async (req, res) => {
    try {
        const { body } = req;
        const user = await User.findByPk(req.user.id);

        if (!user.currentChallenge) {
            return res.status(400).json({ error: 'Keine aktive Challenge' });
        }
        const challenge = user.currentChallenge;
        user.currentChallenge = null;           // one attempt per challenge
        await user.save();

        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge: challenge,
            expectedOrigin: rp(req).origin,
            expectedRPID: rp(req).rpID,
        });

        const { verified, registrationInfo } = verification;

        if (verified && registrationInfo) {
            const { credential } = registrationInfo;

            await Passkey.create({
                credentialID: credential.id,
                credentialPublicKey: Buffer.from(credential.publicKey),
                counter: credential.counter,
                transports: Array.isArray(body.response && body.response.transports) ? body.response.transports : [],
                UserId: user.id
            });

            res.json({ ok: true });
        } else {
            res.status(400).json({ error: 'Passkey-Verifizierung fehlgeschlagen' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler bei der Passkey-Verifizierung' });
    }
});

router.delete('/passkey/:id', async (req, res) => {
    try {
        await Passkey.destroy({ where: { id: req.params.id, UserId: req.user.id } });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Fehler beim Löschen' });
    }
});

module.exports = router;

