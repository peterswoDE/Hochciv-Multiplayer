/* js/ui/setup.js – Aufbau: Module, Vorlieben, Plätze, Karte, Start.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------ Die eine Vorliebe: Animationen
   Bis v101 gab es einen Bildschirm „Einstellungen" mit vier Schaltern. Seit v102 (Anweisung
   des Autors) bleibt nur, wie Züge von KI und Bots gezeigt werden – im Spielmenü (☰).
   Ereignisse und Weltwunder wählt man direkt im Aufbau, je Partie; Kosten zeigen immer, was
   tatsächlich abgeht (costText), und gedreht wird im Hochformat immer.

   `anim` (v95; v94 hatte das Häkchen `noAnim`): 'langsam' (ab Werk), 'schnell' oder 'aus'
   (wieder als Blatt mit „Weiter"). Ein von v94 gespeichertes `noAnim: true` wird zu 'aus'. */
const PREF_KEY = 'hochciv.prefs';
const ANIM_STUFEN = ['langsam', 'schnell', 'aus'];
const prefs = { anim: 'langsam' };
function loadPrefs() {
  const o = load(PREF_KEY) || {};
  prefs.anim = ANIM_STUFEN.includes(o.anim) ? o.anim : o.noAnim ? 'aus' : 'langsam';
}
function setAnim(k) {
  prefs.anim = ANIM_STUFEN.includes(k) ? k : 'langsam';
  store(PREF_KEY, prefs);
}
// Die Ereignisstärke gehört zu den Ereignissen und hängt an deren Häkchen.
function evmodeRow() { $('setup-evmode-row').hidden = !$('setup-events').checked; }
/* Der alte Techtree (bis v81 Standard) ist seit v82 nicht mehr wählbar – die Zeile im Aufbau
   ist weg. Er lebt nur in Partien weiter, die vor v82 mit ihm begonnen wurden (migrateState).
   Für solche Partien nennen Weltblatt und Regelbogen ihn. Der Text kommt aus OLD_TECH_COSTS,
   damit er nicht veraltet. */
function oldTreeText() {
  return FIELDS.map((fn, f) => {
    const liste = Object.keys(OLD_TECH_COSTS).map(k => TECH_BY_KEY[k]).filter(t => t.f === f)
      .sort((a, b) => OLD_TECH_COSTS[a.k] - OLD_TECH_COSTS[b.k]);
    return liste.length ? liste.map(t => `${t.n} ${OLD_TECH_COSTS[t.k]}`).join(', ') + ` (${fn})` : '';
  }).filter(Boolean).join(' · ');
}
const oldTreeShown = () => !!(S && S.oldTree);

/* ------------------------------------------------------------------ Aufbau */
/* Aufbau (Mehrspieler-Erweiterung): erst die Karte, dann die Zahl der Reiche (2–8, so viele, wie die Karte
   zulässt – mapLimits in engine.js), dann die Plätze. Die festen Spielarten „Vier Reiche",
   „Drei Reiche", „1 gegen 1" und „Marathon" sind darin aufgegangen: das Duell ist eine
   Partie zu zweit (auf jeder Karte), der Marathon ein Eintrag im Kartenmenü bzw. eine
   Einstellung einer eigenen Karte. „Zufällige Nationen für alle" lost jedem Platz
   Zivilisation und Fähigkeit aus. */
let setupN = 4;                   // gewünschte Zahl der Reiche (die Karte kann sie begrenzen)
let setupRandom = false;          // alle Plätze ausgelost
/* Die zuletzt bewusst gewählte Karte: '0' (feste Karte), 'plaettchen', 'marathon'
   (Standard-Marathon, Zufallskarte) oder eine eigene ('karte:<Name>'). */
let setupMapWanted = '0';
const setupCustomMap = () => (typeof setupMapWanted === 'string' && setupMapWanted.startsWith(MY_MAP_PICK))
  ? myMap(setupMapWanted.slice(MY_MAP_PICK.length)) : null;
const setupLimits = () => mapLimits(setupMapWanted, setupCustomMap());
const setupCount = () => { const l = setupLimits(); return Math.max(l.min, Math.min(l.max, setupN)); };
const setupIsMarathon = () => setupLimits().marathon;
// Spielart fürs Rezept („Nochmal spielen") – dieselben Namen wie in älteren Rezepten
const setupModeName = () => setupIsMarathon() ? 'marathon'
  : ({ 2: 'duell', 3: 'drei', 4: 'vier' })[setupCount()] || 'reiche';
/* Die alten Spielarten von außen setzen (Tests, ältere Rezepte): 'vier' / 'drei' / 'duell'
   setzen die Zahl der Reiche, 'marathon' die Standard-Marathonkarte. */
function setupSetMode(mode) {
  if (mode === 'marathon') { setupMapWanted = 'marathon'; setupN = 4; }
  else {
    if (setupMapWanted === 'marathon') setupMapWanted = '0';
    setupN = ({ duell: 2, drei: 3, vier: 4 })[mode] || +mode || 4;
  }
  if ($('screen-setup').classList.contains('show') || $('setup-list').children.length) renderSlots();
}

/* Kartenliste – unabhängig von der Zahl der Reiche; die richtet sich nach der Karte. */
function mapOptions() {
  const out = MAPS.map((m, i) => [String(i), T('%s – bis 4 Reiche', m.name)]);
  out.push(['plaettchen', T('Plättchenkarte – 2 bis 8 Reiche')]);
  if (typeof marathonMap === 'function') out.push(['marathon', T('Marathon – Zufallskarte, 4 Reiche')]);
  // Eigene Karten (Meine Karten): so viele Reiche, wie sie Startpunkte haben
  myMaps.forEach(m => out.push([MY_MAP_PICK + m.name, m.marathon
    ? T('%s (eigene Karte, bis %s Reiche, Marathon)', m.name, m.maxPlayers)
    : T('%s (eigene Karte, bis %s Reiche)', m.name, m.maxPlayers)]));
  return out;
}
/* Experimenteller Plättchenmodus (v99): auf der Plättchenkarte, bei jeder Zahl von Reichen. Die
   Wahl bleibt gemerkt wie die Karte; gilt nur, wo das Häkchen überhaupt zu sehen ist. */
let setupHexWanted = false;
const setupHexOffered = () => setupMapWanted === 'plaettchen';
const setupHex = () => setupHexOffered() && setupHexWanted;
function fillMapSelect() {
  const sel = $('setup-map');
  const opts = mapOptions();
  sel.innerHTML = opts.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('');
  if (!opts.some(o => o[0] === setupMapWanted)) setupMapWanted = opts[0][0];
  sel.value = setupMapWanted;
  sel.onchange = () => { setupMapWanted = sel.value; renderSlots(); };
  // Zahl der Reiche: nur, was die Karte zulässt
  const l = setupLimits(), n = setupCount();
  const cnt = $('setup-count');
  cnt.innerHTML = Array.from({ length: l.max - l.min + 1 }, (_, i) => l.min + i)
    .map(k => `<option value="${k}"${k === n ? ' selected' : ''}>${k === 2 ? T('2 (1 gegen 1)') : k}</option>`).join('');
  cnt.disabled = l.min === l.max;
  cnt.onchange = () => { setupN = +cnt.value; renderSlots(); };
  const rnd = $('setup-random');
  rnd.checked = setupRandom;
  rnd.onchange = () => { setupRandom = rnd.checked; renderSlots(); };
  const hex = $('setup-hex');
  hex.checked = setupHexWanted;
  hex.onchange = () => { setupHexWanted = hex.checked; fillMapSelect(); };
  $('setup-hex-row').hidden = !setupHexOffered();
}
// Frei wählbar (auch dieselbe Zivilisation mehrfach) ist die Zivilisation auf der
// Plättchenkarte und auf eigenen Karten – dort beginnt jedes Reich an einem Startpunkt, nicht
// am Stern seiner Zivilisation. Auf den festen Karten und dem Standard-Marathon sitzt jede
// Zivilisation genau einmal.
const freieCivWahl = () => setupMapWanted === 'plaettchen' || !!setupCustomMap();
/* Nummerierte Plätze („Platz 1 …") hat der Aufbau, wo die Zivilisation frei wählbar ist
   (Plättchenkarte, eigene Karten), bei ausgelosten Nationen und bei weniger als vier Reichen.
   Dort ziehen die Reiche seit v90 in der Reihenfolge der Plätze, ab dem Startspieler
   (newGame mit cfg.seatOrder, Anweisung des Autors). Die klassische Aufstellung mit allen
   vier Zivilisationen und der Standard-Marathon zeigen Zivilisationen statt Plätzen – dort
   ist jede ihr eigener Platz, und es bleibt bei Russland → Griechenland → England → Wikinger.
   Reine Funktion der Rezeptwerte, damit „Nochmal spielen" dieselbe Zugfolge bekommt. */
const platzNummern = (mapPick, n, random) => !!random || n < 4 || mapPick === 'plaettchen'
  || (typeof mapPick === 'string' && mapPick.startsWith(MY_MAP_PICK));
function setupScreen() {
  $('setup-evmode').innerHTML = EVENT_MODES.map(m => `<option value="${m.k}">${m.n}</option>`).join('');
  $('setup-kilevel').innerHTML = KI_LEVELS.map(x =>
    `<option value="${x.k}"${x.k === KI_DEFAULT_LEVEL ? ' selected' : ''}>${x.n}</option>`).join('');
  // Ereignisse und Weltwunder (v102): immer im Aufbau, je Partie, ab Werk aus
  $('setup-events').onchange = evmodeRow;
  evmodeRow();
  // Karte, Zahl der Reiche und Zufall bleiben erhalten, wenn man den Aufbau erneut öffnet
  renderSlots();
}
/* Zeichnet die Reichs-Karteikarten. Auf den festen Karten sitzt jede Zivilisation genau
   einmal (bei vier Reichen liegt sie damit fest); auf der Plättchenkarte wählt jeder Platz
   frei, auch zweimal dieselbe. */
function renderSlots() {
  const n = setupCount();
  fillMapSelect();
  const list = $('setup-list');
  const frei = freieCivWahl(), plaetze = platzNummern(setupMapWanted, n, setupRandom);
  // Mensch/Bot und Fähigkeit überleben ein Neuzeichnen (Kartenwechsel, Zivilisationswahl)
  const alt = [...list.children].map(x => ({
    kind: x.querySelector('[data-kind].on').dataset.kind,
    abil: x.querySelector('[data-abil]').value,
  }));
  // „Zufällige Nationen für alle": jeder Platz wird ausgelost, gewählt wird hier nichts
  const chosen = setupRandom ? Array.from({ length: n }, () => 'zufall')
    : (frei || n < 4) ? pickChoice(n) : CIV_KEYS.slice();
  // Feste Karte: Doppelungen auflösen, sonst säßen zwei Reiche auf einem Startstern
  if (!frei && !setupRandom) for (let i = 0; i < n; i++)
    if (chosen.indexOf(chosen[i]) !== i)
      chosen[i] = pickCivs[i] = CIV_KEYS.find(k => !chosen.slice(0, n).includes(k));
  list.innerHTML = '';
  chosen.forEach((civKey, i) => {
    const zufall = civKey === 'zufall';
    const civ = zufall ? null : CIV_BY_KEY[civKey];
    /* Bei ausgeloster Zivilisation stehen ihre Fähigkeiten noch nicht fest – dann bleibt
       auch bei der Fähigkeit nur der Zufall. Eine Zeile „Grundfähigkeit" gab es hier
       früher; sie ist ersatzlos weg. Sie benannte nichts: die Grundfähigkeit heißt bei
       jedem Reich anders und wirkt anders (Günstige Forschung, Handelsreich, Taiga,
       Seefahrer), und welche man bekommt, entscheidet erst die Auslosung. */
    const abils = zufall
      ? [{ k: 'zufall', n: T('Zufall') }]
      : civ.abilities.map(a => ({ k: a.k, n: a.n, e: a.e }))
        .concat([{ k: 'zufall', n: T('Zufall'), e: T('Wird beim Spielstart ausgelost.') }]);
    /* Eine Zeile je Platz (v102): Reich, Mensch/KI/Bot, Fähigkeit. Auf der Plättchenkarte und
       bei weniger als vier Reichen ist das Reich wählbar; die Reihenfolge der Zeilen ist die
       Zugfolge. Was eine Fähigkeit bewirkt, zeigt die Auswahl selbst (pickAbil). */
    const d = document.createElement('div');
    d.className = 'slot'; d.dataset.civ = civKey;
    d.innerHTML = `<div class="slot-civ">` + (plaetze
      ? `<h3>${zufall ? '🎲' : SYM[civ.sym]}</h3>
         <select data-civpick${setupRandom ? ' disabled' : ''} aria-label="${T('Zivilisation')}">${CIVS.map(c =>
           `<option value="${c.k}"${c.k === civKey ? ' selected' : ''}>${c.n}</option>`).join('')}
           <option value="zufall"${zufall ? ' selected' : ''}>${T('Zufall')}</option>
         </select>`
      : `<h3>${SYM[civ.sym]} ${civ.n}</h3>`) + `</div>` +
      /* Zwei Arten: Mensch und KI (spielt nach den Regeln für Menschen, js/ki.js). Bots (Bot-
         Regeln, js/bots.js) stehen nicht mehr zur Wahl; laufende Partien spielen sie weiter. */
      `<div class="seg">
        <button data-kind="human" class="${(alt[i] ? alt[i].kind === 'human' : i === 0) ? 'on' : ''}">${T('Mensch')}</button>
        <button data-kind="ki" class="${(alt[i] ? alt[i].kind !== 'human' : i !== 0) ? 'on' : ''}">${T('KI')}</button>
      </div>
      <button type="button" class="abil-pick" data-abilpick></button>
      <select data-abil="${zufall ? 'zufall' : civ.k}" hidden>${abils.map(a =>
        `<option value="${a.k}">${a.n}</option>`).join('')}
      </select>`;
    list.appendChild(d);
    const sela = d.querySelector('[data-abil]'), knopf = d.querySelector('[data-abilpick]');
    if (alt[i] && abils.some(a => a.k === alt[i].abil)) sela.value = alt[i].abil;
    // Marathon (v83): Fähigkeiten werden vor dem ersten Zug gedraftet, hier gibt es keine Wahl
    const marathon = setupIsMarathon();
    knopf.hidden = marathon;
    const paint = () => {
      const kind = d.querySelector('[data-kind].on').dataset.kind;
      // Bei ausgelostem Reich gibt es nur den Zufall – keine Wahl, also steht die Auswahl still.
      sela.disabled = zufall;
      knopf.disabled = sela.disabled;
      const a = abils.find(x => x.k === sela.value) || abils[0];
      knopf.textContent = a.n;
      kindRows();
    };
    // Die Auswahl der Fähigkeit: Name und Wirkung jeder Möglichkeit, die gewählte markiert
    knopf.onclick = () => {
      if (sela.disabled) return;
      modal(zufall ? T('Fähigkeit') : civ.n, abils.map(a =>
        `<button class="opt${a.k === sela.value ? ' on' : ''}" data-k="${a.k}"><span>${esc(a.n)}` +
        `${a.e ? `<small>${esc(a.e)}</small>` : ''}</span></button>`).join(''));
      $('ov-body').querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
        sela.value = b.dataset.k; closeModal(); paint();
      });
    };
    sela.onchange = paint;
    d.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
      d.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b));
      paint(); refreshStart();
    });
    const pick = d.querySelector('[data-civpick]');
    if (pick) pick.onchange = () => {
      pickCivs[i] = pick.value;
      // Nur auf den festen Karten: jeder andere Platz mit derselben Zivilisation zieht
      // auf eine freie um. Auf der Plättchenkarte darf sie doppelt vorkommen.
      if (!freieCivWahl()) for (let j = 0; j < n; j++) {
        if (j === i || pickCivs[j] !== pick.value) continue;
        pickCivs[j] = CIV_KEYS.find(k => !pickCivs.slice(0, n).includes(k));
      }
      renderSlots();          // Mensch/KI und Fähigkeit bleiben dabei erhalten
    };
    paint();
  });
  refreshStart();
}
// Vorauswahl der frei wählbaren Plätze (weniger als vier Reiche, Plättchenkarte, eigene
// Karten); ab dem fünften Platz wiederholen sich die Zivilisationen
let pickCivs = ['griechenland', 'wikinger', 'russland', 'england'];
function pickChoice(n) {
  for (let i = pickCivs.length; i < n; i++) pickCivs.push(pickCivs[i % 4]);
  return pickCivs.slice(0, n);
}
function setupConfig() {
  const kiLevel = $('setup-kilevel').value || KI_DEFAULT_LEVEL;   // eine Stufe für alle KI
  // Rohwahl: 'zufall' bleibt stehen, aufgelöst wird erst in startPlayers()
  return [...$('setup-list').children].map(slot => ({
    civ: slot.dataset.civ,
    kind: slot.querySelector('[data-kind].on').dataset.kind,
    kiLevel,
    ability: slot.querySelector('[data-abil]').value,
  }));
}
/* Die Zeile für die KI-Stufe steht nur da, wenn es KI-Plätze gibt –
   sonst fragt der Aufbau nach etwas, das in dieser Partie niemand braucht. */
function kindRows() {
  const kinds = [...$('setup-list').children].map(x => {
    const on = x.querySelector('[data-kind].on');
    return on ? on.dataset.kind : null;
  });
  $('setup-kilevel-row').hidden = !kinds.includes('ki');
}
/* Rezept einer Partie: die ROHE Wahl aus dem Aufbau, „Zufall" noch nicht aufgelöst.
   Genau das macht es wiederverwendbar – wer mit ausgeloster Zivilisation gestartet ist,
   bekommt beim nächsten Mal eine neue. Wandert in den Spielstand (S.recipe), damit
   „Nochmal spielen" auch nach einem Neuladen noch weiß, wie aufgesetzt war. */
function setupRecipe(mapPick, startWahl) {
  return {
    mode: setupModeName(), n: setupCount(), mapPick, start: startWahl, randomCivs: setupRandom,
    hexTiles: setupHex(),                // experimenteller Plättchenmodus (v99)
    events: $('setup-events').checked, eventMode: $('setup-evmode').value,
    wonders: $('setup-wonders').checked,
    players: setupConfig(),
  };
}
/* Doppelgänger (mehrfach sitzende Zivilisation): Ziffer und Farbe aus markDoubles
   (engine.js), dazu der fertige Name für Anzeigen, die nur den Text kennen. */
function nameDoubles(players) {
  markDoubles(players);
  players.forEach(p => {
    if (!p.roman) { delete p.roman; if (!p.color) delete p.color; return; }
    p.name = `${CIV_BY_KEY[p.civ].n} ${p.roman}`;
  });
  return players;
}
/* „Zufall" in der Auswahl wird erst beim Spielstart aufgelöst – bis dahin steht im
   Aufbau wirklich Zufall, damit niemand aus der Anzeige schon die Wahl abliest.
   `frei` = Doppelungen erlaubt (Plättchenkarte); sonst bleibt jede Zivilisation einmalig. */
function resolveRandom(players, frei) {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  players.forEach((p, i) => {
    if (p.civ !== 'zufall') return;
    const pool = CIV_KEYS.filter(k => frei ||
      !players.some((q, j) => j !== i && q.civ === k));
    p.civ = pick(pool.length ? pool : CIV_KEYS);
    p.randomCiv = true;
  });
  players.forEach(p => {
    if (p.ability !== 'zufall') return;
    p.ability = pick(CIV_BY_KEY[p.civ].abilities).k;
    p.randomAbility = true;
  });
  return players;
}
/* Fertige Spielerliste für den Start: Zufall auflösen, dann Ziffern und Farben. */
function startPlayers() {
  return nameDoubles(resolveRandom(setupConfig(), freieCivWahl()));
}
// Nur eine bewusste Wahl bleibt stehen; ohne sie steht „Zufällig“ (seit v99, Anweisung des
// Autors – bis v98 richtete sich die Vorauswahl nach der Besetzung: bei mehreren Menschen
// Zufall, sonst der einzige Mensch).
let startWanted = null;
function refreshStart() {
  const cfg = setupConfig(), sel = $('setup-start');
  const label = p => p.civ === 'zufall' ? T('Zufällige Zivilisation')
    : (CIV_BY_KEY[p.civ] ? CIV_BY_KEY[p.civ].n : p.civ);
  sel.innerHTML = `<option value="zufall">${T('Zufällig')}</option>` + cfg.map((p, i) =>
    `<option value="${i}">${label(p)}${kindTag(p)}</option>`).join('');
  sel.value = (startWanted != null && [...sel.options].some(o => o.value === startWanted))
    ? startWanted : 'zufall';
  sel.onchange = () => { startWanted = sel.value; };
}
