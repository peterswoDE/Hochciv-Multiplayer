const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { User, Game } = require('../models');

// Middleware to ensure user is logged in
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Nicht autorisiert' });
}

// Update Password
router.post('/update-password', isAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich.' });
        }

        const user = await User.findByPk(req.user.id);
        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
        }

        user.password_hash = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Update Email
router.post('/update-email', isAuthenticated, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email erforderlich.' });

        const existing = await User.findOne({ where: { email } });
        if (existing && existing.id !== req.user.id) {
            return res.status(400).json({ error: 'Diese E-Mail wird bereits verwendet.' });
        }

        const user = await User.findByPk(req.user.id);
        user.email = email;
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Match History
router.get('/history', isAuthenticated, async (req, res) => {
    try {
        // Find games where this user was a participant
        // For simplicity, we can fetch all games and filter, or just return all games the user played in.
        // Wait, JSON querying in Postgres:
        const games = await Game.findAll({
            order: [['matchDate', 'DESC']],
            limit: 50
        });

        // Filter games where the user was in the participants array.
        // This is safe since games isn't thousands of records yet, or we can use raw query.
        const userGames = games.filter(g => {
            if (!g.participants || !Array.isArray(g.participants)) return false;
            return g.participants.some(p => p.name === req.user.username);
        });

        res.json(userGames);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
