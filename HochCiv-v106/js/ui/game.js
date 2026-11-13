/* js/ui/game.js – Spielbildschirm: Kopfzeile, Leiste, Gründen, Feld- und Stadtblatt, Erträge.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------------------------ Spielansicht */
function currentMap() { return myMaps[0] || DEFAULT_MAP; }
function redraw() {
  if (ui.army && !S.armies.includes(ui.army)) ui.army = null;
  const p = P(S), civ = civOf(p);
  const human = !isAuto(p) && !S.over;
  if (!human && ui.mode === 'found') ui.mode = null;     // Gründen gibt es nur im eigenen Zug
  const highlight = ui.army ? [...armyReach(S, ui.army).keys()].map(unkey) : [];
  const gruenden = ui.mode === 'found';
  // Während ein Kampf nachgespielt wird (v90), bleibt dessen Bild stehen – ein Neuzeichnen
  // zwischendurch (etwa aus dem Tutorial) zeigte sonst schon den Stand nach allen Kämpfen.
  // Ebenso die Szene eines KI- oder Bot-Zugs (v94).
  if (ui.anim && ui.anim.i < ui.anim.szenen.length) animDraw();
  else if (ui.combat && ui.combat.i < ui.combat.kaempfe.length) combatDraw();
  else drawMap($('map'), S.map, {
    state: S, sel: ui.sel, highlight, tutHl: ui.fg ? fgHighlight() : null,
    turn: isAuto(p) ? -1 : S.cur,
    // Erträge je Feld nur im Gründungsmodus – den gibt es nur im eigenen Zug (v87)
    yields: gruenden ? S.cur : null,
    found: gruenden ? S.cur : null,
    power: ui.powerView ? powerView(S) : null,
  });
  $('a-found').classList.toggle('on', gruenden);
  $('hud-sym').textContent = SYM[civ.sym];
  $('hud-sym').style.borderColor = civ.color;
  $('hud-sym').style.setProperty('--civ', civ.color);
  // Nur der Name (v102): die Fähigkeit steht im Blatt „Fähigkeiten" und in der Welt
  $('hud-name').textContent = civ.n + (p.kind === 'bot' ? T(' · Bot') : p.kind === 'ki' ? T(' · KI') : '');
  hudStand();
  ['a-tech', 'a-found', 'a-power', 'a-abil', 'a-end'].forEach(id => $(id).disabled = !human);
  // der eigene Technologiebogen (viewer) ist auch fremden Zügen eine Ansicht wert
  if (viewer() !== S.cur && !S.over) $('a-tech').disabled = false;
  if (ui.fg) fgRenderPanel();     // Erstes Spiel (v92): Ziel, Stand, Tipp – keine Sperren
  // Zahl an „Fähigkeiten" (v87): wie viele ARTEN kostenloser Aktionen offen sind
  // (freeActions) – nur, solange man den Knopf drücken kann; im Zug eines Bots oder der KI
  // wäre es deren Zahl
  const frei = $('a-abil').disabled ? 0 : freeActions(S, S.cur).length;
  $('a-abil-n').textContent = frei ? String(frei) : '';
  $('a-abil-n').hidden = !frei;
  // Nicht während eines Nachspiels (v90): im eigenen Zug ist dann schon gekämpft, aber der Zug
  // noch nicht gewechselt – so gespeichert, käme der Kampf nach dem Neuladen ein zweites Mal.
  if (!ui.combat) saveGame();
}
/* Die Zahlen der Kopfzeile: Runde und Bevölkerung, Vorrat und Macht des Reichs am Zug. Seit v96
   (Wunsch des Autors) läuft der Vorrat mit, solange ein Zug von KI oder Bot nachgespielt wird:
   dann der Stand nach der Aktion der Szene (animKopf) statt des Endstands des Zugs – bis v95
   stand dort den ganzen Zug über, was das Reich zu Zugbeginn hatte, also sein Einkommen.
   Gibt die Werte der Szene zurück (oder null). */
function hudStand() {
  const p = P(S);
  const a = ui.anim, kopf = a && a.i < a.szenen.length ? animKopf(S, a.szenen[a.i]) : null;
  const ev = curEvent();
  // Ist ein Sieg angemeldet, läuft die Runde noch zu Ende – das muss in der Kopfzeile
  // stehen, sonst wirkt das plötzliche Spielende willkürlich. Das Ereignis der Runde steht
  // gleich hinter ihr („Runde 3 · Pest").
  const letzte = S.endRound != null && !S.over
    ? ' · ' + T('letzte Runde (%s)', (S.claims || []).map(c => civOf(S.players[c.pi]).n).join(', ')) : '';
  $('hud-round').textContent = T('Runde %s', S.round) + (ev ? ` · ${ev.n}` : '') + letzte;
  /* Bevölkerung (v102): eigene, die der Welt, und ein Balken bis zur Siegschwelle. Der Strich
     steht dort, wo der Wirtschaftssieg beginnt – victoryOption, dieselbe Schwelle, die das
     Spiel prüft (am Ende der Runde, wenn alle gezogen haben); mit Theologie oder den Vereinten
     Nationen rückt er nach links. */
  const mine = kopf ? kopf.pop : popOf(S, S.cur), all = kopf ? kopf.welt : worldPop(S);
  const o = victoryOption(S, p);
  $('hud-popn').innerHTML = `${mine}<small>/${all}</small>`;
  $('hud-popf').style.width = (all > 0 ? Math.min(100, (100 * mine) / all) : 0) + '%';
  $('hud-popf').style.background = civOf(p).color;
  $('hud-popk').style.left = (100 * o.frac) + '%';
  const w = kopf ? kopf.nach
    : { sci: p.res.sci, food: p.res.food, coins: p.res.coins, power: powerOf(S, S.cur), deficit: p.foodDeficit || 0 };
  $('hud-sci').textContent = w.sci;
  $('hud-food').textContent = w.food + (w.deficit ? ` (−${w.deficit})` : '');
  $('hud-coins').textContent = w.coins; $('hud-power').textContent = w.power;
  return kopf;
}
/* Gründungsmodus an/aus (v75). Stadtgründung ist eine eigene Aktion der Leiste: an, zeigt
   die Karte Erträge und Kosten; ein Tipp auf ein Feld öffnet das Gründungsblatt. */
function toggleFoundMode() {
  if (!S || S.over || isAuto(P(S))) return;
  const an = ui.mode !== 'found';
  ui.mode = an ? 'found' : null;
  if (an) ui.army = null;
  closeSheet();
  redraw();
  if (an) toast(T('Feld für die neue Stadt antippen'));
}
/* Wechsel zwischen Menschen am selben Gerät (v102): das Zeichen des Reichs am Zug pulsiert
   einmal (style.css, .civ-chip.pulse). */
function pulseCiv() {
  const chip = $('hud-sym');
  chip.classList.remove('pulse');
  void chip.offsetWidth;                 // die Animation neu starten
  chip.classList.add('pulse');
}
/* Andere Aktionen der Leiste beenden den Gründungsmodus. */
function endFoundMode() {
  if (ui.mode !== 'found') return;
  ui.mode = null;
  if (S) redraw();
}

/* Beim Start eines normalen Spiels darf kein Panel des Ersten Spiels stehen bleiben. */
function endTutorialPanel() {
  if (ui && ui.fg && ui.fg.timer) clearTimeout(ui.fg.timer);
  // Ein laufendes Nachspiel (Kampf v90, Züge von KI und Bots v94) gehört zur alten Partie: sein
  // Zeitgeber fände zwar nichts mehr (ui ist gleich neu), aber Satz und Sperre blieben stehen
  if (ui && ui.anim) clearTimeout(ui.anim.timer);
  if (ui && ui.combat) clearTimeout(ui.combat.timer);
  const t = $('toast');
  if (t && t.classList.contains('unten')) t.classList.remove('show', 'unten', 'anim');
  ui = { sel: null, army: null, mode: null, botTimer: null };
  lockBar();
  const panel = $('tut-panel');
  if (panel) panel.hidden = true;
  document.body.classList.remove('tut', 'fg');
  document.querySelectorAll('.fg-hl').forEach(el => el.classList.remove('fg-hl'));
}
/* Erstes Spiel (v92): Jede Aktion fragt vorher die Schienen (fgErlaubt in js/firstgame.js).
   Abgelehnt wird mit einem Satz, warum – gesperrt wird nichts. Ohne Erstes Spiel: immer frei. */
const fgDarf = a => !ui || !ui.fg || typeof fgErlaubt !== 'function' || fgErlaubt(a);
// Welche Aktion ein Knopf im Aktionsblatt auslöst – nach seinem deutschen Schlüssel
const FG_AKTION = {
  'Kostenlos wachsen': 'wachsen', 'Bevölkerungswachstum': 'wachsen', 'Weltwunder bauen': 'wunder',
  'Armee bauen': 'armee', 'Bevölkerung opfern': 'opfern', 'Armee bewegen': 'waehlen',
  'Feld beanspruchen': 'feld', 'Atomschlag auf dieses Feld': 'atom',
  'Straße bauen': 'strasse', 'Eisenbahn bauen': 'strasse',
};
function tapHex(r, c) {
  if (ui.anim) return endAnim();        // … ebenso den Rest eines KI- oder Bot-Zugs (v94)
  if (ui.combat) return endCombat();    // ein Tipp auf die Karte überspringt das Nachspiel (v90)
  if (S.over || isAuto(P(S))) return;
  ui.powerView = false;                 // ein Feld antippen beendet die Machtansicht
  if (ui.army) {
    if (ui.fg && armyReach(S, ui.army).has(key(r, c)) && !fgDarf({ art: 'ziehen', army: ui.army, r, c })) return;
    const army = ui.army;
    const e = moveArmy(S, army, r, c);
    if (e) { toast(e); } else {
      ui.army = null; ui.sel = [r, c]; redraw();
      // v80: wer in eine Kontrollzone zieht, hält an – das soll man sehen, nicht nur im Protokoll lesen
      if (army.halted) toast(T('Kontrollzone – die Armee hält für diesen Zug an.'));
      return;
    }
  }
  ui.sel = [r, c]; redraw();
  if (ui.mode === 'found') foundSheet(r, c); else openTile(r, c);
}
function mp(a) { return T('Bewegung %s', LANG === 'de' ? String(a.mp).replace('.', ',') : String(a.mp)); }
const Y_ICON = ['🔬', '🌾', '🪙'];
const fmtY = y => y.map((n, i) => n + Y_ICON[i]).join(' ');
/* Kosten am Knopf (v82, Wunsch des Autors). Ab Werk steht dort, was TATSÄCHLICH abgeht:
   Gründen für 10 Nahrung mit 8 im Vorrat zeigt „8🌾 4🪙", weil die fehlenden 2 Nahrung
   in Münzen bezahlt werden. Gerechnet von costPaid – derselben Rechnung, mit der
   bezahlt wird (Gilden, England, Alchemie, Bürgerkrieg … stecken also schon drin).
   `alt` ist der Text, der bis v81 dastand. Er bleibt, wenn
   · nichts umgetauscht wird (dann sind beide gleich, und Knöpfe wie Kacheln behalten ihr
     gewohntes Bild – auch die Zahl ohne Zeichen im Technologiebogen),
   · es gar nicht reicht (dann ginge nichts ab; der Preis selbst sagt, was fehlt).
   Den Schalter „Kosten ohne Umtausch anzeigen" (v82–v101) gibt es nicht mehr.
   Reihenfolge: erst die Arten des Preises, dann was einspringt.
   Im Technologiebogen nur auf Kacheln, die man jetzt erforschen könnte – auf den übrigen
   wäre die Rechnung hypothetisch. Die Karte im Gründungsmodus zeigt weiter den Preis. */
const COST_ICON = { sci: '🔬', food: '🌾', coins: '🪙' };
function costText(cost, alt, opts) {
  if (!S || S.over) return alt;
  return paidText(cost, costPaid(S, S.cur, cost, opts), alt);
}
/* Das Formatieren allein: `paid` ist, was von jedem Vorrat abgeht (oder null, wenn es nicht
   reicht). Seit v87 eigens, weil „Alle Städte wachsen" auch nur einen Teil der Städte wachsen
   lassen kann – dessen `paid` kommt aus growAllPlan, nicht aus costPaid über eine Summe. */
function paidText(cost, paid, alt) {
  if (!paid) return alt;
  const eigen = COST_ORDER.filter(k => cost[k] > 0);
  if (COST_ORDER.every(k => (paid[k] || 0) === (cost[k] || 0))) return alt;
  const reihe = eigen.concat(['food', 'coins', 'sci'].filter(k => !eigen.includes(k)));
  return reihe.filter(k => paid[k] > 0).map(k => paid[k] + COST_ICON[k]).join(' ') || alt;
}
const fmtGain = g => [g.sci, g.food, g.coins]
  .map((n, i) => (n > 0 ? '+' : '') + n + Y_ICON[i]).join(' ');
/* Was eine Stadt auf diesem Feld dem Reich einbrächte – nur dort, wo der Platz taugt
   (foundSiteError). Fehlt bloß die Nahrung, steht der Ertrag trotzdem da: gerade dann
   will man wissen, ob sich das Sparen lohnt. Wo gar nicht gegründet werden kann, wäre
   die Zahl eine Antwort auf eine Frage, die sich nicht stellt.
   Der Wert kommt aus settleGain: Umland, Fähigkeiten, Wunder und der eine mitessende
   Bevölkerungspunkt sind darin verrechnet, überlappendes Umland zählt nicht doppelt. */
function settleFact(r, c) {
  const pi = S.cur;
  if (foundSiteError(S, pi, r, c)) return '';
  const g = settleGain(S, pi, r, c);
  return `<div class="tile-facts">
    <span class="fact"><span class="fact-k">${T('Ertrag beim Siedeln')}</span>
      <span class="fact-v">${fmtGain(g)}</span></span></div>`;
}
/* Gründungsblatt (v75): im Gründungsmodus öffnet ein Feld dieses Blatt statt des
   Feldblatts – Kosten, Ertrag beim Siedeln und der Knopf „Hier gründen". Geht es nicht,
   steht der Grund am gesperrten Knopf. Nach dem Gründen endet der Modus. */
function foundSheet(r, c) {
  const pi = S.cur, t = terrainAt(S, r, c);
  if (!t || isOff(t)) return closeSheet();
  const cost = foundCost(S, pi, r, c), err = canFound(S, pi, r, c);
  const id = 'hier' + Math.random().toString(36).slice(2, 6);
  sheet(`<h3>${T('Stadt gründen')} · ${TERRAIN[t].name}</h3>
    <p class="sub">${T('Feld %s/%s · Ertrag', r, c)} ${fmtY(tileYieldAt(S, pi, r, c))}</p>` +
    settleFact(r, c) +
    `<button class="opt" id="${id}" data-label="Hier gründen" ${err ? 'disabled' : ''}>` +
    `<span>${T('Hier gründen')}<small>${err || T('Grundkosten + Distanz zur Hauptstadt (über passierbare Felder)')}</small></span>` +
    `<span class="cost">${cost === Infinity ? '—' : costText({ food: cost }, cost + '🌾')}</span></button>`);
  $(id).onclick = () => {
    if (!fgDarf({ art: 'gruenden', r, c })) return;
    const e = foundCity(S, pi, r, c);
    if (e) return toast(e);
    ui.mode = null;
    closeSheet(); redraw();
  };
}
function openTile(r, c) {
  const pi = S.cur, p = P(S);
  const t = terrainAt(S, r, c);
  if (!t) return closeSheet();
  const city = cityAt(S, r, c), army = armyAt(S, r, c);
  const rows = [], handlers = [];
  /* Der erste Parameter ist der **deutsche** Text: er wird hier übersetzt und zusätzlich
     als `data-label` mitgegeben. Daran erkennt das Tutorial seine Knöpfe – es prüft
     Beschriftungen mit deutschen Ausdrücken, und die passen sonst nicht mehr, sobald die
     Oberfläche auf Englisch steht (dann war „Stadt gründen" gesperrt und das Tutorial
     hing fest). */
  const btn = (label, sub, cost, fn, off) => {
    const id = 'x' + (handlers.length + 1) + Math.random().toString(36).slice(2, 6);
    rows.push(`<button class="opt" id="${id}" data-label="${label}" ${off ? 'disabled' : ''}>` +
      `<span>${T(label)}${sub ? `<small>${sub}</small>` : ''}</span>` +
      `<span class="cost">${cost || ''}</span></button>`);
    // Erstes Spiel: erst die Schienen fragen (v92)
    const aktion = { art: FG_AKTION[label] || label, r, c, city, army, mode: label === 'Kostenlos wachsen' ? 'free' : 'paid' };
    handlers.push([id, () => { if (fgDarf(aktion)) fn(); }]);
  };
  /* Fast jede Aktion im Aktionsblatt endet gleich: Fehler melden oder neu zeichnen,
     danach dasselbe Feld wieder öffnen – dann stehen die Preise und Zustände frisch
     im Blatt (nach dem Straßenbau kostet der Ausbau weniger, nach dem Wachsen ist die
     Stadt größer). Die Zeile stand vorher fünfmal wortgleich da. */
  const act = fn => () => {
    const e = fn();
    if (e) toast(e); else redraw();
    openTile(r, c);
  };
  // Gegründet wird seit v75 über „Stadt gründen" in der Leiste, nicht mehr hier. Taugt
  // das Feld als Platz, sagt ein Satz, wo es langgeht.
  let head = `<h3>${TERRAIN[t].name}</h3><p class="sub">${T('Feld %s/%s · Ertrag', r, c)} `
    + fmtY(tileYieldAt(S, pi, r, c)) + '</p>' +
    (!city && !army && !foundSiteError(S, pi, r, c)
      ? `<p class="sub">${T('Hier ließe sich eine Stadt gründen – über „Stadt gründen" in der Leiste.')}</p>` : '');

  if (city) {
    if (ui.fg && typeof fgSieht === 'function') fgSieht('stadt', city);
    const owner = civOf(S.players[city.owner]);
    const wl = (S.wonders || []).filter(w => w.cityId === city.id);
    head = `<h3>${owner.n}${city.cap ? ' · ' + T('Hauptstadt') : ''}</h3>
      <p class="sub">${T('Bevölkerung %s · Verteidigung %s', city.pop, defenseValue(S, city))}</p>` +
      (wl.length ? `<div class="wlist">${wl.map(w =>
        `<span class="wtag">◈ ${WONDER_BY_KEY[w.k].n} (${T('Stufe %s', w.lvl)})</span>`).join('')}</div>` : '');
    if (city.owner === pi) {
      if (freeGrowthAvailable(S, pi, city))
        btn('Kostenlos wachsen', T('auf %s · Verbundwerkstoffe', city.pop + 1), T('gratis'),
          act(() => growCity(S, pi, city, 'free')));
      const pc = growPrice(S, pi, city);
      const perr = canGrowPaid(S, pi, city);
      btn('Bevölkerungswachstum', perr || T('auf %s', city.pop + 1), costText(pc, `${pc.food}🌾 ${pc.coins}🪙`),
        act(() => growCity(S, pi, city, 'paid')), !!perr);
      if (S.wo) {
        const wcost = wonderCost(S, pi);
        const full = wondersInCity(S, city).length >= 2;
        const any = availableWonders(S).some(w => !canBuildWonder(S, pi, city, w.k));
        btn('Weltwunder bauen', full ? T('diese Stadt hat schon zwei Wunder')
          : any ? T('%s/2 in dieser Stadt', wondersInCity(S, city).length)
            : T('nichts baubar (Münzen oder Stufenregel)'), costText({ coins: wcost }, `${wcost}🪙`),
          () => wonderSheet(city), full || !any);
      }
      const ac = armyCost(S, pi);
      // payOpts, nicht die nackte Münzprüfung: im Bürgerkrieg zählt auch Nahrung mit.
      const civil = payOpts(S, pi).foodOk;
      btn('Armee bauen', civil ? T('Bürgerkrieg: auch mit Nahrung zahlbar')
        : T('muss die Stadt noch verlassen'), costText({ coins: ac }, `${ac}🪙`, payOpts(S, pi)),
        act(() => buildArmy(S, pi, city)),
        available(S, pi, 'coins', payOpts(S, pi)) < ac || !!armyAt(S, r, c));
      if (slaveryUsable(p))
        btn('Bevölkerung opfern', city.sacrificed === S.round ? T('diese Runde schon geopfert') : TECH_BY_KEY.sklaverei.n, '+' + SLAVERY_COINS + '🪙',
          act(() => sacrifice(S, pi, city)),
          city.pop < 2 || city.sacrificed === S.round);
      /* Armee in der Stadt: derselbe Knopf wie auf freiem Feld (v103, Anweisung des Autors – bis
         v102 „Armee hier bewegen" und „Diese Armee bewegen"). Darunter steht nur noch, was gilt
         („muss die Stadt noch verlassen"), nicht mehr, was der Knopf tut. */
      if (army && army.owner === pi)
        btn('Armee bewegen', army.born === S.round ? T('muss die Stadt noch verlassen') : '', mp(army),
          () => { ui.army = army; closeSheet(); redraw(); toast(T('Zielfeld antippen')); }, army.mp <= 0);
    } else {
      const atk = attackersOn(S, pi, city).length;
      const sk = S.sieges[pi + '|' + city.id] || 0;
      rows.push(`<p class="sub">${T('Deine Armeen in Reichweite: %s · Angriffswert %s', atk, attackValue(S, pi, atk))}
        ${sk ? ' · ' + T('Belagerung %s/2', sk) : ''}</p>`);
    }
  } else if (army) {
    const owner = civOf(S.players[army.owner]);
    head = `<h3>${T('Armee')} · ${owner.n}</h3><p class="sub">${T('Angriffswert %s', powerOf(S, army.owner))} · ${mp(army)}</p>`;
    if (army.owner === pi)
      btn('Armee bewegen', army.halted ? T('Kontrollzone – hält bis zum nächsten Zug') : '', '',
        () => { ui.army = army; closeSheet(); redraw(); toast(T('Zielfeld antippen')); }, army.mp <= 0);
  } else {
    /* Kolonialismus (v103): kostenlos, COLONY_CLAIMS-mal je Runde. Rechts stehen statt eines
       Preises die Ansprüche dieser Runde als Punkte (gefüllt = offen); sind sie verbraucht, ist
       der Knopf gesperrt und alle Punkte leer – ein Satz dazu wäre doppelt. */
    if (has(p, 'kolonialismus')) {
      const owned = S.players.some((_, i) => controlledTiles(S, i).has(key(r, c)));
      const offen = claimsLeft(S, pi);
      btn('Feld beanspruchen', owned ? T('nur herrenlose Felder') : '', pips(offen, COLONY_CLAIMS),
        act(() => claimTile(S, pi, r, c)), owned || !offen);
    }
  }
  if (has(p, 'atomwaffen')) {
    // Atomwaffenproteste sperren den Einsatz dauerhaft – dann ist der Knopf auch aus
    const banned = evNukeBan(S, pi);
    btn('Atomschlag auf dieses Feld',
      banned ? T('durch Atomwaffenproteste dauerhaft gesperrt')
        : p.nuked ? T('diese Runde schon eingesetzt')
          : T('zerstört alle Armeen hier und ringsum, auch eigene'), '☢︎',
      () => {
        toast(nuke(S, S.cur, r, c) || T('Atomschlag ausgeführt'));
        redraw(); openTile(r, c);
      }, p.nuked || banned);
  }
  // Die Stufen kommen aus roadTargets, nicht aus einer eigenen Rechnung – sonst weicht
  // das Blatt von dem ab, was buildRoad erlaubt (Eisenbahn ohne Rad war so unbaubar).
  if (canBuildRoads(p) && !city) {
    const ziele = roadTargets(S, pi, r, c);
    const lvl = roadLevel(S, r, c);
    if (!ziele.length) {
      // Nichts baubar – trotzdem anzeigen, damit der Grund sichtbar ist.
      btn(lvl >= 1 ? 'Eisenbahn bauen' : 'Straße bauen',
        lvl >= 2 ? T('hier liegt schon eine Eisenbahn') : T('Eisenbahn noch nicht erforscht'),
        '–🪙', () => { }, true);
    } else ziele.forEach(z => {
      btn(z === 2 ? 'Eisenbahn bauen' : 'Straße bauen',
        // die Zuschläge aus der Regel (seit v96 Eisenbahn +4, bis v95 +2)
        z === 2 ? T('Bewegung kostenlos · Handelsroute +%s', TRADE_RAIL_BONUS) : T('Bewegung ½ Punkt · Handelsroute +%s', TRADE_ROAD_BONUS),
        costText({ coins: roadPrice(S, pi, r, c, z) }, roadPrice(S, pi, r, c, z) + '🪙'),
        () => doRoad(r, c, z), available(S, pi, 'coins') < roadPrice(S, pi, r, c, z));
    });
  }
  sheet(head + rows.join(''));
  handlers.forEach(([id, fn]) => { const el = $(id); if (el) el.onclick = fn; });
}
function doRoad(r, c, ziel) {
  // Die Zielstufe kommt vom Knopf. Der Preis wird von buildRoad frisch bestimmt –
  // wer erst die Straße baut und dann im selben Blatt die Eisenbahn, zahlt für den
  // Ausbau nur noch 1 statt 2. Deshalb muss das Blatt danach neu gezeichnet werden,
  // sonst steht am Knopf noch der alte Preis.
  const target = ziel || roadTarget(S, S.cur, r, c);
  if (!target) return toast(T('Hier lässt sich nichts weiter bauen.'));
  const e = buildRoad(S, S.cur, r, c, target);
  toast(e || (target === 2 ? T('Eisenbahn gebaut') : T('Straße gebaut')));
  redraw();
  openTile(r, c);
}


/* Wie viele Menschen spielen mit? Nur dann lohnt die Anzeige, wer eine Technologie
   erforschen KÖNNTE – Bots kennen keine Verfügbarkeiten, sie würfeln frei aus dem Pool. */
function humanCount(S) { return S.players.filter(p => (p.kind === 'human' || p.kind === 'ki') && !p.dead).length; }
/* Marken an einer Technologiekachel: wer sie hat, wer sie erforschen könnte – zwei sehr
   verschiedene Dinge (erledigte Tatsache gegen bloße Möglichkeit), die vorher kaum zu
   unterscheiden waren (gleiches Symbol, gleiche Farbe, nur der Ring gestrichelt statt
   durchgezogen). Jetzt ist „hat sie" eine **ausgefüllte** Marke in der Reichsfarbe mit
   hellem Symbol, „könnte sie" eine **leere** Marke mit farbigem Symbol auf Papier und
   einem kleinen Fragezeichen. Voll gegen leer trägt auch bei 16 px und in Graustufen. */
function ownerMark(civ, art, self) {
  const hat = art === 'hat';
  const stil = hat
    ? `background:${civ.color};border-color:${civ.color};color:#fff`
    : `color:${civ.color};border-color:${civ.color}`;
  const titel = hat ? T('%s%s hat sie erforscht', civ.n, self ? ' (du)' : '')
    : T('%s könnte sie erforschen', civ.n);
  return `<span class="owner-mark ${hat ? 'has' : 'can'}${self ? ' self' : ''}"
    style="${stil}" title="${titel}">${SYM[civ.sym]}${hat ? '' : '<i>?</i>'}</span>`;
}
function ownerMarks(S, techKey, pi) {
  const mehrere = humanCount(S) > 1;
  const marks = S.players.map((pl, i) => {
    if (pl.dead) return '';
    const civ = civOf(pl), self = i === pi;
    if (pl.techs[techKey]) return ownerMark(civ, 'hat', self);
    // Verfügbar bei einem anderen Menschen – die eigene Verfügbarkeit sieht man an der Kachel
    if (mehrere && !self && (pl.kind === 'human' || pl.kind === 'ki') && pl.avail && pl.avail[techKey])
      return ownerMark(civ, 'kann', false);
    return '';
  }).join('');
  return marks ? `<span class="owner-marks">${marks}</span>` : '';
}
/* Kompakte Ertragsübersicht (Inspiration: Ozymandias). Je Geländetyp ein farbiger
   Punkt, Feldanzahl und der Beitrag zu Wissenschaft/Nahrung/Münzen; darunter die
   Bevölkerung und die Gesamtsumme. Zeigt das Einkommen des laufenden Zugs. */
const YIELD_ICON = ['🔬', '🌾', '🪙'];
const TERRAIN_GLYPH = { G: '🌿', W: '🌲', B: '⛰️', F: '💧', M: '🌊', I: '🏝️' };
function yieldRow(label, glyph, color, count, y, opts = {}) {
  const cells = y.map((n, i) => n
    ? `<span class="yv"><span class="yi">${YIELD_ICON[i]}</span>${n}</span>`
    : `<span class="yv zero">·</span>`).join('');
  return `<div class="yrow ${opts.cls || ''}">
    <span class="yl"><span class="ydot" style="background:${color}">${glyph}</span>
      <span class="yname">${label}</span>${count != null ? `<span class="ycount">×${count}</span>` : ''}</span>
    <span class="yvals">${cells}</span></div>`;
}
function yieldOverview(S, pi) {
  const b = incomeBreakdown(S, pi);
  let h = `<div class="yield-panel"><h4 class="yhead">${T('Ertrag nächster Zug')}</h4>`;
  for (const r of b.rows)
    h += yieldRow(r.name, TERRAIN_GLYPH[r.key] || '▪', TERRAIN[r.key].color, r.count, r.y);
  for (const e of (b.extra || []))
    h += yieldRow(e.name, e.glyph || '✦', '#c8a86a', e.count, e.y);
  h += yieldRow(T('Bevölkerung'), '👥', '#c8b98a', b.pop.count, b.pop.y, { cls: 'pop' });
  h += yieldRow(T('Summe'), '∑', '#6b5d47', null, b.total, { cls: 'sum' });
  // Vorschau: kein Einkommen, sondern was die Armeen zu Zugende erbeuten (Wikinger)
  for (const e of (b.preview || []))
    h += yieldRow(e.name, e.glyph || '⚔︎', '#b08a4a', null, e.y, { cls: 'prev' });
  h += '</div>';
  return h;
}
