/**
 * "Shapes" of inline event handlers (R-04 of the findings report). Shared by activity/build.js,
 * which collects the shape of every on*="…" attribute in mp.js and client/ at build time, and
 * activity/bridge.js, which compiles an attribute in the Discord Activity only when it fits one
 * of them.
 *
 * A handler is split into tokens; whitespace is dropped. Identifiers and punctuation must match
 * exactly. Literals (strings, numbers, true/false/null/undefined) are compared by their text,
 * except where the template has a ${…}: that literal may be any literal. So
 * onclick="MP.join('${code}')" admits the rendered onclick="MP.join('AB12CD')", and
 * onclick="location.href='/client/admin.html'" admits only that address – while an injected
 * onerror="fetch('//x')" or onclick="MP.join('x');alert(1)" fits no template.
 *
 * The allow-list is a table  key → [pattern, …]: the key is the token sequence with every literal
 * as L (shapeOf), a pattern lists the handler's literals – their text, or null for "any literal".
 */
const PLACEHOLDER = '\u0000';     // stands for a ${…} of a source template
const LITERAL_WORDS = new Set(['true', 'false', 'null', 'undefined']);
// after these tokens a "-" is a subtraction, not the sign of a number
const VALUE_END = /^([A-Za-z_$][\w$]*|\)|\])$/;

/** Tokens as { k: key part, raw: literal text } – k is 'L' for every literal. */
function tokens(code) {
    const out = [];
    let i = 0;
    while (i < code.length) {
        const c = code[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === PLACEHOLDER) { out.push({ k: 'L', raw: c }); i++; continue; }
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
            out.push({ k: 'L', raw: code.slice(i, j + 1) });
            i = j + 1;
            continue;
        }
        const num = /^(\d[\w.]*|\.\d[\w.]*)/.exec(code.slice(i, i + 40));
        if (num) { out.push({ k: 'L', raw: num[0] }); i += num[0].length; continue; }
        const id = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 200));
        if (id) {
            out.push(LITERAL_WORDS.has(id[0]) ? { k: 'L', raw: id[0] } : { k: id[0] });
            i += id[0].length;
            continue;
        }
        out.push({ k: c });
        i++;
    }
    // "-" + literal at the start of a value is one literal (a ${n} may render as -1)
    const merged = [];
    for (let n = 0; n < out.length; n++) {
        const prev = merged[merged.length - 1];
        if (out[n].k === '-' && out[n + 1] && out[n + 1].k === 'L' && !(prev && (prev.k === 'L' || VALUE_END.test(prev.k)))) {
            merged.push({ k: 'L', raw: '-' + out[n + 1].raw });
            n++;
        } else merged.push(out[n]);
    }
    return merged;
}

/** The key of a handler: its tokens with every literal as L. */
function shapeOf(code) {
    return tokens(String(code)).map(t => t.k).join(' ');
}

/** The literals of a source handler: their text, null where a ${…} goes in. */
function patternOf(code) {
    return tokens(String(code)).filter(t => t.k === 'L').map(t => (t.raw.includes(PLACEHOLDER) ? null : t.raw));
}

/** Does a rendered handler fit the table (key → patterns)? */
function allowed(code, table) {
    const toks = tokens(String(code));
    const patterns = Object.prototype.hasOwnProperty.call(table, toks.map(t => t.k).join(' ')) ? table[toks.map(t => t.k).join(' ')] : null;
    if (!patterns) return false;
    const lits = toks.filter(t => t.k === 'L').map(t => t.raw);
    return patterns.some(p => p.length === lits.length && p.every((v, n) => v === null || v === lits[n]));
}

module.exports = { PLACEHOLDER, shapeOf, patternOf, allowed };
