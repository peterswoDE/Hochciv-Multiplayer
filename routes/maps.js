/**
 * Custom maps ("Meine Karten") – see maps/service.js.
 *
 *   GET    /api/maps/code/:code     – a published map by its code (no login needed)
 *   GET    /api/maps                – the own maps
 *   POST   /api/maps                – save { map } (same name replaces)
 *   DELETE /api/maps/:id
 *   POST   /api/maps/:id/publish    – gives the map its 6-character code
 *   POST   /api/maps/:id/unpublish
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const service = require('../maps/service');

const router = express.Router();

const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});
// guessing codes: far fewer tries than normal use needs
const codeLimit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Zu viele Code-Abfragen. Bitte warte eine Minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const send = (res, p) => p.then(r => {
    if (r && r.error) return res.status(400).json(r);
    res.json(r || { ok: true });
}).catch(err => {
    console.error('[Maps API]', err);
    res.status(500).json({ error: 'Serverfehler' });
});

router.get('/code/:code', codeLimit, (req, res) =>
    send(res, service.byCode(req.params.code, req.user ? req.user.id : null)));

router.use((req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Karten im Konto gibt es nur mit Anmeldung.' });
});
router.use(limit);

router.get('/', (req, res) => send(res, service.list(req.user)));
router.post('/', (req, res) => send(res, service.save(req.user, (req.body || {}).map)));
router.delete('/:id', (req, res) => send(res, service.remove(req.user, req.params.id)));
router.post('/:id/publish', (req, res) => send(res, service.publish(req.user, req.params.id)));
router.post('/:id/unpublish', (req, res) => send(res, service.unpublish(req.user, req.params.id)));

module.exports = router;
