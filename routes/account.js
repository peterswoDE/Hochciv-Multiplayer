const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sequelize, User, Game } = require('../models');
const {
    EMAIL_RE, MIN_PASSWORD_LENGTH, isAuthenticated, str, validPassword, destroyOtherSessions,
} = require('../utils/auth');

router.use(isAuthenticated);

/** Accounts with a password must confirm it; OAuth-only accounts have none to confirm. */
async function checkCurrentPassword(user, currentPassword) {
    if (!user.password_hash) return true;
    const pw = str(currentPassword);
    return !!pw && bcrypt.compare(pw, user.password_hash);
}

// Update Password (also sets a first password for OAuth-only accounts)
router.post('/update-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findByPk(req.user.id);
        if (user.password_hash && !currentPassword) {
            return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich.' });
        }
        if (!validPassword(newPassword)) {
            return res.status(400).json({ error: `Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.` });
        }
        if (!(await checkCurrentPassword(user, currentPassword))) {
            return res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
        }

        user.password_hash = await bcrypt.hash(newPassword, 10);
        await user.save();
        await destroyOtherSessions(sequelize, user.id, req.sessionID);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Update Email
router.post('/update-email', async (req, res) => {
    try {
        const email = str(req.body.email, 254);
        if (!email) return res.status(400).json({ error: 'Email erforderlich.' });
        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });

        const user = await User.findByPk(req.user.id);
        if (!(await checkCurrentPassword(user, req.body.currentPassword))) {
            return res.status(400).json({ error: 'Bitte bestätige die Änderung mit deinem aktuellen Passwort.' });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing && existing.id !== user.id) {
            return res.status(400).json({ error: 'Diese E-Mail wird bereits verwendet.' });
        }

        user.email = email;
        await user.save();
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Match History: the last 50 games this user took part in
router.get('/history', async (req, res) => {
    try {
        const games = await Game.findAll({
            where: sequelize.literal(
                `"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ dbUserId: req.user.id }]))}::jsonb`
            ),
            order: [['matchDate', 'DESC']],
            limit: 50
        });
        res.json(games);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
