/* Messreihen mit der KI (nur für die Entwicklung, gehört nicht zur App).

   Die KI (js/ki.js) wird in vollen Partien gegen Bots oder gegen sich selbst gespielt –
   Plättchenkarte samt Legephase, wie im Spiel. Ausgegeben werden Siege, Siegarten, der
   Median der Endrunde, wie oft der Startspieler gewinnt und die Rechenzeit je KI-Zug.
   Jede Zahl in ANNAHMEN.md zur KI lässt sich hiermit nachrechnen.

   node tools_ki.js duell   [n] [diff=prinz] [stufe=schwer] [events] [wonders]
        1 gegen 1, KI gegen Bot, abwechselnd beginnend
   node tools_ki.js vier    [n] [diff=prinz] [stufe=schwer] [events] [wonders]
        eine KI gegen drei Bots, der Platz der KI wandert
   node tools_ki.js stufen  [n] [a=schwer] [b=leicht] [reiche=2] [events] [wonders]
        gepaart: jeder Startwert zweimal, die Stufen tauschen die Plätze – so hebt sich der
        Vorteil des Startspielers heraus; dazu die Siege getrennt nach Startspieler
   node tools_ki.js selbst  [n] [reiche=2] [stufe=schwer] [events] [wonders]
        KI gegen KI, dazu: in welcher Runde und wie die Partien enden
   node tools_ki.js methode [n] [reiche=2] [stufe=schwer] [events] [wonders]
        v96: die Wissenschaftliche Methode zuerst gegen die Reihenfolge bis v95, gepaart wie
        „stufen" (jeder Startwert zweimal, die Fassungen tauschen die Plätze; zu viert zwei
        gegen zwei, abwechselnd) – dazu, wie viel Wissenschaft jede Fassung in die Forschung
        steckt und wie viele Technologien sie bis Runde 4 hat
   node tools_ki.js vorstoss [n] [reiche=4] [runde=4] [armeen=3] [macht=4] [art=allin] [stufe=schwer]
        Abwehr: alle spielen als KI bis zur Runde, dann wird ein Platz zum Menschen – seine
        Armeen stehen einen Zug vor der nächsten KI-Hauptstadt, mit dieser Macht. Die KI
        ist am Zug und sieht sie. Der Mensch zieht heran und kauft Macht (art=allin: alles,
        art=knapp: gerade genug), zweimal. Gezählt: erster Treffer, gefallene Hauptstädte,
        was die KI vor und nach dem ersten Treffer je Zug in Macht und Armeen steckt (v79).
        art=droh: er bleibt drei Züge lang einen Zug vor der Stadt stehen, hält seine Macht
        und greift nie an – was kostet die bloße Drohung?

   node tools_ki.js freie [n] [arten=v100,eine,moderne,aufheben,ki] [stufe=schwer] [sechsecke]
        v101: Griechenlands Freie Forschung (zweimal je Partie, höchstens einmal je Runde).
        Vier KI, eine davon Griechenland mit Freier Forschung, ihr Platz wandert; jede Partie
        einmal je Art, mit denselben Startwerten (gepaart gegen die letzte Art). Wie Griechenland
        wählt: v100 – Regel von v100 (einmal je Runde, ohne Grenze je Partie), die KI erwägt
        jede Runde alles, kiValue entscheidet; alles – Regel von v101, die KI wie in v100;
        eine – die erste wie „alles", die letzte nur für die Singularität; moderne – nur Moderne
        und Singularität (wie v97); aufheben – dazu die letzte nur für die Singularität; ki –
        kiFreeTechChoices, wie die KI im Spiel wählt (seit v101 dasselbe wie „alles"). Bei eine,
        moderne und aufheben gegen Ende alles (nicht mehr Runden übrig als Freie Forschungen
        offen). Dazu: Nutzungen je Partie, ihre Zeitalter, ihre Runde. Die Zahlen in ANNAHMEN.md
        (v101) stammen aus `freie 400 arten=v100,alles,eine` und `freie 400 arten=moderne,aufheben,eine`
   node tools_ki.js wirtschaft [n] [stufe=schwer] [sechsecke]
        v101: Siegschwellen zu viert 4/7 · 1/2 · 2/5 statt 2/3 · 3/5 · 1/2. Vier KI, jede
        Partie zweimal mit denselben Startwerten (gepaart), einmal mit den Schwellen von v100 –
        Siegarten, Endrunde, Startspieler, Wirtschaftssiege

   n ist die Zahl der Partien (bei „stufen" die Zahl der Paare). Die Partien sind aus ihren
   Startwerten reproduzierbar: gleiche Befehlszeile, gleiche Zahlen.
   alterbaum (v82): die Partien laufen im alten Techtree (bis v81 Standard, heute nur noch
   im Tutorial) – zum Vergleich mit Messungen von vor v82.
   sechsecke (v99): bei vier Reichen der experimentelle Plättchenmodus (zehn Sechsecke statt
   der Dreiecke), etwa `node tools_ki.js selbst 100 reiche=4 sechsecke`.
   reihenfolge, kampflaenge (v90): Messhaken zur Kampfphase, siehe unten.          */
const fs = require('fs'), vm = require('vm');
for (const f of ['js/data.js', 'js/civs.js', 'js/i18n.js', 'js/hex.js', 'js/tiles.js', 'js/engine.js',
  'js/expansion.js', 'js/bots.js', 'js/ki.js', 'js/marathon.js'])
  vm.runInThisContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), { filename: f });

const jetzt = () => Number(process.hrtime.bigint()) / 1e6;
const args = process.argv.slice(2);
const modus = args[0] || 'duell';
const N = +(args[1] || 20);
const opt = (k, d) => { const x = args.find(a => a.startsWith(k + '=')); return x ? x.split('=')[1] : d; };
const flag = k => args.includes(k);

/* Messhaken (v90), nur mit Schalter – am Spiel ändern sie nichts:
   reihenfolge  jede echte Kampfphase (nicht die Wegwerfkopien der KI) läuft zusätzlich auf einer
                Kopie in der anderen Reihenfolge – erst die Flanken, dann die Städte, wie in v90
                (die Regel ist seit v91 wieder: erst die Städte); verglichen werden Armeen,
                Städte, Belagerungen und Spielende, je Größe aus Sicht des Angreifers (eigene
                Städte, Belagerungszähler, zerstörte gegnerische Armeen): „besser" heißt, die
                Flanken zuerst hätten dem Angreifer mehr gebracht
   kampflaenge  Kämpfe je Kampfphase – so viele Sekunden dauert das Nachspiel
   Die Zahlen in ANNAHMEN.md stammen von hier – die von v90 aus Partien, die selbst mit den
   Flanken zuerst liefen (damals verglich der Haken mit „erst die Städte"). */
if (flag('reihenfolge') || flag('kampflaenge')) {
  const echt = combatPhase;
  // Macht wie in der Regel (seit v94) einmal für die ganze Phase – verglichen wird nur die Reihenfolge
  const anderePhase = (S, pi) => {
    const macht = S.players.map((_, i) => powerOf(S, i));
    const spots = flankSpotsOf(S, pi);
    for (const enemy of S.armies.slice())
      if (enemy.owner !== pi && canFlank(S, pi, enemy, spots) && macht[pi] > macht[enemy.owner])
        S.armies = S.armies.filter(a => a !== enemy);
    for (const city of S.cities.slice()) {
      if (city.owner === pi) continue;
      const sk = pi + '|' + city.id, atk = attackersOn(S, pi, city);
      if (!atk.length) { delete S.sieges[sk]; continue; }
      if (attackValue(S, pi, atk.length, macht[pi]) > defenseValue(S, city, macht[city.owner])) {
        S.sieges[sk] = (S.sieges[sk] || 0) + 1;
        if (S.sieges[sk] >= 2) captureCity(S, pi, city);
      } else S.sieges[sk] = 0;
    }
  };
  const sig = X => JSON.stringify([X.armies.map(a => a.id).sort((x, y) => x - y),
    X.cities.map(c => [c.id, c.owner, c.pop]).sort((x, y) => x[0] - y[0]),
    Object.entries(X.sieges).filter(([, v]) => v).sort(), !!X.over]);
  const st = { mitKampf: 0, beide: 0, anders: 0, besser: 0, schlechter: 0, gemischt: 0, ende: 0 }, laengen = [];
  combatPhase = function (S, pi, rec) {
    if (S.kiSim) return echt(S, pi, rec);
    const K = flag('reihenfolge') ? kiClone(S, S.seed) : null;
    if (K) { delete K.kiSim; anderePhase(K, pi); }
    const r = rec || [];
    echt(S, pi, r);
    if (r.length) { st.mitKampf++; laengen.push(r.length); }
    if (r.some(e => e.art === 'flanke') && r.some(e => e.art === 'stadt')) st.beide++;
    if (!K || sig(K) === sig(S)) return;
    st.anders++;
    const staedte = X => X.cities.filter(c => c.owner === pi).length;
    const belag = X => Object.entries(X.sieges).filter(([k]) => k.startsWith(pi + '|')).reduce((n, [, v]) => n + (v || 0), 0);
    const feinde = X => X.armies.filter(a => a.owner !== pi).length;
    const d = [staedte(K) - staedte(S), belag(K) - belag(S), feinde(S) - feinde(K)];   // Flanken zuerst minus Regel
    if (!!S.over !== !!K.over) st.ende++;
    if (d.every(x => x >= 0) && d.some(x => x > 0)) st.besser++;
    else if (d.every(x => x <= 0) && d.some(x => x < 0)) st.schlechter++;
    else st.gemischt++;
  };
  process.on('exit', () => {
    if (flag('reihenfolge')) console.log(`   Reihenfolge: Kampfphasen mit Kampf ${st.mitKampf}, Flanke und Stadt im selben Zug ${st.beide}, ` +
      `mit den Flanken zuerst anders ${st.anders}: für den Angreifer besser ${st.besser}, schlechter ${st.schlechter}, ` +
      `gemischt ${st.gemischt}; Spielende nur in einer Reihenfolge ${st.ende}`);
    if (flag('kampflaenge') && laengen.length) {
      laengen.sort((a, b) => a - b);
      const q = f => laengen[Math.min(laengen.length - 1, Math.floor(f * laengen.length))];
      console.log(`   Kämpfe je Kampfphase (${laengen.length} mit Kampf): Median ${q(0.5)}, 90 % ${q(0.9)}, ` +
        `höchstens ${laengen[laengen.length - 1]} · mehr als 5: ${laengen.filter(x => x > 5).length}, mehr als 10: ${laengen.filter(x => x > 10).length}`);
    }
  });
}
const CIVK = CIVS.map(c => c.k);

/* Aufbau wie im Spiel: Plättchenplan, Vorabwurf, jeder Platz legt (KI selbst, Bots
   zufällig), dann newGame mit Karte, Verfügbarkeiten und Wunderstapel. */
// `vorbereiten(S)`: Messhaken (v96), läuft gleich nach newGame – etwa um Plätze zu markieren
function partie(players, seed, start, vorbereiten) {
  const cfg = {
    seed, players, duel: players.length === 2, events: flag('events'), eventMode: 'hard',
    wonders: flag('wonders'), startPlayer: start, oldTree: flag('alterbaum'),
  };
  const plan = tilePlan(players.map(p => p.civ), seed, { hex: flag('sechsecke') });
  const setup = rollSetup(Object.assign({}, cfg));
  const rnd = mapRng(seed + 12345);
  plan.seats.forEach(seat => {
    const pl = players[seat.idx];
    if (pl.kind === 'ki') { if (kiPlaceSeat(plan, seat, pl, setup)) botPlaceSeat(plan, seat, rnd); }
    else botPlaceSeat(plan, seat, rnd);
  });
  Object.assign(cfg, { map: tileMap(plan), avail: setup.avail, wpool: setup.wpool });
  const S = newGame(cfg);
  if (vorbereiten) vorbereiten(S);
  const zeiten = [], fehler = [];
  let guard = 0;
  while (!S.over && guard++ < 400) {
    const pi = S.cur, p = S.players[pi];
    try {
      if (p.kind === 'ki') { const t0 = jetzt(); kiTurn(S, pi); zeiten.push(jetzt() - t0); }
      else botTurn(S, pi);
    } catch (e) { fehler.push(`Runde ${S.round}, ${p.civ}: ${e.message}`); break; }
    if (S.over) break;
    endTurn(S);
  }
  return { S, zeiten, fehler };
}
const art = S => S.over ? S.over.how.split(' (')[0].split(' ·')[0] : 'offen';
function bericht(titel, laeufe, wer) {
  const siege = {}, arten = {}, runden = [], zeiten = [];
  let start = 0, entschieden = 0, fehler = 0;
  for (const { S, zeiten: z, fehler: f } of laeufe) {
    zeiten.push(...z);
    if (f.length) { fehler++; console.log('   Fehler: ' + f[0]); }
    runden.push(S.over ? S.round : 999);
    arten[art(S)] = (arten[art(S)] || 0) + 1;
    if (!S.over) continue;
    entschieden++;
    const ws = S.over.winners || [S.over.winner];
    if (ws.includes(S.startIdx)) start++;
    for (const w of ws) { const k = wer(S, w); siege[k] = (siege[k] || 0) + 1 / ws.length; }
  }
  runden.sort((a, b) => a - b); zeiten.sort((a, b) => a - b);
  const q = f => zeiten.length ? zeiten[Math.min(zeiten.length - 1, Math.floor(f * zeiten.length))].toFixed(0) : '–';
  console.log(`${titel}: ${laeufe.length} Partien · Siege ${Object.entries(siege).map(([k, v]) => `${k} ${+v.toFixed(1)}`).join(', ')}` +
    ` · Startspieler gewinnt ${start}/${entschieden} · Endrunde Median ${runden[runden.length >> 1]}` +
    ` · ${Object.entries(arten).map(([k, v]) => `${k} ${v}`).join(', ')}` +
    ` · KI-Zug ms Median ${q(0.5)}, 90 % ${q(0.9)}, max ${q(1)}` + (fehler ? ` · ${fehler} mit Fehler` : ''));
}
const kiSitz = (c, stufe, g, i) => ({ civ: c, kind: 'ki', kiLevel: stufe, ability: CIV_BY_KEY[c].abilities[(g + i) % 3].k });
const wer = (S, i) => S.players[i].kind === 'ki' ? 'KI' : 'Bot';

if (modus === 'duell') {
  const diff = opt('diff', 'prinz'), stufe = opt('stufe', 'schwer'), l = [];
  for (let g = 0; g < N; g++) {
    const a = CIVK[g % 4], b = CIVK[(g + 1 + (g >> 2)) % 4];
    const ki = kiSitz(a, stufe, g, 0), bot = { civ: b, kind: 'bot', diff };
    const players = g % 2 ? [ki, bot] : [bot, ki];
    l.push(partie(players, 3000 + g, (g >> 1) % 2));
  }
  bericht(`Duell KI (${stufe}) gegen Bot (${diff})`, l, wer);
} else if (modus === 'vier') {
  const diff = opt('diff', 'prinz'), stufe = opt('stufe', 'schwer'), l = [];
  for (let g = 0; g < N; g++) {
    const players = CIVK.map((c, i) => i === g % 4 ? kiSitz(c, stufe, g, i) : { civ: c, kind: 'bot', diff });
    l.push(partie(players, 1000 + g, (g >> 2) % 4));
  }
  bericht(`1 KI (${stufe}) gegen 3 Bots (${diff})`, l, wer);
} else if (modus === 'stufen') {
  const A = opt('a', 'schwer'), B = opt('b', 'leicht'), n = +opt('reiche', 2), l = [];
  for (let g = 0; g < N; g++) for (const tausch of [false, true]) {
    const players = [];
    for (let i = 0; i < n; i++) players.push(kiSitz(CIVK[(g + i) % 4], ((i % 2 === 0) !== tausch) ? A : B, g, i));
    l.push(partie(players, 11000 + g, g % n));
  }
  bericht(`Stufen ${A} gegen ${B}, ${n} Reiche, gepaart`, l, (S, i) => S.players[i].kiLevel);
  // aufgeteilt nach der Stufe des Startspielers: im Duell wiegt der Anzug schwer
  const t = {};
  for (const { S } of l) {
    if (!S.over) continue;
    const st = S.players[S.startIdx].kiLevel, ws = S.over.winners || [S.over.winner];
    const x = t[st] || (t[st] = { n: 0, w: 0 });
    x.n++;
    if (ws.some(w => S.players[w].kiLevel === st)) x.w++;
  }
  console.log('   ' + Object.entries(t).map(([k, v]) => `beginnt ${k}, gewinnt ${k} ${v.w}/${v.n}`).join(' · '));
} else if (modus === 'vorstoss') {
  const NP = +opt('reiche', 4), R = +opt('runde', 4), NA = +opt('armeen', 3), P0 = +opt('macht', 4);
  const ART = opt('art', 'allin'), stufe = opt('stufe', 'schwer');
  // Der Mensch: zieht in Angriffsreichweite (möglichst wenig offene Seiten), kauft Macht, wächst
  const offen = (S, pi, r, c) => neighbors(r, c).filter(([nr, nc]) => isLand(S, nr, nc) && !cityAt(S, nr, nc) &&
    !(armyAt(S, nr, nc) && armyAt(S, nr, nc).owner === pi)).length;
  const mensch = (S, B, ziel) => {
    feedSources(S, B).forEach(x => coverPop(S, B, x.kind, x.have));
    const rng = attackRange(S, B), droh = ART === 'droh';
    const passt = d => droh ? d === rng + 1 : d <= rng;
    for (const a of armiesOf(S, B)) {
      if (passt(hexDistance(a.r, a.c, ziel.r, ziel.c))) continue;
      const f = [...armyReach(S, a).keys()].map(unkey).filter(([r, c]) => !cityAt(S, r, c) && passt(hexDistance(r, c, ziel.r, ziel.c)));
      if (!f.length) continue;
      f.sort((x, y) => offen(S, B, x[0], x[1]) - offen(S, B, y[0], y[1]));
      moveArmy(S, a, f[0][0], f[0][1]);
    }
    const n = attackersOn(S, B, ziel).length;
    if (droh) {
      const fehlt = P0 - S.players[B].power;
      if (fehlt > 0) buyPower(S, B, Math.min(fehlt, Math.floor(available(S, B, 'coins', payOpts(S, B)) / powerPrice(S, B))));
    } else if (n && ART === 'allin') buyPower(S, B, Math.floor(available(S, B, 'coins', payOpts(S, B)) / powerPrice(S, B)));
    else if (n) { let k = 0; while (attackValue(S, B, n) <= defenseValue(S, ziel) && k++ < 100) if (buyPower(S, B, 1)) break; }
    citiesOf(S, B).forEach(c => growCity(S, B, c));
  };
  // Was die KI in Macht und Armeen steckt (nur auf dem echten Spielstand des Verteidigers)
  let wache = null, militaer = 0;
  for (const fn of ['buyPower', 'buildArmy']) {
    const orig = globalThis[fn];
    globalThis[fn] = function (X, pi) {
      if (!wache || X !== wache.S || pi !== wache.pi) return orig.apply(this, arguments);
      const r0 = Object.assign({}, X.players[pi].res), out = orig.apply(this, arguments), r1 = X.players[pi].res;
      militaer += (r0.coins - r1.coins) + (r0.sci - r1.sci) + (r0.food - r1.food);
      return out;
    };
  }
  const vor = { z: 0, m: 0 }, nach = { z: 0, m: 0 };
  let stellungen = 0, treffer = 0, fallen = 0, techs = 0;
  for (let g = 0; g < N; g++) {
    const players = [];
    for (let i = 0; i < NP; i++) players.push(kiSitz(CIVK[(g + i) % 4], stufe, g, i));
    const seed = 700 + g;
    const cfg = { seed, players, duel: NP === 2, startPlayer: g % NP, oldTree: flag('alterbaum') };
    const plan = tilePlan(players.map(p => p.civ), seed);
    const setup = rollSetup(Object.assign({}, cfg));
    plan.seats.forEach(seat => kiPlaceSeat(plan, seat, players[seat.idx], setup));
    Object.assign(cfg, { map: tileMap(plan), avail: setup.avail, wpool: setup.wpool });
    const S = newGame(cfg);
    const B = g % NP, capB = () => capitalOf(S, B);
    let A = -1, guard = 0;
    while (!S.over && guard++ < 200) {          // bis Runde R; dann ist die nächste KI am Zug
      if (S.round >= R && S.cur !== B && !S.players[B].dead && capB()) {
        const kand = S.players.map((q, i) => i).filter(i => i !== B && !S.players[i].dead && capitalOf(S, i));
        const d = i => hexDistance(capitalOf(S, i).r, capitalOf(S, i).c, capB().r, capB().c);
        if (kand.length && kand.reduce((x, y) => d(x) <= d(y) ? x : y) === S.cur) { A = S.cur; break; }
      }
      kiTurn(S, S.cur); if (S.over) break; endTurn(S);
    }
    if (S.over || A < 0) continue;
    S.players[B].kind = 'human';
    const ziel = capitalOf(S, A);
    S.armies = S.armies.filter(x => x.owner !== B);
    for (const k of Object.keys(S.sieges)) if (k.startsWith(B + '|')) delete S.sieges[k];
    const ring = [];
    for (const [r, c] of within(ziel.r, ziel.c, 3)) {
      if (hexDistance(r, c, ziel.r, ziel.c) < 2 || !isLand(S, r, c) || cityAt(S, r, c) || armyAt(S, r, c) || TERRAIN[terrainAt(S, r, c)].block) continue;
      ring.push([r, c, hexDistance(r, c, capB().r, capB().c)]);
    }
    ring.sort((x, y) => x[2] - y[2]);
    if (ring.length < NA) continue;
    ring.slice(0, NA).forEach(([r, c]) => S.armies.push({ id: S.nextId++, owner: B, r, c, mp: moveAllowance(S, B), born: S.round - 1 }));
    S.players[B].power = P0;
    stellungen++;
    let zuege = 0, hit = false;
    const t0 = Object.keys(S.players[A].techs).length;
    guard = 0;
    while (!S.over && guard++ < 30 && zuege < (ART === 'droh' ? 3 : 2)) {
      const pi = S.cur;
      if (pi === B) { mensch(S, B, ziel); zuege++; }
      else if (pi === A) {
        const belagert = (S.sieges[B + '|' + ziel.id] || 0) >= 1;
        militaer = 0; wache = { S, pi };
        kiTurn(S, pi);
        wache = null;
        const x = belagert ? nach : hit ? null : vor;
        if (x) { x.z++; x.m += militaer; }
      } else kiTurn(S, pi);
      endTurn(S);
      if (pi === B && (S.sieges[B + '|' + ziel.id] || 0) >= 1) hit = true;
      if (ziel.owner !== A) break;
    }
    techs += Object.keys(S.players[A].techs).length - t0;
    if (hit) treffer++;
    if (ziel.owner === B) fallen++;
  }
  const je = x => x.z ? (x.m / x.z).toFixed(1) : '–';
  console.log(`Vorstoß ${NP} Reiche ab Runde ${R}, ${NA} Armeen mit Macht ${P0} (${ART}), KI ${stufe}: ${stellungen} Stellungen · erster Treffer ${treffer} · Hauptstadt fällt ${fallen}`);
  console.log(`   Macht und Armeen je Zug der KI: vor dem ersten Treffer ${je(vor)} Münzen (${vor.z} Züge), danach ${je(nach)} (${nach.z} Züge) · Technologien der KI +${(techs / Math.max(1, stellungen)).toFixed(1)} je Stellung`);
} else if (modus === 'selbst') {
  const n = +opt('reiche', 2), stufe = opt('stufe', 'schwer'), l = [];
  for (let g = 0; g < N; g++) {
    const players = [];
    for (let i = 0; i < n; i++) players.push(kiSitz(CIVK[(g + i) % 4], stufe, g * 7, i));
    l.push(partie(players, 9000 + g * 13, g % n));
  }
  const nachRunde = {};
  l.forEach(({ S }) => { const k = `${art(S)} in Runde ${S.round}`; nachRunde[k] = (nachRunde[k] || 0) + 1; });
  bericht(`KI gegen KI (${stufe}), ${n} Reiche`, l, (S, i) => 'Platz ' + S.players[i].slot);
  console.log('   ' + Object.entries(nachRunde).sort((a, b) => +a[0].split('Runde ')[1] - +b[0].split('Runde ')[1])
    .map(([k, v]) => `${k}: ${v}`).join(' · '));
} else if (modus === 'methode') {
  /* v96 (Anweisung des Autors): die KI erforscht die Wissenschaftliche Methode vor den übrigen
     Technologien eines Zugs (kiMethodeZuerst, dazu neu planen, sobald eine Forschung sie verfügbar
     macht – kiMethodeOffen). Die Fassung bis v95 bekommt beide Haken abgeschaltet: dann plant
     kiPlan Zeichen für Zeichen wie bis v95 (einmal nachgeprüft: zwölf Partien mit allen Stufen,
     dieselben Protokolle wie der Planer von v95; test.js prüft die Gegenprobe in zwei Lagen).
     Markiert wird je Platz. */
  const n = +opt('reiche', 2), stufe = opt('stufe', 'schwer'), l = [];
  const zuerst = kiMethodeZuerst, offen = kiMethodeOffen;
  kiMethodeZuerst = function (S, pi) { return S.players[pi].methodeAlt ? null : zuerst.apply(this, arguments); };
  kiMethodeOffen = function (S, pi) { return S.players[pi].methodeAlt ? false : offen.apply(this, arguments); };
  // Wissenschaft in der Forschung je Fassung (nur auf dem echten Spielstand) und Technologien nach Runde 4
  const forschung = { alt: 0, neu: 0 }, techs4 = { alt: [], neu: [] };
  const dr = doResearch;
  doResearch = function (X, pi) {
    const b = X.players[pi].res.sci, r = dr.apply(this, arguments);
    if (!X.kiSim && !r) forschung[X.players[pi].methodeAlt ? 'alt' : 'neu'] += b - X.players[pi].res.sci;
    return r;
  };
  const et = endTurn;
  endTurn = function (X) {
    const r0 = X.round, out = et.apply(this, arguments);
    if (r0 === 4 && X.round === 5) X.players.forEach(p => techs4[p.methodeAlt ? 'alt' : 'neu'].push(Object.keys(p.techs).filter(k => p.techs[k]).length));
    return out;
  };
  for (let g = 0; g < N; g++) for (const tausch of [false, true]) {
    const players = [];
    for (let i = 0; i < n; i++) players.push(kiSitz(CIVK[(g + i) % 4], stufe, g, i));
    l.push(partie(players, 13000 + g, g % n, S => S.players.forEach(p => { p.methodeAlt = (p.slot % 2 === 0) === tausch; })));
  }
  bericht(`Methode zuerst (v96) gegen die Reihenfolge bis v95, ${n} Reiche, KI ${stufe}, gepaart`, l,
    (S, i) => S.players[i].methodeAlt ? 'bis v95' : 'v96');
  const t = {};
  for (const { S } of l) {
    if (!S.over) continue;
    const st = S.players[S.startIdx].methodeAlt ? 'bis v95' : 'v96', ws = S.over.winners || [S.over.winner];
    const x = t[st] || (t[st] = { n: 0, w: 0 });
    x.n++;
    if (ws.some(w => (S.players[w].methodeAlt ? 'bis v95' : 'v96') === st)) x.w++;
  }
  const mittel = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  // Standardfehler des Unterschieds der Mittel (Reiche als unabhängig gezählt – grob)
  const se = (a, b) => {
    const v = x => { const m = mittel(x); return x.reduce((s, y) => s + (y - m) ** 2, 0) / Math.max(1, x.length - 1); };
    return Math.sqrt(v(a) / a.length + v(b) / b.length);
  };
  const siegeNeu = l.filter(({ S }) => S.over && (S.over.winners || [S.over.winner]).some(w => !S.players[w].methodeAlt)).length;
  const z = (siegeNeu - l.length / 2) / Math.sqrt(l.length / 4);
  console.log('   ' + Object.entries(t).map(([k, v]) => `beginnt ${k}, gewinnt ${k} ${v.w}/${v.n}`).join(' · ') +
    ` · Siege v96 ${(100 * siegeNeu / l.length).toFixed(1)} % (z = ${z.toFixed(2)})` +
    ` · Wissenschaft in Forschung: v96 ${forschung.neu}, bis v95 ${forschung.alt}` +
    ` · Technologien nach Runde 4: v96 ${mittel(techs4.neu).toFixed(2)}, bis v95 ${mittel(techs4.alt).toFixed(2)}` +
    ` (Unterschied ${(mittel(techs4.neu) - mittel(techs4.alt)).toFixed(2)} ± ${se(techs4.neu, techs4.alt).toFixed(2)})`);
} else if (modus === 'freie') {
  /* v101 (Anweisung des Autors): Freie Forschung zweimal je Partie, höchstens einmal je Runde. Die
     Arten unterscheiden sich nur am griechischen Platz (p.freieArt, von den Kopien der KI
     mitkopiert); die übrigen Plätze spielen in allen Arten gleich. */
  const stufe = opt('stufe', 'schwer');
  const ARTEN = opt('arten', 'v100,eine,moderne,aufheben,ki').split(',');
  const links = freeTechsLeft, waehlt = kiFreeTechChoices, nutzt = useFreeTech;
  freeTechsLeft = function (p) { return p.freieArt === 'v100' ? Infinity : links.apply(this, arguments); };
  kiFreeTechChoices = function (S, pi, K) {
    const a = S.players[pi].freieArt;
    if (a === 'ki' || !a) return waehlt.apply(this, arguments);
    const opts = freeTechOptions(S, pi), rest = freeTechsLeft(S.players[pi]);
    if (a === 'v100' || a === 'alles' || !opts.length || K.R <= rest) return opts;
    const sing = opts.filter(t => t.k === 'singularitaet'), teuer = opts.filter(t => t.k === 'singularitaet' || t.age >= 3);
    if (a === 'eine') return rest <= 1 ? sing : opts;
    if (a === 'moderne') return teuer;
    if (a === 'aufheben') return rest <= 1 ? sing : teuer;
    throw new Error('unbekannte Art: ' + a);
  };
  // Nutzungen auf dem echten Spielstand (nicht auf den Wegwerfkopien der KI)
  let nutz = [];
  useFreeTech = function (X, pi, tk) {
    const r = nutzt.apply(this, arguments);
    if (!r && !X.kiSim) nutz.push({ age: tk === 'singularitaet' ? 4 : TECH_BY_KEY[tk].age, round: X.round });
    return r;
  };
  const andere = CIVK.filter(c => c !== 'griechenland');
  const siege = {};                          // je Art: je Partie der Siegesanteil Griechenlands
  for (const wahl of ARTEN) {
    const l = [], st = { n: 0, ages: [0, 0, 0, 0, 0], runden: [], arten: {} };
    siege[wahl] = [];
    for (let g = 0; g < N; g++) {
      const gs = g % 4, players = [];
      for (let i = 0; i < 4; i++) players.push(i === gs
        ? { civ: 'griechenland', kind: 'ki', kiLevel: stufe, ability: 'gratistech' }
        : kiSitz(andere[(g + i) % 3], stufe, g, i));
      nutz = [];
      const lauf = partie(players, 15000 + g, (g >> 2) % 4,
        S => S.players.forEach(p => { if (p.civ === 'griechenland') p.freieArt = wahl; }));
      l.push(lauf);
      st.n += nutz.length;
      nutz.forEach(u => { st.ages[u.age]++; st.runden.push(u.round); });
      const S = lauf.S, gi = S.players.findIndex(p => p.civ === 'griechenland');
      const ws = S.over ? (S.over.winners || [S.over.winner]) : [];
      siege[wahl].push(ws.includes(gi) ? 1 / ws.length : 0);
      if (ws.includes(gi)) st.arten[art(S)] = (st.arten[art(S)] || 0) + 1;
    }
    bericht(`Freie Forschung „${wahl}", vier KI (${stufe}), Griechenland wandert`, l,
      (S, i) => S.players[i].civ === 'griechenland' ? 'Griechenland' : 'andere');
    st.runden.sort((a, b) => a - b);
    const summe = siege[wahl].reduce((a, b) => a + b, 0);
    console.log(`   Griechenland gewinnt ${(100 * summe / N).toFixed(1)} % (${+summe.toFixed(1)} von ${N}; ` +
      `${Object.entries(st.arten).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}) · Freie Forschungen je Partie ` +
      `${(st.n / N).toFixed(2)} · Zeitalter Antike/Mittelalter/Industrialisierung/Moderne/Singularität ${st.ages.join('/')}` +
      (st.runden.length ? ` · Runde Median ${st.runden[st.runden.length >> 1]}` : ''));
  }
  // gepaart gegen die letzte Art (dieselben Startwerte): Unterschied der Siegquote, grob ± 1,96 SE
  const ref = ARTEN[ARTEN.length - 1];
  for (const wahl of ARTEN.slice(0, -1)) {
    const d = siege[wahl].map((x, g) => x - siege[ref][g]);
    const m = d.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, N - 1));
    console.log(`   ${wahl} gegen ${ref}: ${m >= 0 ? '+' : ''}${(100 * m).toFixed(1)} Punkte (± ${(196 * sd / Math.sqrt(N)).toFixed(1)})`);
  }
} else if (modus === 'wirtschaft') {
  /* v101 (Anweisung des Autors): zu viert gewinnt wirtschaftlich, wer mehr als 4/7 der
     Weltbevölkerung hat (Theologie 1/2, Vereinte Nationen 2/5); bis v100 galten zu viert die
     Schwellen, die heute nur noch zu dritt gelten (2/3 · 3/5 · 1/2). */
  const stufe = opt('stufe', 'schwer'), neu = VICTORY_THRESHOLDS.vier, laeufe = {};
  for (const fassung of ['v100', 'v101']) {
    VICTORY_THRESHOLDS.vier = fassung === 'v100' ? VICTORY_THRESHOLDS.drei : neu;
    const l = laeufe[fassung] = [];
    for (let g = 0; g < N; g++) {
      const players = [];
      for (let i = 0; i < 4; i++) players.push(kiSitz(CIVK[(g + i) % 4], stufe, g * 7, i));
      l.push(partie(players, 17000 + g * 13, g % 4));
    }
    bericht(`Siegschwellen ${fassung} (zu viert ${VICTORY_THRESHOLDS.vier.base.join('/')}), KI gegen KI (${stufe})`, l,
      (S, i) => 'Platz ' + S.players[i].slot);
    const w = l.filter(({ S }) => art(S) === 'Wirtschaftssieg').map(({ S }) => S.round).sort((a, b) => a - b);
    console.log(`   Wirtschaftssiege ${w.length}` + (w.length ? ` in Runde ${w.join(', ')}` : ''));
  }
  VICTORY_THRESHOLDS.vier = neu;
  // gepaart: wie viele Partien anders ausgehen, und wie
  const wechsel = {};
  laeufe.v100.forEach(({ S: A }, g) => {
    const B = laeufe.v101[g].S, k = `${art(A)} → ${art(B)}`;
    if (art(A) !== art(B) || A.round !== B.round) wechsel[k] = (wechsel[k] || 0) + 1;
  });
  console.log('   anders ausgegangen (Siegart oder Runde, v100 → v101): ' +
    (Object.entries(wechsel).map(([k, v]) => `${k} ${v}`).join(' · ') || 'keine'));
} else {
  console.log('Unbekannter Modus. Siehe Kopf der Datei.');
  process.exit(1);
}
