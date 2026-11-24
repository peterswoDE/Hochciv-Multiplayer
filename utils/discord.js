/**
 * Direct messages from the Hochciv Discord bot – the Discord channel of utils/notify.js.
 *
 * Uses the bot token of the Discord application (Admin → OAuth → Discord, `oauth_providers`), the
 * same app as the Discord login and the Activity. Without a bot token the channel is off.
 *
 * Discord only lets a bot write to a user who shares a server with it and allows DMs from that
 * server's members. Otherwise opening the DM or sending answers 50007 ("Cannot send messages to
 * this user") – send() reports that as 'closed' and the caller switches the channel off for the
 * player. DISCORD_INVITE_URL (optional) is the invitation to the server the bot is on; the game
 * shows it when DMs don't work.
 */
const { OAuthProvider } = require('../models');

const API = 'https://discord.com/api/v10';
const TOKEN_TTL_MS = 60 * 1000;
const COLOR = 0xc8952c;              // Hochciv gold
const INVITE_URL = (process.env.DISCORD_INVITE_URL || '').trim();

// Error codes for which trying again is pointless (https://discord.com/developers/docs/topics/opcodes-and-status-codes)
const CLOSED_CODES = new Set([
    50007,   // Cannot send messages to this user (no shared server, DMs off, bot blocked)
    10013,   // Unknown user
    50278,   // Cannot send messages to this user (privacy setting)
]);

let tokenCache = { value: '', at: 0 };
const dmChannels = new Map();        // discordId → DM channel id; Discord returns the same one every time

/** The bot token, or '' if none is configured (cached for a minute). */
async function botToken() {
    if (Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.value;
    const p = await OAuthProvider.findOne({ where: { provider: 'discord' }, attributes: ['botToken'] });
    tokenCache = { value: (p && p.botToken) || '', at: Date.now() };
    return tokenCache.value;
}

/** For tests and after the admin changed the token. */
function resetCache() {
    tokenCache = { value: '', at: 0 };
    dmChannels.clear();
}

async function enabled() {
    return !!(await botToken());
}

/** One API call; waits once for a rate limit (429 with retry_after, at most 10 s). */
async function call(token, method, path, body, retried) {
    const res = await fetch(API + path, {
        method,
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429 && !retried) {
        const wait = Math.min(Number(data.retry_after) || 1, 10);
        await new Promise(r => setTimeout(r, wait * 1000));
        return call(token, method, path, body, true);
    }
    return { ok: res.ok, status: res.status, data };
}

const closed = r => CLOSED_CODES.has(r.data && r.data.code) || r.status === 404;

/** The Discord message for a notify() event: a short line, an embed and a button to the game. */
function messageFor(event) {
    const text = String(event.text || '');
    const summary = event.summary ? String(event.summary) : '';
    const link = String(event.link || '');
    const embed = {
        title: `Hochciv: ${String(event.subject || '')}`.slice(0, 256),
        description: (summary ? `${text}\n\n${summary}` : text).slice(0, 4000),
        color: COLOR,
    };
    if (/^https:\/\//.test(link)) embed.url = link;
    const msg = {
        embeds: [embed],
        allowed_mentions: { parse: [] },
    };
    // Discord accepts link buttons only with an http(s) URL – not for a local http://localhost
    if (/^https:\/\//.test(link)) {
        msg.components = [{ type: 1, components: [{ type: 2, style: 5, label: 'Zum Spiel', url: link }] }];
    }
    return msg;
}

/**
 * Sends `message` as a DM to the Discord user `discordId`.
 * Returns 'sent', 'closed' (the bot can't write to this user – don't try again) or 'error'.
 */
async function sendDm(discordId, message) {
    const token = await botToken();
    if (!token || !discordId) return 'error';
    try {
        let channel = dmChannels.get(discordId);
        if (!channel) {
            const r = await call(token, 'POST', '/users/@me/channels', { recipient_id: String(discordId) });
            if (!r.ok) {
                if (closed(r)) return 'closed';
                console.warn(`[Discord] Opening the DM failed (${r.status}):`, r.data && r.data.message);
                return 'error';
            }
            channel = r.data.id;
            dmChannels.set(discordId, channel);
        }
        const r = await call(token, 'POST', `/channels/${encodeURIComponent(channel)}/messages`, message);
        if (r.ok) return 'sent';
        if (closed(r)) {
            dmChannels.delete(discordId);
            return 'closed';
        }
        console.warn(`[Discord] Sending the DM failed (${r.status}):`, r.data && r.data.message);
        return 'error';
    } catch (err) {
        console.warn('[Discord] Sending the DM failed:', err.message);
        return 'error';
    }
}

module.exports = { enabled, sendDm, messageFor, resetCache, INVITE_URL };
