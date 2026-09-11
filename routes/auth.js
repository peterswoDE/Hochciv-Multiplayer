const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { User, Passkey } = require('../models');
const { sendMail } = require('../utils/mailer');
const { Op } = require('sequelize');
const { authenticator } = require('otplib');
const { generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const rateLimitLib = require('express-rate-limit');

// Use express-rate-limit for robust IP limiting against brute-force attacks
const rateLimit = rateLimitLib({
    windowMs: 60 * 1000, // 1 minute
    max: 15,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Register endpoint
router.post('/register', rateLimit, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, Email and Password are required.' });
        }
        const existingUser = await User.findOne({
            where: { [Op.or]: [{ username }, { email }] }
        });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or Email already exists.' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const activationCode = generateCode();

        const user = await User.create({
            username,
            email,
            password_hash,
            isActive: false,
            activationCode,
            activationCodeExpiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        });

        const text = `Dein Hochciv Aktivierungscode lautet: ${activationCode}`;
        await sendMail(email, 'Hochciv Account aktivieren', text, text);

        return res.json({ ok: true, message: 'Activation code sent' });
    } catch (err) {
        console.error('Register error', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Activate endpoint
router.post('/activate', rateLimit, async (req, res) => {
    try {
        const { username, code } = req.body;
        if (!username || !code) return res.status(400).json({ error: 'Missing code' });

        const user = await User.findOne({ where: { username } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.isActive) return res.status(400).json({ error: 'Already activated' });

        if (user.activationCode !== code) {
            return res.status(400).json({ error: 'Invalid activation code' });
        }

        if (user.activationCodeExpiresAt && user.activationCodeExpiresAt < new Date()) {
            return res.status(400).json({ error: 'Activation code expired. Please register again or request a new code.' });
        }

        user.isActive = true;
        user.activationCode = null;
        await user.save();

        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed' });
            return res.json({ id: user.id, username: user.username, email: user.email, mmr: user.mmr, gamesPlayed: user.gamesPlayed });
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Login endpoint
router.post('/login', rateLimit, (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => {
        if (err) return res.status(500).json({ error: 'Internal Server Error' });
        if (!user) return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
        if (!user.isActive) return res.status(403).json({ error: 'Konto noch nicht aktiviert' });

        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });
        const hasPasskeys = passkeys.length > 0;

        if (user.totpEnabled || hasPasskeys || user.emailOtpEnabled) {
            req.session.mfaPendingUserId = user.id;
            return res.json({
                mfaRequired: true,
                methods: {
                    totp: user.totpEnabled,
                    passkey: hasPasskeys,
                    email: user.emailOtpEnabled
                }
            });
        }

        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed' });
            return res.json({ id: req.user.id, username: req.user.username, email: req.user.email, mmr: req.user.mmr, gamesPlayed: req.user.gamesPlayed, role: req.user.role });
        });
    })(req, res, next);
});

// --- MFA Login Routes ---
router.post('/login/email-otp/request', rateLimit, async (req, res) => {
    try {
        const pendingUserId = req.session.mfaPendingUserId;
        if (!pendingUserId) return res.status(400).json({ error: 'Sitzung abgelaufen' });

        const user = await User.findByPk(pendingUserId);
        if (!user || !user.emailOtpEnabled) return res.status(400).json({ error: 'Ungültige Anfrage' });

        const code = generateCode();
        user.emailOtpCode = code;
        user.emailOtpExpiry = new Date(Date.now() + 10 * 60000); // 10 minutes
        await user.save();

        const mailOptions = {
            to: user.email,
            subject: 'Dein Login-Code (2FA)',
            text: `Dein Login-Code lautet: ${code}\nDieser Code ist 10 Minuten gültig.`,
            html: `<p>Dein Login-Code lautet: <b>${code}</b></p><p>Dieser Code ist 10 Minuten gültig.</p>`
        };
        await sendMail(mailOptions);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Fehler beim Senden' });
    }
});

router.post('/login/email-otp/verify', rateLimit, async (req, res) => {
    try {
        const { code } = req.body;
        const pendingUserId = req.session.mfaPendingUserId;
        if (!pendingUserId || !code) return res.status(400).json({ error: 'Sitzung abgelaufen oder Code fehlt' });

        const user = await User.findByPk(pendingUserId);
        if (!user || !user.emailOtpEnabled) return res.status(400).json({ error: 'Ungültige Anfrage' });

        if (user.emailOtpCode !== code || new Date() > user.emailOtpExpiry) {
            return res.status(400).json({ error: 'Falscher oder abgelaufener Code' });
        }

        user.emailOtpCode = null;
        user.emailOtpExpiry = null;
        await user.save();

        req.session.mfaPendingUserId = null;
        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed' });
            return res.json({ id: user.id, username: user.username, email: user.email, mmr: user.mmr, gamesPlayed: user.gamesPlayed, role: user.role });
        });
    } catch (err) {
        res.status(500).json({ error: 'Fehler' });
    }
});

router.post('/login/totp', rateLimit, async (req, res) => {
    try {
        const { token } = req.body;
        const pendingUserId = req.session.mfaPendingUserId;
        if (!pendingUserId || !token) return res.status(400).json({ error: 'Sitzung abgelaufen oder Token fehlt' });

        const user = await User.findByPk(pendingUserId);
        if (!user || !user.totpEnabled) return res.status(400).json({ error: 'Ungültige Anfrage' });

        const isValid = authenticator.check(token, user.totpSecret);
        if (!isValid) return res.status(400).json({ error: 'Ungültiger Code' });

        req.session.mfaPendingUserId = null;
        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed' });
            return res.json({ id: user.id, username: user.username, email: user.email, mmr: user.mmr, gamesPlayed: user.gamesPlayed, role: user.role });
        });
    } catch (err) {
        res.status(500).json({ error: 'Fehler bei der MFA' });
    }
});

router.post('/login/passkey/options', rateLimit, async (req, res) => {
    try {
        const pendingUserId = req.session.mfaPendingUserId;
        if (!pendingUserId) return res.status(400).json({ error: 'Sitzung abgelaufen' });

        const user = await User.findByPk(pendingUserId);
        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });

        const options = await generateAuthenticationOptions({
            rpID: req.hostname,
            allowCredentials: passkeys.map(pk => ({
                id: Buffer.from(pk.credentialID, 'base64url').toString('base64url'),
                type: 'public-key',
                transports: pk.transports || []
            })),
            userVerification: 'preferred',
        });

        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch (err) {
        res.status(500).json({ error: 'Fehler' });
    }
});

router.post('/login/passkey/verify', rateLimit, async (req, res) => {
    try {
        const pendingUserId = req.session.mfaPendingUserId;
        if (!pendingUserId) return res.status(400).json({ error: 'Sitzung abgelaufen' });

        const user = await User.findByPk(pendingUserId);
        const passkeys = await Passkey.findAll({ where: { UserId: user.id } });

        const body = req.body;
        const passkey = passkeys.find(pk => Buffer.from(pk.credentialID, 'base64url').toString('base64url') === body.id || pk.credentialID === body.id);
        
        if (!passkey) return res.status(400).json({ error: 'Unbekannter Passkey' });

        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge: user.currentChallenge,
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

            user.currentChallenge = null;
            await user.save();

            req.session.mfaPendingUserId = null;
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

// Password reset request
router.post('/reset-password/request', rateLimit, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'E-Mail ist erforderlich.' });

        const user = await User.findOne({ where: { email } });
        if (!user) {
            // Return success even if not found to prevent email scanning
            return res.json({ ok: true });
        }

        const resetCode = generateCode();
        user.resetCode = resetCode;
        user.resetCodeExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        const text = `Dein Code zum Zurücksetzen deines Hochciv Passworts lautet: ${resetCode}`;
        await sendMail(email, 'Hochciv Passwort zurücksetzen', text, text);

        return res.json({ ok: true });
    } catch (err) {
        console.error('Reset request error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Password reset confirm
router.post('/reset-password/confirm', rateLimit, async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ error: 'E-Mail, Code und neues Passwort werden benötigt.' });
        }
        const user = await User.findOne({ where: { email, resetCode: code } });
        if (!user) {
            return res.status(400).json({ error: 'Ungültiger Code oder E-Mail.' });
        }

        if (user.resetCodeExpiresAt && user.resetCodeExpiresAt < new Date()) {
            return res.status(400).json({ error: 'Reset code expired. Please request a new one.' });
        }

        user.password_hash = await bcrypt.hash(newPassword, 10);
        user.resetCode = null;
        user.isActive = true; // Automatically mark account as active since they proved ownership of the email
        await user.save();
        return res.json({ ok: true });
    } catch (err) {
        console.error('Reset confirm error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get current user (session check)
router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ 
            id: req.user.id, 
            username: req.user.username, 
            email: req.user.email, 
            mmr: req.user.mmr, 
            gamesPlayed: req.user.gamesPlayed,
            role: req.user.role 
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Error logging out' });
        req.session.destroy();
        res.json({ ok: true });
    });
});

module.exports = router;
