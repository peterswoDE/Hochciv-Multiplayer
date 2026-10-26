/**
 * Notifications for asynchronous games.
 *
 * Every message goes through notify(), which hands it to all registered channels: e-mail and
 * push (Android app). Webhooks or a Discord integration are added later with
 * registerChannel() – the game code does not change.
 *
 * A channel is `async (users, event) => {}` where `users` are User rows and `event` is
 *   { type: 'invite' | 'turn' | 'reminder' | 'takeover' | 'finished',
 *     gameId, subject, text, link,
 *     summary?, short? }    // "since your last turn": several lines for the e-mail, one for push
 */
const { User, DeviceToken } = require('../models');
const { Op } = require('sequelize');
const { sendMail } = require('./mailer');
const push = require('./push');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const channels = [];

function registerChannel(name, fn) {
    channels.push({ name, fn });
}

/** Link that opens a game directly (mp.js reads ?async=<id>). */
function gameLink(gameId) {
    return `${BASE_URL}/?async=${encodeURIComponent(gameId)}`;
}

async function notify(userIds, event) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return;
    try {
        const users = await User.findAll({ where: { id: { [Op.in]: ids } } });
        const full = Object.assign({ link: event.gameId ? gameLink(event.gameId) : BASE_URL }, event);
        for (const ch of channels) {
            try { await ch.fn(users, full); }
            catch (err) { console.error(`[Notify] Channel ${ch.name} failed:`, err); }
        }
    } catch (err) {
        console.error('[Notify] Failed:', err);
    }
}

// ── E-mail channel ───────────────────────────────────────────────────────────
registerChannel('email', async (users, event) => {
    for (const u of users) {
        if (!u.notifyEmail || !u.email || u.email.endsWith('@oauth.local') || u.isBanned) continue;
        const text = `Hallo ${u.username},\n\n${event.text}${event.summary ? '\n\n' + event.summary : ''}\n\nZum Spiel: ${event.link}\n\n` +
            `(E-Mail-Benachrichtigungen lassen sich in der Rundenspiel-Liste abschalten.)`;
        await sendMail(u.email, `Hochciv: ${event.subject}`, text);
    }
});

// ── Push channel (Android app, Firebase Cloud Messaging) ─────────────────────
// Data-only message; the app shows it and opens `link` when tapped.
registerChannel('push', async (users, event) => {
    if (!push.enabled()) return;
    for (const u of users) {
        if (!u.notifyPush || u.isBanned) continue;
        const devices = await DeviceToken.findAll({ where: { UserId: u.id } });
        for (const d of devices) {
            const result = await push.send(d.token, {
                type: String(event.type || ''),
                gameId: String(event.gameId || ''),
                title: `Hochciv: ${event.subject}`,
                body: String(event.text || '') + (event.short ? ' ' + event.short : ''),
                link: String(event.link || ''),
            });
            if (result === 'invalid') await d.destroy();
        }
    }
});

module.exports = { notify, registerChannel, gameLink };
