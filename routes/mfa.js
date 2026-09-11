const express = require('express');
const router = express.Router();
const { User, Passkey } = require('../models');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');

// Middleware to ensure authentication
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Nicht eingeloggt' });
}

router.use(isAuthenticated);

// --- TOTP (Authenticator App) ---

router.post('/setup-totp', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const secret = authenticator.generateSecret();
        const uri = authenticator.keyuri(user.email, 'Hochciv', secret);
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
        const { token } = req.body;
        const secret = req.session.pendingTotpSecret;

        if (!secret || !token) {
            return res.status(400).json({ error: 'Kein Setup im Gange oder Token fehlt' });
        }

        const isValid = authenticator.check(token, secret);
        if (!isValid) {
            return res.status(400).json({ error: 'Ungültiger Code' });
        }

        const user = await User.findByPk(req.user.id);
        user.totpSecret = secret;
        user.totpEnabled = true;
        await user.save();

        req.session.pendingTotpSecret = null;
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler bei der Verifizierung' });
    }
});

router.post('/disable-totp', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        user.totpSecret = null;
        user.totpEnabled = false;
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
        user.emailOtpEnabled = !!req.body.enabled;
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Fehler' });
    }
});

// --- Passkeys (WebAuthn) ---

// Define RP details dynamically based on request
const rpName = 'Hochciv';
const getRpID = (req) => req.hostname;

router.get('/passkeys', async (req, res) => {
    const passkeys = await Passkey.findAll({ where: { UserId: req.user.id } });
    res.json(passkeys);
});

router.post('/passkey/generate-registration', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });

        const options = await generateRegistrationOptions({
            rpName,
            rpID: getRpID(req),
            userID: Buffer.from(user.id),
            userName: user.email,
            timeout: 60000,
            attestationType: 'none',
            excludeCredentials: passkeys.map(pk => ({
                id: Buffer.from(pk.credentialID, 'base64url'),
                type: 'public-key',
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

        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: req.protocol + '://' + req.get('host'),
            expectedRPID: getRpID(req),
        });

        const { verified, registrationInfo } = verification;

        if (verified && registrationInfo) {
            const { credentialID, credentialPublicKey, counter } = registrationInfo;

            await Passkey.create({
                credentialID: Buffer.from(credentialID).toString('base64url'),
                credentialPublicKey: Buffer.from(credentialPublicKey),
                counter,
                transports: body.response.transports || [],
                UserId: user.id
            });

            user.currentChallenge = null;
            await user.save();

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

