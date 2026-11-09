/* js/ui/editor.js – Karteneditor.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------------------------ Karteneditor */
/* Meine Karten: eigene Karten liegen als Liste im Browser (hochciv.maps), jede mit Namen.
   Bis v85 gab es genau eine (hochciv.map) – sie wird beim ersten Start übernommen, wenn sie
   spielbar ist. In der Liste steht nur, was checkCustomMap (engine.js) besteht; jede Karte
   daraus lässt sich deshalb lokal und im Mehrspielermodus spielen. Gleicher Name = dieselbe
   Karte (Speichern überschreibt). Auf ein anderes Gerät kommt sie als Datei (Exportieren). */
const MY_MAPS_MAX = 30;
const MY_MAP_PICK = 'karte:';         // Wert im Kartenmenü des Aufbaus: 'karte:<Name>'
let myMaps = [];
function loadMyMaps() {
  const list = load('hochciv.maps');
  myMaps = (Array.isArray(list) ? list : []).map(m => checkCustomMap(m).map).filter(Boolean);
  const alt = load('hochciv.map');
  if (!Array.isArray(list) && alt) {
    // aus einer Vorlage gebaut, trägt sie oft noch deren Namen – das wäre neben ihr verwirrend
    const name = alt.name && !MAPS.some(m => m.name === alt.name) ? alt.name : T('Eigene Karte');
    const r = checkCustomMap(Object.assign({}, alt, { name }));
    if (r.map) myMaps.push(r.map);
    store('hochciv.maps', myMaps);
  }
}
const myMap = name => myMaps.find(m => m.name === name) || null;
/* Konto (Mehrspieler-Erweiterung): Mit dem Mehrspielerserver liegen die Karten im Spielerkonto, die Liste hier ist
   dann dessen Abbild für unterwegs. Das Spiel selbst kennt keinen Server – mp.js setzt
   `mapAccount`, sobald jemand angemeldet ist, sonst bleibt es null und alles ist wie bisher:
     loggedIn()          angemeldet?
     saved(map), deleted(name)   eine Änderung ins Konto übernehmen (im Hintergrund)
     codeOf(name)        Code einer veröffentlichten Karte oder null
     publish(name), unpublish(name)  → Promise; Veröffentlichen gibt den 6-stelligen Code
     load(code)          → Promise<{ map, author, code }>: eine veröffentlichte Karte, für jeden */
let mapAccount = null;
function saveMyMap(map) {
  const i = myMaps.findIndex(m => m.name === map.name);
  if (i >= 0) myMaps[i] = map;
  else if (myMaps.length >= MY_MAPS_MAX) return T('Höchstens %s eigene Karten – lösche erst eine.', MY_MAPS_MAX);
  else myMaps.unshift(map);
  store('hochciv.maps', myMaps);
  if (mapAccount) mapAccount.saved(map);
  return null;
}
function deleteMyMap(name) {
  myMaps = myMaps.filter(m => m.name !== name);
  store('hochciv.maps', myMaps);
  if (mapAccount) mapAccount.deleted(name);
}
/* Die ganze Liste ersetzen – nach dem Abgleich mit dem Konto (mp.js). Nur spielbare Karten. */
function replaceMyMaps(list) {
  myMaps = list.map(m => checkCustomMap(m).map).filter(Boolean).slice(0, MY_MAPS_MAX);
  store('hochciv.maps', myMaps);
}
/* Eine veröffentlichte Karte (per Code) in die eigene Liste. Heißt schon eine andere eigene
   Karte so, bekommt sie den Code in den Namen. Gibt den Namen zurück oder { error }. */
function addMapFromCode(map, code) {
  const r = checkCustomMap(map);
  if (r.error) return { error: r.error };
  let m = r.map;
  const da = myMap(m.name);
  if (da && JSON.stringify(da) !== JSON.stringify(m))
    m = checkCustomMap(Object.assign({}, m, { name: m.name.slice(0, 31) + ' (' + code + ')' })).map;
  const err = saveMyMap(m);
  return err ? { error: err } : { name: m.name };
}
function loadMapByCodeAsk(done) {
  const code = prompt(T('Kartencode (6 Zeichen):'));
  if (!code) return;
  mapAccount.load(code).then(r => {
    const a = addMapFromCode(r.map, r.code);
    if (a.error) return toast(a.error);
    toast(r.author ? T('Karte „%s" von %s geladen', a.name, r.author) : T('Karte „%s" geladen', a.name));
    if (done) done(a.name);
  }).catch(e => toast(e.message));
}
/* Karte zu einem Wert aus dem Kartenmenü: feste Karte (Index) oder eigene ('karte:<Name>').
   'eigene' stammt aus Rezepten bis v85 (eine einzige eigene Karte) – dann die erste. */
function mapForPick(pick) {
  if (typeof pick === 'string' && pick.startsWith(MY_MAP_PICK)) return myMap(pick.slice(MY_MAP_PICK.length));
  if (pick === 'eigene') return myMaps[0] || null;
  return MAPS[+pick] || null;
}
const mapFileName = m => 'hochzeiv-karte-' + (m.name || 'karte').replace(/[^\w\-äöüÄÖÜß]+/g, '_').slice(0, 40) + '.json';
/* Datei lesen: nur die Form prüfen (Zeilen da) – die Spielbarkeit verlangt erst das
   Speichern. Eine halbfertige Karte darf man laden und im Editor zu Ende bauen. */
function importMapFile(cb) {
  upload(txt => {
    let m;
    try { m = JSON.parse(txt); } catch { return toast(T('Datei nicht lesbar')); }
    if (!m || !Array.isArray(m.rows) || !m.rows.length || m.rows.some(r => typeof r !== 'string'))
      return toast(T('Das ist keine Karte.'));
    cb(m);
    const r = checkCustomMap(m);
    toast(r.error ? T('Karte geladen – noch nicht spielbar: %s', r.error) : T('Karte geladen'));
  });
}
/* Vorschaubild einer Karte (Mehrspieler-Erweiterung): ein kleines SVG als Text – je Gelände EIN
   Pfad mit allen seinen Feldern, dazu die Startpunkte. So bleibt es auch bei 48 × 48 Feldern
   leicht genug für eine ganze Liste („Meine Karten", Kartenbrowser in mp.js). „Kein Feld" (X)
   bleibt leer, die Form einer Plättchenkarte ist so zu sehen. */
function mapThumb(map, cls) {
  const rows = map.rows, R = rows.length, C = Math.max(...rows.map(r => r.length)), s = 10;
  const w = Math.sqrt(3) * s, W = w * (C + 0.5), H = s * 1.5 * R + s * 0.5;
  const ecken = [0, 1, 2, 3, 4, 5].map(i => {
    const a = Math.PI / 180 * (60 * i - 30);
    return [s * Math.cos(a), s * Math.sin(a)];
  });
  const d = {};
  for (let r = 0; r < R; r++) for (let c = 0; c < rows[r].length; c++) {
    const t = rows[r][c];
    if (!TERRAIN[t] || isOff(t)) continue;
    const x = w * (c + 0.5 * (r & 1)) + w / 2, y = s * 1.5 * r + s;
    d[t] = (d[t] || '') + 'M' + ecken.map(([ex, ey]) => (x + ex).toFixed(1) + ' ' + (y + ey).toFixed(1)).join('L') + 'Z';
  }
  const farben = SPAWN_COLORS();
  const spawns = (Array.isArray(map.spawns) ? map.spawns : []).map((p, i) => {
    if (!Array.isArray(p)) return '';
    const x = w * (p[1] + 0.5 * (p[0] & 1)) + w / 2, y = s * 1.5 * p[0] + s;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s * 0.62}" fill="${farben[i]}" stroke="#2a2721" stroke-width="2.4"/>`;
  }).join('');
  return `<svg class="${cls || 'map-thumb'}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    Object.keys(d).map(t => `<path d="${d[t]}" fill="${TERRAIN[t].color}" stroke="${TERRAIN[t].color}" stroke-width=".6"/>`).join('') +
    spawns + '</svg>';
}
const mapMeta = m => `${m.rows.length} × ${m.rows[0].length} · ${T('bis %s Reiche', m.maxPlayers || (m.spawns || []).length || 4)}${m.marathon ? ' · ' + T('Marathon') : ''}`;
function myMapsModal() {
  const konto = !!(mapAccount && mapAccount.loggedIn());
  const rows = myMaps.map((m, i) => {
    const code = konto ? mapAccount.codeOf(m.name) : null;
    return `<div class="mymap">
      <button class="mymap-thumb" data-open="${i}" title="${T('Bearbeiten')}">${mapThumb(m)}</button>
      <div class="mymap-info"><b>${esc(m.name)}</b><small>${mapMeta(m)}</small>
        ${code ? `<small class="mapcode" title="${T('Mit diesem Code kann jeder die Karte laden')}">${T('Code')} <b>${esc(code)}</b></small>` : ''}</div>
      <div class="mymap-acts"><button class="btn small" data-open="${i}">${T('Bearbeiten')}</button>
      ${konto ? (code ? `<button class="btn small ghost" data-unpub="${i}">${T('Zurückziehen')}</button>`
        : `<button class="btn small" data-pub="${i}">${T('Veröffentlichen')}</button>`) : ''}
      <button class="btn small ghost" data-export="${i}">${T('Exportieren')}</button>
      <button class="btn small ghost" data-del="${i}">${T('Löschen')}</button></div></div>`;
  }).join('');
  const wo = konto ? T('Deine Karten liegen in deinem Konto – auf jedem Gerät, auf dem du angemeldet bist. Veröffentlichst du eine, bekommt sie einen Code: damit kann jeder sie laden und spielen.')
    : mapAccount ? T('Melde dich im Mehrspielermodus an, dann liegen deine Karten in deinem Konto und lassen sich mit einem Code veröffentlichen.')
      : T('Auf ein anderes Gerät kommen sie als Datei.');
  modal(T('Meine Karten'), `<div class="mm-acts">
      <button class="btn small primary" id="mm-new">${T('Neue Karte')}</button>
      ${mapAccount && mapAccount.browse ? `<button class="btn small" id="mm-browse">${T('Karten entdecken')}</button>` : ''}
      ${mapAccount ? `<button class="btn small ghost" id="mm-code">${T('Karte mit Code laden')}</button>` : ''}
      <button class="btn small ghost" id="mm-import">${T('Datei importieren')}</button></div>
    ${rows ? `<div class="mymaps">${rows}</div>` : `<p class="sub">${T('Noch keine eigene Karte gespeichert.')}</p>`}
    <p class="sub">${T('Eigene Karten stehen im Aufbau zur Wahl und lassen sich im Mehrspielermodus als Karte einer Lobby verwenden.')} ${wo}</p>`);
  $('overlay').classList.add('wide');
  const body = $('ov-body');
  body.querySelectorAll('[data-pub]').forEach(b => b.onclick = () => {
    const m = myMaps[+b.dataset.pub];
    b.disabled = true;
    mapAccount.publish(m.name).then(code => { toast(T('Veröffentlicht – Code %s', code)); myMapsModal(); })
      .catch(e => { toast(e.message); b.disabled = false; });
  });
  body.querySelectorAll('[data-unpub]').forEach(b => b.onclick = () => {
    const m = myMaps[+b.dataset.unpub];
    if (!confirm(T('„%s" zurückziehen? Der Code funktioniert dann nicht mehr.', m.name))) return;
    mapAccount.unpublish(m.name).then(() => myMapsModal()).catch(e => toast(e.message));
  });
  if ($('mm-code')) $('mm-code').onclick = () => loadMapByCodeAsk(() => myMapsModal());
  if ($('mm-browse')) $('mm-browse').onclick = () => { closeModal(); mapAccount.browse(); };
  body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    const m = myMaps[+b.dataset.open];
    if (editorLoad(m)) closeModal();
  });
  body.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    const m = myMaps[+b.dataset.export]; download(mapFileName(m), JSON.stringify(m, null, 1));
  });
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const m = myMaps[+b.dataset.del];
    if (!confirm(T('Karte „%s" löschen?', m.name))) return;
    deleteMyMap(m.name); myMapsModal();
  });
  $('mm-new').onclick = editorNewModal;
  $('mm-import').onclick = () => importMapFile(m => { if (editorLoad(m)) closeModal(); });
}
/* ------------------------------------------------------------------ Karteneditor (Mehrspieler-Erweiterung)
   Bearbeitet wird eine Karte in der Form von checkCustomMap: Name, Zeilen, Startpunkte,
   Marathon. `editMap.spawns` hat so viele Plätze, wie die Karte Reiche zulässt („Max.
   Reiche"); ein noch nicht gesetzter Startpunkt ist null. Ältere Karten (Hauptstadt je
   Zivilisation) und die festen Karten öffnen mit ihren vier Hauptstädten als Startpunkten.
   Oben steht laufend, ob die Karte spielbar ist und was noch fehlt. Speichern legt sie in
   „Meine Karten" (und ins Konto), Veröffentlichen gibt ihr einen Code (mapAccount, mp.js).

   Aufbau: Kopfzeile mit Name, Rückgängig/Wiederholen und Speichern; links die Werkzeuge
   (Malen, Füllen, Verschieben, Pinselgröße), die Palette (Gelände und Startpunkte), die
   Einstellungen der Karte und „Datei". Schmal (< 720 px) liegt die Karte oben, Werkzeuge und
   Palette darunter als Leisten; Einstellungen und Datei klappt „⋯" auf.

   Werkzeuge:
     edMode  'paint' – Gelände setzen, auch im Ziehen, mit der Pinselgröße edBrush (Radius 0–2);
                       ein Startpunkt wird immer mit einem Tipp gesetzt
             'fill'  – ein zusammenhängendes Gebiet desselben Geländes umfärben
             'pan'   – nur verschieben (Zoomen und Verschieben macht die Mobilschicht des
                       Servers; sie fragt edOwnsDrag(), ob ein Finger malt oder schiebt)
   Zwei Finger zoomen immer – ein gerade begonnener Strich wird dann zurückgenommen.
   Jede Änderung legt vorher den Stand auf edUndo (Zeilen, Startpunkte, Marathon). */
const SPAWN_COLORS = () => CIVS.map(c => c.color).concat(EXTRA_COLORS);
const ED_UNDO_MAX = 100;
let edMode = 'paint', edBrush = 0, edUndo = [], edRedo = [], edSaved = '', edSpace = false;
const edName = () => ($('ed-name').value || '').trim();
const edMax = () => editMap.spawns.length;
const edInside = (r, c) => r >= 0 && r < editMap.rows.length && c >= 0 && c < editMap.rows[r].length;
const edSnap = () => JSON.stringify({ rows: editMap.rows, spawns: editMap.spawns, marathon: editMap.marathon });
const edDirty = () => !!editMap && edSnap() + '|' + edName() !== edSaved;
const edMarkSaved = () => { edSaved = edSnap() + '|' + edName(); edUndoButtons(); };
/* Malt ein Finger (oder die Maus) gerade, statt die Karte zu verschieben? – fragt mobile.js */
function edOwnsDrag() {
  return $('screen-editor').classList.contains('show') && edMode !== 'pan' && !edSpace;
}
/* Ein Stand vor einer Änderung kommt auf den Stapel – nur, wenn sich etwas geändert hat. */
function edRemember(vorher) {
  if (vorher === edSnap()) return;
  edUndo.push(vorher);
  if (edUndo.length > ED_UNDO_MAX) edUndo.shift();
  edRedo = [];
  edUndoButtons();
}
function edRestore(stand) {
  const s = JSON.parse(stand);
  Object.assign(editMap, { rows: s.rows, spawns: s.spawns, marathon: s.marathon });
  if (edTool.startsWith('spawn:') && +edTool.slice(6) >= edMax()) edTool = 'spawn:' + (edMax() - 1);
  editorSettings(); editorPalette(); drawEditor();
}
function editorUndo() {
  if (!edUndo.length) return;
  edRedo.push(edSnap()); edRestore(edUndo.pop()); edUndoButtons();
}
function editorRedo() {
  if (!edRedo.length) return;
  edUndo.push(edSnap()); edRestore(edRedo.pop()); edUndoButtons();
}
function edUndoButtons() {
  $('ed-undo').disabled = !edUndo.length;
  $('ed-redo').disabled = !edRedo.length;
  $('ed-save').classList.toggle('dirty', edDirty());
}
/* Eine Karte in die Editorform bringen (Kopie). */
function editorForm(map) {
  const m = JSON.parse(JSON.stringify(map));
  let spawns = Array.isArray(m.spawns) ? m.spawns
    : (m.capitals && typeof m.capitals === 'object' && !Array.isArray(m.capitals))
      ? CIVS.map(c => m.capitals[c.k] || null) : [];
  spawns = spawns.slice(0, MAX_PLAYERS).map(p => Array.isArray(p) ? [p[0], p[1]] : null);
  while (spawns.length < MIN_PLAYERS) spawns.push(null);
  return { name: m.name || '', rows: m.rows, spawns, marathon: m.marathon === true };
}
/* Was checkCustomMap prüft – fehlende Startpunkte werden vorher benannt. */
function editorCheck() {
  const fehlt = editMap.spawns.findIndex(p => !p);
  if (fehlt >= 0) return { error: T('Startpunkt %s fehlt noch.', fehlt + 1) };
  return checkCustomMap(Object.assign({}, editMap, { name: edName() || T('Eigene Karte') }));
}
/* Den Editor mit einer Karte öffnen – gespeichert wird erst mit „Speichern". */
function editorOpen(map) {
  editMap = editorForm(map);
  $('ed-name').value = editMap.name;
  edUndo = []; edRedo = [];
  if (!$('screen-editor').classList.contains('show')) show('screen-editor');
  $('screen-editor').classList.remove('ed-open');
  editorChrome();
  editorSettings();
  editorPalette();
  drawEditor();
  edMarkSaved();
}
/* Wie editorOpen, fragt aber vorher, wenn die offene Karte ungespeicherte Änderungen hat.
   Gibt zurück, ob die Karte geöffnet wurde. */
function editorLoad(map) {
  if ($('screen-editor').classList.contains('show') && edDirty() &&
    !confirm(T('Die Änderungen an der offenen Karte sind nicht gespeichert. Verwerfen?'))) return false;
  editorOpen(map);
  return true;
}
function editorLeave() {
  if (edDirty() && !confirm(T('Die Änderungen an der offenen Karte sind nicht gespeichert. Verwerfen?'))) return;
  editMap = null;
  show('screen-menu');
}
/* Werkzeugknöpfe und Beschriftungen, die nicht im Markup stehen (Sprache, Konto). */
function editorChrome() {
  $('ed-name').placeholder = T('Name der Karte');
  [['ed-back', T('Zurück')], ['ed-undo', T('Rückgängig (Strg+Z)')], ['ed-redo', T('Wiederholen (Strg+Y)')],
    ['ed-more', T('Karte und Datei')]].forEach(([id, t]) => { $(id).title = t; $(id).setAttribute('aria-label', t); });
  const modes = [['paint', '✎', T('Malen'), 'B'], ['fill', '◩', T('Füllen'), 'F'], ['pan', '✥', T('Verschieben'), 'H']];
  $('ed-modes').innerHTML = modes.map(([k, sym, n, taste]) =>
    `<button class="ed-mode${edMode === k ? ' on' : ''}" data-mode="${k}" title="${n} (${taste})"><i aria-hidden="true">${sym}</i><span>${n}</span></button>`).join('');
  $('ed-modes').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => edSetMode(b.dataset.mode));
  $('ed-brush').innerHTML = `<span>${T('Pinsel')}</span>` + [0, 1, 2].map(k =>
    `<button class="ed-bsize${edBrush === k ? ' on' : ''}" data-brush="${k}" title="${T('%s Felder', [1, 7, 19][k])} (${k + 1})"><i style="--d:${6 + k * 5}px"></i></button>`).join('');
  $('ed-brush').querySelectorAll('[data-brush]').forEach(b => b.onclick = () => edSetBrush(+b.dataset.brush));
  $('ed-browse').hidden = !(mapAccount && mapAccount.browse);
}
function edSetMode(k) {
  edMode = k;
  $('ed-modes').querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === k));
  $('ed-brush').classList.toggle('off', k !== 'paint');
  // Füllen und Malen brauchen Gelände – ein gewählter Startpunkt wird zu Grasland
  if (k === 'fill' && edTool.startsWith('spawn:')) { edTool = 'G'; editorPalette(); }
}
function edSetBrush(k) {
  edBrush = k;
  $('ed-brush').querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('on', +b.dataset.brush === k));
  if (edMode !== 'paint') edSetMode('paint');
}
function editorSettings() {
  const max = $('ed-max');
  max.innerHTML = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)
    .map(k => `<option value="${k}"${k === edMax() ? ' selected' : ''}>${k}</option>`).join('');
  max.onchange = () => {
    const n = +max.value, vorher = edSnap();
    editMap.spawns = editMap.spawns.slice(0, n);
    while (editMap.spawns.length < n) editMap.spawns.push(null);
    if (edTool.startsWith('spawn:') && +edTool.slice(6) >= n) edTool = 'spawn:' + (n - 1);
    edRemember(vorher);
    editorPalette(); drawEditor();
  };
  $('ed-marathon').checked = editMap.marathon;
  $('ed-marathon').onchange = () => {
    const vorher = edSnap();
    editMap.marathon = $('ed-marathon').checked;
    edRemember(vorher);
    editorStatus();
  };
  $('ed-rows').value = editMap.rows.length;
  $('ed-cols').value = editMap.rows[0].length;
  $('ed-name').oninput = editorStatus;
}
function editorPalette() {
  const pal = $('ed-palette'); pal.innerHTML = '';
  const add = (k, label, col, cls) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (cls ? ' ' + cls : '') + (edTool === k ? ' on' : '');
    b.dataset.tool = k;
    b.title = label;
    b.innerHTML = `<i style="background:${col}">${cls && cls.startsWith('spawn') ? k.slice(6) * 1 + 1 : ''}</i><span>${label}</span>`;
    b.onclick = () => {
      edTool = k;
      if (k.startsWith('spawn:') && edMode === 'fill') edSetMode('paint');
      pal.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b));
    };
    pal.appendChild(b);
  };
  const head = text => { const h = document.createElement('p'); h.className = 'ed-pal-h'; h.textContent = text; pal.appendChild(h); };
  head(T('Gelände'));
  Object.values(TERRAIN).forEach(t => add(t.key, t.name, t.color));
  head(T('Startpunkte'));
  const farben = SPAWN_COLORS();
  editMap.spawns.forEach((p, i) => add('spawn:' + i, T('Start %s', i + 1), farben[i], p ? 'spawn' : 'spawn missing'));
}
function drawEditor() {
  const world = drawMap($('ed-map'), { name: editMap.name, rows: editMap.rows }, { showVoid: true });
  const farben = SPAWN_COLORS();
  editMap.spawns.forEach((p, i) => {
    if (!p || p[0] >= editMap.rows.length || p[1] >= editMap.rows[0].length) return;
    const [x, y] = hexCenter(p[0], p[1], HEX);
    world.appendChild(svgEl('circle', { cx: x, cy: y, r: 15, fill: farben[i], stroke: '#2a2721', 'stroke-width': 3, 'pointer-events': 'none' }));
    const t = svgEl('text', { x, y: y + 7, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700, fill: '#fff', 'pointer-events': 'none' });
    t.textContent = i + 1; world.appendChild(t);
  });
  editorStatus();
}
/* Neu zeichnen höchstens einmal je Bild – beim Malen im Ziehen */
let edDrawPending = false;
function edDrawSoon() {
  if (edDrawPending) return;
  edDrawPending = true;
  (window.requestAnimationFrame || (f => setTimeout(f, 16)))(() => { edDrawPending = false; if (editMap) drawEditor(); });
}
function editorStatus() {
  const r = editorCheck(), el = $('ed-status');
  const code = mapAccount && mapAccount.loggedIn() && edName() ? mapAccount.codeOf(edName()) : null;
  el.className = 'ed-status ' + (r.error ? 'bad' : 'ok');
  el.textContent = r.error ? T('Noch nicht spielbar: %s', r.error)
    : T('Spielbar: %s × %s Felder, bis %s Reiche%s.', editMap.rows.length, editMap.rows[0].length, edMax(),
      editMap.marathon ? T(', Marathonregeln') : '');
  el.title = el.textContent;
  $('ed-publish').textContent = code ? T('Veröffentlicht: %s', code) : T('Veröffentlichen');
  edUndoButtons();
  // die Palette zeigt, welche Startpunkte noch fehlen
  $('ed-palette').querySelectorAll('[data-tool^="spawn:"]').forEach(b =>
    b.classList.toggle('missing', !editMap.spawns[+b.dataset.tool.slice(6)]));
}
/* Gelände auf den Pinsel um (r, c) – ohne neu zu zeichnen. Gibt zurück, ob sich etwas änderte. */
function edPaintAt(r, c) {
  const t = TERRAIN[edTool];
  if (!t || !edInside(r, c)) return false;
  let neu = false;
  for (const [rr, cc] of edBrushCells(r, c)) {
    const row = editMap.rows[rr];
    if (row[cc] === edTool) continue;
    editMap.rows[rr] = row.slice(0, cc) + edTool + row.slice(cc + 1);
    // ein Startpunkt auf jetzt unpassierbarem Feld fällt weg
    if (!t.land || t.block) editMap.spawns.forEach((p, j) => { if (p && p[0] === rr && p[1] === cc) editMap.spawns[j] = null; });
    neu = true;
  }
  return neu;
}
function edBrushCells(r, c) {
  const out = [[r, c]], seen = new Set([key(r, c)]);
  let ring = [[r, c]];
  for (let i = 0; i < edBrush; i++) {
    const next = [];
    ring.forEach(([a, b]) => neighbors(a, b).forEach(([x, y]) => {
      if (!edInside(x, y) || seen.has(key(x, y))) return;
      seen.add(key(x, y)); next.push([x, y]); out.push([x, y]);
    }));
    ring = next;
  }
  return out;
}
/* Füllen: alle zusammenhängenden Felder mit dem Gelände von (r, c) */
function edFill(r, c) {
  const t = TERRAIN[edTool], alt = editMap.rows[r][c];
  if (!t || alt === edTool) return false;
  const rows = editMap.rows.map(z => z.split(''));
  const offen = [[r, c]];
  rows[r][c] = edTool;
  while (offen.length) {
    const [a, b] = offen.pop();
    for (const [x, y] of neighbors(a, b)) {
      if (!edInside(x, y) || rows[x][y] !== alt) continue;
      rows[x][y] = edTool;
      offen.push([x, y]);
    }
  }
  editMap.rows = rows.map(z => z.join(''));
  if (!t.land || t.block) editMap.spawns = editMap.spawns.map(p => p && editMap.rows[p[0]][p[1]] === edTool ? null : p);
  return true;
}
function edSpawnAt(r, c) {
  const i = +edTool.slice(6);
  const t = TERRAIN[editMap.rows[r][c]];
  if (!t.land || t.block) return toast(T('Startpunkte nur auf Land.'));
  const cur = editMap.spawns[i];
  if (cur && cur[0] === r && cur[1] === c) editMap.spawns[i] = null;           // zweimal = entfernen
  else {
    editMap.spawns.forEach((p, j) => { if (p && p[0] === r && p[1] === c) editMap.spawns[j] = null; });
    editMap.spawns[i] = [r, c];
    // gleich den nächsten fehlenden Startpunkt bereitlegen
    const next = editMap.spawns.findIndex(p => !p);
    if (next >= 0) { edTool = 'spawn:' + next; editorPalette(); }
  }
}
/* Ein Tipp auf ein Feld mit dem gewählten Werkzeug – ein Schritt zum Rückgängigmachen. */
function edTap(r, c) {
  if (!edInside(r, c)) return;
  const vorher = edSnap();
  if (edTool.startsWith('spawn:')) edSpawnAt(r, c);
  else if (edMode === 'fill') edFill(r, c);
  else edPaintAt(r, c);
  edRemember(vorher);
  drawEditor();
}
/* Maus, Finger, Stift auf der Karte: Malen setzt schon beim Aufsetzen und weiter im Ziehen
   (ein Strich = ein Schritt Rückgängig); Startpunkt und Füllen wirken bei einem Tipp. */
function editorPointer() {
  const svg = $('ed-map'), finger = new Set();
  let strich = null;
  const feldAn = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const h = el && el.closest ? el.closest('[data-r]') : null;
    return h && svg.contains(h) ? [+h.dataset.r, +h.dataset.c] : null;
  };
  const malt = () => edMode === 'paint' && !edTool.startsWith('spawn:');
  svg.addEventListener('pointerdown', e => {
    finger.add(e.pointerId);
    if (finger.size > 1) {               // zweiter Finger: es wird gezoomt, nicht gemalt
      if (strich && strich.vorher !== edSnap()) edRestore(strich.vorher);
      strich = null;
      return;
    }
    if ((e.pointerType === 'mouse' && e.button !== 0) || !edOwnsDrag()) return;
    strich = { id: e.pointerId, vorher: edSnap(), x: e.clientX, y: e.clientY, weit: false, zuletzt: null };
    const h = feldAn(e.clientX, e.clientY);
    if (h && malt()) { strich.zuletzt = key(h[0], h[1]); if (edPaintAt(h[0], h[1])) edDrawSoon(); }
  });
  window.addEventListener('pointermove', e => {
    if (!strich || e.pointerId !== strich.id) return;
    if (Math.hypot(e.clientX - strich.x, e.clientY - strich.y) > 8) strich.weit = true;
    if (!malt()) return;
    const h = feldAn(e.clientX, e.clientY);
    if (!h || key(h[0], h[1]) === strich.zuletzt) return;
    strich.zuletzt = key(h[0], h[1]);
    if (edPaintAt(h[0], h[1])) edDrawSoon();
  });
  const los = e => {
    finger.delete(e.pointerId);
    if (!strich || e.pointerId !== strich.id) return;
    const s = strich; strich = null;
    if (!malt()) {
      if (e.type === 'pointerup' && !s.weit) { const h = feldAn(e.clientX, e.clientY); if (h) edTap(h[0], h[1]); }
      return;
    }
    edRemember(s.vorher);
    drawEditor();
  };
  window.addEventListener('pointerup', los);
  window.addEventListener('pointercancel', los);
}
/* Tastatur im Editor: Strg+Z / Strg+Y (Strg+Umschalt+Z), Strg+S; B / F / H Werkzeug,
   1–3 Pinselgröße; die Leertaste gehalten verschiebt. Nicht, während man tippt. */
function editorKeys() {
  const aktiv = e => $('screen-editor').classList.contains('show') && !$('overlay').classList.contains('show') &&
    !(e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.nodeName));
  document.addEventListener('keydown', e => {
    if (!aktiv(e)) return;
    const k = e.key.toLowerCase(), strg = e.ctrlKey || e.metaKey;
    if (strg && k === 'z') { e.preventDefault(); if (e.shiftKey) editorRedo(); else editorUndo(); }
    else if (strg && k === 'y') { e.preventDefault(); editorRedo(); }
    else if (strg && k === 's') { e.preventDefault(); editorSave(); }
    else if (strg || e.altKey) return;
    else if (k === 'b') edSetMode('paint');
    else if (k === 'f') edSetMode('fill');
    else if (k === 'h') edSetMode('pan');
    else if (k === '1' || k === '2' || k === '3') edSetBrush(+k - 1);
    else if (k === ' ') { e.preventDefault(); edSpace = true; }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') edSpace = false; });
  window.addEventListener('blur', () => { edSpace = false; });
}
function editorResize() {
  const R = Math.max(CUSTOM_MAP_MIN, Math.min(CUSTOM_MAP_MAX, Math.floor(+$('ed-rows').value) || editMap.rows.length));
  const C = Math.max(CUSTOM_MAP_MIN, Math.min(CUSTOM_MAP_MAX, Math.floor(+$('ed-cols').value) || editMap.rows[0].length));
  const vorher = edSnap();
  const out = [];
  for (let i = 0; i < R; i++) out.push(((editMap.rows[i] || '').padEnd(C, 'M')).slice(0, C));
  editMap.rows = out;
  editMap.spawns = editMap.spawns.map(p => p && p[0] < R && p[1] < C ? p : null);
  $('ed-rows').value = R; $('ed-cols').value = C;
  edRemember(vorher);
  drawEditor();
}
/* Neue Karte: eine der festen Karten als Vorlage, oder leer in Wunschgröße mit einem Gelände */
function editorNewModal() {
  const vorlagen = MAPS.map((m, i) => {
    const f = editorForm(m);
    return `<button class="ed-tpl" data-tpl="${i}">${mapThumb(f)}<b>${esc(m.name)}</b><small>${mapMeta(Object.assign({ maxPlayers: f.spawns.length }, f))}</small></button>`;
  }).join('');
  modal(T('Neue Karte'), `<p class="sub">${T('Fang mit einer Vorlage an oder mit einer leeren Karte.')}</p>
    <div class="ed-tpls">${vorlagen}</div>
    <h4 class="ed-new-h">${T('Leere Karte')}</h4>
    <div class="row ed-size"><span>${T('Größe (Zeilen × Spalten)')}</span>
      <span><input id="ed-new-rows" type="number" min="${CUSTOM_MAP_MIN}" max="${CUSTOM_MAP_MAX}" value="16"> ×
      <input id="ed-new-cols" type="number" min="${CUSTOM_MAP_MIN}" max="${CUSTOM_MAP_MAX}" value="24"></span></div>
    <label class="row"><span>${T('Gelände')}</span><select id="ed-new-fill">
      ${['M', 'G', 'X'].map(k => `<option value="${k}">${esc(TERRAIN[k].name)}</option>`).join('')}</select></label>
    <button class="btn wide" id="ed-new-empty">${T('Leere Karte anlegen')}</button>`);
  $('ov-body').querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
    if (editorLoad(Object.assign({}, MAPS[+b.dataset.tpl], { name: '' }))) closeModal();
  });
  $('ed-new-empty').onclick = () => {
    const zahl = id => Math.max(CUSTOM_MAP_MIN, Math.min(CUSTOM_MAP_MAX, Math.floor(+$(id).value) || 16));
    const R = zahl('ed-new-rows'), C = zahl('ed-new-cols'), t = $('ed-new-fill').value;
    if (editorLoad({ name: '', rows: Array.from({ length: R }, () => t.repeat(C)), spawns: [null, null, null, null] })) {
      closeModal();
      edSetMode('paint');
    }
  };
}
/* Speichern: nur mit Namen und nur spielbar. Gibt die gespeicherte Karte zurück oder null. */
function editorSave(quiet) {
  const name = edName();
  if (!name) { $('ed-name').focus(); toast(T('Gib der Karte einen Namen.')); return null; }
  const r = editorCheck();
  if (r.error) { toast(T('Noch nicht spielbar: %s', r.error)); return null; }
  const map = Object.assign(r.map, { name: checkCustomMap(Object.assign({}, r.map, { name })).map.name });
  const vorhanden = myMap(map.name);
  if (vorhanden && JSON.stringify(vorhanden) !== JSON.stringify(map) && editMap.name !== map.name &&
    !confirm(T('Es gibt schon eine Karte „%s". Überschreiben?', map.name))) return null;
  const err = saveMyMap(map);
  if (err) { toast(err); return null; }
  editMap.name = map.name;
  if (!quiet) toast(T('Karte „%s" gespeichert', map.name));
  edMarkSaved();
  editorStatus();
  return map;
}
/* Veröffentlichen: erst speichern, dann den Code holen – oder ihn zeigen, wenn es ihn schon gibt. */
function editorPublish() {
  if (!mapAccount) return toast(T('Veröffentlichen geht nur mit dem Mehrspielerserver.'));
  if (!mapAccount.loggedIn()) return toast(T('Zum Veröffentlichen melde dich im Mehrspielermodus an.'));
  const map = editorSave(true);
  if (!map) return;
  const zeigen = code => {
    modal(T('Karte veröffentlicht'), `<p class="sub">${T('Mit diesem Code kann jeder „%s" laden und spielen – im Aufbau, in Lobbys und in Rundenspielen:', esc(map.name))}</p>
      <p style="text-align:center;font-size:28px;letter-spacing:4px" class="mapcode"><b>${esc(code)}</b></p>
      <p class="sub">${T('Speicherst du die Karte später neu, bekommen alle mit dem Code die neue Fassung.')}</p>
      <button class="btn wide" id="ed-code-copy">${T('Code kopieren')}</button>
      <button class="btn wide ghost" id="ed-unpub">${T('Zurückziehen')}</button>`);
    $('ed-code-copy').onclick = () => {
      try { navigator.clipboard.writeText(code).then(() => toast(T('Kopiert'))); } catch { toast(code); }
    };
    $('ed-unpub').onclick = () => {
      if (!confirm(T('„%s" zurückziehen? Der Code funktioniert dann nicht mehr.', map.name))) return;
      mapAccount.unpublish(map.name).then(() => { closeModal(); editorStatus(); toast(T('Zurückgezogen')); })
        .catch(e => toast(e.message));
    };
    editorStatus();
  };
  const code = mapAccount.codeOf(map.name);
  if (code) return zeigen(code);
  $('ed-publish').disabled = true;
  mapAccount.publish(map.name).then(zeigen).catch(e => toast(e.message))
    .then(() => { $('ed-publish').disabled = false; });
}
function editorScreen() {
  // Ohne geöffnete Karte: die zuletzt gespeicherte eigene, sonst die Originalkarte als Vorlage
  if (!editMap) editorOpen(Object.assign({}, myMaps[0] || Object.assign({}, DEFAULT_MAP, { name: '' })));
  else { editorChrome(); editorSettings(); editorPalette(); drawEditor(); }
}

