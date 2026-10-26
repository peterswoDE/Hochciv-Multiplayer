/* Hochzeivilization – Erweiterungen: Ereignisse, Weltwunder, Barbaren.
   Beide Erweiterungen werden im Aufbau einzeln zugeschaltet (S.ev / S.wo).
   Ist eine aus, verhalten sich alle Funktionen hier neutral. */

const evOn = S => !!(S && S.ev);
const woOn = S => !!(S && S.wo);

/* ================================================================ Ereignisse */
/* Ein Ereignis pro Runde für alle menschlichen Reiche gleichzeitig; Bots sind nie
   betroffen. Erster Würfel = Zeile, zweiter = Spalte. Hart: 1/2 → 1, 3/4 → 2, 5/6 → 3.
   Leicht: nur 1/3/5 treffen ihre Spalte, 2/4/6 gehen ins Leere. */
function eventColumn(S, mode, roll) {
  if (mode === 'easy') return roll % 2 === 1 ? (roll + 1) / 2 : 0;   // 1→1, 3→2, 5→3
  return Math.ceil(roll / 2);                                        // 1/2→1, 3/4→2, 5/6→3
}
function rollEvent(S) {
  if (!evOn(S)) return null;
  const row = d6(S, 'Ereignis: Zeile');
  const col = eventColumn(S, S.ev.mode, d6(S, `Ereignis: Spalte (${S.ev.mode === 'easy' ? 'leicht' : 'hart'})`));
  if (!col) return { row, col: 0, k: null };          // leicht: ins Leere gewürfelt
  const e = EVENT_ROWS[row - 1][col - 1];
  return { row, col, k: e.k };
}
/* Das Orakel darf das Ereignis der nächsten Runde vorab sehen. Gewürfelt wird dann
   schon jetzt und in evNext gemerkt, damit es nicht zweimal gewürfelt wird. */
function peekNextEvent(S) {
  if (!evOn(S)) return null;
  if (!S.evNext) S.evNext = rollEvent(S);
  return S.evNext;
}
/* Wirkt das Ereignis in dieser Runde auf dieses Reich?
   S.evMuted schaltet alle Ereigniswirkungen vorübergehend ab. Das braucht baseIncome()
   in der engine, um den DAUERHAFTEN Wert zu berechnen – die Nahrungsgrenze darf nicht
   an einer Dürre hängen, die nur diese eine Runde gilt. */
function evActive(S, pi, k) {
  if (S.evMuted) return false;
  if (!evOn(S) || !S.event || S.event.k !== k || S.event.round !== S.round) return false;
  const p = S.players[pi];
  if (!p || p.kind === 'bot' || p.kind === 'barbar') return false;
  if (hasWonder(S, pi, 'palast')) return false;       // Der Apostolische Palast schützt
  return true;
}
function evTerrainDead(S, pi, t) {
  if (S.evMuted) return false;
  if (!evOn(S) || !S.event) return false;
  const dead = EVENT_TERRAIN[S.event.k];
  return dead === t && evActive(S, pi, S.event.k);
}
function evNukeBan(S, pi) {
  const p = S.players[pi];
  return !!S.nukeBan && p.kind !== 'bot' && !hasWonder(S, pi, 'palast');
}
function humanPlayers(S) {
  return S.players.map((p, i) => i).filter(i => {
    const p = S.players[i];
    return p.kind !== 'bot' && p.kind !== 'barbar' && !p.dead;
  });
}
/* Anteil der Bevölkerung, den ein Ereignis nimmt: aufgerundet, aber nie die letzte
   Bevölkerung – Ereignisse zerstören keine Städte. */
function evPopLoss(S, city, want) {
  const loss = Math.min(want, city.pop - 1);
  if (loss <= 0) return 0;
  city.pop -= loss;
  return loss;
}
/* Rundenbeginn: offene Barbarenangriffe abwickeln, dann das neue Ereignis auswürfeln
   und anwenden. Wird aus advanceTurn/newGame gerufen, auch wenn Ereignisse aus sind. */
function startRound(S) {
  if (!evOn(S) || S.over) return;
  resolveBarbs(S);                       // zweiter Angriff kommt vor dem nächsten Ereignis
  if (S.over) return;
  const ev = S.evNext || rollEvent(S);
  S.evNext = null;
  S.event = { round: S.round, row: ev.row, col: ev.col, k: ev.k };
  if (!ev.k) { log(S, 'info', T('Ereignis: keines (Spalte ins Leere gewürfelt).')); return; }
  applyEvent(S);
}
function applyEvent(S) {
  const def = EVENT_BY_KEY[S.event.k];
  log(S, 'head', `Ereignis: ${def.n}`);
  log(S, 'info', def.e);
  if (S.event.k === 'atomprotest') S.nukeBan = true;
  for (const pi of humanPlayers(S)) {
    const p = S.players[pi];
    if (hasWonder(S, pi, 'palast')) {
      log(S, 'info', T('%s: Der Apostolische Palast schützt vor dem Ereignis.', civOf(p).n));
      continue;
    }
    switch (S.event.k) {
      case 'pest': {
        let sum = 0;
        for (const c of citiesOf(S, pi)) sum += evPopLoss(S, c, Math.ceil(c.pop / 2));
        log(S, 'warn', T('%s: Die Pest kostet %s Bevölkerung.', civOf(p).n, sum));
        break;
      }
      case 'sturmflut': {
        let sum = 0;
        for (const c of citiesOf(S, pi)) {
          const wet = neighbors(c.r, c.c).some(([r, cc]) => ['M', 'F'].includes(terrainAt(S, r, cc)));
          if (!wet) continue;
          sum += evPopLoss(S, c, Math.ceil(c.pop / 3));
          c.noGrow = S.round;
        }
        log(S, 'warn', T('%s: Sturmflut kostet %s Bevölkerung.', civOf(p).n, sum));
        break;
      }
      case 'kriegsmuedigkeit':
        p.power = 0;
        log(S, 'warn', T('%s: Machtwert auf 0 zurückgesetzt.', civOf(p).n));
        break;
      case 'erdbeben': quakeWonder(S, pi); break;
      case 'buergerkrieg': {
        const n = armiesOf(S, pi).length;
        S.armies = S.armies.filter(a => a.owner !== pi);
        log(S, 'warn', T('%s: Bürgerkrieg zerstört %s Armee(n).', civOf(p).n, n));
        break;
      }
      case 'barbaren': startBarbInvasion(S, pi); break;
      case 'vulkan': erupt(S, pi); break;
      default: break;      // die übrigen wirken über evActive() während der Runde
    }
  }
}
/* Vulkanausbruch: Stadt auswürfeln, dann ein benachbartes Landfeld. */
function erupt(S, pi) {
  const p = S.players[pi];
  const city = rollCity(S, pi, T('Vulkanausbruch: Stadt'));
  if (!city) { log(S, 'info', T('%s: keine Stadt außer der Hauptstadt – kein Vulkan.', civOf(p).n)); return; }
  const spots = neighbors(city.r, city.c).filter(([r, c]) => {
    const t = terrainAt(S, r, c);
    return t && TERRAIN[t].land && !TERRAIN[t].block && !cityAt(S, r, c);
  });
  if (spots.length) {
    let idx = 0;
    do { idx = d6(S, T('Vulkanausbruch: Feld (1–%s)', Math.min(spots.length, 6))); } while (idx > spots.length);
    const [r, c] = spots[idx - 1];
    S.map.rows[r] = S.map.rows[r].slice(0, c) + 'V' + S.map.rows[r].slice(c + 1);
    S.armies = S.armies.filter(a => !(a.r === r && a.c === c));
    log(S, 'warn', T('%s: Feld %s/%s ist jetzt ein Vulkan (unpassierbar, kein Ertrag).', civOf(p).n, r, c));
  }
  const want = Math.max(Math.ceil(city.pop * 3 / 4), 3);
  const lost = evPopLoss(S, city, want);
  log(S, 'warn', T('%s: Die Stadt verliert %s Bevölkerung.', civOf(p).n, lost));
}
/* Eine Stadt außer der Hauptstadt auswürfeln. */
function rollCity(S, pi, why) {
  const list = citiesOf(S, pi).filter(c => !c.cap);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let idx = 0;
  do { idx = d6(S, `${why} (1–${Math.min(list.length, 6)})`); } while (idx > list.length);
  return list[idx - 1];
}

/* ------------------------------------------------------------------ Barbaren */
/* Neutrale Fraktion. Wird erst angelegt, wenn sie tatsächlich eine Stadt erobert
   oder angreift; sie ist als „dead" markiert und kommt damit nie an den Zug. */
function barbIndex(S) {
  let i = S.players.findIndex(p => p.kind === 'barbar');
  if (i >= 0) return i;
  S.players.push({
    civ: 'barbaren', kind: 'barbar', diff: 'prinz', ability: 'basis', name: null,
    power: 0, techs: {}, avail: {}, res: { sci: 0, food: 0, coins: 0 },
    copies: 0, nuked: false, dead: true,
  });
  return S.players.length - 1;
}
function startBarbInvasion(S, pi) {
  const p = S.players[pi];
  const city = rollCity(S, pi, T('Barbareninvasion: Stadt'));
  if (!city) { log(S, 'info', T('%s: keine Stadt außer der Hauptstadt – keine Invasion.', civOf(p).n)); return; }
  const power = Math.max(10, 2 * powerOf(S, pi));
  const force = { cityId: city.id, owner: pi, power, hits: 0, left: 2 };
  log(S, 'warn', T('%s: Barbaren mit Macht %s greifen die Stadt auf %s/%s an.', civOf(p).n, power, city.r, city.c));
  (S.barbs = S.barbs || []).push(force);
  if (barbFight(S, force)) S.barbs = S.barbs.filter(f => f !== force);
}
/* Der zweite Angriff, direkt vor dem nächsten Ereignis. */
function resolveBarbs(S) {
  if (!S.barbs || !S.barbs.length) return;
  for (const force of S.barbs.slice()) {
    if (barbFight(S, force)) S.barbs = S.barbs.filter(f => f !== force);
    if (S.over) return;
  }
}
/* Ein Angriff. Rückgabe true = die Barbaren ziehen ab (erledigt). */
function barbFight(S, force) {
  const city = S.cities.find(c => c.id === force.cityId);
  if (!city || city.owner !== force.owner) return true;      // Stadt weg oder Besitzer gewechselt
  const d = defenseValue(S, city);
  force.left--;
  if (force.power > d) {
    force.hits++;
    log(S, 'fight', T('Barbaren: Angriff %s > Verteidigung %s (Zug %s/2).', force.power, d, force.hits));
    if (force.hits >= 2) {
      captureCity(S, barbIndex(S), city);
      return true;
    }
    return force.left <= 0;
  }
  log(S, 'fight', T('Barbarenangriff abgewehrt (Angriff %s ≤ Verteidigung %s). Die Barbaren ziehen ab.', force.power, d));
  return true;                                              // keine zwei Runden in Folge mehr möglich
}

/* ================================================================ Weltwunder */
function wondersOf(S, pi) { return (S.wonders || []).filter(w => w.owner === pi); }
function wondersInCity(S, city) { return (S.wonders || []).filter(w => w.cityId === city.id); }
/* Besitzt das Reich dieses Wunder? (reine Eigentumsfrage, gilt auch für Bots) */
function ownsWonder(S, pi, k) {
  if (!S || !S.wonders || !S.wonders.length) return false;
  return S.wonders.some(w => w.owner === pi && w.k === k);
}
/* Wirkt dieses Wunder für das Reich? Bots und Barbaren wenden keine Wundereffekte an –
   sie besitzen Wunder (für Kosten, Stufenregel und Kultursieg), nutzen sie aber nicht.
   Einzige Ausnahme ist die Technologie Militärlogistik, die nur die Anzahl der eigenen
   Wunder zählt (siehe moveAllowance) und deshalb nicht über hasWonder läuft. */
function hasWonder(S, pi, k) {
  const p = S && S.players && S.players[pi];
  if (!p || p.kind === 'bot' || p.kind === 'barbar') return false;
  return ownsWonder(S, pi, k);
}
// Der Kreml verteuert die Singularität für alle – aber nur, wenn ihn kein Bot hält.
function kremlBuilt(S) {
  if (!S || !S.wonders) return false;
  return S.wonders.some(w => w.k === 'kreml' && hasWonder(S, w.owner, 'kreml'));
}
function wonderCounts(S, pi) {
  const c = { 1: 0, 2: 0, 3: 0 };
  for (const w of wondersOf(S, pi)) c[w.lvl]++;
  return c;
}
/* Kosten: 10 für das erste eigene Wunder, dann 20/30/40 … Zerstörte und verlorene
   Wunder zählen nicht mehr mit, der Preis sinkt also wieder.
   Baukräne senkt den Preis des 1./2./3./… Wunders um 2/4/6/… – also 8/16/24/… statt
   10/20/30/…; das Muster setzt sich über das sechste Wunder hinaus fort. */
function wonderCost(S, pi) {
  const idx = wondersOf(S, pi).length + 1;
  const p = S.players[pi];
  const step = (has(p, 'baukraene') && p.kind !== 'bot') ? WONDER_STEP - 2 : WONDER_STEP;
  return step * idx;
}
/* Pyramidenregel: Stufe 2 muss seltener sein als Stufe 1, Stufe 3 seltener als Stufe 2. */
function wonderLevelOk(S, pi, lvl) {
  if (lvl === 1) return true;
  const c = wonderCounts(S, pi);
  return c[lvl] + 1 < c[lvl - 1];
}
function poolOf(S, lvl) { return (S.wpool && S.wpool[lvl]) || []; }
function availableWonders(S) {
  const out = [];
  for (const lvl of [1, 2, 3]) for (const k of poolOf(S, lvl)) out.push(WONDER_BY_KEY[k]);
  return out;
}
/* `vorab` kommt aus dem Plättchenmodus: dort werden die Stapel schon vor der Legephase
   gezogen, damit man beim Legen sieht, welche Wunder überhaupt zu haben sind. Dann wird
   das Ergebnis übernommen statt neu gezogen – sonst stünde im Spiel etwas anderes. */
function initWonderPools(S, vorab) {
  if (vorab) S.wpool = JSON.parse(JSON.stringify(vorab));
  else {
    S.wpool = { 1: [], 2: [], 3: WONDERS_IN(3).map(w => w.k) };   // alle drei Stufe-3-Wunder
    refillPool(S, 1); refillPool(S, 2);
  }
  log(S, 'info', T('Verfügbare Weltwunder: ') +
    [1, 2].map(l => `Stufe ${l}: ` + poolOf(S, l).map(k => WONDER_BY_KEY[k].n).join(', ')).join(' · '));
}
function refillPool(S, lvl) {
  if (lvl === 3) return;                        // Stufe 3 ist vollständig verfügbar
  const used = new Set([...(S.wonders || []).map(w => w.k), ...(S.wgone || []), ...poolOf(S, lvl)]);
  const free = WONDERS_IN(lvl).filter(w => !used.has(w.k));
  while (S.wpool[lvl].length < WONDER_POOL_SIZE && free.length) {
    const i = Math.floor(nextRand(S) * free.length);
    S.wpool[lvl].push(free[i].k);
    free.splice(i, 1);
  }
}
function canBuildWonder(S, pi, city, wk, opts) {
  if (!woOn(S)) return T('Ohne Weltwunder-Erweiterung.');
  const w = WONDER_BY_KEY[wk];
  if (!w) return T('Unbekanntes Wunder.');
  if (!city || city.owner !== pi) return T('Nur in eigener Stadt.');
  if (!poolOf(S, w.lvl).includes(wk)) return T('Dieses Wunder ist nicht verfügbar.');
  if (wondersInCity(S, city).length >= 2) return T('Diese Stadt hat schon zwei Wunder.');
  if (!wonderLevelOk(S, pi, w.lvl))
    return T('Erst mehr Wunder der Stufe %s bauen (Stufe %s muss seltener bleiben).', w.lvl - 1, w.lvl);
  if (!(opts && opts.free)) {
    const cost = wonderCost(S, pi);
    if (available(S, pi, 'coins') < cost) return T('Zu wenig Münzen (%s nötig).', cost);
  }
  return null;
}
function buildWonder(S, pi, city, wk, opts) {
  const err = canBuildWonder(S, pi, city, wk, opts);
  if (err) return err;
  const p = S.players[pi], w = WONDER_BY_KEY[wk];
  let cost = 0;
  if (!(opts && opts.free)) {
    cost = wonderCost(S, pi);
    if (!pay(S, pi, 'coins', cost)) return T('Zu wenig Münzen (%s nötig).', cost);
  }
  const rangeBefore = moveAllowance(S, pi);
  S.wonders.push({ k: wk, lvl: w.lvl, owner: pi, cityId: city.id, r: city.r, c: city.c });
  S.wpool[w.lvl] = poolOf(S, w.lvl).filter(k => k !== wk);
  refillPool(S, w.lvl);
  log(S, 'act', `${civOf(p).n}: ${w.n} gebaut (Stufe ${w.lvl}${cost ? `, ${cost} Münzen` : ''}).`);
  // Militärlogistik: die größere Reichweite wirkt sofort, wie bei einem Reichweitensprung
  const gained = moveAllowance(S, pi) - rangeBefore;
  if (gained > 0) for (const a of armiesOf(S, pi)) a.mp += gained;
  // Raumfahrt: bei jedem Wunderbau eine Technologie gratis (kein neues Zeitalter,
  // keine Singularität). Bots würfeln sie nach den normalen Bot-Forschungsregeln aus.
  if (has(p, 'raumfahrt') && p.kind !== 'bot') {
    addFreePick(S, pi, { n: 1, unlockedOnly: true, why: 'Raumfahrt' });
    log(S, 'info', T('%s: Raumfahrt – eine Technologie gratis erforschbar.', civOf(p).n));
  }
  if (!(opts && opts.noEffect)) applyWonderEffect(S, pi, city, w);
  if (w.lvl === 3) {
    p.cultureWin = S.round;
    log(S, 'head', T('%s hat ein Weltwunder der Stufe 3 – Kultursieg zu Beginn des nächsten Zuges.', civOf(p).n));
  }
  return null;
}
/* Sofortwirkungen. Dauerhafte Wunder wirken über hasWonder() an der jeweiligen Stelle. */
function applyWonderEffect(S, pi, city, w) {
  const p = S.players[pi];
  switch (w.k) {
    case 'bibliothek':
      addFreePick(S, pi, { n: 1, maxAge: 1, why: T('Die große Bibliothek') });
      break;
    case 'oxford':
      // "zwei momentan verfügbare Technologien": die Auswahl wird beim Bau festgehalten.
      // Sonst könnte die erste Gratis-Tech ein neues Zeitalter aufschließen und die
      // zweite Wahl um Technologien erweitern, die vorher nicht verfügbar waren.
      // Die Singularität gilt als verfügbar, sobald ihre Voraussetzungen erfüllt sind –
      // sie steht in keiner Techliste und braucht deshalb einen eigenen Eintrag.
      addFreePick(S, pi, {
        n: 2, why: T('Universität von Oxford'),
        only: techPool(S).filter(t => p.avail[t.k] && !p.techs[t.k]).map(t => t.k)
          .concat(singularityReady(p) && !p.techs.singularitaet ? ['singularitaet'] : []),
      });
      break;
    case 'gaerten':
      for (const c of citiesOf(S, pi)) growFree(S, pi, c, 1, T('Hängende Gärten'));
      break;
    case 'freiheit':
      for (const c of citiesOf(S, pi)) growFree(S, pi, c, 3, 'Freiheitsstatue');
      break;
    case 'angkor':
      growFree(S, pi, city, 9, 'Angkor Wat');
      break;
    case 'koloss': {
      /* Zwei kostenlose Armeen – sie erscheinen in DER STADT, DIE DEN KOLOSS GEBAUT HAT
         (nicht in der Hauptstadt), und müssen sie verlassen, nacheinander: auf einem Feld
         steht nur eine Armee. Wo sie warten, merkt sich p.freeArmyCity, weil die
         Warteschlange über Züge hinweg bestehen bleibt. */
      p.freeArmies = (p.freeArmies || 0) + 2;
      p.freeArmyCity = city ? city.id : null;
      log(S, 'act', `${civOf(p).n}: Der Koloss stellt zwei kostenlose Armeen.`);
      spawnFreeArmies(S, pi);
      break;
    }
    case 'canal':
      p.res.coins += 40;
      log(S, 'act', T('%s: +40 Münzen (Canal du Midi).', civOf(p).n));
      break;
    case 'pentagon':
      p.power += 15;
      log(S, 'act', T('%s: +15 Macht (Das Pentagon).', civOf(p).n));
      break;
    case 'taj':
      p.doubleIncome = S.round + 1;
      log(S, 'act', T('%s: nächste Runde doppelte Erträge (Taj Mahal).', civOf(p).n));
      break;
    default: break;        // dauerhafte Wirkung, nichts zu tun
  }
}
/* Kostenlose Forschung aus Wundern (Bibliothek/Oxford). */
/* Höchstes Zeitalter, das ein Reich in diesem Technologiefeld freigeschaltet hat:
   ein Zeitalter gilt als freigeschaltet, sobald dort eine Technologie verfügbar oder
   erforscht ist. Bots führen kein avail, bei ihnen zählen die erforschten Techs. */
function unlockedAge(S, pi, field) {
  const p = S.players[pi];
  let best = 0;
  for (const t of techPool(S))
    if (t.f === field && (p.avail[t.k] || p.techs[t.k]) && t.age > best) best = t.age;
  return best;
}
/* Offene Ansprüche auf kostenlose Forschung. Es können mehrere gleichzeitig sein –
   ein Wunderbau kann über Raumfahrt und über das Wunder selbst (Bibliothek, Oxford)
   zugleich einen Anspruch auslösen. Sie werden der Reihe nach abgearbeitet. */
function addFreePick(S, pi, claim) {
  const p = S.players[pi];
  (p.freePicks = p.freePicks || []).push(claim);
}
function freePick(p) {
  return (p.freePicks || []).find(c => c.n > 0) || null;
}
function freePickOptions(S, pi) {
  const p = S.players[pi];
  const pick = freePick(p);
  if (!pick) return [];
  // Die Singularität kann nur über eine ausdrücklich festgehaltene Auswahl kommen
  // (Oxford). Raumfahrt schließt sie aus, für die Bibliothek ist sie zu spät.
  const pool = techPool(S).slice();
  if (pick.only && pick.only.includes('singularitaet') && !p.techs.singularitaet)
    pool.push(SINGULARITY);
  return pool.filter(t => {
    if (p.techs[t.k]) return false;
    if (pick.maxAge != null && t.age > pick.maxAge) return false;
    if (pick.availOnly && !p.avail[t.k]) return false;
    if (pick.only && !pick.only.includes(t.k)) return false;   // beim Bau festgehaltene Auswahl
    // Raumfahrt: kein Zeitalter, das in diesem Feld noch nicht freigeschaltet ist
    if (pick.unlockedOnly && t.age > unlockedAge(S, pi, t.f)) return false;
    return true;
  });
}
function useFreePick(S, pi, tk) {
  const p = S.players[pi];
  const pick = freePick(p);
  if (!pick || !freePickOptions(S, pi).some(t => t.k === tk)) return T('Nicht möglich.');
  const err = grantTech(S, pi, tk, pick.why);
  if (err) return err;
  pick.n--;
  p.freePicks = p.freePicks.filter(c => c.n > 0);
  return null;
}
/* Erdbeben: ein zufälliges eigenes Wunder wird zerstört und ist für immer weg. */
function quakeWonder(S, pi) {
  const p = S.players[pi];
  const mine = wondersOf(S, pi);
  if (!mine.length) { log(S, 'info', T('%s: kein Weltwunder – Erdbeben ohne Folgen.', civOf(p).n)); return; }
  if (hasWonder(S, pi, 'stonehenge')) {
    log(S, 'info', T('%s: Stonehenge – Weltwunder können nicht zerstört werden.', civOf(p).n));
    return;
  }
  let idx = 0;
  do { idx = d6(S, T('Erdbeben: Wunder (1–%s)', Math.min(mine.length, 6))); } while (idx > mine.length);
  const w = mine[idx - 1];
  removeWonder(S, w);
  log(S, 'warn', T('%s: %s zerstört – kann nicht wieder gebaut werden.', civOf(p).n, WONDER_BY_KEY[w.k].n));
}
function removeWonder(S, w) {
  S.wonders = S.wonders.filter(x => x !== w);
  (S.wgone = S.wgone || []).push(w.k);
}
/* Stadt zerstört: die Wunder gehen verloren – außer mit Stonehenge, dann bleiben sie
   ohne Stadt auf dem Feld stehen und wirken weiter. */
function loseCityWonders(S, city) {
  if (!S.wonders || !S.wonders.length) return;
  const list = wondersInCity(S, city);
  if (!list.length) return;
  // Stonehenge schützt nur, wenn es für das Reich auch wirkt (nicht bei Bots)
  const protectedBy = hasWonder(S, city.owner, 'stonehenge') ||
    (list.some(w => w.k === 'stonehenge') && hasWonder(S, city.owner, 'stonehenge'));
  for (const w of list) {
    if (protectedBy) { w.cityId = null; continue; }
    removeWonder(S, w);
  }
  log(S, 'fight', protectedBy
    ? T('Stonehenge: %s Weltwunder überstehen die Zerstörung der Stadt.', list.length)
    : T('%s Weltwunder mit der Stadt zerstört – nicht wieder baubar.', list.length));
}
/* Stadt erobert: Wunder und ihre dauerhaften Effekte wechseln den Besitzer. */
function takeCityWonders(S, city, from, to) {
  if (!S.wonders || !S.wonders.length) return;
  const list = S.wonders.filter(w => w.cityId === city.id);
  if (!list.length) return;
  list.forEach(w => { w.owner = to; });
  log(S, 'fight', T('%s übernimmt %s Weltwunder:', civOf(S.players[to]).n, list.length) +
    list.map(w => WONDER_BY_KEY[w.k].n).join(', ') + '.');
  const p = S.players[to];
  if (list.some(w => w.lvl === 3) && p.kind !== 'barbar') p.cultureWin = S.round;
}
/* Wunder ohne Stadt (Stonehenge-Ruinen): wer hier eine Stadt gründet, übernimmt sie. */
function claimOrphanWonders(S, pi, city) {
  if (!S.wonders || !S.wonders.length) return;
  const list = S.wonders.filter(w => w.cityId == null && w.r === city.r && w.c === city.c);
  if (!list.length) return;
  list.forEach(w => { w.owner = pi; w.cityId = city.id; });
  log(S, 'act', T('%s übernimmt %s freistehende(s) Weltwunder.', civOf(S.players[pi]).n, list.length));
  if (list.some(w => w.lvl === 3)) S.players[pi].cultureWin = S.round;
}
/* Kultursieg: zu Beginn des nächsten eigenen Zuges nach dem Bau – sofern das
   Stufe-3-Wunder da noch im eigenen Besitz ist. Diese Prüfung bleibt, sie gehört zum
   Kultursieg selbst; erst danach wird der Sieg angemeldet und fällt am Rundenende.
   Geht das Wunder später verloren, ändert das am angemeldeten Anspruch nichts mehr. */
function checkCultureVictory(S, pi) {
  const p = S.players[pi];
  if (S.over) return S.over;
  if (p.cultureWin == null || S.round <= p.cultureWin) return null;
  if (S.claims && S.claims.some(c => c.pi === pi && c.how.startsWith('Kultursieg'))) return null;
  if (!wondersOf(S, pi).some(w => w.lvl === 3)) { p.cultureWin = null; return null; }
  claimVictory(S, pi, T('Kultursieg (Weltwunder der Stufe 3)'));
  return S.over;
}

/* ------------------------------------------------------- Bots und Weltwunder */
/* Zusätzlicher Bot-Schritt nach dem Siedeln: Würfelprobe, dann ein zufälliges
   verfügbares und baubares Wunder. Bots zahlen nichts (wie bei allen Bot-Aktionen)
   und wenden keine Wundereffekte an. Stufe 3 gewinnt auch für sie. */
function botWonderCity(S, pi) {
  const cap = capitalOf(S, pi);
  if (cap && wondersInCity(S, cap).length < 2) return cap;
  const free = citiesOf(S, pi).filter(c => wondersInCity(S, c).length < 2);
  if (!free.length) return null;
  const best = Math.max(...free.map(c => c.pop));
  const top = free.filter(c => c.pop === best);
  if (top.length === 1) return top[0];
  let idx = 0;
  do { idx = d6(S, T('Wunderstadt auswürfeln (1–%s)', Math.min(top.length, 6))); } while (idx > top.length);
  return top[idx - 1];
}
function botWonderStep(S, pi) {
  if (!woOn(S) || S.over) return;
  const p = S.players[pi];
  if (!botTry(S, p, T('Weltwunder bauen'))) return;
  const city = botWonderCity(S, pi);
  if (!city) return;
  const cands = availableWonders(S).filter(w => !canBuildWonder(S, pi, city, w.k, { free: true }));
  if (!cands.length) return;
  let idx = 0;
  do { idx = d6(S, T('Wunder auswürfeln (1–%s)', Math.min(cands.length, 6))); } while (idx > cands.length);
  buildWonder(S, pi, city, cands[idx - 1].k, { free: true, noEffect: true });
}
