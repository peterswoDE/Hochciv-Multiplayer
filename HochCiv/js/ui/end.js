/* js/ui/end.js – Spielende: Ergebnis, Nochmal spielen, Konfetti.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------------------- Nochmal spielen
   Allein gegen Bots steht am Spielende ein zweiter, hervorgehobener Knopf: dieselbe
   Aufstellung, aber ein ausgelostes Reich – und nach einem Sieg eine Stufe schwerer.
   Gedacht für die Runde nach der Runde: nichts wieder einstellen, nicht dreimal
   hintereinander dasselbe Reich, und ein Sieg zieht von selbst weiter.

   Nur bei EINEM Menschen: zu mehreren gehört die Aufstellung nicht einem allein, und ein
   ausgeloster Platz wäre eine Entscheidung über andere hinweg. Dann bleibt es beim Weg
   über den Aufbau.                                                                     */
// Plätze, nicht Überlebende: ein Mensch, dessen Hauptstadt gefallen ist, saß trotzdem
// mit am Tisch. Barbaren sind eine Ereignisfraktion und kein Platz.
const humanSeats = S => S.players
  .map((p, i) => i).filter(i => S.players[i].kind === 'human');
// Der einzige Mensch – oder −1, wenn es mehrere sind oder kein Rezept vorliegt
// (Tutorial und von Hand geladene Spielstände älterer Fassungen haben keines).
function soloHuman(S) {
  const h = humanSeats(S);
  return (S && S.recipe && h.length === 1) ? h[0] : -1;
}
/* Eine Stufe schwerer. DIFFICULTIES steht von leicht nach schwer (Siedler … David):
   weiter hinten heißt, die Bots brauchen weniger auf dem Würfel. Am Ende der Liste
   bleibt es dabei – wir erfinden keinen Grad. */
const nextDiff = k => {
  const i = DIFFICULTIES.findIndex(d => d.k === k);
  return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, (i < 0 ? 2 : i) + 1)].k;
};
const diffName = k => (DIFFICULTIES.find(d => d.k === k) || DIFFICULTIES[2]).n;
// Der Aufbau setzt einen Grad für alle Plätze, gelesen wird deshalb der erste.
const recipeDiff = rec => ((rec.players || []).find(p => p.diff) || {}).diff || 'prinz';
/* Dasselbe für die KI: ihre Stufen (KI_LEVELS, leicht → schwer). Sitzt eine KI mit am
   Tisch, spricht „Nochmal spielen" von ihrer Stufe – sie ist dann der eigentliche Gegner. */
const nextKiLevel = k => {
  const i = KI_LEVELS.findIndex(d => d.k === k);
  return KI_LEVELS[Math.min(KI_LEVELS.length - 1, (i < 0 ? 1 : i) + 1)].k;
};
const kiLevelName = k => (KI_LEVELS.find(d => d.k === k) || KI_LEVELS[1]).n;
const recipeHasKi = rec => (rec.players || []).some(p => p.kind === 'ki');
const recipeKiLevel = rec => ((rec.players || []).find(p => p.kind === 'ki' && p.kiLevel) || {}).kiLevel || KI_DEFAULT_LEVEL;
/* Bots stehen nicht mehr zur Wahl: ein älteres Rezept mit Bots spielt „Nochmal" mit der KI,
   auf der Stufe, die ihrem Grad entspricht (KI_LEVELS in data.js: Leicht ≈ Prinz,
   Mittel ≈ König, Schwer ≈ David). */
const BOT_DIFF_KI = { siedler: 'leicht', haeuptling: 'leicht', prinz: 'leicht', koenig: 'mittel', david: 'schwer' };
const recipeOhneBots = rec => Object.assign({}, rec, {
  players: (rec.players || []).map(p => p.kind !== 'bot' ? p
    : Object.assign({}, p, { kind: 'ki', kiLevel: BOT_DIFF_KI[p.diff] || KI_DEFAULT_LEVEL })),
});

function rematch(harder) {
  const rec = recipeOhneBots(JSON.parse(JSON.stringify(S.recipe)));
  // dort darf ein Reich doppelt sitzen
  const frei = rec.mapPick === 'plaettchen' || (typeof rec.mapPick === 'string' && rec.mapPick.startsWith(MY_MAP_PICK));
  rec.players.forEach((p, i) => {
    if (harder) p.diff = nextDiff(p.diff);
    if (harder && p.kind === 'ki') p.kiLevel = nextKiLevel(p.kiLevel);
    if (p.kind !== 'human') return;
    // Ausgelostes Reich – und damit auch eine ausgeloste Fähigkeit.
    p.ability = 'zufall';
    if (frei || rec.randomCivs || p.civ === 'zufall') { p.civ = 'zufall'; return; }   // Auslosung erledigt startFromRecipe
    /* Auf den festen Karten sitzt jede Zivilisation genau einmal. Ein simples „Zufall"
       hilft hier nicht: die Auslosung nimmt nur, was noch frei ist, und bei vier Reichen
       ist das genau das eigene alte – man bekäme jedes Mal dasselbe. Deshalb wird hier
       wirklich getauscht: gezogen wird aus allen vier, und wer das gezogene Reich hatte,
       übernimmt das alte des Menschen. Die Reiche bleiben damit paarweise verschieden. */
    const gezogen = CIV_KEYS[Math.floor(Math.random() * CIV_KEYS.length)];
    const vorher = p.civ;
    const halter = rec.players.find((q, j) => j !== i && q.civ === gezogen);
    if (halter) halter.civ = vorher;
    p.civ = gezogen;
  });
  startFromRecipe(rec);
}
/* Partie zu einer Kartenwahl beginnen (Aufbau und „Nochmal spielen"):
   Standard-Marathon → Zufallskarte und Draft; Plättchenkarte → Legephase; eigene Karte →
   ihre Startpunkte für so viele Reiche (mapForPlayers), mit Marathonregeln samt Draft,
   wenn die Karte es so will; feste Karte → wie sie ist. */
function beginFromPick(cfg, pick) {
  const n = cfg.players.length;
  if (pick === 'marathon') return startMarathon(cfg);
  if (pick === 'plaettchen') return startPlacement(cfg);
  const custom = mapForPick(pick);
  if (!custom) return toast(T('Diese Karte gibt es nicht mehr.'));
  if (custom.spawns) {
    if (n > custom.spawns.length) return toast(T('Diese Karte hat nur %s Startpunkte.', custom.spawns.length));
    const seed = Math.floor(Math.random() * 2 ** 31);
    cfg = Object.assign({}, cfg, { seed, map: mapForPlayers(custom, n, seed) });
    if (custom.marathon) return startMarathon(cfg);
  } else cfg.map = custom;
  S = newGame(cfg);
  startGameScreen();
}
function startFromRecipe(rec) {
  // Plättchenkarte und eigene Karten: dort darf ein Reich doppelt sitzen
  const frei = rec.mapPick === 'plaettchen' || (typeof rec.mapPick === 'string' && rec.mapPick.startsWith(MY_MAP_PICK));
  const players = nameDoubles(resolveRandom(JSON.parse(JSON.stringify(rec.players)), frei));
  const cfg = {
    players, duel: players.length === 2, recipe: rec,
    startPlayer: rec.start === 'zufall' ? Math.floor(Math.random() * players.length)
      : Math.min(players.length - 1, Math.max(0, +rec.start || 0)),
    events: rec.events, eventMode: rec.eventMode, wonders: rec.wonders,
    seatOrder: platzNummern(rec.mapPick, players.length, rec.randomCivs),   // wie beim ersten Mal (v90)
    hexTiles: !!rec.hexTiles && rec.mapPick === 'plaettchen',          // Sechseck-Plättchen (v99)
    // Ein Rezept aus v70–v81 kann noch altTree tragen – egal: jede neue Partie läuft seit
    // v82 im (einzigen) Techtree, auch „Nochmal spielen" nach einer alten Partie.
  };
  // Vom alten Spiel darf nichts stehen bleiben: gesperrtes Bot-Blatt, offenes Fenster,
  // die Schnipsel des letzten Sieges. endTutorialPanel setzt ui zurück, auch botLock.
  endTutorialPanel();
  $('sheet').classList.remove('locked');
  closeModal(); closeSheet();
  const schnipsel = $('confetti'); if (schnipsel) schnipsel.remove();
  // Marathon (ältere Rezepte haben keine Kartenwahl dafür), Plättchenkarte, eigene oder feste Karte
  const pick = rec.mode === 'marathon' && !(typeof rec.mapPick === 'string' && rec.mapPick.startsWith(MY_MAP_PICK))
    ? 'marathon' : (mapForPick(rec.mapPick) || rec.mapPick === 'plaettchen' ? rec.mapPick : '0');
  beginFromPick(cfg, pick);
}

function gameOver() {
  if (S.fg && typeof fgSpielende === 'function') return fgSpielende();   // Erstes Spiel (v92)
  const o = S.over, w = o.winner;
  const namen = (o.winners || [w]).map(i => civOf(S.players[i]).n).join(T(' und '));
  // Das Ergebnis ist der Titel (v102) – darunter nur, wie gewonnen wurde
  const titel = o.shared ? T('%s gewinnen gemeinsam', namen) : T('%s gewinnt', namen);
  // Bei mehreren Siegansprüchen die Punkte offenlegen: Bevölkerung + Wunder + Techs.
  let tafel = '';
  if (o.score && o.score.length > 1) {
    tafel = `<table class="tbl" style="margin:10px 0"><tr><th>${T('Reich')}</th><th>${T('Bev.')}</th>
      <th>${T('Wunder')}</th><th>${T('Techs')}</th><th>${T('Punkte')}</th></tr>` +
      o.score.map(x => `<tr${(o.winners || []).includes(x.pi) ? ' style="font-weight:700"' : ''}>
        <td>${civOf(S.players[x.pi]).n}</td><td>${x.pop}</td><td>${x.wonders}</td>
        <td>${x.techs}</td><td>${x.total}</td></tr>`).join('') + '</table>' +
      `<p class="sub">${o.score.map(x => `${civOf(S.players[x.pi]).n}: ${x.how}`).join(' · ')}</p>` +
      (o.tiebreak === 'mensch'
        ? `<p class="sub">${T('Melden Mensch und Bot in derselben Runde einen Sieg an, gewinnt der Mensch – auch mit weniger Punkten.')}</p>`
        : '');
  }
  /* Ein Tipp fürs nächste Mal, gewonnen oder verloren. Gelost wird EINMAL je Partie und
     im Spielstand gemerkt: gameOver() wird aus mehreren Wegen aufgerufen (Zugende,
     Bot-Fenster, Forschen, ein neu geladener beendeter Spielstand), und ein bei jedem
     Aufruf anderer Tipp sähe wie ein Fehler aus. */
  if (S.tip == null) { S.tip = Math.floor(Math.random() * TIPS.length); saveGame(); }
  const tipp = `<p class="tip"><b>${T('Tipp')}</b>${esc(TIPS[S.tip % TIPS.length])}</p>`;
  /* Allein gegen Bots: „Nochmal spielen" vor und über dem Weg ins Menü – der häufigere
     Wunsch nach einer Partie ist die nächste Partie. */
  const mensch = soloHuman(S);
  const gewonnen = mensch >= 0 && (o.winners || [w]).includes(mensch);
  let nochmal = '';
  if (mensch >= 0) {
    // Mit KI am Tisch zählt ihre Stufe, sonst der Schwierigkeitsgrad der Bots
    const rec = recipeOhneBots(S.recipe);
    const ki = recipeHasKi(rec);
    const alt = ki ? recipeKiLevel(rec) : recipeDiff(rec);
    const neu = gewonnen ? (ki ? nextKiLevel(alt) : nextDiff(alt)) : alt;
    const name = ki ? kiLevelName : diffName;
    // Die Stufe der nächsten Partie steht im Knopf (v102): nach einem Sieg eine schwerer
    nochmal = `<button class="btn primary wide" id="go-again">${T('Nochmal spielen · %s', name(neu))}</button>`;
  }
  modal(titel, `<p class="sub">${o.how}</p>${tafel}${tipp}${nochmal}
    <button class="btn wide" id="go-menu">${T('Zurück zum Menü')}</button>`);
  if ($('go-again')) $('go-again').onclick = () => rematch(gewonnen);
  $('go-menu').onclick = () => { store('hochciv.save', null); location.reload(); };
  confetti(civOf(S.players[w]).color);
}
/* Kleiner Sieggruß: ein paar Papierschnipsel, die einmal durchs Bild fallen.
   Bewusst sparsam – 40 Stück, gut zwei Sekunden, danach räumt es sich selbst ab.
   Reines CSS in Bewegung, kein Zeitgeber je Schnipsel; wer Bewegung reduziert haben
   möchte (prefers-reduced-motion), bekommt gar keins. */
function confetti(farbe) {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch { /* Browser ohne matchMedia – dann gibt es Schnipsel */ }
  const alt = $('confetti'); if (alt) alt.remove();
  const box = document.createElement('div');
  box.id = 'confetti';
  const farben = [farbe || '#9a3b2f', '#c8a83c', '#4d7a4a', '#e8dfc4'];
  let h = '';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 100, dauer = 1.6 + Math.random() * 1.1;
    const spät = Math.random() * 0.5, dreh = Math.random() * 720 - 360;
    const c = farben[i % farben.length], br = 5 + Math.random() * 5;
    h += `<i style="left:${x}%;background:${c};width:${br.toFixed(1)}px;
      height:${(br * 1.6).toFixed(1)}px;animation-duration:${dauer.toFixed(2)}s;
      animation-delay:${spät.toFixed(2)}s;--dreh:${dreh.toFixed(0)}deg"></i>`;
  }
  box.innerHTML = h;
  document.body.appendChild(box);
  // Fallweg in Pixeln der eigenen Höhe (v103): 105vh wüchse mit dem Maßstab großer Bildschirme
  // (--ui) und ließe die Schnipsel schneller fallen; gedreht ist die Höhe ohnehin die kurze Seite
  if (box.offsetHeight) box.style.setProperty('--fall', Math.round(box.offsetHeight * 1.05) + 'px');
  setTimeout(() => box.remove(), 3400);
}
