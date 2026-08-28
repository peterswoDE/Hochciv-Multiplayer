const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { User } = require('../models');

// Register endpoint
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, Email and Password are required.' });
        }
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists.' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email, password_hash });

        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed post-registration' });
            return res.json({ id: user.id, username: user.username, email: user.email, mmr: user.mmr, gamesPlayed: user.gamesPlayed });
        });
    } catch (err) {
        console.error('Register error', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Login endpoint
router.post('/login', passport.authenticate('local'), (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, email: req.user.email, mmr: req.user.mmr, gamesPlayed: req.user.gamesPlayed });
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
