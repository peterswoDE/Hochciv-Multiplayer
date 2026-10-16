const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimitLib = require('express-rate-limit');
const { sequelize, User, Game, Passkey } = require('../models');
const totp = require('../utils/totp');
const { sendMail } = require('../utils/mailer');
const { deleteAccount } = require('../utils/deleteAccount');
const {
    EMAIL_RE, MIN_PASSWORD_LENGTH, isAuthenticated, markAuthenticated, requireRecentAuth,
    str, validPassword, issueCode, consumeCode, destroyOtherSessions,
} = require('../utils/auth');

router.use(isAuthenticated);

// Password / code guesses and e-mails sent: limit per IP
const rateLimit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Accounts with a password confirm changes with it (checkCurrentPassword). Accounts without one
 * (Google/Discord only) need a recent login or re-confirmation instead.
 */
function passwordlessNeedsRecentAuth(req, res, next) {
    return req.user.password_hash ? next() : requireRecentAuth(req, res, next);
}

/** A real address that mails can go to (not the placeholder of OAuth accounts without e-mail). */
const mailable = email => !!email && !email.endsWith('@oauth.local');

// Re-confirm the identity for sensitive changes (utils/auth.js requireRecentAuth):
// { password } or { token } (authenticator app). Google/Discord-only accounts log in again instead.
router.post('/reauth', rateLimit, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const password = str(req.body.password);
        const token = str(req.body.token, 10);
        let ok = false;
        if (password && user.password_hash) ok = await bcrypt.compare(password, user.password_hash);
        else if (token && user.totpEnabled) ok = await totp.checkUserToken(user, token);
        if (!ok) return res.status(400).json({ error: password ? 'Das Passwort ist falsch.' : 'Ungültiger Code.' });
        markAuthenticated(req);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Asked before linking Google/Discord: utils/oauth.js refuses a new link without a recent login,
// and the client can only show the re-confirmation dialog for a request, not after the redirect.
router.get('/recent-auth', requireRecentAuth, (req, res) => res.json({ ok: true }));

// Unlink Google / Discord. The account must keep a way to log in: a password, a passkey or the
// other provider.
router.post('/unlink/:provider', rateLimit, async (req, res) => {
    try {
        const idField = { google: 'googleId', discord: 'discordId' }[req.params.provider];
        if (!idField) return res.status(400).json({ error: 'Unbekannter Anbieter.' });
        const user = await User.findByPk(req.user.id);
        if (!user[idField]) return res.status(400).json({ error: 'Dieses Konto ist nicht verknüpft.' });
        const otherId = idField === 'googleId' ? user.discordId : user.googleId;
        const passkeys = await Passkey.count({ where: { UserId: user.id } });
        if (!user.password_hash && !otherId && !passkeys) {
            return res.status(400).json({ error: 'Das ist deine einzige Anmeldemöglichkeit. Lege zuerst ein Passwort fest.' });
        }
        user[idField] = null;
        await user.save();
        res.json({ ok: true, googleLinked: !!user.googleId, discordLinked: !!user.discordId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

/** Accounts with a password must confirm it; OAuth-only accounts have none to confirm. */
async function checkCurrentPassword(user, currentPassword) {
    if (!user.password_hash) return true;
    const pw = str(currentPassword);
    return !!pw && bcrypt.compare(pw, user.password_hash);
}

// Update Password (also sets a first password for OAuth-only accounts)
router.post('/update-password', passwordlessNeedsRecentAuth, async (req, res) => {
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

// Update Email, step 1: a code goes to the new address; `email` only changes once it is entered
// (confirm-email). An unproven address would otherwise be linked to whoever logs in with it via
// Google/Discord (utils/oauth.js) and receive password resets.
router.post('/update-email', rateLimit, passwordlessNeedsRecentAuth, async (req, res) => {
    try {
        const email = str(req.body.email, 254);
        if (!email) return res.status(400).json({ error: 'Email erforderlich.' });
        if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });

        const user = await User.findByPk(req.user.id);
        if (!(await checkCurrentPassword(user, req.body.currentPassword))) {
            return res.status(400).json({ error: 'Bitte bestätige die Änderung mit deinem aktuellen Passwort.' });
        }
        if (email === user.email) return res.status(400).json({ error: 'Das ist bereits deine E-Mail-Adresse.' });

        const existing = await User.findOne({ where: { email } });
        if (existing && existing.id !== user.id) {
            return res.status(400).json({ error: 'Diese E-Mail wird bereits verwendet.' });
        }

        user.pendingEmail = email;
        const code = issueCode(user, 'emailChangeCode', 'emailChangeCodeExpiresAt', 30 * 60 * 1000); // 30 minutes
        await user.save();

        const text = `Dein Code zum Bestätigen deiner neuen Hochciv E-Mail-Adresse lautet: ${code}
Dieser Code ist 30 Minuten gültig.`;
        await sendMail(email, 'Hochciv E-Mail-Adresse bestätigen', text, text);
        res.json({ ok: true, pending: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Update Email, step 2: the code from the mail to the new address
router.post('/confirm-email', rateLimit, async (req, res) => {
    try {
        const code = str(req.body.code, 10);
        if (!code) return res.status(400).json({ error: 'Code fehlt.' });

        const user = await User.findByPk(req.user.id);
        if (!user.pendingEmail) return res.status(400).json({ error: 'Keine E-Mail-Änderung offen.' });
        const err = await consumeCode(user, 'emailChangeCode', 'emailChangeCodeExpiresAt', code);
        if (err) return res.status(400).json({ error: err });

        // Someone may have taken the address in the meantime
        const existing = await User.findOne({ where: { email: user.pendingEmail } });
        if (existing && existing.id !== user.id) {
            user.pendingEmail = null;
            await user.save();
            return res.status(400).json({ error: 'Diese E-Mail wird bereits verwendet.' });
        }

        const oldEmail = user.email;
        user.email = user.pendingEmail;
        user.pendingEmail = null;
        user.emailChangeCodeExpiresAt = null;
        await user.save();

        if (mailable(oldEmail)) {
            const text = `Die E-Mail-Adresse deines Hochciv-Kontos ${user.username} wurde auf ${user.email} geändert. ` +
                'Warst du das nicht, setze bitte sofort dein Passwort zurück und melde dich beim Betreiber.';
            await sendMail(oldEmail, 'Hochciv E-Mail-Adresse geändert', text, text);
        }
        res.json({ ok: true, email: user.email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Match History: the last 50 games this user took part in – including Rundenspiele in which
// the AI took over their seat after the 7-day timeout (stored as replacedUserId)
router.get('/history', async (req, res) => {
    try {
        const has = field => `"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ [field]: req.user.id }]))}::jsonb`;
        const games = await Game.findAll({
            where: sequelize.literal(`(${has('dbUserId')} OR ${has('replacedUserId')})`),
            order: [['matchDate', 'DESC']],
            limit: 50
        });
        res.json(games);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Delete the own account: needs a recent login (re-confirmation dialog) and the username typed
// as confirmation. utils/deleteAccount.js does the work.
router.post('/delete', rateLimit, requireRecentAuth, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (str(req.body.confirm, 30) !== user.username) {
            return res.status(400).json({ error: 'Bitte gib zur Bestätigung deinen Benutzernamen ein.' });
        }
        const error = await deleteAccount(user, { io: req.app.locals.io });
        if (error) return res.status(400).json({ error });
        req.logout(() => {
            req.session.destroy(() => res.json({ ok: true }));
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
