/* js/ui/world.js – Welt und Zugbeginn: Ereignis, Weltübersicht, Wunder, Nahrung, freie Wahl.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* --------------------------------------------------------- Ereignis & Erweiterungen */
function curEvent() {
  if (!S || !S.ev || !S.event || !S.event.k || S.event.round !== S.round) return null;
  return EVENT_BY_KEY[S.event.k];
}
/* „Welt": Ereignis dieser Runde, Weltwunder, Barbaren – alles auf einen Blick. */
/* Die Reiche als Liste in Zugfolge, durchnummeriert (v99, Anweisung des Autors: „in
   Spielerreihenfolge“ – bis v98 standen sie in der Reihenfolge des Spielstands, also etwa
   Russland zuerst, auch wenn England anfing). Je Reich Farbe, Name und Fähigkeit(en); `self`
   hebt eines hervor, `extra` hängt etwas an den Namen. Teilen sich die Weltansicht im Spiel und
   die der Legephase. */
function civRowsHTML(list, V) {
  return '<div class="civ-list">' + list.map(({ x, self, extra }, n) => {
    const c = civOf(x), as = abilInfos(x);
    return `<div class="civ-row${self ? ' self' : ''}">
        <span class="civ-chip" style="border-color:${c.color};color:${c.color}">${SYM[c.sym]}</span>
        <span class="civ-n">${n + 1}. ${esc(c.n)}${extra || ''}</span>
        <span class="civ-a">${as.length ? as.map(a => `<b>${esc(a.n)}</b><small>${esc(abilEffect(a, V))}</small>`).join('')
        : `<i>${T('Bots haben keine Fähigkeit')}</i>`}</span></div>`;
  }).join('') + '</div>';
}
function worldModal() {
  const pi = S.cur;
  // Wer ist wer: Reich, Farbe und Fähigkeit. Bei ausgelosten Fähigkeiten ist das die
  // Stelle, an der man in Ruhe nachliest, was man (und die anderen) bekommen hat.
  const reiche = S.players.map((x, i) => ({ x, i })).filter(({ x }) => x.kind !== 'barbar')
    .sort((a, b) => turnPosition(S, a.i) - turnPosition(S, b.i));
  let h = `<p class="sub">${T('Die Reiche in Zugfolge')}</p>` + civRowsHTML(reiche.map(({ x, i }) => {
    // Marathon (v84): wie weit zum Militärsieg, und wer seine Hauptstadt schon verloren hat
    const haupt = S.marathon && !x.dead ? [
      capitalsTaken(x) ? T('%s von %s Hauptstädten erobert', capitalsTaken(x), capitalsToWin(S)) : '',
      capitalOf(S, i) ? '' : T('ohne Hauptstadt'),
    ].filter(Boolean).map(t => ' · ' + t).join('') : '';
    return { x, self: i === pi, extra: (x.dead ? ' · ' + T('ausgeschieden') : '') + haupt };
  }), S);
  if (oldTreeShown())
    h += `<p class="sub" style="margin-top:12px">${T('Alter Techtree')} · ${oldTreeText()}</p>`;
  if (S.ev) {
    const ev = curEvent();
    h += ev
      ? `<div class="evbox"><b>${T('Ereignis: %s', ev.n)}</b><p>${ev.e}</p>
         ${hasWonder(S, pi, 'palast') ? `<p>${T('Der Apostolische Palast schützt dich davor.')}</p>` : ''}</div>`
      : `<div class="evbox"><b>${T('Kein Ereignis in dieser Runde')}</b><p>${T('Der Spaltenwürfel ging ins Leere.')}</p></div>`;
    if (hasWonder(S, pi, 'orakel')) {
      const nx = peekNextEvent(S);
      const nn = nx && nx.k ? EVENT_BY_KEY[nx.k].n : T('keines');
      h += `<p class="sub">${T('Das Orakel sieht für die nächste Runde: %s', '<b>' + nn + '</b>')}</p>`;
    }
    if ((S.barbs || []).length)
      h += `<p class="sub">${T('Barbaren belagern %s Stadt/Städte.', S.barbs.length)}</p>`;
    if (S.nukeBan) h += `<p class="sub">${T('Atomwaffenproteste: Atomwaffen sind gesperrt.')}</p>`;
  }
  if (S.wo) {
    const c = wonderCounts(S, pi);
    h += `<p class="sub" style="margin-top:12px">` +
      T('Deine Weltwunder — Stufe 1: %s · Stufe 2: %s · Stufe 3: %s · nächstes Wunder %s Münzen',
        c[1], c[2], c[3], wonderCost(S, pi)) + '</p>';
    h += '<div class="wlist">' + (wondersOf(S, pi).map(w =>
      `<span class="wtag">${WONDER_BY_KEY[w.k].n}${w.cityId == null ? ' (' + T('freistehend') + ')' : ''}</span>`).join('')
      || `<span class="sub">${T('noch keins')}</span>`) + '</div>';
    for (const lvl of [1, 2, 3]) {
      const pool = poolOf(S, lvl);
      if (!pool.length) continue;
      h += `<p class="sub" style="margin-top:10px">${T('Verfügbar, Stufe %s', lvl)}</p>`;
      h += pool.map(k => `<div class="tech ${wonderLevelOk(S, pi, lvl) ? 'avail' : 'locked'}">
        <span class="c">${WONDER_BY_KEY[k].lvl}</span><b>${WONDER_BY_KEY[k].n}</b>
        <span class="eff">${WONDER_BY_KEY[k].e}</span></div>`).join('');
    }
    const others = S.players.map((pl, i) => i).filter(i => i !== pi && wondersOf(S, i).length);
    if (others.length) {
      h += `<p class="sub" style="margin-top:10px">${T('Andere Reiche')}</p>`;
      h += others.map(i => `<p style="font-size:12px;margin:2px 0">
        <b style="color:${civOf(S.players[i]).color}">${civOf(S.players[i]).n}</b>: ` +
        wondersOf(S, i).map(w => WONDER_BY_KEY[w.k].n).join(', ') + '</p>').join('');
    }
  }
  if (!S.ev && !S.wo) h += `<p class="sub">${T('Dieses Spiel läuft ohne Ereignisse und ohne Weltwunder.')}</p>`;
  modal(T('Welt'), h);
}
/* Weltwunder in einer Stadt bauen */
function wonderSheet(city) {
  const pi = S.cur;
  const cost = wonderCost(S, pi);
  let h = `<h3>${T('Weltwunder bauen')}</h3><p class="sub">` +
    T('Kosten %s Münzen · diese Stadt hat %s/2 Wunder · verfügbar: %s Münzen',
      cost, wondersInCity(S, city).length, available(S, pi, 'coins')) + '</p>';
  const list = availableWonders(S);
  const rows = list.map(w => {
    const err = canBuildWonder(S, pi, city, w.k);
    return `<button class="opt" data-w="${w.k}" ${err ? 'disabled' : ''}>
      <span>${w.n}<small>${T('Stufe %s', w.lvl)} · ${w.e}${err ? ' · ' + err : ''}</small></span>
      <span class="cost">${costText({ coins: cost }, `${cost}🪙`)}</span></button>`;
  }).join('');
  sheet(h + (rows || `<p class="sub">${T('Keine Wunder verfügbar.')}</p>`));
  $('sheet-body').querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
    const e = buildWonder(S, S.cur, city, b.dataset.w);
    if (e) return toast(e);
    redraw();
    if (S.over) { closeSheet(); return gameOver(); }
    if (freePick(P(S))) return freePickModal();
    openTile(city.r, city.c);
  });
}
/* Nahrungsübersicht zu Zugbeginn: was das Land produziert, was die Bevölkerung isst
   und – mit Gentechnik/Massenmedien – wie viel davon aus Wissenschaft oder Münzen
   bestritten wird. Voreingestellt ist die Deckung aus Nahrung, also gar keine
   Verschiebung; jede Änderung lässt sich zurücknehmen.
   Kein Umtausch: gedeckt wird höchstens, was die Bevölkerung tatsächlich isst. */
function foodSheet() {
  const pi = S.cur, p = ensureFoodState(S, pi);
  const isst = p.popFood || 0, gedeckt = p.popCovered || 0;
  const land = (p.foodRaw || 0) + isst;              // Produktion ohne die Bevölkerung
  const offen = Math.max(0, isst - gedeckt);
  const src = feedSources(S, pi);

  const zeile = (n, v, cls) => `<div class="fl ${cls || ''}"><span>${n}</span>
    <b>${v > 0 ? '+' : ''}${v} 🌾</b></div>`;
  let h = `<h3>${T('Nahrung diese Runde')}</h3>
    <div class="foodcalc">
      ${zeile(T('Das Land produziert'), land)}
      ${zeile(T('Die Bevölkerung isst (%s)', popOf(S, pi)), -isst)}
      ${gedeckt ? zeile(T('Davon aus %s bestritten', [
        p.popCoveredBy && p.popCoveredBy.sci ? T('Wissenschaft') : '',
        p.popCoveredBy && p.popCoveredBy.coins ? T('Münzen') : ''].filter(Boolean).join(' ' + T('und') + ' ')),
        gedeckt, 'plus') : ''}
      ${zeile(T('Bleibt nutzbar'), p.res.food, 'sum')}
      ${p.foodDeficit ? `<p class="hint warn-t">${T('Ungedeckt: %s 🌾 – die Nahrung bleibt bei 0, die Bevölkerung nimmt keinen Schaden.', p.foodDeficit)}</p>` : ''}
    </div>`;

  if (!src.length) {
    h += T('<p class="hint">Mit <b>Gentechnik</b> oder <b>Massenmedien</b> ließe sich ein Teil davon aus Wissenschaft oder Münzen bestreiten.</p>');
    sheet(h); return;
  }
  h += T('<p class="sub" style="margin-top:10px">Aus anderen Quellen bestreiten – höchstens %s, also nur die tatsächlichen Kosten.</p>', isst);
  src.forEach(x => {
    const have = p.res[x.kind];
    /* Eine Einheit deckt x.rate (Massenmedien: eine Münze fünf). Angeboten werden eine
       Einheit und die Zahl, die alles Offene deckt – mehr als nötig lässt coverPop
       ohnehin nicht zu. Die letzte Einheit darf dabei teilweise verfallen, deshalb
       steht auf dem Knopf, was sie WIRKLICH deckt, nicht Anzahl × Kurs. */
    const noetig = Math.min(have, Math.ceil(offen / x.rate));
    const steps = [...new Set([1, noetig])].filter(n => n > 0 && n <= noetig).sort((a, c) => a - c);
    const deckung = n => Math.min(n * x.rate, offen);
    const gesetzt = (p.popSpent && p.popSpent[x.kind]) || 0;
    h += `<p class="sub" style="margin-top:8px">${T('%s: %s übrig', x.n, have)}${
      x.rate > 1 ? ' · ' + T('1 %s deckt %s', x.n1 || x.n, x.rate) : ''}${
      gesetzt ? ' · ' + T('%s eingesetzt', gesetzt) : ''}</p>`;
    if (!steps.length && !gesetzt) { h += `<p class="hint">${T('Nichts einzusetzen.')}</p>`; return; }
    steps.forEach(n => {
      h += `<button class="opt" data-k="${x.kind}" data-n="${n}"><span>${T('%s %s einsetzen', n, x.n)}${
        deckung(n) === offen ? `<small>${T('deckt alles, was die Bevölkerung isst')}</small>` : ''}</span>
        <span class="cost">+${deckung(n)}🌾</span></button>`;
    });
    if (gesetzt)
      h += `<button class="opt ghost" data-back="${x.kind}" data-n="${gesetzt}">
        <span>${T('%s %s zurücknehmen', gesetzt, x.n)}</span>
        <span class="cost">−${(p.popCoveredBy && p.popCoveredBy[x.kind]) || 0}🌾</span></button>`;
  });
  sheet(h);
  $('sheet-body').querySelectorAll('[data-k]').forEach(b2 => b2.onclick = () => {
    const e = coverPop(S, S.cur, b2.dataset.k, +b2.dataset.n);
    if (e) return toast(e);
    redraw(); foodSheet();
  });
  $('sheet-body').querySelectorAll('[data-back]').forEach(b2 => b2.onclick = () => {
    const e = uncoverPop(S, S.cur, b2.dataset.back, +b2.dataset.n);
    if (e) return toast(e);
    redraw(); foodSheet();
  });
}
/* Auswahl kostenloser Technologien (Bibliothek, Oxford, Griechenland) */
function freePickModal() {
  // Die Singularität ist über Oxford kostenlos wählbar und beendet das Spiel sofort.
  // Ohne diese Prüfung liefe die Auswahl weiter, das Fenster schlösse sich stumm und
  // der Siegbildschirm käme nie – das Spiel wirkte hängengeblieben.
  if (S.over) { closeModal(); return gameOver(); }
  const pi = S.cur, p = P(S);
  const pick = freePick(p);
  const list = pick ? freePickOptions(S, pi) : backPickOptions(S, pi);
  const title = pick ? pick.why : T('Rückschau');
  if (!list.length) { closeModal(); return; }
  const h = `<p class="sub">${pick ? T('Noch %s kostenlose Technologie(n).', pick.n) :
    T('Eine beliebige Technologie desselben Feldes aus einem früheren Zeitalter, kostenlos.')}</p>` +
    list.map(t => `<button class="tech avail" data-free="${t.k}">
      <span class="c">${T('gratis')}</span><b>${t.n}</b><span class="eff">${techEffect(t, S)}</span></button>`).join('');
  modal(title, h);
  $('ov-body').querySelectorAll('[data-free]').forEach(b => b.onclick = () => {
    const e = pick ? useFreePick(S, S.cur, b.dataset.free) : useBackPick(S, S.cur, b.dataset.free);
    if (e) return toast(e);
    redraw();
    if (S.over) { closeModal(); return gameOver(); }
    if (freePick(P(S)) || backPickOptions(S, S.cur).length) freePickModal();
    else closeModal();
  });
}
/* Nach jedem Zugwechsel auf einen Menschen: Ereignis melden, Defizit anbieten. Eine Sperre
   aus dem Blatt eines KI- oder Bot-Zugs darf hier nicht mehr stehen (v80) – genau das war
   der gemeldete Zustand: der Mensch am Zug, das Blatt gesperrt, „Weiter" ohne Wirkung. */
function humanTurnStart() {
  ui.autoKette = 0;                     // v94: die Kette der KI- und Bot-Züge ist zu Ende
  if (ui.botLock || $('sheet').classList.contains('locked')) {
    ui.botLock = false;
    $('sheet').classList.remove('locked');
    closeSheet();
  }
  redraw();
  const p = P(S);
  if (S.over) return gameOver();
  /* Wer am Zug ist, sagt die Kopfzeile, das Ereignis der Runde steht neben ihr (v102). Bis v101
     kam dazu ein Hinweis „… ist am Zug", der über offenen Blättern lag. Sitzen mehrere
     Menschen am Gerät, pulsiert beim Wechsel einmal das Zeichen des Reichs. */
  if (S.players.filter(q => q.kind === 'human' && !q.dead).length > 1) pulseCiv();
  sicher('Zugbeginn', () => {
    // Mit Gentechnik/Massenmedien gehört die Nahrungsrechnung zu Zugbeginn entschieden.
    if (canFeed(p) && popOpen(ensureFoodState(S, S.cur)) > 0) foodSheet();
    else if (p.foodDeficit > 0) toast(T('Nahrungsdefizit %s – Nahrung bleibt bei 0.', p.foodDeficit));
    else if (freePick(p)) freePickModal();
  });
}
