/**
 * The game log in every player's language. The engine runs on the server in German: a log line
 * is a finished German string (T() fills its %s at once). Turning that text back into English on
 * the client only half works – names and fixed parts get mixed up. So the server records, for
 * each log entry, what the line is made of:
 *
 *   e.t = [part, …]   part = 'literal text' | { k: '<German key of T()>', a: [arg, …] }
 *                     arg  = a number, a literal string, or again [part, …]
 *
 * T is wrapped in the engine's sandbox: every output is remembered with its key and arguments
 * (`known`, and the last few in `recent`). A log line is the output of one T call, or several
 * glued together with fixed text ('🎲 4 — ' + T(…), list joins) – the recent outputs are found
 * in it. What is left stays literal (nation, tech and wonder names: the client has those in
 * both languages, client/logtext.js).
 * The KI's planning copies (S.kiSim) log a lot and are thrown away: they get nothing.
 */
const vm = require('vm');

const KNOWN_MAX = 5000;      // outputs remembered for arguments; cleared when full
const RECENT_MAX = 48;       // the last outputs, searched inside a log line
const DEPTH = 4;

function install(sandbox) {
    let T0;
    try { T0 = vm.runInContext('typeof T === "function" ? T : null', sandbox); } catch (_) { T0 = null; }
    if (!T0) return null;
    const known = new Map();
    const recent = [];

    sandbox.__logT = function (de, ...args) {
        const out = T0.call(this, de, ...args);
        if (typeof de === 'string' && typeof out === 'string' && out) {
            if (known.size >= KNOWN_MAX) known.clear();
            known.set(out, [de, args]);
            if (out.length >= 3) {
                recent.push(out);
                if (recent.length > RECENT_MAX) recent.shift();
            }
        }
        return out;
    };
    vm.runInContext('T = __logT;', sandbox);

    function arg(x, depth) {
        if (typeof x !== 'string') return typeof x === 'number' ? x : String(x);
        const p = parts(x, depth + 1);
        return p.length === 1 && typeof p[0] === 'string' ? x : p;
    }

    function parts(str, depth) {
        if (!str) return [str];
        const hit = known.get(str);
        if (hit) {
            const p = { k: hit[0] };                 // no `a` without arguments – the state goes to every client
            if (hit[1].length) p.a = depth < DEPTH ? hit[1].map(x => arg(x, depth)) : hit[1].map(String);
            return [p];
        }
        if (depth >= DEPTH) return [str];
        // pieces between separators that are outputs of their own (made long before the line –
        // the KI's plan labels: the planning's own T calls have pushed them out of `recent`)
        const pieces = str.split(/( · |: |, )/);
        if (pieces.length > 1 && pieces.some((x, k) => k % 2 === 0 && known.has(x))) {
            return pieces.flatMap((x, k) => (k % 2 ? [x] : parts(x, depth + 1)));
        }
        // the longest recent output inside the line; the rest on both sides is looked at again
        let best = null;
        for (const o of recent) if (o.length < str.length && (!best || o.length > best.length) && str.includes(o)) best = o;
        if (!best) return [str];
        const i = str.indexOf(best);
        const out = [];
        if (i > 0) out.push(...parts(str.slice(0, i), depth + 1));
        out.push(...parts(best, depth + 1));
        if (i + best.length < str.length) out.push(...parts(str.slice(i + best.length), depth + 1));
        return out;
    }

    /** Called for each log entry of a live state (the scene hook calls it first). */
    return function annotate(S, e) {
        if (!e || typeof e.m !== 'string' || (S && S.kiSim)) return;
        const p = parts(e.m, 0);
        if (p.length === 1 && typeof p[0] === 'string') return;      // nothing of T in it
        if (p.length === 1 && !p[0].a && p[0].k === e.m) return;      // a fixed text: the client looks m up
        e.t = p;
    };
}

module.exports = { install };
