/* js/ui/base.js – Grundlagen: Bildschirme, Fenster und Blätter, Leiste, Drehung, Speichern.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* Hochzeivilization – Oberfläche */
const $ = id => document.getElementById(id);
const SYM = { star: '★', cross: '✕', square: '■', triangle: '▲', skull: '☠' };
const HEX = 30;
let S = null, ui = { sel: null, army: null, mode: null, botTimer: null };
let editMap = null, edTool = 'G';

/* ------------------------------------------------------------------ Basics */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  if (typeof applyTurn === 'function') applyTurn();     // Drehung hängt am Bildschirm
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('unten', 'anim'); t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function modal(title, html) {
  $('ov-title').textContent = title; $('ov-body').innerHTML = html;
  $('overlay').classList.remove('wide');
  $('overlay').classList.add('show');
  lockBar();
  if (ui && ui.fg && typeof fgMarkUi === 'function') fgMarkUi();   // Erstes Spiel: offener Tipp
}
function closeModal() {
  $('overlay').classList.remove('show'); $('overlay').classList.remove('wide'); lockBar();
}
/* Ein frisch gezeigtes Blatt nimmt kurz keine Tipps an (v89). Gemeldet: „beim Öffnen von
   Fähigkeiten wachsen manchmal alle Städte" – ohne Weg, es nachzustellen. Das Öffnen selbst
   ändert am Spielstand nichts (geprüft über viele Spielstände). Nachstellen ließ sich aber
   dies: Nach einer Aktion zeichnet sich das Blatt neu, und was oben verschwindet – die Liste
   der Freien Forschung nach der Wahl, eine kopierte Technologie, „Kostenlos wachsen" im
   Stadtblatt –, schiebt den Rest nach oben. Ein zweiter schneller Tipp an dieselbe Stelle
   (Doppeltipp, oder weil der erste nicht zu wirken schien) traf dann „Alle Städte wachsen"
   bzw. „Kopieren" – Aktionen, die man nie angetippt hat. Ebenso gleitet ein Blatt beim Öffnen
   0,18 s lang ins Bild; ein früher Tipp trifft, was gerade vorbeizieht.
   Deshalb zählt ein Tipp auf einen Knopf im Blatt erst SHEET_CALM_MS nach dem Öffnen oder
   Neuzeichnen – außer auf DENSELBEN Knopf, der das Neuzeichnen ausgelöst hat (zweimal „+1
   Macht", noch einmal „Bevölkerungswachstum": das ist gewollt und bleibt flott). Beim Öffnen
   gilt keiner. Ausgenommen ist das Blatt eines Bot- oder KI-Zugs (`locked`): dort gibt es nur
   „Weiter", und das soll sich zügig durchtippen lassen. */
const SHEET_CALM_MS = 400;
const sheetCalm = { until: 0, key: null, tapped: null };
const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
// Woran ein Knopf im Blatt erkannt wird: seine Aktion bzw. Beschriftung, nicht die Zufalls-id
const tapKey = b => b.dataset.act || b.dataset.label || b.dataset.w || b.dataset.k || b.dataset.n ||
  b.dataset.back || b.textContent.trim();
// Erfassungsphase am Blatt: läuft vor dem onclick des Knopfs
function sheetCalmGuard(e) {
  const b = e.target && e.target.closest ? e.target.closest('#sheet-body button') : null;
  if (!b) return;
  const key = tapKey(b);
  if (nowMs() < sheetCalm.until && key !== sheetCalm.key && !$('sheet').classList.contains('locked')) {
    e.stopPropagation(); e.preventDefault();
    return;
  }
  sheetCalm.tapped = key;          // zeichnet der Knopf das Blatt neu, darf er gleich wieder
}
/* `opts.power`: dieses Blatt ist das Machtblatt – nur solange es offen ist, zeigt die
   Karte die Machtringe (v75). Jedes andere Blatt beendet die Machtansicht. */
function sheet(html, opts) {
  const machtAus = ui && ui.powerView && !(opts && opts.power);
  if (machtAus) ui.powerView = false;
  const warOffen = $('sheet').classList.contains('open');
  $('sheet-body').innerHTML = html;
  $('sheet').classList.add('open');
  // Neu gezeigt: kurz keine Tipps – außer auf den Knopf, dessen Tipp gerade neu zeichnet
  sheetCalm.until = nowMs() + SHEET_CALM_MS;
  sheetCalm.key = warOffen ? sheetCalm.tapped : null;
  lockBar();
  if (machtAus && S) redraw();
  if (ui && ui.fg && typeof fgMarkUi === 'function') fgMarkUi();   // Erstes Spiel: offener Tipp
}
function closeSheet() {
  if (ui.botLock) return;
  $('sheet').classList.remove('open'); lockBar();
  if (ui.powerView) { ui.powerView = false; if (S) redraw(); }
}
/* Die Aktionsleiste wird nur noch vom Bot-Fenster gesperrt – dort führt allein
   „Weiter" weiter. Ein normales Aktionsblatt sperrt sie NICHT mehr: es endet seit
   dieser Fassung oberhalb der Leiste (--bar-h), liegt also nicht mehr darauf, und
   die Menüpunkte unten bleiben durchweg bedienbar. */
function lockBar() {
  // Gesperrt im Bot-Blatt und, seit v90, solange ein Kampf nachgespielt wird – seit v94 auch,
  // solange der Zug einer KI oder eines Bots nachgespielt wird
  document.body.classList.toggle('blocked', !!(ui && (ui.botLock || ui.combat || ui.anim)));
}
/* Echte Höhe von Kopf- und Aktionsleiste ins CSS spiegeln, damit das Blatt exakt
   darüber endet – die Leiste wächst mit Schriftgröße und Geräteeinfassung.
   Gemessen wird die Layouthöhe (offsetHeight, seit v103): Sie kennt weder die Drehung um 90°
   (html.turn) noch den Maßstab großer Bildschirme (--ui) – beide ändern nur, wie groß die Leiste
   auf dem Schirm erscheint, nicht ihre Höhe im CSS, und dort wird --bar-h gebraucht. Bis v102
   stand hier getBoundingClientRect: das misst nach Drehung und Zoom. Gedreht war seine Höhe die
   Breite der Leiste (bis v86 stand --bar-h so auf 1180px, und jedes Blatt lag außerhalb des
   Bildschirms – v87 nahm dann die Breite), gezoomt wäre sie um den Faktor zu groß. */
function setBarHeight() {
  const st = document.documentElement.style;
  const hoch = sel => { const el = document.querySelector(sel); return el ? el.offsetHeight : 0; };
  const bar = hoch('#screen-game .actionbar'), hud = hoch('#screen-game .hud');
  if (bar) st.setProperty('--bar-h', bar + 'px');
  if (hud) st.setProperty('--hud-h', hud + 'px');
}
/* Querformat. Eine echte Sperre gibt es nur, wo screen.orientation.lock existiert
   (installiertes Android/Chrome); iOS kennt sie nicht – weder über die API noch über
   das Manifest. Dort bleibt nur, die App im Hochformat selbst zu drehen (html.turn,
   siehe style.css). Seit v102 immer – der Schalter im Spielmenü ist entfallen.

   Gedreht wird NUR der Spielbildschirm. Menü, Aufbau, Editor und die Regelseite haben
   keine feste Karte, die Platz in der Breite bräuchte – dort wäre der Zwang lästig.
   Deshalb hängt html.turn am aktiven Bildschirm und wird aus show() nachgeführt. */
const TURN_SCREENS = ['screen-game', 'screen-place', 'screen-draft'];
function onTurnScreen() {
  return TURN_SCREENS.some(id => { const el = $(id); return el && el.classList.contains('show'); });
}
function applyTurn() {
  const on = onTurnScreen();
  document.documentElement.classList.toggle('turn', on);
  try {
    const so = screen && screen.orientation;
    if (so && typeof so.lock === 'function') {
      // Nur im Spiel sperren; beim Verlassen wieder freigeben.
      if (on) so.lock('landscape').catch(() => { });
      else if (typeof so.unlock === 'function') so.unlock();
    }
  } catch { /* Browser ohne screen.orientation – dann bleibt es bei html.turn */ }
  syncLayout();
}
function turning() {
  return document.documentElement.classList.contains('turn') &&
    window.innerHeight > window.innerWidth;
}
/* Große Bildschirme (v103, Anweisung des Autors: Symbole auf 1080p und größer zu klein): die
   ganze Oberfläche wächst mit dem Fenster – ein Faktor, als CSS-zoom auf <html> (--ui), keine
   zweite Gestaltung. Bis 1366 × 720 bleibt es bei 1: jedes iPad quer (das größte hat 1366 × 1024),
   jedes Telefon. Darüber zählt die knappere Seite – ein maximiertes Fenster auf 1080p etwa ×1,33,
   Vollbild ×1,41, 1440p etwa ×1,8. Die Karte füllt ihre Fläche ohnehin; sie gibt nur ab, was Kopf-
   und Aktionsleiste an Höhe gewinnen. Gedreht (html.turn) bleibt es bei 1: die Drehung rechnet mit
   100vh/100vw, und die wüchsen mit. Auf zwei Stellen gerundet, damit kleine Größenänderungen nicht
   jedes Mal neu umbrechen. */
const UI_BASE_W = 1366, UI_BASE_H = 720;
function uiScale(w, h, gedreht) {
  if (gedreht) return 1;
  return Math.max(1, Math.round(100 * Math.min(w / UI_BASE_W, h / UI_BASE_H)) / 100);
}
/* Effektive Layoutgröße: im gedrehten Zustand sind Breite und Höhe vertauscht.
   Media Queries können das nicht wissen – sie messen den ungedrehten Viewport und
   lägen um 90° daneben. Deshalb setzt diese Funktion die Layoutklassen selbst – seit v103 nach
   der Größe in CSS-Pixeln der vergrößerten Seite (Fenster ÷ --ui). */
function syncLayout() {
  const t = turning();
  const vw = t ? window.innerHeight : window.innerWidth;
  const vh = t ? window.innerWidth : window.innerHeight;
  const k = uiScale(vw, vh, t), w = vw / k, h = vh / k;
  document.documentElement.style.setProperty('--ui', String(k));
  const cl = document.documentElement.classList;
  cl.toggle('w-wide', w >= 820);
  // Neben der Karte statt darunter, sobald quer und breit genug: gestapelt bliebe auf
  // flachen Schirmen (Telefon quer) fast nichts von der Karte übrig.
  cl.toggle('w-side', w >= 600 && w > h);
  cl.toggle('w-narrow', w < 600);
  setBarHeight();
}
function initOrientation() {
  applyTurn();
  window.addEventListener('resize', syncLayout);
  window.addEventListener('orientationchange', syncLayout);
}

/* Stand als Punkte, gefüllt = noch offen (v102 Freie Forschung, v103 Kolonialismus). */
function pips(rest, alle) {
  return `<span class="pips" aria-label="${T('Noch %s von %s', rest, alle)}">` +
    Array.from({ length: alle }, (_, i) => `<i class="${i < rest ? 'on' : ''}"></i>`).join('') + '</span>';
}

// localStorage kann fehlen oder sperren (privater Modus) – dann wird eben nichts gemerkt.
function store(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* nicht speicherbar */ } }
function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function saveGame() { if (S) store('hochciv.save', S); }
