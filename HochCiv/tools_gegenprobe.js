/* Gegenprobe (v113, nur für die Entwicklung): Ändert eine Änderung etwas, das sie nicht ändern soll?
   Spielt dieselben Partien und zeichnet dieselben Bildschirme mit zwei Fassungen und vergleicht.

   node tools_gegenprobe.js <Ordner der alten Fassung>          vergleicht mit diesem Ordner
   node tools_gegenprobe.js <alt> <neu>                         vergleicht zwei beliebige Ordner

   1. Partien: 39 Partien aller bestehenden Spielarten mit festem Startwert, KI und Bots – Duelle mit
      allen zwölf Grundfähigkeiten und allen experimentellen Reichen, drei und vier Reiche auf der
      Plättchenkarte und der Originalkarte, Ereignisse, Weltwunder, alter Techtree, Marathon (gekappt),
      Fähigkeitswahl der Plättchenkarte, die drei Wege des Ersten Spiels mit ihren Musterlösungen.
      Verglichen wird je Partie eine Prüfsumme über den Endstand und über JEDE Protokollzeile, auch die
      der Wegwerfkopien, auf denen die KI plant – so fällt schon eine andere Abwägung der KI auf.
   2. Oberfläche: je Sprache vier Spielstände mit Kopfzeile, Karte, Leiste, Technologiebogen, Welt,
      Fähigkeiten, Nahrung, Macht (samt Ringen), Regeln, Stadt- und Feldblatt, Protokoll und Spielende;
      dazu Menü, Regeln ohne Spiel, die Seite „Erstes Spiel", der Aufbau in allen vier Spielarten, Panel
      und Bogen des Ersten Spiels – verglichen wird das HTML.
   Ausgegeben wird, was sich unterscheidet (bei Ansichten die Stelle). Erwartete Unterschiede nennt man
   selbst – in v113 genau einer: die Seite „Erstes Spiel" bekam das vereinfachte Spiel.
   Braucht jsdom wie smoke.js. Laufzeit gut eine Minute je Fassung. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');

if (process.argv[2] === '--lauf') return lauf(process.argv[3], process.argv[4]);
const alt = path.resolve(process.argv[2] || ''), neu = path.resolve(process.argv[3] || __dirname);
if (!process.argv[2] || !fs.existsSync(alt + '/index.html')) {
  console.log('Aufruf: node tools_gegenprobe.js <Ordner der alten Fassung> [<Ordner der neuen Fassung>]');
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gegenprobe-'));
const ergebnis = dir => {
  const out = path.join(tmp, crypto.createHash('sha1').update(dir).digest('hex').slice(0, 8) + '.json');
  execFileSync(process.execPath, [__filename, '--lauf', dir, out], { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};
const A = ergebnis(alt), B = ergebnis(neu);
let anders = 0;
for (const k of Object.keys(A.partien)) {
  const a = A.partien[k], b = B.partien[k];
  if (b && a.log === b.log && a.stand === b.stand && a.fehler === b.fehler) continue;
  anders++;
  console.log(`ANDERS  Partie ${k}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}
for (const k of Object.keys(A.ansichten)) {
  const a = A.ansichten[k], b = B.ansichten[k];
  if (a === b) continue;
  anders++;
  if (a == null || b == null) { console.log(`ANDERS  Ansicht ${k}: ${a == null ? 'fehlt alt' : 'fehlt neu'}`); continue; }
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  console.log(`ANDERS  Ansicht ${k}: alt ${JSON.stringify(a.slice(i, a.length - j).slice(0, 300))} · neu ${JSON.stringify(b.slice(i, b.length - j).slice(0, 300))}`);
}
for (const k of Object.keys(B.ansichten)) if (!(k in A.ansichten)) { anders++; console.log(`NEU     Ansicht ${k}`); }
const fehler = A.fehler.concat(B.fehler);
console.log(`gegenprobe  ${Object.keys(A.partien).length} Partien, ${Object.keys(A.ansichten).length} Ansichten · ${anders} anders` +
  (fehler.length ? ` · Fehler: ${fehler.join(' | ')}` : ''));
fs.rmSync(tmp, { recursive: true, force: true });

/* ------------------------------------------------------------------ Lauf mit einer Fassung */
function lauf(DIR, OUT) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(fs.readFileSync(DIR + '/index.html', 'utf8'), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  // wie smoke.js: SVG-Layout und Maße, die jsdom nicht kennt, und derselbe Zufall in jedem Lauf
  const SVG = window.SVGElement.prototype;
  SVG.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
  SVG.getScreenCTM = function () { return { a: 1, d: 1, inverse: () => ({}) }; };
  window.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0 });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 600; } });
  window.Element.prototype.setPointerCapture = () => { };
  window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => { };
  window.eval(`(() => { let a = 102; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`);
  const fehler = [];
  window.addEventListener('error', e => fehler.push(e.message));
  const src = [...fs.readFileSync(DIR + '/index.html', 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
    .map(f => fs.readFileSync(DIR + '/' + f, 'utf8')).join('\n');
  window.eval(src + '\n;window.__get = n => eval(n); window.__set = (n, v) => eval(n + "=v");');
  const G = n => window.__get(n), SET = (n, v) => window.__set(n, v), $ = id => window.document.getElementById(id);
  SET('FG_AUTO_MS', 0); SET('COMBAT_MS', 0); SET('ANIM_MS', 0); G('prefs').anim = 'aus';
  const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  let H = null;
  SET('LOG_HOOK', (S, e) => { if (H) H.update(JSON.stringify([e.c, e.m, e.r, e.seq, e.art || null]) + '\n'); });

  // --- Partien
  const ki = (civ, ability, kiLevel) => ({ civ, kind: 'ki', ability, kiLevel: kiLevel || 'mittel' });
  const bot = (civ, diff) => ({ civ, kind: 'bot', diff: diff || 'prinz' });
  function platten(players, seed, start, extra) {
    const cfg = Object.assign({ seed, players, duel: players.length === 2, startPlayer: start }, extra || {});
    const plan = G('tilePlan')(players.map(p => p.civ), seed);
    const setup = G('rollSetup')(Object.assign({}, cfg));
    const rnd = G('mapRng')(seed + 12345);
    plan.seats.forEach(st => {
      const pl = players[st.idx];
      if (pl.kind === 'ki') { if (G('kiPlaceSeat')(plan, st, pl, setup)) G('botPlaceSeat')(plan, st, rnd); } else G('botPlaceSeat')(plan, st, rnd);
    });
    return G('newGame')(Object.assign(cfg, { map: G('tileMap')(plan), avail: setup.avail, wpool: setup.wpool }));
  }
  function marathon(players, seed, start) {
    const cfg = { seed, players, startPlayer: start, marathon: true, map: G('marathonMap')(seed) };
    const setup = G('rollSetup')(cfg);
    cfg.avail = setup.avail; cfg.wpool = setup.wpool;
    const V = G('draftView')(cfg), D = G('draftNew')(V, seed + 1);
    while (!G('draftDone')(D)) { const pi = G('draftCurrent')(D); G('draftPick')(D, pi, G('kiDraftPick')(V, D, pi)); }
    const pl = players.map(pc => Object.assign({}, pc));
    V.players.forEach((p, i) => { if (p.kind !== 'bot') pl[p.slot].drafted = D.picks[i].slice(); });
    return G('newGame')(Object.assign({}, cfg, { players: pl }));
  }
  function spiele(S, bis) {
    let n = 0;
    while (!S.over && S.round <= bis && n++ < 3000) {
      const pi = S.cur;
      if (S.players[pi].kind === 'ki') G('kiTurn')(S, pi); else G('botTurn')(S, pi);
      if (S.over) break;
      G('endTurn')(S);
    }
    return S;
  }
  const partien = [];
  const neu = (name, fn) => partien.push({ name, fn });
  const B = ['griechenland', 'england', 'russland', 'wikinger'];
  const AB = { griechenland: ['basis', 'gratistech', 'rueckschau'], england: ['basis', 'gruenden', 'kuestenstaedte'],
    russland: ['basis', 'wachstum', 'siedler'], wikinger: ['basis', 'kampfertrag', 'armeemacht'] };
  for (let g = 0; g < 12; g++) {
    const a = B[g % 4], b = B[(g + 1 + (g >> 2)) % 4];
    const ext = { events: g % 3 === 1, eventMode: g % 2 ? 'easy' : 'hard', wonders: g % 4 >= 2, seatOrder: g % 2 === 0 };
    neu(`duell ${g} ${a}:${AB[a][g % 3]} – ${b}:${AB[b][(g + 1) % 3]}`,
      () => spiele(platten([ki(a, AB[a][g % 3], ['leicht', 'mittel', 'schwer'][g % 3]), ki(b, AB[b][(g + 1) % 3], 'schwer')], 5000 + g, g % 2, ext), 40));
  }
  neu('duell KI gegen Bot', () => spiele(platten([ki('griechenland', 'basis'), bot('england', 'koenig')], 5100, 0, { seatOrder: true }), 40));
  neu('duell Bot gegen Bot', () => spiele(platten([bot('russland', 'david'), bot('wikinger', 'siedler')], 5101, 1), 60));
  [['rom', 'basis'], ['rom', 'viaappia'], ['venedig', 'basis'], ['deutschland', 'basis'], ['maya', 'basis'],
    ['china', 'basis'], ['usa', 'basis'], ['azteken', 'basis'], ['aegypten', 'basis']].forEach(([c, a], i) => {
    const gegner = B[i % 4], wo = c === 'azteken' || c === 'aegypten' || i % 3 === 0;
    neu(`experimentell ${c}:${a}`, () => spiele(platten([ki(c, a, 'schwer'), ki(gegner, AB[gegner][i % 3])], 5200 + i, i % 2,
      { expCivs: true, wonders: wo, events: i % 2 === 1, seatOrder: true }), 40));
  });
  for (let g = 0; g < 4; g++) {
    const pl = [0, 1, 2].map(i => { const c = B[(g + i) % 4]; return i === 2 && g % 2 ? bot(c) : ki(c, AB[c][(g + i) % 3]); });
    neu(`drei ${g}`, () => spiele(platten(pl, 5300 + g, g % 3, { events: g === 1, wonders: g >= 2, seatOrder: g % 2 === 0 }), 30));
  }
  for (let g = 0; g < 3; g++) {
    const pl = B.map((c, i) => i === g ? bot(c) : ki(c, AB[c][(g + i) % 3], ['leicht', 'mittel', 'schwer'][(g + i) % 3]));
    neu(`vier Plättchen ${g}`, () => spiele(platten(pl, 5400 + g, g, { events: g === 2, wonders: g === 1, seatOrder: g % 2 === 0 }), 25));
  }
  for (let g = 0; g < 3; g++) {
    const pl = B.map((c, i) => i === (g + 1) % 4 ? bot(c, 'david') : ki(c, AB[c][(g + i) % 3]));
    neu(`vier Originalkarte ${g}`, () => spiele(G('newGame')({ seed: 5500 + g, players: pl, startPlayer: g, map: G('MAP_ORIGINAL'),
      events: g === 0, wonders: g === 2 }), 25));
  }
  neu('alter Techtree', () => spiele(platten([ki('griechenland', 'basis'), ki('wikinger', 'basis')], 5600, 0, { oldTree: true }), 30));
  neu('Marathon (bis Runde 8)', () => spiele(marathon([ki('griechenland'), bot('england'), ki('russland'), bot('wikinger')], 5700, 1), 8));
  neu('Fähigkeitswahl', () => {
    const players = [{ civ: 'zufall', kind: 'ki', kiLevel: 'mittel', pick: true }, { civ: 'zufall', kind: 'ki', kiLevel: 'schwer', pick: true }];
    const D = G('pickNew')([1, 0], 5802, { exp: true, wo: false });
    for (let i = G('draftCurrent')(D); i != null; i = G('draftCurrent')(D)) G('draftPick')(D, i, G('kiPickAbility')(D, i));
    G('pickApply')(players, D);
    return spiele(platten(players, 5800, 1, { expCivs: true, seatOrder: true }), 40);
  });
  for (const pfad of ['militaer', 'wirtschaft', 'wissenschaft']) neu('Erstes Spiel ' + pfad, () => {
    G('fgSetup')(pfad);
    for (let n = 0; n < 400; n++) {
      const st = G('fgSchritt')();
      if (!st || st.ende) break;
      if (st.fertig()) { G('fgVor')(); continue; }
      st.loesung();
      G('fgNachholen')();
    }
    const S = G('S');
    SET('ui', { sel: null, army: null, mode: null, botTimer: null });
    return S;
  });
  const ergebnisse = {};
  for (const p of partien) {
    H = crypto.createHash('sha256');
    let S = null, f = null;
    try { S = p.fn(); } catch (e) { f = String(e && e.message || e); }
    const log = H.digest('hex').slice(0, 16); H = null;
    ergebnisse[p.name] = f ? { fehler: f } : { log, stand: sha(JSON.stringify(S)), runde: S.round, ende: S.over ? S.over.how : null };
  }

  // --- Oberfläche
  const ansichten = {};
  const nimm = (k, el) => { ansichten[k] = el ? el.innerHTML : null; };
  const staende = {
    duell: () => spiele(platten([ki('griechenland', 'gratistech'), ki('england', 'basis', 'schwer')], 777, 0, { wonders: true, events: true, seatOrder: true }), 3),
    vier: () => spiele(G('newGame')({ seed: 778, map: G('MAP_ORIGINAL'), startPlayer: 1,
      players: B.map((c, i) => i === 3 ? bot(c) : ki(c, 'basis')) }), 2),
    drei: () => spiele(platten(['russland', 'wikinger', 'griechenland'].map(c => ki(c, 'basis')), 779, 2, { seatOrder: true }), 4),
    experimentell: () => spiele(platten([ki('china', 'basis'), ki('rom', 'viaappia')], 780, 1, { expCivs: true, seatOrder: true }), 2),
  };
  function zeige(name, S0) {
    const S = JSON.parse(JSON.stringify(S0));
    S.players[S.cur].kind = 'human';               // der Platz am Zug wird Mensch
    SET('S', S); SET('ui', { sel: null, army: null, mode: null, botTimer: null });
    G('show')('screen-game'); G('redraw')();
    nimm(name + ' · Kopfzeile', window.document.querySelector('.hud'));
    nimm(name + ' · Karte', $('map'));
    nimm(name + ' · Leiste', window.document.querySelector('.actionbar'));
    G('techModal')(); nimm(name + ' · Technologien', $('ov-body')); G('closeModal')();
    G('worldModal')(); nimm(name + ' · Welt', $('ov-body')); G('closeModal')();
    G('abilSheet')(true); nimm(name + ' · Fähigkeiten', $('sheet-body')); G('closeSheet')();
    G('foodSheet')(); nimm(name + ' · Nahrung', $('sheet-body')); G('closeSheet')();
    G('powerSheet')(); nimm(name + ' · Macht', $('sheet-body')); nimm(name + ' · Karte mit Ringen', $('map')); G('closeSheet')();
    G('ui').powerView = false;
    G('rulesModal')(); nimm(name + ' · Regeln', $('ov-body')); G('closeModal')();
    const cap = G('capitalOf')(S, S.cur);
    G('openTile')(cap.r, cap.c); nimm(name + ' · Stadtblatt', $('sheet-body')); G('closeSheet')();
    const nb = G('neighbors')(cap.r, cap.c).find(([r, c]) => G('isLand')(S, r, c) && !G('cityAt')(S, r, c));
    if (nb) { G('openTile')(nb[0], nb[1]); nimm(name + ' · Feldblatt', $('sheet-body')); G('closeSheet')(); }
    G('logModal')(); nimm(name + ' · Protokoll', $('ov-body')); G('closeModal')();
    S.over = { winner: S.cur, winners: [S.cur], how: 'Test' };
    S.recipe = { mode: 'duell', mapPick: 'plaettchen', players: S.players.map(p => ({ civ: p.civ, kind: p.kind, kiLevel: 'mittel', ability: 'basis' })) };
    G('gameOver')(); nimm(name + ' · Spielende', $('ov-body')); G('closeModal')();
    const c = $('confetti'); if (c) c.remove();
  }
  const merk = window.localStorage.getItem('hochciv.fg');
  for (const lang of ['de', 'en']) {
    G('switchLang')(lang);
    for (const [k, f] of Object.entries(staende)) zeige(lang + ' ' + k, f());
    SET('S', null);
    G('show')('screen-menu'); G('menuButtons')();
    nimm(lang + ' Menü', $('screen-menu'));
    G('rulesModal')(); nimm(lang + ' Regeln ohne Spiel', $('ov-body')); G('closeModal')();
    window.localStorage.removeItem('hochciv.fg'); window.localStorage.removeItem('hochciv.einfach');
    G('fgSeite')(); nimm(lang + ' Seite Erstes Spiel', $('ov-body')); G('closeModal')();
    for (const m of ['vier', 'drei', 'duell', 'marathon']) {
      G('show')('screen-setup'); G('setupScreen')();
      $('setup-mode').querySelector(`[data-mode=${m}]`).onclick();
      nimm(lang + ' Aufbau ' + m, $('screen-setup'));
    }
  }
  if (merk != null) window.localStorage.setItem('hochciv.fg', merk);
  G('switchLang')('de');
  G('fgSetup')('wirtschaft'); G('fgPanelAn')(); G('startGameScreen')();
  nimm('Erstes Spiel · Panel', $('tut-panel'));
  G('techModal')(); nimm('Erstes Spiel · Technologien', $('ov-body')); G('closeModal')();
  fs.writeFileSync(OUT, JSON.stringify({ partien: ergebnisse, ansichten, fehler: fehler.concat(G('UI_ERRORS') || []) }));
}
