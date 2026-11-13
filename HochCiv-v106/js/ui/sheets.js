/* js/ui/sheets.js – Blätter der Leiste: Technologien, Macht, Fähigkeiten, Protokoll.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------------------------ Technologien */
/* Der Technologiebogen selbst: vier Felder × vier Zeitalter und darunter die
   Singularität. Zweimal gebraucht – im Spiel mit Knöpfen (techModal) und in der
   Legephase als reine Ansicht (placeTechView). `opts.plain` lässt die Kostenampel
   (bezahlbar / zu teuer) weg und macht jede Kachel unantastbar: vor dem ersten Zug gibt
   es noch nichts zu kaufen, und eine Kachel, die sich drücken ließe, aber nichts tut,
   wäre schlimmer als gar keine. */
function techBoardHTML(S, pi, opts) {
  const plain = !!(opts || {}).plain, readonly = !!(opts || {}).readonly, p = S.players[pi];
  let grid = '<div class="techgrid">';
  for (let a = 0; a < 4; a++) {
    grid += `<div class="age-label">${AGES[a]}</div>`;
    for (let f = 0; f < 4; f++) {
      grid += `<div class="techcol">${a === 0 ? `<h4>${FIELDS[f]}</h4>` : ''}`;
      for (const t of techsIn(f, a, S)) {
        const owned = has(p, t.k), avail = p.avail[t.k] && !owned;
        const cost = techCost(S, pi, t);
        const affordable = !plain && avail && available(S, pi, 'sci') >= cost;
        const can = affordable && !readonly;
        // Sklaverei wird mit der ersten Technologie der Moderne obsolet – im Bogen sichtbar.
        const dead = t.k === 'sklaverei' && owned && !slaveryUsable(p);
        const eff = dead ? T('obsolet – seit der Moderne nicht mehr nutzbar') : techEffect(t, S);
        // Verfügbar zerfällt in zwei Zustände: bezahlbar (afford) und zu teuer (costly).
        // Rein grafisch – der Kostenwert steht ohnehin schon in der Kachel.
        const state = owned ? 'owned'
          : avail ? (plain ? 'avail' : affordable ? 'avail afford' : 'avail costly') : 'locked';
        /* Erstes Spiel (v93): blasse Kacheln lassen sich antippen und sagen, warum sie blass
           sind – durchgefallen (mit dem Wurf) oder noch nicht ausgewürfelt (fgBlass). */
        const blass = !plain && state === 'locked' && pi === S.cur && typeof ui !== 'undefined' && ui && ui.fg;
        grid += `<button class="tech ${state}${dead ? ' obsolete' : ''}"
          ${can ? `data-tech="${t.k}"` : blass ? `data-blass="${t.k}"` : 'disabled'}><span class="c">${owned ? '✓' : avail && !plain ? costText({ sci: cost }, String(cost)) : cost}</span>
          <b>${t.n}</b><span class="eff">${eff}</span>${ownerMarks(S, t.k, pi)}</button>`;
      }
      grid += '</div>';
    }
  }
  grid += '</div>';
  const sing = singularityReady(p), sc = techCost(S, pi, SINGULARITY);
  const singAfford = !plain && sing && available(S, pi, 'sci') >= sc && !p.techs.singularitaet;
  const singCan = singAfford && !readonly;
  const singState = p.techs.singularitaet ? 'owned'
    : sing ? (plain ? 'avail' : singAfford ? 'avail afford' : 'avail costly') : 'locked';
  grid += `<button class="tech ${singState}" style="margin-top:10px"
      ${singCan ? 'data-tech="singularitaet"' : 'disabled'}>
      <span class="c">${sing && !plain && !p.techs.singularitaet ? costText({ sci: sc }, String(sc)) : sc}</span><b>${SINGULARITY.n}</b><span class="eff">${SINGULARITY.e}</span></button>`;
  return grid;
}
/* Wer schaut auf den Bildschirm? Am selben Gerät, wer am Zug ist. Im Mehrspielermodus setzt
   mp.js `viewerHook`: dort ist es immer das eigene Reich – auch wenn ein anderes am Zug ist
   (Mehrspieler-Erweiterung; bis dahin zeigte der Bogen das Reich am Zug). */
let viewerHook = null;
const viewer = () => {
  const v = viewerHook ? viewerHook() : null;
  return Number.isInteger(v) && S.players[v] ? v : S.cur;
};
function techModal() {
  endFoundMode();
  const pi = viewer();
  // Forschen nur im eigenen Zug – sonst ist der Bogen eine Ansicht
  const ownTurn = pi === S.cur && !isAuto(P(S)) && !S.over;
  // Nur die kleine Legende mit zwei Beispielmarken – der erklärende Absatz darüber ist
  // raus, er stand in jeder Ansicht im Weg.
  const bsp = S.players.find((pl, i) => i !== pi && !pl.dead);
  let grid = bsp
    ? `<p class="sub owner-legend" style="margin:-2px 0 10px">
         ${ownerMark(civOf(bsp), 'hat', false)} <span>${T('hat sie erforscht')}</span>
         ${humanCount(S) > 1
        ? `${ownerMark(civOf(bsp), 'kann', false)} <span>${T('könnte sie erforschen')}</span>` : ''}
       </p>`
    : '';
  grid += techBoardHTML(S, pi, { readonly: !ownTurn });
  /* Freie Forschung, Rückschau und Kopieren (Spionage, Kundschafterei, Internet) standen bis
     v86 hier unter dem Bogen – seit v87 leben sie unter „Fähigkeiten" (abilSheet), mit der
     Zahl an der Leiste, wenn etwas davon gratis offen ist. */
  const layout = `<div class="tech-layout">
    <aside class="tech-aside">${yieldOverview(S, pi)}</aside>
    <div class="tech-main">${grid}</div>
  </div>`;
  modal(T('Technologien · %s Wissenschaft verfügbar', available(S, pi, 'sci')) +
    (ownTurn ? '' : ' · ' + T('nicht am Zug')), layout);
  $('overlay').classList.add('wide');
  $('ov-body').querySelectorAll('[data-tech]').forEach(b => b.onclick = () => {
    if (viewer() !== S.cur) return;
    if (!fgDarf({ art: 'forschen', k: b.dataset.tech })) return;
    const e = doResearch(S, S.cur, b.dataset.tech);
    if (e) return toast(e);
    redraw(); if (S.over) { closeModal(); gameOver(); } else techModal();
  });
  // Erstes Spiel: blasse Kachel → warum blass (Würfel)
  $('ov-body').querySelectorAll('[data-blass]').forEach(b => b.onclick = () => { if (typeof fgBlass === 'function') fgBlass(b.dataset.blass); });
}
function powerSheet() {
  endFoundMode();
  // payOpts, nicht die nackte Münzprüfung: im Bürgerkrieg zählt auch Nahrung mit.
  const pi = S.cur, price = powerPrice(S, pi);
  const maxN = Math.floor(available(S, pi, 'coins', payOpts(S, pi)) / price);
  /* Das Blatt zeigt die Entscheidung (v102): die Macht jetzt und die Käufe – was nicht bezahlbar
     ist, ist gesperrt. Kurs, Halbierung zu Zugbeginn und was die Ringe der Machtansicht
     bedeuten (v75: solange dieses Blatt offen ist, tragen Städte und Armeen Ringe), stehen in
     den Regeln; den Kurs nennt ohnehin jeder Knopf. */
  let h = `<h3 class="sheet-head">${T('Macht')}<span class="sheet-now">${P(S).power} ⚔︎</span></h3>`;
  [1, 5, maxN].forEach((n, i) => {
    if (n <= 0 || (i === 2 && maxN <= 5)) return;
    h += `<button class="opt" data-n="${n}" data-label="+${n} Macht"${n > maxN ? ' disabled' : ''}><span>${T('+%s Macht', n)}</span>
      <span class="cost">${costText({ coins: n * price }, `${n * price}🪙`, payOpts(S, pi))}</span></button>`;
  });
  sheet(h, { power: true });
  if (!ui.powerView) { ui.powerView = true; redraw(); }
  $('sheet-body').querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    if (!fgDarf({ art: 'macht', n: +b.dataset.n })) return;
    const e = buyPower(S, S.cur, +b.dataset.n);
    if (e) toast(e);
    redraw(); powerSheet();             // die Ringe zeigen gleich den neuen Machtwert
  });
}
/* ------------------------------------------------------------------ Fähigkeiten (v87)
   Wunsch des Autors: ein Ort für die besonderen Fähigkeiten und alles, was über eine
   einzelne Stadt hinausgeht – in der Leiste an der Stelle des früheren Umschalters
   „Erträge" (der zeigte dasselbe wie der Gründungsmodus).
   · die eigene Zivilisationsfähigkeit (im Marathon beide) mit Wirkung; die aktiven zum
     Auslösen: Freie Forschung und Rückschau – bis v86 unten im Technologiebogen,
   · kostenlose Technologien aus Wundern (Bibliothek, Oxford, Raumfahrt): das Fenster dazu
     geht weiter von selbst auf, hier bleiben sie greifbar, wenn man es geschlossen hat,
   · Wachsen in allen Städten: kostenlos (Verbundwerkstoffe) und bezahlt, mit dem, was
     tatsächlich abgeht – die Abkürzung, damit man nicht jede Stadt einzeln antippt,
   · Sklaverei in allen Städten, solange sie nicht obsolet ist,
   · Kopieren: Spionage, Kundschafterei, Internet – bis v86 im Technologiebogen.
   Die Zahl an der Leiste zählt die ARTEN kostenloser Aktionen, die gerade gehen
   (freeActions); dieselben Knöpfe sind im Blatt hervorgehoben (.opt.free). Entschieden
   wird alles in der Regelmaschine (freeTechOptions, backPickOptions, growAllPlan,
   sacrificeError, copyableTechs …) – das Blatt ordnet und formatiert nur.
   `oben`: aus der Leiste geöffnet, also von oben; nach einer Aktion bleibt die Stelle. */
function abilSheet(oben) {
  if (!S || S.over || isAuto(P(S))) return;
  endFoundMode();
  if (ui.fg && typeof fgSieht === 'function') fgSieht('faehigkeiten');
  const pi = S.cur, p = P(S);
  const rows = [], handlers = [];
  // label = deutscher Schlüssel (data-label, wie btn in openTile), titel = was dasteht
  const knopf = (label, act, titel, sub, cost, fn, off, frei) => {
    const id = 'f' + (handlers.length + 1) + Math.random().toString(36).slice(2, 6);
    rows.push(`<button class="opt${frei ? ' free' : ''}" id="${id}" data-label="${label}" data-act="${act}" ${off ? 'disabled' : ''}>` +
      `<span>${titel}${sub ? `<small>${sub}</small>` : ''}</span><span class="cost">${cost || ''}</span></button>`);
    // Erstes Spiel: erst die Schienen fragen (v92) – die Art steht im Aktionsschlüssel
    const teil = act.split(':');
    const aktion = teil[0] === 'wachsen' ? { art: 'wachsen', alle: true, mode: teil[1] === 'gratis' ? 'free' : 'paid' }
      : teil[0] === 'opfern' ? { art: 'opfern', alle: true }
        : teil[0] === 'kopie' ? { art: 'kopieren', k: teil[2] } : { art: 'gratis', k: teil[1] };
    handlers.push([id, () => { if (fgDarf(aktion)) fn(); }]);
  };
  // Ein Kopierweg als Preisknopf in der Zeile einer Technologie (v105): gratis ist hervorgehoben
  const weg = (act, w, fn) => {
    const id = 'f' + (handlers.length + 1) + Math.random().toString(36).slice(2, 6);
    const name = esc(TECH_BY_KEY[w.k].n), frei = !w.coins;
    const preis = frei ? T('gratis') : costText({ coins: w.coins }, `${w.coins}🪙`);
    handlers.push([id, () => { if (fgDarf({ art: 'kopieren', k: act.split(':')[2] })) fn(); }]);
    return `<button class="way${frei ? ' free' : ''}" id="${id}" data-label="${frei ? 'Gratis kopieren' : 'Kopieren'}" ` +
      `data-act="${act}" title="${name}" aria-label="${name}: ${esc(preis)}" ${available(S, pi, 'coins') < w.coins ? 'disabled' : ''}>` +
      `${esc(preis)}</button>`;
  };
  const kopf = t => rows.push(`<h4 class="abil-h">${t}</h4>`);
  const notiz = t => rows.push(`<p class="sub abil-note">${t}</p>`);
  // Einzelne Wahl (Technologie, Kopie): Fehler melden, sonst neu zeichnen – auch das Ende
  // der Partie (Oxford kann die Singularität bringen)
  const tu = fn => () => {
    const e = fn();
    if (e) return toast(e);
    redraw();
    if (S.over) { closeSheet(); return gameOver(); }
    abilSheet();
  };
  // Sammelaktion: dazu ein Satz, wie viele Städte es waren
  const alle = (fn, satz) => () => {
    const r = fn();
    redraw();
    if (r.done) toast(satz(r)); else toast(commonReason(r.why) || T('Nicht möglich.'));
    abilSheet();
  };
  const staedte = n => n === 1 ? T('1 Stadt') : T('%s Städte', n);
  // Unterzeile einer Sammelaktion: alle, ein Teil (samt häufigstem Grund für den Rest) oder keine
  const sammelSub = (r, zusatz) => {
    const grund = commonReason(r.why);
    if (!r.of) return T('Keine Stadt.');
    if (!r.done) return grund || '';
    return (r.done === r.of ? staedte(r.done) : T('%s von %s Städten', r.done, r.of)) +
      (zusatz ? ' · ' + zusatz : '') + (r.done < r.of && grund ? ' · ' + T('übrige: %s', grund) : '');
  };
  const techSub = t => t.k === 'singularitaet' ? esc(SINGULARITY.e) : esc(techEffect(t, S));

  /* 1 Zivilisationsfähigkeit(en). Doppelt gedraftet wirkt eine nur einfach – steht also auch
     nur einmal da. */
  const gesehen = new Set();
  const abils = abilInfos(p).filter(a => !gesehen.has(a.id) && gesehen.add(a.id));
  /* Die Karte der Fähigkeit trägt ihren Stand (v102): bei der Freien Forschung je kostenloser
     Forschung ein Punkt, gefüllt solange offen – statt Überschrift und Satz. Kostenlose
     Knöpfe tragen kein „gratis": sie sind als kostenlos hervorgehoben (.opt.free). Die Punkte
     zeichnet pips (base.js) – dieselben stehen seit v103 am Knopf „Feld beanspruchen". */
  abils.forEach(a => {
    const stand = a.k === 'gratistech' ? pips(freeTechsLeft(p), FREE_TECH_USES) : '';
    rows.push(`<div class="abil-card"><b>${esc(a.n)}${stand}</b><small>${esc(abilEffect(a, S))}</small></div>`);
    if (a.k === 'gratistech') {
      // seit v101 zweimal je Partie, höchstens einmal je Runde – alles Erforschbare samt Singularität
      const ft = freeTechOptions(S, pi), rest = freeTechsLeft(p);
      if (rest) {
        ft.forEach(t => knopf('Freie Forschung', 'forschung:' + t.k, esc(t.n), techSub(t), '',
          tu(() => useFreeTech(S, pi, t.k)), false, true));
        if (!ft.length) notiz(p.freeTechUsed === S.round ? T('Diese Runde schon genutzt.')
          : evActive(S, pi, 'dunkles_zeitalter') ? T('Dunkles Zeitalter: Diese Runde kann nicht geforscht werden.')
            : T('Gerade ist keine passende Technologie verfügbar.'));
      }
    }
    if (a.k === 'rueckschau') {
      const bp = backPickOptions(S, pi);
      if (bp.length) {
        notiz(T('Rückschau: eine Technologie aus %s, früheres Zeitalter, kostenlos', FIELDS[backPick(p, S).f]));
        bp.forEach(t => knopf('Rückschau', 'rueckschau:' + t.k, esc(t.n), techSub(t), '',
          tu(() => useBackPick(S, pi, t.k)), false, true));
      } else notiz(T('Gerade nichts offen. Jede Technologie ab dem Mittelalter, die du erforschst, bringt hier eine kostenlose aus einem früheren Zeitalter desselben Feldes – nur im selben Zug.'));
    }
  });
  if (!abils.length) notiz(T('Bots haben keine Fähigkeit'));

  // 2 kostenlose Technologien aus Wundern
  const pick = freePick(p), fp = freePickOptions(S, pi);
  if (pick && fp.length) {
    kopf(T('Kostenlose Technologie'));
    notiz(esc(pick.why) + ' · ' + T('Noch %s kostenlose Technologie(n).', pick.n));
    fp.forEach(t => knopf('Kostenlose Technologie', 'wunder:' + t.k, esc(t.n), techSub(t), '',
      tu(() => useFreePick(S, pi, t.k)), false, true));
  }

  // 3 Wachstum in allen Städten – kostenlos (Verbundwerkstoffe) und bezahlt
  kopf(T('Wachstum'));
  if (has(p, 'verbundwerkstoffe')) {
    const r = growAllPlan(S, pi, 'free');
    knopf('Alle Städte kostenlos wachsen', 'wachsen:gratis', T('Alle Städte kostenlos wachsen'),
      sammelSub(r, TECH_BY_KEY.verbundwerkstoffe.n), '',
      alle(() => growAll(S, pi, 'free'), x => x.done === x.of ? T('Alle Städte sind gewachsen.')
        : T('Gewachsen: %s von %s Städten.', x.done, x.of)), !r.done, r.done > 0);
  }
  {
    const r = growAllPlan(S, pi, 'paid');
    const preis = `${r.price.food}🌾 ${r.price.coins}🪙`;
    knopf('Alle Städte wachsen', 'wachsen:bezahlt', T('Alle Städte wachsen'), sammelSub(r),
      r.done ? paidText(r.price, r.paid, preis) : '—',
      alle(() => growAll(S, pi, 'paid'), x => x.done === x.of ? T('Alle Städte sind gewachsen.')
        : T('Gewachsen: %s von %s Städten.', x.done, x.of)), !r.done);
  }

  // 4 Sklaverei in allen Städten (nicht mehr, sobald sie obsolet ist)
  if (slaveryUsable(p)) {
    kopf(esc(TECH_BY_KEY.sklaverei.n));
    const st = citiesOf(S, pi), why = st.map(c => sacrificeError(S, pi, c)).filter(Boolean);
    const r = { done: st.length - why.length, of: st.length, why };
    knopf('In allen Städten opfern', 'opfern', T('In allen Städten opfern'),
      sammelSub(r, r.done ? T('je 1 Bevölkerung') : ''), r.done ? '+' + r.done * SLAVERY_COINS + '🪙' : '—',
      alle(() => sacrificeAll(S, pi), x => T('Geopfert: %s Bevölkerung, +%s Münzen.', x.done, x.done * SLAVERY_COINS)),
      !r.done);
  }

  /* 5 Kopieren (v105): Internet, Spionage und Kundschafterei sind je eine Kopie je Runde. Eine
     Zeile je Technologie, rechts je offenem Weg sein Preis als Knopf – gratis, Einfaches,
     Doppeltes der Grundkosten. Ein genutzter Weg verschwindet aus allen Zeilen; welcher Weg
     welcher ist, sagt der Preis (und title/aria-label), kein Satz. Bis v104 je Weg ein eigener
     Knopf und eine Zeile mit den Wirkungstexten. */
  if (COPY_WAYS.some(w => has(p, w.k))) {
    kopf(T('Technologien kopieren'));
    const cop = copyableTechs(S, pi);
    if (!copyWaysOpen(S, pi).length) notiz(T('Diese Runde schon kopiert.'));
    else if (!cop.length) notiz(T('Nichts zu kopieren – kein anderes Reich hat eine Technologie, die dir fehlt.'));
    cop.slice(0, 40).forEach(o => {
      const t = o.tech;
      const preise = o.ways.map(w => weg('kopie:' + w.k + ':' + t.k, w, tu(() => copyTech(S, pi, t.k, w.k)))).join('');
      rows.push(`<div class="copy-row"><span>${esc(t.n)}<small>${techSub(t)}${ownerMarks(S, t.k, pi)}</small></span>` +
        `<span class="copy-ways">${preise}</span></div>`);
    });
  }

  sheet(`<h3>${T('Fähigkeiten')}</h3>` + rows.join(''));
  if (oben) $('sheet').scrollTop = 0;
  handlers.forEach(([id, fn]) => { const el = $(id); if (el) el.onclick = fn; });
}
/* Protokollzeilen als HTML. Die Würfe, die zu einer Aktion geführt haben, hängen als
   aufklappbares Detail an dieser Aktionszeile: sichtbar ist nur, was passiert ist,
   die Würfe holt man sich per Antippen. Eine Bot-Runde besteht sonst zu gut der Hälfte
   aus 🎲-Zeilen und man findet die eigentliche Aktion nicht mehr.
   Die Zuordnung „Würfe davor gehören zur nächsten Aktionszeile" stimmt, weil die
   Regelmaschine erst würfelt und dann das Ergebnis protokolliert. Würfe, auf die keine
   Aktion folgt (Fehlschläge am Ende eines Zuges), stehen als eigener Sammelposten. */
function rollSummary(rolls) {
  // Aus „🎲 4 — Wachstum (2+)" wird der Grund gezogen; gleiche Gründe werden gezählt.
  const why = [], seen = new Map();
  for (const l of rolls) {
    const m = /—\s*(.+?)\s*(?:\(\d(?:[–-]\d)?\+?\))?\s*$/.exec(l.m);
    const w = m ? m[1] : 'Wurf';
    if (!seen.has(w)) { seen.set(w, 1); why.push(w); } else seen.set(w, seen.get(w) + 1);
  }
  const parts = why.slice(0, 3).map(w => seen.get(w) > 1 ? `${w} ×${seen.get(w)}` : w);
  if (why.length > 3) parts.push('…');
  return parts.join(', ');
}
function rollsBlock(rolls, lead) {
  const n = rolls.length;
  const tag = `<em class="rtag">🎲 ${n}</em>`;
  const inner = rolls.map(l => `<div class="logline roll">${l.m}</div>`).join('');
  const head = lead
    ? `<span class="lsum ${lead.c}">${lead.m}</span>${tag}`
    : `<span class="lsum">${rollSummary(rolls)}</span>${tag}`;
  return `<details class="rolls"><summary>${head}</summary>${inner}</details>`;
}
function logHtml(entries) {
  const out = [];
  let buf = [];
  for (const l of entries) {
    if (l.c === 'roll') { buf.push(l); continue; }
    // Rundenüberschriften bekommen keine Würfe angehängt – sie trennen die Züge.
    if (buf.length && l.c !== 'head') { out.push(rollsBlock(buf, l)); buf = []; continue; }
    if (buf.length) { out.push(rollsBlock(buf, null)); buf = []; }
    out.push(`<div class="logline ${l.c}">${l.m}</div>`);
  }
  if (buf.length) out.push(rollsBlock(buf, null));
  return out.join('');
}
function logModal() {
  modal('Protokoll', logHtml(S.log.slice(-260)));
  const b = $('ov-body'); b.scrollTop = b.scrollHeight;
}
