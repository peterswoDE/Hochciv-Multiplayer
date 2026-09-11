const express = require('express');
const router = express.Router();
const { User, Passkey, TotpToken } = require('../models');
const sessions = require('../sessions');
const serverState = require('../utils/serverState');
const bcrypt = require('bcryptjs');

// Admin Middleware
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') return next();
    res.status(403).json({ error: 'Nur fr Administratoren' });
}

router.use(isAdmin);

// --- Metrics & Config ---
router.get('/metrics', (req, res) => {
    const activeLobbies = Array.from(sessions.getAllSessions().values());
    const playersOnline = activeLobbies.reduce((sum, lobby) => sum + lobby.players.length, 0);
    
    res.json({
        ...serverState.getMetrics(),
        lobbiesActive: activeLobbies.length,
        playersOnline
    });
});

router.post('/config', (req, res) => {
    const { maintenanceMode, registrationEnabled } = req.body;
    if (maintenanceMode !== undefined) serverState.state.maintenanceMode = maintenanceMode;
    if (registrationEnabled !== undefined) serverState.state.registrationEnabled = registrationEnabled;
    res.json({ ok: true });
});

// --- User Management ---
router.get('/users', async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'email', 'mmr', 'gamesPlayed', 'isActive', 'isBanned', 'role', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.get('/users/:id/mfa', async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        
        const tokens = [];
        if (targetUser.totpSecret) tokens.push({ type: 'totp', id: null, name: 'Authenticator App (Legacy)' });
        
        const totpTokens = await TotpToken.findAll({ where: { UserId: targetUser.id } });
        totpTokens.forEach(t => tokens.push({ type: 'totp', id: t.id, name: t.name }));

        if (targetUser.emailOtpEnabled) tokens.push({ type: 'email', name: 'E-Mail OTP' });
        
        const passkeys = await Passkey.findAll({ where: { UserId: targetUser.id } });
        passkeys.forEach(pk => tokens.push({ type: 'passkey', id: pk.id, name: 'Passkey (' + new Date(pk.createdAt).toLocaleDateString() + ')' }));
        
        res.json(tokens);
    } catch(err) {
        res.status(500).json({error: 'Serverfehler'});
    }
});

router.delete('/users/:id/mfa/:type/:tokenId?', async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        
        const { type, tokenId } = req.params;
        if (type === 'totp') {
            if (tokenId && tokenId !== 'null') {
                await TotpToken.destroy({ where: { id: tokenId, UserId: targetUser.id } });
            } else {
                targetUser.totpSecret = null;
            }
            
            const remaining = await TotpToken.count({ where: { UserId: targetUser.id } });
            if (remaining === 0 && !targetUser.totpSecret) {
                targetUser.totpEnabled = false;
            }
            await targetUser.save();
        } else if (type === 'email') {
            targetUser.emailOtpEnabled = false;
            await targetUser.save();
        } else if (type === 'passkey' && tokenId) {
            await Passkey.destroy({ where: { id: tokenId, UserId: targetUser.id } });
        }
        res.json({ ok: true });
    } catch(err) {
        res.status(500).json({error: 'Serverfehler'});
    }
});

router.post('/users/:id/action', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, mmr, newPassword } = req.body;
        
        const targetUser = await User.findByPk(id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

        if (action === 'ban') {
            targetUser.isBanned = true;
        } else if (action === 'unban') {
            targetUser.isBanned = false;
        } else if (action === 'set_mmr') {
            targetUser.mmr = mmr || 1000;
        } else if (action === 'force_password') {
            if (!newPassword) return res.status(400).json({ error: 'Neues Passwort fehlt.' });
            targetUser.password_hash = await bcrypt.hash(newPassword, 10);
        } else if (action === 'make_admin') {
            targetUser.role = 'admin';
        } else if (action === 'set_role') {
            const { role } = req.body;
            if (['user', 'admin'].includes(role)) {
                targetUser.role = role;
            } else {
                return res.status(400).json({ error: 'Ungültige Rolle' });
            }
        } else if (action === 'reset_mfa') {
            targetUser.totpEnabled = false;
            targetUser.totpSecret = null;
            await Passkey.destroy({ where: { UserId: targetUser.id } });
            targetUser.emailOtpEnabled = true;
        }

        await targetUser.save();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// --- Lobby Management ---
router.get('/lobbies', (req, res) => {
    const list = Array.from(sessions.getAllSessions().values()).map(s => ({
        id: s.id,
        joinCode: s.joinCode,
        status: s.status,
        createdAt: s.createdAt,
        players: s.players.map(p => ({ name: p.name, connected: p.connected }))
    }));
    res.json(list);
});

router.post('/lobbies/:id/action', (req, res) => {
    const { id } = req.params;
    const { action, message } = req.body;
    
    if (action === 'close') {
        sessions.removeSession(id);
        // Force disconnect sockets if we have io instance attached to app locals
        if (req.app.locals.io) {
            req.app.locals.io.to(id).emit('session:kicked', { reason: 'Admin hat die Lobby geschlossen.' });
            req.app.locals.io.to(id).disconnectSockets(true);
        }
        res.json({ ok: true });
    } else if (action === 'broadcast') {
        if (req.app.locals.io && message) {
            req.app.locals.io.to(id).emit('sys:message', message);
            res.json({ ok: true });
        } else {
            res.status(400).json({ error: 'Keine Nachricht oder io nicht bereit' });
        }
    } else {
        res.status(400).json({ error: 'Unbekannte Aktion' });
    }
});

module.exports = router;
