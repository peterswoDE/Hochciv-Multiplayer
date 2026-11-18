/* js/ui/boot.js – Start: Sprache, Menü, Verdrahtung der Knöpfe, Regeln, Laden und Speichern.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------------------------ Start */
/* ---------------------------------------------------------------- Sprache
   Der feste Text aus index.html wird beim Start einmal eingesammelt (deutsche Fassung
   als Schlüssel) und beim Sprachwechsel neu gesetzt. Dynamische Texte laufen ohnehin
   durch T(); für sie genügt ein Neuzeichnen. */
let staticText = null;
function collectStatic() {
  staticText = [];
  const walk = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.nodeValue.trim();
    if (!t || t.length < 2) continue;
    if (n.parentNode && /SCRIPT|STYLE/.test(n.parentNode.nodeName)) continue;
    staticText.push([n, n.nodeValue]);
  }
}
function applyStaticLang() {
  if (!staticText) return;
  staticText.forEach(([n, de]) => {
    if (!n.parentNode) return;                 // inzwischen neu gezeichnet
    const roh = de.trim();
    // Schlüssel ohne Zeilenumbrüche und Einrückung – im Markup umbrochene Sätze sollen
    // im Wörterbuch als ein Satz stehen.
    const neu = T(roh.replace(/\s+/g, ' '));
    n.nodeValue = de.replace(roh, neu);
  });
}
function langRow() {
  const box = $('m-lang');
  if (!box) return;
  box.innerHTML = LANGS.map(l =>
    `<button class="lang-btn${l.k === LANG ? ' on' : ''}" data-lang="${l.k}"
       title="${l.n}" aria-label="${l.n}">${l.flag}</button>`).join('');
  box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => switchLang(b.dataset.lang));
}
function switchLang(k) {
  if (k === LANG) return;
  setLang(k);
  document.documentElement.lang = k;
  applyStaticLang();
  langRow();
  bootTexts();
  // was gerade offen ist, neu zeichnen
  if (S && $('screen-game').classList.contains('show')) redraw();
  if ($('screen-setup').classList.contains('show')) setupScreen();
  if ($('screen-editor').classList.contains('show')) editorScreen();
  closeModal(); closeSheet();
}
/* Ein gespeichertes Spiel (v102): „Spiel fortsetzen" steht oben und trägt den roten Knopf,
   sonst „Erstes Spiel". */
function menuButtons() {
  const saved = !!load('hochciv.save');
  $('m-continue').hidden = !saved;
  $('m-continue').classList.toggle('primary', saved);
  $('m-first').classList.toggle('primary', !saved);
}
/* Texte, die boot() einmalig setzt – beim Sprachwechsel dieselben Zeilen erneut. */
function bootTexts() {
  const ver = $('m-version');
  if (ver) ver.textContent = APP_VERSION;
}

function boot() {
  initLang();
  document.documentElement.lang = LANG;
  collectStatic();
  applyStaticLang();
  langRow();
  loadMyMaps();
  loadPrefs();
  store('hochciv.yields', null);     // Wahl des Umschalters „Erträge" (v75–v86) – entfallen
  store('hochciv.opts', null);       // Module (bis v101) – stehen seit v102 direkt im Aufbau
  store('hochciv.noturn', null);     // „Hochkant drehen: aus" (bis v101) – seit v102 immer an
  menuButtons();
  bootTexts();

  $('m-new').onclick = () => { show('screen-setup'); setupScreen(); };
  // Erstes Spiel (v92): eine ganze Partie mit Zielen und Tipps, ganz oben im Menü
  $('m-first').onclick = () => fgStart();
  // Das Panel des Ersten Spiels: Tipp, Beenden
  $('tut-next').onclick = () => { if (ui.fg) fgNavKnopf(); };
  $('tut-quit').onclick = () => { if (ui.fg) fgBeenden(); };
  $('m-editor').onclick = () => { editMap = null; show('screen-editor'); editorScreen(); };
  $('m-rules').onclick = () => rulesModal();
  // migrateState: Spielstände von vor v82 behalten ihren Techtree (S.altTree → S.oldTree)
  // Ein Erstes Spiel geht mit Führung weiter (fgFortsetzen liest S.fg)
  $('m-continue').onclick = () => { endTutorialPanel(); S = migrateState(load('hochciv.save')); fgFortsetzen(); startGameScreen(); };
  $('m-load').onclick = () => upload(txt => {
    try { endTutorialPanel(); S = migrateState(JSON.parse(txt)); fgFortsetzen(); saveGame(); startGameScreen(); toast(T('Spielstand geladen')); }
    catch { toast(T('Datei nicht lesbar')); }
  });
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('screen-menu'));
  $('ov-close').onclick = closeModal;
  $('overlay').onclick = e => { if (e.target === $('overlay')) closeModal(); };
  $('sheet-grip').onclick = closeSheet;
  // Frisch gezeigte Blätter (v89): vor dem onclick prüfen, danach den getippten Knopf vergessen
  $('sheet').addEventListener('click', sheetCalmGuard, true);
  $('sheet').addEventListener('click', () => { sheetCalm.tapped = null; });
  $('sheet-close').onclick = closeSheet;

  $('setup-go').onclick = () => {
    const players = startPlayers();      // Zufall auflösen, dann Ziffern und Farben
    if (!players.some(p => p.kind === 'human')) return toast(T('Mindestens eine menschliche Zivilisation.'));
    const duel = players.length === 2;
    const pick = $('setup-map').value;
    const startWahl = $('setup-start').value;
    const recipe = setupRecipe(pick, startWahl);
    const cfg = {
      players, duel, recipe,
      startPlayer: startWahl === 'zufall'
        ? Math.floor(Math.random() * players.length) : +startWahl,
      events: recipe.events, eventMode: recipe.eventMode,
      wonders: recipe.wonders,
      seatOrder: platzNummern(pick, players.length, setupRandom),     // Zugfolge nach Plätzen (v90)
      tileShape: tileShapeOf(pick),                                 // 14 Dreiecke (v107)
    };
    endTutorialPanel();
    beginFromPick(cfg, pick);
  };
  $('a-tech').onclick = techModal;
  $('a-found').onclick = toggleFoundMode;
  $('a-power').onclick = powerSheet;
  $('a-abil').onclick = () => abilSheet(true);
  // Welt (v102): über den Reichsnamen (▾) und die Bevölkerung – nicht mehr als Knopf der Leiste
  const zurWelt = () => { if (S && !document.body.classList.contains('blocked')) worldModal(); };
  $('hud-civ').onclick = zurWelt;
  $('hud-pop').onclick = zurWelt;
  $('hud-feed').onclick = () => { if (!isAuto(P(S)) && !S.over && !ui.combat) foodSheet(); };
  $('a-end').onclick = endHumanTurn;
  $('g-menu').onclick = () => {
    // Läuft gerade ein Kampf-Nachspiel (v90), ist es damit vorbei – wie mit einem Tipp auf die
    // Karte. So zeigt (und exportiert) das Menü nie den halben Zugwechsel.
    if (ui.combat) endCombat();
    // Das Menü (v102): Regeln, Protokoll, die eine Vorliebe (Animationen), Export, Ende.
    // „Hochkant drehen" ist immer an, die Einstellungen sind entfallen.
    const stufe = (k, n) => `<button data-anim="${k}"${prefs.anim === k ? ' class="on"' : ''}>${n}</button>`;
    modal(T('Menü'), `<button class="btn wide" id="mm-rules">${T('Regeln & Technologien')}</button>
      <button class="btn wide" id="mm-log">${T('Protokoll')}</button>
      <div class="mm-row"><span>${T('Animationen')}</span><div class="seg" id="mm-anim">${stufe('langsam', T('Langsam'))}${stufe('schnell', T('Schnell'))}${stufe('aus', T('Keine'))}</div></div>
      <button class="btn wide" id="mm-export">${T('Spielstand exportieren')}</button>
      <button class="btn wide" id="mm-quit">${T('Spiel beenden')}</button>`);
    $('mm-rules').onclick = rulesModal;
    $('mm-log').onclick = logModal;
    $('mm-anim').querySelectorAll('[data-anim]').forEach(b => b.onclick = () => {
      setAnim(b.dataset.anim);
      $('mm-anim').querySelectorAll('[data-anim]').forEach(x => x.classList.toggle('on', x === b));
    });
    $('mm-export').onclick = () => download('hochzeiv-spielstand.json', JSON.stringify(S));
    $('mm-quit').onclick = () => { store('hochciv.save', null); location.reload(); };
  };
  $('ed-save').onclick = () => editorSave();
  $('ed-publish').onclick = editorPublish;
  $('ed-maps').onclick = myMapsModal;
  $('ed-export').onclick = () => {
    const m = Object.assign({}, editMap, { name: edName() || T('Eigene Karte') });
    download(mapFileName(m), JSON.stringify(m, null, 1));
  };
  $('ed-import').onclick = () => importMapFile(m => editorLoad(m));
  $('ed-new').onclick = editorNewModal;
  $('ed-size').onclick = editorResize;
  $('ed-back').onclick = editorLeave;
  $('ed-undo').onclick = editorUndo;
  $('ed-redo').onclick = editorRedo;
  $('ed-more').onclick = () => $('screen-editor').classList.toggle('ed-open');
  $('ed-browse').onclick = () => { if (mapAccount && mapAccount.browse) mapAccount.browse(); };
  editorPointer();
  editorKeys();
  // Neu laden oder Tab schließen mit ungespeicherter Karte: der Browser fragt nach
  window.addEventListener('beforeunload', e => {
    if ($('screen-editor').classList.contains('show') && edDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  attachTaps($('map'), tapHex, kartenrandTipp);
  attachTaps($('pl-map'), plTap);
  $('pl-tech').onclick = placeTechView;
  $('pl-world').onclick = placeWorldView;
  $('pl-rot').onclick = placeRotate;
  $('pl-ok').onclick = placeConfirm;
  initOrientation();
  if ('serviceWorker' in navigator) swStart();
}
/* Offline-Cache (sw.js). Übernimmt eine neue Fassung, während das Menü offen ist, lädt die
   Seite neu (v106) – so kommt sie mit dem ersten Start nach dem Upload an, nicht erst mit dem
   zweiten. Mitten im Spiel nicht: dann beim nächsten Start. `vorher`: beim allerersten Einbau
   gab es keine alte Fassung, die zu ersetzen wäre. Die Einzeldatei hat keinen Service Worker
   (build_single.py nimmt den Aufruf heraus). */
function swStart() {
  const vorher = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (vorher && $('screen-menu').classList.contains('show')) location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
function startGameScreen() {
  show('screen-game');
  redraw();
  setBarHeight();
  if (isAuto(P(S))) setTimeout(runBots, 400);
  else setTimeout(humanTurnStart, 60);
}
/* Kurzregeln („Regeln & Technologien"). Die Abschnitte „Bewegung, Straßen und Eisenbahn"
   und „Kontrollzone (Schießpulver)" kamen mit v81 dazu – Wortlaut vom Autor freigegeben
   (2.10.); die Handelsrouten, vorher ein eigener Absatz, stehen jetzt im ersten davon.
   Jede Aussage dort ist an der Regelmaschine geprüft (moveCost, buildRoad, tradeRoutes,
   zocStop, arriveAt) – wer eine dieser Regeln ändert, ändert den Text mit. */
function rulesModal() {
  modal(T('Kurzregeln'), `
    <p class="sub">${T('Zugablauf')}</p>
    <ol style="font-size:14px;line-height:1.5;padding-left:20px">
      <li>${T('Einkommen aus allen Feldern rund um deine Städte plus Bevölkerung.')}</li>
      <li>${T('Macht halbiert sich (aufgerundet).')}</li>
      <li>${T('Aktionen in beliebiger Reihenfolge, beliebig oft.')}</li>
      <li>${T('Kampf: Angriff = Macht je Armee, Verteidigung = Bevölkerung + benachbarte Armeen. Zwei Züge in Folge stärker → Stadt erobert.')}</li>
      <li>${T('Sieg: Singularität · mehr als %s der Weltbevölkerung (UN %s, Theologie %s; geprüft am Ende jeder Runde, wenn alle gleich oft gezogen haben – dann endet das Spiel sofort) · gegnerische Hauptstadt · Weltwunder der Stufe 3. Außer beim Militärsieg endet das Spiel erst am Rundenende; mehrere Ansprüche entscheiden Punkte (Bevölkerung + Wunder + Technologien).',
        victoryLabels(S).base, victoryLabels(S).un, victoryLabels(S).theologie)}</li>
    </ol>
    <p class="sub">${T('Ressourcen gelten nur für den laufenden Zug – nur Macht bleibt liegen. 2 Münzen zählen als 1 Nahrung oder 1 Wissenschaft.')}</p>
    <p class="sub">${startBonusText()}</p>
    <p class="sub">${T('Die Nahrungsproduktion darf nicht negativ werden: Wachstum wird blockiert, sobald das Einkommen dadurch unter 0 fiele – gerechnet auf dem dauerhaften Wert, ein Ereignis dieser Runde zählt dafür nicht. Gentechnik und Massenmedien heben die Grenze auf: zu Zugbeginn ernährt jede Münze drei Bevölkerung, jede Wissenschaft eine – höchstens bis zur Höhe dessen, was die Bevölkerung isst, also kein allgemeiner Umtausch. Gentechnik bringt zusätzlich Nahrung ins Einkommen: je vier Wissenschaft eine.')}</p>
    <p class="sub">${T('Spielarten')}</p>
    ${spielartenHtml()}
    <p class="sub">${T('Bewegung, Straßen und Eisenbahn')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Jede Armee hat je Zug 3 Bewegungspunkte (mit Panzerschiff 6, mit Luftwaffe 9); ein Schritt aufs Nachbarfeld kostet 1. Armeen ziehen nicht auf Städte und nicht auf andere Armeen. Eine Armee, die in einer Stadt entsteht, muss sie im selben Zug verlassen.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Straßen (ab Rad) und Eisenbahnen (ab Eisenbahn, auch ohne Rad) baust du, indem du ein Feld antippst – auf Land, in deinem Gebiet oder auf herrenlosen Feldern, nicht auf Städten. Straße 1 Münze, Eisenbahn 2 Münzen, auf einer Straße 1.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Ein Schritt kostet ½, wenn beide Felder mindestens eine Straße haben, und nichts, wenn beide eine Eisenbahn haben: Auf einem zusammenhängenden Eisenbahnnetz kommt eine Armee mit übriger Bewegung beliebig weit. Ein Stadtfeld zählt als Straße bzw. Eisenbahn, sobald ein Nachbarfeld eine hat. Straßen und Eisenbahnen gehören niemandem – auch gegnerische Armeen fahren darauf.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Handelsrouten: jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden Weg mit ihr verbunden ist, bringt +%s auf alle drei Erträge – über eine reine Eisenbahn +%s. Gemischte Strecken zählen als Straße. Der Weg darf durch herrenloses und fremdes Gebiet führen; nur eine fremde Stadt unterbricht ihn.', TRADE_ROAD_BONUS, TRADE_RAIL_BONUS)} ${T('Mit Bürokratie zählt das doppelt.')}</p>
    <p class="sub">${T('Kontrollzone (Schießpulver)')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Mit Schießpulver hat jede deiner Armeen eine Kontrollzone: die sechs Felder ringsum, mit Raketentechnik auch den zweiten Ring. Mit Burgenbau gilt das auch für deine Städte.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Eine fremde Armee, die ein Feld in einer Kontrollzone betritt, hält dort an: Ihre übrige Bewegung verfällt für diesen Zug, auch auf Straße und Eisenbahn. Durch eine Kontrollzone kommt sie also nicht hindurch – eine Straße oder Eisenbahn, die hindurchführt, ist für sie dort unterbrochen.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Eine Armee, die ihren Zug in einer Kontrollzone beginnt, darf heraus; betritt sie dabei wieder ein Feld einer Kontrollzone, hält sie dort an. Die Luftwaffe ignoriert Kontrollzonen. Handelsrouten unterbrechen sie nicht.')}</p>
    <p class="sub">${T('Machtringe auf der Karte')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Ringe auf der Karte, ein Teilstück je Punkt: in der Farbe des Besitzers seine Verteidigung bzw. sein Machtwert, in fremder Farbe der Angriff bzw. die Flankierer. Überwiegt ein fremder Anteil, läuft die Belagerung bzw. fällt die Armee – bei Gleichstand hält der Verteidiger. Über %s Punkte nur noch als Anteil.', RING_MAX_PUNKTE)}</p>
    <p class="sub">${T('Geländeerträge je Feld')}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr style="color:var(--ink-soft);font-size:11px"><th align="left">${T('Feld')}</th><th>🔬</th><th>🌾</th><th>🪙</th></tr>
      ${Object.values(TERRAIN).filter(t => !t.off).map(t => `<tr style="border-top:1px solid var(--rule)">
        <td>${t.name}</td>${t.yield.map(n => `<td align="center">${n || '·'}</td>`).join('')}</tr>`).join('')}
      <tr style="border-top:1px solid var(--rule)"><td>${T('Stadt (je Bevölkerung)')}</td>
        <td align="center">1</td><td align="center">−1</td><td align="center">1</td></tr>
    </table>
    <p style="font-size:13px;margin:6px 0 4px">${T('Ertragstechnologien nennen, was ein Feld bzw. jede Bevölkerung damit insgesamt bringt. Für dasselbe Gelände und denselben Ertrag zählt nur die beste: Mit Mathematik bringt Wald 1 Wissenschaft, mit Elektrizität 2, mit Künstlicher Intelligenz 3 – auch mit allen dreien.')}</p>
    <p class="sub">${T('Zivilisationen — je drei wählbare Fähigkeiten (Bots haben keine)')}</p>
    ${CIVS.map(c => `<p style="font-size:13px;margin:6px 0"><b>${SYM[c.sym]} ${c.n}</b><br>` +
      c.abilities.map((a, j) => `<span style="color:var(--ink-soft)">${j === 0 ? T('Grund') : T('Alt. %s', j + 1)}:</span> ${abilEffect(Object.assign({ civ: c.k }, a), S)}`).join('<br>') +
      '</p>').join('')}
    <p class="sub">${T('Weltwunder (Erweiterung)')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Kosten 10/20/30/40 … für das 1./2./3./4. Wunder. Stufe 2 muss seltener sein als Stufe 1, Stufe 3 seltener als Stufe 2. Je Stadt zwei Wunder. Ein Wunder der Stufe 3 gewinnt zu Beginn des nächsten Zuges.')}</p>
    <p class="sub">${T('Ereignisse (Erweiterung)')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Zu Rundenbeginn wird gewürfelt: Zeile, dann Spalte. Hart trifft jede Runde, leicht etwa jede zweite. Bots sind nie betroffen.')}</p>
    <p class="sub">${T('Alle Technologien')}</p>
    <p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${T('Kosten links, Wirkung rechts. Verfügbar wird eine Technologie erst, wenn sie ausgewürfelt ist.')}</p>
    ${oldTreeShown() ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${T('In dieser Partie gilt noch der alte Techtree.')}</p>` : ''}
    ${S && S.marathon ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${T('Marathon: Technologien kosten je Zeitalter das Zwei-, Drei-, Vier- und Fünffache, die Singularität %s – die Kosten hier sind schon umgerechnet. Griechenlands Günstige Forschung und die Wissenschaftliche Methode ziehen doppelt ab. Militärsieg erst mit %s eroberten Hauptstädten; eine eroberte Hauptstadt ist danach eine gewöhnliche Stadt, ihr altes Reich spielt ohne Hauptstadt weiter.', MARATHON_SINGULARITY, MARATHON_CAPITALS)}</p>` : ''}
    ${FIELDS.map((fn, f) => `<p class="rule-field">${fn}</p>` +
      AGES.map((an, a) => {
        const list = techsIn(f, a, S);
        if (!list.length) return '';
        return `<p class="rule-age">${an}</p>` + list.map(t =>
          // der ganze Text (v96): hier steht, was die Bürokratie mitverdoppelt, auf den Kacheln nicht
          `<div class="rule-tech"><span class="c">${techBase(S, t)}</span><b>${t.n}</b><i>${techEffectFull(t, S)}</i></div>`).join('');
      }).join('')).join('')}
    <p class="rule-field">${T('Sieg')}</p>
    <div class="rule-tech"><span class="c">${techBase(S, SINGULARITY)}</span><b>${SINGULARITY.n}</b>
      <i>${SINGULARITY.e}</i></div>`);
}
/* Die Spielarten in den Regeln (v102): was bis v101 als Hinweis unter dem Aufbau stand. Alle
   Zahlen kommen aus den Tabellen (VICTORY_THRESHOLDS, MARATHON_…) – kein Bruch steht hier fest. */
function spielartenHtml() {
  const zeile = (titel, text) => `<p style="font-size:13px;margin:4px 0"><b>${titel}</b> · ${text}</p>`;
  const sieg = m => T('Wirtschaftssieg über %s der Weltbevölkerung (Theologie %s, Vereinte Nationen %s).',
    victoryLabels(m).base, victoryLabels(m).theologie, victoryLabels(m).un);
  return zeile(T('Vier Reiche'), sieg('vier')) +
    zeile(T('Drei Reiche'), T('Immer die Plättchenkarte.') + ' ' + sieg('drei')) +
    zeile(T('1 gegen 1'), T('Immer die Plättchenkarte aus sechs Dreiecken.') + ' ' + sieg('duell')) +
    zeile(T('Marathon'), T('Vier Reiche auf einer Zufallskarte, viermal so groß wie die Originalkarte. Technologien kosten je Zeitalter das %s-Fache, die Singularität %s; Griechenlands Rabatt und die Wissenschaftliche Methode zählen %s-fach. Der Militärsieg verlangt %s eroberte Hauptstädte. Vor dem ersten Zug draften alle ihre Fähigkeiten: je zwei, in Schlangenreihenfolge.',
      MARATHON_TECH_FACTOR.join('/'), MARATHON_SINGULARITY, MARATHON_DISCOUNT_FACTOR, MARATHON_CAPITALS)) +
    zeile(T('Plättchenkarte'), T('Plättchenkarte: die offenen Dreiecke liegen gleich, das eigene legt jede*r selbst – Lage wählen, Hauptstadt setzen, verdeckt.').replace(/^[^:]*:\s*/, '') + ' ' +
      T('Jeder Platz wählt frei, auch zweimal dieselbe Zivilisation; Doppelte bekommen Ziffern und eine eigene Farbe. Gezogen wird in der Reihenfolge der Plätze.')) +
    zeile(TILE_SHAPES.tri14.name, T('Experimentell, vier Reiche: alle zehn Dreiecke liegen offen, die vier Startdreiecke außen an jeder zweiten Kante.')) +
    zeile(T('KI'), T('Die KI spielt nach denselben Regeln wie ein Mensch: sie bezahlt alles, hat ihre Zivilisationsfähigkeit, und Ereignisse treffen sie.'));
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function upload(cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
  i.onchange = () => { const f = i.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => cb(rd.result); rd.readAsText(f); };
  i.click();
}
boot();
