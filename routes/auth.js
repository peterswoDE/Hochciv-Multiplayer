const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { sendMail } = require('../utils/mailer');
const { Op } = require('sequelize');

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
    passport.authenticate('local', (err, user, info) => {
        if (err) return res.status(500).json({ error: 'Internal Server Error' });
        if (!user) return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
        if (!user.isActive) return res.status(403).json({ error: 'Konto noch nicht aktiviert' });

        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed' });
            return res.json({ id: req.user.id, username: req.user.username, email: req.user.email, mmr: req.user.mmr, gamesPlayed: req.user.gamesPlayed });
        });
    })(req, res, next);
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
        res.json({ id: req.user.id, username: req.user.username, email: req.user.email, mmr: req.user.mmr, gamesPlayed: req.user.gamesPlayed });
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
