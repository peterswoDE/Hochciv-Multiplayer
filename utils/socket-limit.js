/**
 * Rate limit for every Socket.IO event (R-15 of the findings report). Each socket gets two
 * token buckets: one for game moves (`action`, `placement:action` – the engine runs them, a bot
 * sends them one after another) and one for everything else. An event that finds its bucket
 * empty is not handled: its acknowledgement gets an error, nothing else happens. A socket that
 * keeps sending into an empty bucket is disconnected.
 *
 * A player never gets near the limits; a bot that waits for each acknowledgement neither
 * (the round trip and the engine take longer). Chat has its own, stricter limit (utils/chat.js).
 *
 *   server.js:  io.on('connection', socket => SocketLimit.attach(socket));
 */
const MESSAGE = 'Zu viele Anfragen – warte einen Moment.';

// burst = bucket size, rate = tokens per second
const LIMITS = {
    move: { burst: 100, rate: 30 },
    other: { burst: 40, rate: 10 },
};
const MOVES = new Set(['action', 'placement:action']);
// Dropped events: one strike each, STRIKE_DECAY strikes are forgiven per second; at MAX_STRIKES
// the socket is disconnected (about 10 s of sending flat out above the limit)
const MAX_STRIKES = 50;
const STRIKE_DECAY = 5;

function bucket({ burst, rate }) {
    return { tokens: burst, burst, rate, at: Date.now() };
}

/** Refills `b` by the time passed and takes one token; false if it is empty. */
function take(b, now = Date.now()) {
    b.tokens = Math.min(b.burst, b.tokens + (now - b.at) / 1000 * b.rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
}

/** Adds the rate limit to a connected socket (Socket.IO middleware per packet). */
function attach(socket) {
    const buckets = { move: bucket(LIMITS.move), other: bucket(LIMITS.other) };
    const strikes = { n: 0, at: Date.now() };
    socket.use((packet, next) => {
        const event = packet[0];
        const now = Date.now();
        if (take(MOVES.has(event) ? buckets.move : buckets.other, now)) return next();
        strikes.n = Math.max(0, strikes.n - (now - strikes.at) / 1000 * STRIKE_DECAY) + 1;
        strikes.at = now;
        const ack = packet[packet.length - 1];
        if (typeof ack === 'function') ack({ error: MESSAGE, code: 'rate_limited', retryAfter: 1 });
        if (strikes.n >= MAX_STRIKES) {
            console.warn(`[SocketLimit] ${socket.id} disconnected: too many events (last: ${String(event).slice(0, 40)})`);
            socket.disconnect(true);
        }
        // not calling next() drops the packet without an 'error' event
    });
}

module.exports = { attach, take, bucket, LIMITS, MOVES, MAX_STRIKES, MESSAGE };
