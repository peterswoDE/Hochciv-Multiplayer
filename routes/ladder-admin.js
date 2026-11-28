const express = require('express');
const Ladder = require('../async/ladder');
const router = express.Router();

// Scope the ladder's permissions to this router so an organizer need not inherit global Admin.
function ladderAccess(user) {
    if (user.role === 'admin' || user.role === 'superadmin') return 'manage';
    if (user.role === 'reviewadmin') return 'read';
    return null;
}

router.use((req, res, next) => {
    const access = req.isAuthenticated() ? ladderAccess(req.user) : null;
    if (!access) return res.status(403).json({ error: 'Nur für Administratoren' });
    res.locals.canManageLadder = access === 'manage';
    if (!res.locals.canManageLadder && req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(403).json({ error: 'Nur Lesezugriff: Als Review-Admin kannst du nichts ändern.' });
    }
    next();
});

router.get('/', async (req, res) => {
    try {
        res.json({ ...await Ladder.settings(), canManage: res.locals.canManageLadder });
    } catch (err) {
        console.error('[Ladder]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.get('/status', async (req, res) => {
    try {
        res.json(await Ladder.status());
    } catch (err) {
        console.error('[Ladder]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/', async (req, res) => {
    try {
        const settings = await Ladder.configure(req.body, req.user.username);
        if (settings.error) return res.status(400).json({ error: settings.error });
        console.log(`[Ladder] ${req.user.username} (${req.user.role}): ${JSON.stringify(settings)}`);
        res.json(settings);
    } catch (err) {
        console.error('[Ladder]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
