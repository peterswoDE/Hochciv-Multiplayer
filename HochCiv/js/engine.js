/* Hochzeivilization – Regelmaschine.
   Reihenfolge im Zug (Regelheft):
   1 Wissenschaft/Nahrung/Münzen bestimmen · 2 Macht reduzieren · 3 Aktionen
   4 Kampf · 5 Sieg prüfen                                                    */

/* ------------------------------------------------------------ Zufall (seeded) */
function nextRand(S) {
  S.seed = (S.seed + 0x6D2B79F5) | 0;
  let t = S.seed;
  t = Math.imul(t ^ t >>> 15, 1 | t);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function d6(S, why) {
  // Im Tutorial kommen die Würfe aus einer festen Folge (tutNextDie), damit die Partie –
  // inklusive aller Bot-Entscheidungen – bei jedem Durchlauf identisch abläuft.
  let v = (typeof tutNextDie === 'function') ? tutNextDie() : null;
  if (!v) v = 1 + Math.floor(nextRand(S) * 6);
  log(S, 'roll', '🎲 ' + v + (why ? ' — ' + why : ''));
  return v;
}
function pick(S, arr) { return arr[Math.floor(nextRand(S) * arr.length)]; }
function log(S, cls, msg) {
  S.logSeq = (S.logSeq || 0) + 1;
  S.log.push({ c: cls, m: msg, r: S.round, seq: S.logSeq });
  if (S.log.length > 600) S.log.shift();
}
// Alle Log-Einträge ab einer Sequenznummer (stabil, auch wenn ältere weggekappt wurden).
function logSince(S, seq) { return S.log.filter(e => e.seq > seq); }

/* ------------------------------------------------------------ Kürzel */
const P = S => S.players[S.cur];
const has = (p, k) => !!p.techs[k];
const terrainAt = (S, r, c) => {
  const rows = S.map.rows;
  if (r < 0 || r >= rows.length) return null;
  return c < 0 || c >= rows[r].length ? null : rows[r][c];
};
const isLand = (S, r, c) => { const t = terrainAt(S, r, c); return t ? TERRAIN[t].land : false; };
const cityAt = (S, r, c) => S.cities.find(x => x.r === r && x.c === c);
const armyAt = (S, r, c) => S.armies.find(x => x.r === r && x.c === c);
const citiesOf = (S, pi) => S.cities.filter(x => x.owner === pi);
const armiesOf = (S, pi) => S.armies.filter(x => x.owner === pi);
const popOf = (S, pi) => citiesOf(S, pi).reduce((a, x) => a + x.pop, 0);
const worldPop = S => S.cities.reduce((a, x) => a + x.pop, 0);
/* Wirtschaftssieg am Rundenende (v85, Anweisung des Autors): einmal je Runde, an ihrem Ende –
   wenn alle gleich oft gezogen haben –, mit der Bevölkerung von dort, für alle Reiche in
   Zugfolge. Wer die Schwelle überschreitet, gewinnt sofort: die Partie endet gleich dort,
   nach dem Punktvergleich, falls in derselben Runde ein anderes Reich die Singularität
   erforscht oder ein Wunder der Stufe 3 gebaut hat (resolveClaims). Schon am Ende von Runde 1.
   Vorher: v83/v84 zu Rundenbeginn mit der Bevölkerung von dort, und die Partie lief bis zum
   Ende jener Runde; bis v82 am Ende jedes Zuges mit dem laufenden Stand, ab Runde 2. */
function checkEconomyRoundEnd(S) {
  if (S.over) return;
  for (let k = 0; k < S.players.length; k++) {
    const pi = ((S.startIdx || 0) + k) % S.players.length, p = S.players[pi];
    if (!p.dead && canWin(p)) checkVictory(S, pi);
  }
}
const capitalOf = (S, pi) => citiesOf(S, pi).find(x => x.cap);
/* Militärsieg im Marathon (v84, Anweisung des Autors): erst mit der zweiten eroberten
   Hauptstadt. Eine eroberte Hauptstadt ist danach eine gewöhnliche Stadt (captureCity) –
   dieselbe kann also nicht zweimal zählen, und wer seine Hauptstadt verloren hat, spielt
   ohne weiter, wie nach einem Barbarenüberfall. p.capTaken: die Reiche, deren Hauptstadt
   dieses Reich genommen hat. */
const capitalsToWin = S => S && S.marathon ? MARATHON_CAPITALS : 1;
const capitalsTaken = p => (p && p.capTaken ? p.capTaken.length : 0);
/* Gründungen in diesem Zug (Marathon: höchstens MARATHON_MAX_FOUNDS). Jedes Reich hat genau
   einen Zug je Runde, also zählt die Runde. */
const foundedThisTurn = (S, pi) => {
  const p = S.players[pi];
  return p.foundRound === S.round ? (p.foundCount || 0) : 0;
};
const roadLevel = (S, r, c) => S.roads[key(r, c)] || 0;
/* Auf Plättchenkarten darf dieselbe Zivilisation mehrfach am Tisch sitzen. Damit die
   Reiche unterscheidbar bleiben, bekommen die Doppelgänger im Aufbau einen eigenen Namen
   („Russland II") und eine eigene Farbschattierung; civOf legt sie über die Zivilisation.
   Ohne Doppelung ändert sich nichts – dann sind name und color leer. */
const civOf = p => {
  const base = CIV_BY_KEY[p.civ] || BARB_CIV;
  if (!p.name && !p.color && !p.roman) return base;
  // roman ist die Ziffer der Doppelgänger („II"); der Name wird daraus erst hier gebaut,
  // damit er beim Sprachwechsel mitwandert (p.name bleibt für alte Spielstände).
  const n = p.roman ? `${base.n} ${p.roman}` : p.name;
  return Object.assign({}, base, n ? { n } : null, p.color ? { color: p.color } : null);
};
/* Wer zieht von selbst? Bots nach den Bot-Regeln, die KI nach den Regeln für Menschen
   (js/ki.js). Beide brauchen keine Eingabe – die Oberfläche fragt das hier ab. */
const isAuto = p => !!p && (p.kind === 'bot' || p.kind === 'ki');
// Zusatz hinter dem Reichsnamen im Protokoll: „ (Bot)" bzw. „ (KI)", bei Menschen nichts
const kindTag = p => p.kind === 'bot' ? T(' (Bot)') : p.kind === 'ki' ? T(' (KI)') : '';
/* Hauptstadt eines Reiches auf der Karte. Feste Karten führen sie nach Zivilisation,
   Plättchenkarten nach Platz – dort kann es dieselbe Zivilisation zweimal geben. */
function capitalSpot(map, p) {
  const caps = map && map.capitals;
  if (!caps) return null;
  if (Array.isArray(caps)) {
    const e = caps[p.slot];
    return e ? [e.r, e.c] : null;
  }
  return caps[p.civ] || null;
}

/* ------------------------------------------------------------ Eigene Karten
   Eine Karte aus dem Karteneditor kommt von außen – aus einer Datei oder, im Mehrspieler-
   modus, vom Rechner des Hosts. Dieselbe Prüfung läuft deshalb im Browser und auf dem
   Server, und weiter geht nur eine bereinigte Kopie.

   Form: { name, rows, spawns: [[r, c], …], marathon }
   · rows     rechteckig, 4 bis CUSTOM_MAP_MAX Felder je Richtung, nur Gelände aus TERRAIN
   · spawns   die Startpunkte, 2 bis MAX_PLAYERS. Ihre Zahl ist die Höchstzahl der Reiche
              (maxPlayers). Jeder auf begehbarem Land, je zwei mindestens 3 Felder
              auseinander (wie beim Gründen). Startpunkte gehören keiner Zivilisation – wer
              wo beginnt, legt mapForPlayers bei Spielbeginn fest.
   · marathon gespielt wird nach den Marathonregeln (teurere Technologien, Fähigkeiten im
              Draft) – wie auf der Standard-Marathonkarte, nur auf dieser Karte.
   Ältere Karten hatten je Zivilisation eine Hauptstadt (`capitals: { russland: [r, c] … }`);
   sie werden zu vier Startpunkten in der Reihenfolge von CIVS.
   Ergebnis: { map } oder { error } mit einer Meldung für Menschen. */
const CUSTOM_MAP_MIN = 4, CUSTOM_MAP_MAX = 48, CUSTOM_MAP_NAME_MAX = 40;
const SPAWN_MIN_DIST = 3;
function checkCustomMap(m) {
  const fail = error => ({ error });
  if (!m || typeof m !== 'object' || !Array.isArray(m.rows)) return fail(T('Das ist keine Karte.'));
  const rows = m.rows, lo = CUSTOM_MAP_MIN, hi = CUSTOM_MAP_MAX;
  if (rows.length < lo || rows.length > hi) return fail(T('Eine Karte hat %s bis %s Zeilen.', lo, hi));
  const w = typeof rows[0] === 'string' ? rows[0].length : 0;
  if (w < lo || w > hi) return fail(T('Eine Karte hat %s bis %s Spalten.', lo, hi));
  for (const row of rows) {
    if (typeof row !== 'string' || row.length !== w) return fail(T('Alle Zeilen müssen gleich lang sein.'));
    for (const ch of row) if (!Object.prototype.hasOwnProperty.call(TERRAIN, ch)) return fail(T('Unbekanntes Gelände „%s".', ch));
  }
  // Startpunkte – aus `spawns`, oder aus den Hauptstädten einer älteren Karte
  let raw = m.spawns;
  if (!Array.isArray(raw) && m.capitals && typeof m.capitals === 'object' && !Array.isArray(m.capitals))
    raw = CIVS.map(c => m.capitals[c.k]).filter(p => p !== undefined);
  if (!Array.isArray(raw)) raw = [];
  if (raw.length < MIN_PLAYERS) return fail(T('Eine Karte braucht mindestens %s Startpunkte.', MIN_PLAYERS));
  if (raw.length > MAX_PLAYERS) return fail(T('Eine Karte hat höchstens %s Startpunkte.', MAX_PLAYERS));
  const spawns = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!Array.isArray(p) || !Number.isInteger(p[0]) || !Number.isInteger(p[1]) ||
      p[0] < 0 || p[0] >= rows.length || p[1] < 0 || p[1] >= w) return fail(T('Startpunkt %s liegt nicht auf der Karte.', i + 1));
    const t = TERRAIN[rows[p[0]][p[1]]];
    if (!t.land || t.block) return fail(T('Startpunkt %s liegt nicht auf Land.', i + 1));
    spawns.push([p[0], p[1]]);
  }
  for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++)
    if (hexDistance(spawns[i][0], spawns[i][1], spawns[j][0], spawns[j][1]) < SPAWN_MIN_DIST)
      return fail(T('Die Startpunkte %s und %s liegen zu nah beieinander (mindestens 3 Felder).', i + 1, j + 1));
  // Der Name landet in Listen und Protokollen: ohne Steuerzeichen und spitze Klammern, kurz
  const name = (typeof m.name === 'string' ? m.name : '').replace(/[\u0000-\u001f<>]/g, '').trim()
    .slice(0, CUSTOM_MAP_NAME_MAX) || T('Eigene Karte');
  return { map: { name, rows: rows.slice(), spawns, maxPlayers: spawns.length, marathon: m.marathon === true } };
}
/* Was eine Karte zulässt: wie viele Reiche höchstens und ob nach den Marathonregeln.
   `pick` ist der Wert der Kartenwahl: '0' / 'gross' (feste Karten, Startpunkt je
   Zivilisation), 'plaettchen', 'marathon' (Standard-Marathon) oder eine eigene Karte. */
function mapLimits(pick, custom) {
  if (custom) return { min: MIN_PLAYERS, max: custom.maxPlayers || (custom.spawns || []).length || 4, marathon: !!custom.marathon };
  if (pick === 'plaettchen' || pick === 'random') return { min: MIN_PLAYERS, max: MAX_PLAYERS, marathon: false };
  if (pick === 'marathon') return { min: 4, max: 4, marathon: true };
  return { min: MIN_PLAYERS, max: 4, marathon: false };
}
/* Die Spielkarte einer eigenen Karte für n Reiche: die Startpunkte als Hauptstädte nach Platz
   (map.capitals[slot], wie auf der Plättchenkarte). Sind es weniger Reiche als Startpunkte,
   werden die n Startpunkte genommen, die am weitesten auseinanderliegen (der kleinste
   Abstand zweier gewählter ist so groß wie möglich); bei Gleichstand und für die Verteilung
   auf die Plätze entscheidet der Startwert der Partie – zufällig, aber überall gleich. */
function mapForPlayers(cm, n, seed) {
  const sp = cm.spawns;
  if (!Array.isArray(sp) || n > sp.length || n < 1) return null;
  const rnd = mapRng((seed | 0) + 4711);
  let best = null, bestScore = -1;
  const pickSet = (from, chosen) => {
    if (chosen.length === n) {
      let d = 99;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
        d = Math.min(d, hexDistance(sp[chosen[i]][0], sp[chosen[i]][1], sp[chosen[j]][0], sp[chosen[j]][1]));
      const score = d + rnd() * 0.5;                     // Gleichstand: der Zufall entscheidet
      if (score > bestScore) { bestScore = score; best = chosen.slice(); }
      return;
    }
    for (let i = from; i <= sp.length - (n - chosen.length); i++) { chosen.push(i); pickSet(i + 1, chosen); chosen.pop(); }
  };
  pickSet(0, []);
  for (let i = best.length - 1; i > 0; i--) {             // welcher Platz welchen Startpunkt bekommt
    const j = Math.floor(rnd() * (i + 1)); [best[i], best[j]] = [best[j], best[i]];
  }
  return { name: cm.name, rows: cm.rows.slice(), capitals: best.map(i => ({ r: sp[i][0], c: sp[i][1] })) };
}

/* ------------------------------------------------------------ Doppelgänger
   Sitzt eine Zivilisation mehrfach am Tisch, bekommen ihre Reiche römische Ziffern und eine
   eigene Farbe. Das erste behält die Farbe seiner Zivilisation; die Doppelgänger nehmen erst
   eine noch freie Zivilisationsfarbe, ab fünf Reichen eine der EXTRA_COLORS. Ohne
   Farbunterschied wären sie auf der Karte nicht auseinanderzuhalten. Setzt p.roman und
   p.color (null = eigene Farbe); Browser (nameDoubles) und Server (assignDoubles) nutzen es. */
function markDoubles(players) {
  const count = {};
  players.forEach(p => { count[p.civ] = (count[p.civ] || 0) + 1; });
  const free = CIVS.filter(c => !count[c.k]).map(c => c.color).concat(EXTRA_COLORS);
  const seen = {};
  players.forEach(p => {
    const k = seen[p.civ] = (seen[p.civ] || 0) + 1;
    p.color = k === 1 ? null : (free.shift() || null);
    p.roman = count[p.civ] > 1 ? (ROMAN[k - 1] || String(k)) : null;
  });
  return players;
}

/* Fähigkeiten eines Reiches als Liste von Schlüsseln „Zivilisation:Fähigkeit".
   Normalerweise genau eine: die im Aufbau gewählte seiner Zivilisation (p.ability –
   'basis' oder eine der Alternativen). Im Marathon (v83) zwei gedraftete, auch fremde
   und auch zweimal dieselbe (p.drafted). Bots und die neutrale Barbarenfraktion haben
   KEINE Fähigkeit.
   Die Grundfähigkeiten heißen bei allen Reichen 'basis' – geprüft werden sie deshalb immer
   mit der Zivilisation (hasAbil). Die Alternativen haben eindeutige Schlüssel, für sie
   genügt isAbil. Doppelt gedraftet wirkt eine Fähigkeit nur einfach. */
function abilitiesOf(p) {
  if (!p || p.kind === 'bot' || p.kind === 'barbar') return [];
  if (Array.isArray(p.drafted)) return p.drafted;
  return [p.civ + ':' + (p.ability || 'basis')];
}
function hasAbil(p, civ, k) { return abilitiesOf(p).includes(civ + ':' + k); }
function isAbil(p, k) {
  if (k === 'basis') throw new Error('Grundfähigkeiten heißen überall basis – mit Zivilisation prüfen: hasAbil');
  return abilitiesOf(p).some(a => a.slice(a.indexOf(':') + 1) === k);
}
// Eine Fähigkeit als Objekt {k, n, e, civ} aus ihrem Schlüssel „Zivilisation:Fähigkeit"
function abilById(id) {
  const [ck, k] = String(id).split(':');
  const civ = CIV_BY_KEY[ck];
  const a = civ && civ.abilities.find(x => x.k === k);
  return a ? Object.assign({}, a, { civ: ck, id }) : null;
}
/* Die Fähigkeiten eines Reiches als Objekte – für die Anzeige. Bots haben keine.
   Wichtig, seit sich Zivilisation und Fähigkeit auslosen lassen: wer würfeln lässt, muss
   im Spiel nachsehen können, was er bekommen hat. abilInfo gibt die erste (normal die
   einzige), abilInfos alle. */
function abilInfos(p) { return abilitiesOf(p).map(abilById).filter(Boolean); }
function abilInfo(p) { return abilInfos(p)[0] || null; }
/* Wirkungstext einer Fähigkeit in dieser Partie ({civ, k, e}): im Marathon wirken zwei anders
   (v85) – Griechenlands Günstige Forschung doppelt, die Freie Forschung nur bis ins
   Mittelalter. Ohne Spielstand oder sonst der Text des Zivilisationsbogens. */
function abilEffect(a, S) {
  if (a && S && S.marathon) {
    if (a.civ === 'griechenland' && a.k === 'basis')
      return T('Techs %s günstiger (je Zeitalter, im Marathon doppelt)',
        [1, 2, 3, 4, 5].map(n => n * MARATHON_DISCOUNT_FACTOR).join('/'));
    if (a.k === 'gratistech')
      return T('1× pro Runde eine verfügbare Technologie des Mittelalters oder früher umsonst erforschen (Marathon)');
  }
  return a ? a.e : '';
}

/* Machtwert: Bots haben immer ihre Gesamtbevölkerung als Macht.
   Zuschläge (Wikinger "Kriegerkultur", Zeusstatue) erhöhen den Machtwert,
   gehen aber beim Machtverlust zu Zugbeginn nicht verloren. */
function powerBonus(S, pi) {
  const p = S.players[pi];
  let b = 0;
  if (isAbil(p, 'armeemacht')) b += 2 * warriorUnits(S, pi, armiesOf(S, pi).length);
  if (hasWonder(S, pi, 'zeus')) b += 3;
  return b;
}
/* Kriegerkultur (Wikinger): +2 Macht je Armee. Seit v83 (Anweisung des Autors) zählt mit
   Burgenbau auch jede eigene Stadt – dort steht die unbewegliche Armee, die verteidigt,
   flankiert und Kontrollzonen hält wie eine echte. Für die Baukosten weiterer Armeen
   zählt sie weiter nicht. `n` = Zahl der echten Armeen (die KI rechnet mit geplanten). */
function warriorUnits(S, pi, n) {
  return n + (has(S.players[pi], 'burgenbau') ? citiesOf(S, pi).length : 0);
}
function powerOf(S, pi) {
  const p = S.players[pi];
  if (p.kind === 'barbar') return 0;
  if (p.kind === 'bot') return popOf(S, pi);
  return p.power + powerBonus(S, pi);
}

/* ------------------------------------------------------------ Neues Spiel */
function newGame(cfg) {
  // Feste Spielerreihenfolge: Russland → Griechenland → England → Wikinger.
  // Der Startspieler verschiebt nur den Einstiegspunkt in dieser Rotation.
  // ORDER (Zugreihenfolge) kommt aus js/civs.js, erzeugt aus data/civs.json
  // Gleiche Zivilisationen behalten ihre Reihenfolge aus dem Aufbau (stabile Sortierung),
  // und der Startspieler wird über den Platz bestimmt, nicht über die Zivilisation –
  // sonst zeigte „Startspieler Russland" bei zwei Russlands auf das falsche Reich.
  const startPc = cfg.players[cfg.startPlayer ?? 0];
  const ordered = cfg.players.slice().sort((a, b) => ORDER.indexOf(a.civ) - ORDER.indexOf(b.civ));
  const startIdx = Math.max(0, ordered.indexOf(startPc));
  const S = {
    v: 2, seed: (cfg.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    round: 1, cur: 0, over: null, log: [],
    // Angemeldete Siege (alles außer Militärsieg) und die Runde, in der sie fallen
    claims: [], endRound: null,
    map: JSON.parse(JSON.stringify(cfg.map || DEFAULT_MAP)),
    roads: {}, sieges: {}, bought: {},
    cities: [], armies: [], nextId: 1,
    // 1-gegen-1: nur zwei Reiche, kleinere Karte, höhere Siegschwelle
    duel: !!cfg.duel,
    /* Die Rohwahl aus dem Aufbau, bevor „Zufall" aufgelöst wurde – die Oberfläche baut
       daraus „Nochmal spielen" am Spielende. Liegt im Spielstand, damit das auch nach
       einem Neuladen noch geht. Die Regeln lesen sie nie; das Tutorial setzt keine. */
    recipe: cfg.recipe || null,
    // Erweiterungen: Ereignisse und Weltwunder werden im Aufbau zugeschaltet
    ev: cfg.events ? { mode: cfg.eventMode === 'easy' ? 'easy' : 'hard' } : null,
    wo: !!cfg.wonders,
    // Alter Techtree (bis v81 der Standard, seit v82 nur im Tutorial): OLD_TECH_COSTS / techBase.
    // Steht immer im Spielstand – auch false –, daran erkennt migrateState neue Spielstände.
    oldTree: !!cfg.oldTree,
    // Marathon (v83): große Zufallskarte, teurere Technologien, gedraftete Fähigkeiten
    marathon: !!cfg.marathon,
    event: null, evNext: null, nukeBan: false,
    wonders: [], wpool: { 1: [], 2: [], 3: [] }, wgone: [],
    players: ordered.map(pc => ({
      civ: pc.civ, kind: pc.kind, diff: pc.diff || 'prinz', name: pc.name || null,
      roman: pc.roman || null, color: pc.color || null, slot: cfg.players.indexOf(pc),
      ability: pc.kind === 'bot' ? 'basis' : (pc.ability || 'basis'),
      // Marathon (v83): zwei gedraftete Fähigkeiten, Schlüssel „Zivilisation:Fähigkeit"
      drafted: pc.kind !== 'bot' && Array.isArray(pc.drafted) ? pc.drafted.slice() : null,
      // KI (js/ki.js): spielt nach den Regeln für Menschen, nur die Stufe kommt dazu
      kiLevel: pc.kind === 'ki' ? (pc.kiLevel || KI_DEFAULT_LEVEL) : null,
      power: 0, techs: {}, avail: {}, res: { sci: 0, food: 0, coins: 0 },
      copies: 0, nuked: false, dead: false,
    })),
  };
  log(S, 'head', 'Neues Spiel — ' + (S.duel ? '1 gegen 1: ' : '') +
    S.players.map(p => civOf(p).n + kindTag(p)).join(', ') +
    ` · ${S.map.name}` +
    (S.ev ? ` · Ereignisse (${S.ev.mode === 'easy' ? 'leicht' : 'hart'})` : '') + (S.wo ? T(' · Weltwunder') : '') +
    (S.marathon ? T(' · Marathon') : ''));
  // Marathon: wer welche Fähigkeiten gedraftet hat, steht gleich im Protokoll
  if (S.marathon) S.players.forEach(p => {
    if (abilitiesOf(p).length) log(S, 'info', T('%s: Fähigkeiten %s.', civOf(p).n, abilInfos(p).map(a => a.n).join(' + ')));
  });

  /* Aufbau 3: Starttechnologien der Antike auswürfeln. Im Plättchenmodus ist das schon
     VOR der Legephase geschehen (rollSetup) – dann wird das Ergebnis übernommen, sonst
     stünde in der Partie etwas anderes, als beim Legen zu sehen war. `cfg.avail` liegt
     nach PLATZ (Reihenfolge des Aufbaus), nicht nach Zugfolge. */
  S.players.forEach((p, i) => {
    const vorab = cfg.avail && cfg.avail[p.slot];
    if (vorab) {
      p.avail = Object.assign({}, vorab);
      log(S, 'info', T('%s: verfügbar (vor dem Legen ausgewürfelt):', civOf(p).n) + ' ' +
        (TECHS.filter(t => p.avail[t.k]).map(t => t.n).join(', ') || '—'));
    } else {
      for (let f = 0; f < 4; f++) rollAvailability(S, i, f, 0);
    }
  });
  // Aufbau 5: Hauptstädte setzen
  S.players.forEach((p, i) => {
    const pos = capitalSpot(S.map, p);
    if (!pos) return;
    // Russland "Siedlertrecks": auch die Hauptstadt startet mit 2 Bevölkerung
    const startPop = isAbil(p, 'siedler') ? 2 : 1;
    S.cities.push({ id: S.nextId++, owner: i, r: pos[0], c: pos[1], pop: startPop, cap: true, grown: 0, born: 0 });
    // Wikinger: kostenlose Armee am Start. Sie erscheint IN der Hauptstadt, genau wie
    // eine gebaute – und muss sie im ersten Zug verlassen (born = aktuelle Runde).
    if (hasAbil(p, 'wikinger', 'basis'))
      S.armies.push({ id: S.nextId++, owner: i, r: pos[0], c: pos[1], mp: 0, born: S.round });
  });
  if (S.wo) initWonderPools(S, cfg.wpool);
  S.startIdx = startIdx;      // Rundenwechsel und Ereignis hängen am Startspieler
  S.cur = startIdx;
  startRound(S);          // Ereignis der ersten Runde
  beginTurn(S);
  return S;
}

/* ------------------------------------------------------------ Technologien */
function techCost(S, pi, tech) {
  const p = S.players[pi];
  let c = techBase(S, tech);          // Grundkosten dieser Partie (im Tutorial der alte Techtree)
  const age = tech.k === 'singularitaet' ? 4 : tech.age;
  if (tech.k === 'singularitaet' && kremlBuilt(S)) c += KREML_SURCHARGE;
  const f = discountFactor(S);                                   // Marathon: doppelt (v85)
  if (hasAbil(p, 'griechenland', 'basis')) c -= f * (age + 1);   // 1/2/3/4/5 je Zeitalter
  if (has(p, 'wiss_methode')) c -= f * 2 * (age + 1);            // -2/-4/-6/-8/-10
  return Math.max(0, c);
}
const discountFactor = S => S && S.marathon ? MARATHON_DISCOUNT_FACTOR : 1;
// Freie Forschung (Griechenland): bis Industrialisierung, im Marathon bis Mittelalter (v85)
const freeTechMaxAge = S => S && S.marathon ? MARATHON_FREE_TECH_AGE : 2;
// Griechenland hat keinen Würfelbonus mehr – nur Philosophie gibt +1.
function availBonus(p) { return has(p, 'philosophie') ? 1 : 0; }
function rollAvailability(S, pi, field, age) {
  const p = S.players[pi];
  if (age > 3) return;
  const list = techsIn(field, age, S);
  if (!list.length) return;
  const bonus = availBonus(p);
  let any = false;
  for (const t of list) {
    if (p.avail[t.k] || p.techs[t.k]) { any = true; continue; }
    const v = d6(S, T('Verfügbarkeit %s%s', t.n, bonus ? ' (+' + bonus + ')' : '')) + bonus;
    if (v >= 4) { p.avail[t.k] = true; any = true; }
  }
  if (!any) {   // "Falls danach keine Technologie verfügbar ist, eine auswürfeln die verfügbar ist"
    let idx = 0;
    do { idx = d6(S, T('keine verfügbar → eine auswürfeln (1–%s)', list.length)); } while (idx > list.length);
    p.avail[list[idx - 1].k] = true;
  }
  log(S, 'info', T('%s: verfügbar in %s (%s):', civOf(p).n, FIELDS[field], AGES[age]) +
    (list.filter(t => p.avail[t.k]).map(t => t.n).join(', ') || '—'));
}
/* Aufbau 3 und die Wunderstapel VORZIEHEN (v66).
   Was am Anfang verfügbar ist, hängt allein an den Würfeln, nicht an der Karte. Im
   Plättchenmodus wird deshalb zuerst gewürfelt und erst danach gelegt: wer weiß, was er
   erforschen könnte und welche Wunder im Stapel liegen, wählt seine Hauptstadt anders.
   Gewürfelt wird in einer Wegwerf-Partie auf der Standardkarte – die echte Karte gibt es
   ja noch nicht, und für diese Würfe spielt sie keine Rolle. Das Ergebnis geht als
   cfg.avail / cfg.wpool in die echte Partie, damit dort nicht neu gewürfelt wird.
   Zurück kommt es NACH PLATZ, in der Reihenfolge von cfg.players. */
/* Spielstände von vor v82 (gespeichert oder als Datei geladen). Bis v81 stand dort
   S.altTree: true für den Techtree, der heute Standard ist, false oder gar nichts (vor v70)
   für den alten. Eine laufende Partie behält ihren Techtree – mitten im Spiel die Kosten
   und Leitern zu tauschen, wäre unfair. Neue Spielstände tragen S.oldTree immer (auch
   false), deshalb ändert ein zweiter Aufruf nichts. */
function migrateState(S) {
  if (!S) return S;
  if (S.oldTree === undefined) S.oldTree = !S.altTree;
  delete S.altTree;
  delete S.roundPop; delete S.roundPops;   // Stand zu Rundenbeginn (v83/v84), seit v85 ungenutzt
  return S;
}
function rollSetup(cfg) {
  const probe = newGame(Object.assign({}, cfg, { map: cfg.map || DEFAULT_MAP }));
  const avail = [];
  probe.players.forEach(p => { avail[p.slot] = Object.assign({}, p.avail); });
  return { avail, wpool: probe.wo ? JSON.parse(JSON.stringify(probe.wpool)) : null };
}
function singularityReady(p) {
  return FIELDS.every((_, f) => TECHS.some(t => t.f === f && t.age === 3 && p.techs[t.k]));
}
function researchable(S, pi) {
  const p = S.players[pi], out = [];
  for (const t of techPool(S)) if (p.avail[t.k] && !p.techs[t.k]) out.push(t);
  if (singularityReady(p) && !p.techs.singularitaet) out.push(SINGULARITY);
  return out;
}
function doResearch(S, pi, tk) {
  const p = S.players[pi];
  if (evActive(S, pi, 'dunkles_zeitalter')) return T('Dunkles Zeitalter: Diese Runde kann nicht geforscht werden.');
  const tech = tk === 'singularitaet' ? SINGULARITY : TECH_BY_KEY[tk];
  if (!tech) return 'Unbekannte Technologie.';
  if (!techActive(S, tech)) return T('Diese Technologie gehört zur Weltwunder-Erweiterung.');
  const cost = techCost(S, pi, tech);
  if (!pay(S, pi, 'sci', cost)) return T('Nicht genug Wissenschaft.');
  applyTech(S, pi, tech, T('%s Wissenschaft', cost));
  return null;
}
/* Technologie eintragen (bezahlt oder gratis) samt Folgewirkungen.
   opts.noBack unterdrückt die Rückschau – nur für die Rückschau-Tech selbst,
   damit keine Kette entsteht. */
function applyTech(S, pi, tech, note, opts) {
  const p = S.players[pi];
  const rangeBefore = moveAllowance(S, pi);
  p.techs[tech.k] = true;
  log(S, 'act', T('%s erforscht %s (%s).', civOf(p).n, tech.n, note));
  // Die Singularität gewinnt das Spiel, egal ob bezahlt oder kostenlos (z. B. Oxford).
  // Gewonnen wird aber erst am Rundenende – siehe claimVictory.
  if (tech.k === 'singularitaet') {
    claimVictory(S, pi, T('Forschungssieg (Singularität)'));
    return;
  }
  // Griechenland "Rückschau": jede erforschte Technologie – auch eine kostenlose aus
  // Bibliothek, Oxford oder Raumfahrt – gibt zusätzlich eine beliebige Technologie eines
  // früheren Zeitalters im selben Feld gratis.
  if (isAbil(p, 'rueckschau') && tech.age > 0 && !(opts && opts.noBack))
    (p.backPicks = p.backPicks || []).push({ age: tech.age - 1, f: tech.f });
  // Reichweitensprung (Luftwaffe/Panzerschiff) sofort wirksam machen: die Erhöhung der
  // Maximalweite wird der Restbewegung der eigenen Armeen dieser Runde gutgeschrieben.
  const gained = moveAllowance(S, pi) - rangeBefore;
  if (gained > 0) for (const a of armiesOf(S, pi)) a.mp += gained;
  // Erste Technologie in Zeitalter+Feld → nächstes Zeitalter auswürfeln
  const sameAgeField = techPool(S).filter(t => t.f === tech.f && t.age === tech.age && p.techs[t.k]);
  if (sameAgeField.length === 1) rollAvailability(S, pi, tech.f, tech.age + 1);
}
/* Kostenlose Forschung: Griechenland-Fähigkeiten und die Wunder Bibliothek/Oxford.
   quelle beschreibt, woher der Anspruch kommt (nur für das Protokoll). */
function grantTech(S, pi, tk, quelle, opts) {
  const p = S.players[pi];
  const tech = tk === 'singularitaet' ? SINGULARITY : TECH_BY_KEY[tk];
  if (!tech) return 'Unbekannte Technologie.';
  if (!techActive(S, tech)) return T('Diese Technologie gehört zur Weltwunder-Erweiterung.');
  if (p.techs[tk]) return T('Schon erforscht.');
  applyTech(S, pi, tech, quelle, opts);
  return null;
}
/* Griechenland "Freie Forschung": 1× pro Runde eine verfügbare Technologie
   der Industrialisierung oder früher (Zeitalter 0–2) umsonst – im Marathon nur bis ins
   Mittelalter (0–1, v85). */
function freeTechOptions(S, pi) {
  const p = S.players[pi];
  if (!isAbil(p, 'gratistech') || p.freeTechUsed === S.round) return [];
  if (evActive(S, pi, 'dunkles_zeitalter')) return [];
  const bis = freeTechMaxAge(S);
  return techPool(S).filter(t => t.age <= bis && p.avail[t.k] && !p.techs[t.k]);
}
function useFreeTech(S, pi, tk) {
  const p = S.players[pi];
  if (!freeTechOptions(S, pi).some(t => t.k === tk)) return T('Nicht möglich.');
  const err = grantTech(S, pi, tk, 'Freie Forschung');
  if (err) return err;
  p.freeTechUsed = S.round;
  return null;
}
/* Griechenland "Rückschau": beliebige Tech eines früheren Zeitalters, auch nicht freigeschaltet. */
/* Offene Rückschau-Ansprüche. Es können mehrere gleichzeitig sein (Oxford gibt zwei
   Technologien, also zwei Ansprüche); sie werden der Reihe nach abgearbeitet.
   Ein Anspruch, für den nichts mehr übrig ist – alle früheren Technologien seines Feldes
   sind schon da –, wird übersprungen (v87, beim Umbau gefunden). Bis v86 blieb er vorn in
   der Schlange stehen, und jede weitere Rückschau desselben Zuges war verloren: Papier
   erforscht mit der ganzen Antike der Forschung, danach Segeln – für Segeln gab es nichts.
   Mit Spielstand liefert backPick den ersten nutzbaren Anspruch, ohne den ersten überhaupt. */
const backPickPool = (S, p, bp) => techPool(S).filter(t => t.f === bp.f && t.age <= bp.age && !p.techs[t.k]);
function backPick(p, S) {
  const list = p.backPicks || [];
  return (S ? list.find(bp => backPickPool(S, p, bp).length) : list[0]) || null;
}
function backPickOptions(S, pi) {
  const p = S.players[pi];
  const bp = backPick(p, S);
  return bp ? backPickPool(S, p, bp) : [];
}
function useBackPick(S, pi, tk) {
  const p = S.players[pi];
  const bp = backPick(p, S);
  if (!bp || !backPickPool(S, p, bp).some(t => t.k === tk)) return T('Nicht möglich.');
  const err = grantTech(S, pi, tk, T('Rückschau'), { noBack: true });   // keine Kette
  if (err) return err;
  p.backPicks.splice(p.backPicks.indexOf(bp), 1);
  return null;
}

/* ------------------------------------------------------------ Einkommen */
function tileYield(S, pi, t) {
  const p = S.players[pi];
  if (TERRAIN[t].block) return [0, 0, 0];              // Vulkan
  if (evTerrainDead(S, pi, t)) return [0, 0, 0];       // Ereignis legt das Gelände lahm
  const y = TERRAIN[t].yield.slice();
  const add = (i, n) => y[i] += n;
  switch (t) {
    case 'G':
      if (has(p, 'papier')) add(0, 1); if (has(p, 'biologie')) add(0, 1);
      if (has(p, 'landwirtschaft')) add(1, 1); if (has(p, 'gruene_revolution')) add(2, 1); break;
    case 'W':
      if (has(p, 'mathematik')) add(0, 1); if (has(p, 'elektrizitaet')) add(0, 1); if (has(p, 'ki')) add(0, 1);
      if (has(p, 'kunstduenger')) add(1, 1);
      if (hasAbil(p, 'russland', 'basis')) add(1, 1); break;
    case 'B':
      if (has(p, 'chemie')) add(0, 1); if (has(p, 'bewaesserung')) add(1, 1); break;
    case 'F':
      if (has(p, 'buchdruck')) add(0, 1); if (has(p, 'muehlentechnik')) add(2, 1); break;
    case 'M':
      if (has(p, 'astronomie')) add(0, 1);
      if (has(p, 'fischerei')) add(1, 1); if (has(p, 'segeln')) add(1, 1);
      if (has(p, 'containerlogistik')) add(2, 1);
      if (hasWonder(S, pi, 'leuchtturm')) { add(0, 1); add(1, 1); add(2, 1); }   // Großer Leuchtturm
      break;
  }
  return y;
}
/* Ertrag eines konkreten Feldes: wie tileYield, aber mit Bürokratie –
   die verdoppelt alles, was die Hauptstadt produziert, also auch ihr Umland. */
// `pre` (v86, Tempo): für viele Felder hintereinander (incomeBreakdown) – Hauptstadt einmal
// gesucht, der Ertrag je Geländeart einmal gerechnet. Ohne `pre` wie bisher.
function tileYieldAt(S, pi, r, c, pre) {
  const p = S.players[pi];
  const t = terrainAt(S, r, c);
  const y = pre ? (pre.y[t] || (pre.y[t] = tileYield(S, pi, t))).slice() : tileYield(S, pi, t);
  if (has(p, 'buerokratie')) {
    const cap = pre ? pre.cap : capitalOf(S, pi);
    if (cap && hexDistance(cap.r, cap.c, r, c) === 1) return y.map(n => n * 2);
  }
  return y;
}
function cityPopYield(S, pi) {
  const p = S.players[pi];
  const y = CITY_YIELD.slice();
  if (has(p, 'schrift')) y[0]++;
  if (has(p, 'universitaet')) y[0]++;
  if (has(p, 'fliessband')) y[2]++;
  if (has(p, 'robotik')) y[2]++;
  return y;
}
/* Kontrollierte Felder: alle an eigene Städte angrenzenden Felder (ohne Stadtfelder),
   plus per Kolonialismus gekaufte Felder. Nicht exklusiv – so steht es in den Regeln.
   „Kein Feld" (X) gehört nie dazu (v73): Plättchenkarten sind in ein Rechteck aus X
   gebettet, und eine Stadt am Kartenrand zog ihre Reichsgrenze sonst um leere Sechsecke
   jenseits der Karte (bzw. um das Loch in der Mitte). Erträge änderte das nie, X bringt
   nichts; auf den festen Karten liegt das Umland jenseits des Rands ohnehin außerhalb
   des Rasters. */
function controlledTiles(S, pi) {
  const set = new Set();
  /* Tempo (v86): die Stadtfelder einmal als Menge statt je Feld cityAt über alle Städte – mit
     vielen gekauften Feldern (im Marathon über 200 bei einem Reich) lief das je
     Einkommensrechnung zehntausendfach. Gleiches Ergebnis, gleiche Reihenfolge. */
  const stadtFeld = new Set(S.cities.map(ct => key(ct.r, ct.c)));
  for (const city of citiesOf(S, pi))
    for (const [r, c] of neighbors(city.r, city.c)) {
      const t = terrainAt(S, r, c);
      if (!t || isOff(t)) continue;
      const k = key(r, c);
      if (stadtFeld.has(k)) continue;
      set.add(k);
    }
  for (const k of (S.bought[pi] || [])) if (!stadtFeld.has(k)) set.add(k);
  return set;
}
/* Grenzt die Stadt an Meer? (Für Englands Alternative "Seemacht".) */
function cityAtSea(S, city) {
  return neighbors(city.r, city.c).some(([r, c]) => terrainAt(S, r, c) === 'M');
}
/* Wikinger "Beutezüge": Am Ende des eigenen Zuges wird für jede gegnerische Stadt und
   für jedes Feld mit gegnerischer Armee, an denen eigene Armeen stehen, gerechnet
   Angriffswert − Verteidigungswert. Positive Differenzen ergeben zusammen den Ertrag, der
   zu Beginn der nächsten Runde als Wissenschaft, Nahrung und Münzen ausgezahlt wird.
   Es sind dieselben Werte wie im Kampf: mehrere angreifende Armeen addieren sich im
   Angriffswert, mehrere verteidigende im Verteidigungswert. Gerechnet wird VOR den
   Belagerungen, der Ertrag entsteht also auch für eine Stadt, die im selben Zug fällt. */
function armyDefenseValue(S, army) {
  const oi = army.owner;
  const rng = projectRange(S, oi);
  let helpers = 0;
  for (const a of armiesOf(S, oi)) if (hexDistance(a.r, a.c, army.r, army.c) <= rng) helpers++;
  return powerOf(S, oi) * (COMBAT.defenseStacks ? helpers : 1);
}
function raidYield(S, pi) {
  const p = S.players[pi];
  const out = { sum: 0, parts: [] };
  if (!isAbil(p, 'kampfertrag')) return out;
  const rng = attackRange(S, pi);
  for (const city of S.cities) {
    if (city.owner === pi) continue;
    const atk = attackersOn(S, pi, city);
    if (!atk.length) continue;
    const diff = attackValue(S, pi, atk.length) - defenseValue(S, city);
    if (diff > 0) { out.sum += diff; out.parts.push(T('Stadt %s/%s: +%s', city.r, city.c, diff)); }
  }
  for (const enemy of S.armies) {
    if (enemy.owner === pi) continue;
    const atk = armiesOf(S, pi).filter(a => hexDistance(a.r, a.c, enemy.r, enemy.c) <= rng);
    if (!atk.length) continue;
    const diff = attackValue(S, pi, atk.length) - armyDefenseValue(S, enemy);
    if (diff > 0) { out.sum += diff; out.parts.push(T('Armee %s/%s: +%s', enemy.r, enemy.c, diff)); }
  }
  return out;
}

/* Aufschlüsselung des Einkommens für die Übersicht: je Geländetyp die Anzahl
   kontrollierter Felder und ihr Gesamtertrag, dazu Sonderzeilen, die Stadtbevölkerung
   und die Summe. Die Summe ist per Definition das Einkommen – income() liest sie hier ab,
   damit Übersicht und Rechnung nicht auseinanderlaufen können. */
function incomeBreakdown(S, pi) {
  const p = S.players[pi];
  const rows = [], extra = [], byTerrain = {};
  const revolution = evActive(S, pi, 'revolution');
  const cap = capitalOf(S, pi);
  // Revolution: die Hauptstadt produziert nichts – auch ihr Umland nicht, sofern das
  // Feld nicht zusätzlich an eine andere eigene Stadt grenzt.
  const deadTile = (r, c) => revolution && cap && hexDistance(cap.r, cap.c, r, c) === 1 &&
    !citiesOf(S, pi).some(ct => !ct.cap && hexDistance(ct.r, ct.c, r, c) === 1);
  const pre = { cap, y: {} };              // tileYieldAt: Hauptstadt und Geländeertrag einmal (v86)
  for (const k of controlledTiles(S, pi)) {
    const [r, c] = unkey(k);
    if (deadTile(r, c)) continue;
    const t = terrainAt(S, r, c);
    const y = tileYieldAt(S, pi, r, c, pre);
    const e = byTerrain[t] || (byTerrain[t] = { count: 0, y: [0, 0, 0] });
    e.count++; e.y[0] += y[0]; e.y[1] += y[1]; e.y[2] += y[2];
  }
  for (const t of Object.keys(TERRAIN)) {
    const e = byTerrain[t];
    if (e && !isOff(t)) rows.push({ key: t, name: TERRAIN[t].name, count: e.count, y: e.y });
  }
  // Bevölkerung als eigene Zeile
  const py = cityPopYield(S, pi);
  /* Bürokratie: die Hauptstadt produziert doppelt – ihre Felder (tileYieldAt), ihre
     Bevölkerung und seit v86 (Anweisung des Autors: „sie gehören eigentlich zur Hauptstadt")
     auch Handelsrouten, Ökologie und der Nahrungsposten der Gentechnik, jeweils ganz. */
  const buro = has(p, 'buerokratie') ? 2 : 1;
  let pop = 0, pyy = [0, 0, 0], sea = 0, ecoPop = 0;
  for (const city of citiesOf(S, pi)) {
    pop += city.pop;
    if (isAbil(p, 'kuestenstaedte') && cityAtSea(S, city)) sea++;
    if (revolution && city.cap) { pyy[1] += py[1] * city.pop; continue; }   // verbraucht nur Nahrung
    ecoPop += city.pop;
    const mult = city.cap ? buro : 1;
    for (let i = 0; i < 3; i++) pyy[i] += py[i] * city.pop * mult;
  }
  /* Ökologie: je zwei Bevölkerung +1 auf alle drei Erträge (v69, vorher nur Nahrung) –
     seit v86 (Anweisung des Autors) über das ganze Reich gezählt und einmal abgerundet,
     vier Städte mit je 1 Bevölkerung bringen also +2 (bis v85 je Stadt abgerundet: 0).
     Steht weiter in der Bevölkerungszeile, der Nahrungsanteil senkt also wie bisher
     popFoodCost. Bürokratie verdoppelt ihn ganz (v86; bis v85 nur den Anteil der
     Hauptstadt). Bei einer Revolution produziert die Hauptstadt nichts – ihre Bevölkerung
     zählt dann nicht mit, wie bis v85 auch. */
  if (has(p, 'oekologie')) {
    const eco = Math.floor(ecoPop / 2) * buro;
    for (let i = 0; i < 3; i++) pyy[i] += eco;
  }
  // Seemacht (v53): +1 je Küstenstadt auf alle drei Erträge, vorher +2
  if (sea) extra.push({
    name: T('Städte am Meer'), glyph: '⚓', count: sea,
    y: [SEA_CITY_BONUS * sea, SEA_CITY_BONUS * sea, SEA_CITY_BONUS * sea],
  });
  // Handelsrouten: Städte, die über Straßen (+1) oder durchgehend Eisenbahn (+2) an
  // der Hauptstadt hängen. Grundregel, gilt also auch für Bots.
  // Mit Bürokratie doppelt (v86). `note` erklärt das in der Übersicht.
  const tr = tradeRoutes(S, pi);
  if (tr.bonus) {
    const b = tr.bonus * buro;
    extra.push({ name: T('Handelsrouten'), glyph: '🛤', count: tr.count, y: [b, b, b],
      note: buro > 1 ? T('Bürokratie ×2') : null });
  }
  // Wallfahrt (Erweiterung): je eigenem Weltwunder +3 auf alle drei Erträge
  if (has(p, 'wallfahrt') && p.kind !== 'bot') {
    const w = wondersOf(S, pi).length;
    if (w) extra.push({ name: T('Wallfahrt'), glyph: '⛪', count: w, y: [3 * w, 3 * w, 3 * w] });
  }
  // Summe, danach die Ereignis- und Wundereffekte auf das Gesamteinkommen
  const total = [0, 0, 0];
  for (const r of rows) for (let i = 0; i < 3; i++) total[i] += r.y[i];
  for (const e of extra) for (let i = 0; i < 3; i++) total[i] += e.y[i];
  for (let i = 0; i < 3; i++) total[i] += pyy[i];
  if (evActive(S, pi, 'hungersnot')) total[1] = 0;        // keine Nahrung produziert
  if (evActive(S, pi, 'wirtschaftskrise')) total[2] = 0;  // keine Münzen produziert
  if (p.doubleIncome === S.round) for (let i = 0; i < 3; i++) total[i] *= 2;   // Taj Mahal
  /* Gentechnik, zweite Wirkung (v64): aus gewonnener Forschung wird Nahrung – je GENE_SCI_PER_FOOD
     Wissenschaft eine Nahrung, abgerundet. Gerechnet wird auf die Wissenschaft, die
     tatsächlich in dieser Runde anfällt, also nach Ereignissen und nach der Verdopplung
     durch den Tadsch Mahal. Bei Hungersnot („keine Nahrung produziert") bleibt auch
     dieser Posten aus – sonst käme mitten in der Hungersnot Nahrung aus dem Labor.
     Die Zeile wird nachträglich in `extra` gehängt und von Hand aufaddiert, weil sie
     auf der fertigen Wissenschaftssumme steht; Übersicht und Summe bleiben so gleich.
     Bürokratie verdoppelt den Posten (v86) – zusätzlich dazu, dass die verdoppelte
     Wissenschaft der Hauptstadt schon in der Summe steht, aus der er gerechnet wird. */
  if (has(p, 'gentechnik') && !evActive(S, pi, 'hungersnot')) {
    const gen = Math.floor(total[0] / GENE_SCI_PER_FOOD) * buro;
    if (gen > 0) {
      extra.push({ name: T('Gentechnik'), glyph: '🧬', y: [0, gen, 0], note: buro > 1 ? T('Bürokratie ×2') : null });
      total[1] += gen;
    }
  }
  // Vorschau, kein Einkommen: was die Armeen bei jetziger Stellung zu Zugende erbeuten
  const preview = [];
  const raid = raidYield(S, pi);
  if (raid.sum) preview.push({ name: T('Beutezüge zu Zugende'), glyph: '⚔︎', y: [raid.sum, raid.sum, raid.sum] });
  if (p.raidPending) preview.push({ name: T('Beute (schon gutgeschrieben)'), glyph: '⚔︎', y: [p.raidPending, p.raidPending, p.raidPending] });
  return { rows, extra, preview, pop: { count: pop, y: pyy }, total };
}
function income(S, pi) {
  const t = incomeBreakdown(S, pi).total;
  return { sci: t[0], food: t[1], coins: t[2] };
}
/* Was eine Stadt auf diesem Feld dem Reich ab der nächsten Runde einbrächte:
   Differenz des Einkommens mit und ohne eine gedachte Stadt der Größe 1.
   Rechnet am echten Spielstand, also inklusive Fähigkeiten, Wundern und Ereignissen,
   und berücksichtigt automatisch, dass sich Umland überlappen kann. Der eine
   Bevölkerungspunkt isst dabei schon mit. Verändert den Spielstand nicht. */
// `before` (v83, Tempo): das Einkommen ohne die neue Stadt, falls schon gerechnet – die KI
// bewertet viele Plätze nacheinander, und es ist für alle dasselbe.
function settleGain(S, pi, r, c, before) {
  before = before || income(S, pi);
  const fake = { id: -999, owner: pi, r, c, pop: 1, cap: false, grown: 0, born: -1 };
  S.cities.push(fake);
  let after;
  try { after = income(S, pi); } finally { S.cities.pop(); }
  return { sci: after.sci - before.sci, food: after.food - before.food, coins: after.coins - before.coins };
}

/* ------------------------------------------------------------ Umrechnungskurse */
/* Umrechnungskurse. Gentechnik und Massenmedien sind ausdrücklich KEIN allgemeiner
   Umtausch – sie decken nur die Bevölkerungskosten (siehe coverPop) und stehen deshalb
   hier nicht. Der Nahrungsposten der Gentechnik ist erst recht kein Kurs: er fällt zu
   Zugbeginn von selbst an (siehe incomeBreakdown).
   opts.foodOk: Bürgerkrieg erlaubt in dieser Runde, Armeen/Macht mit Nahrung zu zahlen. */
function rates(S, pi, opts) {
  const p = S.players[pi];
  const eng = hasAbil(p, 'england', 'basis');
  const hungry = evActive(S, pi, 'hungersnot');
  let coinsToFood = eng || has(p, 'gilden') ? 1 : 2;
  if (hungry) coinsToFood = eng ? 1 : (has(p, 'gilden') ? 2 : 4);
  let foodToCoins = (eng || hasWonder(S, pi, 'pyramiden')) ? 1 : Infinity;
  if (opts && opts.foodOk && foodToCoins === Infinity) foodToCoins = 1;
  const sciToCoins = has(p, 'alchemie') ? 1 : Infinity;
  // Wissenschaft → Nahrung geht nur über die Münzen: mit Alchemie kostet 1 Nahrung also
  // sciToCoins × coinsToFood Wissenschaft (ohne Gilden 2, mit Gilden oder England 1).
  // Gentechnik steht bewusst nicht hier – sie füttert nur und bringt Nahrung im Einkommen.
  const sciToFood = sciToCoins === Infinity ? Infinity : sciToCoins * coinsToFood;
  return { coinsToFood, coinsToSci: has(p, 'computertechnik') ? 1 : 2, sciToCoins, sciToFood, foodToCoins };
}
function available(S, pi, kind, opts) {   // wie viel man höchstens ausgeben kann
  const p = S.players[pi], r = rates(S, pi, opts), R = p.res;
  if (kind === 'food') return R.food + Math.floor(R.coins / r.coinsToFood) + Math.floor(R.sci / r.sciToFood);
  if (kind === 'sci') {
    // Münzen sind die Drehscheibe: eigene Münzen plus die aus Nahrung umwandelbaren
    // (bei England 1:1) können in Wissenschaft getauscht werden.
    const coinsFromFood = r.foodToCoins === Infinity ? 0 : Math.floor(R.food / r.foodToCoins);
    return R.sci + Math.floor((R.coins + coinsFromFood) / r.coinsToSci);
  }
  return R.coins + Math.floor(R.sci / r.sciToCoins) + Math.floor(R.food / r.foodToCoins);
}
function pay(S, pi, kind, amount, opts) {
  if (amount <= 0) return true;
  const p = S.players[pi], r = rates(S, pi, opts), R = p.res;
  if (available(S, pi, kind, opts) < amount) return false;
  let need = amount;
  const take = (from, rate) => {
    if (need <= 0 || rate === Infinity) return;
    const n = Math.min(need, Math.floor(R[from] / rate));
    R[from] -= n * rate; need -= n;
  };
  take(kind, 1);
  if (kind === 'food') { take('coins', r.coinsToFood); take('sci', r.sciToFood); }
  else if (kind === 'sci') {
    take('coins', r.coinsToSci);
    // Rest über Nahrung → Münzen → Wissenschaft (nur wenn beide Kurse existieren)
    if (need > 0 && r.foodToCoins !== Infinity && r.coinsToSci !== Infinity) {
      const perSci = r.coinsToSci * r.foodToCoins;   // Nahrung je Wissenschaft
      const n = Math.min(need, Math.floor(R.food / perSci));
      R.food -= n * perSci; need -= n;
    }
  }
  else { take('sci', r.sciToCoins); take('food', r.foodToCoins); }
  return need <= 0;
}
/* Mehrere Kosten auf einmal – Nahrung UND Münzen zum Beispiel.
   Getrennt geprüft ist falsch: available() rechnet jede Art gegen den VOLLEN Vorrat,
   und weil sich die Arten ineinander umtauschen lassen, greifen beide Prüfungen auf
   dieselben Münzen zu. Mit 2 Münzen galten so „1 Nahrung" (= 2 Münzen) und „1 Münze"
   gleichzeitig als gedeckt, obwohl zusammen 3 Münzen nötig sind.
   payAll zahlt deshalb der Reihe nach und macht bei einem Fehlschlag alles rückgängig;
   affordAll ist dieselbe Rechnung, nur ohne bleibende Wirkung. Prüfung und Bezahlung
   folgen damit demselben Weg – sonst gehen sie wieder auseinander. */
const COST_ORDER = ['food', 'coins', 'sci'];
function payAll(S, pi, cost, opts) {
  const p = S.players[pi], backup = Object.assign({}, p.res);
  for (const k of COST_ORDER) {
    if (!cost[k]) continue;
    if (!pay(S, pi, k, cost[k], opts)) { p.res = backup; return false; }
  }
  return true;
}
function affordAll(S, pi, cost, opts) {
  const p = S.players[pi], backup = Object.assign({}, p.res);
  const ok = payAll(S, pi, cost, opts);
  p.res = backup;
  return ok;
}
/* Was eine Zahlung TATSÄCHLICH kostet (v82, für die Anzeige): payAll auf Probe, danach
   steht alles wieder wie vorher. Zurück kommt, was von jedem Vorrat abginge – Gründen für
   10 Nahrung mit 8 Nahrung im Vorrat: { food: 8, coins: 4, sci: 0 } –, oder null, wenn es
   nicht reicht. Dieselbe Rechnung wie beim Bezahlen, also nie eine andere Antwort. */
function costPaid(S, pi, cost, opts) {
  const p = S.players[pi], backup = Object.assign({}, p.res);
  const ok = payAll(S, pi, cost, opts);
  const out = ok ? { sci: backup.sci - p.res.sci, food: backup.food - p.res.food, coins: backup.coins - p.res.coins } : null;
  p.res = backup;
  return out;
}

/* --------------------------------------------- Nahrungsgrenze und Städte füttern
   Die Nahrungsproduktion darf nicht negativ werden: Wachstum wird blockiert, sobald
   das Einkommen dadurch unter 0 fiele. **Massenmedien** hebt diese Grenze auf – es ist
   seit v64 die einzige Technologie, die füttert.

   Was die Bevölkerung isst, ist dann zu Zugbeginn KEIN fester Abzug mehr, sondern ein
   Posten, den man wahlweise aus Nahrung oder Münzen bestreitet. Gedeckt wird höchstens,
   was die Bevölkerung tatsächlich isst (popFoodCost) – es ist also kein Umtausch,
   sondern eine Verschiebung innerhalb des Rundeneinkommens.

   **Gentechnik kann seit v65 beides** (Anweisung des Autors): sie füttert weiter aus
   Wissenschaft, unverändert im Kurs 1:1, UND bringt zu Zugbeginn Nahrung aus der
   gewonnenen Forschung ins Einkommen (incomeBreakdown). Die beiden Wirkungen stehen
   nebeneinander und rechnen nicht gegeneinander: der Einkommensposten hängt an der
   Wissenschaft, die diese Runde ANFÄLLT, das Füttern an der, die noch DA ist. Wer die
   Wissenschaft verfüttert, verkleinert also den Nahrungsposten nicht nachträglich. */
function canFeed(p) { return has(p, 'gentechnik') || has(p, 'massenmedien'); }
/* Was eine Einheit einer Quelle an Bevölkerungskosten deckt: Massenmedien fünf (v64),
   Gentechnik eine. */
const FEED_RATE = { coins: FEED_COIN_RATE, sci: 1 };
function feedSources(S, pi) {
  const p = S.players[pi], out = [];
  if (has(p, 'massenmedien'))
    out.push({ kind: 'coins', n: T('Münzen'), n1: T('Münze'), have: p.res.coins, rate: FEED_RATE.coins });
  if (has(p, 'gentechnik'))
    out.push({ kind: 'sci', n: T('Wissenschaft'), n1: T('Wissenschaft'), have: p.res.sci, rate: FEED_RATE.sci });
  return out;
}
/* Wie viel Nahrung die Bevölkerung diese Runde isst – als positive Zahl.
   Kommt aus der Bevölkerungszeile des Einkommens, enthält also Bürokratie (verdoppelt
   auch den Verbrauch der Hauptstadt) und Ökologie (senkt ihn) genauso wie das Einkommen
   selbst. Wo das Einkommen die Nahrung pauschal kappt (Hungersnot), ist auch hier
   nichts zu decken – sonst liefen Anzeige und Rechnung auseinander. */
function popFoodCost(S, pi) {
  if (evActive(S, pi, 'hungersnot')) return 0;
  const b = incomeBreakdown(S, pi);
  return Math.max(0, -b.pop.y[1]);
}
/* Wie viel von den Bevölkerungskosten noch offen ist – das ist die Obergrenze fürs Decken. */
function popOpen(p) { return Math.max(0, (p.popFood || 0) - (p.popCovered || 0)); }
/* Spielstände aus älteren Fassungen kennen foodRaw/popFood nicht, und beim allerersten
   Zug eines Spiels lief beginTurn für diesen Spieler noch nicht. Beides hier nachziehen,
   damit die Nahrungsrechnung nicht stumm ausfällt. Der schon vorhandene Nahrungsvorrat
   bleibt unangetastet – nur die fehlenden Kennzahlen werden ergänzt. */
function ensureFoodState(S, pi) {
  const p = S.players[pi];
  if (p.foodRaw == null) p.foodRaw = p.res.food - (p.foodDeficit || 0);
  if (p.foodDeficit == null) p.foodDeficit = Math.max(0, -p.foodRaw);
  if (p.popFood == null) p.popFood = popFoodCost(S, pi);
  if (p.popCovered == null) p.popCovered = 0;
  if (!p.popCoveredBy) p.popCoveredBy = { sci: 0, coins: 0 };
  /* popCoveredBy zählt die gedeckten KOSTEN je Quelle, popSpent die dafür eingesetzten
     EINHEITEN. Bis v63 war beides dasselbe (Kurs 1:1); ein Spielstand von damals bekommt
     die Einheiten deshalb aus der Deckung. */
  if (!p.popSpent) p.popSpent = Object.assign({ sci: 0, coins: 0 }, p.popCoveredBy);
  if (p.popDefPart == null) p.popDefPart = 0;
  return p;
}
/* Setzt `einheiten` der Quelle ein, um Bevölkerungskosten zu decken. Eine Münze deckt
   FEED_COIN_RATE davon (Massenmedien, v64: fünf).
   Obergrenzen: der noch ungedeckte Teil der Kosten und der eigene Vorrat. Mehr Einheiten
   als nötig lassen sich nicht einsetzen; die LETZTE darf dabei teilweise verfallen – bei
   drei offenen Kosten kostet es trotzdem eine ganze Münze. Verschenkt wird dabei nichts,
   was es sonst gäbe: gedeckt wird ohnehin nie mehr, als die Bevölkerung isst.
   Verbucht wird inkrementell, NICHT durch Neuberechnung aus dem Rohsaldo: sonst käme
   Nahrung zurück, die in dieser Runde schon ausgegeben wurde.
   Der Teil, der ein offenes Defizit tilgt, wird nicht zu nutzbarer Nahrung – nur der
   Rest. Sonst entstünde aus dem Decken mehr Nahrung, als die Bevölkerung isst. */
function coverPop(S, pi, kind, einheiten) {
  const p = ensureFoodState(S, pi);
  const quelle = feedSources(S, pi).find(x => x.kind === kind);
  if (!quelle) return kind === 'coins' ? T('Massenmedien nicht erforscht.')
    : kind === 'sci' ? T('Gentechnik nicht erforscht.')
      : T('Diese Quelle ernährt die Bevölkerung nicht.');
  const open = popOpen(p);
  if (open <= 0) return T('Die Bevölkerung ist schon vollständig versorgt.');
  const rate = quelle.rate;
  einheiten = Math.min(Math.floor(einheiten), p.res[kind], Math.ceil(open / rate));
  if (einheiten <= 0) return T('Nichts abzugeben.');
  const deckung = Math.min(einheiten * rate, open);
  const deckt = Math.min(deckung, p.foodDeficit || 0);
  p.res[kind] -= einheiten;
  p.foodDeficit = (p.foodDeficit || 0) - deckt;
  p.res.food += deckung - deckt;
  p.popCovered = (p.popCovered || 0) + deckung;
  p.popCoveredBy[kind] = (p.popCoveredBy[kind] || 0) + deckung;
  p.popSpent[kind] = (p.popSpent[kind] || 0) + einheiten;
  p.popDefPart = (p.popDefPart || 0) + deckt;      // wie viel davon ins Defizit floss
  log(S, 'act', T('%s: %s %s versorgen %s Bevölkerung – Nahrung %s',
    civOf(p).n, einheiten, quelle.n, deckung, p.res.food) +
    (p.foodDeficit ? ' ' + T('(%s offen)', p.foodDeficit) : '') + '.');
  return null;
}
/* Eine Deckung zurücknehmen – der Betrag geht in die ursprüngliche Quelle zurück.
   Nötig, damit die Wahl zu Zugbeginn wirklich eine Wahl ist und nicht ein Einbahnweg.
   Zurückgegeben wird nur, was noch da ist: wurde die so gewonnene Nahrung schon
   ausgegeben, wird abgelehnt. Sonst ließe sich Nahrung ausgeben, die Deckung
   zurücknehmen und die Wissenschaft behalten – das Defizit selbst kostet ja nichts. */
function uncoverPop(S, pi, kind, einheiten) {
  const p = ensureFoodState(S, pi);
  const rate = FEED_RATE[kind] || 1;
  const gesetzt = (p.popSpent && p.popSpent[kind]) || 0;
  einheiten = Math.min(Math.floor(einheiten), gesetzt);
  if (einheiten <= 0) return T('Nichts zurückzunehmen.');
  /* Wie viel Deckung fällt weg? LIFO, und die zuletzt eingesetzte Einheit war die,
     die eventuell nur teilweise zählte: was bleibt, ist höchstens das, was die übrigen
     Einheiten voll tragen können. */
  const deckung = (p.popCoveredBy && p.popCoveredBy[kind]) || 0;
  const bleibt = Math.min((gesetzt - einheiten) * rate, deckung);
  const zurueck = deckung - bleibt;
  // Beim Decken wurde erst das Defizit getilgt, dann Vorrat aufgebaut – also zuerst den
  // Vorrat wieder abbauen, sonst stünden Nahrung und Defizit gleichzeitig da.
  const vorratsAnteil = (p.popCovered || 0) - (p.popDefPart || 0);
  const ausVorrat = Math.min(zurueck, vorratsAnteil);
  const ausDefizit = zurueck - ausVorrat;
  if (ausVorrat > p.res.food) return T('Diese Nahrung ist schon ausgegeben.');
  p.res.food -= ausVorrat;
  p.foodDeficit = (p.foodDeficit || 0) + ausDefizit;
  p.popDefPart = (p.popDefPart || 0) - ausDefizit;
  p.res[kind] += einheiten;
  p.popCovered -= zurueck;
  p.popCoveredBy[kind] = bleibt;
  p.popSpent[kind] = gesetzt - einheiten;
  return null;
}
/* Nahrungseinkommen ohne die Wirkungen des laufenden Ereignisses und ohne den
   Taj-Mahal-Rundenbonus – also der Wert, der auch nach dieser Runde noch gilt.
   Die Nahrungsgrenze muss darauf beruhen: eine Dürre dauert eine Runde, die Stadt
   bleibt aber für immer groß. Sonst verbietet ein Ereignis Wachstum und Siedeln,
   obwohl es dauerhaft gedeckt wäre. */
function baseIncome(S, pi) {
  const wasEv = S.evMuted, p = S.players[pi], wasD = p.doubleIncome;
  S.evMuted = true; p.doubleIncome = null;
  try { return income(S, pi); } finally { S.evMuted = wasEv; p.doubleIncome = wasD; }
}
/* Nahrungseinkommen, wenn die Stadt um delta wachsen würde – auf dem dauerhaften Wert. */
function foodAfterGrowth(S, pi, city, delta) {
  const before = city.pop;
  city.pop += delta;
  const f = baseIncome(S, pi).food;
  city.pop = before;
  return f;
}
function growthBlocked(S, pi, city, delta = 1) {
  if (canFeed(S.players[pi])) return false;      // Gentechnik/Massenmedien heben die Grenze auf
  return foodAfterGrowth(S, pi, city, delta) < 0;
}

/* ------------------------------------------------------------ Zugbeginn */
/* Platz in der Zugfolge (0 = Startspieler) und der Startausgleich daraus: im allerersten Zug
   bekommt der Zweite 1 Münze, der Dritte 2, der Vierte 3 (v85, Anweisung des Autors). Bots
   zahlen nichts, also brauchen sie auch nichts. */
const turnPosition = (S, pi) => {
  const n = S.players.filter(p => p.kind !== 'barbar').length;   // Barbaren hängen hinten an
  return (pi - (S.startIdx || 0) + n) % n;
};
function startBonus(S, pi) {
  const p = S.players[pi];
  if (S.round !== 1 || p.kind === 'bot' || p.kind === 'barbar') return 0;
  return START_BONUS_COINS[turnPosition(S, pi)] || 0;
}
function beginTurn(S) {
  const p = P(S);
  if (p.dead || !citiesOf(S, S.cur).length && !armiesOf(S, S.cur).length) { p.dead = true; return; }
  log(S, 'head', T('Runde %s — %s%s', S.round, civOf(p).n, kindTag(p)));
  // 0 Kultursieg: ein Stufe-3-Wunder gewinnt zu Beginn des nächsten eigenen Zuges
  if (checkCultureVictory(S, S.cur)) return;
  // 1 Einkommen. foodRaw ist der rohe Nahrungssaldo (darf negativ sein); daraus ergeben
  // sich nutzbare Nahrung und Defizit. popFood ist der Teil davon, den die Bevölkerung
  // isst – er lässt sich mit Gentechnik/Massenmedien aus Wissenschaft oder Münzen
  // bestreiten (coverPop), was Nahrung freimacht, ohne mehr zu erzeugen als sie isst.
  // Die Nahrung, die Gentechnik ZUSÄTZLICH aus der Forschung zieht, steckt dagegen schon
  // im Einkommen (incomeBreakdown) und ist ganz normale Nahrung.
  const inc = income(S, S.cur);
  p.res = { sci: inc.sci, food: Math.max(0, inc.food), coins: inc.coins };
  p.foodRaw = inc.food;
  p.foodDeficit = Math.max(0, -inc.food);
  p.popFood = popFoodCost(S, S.cur);      // auch ohne die Techs – für die Übersicht
  p.popCovered = 0;
  p.popCoveredBy = { sci: 0, coins: 0 };
  p.popDefPart = 0;
  if (p.foodDeficit)
    log(S, 'warn', T('Nahrungsdefizit von %s', p.foodDeficit) +
      (canFeed(p) ? T(' – die Bevölkerung kann aus Wissenschaft/Münzen versorgt werden.')
        : T(' – Nahrung bleibt bei 0.')));
  if (p.kind !== 'bot')
    log(S, 'info', T('Einkommen: %s Wissenschaft, %s Nahrung, %s Münzen.', p.res.sci, p.res.food, p.res.coins));
  // Startausgleich (v85): im allerersten Zug Münzen je nach Platz in der Zugfolge
  const ausgleich = startBonus(S, S.cur);
  if (ausgleich) {
    p.res.coins += ausgleich;
    const platz = turnPosition(S, S.cur) + 1;
    log(S, 'act', ausgleich === 1 ? T('Startausgleich: +1 Münze (%s. in der Zugfolge).', platz)
      : T('Startausgleich: +%s Münzen (%s. in der Zugfolge).', ausgleich, platz));
  }
  // 2 Macht reduzieren. Zuschläge aus Armeen/Zeusstatue erhöhen den Verlust,
  // können aber selbst nicht verloren gehen.
  if (p.kind !== 'bot' && powerOf(S, S.cur) > 0) {
    const div = has(p, 'panzer') ? 4 : has(p, 'stahl') ? 3 : 2;
    const loss = Math.min(p.power, Math.ceil(powerOf(S, S.cur) / div));
    p.power -= loss;
    if (loss) log(S, 'info', T('Macht −%s (1/%s, aufgerundet) → %s.', loss, div, powerOf(S, S.cur)));
  }
  // 3 Beute des letzten Zuges auszahlen (Wikinger-Alternative "Beutezüge")
  if (p.raidPending > 0) {
    const n = p.raidPending;
    p.res.sci += n; p.res.food += n; p.res.coins += n;
    log(S, 'act', T('Beutezüge des letzten Zuges: je %s Wissenschaft, Nahrung und Münzen.', n));
  }
  p.raidPending = 0;
  // Zustände zurücksetzen
  S.cities.forEach(c => { if (c.owner === S.cur) { c.grown = 0; c.freeUsed = 0; } });
  S.armies.forEach(a => { if (a.owner === S.cur) { a.mp = moveAllowance(S, S.cur); delete a.halted; } });
  spawnFreeArmies(S, S.cur);           // was letzte Runde nicht gestellt werden konnte
  p.copies = 0; p.nuked = false; p.backPicks = [];
}

/* ------------------------------------------------------------ Bewegung */
function moveAllowance(S, pi) {
  const p = S.players[pi];
  const base = has(p, 'luftwaffe') ? 9 : has(p, 'panzerschiff') ? 6 : 3;
  // Militärlogistik (Erweiterung): jedes eigene Weltwunder gibt +1 Bewegungsweite
  return base + (has(p, 'militaerlogistik') ? wondersOf(S, pi).length : 0);
}
/* Darf das Feld auf dem Weg DURCHQUERT werden? Meer nur mit Navigation, Panzerschiff
   oder Luftwaffe; Kartenlöcher nie.
   Die Luftwaffe überfliegt Vulkane, gegnerische Armeen und gegnerische Städte – sie darf
   dort aber nicht anhalten, das trennt canStop. Eigene Städte und eigene Armeen sperren
   weiter für jeden: Armeen sind nicht stapelbar, und in die eigene Stadt zieht keine
   Armee hinein (dort blockierte sie den Bauplatz). */
function canPass(S, pi, r, c) {
  const p = S.players[pi];
  const t = terrainAt(S, r, c);
  if (!t || isOff(t)) return false;             // außerhalb der Karte
  const flieger = has(p, 'luftwaffe');
  const stadt = cityAt(S, r, c);
  if (stadt && !(flieger && stadt.owner !== pi)) return false;
  const armee = armyAt(S, r, c);
  if (armee && !(flieger && armee.owner !== pi)) return false;
  if (TERRAIN[t].block && !flieger) return false;   // Vulkan
  if (flieger) return true;                         // Gelände ist der Luftwaffe gleich
  if (!TERRAIN[t].land && !(has(p, 'navigation') || has(p, 'panzerschiff'))) return false;
  return true;
}
/* Darf die Armee auf diesem Feld ANHALTEN? Auf Meer nur mit Panzerschiff oder Luftwaffe,
   NICHT mit bloßer Navigation (die erlaubt nur das Durchqueren). Und alles, was allein
   die Luftwaffe passieren lässt – Vulkane, gegnerische Armeen, gegnerische Städte –, ist
   ein Überflug und kein Landeplatz. */
function canStop(S, pi, r, c) {
  if (!canPass(S, pi, r, c)) return false;
  const t = terrainAt(S, r, c);
  if (TERRAIN[t].block) return false;               // Vulkan: nur überfliegen
  if (cityAt(S, r, c)) return false;                // fremde Stadt: nur überfliegen
  if (armyAt(S, r, c)) return false;                // fremde Armee: nur überfliegen
  if (!TERRAIN[t].land && !(has(S.players[pi], 'panzerschiff') || has(S.players[pi], 'luftwaffe')))
    return false;
  return true;
}
/* Kontrollzone (Schießpulver): wer ein Feld neben einer feindlichen Armee betritt, hält an */
/* Kontrollzone (Schießpulver): gegnerische Armeen halten an, sobald sie ein Feld in
   Reichweite einer deiner Armeen betreten – 1 Ring, mit Raketentechnik 2.
   Mit BURGENBAU steht in jeder Stadt eine unbewegliche Armee (ANNAHMEN 1). Sie hält
   genauso Wache wie eine echte: verteidigen und flankieren tat sie schon immer, nur die
   Kontrollzone fehlte hier, weil nur `S.armies` durchsucht wurde. Folge (v68 behoben):
   eine Mauer aus Armee – Burgstadt – Armee hatte an der Stadt ein Loch, und gegnerische
   Armeen schlüpften an ihr in einem Zug vorbei. */
function zocStop(S, pi, r, c) {
  if (has(S.players[pi], 'luftwaffe')) return false;        // Luftwaffe ignoriert Kontrollzonen
  const wache = (oi, wr, wc) => oi !== pi && has(S.players[oi], 'schiesspulver')
    && hexDistance(wr, wc, r, c) <= projectRange(S, oi);   // mit Raketentechnik zwei Ringe
  return S.armies.some(a => wache(a.owner, a.r, a.c))
    || S.cities.some(ct => has(S.players[ct.owner], 'burgenbau') && wache(ct.owner, ct.r, ct.c));
}
/* Ein Stadtfeld zählt selbst als Straße bzw. Eisenbahn, sobald mindestens ein
   angrenzendes Feld die jeweilige Stufe hat – Wege enden also nicht am Stadtrand. */
function effectiveRoad(S, r, c) {
  let lvl = roadLevel(S, r, c);
  if (cityAt(S, r, c))
    for (const [nr, nc] of neighbors(r, c)) lvl = Math.max(lvl, roadLevel(S, nr, nc));
  return lvl;
}
function moveCost(S, r1, c1, r2, c2) {
  const lvl = Math.min(effectiveRoad(S, r1, c1), effectiveRoad(S, r2, c2));
  return lvl >= 2 ? 0 : lvl >= 1 ? 0.5 : 1;
}
/* ------------------------------------------------------------ Handelsrouten
   Jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden Weg aus
   Straßen mit ihr verbunden ist, bringt +1 auf alle drei Erträge; ist der Weg
   durchgehend Eisenbahn, +2.

   Umgesetzt als zwei getrennte Suchen von der Hauptstadt aus – einmal nur über
   Felder mit Eisenbahn, einmal über Felder mit mindestens Straße. Damit ergibt sich
   die Mischungsregel von selbst: eine Stadt, die nur über die zweite Suche erreichbar
   ist, hängt an einer gemischten Strecke und bekommt den kleineren Bonus. Es genügt
   also nicht, dass irgendwo auf dem Weg Eisenbahn liegt – sie muss durchgehend sein.

   Getroffene Auslegungen (die Vorgabe lässt sie offen):
   · Stadtfelder zählen über effectiveRoad mit, wie überall sonst auch – ein Weg endet
     nicht am Stadtrand.
   · Der Weg darf über neutrales Gebiet laufen; nur FREMDE Städte sperren ihn.
   · Erobert jemand die Hauptstadt, brechen alle Routen weg. */
function tradeRoutes(S, pi) {
  const out = { count: 0, bonus: 0, rail: 0, road: 0 };
  const cap = capitalOf(S, pi);
  if (!cap) return out;
  const others = citiesOf(S, pi).filter(c => !c.cap);
  if (!others.length || !Object.keys(S.roads || {}).length) return out;

  /* Tempo (v83, Marathonkarte): Städte einmal in eine Tabelle statt je Feld zweimal die
     ganze Liste durchzugehen (cityAt, effectiveRoad), und die Wegstufe je Feld nur einmal
     ausrechnen – beide Suchen fragen dieselben Felder. Ergebnis wie vorher: `weg` ist
     effectiveRoad, `stadt` liefert wie cityAt die erste Stadt auf dem Feld. */
  const stadt = new Map();
  for (const ct of S.cities) { const k = key(ct.r, ct.c); if (!stadt.has(k)) stadt.set(k, ct); }
  const stufe = new Map();
  const weg = (r, c, k) => {
    let lvl = stufe.get(k);
    if (lvl !== undefined) return lvl;
    lvl = S.roads[k] || 0;
    if (stadt.has(k)) for (const [nr, nc] of neighbors(r, c)) lvl = Math.max(lvl, roadLevel(S, nr, nc));
    stufe.set(k, lvl);
    return lvl;
  };
  const erreichbar = min => {
    const seen = new Set(), stack = [];
    if (weg(cap.r, cap.c, key(cap.r, cap.c)) < min) return seen;
    seen.add(key(cap.r, cap.c)); stack.push([cap.r, cap.c]);
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [nr, nc] of neighbors(r, c)) {
        const k = key(nr, nc);
        if (seen.has(k) || !terrainAt(S, nr, nc)) continue;
        if (weg(nr, nc, k) < min) continue;
        const ct = stadt.get(k);
        if (ct && ct.owner !== pi) continue;          // fremde Stadt sperrt den Weg
        seen.add(k); stack.push([nr, nc]);
      }
    }
    return seen;
  };
  const perBahn = erreichbar(2), perWeg = erreichbar(1);
  for (const city of others) {
    const k = key(city.r, city.c);
    if (perBahn.has(k)) { out.rail++; out.bonus += 2; }
    else if (perWeg.has(k)) { out.road++; out.bonus += 1; }
  }
  out.count = out.rail + out.road;
  return out;
}
function armyReach(S, army) {
  const pi = army.owner;
  const raw = reachable(army.r, army.c, moveBudget(army),
    (r, c) => canPass(S, pi, r, c) ? (zocStop(S, pi, r, c) ? 'stop' : true) : false,
    (r1, c1, r2, c2) => moveCost(S, r1, c1, r2, c2));
  // Felder, auf denen die Armee nicht anhalten darf (Meer ohne Panzerschiff/Luftwaffe),
  // sind zwar durchquerbar, aber keine gültigen Zielfelder.
  const out = new Map();
  for (const [k, v] of raw) {
    const [r, c] = unkey(k);
    if (canStop(S, pi, r, c)) out.set(k, v);
  }
  return out;
}
function moveArmy(S, army, r, c) {
  const reach = armyReach(S, army);
  const k = key(r, c);
  if (!reach.has(k)) return T('Feld nicht erreichbar.');
  const halt = arriveAt(S, army, r, c, reach.get(k));
  log(S, 'act', T('%s: Armee zieht nach %s/%s.', civOf(S.players[army.owner]).n, r, c) +
    (halt ? ' ' + T('Kontrollzone – sie hält für diesen Zug an.') : ''));
  spawnFreeArmies(S, army.owner);      // macht den Platz für die nächste Gratisarmee frei
  return null;
}
/* Eine Armee kommt auf (r, c) an. Wer dabei eine Kontrollzone betritt, hält für den Rest
   des Zuges an (v80): die übrige Bewegung verfällt. Bis v79 endete dort nur der Weg – wer
   die Armee danach noch einmal antippte, zog mit der übrigen Bewegung weiter, auf der
   Eisenbahn (Kosten 0) beliebig oft und damit mitten durch die Kontrollzone (gemeldet vom
   Autor). Wer seinen Zug in einer Kontrollzone BEGINNT, darf heraus – `reachable` nimmt das
   Startfeld aus, und beginTurn gibt die volle Bewegung zurück. Rückgabe: true = angehalten.
   Für Menschen, Bots und KI dieselbe Stelle (moveArmy, botStep/botMoveArmy, kiMove). */
function arriveAt(S, army, r, c, cost) {
  army.mp -= cost || 0;
  army.r = r; army.c = c;
  if (!zocStop(S, army.owner, r, c)) return false;
  army.mp = 0;
  army.halted = true;        // auch die Eisenbahn (Kosten 0) bringt sie nicht weiter
  return true;
}
/* Bewegungsbudget für die Wegsuche: eine angehaltene Armee kommt nirgends mehr hin – auch
   nicht über Eisenbahn, die nichts kostet und sonst mit 0 Bewegung noch befahrbar ist. */
const moveBudget = a => a.halted ? -1 : a.mp;

/* ------------------------------------------------------------ Aktionen */
/* Wie oft eine Stadt pro Runde wachsen darf und wie oft davon kostenlos:
   Keramik = 2× bezahlt, Verbundwerkstoffe = +1× gratis, beide zusammen bis 3×. */
function growLimits(S, pi) {
  const p = S.players[pi];
  const paid = has(p, 'keramik') ? 2 : 1;      // bezahlte Schritte je Runde
  const free = has(p, 'verbundwerkstoffe') ? 1 : 0;   // zusätzlich, und nur kostenlos
  return { max: paid + free, paid, free };
}
// Wie viele bezahlte Schritte hat die Stadt diese Runde schon genutzt?
function paidGrowthUsed(city) { return (city.grown || 0) - (city.freeUsed || 0); }
/* Steht der Stadt noch ein BEZAHLTES Wachstum zu? Das Kontingent aus Verbundwerkstoffen
   ist ausdrücklich nur für kostenloses Wachstum – es lässt sich nicht in einen zweiten
   bezahlten Schritt umwandeln. */
function paidGrowthAvailable(S, pi, city) {
  const lim = growLimits(S, pi);
  return (city.grown || 0) < lim.max && paidGrowthUsed(city) < lim.paid;
}
/* Preis für bezahltes Wachstum. Russland "Fruchtbarkeit": keine Nahrungskosten. */
/* Wachstumskosten: je Bevölkerung 1 Nahrung und 1 Münze.
   Russlands „Fruchtbarkeit" streicht die Nahrung, die Dampfmaschine die Münzen.
   Englands „Kolonisten" (v53) zahlt dagegen **doppelt** – die Fähigkeit macht das
   Gründen fast umsonst, also kostet das Wachsen in diesen Städten mehr. */
const GROW_ABIL_FACTOR = { gruenden: 2 };
function growPrice(S, pi, city) {
  const p = S.players[pi];
  const f = abilitiesOf(p).reduce((m, a) => Math.max(m, GROW_ABIL_FACTOR[a.slice(a.indexOf(':') + 1)] || 1), 1);
  return {
    food: isAbil(p, 'wachstum') ? 0 : city.pop * f,
    coins: has(p, 'dampfmaschine') ? 0 : city.pop * f,
  };
}
// Das kostenlose Kontingent ist NICHT an die Reihenfolge gebunden: es zählt, wie viele
// Gratis-Schritte diese Runde schon genutzt wurden (city.freeUsed), unabhängig davon,
// ob vorher bezahlt gewachsen wurde.
function growCost(S, pi, city) {
  if (freeGrowthAvailable(S, pi, city)) return { food: 0, coins: 0, free: true };
  return growPrice(S, pi, city);
}
// Steht der Stadt diese Runde noch ein kostenloses Wachstum zu? (Verbundwerkstoffe)
function freeGrowthAvailable(S, pi, city) {
  if (city.owner !== pi || city.born === S.round) return false;
  const lim = growLimits(S, pi);
  if (lim.free <= 0) return false;
  if ((city.grown || 0) >= lim.max) return false;          // Gesamtmaximum erreicht
  return (city.freeUsed || 0) < lim.free;                  // Gratis-Kontingent noch offen
}
/* Gründe, die jedes Wachstum dieser Stadt verhindern (Ereignis, Nahrungsgrenze). */
function growBlockReason(S, pi, city) {
  if (city.noGrow === S.round) return T('Sturmflut: Diese Stadt kann diese Runde nicht wachsen.');
  if (growthBlocked(S, pi, city))
    return T('Nahrungsproduktion würde negativ – Gentechnik oder Massenmedien nötig.');
  return null;
}
function canGrow(S, pi, city) {
  if (city.owner !== pi) return T('Fremde Stadt.');
  if (city.born === S.round) return T('Neue Städte wachsen erst nächste Runde.');
  const lim = growLimits(S, pi);
  if ((city.grown || 0) >= lim.max) return T('Diese Runde schon gewachsen.');
  // Ist nur noch das Gratis-Kontingent offen, geht auch nur kostenloses Wachstum.
  if (!freeGrowthAvailable(S, pi, city) && !paidGrowthAvailable(S, pi, city))
    return T('Diese Runde schon gewachsen.');
  const blocked = growBlockReason(S, pi, city); if (blocked) return blocked;
  const c = growCost(S, pi, city);
  // Zusammen prüfen, nicht getrennt: sonst zählen dieselben Münzen doppelt.
  if (!affordAll(S, pi, c)) return c.food && c.coins ? T('Zu wenig Nahrung und Münzen.')
    : c.food ? T('Zu wenig Nahrung.') : T('Zu wenig Münzen.');
  return null;
}
// Kann die Stadt kostenpflichtig wachsen? (unabhängig vom Gratis-Kontingent)
function canGrowPaid(S, pi, city) {
  if (city.owner !== pi) return T('Fremde Stadt.');
  if (city.born === S.round) return T('Neue Städte wachsen erst nächste Runde.');
  if (!paidGrowthAvailable(S, pi, city))
    return freeGrowthAvailable(S, pi, city)
      ? T('Diese Runde nur noch kostenloses Wachstum.')
      : T('Diese Runde schon gewachsen.');
  const blocked = growBlockReason(S, pi, city); if (blocked) return blocked;
  const cost = growPrice(S, pi, city);
  if (!affordAll(S, pi, cost)) return cost.food && cost.coins ? T('Zu wenig Nahrung und Münzen.')
    : cost.food ? T('Zu wenig Nahrung.') : T('Zu wenig Münzen.');
  return null;
}
/* mode: 'free' erzwingt kostenloses Wachstum (nur wenn Kontingent offen),
   'paid' erzwingt bezahltes Wachstum, sonst automatisch (gratis zuerst). */
function growCity(S, pi, city, mode) {
  if (mode === 'free') {
    if (!freeGrowthAvailable(S, pi, city)) return T('Kein kostenloses Wachstum verfügbar.');
    const blocked = growBlockReason(S, pi, city); if (blocked) return blocked;
    city.pop++; city.grown = (city.grown || 0) + 1; city.freeUsed = (city.freeUsed || 0) + 1;
    log(S, 'act', T('%s: Stadt wächst kostenlos auf %s.', civOf(S.players[pi]).n, city.pop));
    return null;
  }
  if (mode === 'paid') {
    const err = canGrowPaid(S, pi, city); if (err) return err;
    const cost = growPrice(S, pi, city);
    if (!payAll(S, pi, cost)) return 'Zu wenig Mittel.';    // zahlt alles oder nichts
    city.pop++; city.grown = (city.grown || 0) + 1;   // freeUsed bleibt: bezahltes Wachstum verbraucht das Gratis-Kontingent nicht
    log(S, 'act', T('%s: Stadt wächst auf %s (%s Nahrung, %s Münzen).', civOf(S.players[pi]).n, city.pop, cost.food, cost.coins));
    return null;
  }
  const err = canGrow(S, pi, city); if (err) return err;
  const c = growCost(S, pi, city);
  if (!payAll(S, pi, c)) return 'Zu wenig Mittel.';
  city.pop++; city.grown = (city.grown || 0) + 1;
  if (c.free) city.freeUsed = (city.freeUsed || 0) + 1;
  log(S, 'act', T('%s: Stadt wächst auf %s', civOf(S.players[pi]).n, city.pop) +
    (c.free ? ' (kostenlos).' : T('(%s Nahrung, %s Münzen).', c.food, c.coins)));
  return null;
}
/* Kostenloses Sofortwachstum aus Wundereffekten. Zählt nicht gegen das Rundenkontingent,
   respektiert aber die Nahrungsgrenze hart: es wird nur so weit gewachsen, wie möglich. */
function growFree(S, pi, city, n, why) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    if (city.noGrow === S.round) break;
    if (growthBlocked(S, pi, city)) break;
    city.pop++; done++;
  }
  if (done) log(S, 'act', T('%s: Stadt wächst kostenlos um %s auf %s (%s).', civOf(S.players[pi]).n, done, city.pop, why));
  else log(S, 'info', T('%s: kostenloses Wachstum (%s) nicht möglich – Nahrungsgrenze.', civOf(S.players[pi]).n, why));
  return done;
}
/* ------------------------------------------------ Sammelaktionen (v87, Wunsch des Autors)
   Abkürzungen der Oberfläche („Fähigkeiten"): dieselbe Aktion in allen eigenen Städten, eine
   nach der anderen über die Regel der einzelnen Stadt (growCity, sacrifice). Eine eigene
   Regel gibt es dafür nicht – und die KI braucht keinen Kandidaten, sie erwägt jede Stadt
   ohnehin einzeln.
   Gewachsen wird von der kleinsten Stadt an (bei gleicher Größe in der Reihenfolge der
   Städte): Wachstum kostet je Bevölkerung, so wachsen bei knappen Mitteln die meisten. Was
   an einer Stadt scheitert (schon gewachsen, neu, Sturmflut, Nahrungsgrenze, zu wenig
   Mittel), wird übersprungen; die übrigen wachsen trotzdem. `mode`: 'free' (Verbundwerkstoffe)
   oder 'paid'. */
function growAllOrder(S, pi) {
  return citiesOf(S, pi).map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.pop - b.c.pop || a.i - b.i).map(x => x.c);
}
// done/of: gewachsene von allen eigenen Städten · why: Gründe der übrigen · price: Summe der
// Wachstumspreise der gewachsenen (bezahlt; der Preis ohne Umtausch, wie am Stadtknopf)
function growAll(S, pi, mode) {
  const out = { done: 0, of: 0, why: [], price: { food: 0, coins: 0 } };
  for (const city of growAllOrder(S, pi)) {
    out.of++;
    const pc = mode === 'paid' ? growPrice(S, pi, city) : null;
    const e = growCity(S, pi, city, mode);
    if (e) { out.why.push(e); continue; }
    out.done++;
    if (pc) { out.price.food += pc.food; out.price.coins += pc.coins; }
  }
  return out;
}
/* Was growAll täte – ausgeführt auf einer Wegwerfkopie, also dieselbe Rechnung und nie eine
   andere Antwort. Nachrechnen ginge nur mit den Regeln noch einmal: welche Städte wachsen,
   hängt an Vorrat und Nahrungsgrenze nach jedem einzelnen Schritt. (Wachsen alle, ist das
   Bezahlte genau, was costPaid für die Summe sagt – gemessen an 2847 zufälligen Ständen
   mit England, Alchemie, Gilden, Computertechnik, Fruchtbarkeit und Dampfmaschine.)
   Dazu `paid`: was tatsächlich von jedem Vorrat abginge. Ändert nichts am Spielstand. Die
   Kopie kommt ohne Protokoll aus – Wachsen würfelt nicht. */
function stateCopy(S) {
  const flach = {};
  for (const k in S) flach[k] = k === 'log' ? [] : S[k];
  return JSON.parse(JSON.stringify(flach));
}
function growAllPlan(S, pi, mode) {
  const C = stateCopy(S), vor = S.players[pi].res;
  const out = growAll(C, pi, mode), nach = C.players[pi].res;
  out.paid = { sci: vor.sci - nach.sci, food: vor.food - nach.food, coins: vor.coins - nach.coins };
  return out;
}
/* Der häufigste Grund, aus dem eine Sammelaktion Städte ausgelassen hat (für den Knopf). */
function commonReason(why) {
  const n = {};
  (why || []).forEach(w => { n[w] = (n[w] || 0) + 1; });
  return (why || []).reduce((best, w) => (best == null || n[w] > n[best] ? w : best), null);
}
/* Gegnerisches Territorium: alle beherrschten Felder ANDERER, noch lebender Reiche –
   Stadtumland und per Kolonialismus gekaufte Felder, so wie controlledTiles es überall
   im Spiel versteht (Stadtfelder selbst gehören dort nicht dazu, die prüft
   foundPassable eigens). Ein Feld, das auch im eigenen Gebiet liegt, sperrt nicht:
   das eigene Herrschaftsrecht gilt vor dem fremden.
   Wird EINMAL je Wegsuche berechnet und mitgegeben – je Feld wäre es zu teuer. */
function foreignTerritory(S, pi) {
  const fremd = new Set();
  S.players.forEach((_, i) => {
    if (i === pi || S.players[i].dead) return;
    controlledTiles(S, i).forEach(k => fremd.add(k));
  });
  controlledTiles(S, pi).forEach(k => fremd.delete(k));
  return fremd;
}
/* Darf der Siedlerweg über dieses Feld laufen?
   Land immer; Meer nur mit Navigation, Panzerschiff oder Luftwaffe; Kartenlöcher nie.
   Gesperrt sind Vulkane, Felder mit gegnerischen Armeen, gegnerische Städte und
   gegnerisches Territorium (Regelheft: „Von gegnerischen Armeen besetzte Felder und
   gegnerische Territorien … zählen als unpassierbar").
   Die Luftwaffe überfliegt all das – für den Siedler ist ein Überflug ein Weg, anders
   als bei der Armee gibt es hier kein „anhalten".

   `opts.fremd` ist das vorberechnete gegnerische Gebiet; fehlt es, wird es hier
   ermittelt (reicht für Einzelabfragen, für eine Wegsuche wäre es zu teuer).
   `opts.frei` lässt eine Sorte Hindernis versuchsweise durch ('wasser' oder 'gebiet') –
   damit findet foundBlockReason heraus, woran ein Weg scheitert, ohne die Regel ein
   zweites Mal aufzuschreiben. */
function foundPassable(S, pi, r, c, opts) {
  const p = S.players[pi];
  const frei = (opts || {}).frei;
  const t = terrainAt(S, r, c);
  if (!t || isOff(t)) return false;                 // außerhalb der Karte
  if (has(p, 'luftwaffe')) return true;             // fliegt über Gelände, Armeen und Grenzen
  if (!TERRAIN[t].land && frei !== 'wasser'
    && !(has(p, 'navigation') || has(p, 'panzerschiff'))) return false;
  if (TERRAIN[t].block) return false;               // Vulkan
  const a = armyAt(S, r, c);
  if (a && a.owner !== pi) return false;
  const stadt = cityAt(S, r, c);
  if (stadt && stadt.owner !== pi) return false;
  if (frei !== 'gebiet') {
    const fremd = (opts || {}).fremd || foreignTerritory(S, pi);
    if (fremd.has(key(r, c))) return false;
  }
  return true;
}
/* Distanz zur Hauptstadt in passierbaren Feldern, oder null, wenn es keinen Weg gibt.
   Kolonien (v84, Anweisung des Autors): ein per Kolonialismus gekauftes Feld ist auch ohne
   Siedlerweg erreichbar – übers Meer, über fremdes Gebiet oder sonst Gesperrtes hinweg –,
   gemessen wie mit der Luftwaffe: die Luftlinie. Gibt es einen Weg, gilt weiter der Weg. */
function foundDistance(S, pi, r, c) {
  const cap = capitalOf(S, pi) || citiesOf(S, pi)[0];
  if (!cap) return 0;
  const tab = foundTable(S, pi, cap, '');
  let d;
  if (tab) d = tableSteps(tab, cap, r, c);
  else {
    const fremd = foreignTerritory(S, pi);
    d = pathSteps(cap.r, cap.c, r, c, (rr, cc) => foundPassable(S, pi, rr, cc, { fremd }));
  }
  if (d == null && isColony(S, pi, r, c)) d = hexDistance(cap.r, cap.c, r, c);
  return d;
}
const isColony = (S, pi, r, c) => (S.bought[pi] || []).includes(key(r, c));
/* Wegtabelle für den Gründungsmodus (v75). Die Oberfläche fragt dort JEDES Feld der
   Karte ab – je Feld zwei bis vier Wegsuchen von der Hauptstadt, auf der großen Karte gut
   50 ms je Zeichnen. Innerhalb von withFoundTable rechnet eine einzige Breitensuche je
   Hindernisart die Tiefen aller erreichbaren Felder vor; foundDistance und
   foundBlockReason lesen daraus. Die Regeln bleiben, wo sie sind (foundPassable,
   foundSiteError, foundCost) – test.js vergleicht beide Wege Feld für Feld.
   Die Entfernung zu einem Ziel ist dieselbe wie bei pathSteps: das Ziel selbst muss
   nicht passierbar sein, es genügt ein erreichter Nachbar (Tiefe + 1). */
let FOUND_SCOPE = null;
function withFoundTable(S, pi, fn) {
  const prev = FOUND_SCOPE;
  FOUND_SCOPE = { S, pi, tabs: {} };
  try { return fn(); } finally { FOUND_SCOPE = prev; }
}
function foundTable(S, pi, cap, frei) {
  const sc = FOUND_SCOPE;
  if (!sc || sc.S !== S || sc.pi !== pi) return null;
  if (sc.tabs[frei]) return sc.tabs[frei];
  const fremd = foreignTerritory(S, pi);
  const tiefe = new Map([[key(cap.r, cap.c), 0]]);
  let front = [[cap.r, cap.c]], d = 0;
  while (front.length && d < 200) {                 // dieselbe Grenze wie pathSteps
    d++;
    const next = [];
    for (const [r, c] of front) for (const [nr, nc] of neighbors(r, c)) {
      const k = key(nr, nc);
      if (tiefe.has(k) || !foundPassable(S, pi, nr, nc, { fremd, frei: frei || undefined })) continue;
      tiefe.set(k, d); next.push([nr, nc]);
    }
    front = next;
  }
  return (sc.tabs[frei] = tiefe);
}
function tableSteps(tiefe, cap, r, c) {
  if (cap.r === r && cap.c === c) return 0;
  let best = null;
  for (const [nr, nc] of neighbors(r, c)) {
    const t = tiefe.get(key(nr, nc));
    if (t != null && (best == null || t + 1 < best)) best = t + 1;
  }
  return best;
}
/* Warum gibt es keinen Weg? Nur für die Meldung, und die soll stimmen: „dafür fehlt
   Navigation" ist falsch, wenn ein Vulkan im Weg liegt, und „das Gelände sperrt" ist
   falsch, wenn es die Grenze des Nachbarn ist. Ermittelt wird das, indem die Wegsuche je
   einmal mit einer erlassenen Hindernissorte wiederholt wird: hilft das Erlassen, lag es
   daran. Läuft nur, wenn schon feststeht, dass es keinen Weg gibt – also selten. */
function foundBlockReason(S, pi, r, c) {
  const cap = capitalOf(S, pi) || citiesOf(S, pi)[0];
  if (!cap) return 'gelaende';
  const fremd = foreignTerritory(S, pi);
  const gehtOhne = frei => {
    const tab = foundTable(S, pi, cap, frei);          // im Gründungsmodus vorgerechnet
    if (tab) return tableSteps(tab, cap, r, c) != null;
    return pathSteps(cap.r, cap.c, r, c, (rr, cc) => foundPassable(S, pi, rr, cc, { fremd, frei })) != null;
  };
  if (gehtOhne('wasser')) return 'wasser';
  if (gehtOhne('gebiet')) return 'gebiet';
  return 'gelaende';
}
/* Eine Stadt kostet Stadtkosten + Distanzkosten. Zwei Vergünstigungen greifen daran an:
   Englands „Kolonisten" streicht die Stadtkosten, Kartografie die Distanzkosten. Hat man
   beides, wird nicht etwa alles frei (und auch keine Pauschale von 1 fällig) – man zahlt
   die günstigere der beiden Kosten. Am Anfang ist das die Stadtkosten (1 für die zweite
   Stadt), später der Weg; ab der vierten Stadt wird es damit wieder spürbar teurer, statt
   dauerhaft bei 1 zu bleiben. */
function foundCost(S, pi, r, c) {
  const p = S.players[pi];
  const n = citiesOf(S, pi).length;
  const stadt = n * (n + 1) / 2;                     // 1/3/6/10/15 …
  const ohneStadt = isAbil(p, 'gruenden');           // England: Kolonisten
  const ohneWeg = has(p, 'kartografie');
  // Kein Weg = nicht gründbar. Früher wurde hier auf die Luftlinie ausgewichen, wodurch
  // man ohne Navigation auf Inseln siedeln konnte. Mit Kartografie zählt der Weg zwar
  // nicht für die Kosten, es muss ihn aber trotzdem geben (siehe canFound).
  const dist = foundDistance(S, pi, r, c);
  if (dist == null) return ohneWeg ? Math.max(1, stadt) : Infinity;
  if (ohneStadt && ohneWeg) return Math.max(1, Math.min(stadt, dist));
  if (ohneStadt) return Math.max(1, dist);
  if (ohneWeg) return Math.max(1, stadt);
  return Math.max(1, stadt + dist);
}
/* Steht auf einem Nachbarfeld eine fremde Armee? Dort wird nicht gesiedelt. */
function enemyArmyAdjacent(S, pi, r, c) {
  return neighbors(r, c).some(([nr, nc]) => {
    const a = armyAt(S, nr, nc);
    return a && a.owner !== pi;
  });
}
/* Darf hier gegründet werden? In zwei Teilen (v75): foundSiteError prüft den Platz –
   alles außer der Nahrung –, canFound zusätzlich, ob die Nahrung diesen Zug reicht. Der
   Gründungsmodus der Oberfläche braucht die Trennung: ein Platz, der nur an der Nahrung
   scheitert, zeigt seine Kosten (rot), einer, der grundsätzlich nicht geht, wird
   abgeblendet. Die Prüfungen selbst und ihre Reihenfolge sind unverändert. */
function canFound(S, pi, r, c) {
  const err = foundSiteError(S, pi, r, c);
  if (err) return err;
  const cost = foundCost(S, pi, r, c);
  if (available(S, pi, 'food') < cost) return T('Zu wenig Nahrung (%s nötig).', cost);
  return null;
}
function foundSiteError(S, pi, r, c) {
  if (S.marathon && foundedThisTurn(S, pi) >= MARATHON_MAX_FOUNDS)
    return T('Höchstens %s neue Städte je Zug (Marathon).', MARATHON_MAX_FOUNDS);
  const t = terrainAt(S, r, c);
  if (!t || isOff(t)) return T('Kein Feld.');
  if (!TERRAIN[t].land) return T('Nicht auf Meer.');
  if (TERRAIN[t].block) return T('Nicht auf einem Vulkan.');
  if (armyAt(S, r, c)) return T('Feld besetzt.');
  if (enemyArmyAdjacent(S, pi, r, c)) return T('Nicht direkt neben einer gegnerischen Armee.');
  // Es muss einen Weg über passierbare Felder von der Hauptstadt aus geben – auch mit
  // Kartografie, die nur die Distanzkosten erlässt, nicht die Erreichbarkeit.
  if (foundDistance(S, pi, r, c) == null) {
    const grund = foundBlockReason(S, pi, r, c);
    if (grund === 'wasser') return T('Nicht erreichbar – dafür fehlt Navigation oder Panzerschiff.');
    if (grund === 'gebiet') return T('Kein Weg dorthin – gegnerisches Gebiet sperrt ihn.');
    return T('Kein Weg dorthin – Gelände oder gegnerische Armeen sperren ihn.');
  }
  for (const city of S.cities) if (hexDistance(city.r, city.c, r, c) < 3) return T('Mindestens 3 Felder Abstand zu allen Städten.');
  return null;
}
function foundCity(S, pi, r, c) {
  const err = canFound(S, pi, r, c); if (err) return err;
  const cost = foundCost(S, pi, r, c);
  if (!pay(S, pi, 'food', cost)) return T('Zu wenig Nahrung.');
  const pop = isAbil(S.players[pi], 'siedler') ? 2 : 1;   // Russland: Städte mit 2 Bevölkerung
  const city = { id: S.nextId++, owner: pi, r, c, pop, cap: false, grown: 0, born: S.round };
  S.cities.push(city);
  const p = S.players[pi];
  if (p.foundRound !== S.round) { p.foundRound = S.round; p.foundCount = 0; }
  p.foundCount++;
  log(S, 'act', T('%s: Stadt gegründet auf %s/%s (%s Nahrung, Bevölkerung %s).', civOf(S.players[pi]).n, r, c, cost, pop));
  claimOrphanWonders(S, pi, city);      // Wunder, die ohne Stadt auf dem Feld stehen
  return null;
}
function armyCost(S, pi) {
  const p = S.players[pi];
  let n = armiesOf(S, pi).length + 1;
  if (hasAbil(p, 'wikinger', 'basis')) n = Math.max(0, n - 1);   // eine Armee zählt nicht mit
  const mult = has(p, 'nationalismus') ? 2 : has(p, 'demokratie') ? 4 : 5;
  return mult * n;
}
/* Bezahloptionen für Armeen und Macht. Bürgerkrieg erlaubt in dieser Runde, beides
   auch mit Nahrung zu zahlen (siehe rates(): foodToCoins 1:1).
   WICHTIG: Diese Funktion ist die einzige Wahrheit dazu. Die Oberfläche muss sie für
   ihre „kann ich mir das leisten?"-Prüfung genauso benutzen wie die Regelmaschine beim
   Bezahlen – sonst sperrt der Knopf einen Kauf, den die Regel erlauben würde (genau
   dieser Fehler trat im Bürgerkrieg auf). */
function payOpts(S, pi) { return { foodOk: evActive(S, pi, 'buergerkrieg') }; }
/* Kostenlose Armeen (Der Koloss) erscheinen wie gebaute IN DER STADT, DIE DAS WUNDER
   GEBAUT HAT, und müssen sie verlassen. Weil dort nur eine Armee stehen kann, kommt die
   nächste erst, wenn die vorige weggezogen ist – deshalb die Warteschlange p.freeArmies.
   Wo sie warten, steht in p.freeArmyCity (Stadt-Id): die Schlange überdauert Züge, und
   bis sie leer ist, muss der Ort bekannt bleiben.
   Aufgerufen beim Wunderbau, nach jeder Armeebewegung und zu Zugbeginn. */
function freeArmyCity(S, pi) {
  const p = S.players[pi];
  // Fällt die Stadt zwischenzeitlich weg oder wechselt den Besitzer, rücken die Armeen
  // in die Hauptstadt nach – besser dort als gar nicht. Alte Spielstände ohne
  // freeArmyCity landen über denselben Weg ebenfalls in der Hauptstadt.
  const stadt = S.cities.find(c => c.id === p.freeArmyCity && c.owner === pi);
  return stadt || capitalOf(S, pi);
}
function spawnFreeArmies(S, pi) {
  const p = S.players[pi];
  let n = 0;
  while ((p.freeArmies || 0) > 0) {
    const stadt = freeArmyCity(S, pi);
    if (!stadt || armyAt(S, stadt.r, stadt.c)) break;      // besetzt: die nächste wartet
    S.armies.push({ id: S.nextId++, owner: pi, r: stadt.r, c: stadt.c,
      mp: moveAllowance(S, pi), born: S.round });
    p.freeArmies--; n++;
    // Städte haben keine Namen – die Hauptstadt heißt so, jede andere steht bei ihren
    // Koordinaten, genauso wie beim Gründen im Protokoll.
    log(S, 'act', stadt.cap
      ? T('%s: kostenlose Armee in der Hauptstadt – muss sie noch verlassen.', civOf(p).n)
      : T('%s: kostenlose Armee in der Stadt auf %s/%s – muss sie noch verlassen.',
        civOf(p).n, stadt.r, stadt.c));
  }
  if (!p.freeArmies) p.freeArmyCity = null;
  return n;
}
function buildArmy(S, pi, city) {
  if (!city || city.owner !== pi) return T('Nur in eigener Stadt.');
  if (armyAt(S, city.r, city.c)) return T('Dort steht schon eine Armee.');
  const cost = armyCost(S, pi);
  if (!pay(S, pi, 'coins', cost, payOpts(S, pi))) return T('Zu wenig Münzen (%s nötig).', cost);
  S.armies.push({ id: S.nextId++, owner: pi, r: city.r, c: city.c, mp: moveAllowance(S, pi), born: S.round });
  log(S, 'act', T('%s: Armee gebaut (%s Münzen) – muss die Stadt noch verlassen.', civOf(S.players[pi]).n, cost));
  return null;
}
function powerPrice(S, pi) {
  const p = S.players[pi];
  const base = has(p, 'gewehre') ? 3 : has(p, 'eisenverarbeitung') ? 4 : 5;
  return Math.max(1, base - (hasWonder(S, pi, 'himeji') ? 1 : 0));   // Burg Himeji
}
function buyPower(S, pi, n = 1) {
  const price = powerPrice(S, pi) * n;
  if (!pay(S, pi, 'coins', price, payOpts(S, pi))) return T('Zu wenig Münzen.');
  S.players[pi].power += n;
  log(S, 'act', T('%s: +%s Macht für %s Münzen → %s.', civOf(S.players[pi]).n, n, price, S.players[pi].power));
  return null;
}
function roadPrice(S, pi, r, c, target) {
  const cur = roadLevel(S, r, c);
  if (target <= cur) return null;
  return (cur === 0 && target === 2) ? 2 : 1;
}
/* Welche Stufe würde hier als Nächstes gebaut – oder null, wenn nichts geht?
   WICHTIG: Die Oberfläche muss diese Funktion benutzen, statt die Stufe selbst
   herzuleiten. Genau daran scheiterte der Bau mit Eisenbahn ohne Rad: das Blatt
   wählte auf leeren Feldern immer Stufe 1 und zeigte den Knopf nur mit Rad, obwohl
   buildRoad Stufe 2 längst erlaubt hätte. */
function roadTargets(S, pi, r, c) {
  const p = S.players[pi], lvl = roadLevel(S, r, c), out = [];
  if (lvl >= 2) return out;                           // schon fertig ausgebaut
  if (lvl < 1 && has(p, 'rad')) out.push(1);
  if (has(p, 'eisenbahn')) out.push(2);
  return out;
}
/* Die günstigste noch mögliche Stufe – für alles, was nur eine Antwort braucht. */
function roadTarget(S, pi, r, c) {
  const z = roadTargets(S, pi, r, c);
  return z.length ? z[0] : null;
}
function canBuildRoads(p) { return has(p, 'rad') || has(p, 'eisenbahn'); }
function buildRoad(S, pi, r, c, target) {
  const p = S.players[pi];
  if (target === 1 && !has(p, 'rad')) return T('Rad noch nicht erforscht.');
  if (target === 2 && !has(p, 'eisenbahn')) return T('Eisenbahn noch nicht erforscht.');
  const t = terrainAt(S, r, c);
  if (!t || isOff(t)) return T('Kein Feld.');
  if (!TERRAIN[t].land) return T('Nicht auf Meer.');
  // nur eigenes oder neutrales Gebiet
  const k = key(r, c);
  const mine = controlledTiles(S, pi).has(k) || S.cities.some(x => x.owner === pi && x.r === r && x.c === c);
  const foreign = S.players.some((_, i) => i !== pi && controlledTiles(S, i).has(k));
  if (!mine && foreign) return T('Nur in eigenem oder neutralem Gebiet.');
  const price = roadPrice(S, pi, r, c, target);
  if (price == null) return T('Schon vorhanden.');
  if (!pay(S, pi, 'coins', price)) return T('Zu wenig Münzen.');
  S.roads[k] = target;
  log(S, 'act', T('%s: %s auf %s/%s (%s Münzen).', civOf(p).n, target === 2 ? T('Eisenbahn') : T('Straße'), r, c, price));
  return null;
}
function hasModernTech(p) {
  return TECHS.some(t => t.age === 3 && p.techs[t.k]);
}
function slaveryUsable(p) {
  if (!has(p, 'sklaverei')) return false;
  if (SLAVERY_OBSOLETE_IN_MODERN && hasModernTech(p)) return false;
  return true;
}
// Warum hier nicht geopfert werden kann – oder null. Die Prüfung von sacrifice, einzeln
// abfragbar für die Sammelaktion (v87).
function sacrificeError(S, pi, city) {
  const p = S.players[pi];
  if (!has(p, 'sklaverei')) return T('Sklaverei nicht erforscht.');
  if (SLAVERY_OBSOLETE_IN_MODERN && hasModernTech(p))
    return T('Sklaverei ist mit dem Eintritt in die Moderne obsolet.');
  if (!city || city.owner !== pi) return T('Fremde Stadt.');
  if (city.pop < 2) return T('Die letzte Bevölkerung darf nicht geopfert werden.');
  if (city.sacrificed === S.round) return T('Diese Stadt hat diese Runde schon geopfert.');
  return null;
}
function sacrifice(S, pi, city) {           // Sklaverei
  const p = S.players[pi];
  const err = sacrificeError(S, pi, city); if (err) return err;
  city.pop--; city.sacrificed = S.round; p.res.coins += SLAVERY_COINS;
  log(S, 'act', T('%s: Bevölkerung geopfert → +%s Münzen.', civOf(p).n, SLAVERY_COINS));
  return null;
}
/* Sammelaktion (v87): in jeder eigenen Stadt, in der es geht, je eine Bevölkerung opfern.
   Die Städte hängen nicht voneinander ab, die Reihenfolge ist also egal. */
function sacrificeAll(S, pi) {
  const out = { done: 0, of: 0, why: [] };
  for (const city of citiesOf(S, pi)) {
    out.of++;
    const e = sacrifice(S, pi, city);
    if (e) out.why.push(e); else out.done++;
  }
  return out;
}
function buyTile(S, pi, r, c) {             // Kolonialismus
  const p = S.players[pi];
  if (!has(p, 'kolonialismus')) return T('Kolonialismus nicht erforscht.');
  // X ist kein Feld – gekauft würde es über S.bought doch wieder zum Gebiet (v73)
  const t = terrainAt(S, r, c);
  if (!t || isOff(t)) return T('Kein Feld.');
  if (cityAt(S, r, c)) return T('Dort steht eine Stadt.');
  if (S.players.some((_, i) => controlledTiles(S, i).has(key(r, c))))
    return T('Nur herrenlose Felder können gekauft werden.');
  const preis = COLONY_COST;
  if (!pay(S, pi, 'coins', preis)) return T('Zu wenig Münzen.');
  (S.bought[pi] = S.bought[pi] || []).push(key(r, c));
  log(S, 'act', T('%s: Feld %s/%s gekauft (%s Münzen).', civOf(p).n, r, c, preis));
  return null;
}
/* Kopierbare Technologien anderer Reiche. Drei getrennte Wege:
   - Spionage: bezahlt, 1× Wissenschaftskosten in Münzen, kein Rundenlimit
   - Kundschafterei: bezahlt, 2× Kosten in Münzen (SCOUTING_RATE, bis v71 3×), kein
     Rundenlimit
   - Internet: 1× pro Runde kostenlos
   Vergünstigungen (Wiss. Methode etc.) gelten beim Kopieren nicht. Hat ein Reich beide
   bezahlten Wege, gilt der günstigere – Spionage. */
function copyRate(p) {
  if (has(p, 'spionage')) return 1;
  if (has(p, 'kundschafterei')) return SCOUTING_RATE;
  return null;
}
function internetAvailable(S, pi) {
  const p = S.players[pi];
  return has(p, 'internet') && (p.internetUsed !== S.round);
}
function copyableTechs(S, pi) {
  const p = S.players[pi], out = [];
  const rate = copyRate(p);                 // ohne Vergünstigung: Basiskosten der Tech
  const paidPossible = rate != null;
  const freePossible = internetAvailable(S, pi);
  if (!paidPossible && !freePossible) return out;
  const seen = new Set();
  S.players.forEach((o, i) => {
    if (i === pi) return;
    Object.keys(o.techs).forEach(k => {
      if (p.techs[k] || seen.has(k) || k === 'singularitaet') return;
      seen.add(k);
      const t = TECH_BY_KEY[k];
      if (!t) return;
      // Beide Wege sind unabhängig: bezahlt (Spionage/Kundschafterei) UND/ODER
      // die eine Gratiskopie pro Runde (Internet).
      out.push({
        tech: t,
        paidCoins: paidPossible ? rate * techBase(S, t) : null,   // null = kein bezahlter Weg
        freeOk: freePossible,                          // true = Gratiskopie möglich
      });
    });
  });
  return out;
}
function copyTech(S, pi, tk, mode) {
  const p = S.players[pi];
  const opt = copyableTechs(S, pi).find(o => o.tech.k === tk);
  if (!opt) return 'Nicht kopierbar.';
  // Modus wählen: 'free' oder 'paid'. Ohne Angabe: bezahlt bevorzugen, damit die
  // Gratiskopie für später frei bleibt.
  const useMode = mode || (opt.paidCoins != null ? 'paid' : 'free');
  if (useMode === 'free') {
    if (!opt.freeOk || !internetAvailable(S, pi)) return T('Diese Runde schon per Internet kopiert.');
    p.internetUsed = S.round;
    p.techs[tk] = true;
    log(S, 'act', T('%s: %s kopiert (Internet, gratis).', civOf(p).n, opt.tech.n));
  } else {
    if (opt.paidCoins == null) return T('Kein bezahlter Kopierweg erforscht.');
    if (opt.paidCoins && !pay(S, pi, 'coins', opt.paidCoins)) return T('Zu wenig Münzen (%s nötig).', opt.paidCoins);
    p.techs[tk] = true;
    log(S, 'act', T('%s: %s kopiert (%s Münzen).', civOf(p).n, opt.tech.n, opt.paidCoins));
  }
  const same = techPool(S).filter(t => t.f === opt.tech.f && t.age === opt.tech.age && p.techs[t.k]);
  if (same.length === 1) rollAvailability(S, pi, opt.tech.f, opt.tech.age + 1);
  return null;
}
/* Was diesem Reich gerade GRATIS offensteht (v87, Wunsch des Autors: die Zahl an
   „Fähigkeiten"). Je Art einmal, gleich wie oft sie geht – kostenloses Wachstum in fünf
   Städten ist eine Art, zwei offene Rückschau-Ansprüche auch. Gezählt wird nur, was sich
   jetzt auch wirklich nutzen lässt: kostenloses Wachstum, das an der Nahrungsgrenze
   scheitert, oder eine Internet-Kopie ohne etwas zu kopieren zählen nicht. Bezahltes
   (Wachsen, Kopieren, Sklaverei) zählt nie. Die kostenlosen Technologien aus Wundern
   (Bibliothek, Oxford, Raumfahrt) gehören dazu – sie sind dieselbe Art Anspruch wie die
   Freie Forschung. */
function freeActions(S, pi) {
  const out = [];
  if (freeTechOptions(S, pi).length) out.push('forschung');
  if (backPickOptions(S, pi).length) out.push('rueckschau');
  if (freePickOptions(S, pi).length) out.push('wunder');
  if (citiesOf(S, pi).some(c => freeGrowthAvailable(S, pi, c) && !growBlockReason(S, pi, c)))
    out.push('wachstum');
  if (internetAvailable(S, pi) && copyableTechs(S, pi).some(o => o.freeOk)) out.push('internet');
  return out;
}
function nuke(S, pi, r, c) {                // Atomwaffen
  const p = S.players[pi];
  if (!has(p, 'atomwaffen')) return T('Atomwaffen nicht erforscht.');
  if (evNukeBan(S, pi)) return T('Atomwaffenproteste: Atomwaffen können nicht mehr eingesetzt werden.');
  if (p.nuked) return T('Diese Runde schon eingesetzt.');
  const area = [[r, c], ...neighbors(r, c)];
  let n = 0;
  S.armies = S.armies.filter(a => {
    const hit = area.some(([rr, cc]) => rr === a.r && cc === a.c);
    if (hit) n++;
    return !hit;
  });
  p.nuked = true;
  log(S, 'act', T('%s: Atomschlag auf %s/%s – %s Armee(n) zerstört.', civOf(p).n, r, c, n));
  return null;
}

/* ------------------------------------------------------------ Kampf */
/* Reichweite, mit der eine Armee ihren Machtwert projiziert: 1, mit Raketentechnik 2.
   Gilt für Angriff auf Städte, Verteidigung von Städten und Flankieren gleichermaßen. */
function projectRange(S, pi) { return has(S.players[pi], 'raketentechnik') ? 2 : 1; }
function attackRange(S, pi) { return projectRange(S, pi); }
function attackersOn(S, pi, city) {
  const rng = attackRange(S, pi);
  return armiesOf(S, pi).filter(a => hexDistance(a.r, a.c, city.r, city.c) <= rng);
}
function attackValue(S, pi, count) {
  const p = S.players[pi];
  if (count <= 0) return 0;
  let per = powerOf(S, pi);
  if (has(p, 'belagerung')) per += 5;
  if (has(p, 'dynamit')) per *= 2;
  return per * (COMBAT.attackStacks ? count : 1);
}
function defenseValue(S, city) {
  const o = S.players[city.owner], oi = city.owner;
  if (o.kind === 'barbar') return city.pop;      // Barbarenstädte verteidigen nur mit Bevölkerung
  // Die Große Mauer rechnet die Verteidigung mit der Gesamtbevölkerung des Reiches.
  const base = hasWonder(S, oi, 'mauer') ? popOf(S, oi) : city.pop;
  let d = base * (has(o, 'maschinengewehr') ? 3 : 1);
  if (has(o, 'stadtmauern')) d += 5;
  if (has(o, 'burgenbau')) d += powerOf(S, oi);          // virtuelle Armee in der Stadt
  const rng = projectRange(S, oi);
  let helpers = 0;
  for (const a of armiesOf(S, oi))
    if (hexDistance(a.r, a.c, city.r, city.c) <= rng) helpers++;
  if (helpers) d += powerOf(S, oi) * (COMBAT.defenseStacks ? helpers : 1);
  return d;
}
/* Flankieren – die Stellung. Aus combatPhase herausgelöst (v75), damit die Machtansicht
   der Oberfläche dieselbe Regel liest wie der Kampf.
   Positionen, von denen aus ein Reich flankiert: seine Armeen und – mit Burgenbau – seine
   Städte (die virtuelle Burgenarmee). Nötig sind zwei davon in Reichweite (1, mit
   Raketentechnik 2), ohne Taktik gegenüberliegend (am Gegner gespiegelt, hexOpposite).
   Ob die Armee dann fällt, entscheidet erst der Machtvergleich in combatPhase.
   v75 behoben: gegenüberliegend wurde in Zeile/Spalte gespiegelt – das trifft im
   versetzten Raster nur Ost–West. Nordwest–Südost und Nordost–Südwest flankierten nicht,
   dafür zwei Felder derselben Seite (gerade Zeile Nordost + Südost, ungerade Nordwest +
   Südwest). */
function flankSpotsOf(S, pi) {
  const spots = armiesOf(S, pi).map(a => [a.r, a.c]);
  if (has(S.players[pi], 'burgenbau')) for (const c of citiesOf(S, pi)) spots.push([c.r, c.c]);
  return spots;
}
function canFlank(S, pi, enemy, spots) {
  const rng = projectRange(S, pi);
  const near = (spots || flankSpotsOf(S, pi)).filter(([r, c]) => {
    const d = hexDistance(r, c, enemy.r, enemy.c);
    return d >= 1 && d <= rng;
  });
  if (near.length < 2) return false;
  if (has(S.players[pi], 'taktik')) return true;
  return near.some(([r1, c1]) => near.some(([r2, c2]) =>
    !(r1 === r2 && c1 === c2) && hexOpposite(enemy.r, enemy.c, r1, c1, r2, c2)));
}
/* Die Machtansicht (v75): was bei geöffnetem Machtblatt als Ring auf Städten und Armeen
   steht. Je Stadt ihr Verteidigungswert und der Angriffswert jedes anderen Reichs, das
   gerade Armeen in Reichweite hat; je Armee der Machtwert ihres Reichs und der jedes
   Reichs, das sie gerade flankieren könnte. Dieselben Funktionen wie im Kampf
   (defenseValue, attackersOn/attackValue, canFlank, powerOf) – eine Momentaufnahme: wer
   am Zug ist, kann noch Macht kaufen oder ziehen. Tote Reiche zählen nicht. */
function powerView(S) {
  const alive = S.players.map((p, i) => i).filter(i => !S.players[i].dead);
  const spots = {};
  alive.forEach(i => { spots[i] = flankSpotsOf(S, i); });
  const cities = S.cities.map(city => ({
    city, def: defenseValue(S, city),
    atk: alive.filter(e => e !== city.owner).map(e => {
      const n = attackersOn(S, e, city).length;
      return n ? { pi: e, v: attackValue(S, e, n) } : null;
    }).filter(Boolean),
  }));
  const armies = S.armies.map(army => ({
    army, pow: powerOf(S, army.owner),
    flank: alive.filter(e => e !== army.owner && canFlank(S, e, army, spots[e]))
      .map(e => ({ pi: e, v: powerOf(S, e) })),
  }));
  return { cities, armies };
}
function combatPhase(S, pi) {
  const p = S.players[pi];
  // Wikinger "Beutezüge": Stand vor den Belagerungen festhalten, Auszahlung nächste Runde
  if (isAbil(p, 'kampfertrag')) {
    const raid = raidYield(S, pi);
    p.raidPending = raid.sum;
    if (raid.sum) log(S, 'act', T('%s: Beutezüge ergeben %s (%s) – gutgeschrieben zu Beginn der nächsten Runde.', civOf(p).n, raid.sum, raid.parts.join(', ')));
  }
  // Belagerungen
  for (const city of S.cities.slice()) {
    if (city.owner === pi) continue;
    const sk = pi + '|' + city.id;
    const atk = attackersOn(S, pi, city);
    if (!atk.length) { delete S.sieges[sk]; continue; }
    const a = attackValue(S, pi, atk.length), d = defenseValue(S, city);
    if (a > d) {
      S.sieges[sk] = (S.sieges[sk] || 0) + 1;
      log(S, 'fight', T('Kampf um %ss Stadt: Angriff %s > Verteidigung %s (Zug %s/2).', civOf(S.players[city.owner]).n, a, d, S.sieges[sk]));
      if (S.sieges[sk] >= 2) captureCity(S, pi, city);
    } else {
      if (S.sieges[sk]) log(S, 'fight', T('Belagerung gebrochen (Angriff %s ≤ Verteidigung %s).', a, d));
      S.sieges[sk] = 0;
    }
  }
  // Flankieren: Stellung (canFlank), dann der Machtvergleich.
  const flankSpots = flankSpotsOf(S, pi);
  for (const enemy of S.armies.slice()) {
    if (enemy.owner === pi) continue;
    if (canFlank(S, pi, enemy, flankSpots) && powerOf(S, pi) > powerOf(S, enemy.owner)) {
      S.armies = S.armies.filter(a => a !== enemy);
      log(S, 'fight', T('%s flankiert und zerstört eine Armee von %s.', civOf(p).n, civOf(S.players[enemy.owner]).n));
    }
  }
}
function captureCity(S, pi, city) {
  const p = S.players[pi], loser = S.players[city.owner];
  const loss = has(p, 'militaergericht') ? 0 : has(p, 'rittertum') ? 1 : 2;
  const wasCapital = city.cap;
  city.pop -= loss;
  delete S.sieges[pi + '|' + city.id];
  if (city.pop <= 0) {
    S.cities = S.cities.filter(x => x !== city);
    loseCityWonders(S, city);          // zerstört – oder bleibt stehen (Stonehenge)
    log(S, 'fight', T('%s zerstört eine Stadt von %s.', civOf(p).n, civOf(loser).n));
  } else {
    const old = city.owner;
    city.owner = pi; city.cap = false; city.grown = 99;
    takeCityWonders(S, city, old, pi);  // Wunder samt dauerhafter Effekte wechseln den Besitzer
    log(S, 'fight', T('%s erobert eine Stadt von %s (Bevölkerung %s).', civOf(p).n, civOf(loser).n, city.pop));
  }
  // Militärsieg: der einzige Sieg, der sofort und ohne Punktvergleich endet. Er schlägt
  // auch schon angemeldete Siege – wer die Hauptstadt nimmt, gewinnt auf der Stelle.
  // Im Marathon (v84) erst mit der zweiten eroberten Hauptstadt (capitalsToWin).
  if (wasCapital && p.kind !== 'barbar') {
    (p.capTaken = p.capTaken || []).push(S.players.indexOf(loser));
    const namen = p.capTaken.map(i => civOf(S.players[i]).n);
    if (capitalsTaken(p) >= capitalsToWin(S))
      S.over = {
        winner: pi, winners: [pi], military: true,
        how: capitalsToWin(S) > 1
          ? T('Militärsieg (Hauptstädte von %s erobert)', namen.join(T(' und ')))
          : T('Militärsieg (Hauptstadt von %s erobert)', civOf(loser).n),
      };
    else
      log(S, 'head', T('%s erobert die Hauptstadt von %s – %s von %s Hauptstädten für den Militärsieg.',
        civOf(p).n, civOf(loser).n, capitalsTaken(p), capitalsToWin(S)));
  }
  if (!citiesOf(S, S.players.indexOf(loser)).length) loser.dead = true;
}

/* ------------------------------------------------------------ Sieg & Zugende */
/* Alle verfügbaren Siegschwellen. UN und Theologie senken die Standardschwelle von ⅔;
   es gilt immer die niedrigste. Alle Schwellen sind „mehr als" – seit v77 auch der
   Standard (Anweisung des Autors: 4 von 6 sind nicht mehr als 2/3). Bis v74 galt dort
   „mindestens", und im Spiel zu dritt reichten so 4 von 6 schon in Runde 1. */
function victoryOption(S, p) {
  const duel = !!(S && S.duel);
  // Im Duell liegen alle Schwellen höher: >3/4 statt >2/3, Theologie 7/10, UN 2/3
  const L = victoryLabels(duel);
  const opts = duel
    ? [{ frac: DUEL_VICTORY_FRAC, strict: true, label: L.base }]
    : [{ frac: VICTORY_FRAC, strict: true, label: L.base }];
  if (has(p, 'un'))
    opts.push({ frac: duel ? DUEL_UN_FRAC : UN_FRAC, strict: true, label: L.un });
  if (has(p, 'theologie'))
    opts.push({ frac: duel ? DUEL_THEOLOGY_FRAC : THEOLOGY_FRAC, strict: true, label: L.theologie });
  return opts.sort((a, b) => a.frac - b.frac)[0];
}
/* Wirkungstext einer Technologie. Theologie und Vereinte Nationen senken die
   Siegschwelle, und im Duell auf andere Werte als im normalen Spiel – der Bogen zeigte
   dort bisher die Zahlen des Vierspielerspiels. */
function techEffect(t, S) {
  const L = victoryLabels(!!(S && S.duel));
  if (t.k === 'theologie') return T('>%s der Bevölkerung zum Sieg', L.theologie);
  if (t.k === 'un') return T('>%s der Bevölkerung zum Sieg', L.un);
  // Marathon (v85): die Wissenschaftliche Methode wirkt doppelt
  if (t.k === 'wiss_methode' && S && S.marathon)
    return T('Techkosten %s (je Zeitalter, im Marathon doppelt)',
      [2, 4, 6, 8, 10].map(n => '−' + n * MARATHON_DISCOUNT_FACTOR).join('/'));
  return t.e;
}
/* Wirtschaftssieg eines Reichs, gerufen nur am Rundenende (checkEconomyRoundEnd). Seit v85
   auch in Runde 1 (Anweisung des Autors): die Sperre von v77 war nötig, weil der Startspieler
   damals am Ende seines eigenen Zuges anmelden konnte, bevor die anderen gezogen hatten –
   am Rundenende haben alle gleich oft gezogen. */
function checkVictory(S, pi) {
  if (S.over) return S.over;
  // gerufen am Rundenende (checkEconomyRoundEnd, v85) – mit dem Stand von dort
  const p = S.players[pi], w = worldPop(S), mine = popOf(S, pi);
  const o = victoryOption(S, p);
  const enough = o.strict ? mine > w * o.frac : mine >= w * o.frac;
  if (w > 0 && enough && S.cities.length > 1)
    claimVictory(S, pi, T('Wirtschaftssieg (%s von %s Weltbevölkerung, Schwelle %s)', mine, w, o.label), { rundenende: true });
  return S.over;
}

/* --------------------------------------------------- Siegansprüche und Punkte
   Wirtschafts-, Forschungs- und Kultursieg beenden das Spiel nicht auf der Stelle,
   sondern **am Ende der laufenden Runde**. Wer die Bedingung erfüllt, meldet einen
   Anspruch an; die Runde wird noch zu Ende gespielt. Erfüllen mehrere Reiche in
   derselben Runde eine Siegbedingung, entscheiden Punkte:

       Punkte = Bevölkerung + Anzahl Weltwunder + Anzahl Technologien

   Ein Anspruch bleibt gültig, auch wenn die Bedingung später wieder wegfällt (die
   Bevölkerung sinkt, ein Stufe-3-Wunder wird erobert). Er zählt für den Punktvergleich
   genauso mit – gewertet werden die Punkte am Rundenende, nicht zur Zeit des Anspruchs.
   Nur der Militärsieg endet sofort und ohne Vergleich.                              */
function claimVictory(S, pi, how, opts) {
  if (S.over) return S.over;                       // Militärsieg ist schon gefallen
  if (!canWin(S.players[pi])) return null;         // Barbaren gewinnen nie
  if (!S.claims) S.claims = [];
  const civ = civOf(S.players[pi]).n;
  if (S.claims.some(c => c.pi === pi)) {           // zweiter Grund desselben Reichs
    log(S, 'info', T('%s erfüllt eine weitere Siegbedingung: %s.', civ, how));
    return null;
  }
  S.claims.push({ pi, how, round: S.round });
  if (S.endRound == null) S.endRound = S.round;
  log(S, 'head', `${civ}: ${how}`);
  // Am Rundenende (Wirtschaftssieg, v85) wird gleich entschieden – „das Spiel endet am Ende
  // dieser Runde" wäre dort irreführend
  if (S.claims.length > 1)
    log(S, 'info', T('%s meldet ebenfalls einen Sieg an – am Rundenende entscheiden Punkte.', civ));
  else if (!(opts && opts.rundenende))
    log(S, 'info', T('Das Spiel endet am Ende dieser Runde (Runde %s).', S.endRound) + ' ' +
      T('Wer bis dahin ebenfalls eine Siegbedingung erfüllt, kommt in den Punktvergleich.'));
  return null;
}
/* Punkte eines Reichs. Technologien zählen als Stückzahl, nicht nach Kosten. */
function victoryScore(S, pi) {
  const p = S.players[pi];
  const pop = popOf(S, pi);
  const wonders = typeof wondersOf === 'function' ? wondersOf(S, pi).length : 0;
  const techs = Object.keys(p.techs || {}).filter(k => p.techs[k]).length;
  return { pop, wonders, techs, total: pop + wonders + techs };
}
/* Kann dieses Reich überhaupt gewinnen? Barbaren sind eine neutrale Fraktion. */
const canWin = p => p && p.kind !== 'barbar';
const isHumanPlayer = p => !!p && p.kind !== 'bot' && p.kind !== 'barbar';
/* Läuft am Rundenende. Rückgabe: true, wenn das Spiel damit zu Ende ist. */
function resolveClaims(S) {
  if (S.over) return true;
  if (S.endRound == null || S.round < S.endRound) return false;
  // Den Wirtschaftssieg prüft unmittelbar davor checkEconomyRoundEnd für alle zugleich (v85).
  // Ausgeschiedene Reiche (keine Stadt mehr) können nicht gewinnen. Die Vorgabe
  // schützt nur vor dem Wegfallen der *Siegbedingung*, nicht vor dem Untergang.
  const live = (S.claims || []).filter(c =>
    canWin(S.players[c.pi]) && !S.players[c.pi].dead && citiesOf(S, c.pi).length);
  if (!live.length) {                    // niemand mehr übrig: Anspruch verfällt
    if ((S.claims || []).length)
      log(S, 'info', T('Kein Reich mit Sieganspruch ist noch im Spiel – es geht weiter.'));
    S.claims = []; S.endRound = null;
    return false;
  }
  // Punkte absteigend; bei gleicher Punktzahl stehen Menschen vor Bots. Die Tafel am
  // Spielende zeigt ALLE Ansprüche, auch die, die gleich ausgeschlossen werden.
  const rang = c => isHumanPlayer(S.players[c.pi]) ? 0 : 1;
  const scored = live.map(c => ({ ...c, ...victoryScore(S, c.pi) }))
    .sort((a, b) => b.total - a.total || rang(a) - rang(b));
  /* Menschen zuerst, und zwar unabhängig von den Punkten: hat ein Mensch einen Sieg
     angemeldet, gewinnt ein Mensch – auch mit weniger Punkten. Der Punktvergleich
     entscheidet dann nur noch unter den Menschen. Bis v59 galt das nur bei
     Punktgleichstand, sodass ein Bot dem Menschen den Sieg noch wegrechnen konnte,
     obwohl beide es in derselben Runde geschafft hatten. Ohne menschlichen Anspruch
     zählen die Punkte wie gehabt. */
  const menschen = scored.filter(x => isHumanPlayer(S.players[x.pi]));
  const feld = menschen.length ? menschen : scored;
  const best = feld[0].total;
  const winners = feld.filter(x => x.total === best);
  /* Vermerkt wird die Regel nur, wenn sie wirklich etwas geändert hat – wenn also ein
     Bot mit seinen Punkten gewonnen hätte oder mitgewonnen hätte. */
  const menschRegel = menschen.length > 0 &&
    scored.some(x => !isHumanPlayer(S.players[x.pi]) && x.total >= best);
  const namen = winners.map(x => civOf(S.players[x.pi]).n).join(T(' und '));
  const punkte = scored.map(x => `${civOf(S.players[x.pi]).n} ${x.total}`).join(', ');
  S.over = {
    winner: winners[0].pi, winners: winners.map(x => x.pi),
    how: scored.length > 1
      ? `${winners[0].how} · Punktvergleich am Rundenende: ${punkte}` +
        (menschRegel ? T(' · Mensch vor Bot') : '')
      : winners[0].how,
    score: scored, shared: winners.length > 1, tiebreak: menschRegel ? 'mensch' : null,
    round: S.round,
  };
  log(S, 'head', scored.length > 1
    ? `Rundenende: ${namen} gewinnt nach Punkten (${punkte})` +
      (menschRegel ? T(' – bei mehreren Ansprüchen geht der Sieg an den Menschen.') : '.')
    : `Rundenende: ${namen} gewinnt. ${winners[0].how}`);
  return true;
}
/* Was das Zugende hart verhindert – im Gegensatz zu pendingWarnings, das nur erinnert.
   Eine Armee auf einem Stadtfeld ist kein gültiger Zustand: Städte tragen keine Armeen.
   Blockiert wird aber nur, wenn sie auch wirklich herauskann – sonst wäre der Zug nicht
   mehr beendbar (eingeschlossene Insel, alles ringsum besetzt, keine Bewegung mehr übrig). */
function blockingIssues(S, pi) {
  const out = [];
  for (const a of armiesOf(S, pi)) {
    if (!cityAt(S, a.r, a.c)) continue;
    const raus = [...armyReach(S, a).keys()].map(unkey)
      .some(([r, c]) => !(r === a.r && c === a.c) && !cityAt(S, r, c));
    if (raus) out.push(T('Eine Armee steht noch in einer Stadt – sie muss erst herausziehen.'));
  }
  return out;
}
function pendingWarnings(S, pi) {
  const out = [];
  // Armeen in Städten stehen in blockingIssues – hier bleiben nur die weichen Hinweise.
  if ((S.players[pi].freeArmies || 0) > 0) {
    // Gewartet wird auf die Stadt, die den Koloss gebaut hat – nicht auf die Hauptstadt.
    const stadt = freeArmyCity(S, pi);
    out.push(stadt && !stadt.cap
      ? T('Eine kostenlose Armee wartet noch – sie kommt erst, wenn die Stadt auf %s/%s frei ist.',
        stadt.r, stadt.c)
      : T('Eine kostenlose Armee wartet noch – sie kommt erst, wenn die Hauptstadt frei ist.'));
  }
  return out;
}
/* Schritt 4 + 5 des Zuges. Läuft für Menschen wie Bots an genau einer Stelle –
   sonst würde ein Belagerungszähler zweimal pro Zug steigen. */
function finishTurn(S) {
  if (S.over) return S.over;
  combatPhase(S, S.cur);
  // Der Wirtschaftssieg wird nicht am Zugende geprüft, sondern am Ende der Runde für alle
  // (checkEconomyRoundEnd, v85).
  return S.over;
}
function advanceTurn(S) {
  // Eine Runde ist eine volle Umdrehung ab dem Startspieler: dort wird hochgezählt und
  // dort wird das Ereignis der neuen Runde ausgewürfelt – nicht bei Russland (Index 0).
  // Genau dort ist auch das Rundenende: angemeldete Siege werden hier ausgewertet.
  const first = S.startIdx || 0;
  let guard = 0;
  do {
    S.cur = (S.cur + 1) % S.players.length;
    if (S.cur === first) {
      checkEconomyRoundEnd(S);     // Wirtschaftssieg: alle haben gleich oft gezogen (v85)
      if (resolveClaims(S)) return S.over;
      S.round++; startRound(S);
    }
    guard++;
  } while (S.players[S.cur].dead && guard < 20);
  beginTurn(S);
}
function endTurn(S) {
  if (finishTurn(S)) return;
  advanceTurn(S);
}
