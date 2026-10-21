/**
 * Push notifications of the Android app (utils/push.js). Login required throughout.
 *
 *   POST   /api/push/token   { token, platform }  this device gets the user's notifications
 *   DELETE /api/push/token   { token }            ... not any more (app logout)
 *   POST   /api/push/notify  { on }               push on/off for the user (Rundenspiele list)
 */
const express = require('express');
const router = express.Router();
const rateLimitLib = require('express-rate-limit');
const { User, DeviceToken } = require('../models');
const push = require('../utils/push');

const MAX_DEVICES = 10;     // per user – the oldest drops out
const TOKEN_RE = /^[A-Za-z0-9_:\-.]{20,512}$/;

router.use((req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Nicht angemeldet' });
});
router.use(rateLimitLib({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
}));

const tokenOf = req => {
    const t = req.body && req.body.token;
    return typeof t === 'string' && TOKEN_RE.test(t) ? t : null;
};

router.post('/token', async (req, res) => {
    const token = tokenOf(req);
    if (!token) return res.status(400).json({ error: 'Ungültiges Token' });
    const platform = 'android';     // the only app so far
    try {
        // One phone, one owner: whoever logged in last on it gets its notifications
        const [device] = await DeviceToken.findOrCreate({
            where: { token },
            defaults: { token, platform, UserId: req.user.id, lastSeenAt: new Date() },
        });
        if (device.UserId !== req.user.id || Date.now() - device.lastSeenAt > 60 * 1000) {
            await device.update({ UserId: req.user.id, platform, lastSeenAt: new Date() });
        }
        const devices = await DeviceToken.findAll({ where: { UserId: req.user.id }, order: [['lastSeenAt', 'DESC']] });
        for (const old of devices.slice(MAX_DEVICES)) await old.destroy();
        res.json({ ok: true, enabled: push.enabled() });
    } catch (err) {
        console.error('[Push] Register failed:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.delete('/token', async (req, res) => {
    const token = tokenOf(req);
    if (!token) return res.status(400).json({ error: 'Ungültiges Token' });
    try {
        await DeviceToken.destroy({ where: { token, UserId: req.user.id } });
        res.json({ ok: true });
    } catch (err) {
        console.error('[Push] Unregister failed:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/notify', async (req, res) => {
    const on = !!(req.body && req.body.on);
    try {
        await User.update({ notifyPush: on }, { where: { id: req.user.id } });
        res.json({ ok: true, notifyPush: on });
    } catch (err) {
        console.error('[Push] Setting failed:', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
