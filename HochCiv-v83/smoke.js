/* Führt die echte Oberfläche in jsdom aus: Aufbau → Spielzug → Forschen →
   Kartenwechsel → Bot-Züge. Fängt Referenz- und Laufzeitfehler ab. */
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM(fs.readFileSync(__dirname + '/index.html', 'utf8'), {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/',
});
const { window } = dom;
// jsdom kennt kein SVG-Layout – die drei benötigten Methoden nachrüsten
const SVG = window.SVGElement.prototype;
SVG.createSVGPoint = function () {
  return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
};
SVG.getScreenCTM = function () { return { a: 1, d: 1, inverse: () => ({}) }; };
window.Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0 });
window.Element.prototype.setPointerCapture = () => { };
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => { };

const errors = [];
window.addEventListener('error', e => errors.push(e.message));
// Im Browser teilen sich <script>-Tags den globalen Gültigkeitsbereich; eval nicht.
// Deshalb alles zusammen auswerten und einen Zugriffspunkt für den Test anhängen.
const src = ['js/data.js', 'js/civs.js', 'js/i18n.js', 'js/hex.js', 'js/tiles.js', 'js/engine.js', 'js/expansion.js', 'js/bots.js', 'js/ki.js', 'js/marathon.js', 'js/tutorial.js', 'js/ui.js']
  .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n');
window.eval(src + '\n;window.__get = n => eval(n); window.__set = (n, v) => eval(n + "=v");'
  + '\n;window.__runAuto = i => { TUT_STEPS[i].auto(); redraw(); };');
const G = n => window.__get(n);
const CIV_BY_KEY_TEST = k => G('CIV_BY_KEY')[k];
const CIVS_TEST = () => G('CIVS');
const SET = (n, v) => window.__set(n, v);
// Züge ohne Eingabe: Bots und KI (beide laufen über das Blatt mit „Weiter“)
const AUTO = p => p.kind === 'bot' || p.kind === 'ki';
// Das Auto-Weiterschalten im Tutorial läuft in der App über setTimeout. Im Test
// wird die Verzögerung auf 0 gesetzt, damit es synchron und damit prüfbar abläuft.
SET('TUT_AUTO_MS', 0);

const $ = id => window.document.getElementById(id);
const step = (label, fn) => {
  try { fn(); console.log('  ok  ' + label); }
  catch (e) { errors.push(label + ': ' + e.message); console.log('FAIL ' + label + ': ' + e.message); }
};

step('Menü gerendert', () => { if (!$('m-new')) throw new Error('kein Startknopf'); });
step('Tutorial fragt zuerst nach Erfahrung', () => {
  $('m-tutorial').onclick();
  if (!$('overlay').classList.contains('show')) throw new Error('keine Frage gestellt');
  if (!$('tut-ja') || !$('tut-nein')) throw new Error('Ja/Nein fehlen');
  const txt = $('ov-body').textContent;
  if (!/Erfahrung/.test(txt)) throw new Error('Frage fehlt: ' + txt.slice(0, 60));
  // „Ja" führt in die kurze Fassung, „Nein" in die lange – beide mit denselben Aufgaben
  $('tut-ja').onclick();
  const kurz = G('tutList')().length;
  if (!G('ui').tut.kurz) throw new Error('Ja führt nicht in die kurze Fassung');
  G('tutorialQuit')();
  $('m-tutorial').onclick(); $('tut-nein').onclick();
  const lang = G('tutList')().length;
  if (G('ui').tut.kurz) throw new Error('Nein führt nicht in die lange Fassung');
  if (!(kurz < lang)) throw new Error(`kurz ${kurz} ist nicht kürzer als lang ${lang}`);
  const aufgabenKurz = G('TUT_STEPS').filter(s2 => s2.task && s2.kurz !== false).length;
  const aufgabenLang = G('TUT_STEPS').filter(s2 => s2.task).length;
  if (aufgabenKurz !== aufgabenLang)
    throw new Error(`kurze Fassung hat ${aufgabenKurz} statt ${aufgabenLang} Aufgaben`);
  console.log(`       kurz ${kurz} Schritte, lang ${lang} · beide ${aufgabenLang} Aufgaben`);
  G('tutorialQuit')();
});
step('Tutorial: Übungsspiel startet in der Spieloberfläche', () => {
  $('m-tutorial').onclick(); $('tut-nein').onclick();
  $('tut-nein').onclick();
  if (!$('screen-game').classList.contains('show')) throw new Error('Tutorial öffnet nicht das Spiel');
  if ($('tut-panel').hidden) throw new Error('kein Erklärpanel unter der Karte');
  if ($('map').querySelectorAll('[data-r]').length !== 216) throw new Error('Karte fehlt');
  const S = G('S');
  if (S.players.find(p => p.kind === 'human').civ !== 'russland') throw new Error('nicht Russland');
  console.log('       ' + $('tut-count').textContent + ' · „' + $('tut-title').textContent + '"');
});
step('Tutorial: Schienen sperren alles außer dem vorgesehenen Schritt', () => {
  // Leseschritt 1: Aktionsleiste bis auf Nachschlagen gesperrt
  const locked = ['a-tech', 'a-found', 'a-power', 'a-end'].filter(id => !$(id).disabled);
  if (locked.length) throw new Error('offene Knöpfe im Leseschritt: ' + locked.join(','));
  // Gründungsschritt: nur das goldene Feld reagiert
  G('tutMove')(1); G('tutMove')(1); G('tutMove')(1);
  const hl = G('tutHighlight')();
  if (!hl || hl.length !== 1) throw new Error('nicht genau ein Zielfeld markiert');
  const cap = G('capitalOf')(G('S'), G('RU')());
  G('tapHex')(cap.r, cap.c);
  const wrong = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
  if (wrong.length) throw new Error('auf falschem Feld sind Aktionen offen');
  G('closeSheet')();
  console.log('       Zielfeld ' + hl[0].join('/') + ', andere Felder gesperrt');
});
step('Tutorial: Leseschritte erlauben gar keine Aktion', () => {
  // Schritt 2 ist ein reiner Leseschritt – dort darf man weder gründen noch wachsen.
  // Der Schritt davor endet im Gründungsschritt (4), also erst zurückblättern: bis v74
  // lief diese Prüfung versehentlich dort, und das fiel nicht auf, weil Gründen damals
  // im Blatt stattfand und die Leiste im Gründungsschritt ganz zu war.
  const S = G('S');
  while (+$('tut-count').textContent.split('/')[0] > 2) $('tut-prev').onclick();
  while (+$('tut-count').textContent.split('/')[0] < 2) $('tut-next').onclick();
  if (G('tutStep')().allow) throw new Error('Schritt 2 ist kein Leseschritt mehr');
  const cap = G('capitalOf')(S, G('RU')());
  G('tapHex')(cap.r, cap.c);
  const open = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
  if (open.length) throw new Error('im Leseschritt anklickbar: ' + open.map(b => b.textContent.trim()).join(', '));
  G('closeSheet')();
  const bar = ['a-tech', 'a-found', 'a-power', 'a-end'].filter(id => !$(id).disabled);
  if (bar.length) throw new Error('Leiste im Leseschritt offen: ' + bar.join(', '));
  console.log('       Stadtblatt und Leiste im Leseschritt vollständig gesperrt');
  $('tut-prev').onclick();
});
step('Tutorial: in jedem Schritt ist nur das Vorgesehene anklickbar', () => {
  // Systematische Prüfung: Leiste, Stadtblatt (eigene, fremde, leere Felder), Armee- und
  // Machtblatt, Technologiebogen – in allen Schritten.
  G('tutorialStart')();                     // sauber bei Schritt 1 beginnen
  const n = G('TUT_STEPS').length, problems = [];
  const labelsOk = (al, txt) => (al.labels || []).some(rx => new RegExp(rx.source || rx).test(txt));
  for (let i = 0; i < n; i++) {
    const t = $('tut-title').textContent, al = G('tutAllow')();
    const barOn = G('TUT_BAR').filter(id => !$(id).disabled);
    const extra = barOn.filter(id => !al.bar.includes(id));
    if (extra.length) problems.push((i + 1) + ' „' + t + '": Leiste offen: ' + extra);
    const S = G('S');
    const spots = S.cities.map(c => [c.r, c.c])
      .concat(G('within')(G('tutCap')().r, G('tutCap')().c, 2)
        .filter(([r, c]) => G('isLand')(S, r, c) && !G('cityAt')(S, r, c)).slice(0, 3));
    for (const [r, c] of spots) {
      G('tapHex')(r, c);
      const on = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled)
        .map(b => b.textContent.trim().split('\n')[0]);
      const bad = on.filter(x => !labelsOk(al, x));
      if (bad.length) problems.push((i + 1) + ' „' + t + '": Blatt offen auf ' + r + '/' + c + ': ' + bad);
      G('closeSheet')();
    }
    for (const id of ['a-power']) {
      if ($(id).disabled) continue;
      $(id).onclick();
      const on = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled)
        .map(b => b.textContent.trim().split('\n')[0]);
      const bad = on.filter(x => !labelsOk(al, x));
      if (bad.length) problems.push((i + 1) + ' „' + t + '": ' + id + ' offen: ' + bad);
      G('closeSheet')();
    }
    // Gründungsmodus (v75): auf jedem Feld außer dem vorgesehenen bleibt „Hier gründen" zu
    if (!$('a-found').disabled) {
      $('a-found').onclick();
      const ziel = (al.hex ? al.hex() : []).map(h => h.join('/'));
      for (const [r, c] of spots.concat(G('tutHighlight')() || [])) {
        G('tapHex')(r, c);
        const on = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
        if (on.length && !ziel.includes(r + '/' + c))
          problems.push((i + 1) + ' „' + t + '": gründen auf ' + r + '/' + c + ' offen');
        G('closeSheet')();
      }
      if (G('ui').mode === 'found') $('a-found').onclick();       // Modus wieder aus
    }
    if (!$('a-tech').disabled) {
      $('a-tech').onclick();
      const on = [...$('ov-body').querySelectorAll('[data-tech]')].filter(b => !b.disabled).map(b => b.dataset.tech);
      const bad = on.filter(k => !(al.techs || []).includes(k));
      if (bad.length) problems.push((i + 1) + ' „' + t + '": Techs offen: ' + bad);
      G('closeModal')();
    }
    // Aufgabe per Skript erledigen (nur hier im Test), Index aus dem Panel lesen
    // Gegenprobe: bei offener Aufgabe muss auch wirklich etwas bedienbar sein
    if ($('tut-next').disabled) {
      const anyBar = G('TUT_BAR').some(id => !$(id).disabled);
      let anySheet = false;
      for (const [r, c] of spots.concat(G('tutHighlight')() || [])) {
        G('tapHex')(r, c);
        if ([...$('sheet-body').querySelectorAll('.opt')].some(b => !b.disabled)) anySheet = true;
        G('closeSheet')();
      }
      if (!anyBar && !anySheet) problems.push((i + 1) + ' „' + t + '": nichts bedienbar – Sackgasse');
      G('__runAuto')(+$('tut-count').textContent.split('/')[0] - 1);
    }
    // __runAuto ruft redraw() – erledigte Aufgaben schalten dadurch von selbst weiter.
    // Deshalb nur klicken, wenn der Schritt noch steht.
    if (i < n - 1 && +$('tut-count').textContent.split('/')[0] - 1 === i) $('tut-next').onclick();
  }
  if (problems.length) throw new Error(problems.slice(0, 3).join(' | '));
  console.log('       ' + n + ' Schritte geprüft, keine Lücke in den Schienen');
});
step('Tutorial: alle Aufgaben über die echte Oberfläche erledigen', () => {
  G('tutorialStart')();                     // frisches Übungsspiel, wieder bei Schritt 1
  const n = G('TUT_STEPS').length;
  const open = () => !$('tut-next').disabled;
  const idx = () => +$('tut-count').textContent.split('/')[0] - 1;
  let manual = 0, auto = 0, guard = 0;
  while (guard++ < n * 3) {
    const i = idx();
    if (!$('tut-body').textContent.trim()) throw new Error('Schritt ' + (i + 1) + ' ohne Text');
    if (!open()) {
      if ($('tut-task').hidden) throw new Error('Aufgabe ohne Hinweiszeile in Schritt ' + (i + 1));
      const t = $('tut-title').textContent;
      const hl = G('tutHighlight')() || [];
      if (/Zug beenden/.test(t)) {
        $('a-end').onclick();
        let g2 = 0;
        while (g2++ < 24 && AUTO(G('P')(G('S'))) && $('bot-next')) $('bot-next').onclick();
        manual++;
      } else if (/Forschen|Wissenschaftliche|null|Mauern|Burgenbau|Technologien|Rad/.test(t)) {
        $('a-tech').onclick();
        const free = [...$('ov-body').querySelectorAll('[data-tech]')].filter(b => !b.disabled);
        if (!free.length) throw new Error('keine Kachel freigegeben in: ' + t);
        free.forEach(b => b.onclick());
        G('closeModal')(); manual++;
      } else if (/Stadt/.test(t) && hl.length) {
        // v75: gegründet wird über „Stadt gründen" in der Leiste, dann Feld, dann Knopf
        if ($('a-found').disabled) throw new Error('„Stadt gründen" gesperrt in: ' + t);
        $('a-found').onclick();
        G('tapHex')(hl[0][0], hl[0][1]);
        const en = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
        if (!en.length) throw new Error('kein Knopf freigegeben in: ' + t);
        en[0].onclick(); G('closeSheet')(); manual++;
        if (G('ui').mode === 'found') throw new Error('Gründungsmodus bleibt nach dem Gründen an');
      } else if (/wachsen/.test(t)) {
        for (const h of hl) {
          G('tapHex')(h[0], h[1]);
          const en = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
          if (en.length) en[0].onclick();
          G('closeSheet')();
        }
        manual++;
      } else if (/erste Armee/.test(t)) {
        G('tapHex')(hl[0][0], hl[0][1]);
        const en = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
        if (!en.length) throw new Error('Armee bauen nicht freigegeben');
        en[0].onclick(); G('closeSheet')(); manual++;
      } else if (/Armee bewegen/.test(t)) {
        const a = G('armiesOf')(G('S'), G('RU')())[0];
        G('tapHex')(a.r, a.c);
        const mv = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
        if (!mv.length) throw new Error('Bewegen nicht freigegeben');
        mv[0].onclick();
        const before = a.r + '/' + a.c;
        G('tapHex')(a.r, Math.max(0, a.c - 1));          // falsches Ziel
        if (a.r + '/' + a.c !== before) throw new Error('Armee auf falsches Feld gezogen');
        G('tapHex')(hl[0][0], hl[0][1]); manual++;
      } else if (/Gegenangriff/.test(t)) {
        // Drei Teilaufgaben in einem Schritt: forschen, Macht kaufen, Armee ziehen
        $('a-tech').onclick();
        [...$('ov-body').querySelectorAll('[data-tech]')].filter(b => !b.disabled)
          .forEach(b => b.onclick());
        G('closeModal')();
        let g2 = 0;
        while (G('tutP')().power < 3 && g2++ < 8) {
          $('a-power').onclick();
          const en = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
          if (!en.length) break;
          en[0].onclick();
        }
        G('closeSheet')();
        const arm = G('armiesOf')(G('S'), G('RU')())[0];
        G('tapHex')(arm.r, arm.c);
        const mv = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
        if (!mv.length) throw new Error('Bewegen nicht freigegeben');
        mv[0].onclick();
        G('tapHex')(hl[0][0], hl[0][1]);
        manual++;
      } else if (/Straßen/.test(t)) {
        for (const h of hl.slice()) {
          G('tapHex')(h[0], h[1]);
          const en = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
          if (en.length) en[0].onclick();
          G('closeSheet')();
        }
        manual++;
      } else if (/Bots getan/.test(t)) {
        $('a-log').onclick(); G('closeModal')(); manual++;
      } else if (/Macht/.test(t)) {
        let g2 = 0;
        while (!open() && idx() === i && g2++ < 8) {
          $('a-power').onclick();
          const en = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
          if (!en.length) break;
          en[0].onclick();
        }
        G('closeSheet')(); manual++;
      }
      // Erledigte Aufgaben schalten von selbst weiter (TUT_AUTO_MS = 0 im Test).
      // Bleibt der Schritt stehen, muss wenigstens „Weiter" freigegeben sein.
      if (idx() > i) { auto++; continue; }
      // Es gibt keinen „Für mich machen"-Ausweg: alles muss über die Oberfläche gehen
      if (!open()) throw new Error('Aufgabe nicht über die Oberfläche erfüllbar: ' + t);
      throw new Error('Aufgabe erledigt, aber nicht automatisch weitergeschaltet: ' + t);
    }
    if (i >= n - 1) break;
    $('tut-next').onclick();
    if (idx() === i) throw new Error('„Weiter" bewegt sich nicht in Schritt ' + (i + 1));
  }
  if (idx() !== n - 1) throw new Error('Durchlauf endet bei Schritt ' + (idx() + 1) + ' statt ' + n);
  if ($('tut-next').textContent !== 'Fertig') throw new Error('letzter Schritt heißt nicht Fertig');
  const tasks = G('TUT_STEPS').filter(st => st.goal).length;
  if (auto !== manual) throw new Error(auto + ' von ' + manual + ' Aufgaben schalten automatisch weiter');
  if (manual !== tasks) throw new Error(manual + ' Aufgaben erledigt, ' + tasks + ' erwartet');
  console.log('       ' + n + ' Schritte, ' + manual + ' Aufgaben über die Oberfläche erledigt, '
    + auto + '× automatisch weitergeschaltet');
});
step('Tutorial: „Fertig" gibt das Spiel frei', () => {
  $('tut-next').onclick();
  if (!$('tut-panel').hidden) throw new Error('Panel bleibt stehen');
  const locked = ['a-tech', 'a-found', 'a-power', 'a-end', 'a-yields'].filter(id => $(id).disabled);
  if (locked.length) throw new Error('Leiste bleibt gesperrt: ' + locked.join(','));
  const S = G('S');
  if (S.over) throw new Error('Spiel schon entschieden');
  console.log('       Runde ' + S.round + ', ' + S.cities.length + ' Städte, Leiste frei');
  G('show')('screen-menu');
});
step('Aufbaubildschirm', () => { $('m-new').onclick(); if (!$('setup-list').children.length) throw new Error('leer'); });
step('Bots einstellen', () => {
  [1, 2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
});
step('Kartenauswahl vorhanden', () => {
  const n = $('setup-map').options.length;
  if (n < 2) throw new Error('nur ' + n + ' Karte(n) wählbar');
  console.log('       ' + [...$('setup-map').options].map(o => o.text).join(' · '));
});
step('Schwierigkeit ist global (ein Dropdown)', () => {
  const sel = $('setup-diff');
  if (!sel || sel.options.length < 3) throw new Error('kein globales Schwierigkeit-Dropdown');
  if ($('setup-list').querySelector('[data-diff]')) throw new Error('noch Pro-Bot-Schwierigkeit vorhanden');
  console.log('       ' + [...sel.options].map(o => o.text).join(' · '));
});
step('Kartenmenü: feste Karten und Plättchenkarte, kein Rastergenerator mehr', () => {
  const opts = [...$('setup-map').options].map(o => o.value);
  if (!opts.includes('plaettchen')) throw new Error('keine Plättchenkarte im Kartenmenü');
  if (opts.includes('zufall')) throw new Error('die alte Rasterkarte steht noch im Menü');
  if (!opts.includes('0')) throw new Error('die Originalkarte fehlt');
  console.log('       ' + [...$('setup-map').options].map(o => o.text).join(' · '));
});
step('1-gegen-1-Modus im Aufbau', () => {
  $('setup-mode').querySelector('[data-mode=duell]').onclick();
  const slots = [...$('setup-list').children];
  if (slots.length !== 2) throw new Error('nicht zwei Plätze, sondern ' + slots.length);
  // Im Duell gibt es nur die Plättchenkarte – die festen Karten haben vier Startsterne.
  // Bei nur einer Möglichkeit bleibt die Kartenzeile weg.
  const karten = [...$('setup-map').options].map(o => o.value);
  if (karten.join() !== 'plaettchen') throw new Error('Kartenauswahl im Duell: ' + karten.join(','));
  if (!$('setup-map-row').hidden) throw new Error('Kartenzeile im Duell nicht versteckt');
  if (!$('setup-map').disabled) throw new Error('Kartenauswahl im Duell nicht abgeschaltet');
  if ($('setup-duel-hint').hidden) throw new Error('kein Hinweis auf die Duellregeln');
  const picks = slots.map(x => x.querySelector('[data-civpick]'));
  // vier Zivilisationen plus „Zufall"
  if (picks.some(p => !p) || picks[0].options.length !== 5)
    throw new Error('Zivilisationsliste hat ' + (picks[0] ? picks[0].options.length : 0) + ' Einträge');
  if ([...picks[0].options].pop().value !== 'zufall') throw new Error('kein Zufall in der Liste');
  // Kollision muss aufgelöst werden
  picks[0].value = slots[1].dataset.civ; picks[0].onchange();
  const now = [...$('setup-list').children].map(x => x.dataset.civ);
  if (now[0] === now[1]) throw new Error('beide Plätze mit derselben Zivilisation');
  if (![...$('setup-list').children][1].querySelector('[data-abil]').options.length)
    throw new Error('keine Fähigkeiten im zweiten Platz');
  console.log('       ' + now.join(' gegen ') + ', Startspieler-Auswahl: ' +
    [...$('setup-start').options].map(o => o.text).join('/'));
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  if ($('setup-list').children.length !== 4) throw new Error('Rückschalten auf vier Reiche misslingt');
});
step('Originalkarte ist vorausgewählt', () => {
  const sel = $('setup-map');
  if ($('setup-map-row').hidden) throw new Error('Kartenzeile fehlt bei vier Reichen');
  const chosen = sel.options[sel.selectedIndex >= 0 ? sel.selectedIndex : 0].text;
  if (!/^Originalkarte/.test(chosen)) throw new Error('vorausgewählt ist: ' + chosen);
  console.log('       ' + chosen);
});
step('Kein Regelmodus-Dropdown mehr', () => {
  if ($('setup-rules')) throw new Error('das v2-Dropdown existiert noch');
});
step('Erweiterungsmodule sind ab Werk aus und verstecken ihre Aufbauzeilen', () => {
  if (!$('m-options')) throw new Error('kein Einstellungen-Knopf im Hauptmenü');
  if (!$('setup-events-row').hidden) throw new Error('Ereigniszeile ohne Modul sichtbar');
  if (!$('setup-wonders-row').hidden) throw new Error('Wunderzeile ohne Modul sichtbar');
  if ($('setup-events').checked || $('setup-wonders').checked)
    throw new Error('Häkchen gesetzt, obwohl das Modul aus ist');
  console.log('       Aufbau ohne Module: Ereignis- und Wunderzeile weg');
});
step('Einstellungen schalten die Module zu', () => {
  $('m-options').onclick();
  if (!window.document.getElementById('screen-options').classList.contains('show'))
    throw new Error('Einstellungen öffnen nicht');
  if ($('opt-events').checked || $('opt-wonders').checked)
    throw new Error('Module sind nicht ab Werk aus');
  $('opt-events').checked = true; $('opt-events').onchange();
  $('opt-wonders').checked = true; $('opt-wonders').onchange();
  // Der Aufbau richtet sich beim Öffnen danach
  $('m-new').onclick();
  if ($('setup-events-row').hidden || $('setup-wonders-row').hidden)
    throw new Error('Modulzeilen erscheinen nicht im Aufbau');
  console.log('       beide Module an, Zeilen im Aufbau sichtbar');
});
step('Ein abgeschaltetes Modul nimmt sein Häkchen mit', () => {
  $('setup-events').checked = true; $('setup-events').onchange();
  $('m-options').onclick();
  $('opt-events').checked = false; $('opt-events').onchange();
  $('m-new').onclick();
  if (!$('setup-events-row').hidden) throw new Error('Ereigniszeile bleibt nach dem Abschalten');
  if ($('setup-events').checked)
    throw new Error('das Häkchen überlebt das Abschalten – Ereignisse liefen unsichtbar weiter');
  // wieder an für die folgenden Schritte
  $('m-options').onclick(); $('opt-events').checked = true; $('opt-events').onchange();
  $('m-new').onclick();
});
step('Erweiterungen ankreuzbar (Ereignisse, Weltwunder)', () => {
  if (!$('setup-events') || !$('setup-wonders')) throw new Error('Checkboxen fehlen');
  if (!$('setup-evmode-row').hidden) throw new Error('Ereignisstärke wird ohne Ereignisse gezeigt');
  $('setup-events').checked = true; $('setup-events').onchange();
  if ($('setup-evmode-row').hidden) throw new Error('Ereignisstärke bleibt versteckt');
  const modes = [...$('setup-evmode').options].map(o => o.text);
  if (modes.length !== 2) throw new Error('kein Easy/Hard-Modus');
  $('setup-wonders').checked = true;
  console.log('       ' + modes.join(' · '));
});
step('Fähigkeitswahl je Zivilisation', () => {
  const sels = [...$('setup-list').querySelectorAll('[data-abil]')];
  if (sels.length !== 4) throw new Error('nur ' + sels.length + ' Fähigkeits-Dropdowns');
  // drei Fähigkeiten plus „Zufall"
  if (sels[0].options.length !== 4)
    throw new Error(sels[0].options.length + ' Einträge statt drei Fähigkeiten plus Zufall');
  if ([...sels[0].options].pop().value !== 'zufall') throw new Error('kein Zufall in der Liste');
  const botSlot = $('setup-list').children[1];
  if (!botSlot.querySelector('[data-abil]').disabled) throw new Error('Bot-Fähigkeit nicht gesperrt');
  if (!/keine Zivilisationsfähigkeit/.test(botSlot.querySelector('.abil').textContent))
    throw new Error('kein Hinweis, dass Bots keine Fähigkeit haben');
  console.log('       ' + [...sels[0].options].map(o => o.text).join(' · '));
});
step('Spiel starten (mit Ereignissen und Weltwundern)', () => {
  $('setup-go').onclick();
  const S = G('S');
  if (!S.ev || !S.wo) throw new Error('Erweiterungen nicht übernommen');
  console.log('       Ereignis Runde 1: ' + (S.event && S.event.k ? S.event.k : 'keines'));
});
step('Karte gezeichnet', () => {
  const n = $('map').querySelectorAll('[data-r]').length;
  if (n < 100) throw new Error('nur ' + n + ' Felder');
  console.log('       ' + n + ' Felder, ' + $('map').querySelectorAll('circle').length + ' Stadtkreise');
});
step('Feld antippen (Hauptstadt)', () => {
  const S = G('S'), cap = G('capitalOf')(S, S.cur);
  G('tapHex')(cap.r, cap.c);
  if (!$('sheet').classList.contains('open')) throw new Error('Aktionsblatt öffnet nicht');
  console.log('       ' + $('sheet-body').textContent.replace(/\s+/g, ' ').slice(0, 96));
});
step('Stadt wachsen lassen', () => {
  const before = G('popOf')(G('S'), G('S').cur);
  const btns = [...$('sheet-body').querySelectorAll('.opt')].filter(b => !b.disabled);
  if (btns.length) btns[0].onclick();
  console.log('       Bevölkerung ' + before + ' → ' + G('popOf')(G('S'), G('S').cur));
});
step('Freies Feld antippen', () => {
  const S = G('S'), cap = G('capitalOf')(S, S.cur);
  const spot = G('within')(cap.r, cap.c, 4).find(([r, c]) => !G('canFound')(S, S.cur, r, c));
  if (spot) { G('tapHex')(spot[0], spot[1]); console.log('       ' + $('sheet-body').textContent.replace(/\s+/g, ' ').slice(0, 80)); }
});
step('Technologiebogen', () => {
  $('a-tech').onclick();
  const n = $('ov-body').querySelectorAll('.tech').length;
  if (n < 50) throw new Error('nur ' + n + ' Technologien');
  const open = $('ov-body').querySelectorAll('[data-tech]').length;
  console.log('       ' + n + ' Technologien, davon ' + open + ' jetzt erforschbar');
  if (open) $('ov-body').querySelector('[data-tech]').onclick();
});
step('Machtblatt', () => { G('closeModal')(); $('a-power').onclick(); });
step('Protokoll', () => { $('a-log').onclick(); G('closeModal')(); });
step('Armee bauen, in der Stadt anwählen und bewegen', () => {
  const S = G('S'), pi = S.cur, cap = G('capitalOf')(S, pi);
  S.players[pi].res.coins = 60;
  const err = G('buildArmy')(S, pi, cap);
  if (err) throw new Error(err);
  const army = S.armies.filter(a => a.owner === pi).pop();
  if (army.r !== cap.r || army.c !== cap.c) throw new Error('Armee steht nicht in der Stadt');
  G('tapHex')(cap.r, cap.c);
  const b = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Armee hier bewegen/.test(x.textContent));
  if (!b) throw new Error('Armee auf dem Stadtfeld nicht anwählbar');
  b.onclick();
  const ziel = G('neighbors')(cap.r, cap.c).find(([r, c]) => G('canPass')(S, pi, r, c));
  G('tapHex')(ziel[0], ziel[1]);
  if (army.r === cap.r && army.c === cap.c) throw new Error('Armee hat sich nicht bewegt');
  console.log('       Armee von ' + cap.r + '/' + cap.c + ' nach ' + army.r + '/' + army.c);
});
step('Kein Knopf „Armeen" mehr (v79) – Armeen wählt man auf der Karte', () => {
  if ($('a-army')) throw new Error('der Knopf „Armeen" ist noch da');
  if (G('typeof armySheet') !== 'undefined') throw new Error('armySheet gibt es noch');
  const knoepfe = [...$('screen-game').querySelectorAll('.actionbar button')].map(b => b.textContent.trim());
  if (knoepfe.some(t => /Armee/.test(t))) throw new Error('Leiste: ' + knoepfe.join(', '));
  // eine eigene Armee auf freiem Feld: antippen → „Diese Armee bewegen"
  const S = G('S'), pi = S.cur;
  if (AUTO(S.players[pi]) || S.over) return console.log('       kein menschlicher Zug – nur der Knopf geprüft');
  const a = S.armies.find(x => x.owner === pi && !G('cityAt')(S, x.r, x.c) && x.mp > 0);
  if (!a) return console.log('       Leiste ohne „Armeen" (' + knoepfe.length + ' Knöpfe), keine freie Armee zum Antippen');
  G('tapHex')(a.r, a.c);
  const b = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Diese Armee bewegen/.test(x.textContent));
  if (!b || b.disabled) throw new Error('Armee auf der Karte nicht anwählbar');
  b.onclick();
  if (G('ui').army !== a) throw new Error('Armee nicht ausgewählt');
  G('ui').army = null; G('redraw')();
  console.log('       Leiste: ' + knoepfe.join(' · ') + ' · Armee auf ' + a.r + '/' + a.c + ' über die Karte gewählt');
});
step('Welt-Ansicht zeigt Ereignis und Weltwunder', () => {
  const S = G('S');
  while (AUTO(S.players[S.cur]) && !S.over && $('bot-next')) $('bot-next').onclick();
  if (S.over) return console.log('       Spiel schon entschieden – übersprungen');
  $('a-info').onclick();
  const txt = $('ov-body').textContent.replace(/\s+/g, ' ');
  if (!/Weltwunder|Ereignis/.test(txt)) throw new Error('Welt-Ansicht ohne Inhalt');
  console.log('       ' + txt.slice(0, 90));
  G('closeModal')();
});
step('Weltwunder in der Stadt bauen', () => {
  const S = G('S'), pi = S.cur, cap = G('capitalOf')(S, pi);
  if (!cap || AUTO(S.players[pi])) return console.log('       kein menschlicher Zug – übersprungen');
  S.players[pi].res.coins = 200;
  G('tapHex')(cap.r, cap.c);
  const b = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Weltwunder bauen/.test(x.textContent));
  if (!b) throw new Error('kein Weltwunder-Knopf im Stadtblatt');
  if (b.disabled) throw new Error('Weltwunder-Knopf gesperrt trotz Münzen');
  b.onclick();
  const opts = [...$('sheet-body').querySelectorAll('[data-w]')].filter(x => !x.disabled);
  if (!opts.length) throw new Error('keine baubaren Wunder angeboten');
  const before = S.wonders.length;
  opts[0].onclick();
  if (S.wonders.length !== before + 1) throw new Error('Wunder nicht gebaut');
  console.log('       gebaut: ' + G('WONDER_BY_KEY')[S.wonders[before].k].n +
    ' · Marker auf der Karte: ' + $('map').querySelectorAll('rect').length);
  G('closeModal')(); G('closeSheet')();
});
step('Nahrungsfenster: Bevölkerungskosten aus Münzen bestreiten', () => {
  const S = G('S'), pi = S.cur, p = S.players[pi];
  if (AUTO(p)) return console.log('       kein menschlicher Zug – übersprungen');
  p.techs.massenmedien = true;
  // Lage von Hand stellen: Saldo −3, Bevölkerung isst 5
  p.res.coins = 12; p.res.food = 0; p.foodDeficit = 3; p.foodRaw = -3;
  p.popFood = 5; p.popCovered = 0; p.popCoveredBy = { sci: 0, coins: 0 };
  p.popSpent = { sci: 0, coins: 0 }; p.popDefPart = 0;
  $('hud-feed').onclick();
  const txt = $('sheet-body').textContent;
  if (!/Das Land produziert/.test(txt)) throw new Error('keine Produktionszeile');
  if (!/Die Bevölkerung isst/.test(txt)) throw new Error('keine Kostenzeile');
  const b = [...$('sheet-body').querySelectorAll('[data-k]')];
  if (!b.length) throw new Error('kein Deckungsknopf');
  // größten Knopf wählen: deckt alles, was die Bevölkerung isst
  b.sort((x, y) => +y.dataset.n - +x.dataset.n)[0].onclick();
  if (p.popCovered !== 5) throw new Error('nicht voll gedeckt: ' + p.popCovered);
  if (p.foodDeficit !== 0) throw new Error('Defizit nicht gedeckt');
  if (p.res.food !== 2) throw new Error('falsche Nahrung: ' + p.res.food + ' statt 2');
  // eine Münze deckt drei (v66) – fünf offene Kosten brauchen also zwei Münzen
  if (p.res.coins !== 10) throw new Error('falscher Münzabzug: ' + p.res.coins);
  // Zurücknehmen muss angeboten werden und wirken
  const zurueck = $('sheet-body').querySelector('[data-back]');
  if (!zurueck) throw new Error('kein Rücknahmeknopf');
  zurueck.onclick();
  if (p.popCovered !== 0 || p.res.coins !== 12)
    throw new Error('Rücknahme unvollständig: ' + p.popCovered + '/' + p.res.coins);
  console.log('       Land 2, isst 5 → voll gedeckt für 2 Münzen: 2 Nahrung, 10 Münzen; Rücknahme klappt');
  G('closeSheet')();
});
step('Gentechnik: Nahrung im Einkommen UND Füttern 1:1 im Blatt', () => {
  const S = G('S'), p = G('P')(S);
  if (AUTO(p)) return console.log('       kein menschlicher Zug – übersprungen');
  const hatteMM = !!p.techs.massenmedien, hatteGT = !!p.techs.gentechnik;
  /* Ereignisse für die Messung stummschalten: läuft gerade eine Hungersnot, produziert
     niemand Nahrung – dann wäre auch der Gentechnik-Posten korrekt 0 und der Vergleich
     unten schlüge grundlos an. Genau daran lag ein sporadischer Fehlschlag. */
  const stumm = S.evMuted;
  S.evMuted = true;
  const cap = G('capitalOf')(S, S.cur), popVorher = cap ? cap.pop : null;
  if (cap) cap.pop = Math.max(cap.pop, 12);   // genug Wissenschaft, damit der Posten greift
  delete p.techs.massenmedien;
  p.techs.gentechnik = true;
  const mit = G('income')(S, S.cur).food;
  delete p.techs.gentechnik;
  const basis = G('income')(S, S.cur).food, wiss = G('income')(S, S.cur).sci;
  p.techs.gentechnik = true;
  const je = G('GENE_SCI_PER_FOOD');
  if (cap) cap.pop = popVorher;
  S.evMuted = stumm;
  const ohne = mit;
  if (mit - basis !== Math.floor(wiss / je))
    throw new Error('Einkommensposten falsch: ' + (mit - basis) + ' statt ' + Math.floor(wiss / je));
  if (mit - basis < 1) throw new Error('Posten bleibt 0, die Probe sagt dann nichts');
  // und daneben steht die Wissenschaft weiter als Futterquelle im Blatt
  p.res.sci = 20; p.res.food = 0; p.foodDeficit = 0; p.foodRaw = 0;
  p.popFood = 4; p.popCovered = 0; p.popCoveredBy = { sci: 0, coins: 0 };
  p.popSpent = { sci: 0, coins: 0 }; p.popDefPart = 0;
  G('foodSheet')();
  const b = [...$('sheet-body').querySelectorAll('[data-k="sci"]')];
  if (!b.length) throw new Error('Wissenschaft wird nicht als Quelle angeboten');
  b.sort((x, y) => +y.dataset.n - +x.dataset.n)[0].onclick();
  if (p.popCovered !== 4) throw new Error('nicht voll gedeckt: ' + p.popCovered);
  if (p.res.sci !== 16) throw new Error('kein 1:1-Abzug: ' + p.res.sci + ' statt 16');
  G('closeSheet')();
  // Lage hinterlassen, wie sie war – die folgenden Schritte rechnen damit weiter
  if (hatteMM) p.techs.massenmedien = true;
  if (!hatteGT) delete p.techs.gentechnik;
  console.log('       Einkommen +' + (ohne - basis) + ' 🌾 aus ' + wiss +
    ' Wissenschaft · und 4 Kosten für 4 Wissenschaft gedeckt');
});
step('Sklaverei wird im Techbogen als obsolet markiert', () => {
  const S = G('S'), pi = S.cur;
  S.players[pi].techs.sklaverei = true; S.players[pi].techs.robotik = true;
  $('a-tech').onclick();
  const tile = [...$('ov-body').querySelectorAll('.tech')].find(t => /Sklaverei/.test(t.textContent));
  if (!tile.classList.contains('obsolete')) throw new Error('keine Obsoleszenz-Markierung');
  if (!/obsolet/.test(tile.textContent)) throw new Error('kein Hinweistext');
  console.log('       ' + tile.textContent.replace(/\s+/g, ' ').trim().slice(0, 60));
  G('closeModal')();
});
step('Internet: Gratiskopie im Technologiebogen', () => {
  const S = G('S'), pi = S.cur;
  S.players[pi].techs.internet = true;
  const other = (pi + 1) % S.players.length;
  S.players[other].techs.stadtmauern = true;
  $('a-tech').onclick();
  const btn = [...$('ov-body').querySelectorAll('[data-copy]')].find(b => /Stadtmauern/.test(b.textContent));
  if (!btn) throw new Error('keine kopierbare Technologie angezeigt');
  const gratis = /gratis/.test(btn.textContent);
  console.log('       Kopie als ' + (gratis ? 'gratis' : 'bezahlt') + ' markiert');
  // Die Gratiskachel zeigt die Wirkung der Technologie wie jede andere Kachel – bis v72
  // stand dort nur „Internet · Gratiskopie", die Wirkung fehlte.
  const frei = $('ov-body').querySelector('[data-copy="stadtmauern"][data-mode="free"]');
  if (!frei) throw new Error('keine Gratiskachel für Stadtmauern');
  const eff = frei.querySelector('.eff').textContent.trim();
  const soll = G('techEffect')(G('TECH_BY_KEY').stadtmauern, S);
  if (eff !== soll) throw new Error('Gratiskachel zeigt „' + eff + '" statt der Wirkung „' + soll + '"');
  if (/Gratiskopie/.test(frei.textContent)) throw new Error('„Gratiskopie" steht noch auf der Kachel');
  if (frei.querySelector('.c').textContent.trim() !== 'gratis') throw new Error('Preisfeld nicht „gratis"');
  // auf Englisch: „free" und die englische Wirkung (vorher stand „gratis" fest im Code)
  G('closeModal')(); G('switchLang')('en'); G('techModal')();
  const freiEn = $('ov-body').querySelector('[data-copy="stadtmauern"][data-mode="free"]');
  const effEn = freiEn.querySelector('.eff').textContent.trim();
  if (effEn !== 'Cities have +5 defence') throw new Error('englische Gratiskachel: „' + effEn + '"');
  if (freiEn.querySelector('.c').textContent.trim() !== 'free')
    throw new Error('englisches Preisfeld: „' + freiEn.querySelector('.c').textContent.trim() + '"');
  G('closeModal')(); G('switchLang')('de'); $('a-tech').onclick();
  console.log('       Gratiskachel: „' + eff + '" · englisch „' + effEn + '"');
  const btn2 = [...$('ov-body').querySelectorAll('[data-copy]')].find(b => /Stadtmauern/.test(b.textContent));
  btn2.onclick();
  if (!G('has')(S.players[pi], 'stadtmauern')) throw new Error('Kopie nicht übernommen');
  G('closeModal')();
});
step('Sklaverei- und Kolonialismus-Buttons erscheinen', () => {
  const S = G('S'), pi = S.cur, cap = G('capitalOf')(S, pi);
  // Sklaverei ist ab der Moderne obsolet – für diesen Test die Moderne-Techs entfernen
  const modern = G('TECHS').filter(t => t.age === 3 && S.players[pi].techs[t.k]).map(t => t.k);
  modern.forEach(k => delete S.players[pi].techs[k]);
  S.players[pi].techs.sklaverei = true; S.players[pi].techs.kolonialismus = true;
  cap.pop = 3; S.players[pi].res.coins = 30;
  G('tapHex')(cap.r, cap.c);
  const acts = [...$('sheet-body').querySelectorAll('.opt')].map(b => b.textContent);
  if (!acts.some(t => /opfern/i.test(t))) throw new Error('kein Sklaverei-Button');
  // mit einer Technologie der Moderne muss der Knopf verschwinden
  S.players[pi].techs.robotik = true;
  G('tapHex')(cap.r, cap.c);
  const acts2 = [...$('sheet-body').querySelectorAll('.opt')].map(b => b.textContent);
  if (acts2.some(t => /opfern/i.test(t))) throw new Error('Sklaverei ab Moderne noch anklickbar');
  console.log('       Stadtaktionen sichtbar: ' + acts.length + ', ab Moderne ohne Opfern-Knopf');
});
step('Atomwaffen: Knopf vorhanden und wirksam', () => {
  const S = G('S');
  S.players[S.cur].techs.atomwaffen = true;
  const cap = G('capitalOf')(S, S.cur);
  const spot = G('neighbors')(cap.r, cap.c).find(([r, c]) => G('isLand')(S, r, c) && !G('cityAt')(S, r, c) && !G('armyAt')(S, r, c));
  S.armies.push({ id: 9999, owner: (S.cur + 1) % S.players.length, r: spot[0], c: spot[1], mp: 0, born: 0 });
  // Läuft gerade das Ereignis Atomwaffenproteste, muss der Knopf gesperrt sein
  if (S.nukeBan) {
    G('tapHex')(spot[0], spot[1]);
    const locked = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Atomschlag/.test(x.textContent));
    if (!locked || !locked.disabled) throw new Error('Atomschlag trotz Atomwaffenprotesten möglich');
    console.log('       Atomwaffenproteste aktiv: Knopf korrekt gesperrt');
    S.nukeBan = false;   // für den eigentlichen Test aufheben
  }
  G('tapHex')(spot[0], spot[1]);
  const b = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Atomschlag/.test(x.textContent));
  if (!b) throw new Error('kein Atomschlag-Knopf im Aktionsblatt');
  if (b.disabled) throw new Error('Atomschlag-Knopf ohne Grund gesperrt');
  b.onclick();
  if (S.armies.some(a => a.id === 9999)) throw new Error('Armee wurde nicht zerstört');
  const again = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Atomschlag/.test(x.textContent));
  console.log('       Armee zerstört; zweiter Einsatz in derselben Runde ' +
    (again && again.disabled ? 'gesperrt' : 'NICHT gesperrt'));
});
step('Info-Sheet lässt sich schließen (Punkt 4)', () => {
  const cap = G('capitalOf')(G('S'), G('S').cur);
  G('tapHex')(cap.r, cap.c);
  if (!$('sheet').classList.contains('open')) throw new Error('Sheet öffnet nicht');
  if (!$('sheet-close')) throw new Error('kein Schließen-Knopf im Sheet');
  $('sheet-close').onclick();
  if ($('sheet').classList.contains('open')) throw new Error('Sheet lässt sich nicht schließen');
});
step('Technologiebogen zeigt, wer welche Tech hat (Punkt 2)', () => {
  const S = G('S'), pi = S.cur;
  S.players[pi].techs.schrift = true;
  S.players[(pi + 1) % S.players.length].techs.schrift = true;
  $('a-tech').onclick();
  const tile = [...$('ov-body').querySelectorAll('.tech')].find(t => /Schrift/.test(t.textContent));
  const marks = tile.querySelectorAll('.owner-mark');
  if (marks.length < 2) throw new Error('Besitzer-Marker fehlen');
  if (!tile.querySelector('.owner-mark.self')) throw new Error('eigenes Reich nicht hervorgehoben');
  console.log('       ' + marks.length + ' Reiche auf der Schrift-Kachel markiert');
  G('closeModal')();
});
step('Ertragsübersicht im Forschungsbogen (Punkt 2)', () => {
  const S = G('S'), pi = S.cur;
  G('capitalOf')(S, pi).pop = 3;
  $('a-tech').onclick();
  const panel = $('ov-body').querySelector('.yield-panel');
  if (!panel) throw new Error('keine Ertragsübersicht');
  const rows = panel.querySelectorAll('.yrow');
  if (rows.length < 2) throw new Error('Übersicht hat zu wenige Zeilen');
  if (!$('overlay').classList.contains('wide')) throw new Error('Modal nicht verbreitert');
  // die Summe muss dem Einkommen entsprechen
  const inc = G('income')(S, pi);
  console.log('       ' + rows.length + ' Zeilen · Summe ' + [inc.sci, inc.food, inc.coins].join('/'));
  G('closeModal')();
});
step('Bot-Fenster zeigt Einträge auch bei vollem Log (Bugfix)', () => {
  const S = G('S');
  for (let i = 0; i < 650; i++) G('log')(S, 'roll', 'Füller ' + i);
  if (S.log.length !== 600) throw new Error('Log nicht gekappt');
  $('a-end').onclick();                       // Bots laufen
  if (AUTO(S.players[S.cur])) {
    const lines = $('sheet-body').querySelectorAll('.logline').length;
    if (lines === 0) throw new Error('Bot-Fenster leer trotz Aktionen (der alte Bug)');
    console.log('       Bot-Fenster: ' + lines + ' Zeilen bei vollem Log');
    // die Runde zu Ende klicken
    let g = 0;
    while (AUTO(S.players[S.cur]) && !S.over && g++ < 6 && $('bot-next')) $('bot-next').onclick();
  }
});
step('Bot-Zug: nur „Weiter" führt weiter (Punkt 5)', () => {
  const S = G('S');
  $('a-end').onclick();                       // menschlichen Zug beenden → Bots laufen
  let guard = 0;
  while (AUTO(S.players[S.cur]) && !S.over && guard++ < 6) {
    if (!$('bot-next')) throw new Error('kein Weiter-Knopf im Bot-Sheet');
    if (!G('ui').botLock) throw new Error('Sheet ist während Bot-Zug nicht gesperrt');
    G('closeSheet')();                         // darf nichts bewirken
    if (!$('sheet').classList.contains('open')) throw new Error('Sheet ließ sich trotz Sperre schließen');
    $('bot-next').onclick();
  }
  if (G('ui').botLock) throw new Error('Sperre nach Bot-Runde nicht aufgehoben');
});
step('Zug beenden + Bot-Züge', () => {
  for (let i = 0; i < 8 && !G('S').over; i++) {
    $('a-end').onclick();
    let guard = 0;
    while (AUTO(G('S').players[G('S').cur]) && !G('S').over && guard++ < 6) {
      const next = $('bot-next'); if (!next) break; next.onclick();
    }
  }
  console.log('       Runde ' + G('S').round + ' · Bevölkerung ' +
    G('S').players.map((p, i) => G('popOf')(G('S'), i)).join('/') +
    (G('S').over ? ' · ' + G('S').over.how : ''));
});
step('Spielstand speicherbar', () => { JSON.parse(JSON.stringify(G('S'))); });
step('Karteneditor', () => {
  G('show')('screen-editor'); G('editorScreen')();
  window.__set('edTool', 'B'); G('edTap')(8, 8);
  if (G('editMap').rows[8][8] !== 'B') throw new Error('Gelände nicht gesetzt');
  window.__set('edTool', 'cap:england'); G('edTap')(8, 9);
  if (G('editMap').capitals.england[1] !== 9) throw new Error('Hauptstadt nicht gesetzt');
  $('ed-size').onclick && (window.prompt = () => '16');
});

/* ================================================ Die sieben Designänderungen
   Frisches Spiel: die Läufe davor enden im Siegbildschirm oder bei einem Bot. */
/* Ein frisches Spiel für die folgenden Prüfungen: vier Reiche, Originalkarte, Platz 1
   Mensch. Modus und Karte werden ausdrücklich gesetzt – vorherige Schritte hinterlassen
   ihre Wahl, und mit der Plättchenkarte käme statt eines Spiels die Legephase. */
const frischesSpiel = () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = '0'; $('setup-map').onchange();
  $('setup-list').children[0].querySelector('[data-kind="human"]').onclick();
  [1, 2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
  $('setup-start').value = '0'; $('setup-start').onchange();
  $('setup-go').onclick();
  const S = G('S');
  if (!$('screen-game').classList.contains('show')) throw new Error('kein Spielbildschirm');
  if (S.over) throw new Error('frisches Spiel ist schon entschieden');
  if (G('P')(S).kind === 'bot') throw new Error('frisches Spiel beginnt mit einem Bot');
};
step('Karte: kein Zoomen und Schieben mehr, Treffer direkt auf dem Feld', () => {
  frischesSpiel();
  if (G('typeof view') !== 'undefined') throw new Error('Ansichts-Zustand noch vorhanden');
  if (G('typeof attachGestures') !== 'undefined') throw new Error('Gestenerkennung noch vorhanden');
  const svg = $('map');
  if (!svg.getAttribute('viewBox')) throw new Error('keine viewBox – Karte wird nicht eingepasst');
  const world = svg.querySelector('#world');
  if (world && world.getAttribute('transform')) throw new Error('Weltgruppe ist verschoben/skaliert');
  // Klick auf ein Sechseck wählt genau dieses Feld – ohne Koordinatenrechnung
  const S = G('S'); const cap = G('capitalOf')(S, S.cur);
  if (!cap) throw new Error('keine Hauptstadt');
  const poly = svg.querySelector(`[data-r="${cap.r}"][data-c="${cap.c}"]`);
  if (!poly) throw new Error('Feld nicht im SVG');
  poly.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const sel = G('ui').sel;
  if (!sel || sel[0] !== cap.r || sel[1] !== cap.c) throw new Error('Klick wählt das falsche Feld');
  G('closeSheet')();
  console.log('       viewBox gesetzt, Klick trifft ' + sel.join('/'));
});
step('Aktionsleiste bleibt bedienbar, solange ein Blatt offen ist (Punkt 3)', () => {
  frischesSpiel();
  const S = G('S');
  const cap = G('capitalOf')(S, S.cur);
  G('tapHex')(cap.r, cap.c);
  if (!$('sheet').classList.contains('open')) throw new Error('Blatt öffnet nicht');
  if (window.document.body.classList.contains('blocked'))
    throw new Error('Blatt sperrt die Aktionsleiste weiterhin');
  const aus = [...$('screen-game').querySelectorAll('.actionbar button')].filter(b => b.disabled).map(b => b.id);
  if (aus.length) throw new Error('Menüpunkte gesperrt: ' + aus.join(', '));
  G('closeSheet')();
  // Das Bot-Fenster sperrt weiterhin – dort führt nur „Weiter" weiter
  G('ui').botLock = true; G('lockBar')();
  if (!window.document.body.classList.contains('blocked'))
    throw new Error('Bot-Fenster sperrt die Leiste nicht mehr');
  G('ui').botLock = false; G('lockBar')();
  console.log('       Blatt offen, alle ' + $('screen-game').querySelectorAll('.actionbar button').length + ' Menüpunkte frei');
});
step('Kopfzeile: Weltbevölkerungsanteil in Prozent (Punkt 4)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur;
  G('redraw')();
  const txt = $('hud-round').textContent;
  const mine = G('popOf')(S, pi), all = G('worldPop')(S);
  const want = Math.round((mine / all) * 100);
  if (!txt.includes(`${mine}/${all} (${want} %)`))
    throw new Error('erwartet „' + mine + '/' + all + ' (' + want + ' %)", steht: ' + txt);
  console.log('       ' + txt);
});
step('Ressourcenleiste: vier getrennte Werte mit Beschriftung (Punkt 2)', () => {
  const res = $('screen-game').querySelectorAll('.hud-res .res');
  if (res.length !== 4) throw new Error(res.length + ' statt 4 Ressourcenfelder');
  const labels = [...res].map(r => r.querySelector('u') && r.querySelector('u').textContent);
  if (labels.some(l => !l)) throw new Error('Beschriftung fehlt: ' + labels.join('|'));
  const werte = [...res].map(r => r.querySelector('b') && r.querySelector('b').id);
  const want = ['hud-sci', 'hud-food', 'hud-coins', 'hud-power'];
  if (JSON.stringify(werte) !== JSON.stringify(want))
    throw new Error('falsche Reihenfolge: ' + werte.join(','));
  console.log('       ' + labels.join(' · '));
});
step('Feldblatt: Feldertrag klein, gegründet wird nur noch über die Leiste (v75)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, cap = G('capitalOf')(S, pi);
  // Nahrung großzügig setzen: sonst hängt der Test davon ab, wie viel das ausgewürfelte
  // Startreich in Runde 1 gerade übrig hat – das schlug in 4 von 8 Läufen fehl.
  G('P')(S).res.food = 40;
  const gut = G('within')(cap.r, cap.c, 7).find(([r, c]) => !G('canFound')(S, pi, r, c));
  if (!gut) throw new Error('kein gründbares Feld trotz 40 Nahrung');
  G('tapHex')(gut[0], gut[1]);
  // Feldertrag steht klein in der Unterzeile, nicht als eigenes Kästchen
  const sub = $('sheet-body').querySelector('p.sub');
  if (!sub || !/Feld \d+\/\d+ · Ertrag /.test(sub.textContent))
    throw new Error('Feldertrag steht nicht klein in der Unterzeile: ' + (sub && sub.textContent));
  // Kein Gründen im Feldblatt mehr – nur ein Satz, wo es langgeht
  if ($('sheet-body').querySelector('[data-label="Stadt gründen"], [data-label="Hier gründen"]'))
    throw new Error('das Feldblatt bietet noch Gründen an');
  if ($('sheet-body').querySelectorAll('.tile-facts').length)
    throw new Error('das Feldblatt zeigt noch den Siedelertrag');
  if (!/Stadt gründen/.test($('sheet-body').textContent)) throw new Error('kein Hinweis auf die Leiste');
  G('closeSheet')();
  console.log('       Feldblatt ' + gut.join('/') + ': Ertrag klein, kein Gründen, Hinweis auf die Leiste');
});
step('Gründungsmodus: Kosten auf der Karte, Blatt mit Siedelertrag, danach wieder aus (v75)', () => {
  const S = G('S'), pi = S.cur, cap = G('capitalOf')(S, pi), p = G('P')(S);
  p.res.food = 40;
  $('a-found').onclick();
  if (G('ui').mode !== 'found') throw new Error('Modus geht nicht an');
  if (!$('a-found').classList.contains('on')) throw new Error('Knopf zeigt den Modus nicht');
  // Karte: jedes echte Feld ist genau eines – Kosten, knapp oder abgeblendet
  const marks = new Map([...$('map').querySelectorAll('[data-found]')].map(e => [e.getAttribute('data-rc'), e]));
  let ja = 0, nein = 0, falsch = [];
  S.map.rows.forEach((row, r) => [...row].forEach((t, c) => {
    if (G('isOff')(t)) return;
    const m = marks.get(r + '/' + c);
    const platz = !G('foundSiteError')(S, pi, r, c);
    if (!m) return falsch.push(r + '/' + c + ' ohne Markierung');
    const art = m.getAttribute('data-found');
    if (platz !== (art !== 'nein')) falsch.push(r + '/' + c + ' ' + art);
    if (platz) {
      ja++;
      const kosten = G('foundCost')(S, pi, r, c);
      if (m.nextSibling.textContent !== String(kosten)) falsch.push(r + '/' + c + ' Kosten ' + m.nextSibling.textContent);
      if ((art === 'knapp') !== (G('available')(S, pi, 'food') < kosten)) falsch.push(r + '/' + c + ' knapp?');
    } else nein++;
  }));
  if (falsch.length) throw new Error('Markierungen: ' + falsch.slice(0, 4).join(', '));
  // im Gründungsmodus stehen auch die Erträge auf der Karte
  if (!$('map').querySelector('[data-yield]')) throw new Error('keine Erträge im Gründungsmodus');
  // Blatt: gründbares Feld – Siedelertrag und freier Knopf
  const gut = G('within')(cap.r, cap.c, 7).find(([r, c]) => !G('canFound')(S, pi, r, c));
  G('tapHex')(gut[0], gut[1]);
  const facts = $('sheet-body').querySelectorAll('.tile-facts .fact');
  if (facts.length !== 1) throw new Error(facts.length + ' statt 1 Kästchen (Siedelertrag)');
  const g = G('settleGain')(S, pi, gut[0], gut[1]);
  const soll = (g.sci > 0 ? '+' : '') + g.sci + '🔬';
  if (!facts[0].textContent.includes(soll)) throw new Error('Siedelertrag stimmt nicht: erwartet ' + soll);
  const knopf = $('sheet-body').querySelector('[data-label="Hier gründen"]');
  if (!knopf || knopf.disabled) throw new Error('„Hier gründen" fehlt oder ist gesperrt');
  if (!knopf.textContent.includes(G('foundCost')(S, pi, gut[0], gut[1]) + '🌾')) throw new Error('Kosten fehlen am Knopf');
  // Meer und eigene Stadt: kein Siedelertrag, Knopf gesperrt mit Grund
  const meer = G('within')(cap.r, cap.c, 6).find(([r, c]) => G('terrainAt')(S, r, c) === 'M');
  for (const [r, c] of [meer, [cap.r, cap.c]].filter(Boolean)) {
    G('tapHex')(r, c);
    if ($('sheet-body').querySelectorAll('.tile-facts').length) throw new Error(r + '/' + c + ' zeigt einen Siedelertrag');
    const k = $('sheet-body').querySelector('[data-label="Hier gründen"]');
    if (!k || !k.disabled) throw new Error(r + '/' + c + ': Knopf nicht gesperrt');
  }
  // Nur die Nahrung fehlt: Ertrag steht, Knopf gesperrt mit Grund
  p.res.food = 0; p.res.coins = 0;
  G('tapHex')(gut[0], gut[1]);
  if ($('sheet-body').querySelectorAll('.tile-facts').length !== 1) throw new Error('bei knapper Nahrung kein Siedelertrag');
  const k2 = $('sheet-body').querySelector('[data-label="Hier gründen"]');
  if (!k2.disabled || !/Nahrung/.test(k2.textContent)) throw new Error('knappe Nahrung: ' + k2.textContent);
  if ($('map').querySelector(`[data-rc="${gut[0]}/${gut[1]}"][data-found]`).getAttribute('data-found') !== 'knapp')
    throw new Error('knappes Feld nicht rot markiert');
  // Gründen beendet den Modus
  p.res.food = 40;
  G('tapHex')(gut[0], gut[1]);
  $('sheet-body').querySelector('[data-label="Hier gründen"]').onclick();
  const neu = G('cityAt')(S, gut[0], gut[1]);
  if (!neu || neu.owner !== pi) throw new Error('keine Stadt gegründet');
  if (G('ui').mode === 'found' || $('map').querySelector('[data-found]')) throw new Error('Modus bleibt nach dem Gründen an');
  // An und aus über den Knopf, andere Aktionen beenden ihn
  $('a-found').onclick(); $('a-found').onclick();
  if (G('ui').mode === 'found') throw new Error('zweiter Tipp schaltet nicht aus');
  $('a-found').onclick(); $('a-tech').onclick(); G('closeModal')();
  if (G('ui').mode === 'found') throw new Error('Forschen beendet den Modus nicht');
  console.log(`       ${ja} mögliche Plätze, ${nein} abgeblendet · gegründet auf ${gut.join('/')}, Modus danach aus`);
});
step('Erträge: Chips je Feld, gemerkt, immer bedienbar (v75)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur;
  if (G('showYields')) $('a-yields').onclick();              // sauberer Ausgangspunkt
  if ($('map').querySelector('[data-yield]')) throw new Error('Chips ohne Ertragsansicht');
  $('a-yields').onclick();
  if (!G('showYields') || !$('a-yields').classList.contains('on')) throw new Error('Umschalten wirkt nicht');
  // je Feld genau die Erträge ≠ 0, in der Reihenfolge Wissenschaft, Nahrung, Münzen
  const ist = {};
  $('map').querySelectorAll('[data-yield]').forEach(ch => {
    const k = ch.getAttribute('data-rc');
    (ist[k] = ist[k] || []).push(+ch.getAttribute('data-yield') + ':' + ch.nextSibling.textContent);
  });
  const falsch = [];
  let felder = 0;
  S.map.rows.forEach((row, r) => [...row].forEach((t, c) => {
    if (G('isOff')(t)) return;
    const y = G('tileYieldAt')(S, pi, r, c);
    const soll = G('cityAt')(S, r, c) ? [] : [0, 1, 2].filter(i => y[i] > 0).map(i => i + ':' + y[i]);
    if ((ist[r + '/' + c] || []).join() !== soll.join()) falsch.push(r + '/' + c);
    if (soll.length) felder++;
  }));
  if (falsch.length) throw new Error('Chips falsch auf ' + falsch.slice(0, 5).join(', '));
  if (!G('load')('hochciv.yields')) throw new Error('Wahl nicht gemerkt');
  // Während ein Bot zieht, zeigt die Ansicht die Erträge des Menschen
  const bot = S.players.findIndex(q => q.kind === 'bot');
  const vorher = S.cur; S.cur = bot;
  if (G('viewerOf')(S) !== vorher) throw new Error('beim Bot-Zug zählen die Erträge des Bots');
  S.cur = vorher;
  $('a-yields').onclick();
  if ($('map').querySelector('[data-yield]') || G('load')('hochciv.yields')) throw new Error('Abschalten wirkt nicht');
  console.log('       ' + felder + ' Felder mit Chips, Wahl gemerkt, beim Bot-Zug die Sicht des Menschen');
});
step('Machtansicht: Ringe mit einem Teilstück je Punkt, nur solange das Machtblatt offen ist (v75/v76)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S), cap = G('capitalOf')(S, pi);
  const feind = S.players.findIndex((q, i) => i !== pi);
  // eine fremde Armee neben der eigenen Hauptstadt, zwei eigene diagonal gegenüber
  // einer zweiten fremden Armee
  S.armies = S.armies.filter(a => a.owner !== feind);
  const nb = G('neighbors')(cap.r, cap.c).filter(([r, c]) => G('isLand')(S, r, c) && !G('cityAt')(S, r, c) && !G('armyAt')(S, r, c));
  if (nb.length < 2) throw new Error('keine zwei Nachbarfelder frei');
  S.armies.push({ id: 7001, owner: feind, r: nb[0][0], c: nb[0][1], mp: 0, born: 0 });
  // eine eigene Armee daneben: sie trägt den Machtwert zur Verteidigung bei, also muss
  // ein Machtkauf den eigenen Anteil vergrößern
  S.armies.push({ id: 7002, owner: pi, r: nb[1][0], c: nb[1][1], mp: 0, born: 0 });
  p.power = 2; p.res.coins = 40;
  if (G('P')(S).kind === 'bot') throw new Error('Mensch nicht am Zug');
  $('a-power').onclick();
  if (!G('ui').powerView) throw new Error('Machtansicht geht nicht an');
  const ring = tag => [...$('map').querySelectorAll(`[data-power="${tag}"]`)];
  const stadtRing = () => ring('stadt ' + cap.r + '/' + cap.c);
  const view = G('powerView')(S);
  const st = view.cities.find(x => x.city === cap);
  if (!st.atk.length) throw new Error('kein Angreifer an der Hauptstadt erkannt');
  const anteil = () => +stadtRing()[0].getAttribute('data-anteil');
  const soll = st.def / (st.def + st.atk.reduce((s2, a) => s2 + a.v, 0));
  if (stadtRing().length !== 1 + st.atk.length) throw new Error('Stadtring: ' + stadtRing().length + ' Teile');
  if (Math.abs(anteil() - soll) > 0.001) throw new Error('Anteil ' + anteil() + ' statt ' + soll.toFixed(3));
  // jede Stadt und jede Armee trägt einen Ring
  if (S.cities.some(c => !ring('stadt ' + c.r + '/' + c.c).length)) throw new Error('eine Stadt ohne Ring');
  if (S.armies.some(a => !ring('armee ' + a.r + '/' + a.c).length)) throw new Error('eine Armee ohne Ring');
  // v76: ein Teilstück je Punkt – so viele Trennstriche, wie der Ring Punkte hat
  const striche = tag => $('map').querySelectorAll(`[data-strich="${tag}"]`).length;
  const MAX = G('RING_MAX_PUNKTE'), falsch = [];
  const pruefe = (tag, punkte) => {
    const soll = punkte > MAX ? 0 : punkte;
    if (striche(tag) !== soll) falsch.push(`${tag}: ${striche(tag)} Striche, ${punkte} Punkte`);
  };
  const pv = () => G('powerView')(S);
  pv().cities.forEach(x => pruefe('stadt ' + x.city.r + '/' + x.city.c, x.def + x.atk.reduce((s2, a) => s2 + a.v, 0)));
  pv().armies.forEach(x => pruefe('armee ' + x.army.r + '/' + x.army.c, x.pow + x.flank.reduce((s2, f) => s2 + f.v, 0)));
  if (falsch.length) throw new Error('Teilstücke: ' + falsch.slice(0, 3).join(' · '));
  const stueckVorher = striche('stadt ' + cap.r + '/' + cap.c);
  // Macht kaufen: der eigene Anteil wächst sofort
  const a1 = anteil();
  $('sheet-body').querySelector('[data-n="5"]').onclick();
  if (!G('ui').powerView) throw new Error('nach dem Kauf ist die Ansicht weg');
  if (!(anteil() > a1)) throw new Error('eigener Anteil wächst nicht: ' + a1 + ' → ' + anteil());
  const nach = pv().cities.find(x => x.city === cap);
  const punkteNach = nach.def + nach.atk.reduce((s2, a) => s2 + a.v, 0);
  if (striche('stadt ' + cap.r + '/' + cap.c) !== (punkteNach > MAX ? 0 : punkteNach))
    throw new Error('nach dem Kauf: ' + striche('stadt ' + cap.r + '/' + cap.c) + ' Striche, ' + punkteNach + ' Punkte');
  // Das Beispiel aus der Rückmeldung: Verteidigung 1, Angriff 2 → drei Stücke, eines
  // in der Farbe des Verteidigers, zwei in der des Angreifers
  const probe = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
  G('powerRing')(probe, 0, 0, 17, 21.5, [{ v: 1, col: '#111' }, { v: 2, col: '#999' }], 'probe');
  const teile = [...probe.querySelectorAll('[data-anteil]')].map(e => [e.getAttribute('fill'), e.getAttribute('data-anteil')]);
  if (probe.querySelectorAll('[data-strich]').length !== 3) throw new Error('1 gegen 2: nicht drei Stücke');
  if (JSON.stringify(teile) !== JSON.stringify([['#111', '0.333'], ['#999', '0.667']]))
    throw new Error('1 gegen 2: ' + JSON.stringify(teile));
  // Über der Grenze keine Striche je Punkt mehr, nur die Grenzen zwischen den Reichen;
  // bei 0 Punkten ein leerer Ring
  const gross = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
  G('powerRing')(gross, 0, 0, 17, 21.5, [{ v: MAX, col: '#111' }, { v: 1, col: '#999' }], 'gross');
  if (gross.querySelectorAll('[data-strich]').length) throw new Error('über ' + MAX + ' Punkten noch Striche');
  if (gross.querySelectorAll('[data-grenze]').length !== 2) throw new Error('über ' + MAX + ' Punkten: ' + gross.querySelectorAll('[data-grenze]').length + ' Grenzen statt 2');
  const allein = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
  G('powerRing')(allein, 0, 0, 17, 21.5, [{ v: MAX + 5, col: '#111' }], 'allein');
  if (allein.querySelectorAll('[data-strich],[data-grenze]').length) throw new Error('voller Ring über ' + MAX + ': Striche');
  // unter der Grenze liegen die Reichsgrenzen auf Strichen: 1 gegen 2 → Striche bei 0°,
  // 120° (Grenze Verteidiger/Angreifer) und 240°
  const winkel = [...probe.querySelectorAll('[data-strich]')].map(e => Math.round(Math.atan2(+e.getAttribute('x2'), -e.getAttribute('y2')) * 180 / Math.PI));
  if (JSON.stringify(winkel) !== JSON.stringify([0, 120, -120])) throw new Error('1 gegen 2: Striche bei ' + winkel);
  const leer = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
  G('powerRing')(leer, 0, 0, 17, 21.5, [{ v: 0, col: '#111' }], 'leer');
  if (leer.querySelector('[data-anteil="1"]') || !leer.querySelector('[data-anteil="0"]')) throw new Error('0 Punkte: kein leerer Ring');
  if (!$('sheet-body').querySelector('.power-legend')) throw new Error('keine Legende im Machtblatt');
  // Schließen und Feld antippen beenden die Ansicht
  G('closeSheet')();
  if (G('ui').powerView || $('map').querySelector('[data-power]')) throw new Error('Ringe bleiben nach dem Schließen');
  $('a-power').onclick(); G('tapHex')(cap.r, cap.c);
  if ($('map').querySelector('[data-power]')) throw new Error('Ringe bleiben beim Feldblatt');
  $('a-power').onclick(); $('a-found').onclick();
  if ($('map').querySelector('[data-power]')) throw new Error('Ringe bleiben im Gründungsmodus');
  $('a-found').onclick();
  G('closeSheet')();
  console.log(`       Hauptstadt: Verteidigung ${st.def} gegen ${st.atk.map(a => a.v).join('+')} = ${stueckVorher} Stücke · ` +
    `nach +5 Macht ${punkteNach} · 1 gegen 2 = drei Stücke · Schließen, Feld, Gründungsmodus beenden die Ansicht`);
});
step('Bürgerkrieg: Armee-Knopf ist mit Nahrung + Münzen bedienbar (gemeldeter Fehler)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S), cap = G('capitalOf')(S, pi);
  // Ereignis direkt setzen (setEvent ist ein reiner Testhelfer aus test.js)
  S.ev = S.ev || { mode: 'hard' };
  S.event = { round: S.round, k: 'buergerkrieg', row: 0, col: 0 };
  if (!G('payOpts')(S, pi).foodOk) throw new Error('Bürgerkrieg ist nicht aktiv');
  const cost = G('armyCost')(S, pi);
  // Genau die gemeldete Lage: Münzen allein reichen nicht, zusammen mit Nahrung schon
  const c = Math.floor(cost / 2);
  p.res = { sci: 0, food: cost - c, coins: c };
  if (G('available')(S, pi, 'coins') >= cost)
    throw new Error('Testaufbau untauglich – die Münzen allein reichen schon');
  G('tapHex')(cap.r, cap.c);
  const knopf = [...$('sheet-body').querySelectorAll('.opt')]
    .find(b => /Armee bauen/.test(b.textContent));
  if (!knopf) throw new Error('kein Armee-Knopf im Stadtblatt');
  if (knopf.disabled)
    throw new Error('Armee-Knopf gesperrt, obwohl Nahrung + Münzen reichen');
  knopf.onclick();
  if (!G('armiesOf')(S, pi).length) throw new Error('Armee wurde nicht gebaut');
  // Macht-Blatt muss dieselbe Rechnung machen
  p.res = { sci: 0, food: G('powerPrice')(S, pi) - 1, coins: 1 };
  G('powerSheet')();
  const mk = [...$('sheet-body').querySelectorAll('[data-n]')];
  if (!mk.length) throw new Error('Macht-Blatt bietet nichts an, obwohl Nahrung mitzählt');
  G('closeSheet')();
  console.log('       ' + c + ' Münzen + ' + (cost - c) + ' Nahrung bei Kosten ' + cost + ': Knopf frei');
});
step('Nahrungsfenster geht zu Zugbeginn von selbst auf', () => {
  frischesSpiel();
  const S = G('S'), p = G('P')(S);
  p.techs.massenmedien = true;          // seit v64 die einzige Futtertechnologie
  p.res.coins = Math.max(p.res.coins, 5);
  // Ausgangslage selbst herstellen: popFood hängt am Startspieler und war in etwa
  // einem von fünfzehn Läufen 0 (dann gibt es korrekterweise nichts zu entscheiden).
  p.popFood = 3; p.popCovered = 0; p.popCoveredBy = { sci: 0, coins: 0 };
  p.popSpent = { sci: 0, coins: 0 }; p.popDefPart = 0;
  G('closeSheet')();
  if ($('sheet').classList.contains('open')) throw new Error('Blatt war schon offen');
  G('humanTurnStart')();
  if (!$('sheet').classList.contains('open'))
    throw new Error('Nahrungsfenster geht zu Zugbeginn nicht auf');
  if (!/Nahrung diese Runde/.test($('sheet-body').textContent))
    throw new Error('es ist ein anderes Blatt: ' + $('sheet-body').textContent.slice(0, 40));
  // Ist alles gedeckt, gibt es nichts zu entscheiden – dann bleibt es zu
  p.popCovered = p.popFood;
  G('closeSheet')();
  G('humanTurnStart')();
  if ($('sheet').classList.contains('open'))
    throw new Error('Fenster geht auf, obwohl nichts mehr zu entscheiden ist');
  p.popCovered = 0;
  // Ohne die Techs bleibt es ebenfalls zu
  delete p.techs.gentechnik; delete p.techs.massenmedien;
  G('closeSheet')();
  G('humanTurnStart')();
  if ($('sheet').classList.contains('open'))
    throw new Error('ohne Gentechnik/Massenmedien geht trotzdem ein Blatt auf');
  console.log('       mit Tech und offenen Kosten: geht auf · sonst: bleibt zu');
});
step('Nahrungsfenster deckt nur die echten Kosten, kein Umtausch', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  p.techs.massenmedien = true;
  // Saldo +4, Bevölkerung isst 2: es gibt kein Defizit, aber etwas zu verschieben
  p.res = { sci: 0, food: 4, coins: 50 };
  p.foodRaw = 4; p.foodDeficit = 0;
  p.popFood = 2; p.popCovered = 0; p.popCoveredBy = { sci: 0, coins: 0 };
  p.popSpent = { sci: 0, coins: 0 }; p.popDefPart = 0;
  G('foodSheet')();
  const n = [...$('sheet-body').querySelectorAll('[data-k]')].map(b => +b.dataset.n);
  if (!n.length) throw new Error('nichts angeboten, obwohl Kosten offen sind');
  // Eine Münze deckt fünf, offen sind zwei – mehr als eine Münze darf nicht angeboten werden
  if (Math.max(...n) > 1)
    throw new Error('mehr Münzen angeboten als nötig: ' + n.join(','));
  [...$('sheet-body').querySelectorAll('[data-k]')]
    .sort((x, y) => +y.dataset.n - +x.dataset.n)[0].onclick();
  if (p.res.food !== 6) throw new Error('Nahrung falsch: ' + p.res.food + ' statt 6');
  if (p.res.coins !== 49) throw new Error('Münzen falsch: ' + p.res.coins);
  // Jetzt ist alles gedeckt – kein weiterer Umtausch möglich
  if ($('sheet-body').querySelectorAll('[data-k]').length)
    throw new Error('bietet weiteren Umtausch an, obwohl die Kosten gedeckt sind');
  if (G('coverPop')(S, pi, 'coins', 10) === null)
    throw new Error('coverPop lässt über die Kosten hinaus decken');
  if (p.res.food !== 6) throw new Error('doch mehr Nahrung entstanden');
  G('closeSheet')();
  console.log('       50 Münzen, Kosten 2 → genau 1 Münze einsetzbar, Nahrung 4→6');
});
step('Oxford + Singularität zeigt den Siegbildschirm (gemeldeter Fehler)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  // Alle Voraussetzungen der Singularität erfüllen, dann Oxford auslösen
  G('techPool')(S).forEach(t => { if (t.k !== 'singularitaet') p.techs[t.k] = true; });
  delete p.techs.singularitaet;
  if (!G('singularityReady')(p)) throw new Error('Voraussetzungen nicht erfüllt');
  G('applyWonderEffect')(S, pi, G('capitalOf')(S, pi),
    G('WONDERS').find(w => w.k === 'oxford'));
  G('freePickModal')();
  const btn = [...$('ov-body').querySelectorAll('[data-free]')]
    .find(b => b.dataset.free === 'singularitaet');
  if (!btn) throw new Error('Singularität steht bei Oxford nicht zur Wahl');
  btn.onclick();
  // Seit v51 endet ein Forschungssieg am Rundenende, nicht sofort: angemeldet ja,
  // beendet nein – und die Oberfläche darf trotzdem nicht hängen.
  const S2 = G('S');
  if (S2.over) throw new Error('Forschungssieg beendet das Spiel sofort');
  if (!(S2.claims || []).some(c => c.how.startsWith('Forschungssieg')))
    throw new Error('kein Sieganspruch angemeldet');
  if (S2.endRound !== S2.round) throw new Error('Rundenende nicht vorgemerkt');
  if (!/letzte Runde/.test($('hud-round').textContent))
    throw new Error('die Kopfzeile sagt nicht, dass die Runde die letzte ist');
  // Weiterspielbar: die Aktionsleiste muss bedienbar bleiben, kein Spielende-Fenster
  if ($('a-end').disabled) throw new Error('Aktionsleiste gesperrt – hängengeblieben');
  if ($('overlay').classList.contains('show') && $('ov-title').textContent === 'Spielende')
    throw new Error('Spielende-Fenster obwohl die Runde noch läuft');
  if ($('overlay').classList.contains('show')) G('closeModal')();
  // Runde über die Oberfläche zu Ende spielen: Zug beenden, Bot-Blätter wegklicken
  let guard = 0;
  while (!G('S').over && guard++ < 60) {
    if ($('bot-next')) { $('bot-next').onclick(); continue; }
    if ($('overlay').classList.contains('show')) { G('closeModal')(); continue; }
    if ($('a-end').disabled) throw new Error('Zugende gesperrt, Runde nicht spielbar');
    $('a-end').onclick();
    if ($('ov-title') && $('ov-title').textContent === 'Zug beenden')
      $('overlay').querySelector('.btn.primary, .btn.wide').onclick();
  }
  const S3 = G('S');
  if (!S3.over) throw new Error('das Spiel endet nicht am Rundenende');
  if (S3.over.round !== S2.round) throw new Error('es endet in der falschen Runde');
  if ($('ov-title').textContent !== 'Spielende')
    throw new Error('falsches Fenster: ' + $('ov-title').textContent);
  if (!/gewinnt/.test($('ov-body').textContent)) throw new Error('kein Siegtext');
  if (!/Forschungssieg/.test($('ov-body').textContent)) throw new Error('Siegart fehlt');
  console.log('       angemeldet in Runde ' + S2.round + ', entschieden am Rundenende');
});
step('Konfetti beim Sieg – klein und selbsträumend', () => {
  const box = window.document.getElementById('confetti');
  if (!box) throw new Error('kein Konfetti nach dem Sieg');
  const n = box.querySelectorAll('i').length;
  if (n < 10 || n > 80) throw new Error(n + ' Schnipsel – das ist nicht mehr klein');
  const css = fs.readFileSync(__dirname + '/css/style.css', 'utf8');
  if (!/#confetti\{[^}]*pointer-events:none/.test(css))
    throw new Error('Konfetti fängt Berührungen ab – „Zurück zum Menü" wäre blockiert');
  if (!/prefers-reduced-motion[^}]*\{\s*#confetti\{display:none\}/.test(css.replace(/\s+/g, ' ').replace(/ \{/g, '{')))
    console.log('       (Hinweis: reduced-motion-Regel nicht gefunden)');
  // Doppelter Aufruf darf nicht stapeln
  G('confetti')('#123456');
  if (window.document.querySelectorAll('#confetti').length !== 1)
    throw new Error('Konfetti stapelt sich');
  window.document.getElementById('confetti').remove();
  console.log('       ' + n + ' Schnipsel, ohne Berührungsfang, kein Stapeln');
});
step('Eisenbahn ohne Rad lässt sich bauen (gemeldeter Fehler)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  p.techs.eisenbahn = true; delete p.techs.rad;      // genau die gemeldete Lage
  p.res.coins = 50;
  const cap = G('capitalOf')(S, pi);
  const feld = G('neighbors')(cap.r, cap.c).find(([r, c]) =>
    G('isLand')(S, r, c) && !G('cityAt')(S, r, c));
  if (!feld) throw new Error('kein freies Nachbarfeld');
  G('tapHex')(feld[0], feld[1]);
  const knopf = [...$('sheet-body').querySelectorAll('.opt')]
    .find(b => /Eisenbahn bauen|Straße bauen/.test(b.textContent));
  if (!knopf) throw new Error('kein Bau-Knopf im Blatt, obwohl Eisenbahn erforscht ist');
  if (knopf.disabled) throw new Error('Bau-Knopf gesperrt');
  if (!/Eisenbahn bauen/.test(knopf.textContent))
    throw new Error('bietet die Straße an, die ohne Rad gar nicht baubar ist');
  if (!/2🪙/.test(knopf.textContent))
    throw new Error('falscher Preis: ' + knopf.textContent.replace(/\s+/g, ' '));
  knopf.onclick();
  if (G('roadLevel')(S, feld[0], feld[1]) !== 2)
    throw new Error('keine Eisenbahn entstanden: Stufe ' + G('roadLevel')(S, feld[0], feld[1]));
  // Mit beiden Techs stehen auf einem leeren Feld beide Knöpfe – und zwei Schritte
  // im offenen Blatt kosten zusammen 2, nicht 3.
  const frei = G('neighbors')(cap.r, cap.c).find(([r, c]) =>
    G('isLand')(S, r, c) && !G('cityAt')(S, r, c) && G('roadLevel')(S, r, c) === 0);
  if (frei) {
    p.techs.rad = true;
    p.res.coins = 10;
    G('tapHex')(frei[0], frei[1]);
    const wege = () => [...$('sheet-body').querySelectorAll('.opt')]
      .filter(b => /Straße bauen|Eisenbahn bauen/.test(b.textContent));
    if (wege().length !== 2)
      throw new Error(wege().length + ' statt 2 Knöpfe bei beiden Technologien');
    const strasse = wege().find(b => /Straße bauen/.test(b.textContent));
    const bahn = wege().find(b => /Eisenbahn bauen/.test(b.textContent));
    if (!/1🪙/.test(strasse.textContent)) throw new Error('Straße kostet nicht 1');
    if (!/2🪙/.test(bahn.textContent)) throw new Error('Eisenbahn-Direktbau kostet nicht 2');
    strasse.onclick();
    if (p.res.coins !== 9) throw new Error('Straße hat nicht 1 gekostet: ' + p.res.coins);
    // Das Blatt muss sich neu gezeichnet haben – sonst steht dort noch der alte Preis
    const bahn2 = wege().find(b => /Eisenbahn bauen/.test(b.textContent));
    if (!bahn2) throw new Error('kein Ausbau-Knopf nach dem Straßenbau');
    if (!/1🪙/.test(bahn2.textContent))
      throw new Error('der Ausbau zeigt noch den alten Preis: ' + bahn2.textContent.replace(/\s+/g, ' '));
    if (wege().some(b => /Straße bauen/.test(b.textContent)))
      throw new Error('die Straße wird weiterhin angeboten, obwohl sie liegt');
    bahn2.onclick();
    if (p.res.coins !== 8)
      throw new Error('zusammen ' + (10 - p.res.coins) + ' Münzen statt 2');
    if (G('roadLevel')(S, frei[0], frei[1]) !== 2) throw new Error('keine Eisenbahn entstanden');
  }
  // Umgekehrt: nur Rad bietet die Straße an und sperrt danach
  const feld2 = G('neighbors')(cap.r, cap.c).find(([r, c]) =>
    G('isLand')(S, r, c) && !G('cityAt')(S, r, c) && G('roadLevel')(S, r, c) === 0);
  if (feld2) {
    delete p.techs.eisenbahn; p.techs.rad = true;
    G('tapHex')(feld2[0], feld2[1]);
    const k2 = [...$('sheet-body').querySelectorAll('.opt')]
      .find(b => /Eisenbahn bauen|Straße bauen/.test(b.textContent));
    if (!/Straße bauen/.test(k2.textContent)) throw new Error('nur Rad bietet nicht die Straße an');
    k2.onclick();
    G('tapHex')(feld2[0], feld2[1]);
    const k3 = [...$('sheet-body').querySelectorAll('.opt')]
      .find(b => /Eisenbahn bauen|Straße bauen/.test(b.textContent));
    if (!k3.disabled) throw new Error('ohne Eisenbahn ist der Ausbau trotzdem freigegeben');
  }
  // Ganz ohne die beiden Technologien gibt es keinen Knopf
  delete p.techs.rad; delete p.techs.eisenbahn;
  const feld3 = G('neighbors')(cap.r, cap.c).find(([r, c]) =>
    G('isLand')(S, r, c) && !G('cityAt')(S, r, c) && G('roadLevel')(S, r, c) === 0);
  if (feld3) {
    G('tapHex')(feld3[0], feld3[1]);
    if ([...$('sheet-body').querySelectorAll('.opt')]
      .some(b => /Eisenbahn bauen|Straße bauen/.test(b.textContent)))
      throw new Error('Bau-Knopf ohne jede Wegetechnologie');
  }
  G('closeSheet')();
  console.log('       nur Eisenbahn → „Eisenbahn bauen" für 2🪙, Stufe 2 gesetzt');
});
step('Wachstum: Nahrung und Münzen zählen nicht doppelt (gemeldeter Fehler)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  const cap = G('capitalOf')(S, pi);
  cap.pop = 1; cap.grown = 0; cap.freeUsed = 0; cap.born = -1;
  // Nahrungsgrenze und Ereignisse aus dem Weg räumen – geprüft wird allein, ob das
  // GELD reicht. Ein Ereignis aus einem früheren Test überlebte sonst gelegentlich
  // („Sturmflut: Diese Stadt kann diese Runde nicht wachsen").
  p.techs.gentechnik = true;
  S.event = null; S.ev = null; delete cap.noGrow;
  const blockiert = G('growBlockReason')(S, pi, cap);
  if (blockiert) throw new Error('Wachstum blockiert aus anderem Grund: ' + blockiert);
  const kosten = G('growPrice')(S, pi, cap);
  const kurs = G('rates')(S, pi).coinsToFood;
  // Die Schwelle selbst bestimmen, statt sie anzunehmen: sie hängt an Reich, Kurs
  // und Fähigkeiten. Erwartet wird kosten.coins + kosten.food * kurs.
  let noetig = null;
  for (let m = 0; m <= 20 && noetig === null; m++) {
    p.res = { sci: 0, food: 0, coins: m };
    if (G('canGrow')(S, pi, cap) === null) noetig = m;
  }
  const soll = kosten.coins + kosten.food * kurs;
  if (noetig !== soll)
    throw new Error(`Schwelle ${noetig} statt ${soll} (Kosten ${JSON.stringify(kosten)}, Kurs ${kurs})`);
  // Eine Münze unter der Schwelle: der Knopf muss gesperrt sein
  if (noetig > 0) {
    p.res = { sci: 0, food: 0, coins: noetig - 1 };
    G('closeSheet')(); G('tapHex')(cap.r, cap.c);
    const k = [...$('sheet-body').querySelectorAll('.opt')]
      .find(b => /Bevölkerung wachsen/.test(b.textContent));
    if (!k) throw new Error('kein Wachstumsknopf im Stadtblatt');
    if (!k.disabled)
      throw new Error(`Wachstum freigegeben mit ${noetig - 1} Münzen, nötig sind ${noetig}`);
  }
  // Genau auf der Schwelle: es geht, und alles wird verbraucht
  p.res = { sci: 0, food: 0, coins: noetig };
  G('closeSheet')(); G('tapHex')(cap.r, cap.c);
  const k2 = [...$('sheet-body').querySelectorAll('.opt')]
    .find(b => /Bevölkerung wachsen/.test(b.textContent));
  if (k2.disabled) throw new Error(`mit ${noetig} Münzen bleibt es gesperrt`);
  k2.onclick();
  if (cap.pop !== 2) throw new Error('Stadt ist nicht gewachsen');
  if (p.res.coins !== 0) throw new Error('falscher Abzug: ' + p.res.coins + ' statt 0');
  G('closeSheet')();
  console.log('       Kosten ' + JSON.stringify(kosten) + ' bei Kurs ' + kurs
    + ' → Schwelle ' + noetig + ' Münzen, darunter gesperrt');
});
step('Handelsrouten erscheinen in der Ertragsübersicht (neue Regel)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  p.techs.rad = true; p.techs.eisenbahn = true;
  const cap = G('capitalOf')(S, pi);
  // Nachbarfeld als zweite Stadt, direkt an der Hauptstadt – kürzestmögliche Route
  const nb = G('neighbors')(cap.r, cap.c).find(([r, c]) =>
    G('isLand')(S, r, c) && !G('cityAt')(S, r, c));
  if (!nb) throw new Error('kein Nachbarfeld für die zweite Stadt');
  S.cities.push({ id: 900, owner: pi, r: nb[0], c: nb[1], pop: 1, cap: false, grown: 0, born: 0 });
  const zeile = () => (G('incomeBreakdown')(S, pi).extra || [])
    .find(e => e.name === 'Handelsrouten');
  if (zeile()) throw new Error('Handelsroute ohne Straße');
  S.roads[G('key')(nb[0], nb[1])] = 1;
  const z1 = zeile();
  if (!z1) throw new Error('Straße erzeugt keine Handelsroute');
  if (JSON.stringify(z1.y) !== '[1,1,1]') throw new Error('falscher Bonus: ' + JSON.stringify(z1.y));
  S.roads[G('key')(nb[0], nb[1])] = 2;
  const z2 = zeile();
  if (JSON.stringify(z2.y) !== '[2,2,2]') throw new Error('Eisenbahn gibt nicht +2');
  // Und im Forschungsbogen muss die Zeile sichtbar sein
  $('a-tech').onclick();
  if (!/Handelsrouten/.test($('ov-body').textContent))
    throw new Error('Handelsrouten fehlen in der Ertragsübersicht');
  G('closeModal')();
  console.log('       Straße +1, Eisenbahn +2, Zeile im Forschungsbogen sichtbar');
});
step('Zurückblättern springt nicht sofort wieder vor', () => {
  G('tutorialStart')();
  const n = G('TUT_STEPS').length;
  const idx = () => +$('tut-count').textContent.split('/')[0] - 1;
  // Bis zum ersten erledigten Aufgabenschritt vorarbeiten
  let guard = 0, erledigt = -1;
  while (guard++ < n * 3) {
    const i = idx();
    if ($('tut-next').disabled) {
      const st = G('TUT_STEPS')[i];
      if (!st.auto) throw new Error('Schritt ' + (i + 1) + ' ohne auto');
      st.auto(); G('redraw')();
      if (idx() > i) { erledigt = i; break; }        // hat automatisch weitergeschaltet
    }
    if (i >= n - 1) break;
    $('tut-next').onclick();
  }
  if (erledigt < 0) throw new Error('kein automatisch weitergeschalteter Schritt gefunden');
  const danach = idx();
  // Zurückblättern: der Schritt muss stehen bleiben
  $('tut-prev').onclick();
  if (idx() !== danach - 1) throw new Error('Zurückblättern hat nicht funktioniert');
  G('redraw')();
  if (idx() !== danach - 1)
    throw new Error('nach dem Zurückblättern wurde sofort wieder vorgesprungen');
  // Auch mehrfaches Neuzeichnen darf nichts ändern
  G('redraw')(); G('redraw')();
  if (idx() !== danach - 1) throw new Error('springt beim Neuzeichnen doch noch vor');
  // Vorwärts geht weiterhin
  $('tut-next').onclick();
  if (idx() !== danach) throw new Error('vorwärts geht nicht mehr');
  G('tutorialQuit')();
  console.log('       Schritt ' + (erledigt + 1) + ' erledigt → ' + (danach + 1)
    + ', zurück auf ' + danach + ' bleibt stehen');
});
step('Tutorial zeigt keine Zugablauf-Einordnung mehr', () => {
  G('tutorialStart')();
  if (G('TUT_STEPS').some(st => st.sub)) throw new Error('ein Schritt hat noch sub');
  const el = $('tut-sub');
  if (el && el.textContent.trim()) throw new Error('die Zeile wird noch gefüllt: ' + el.textContent);
  G('tutorialQuit')();
});
step('Tutorialtext erklärt die Handelsrouten', () => {
  const schritt = G('TUT_STEPS').find(st => /Straßen/.test(st.t || ''));
  if (!schritt) throw new Error('kein Straßenschritt im Tutorial');
  G('tutorialStart')();
  const idx = G('TUT_STEPS').indexOf(schritt);
  G('ui').tut.i = idx; G('tutEnter')();
  const t = schritt.html().replace(/<[^>]+>/g, ' ');
  if (!/Handelsrouten/.test(t)) throw new Error('Handelsrouten werden nicht erklärt');
  if (!/\+2/.test(t) || !/\+1/.test(t)) throw new Error('die beiden Stufen fehlen');
  if (!/Eisenbahn/.test(t)) throw new Error('Eisenbahn nicht erwähnt');
  // Im Abschlusstext soll die Erklärung NICHT mehr stehen
  const letzterT = G('TUT_STEPS')[G('TUT_STEPS').length - 1].html().replace(/<[^>]+>/g, ' ');
  if (/Jede deiner Städte außer der Hauptstadt/.test(letzterT))
    throw new Error('die Erklärung steht doppelt – auch noch im Abschlusstext');
  G('tutorialQuit')();
  // Auch die Kurzregeln müssen es nennen
  G('rulesModal')();
  if (!/Handelsrouten/.test($('ov-body').textContent))
    throw new Error('Kurzregeln erwähnen die Handelsrouten nicht');
  G('closeModal')();
  console.log('       Abschlusstext und Kurzregeln nennen beide Stufen');
});
step('Techbogen zeigt, was andere Menschen erforschen könnten', () => {
  // Zwei Menschen aufsetzen: der Aufbau macht nur den ersten zum Menschen
  $('m-new').onclick();
  $('setup-list').children[1].querySelector('[data-kind="human"]').onclick();
  [2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
  $('setup-go').onclick();
  const S = G('S'), pi = S.cur;
  if (G('humanCount')(S) < 2) throw new Error('Testaufbau hat keine zwei Menschen');
  const andere = S.players.findIndex((p, i) => i !== pi && p.kind === 'human');
  const bot = S.players.findIndex(p => p.kind === 'bot');
  // Eine Tech, die der andere Mensch verfügbar hat, aber niemand erforscht
  const k = Object.keys(S.players[andere].avail)
    .find(x => S.players[andere].avail[x] && !S.players.some(p => p.techs[x]));
  if (!k) throw new Error('keine passende Technologie gefunden');
  const box = window.document.createElement('div');
  box.innerHTML = G('ownerMarks')(S, k, pi);
  if (!box.querySelector('.owner-mark.can'))
    throw new Error('keine „könnte erforschen"-Marke für den anderen Menschen');
  if (box.querySelectorAll('.owner-mark:not(.can)').length)
    throw new Error('gefüllte Marke, obwohl niemand die Technologie hat');
  // Hat er sie erforscht, wird daraus eine gefüllte Marke
  S.players[andere].techs[k] = true;
  box.innerHTML = G('ownerMarks')(S, k, pi);
  if (box.querySelector('.owner-mark.can'))
    throw new Error('noch als Möglichkeit markiert, obwohl er sie hat');
  if (!box.querySelectorAll('.owner-mark').length) throw new Error('gar keine Marke mehr');
  delete S.players[andere].techs[k];
  // Bots bekommen nie eine Möglichkeits-Marke – sie kennen keine Verfügbarkeiten
  if (bot >= 0) {
    S.players[bot].avail = S.players[bot].avail || {};
    S.players[bot].avail[k] = true;
    box.innerHTML = G('ownerMarks')(S, k, pi);
    const farben = [...box.querySelectorAll('.owner-mark.can')].length;
    if (farben !== 1) throw new Error(farben + ' Möglichkeits-Marken – Bots dürfen keine haben');
  }
  // Die eigene Verfügbarkeit erzeugt keine Marke (sieht man an der Kachel)
  S.players[pi].avail[k] = true;
  box.innerHTML = G('ownerMarks')(S, k, pi);
  if ([...box.querySelectorAll('.owner-mark.can')].length !== 1)
    throw new Error('das eigene Reich wurde mitmarkiert');
  console.log('       „' + k + '": eine Möglichkeits-Marke, keine für Bots oder einen selbst');
});
step('Solo gegen Bots zeigt keine Möglichkeits-Marken', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur;
  if (G('humanCount')(S) !== 1) throw new Error('Testaufbau hat nicht genau einen Menschen');
  const k = Object.keys(S.players[pi].avail).find(x => S.players[pi].avail[x]);
  const box = window.document.createElement('div');
  box.innerHTML = G('ownerMarks')(S, k, pi);
  if (box.querySelector('.owner-mark.can'))
    throw new Error('Möglichkeits-Marke im Solospiel');
  $('a-tech').onclick();
  if (/könnte/.test($('ov-body').textContent))
    throw new Error('die Legende erklärt etwas, das es hier nicht gibt');
  G('closeModal')();
});
step('Hauptmenü zeigt die Versionsnummer', () => {
  const el = $('m-version');
  if (!el) throw new Error('keine Versionszeile im Hauptmenü');
  const txt = el.textContent.trim();
  if (!/^Hochzeivilization v\d+$/.test(txt)) throw new Error('falsches Format: „' + txt + '"');
  if (!txt.includes(G('APP_VERSION'))) throw new Error('zeigt nicht APP_VERSION');
  // Sie darf die Menüknöpfe nicht verdrängen
  if (!$('screen-menu').querySelector('#m-new')) throw new Error('Menüknöpfe fehlen');
  console.log('       ' + txt);
});
step('Zugende ist mit Armee in der Stadt gesperrt (nicht nur bestätigungspflichtig)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  const cap = G('capitalOf')(S, pi);
  p.res.coins = 50;
  const e = G('buildArmy')(S, pi, cap);
  if (e) throw new Error('Armee ließ sich nicht bauen: ' + e);
  G('redraw')();
  const runde = S.round, dran = S.cur;
  if (!G('blockingIssues')(S, pi).length) throw new Error('keine Sperre gemeldet');
  // Zweimal versuchen – früher ließ der zweite Versuch durch
  $('a-end').onclick();
  $('a-end').onclick();
  if (G('S').round !== runde || G('S').cur !== dran)
    throw new Error('der Zug wurde trotzdem beendet');
  // Nach dem Herausziehen geht es
  const arm = G('armiesOf')(S, pi).find(a => a.r === cap.r && a.c === cap.c);
  const ziel = G('neighbors')(cap.r, cap.c).find(([r, c]) =>
    G('isLand')(S, r, c) && !G('cityAt')(S, r, c) && !G('armyAt')(S, r, c));
  arm.mp = G('moveAllowance')(S, pi);
  G('moveArmy')(S, arm, ziel[0], ziel[1]);
  if (G('blockingIssues')(S, pi).length) throw new Error('Sperre bleibt trotz freiem Stadtfeld');
  $('a-end').onclick();
  if (G('S').round === runde && G('S').cur === dran)
    throw new Error('der Zug ließ sich danach immer noch nicht beenden');
  console.log('       zweimal blockiert, nach dem Herausziehen frei');
});
step('Hauptmenü ohne Fußzeile (Punkt 3 der Nachbesserung)', () => {
  if ($('screen-menu').querySelector('.foot')) throw new Error('Fußzeile steht noch da');
  if (/Home-Bildschirm/.test($('screen-menu').textContent))
    throw new Error('Hinweis auf den Home-Bildschirm steht noch da');
});
step('Technologiebogen unterscheidet bezahlbar von zu teuer (Punkt 4)', () => {
  frischesSpiel();
  const S = G('S'), pi = S.cur, p = G('P')(S);
  // Ausgangslage selbst herstellen statt auf die ausgewürfelte Verfügbarkeit zu hoffen:
  // zwei Technologien mit unterschiedlichen Kosten freischalten und die Wissenschaft
  // exakt auf die billigere setzen. Münzen auf 0, sonst zählen sie 2:1 mit.
  const alle = Object.values(G('TECH_BY_KEY'))
    .filter(t => !p.techs[t.k])
    .sort((a, b) => G('techCost')(S, pi, a) - G('techCost')(S, pi, b));
  const billig = alle[0], teuer = alle[alle.length - 1];
  if (G('techCost')(S, pi, billig) >= G('techCost')(S, pi, teuer))
    throw new Error('keine zwei Technologien mit unterschiedlichen Kosten');
  p.avail[billig.k] = true; p.avail[teuer.k] = true;
  p.res.sci = G('techCost')(S, pi, billig);
  p.res.coins = 0; p.res.food = 0;
  G('techModal')();
  const afford = $('ov-body').querySelectorAll('.tech.avail.afford');
  const costly = $('ov-body').querySelectorAll('.tech.avail.costly');
  if (!afford.length) throw new Error('keine bezahlbare Kachel markiert');
  if (!costly.length) throw new Error('keine zu teure Kachel markiert');
  // Die Einteilung muss der Rechnung folgen, nicht dem Zufall
  const falsch = [...afford].filter(b => b.disabled).length
    + [...costly].filter(b => !b.disabled).length;
  if (falsch) throw new Error(falsch + ' Kacheln sind falsch einsortiert');
  // Keine Kachel ist beides, und nicht verfügbare bleiben außen vor
  if ($('ov-body').querySelectorAll('.tech.afford.costly').length) throw new Error('beides zugleich');
  if ($('ov-body').querySelectorAll('.tech.locked.afford, .tech.locked.costly').length)
    throw new Error('nicht verfügbare Kachel als bezahlbar/zu teuer markiert');
  // Kein zusätzlicher Text – der Unterschied ist rein grafisch
  const woerter = [...afford, ...costly].map(b => b.textContent);
  if (woerter.some(t => /zu teuer|bezahlbar|reicht nicht|leistbar/i.test(t)))
    throw new Error('die Kacheln tragen zusätzlichen Text');
  G('closeModal')();
  // Die drei Stufen müssen sich auch wirklich unterscheiden. jsdom rechnet kein CSS,
  // deshalb wird das Regelwerk selbst geprüft – und zwar genau die Eigenschaft, an der
  // v31 scheiterte: „zu teuer" darf nicht verblassen, sonst sieht es aus wie
  // „nicht verfügbar" (der rote Rand verliert mit der Deckkraft seine Aussage).
  const css = fs.readFileSync(__dirname + '/css/style.css', 'utf8');
  const regel = sel => {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(css);
    if (!m) throw new Error('Regel fehlt: ' + sel);
    return m[1];
  };
  const opac = sel => { const m = /opacity:([\d.]+)/.exec(regel(sel)); return m ? +m[1] : 1; };
  if (opac('.tech.avail.costly') !== 1)
    throw new Error('zu teure Kacheln sind gedämpft – dann verblasst auch der rote Rand');
  if (opac('.tech.locked') > 0.4)
    throw new Error('nicht verfügbare Kacheln heben sich zu wenig ab');
  if (!/dashed/.test(regel('.tech.avail.costly')))
    throw new Error('zu teure Kacheln sind nicht gestrichelt');
  if (!/var\(--red\)/.test(regel('.tech.avail')))
    throw new Error('verfügbare Kacheln haben keinen roten Rand');
  if (/border-color/.test(regel('.tech.locked')))
    throw new Error('nicht verfügbare Kacheln färben den Rand um – dann fällt der Unterschied weg');
  console.log('       ' + afford.length + ' bezahlbar, ' + costly.length + ' zu teuer, ohne Zusatztext'
    + ' · zu teuer voll deckend, nicht verfügbar bei ' + opac('.tech.locked'));
});
step('Protokoll: Würfe hängen eingeklappt an der Aktionszeile (Punkt 6)', () => {
  const log = [
    { c: 'head', m: 'Runde 1 — England (Bot)' },
    { c: 'roll', m: '🎲 5 — Wachstum (4+)' },
    { c: 'act', m: 'England: Stadt wächst auf 2.' },
    { c: 'roll', m: '🎲 2 — Siedeln (4+)' },
    { c: 'roll', m: '🎲 6 — Siedeln (4+)' },
    { c: 'act', m: 'England: Siedler gründet Stadt.' },
    { c: 'roll', m: '🎲 1 — Armee bauen (4+)' },
  ];
  const h = G('logHtml')(log);
  const box = window.document.createElement('div'); box.innerHTML = h;
  const det = box.querySelectorAll('details.rolls');
  if (det.length !== 3) throw new Error(det.length + ' statt 3 Würfelblöcke');
  if ([...det].some(d => d.hasAttribute('open'))) throw new Error('Block ist aufgeklappt');
  // Eingeklappt sichtbar: die Aktionszeilen, nicht die Würfe
  const summaries = [...det].map(d => d.querySelector('summary').textContent.trim());
  if (!summaries[0].startsWith('England: Stadt wächst auf 2.'))
    throw new Error('erste Zusammenfassung ist nicht die Aktion: ' + summaries[0]);
  if (!summaries[1].startsWith('England: Siedler gründet Stadt.'))
    throw new Error('zwei Würfe hängen nicht an ihrer Aktion: ' + summaries[1]);
  // Der letzte Wurf hat keine Aktion – dann steht der Grund da
  if (!/Armee bauen/.test(summaries[2])) throw new Error('Fehlwurf ohne Grund: ' + summaries[2]);
  // Die Rundenüberschrift bekommt keine Würfe angehängt
  if (box.querySelector('details.rolls summary').textContent.includes('Runde 1'))
    throw new Error('Überschrift eingeklappt');
  // Ausklappen zeigt die Würfe
  if (det[1].querySelectorAll('.logline.roll').length !== 2)
    throw new Error('Würfe fehlen im aufgeklappten Block');
  if (/🎲 5/.test(summaries[0])) throw new Error('Wurf steht schon in der Zusammenfassung');
  // Und im echten Protokoll läuft es genauso
  G('logModal')();
  if (!$('ov-body').querySelector('details.rolls')) throw new Error('Protokoll klappt nichts ein');
  G('closeModal')();
  console.log('       3 Blöcke, eingeklappt sichtbar: „' + summaries[0] + '"');
});
step('Layoutklassen richten sich nach der effektiven Größe, auch gedreht', () => {
  const html = window.document.documentElement;
  const w = window.innerWidth, h = window.innerHeight;
  html.classList.remove('turn');
  G('syncLayout')();
  const quer = html.classList.contains('w-side');
  // Gedreht sind Breite und Höhe vertauscht – die Klassen müssen umschlagen
  html.classList.add('turn');
  Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
  G('syncLayout')();
  if (!html.classList.contains('w-side'))
    throw new Error('gedreht wird die Querlage nicht erkannt (1000 × 500)');
  if (!html.classList.contains('w-wide'))
    throw new Error('gedreht wird die Breite nicht erkannt');
  html.classList.remove('turn');
  G('syncLayout')();
  if (html.classList.contains('w-side'))
    throw new Error('ohne Drehung gilt 500 × 1000 als quer');
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  G('setTurn')(true);
  console.log('       500 × 1000 gedreht = quer und breit, ungedreht = hochkant'
    + (quer ? '' : ''));
});
step('Querformat wird nur im Spiel erzwungen, nicht im Menü oder Aufbau', () => {
  const html = window.document.documentElement;
  G('setTurn')(true);
  if (!G('turnWanted')()) throw new Error('Drehung ist gar nicht gewünscht');
  const dreht = id => { G('show')(id); return html.classList.contains('turn'); };
  if (dreht('screen-menu')) throw new Error('Hauptmenü wird gedreht');
  if (dreht('screen-setup')) throw new Error('Aufbaubildschirm wird gedreht');
  if (dreht('screen-editor')) throw new Error('Editor wird gedreht');
  if (!dreht('screen-game')) throw new Error('Spielbildschirm wird nicht gedreht');
  // Abschalten wirkt auch im Spiel, und die Wahl überlebt einen Bildschirmwechsel
  G('setTurn')(false);
  if (html.classList.contains('turn')) throw new Error('Abschalten wirkt nicht');
  G('show')('screen-menu'); G('show')('screen-game');
  if (html.classList.contains('turn')) throw new Error('abgeschaltete Drehung kehrt zurück');
  G('setTurn')(true);
  if (!html.classList.contains('turn')) throw new Error('Wiedereinschalten wirkt nicht');
  // Der Menüeintrag muss die gespeicherte Wahl zeigen, nicht den Bildschirmzustand
  G('show')('screen-menu');
  if (!G('turnWanted')()) throw new Error('Wahl ging beim Verlassen des Spiels verloren');
  G('show')('screen-game');
  console.log('       gedreht: nur screen-game · Wahl überlebt Bildschirmwechsel');
});
step('Blatt endet über der Aktionsleiste (Punkt 3, gemessen)', () => {
  frischesSpiel(); G('setBarHeight')();
  const v = window.document.documentElement.style.getPropertyValue('--bar-h');
  if (!v) throw new Error('--bar-h wurde nicht gesetzt');
  if (!/^\d+px$/.test(v)) throw new Error('--bar-h ist kein Pixelmaß: ' + v);
  console.log('       --bar-h = ' + v);
});

/* ============================================ Plättchenkarte: Startdreiecke legen */
// Was in der Legephase zu sehen war – nach dem Spielstart wird es gegengeprüft
let merkAvail = null, merkSlot = 0;
const legeHelfer = {
  rcs: () => G('slotRC')(G('placeState').plan, G('placeSeatNow')().slot),
  frei: () => G('placeOptions')(G('placeState').plan, G('placeSeatNow')(), G('placeState').o),
};
// Duell mit zwei Menschen auf der Plättchenkarte
step('Plättchenkarte: Legephase startet statt des Spiels', () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=duell]').onclick();
  // beide Plätze auf Mensch
  [...$('setup-list').children].forEach(x => x.querySelector('[data-kind="human"]').onclick());
  $('setup-map').value = 'plaettchen'; $('setup-map').onchange();
  if ($('setup-tile-hint').hidden) throw new Error('kein Hinweis zur Plättchenkarte');
  const vorher = G('S');
  $('setup-go').onclick();
  if (!$('screen-place').classList.contains('show')) throw new Error('Legebildschirm kommt nicht');
  if (G('S') !== vorher) throw new Error('das Spiel startet schon vor dem Legen');
  const st = G('placeState');
  if (st.queue.length !== 2) throw new Error('nicht beide Menschen in der Warteschlange');
  console.log('       ' + st.plan.name + ', Warteschlange ' + st.queue.length);
});
step('Verdeckt: sichtbar sind nur die offenen Plättchen und das eigene', () => {
  if (!$('overlay').classList.contains('show')) throw new Error('keine Übergabe-Aufforderung');
  $('pl-gate').onclick();
  const felder = $('pl-map').querySelectorAll('[data-r]').length;
  // Sechseck: 90 Felder (Mitte bleibt leer), davon 15 für das verdeckte Plättchen
  if (felder !== 75) throw new Error('sichtbar sind ' + felder + ' Felder statt 75');
  const hl = $('pl-map').querySelectorAll('[stroke-dasharray="5 4"]').length;
  const erlaubt = legeHelfer.frei().filter(Boolean).length;
  if (hl !== erlaubt) throw new Error(`${hl} Markierungen, aber ${erlaubt} erlaubte Felder`);
  if (erlaubt < 5) throw new Error('kaum ein Feld erlaubt: ' + erlaubt);
  console.log('       ' + felder + ' Felder sichtbar, ' + hl + ' erlaubte Hauptstadtfelder');
});
/* Erst würfeln, dann legen (v66): Der Technologiebogen steht schon in der Legephase
   offen, und was dort steht, muss später im Spiel genauso dastehen. */
step('Legephase: Forschungsseite ist schon zu sehen', () => {
  const st = G('placeState'), seat = G('placeSeatNow')();
  if (!st.setup || !st.setup.avail) throw new Error('nichts vorab ausgewürfelt');
  const meine = st.setup.avail[seat.idx];
  const anzahl = G('TECHS').filter(t => meine[t.k]).length;
  if (!anzahl) throw new Error('kein einziges Feld verfügbar – das kann nicht sein');
  $('pl-tech').onclick();
  if (!$('overlay').classList.contains('show')) throw new Error('Forschungsseite geht nicht auf');
  const kacheln = $('ov-body').querySelectorAll('.tech.avail');
  const wunder = st.cfg.wonders ? $('ov-body').querySelectorAll('.tech.avail').length - anzahl : 0;
  if (kacheln.length - wunder !== anzahl)
    throw new Error(kacheln.length - wunder + ' verfügbare Kacheln statt ' + anzahl);
  if ($('ov-body').querySelector('[data-tech]'))
    throw new Error('in der Legephase lässt sich geforscht werden');
  G('closeModal')();
  // merken, um es nach dem Spielstart gegenzuprüfen
  merkAvail = meine; merkSlot = seat.idx;
  console.log('       ' + anzahl + ' verfügbare Technologien vor dem Legen'
    + (st.cfg.wonders ? ', dazu die Wunderstapel' : ''));
});
step('Legephase: kein Plättchenname, dafür Fähigkeit und Ertragsübersicht', () => {
  const seat = G('placeSeatNow')();
  const note = $('pl-note');
  // 1) kein Plättchenname mehr
  const namen = G('TILE_POOL').map(t => t.n);
  const drin = namen.filter(n => note.textContent.includes(n));
  if (drin.length) throw new Error('Plättchenname in der Zeile: ' + drin.join(','));
  // 2) die Fähigkeit steht da – auch wenn sie ausgelost wurde
  const chip = note.querySelector('.pl-abil');
  const a = G('seatAbil')(seat);
  if (!a) throw new Error('keine Fähigkeit ermittelt');
  if (!chip) throw new Error('Fähigkeit fehlt in der Legephase');
  if (chip.textContent !== a.n) throw new Error('falsche Fähigkeit: ' + chip.textContent);
  if (!chip.getAttribute('title')) throw new Error('kein Wirkungstext als Titel');
  // 3) vor dem Setzen keine Ertragszeile, danach schon
  if (note.querySelector('.pl-yield')) throw new Error('Ertrag schon vor dem Setzen');
  const rcs = legeHelfer.rcs(), frei = legeHelfer.frei();
  const mitte = G('TRI_MIDDLE').find(i => frei[i]);
  G('plTap')(rcs[mitte][0], rcs[mitte][1]);
  const y = $('pl-note').querySelector('.pl-yield');
  if (!y) throw new Error('keine Ertragsübersicht nach dem Setzen');
  if (!/🔬/.test(y.textContent) || !/🌾/.test(y.textContent) || !/🪙/.test(y.textContent))
    throw new Error('Ertragsübersicht ohne die drei Erträge: ' + y.textContent);
  // Mitte-Feld: alle sechs Nachbarn liegen auf dem eigenen Plättchen, also kein Hinweis
  if (/verdeckte/.test(y.textContent))
    throw new Error('Hinweis auf Verdecktes, obwohl das Feld mittig liegt');
  console.log('       ' + chip.textContent + ' · ' + y.textContent.replace(/\s+/g, ' '));
  // Wahl zurücknehmen: die folgenden Schritte prüfen den Zustand vor dem Setzen
  G('placeState').cell = null;
  G('drawPlace')();
  if ($('pl-note').querySelector('.pl-yield')) throw new Error('Ertragszeile bleibt stehen');
});
/* v73: Startfelder, bei denen ein anderes erlaubtes Feld (in irgendeiner Lage) von einem
   Ertrag mehr und von keinem weniger bringt, tragen einen rötlichen Rand. Geprüft wird
   Feld für Feld gegen dominatedCells, in allen drei Lagen, samt Legende und Ertragszeile. */
step('Legephase: dominierte Startfelder sind rötlich umrandet', () => {
  const st = G('placeState'), seat = G('placeSeatNow')();
  const rcs = legeHelfer.rcs(), HEX = G('HEX');
  const tab = G('placeYieldTable')(st.plan, seat, st.cfg.players[seat.idx]);
  const dom = G('dominatedCells')(tab);
  const ort = ([r, c]) => { const [x, y] = G('hexCenter')(r, c, HEX); return `translate(${x},${y})`; };
  let rotGesamt = 0, gewaehlt = false;
  for (let k = 0; k < 3; k++) {
    const o = st.o;
    const ist = [...$('pl-map').querySelectorAll('polygon[stroke="#d0402c"]')]
      .map(p => p.getAttribute('transform')).sort();
    const soll = rcs.filter((_, i) => dom[o][i]).map(ort).sort();
    if (ist.join('|') !== soll.join('|'))
      throw new Error(`Lage ${o + 1}: ${ist.length} rote Ränder, aber ${soll.length} dominierte Felder`);
    // markiert heißt nicht gesperrt: auch unter jedem roten Rand liegt die „erlaubt"-Markierung
    const erlaubt = new Set([...$('pl-map').querySelectorAll('[stroke-dasharray="5 4"]')]
      .map(p => p.getAttribute('transform')));
    if (soll.some(t => !erlaubt.has(t))) throw new Error('ein rot umrandetes Feld ist nicht erlaubt');
    const leg = $('pl-note').querySelector('.pl-dom');
    if (!!leg !== soll.length > 0) throw new Error(`Lage ${o + 1}: Legende passt nicht zu den Rändern`);
    // Ein rotes Feld lässt sich wählen; die Ertragszeile nennt genau die Zahl aus der Tabelle
    const i = dom[o].indexOf(true);
    if (i >= 0 && !gewaehlt) {
      G('plTap')(rcs[i][0], rcs[i][1]);
      if (st.cell !== i) throw new Error('rot umrandetes Feld lässt sich nicht wählen');
      const zeile = $('pl-note').querySelector('.pl-yield').textContent.replace(/\s+/g, ' ');
      if (!zeile.includes(G('fmtGain')(tab[o][i]))) throw new Error('Ertragszeile ≠ Tabelle: ' + zeile);
      if (/verdeckt/.test(zeile)) throw new Error('alter Hinweis auf verdeckte Nachbarfelder');
      st.cell = null; G('drawPlace')(); gewaehlt = true;
    }
    rotGesamt += soll.length;
    G('placeRotate')();
  }
  if (st.o !== 0) throw new Error('nach drei Drehungen nicht wieder Lage 1');
  const frei = tab.flat().filter(Boolean).length;
  console.log(`       ${rotGesamt} von ${frei} erlaubten Wahlmöglichkeiten (3 Lagen) rot umrandet`);
});
step('Drehen zeigt dasselbe Plättchen in einer anderen Lage', () => {
  const karte = () => G('tileMap')(G('placeState').plan, {
    show: [G('placeSeatNow')().slot], seat: G('placeSeatNow')(), o: G('placeState').o,
  }).rows.join('');
  const a = karte();
  G('placeRotate')();
  if (G('placeState').o !== 1) throw new Error('Lage nicht weitergeschaltet');
  const b = karte();
  if (a === b) throw new Error('Drehen ändert die Karte nicht');
  G('placeRotate')(); G('placeRotate')();
  if (G('placeState').o !== 0) throw new Error('nach drei Mal nicht wieder Lage 1');
  if (karte() !== a) throw new Error('drei Drehungen ergeben nicht die Ausgangslage');
  console.log('       drei Lagen, danach wieder die erste');
});
step('Hauptstadt nur auf erlaubten Feldern des eigenen Plättchens', () => {
  const rcs = legeHelfer.rcs(), frei = legeHelfer.frei();
  // fremdes Feld: der Zustand darf sich nicht ändern
  G('plTap')(0, 0);
  if (G('placeState').cell != null) throw new Error('Feld außerhalb des Plättchens angenommen');
  const gesperrt = frei.indexOf(false);
  if (gesperrt >= 0) {
    G('plTap')(rcs[gesperrt][0], rcs[gesperrt][1]);
    if (G('placeState').cell != null) throw new Error('gesperrtes Feld angenommen');
  }
  const gut = frei.indexOf(true);
  G('plTap')(rcs[gut][0], rcs[gut][1]);
  if (G('placeState').cell !== gut) throw new Error('erlaubtes Feld nicht übernommen');
  console.log('       gesperrte Felder: ' + frei.filter(x => !x).length + ' von 15');
});
step('Bestätigen gibt an die zweite Person weiter', () => {
  G('placeConfirm')();
  const st = G('placeState');
  if (st.at !== 1) throw new Error('nicht weitergerückt');
  if (st.done) throw new Error('zu früh aufgedeckt');
  if (!$('overlay').classList.contains('show')) throw new Error('keine zweite Übergabe');
  $('pl-gate').onclick();
  if (st.plan.seats[0].cell == null) throw new Error('erste Wahl nicht gespeichert');
  const felder = $('pl-map').querySelectorAll('[data-r]').length;
  if (felder !== 75) throw new Error('das fremde Plättchen ist zu sehen (' + felder + ')');
});
step('Aufdecken zeigt alle Plättchen, dann startet das Spiel', () => {
  const rcs = legeHelfer.rcs(), frei = legeHelfer.frei();
  const gut = frei.indexOf(true);
  G('plTap')(rcs[gut][0], rcs[gut][1]);
  G('placeConfirm')();
  const st = G('placeState');
  if (!st.done) throw new Error('nicht aufgedeckt');
  const felder = $('pl-map').querySelectorAll('[data-r]').length;
  if (felder !== 90) throw new Error('nach dem Aufdecken nur ' + felder + ' Felder');
  if (!$('pl-rot').hidden) throw new Error('Drehen ist nach dem Aufdecken noch möglich');
  G('placeConfirm')();
  const S = G('S');
  if (!$('screen-game').classList.contains('show')) throw new Error('Spiel startet nicht');
  if (!S.duel) throw new Error('Duellregeln nicht übernommen');
  /* Die Partie muss genau die Verfügbarkeiten tragen, die in der Legephase zu sehen
     waren. Achtung zur Aussagekraft: Vorabwurf und Partie laufen auf DEMSELBEN Seed,
     also käme heute auch ohne die Übergabe (cfg.avail) dasselbe heraus – diese Probe
     schlägt erst an, wenn sich die Würfelreihenfolge vor Aufbau 3 ändert. Dass die
     Übergabe wirklich greift, prüft test.js mit einer Vorgabe, die kein Würfel ergäbe. */
  const gesehen = merkAvail;
  if (gesehen) {
    const p0 = S.players.find(p => p.slot === merkSlot);
    const jetzt = G('TECHS').filter(t => p0.avail[t.k]).map(t => t.k).sort().join(',');
    const vorher = G('TECHS').filter(t => gesehen[t.k]).map(t => t.k).sort().join(',');
    if (jetzt !== vorher)
      throw new Error('im Spiel steht etwas anderes als beim Legen:\n  ' + vorher + '\n  ' + jetzt);
  }
  if (S.cities.length !== 2) throw new Error('nicht zwei Hauptstädte');
  const [a, b] = S.cities;
  // Seit v73 eine Reihe näher erlaubt: an der Mitte bis auf 2, gemeinsam ist dann nur das
  // Loch. Ein echtes Umlandfeld teilen sich zwei Hauptstädte nie.
  const u0 = G('controlledTiles')(S, a.owner), u1 = G('controlledTiles')(S, b.owner);
  const geteilt = [...u0].filter(k => u1.has(k));
  if (geteilt.length) throw new Error('Hauptstädte teilen sich Umland: ' + geteilt.join(' '));
  if (G('hexDistance')(a.r, a.c, b.r, b.c) < 2) throw new Error('Hauptstädte zu nah beieinander');
  if ($('map').querySelectorAll('[data-r]').length !== 90)
    throw new Error('die Spielkarte zeigt nicht 90 Felder');
  // Das Loch in der Mitte ist wirklich keines: unpassierbar, nicht antippbar
  const mitte = S.map.rows.findIndex(r => r.includes('X') && /[^X]X[^X]/.test(r));
  if (mitte < 0) throw new Error('kein Loch in der Mitte des Sechsecks');
  console.log('       ' + S.map.name + ', Hauptstadtabstand ' +
    G('hexDistance')(a.r, a.c, b.r, b.c));
});
/* v73: Eine Stadt am Rand der Plättchenkarte oder am Loch zog ihre Reichsgrenze um die
   leeren Sechsecke dahinter. Geprüft wird die gezeichnete Grenze selbst: jede Linie muss
   eine Kante zwischen dem Reich (Stadt + echte Nachbarfelder) und dem Rest sein – und
   jede solche Kante muss gezeichnet sein. */
step('Reichsgrenze am Kartenrand und am Loch: nur um echte Felder', () => {
  const S = G('S'), HEX = G('HEX');
  const echt = (r, c) => { const t = G('terrainAt')(S, r, c); return !!t && !G('isOff')(t); };
  const K = (r, c) => r + ',' + c;
  const nb = (r, c) => G('neighbors')(r, c);
  let amRand = null, amLoch = null;
  S.map.rows.forEach((row, r) => [...row].forEach((_, c) => {
    if (!echt(r, c)) return;
    const leer = nb(r, c).filter(([x, y]) => !echt(x, y));
    if (!leer.length) return;
    // am Loch: ein leerer Nachbar, der selbst ringsum echte Felder hat
    if (leer.some(([x, y]) => nb(x, y).every(([u, v]) => echt(u, v)))) amLoch = amLoch || [r, c];
    else amRand = amRand || [r, c];
  }));
  if (!amRand || !amLoch) throw new Error('kein Randfeld bzw. kein Feld am Loch gefunden');
  // Für die Probe steht nur diese eine Stadt auf der Karte – keine fremde Grenze, keine
  // Nachbarstadt, die das Umland verkleinert. Gezeichnet wird trotzdem die echte Karte.
  const pi = S.cur, col = G('civOf')(S.players[pi]).color, alt = S.cities;
  const pts = G('hexPoints')(HEX), rund = v => Math.round(v * 10) / 10;
  const linien = () => [...$('map').querySelectorAll(`line[stroke="${col}"][stroke-width="3.5"]`)]
    .map(l => rund((+l.getAttribute('x1') + +l.getAttribute('x2')) / 2) + '/' +
      rund((+l.getAttribute('y1') + +l.getAttribute('y2')) / 2)).sort();
  for (const [wo, [r, c]] of [['Rand', amRand], ['Loch', amLoch]]) {
    S.cities = [{ id: 9990, owner: pi, r, c, pop: 1, cap: true, grown: 0, born: 0 }];
    G('redraw')();
    const reich = new Set([K(r, c), ...nb(r, c).filter(([x, y]) => echt(x, y)).map(([x, y]) => K(x, y))]);
    const soll = [];
    for (const k of reich) {
      const [x, y] = k.split(',').map(Number), [cx, cy] = G('hexCenter')(x, y, HEX);
      for (let d = 0; d < 6; d++) {
        const [nx, ny] = G('neighbor')(x, y, d);
        if (reich.has(K(nx, ny))) continue;
        const p1 = pts[(d + 1) % 6], p2 = pts[(d + 2) % 6];
        soll.push(rund(cx + (p1[0] + p2[0]) / 2) + '/' + rund(cy + (p1[1] + p2[1]) / 2));
      }
    }
    const ist = linien();
    if (ist.join() !== soll.sort().join())
      throw new Error(`${wo} ${r}/${c}: ${ist.length} Grenzlinien gezeichnet, ${soll.length} erwartet`);
    console.log(`       Stadt am ${wo} (${r}/${c}): ${reich.size - 1} echte Nachbarn, ${ist.length} Grenzlinien`);
  }
  S.cities = alt; G('redraw')();
});
step('Spielende: Punktetafel und Mensch vor Bot', () => {
  // Vier Reiche, Originalkarte: Platz 1 Mensch, Plätze 2–4 Bots. Die Schritte davor
  // haben Modus und Kartenwahl verstellt, beides wird hier bewusst zurückgesetzt.
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = '0'; $('setup-map').onchange();
  [1, 2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
  $('setup-go').onclick();
  const S = G('S');
  if (!S || S.over) throw new Error('kein frisches Spiel');
  S.cities.forEach(c => { c.pop = 2; });
  S.players.forEach(p => { p.techs = { rad: true, schrift: true }; });
  const mensch = S.players.findIndex(p => p.kind !== 'bot');
  const bot = S.players.findIndex(p => p.kind === 'bot');
  G('claimVictory')(S, bot, 'Forschungssieg (Singularität)');
  G('claimVictory')(S, mensch, 'Wirtschaftssieg (Test)');
  if (!/letzte Runde/.test(($('hud-round').textContent, G('redraw')(), $('hud-round').textContent)))
    throw new Error('die Kopfzeile nennt die letzte Runde nicht');
  let guard = 0;
  while (!G('S').over && guard++ < 8) G('endTurn')(S);
  if (!S.over) throw new Error('das Spiel endet nicht am Rundenende');
  if (S.over.winner !== mensch) throw new Error('der Mensch gewinnt nicht');
  G('gameOver')();
  const txt = $('ov-body').textContent;
  if (!/Punkte/.test(txt)) throw new Error('keine Punktetafel im Spielende');
  if (!/Mensch/.test(txt)) throw new Error('die Menschenregel wird nicht erklärt');
  const zeilen = $('ov-body').querySelectorAll('table tr').length;
  if (zeilen !== 3) throw new Error('Punktetafel hat ' + zeilen + ' Zeilen statt 3 (Kopf + 2)');
  console.log('       Punktetafel mit 2 Ansprüchen, Sieg an den Menschen');
  G('closeModal')();
});
step('Spielende zeigt immer einen Tipp aus der Sammlung', () => {
  G('gameOver')();
  const tip = $('ov-body').querySelector('.tip');
  if (!tip) throw new Error('kein Tipp am Spielende');
  const TIPS = G('TIPS');
  const text = tip.textContent.replace(/^\s*Tipp\s*/, '').trim();
  if (!TIPS.includes(text)) throw new Error('der Tipp stammt nicht aus TIPS: ' + text.slice(0, 50));
  // Ein Tipp je Partie, nicht je Aufruf: gameOver() kommt aus mehreren Wegen
  const nochmal = (G('gameOver')(), $('ov-body').querySelector('.tip').textContent);
  if (nochmal !== tip.textContent) throw new Error('der Tipp wechselt bei jedem Aufruf');
  console.log('       „' + text.slice(0, 52) + '…“ · bleibt über mehrere Aufrufe gleich');
  G('closeModal')();
});
step('Solo: „Nochmal spielen" startet dieselbe Aufstellung mit ausgelostem Reich', () => {
  // Ein Mensch, drei Bots, Originalkarte – wie im Schritt davor aufgesetzt
  const alt = G('S');
  const menschAlt = alt.players.find(p => p.kind === 'human');
  if (G('humanSeats')(alt).length !== 1) throw new Error('kein Solospiel');
  if (!alt.recipe) throw new Error('kein Rezept im Spielstand');
  G('gameOver')();
  if (!$('go-again')) throw new Error('kein „Nochmal spielen“-Knopf');
  if (!$('go-again').classList.contains('primary'))
    throw new Error('der Knopf ist nicht hervorgehoben');
  if (!$('go-menu')) throw new Error('kein Weg zurück ins Menü');
  // Reihenfolge: erst nochmal spielen, dann das Menü
  const knoepfe = [...$('ov-body').querySelectorAll('button')].map(b => b.id);
  if (knoepfe.indexOf('go-again') > knoepfe.indexOf('go-menu'))
    throw new Error('der Menüknopf steht vor dem Wiederholen');
  $('go-again').onclick();
  const neu = G('S');
  if (neu === alt || neu.over) throw new Error('kein frisches Spiel');
  if (!window.document.getElementById('screen-game').classList.contains('show'))
    throw new Error('das neue Spiel wird nicht gezeigt');
  const menschNeu = neu.players.find(p => p.kind === 'human');
  if (!menschNeu) throw new Error('kein Mensch im neuen Spiel');
  // Ein echtes Reich mit einer Fähigkeit, die dazu gehört
  if (menschNeu.ability === 'zufall') throw new Error('Fähigkeit nicht aufgelöst');
  if (!G('CIV_BY_KEY')[menschNeu.civ].abilities.some(a => a.k === menschNeu.ability))
    throw new Error('Fähigkeit passt nicht zum Reich: ' + menschNeu.civ + '/' + menschNeu.ability);
  if (neu.players.length !== alt.players.length) throw new Error('andere Spielerzahl');
  if (neu.map.name !== alt.map.name) throw new Error('andere Karte: ' + neu.map.name);
  if (!!neu.ev !== !!alt.ev || !!neu.wo !== !!alt.wo) throw new Error('andere Erweiterungen');
  if ($('confetti')) throw new Error('die Schnipsel des alten Spiels liegen noch');
  console.log('       ' + menschAlt.civ + ' → ' + menschNeu.civ +
    ' (' + menschNeu.ability + '), ' + neu.players.length + ' Reiche, ' + neu.map.name);
});
step('Wiederholtes „Nochmal spielen" verteilt die Reiche wirklich', () => {
  /* Der Stolperstein: auf den festen Karten sitzt jede Zivilisation genau einmal. Ein
     einfaches „Zufall" zieht deshalb nur aus dem, was frei ist – bei vier Reichen genau
     das eigene alte, man bekäme jedes Mal dasselbe. Getestet wird also nicht die Absicht,
     sondern das Ergebnis über viele Läufe. */
  const gezogen = new Set();
  for (let i = 0; i < 16; i++) {
    G('rematch')(false);
    const S = G('S');
    gezogen.add(S.players.find(p => p.kind === 'human').civ);
    const civs = S.players.map(p => p.civ);
    if (new Set(civs).size !== civs.length)
      throw new Error('zwei Reiche auf einem Startstern: ' + civs.join(','));
  }
  if (gezogen.size < 3)
    throw new Error('kaum Abwechslung, nur: ' + [...gezogen].join(' · '));
  console.log('       16 Läufe, Reiche des Menschen: ' + [...gezogen].sort().join(' · '));
});
step('Nach einem Sieg eine Stufe schwerer, nach einer Niederlage gleich', () => {
  const S = G('S');
  const mensch = S.players.findIndex(p => p.kind === 'human');
  const bot = S.players.findIndex(p => p.kind === 'bot');
  const gradVor = S.players[bot].diff;
  // Sieg des Menschen
  G('claimVictory')(S, mensch, 'Wirtschaftssieg (Test)');
  let guard = 0;
  while (!G('S').over && guard++ < 8) G('endTurn')(S);
  if (!S.over) throw new Error('das Spiel endet nicht');
  G('gameOver')();
  if (!/schwerer/.test($('ov-body').textContent))
    throw new Error('der Sieg kündigt keine höhere Schwierigkeit an: ' + $('ov-body').textContent.slice(0, 120));
  $('go-again').onclick();
  const nachSieg = G('S').players.find(p => p.kind === 'bot').diff;
  if (nachSieg !== G('nextDiff')(gradVor))
    throw new Error(`nach dem Sieg ${nachSieg} statt ${G('nextDiff')(gradVor)}`);
  // Niederlage: derselbe Grad
  const T2 = G('S');
  const botIdx = T2.players.findIndex(p => p.kind === 'bot');
  G('claimVictory')(T2, botIdx, 'Forschungssieg (Test)');
  guard = 0;
  while (!G('S').over && guard++ < 8) G('endTurn')(T2);
  G('gameOver')();
  if (/schwerer/.test($('ov-body').textContent))
    throw new Error('auch die Niederlage erhöht die Schwierigkeit');
  $('go-again').onclick();
  const nachNiederlage = G('S').players.find(p => p.kind === 'bot').diff;
  if (nachNiederlage !== nachSieg)
    throw new Error(`nach der Niederlage ${nachNiederlage} statt ${nachSieg}`);
  console.log(`       ${gradVor} → Sieg → ${nachSieg} → Niederlage → ${nachNiederlage}`);
});
step('Am höchsten Grad erhöht auch ein Sieg nicht weiter', () => {
  const S = G('S');
  S.players.forEach(p => { p.diff = 'david'; });
  S.recipe.players.forEach(p => { p.diff = 'david'; });
  const mensch = S.players.findIndex(p => p.kind === 'human');
  S.over = { winner: mensch, winners: [mensch], how: 'Probe', shared: false };
  G('gameOver')();
  const hinweis = [...$('ov-body').querySelectorAll('p.sub')]
    .map(p => p.textContent).find(t => /Dieselben/.test(t)) || '';
  if (!/nicht/.test(hinweis)) throw new Error('kein Hinweis auf den höchsten Grad: ' + hinweis);
  $('go-again').onclick();
  const jetzt = G('S').players.find(p => p.kind === 'bot').diff;
  if (jetzt !== 'david') throw new Error('über David hinaus erhöht: ' + jetzt);
  console.log('       ' + hinweis);
});
step('Ein Spielstand ohne Rezept zeigt nur den Weg ins Menü', () => {
  // Spielstände aus Fassungen vor „Nochmal spielen" tragen kein Rezept, und das
  // Tutorial setzt keines – dort darf der Knopf nicht erscheinen, aber der Tipp schon.
  const S = G('S');
  delete S.recipe;
  const mensch = S.players.findIndex(p => p.kind === 'human');
  S.over = { winner: mensch, winners: [mensch], how: 'Probe', shared: false };
  G('gameOver')();
  if ($('go-again')) throw new Error('Knopf ohne Rezept – womit sollte er neu starten?');
  if (!$('go-menu')) throw new Error('auch der Menüweg fehlt');
  if (!$('ov-body').querySelector('.tip')) throw new Error('der Tipp fehlt');
  console.log('       kein Wiederholen, Menü und Tipp da');
  G('closeModal')();
});
step('Zu mehreren gibt es kein „Nochmal spielen"', () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = '0'; $('setup-map').onchange();
  [...$('setup-list').children].slice(0, 2).forEach(x => x.querySelector('[data-kind="human"]').onclick());
  [...$('setup-list').children].slice(2).forEach(x => x.querySelector('[data-kind="bot"]').onclick());
  $('setup-go').onclick();
  const S = G('S');
  if (G('humanSeats')(S).length !== 2) throw new Error('kein Spiel mit zwei Menschen');
  G('claimVictory')(S, S.players.findIndex(p => p.kind === 'human'), 'Wirtschaftssieg (Test)');
  let guard = 0;
  while (!G('S').over && guard++ < 8) G('endTurn')(S);
  G('gameOver')();
  if ($('go-again')) throw new Error('bei zwei Menschen wird ein Reich ausgelost');
  if (!$('ov-body').querySelector('.tip')) throw new Error('aber der Tipp fehlt');
  console.log('       zwei Menschen: nur Menü, Tipp trotzdem da');
  G('closeModal')();
});
step('Plättchenkarte: dieselbe Zivilisation mehrfach wählbar', () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = 'plaettchen'; $('setup-map').onchange();
  if ($('setup-double-hint').hidden) throw new Error('kein Hinweis auf die freie Wahl');
  const slots = [...$('setup-list').children];
  const picks = slots.map(x => x.querySelector('[data-civpick]'));
  if (picks.some(p => !p)) throw new Error('bei vier Reichen fehlt die Zivilisationswahl');
  // Alle vier Plätze fest setzen: zweimal Russland, das darf hier stehenbleiben
  const setze = (i, k) => {
    const sel = [...$('setup-list').children][i].querySelector('[data-civpick]');
    sel.value = k; sel.onchange();
  };
  ['russland', 'russland', 'england', 'wikinger'].forEach((k, i) => setze(i, k));
  const civs = [...$('setup-list').children].map(x => x.dataset.civ);
  if (civs.join() !== 'russland,russland,england,wikinger')
    throw new Error('die Doppelung wurde aufgelöst: ' + civs.join(','));
  // verschiedene Fähigkeiten für die beiden
  const abil = [...$('setup-list').children].map(x => x.querySelector('[data-abil]'));
  abil[0].value = 'siedler'; abil[0].onchange();
  const cfg = G('startPlayers')();
  if (cfg[0].name !== 'Russland I' || cfg[1].name !== 'Russland II')
    throw new Error('keine Ziffern für die Doppelgänger: ' + cfg.map(p => p.name).join(','));
  if (cfg[0].color === cfg[1].color) throw new Error('beide Russlands in derselben Farbe');
  if (cfg[0].ability === cfg[1].ability) throw new Error('Fähigkeit nicht übernommen');
  // Startspielerliste: erst „Zufällig", dann die Plätze (dort steht die Zivilisation,
  // die Ziffern fallen erst beim Start – die Wahl soll ja nicht vorwegnehmen, wer wer ist)
  const startOpts = [...$('setup-start').options].map(o => o.text);
  if (startOpts[0] !== 'Zufällig') throw new Error('kein Zufall als Startspieler: ' + startOpts[0]);
  if (startOpts.length !== 5) throw new Error('Startspielerliste hat ' + startOpts.length + ' Einträge');
  console.log('       ' + cfg.map(p => (p.name || p.civ) + '/' + p.ability).join(' · '));
});
step('Feste Karte lässt keine zwei gleichen Reiche zu', () => {
  $('setup-map').value = '0'; $('setup-map').onchange();
  const civs = [...$('setup-list').children].map(x => x.dataset.civ);
  if (new Set(civs).size !== 4) throw new Error('doppelte Zivilisation auf fester Karte: ' + civs.join(','));
  const pick = [...$('setup-list').children][1].querySelector('[data-civpick]');
  if (pick) {
    pick.value = civs[0]; pick.onchange();
    const jetzt = [...$('setup-list').children].map(x => x.dataset.civ);
    if (new Set(jetzt).size !== 4) throw new Error('Kollision nicht aufgelöst: ' + jetzt.join(','));
  }
  const cfg = G('startPlayers')();
  if (cfg.some(p => p.name)) throw new Error('ohne Doppelung darf es keine Ziffern geben');
  if (cfg.some(p => p.color)) throw new Error('ohne Doppelung bleibt die eigene Farbe');
  console.log('       ' + [...$('setup-list').children].map(x => x.dataset.civ).join(' · '));
});
step('Zwei gleiche Reiche spielen auf der Plättchenkarte', () => {
  $('setup-map').value = 'plaettchen'; $('setup-map').onchange();
  const setze = (i, k) => {
    const sel = [...$('setup-list').children][i].querySelector('[data-civpick]');
    sel.value = k; sel.onchange();
  };
  ['wikinger', 'wikinger', 'england', 'griechenland'].forEach((k, i) => setze(i, k));
  [...$('setup-list').children].slice(1).forEach(x => x.querySelector('[data-kind="bot"]').onclick());
  $('setup-list').children[0].querySelector('[data-kind="human"]').onclick();
  $('setup-go').onclick();
  // ein Mensch: legt selbst, danach wird aufgedeckt und gestartet
  const rcs = legeHelfer.rcs(), frei = legeHelfer.frei();
  G('plTap')(rcs[frei.indexOf(true)][0], rcs[frei.indexOf(true)][1]);
  G('placeConfirm')(); G('placeConfirm')();
  const S = G('S');
  const wik = S.players.filter(p => p.civ === 'wikinger');
  if (wik.length !== 2) throw new Error('nicht zwei Wikingerreiche im Spiel');
  if (S.cities.length !== 4) throw new Error('nicht vier Hauptstädte');
  if (new Set(S.cities.map(c => c.r + ',' + c.c)).size !== 4)
    throw new Error('zwei Hauptstädte auf demselben Feld');
  const namen = wik.map(p => G('civOf')(p).n);
  if (namen[0] === namen[1]) throw new Error('beide heißen gleich: ' + namen.join(','));
  if (G('civOf')(wik[0]).color === G('civOf')(wik[1]).color)
    throw new Error('beide in derselben Farbe');
  if ($('map').querySelectorAll('[data-r]').length !== 150)
    throw new Error('die Karte hat nicht 150 Felder');
  console.log('       ' + S.players.map(p => G('civOf')(p).n).join(' · '));
});
step('Zufall als Zivilisation, Fähigkeit und Startspieler', () => {
  G('__set')('startWanted', null);      // ohne bewusste Wahl gilt die Vorgabe
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = 'plaettchen'; $('setup-map').onchange();
  const setze = (i, sel, wert) => {
    const el = [...$('setup-list').children][i].querySelector(sel);
    el.value = wert; el.onchange();
  };
  setze(0, '[data-civpick]', 'zufall');
  setze(1, '[data-civpick]', 'zufall');
  // Bei ausgelostem Reich gibt es nur noch den Zufall – „Grundfähigkeit" ist weg
  const abil0 = [...$('setup-list').children][0].querySelector('[data-abil]');
  if ([...abil0.options].map(o => o.value).join() !== 'zufall')
    throw new Error('Fähigkeitsliste bei Zufall: ' + [...abil0.options].map(o => o.value).join());
  if (!abil0.disabled) throw new Error('Fähigkeitsmenü bei Zufall nicht stillgelegt');
  setze(2, '[data-abil]', 'zufall');            // bekannte Zivilisation, Fähigkeit gelost
  // zwei Menschen ⇒ Startspieler steht auf Zufällig
  [...$('setup-list').children].slice(0, 2).forEach(x => x.querySelector('[data-kind="human"]').onclick());
  [...$('setup-list').children].slice(2).forEach(x => x.querySelector('[data-kind="bot"]').onclick());
  if ($('setup-start').value !== 'zufall')
    throw new Error('bei zwei Menschen ist Zufall nicht vorausgewählt: ' + $('setup-start').value);
  // auflösen: echte Zivilisationen und echte Fähigkeiten
  const alle = CIVS_TEST().map(c => c.k);
  for (let versuch = 0; versuch < 20; versuch++) {
    const cfg = G('startPlayers')();
    if (cfg.some(p => p.civ === 'zufall')) throw new Error('Zufall nicht aufgelöst');
    if (cfg.some(p => !alle.includes(p.civ))) throw new Error('unbekannte Zivilisation');
    if (cfg.some(p => p.ability === 'zufall')) throw new Error('Fähigkeit nicht aufgelöst');
    cfg.forEach(p => {
      if (!G('CIV_BY_KEY')[p.civ].abilities.some(a => a.k === p.ability))
        throw new Error('Fähigkeit passt nicht zur Zivilisation: ' + p.civ + '/' + p.ability);
    });
    if (new Set(cfg.map(p => G('civOf')(p).color)).size !== 4)
      throw new Error('nicht vier verschiedene Farben: ' + cfg.map(p => G('civOf')(p).color).join(','));
  }
  console.log('       aufgelöst, vier verschiedene Farben, Startspieler zufällig');
});
step('Bei einem Menschen bleibt er selbst der Startspieler', () => {
  [...$('setup-list').children].slice(1).forEach(x => x.querySelector('[data-kind="bot"]').onclick());
  $('setup-list').children[0].querySelector('[data-kind="human"]').onclick();
  if ($('setup-start').value === 'zufall')
    throw new Error('mit nur einem Menschen sollte er vorausgewählt sein');
  if ($('setup-start').value !== '0') throw new Error('nicht Platz 1: ' + $('setup-start').value);
});
step('Doppelte Zivilisation bekommt eine andere Zivilisationsfarbe, keine Schattierung', () => {
  const setze = (i, k) => {
    const el = [...$('setup-list').children][i].querySelector('[data-civpick]');
    el.value = k; el.onchange();
  };
  ['griechenland', 'griechenland', 'england', 'wikinger'].forEach((k, i) => setze(i, k));
  const cfg = G('startPlayers')();
  const farben = cfg.map(p => G('civOf')(p).color);
  const civFarben = CIVS_TEST().map(c => c.color);
  if (new Set(farben).size !== 4) throw new Error('Farben nicht eindeutig: ' + farben.join(','));
  if (!farben.every(f => civFarben.includes(f)))
    throw new Error('keine Zivilisationsfarbe: ' + farben.join(','));
  if (farben[0] !== CIV_BY_KEY_TEST('griechenland').color)
    throw new Error('das erste Griechenland behält sein Blau nicht');
  console.log('       ' + cfg.map(p => (p.name || p.civ) + ' ' + G('civOf')(p).color).join(' · '));
});
step('Technologiebogen: „hat sie" und „könnte sie" sind zu unterscheiden', () => {
  frischesSpiel();
  const S = G('S');
  // Ein zweiter Mensch, damit die Möglichkeit-Marken überhaupt gezeigt werden – und zwar
  // einer, der noch Bot ist (die Reihenfolge im Spiel folgt der Zugfolge, nicht dem Aufbau)
  const zweiter = S.players.findIndex(p => p.kind === 'bot');
  if (zweiter < 0) throw new Error('kein Bot zum Umstellen');
  S.players[zweiter].kind = 'human';
  S.players[zweiter].techs.rad = true;
  S.players[zweiter].avail.schrift = true;
  if (G('humanCount')(S) !== 2) throw new Error('nicht zwei Menschen im Spiel');
  G('techModal')();
  const hat = $('ov-body').querySelectorAll('.owner-mark.has');
  const kann = $('ov-body').querySelectorAll('.owner-mark.can');
  if (!hat.length) throw new Error('keine „hat sie"-Marke');
  if (!kann.length) throw new Error('keine „könnte sie"-Marke');
  // gefüllt gegen leer: die Füllfarbe unterscheidet sich
  const gefuellt = [...hat].every(m => /background:#/.test(m.getAttribute('style')));
  const leer = [...kann].every(m => !/background:#/.test(m.getAttribute('style')));
  if (!gefuellt) throw new Error('„hat sie" ist nicht ausgefüllt');
  if (!leer) throw new Error('„könnte sie" ist ausgefüllt');
  if (![...kann].every(m => m.querySelector('i'))) throw new Error('kein Fragezeichen an der Möglichkeit');
  if (!$('ov-body').querySelector('.owner-legend')) throw new Error('keine Legende mit Beispielmarken');
  console.log(`       ${hat.length} × hat, ${kann.length} × könnte, Legende vorhanden`);
  G('closeModal')();
});
step('Sprachwechsel im Menü: zwei Flaggen, Deutsch als Vorgabe', () => {
  G('show')('screen-menu');
  const flaggen = [...$('m-lang').querySelectorAll('[data-lang]')];
  if (flaggen.length !== 2) throw new Error(flaggen.length + ' Flaggen statt zwei');
  if (flaggen[0].dataset.lang !== 'de' || !flaggen[0].classList.contains('on'))
    throw new Error('Deutsch ist nicht die Vorgabe');
  const deutsch = $('m-new').textContent;
  flaggen[1].onclick();                       // auf Englisch
  if (G('LANG') !== 'en') throw new Error('Sprache nicht gewechselt');
  if ($('m-new').textContent === deutsch) throw new Error('Menütext unverändert');
  if ($('m-new').textContent !== 'New game') throw new Error('Menü: ' + $('m-new').textContent);
  if (window.document.documentElement.lang !== 'en') throw new Error('lang-Attribut nicht gesetzt');
  if (!$('m-lang').querySelector('[data-lang=en]').classList.contains('on'))
    throw new Error('die englische Flagge ist nicht hervorgehoben');
  // Spielobjekte tragen jetzt englische Namen
  if (G('TECH_BY_KEY').schrift.n !== 'Writing') throw new Error('Technologien nicht übersetzt');
  if (G('TERRAIN').G.name !== 'Grassland') throw new Error('Gelände nicht übersetzt');
  console.log('       ' + [...$('#screen-menu') ? [] : []].concat(
    [...window.document.querySelectorAll('#screen-menu .menu-actions button')]
      .map(b => b.textContent.trim())).join(' · '));
});
step('Englischer Aufbau und englische Partie', () => {
  $('m-new').onclick();
  const texte = [...window.document.querySelectorAll('#screen-setup label span')].map(e => e.textContent.trim());
  if (!texte.includes('Map')) throw new Error('Aufbau nicht übersetzt: ' + texte.join(','));
  if (![...$('setup-list').children[0].querySelectorAll('[data-kind]')].some(b => b.textContent === 'Human'))
    throw new Error('Mensch/Bot nicht übersetzt');
  $('setup-map').value = '0'; $('setup-map').onchange();
  [1, 2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
  $('setup-go').onclick();
  const S = G('S');
  if (!S || S.over) throw new Error('kein englisches Spiel gestartet');
  if (!/^Round 1/.test($('hud-round').textContent))
    throw new Error('Kopfzeile: ' + $('hud-round').textContent);
  G('techModal')();
  const kacheln = [...$('ov-body').querySelectorAll('.tech b')].map(b => b.textContent);
  if (!kacheln.includes('Writing')) throw new Error('Technologiebogen nicht übersetzt');
  const theo = [...$('ov-body').querySelectorAll('.tech')].find(b => /Theology/.test(b.textContent));
  if (theo && !/of the population/.test(theo.textContent))
    throw new Error('Wirkungstext nicht übersetzt: ' + theo.textContent);
  G('closeModal')();
  console.log('       ' + kacheln.slice(0, 6).join(' · '));
});
step('Protokoll schreibt neue Zeilen auf Englisch', () => {
  const S = G('S');
  const vorher = S.log.length;
  G('log')(S, 'act', G('T')('%s: Stadt wächst auf %s.', 'Test', 3));
  const zeile = S.log[S.log.length - 1].m;
  if (!/city grows to/.test(zeile)) throw new Error('Protokollzeile nicht englisch: ' + zeile);
  S.log.length = vorher;
  console.log('       ' + zeile);
});
step('Deutsche Reste im englischen Modus zählen (Ratsche)', () => {
  // Was noch nicht übersetzt ist, soll sichtbar bleiben statt sich zu verstecken.
  // Die Zahl darf sinken, aber nicht steigen.
  const DE = /[äöüßÄÖÜ]|\b(der|die|das|und|nicht|kein|keine|eine|einen|mit|für|von|zum|zur|auf|Stadt|Armee|Runde|Zug|Feld|Karte|Reich|Bevölkerung|Nahrung|Münzen|Wissenschaft|Macht|wird|werden|schon|noch|dein|deine)\b/;
  const rest = new Set();
  // Nur der sichtbare Bildschirm und das offene Fenster/Blatt zählen: versteckte
  // Bildschirme tragen noch den Text, mit dem sie zuletzt gezeichnet wurden – der wird
  // beim nächsten Öffnen ohnehin neu erzeugt.
  const sammle = () => {
    const orte = [...window.document.querySelectorAll('.screen.show, #overlay.show, #sheet.show')];
    orte.forEach(ort => {
      const w = window.document.createTreeWalker(ort, 4);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.nodeValue || '').trim().replace(/\s+/g, ' ');
        if (t.length < 3 || !DE.test(t)) continue;
        // Versteckte Teile zählen nicht: ihr Text ist der vom letzten Zeichnen und
        // wird beim nächsten Öffnen neu erzeugt.
        if (n.parentElement && n.parentElement.closest('[hidden]')) continue;
        // Protokollzeilen, die vor dem Sprachwechsel geschrieben wurden, bleiben in der
        // Sprache von damals – das Protokoll ist ein Mitschrieb, kein Anzeigetext.
        // Neue Zeilen kommen in der neuen Sprache; geprüft wird das im Schritt davor.
        if (n.parentElement && n.parentElement.closest('.logline, .lsum, .rolls, #logbox')) continue;
        rest.add(t.slice(0, 60));
      }
    });
  };
  sammle();
  G('techModal')(); sammle(); G('closeModal')();
  $('a-info').onclick(); sammle(); G('closeModal')();
  $('a-log').onclick(); sammle(); G('closeSheet')();
  G('rulesModal')(); sammle(); G('closeModal')();
  // Menü, Aufbau, Blätter, Protokoll, Regelbogen, Editor und Tutorial sind übersetzt.
  // Die Grenze steht knapp über 0, damit ein neuer deutscher Text sofort auffällt.
  const OBERGRENZE = 2;
  if (rest.size > OBERGRENZE)
    throw new Error(`${rest.size} deutsche Textstellen (Grenze ${OBERGRENZE}): ` +
      [...rest].slice(0, 6).join(' | '));
  console.log(`       noch deutsch: ${rest.size} Textstellen (Grenze ${OBERGRENZE}) – ` +
    'die Oberfläche ist vollständig übersetzt');
  // zurück auf Deutsch für die folgenden Schritte
  G('switchLang')('de');
  if (G('LANG') !== 'de') throw new Error('Rückschalten fehlgeschlagen');
  if ($('m-new').textContent !== 'Neues Spiel') throw new Error('Menü nicht wieder deutsch');
});
step('Tutorial: die ersten Aufgaben lassen sich auch auf Englisch lösen', () => {
  // Gemeldeter Fehler: auf Englisch war „Stadt gründen" gesperrt und das Tutorial hing
  // bei 4/29. Ursache: das Tutorial prüft Beschriftungen mit deutschen Ausdrücken, die
  // Knöpfe trugen aber den übersetzten Text. Jetzt zählt data-label (deutscher Schlüssel).
  const teste = sprache => {
    G('switchLang')(sprache);
    G('tutorialStart')();
    for (let i = 0; i < 3; i++) G('tutMove')(1);          // drei Lesetexte
    if (G('ui').tut.i !== 3) throw new Error(sprache + ': nicht bei Schritt 4');
    const ziel = G('tutStep')().allow.hex()[0];
    G('closeSheet')();                       // ein Blatt aus einem früheren Schritt weg
    if ($('sheet').classList.contains('open'))
      throw new Error(sprache + ': altes Blatt lässt sich nicht schließen (botLock?)');
    $('a-found').onclick();                  // v75: Gründen ist eine eigene Aktion der Leiste
    G('tapHex')(ziel[0], ziel[1]);
    if (!$('sheet').classList.contains('open'))
      throw new Error(sprache + ': Blatt öffnet nicht · Spieler ' +
        G('P')(G('S')).kind + ' · over ' + !!G('S').over);
    const knopf = [...$('sheet-body').querySelectorAll('.opt')]
      .find(b => b.dataset.label === 'Hier gründen');
    if (!knopf) throw new Error(sprache + ': kein Gründen-Knopf mit deutschem Schlüssel');
    if (knopf.disabled) throw new Error(sprache + ': Gründen ist gesperrt');
    const vorher = G('S').cities.length;
    knopf.onclick();
    if (G('S').cities.length !== vorher + 1) throw new Error(sprache + ': keine Stadt gegründet');
    const neu = G('cityAt')(G('S'), ziel[0], ziel[1]);
    if (!neu || neu.owner !== G('RU')()) throw new Error(sprache + ': Stadt nicht auf dem goldenen Feld');
    // erledigte Aufgaben schalten selbst weiter
    if (G('ui').tut.i !== 4) throw new Error(sprache + ': bleibt bei Schritt ' + (G('ui').tut.i + 1));
    G('tutorialQuit')();
    return (knopf.querySelector('span') || knopf).firstChild.textContent.trim();
  };
  const de = teste('de'), en = teste('en');
  G('switchLang')('de');
  if (de === en) throw new Error('die Beschriftung wechselt nicht: ' + de);
  console.log(`       Schritt 4 gelöst · Knopf deutsch „${de}", englisch „${en}"`);
});
step('Tutorial: auch der Straßenschritt geht auf Englisch', () => {
  // Zweiter Fall desselben Fehlers: die Straßenknöpfe hießen auf Englisch „Build road"
  // und passten nicht mehr zum Ausdruck /Straße bauen/.
  const bis = (sprache) => {
    G('switchLang')(sprache);
    G('tutorialStart')();
    const N = G('TUT_STEPS').length;
    for (let g = 0; g < 200; g++) {
      const st = G('tutStep')();
      const labels = (st.allow && st.allow.labels || []).map(String).join(' ');
      if (/Straße bauen/.test(labels)) return st;
      if (!G('tutDone')()) {
        if (!st.auto) throw new Error(sprache + ': Schritt ' + (G('ui').tut.i + 1) + ' ohne auto()');
        st.auto(); G('redraw')();
        continue;
      }
      if (G('ui').tut.i >= N - 1) throw new Error(sprache + ': Straßenschritt nicht gefunden');
      G('tutMove')(1);
    }
    throw new Error(sprache + ': zu viele Runden');
  };
  for (const sprache of ['de', 'en']) {
    const st = bis(sprache);
    const feld = st.allow.hex()[0];
    G('closeSheet')();
    G('tapHex')(feld[0], feld[1]);
    const knopf = [...$('sheet-body').querySelectorAll('.opt')]
      .find(b => b.dataset.label === 'Straße bauen');
    if (!knopf) throw new Error(sprache + ': kein Straßenknopf');
    if (knopf.disabled) throw new Error(sprache + ': Straße bauen ist gesperrt');
    const vorher = Object.keys(G('S').roads || {}).length;
    knopf.onclick();
    if (Object.keys(G('S').roads || {}).length !== vorher + 1)
      throw new Error(sprache + ': keine Straße gebaut');
    G('tutorialQuit')();
  }
  G('switchLang')('de');
  console.log('       Straßenschritt in beiden Sprachen baubar');
});
step('Ausgeloste Fähigkeit ist im Spiel ablesbar', () => {
  // Wer Zivilisation oder Fähigkeit auslosen lässt, muss im Spiel nachsehen können,
  // was dabei herausgekommen ist – vorher stand das nirgends.
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = '0'; $('setup-map').onchange();
  const sel = $('setup-list').children[0].querySelector('[data-abil]');
  sel.value = 'zufall'; sel.onchange();
  [1, 2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
  $('setup-go').onclick();
  const S = G('S');
  const ich = S.players.findIndex(p => p.kind !== 'bot');
  const a = G('abilInfo')(S.players[ich]);
  if (!a) throw new Error('keine Fähigkeit ermittelt');
  if (a.k === 'zufall') throw new Error('Zufall nicht aufgelöst');
  // Kopfzeile
  const chip = $('hud-name').querySelector('.hud-abil');
  if (!chip) throw new Error('keine Fähigkeit in der Kopfzeile');
  if (chip.textContent !== a.n) throw new Error('Kopfzeile zeigt ' + chip.textContent);
  if (!chip.getAttribute('title')) throw new Error('kein Wirkungstext als Titel');
  // Weltblatt: alle Reiche mit Fähigkeit
  G('worldModal')();
  const rows = [...$('ov-body').querySelectorAll('.civ-row')];
  if (rows.length !== S.players.filter(p => p.kind !== 'barbar').length)
    throw new Error(rows.length + ' Zeilen im Weltblatt');
  const meine = rows.find(r => r.classList.contains('self'));
  if (!meine) throw new Error('das eigene Reich ist nicht hervorgehoben');
  if (!meine.textContent.includes(a.n)) throw new Error('Fähigkeit fehlt im Weltblatt');
  if (!rows.some(r => /keine Fähigkeit/.test(r.textContent)))
    throw new Error('bei Bots fehlt der Hinweis');
  G('closeModal')();
  // und auf Englisch. Achtung: a ist das Objekt aus CIVS, dessen n beim Sprachwechsel
  // mitwandert – der deutsche Name muss vorher als Zeichenkette festgehalten werden.
  const de = String(a.n);
  G('switchLang')('en'); G('redraw')();
  const en = $('hud-name').querySelector('.hud-abil').textContent;
  if (en === de) throw new Error('Fähigkeitsname wechselt die Sprache nicht: ' + en);
  G('switchLang')('de'); G('redraw')();
  console.log(`       ausgelost: ${de} · englisch: ${en}`);
});
step('Drei Reiche im Aufbau', () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=drei]').onclick();
  // auf einer festen Karte sitzt jede Zivilisation genau einmal
  $('setup-map').value = '0'; $('setup-map').onchange();
  const slots = [...$('setup-list').children];
  if (slots.length !== 3) throw new Error('nicht drei Plätze, sondern ' + slots.length);
  const civs = slots.map(x => x.dataset.civ);
  if (new Set(civs).size !== 3) throw new Error('zweimal dieselbe Zivilisation: ' + civs.join(','));
  // Kollision auflösen: Platz 1 auf die Zivilisation von Platz 2 setzen
  const picks = slots.map(x => x.querySelector('[data-civpick]'));
  picks[0].value = civs[1]; picks[0].onchange();
  const jetzt = [...$('setup-list').children].map(x => x.dataset.civ);
  if (new Set(jetzt).size !== 3) throw new Error('Kollision nicht aufgelöst: ' + jetzt.join(','));
  const karten = [...$('setup-map').options].map(o => o.text);
  if (!karten.some(k => /9 (Dreiecke|triangles)/.test(k)))
    throw new Error('keine 9er-Plättchenkarte: ' + karten);
  console.log('       ' + jetzt.join(' · ') + ' | ' + karten.join(' · '));
});
step('Drei Reiche spielen auf der Plättchenkarte', () => {
  [...$('setup-list').children].slice(1).forEach(x => x.querySelector('[data-kind="bot"]').onclick());
  $('setup-list').children[0].querySelector('[data-kind="human"]').onclick();
  $('setup-map').value = 'plaettchen'; $('setup-map').onchange();
  $('setup-go').onclick();
  const st = G('placeState');
  if (st.queue.length !== 1) throw new Error('nicht genau ein Mensch in der Warteschlange');
  if (st.plan.seats.filter(x => x.cell != null).length !== 2)
    throw new Error('die Bots haben nicht schon gelegt');
  const rcs = legeHelfer.rcs(), frei = legeHelfer.frei();
  const gut = frei.indexOf(true);
  G('plTap')(rcs[gut][0], rcs[gut][1]);
  G('placeConfirm')();          // legt und deckt auf
  G('placeConfirm')();          // Spiel beginnen
  const S = G('S');
  if (S.players.length !== 3) throw new Error('nicht drei Reiche im Spiel');
  if (S.cities.length !== 3) throw new Error('nicht drei Hauptstädte');
  if (S.duel) throw new Error('Duellregeln bei drei Reichen');
  if ($('map').querySelectorAll('[data-r]').length !== 135)
    throw new Error('das große Dreieck hat nicht 135 Felder');
  console.log('       ' + S.map.name + ' · ' + S.map.rows.length + ' × ' + S.map.rows[0].length);
});
/* ============================================ Techtree (v82)
   Der frühere „alternative Techtree" ist der einzige: Mathematik 1 … Schrift 4,
   Bewässerung 1 … Landwirtschaft 5, Chemie 11, Biologie 12, Wiss. Methode 15. Keine Zeile
   mehr im Aufbau. Der alte (bis v81 Standard) lebt nur im Tutorial weiter – und in
   Partien, die vor v82 mit ihm begonnen wurden. */
// Spalten des Bogens: je Zeitalter vier (Forschung, Produktion, Militär, Spezial)
const bogenSpalte = i => [...$('ov-body').querySelectorAll('.techgrid .techcol')[i].querySelectorAll('.tech')]
  .map(b => [b.querySelector('b').textContent, b.querySelector('.c').textContent]);
const techNamen = keys => keys.map(k => G('TECH_BY_KEY')[k].n).join(', ');
// Wirkungstext der Kachel einer Technologie im offenen Bogen
const kachelText = k => {
  const n = G('TECH_BY_KEY')[k].n;
  const kachel = [...$('ov-body').querySelectorAll('.techgrid .tech')].find(b => b.querySelector('b').textContent === n);
  return kachel ? kachel.querySelector('.eff').textContent : null;
};
/* Ein herrenloses Feld über das Aktionsblatt kaufen: der Mensch ist am Zug, hat
   Kolonialismus und 10 Münzen. Zurück kommen Knopfpreis und abgebuchte Münzen; danach
   ist die Ausgangslage wiederhergestellt. */
const feldKaufen = () => {
  const S = G('S'), pi = S.players.findIndex(q => q.kind === 'human'), p = S.players[pi];
  S.cur = pi;                                   // der Mensch handelt, nicht ein Bot
  const cap = G('capitalOf')(S, pi);
  p.techs.kolonialismus = true; p.res.coins = 10;
  const frei = G('within')(cap.r, cap.c, 6).find(([r, c]) => G('terrainAt')(S, r, c) && !G('cityAt')(S, r, c) &&
    !G('armyAt')(S, r, c) && !S.players.some((_, i) => G('controlledTiles')(S, i).has(G('key')(r, c))));
  if (!frei) throw new Error('kein herrenloses Feld gefunden');
  G('tapHex')(frei[0], frei[1]);
  const knopf = $('sheet-body').querySelector('.opt[data-label="Feld kaufen"]');
  if (!knopf) throw new Error('kein Kaufknopf im Aktionsblatt');
  const preis = knopf.querySelector('.cost').textContent;
  knopf.onclick ? knopf.onclick() : knopf.click();
  const bezahlt = 10 - p.res.coins;
  if (!(S.bought[pi] || []).includes(G('key')(frei[0], frei[1]))) throw new Error('das Feld gehört danach nicht dem Reich');
  G('closeSheet')();
  delete p.techs.kolonialismus; S.bought[pi] = [];
  return [preis, bezahlt];
};
const NEU_FO = ['mathematik', 'astronomie', 'philosophie', 'schrift'];
const NEU_PR = ['bewaesserung', 'fischerei', 'rad', 'keramik', 'landwirtschaft'];
// Forschung/Industrialisierung – Spalte 8 im Bogen (Zeitalter 2 × 4 Felder + Forschung)
const NEU_FO2 = ['chemie', 'biologie', 'elektrizitaet', 'wiss_methode'];
const ALT_FO = ['schrift', 'mathematik', 'astronomie', 'philosophie'];
const ALT_PR = ['landwirtschaft', 'fischerei', 'rad', 'keramik', 'bewaesserung'];
const ALT_FO2 = ['wiss_methode', 'chemie', 'elektrizitaet', 'biologie'];
const vierReiche = () => {
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = '0'; $('setup-map').onchange();
  $('setup-list').children[0].querySelector('[data-kind="human"]').onclick();
  [1, 2, 3].forEach(i => $('setup-list').children[i].querySelector('[data-kind="bot"]').onclick());
};
// Bogen öffnen, ohne dass Münzen für Wissenschaft einspringen: dann steht auf jeder Kachel
// genau der Preis (v82 zeigt sonst, was tatsächlich abgeht – das prüft ein eigener Schritt).
const bogenMitWissenschaft = () => {
  const S = G('S'), p = S.players[S.cur], merk = Object.assign({}, p.res);
  p.res.sci = 999; $('a-tech').onclick(); p.res = merk;
};
step('Techtree (v82): keine Zeile mehr im Aufbau', () => {
  $('m-new').onclick();
  vierReiche();
  if ($('setup-alttree-row') || $('setup-alttree')) throw new Error('die Zeile „Alternativer Techtree" steht noch im Aufbau');
  if (/Techtree/i.test($('screen-setup').textContent)) throw new Error('der Aufbau nennt noch einen Techtree');
});
step('Techtree: der Bogen zeigt die Leitern nach den Kosten des (einzigen) Techtrees', () => {
  $('setup-go').onclick();
  const S = G('S');
  if (S.oldTree !== false || 'altTree' in S) throw new Error('neue Partie: oldTree ' + S.oldTree + ', altTree ' + S.altTree);
  bogenMitWissenschaft();
  const fo = bogenSpalte(0), pr = bogenSpalte(1);
  if (fo.map(x => x[0]).join(', ') !== techNamen(NEU_FO)) throw new Error('Forschung/Antike: ' + fo.map(x => x.join(' ')).join(', '));
  if (pr.map(x => x[0]).join(', ') !== techNamen(NEU_PR)) throw new Error('Produktion/Antike: ' + pr.map(x => x.join(' ')).join(', '));
  // Auf der Kachel steht, was die Regelmaschine verlangt – und es steigt die Leiter hinauf
  const pi = S.cur;
  const soll = G('techsIn')(0, 0, S).map(t => String(G('techCost')(S, pi, t))).join();
  if (fo.map(x => x[1]).join() !== soll) throw new Error('Kachelkosten ' + fo.map(x => x[1]) + ' ≠ Rechnung ' + soll);
  const fo2 = bogenSpalte(8);
  if (fo2.map(x => x[0]).join(', ') !== techNamen(NEU_FO2))
    throw new Error('Forschung/Industrialisierung: ' + fo2.map(x => x.join(' ')).join(', '));
  const soll2 = NEU_FO2.map(k => String(G('techCost')(S, pi, G('TECH_BY_KEY')[k]))).join();
  if (fo2.map(x => x[1]).join() !== soll2) throw new Error('Kachelkosten ' + fo2.map(x => x[1]) + ' ≠ Rechnung ' + soll2);
  for (let s = 0; s < 16; s++) {
    const k = bogenSpalte(s).map(x => +x[1]).filter(n => !isNaN(n));
    if (k.some((n, i) => i && n < k[i - 1])) throw new Error('Spalte ' + s + ' fällt: ' + k.join(','));
  }
  const ko = kachelText('kolonialismus'), ku = kachelText('kundschafterei');
  if (ko !== 'Für 3 Münzen Feld kaufen') throw new Error('Kolonialismus-Kachel: ' + ko);
  if (ku !== 'Tech kopieren (2× Kosten in Münzen)') throw new Error('Kundschafterei-Kachel: ' + ku);
  G('closeModal')();
  console.log('       Forschung: ' + fo.map(x => x.join(' ')).join(', '));
  console.log('       Produktion: ' + pr.map(x => x.join(' ')).join(', '));
  console.log('       Forschung/Industrialisierung: ' + fo2.map(x => x.join(' ')).join(', '));
});
step('Techtree: Feld kaufen kostet im Aktionsblatt 3 Münzen', () => {
  const [preis, bezahlt] = feldKaufen();
  if (preis !== '3🪙' || bezahlt !== 3) throw new Error(`Knopf ${preis}, bezahlt ${bezahlt}`);
  console.log('       Knopf ' + preis + ', abgebucht ' + bezahlt);
});
step('Techtree: Regelbogen mit den Kosten, kein Hinweis auf einen anderen Techtree', () => {
  G('rulesModal')();
  const zeilen = [...$('ov-body').querySelectorAll('.rule-tech')]
    .map(d => [d.querySelector('b').textContent, d.querySelector('.c').textContent]);
  const K = G('TECH_BY_KEY'), reihe = zeilen.map(z => z[0]);
  const kosten = ['schrift', 'mathematik', 'landwirtschaft', 'bewaesserung']
    .map(k => (zeilen.find(z => z[0] === K[k].n) || [])[1]).join();
  if (kosten !== '4,1,5,1') throw new Error('Regelbogen zeigt ' + kosten);
  if (reihe.indexOf(K.mathematik.n) > reihe.indexOf(K.schrift.n)) throw new Error('Regelbogen: Schrift vor Mathematik');
  if (reihe.indexOf(K.bewaesserung.n) > reihe.indexOf(K.landwirtschaft.n)) throw new Error('Regelbogen: Landwirtschaft vor Bewässerung');
  const kosten2 = ['wiss_methode', 'chemie', 'biologie']
    .map(k => (zeilen.find(z => z[0] === K[k].n) || [])[1]).join();
  if (kosten2 !== '15,11,12') throw new Error('Regelbogen zeigt für Wiss. Methode/Chemie/Biologie ' + kosten2);
  const pos = NEU_FO2.map(k => reihe.indexOf(K[k].n));
  if (pos.some((x, i) => x < 0 || (i && x < pos[i - 1]))) throw new Error('Regelbogen: Industrialisierung nicht nach Kosten');
  if (/Techtree/.test($('ov-body').textContent)) throw new Error('Regelbogen nennt einen Techtree');
  G('closeModal')();
  $('a-info').onclick();
  if (/Techtree/.test($('ov-body').textContent)) throw new Error('Weltblatt nennt einen Techtree');
  G('closeModal')();
  if (/Techtree/.test(G('S').log[0].m)) throw new Error('Protokollkopf: ' + G('S').log[0].m);
  console.log('       Regelbogen Schrift/Mathematik/Landwirtschaft/Bewässerung: ' + kosten +
    ' · Wiss. Methode/Chemie/Biologie: ' + kosten2);
});
step('Techtree: „Nochmal spielen" – auch ein Rezept aus v70–v81 mit altTree gibt den heutigen', () => {
  const rec = G('S').recipe;
  if (!rec || 'altTree' in rec) throw new Error('das Rezept trägt noch einen Schalter');
  G('startFromRecipe')(rec);
  if (G('S').oldTree !== false) throw new Error('die neue Partie läuft im alten Techtree');
  for (const schalter of [false, true]) {
    const alt = JSON.parse(JSON.stringify(rec)); alt.altTree = schalter;       // Rezept aus v70–v81
    G('startFromRecipe')(alt);
    if (G('S').oldTree !== false) throw new Error('Rezept mit altTree ' + schalter + ': alter Techtree');
  }
});
step('Techtree: auch der Bogen in der Legephase – und die Partie danach', () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=duell]').onclick();       // Duell: immer Plättchen
  $('setup-list').children[0].querySelector('[data-kind="human"]').onclick();
  $('setup-list').children[1].querySelector('[data-kind="bot"]').onclick();
  $('setup-go').onclick();
  if (!$('screen-place').classList.contains('show')) throw new Error('keine Legephase');
  $('pl-tech').onclick();
  const fo = bogenSpalte(0).map(x => x[0]).join(', ');
  if (fo !== techNamen(NEU_FO)) throw new Error('Legephase: ' + fo);
  const fo2 = bogenSpalte(8).map(x => x[0]).join(', ');
  if (fo2 !== techNamen(NEU_FO2)) throw new Error('Legephase, Industrialisierung: ' + fo2);
  G('closeModal')();
  const rcs = legeHelfer.rcs(), frei = legeHelfer.frei();
  const gut = frei.indexOf(true);
  G('plTap')(rcs[gut][0], rcs[gut][1]);
  G('placeConfirm')(); G('placeConfirm')();
  if (!$('screen-game').classList.contains('show')) throw new Error('das Spiel beginnt nicht');
  if (G('S').oldTree !== false) throw new Error('nach dem Legen läuft die Partie im alten Techtree');
  console.log('       Legephase: ' + fo);
});
step('Alter Techtree: eine Partie von v81 läuft mit ihm weiter – Bogen, Regelbogen und Weltblatt sagen es', () => {
  $('m-new').onclick();
  vierReiche();
  $('setup-go').onclick();
  // Spielstand wie aus v81 im damaligen Standard: kein oldTree, altTree false
  const v81 = JSON.parse(JSON.stringify(G('S')));
  delete v81.oldTree; v81.altTree = false;
  G('store')('hochciv.save', v81);
  G('show')('screen-menu');
  $('m-continue').onclick();
  const S = G('S');
  if (S.oldTree !== true || 'altTree' in S) throw new Error('geladen: oldTree ' + S.oldTree + ', altTree ' + S.altTree);
  bogenMitWissenschaft();
  const fo = bogenSpalte(0).map(x => x[0]).join(', '), pr = bogenSpalte(1).map(x => x[0]).join(', ');
  const fo2 = bogenSpalte(8).map(x => x[0]).join(', ');
  G('closeModal')();
  if (fo !== techNamen(ALT_FO) || pr !== techNamen(ALT_PR) || fo2 !== techNamen(ALT_FO2))
    throw new Error('Bogen: ' + [fo, pr, fo2].join(' | '));
  G('rulesModal')();
  const regeln = $('ov-body').textContent;
  G('closeModal')();
  if (!/noch der alte Techtree/.test(regeln)) throw new Error('kein Hinweis im Regelbogen');
  $('a-info').onclick();
  const welt = $('ov-body').textContent;
  G('closeModal')();
  if (!/Alter Techtree · Schrift 1, Mathematik 2/.test(welt)) throw new Error('Weltblatt nennt ihn nicht');
  // auf Englisch ebenso
  G('switchLang')('en');
  $('a-info').onclick();
  const weltEn = $('ov-body').textContent;
  G('closeModal')();
  G('switchLang')('de');
  if (!/Old tech tree · /.test(weltEn)) throw new Error('englisches Weltblatt: ' + weltEn.slice(0, 120));
  console.log('       Forschung: ' + fo);
});
step('Alter Techtree: das Tutorial läuft mit ihm – ohne Hinweis für Neulinge', () => {
  G('tutorialStart')();
  const S = G('S');
  if (S.oldTree !== true) throw new Error('Tutorial im neuen Techtree');
  bogenMitWissenschaft();
  const fo = bogenSpalte(0).map(x => x[0]).join(', ');
  G('closeModal')();
  if (fo !== techNamen(ALT_FO)) throw new Error('Tutorial-Bogen: ' + fo);
  G('rulesModal')();
  const regeln = $('ov-body').textContent;
  G('closeModal')();
  if (/Techtree/.test(regeln)) throw new Error('der Regelbogen erwähnt im Tutorial einen Techtree');
  G('tutorialQuit')();
  console.log('       Tutorial: ' + fo);
});

/* ============================================ Kosten am Knopf (v82)
   Ab Werk zeigen die Knöpfe, was tatsächlich abgeht: Gründen für 10 Nahrung mit 8 im
   Vorrat zeigt „8🌾 4🪙". In den Einstellungen („Kosten ohne Umtausch anzeigen") wieder
   nur der Preis. Reicht es nicht oder wird nichts umgetauscht, steht der Preis da. */
step('Kosten (v82): das Beispiel des Autors – 10 Nahrung mit 8 im Vorrat zeigt 8🌾 4🪙', () => {
  $('m-new').onclick(); vierReiche(); $('setup-go').onclick();
  const S = G('S'), p = S.players[S.cur], kt = G('costText');
  if (G('prefs').listPrice) throw new Error('ab Werk ist „Kosten ohne Umtausch" angehakt');
  p.res = { sci: 0, food: 8, coins: 10 };
  const fall = [
    [kt({ food: 10 }, '10🌾'), '8🌾 4🪙', 'Beispiel des Autors'],
    [kt({ food: 8 }, '8🌾'), '8🌾', 'genug Nahrung: der Preis'],
    [kt({ food: 13 }, '13🌾'), '8🌾 10🪙', 'alle Münzen'],
    [kt({ food: 14 }, '14🌾'), '14🌾', 'reicht nicht: der Preis'],
    [kt({ food: 2, coins: 3 }, '2🌾 3🪙'), '2🌾 3🪙', 'Wachstum ohne Umtausch'],
  ];
  p.res = { sci: 0, food: 1, coins: 10 };
  fall.push([kt({ food: 2, coins: 3 }, '2🌾 3🪙'), '1🌾 5🪙', 'Wachstum: fehlende Nahrung in Münzen, dazu die Münzkosten']);
  p.res = { sci: 1, food: 0, coins: 10 };
  fall.push([kt({ sci: 3 }, '3'), '1🔬 4🪙', 'Forschung: fehlende Wissenschaft in Münzen']);
  const falsch = fall.filter(([ist, soll]) => ist !== soll);
  if (falsch.length) throw new Error(falsch.map(([ist, soll, was]) => `${was}: „${ist}" statt „${soll}"`).join(' · '));
  // Die Anzeige ist dieselbe Rechnung wie das Bezahlen – und lässt den Vorrat in Ruhe
  p.res = { sci: 0, food: 8, coins: 10 };
  const bez = G('costPaid')(S, S.cur, { food: 10 });
  if (JSON.stringify(p.res) !== JSON.stringify({ sci: 0, food: 8, coins: 10 })) throw new Error('die Vorschau hat bezahlt');
  G('pay')(S, S.cur, 'food', 10);
  if (p.res.food !== 8 - bez.food || p.res.coins !== 10 - bez.coins) throw new Error('Bezahlen weicht von der Anzeige ab');
  // Einstellung: wieder nur der Preis
  G('prefs').listPrice = true;
  p.res = { sci: 0, food: 8, coins: 10 };
  const alt = kt({ food: 10 }, '10🌾');
  G('prefs').listPrice = false;
  if (alt !== '10🌾') throw new Error('mit „Kosten ohne Umtausch": ' + alt);
  console.log('       ' + fall.map(([ist, , was]) => was.split(':')[0] + ' ' + ist).join(' · '));
});
step('Kosten: Gründungsblatt, Karte, Bogen und Stadtblatt zeigen, was abgeht', () => {
  const S = G('S'), pi = S.cur, p = S.players[pi], cap = G('capitalOf')(S, pi);
  // Ein Platz, der mehr Nahrung kostet als da ist, aber mit Münzen bezahlbar bleibt
  p.res = { sci: 0, food: 2, coins: 60 };
  const plaetze = G('within')(cap.r, cap.c, 7).filter(([r, c]) => !G('foundSiteError')(S, pi, r, c));
  const ziel = plaetze.find(([r, c]) => G('foundCost')(S, pi, r, c) > 2);
  if (!ziel) throw new Error('kein Platz, der mehr als 2 Nahrung kostet');
  const kosten = G('foundCost')(S, pi, ziel[0], ziel[1]);
  const soll = `2🌾 ${(kosten - 2) * 2}🪙`;
  $('a-found').onclick();
  // Die Karte bleibt beim Preis – sie dient dem Vergleich der Plätze
  const mark = $('map').querySelector(`[data-rc="${ziel[0]}/${ziel[1]}"][data-found]`);
  if (mark.getAttribute('data-found') !== 'ja' || mark.nextSibling.textContent !== String(kosten))
    throw new Error('Karte: ' + mark.getAttribute('data-found') + ' ' + mark.nextSibling.textContent + ' statt ja ' + kosten);
  G('tapHex')(ziel[0], ziel[1]);
  const knopf = $('sheet-body').querySelector('[data-label="Hier gründen"]');
  if (knopf.querySelector('.cost').textContent !== soll) throw new Error('Gründungsblatt: ' + knopf.querySelector('.cost').textContent + ' statt ' + soll);
  // Mit der Einstellung: der Preis am Knopf
  G('prefs').listPrice = true;
  G('tapHex')(ziel[0], ziel[1]);
  const alt = $('sheet-body').querySelector('[data-label="Hier gründen"] .cost').textContent;
  G('prefs').listPrice = false;
  if (alt !== kosten + '🌾') throw new Error('ohne Umtausch: ' + alt);
  G('closeSheet')(); $('a-found').onclick();
  // Bogen: eine verfügbare Technologie, die mehr kostet als die Wissenschaft im Vorrat
  p.res = { sci: 1, food: 0, coins: 60 };
  const t = G('researchable')(S, pi).find(x => x.k !== 'singularitaet' && G('techCost')(S, pi, x) > 1);
  if (!t) throw new Error('keine passende Technologie verfügbar');
  const tk = G('techCost')(S, pi, t);
  $('a-tech').onclick();
  const kachel = [...$('ov-body').querySelectorAll('.techgrid .tech')].find(b => b.querySelector('b').textContent === t.n);
  const tsoll = `1🔬 ${(tk - 1) * 2}🪙`;
  if (kachel.querySelector('.c').textContent !== tsoll) throw new Error('Bogen: ' + kachel.querySelector('.c').textContent + ' statt ' + tsoll);
  // nicht verfügbare Kacheln behalten den Preis – dort wäre die Rechnung hypothetisch
  const gesperrt = [...$('ov-body').querySelectorAll('.techgrid .tech.locked .c')].map(x => x.textContent);
  if (!gesperrt.length || gesperrt.some(x => !/^\d+$/.test(x))) throw new Error('gesperrte Kacheln: ' + gesperrt.slice(0, 5).join(', '));
  G('closeModal')();
  // Stadtblatt: Wachstum mit zu wenig Nahrung
  p.res = { sci: 0, food: 0, coins: 60 };
  const preis = G('growPrice')(S, pi, cap);
  G('tapHex')(cap.r, cap.c);
  const wachsen = $('sheet-body').querySelector('[data-label="Bevölkerung wachsen"] .cost').textContent;
  const wsoll = preis.food ? `${preis.food * 2 + preis.coins}🪙` : `${preis.coins}🪙`;
  G('closeSheet')();
  if (!wachsen.endsWith(wsoll) || /🌾/.test(wachsen)) throw new Error('Wachsen: ' + wachsen + ' statt ' + wsoll);
  console.log(`       Gründen ${kosten}🌾 → ${soll} · ${t.n} ${tk} → ${tsoll} · Wachsen ${preis.food}🌾 ${preis.coins}🪙 → ${wachsen}`);
});
step('Kosten: die Einstellung „Kosten ohne Umtausch anzeigen" – ab Werk aus, gemerkt', () => {
  G('show')('screen-options'); G('optionsScreen')();
  const box = $('opt-listprice');
  if (!box || box.checked) throw new Error('Häkchen fehlt oder ist ab Werk gesetzt');
  box.checked = true; box.onchange();
  if (!G('prefs').listPrice || !(G('load')('hochciv.prefs') || {}).listPrice) throw new Error('nicht gemerkt');
  box.checked = false; box.onchange();
  if (G('prefs').listPrice || (G('load')('hochciv.prefs') || {}).listPrice) throw new Error('Abhaken nicht gemerkt');
  G('switchLang')('en');
  const zeile = box.closest('label').textContent.trim();
  G('switchLang')('de');
  if (zeile !== 'Show costs without exchange') throw new Error('englisch: ' + zeile);
  G('show')('screen-game');
});

step('Karteneditor zeigt Felder außerhalb der Karte', () => {
  G('__set')('customMap', null);
  $('m-editor').onclick();
  const felder = $('ed-map').querySelectorAll('[data-r]').length;
  const zeilen = G('__get')('editMap').rows;
  if (felder !== zeilen.length * zeilen[0].length)
    throw new Error('im Editor fehlen Felder: ' + felder);
  // ein Feld auf X setzen und wieder zurücknehmen
  G('__set')('edTool', 'X');
  G('edTap')(0, 0);
  if (G('__get')('editMap').rows[0][0] !== 'X') throw new Error('X lässt sich nicht setzen');
  if (!$('ed-map').querySelector('[data-r="0"][data-c="0"]'))
    throw new Error('ein X-Feld ist im Editor nicht mehr antippbar');
  G('__set')('edTool', 'G');
  G('edTap')(0, 0);
  if (G('__get')('editMap').rows[0][0] !== 'G') throw new Error('X lässt sich nicht zurücknehmen');
  G('show')('screen-menu');
});

/* ================================================ KI (js/ki.js, v77)
   Dritte Sitzart neben Mensch und Bot. Die KI spielt nach den Regeln für Menschen; hier
   wird die Oberfläche geprüft: Aufbau, Züge mit „Weiter", Legephase, Englisch und
   „Nochmal spielen" mit KI-Stufen. */
const kiAufbau = (mode, kinds, map) => {
  $('m-new').onclick();
  $('setup-mode').querySelector(`[data-mode=${mode}]`).onclick();
  if (map != null) { $('setup-map').value = map; $('setup-map').onchange(); }
  kinds.forEach((k, i) => $('setup-list').children[i].querySelector(`[data-kind="${k}"]`).onclick());
};
step('KI: Aufbau bietet Mensch, KI und Bot – Gegner sind ab Werk die KI', () => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  $('setup-map').value = '0'; $('setup-map').onchange();
  // frisch zeichnen, damit keine Wahl aus früheren Schritten stehen bleibt
  $('setup-list').innerHTML = ''; G('renderSlots')();
  const plaetze = [...$('setup-list').children];
  const arten = plaetze.map(x => [...x.querySelectorAll('[data-kind]')].map(b => b.dataset.kind).join('/'));
  if (!arten.every(a => a === 'human/ki/bot')) throw new Error('Sitzarten: ' + arten.join(' | '));
  const an = plaetze.map(x => x.querySelector('[data-kind].on').dataset.kind);
  if (an.join(',') !== 'human,ki,ki,ki') throw new Error('Vorgabe ist ' + an.join(','));
  if ($('setup-kilevel-row').hidden) throw new Error('KI-Stufe fehlt, obwohl KI am Tisch sitzt');
  if (!$('setup-diff-row').hidden) throw new Error('Bot-Schwierigkeit steht da, ohne dass ein Bot mitspielt');
  if ($('setup-kilevel').value !== G('KI_DEFAULT_LEVEL')) throw new Error('KI-Stufe ist nicht die Vorgabe');
  if (plaetze[1].querySelector('[data-abil]').disabled) throw new Error('die KI darf keine Fähigkeit wählen');
  plaetze[3].querySelector('[data-kind="bot"]').onclick();
  if ($('setup-diff-row').hidden) throw new Error('mit Bot am Tisch fehlt seine Schwierigkeit');
  if (!plaetze[3].querySelector('[data-abil]').disabled) throw new Error('Bots bekommen eine Fähigkeit');
  plaetze.slice(1).forEach(x => x.querySelector('[data-kind="human"]').onclick());
  if (!$('setup-kilevel-row').hidden || !$('setup-diff-row').hidden)
    throw new Error('ohne KI und Bots stehen ihre Zeilen noch da');
  const opt = [...$('setup-start').options].map(o => o.textContent);
  plaetze[1].querySelector('[data-kind="ki"]').onclick();
  if (![...$('setup-start').options].some(o => /\(KI\)/.test(o.textContent)))
    throw new Error('Startspieler-Liste nennt die KI nicht: ' + opt.join(','));
});
step('KI: Züge laufen über das Blatt mit „Weiter", dann ist wieder der Mensch dran', () => {
  kiAufbau('vier', ['human', 'ki', 'ki', 'ki'], '0');
  $('setup-start').value = '0'; $('setup-start').onchange();
  // Ohne Ereignisse (v83): Die Häkchen aus den Modulschritten stehen hier noch, und ein
  // Ereignis der ersten Runde lässt eine KI zu Recht untätig (gemessen: 23 von 600 ersten
  // KI-Zügen, in v82 mit denselben Startwerten genauso) – unten wird aber geprüft, dass jede
  // gehandelt hat. Der Schritt prüft den Ablauf mit „Weiter", nicht die Ereignisse.
  const mitEreignis = $('setup-events').checked;
  $('setup-events').checked = false; $('setup-events').onchange();
  $('setup-go').onclick();
  $('setup-events').checked = mitEreignis; $('setup-events').onchange();
  const S = G('S');
  if (AUTO(G('P')(S))) throw new Error('das Spiel beginnt nicht beim Menschen');
  const mensch = S.cur;
  $('a-end').onclick();
  let n = 0, titel = '';
  while (G('P')(G('S')).kind === 'ki' && !G('S').over && n++ < 6) {
    titel = $('sheet-body').querySelector('h3').textContent;
    if (!/\(KI\)/.test(titel)) throw new Error('Blatt nennt die KI nicht: ' + titel);
    if (!G('ui').botLock) throw new Error('Blatt während des KI-Zugs nicht gesperrt');
    if (!$('bot-next')) throw new Error('kein „Weiter"');
    // Kartenansichten (v75 des Autors) wie beim Bot-Zug: Erträge aus Sicht des Menschen,
    // kein Gründungsmodus
    if (G('viewerOf')(G('S')) !== mensch) throw new Error('beim KI-Zug zählen die Erträge der KI');
    if (!$('a-found').disabled) throw new Error('„Stadt gründen" ist im KI-Zug frei');
    $('a-found').onclick();
    if (G('ui').mode === 'found') throw new Error('Gründungsmodus im KI-Zug');
    $('bot-next').onclick();
  }
  if (!G('S').over && G('P')(G('S')).kind !== 'human') throw new Error('nach den KI-Zügen ist nicht der Mensch dran');
  // Jede KI hat in ihrem Zug gehandelt: geforscht, ist gewachsen oder hat gegründet. (Bis v77
  // stand hier „hat geforscht" – seit die Stufe Mittel Möglichkeiten übersieht (v78), lässt
  // sie im ersten Zug auch einmal die Forschung aus. Die Partie startet mit Zufallswert.)
  const kis = S.players.map((p, i) => i).filter(i => S.players[i].kind === 'ki');
  const tat = i => Object.keys(S.players[i].techs).length + G('citiesOf')(S, i).length - 1 + G('popOf')(S, i) - G('citiesOf')(S, i).length;
  if (!kis.every(i => tat(i) > 0)) throw new Error('eine KI hat in ihrem Zug nichts getan');
  if (S.armies.some(a => S.players[a.owner].kind === 'ki' && G('cityAt')(S, a.r, a.c)))
    throw new Error('eine KI-Armee steht noch in einer Stadt');
  console.log(`       ${n} KI-Züge · ` + kis.map(i => `${G('civOf')(S.players[i]).n}: ${Object.keys(S.players[i].techs).length} Techs, ${G('citiesOf')(S, i).length} Städte, ${G('popOf')(S, i)} Bev.`).join(', '));
});
/* Gesperrter Bildschirm (v80, gemeldet): der Mensch war am Zug, das Blatt eines KI-Zugs
   aber noch gesperrt – „Weiter" ohne Wirkung, Sheet nicht zu schließen. Auslöser nicht
   nachgestellt; geprüft wird, dass keiner der Wege dorthin mehr hängen bleibt. */
const kiTisch = () => {
  kiAufbau('vier', ['human', 'ki', 'ki', 'ki'], '0');
  $('setup-start').value = '0'; $('setup-start').onchange();
  $('setup-go').onclick();
  return G('S');
};
step('Sperre: „Zug beenden" wirkt nicht, solange das Blatt eines KI-Zugs offen ist', () => {
  const S = kiTisch();
  $('a-end').onclick();                               // Mensch beendet, erste KI zieht
  if (!G('ui').botLock || !$('bot-next')) throw new Error('kein gesperrtes KI-Blatt');
  const cur = S.cur, laenge = S.log.length;
  G('endHumanTurn')();                                // käme es doch durch: zweiter Kampf, Zug übersprungen
  if (S.cur !== cur || S.log.length !== laenge) throw new Error('Zug beenden lief während des KI-Blatts');
  while (AUTO(G('P')(S)) && !S.over && $('bot-next')) $('bot-next').onclick();
});
step('Sperre: beginnt der Zug des Menschen, ist ein übrig gebliebenes KI-Blatt weg', () => {
  const S = kiTisch();
  $('a-end').onclick();
  // der gemeldete Zustand: Mensch am Zug, KI-Blatt noch gesperrt
  let g = 0;
  while (AUTO(G('P')(S)) && g++ < 8) G('advanceTurn')(S);
  if (!G('ui').botLock || !$('sheet').classList.contains('locked')) throw new Error('Ausgangslage nicht hergestellt');
  G('humanTurnStart')();
  if (G('ui').botLock || $('sheet').classList.contains('locked') || $('sheet').classList.contains('open'))
    throw new Error('die Sperre steht noch');
  if ($('a-end').disabled) throw new Error('„Zug beenden" bleibt gesperrt');
});
step('Sperre: dieselbe KI zieht nicht zweimal (Neuladen mitten im KI-Blatt)', () => {
  const S = kiTisch();
  $('a-end').onclick();
  const ki = S.cur;
  const vorher = JSON.stringify(S.players[ki]) + S.armies.length + S.log.length;
  const zeilen = $('sheet-body').querySelectorAll('.logline, details').length;
  // wie nach einem Neuladen: derselbe Spielstand, runBots noch einmal
  G('runBots')();
  if (G('S').cur !== ki) throw new Error('der Zug ist weitergesprungen');
  if (JSON.stringify(S.players[ki]) + S.armies.length + S.log.length !== vorher) throw new Error('die KI hat ein zweites Mal gezogen');
  if ($('sheet-body').querySelectorAll('.logline, details').length !== zeilen) throw new Error('das Blatt zeigt nicht mehr, was sie getan hat');
  while (AUTO(G('P')(S)) && !S.over && $('bot-next')) $('bot-next').onclick();
});
step('Sperre: ein Fehler im KI-Zug hält das Spiel nicht an – er steht im Protokoll', () => {
  const S = kiTisch();
  const echt = G('kiTurn');
  window.__set('kiTurn', () => { throw new Error('Testfehler'); });
  const ce = console.error; console.error = () => { };   // der absichtliche Fehler muss nicht in die Ausgabe
  try { $('a-end').onclick(); }
  finally { window.__set('kiTurn', echt); console.error = ce; }
  if (!G('ui').botLock || !$('bot-next')) throw new Error('kein KI-Blatt nach dem Fehler');
  if (!/Interner Fehler.*Testfehler/.test($('sheet-body').textContent)) throw new Error('der Fehler steht nicht im Blatt');
  const fehler = G('UI_ERRORS').splice(0);
  if (fehler.length !== 1) throw new Error('UI_ERRORS: ' + fehler.join(' | '));
  while (AUTO(G('P')(S)) && !S.over && $('bot-next')) $('bot-next').onclick();
  if (!S.over && AUTO(G('P')(S))) throw new Error('danach geht es nicht weiter');
});
step('KI: in der Legephase legt die KI selbst, gefragt wird nur der Mensch', () => {
  kiAufbau('duell', ['human', 'ki']);
  $('setup-go').onclick();
  const st = G('placeState');
  if (!st) throw new Error('keine Legephase');
  if (st.queue.length !== 1) throw new Error(`${st.queue.length} Plätze warten statt einem`);
  const ki = st.plan.seats.find(seat => st.cfg.players[seat.idx].kind === 'ki');
  if (!ki || ki.cell == null) throw new Error('die KI hat nicht gelegt');
  if (!G('placeOptions')(st.plan, ki, ki.o)[ki.cell]) throw new Error('die KI liegt auf einem verbotenen Feld');
  const seat = G('placeSeatNow')();
  const rcs = G('slotRC')(st.plan, seat.slot), ok = G('placeOptions')(st.plan, seat, st.o);
  const i = ok.indexOf(true);
  G('plTap')(rcs[i][0], rcs[i][1]);
  G('placeConfirm')();            // aufdecken
  G('placeConfirm')();            // Spiel beginnen
  const S = G('S');
  if (!S || S.cities.length !== 2) throw new Error('das Spiel beginnt nicht mit zwei Hauptstädten');
  let n = 0;
  while (AUTO(G('P')(G('S'))) && !G('S').over && n++ < 3 && $('bot-next')) $('bot-next').onclick();
});
step('KI: auf Englisch heißen Sitzart, Stufe und Blatt „AI"', () => {
  G('switchLang')('en');
  G('clearMissing')();
  kiAufbau('vier', ['human', 'ki', 'ki', 'bot'], '0');
  const knoepfe = [...$('setup-list').children[1].querySelectorAll('[data-kind]')].map(b => b.textContent);
  if (!knoepfe.includes('AI')) throw new Error('Knopf nicht übersetzt: ' + knoepfe.join('/'));
  const stufen = [...$('setup-kilevel').options].map(o => o.textContent);
  if (stufen.join(',') !== 'Easy,Medium,Hard') throw new Error('Stufen: ' + stufen.join(','));
  const zeile = $('setup-kilevel-row').querySelector('span').textContent.trim();
  if (zeile !== 'AI level (all AI)') throw new Error('Zeile: ' + zeile);
  $('setup-start').value = '0'; $('setup-start').onchange();
  $('setup-go').onclick();
  $('a-end').onclick();
  let n = 0, titel = '';
  while (AUTO(G('P')(G('S'))) && !G('S').over && n++ < 6) {
    const h = $('sheet-body').querySelector('h3').textContent;
    if (G('P')(G('S')).kind === 'ki') titel = h;
    $('bot-next').onclick();
  }
  if (!/\(AI\)/.test(titel)) throw new Error('Blatt der KI: ' + titel);
  const fehlt = G('missingStrings')().filter(k => /KI|forscht|greift|verteidigt|flankiert|kauft|baut|gründet|opfert|kopiert|wächst|Rückschau|gratis/.test(k));
  if (fehlt.length) throw new Error('unübersetzt: ' + fehlt.join(' | '));
  G('switchLang')('de');
});
step('KI: „Nochmal spielen" nach einem Sieg eine KI-Stufe schwerer', () => {
  kiAufbau('vier', ['human', 'ki', 'ki', 'ki'], '0');
  $('setup-kilevel').value = 'leicht';
  $('setup-go').onclick();
  const S = G('S');
  const mensch = S.players.findIndex(p => p.kind === 'human');
  if (S.players.find(p => p.kind === 'ki').kiLevel !== 'leicht') throw new Error('Stufe aus dem Aufbau fehlt');
  G('claimVictory')(S, mensch, 'Wirtschaftssieg (Test)');
  let guard = 0;
  while (!G('S').over && guard++ < 8) G('endTurn')(S);
  G('gameOver')();
  const text = $('ov-body').textContent;
  if (!/schwerer: Mittel/.test(text)) throw new Error('kein Hinweis auf die nächste KI-Stufe: ' + text.slice(0, 160));
  $('go-again').onclick();
  const nachher = G('S').players.filter(p => p.kind === 'ki').map(p => p.kiLevel);
  if (!nachher.every(k => k === 'mittel')) throw new Error('nach dem Sieg: ' + nachher.join(','));
  console.log('       leicht → Sieg → ' + nachher[0]);
});

/* CIV_KEYS ist eine gemeinsame Liste, kein frisches Array je Aufruf. Der Aufbau
   schreibt an mehreren Stellen in Schlüssellisten (Doppelungen auflösen, Auslosung) –
   wer dort die gemeinsame Liste nimmt statt einer Kopie, verbiegt sie für die ganze
   Sitzung. Dieser Schritt kommt zuletzt, nachdem der Aufbau vielfach gelaufen ist. */
step('CIV_KEYS ist nach dem ganzen Durchlauf unverändert', () => {
  const ist = G('CIV_KEYS'), soll = G('CIVS').map(c => c.k);
  if (ist.join(',') !== soll.join(','))
    throw new Error('CIV_KEYS wurde verändert: ' + ist.join(',') + ' statt ' + soll.join(','));
});

/* Abgefangene Fehler im Zugablauf (sicher, v80) zählen hier mit: das Spiel läuft dann zwar
   weiter, aber ein Fehler bleibt ein Fehler. */
step('Kontrollzone: wer hineinzieht, hält an – Meldung, und das Blatt sagt warum (v80)', () => {
  const S = kiTisch(), pi = S.cur, feind = (pi + 1) % S.players.length;
  const nb = G('neighbors'), dist = G('hexDistance'), frei = (who, [r, c]) =>
    G('canStop')(S, who, r, c) && G('TERRAIN')[G('terrainAt')(S, r, c)].land;
  S.players[feind].techs.schiesspulver = true;
  // Wache W, Ziel B daneben, Start A zwei Felder von W entfernt – alles freies Land
  let lage = null;
  for (let r = 0; r < 40 && !lage; r++) for (let c = 0; c < 40 && !lage; c++) {
    if (!G('terrainAt')(S, r, c) || !frei(feind, [r, c])) continue;
    for (const B of nb(r, c)) {
      if (lage || !frei(pi, B)) continue;
      const A = nb(...B).find(x => dist(x[0], x[1], r, c) === 2 && frei(pi, x));
      if (A) lage = { W: [r, c], B, A };
    }
  }
  if (!lage) throw new Error('keine passende Lage auf der Karte');
  const a = { id: S.nextId++, owner: pi, r: lage.A[0], c: lage.A[1], mp: 3, born: 0 };
  S.armies.push(a, { id: S.nextId++, owner: feind, r: lage.W[0], c: lage.W[1], mp: 0, born: 0 });
  G('redraw')();
  G('tapHex')(...lage.A);
  const b = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Diese Armee bewegen/.test(x.textContent));
  if (!b || b.disabled) throw new Error('Armee nicht anwählbar');
  b.onclick();
  G('tapHex')(...lage.B);
  if (a.r !== lage.B[0] || a.c !== lage.B[1]) throw new Error('Armee ist nicht ins Zielfeld gezogen');
  if (!a.halted || a.mp !== 0) throw new Error('Armee hält in der Kontrollzone nicht an');
  if (!/Kontrollzone/.test($('toast').textContent)) throw new Error('keine Meldung: ' + $('toast').textContent);
  G('tapHex')(...lage.B);
  const b2 = [...$('sheet-body').querySelectorAll('.opt')].find(x => /Diese Armee bewegen/.test(x.textContent));
  if (!b2 || !b2.disabled || !/Kontrollzone/.test(b2.textContent)) throw new Error('Blatt: ' + (b2 ? b2.textContent : 'kein Knopf'));
  G('closeSheet')();
  console.log('       Wache ' + lage.W + ', Start ' + lage.A + ', angehalten auf ' + lage.B + ' · „' + $('toast').textContent + '"');
});
step('Regelbogen: Bewegung, Straßen, Eisenbahn und Kontrollzone (v81), auch auf Englisch', () => {
  G('rulesModal')();
  const de = $('ov-body').textContent.replace(/\s+/g, ' ');
  for (const t of ['Bewegung, Straßen und Eisenbahn', 'Kontrollzone (Schießpulver)',
    'Eisenbahn 2 Münzen, auf einer Straße 1', 'Die Luftwaffe ignoriert Kontrollzonen'])
    if (!de.includes(t)) throw new Error('fehlt: ' + t);
  // nach dem Absatz zur Nahrung, vor den Geländeerträgen; die Handelsrouten genau einmal
  const pos = ['Die Nahrungsproduktion', 'Bewegung, Straßen und Eisenbahn', 'Handelsrouten: jede eigene Stadt',
    'Kontrollzone (Schießpulver)', 'Geländeerträge je Feld'].map(t => de.indexOf(t));
  if (pos.some((x, i) => x < 0 || (i && x < pos[i - 1]))) throw new Error('Reihenfolge: ' + pos.join(','));
  if (de.split('Handelsrouten: jede eigene Stadt').length !== 2) throw new Error('Handelsrouten nicht genau einmal');
  G('closeModal')();
  G('switchLang')('en');
  try {
    G('clearMissing')();
    G('rulesModal')();
    const en = $('ov-body').textContent.replace(/\s+/g, ' ');
    for (const t of ['Movement, roads and railways', 'Zone of control (Gunpowder)', 'The Air force ignores zones of control'])
      if (!en.includes(t)) throw new Error('fehlt auf Englisch: ' + t);
    const fehlt = G('missingStrings')();
    if (fehlt.length) throw new Error('ohne Übersetzung: ' + fehlt.slice(0, 3).join(' | '));
    G('closeModal')();
  } finally { G('switchLang')('de'); }
  console.log('       zwei Abschnitte nach der Nahrung, deutsch und englisch vollständig');
});
/* ============================================ Marathon (v83)
   Aufbau → Zufallskarte → Draft mit Karte und Starttechnologien → Spiel. */
const marathonAufbau = kinds => {
  $('m-new').onclick();
  $('setup-mode').querySelector('[data-mode=marathon]').onclick();
  [...$('setup-list').children].forEach((x, i) => x.querySelector(`[data-kind="${kinds[i]}"]`).onclick());
  $('setup-start').value = '0'; $('setup-start').onchange();
};
step('Marathon (v83): im Aufbau vier Reiche, keine Karten- und Fähigkeitswahl, dafür der Hinweis', () => {
  marathonAufbau(['human', 'ki', 'bot', 'ki']);
  if ($('setup-list').children.length !== 4) throw new Error($('setup-list').children.length + ' Plätze');
  if (!$('setup-map-row').hidden) throw new Error('Kartenwahl sichtbar');
  if ($('setup-marathon-hint').hidden) throw new Error('kein Hinweis');
  const civs = [...$('setup-list').children].map(x => x.dataset.civ);
  if (new Set(civs).size !== 4) throw new Error('Zivilisationen doppelt: ' + civs);
  if ([...$('setup-list').querySelectorAll('[data-abil]')].some(x => !x.closest('label').hidden)) throw new Error('Fähigkeitswahl sichtbar');
  if (!/gedraftet/.test($('setup-list').children[0].querySelector('.abil').textContent)) throw new Error('Platzhinweis fehlt');
  // zurück zu „Vier Reiche": alles wieder da
  $('setup-mode').querySelector('[data-mode=vier]').onclick();
  if (!$('setup-marathon-hint').hidden || $('setup-list').querySelector('[data-abil]').closest('label').hidden) throw new Error('Vier Reiche: Rest vom Marathon');
});
step('Marathon: Draft – Karte, Starttechnologien, Vorrat 2n + 1, Schlange, die KI wählt selbst', () => {
  marathonAufbau(['human', 'ki', 'bot', 'ki']);
  $('setup-go').onclick();
  if (!$('screen-draft').classList.contains('show')) throw new Error('kein Draft');
  const st = G('draftState'), V = st.V, D = st.D;
  if (!V.marathon || V.map.rows.length !== 24 || V.map.rows[0].length !== 36) throw new Error('keine Marathonkarte');
  if ($('dr-map').querySelectorAll('[data-r]').length !== 24 * 36) throw new Error('Karte nicht gezeichnet');
  if ((D.pool.length + D.at) !== 7) throw new Error('Vorrat ' + (D.pool.length + D.at) + ' statt 7 (drei draftende Reiche)');
  // die Liste nennt jedes Reich mit Starttechnologien
  const reiche = $('dr-players').querySelectorAll('.dr-pl');
  if (reiche.length !== 4) throw new Error(reiche.length + ' Reiche in der Liste');
  V.players.forEach((p, i) => {
    const t = G('TECHS').find(x => p.avail[x.k]);
    if (t && !$('dr-players').textContent.includes(t.n)) throw new Error('Starttechnologie fehlt: ' + t.n);
  });
  // bis der Mensch dran ist, haben die KI gewählt; der Mensch tippt
  let guard = 0;
  while (!G('draftDone')(D) && guard++ < 20) {
    const cur = G('draftCurrent')(D);
    if (V.players[cur].kind !== 'human') throw new Error('eine KI wartet auf Eingabe');
    const b = [...$('dr-pool').querySelectorAll('[data-ab]')].find(x => !x.disabled);
    b.onclick();
  }
  if (!G('draftDone')(D)) throw new Error('Draft endet nicht');
  if ($('dr-go').hidden) throw new Error('kein „Spiel beginnen"');
  const bot = V.players.findIndex(p => p.kind === 'bot');
  if (D.picks[bot].length) throw new Error('der Bot hat gewählt');
  const gewaehlt = V.players.map((p, i) => D.picks[i].length);
  if (gewaehlt.filter(n => n === 2).length !== 3) throw new Error('Wahlen: ' + gewaehlt);
  // Der Bogen jedes Reichs zeigt die Marathonkosten – ohne Rabatt einer Fähigkeit, denn
  // während des Drafts hat noch niemand eine (auch Griechenland nicht seine Grundfähigkeit).
  const papier = G('TECH_BY_KEY').papier;
  const soll = G('techBase')(V, papier);
  if (soll !== papier.c * G('MARATHON_TECH_FACTOR')[papier.age]) throw new Error('Marathonkosten falsch berechnet');
  for (const b of $('dr-players').querySelectorAll('[data-bogen]')) {
    b.onclick();
    const k = [...$('ov-body').querySelectorAll('.tech')].find(x => x.querySelector('b').textContent === papier.n);
    const ist = k && k.querySelector('.c').textContent.trim();
    G('closeModal')();
    if (ist !== String(soll)) throw new Error(`Bogen ${G('civOf')(V.players[+b.dataset.bogen]).n}: Papier ${ist} statt ${soll}`);
  }
  // auf der Draftkarte steht noch keine Armee (Wikinger-Grundfähigkeit ist noch nicht vergeben)
  if (V.armies.length) throw new Error('Armee auf der Draftkarte');
  console.log('       ' + V.players.map((p, i) => G('civOf')(p).n + ': ' + D.picks[i].map(id => G('abilById')(id).n).join('+')).join(' · '));
});
step('Marathon: das Spiel beginnt mit genau dieser Karte und den gedrafteten Fähigkeiten', () => {
  const st = G('draftState'), V = st.V, D = st.D;
  $('dr-go').onclick();
  const S = G('S');
  if (!$('screen-game').classList.contains('show')) throw new Error('kein Spiel');
  if (!S.marathon || JSON.stringify(S.map.rows) !== JSON.stringify(V.map.rows)) throw new Error('andere Karte');
  const falsch = S.players.filter((p, i) => JSON.stringify(G('abilitiesOf')(p)) !== JSON.stringify(D.picks[i]));
  if (falsch.length) throw new Error('Fähigkeiten weichen ab');
  // Kopfzeile des Menschen nennt beide Fähigkeiten
  while (AUTO(G('P')(S)) && !S.over && $('bot-next')) $('bot-next').onclick();
  const ich = S.cur;
  const namen = G('abilInfos')(S.players[ich]).map(a => a.n);
  if (namen.length !== 2 || !namen.every(n => $('hud-name').textContent.includes(n))) throw new Error('Kopfzeile: ' + $('hud-name').textContent);
  // Regelbogen: Hinweis und umgerechnete Kosten
  G('rulesModal')();
  const regeln = $('ov-body').textContent;
  G('closeModal')();
  if (!/Marathon: Technologien kosten/.test(regeln) || !regeln.includes(String(G('techBase')(S, G('SINGULARITY'))))) throw new Error('Regelbogen ohne Marathon');
  if (!/Marathon/.test(S.log[0].m) || !S.log.some(l => /Fähigkeiten/.test(l.m))) throw new Error('Protokoll nennt Marathon oder Draft nicht');
  // Speichern und Fortsetzen behält alles
  G('saveGame')();
  G('show')('screen-menu'); $('m-continue').onclick();
  const L = G('S');
  if (!L.marathon || JSON.stringify(G('abilitiesOf')(L.players[ich])) !== JSON.stringify(D.picks[ich])) throw new Error('nach dem Fortsetzen anders');
  console.log('       ' + $('hud-name').textContent + ' · ' + S.map.name);
});
step('Marathon: „Nochmal spielen" führt wieder in den Draft, mit neuer Karte', () => {
  const S = G('S'), alt = JSON.stringify(S.map.rows);
  G('startFromRecipe')(S.recipe);
  if (!$('screen-draft').classList.contains('show')) throw new Error('kein Draft');
  if (JSON.stringify(G('draftState').V.map.rows) === alt) throw new Error('dieselbe Karte');
});
step('Marathon: der Draft auf Englisch', () => {
  G('switchLang')('en');
  try {
    G('drawDraft')();
    const txt = $('screen-draft').textContent;
    if (!/Empires in turn order/.test(txt) || !/Starting technologies/.test(txt)) throw new Error('nicht übersetzt: ' + txt.slice(0, 160));
    if (/Starttechnologien|Reiche in Zugfolge|wählt Fähigkeit/.test(txt)) throw new Error('deutsche Reste');
  } finally { G('switchLang')('de'); }
  G('show')('screen-menu');
});

step('kein abgefangener Fehler im Zugablauf', () => {
  const f = G('UI_ERRORS');
  if (f.length) throw new Error(f.join(' | '));
});

console.log(errors.length ? '\n' + errors.length + ' Fehler' : '\nOberfläche läuft fehlerfrei durch');
process.exit(errors.length ? 1 : 0);
