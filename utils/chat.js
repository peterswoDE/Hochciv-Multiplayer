/**
 * In-game chat of live games (sockets/game.js) and Rundenspiele (async/service.js): message
 * checks, the rate limit and the message format. Both keep a short history; pings are not
 * stored (they only mark a hex for a few seconds).
 *
 *   message = { id, t, slot, name, kind: 'text' | 'emote' | 'ping', text?, emote?, r?, c? }
 *
 * `slot` is the sender's seat (lobby index / Rundenspiel slot) – the client takes the colour
 * from it. Texts are plain text: the client escapes them.
 */
const crypto = require('crypto');

const MAX_TEXT = 300;
const LIVE_HISTORY = 100;
const ASYNC_HISTORY = 200;
const RATE_COUNT = 5;                  // messages …
const RATE_WINDOW_MS = 10 * 1000;      // … per 10 seconds and sender
const EMOTES = ['👍', '👎', '😂', '😮', '😢', '😡', '🤝', '⚔️', '🙏', '🎉', '🤔', '👋'];

const recent = new Map();              // sender key → timestamps of their last messages

/** True if `key` may send now (and counts the message). */
function allow(key) {
    const now = Date.now();
    const list = (recent.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (list.length >= RATE_COUNT) { recent.set(key, list); return false; }
    list.push(now);
    recent.set(key, list);
    return true;
}

// forget idle senders now and then
setInterval(() => {
    const now = Date.now();
    for (const [k, list] of recent) if (!list.some(t => now - t < RATE_WINDOW_MS)) recent.delete(k);
}, 60 * 1000).unref();

/**
 * Build a message from a client payload { kind, text | emote | r, c }.
 * Returns { msg } or { error } (German, translated by the client).
 */
function build(sender, payload, key) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const base = { id: crypto.randomUUID(), t: Date.now(), slot: sender.slot, name: sender.name };
    let msg;
    if (p.kind === 'emote') {
        if (!EMOTES.includes(p.emote)) return { error: 'Unbekanntes Emoji.' };
        msg = { ...base, kind: 'emote', emote: p.emote };
    } else if (p.kind === 'ping') {
        if (!Number.isInteger(p.r) || !Number.isInteger(p.c) || p.r < 0 || p.c < 0 || p.r > 99 || p.c > 99)
            return { error: 'Ungültiges Feld.' };
        msg = { ...base, kind: 'ping', r: p.r, c: p.c };
    } else {
        const text = typeof p.text === 'string' ? p.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '';
        if (!text) return { error: 'Leere Nachricht.' };
        msg = { ...base, kind: 'text', text };
    }
    if (!allow(key)) return { error: 'Zu viele Nachrichten – warte einen Moment.' };
    return { msg };
}

/** Append to a history (pings are not kept). Returns the new array. */
function remember(history, msg, max) {
    if (msg.kind === 'ping') return history || [];
    return (history || []).concat(msg).slice(-max);
}

module.exports = { build, remember, EMOTES, MAX_TEXT, LIVE_HISTORY, ASYNC_HISTORY };
