/**
 * The English table of client/i18n.js has every German key only once: in an object literal a
 * second entry silently replaces the first, so a duplicate is at best dead text and at worst a
 * translation changed in one place that never shows. Static – no server needed:
 *
 *   node tests/i18n/keys.test.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'i18n.js'), 'utf8');
const seen = new Map(), dupes = [];
src.split(/\r?\n/).forEach((line, i) => {
    const m = /^ {8}'((?:[^'\\]|\\.)+)':/.exec(line);
    if (!m) return;
    if (seen.has(m[1])) dupes.push(`${m[1]} (lines ${seen.get(m[1])} and ${i + 1})`);
    else seen.set(m[1], i + 1);
});
const ok = dupes.length === 0;
console.log(`${ok ? 'PASS' : 'FAIL'}  no key twice in the English table (${seen.size} keys)${ok ? '' : ': ' + dupes.join(' | ')}`);
console.log(ok ? '\nAll checks passed' : '\n1 check(s) failed');
process.exit(ok ? 0 : 1);
