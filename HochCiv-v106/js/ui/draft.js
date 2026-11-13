/* js/ui/draft.js – Marathon: Fähigkeiten draften.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
/* ------------------------------------------------- Marathon: Fähigkeiten draften (v83)
   Nach dem Aufbau entsteht die Karte, die Starttechnologien werden ausgewürfelt (rollSetup,
   wie vor der Legephase) – und eine Vorschau-Partie zeigt beides: Karte mit Hauptstädten und
   für jedes Reich, was es zu Beginn erforschen kann. Dann wird gedraftet (Regeln in
   js/marathon.js). Die KI wählt sofort, wenn sie dran ist; Menschen tippen. Alles ist offen –
   anders als in der Legephase gibt es nichts zu verbergen, also auch keine Übergabe.
   „Spiel beginnen" startet die echte Partie mit genau dieser Karte, diesen
   Starttechnologien und den gedrafteten Fähigkeiten. */
let draftState = null;
function startMarathon(cfg) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  // die Standard-Zufallskarte – oder die eigene Karte mit Marathonregeln (beginFromPick)
  cfg = Object.assign({}, cfg, { seed, marathon: true, map: cfg.map || marathonMap(seed) });
  const setup = rollSetup(cfg);
  cfg.avail = setup.avail; cfg.wpool = setup.wpool;
  const V = draftView(cfg);          // dieselbe Partie, noch ohne Fähigkeiten
  draftState = { cfg, V, D: draftNew(V, seed + 1) };
  show('screen-draft');
  draftAdvance();
}
function draftAdvance() {
  const st = draftState;
  while (!draftDone(st.D) && st.V.players[draftCurrent(st.D)].kind === 'ki') {
    const pi = draftCurrent(st.D);
    draftPick(st.D, pi, kiDraftPick(st.V, st.D, pi));
  }
  drawDraft();
}
function drawDraft() {
  const st = draftState, V = st.V, D = st.D, cur = draftCurrent(D);
  const capCur = cur != null ? capitalOf(V, cur) : null;
  drawMap($('dr-map'), V.map, { state: V, tutHl: capCur ? [[capCur.r, capCur.c]] : [] });
  const name = i => { const c = civOf(V.players[i]); return `${SYM[c.sym]} <b>${esc(c.n)}</b>`; };
  $('dr-note').innerHTML = draftDone(D)
    ? T('Alle haben gewählt – die Partie kann beginnen.')
    : T('%s wählt Fähigkeit %s von 2 (Wahl %s von %s, Schlangenreihenfolge).', name(cur),
      D.picks[cur].length + 1, D.at + 1, D.order.length);
  const opts = cur != null ? draftOptions(D, cur) : [];
  $('dr-pool').innerHTML = draftDone(D) ? '' : `<p class="sub">${T('Zur Wahl')}</p>` +
    D.pool.map(id => {
      const a = abilById(id), civ = CIV_BY_KEY[a.civ];
      return `<button class="dr-ab" data-ab="${id}" ${opts.includes(id) ? '' : 'disabled'}>
        <span class="dr-civ">${SYM[civ.sym]} ${esc(civ.n)}</span><b>${esc(a.n)}</b><small>${esc(abilEffect(a, V))}</small></button>`;
    }).join('');
  // Reiche in Zugfolge: gewählte Fähigkeiten, Startertrag der Hauptstadt, Starttechnologien
  const reihe = V.players.map((_, k) => (V.startIdx + k) % V.players.length);
  $('dr-players').innerHTML = `<p class="sub">${T('Reiche in Zugfolge')}</p>` + reihe.map(i => {
    const p = V.players[i], y = income(V, i);
    const techs = TECHS.filter(t => p.avail[t.k] && techActive(V, t)).map(t => t.n).join(', ') || '—';
    const picks = p.kind === 'bot' ? T('Bot – ohne Fähigkeiten')
      : D.picks[i].length ? D.picks[i].map(id => esc(abilById(id).n)).join(' · ') : T('noch keine Fähigkeit');
    return `<div class="dr-pl${i === cur ? ' now' : ''}">
      <h4>${name(i)}${kindTag(p) ? `<small>${esc(kindTag(p))}</small>` : ''}
        <button class="btn small ghost" data-bogen="${i}">${T('Bogen')}</button></h4>
      <p class="dr-picks">${picks}</p>
      <p>${T('Hauptstadt im ersten Zug, ohne Fähigkeiten: %s', fmtY([y.sci, y.food, y.coins]))}</p>
      <p>${T('Starttechnologien: %s', esc(techs))}</p></div>`;
  }).join('');
  $('dr-go').hidden = !draftDone(D);
  $('dr-pool').querySelectorAll('[data-ab]').forEach(b => b.onclick = () => draftChoose(b.dataset.ab));
  $('dr-players').querySelectorAll('[data-bogen]').forEach(b => b.onclick = () => draftTechView(+b.dataset.bogen));
  $('dr-go').onclick = draftGo;
}
function draftChoose(id) {
  const st = draftState, cur = draftCurrent(st.D);
  if (cur == null) return;
  const e = draftPick(st.D, cur, id);
  if (e) return toast(e);
  draftAdvance();
}
// Der Technologiebogen eines Reichs, wie er zu Beginn aussieht – mit den Kosten des Marathons
function draftTechView(i) {
  const V = draftState.V;
  modal(T('%s · Starttechnologien', civOf(V.players[i]).n),
    `<p class="sub">${T('Ausgewürfelt vor dem Draft – im Spiel steht genau das hier. Kosten ohne Fähigkeiten.')}</p>` + techBoardHTML(V, i, { plain: true }));
  $('overlay').classList.add('wide');
}
function draftGo() {
  const st = draftState;
  if (!st || !draftDone(st.D)) return;
  const players = st.cfg.players.map(pc => Object.assign({}, pc));
  st.V.players.forEach((p, i) => { if (p.kind !== 'bot') players[p.slot].drafted = st.D.picks[i].slice(); });
  draftState = null;
  S = newGame(Object.assign({}, st.cfg, { players }));
  startGameScreen();
}
