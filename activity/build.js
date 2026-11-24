// Bundles activity/bridge.js with Discord's Embedded App SDK into one classic script.
// The output lives in node_modules/.cache (ignored by Git and Docker); server.js serves it as
// /js/activity.js. Run with "npm run build:activity" – the Dockerfile does it in a build stage.
//
// It also collects the shape of every inline handler (on*="…") in mp.js and client/ and bakes
// that table into the bundle: the bridge compiles only handlers that fit one of them (R-04,
// activity/handler-shapes.js). A handler that is a whole ${…} has no fixed shape – the build
// fails on it, write the call into the template instead.
const fs = require('fs');
const path = require('path');
const { PLACEHOLDER, shapeOf, patternOf } = require('./handler-shapes');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'node_modules', '.cache', 'hochciv-activity', 'activity.js');
// The scripts the game page loads besides the game itself (inject.js); the game uses no inline handlers
const SOURCES = ['mp.js', 'client'];

function sourceFiles() {
    const out = [];
    const walk = p => {
        if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach(f => walk(path.join(p, f)));
        else if (p.endsWith('.js')) out.push(p);
    };
    SOURCES.forEach(s => walk(path.join(ROOT, s)));
    return out;
}

/** End of the ${…} that starts at i (index of "$"), skipping nested braces and quoted text. */
function interpolationEnd(src, i) {
    let depth = 0;
    for (let j = i + 1; j < src.length; j++) {
        const c = src[j];
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return j;
        else if (c === "'" || c === '"') {
            j++;
            while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
        } else if (c === '`') {
            j++;
            while (j < src.length && src[j] !== '`') {
                if (src[j] === '\\') j++;
                else if (src[j] === '$' && src[j + 1] === '{') j = interpolationEnd(src, j);
                j++;
            }
        }
    }
    throw new Error('unbalanced ${');
}

const decode = s => s.replace(/\\(['"\\`])/g, '$1').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

/** Every on*="…" attribute of a source file: { code (with placeholders), line }. */
function handlersIn(src) {
    const out = [];
    const re = /\bon[a-z]+="/g;
    let m;
    while ((m = re.exec(src))) {
        let code = '';
        let j = re.lastIndex;
        for (; j < src.length && src[j] !== '"'; j++) {
            if (src[j] === '$' && src[j + 1] === '{') {
                j = interpolationEnd(src, j);
                code += PLACEHOLDER;
            } else code += src[j];
        }
        out.push({ code: decode(code), line: src.slice(0, m.index).split('\n').length });
        re.lastIndex = j + 1;
    }
    return out;
}

/** The allowed handlers as a table key → [pattern, …] (handler-shapes.js); throws on a handler
 *  without a fixed shape. */
function collectShapes() {
    const table = {};
    const bad = [];
    for (const file of sourceFiles()) {
        for (const h of handlersIn(fs.readFileSync(file, 'utf8'))) {
            const shape = shapeOf(h.code);
            // a literal where a statement starts or something is called: the ${…} renders code, not a value
            const t = shape.split(' ');
            if (t.some((tok, k) => tok === 'L' && (k === 0 || t[k - 1] === ';' || t[k - 1] === '{' || t[k + 1] === '(' || t[k + 1] === '.'))) {
                bad.push(`${path.relative(ROOT, file)}:${h.line}  ${h.code.split(PLACEHOLDER).join('${…}')}`);
            }
            const pattern = patternOf(h.code);
            const list = table[shape] || (table[shape] = []);
            if (!list.some(p => JSON.stringify(p) === JSON.stringify(pattern))) list.push(pattern);
        }
    }
    if (bad.length) throw new Error('Inline handlers without a fixed shape (write the call into the template):\n  ' + bad.join('\n  '));
    return table;
}

if (require.main === module) {
    let table;
    try { table = collectShapes(); } catch (e) { console.error(e.message); process.exit(1); }
    require('esbuild').build({
        entryPoints: [path.join(__dirname, 'bridge.js')],
        outfile: OUT_FILE,
        bundle: true,
        format: 'iife',
        target: ['es2020'],
        minify: true,
        legalComments: 'none',
        logLevel: 'info',
        define: { __HANDLER_SHAPES__: JSON.stringify(table) },
    }).then(() => console.log(`${Object.keys(table).length} inline handler shapes allowed`)).catch(() => process.exit(1));
}

module.exports = { OUT_FILE, collectShapes, handlersIn };
