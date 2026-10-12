/**
 * REST API for asynchronous games ("Rundenspiele"). Login required throughout.
 * Playing itself (actions, placement, draft) runs over Socket.IO – see sockets/async.js.
 */
const express = require('express');
const router = express.Router();
const service = require('../async/service');
const serverState = require('../utils/serverState');

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Rundenspiele gibt es nur mit Anmeldung.' });
}
router.use(isAuthenticated);

const send = (res, p) => p.then(r => {
    if (r && r.error) return res.status(400).json(r);
    res.json(r || { ok: true });
}).catch(err => {
    console.error('[Async API]', err);
    res.status(500).json({ error: 'Serverfehler' });
});

// List: own games, invitations, open public games
router.get('/', (req, res) => send(res, service.list(req.user)));

// Create { config: { mapKey, civMode, humanCount, events, eventMode, wonders, difficulty, ranked, isPublic }, civ, ability, invite: [usernames] }
router.post('/', (req, res) => {
    if (serverState.state.maintenanceMode)
        return res.status(503).json({ error: 'Der Server befindet sich im Wartungsmodus.' });
    send(res, service.create(req.user, req.body || {}));
});

// Look up a game by join code (for "Mit Code beitreten")
router.get('/code/:code', (req, res) => send(res, service.info(req.user, null, req.params.code)));

// Notification preference
router.post('/notify', (req, res) => send(res, service.setNotifyEmail(req.user, !!(req.body || {}).email)));

router.get('/:id', (req, res) => send(res, service.info(req.user, req.params.id, req.query.code)));
router.post('/:id/join', (req, res) => send(res, service.join(req.user, req.params.id, req.body || {})));
router.post('/:id/leave', (req, res) => send(res, service.leave(req.user, req.params.id)));
router.post('/:id/cancel', (req, res) => send(res, service.cancel(req.user, req.params.id)));
router.post('/:id/invite', (req, res) => send(res, service.invite(req.user, req.params.id, (req.body || {}).username)));
router.post('/:id/decline', (req, res) => send(res, service.decline(req.user, req.params.id)));

module.exports = router;
