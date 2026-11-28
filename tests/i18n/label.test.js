/**
 * HC_I18N.label() (client/i18n.js): "waiting for" from the server is a German text ("2 Mitspieler",
 * "freier Platz (Rom)") or just player names ("anna, bert"). The texts become English, names stay
 * and are not reported as a missing translation – they were, so english.test.js failed whenever
 * a turn-based game of another test waited for a player. Static – no server needed:
 *
 *   node tests/i18n/label.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
const ctx = { LANG: 'en', console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('client/i18n.js'), ctx);
const I = ctx.HC_I18N;

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

ok(I.label('2 Mitspieler') === '2 players', 'a text becomes English', I.label('2 Mitspieler'));
ok(I.label('freier Platz (Rom)') === 'free seat (Rom)', 'a text with a name becomes English', I.label('freier Platz (Rom)'));
ok(I.label('anna_fr, bert') === 'anna_fr, bert', 'names stay as they are');
ok(I.missing().length === 0, 'names are not reported missing', I.missing().join(' | '));
I.tr('Ein Satz ohne Übersetzung');
ok(I.missing().includes('Ein Satz ohne Übersetzung'), 'tr() still reports what is missing');

// every place that shows "waiting for" uses label()
for (const f of ['mp.js', 'client/admin.js']) {
    const bad = read(f).split(/\r?\n/).map((l, i) => [l, i + 1]).filter(([l]) => /waitingFor/.test(l) && /\b(TXS|txs|HC_I18N\.tr)\(/.test(l));
    ok(!bad.length, `${f}: "waiting for" through label()`, bad.map(([, n]) => 'line ' + n).join(', '));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
