/* prüft die Einzeldatei in jsdom: lädt, startet ein Spiel mit beiden Erweiterungen */
const fs=require('fs'), {JSDOM}=require('jsdom');
const html=fs.readFileSync('hochzeivilization-einzeldatei.html','utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
  beforeParse(w){
    w.SVGElement.prototype.createSVGPoint=function(){return {x:0,y:0,matrixTransform(){return{x:0,y:0}}}};
    w.SVGElement.prototype.getScreenCTM=function(){return {a:1,inverse(){return this}}};
    w.HTMLElement.prototype.setPointerCapture=function(){};
    w.onerror=e=>errs.push(e);
  }});
const w=dom.window, $=id=>w.document.getElementById(id);
// Erweiterungen sind ab Werk aus und haben dann keine Zeile im Aufbau – erst über die
// Einstellungen zuschalten, dann wie zuvor ankreuzen.
w.eval("show('screen-options'); optionsScreen();");
$('opt-events').checked=true; $('opt-events').onchange();
$('opt-wonders').checked=true; $('opt-wonders').onchange();
w.eval("show('screen-setup'); setupScreen();");
if ($('setup-events-row').hidden || $('setup-wonders-row').hidden)
  { console.log('FEHLER: Modulzeilen fehlen im Aufbau'); process.exit(1); }
$('setup-events').checked=true; $('setup-events').onchange();
$('setup-wonders').checked=true;
$('setup-go').onclick();
const S=w.eval('S');
const fields=$('map').querySelectorAll('[data-r]').length;
console.log('Karte:', S.map.rows.length+'x'+S.map.rows[0].length, '|', fields, 'Felder');
console.log('Erweiterungen:', 'Ereignisse='+(S.ev?S.ev.mode:'aus'), 'Wunder='+S.wo);
console.log('Techs im Bogen:', (w.eval("$('a-tech').onclick(); $('ov-body').querySelectorAll('.tech').length")));
// Plättchenkarte samt Legephase: einmal komplett durchspielen
w.eval("closeModal(); show('screen-setup'); setupScreen();");
w.eval("$('setup-mode').querySelector('[data-mode=duell]').onclick()");
w.eval("$('setup-map').value='plaettchen'; $('setup-map').onchange(); $('setup-go').onclick()");
w.eval("closeModal()");
w.eval(`(() => {
  const rcs = slotRC(placeState.plan, placeSeatNow().slot);
  const ok = placeOptions(placeState.plan, placeSeatNow(), placeState.o);
  const i = ok.indexOf(true);
  plTap(rcs[i][0], rcs[i][1]); placeConfirm(); placeConfirm();
})()`);
const T = w.eval('S');
console.log('Plättchenkarte:', T.map.name, T.map.rows.length + 'x' + T.map.rows[0].length,
  '|', $('map').querySelectorAll('[data-r]').length, 'Felder |', T.cities.length, 'Hauptstädte');
// Marathon (v83): Zufallskarte, Draft mit der KI, dann das Spiel
w.eval("closeModal(); show('screen-setup'); setupScreen();");
w.eval("$('setup-mode').querySelector('[data-mode=marathon]').onclick(); $('setup-go').onclick()");
w.eval(`(() => {
  let n = 0;
  while (!draftDone(draftState.D) && n++ < 20)
    [...$('dr-pool').querySelectorAll('[data-ab]')].find(b => !b.disabled).onclick();
  $('dr-go').onclick();
})()`);
const M = w.eval('S');
console.log('Marathon:', M.map.name, '|', $('map').querySelectorAll('[data-r]').length, 'Felder |',
  M.players.map(p => w.eval('abilitiesOf')(p).length).join('/'), 'Fähigkeiten je Reich');
if (!M.marathon || M.players.some(p => w.eval('abilitiesOf')(p).length !== 2))
  { console.log('FEHLER: Marathon startet nicht mit gedrafteten Fähigkeiten'); process.exit(1); }
console.log('Fehler:', errs.length ? errs : 'keine');
process.exit(errs.length?1:0);
