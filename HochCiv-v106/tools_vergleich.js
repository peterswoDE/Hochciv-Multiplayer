/* Vergleich zweier Stände der Regelmaschine: Spielen beide Partie für Partie genau gleich?

   Für Tempo-Änderungen, die am Ergebnis nichts ändern dürfen. Gespielt werden feste Partien
   (2–8 Reiche; Plättchen, Sechsecke, Originalkarte, eigene Karten, Marathon; Wunder an und aus;
   Ereignisse aus, leicht, hart; KI schwer allein oder mit Bots). In einen laufenden Hash gehen
   nach jeder Aktion und jedem Zug der ganze Spielstand (samt S.seed, kiRng und Protokoll), dazu
   die Kandidaten und kiScore-Werte jeder Entscheidung, exakt, also als Zeichenkette.

     node tools_vergleich.js record <js-Ordner> <ziel.json> [--procs 6] [--seeds 2] [--check-income] [--strict]
     node tools_vergleich.js compare <a.json> <b.json>
     node tools_vergleich.js tempo <js-Ordner> [--seeds 2] [--runs 3]        CPU-Zeit ohne Hash

   --check-income prüft bei jedem Aufruf income(S, pi) gegen incomeBreakdown(S, pi).total.
   --strict lädt die Dateien im strikten Modus: Schreiben auf eingefrorene Objekte wirft dann.
   --check-risk (mit --strict) rechnet jeden 40. kiRisk noch einmal auf einem tief eingefrorenen
   Spielstand: Das muss gehen und dasselbe ergeben, sonst dürfte kiRisk nichts wiederverwenden.
   --seats mensch spielt statt der üblichen Partien dieselben Formen mit jedem zweiten Sitz als
   Mensch (den die KI zieht): Nur gegen Menschen rechnet die KI mit dem entschlossenen Angreifer
   (kiDetermined), in den Partien nur aus KI und Bots kommt dieser Weg nie vor.
   Die Maschine wird wie in Hochciv-KI/bridge/worker.js geladen und bedient. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const FILES = ['data.js', 'civs.js', 'i18n.js', 'hex.js', 'tiles.js', 'engine.js', 'expansion.js',
  'bots.js', 'ki.js', 'marathon.js', 'anim.js'];
const ACTIONS = ['doResearch', 'useFreeTech', 'useFreePick', 'useBackPick', 'copyTech', 'foundCity',
  'growCity', 'sacrifice', 'buildArmy', 'moveArmy', 'buyPower', 'buildRoad', 'buyTile', 'coverPop',
  'uncoverPop', 'buildWonder', 'nuke', 'endTurn'];

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : process.argv[i + 1];
}
const flag = name => process.argv.includes('--' + name);

function loadEngine(dir, strict) {
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    Math, JSON, Set, Map, Array, Object, Number, String, Infinity, parseInt, parseFloat, isNaN,
    isFinite, Error, TypeError, RangeError, RegExp, Date, Symbol,
    T: (str, ...args) => {
      let out = str;
      args.forEach(a => { if (out && out.replace) out = out.replace('%s', a); });
      return out;
    },
  };
  vm.createContext(sandbox);
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext((strict ? "'use strict';\n" : '') + src, sandbox, { filename: f });
  }
  sandbox.konst = name => vm.runInContext(`typeof ${name} !== 'undefined' ? ${name} : undefined`, sandbox);
  return sandbox;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const seedOf = text => crypto.createHash('sha1').update(text).digest().readUInt32BE(0) & 0x7fffffff;

function makePlayers(E, seats, seed, distinct) {
  const CIVS = E.konst('CIVS');
  const rnd = mulberry(seed ^ 0x5bd1e995);
  const used = new Set();
  return seats.map(s => {
    const pool = CIVS.map(c => c.k).filter(k => !distinct || !used.has(k));
    const civ = pool[Math.floor(rnd() * pool.length)];
    used.add(civ);
    const abilities = CIVS.find(c => c.k === civ).abilities || [{ k: 'basis' }];
    const ability = abilities[Math.floor(rnd() * abilities.length)].k;
    const p = { civ, ability, kind: s, diff: 'koenig' };
    if (s !== 'bot') p.kiLevel = 'schwer';
    return p;
  });
}
// wie genCustomMap in Hochciv-KI/bridge/worker.js
function customMap(E, seed, n, marathon) {
  const rnd = mulberry(seed ^ 0x2545F491);
  for (let attempt = 0; attempt < 20; attempt++) {
    const H = marathon ? 16 + Math.floor(rnd() * 15) : 8 + Math.floor(rnd() * 13);
    const W = marathon ? 22 + Math.floor(rnd() * 19) : 10 + Math.floor(rnd() * 21);
    let land = Array.from({ length: H }, () => Array.from({ length: W }, () => rnd() < 0.6));
    for (let it = 0; it < 3; it++) {
      land = land.map((row, r) => row.map((v, c) => {
        let k = 0, m = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= H || cc < 0 || cc >= W) continue;
          m++; if (land[rr][cc]) k++;
        }
        return k * 2 > m || (k * 2 === m && v);
      }));
    }
    const LAND = 'GGGGGGGGWWWWBBBFFFIV';
    const off = rnd() < 0.3;
    const rows = land.map(row => row.map(v => v ? LAND[Math.floor(rnd() * LAND.length)] : (off && rnd() < 0.5 ? 'X' : 'M')).join(''));
    const cells = [];
    rows.forEach((row, r) => [...row].forEach((t, c) => { if ('GWBFI'.includes(t)) cells.push([r, c]); }));
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const want = Math.min(8, n + Math.floor(rnd() * 3));
    for (const minD of [6, 5, 4, 3]) {
      const spawns = [];
      for (const p of cells) {
        if (spawns.length >= want) break;
        if (spawns.every(q => E.hexDistance(p[0], p[1], q[0], q[1]) >= minD)) spawns.push(p);
      }
      if (spawns.length >= n) return { name: 'Vergleich ' + seed, rows, spawns, marathon };
    }
  }
  throw new Error('keine eigene Karte für ' + n + ' Reiche');
}
function draftMarathon(E, cfg, seed) {
  const setup = E.rollSetup(Object.assign({}, cfg));
  cfg.avail = setup.avail; cfg.wpool = setup.wpool;
  const V = E.draftView(cfg);
  const D = E.draftNew(V, seed + 1);
  for (let guard = 0; D.at < D.order.length && guard < 64; guard++) {
    const pi = D.order[D.at];
    const err = E.draftPick(D, pi, E.kiDraftPick(V, D, pi));
    if (err) throw new Error('Draft: ' + err);
  }
  V.players.forEach((p, i) => { if (p.kind !== 'bot') cfg.players[p.slot].drafted = D.picks[i].slice(); });
}
function newGameFor(E, g) {
  const seed = g.seed;
  const zweiter = { mix: 'bot', mensch: 'human' }[g.seats] || 'ki';
  const seats = Array.from({ length: g.n }, (_, i) => i % 2 ? zweiter : 'ki');
  const players = makePlayers(E, seats, seed, g.map === 'original');
  const cfg = {
    seed, players, duel: g.n === 2, events: g.events !== 'off', eventMode: g.events === 'easy' ? 'easy' : 'hard',
    wonders: g.wonders, startPlayer: seed % g.n,
  };
  if (g.map === 'marathon' || g.map === 'custom-marathon') {
    if (g.map === 'marathon') cfg.map = E.marathonMap(seed);
    else {
      const r = E.checkCustomMap(customMap(E, seed, g.n, true));
      cfg.map = E.mapForPlayers(r.map, g.n, seed);
    }
    cfg.marathon = true;
    draftMarathon(E, cfg, seed);
  } else if (g.map === 'tile' || g.map === 'hex') {
    const plan = E.tilePlan(players.map(p => p.civ), seed, { hex: g.map === 'hex' });
    const setup = E.rollSetup(Object.assign({}, cfg));
    const rnd = E.mapRng(seed + 12345);
    plan.seats.forEach(seat => {
      const pl = players[seat.idx];
      if (pl.kind === 'bot' || E.kiPlaceSeat(plan, seat, pl, setup)) E.botPlaceSeat(plan, seat, rnd);
    });
    Object.assign(cfg, { map: E.tileMap(plan), avail: setup.avail, wpool: setup.wpool, seatOrder: true });
  } else if (g.map === 'original') {
    cfg.map = JSON.parse(JSON.stringify(E.konst('DEFAULT_MAP')));
  } else {
    const r = E.checkCustomMap(customMap(E, seed, g.n, false));
    if (r.error) throw new Error(r.error);
    cfg.map = E.mapForPlayers(r.map, g.n, seed);
  }
  return E.newGame(cfg);
}

function gameList(seeds, sitze = ['ki', 'mix']) {
  const forms = [];
  for (const n of [2, 3, 4, 6, 8]) forms.push(['tile', n], ['hex', n]);
  for (const n of [2, 3, 4]) forms.push(['original', n]);
  for (const n of [2, 4, 6, 8]) forms.push(['custom', n]);
  forms.push(['marathon', 4], ['custom-marathon', 4]);
  const out = [];
  for (const [map, n] of forms) for (const wonders of [false, true]) for (const events of ['off', 'easy', 'hard'])
    for (const seats of sitze) for (let s = 0; s < seeds; s++) {
      const name = [map, n + 'p', wonders ? 'wunder' : 'ohne', 'ev-' + events, seats, 's' + s].join('/');
      out.push({ name, map, n, wonders, events, seats, seed: seedOf(name), maxRounds: map.includes('marathon') ? 12 : 30 });
    }
  return out;
}

/* Alles, was den Spielstand ausmacht – auch das, was JSON sonst verliert. */
const treu = (k, v) => {
  if (v === undefined) return '\u0000undefined';
  if (typeof v === 'number' && !Number.isFinite(v)) return '\u0000' + v;
  if (v instanceof Set) return { '\u0000set': [...v] };
  if (v instanceof Map) return { '\u0000map': [...v] };
  return v;
};

/* Eine Entscheidung, wie die Brücke sie sieht (features.js evaluate): Kandidaten, kiScore, Kosten
   und Einkommen. Auf Kopien, mit festen Seeds – am echten Spielstand ändert das nichts. */
function probe(E, S, pi, feed) {
  const p = S.players[pi];
  const vorher = JSON.stringify(S, treu);
  const K = E.kiContext(S, pi), memo = {};
  E.kiStepMemo(memo, S, pi);
  const cands = E.kiCandidates(S, pi, K, memo, false);
  feed('tags ' + cands.map(c => c.tag).join(' '));
  let seed = (S.round * 7919 + pi * 104729) | 0;
  const base = E.kiScore(E.kiClone(S, seed), pi, K);
  const scored = [];
  cands.forEach((c, j) => {
    const X = E.kiClone(S, ++seed);
    let err;
    try { err = c.run(X); } catch (e) { err = 'wirft ' + e.message; }
    feed('run ' + j + ' ' + err);
    if (err) return;
    const v = E.kiScore(X, pi, K), dv = v - base;
    const spent = E.kiSpent(p.res, X.players[pi].res, 1);
    const inc = E.income(X, pi);
    feed(`cand ${j} ${v} ${spent} ${inc.sci} ${inc.food} ${inc.coins}`);
    if (dv > 0.05) scored.push({ ev: { dv, v, spent, c }, k: j, c, dv, ratio: dv / (Math.max(0, spent) + 2) });
  });
  if (scored.length) {
    scored.sort((a, b) => b.ratio - a.ratio);
    const m = E.kiMethodeZuerst(S, pi, scored, scored[0]);
    feed('methode ' + (m ? m.k : '-'));
  }
  if (JSON.stringify(S, treu) !== vorher) throw new Error('die Bewertung hat den echten Spielstand verändert');
}

function playGame(E, g, opts) {
  const h = crypto.createHash('sha1');
  const hashes = [];
  let actions = 0, scores = 0, cands = 0, depth = 0, incomes = 0, risks = 0;
  const feed = text => { h.update(text); h.update('\n'); };
  let S = null;
  const pure = {};
  if (opts.hash) {
    for (const name of ACTIONS) {
      const orig = pure[name] = E[name];
      E[name] = function (...args) {
        const top = depth === 0 && args[0] === S;
        depth++;
        let res;
        try { res = orig.apply(this, args); } finally { depth--; }
        if (top) { actions++; feed(name + ' ' + res); feed(JSON.stringify(S)); }
        return res;
      };
    }
    pure.kiScore = E.kiScore;
    E.kiScore = function (X, pi, K) {
      const v = pure.kiScore(X, pi, K);
      scores++; feed('score ' + v);
      return v;
    };
    pure.kiCandidates = E.kiCandidates;
    E.kiCandidates = function (...args) {
      const list = pure.kiCandidates.apply(this, args);
      cands++; feed('kand ' + list.map(c => c.tag).join(' '));
      return list;
    };
  }
  if (opts.checkRisk) {
    const frost = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k in v) frost(v[k]); } return v; };
    pure.kiRisk = E.kiRisk;
    let n = 0;
    E.kiRisk = function (X, pi, K, b) {
      const r = pure.kiRisk(X, pi, K, b);
      if (++n % 40 === 0) {
        risks++;
        const Y = frost(E.kiClone(X, X.seed));
        const r2 = pure.kiRisk(Y, pi, K, b);
        if (r2.cities !== r.cities || r2.pCap !== r.pCap) throw new Error('kiRisk auf der eingefrorenen Kopie anders');
      }
      return r;
    };
  }
  if (opts.checkIncome) {
    pure.income = E.income;
    E.income = function (X, pi) {
      const a = pure.income(X, pi), t = E.incomeBreakdown(X, pi).total;
      incomes++;
      if (a.sci !== t[0] || a.food !== t[1] || a.coins !== t[2])
        throw new Error(`income ≠ incomeBreakdown: ${JSON.stringify(a)} ${t} Runde ${X.round}`);
      return a;
    };
  }
  try {
    S = newGameFor(E, g);
    for (let guard = 0; !S.over && S.round <= g.maxRounds && guard < 2000; guard++) {
      const pi = S.cur, p = S.players[pi];
      if (opts.hash && p.kind !== 'bot') probe(E, S, pi, feed);
      if (opts.hash) for (let i = 0; i < S.players.length; i++) { const y = E.income(S, i); feed(`inc ${y.sci} ${y.food} ${y.coins}`); }
      if (p.kind !== 'bot') E.kiTurn(S, pi); else E.botTurn(S, pi);
      if (!S.over) E.endTurn(S);
      if (opts.hash) {
        feed(JSON.stringify(S, treu));
        hashes.push(h.copy().digest('hex').slice(0, 16));
      }
    }
    return { rounds: S.round, over: S.over ? S.over.how : null, seed: S.seed, actions, scores, cands, incomes, risks, hashes,
      final: opts.hash ? h.digest('hex') : null };
  } catch (e) {
    return { error: e.message, rounds: S && S.round, actions, scores, cands, incomes, hashes };
  } finally {
    for (const k in pure) E[k] = pure[k];
  }
}

async function record(dir, out) {
  const seeds = +arg('seeds', 2), procs = +arg('procs', 6);
  const list = gameList(seeds);
  const extra = [flag('check-income') ? '--check-income' : '', flag('strict') ? '--strict' : '', flag('check-risk') ? '--check-risk' : ''].filter(Boolean);
  if (arg('seats', '')) extra.push('--seats', arg('seats', ''));
  const t0 = Date.now();
  const teile = await Promise.all(Array.from({ length: procs }, (_, i) => new Promise((res, rej) => {
    const file = `${out}.teil${i}`;
    const c = spawn(process.execPath, [__filename, 'shard', dir, file, '--seeds', seeds, '--part', i, '--parts', procs, ...extra], { stdio: 'inherit' });
    c.on('exit', code => code ? rej(new Error('Teil ' + i + ': ' + code)) : res(file));
  })));
  const games = {};
  for (const f of teile) { Object.assign(games, JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
  fs.writeFileSync(out, JSON.stringify(games));
  const r = Object.values(games);
  const sum = k => r.reduce((a, x) => a + (x[k] || 0), 0);
  console.log(`${r.length} Partien, ${sum('actions')} Aktionen, ${sum('scores')} kiScore, ${sum('cands')} Kandidatenlisten, ` +
    `${sum('incomes')} income geprüft, ${sum('risks')} kiRisk eingefroren, ${r.filter(x => x.error).length} mit Fehler, ${Math.round((Date.now() - t0) / 1000)} s`);
}
function shard(dir, out) {
  const seeds = +arg('seeds', 2), part = +arg('part', 0), parts = +arg('parts', 1);
  const E = loadEngine(path.resolve(dir), flag('strict'));
  const games = {};
  gameList(seeds, arg('seats', '') ? arg('seats', '').split(',') : undefined).forEach((g, i) => {
    if (i % parts !== part) return;
    games[g.name] = playGame(E, g, { hash: true, checkIncome: flag('check-income'), checkRisk: flag('check-risk') });
  });
  fs.writeFileSync(out, JSON.stringify(games));
}
function compare(fa, fb) {
  const a = JSON.parse(fs.readFileSync(fa, 'utf8')), b = JSON.parse(fs.readFileSync(fb, 'utf8'));
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  let gleich = 0, turns = 0;
  const anders = [];
  for (const n of names) {
    const x = a[n], y = b[n];
    if (x && y && !x.error && !y.error && x.final === y.final && x.hashes.length === y.hashes.length) { gleich++; turns += x.hashes.length; continue; }
    const i = x && y ? x.hashes.findIndex((h, k) => h !== y.hashes[k]) : -1;
    anders.push(`${n}: Zug ${i}${x && x.error ? ' | a: ' + x.error : ''}${y && y.error ? ' | b: ' + y.error : ''}`);
  }
  console.log(`${gleich} von ${names.size} Partien gleich (${turns} Züge)`);
  anders.slice(0, 20).forEach(s => console.log('  ANDERS ' + s));
  process.exit(anders.length ? 1 : 0);
}
function tempo(dir) {
  // vier Reiche, KI, mit Wundern: wie das Profil in der Aufgabe, dazu Sechsecke und acht Reiche
  const seeds = +arg('seeds', 2), runs = +arg('runs', 3);
  const list = gameList(seeds).filter(g => g.seats === 'ki' && g.wonders && g.events === 'off' && !g.map.includes('marathon')
    && (g.n === 4 || (g.n === 8 && g.map === 'hex')));
  const E = loadEngine(path.resolve(dir), false);
  const times = [];
  for (let r = 0; r < runs; r++) {
    const c0 = process.cpuUsage();
    for (const g of list) { const x = playGame(E, g, { hash: false }); if (x.error) throw new Error(g.name + ': ' + x.error); }
    const c = process.cpuUsage(c0);
    times.push((c.user + c.system) / 1e6);
  }
  console.log(`${list.length} Partien, CPU s: ${times.map(t => t.toFixed(1)).join(' ')}`);
}

const [, , cmd, a1, a2] = process.argv;
if (cmd === 'record') record(a1, a2);
else if (cmd === 'shard') shard(a1, a2);
else if (cmd === 'compare') compare(a1, a2);
else if (cmd === 'tempo') tempo(a1);
else console.log('record | compare | tempo, siehe Kopf der Datei');
