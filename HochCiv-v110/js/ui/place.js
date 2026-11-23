/* js/ui/place.js – Legephase der Plättchenkarte.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------- Startplättchen legen
   Eine Plättchenkarte entsteht nicht im Aufbau, sondern in einer eigenen Phase:
   die offenen Dreiecke liegen schon, jedes Reich legt sein eigenes selbst – Lage
   (eine von drei) und Hauptstadt (irgendein Landfeld darauf, das keiner fremden
   Startecke zu nah kommt). Gelegt wird verdeckt: sichtbar sind nur die offenen
   Plättchen und das eigene. Bots legen sofort, zufällig, Hauptstadt auf einem der
   drei mittigen Felder. Erst wenn alle fertig sind, wird aufgedeckt.               */
let placeState = null;

function startPlacement(cfg) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const plan = tilePlan(cfg.players.map(p => p.civ), seed, { shape: cfg.tileShape });
  if (!plan) return toast(T('Für diese Spielerzahl gibt es keine Plättchenkarte.'));
  /* Erst würfeln, dann legen (v66): Was jedes Reich zu Beginn erforschen kann und welche
     Wunder im Stapel liegen, hängt nicht an der Karte – also steht es schon fest, bevor
     das erste Plättchen liegt, und jeder darf es beim Legen ansehen. Der Seed der Partie
     wird hier festgelegt, damit Vorabwurf und echte Partie derselbe Wurf sind. */
  cfg = Object.assign({}, cfg, { seed });
  const setup = rollSetup(cfg);
  const rnd = mapRng(seed + 12345);
  placeState = { cfg, plan, rnd, setup, queue: [], at: 0, o: 0, cell: null, done: false };
  // Fähigkeitswahl (v107): alle Reiche ausgelost – erst wählen, dann legen (js/ui/draft.js)
  if (cfg.players.some(p => p.pick)) return startPick();
  placeBegin();
}
function placeBegin() {
  const st = placeState, { plan, cfg, setup, rnd } = st;
  plan.seats.forEach(seat => {
    const pl = cfg.players[seat.idx];        // nach Platz, nicht nach Zivilisation
    if (pl && pl.kind === 'bot') botPlaceSeat(plan, seat, rnd);
    // Die KI legt wie ein Mensch – verdeckt, sie sieht nur die offenen und ihr Plättchen
    else if (pl && pl.kind === 'ki') { if (kiPlaceSeat(plan, seat, pl, setup)) botPlaceSeat(plan, seat, rnd); }
    else st.queue.push(seat);
  });
  show('screen-place');
  placeStep();
}
/* Erträge aller Wahlmöglichkeiten des Sitzes, der gerade legt, und welche davon dominiert
   sind (placeYieldTable/dominatedCells in tiles.js). Lagen × Felder Wegwerf-Partien – einmal je
   Sitz gerechnet und in placeState gemerkt; Drehen und Antippen ändern daran nichts. */
function placeInfo(st, seat) {
  if (!st.info || st.info.idx !== seat.idx) {
    const table = placeYieldTable(st.plan, seat, st.cfg.players[seat.idx]);
    st.info = { idx: seat.idx, table, dom: dominatedCells(table) };
  }
  return st.info;
}
/* Ertragsübersicht für die gewählte Hauptstadt – dasselbe, was im Spiel vor dem Siedeln
   steht (placeYieldAt). Bis v72 hing hier „– noch verdeckte Nachbarfelder kommen dazu"
   an jedem Feld am Kartenrand oder am Loch: gezählt wurde jedes X, dort kommt aber nie
   etwas dazu, und an verdeckte Plättchen grenzt eine erlaubte Hauptstadt nicht. */
function placeYield(plan, seat, st) {
  if (st.cell == null) return '';
  const y = placeInfo(st, seat).table[st.o][st.cell];
  if (!y) return '';
  return `<span class="pl-yield"><b>${T('Ertragsübersicht')}</b> ${fmtGain(y)}</span>`;
}
/* Anzeige eines Sitzes: bei doppelten Zivilisationen der Platzname („Russland II") */
function seatCiv(seat) {
  const pl = placeState.cfg.players[seat.idx] || {};
  return civOf({ civ: seat.civ, name: pl.name, roman: pl.roman, color: pl.color });
}
/* Fähigkeit dieses Platzes – auch dann schon gültig, wenn sie ausgelost wurde. */
function seatAbil(seat) {
  const pl = placeState.cfg.players[seat.idx] || {};
  return abilInfo({ civ: seat.civ, kind: pl.kind || 'human', ability: pl.ability });
}
function placeSeatNow() {
  const st = placeState;
  return (st && !st.done && st.at < st.queue.length) ? st.queue[st.at] : null;
}
function placeStep() {
  const st = placeState;
  if (st.at >= st.queue.length) return placeReveal();
  st.o = 0; st.cell = null;
  drawPlace();
  // Hotseat: zwischen zwei Menschen wird das Gerät übergeben, vorher nichts gezeigt.
  if (st.queue.length > 1) {
    const civ = seatCiv(placeSeatNow());
    modal('Verdeckt legen', T('<p class="sub">%s <b>%s</b> ist dran. Das eigene Startplättchen sehen die anderen erst nach dem Aufdecken – jetzt also Gerät übergeben.</p> <button class="btn primary wide" id="pl-gate">Plättchen ansehen</button>', SYM[civ.sym], civ.n));
    $('pl-gate').onclick = closeModal;
  }
}
function drawPlace() {
  const st = placeState, plan = st.plan;
  const seat = placeSeatNow();
  const shape = planShape(plan);
  const shown = shape.slots.map((_, i) => i)
    .filter(i => st.done || !isSeatSlot(plan, i) || (seat && seat.slot === i));
  const map = tileMap(plan, {
    show: shown, seat, o: seat ? st.o : null, cell: st.cell,
    caps: st.done ? null : (seat ? [seat.idx] : []),
  });
  const opts = {};
  if (seat) {
    const rcs = slotRC(plan, seat.slot), ok = placeOptions(plan, seat, st.o);
    const dom = placeInfo(st, seat).dom[st.o];
    opts.frame = rcs;
    opts.highlight = rcs.filter((_, i) => ok[i]);
    // rötlicher Rand: erlaubt, aber ein anderes Feld bringt rundum mehr (v73)
    opts.dominated = rcs.filter((_, i) => dom[i]);
    if (st.cell != null) opts.sel = rcs[st.cell];
  }
  drawMap($('pl-map'), map, opts);
  const note = $('pl-note');
  // Beschriftungen kommen aus index.html und werden von applyStaticLang übersetzt. Einen Stand
  // „alles gelegt“ zeichnet diese Seite seit v99 nicht mehr – dann beginnt gleich die Partie.
  if (!seat) return;
  // Kein Plättchenname mehr – er sagt nichts über das Feld, das man wählt. Dafür die
  // Fähigkeit: bei ausgeloster Zivilisation ist das hier die erste Stelle, an der man
  // sieht, was man spielt.
  const civ = seatCiv(seat), abil = seatAbil(seat);
  note.innerHTML = `<b>${SYM[civ.sym]} ${esc(civ.n)}</b>` +
    (abil ? ` · <span class="pl-abil" title="${esc(abil.e)}">${esc(abil.n)}</span>` : '') +
    ' · ' + T('Lage %s von %s', st.o + 1, TRI_ROT.length) + ' · ' +
    (st.cell == null ? T('Hauptstadt auf ein markiertes Feld tippen')
      : T('Hauptstadt gesetzt – „Fertig", wenn es passt')) +
    // Legende nur, wenn überhaupt ein Feld rot umrandet ist
    ((opts.dominated || []).length
      ? ` <span class="pl-dom">${T('Rot umrandet: ein anderes Feld bringt von etwas mehr und von nichts weniger.')}</span>` : '') +
    placeYield(plan, seat, st);
}
/* Forschungsseite in der Legephase (v66). Gezeigt wird genau der Bogen aus dem Spiel,
   nur ohne Knöpfe: was dieser Platz zu Beginn erforschen könnte, ausgewürfelt VOR dem
   Legen – damit man die Hauptstadt mit dieser Kenntnis wählt.
   Gerechnet wird auf einer Wegwerf-Partie mit genau diesen Verfügbarkeiten, damit Liste,
   Kosten und Wunderstapel aus der Regelmaschine kommen und nicht hier nachgebaut werden.
   Seit v107 (Anweisung des Autors) sitzen alle Reiche darin: was die anderen erforschen könnten,
   tragen die Kacheln als Marken wie im Spiel (ownerMarks) – verdeckt bleiben nur die Plättchen. */
function placeTechView() {
  const st = placeState, seat = placeSeatNow();
  if (!st) return;
  if (!seat) return toast(T('Alle Plättchen liegen schon.'));
  const V = newGame({
    seed: 1, map: DEFAULT_MAP, wonders: st.cfg.wonders, seatOrder: true,
    players: st.cfg.players, avail: st.setup.avail, wpool: st.setup.wpool,
  });
  // Siegschwellen der Partie, die gelegt wird (v101) – V liegt auf der Standardkarte
  V.victoryMode = victoryMode(st.cfg);
  const civ = seatCiv(seat);
  let h = techBoardHTML(V, seat.idx, { plain: true });
  if (st.cfg.wonders) {
    h += `<p class="sub" style="margin-top:14px">${T('Weltwunder im Stapel')}</p>`;
    [1, 2].forEach(lvl => {
      const pool = poolOf(V, lvl);
      if (!pool.length) return;
      h += pool.map(k => WONDER_BY_KEY[k]).map(w => `<button class="tech avail" disabled>
        <b>${w.n}</b><span class="eff">${T('Stufe %s', w.lvl)} · ${w.e}</span></button>`).join('');
    });
  }
  modal(T('%s · Forschung vor dem Legen', civ.n), h);
  $('overlay').classList.add('wide');
}
/* Weltansicht in der Legephase (v99, Anweisung des Autors – wie „Forschung“ daneben): die
   Reiche in Zugfolge mit ihren Fähigkeiten, dazu Ereignisse und Weltwunder dieser Partie. Die
   Fähigkeiten aller sind kein Geheimnis – im Spiel zeigt „Welt“ dasselbe; verdeckt bleiben nur
   die Startplättchen. Die Zugfolge steht schon fest: der Startspieler ist im Aufbau ausgelost
   oder gewählt, seatingOrder rechnet wie newGame. */
function placeWorldView() {
  const st = placeState;
  if (!st) return;
  const seat = placeSeatNow();
  const { ordered, startIdx } = seatingOrder(st.cfg);
  const reihe = ordered.slice(startIdx).concat(ordered.slice(0, startIdx));
  let h = `<p class="sub">${T('Die Reiche in Zugfolge')}</p>` + civRowsHTML(reihe.map(pl => ({
    x: pl, self: !!seat && st.cfg.players.indexOf(pl) === seat.idx,
  })), null);
  if (st.cfg.events)
    h += `<p class="sub" style="margin-top:12px">${T('Mit Ereignissen – das erste fällt zu Beginn der ersten Runde.')}</p>`;
  if (st.cfg.wonders) {
    // Wunderstapel wie in der Forschungsansicht: eine Wegwerf-Partie mit genau diesem Stapel
    const pl = st.cfg.players[0] || {};
    const V = newGame({
      seed: 1, map: DEFAULT_MAP, wonders: true,
      players: [{ civ: pl.civ, kind: 'human', ability: pl.ability }],
      avail: [st.setup.avail[0]], wpool: st.setup.wpool,
    });
    for (const lvl of [1, 2, 3]) {
      const pool = poolOf(V, lvl);
      if (!pool.length) continue;
      h += `<p class="sub" style="margin-top:10px">${T('Weltwunder im Stapel, Stufe %s', lvl)}</p>`;
      h += pool.map(k => `<div class="tech avail"><span class="c">${WONDER_BY_KEY[k].lvl}</span>
        <b>${WONDER_BY_KEY[k].n}</b><span class="eff">${WONDER_BY_KEY[k].e}</span></div>`).join('');
    }
  }
  if (!st.cfg.events && !st.cfg.wonders)
    h += `<p class="sub">${T('Dieses Spiel läuft ohne Ereignisse und ohne Weltwunder.')}</p>`;
  modal(T('Welt'), h);
}
function plTap(r, c) {
  const st = placeState, seat = placeSeatNow();
  if (!seat) return;
  const rcs = slotRC(st.plan, seat.slot);
  const i = rcs.findIndex(x => x[0] === r && x[1] === c);
  if (i < 0) return toast(T('Nur auf dem eigenen Plättchen.'));
  if (!placeOptions(st.plan, seat, st.o)[i])
    return toast(T('Nur auf Land – und nicht so nah an einem fremden Startplättchen.'));
  st.cell = i;
  drawPlace();
}
function placeRotate() {
  const st = placeState, seat = placeSeatNow();
  if (!seat) return;
  st.o = (st.o + 1) % TRI_ROT.length;
  // Die Hauptstadt bleibt liegen, solange das Feld auch in der neuen Lage passt.
  if (st.cell != null && !placeOptions(st.plan, seat, st.o)[st.cell]) st.cell = null;
  drawPlace();
}
function placeConfirm() {
  const st = placeState;
  if (!st || st.done) return;
  const seat = placeSeatNow();
  if (st.cell == null) return toast(T('Erst die Hauptstadt setzen.'));
  const err = placeSeat(st.plan, seat, st.o, st.cell);
  if (err) return toast(err);
  st.at++;
  placeStep();
}
/* Alle haben gelegt: aufdecken und gleich losspielen. Bis v98 kam dazwischen ein eigener Schritt
   – die ganze Karte offen und ein Knopf „Spiel beginnen“; seit v99 entfällt er (Anweisung des
   Autors), die Karte zeigt die Partie ja ohnehin. */
function placeReveal() {
  const st = placeState;
  // Sicherheitsnetz: wer (aus welchem Grund auch immer) nichts gelegt hat, wird gelegt.
  st.plan.seats.forEach(seat => { if (seat.cell == null) botPlaceSeat(st.plan, seat, st.rnd); });
  st.done = true; st.plan.revealed = true;
  placeGo();
}
function placeGo() {
  const st = placeState;
  const cfg = Object.assign({}, st.cfg, {
    map: tileMap(st.plan), avail: st.setup.avail, wpool: st.setup.wpool,
  });
  placeState = null;
  S = newGame(cfg);
  startGameScreen();
}
