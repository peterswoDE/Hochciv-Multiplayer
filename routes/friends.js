/**
 * Friends list (F8, utils/friends.js). Login required.
 *
 *   GET    /api/friends              – friends (online, activity), requests in and out, live
 *                                      invitations, suggestions from recent games
 *   POST   /api/friends              – { username } or { id }: send a request (or accept theirs)
 *   POST   /api/friends/:id/accept   – accept the request of account :id
 *   DELETE /api/friends/:id          – decline, withdraw or end the friendship with account :id
 *
 * Live invitations go over Socket.IO ('friends:invite', sockets/friends.js).
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const friends = require('../utils/friends');

const router = express.Router();
// per account (players behind one router share an IP), guests by IP
const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req, res) => (req.user ? 'u:' + req.user.id : rateLimitLib.ipKeyGenerator(req.ip)),
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});
router.use(limit);
router.use((req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Freunde gibt es nur mit Anmeldung.' });
});

const send = (res, p) => p.then(r => {
    if (r && r.error) return res.status(400).json(r);
    res.json(r || { ok: true });
}).catch(err => {
    console.error('[Friends API]', err);
    res.status(500).json({ error: 'Serverfehler' });
});

router.get('/', (req, res) => send(res, friends.list(req.user)));
router.post('/', (req, res) => {
    const b = req.body || {};
    send(res, friends.request(req.user, typeof b.id === 'string' ? { id: b.id } : { username: typeof b.username === 'string' ? b.username.slice(0, 40) : '' }));
});
router.post('/:id/accept', (req, res) => send(res, friends.accept(req.user, req.params.id)));
router.delete('/:id', (req, res) => send(res, friends.remove(req.user, req.params.id)));

module.exports = router;
