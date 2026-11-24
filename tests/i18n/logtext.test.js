/**
 * client/logtext.js: the lines the engine writes without T() (its TEMPLATES) are English as a
 * whole, also when the server's annotation (utils/logtext.js) split them into pieces – a name
 * in the line that was an output of T() shortly before ("Die große Bibliothek" from the wonder's
 * own effect) or a known piece between ": " made e.t, and translated piece by piece the
 * template's fixed text stayed German. Static – no server needed:
 *
 *   node tests/i18n/logtext.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', '..', 'client', f), 'utf8');
const ctx = {
    LANG: 'en', console,
    DATA_DE: { civ: { wikinger: 'Wikinger' }, wonder: { bibliothek: ['Die große Bibliothek', 'Erforsche sofort …'] } },
    DATA_EN: { civ: { wikinger: 'Vikings' }, wonder: { bibliothek: ['The Great Library', 'Research at once …'] } },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('i18n.js'), ctx);
vm.runInContext(read('logtext.js') + '\nwindow.LOGTEXT = LOGTEXT;', ctx);

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const m = 'Wikinger: Die große Bibliothek gebaut (Stufe 1, 10 Münzen).';
const want = 'Vikings: The Great Library built (level 1, 10 coins).';
for (const [name, t] of [
    ['no annotation', undefined],
    ['name found among recent T outputs', ['Wikinger: ', { k: 'Die große Bibliothek' }, ' gebaut (Stufe 1, 10 Münzen).']],
    ['split at ": " and ", "', ['Wikinger', ': ', 'Die große Bibliothek gebaut (Stufe 1', ', ', '10 Münzen).']],
]) {
    const got = ctx.LOGTEXT.text({ m, t });
    ok(got === want, `wonder built, ${name}`, got);
}
// a line that is one T() output still goes through its annotation
const tLine = ctx.LOGTEXT.text({ m: '🎲 4 — Bereit', t: ['🎲 4 — ', { k: 'Bereit' }] });
ok(tLine === '🎲 4 — Ready', 'a T() line with e.t', tLine);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
