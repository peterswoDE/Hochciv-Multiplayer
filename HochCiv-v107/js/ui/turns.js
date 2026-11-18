/* js/ui/turns.js – Zugende: KI und Bots, Kämpfe und Züge nachspielen.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------------------------ Zugende & Bots */
/* Der Zugwechsel darf nie hängen bleiben (v80). Gemeldet: nach den Zügen der KI blieb der
   Bildschirm gesperrt; von Hand half nur, die Sperre aufzuheben und den Zug des Menschen zu
   starten. Nachstellen ließ es sich nicht (Hunderte Partien über die echte Oberfläche, mit
   und ohne wildes Tippen). Deshalb zweierlei:
   · Ein Fehler in einem Zug oder beim Zugwechsel bricht den Ablauf nicht mehr ab. Er steht
     im Protokoll und in der Konsole (UI_ERRORS für smoke.js), und es geht weiter.
   · Die Sperre des KI-Blatts kann den Zug eines Menschen nicht überdauern (humanTurnStart),
     „Zug beenden" wirkt nur im eigenen Zug, und dieselbe KI zieht nie zweimal (runBots). */
const UI_ERRORS = [];
function sicher(was, fn) {
  try { return fn(); }
  catch (e) {
    const msg = (e && e.message) || String(e);
    UI_ERRORS.push(was + ': ' + msg);
    if (typeof console !== 'undefined' && console.error) console.error(e);
    if (S) log(S, 'warn', T('Interner Fehler (%s): %s – das Spiel läuft weiter. Bitte melden.', T(was), msg));
    toast(T('Interner Fehler – das Spiel läuft weiter. Näheres im Protokoll.'));
    return undefined;
  }
}
/* ------------------------------------------------ Kampf nachspielen (v90, Wunsch des Autors)
   Am Ende jedes Zugs – des eigenen wie dem eines Bots oder der KI – wird jeder Kampf einzeln
   gezeigt, in der Reihenfolge der Regel (erst die Städte, dann die Flanken; v90 kurz andersherum,
   seit v91 wieder so): COMBAT_MS lang das Kampffeld mit den Machtwerten beider Seiten, dann der
   nächste, der schon den Ausgang des vorigen zeigt. Die Reihenfolge der Bilder ist die der
   Einträge – die Oberfläche ordnet nichts um. Gerechnet ist da alles schon (finishTurn mit
   `rec`, combatPhase): jeder Eintrag trägt den Kartenstand davor (snap), gezeichnet wird also
   nur. Bis zum letzten Bild ist alles gesperrt (ui.combat: Leiste wie im Bot-Blatt, „Zug
   beenden", Karte); ein Tipp auf die Karte überspringt den Rest. Gespeichert wird währenddessen
   nicht – lädt die App mitten im Nachspiel neu, steht der Zug wie vor dem Zugende da (bzw. das
   Bot-Blatt). COMBAT_MS = 0 (smoke.js) spielt nichts nach und ruft `weiter` sofort. */
let COMBAT_MS = 1000;
function playCombat(kaempfe, weiter) {
  if (!kaempfe || !kaempfe.length || COMBAT_MS <= 0) return weiter(false);
  ui.combat = { kaempfe, i: 0, weiter, timer: null };
  lockBar();
  // Der Hinweis liegt über der gesperrten Aktionsleiste und bleibt, bis der Kampf vorbei ist.
  // Oben, wo Toasts sonst stehen, verdeckte er Wert und Zeile von Kämpfen in den oberen Reihen
  // (im Telefon-Querformat schon ab der dritten Reihe).
  if (kaempfe.length > 1) {
    const t = $('toast');
    clearTimeout(t._t);
    t.textContent = T('%s Kämpfe – Tippen auf die Karte überspringt', kaempfe.length);
    t.classList.remove('anim');                           // kam direkt nach den Szenen eines Zugs (v94)
    t.classList.add('unten', 'show');
  }
  combatFrame();
}
function combatFrame() {
  const k = ui.combat;
  if (!k) return;
  if (k.i >= k.kaempfe.length) return endCombat();
  combatDraw();
  k.timer = setTimeout(combatNext, COMBAT_MS);
}
// Das Bild des laufenden Kampfs: die Karte im Stand davor, darauf der Kampf
function combatDraw() {
  const k = ui.combat, f = k.kaempfe[k.i];
  drawMap($('map'), S.map, {
    state: Object.assign({}, S, f.snap), turn: -1,
    fight: Object.assign({ caption: combatCaption(f, k.i, k.kaempfe.length) }, f),
  });
}
function combatNext() {
  const k = ui.combat;
  if (!k) return;
  clearTimeout(k.timer);
  k.i++;
  combatFrame();
}
function endCombat() {
  const k = ui.combat;
  if (!k) return;
  clearTimeout(k.timer);
  ui.combat = null;
  // Den Hinweis ausblenden; nach unten gehört er erst wieder, wenn er ganz weg ist (sonst
  // spränge er beim Ausblenden nach oben). Ein Toast gleich danach holt ihn selbst nach oben.
  const t = $('toast');
  if (t.classList.contains('unten')) {
    t.classList.remove('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('unten'), 250);
  }
  lockBar();
  k.weiter(true);
}
// Was unter den Werten steht: welcher Kampf, wievielter, und wie er ausgeht
function combatCaption(f, i, n) {
  const was = f.art === 'flanke' ? T('Flanke') : T('Stadt');
  const aus = f.art === 'flanke' ? (f.sieg ? T('Armee zerstört') : T('hält'))
    : f.genommen ? (f.zerstoert ? T('Stadt zerstört') : T('erobert'))
      : f.sieg ? T('Belagerung %s/2', f.zug)
        : f.gebrochen ? T('Belagerung gebrochen') : T('hält');
  return `${was} ${i + 1}/${n} · ${aus}`;
}
/* ------------------------------------------------ Züge von KI und Bots nachspielen (v94)
   Wunsch des Autors: wie beim Kampf, aber für alles, was KI und Bots tun – kein Blatt mehr zum
   Durchtippen, das Protokoll behält alles. Nach dem eigenen Zugende laufen alle Züge von KI und
   Bots durch, jeder als Folge von Szenen (js/anim.js: aufgenommen und gruppiert), danach sein
   Kampf wie bisher (playCombat) – bis wieder ein Mensch dran ist. Gerechnet ist der Zug
   jeweils schon (runBots), gezeichnet wird nur: die Karte im Stand der Szene (`bild`), darauf
   was geschah (animMarks), darunter ein Satz (animCaption). Bis zum Ende ist alles gesperrt wie im
   Kampf (Leiste, „Zug beenden"); ein Tipp auf die Karte überspringt den Rest dieses Zugs.
   „Animationen" in den Einstellungen (prefs.anim, v95): Langsam (ab Werk), Schnell oder Keine –
   dann die alte Fassung, das Blatt mit „Weiter" (botSheet). Das klassische Tutorial bleibt
   immer dabei – seine Texte erklären dieses Blatt. ANIM_MS = 0 (smoke.js) spielt nichts und
   läuft sofort weiter. */
function animAn() { return prefs.anim !== 'aus' && ANIM_MS > 0; }
// Die alte Fassung (Blatt mit „Weiter") – nach der Einstellung „Keine"
const animBlatt = () => prefs.anim === 'aus';
/* Takt je Szene = ANIM_MS × Faktor (gezogene Armeen das 1,4-Fache). Langsam (v95, Wunsch des
   Autors: „etwa um die Hälfte langsamer"): 1,5, gleich für jede Szene. Schnell: der Takt von
   v94 – bis 7 Szenen 1, bei längeren Zügen kürzer, höchstens bis auf 0,6. */
const animFaktor = n => prefs.anim === 'schnell' ? Math.min(1, Math.max(0.6, 7 / n)) : 1.5;
function playAnim(szenen, weiter) {
  if (!szenen || !szenen.length || !animAn()) return weiter(false);
  const tempo = animFaktor(szenen.length);
  szenen.forEach(s => { s.tempo = tempo; });
  ui.anim = { szenen, i: 0, weiter, timer: null };
  lockBar();
  animFrame();
}
function animFrame() {
  const a = ui.anim;
  if (!a) return;
  if (a.i >= a.szenen.length) return endAnim();
  animDraw();
  animCaption();
  // Züge brauchen etwas länger: erst gleiten, dann stehen
  const s = a.szenen[a.i];
  const ms = Math.round(ANIM_MS * s.tempo * (s.zuege.length ? 1.4 : 1));
  animVorrat(hudStand(), ms);           // der laufende Stand in der Kopfzeile (v96)
  a.timer = setTimeout(animNext, ms);
}
/* Was eine Szene am Vorrat ändert (v96, Wunsch des Autors: „vielleicht mit einem −x, das
   aufploppt"): unter dem Kästchen der Kopfzeile ein „−10" (rot) bzw. „+7" (grün), das kurz
   erscheint und mit der Szene vergeht; die Zahl darüber zeigt schon den Stand danach (hudStand).
   Ohne `kopf` (Nachspiel vorbei) räumt es nur ab. Wer reduzierte Bewegung eingestellt hat, sieht
   die Marke ohne Bewegung, bis die Szene wechselt. */
const ANIM_KOPF_ID = { sci: 'hud-sci', food: 'hud-food', coins: 'hud-coins', power: 'hud-power' };
function animVorrat(kopf, ms) {
  document.querySelectorAll('#screen-game .hud-res .res-delta').forEach(e => e.remove());
  if (!kopf) return;
  const still = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const k of ANIM_KOPF) {
    const d = kopf.delta[k];
    if (!d) continue;
    const box = $(ANIM_KOPF_ID[k]).closest('.res');
    const m = document.createElement('span');
    m.className = 'res-delta ' + (d < 0 ? 'minus' : 'plus') + (still ? ' still' : '');
    m.dataset.k = k;
    m.textContent = (d < 0 ? '−' : '+') + Math.abs(d);
    if (!still && ms) m.style.animationDuration = Math.max(400, ms) + 'ms';
    box.appendChild(m);
  }
}
function animDraw() {
  const a = ui.anim, s = a.szenen[a.i];
  drawMap($('map'), S.map, { state: Object.assign({}, S, s.bild || s.nach), turn: -1, anim: s });
}
function animNext() {
  const a = ui.anim;
  if (!a) return;
  clearTimeout(a.timer);
  a.i++;
  animFrame();
}
function endAnim() {
  const a = ui.anim;
  if (!a) return;
  clearTimeout(a.timer);
  ui.anim = null;
  animVorrat(null);                     // die Marken am Vorrat weg (v96) …
  if (S) hudStand();                    // … und die Zahlen wieder vom Spielstand – auch beim Überspringen
  const t = $('toast');
  if (t.classList.contains('anim')) {
    t.classList.remove('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('unten', 'anim'), 250);
  }
  lockBar();
  a.weiter(true);
}
// Der Satz zur Szene – unten, über der gesperrten Leiste (wie der Hinweis beim Kampf)
function animCaption() {
  const a = ui.anim, s = a.szenen[a.i], p = S.players[s.pi], civ = civOf(p);
  const wer = civ.n + (p.kind === 'ki' ? ' (' + T('KI') + ')' : p.kind === 'bot' ? ' (' + T('Bot') + ')' : '');
  const t = $('toast');
  clearTimeout(t._t);
  t.innerHTML = `<b><i class="anim-dot" style="background:${civ.color}"></i>${esc(animText(s, wer))}</b>` +
    `<small>${esc(T('Tippen auf die Karte überspringt'))} · ${a.i + 1}/${a.szenen.length}</small>`;
  t.classList.add('unten', 'anim', 'show');
}
/* Eine Szene auf der Karte (v94). Die Felder sind schon golden (drawMap, unter den Figuren);
   hier darüber: gezogene Armeen gleiten vom Feld davor aufs neue, eine gestrichelte Spur in
   der Farbe des Reichs bleibt stehen; um Neues (Stadt, Armee, Wunder) ein Ring, der sich
   weitet; an Städten, die gewachsen sind oder geopfert haben, +1 bzw. −1. Bewegung über SMIL
   (<animate>, <animateTransform>) – wer reduzierte Bewegung eingestellt hat, sieht gleich das
   Ende. */
function animMarks(world, S2, s) {
  const ohne = { 'pointer-events': 'none' };
  const still = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const farbe = pi => civOf(S2.players[pi]).color;
  const dauer = Math.max(200, Math.round(ANIM_MS * 0.6 * (s.tempo || 1))) + 'ms';
  s.zuege.forEach(z => {
    const [x0, y0] = hexCenter(z.von[0], z.von[1], HEX), [x1, y1] = hexCenter(z.nach[0], z.nach[1], HEX);
    world.appendChild(svgEl('line', Object.assign({
      x1: x0, y1: y0, x2: x1, y2: y1, stroke: farbe(z.owner), 'stroke-width': 3.5, 'stroke-dasharray': '6 5',
      'stroke-linecap': 'round', opacity: 0.85, class: 'anim-spur',
    }, ohne)));
    // die Armee selbst: am Ziel gezeichnet, gleitet aber vom Feld davor dorthin
    const g = svgEl('g', Object.assign({ transform: `translate(${x1},${y1})`, class: 'anim-armee' }, ohne));
    for (const halo of [true, false]) {
      const t = svgEl('text', {
        x: 0, y: 8, 'text-anchor': 'middle', 'font-size': 25,
        fill: halo ? 'none' : farbe(z.owner), stroke: halo ? '#f7f1e0' : 'none',
        'stroke-width': halo ? 5 : 0, 'stroke-linejoin': 'round',
      });
      t.textContent = SYM[civOf(S2.players[z.owner]).sym]; g.appendChild(t);
    }
    const gleiten = still ? null : svgEl('animateTransform', {
      attributeName: 'transform', type: 'translate', from: `${x0} ${y0}`, to: `${x1} ${y1}`,
      dur: dauer, fill: 'freeze', calcMode: 'spline', keyTimes: '0;1', keySplines: '.4 0 .2 1', begin: 'indefinite',
    });
    if (gleiten) g.appendChild(gleiten);
    world.appendChild(g);
    // Die Uhr des SVG läuft seit dem Laden der Seite (drawMap leert es nur) – ohne eigenen Start
    // wäre ein einmaliges Gleiten längst vorbei und die Armee stünde gleich am Ziel
    if (gleiten && typeof gleiten.beginElement === 'function') gleiten.beginElement();
  });
  s.ringe.forEach(([r, c]) => {
    const [x, y] = hexCenter(r, c, HEX);
    const ring = svgEl('circle', Object.assign({
      cx: x, cy: y, r: 19, fill: 'none', stroke: farbe(s.pi), 'stroke-width': 3, class: 'anim-ring',
    }, ohne));
    if (!still) {
      ring.appendChild(svgEl('animate', { attributeName: 'r', values: '16;30', dur: '0.9s', repeatCount: 'indefinite' }));
      ring.appendChild(svgEl('animate', { attributeName: 'opacity', values: '1;0', dur: '0.9s', repeatCount: 'indefinite' }));
    }
    world.appendChild(ring);
  });
  s.marken.forEach(m => {
    const [x, y] = hexCenter(m.r, m.c, HEX);
    const t = svgEl('text', Object.assign({
      x: x + 17, y: y - 13, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700,
      fill: m.text[0] === '+' ? farbe(s.pi) : '#9d3b2f', stroke: '#f7f1e0', 'stroke-width': 4,
      'paint-order': 'stroke', class: 'anim-marke',
    }, ohne));
    t.textContent = m.text;
    world.appendChild(t);
  });
}
function endHumanTurn() {
  // Nur im eigenen Zug und nie, solange das Blatt eines KI- oder Bot-Zugs offen ist: sonst
  // liefe dessen Kampf ein zweites Mal, und der Zug spränge an seinem „Weiter" vorbei.
  // Ebenso nicht, solange der eigene Kampf noch nachgespielt wird (v90).
  if (!S || S.over || isAuto(P(S)) || ui.botLock || ui.combat || ui.anim) return;
  // Harte Sperre: eine Armee, die noch in einer Stadt steht, verhindert das Zugende
  // ganz – da hilft kein Bestätigen, der Zustand ist schlicht ungültig.
  const stop = blockingIssues(S, S.cur);
  if (stop.length) { toast(stop[0]); return; }
  // Erstes Spiel (v92): Zugende gehört zum Schritt – abgelehnt oder einmal nachgefragt
  if (ui.fg && typeof fgZugendeOk === 'function' && !fgZugendeOk()) return;
  const warn = pendingWarnings(S, S.cur);
  if (warn.length && !ui.confirmedEnd) {
    ui.confirmedEnd = true;
    toast(warn[0] + ' ' + T('Nochmal tippen zum Bestätigen.'));
    return;
  }
  ui.confirmedEnd = false; ui.army = null; ui.sel = null; ui.mode = null;
  closeSheet();
  const sinceSeq = S.logSeq || 0;
  const kaempfe = [];
  sicher('Kampf', () => finishTurn(S, kaempfe));          // Kampf und Siegprüfung
  const fights = logSince(S, sinceSeq).filter(l => l.c === 'fight');
  // Erst nachspielen (v90), dann wie bisher: Sieg, Zugwechsel, Bots
  playCombat(kaempfe, gezeigt => {
    redraw();
    if (S.over) return gameOver();
    sicher('Zugwechsel', () => advanceTurn(S));
    redraw();
    runBots();
    // Der letzte Kampf als Meldung – nur, wenn er nicht eben nachgespielt wurde. Sonst wäre er
    // doppelt, und oben verdeckte die Meldung den Anfang eines folgenden Bot-Kampfs.
    if (fights.length && !gezeigt) toast(fights[fights.length - 1].m);
  });
}
/* Züge, die ohne Eingabe laufen: Bots nach den Bot-Regeln, die KI nach den Regeln für
   Menschen (kiTurn in js/ki.js). Beide enden gleich – Kampf und Sieg in finishTurn, dann
   das Blatt mit dem, was passiert ist, und „Weiter".
   Dieselbe KI zieht nie zweimal in einer Runde (S.autoPlayed, v80): gespeichert wird nach
   ihrem Zug, „Weiter" kommt erst danach. Wurde die App dazwischen neu geladen (oder runBots
   zweimal angestoßen), zog sie bis v79 noch einmal – samt zweitem Kampf. Jetzt zeigt das
   Blatt nur wieder, was sie getan hat. */
function runBots() {
  if (S.over) return gameOver();
  const p = P(S);
  if (!isAuto(p)) return humanTurnStart();
  const done = !!S.autoPlayed && S.autoPlayed.cur === S.cur && S.autoPlayed.round === S.round;
  const sinceSeq = done ? S.autoPlayed.seq : (S.logSeq || 0);
  const kaempfe = [];
  const blatt = animBlatt();
  let rec = null;
  if (!done) {
    S.autoPlayed = { cur: S.cur, round: S.round, seq: sinceSeq };
    // Im Ersten Spiel (v92) zieht England nach seinem Drehbuch, sonst die KI bzw. der Bot
    const zug = () => {
      if (S.fg && typeof fgGegnerZug === 'function') fgGegnerZug(S);
      else if (p.kind === 'ki') kiTurn(S, S.cur); else botTurn(S, S.cur);
    };
    // v94: mit Animationen wird der Zug dabei aufgenommen (js/anim.js) – gerechnet wie immer
    sicher(p.kind === 'ki' ? 'KI-Zug' : 'Bot-Zug', () => { if (blatt) zug(); else rec = animAufnahme(S, zug); });
    sicher('Kampf', () => finishTurn(S, kaempfe));    // Kampf des Bots bzw. der KI, einmal pro Zug
  }
  // Gespeichert wird gleich (der Zug ist gezogen, S.autoPlayed steht), gezeichnet erst nach
  // dem Nachspiel – sonst blitzte der Stand nach dem Kampf vor dem ersten Kampfbild auf.
  saveGame();
  if (blatt) return playCombat(kaempfe, () => botSheet(p, sinceSeq));
  // v94: erst die Szenen des Zugs, dann sein Kampf, dann gleich weiter – ohne Blatt. Wurde die
  // App mitten im Nachspiel neu geladen, ist der Zug schon gezogen (done): dann ohne Szenen.
  const szenen = rec ? animSzenen(rec, S.cur) : [];
  playAnim(szenen, () => playCombat(kaempfe, weiterNachAuto));
}
/* Nach Szenen und Kampf eines KI- oder Bot-Zugs (v94, statt „Weiter" im Blatt): Sieg, Zugwechsel,
   der nächste Zug von KI oder Bot – oder ein Mensch ist dran. Ist schon ein Mensch am Zug (eine
   zweite, verspätete Kette), wird nichts übersprungen. Ohne Wartezeit (ANIM_MS = 0, Tests)
   ruft sich das bis zum nächsten Menschen selbst auf; sitzt keiner mehr am Tisch, geht es nach
   40 Zügen über einen Zeitgeber weiter, damit der Aufrufstapel nicht überläuft. */
function weiterNachAuto() {
  redraw();
  if (S.over) return gameOver();
  if (!isAuto(P(S))) return humanTurnStart();
  sicher('Zugwechsel', () => advanceTurn(S));
  redraw();
  if (S.over) return gameOver();
  if (!isAuto(P(S))) return humanTurnStart();
  ui.autoKette = (ui.autoKette || 0) + 1;
  if (ui.autoKette > 40) { ui.autoKette = 0; return setTimeout(runBots, 0); }
  runBots();
}
// Das Blatt eines Bot- oder KI-Zugs: was er getan hat, und „Weiter"
function botSheet(p, sinceSeq) {
  redraw();
  const entries = logSince(S, sinceSeq);
  const lines = entries.length
    ? logHtml(entries)
    : `<div class="logline info">${T('Keine Aktionen in dieser Runde.')}</div>`;
  ui.botLock = true;                   // Sheet ist jetzt gesperrt: nur „Weiter" führt weiter
  /* „Weiter" oben und unten (v87, Wunsch des Autors): Wer das Protokoll nicht lesen will,
     muss nicht erst ans Ende eines langen Blatts scrollen. Beide machen dasselbe. Das Blatt
     beginnt oben – sonst bliebe die Scrollstelle des vorigen Blatts stehen, und der obere
     Knopf wäre gerade dann außer Sicht. */
  sheet(`<div class="bot-head"><div><h3>${civOf(p).n} (${p.kind === 'ki' ? T('KI') : T('Bot')})</h3>` +
    `<p class="sub">${T('Runde %s', S.round)}</p></div>` +
    `<button class="btn small primary" id="bot-next-top">${T('Weiter')}</button></div>${lines}
    <button class="btn wide" id="bot-next">${T('Weiter')}</button>`);
  $('sheet').classList.add('locked');
  $('sheet').scrollTop = 0;
  $('bot-next').onclick = afterAutoTurn;
  $('bot-next-top').onclick = afterAutoTurn;
}
/* „Weiter" unter dem Blatt eines KI- oder Bot-Zugs. Ist schon ein Mensch am Zug (ein
   zweites, verspätetes Antippen), wird nichts übersprungen. */
function afterAutoTurn() {
  ui.botLock = false;
  $('sheet').classList.remove('locked');
  closeSheet();
  if (S.over) return gameOver();
  if (!isAuto(P(S))) return humanTurnStart();
  sicher('Zugwechsel', () => advanceTurn(S));
  redraw();
  if (S.over) return gameOver();
  if (isAuto(P(S))) runBots();
  else humanTurnStart();
}
