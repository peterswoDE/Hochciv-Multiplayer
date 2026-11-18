/**
 * The game log in the player's language. The server writes it in German and records with each
 * entry what it is made of (e.t, utils/logtext.js): T() keys with their arguments, and literal
 * text. Here a line is put together again in the player's language:
 *
 *   · a key goes through HC_I18N.t (our table, then the game's UI_EN), its arguments first,
 *   · literal text that is a German game name or text (nations, abilities, techs, events,
 *     wonders, ages, fields, terrain – the game has both languages in DATA_DE / DATA_EN) is
 *     swapped, also inside a list ("Astronomie, Philosophie"),
 *   · an entry without e.t (older states, older game versions) is translated as a server
 *     message (HC_I18N.tr) – close, not always complete.
 *
 * Used by mp.js for the game's log (logHtml: Protokoll, "since your last turn", the turn's log)
 * and by client/scenes.js for the scene texts. Loaded after client/i18n.js (inject.js).
 */
const LOGTEXT = (function () {
    'use strict';
    let names = null;

    /** German game name or text → the player's language, from the game's two data tables. */
    function buildNames() {
        names = new Map();
        if (typeof DATA_DE === 'undefined' || !DATA_DE || typeof DATA_EN === 'undefined') return;
        const D = DATA_DE, E = DATA_EN;
        const add = (de, en) => { if (de && en && de !== en && typeof de === 'string' && !names.has(de)) names.set(de, en); };
        const pairs = (d, e) => { if (!d || !e) return; add(d[0], e[0]); add(d[1], e[1]); };
        (D.ages || []).forEach((n, i) => add(n, E.ages && E.ages[i]));
        (D.fields || []).forEach((n, i) => add(n, E.fields && E.fields[i]));
        for (const k in D.terrain || {}) add(D.terrain[k], E.terrain && E.terrain[k]);
        for (const k in D.civ || {}) add(D.civ[k], E.civ && E.civ[k]);
        for (const c in D.abil || {}) for (const k in D.abil[c]) pairs(D.abil[c][k], E.abil && E.abil[c] && E.abil[c][k]);
        for (const k in D.tech || {}) pairs(D.tech[k], E.tech && E.tech[k]);
        for (const k in D.event || {}) pairs(D.event[k], E.event && E.event[k]);
        for (const k in D.wonder || {}) pairs(D.wonder[k], E.wonder && E.wonder[k]);
        for (const k in D.tile || {}) add(k, E.tile && E.tile[k]);
        (D.maps || []).forEach((n, i) => add(n, E.maps && E.maps[i]));
    }

    /* Lines the engine writes without T() (game repo: bots.js, expansion.js, engine.js). Their
       English is in client/i18n.js; here only the German template, %s for the parts. */
    const TEMPLATES = [
        '%s: Siedler findet keinen Platz.',
        '%s: nichts mehr zu forschen in %s.',
        '%s: %s gebaut (Stufe %s, %s Münzen).',
        '%s: %s gebaut (Stufe %s).',
        '%s: Der Koloss stellt zwei kostenlose Armeen.',
        'Ereignis: %s',
        'Rundenende: %s gewinnt nach Punkten (%s).',
        'Rundenende: %s gewinnt nach Punkten (%s)',
        'Rundenende: %s gewinnt. ',
        'Neues Spiel — %s',
    ].map(k => [k, new RegExp('^' + k.split('%s').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]+?)') + '$')]);
    // fixed bits inside those lines
    const PHRASES = [['1 gegen 1: '], [' · Ereignisse (leicht)'], [' · Ereignisse (hart)']];

    function template(s) {
        for (const [k, re] of TEMPLATES) {
            const m = re.exec(s);
            if (m) return HC_I18N.t(k, ...m.slice(1).map(x => literal(x, true)));
        }
        return null;
    }

    /** Literal text: a name as a whole, or the names in a list; anything else stays. */
    function literal(s, inner) {
        if (typeof s !== 'string' || !s) return s;
        if (!names) buildNames();
        if (names.has(s)) return names.get(s);
        if (!inner) { const tp = template(s); if (tp != null) return tp; }
        for (const [de] of PHRASES) if (s.includes(de)) s = s.split(de).join(HC_I18N.t(de));
        // names joined with " und " (several winners)
        if (s.includes(' und ')) return s.split(' und ').map(x => literal(x, true)).join(HC_I18N.t(' und '));
        const t = s.trim();
        if (t !== s && names.has(t)) return s.replace(t, names.get(t));
        // "Astronomie, Philosophie" / "Russland (KI)" / "Russland II": swap the known pieces
        return s.replace(/[^,·:()\n]+/g, piece => {
            const p = piece.trim();
            if (!p) return piece;
            if (names.has(p)) return piece.replace(p, names.get(p));
            const roman = /^(.*\S)\s+([IVX]+|\d+)$/.exec(p);        // a second empire of the same nation, or "Russland 12"
            if (roman && names.has(roman[1])) return piece.replace(p, names.get(roman[1]) + ' ' + roman[2]);
            return piece;
        });
    }

    function arg(x) {
        if (Array.isArray(x)) return parts(x);
        return typeof x === 'string' ? literal(x) : x;
    }

    function parts(list) {
        return list.map(p => (p && typeof p === 'object' && typeof p.k === 'string')
            ? HC_I18N.t(p.k, ...(p.a || []).map(arg))
            : literal(p)).join('');
    }

    /** The text of log entry e ({ m, t }) in the player's language. */
    function text(e) {
        if (!e || typeof e.m !== 'string' || HC_I18N.lang() === 'de') return e && e.m;
        if (Array.isArray(e.t)) {
            try { return parts(e.t); } catch (_) { /* fall back below */ }
        }
        // game texts (event descriptions …) and the engine's lines without T() first – as a server
        // message a loose pattern would translate bits of them and leave the rest German
        if (!names) buildNames();
        if (names.has(e.m)) return names.get(e.m);
        const tp = template(e.m);
        if (tp != null) return tp;
        const roll = /^(🎲 \d+ — )([\s\S]*)$/.exec(e.m);
        return roll ? roll[1] + literal(HC_I18N.tr(roll[2])) : literal(HC_I18N.tr(e.m));
    }

    /** Copies of the entries with their text in the player's language. */
    function entries(list) {
        if (!Array.isArray(list) || HC_I18N.lang() === 'de') return list;
        return list.map(e => (e && typeof e.m === 'string' && !e.lt ? Object.assign({}, e, { m: text(e), lt: 1 }) : e));
    }

    return { text, entries, literal };
})();
