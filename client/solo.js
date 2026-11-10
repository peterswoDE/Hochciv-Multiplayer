/**
 * Single-player games for the statistics (F28): records a game against the KI (or hotseat)
 * while it is played and sends it, once finished, to POST /api/solo/games (utils/solo.js) –
 * if the player is logged in; otherwise it waits on the device until they are.
 *
 * Loaded by the game page after mp.js (inject.js), and on its own by the Android app's offline
 * copy (no mp.js, no server there): it then only records, and the app's bridge carries the
 * finished games over to the online page (SOLO.pending / SOLO.importQueue / SOLO.delivered).
 *
 * What is kept (localStorage, per device and origin):
 *   hochciv.solo.cur    – the game being played: its id, the round each empire got each
 *                         technology, a point per round for the chart (score, cities,
 *                         population, techs, armies, wonders)
 *   hochciv.solo.queue  – finished games waiting to be sent (at most 30): the above plus the
 *                         final state, compact (no map tiles, no log)
 *
 * Only games followed from their first round are recorded (a game saved before this existed is
 * not), not the guided first game (S.fg), not multiplayer games (MP.active). The game files
 * stay unchanged: the recorder follows the game's saveGame() (every redraw) and gameOver().
 */
(function () {
    'use strict';
    if (window.SOLO) return;
    const KEY_CUR = 'hochciv.solo.cur', KEY_Q = 'hochciv.solo.queue', MAX_Q = 30;
    const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
    const hasMP = () => typeof MP !== 'undefined';
    const tx = (de, ...a) => (typeof HC_I18N !== 'undefined' ? HC_I18N.t(de, ...a) : de);
    const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
    const sigOf = S => (S.seed != null ? S.seed : '') + ':' + S.players.map(p => p.civ).join(',');
    const count = (list, i) => (list || []).filter(x => x.owner === i).length;

    /** One point of the chart: per empire score, cities, population, techs, armies, wonders, out. */
    function point(S) {
        return S.players.map((p, i) => {
            const cities = (S.cities || []).filter(c => c.owner === i);
            let s = null;
            try { s = typeof victoryScore === 'function' ? victoryScore(S, i).total : null; } catch (e) { /* older game */ }
            return {
                s, c: cities.length, pop: cities.reduce((n, c) => n + (c.pop || 0), 0),
                t: Object.keys(p.techs || {}).filter(k => p.techs[k]).length,
                a: count(S.armies, i), w: count(S.wonders, i), d: p.dead ? 1 : 0,
            };
        });
    }

    /** The final state without what the server doesn't need (map tiles, log, …). */
    function compact(S) {
        return {
            round: S.round, cur: S.cur, startIdx: S.startIdx != null ? S.startIdx : 0,
            over: S.over ? { winners: S.over.winners || (S.over.winner != null ? [S.over.winner] : []), how: S.over.how || '', military: !!S.over.military, resign: !!S.over.resign } : null,
            players: S.players.map((p, i) => ({
                civ: p.civ, kind: p.kind, ability: p.ability, drafted: p.drafted, kiLevel: p.kiLevel, diff: p.diff,
                dead: !!p.dead, techs: p.techs || {}, roman: p.roman, color: p.color, slot: p.slot != null ? p.slot : i,
            })),
            cities: (S.cities || []).map(c => ({ owner: c.owner, pop: c.pop || 0 })),
            armies: (S.armies || []).map(a => ({ owner: a.owner })),
            wonders: (S.wonders || []).map(w => ({ owner: w.owner, k: w.k })),
            map: { name: S.map && S.map.name || null },
            ev: !!S.ev, wo: !!S.wo, marathon: !!S.marathon, duel: !!S.duel,
        };
    }

    let lastKey = null;
    /** Follow the game: called after every save and at the end. */
    function track() {
        if (hasMP() && MP.active) return;
        if (typeof S === 'undefined' || !S || !Array.isArray(S.players) || S.fg) return;
        let rec = get(KEY_CUR);
        const sig = sigOf(S);
        if (!rec || rec.sig !== sig) {
            // only games followed from their start (a later round: saved before this existed)
            if (S.round > 1 || S.over) { if (!rec || rec.sig !== sig) put(KEY_CUR, { sig, skip: true }); return; }
            rec = { cid: uuid(), sig, ver: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
                startIdx: S.startIdx != null ? S.startIdx : S.cur || 0, t: S.players.map(() => ({})), rounds: [], at: Date.now() };
            lastKey = null;
        }
        if (rec.skip || rec.done) return;
        const techs = S.players.reduce((n, p) => n + Object.keys(p.techs || {}).length, 0);
        const key = `${S.round}:${S.cur}:${techs}:${S.over ? 1 : 0}`;
        if (key === lastKey) return;
        lastKey = key;
        S.players.forEach((p, i) => {
            const t = rec.t[i] || (rec.t[i] = {});
            for (const k in p.techs || {}) if (p.techs[k] && t[k] == null) t[k] = S.round;
        });
        const last = rec.rounds[rec.rounds.length - 1];
        if (!last || last.r !== S.round) rec.rounds.push({ r: S.round, p: point(S) });
        if (S.over) {
            rec.rounds[rec.rounds.length - 1] = { r: S.round, p: point(S) };     // the final point
            rec.done = true;
            const humans = S.players.filter(p => p.kind === 'human').length;
            enqueue({ cid: rec.cid, ver: rec.ver, t: rec.t, rounds: rec.rounds, state: compact(S), at: Date.now(), hotseat: humans > 1 });
        }
        put(KEY_CUR, rec);
    }

    function queue() { const q = get(KEY_Q); return Array.isArray(q) ? q : []; }
    function enqueue(item) {
        const q = queue();
        if (q.some(x => x.cid === item.cid)) return;
        q.push(item);
        while (q.length > MAX_Q) q.shift();
        if (!put(KEY_Q, q)) { q.shift(); put(KEY_Q, q); }          // storage full: drop the oldest
        try { window.dispatchEvent(new Event('hochciv-solo')); } catch (e) { /* old browser */ }
        flush(true);
    }

    let flushing = false;
    /** Send what waits – only on the online page with a login. `fresh`: a game just ended. */
    async function flush(fresh) {
        if (!hasMP() || flushing) return;
        if (!MP.user) {
            if (fresh && queue().length && typeof toast === 'function') toast(tx('Melde dich an, damit deine Einzelspiele in deine Statistik kommen.'));
            return;
        }
        flushing = true;
        const sent = [];
        try {
            for (const item of queue()) {
                let r;
                try {
                    r = await fetch((MP.serverUrl || '') + '/api/solo/games', {
                        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(item),
                    });
                } catch (e) { break; }                        // offline: later
                if (r.status === 401 || r.status === 403 || r.status === 429 || r.status >= 500) break;
                sent.push(item.cid);                           // stored, a duplicate, or refused for good (400)
                put(KEY_Q, queue().filter(x => x.cid !== item.cid));
            }
        } finally {
            flushing = false;
        }
        if (sent.length) {
            if (fresh && typeof toast === 'function') toast(tx('Einzelspiel in deiner Statistik gespeichert.'));
            if (window.__hochciv && typeof window.__hochciv.soloDelivered === 'function') window.__hochciv.soloDelivered(sent);
        }
    }

    const SOLO = {
        track, flush, compact,
        /** Finished games waiting on this device (the app's offline copy hands them over). */
        pending: () => queue(),
        /** Games from elsewhere (the app's offline copy) – queued here and sent. */
        importQueue: function (items) {
            if (!Array.isArray(items)) return 0;
            const q = queue();
            let n = 0;
            for (const it of items) {
                if (!it || typeof it.cid !== 'string' || !it.state || q.some(x => x.cid === it.cid)) continue;
                q.push(it); n++;
            }
            while (q.length > MAX_Q) q.shift();
            put(KEY_Q, q);
            flush(false);
            return n;
        },
        /** These were stored by the server (via the online page): no longer waiting here. */
        delivered: function (cids) {
            if (!Array.isArray(cids)) return;
            put(KEY_Q, queue().filter(x => !cids.includes(x.cid)));
        },
    };

    // follow the game: every save (each redraw) and the end
    if (typeof window.saveGame === 'function') {
        const save = window.saveGame;
        window.saveGame = function () {
            const r = save.apply(this, arguments);
            try { track(); } catch (e) { /* never in the game's way */ }
            return r;
        };
    }
    if (typeof window.gameOver === 'function') {
        const over = window.gameOver;
        window.gameOver = function () {
            const r = over.apply(this, arguments);
            try { track(); } catch (e) { /* never in the game's way */ }
            return r;
        };
    }
    // logged in (now or later): send what waits
    if (hasMP() && typeof MP.fetchUser === 'function') {
        const fetchUser = MP.fetchUser;
        MP.fetchUser = function () {
            return Promise.resolve(fetchUser.apply(this, arguments)).then(r => { if (MP.user) flush(false); return r; });
        };
    }

    window.SOLO = SOLO;
})();
