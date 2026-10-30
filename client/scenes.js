/**
 * What the others did, played on the map (F14) – the scenes of the game's own "Animationen"
 * (js/anim.js, v94) for multiplayer: KI turns, the actions of other humans and every battle.
 *
 * The server records the scenes (utils/scenes.js) and sends them as a chain of compact diffs:
 *
 *   { from, to, base, frames: [{ n, pi, t, m, art, d, k }] }
 *
 *   base   the map snapshot (animSnap in js/anim.js) before frame `from + 1`
 *   n      running number of the frame; `to` is the last one
 *   t      'a' an action (log entry of class 'act', m / art as in the log),
 *          'f' a battle (k: the engine's combat entry without its snapshot),
 *          's' a silent step (income, turn change …) that is not shown – it only keeps the chain
 *          equal to the real state
 *   d      the change against the snapshot before (diff/apply below)
 *
 * The first part (diff, apply) is shared with the server; the second part plays a chain in the
 * browser with playAnim / playCombat of js/ui.js. Game versions without js/anim.js (v93 and
 * older) record nothing and play nothing.
 */
(function (root) {
    const json = v => (v === undefined ? '-' : JSON.stringify(v));      // missing ≠ null
    const LISTS = ['cities', 'armies'];        // by id
    const MAPS = ['roads', 'bought'];          // by key

    /** The change from snapshot `a` to `b`, or null when there is none. */
    function diff(a, b) {
        const d = {};
        for (const k of LISTS) {
            const before = new Map((a[k] || []).map(x => [x.id, x]));
            const now = new Set((b[k] || []).map(x => x.id));
            const s = (b[k] || []).filter(x => !before.has(x.id) || json(before.get(x.id)) !== json(x));
            const x = [...before.keys()].filter(id => !now.has(id));
            if (s.length || x.length) d[k] = { s, x };
        }
        for (const k of MAPS) {
            const A = a[k] || {}, B = b[k] || {}, s = {};
            for (const key of Object.keys(B)) if (json(A[key]) !== json(B[key])) s[key] = B[key];
            const x = Object.keys(A).filter(key => !(key in B));
            if (Object.keys(s).length || x.length) d[k] = { s, x };
        }
        if (json(a.wonders) !== json(b.wonders)) d.wonders = b.wonders || [];
        const players = {};
        (b.players || []).forEach((p, i) => {
            const q = (a.players || [])[i] || {}, s = {};
            for (const f of Object.keys(p)) if (json(q[f]) !== json(p[f])) s[f] = p[f];
            const x = Object.keys(q).filter(f => !(f in p));
            if (Object.keys(s).length || x.length) players[i] = { s, x };
        });
        if (Object.keys(players).length) d.players = players;
        return Object.keys(d).length ? d : null;
    }

    /** Snapshot `a` with change `d` – a new object; `a` stays as it is. */
    function apply(a, d) {
        if (!d) return a;
        const out = Object.assign({}, a);
        for (const k of LISTS) {
            if (!d[k]) continue;
            const set = new Map(d[k].s.map(x => [x.id, x])), gone = new Set(d[k].x);
            const list = (a[k] || []).filter(x => !gone.has(x.id)).map(x => set.has(x.id) ? set.get(x.id) : x);
            const had = new Set(list.map(x => x.id));
            out[k] = list.concat(d[k].s.filter(x => !had.has(x.id)));
        }
        for (const k of MAPS) {
            if (!d[k]) continue;
            const m = Object.assign({}, a[k] || {}, d[k].s);
            for (const key of d[k].x) delete m[key];
            out[k] = m;
        }
        if (d.wonders) out.wonders = d.wonders;
        if (d.players) {
            out.players = (a.players || []).map((p, i) => {
                const c = d.players[i];
                if (!c) return p;
                const q = Object.assign({}, p, c.s);
                for (const f of c.x) delete q[f];
                return q;
            });
        }
        return out;
    }

    const SceneDiff = { diff, apply };
    if (typeof module !== 'undefined' && module.exports) { module.exports = SceneDiff; return; }
    root.SceneDiff = SceneDiff;

    // ── Browser: playing a chain ─────────────────────────────────────────────────

    const can = () => typeof animDetails === 'function' && typeof playAnim === 'function' && typeof playCombat === 'function';

    /**
     * The chain as parts to play, in order: { anim: [scene] } for the actions of one empire's
     * turn (a tap on the map skips the rest of it, as in single player), { fights: [entry] } for
     * its battles. Only frames after `after`; the actions of `me` are left out (one saw them while
     * doing them), their battles not.
     */
    function build(chain, after, me) {
        const parts = [];
        let cur = chain.base;
        for (const f of chain.frames || []) {
            const next = apply(cur, f.d);
            if (f.n > after && f.t === 'a' && f.pi !== me) {
                const s = { art: f.art || animUnterschied(cur, next, f.pi), pi: f.pi, vor: cur, nach: next, bild: next, texte: [f.m] };
                animDetails(s);
                const last = parts[parts.length - 1];
                if (last && last.anim && last.pi === f.pi) last.anim.push(s);
                else parts.push({ anim: [s], pi: f.pi });
            } else if (f.n > after && f.t === 'f') {
                const fight = Object.assign({}, f.k, { snap: next });
                const last = parts[parts.length - 1];
                if (last && last.fights) last.fights.push(fight);
                else parts.push({ fights: [fight] });
            }
            cur = next;
        }
        return parts;
    }

    function play(parts, done) {
        const part = parts.shift();
        // a tap on the map skipped everything queued (MP.skipScenes in mp.js)
        if (!part || (typeof MP !== 'undefined' && MP.scenesSkipped)) return done();
        const next = () => play(parts, done);
        if (part.anim) return playAnim(part.anim, next);
        return playCombat(part.fights, next);
    }

    /**
     * Plays the frames of `chain` after `after` (null: none), then calls `done`. Never throws:
     * without the game's animation code, with a broken chain or off-screen it only calls `done`.
     */
    function run(chain, after, me, done) {
        let parts = [];
        try {
            const onScreen = typeof document !== 'undefined' && document.getElementById('screen-game') &&
                document.getElementById('screen-game').classList.contains('show');
            if (chain && chain.base && after != null && can() && onScreen) parts = build(chain, after, me);
        } catch (err) {
            console.warn('[Scenes] not played:', err);
            parts = [];
        }
        if (!parts.length) return done();
        try { play(parts, done); } catch (err) { console.warn('[Scenes] stopped:', err); done(); }
    }

    root.SCENES = { build, run };
})(typeof window !== 'undefined' ? window : globalThis);
