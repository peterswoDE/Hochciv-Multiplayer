const express = require('express');
const router = express.Router();
const { sequelize, User, Passkey, TotpToken, OAuthProvider } = require('../models');
const sessions = require('../sessions');
const serverState = require('../utils/serverState');
const { refreshOAuthStrategies } = require('../utils/oauth');
const { validPassword, MIN_PASSWORD_LENGTH, destroyOtherSessions } = require('../utils/auth');
const bcrypt = require('bcryptjs');

const ROLES = ['user', 'admin', 'superadmin'];
const isPrivileged = role => role === 'admin' || role === 'superadmin';

/**
 * Admins manage normal users. Anything that touches an admin/superadmin account, or that
 * hands out admin rights, needs a superadmin.
 */
function mayManage(actor, target) {
    if (actor.role === 'superadmin') return true;
    return !isPrivileged(target.role);
}

// Admin Middleware (allows admin and superadmin)
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && (req.user.role === 'admin' || req.user.role === 'superadmin')) return next();
    res.status(403).json({ error: 'Nur für Administratoren' });
}

// Super Admin Middleware (superadmin only)
function isSuperAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'superadmin') return next();
    res.status(403).json({ error: 'Nur für Super-Administratoren' });
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
    if (maintenanceMode !== undefined) serverState.state.maintenanceMode = maintenanceMode === true;
    if (registrationEnabled !== undefined) serverState.state.registrationEnabled = registrationEnabled === true;
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
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.delete('/users/:id/mfa/:type/:tokenId?', async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        if (!mayManage(req.user, targetUser)) return res.status(403).json({ error: 'Nur für Super-Administratoren' });

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
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/users/:id/action', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, mmr, newPassword } = req.body;

        const targetUser = await User.findByPk(id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        if (!mayManage(req.user, targetUser)) return res.status(403).json({ error: 'Nur für Super-Administratoren' });

        let logoutEverywhere = false;
        if (action === 'ban') {
            if (targetUser.id === req.user.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst bannen.' });
            targetUser.isBanned = true;
            logoutEverywhere = true;
        } else if (action === 'unban') {
            targetUser.isBanned = false;
        } else if (action === 'set_mmr') {
            const value = Number(mmr);
            targetUser.mmr = Number.isInteger(value) && value >= 0 && value <= 10000 ? value : 1000;
        } else if (action === 'force_password') {
            if (!validPassword(newPassword)) {
                return res.status(400).json({ error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.` });
            }
            targetUser.password_hash = await bcrypt.hash(newPassword, 10);
            logoutEverywhere = true;
        } else if (action === 'make_admin' || action === 'set_role') {
            const role = action === 'make_admin' ? 'admin' : req.body.role;
            if (!ROLES.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
            if (isPrivileged(role) && req.user.role !== 'superadmin') {
                return res.status(403).json({ error: 'Nur Super-Administratoren vergeben Admin-Rechte.' });
            }
            if (targetUser.id === req.user.id) return res.status(400).json({ error: 'Du kannst deine eigene Rolle nicht ändern.' });
            targetUser.role = role;
        } else if (action === 'reset_mfa') {
            targetUser.totpEnabled = false;
            targetUser.totpSecret = null;
            await TotpToken.destroy({ where: { UserId: targetUser.id } });
            await Passkey.destroy({ where: { UserId: targetUser.id } });
            targetUser.emailOtpEnabled = true;
        } else {
            return res.status(400).json({ error: 'Unbekannte Aktion' });
        }

        await targetUser.save();
        if (logoutEverywhere) await destroyOtherSessions(sequelize, targetUser.id);
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
        if (req.app.locals.io && typeof message === 'string' && message) {
            req.app.locals.io.to(id).emit('sys:message', message.slice(0, 500));
            res.json({ ok: true });
        } else {
            res.status(400).json({ error: 'Keine Nachricht oder io nicht bereit' });
        }
    } else {
        res.status(400).json({ error: 'Unbekannte Aktion' });
    }
});


// --- OAuth Provider Management (Super Admin only) ---
router.get('/oauth', isSuperAdmin, async (req, res) => {
    try {
        const providers = await OAuthProvider.findAll({
            attributes: ['id', 'provider', 'clientId', 'clientSecret', 'enabled']
        });
        // Return a map with all known providers, filling in defaults for missing ones
        const result = { google: null, discord: null };
        for (const p of providers) {
            result[p.provider] = {
                id: p.id,
                clientId: p.clientId,
                clientSecret: p.clientSecret,
                enabled: p.enabled
            };
        }
        res.json(result);
    } catch (err) {
        console.error('OAuth config load error', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/oauth/:provider', isSuperAdmin, async (req, res) => {
    try {
        const { provider } = req.params;
        if (!['google', 'discord'].includes(provider)) {
            return res.status(400).json({ error: 'Ungültiger Provider' });
        }
        const { clientId, clientSecret, enabled } = req.body;

        const [oauthProvider] = await OAuthProvider.findOrCreate({
            where: { provider },
            defaults: { clientId: clientId || '', clientSecret: clientSecret || '', enabled: !!enabled }
        });

        // Update fields
        if (clientId !== undefined) oauthProvider.clientId = clientId;
        if (clientSecret !== undefined) oauthProvider.clientSecret = clientSecret;
        if (enabled !== undefined) oauthProvider.enabled = enabled;
        await oauthProvider.save();

        // Refresh Passport strategies
        await refreshOAuthStrategies();

        res.json({ ok: true });
    } catch (err) {
        console.error('OAuth config save error', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
