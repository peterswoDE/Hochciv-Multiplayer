# Hochzeivilization — Projekt-Übergabe (Stand 9.10., `sw.js` v83)

Dieses Dokument ist so geschrieben, dass es in einen neuen Chat kopiert werden kann.

## Was das ist

Eine **offline spielbare Web-App** eines selbstgebauten Civilization-artigen Hex-Brettspiels,
gebaut für den Autor (deutschsprachig). Zielplattform: **iPad, über GitHub Pages zum
Home-Bildschirm hinzugefügt** (PWA, funktioniert offline). Vollständige Regel-Engine mit
automatischen Bots, Solo-gegen-Bots und Hotseat für 2–4 Menschen. Oberfläche **deutsch
und englisch** (zwei Flaggen im Hauptmenü, Deutsch ist Vorgabe und Quelle).

## Letzte Sitzungen auf einen Blick (v61 → v83)

Für den Einstieg in einen neuen Chat – was sich zuletzt getan hat, in dieser Reihenfolge:

| Fassung | Was | Art |
|---|---|---|
| v61 | Aufräumen ohne Verhaltensänderung: tote Funktionen, Alt-Namen (`canEnter`, `feed()`, `TECHS_ACTIVE`), doppelte `UI_EN`-Schlüssel, Verdopplungen in `drawMap`/`openTile` | Aufräumen |
| v62 | Siedel-Meldung nannte immer „fehlt Navigation", auch bei Vulkan/Armee; `flach()` in `test.js` zog die Karte nie glatt | Fehler |
| v63 | Gegnerisches Territorium und gegnerische Städte sperren den Siedlerweg (auch für Bots); die Luftwaffe überfliegt alles, landet aber nicht auf Vulkan/Armee/Stadt | Regel |
| v64–v66 | Massenmedien: 1 Münze ernährt **3**; Gentechnik: füttert 1:1 **und** bringt je **4** Wissenschaft 1 Nahrung ins Einkommen | Regel |
| v66 | Plättchenmodus: Starttechnologien und Wunderstapel werden **vor** der Legephase ausgewürfelt, Knopf „Forschung" zeigt den Bogen beim Legen | Regel + Oberfläche |
| v67 | Sieben verwaiste Übersetzungen entfernt, Ratsche dagegen | Aufräumen |
| v68 | **Burgstädte werfen mit Schießpulver eine Kontrollzone** – vorher schlüpften gegnerische Armeen an ihnen vorbei (gemeldet aus einem 1-gegen-1) | Fehler |
| v69 | **Ökologie** bringt je zwei Bevölkerung einer Stadt +1 auf **alle drei Erträge** statt nur +1 Nahrung | Regel |
| v70 | **Alternativer Techtree** als Häkchen im Aufbau: Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 · Bewässerung 1, Landwirtschaft 5; der Bogen ordnet die Leitern danach | Regel + Oberfläche |
| v71 | Im alternativen Techtree zusätzlich: **Kolonialismus** 3 statt 5 Münzen je Feld, **Kundschafterei** 2× statt 3× der Grundkosten | Regel |
| v72 | Kolonialismus 3 und Kundschafterei 2× gelten in **beiden** Techtrees; der alternative unterscheidet sich nur in den Forschungskosten (Klarstellung zu v71) | Regel |
| v73 | Plättchenmodus: Hauptstadt **eine Reihe näher** am Gegner (2 und 4 Reiche), **dominierte Startfelder rötlich umrandet**, Reichsgrenzen nicht mehr um leere Sechsecke am Kartenrand; Internet-Gratiskachel zeigt die Wirkung | Regel + Oberfläche + Fehler |
| v74 | Alternativer Techtree zusätzlich: **Chemie 11, Biologie 12, Wissenschaftliche Methode 15** (Forschung, Industrialisierung; Standard 12/15/11) | Regel |
| v75 | **Erträge** je Feld (Umschalter), **Stadt gründen** als eigene Aktion mit Kostenkarte, **Machtringe** bei offenem Machtblatt; Flankieren „gegenüber" jetzt auf allen drei Achsen (Fehler) | Oberfläche + Fehler |
| v76 | Machtringe aus **einem Teilstück je Punkt** (Verteidigung 1 gegen Angriff 2 = drei Stücke); über 60 Punkte nur der Anteil, bei 0 Punkten ein leerer Ring | Oberfläche |
| v77 | **KI** als dritte Sitzart (Mensch / KI / Bot): spielt nach den Regeln für Menschen, drei Stufen, legt ihr Startplättchen selbst (`js/ki.js`). **Wirtschaftssieg „mehr als 2/3" und nicht in Runde 1.** `reachable` mit Heap (gleiches Ergebnis, schneller). Messwerkzeug `tools_ki.js` | KI + Regel + Tempo |
| v78 | **KI-Stufen deutlich getrennt:** Leicht übersieht Möglichkeiten (`see`), rechnet ungenau und vergreift sich öfter, gibt aber aus, was es hat – im Duell etwa wie ein Prinz-Bot, Mittel wie König, Schwer wie David. **Abwehr gegen Vorstöße** (Rückmeldung des Autors): Verteidigung mit Macht im selben Paket, gegen Menschen mit dem entschlossenen Angreifer gerechnet – gefallene Hauptstädte im Test 32 → 20 von 187. Längster KI-Zug 1,5 → 0,7 s | KI + Tempo |
| v79 | **Abwehr neu gewichtet** (Rückmeldung des Autors): vor dem ersten Treffer mild, im Ernstfall (laufende Belagerung) alles – Verteidigungstechnologien, Flanken, Armeen an die Stadt, Macht; die KI sieht jetzt, dass Armeen nicht stapeln (Plätze an der Stadt). Vorher ein Sechstel weniger Ausgaben (ein Drittel weniger Macht), nachher ein Sechstel mehr, Hauptstädte so oft gehalten wie v78. **Wissenschaft zuerst für die Forschung** (außer im Ernstfall). **Knopf „Armeen" entfernt** | KI + Oberfläche |
| v80 | **Gesperrter Bildschirm nach KI-Zügen** (gemeldet, nicht nachgestellt): der Zug eines Menschen beginnt immer ohne Sperre, „Zug beenden" wirkt nur im eigenen Zug, Fehler im Zugablauf stehen im Protokoll statt den Ablauf anzuhalten, dieselbe KI zieht nach einem Neuladen nicht noch einmal. **Eisenbahn durch Kontrollzonen** (gemeldet): wer eine Kontrollzone betritt, hält für den Rest des Zuges an – auch auf der Eisenbahn; Einblendung beim Anhalten, Grund am gesperrten Knopf | Fehler |
| v81 | **Regelbogen:** Abschnitte „Bewegung, Straßen und Eisenbahn" (Bewegungspunkte, Bau und Preise, Kosten je Schritt, Handelsrouten) und „Kontrollzone (Schießpulver)" – Wortlaut vom Autor freigegeben, deutsch und englisch; `test.js` prüft jede Aussage an der Regelmaschine | Oberfläche |
| v82 | **Kosten am Knopf: was tatsächlich abgeht** (Gründen für 10 🌾 mit 8 im Vorrat: „8🌾 4🪙"), Einstellung „Kosten ohne Umtausch anzeigen" für die alte Anzeige. **Ein Techtree:** der frühere alternative ist der Standard, das Häkchen im Aufbau ist weg; der alte gilt nur noch im Tutorial und in Partien von vor v82 | Oberfläche + Regel |
| v83 | **Kriegerkultur mit Burgenbau:** +2 Macht auch je eigener Stadt. **Wirtschaftssieg zu Rundenbeginn:** eigene und Weltbevölkerung von dort, geprüft dort für alle (kein Wirtschaftssieg in Runde 2 im Duell mehr). **Marathon:** vier Reiche, Zufallskarte 24 × 36, Hauptstädte mit Nahrung + ½ Münzen ≥ 4, Technologien ×2/×3/×4/×5 (Singularität ×2,5), Fähigkeiten im Schlangen-Draft aus 2n + 1 (`js/marathon.js`); Fähigkeiten als Liste (`abilitiesOf`, `hasAbil`). die langsamsten KI-Züge auf großen Karten 10–30 % kürzer (Handelsrouten, Siedelplätze, Straßenpläne – gleiche Ergebnisse) | Regel + Modus + KI |

Neu in v83: die ersten vier Punkte unter „Was das Spiel heute kann", ausführlich in
`ANNAHMEN.md` (Abschnitt „Kriegerkultur mit Burgenbau · Wirtschaftssieg zu Rundenbeginn ·
Marathon (v83)"), sechs neue Fragilitäten und die offenen Punkte 24–28 (KI-Zugzeit im
Marathon, Kolonisten im Marathon, Kriegerkultur zu viert, Draft nicht gespeichert, die
getroffenen Auslegungen); Punkt 14 ist damit erledigt.

Neu seit v77 (auf v76 des Autors aufgesetzt): die **KI** (Abschnitte „KI (v77)",
„KI-Stufen (v78)" und „Abwehr neu gewichtet (v79)" unten, ausführlich in `ANNAHMEN.md`) und
Punkt 14–16 der offenen Punkte (Wirtschaftssieg in Runde 2 im Duell, ob Leicht für Einsteiger
passt, Rechenzeit auf dem iPad nicht gemessen), 17 (Abwehr gegen Menschen nur gegen ein
Skript gemessen) und 18 (Straßen im Bündel des Planers). Seit v80 Punkt 19 (Auslöser des
gesperrten Bildschirms unbekannt).

Offen und beim Autor: siehe „Offene Punkte" unten – vor allem Punkt 3 (Nachbarschaftsverbot
der Territoriumsklausel) und Punkt 7 (verteidigt die Burg auch Feldarmeen?), seit v69 außerdem Punkt 9
(Siedelvorschau bei Siedlertrecks), seit v72 Punkt 10 (Spieltipp zur Kundschafterei), seit v73
Punkt 11 („eine Reihe näher": Ecken bei 4 Reichen, schnelle Duelle bei Abstand 2) und
Punkt 12 (dominiert über alle Lagen oder nur je Lage?), seit v75 Punkt 13 (Bot-Partner
verlässt die Flanke), seit v77 Punkt 14 (Wirtschaftssieg in Runde 2 im Duell).

## Wo alles liegt

- **Arbeitsverzeichnis:** ein eigener Ordner unter `/home/claude/` (bisher `hochciv/`,
  `proj/hochzeivilization/`, `work/hochzeivilization/`, zuletzt `hochzeivilization/`) — **wird bei
  Container-Resets geleert**, auch mitten in einer Sitzung zwischen zwei Nachrichten.
  Vorhandensein mit `test -d <ordner>` prüfen, nicht mit `ls … | head && echo …`: die
  Pipe endet erfolgreich, auch wenn `ls` scheitert – so wurde einmal ein fehlender Baum
  als vorhanden gemeldet.
  Zu Beginn jeder Session wiederherstellen:
  `mkdir -p /home/claude/hochciv && cd /home/claude && unzip -o -q /mnt/user-data/uploads/hochzeivilization.zip -d /home/claude/unz && cp -r /home/claude/unz/hochzeivilization/. /home/claude/hochciv/`
  (oder aus `/mnt/user-data/outputs/hochzeivilization/`, falls noch vorhanden).
  Danach `npm install jsdom --no-fund --no-audit` — für `smoke.js` und `check_single.js` nötig.
  Am besten im **Elternordner** (`cd /home/claude`): Node findet es dort über die
  Verzeichnissuche, und `node_modules` kann gar nicht erst ins Paket rutschen (so in v69).
- **Deliverables in `/mnt/user-data/outputs/`:** Ordner `hochzeivilization/` (34 Dateien),
  `hochzeivilization.zip`, und `hochzeivilization-einzeldatei.html` — Letzteres ist, was der
  Autor tatsächlich aufs iPad lädt.
- **Wichtig beim Paketieren:** `node_modules` und `package*.json` ausschließen
  (`tar -c --exclude=node_modules --exclude='package*.json' .` bzw. `zip -x '*/node_modules/*'`).
  Einmal ist ein `node_modules` ins Zip gerutscht und ließ sich wegen eines I/O-Fehlers auf dem
  Mount nicht mehr löschen — nur durch Umbenennen aus dem Ordner heraus lösbar.

## Dateistruktur (~10 400 Zeilen)

| Datei | Zeilen | Inhalt |
|---|---|---|
| `js/i18n.js` | 1260 | Sprachen: `LANG`, `setLang`, `DATA_EN` (Spielobjekte), `UI_EN` + `T()` (Oberflächensätze), `missingStrings()` |
| `data/civs.json` | 69 | **Quelle** für die Zivilisationen · `node tools_civs.js` → `js/civs.js` |
| `js/civs.js` | 54 | ERZEUGT: `CIVS`, `CIV_BY_KEY`, `ORDER` (Zugfolge), `BARB_CIV` – nicht von Hand ändern |
| `js/data.js` | 436 | `APP_VERSION`, TERRAIN (inkl. Vulkan und `X` „Kein Feld"), TECHS (66, davon 62 Grundspiel) samt `OLD_TECH_COSTS`/`techBase` (alter Techtree, nur Tutorial), CIVS mit je 3 Fähigkeiten, feste Karten, `mapRng`, EVENT_ROWS (18), WONDERS (18), Regelkonstanten |
| `js/hex.js` | 157 | Hexraster (pointy-top, odd-r), `hexDistance`, `hexOpposite`, `reachable` (Heap, seit v77), `pathSteps` |
| `js/tiles.js` | 334 | Dreiecksplättchen: Würfelgeometrie, `TILE_POOL` (20), `TILE_SHAPES` (2/3/4), Plan, Legeregeln (`seatFreeCells`), Ertragsvorschau und dominierte Startfelder (`placeYieldTable`, `dominatedCells`), Kartenbau |
| `js/engine.js` | 1939 | Kernregeln: Einkommen, Kurse, Kampf, Bewegung, Wachstum inkl. Nahrungsgrenze, Handelsrouten, Zivilisationsfähigkeiten, Sieg, Zugablauf, Protokoll · `powerView` (Machtansicht), `canFlank`, `foundSiteError`/`withFoundTable` · `isAuto`/`kindTag` (Bot oder KI) |
| `js/expansion.js` | 524 | Ereignisse, Barbaren (neutrale Fraktion), Weltwunder, Kultursieg, Bot-Wunderbau |
| `js/bots.js` | 489 | Bot-Züge, Siedlerbewegung, **neunstufige Armeeprioritäten** (`botPlanArmies` für 1–6, `botMoveArmy` für 7–9), Bot-Forschung |
| `js/ki.js` | 1799 | **KI nach den Regeln für Menschen** (v77): Lage (`kiContext`), Bewertung (`kiValue`, `kiRisk` mit Ernstfall und Plätzen an der Stadt `kiAttackSlots`, `kiOffense`), Kandidaten und Planer auf Kopien (`kiCandidates`, `kiPlan`), Militärpakete (Angriff, Verteidigung, Flanke), Aufstellen, Startplättchen (`kiPlaceSeat`), Stufen (`KI_PARAMS`) |
| `js/marathon.js` | 301 | **Marathon** (v83): Kartengenerator (`marathonTerrain`, Rauschen, Kämme, Flüsse), Hauptstädte (`marathonCapitals`, `marathonStartYield`), Draft (`draftView`, `draftNew`, `draftOptions`, `draftPick`, `ALL_ABILITIES`), Wahl der KI (`KI_DRAFT_BASE`, `kiDraftValue`, `kiDraftPick`) |
| `js/ui.js` | 2438 | SVG-Karte, Antippen, Aktionsblätter, Technologiebogen, Nahrungsfenster, Aufbau (inkl. 1-gegen-1, Sitzart Mensch / KI / Bot), Editor, Kurzregeln , Legephase (`screen-place`) · Kartenansichten: Erträge, Gründungsmodus, Machtringe (v75, ein Stück je Punkt seit v76) |
| `js/tutorial.js` | 680 | Geführtes Übungsspiel: **29 Schritte** (19 mit Aufgabe), feste Würfelfolge, Schienen, feste Texte |
| `test.js` | 6096 | **1551 Assertions**, `node test.js` |
| `smoke.js` | 3215 | **140 Schritte** durch die echte UI via jsdom, `node smoke.js` |
| `build_single.py` / `check_single.js` | 21 / 59 | Einzeldatei bauen und in jsdom prüfen (inkl. Plättchenkarte) |
| `tools_version.js` | 69 | Version erhöhen + `BUILD_HASH` schreiben – **vor jedem Ausrollen** |
| `tools_docs.js` | 72 | Zahlen in dieser Übergabe nachziehen (Zeilen, Assertions, Schritte) |
| `tools_civs.js` | 82 | `data/civs.json` → `js/civs.js` |
| `tools_ki.js` | 246 | Messreihen mit der KI: Duell gegen Bots, eine KI gegen drei Bots, Stufen gepaart, KI gegen KI, nachgestellte Vorstöße samt Ausgaben vor/nach dem ersten Treffer (`node tools_ki.js duell 40 diff=david`, `… vorstoss 40 art=droh` …) |
| `tools_startplaettchen_dump.js` / `tools_startplaettchen_pdf.py` | 34 / 176 | Druckbogen `Startplaettchen.pdf` aus `js/tiles.js` (A4 quer, 3 Seiten, Spieloptik, verzahnt mit 4 mm Luft, ohne Umriss) |
| `ANNAHMEN.md` | — | **Alle Regelauslegungen und Entscheidungen.** Bei Regelfragen zuerst hier nachsehen. |

Weitere: `index.html`, `css/style.css`, `sw.js`, `manifest.webmanifest`, `icons/`,
`README.md`, `Startplaettchen.pdf` (erzeugter Druckbogen).

**Vor jedem Ausrollen `node tools_version.js`** — der Service Worker liefert cache-first,
ohne neue `VERSION` kommt eine Änderung bei niemandem an. Das Werkzeug setzt `VERSION`,
`APP_VERSION` und einen `BUILD_HASH` über die zwischengespeicherten Dateien; `test.js`
rechnet den Hash nach und schlägt an, wenn Dateien geändert und die Version gleich blieb.
**Zahlen in dieser Übergabe:** `node tools_docs.js` zieht Zeilenzahlen, Assertions und
Smoke-Schritte nach (von Hand veralten sie zuverlässig).

## Regelheft

Der Autor hat das vollständige PDF geliefert (`Hochzeivilization_3.pdf`) sowie die Bögen
`Civs.pdf`, `Ereignisse.pdf`, `Wunder.pdf`. **Liegen nicht im Arbeitsverzeichnis.** Falls
Regeln gegengeprüft werden müssen: den Autor bitten, sie erneut hochzuladen — nicht aus dem
Gedächtnis rekonstruieren.

## Was das Spiel heute kann

- **Marathon (v83).** Spielart im Aufbau, immer vier Reiche: Zufallskarte 24 × 36
  (`marathonMap`), je Viertel eine Hauptstadt mit Nahrung + ½ Münzen ≥ 4 im ersten Zug –
  gerechnet mit 2 Bevölkerung –, mindestens 14 Felder auseinander. Technologien kosten
  ×2/×3/×4/×5 je Zeitalter, die Singularität ×2,5 (`techBase`, `S.marathon`). Vor dem ersten
  Zug ein Draft (`screen-draft`): Karte, Ertrag jeder Hauptstadt, Starttechnologien samt
  Bogen; jedes Reich wählt zwei Fähigkeiten in Schlangenreihenfolge aus 2n + 1 zufällig
  gezogenen (mit Zurücklegen), n = Reiche außer Bots. Die KI wählt nach gemessenen
  Grundwerten (`KI_DRAFT_BASE`). Gedraftetes steht als `p.drafted` im Spielstand.
- **Fähigkeiten als Liste (v83).** `abilitiesOf(p)` → Schlüssel „Zivilisation:Fähigkeit";
  Grundfähigkeiten (`basis`) immer mit `hasAbil(p, civ, 'basis')`, die übrigen mit
  `isAbil(p, k)`; `abilInfos(p)` für die Anzeige. Ohne Draft genau eine wie bisher.
- **Wirtschaftssieg zu Rundenbeginn (v83).** Gezählt mit eigener und Weltbevölkerung zu
  Beginn der Runde (`S.roundPops`, `S.roundPop`), geprüft dort für alle in Zugfolge
  (`markRoundStart`); nicht mehr am Zugende, keine Nachprüfung am Rundenende. Die
  Kopfzeile zeigt den laufenden Stand.
- **Kriegerkultur mit Burgenbau (v83).** +2 Macht je Armee und, mit Burgenbau, je eigener
  Stadt (`warriorUnits`); die Baukosten weiterer Armeen zählen nur echte Armeen.
- **Kosten am Knopf (v82).** Jeder Kostenknopf zeigt, was tatsächlich abgeht (`costText` →
  `costPaid`, dieselbe Rechnung wie `payAll`): fehlt Nahrung oder Wissenschaft, steht der
  Rest in Münzen bzw. was sonst einspringt daneben – „8🌾 4🪙" statt „10🌾". Wird nichts
  umgetauscht oder reicht es gar nicht, steht der Preis wie bisher. Im Technologiebogen nur
  auf erforschbaren Kacheln; die Karte im Gründungsmodus zeigt den Preis (Vergleich der
  Plätze). Einstellung „Kosten ohne Umtausch anzeigen" (`prefs.listPrice`, Schlüssel
  `hochciv.prefs`) stellt die Anzeige bis v81 wieder her.
- **Ein Techtree (v82).** Die Kosten des früheren alternativen Techtrees stehen in `TECHS`;
  das Häkchen im Aufbau ist weg. Der alte Techtree (`OLD_TECH_COSTS`, `S.oldTree`) gilt nur
  im Tutorial und in Partien, die vor v82 mit ihm begonnen wurden (`migrateState`); dort
  nennen Weltblatt und Regelbogen ihn, im Tutorial nicht. `tools_ki.js … alterbaum` spielt
  zum Vergleich im alten.
- **KI (v77).** Dritte Sitzart im Aufbau (Mensch / KI / Bot), ab Werk sind die Gegner KI.
  Sie spielt nach den Regeln für Menschen – nur über die Aktionen der Regelmaschine, also
  ohne Möglichkeit zu schummeln –, hat ihre Zivilisationsfähigkeit, Ereignisse treffen sie,
  und sie legt ihr Startplättchen verdeckt selbst. Stufen Leicht/Mittel/Schwer (`KI_LEVELS`
  in data.js, Werte `KI_PARAMS` in ki.js), gleiche Regeln auf jeder Stufe; seit v78
  deutlich getrennt, im Duell (v79) Leicht zwischen den Bots Prinz und König, Mittel etwas
  über König, Schwer etwas über David. Bots gibt es weiter, das Tutorial spielt mit ihnen. Einzelheiten und Messungen in `ANNAHMEN.md`,
  Abschnitte „KI: ein Gegner nach den Regeln für Menschen", „KI-Stufen deutlich getrennt"
  und „Abwehr: vorher leicht, im Ernstfall alles".
- **Wirtschaftssieg (v77):** „mehr als 2/3" (vorher „mindestens"), und in Runde 1 gar nicht –
  beides Anweisung des Autors nach einem Fund der KI (Sieg in Runde 1 mit 4 von 5 im Duell).
- **Eine Regelvariante.** Die früher „experimentell v2" genannten Regeln sind der Standard:
  Singularität 100, Keramik und Theologie in der Techliste, Verbundwerkstoffe = kostenloses
  Wachstum, Sklaverei ab Moderne obsolet (im Bogen durchgestrichen), Siegschwellen stapeln
  nicht, Bots forschen zweimal. Griechenland hat **keinen** Würfelbonus.
- **Tutorial in zwei Fassungen:** die kurze filtert `kurz: false` weg und ersetzt Texte
  über `kurz: () => …`. Seit v60 darf ein Schritt über **`tKurz`** auch einen eigenen Titel
  für die kurze Fassung tragen (genutzt in 2/24: lang „Woher deine Ressourcen kommen",
  kurz „Aktionen"). Ohne `tKurz` gilt ein gemeinsamer Titel.
- **Zivilisationsfähigkeiten:** je Reich drei zur Wahl (Grund + zwei Alternativen aus dem
  Civs-Bogen), im Aufbau umschaltbar. **Bots erhalten keinerlei Fähigkeit.** Wird das Reich
  ausgelost, steht auch die Fähigkeit auf *Zufall* – die frühere Option „Grundfähigkeit"
  ist in v58 entfallen, sie benannte nichts Bestimmtes.
- **Nahrungsgrenze:** Die Nahrungsproduktion darf nicht negativ werden, Wachstum wird sonst
  blockiert — gerechnet auf dem **dauerhaften** Wert (`baseIncome`), ein Ereignis dieser
  Runde zählt nicht. Gentechnik und Massenmedien heben die Grenze auf: zu Zugbeginn öffnet
  sich ein Fenster, in dem sich die **Bevölkerungskosten** aus Wissenschaft oder Münzen
  bestreiten lassen — höchstens bis zur Höhe dieser Kosten, also kein Umtausch.
- **Handelsrouten:** Jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden
  Weg mit ihr verbunden ist, bringt +1 auf alle Erträge; bei reiner Eisenbahn +2. Gemischte
  Strecken zählen als Straße.
- **Ereignisse** (Erweiterung, hart/leicht) mit Barbaren als neutraler Fraktion.
  Seit v58 ein **Modul**: ab Werk aus, im Hauptmenü unter *Einstellungen* zuschaltbar.
- **Weltwunder** (Erweiterung) mit Pyramidenregel, Kultursieg und vier eigenen Technologien
  (Baukräne, Wallfahrt, Militärlogistik, Raumfahrt). Bots bauen sie kostenlos, **ohne Effekte**
  — einzige Ausnahme: Militärlogistik wirkt auch für Bots. Seit v58 ebenfalls ein **Modul**:
  ab Werk aus, im Hauptmenü unter *Einstellungen* zuschaltbar.
- **Einstellungen (v58):** eigener Bildschirm im Hauptmenü (`screen-options`), Wahl unter
  `hochciv.opts`. Ist ein Modul aus, fehlt seine Zeile im Aufbau ganz **und sein Häkchen
  wird gelöscht** – sonst liefe ein abgeschaltetes Modul unsichtbar weiter. Ist es an,
  entscheidet das gewohnte Häkchen weiter je Partie.
- **Spielende (v58):** unter dem Ergebnis steht immer ein **Spieltipp** (43 Stück in `TIPS`,
  englisch in `DATA_EN.tips`; einer je Partie, Nummer in `S.tip` gemerkt). Allein gegen Bots
  zusätzlich **„Nochmal spielen"**: dieselbe Aufstellung, ausgelostes Reich samt Fähigkeit,
  nach einem Sieg eine Stufe schwerer (bei David bleibt es dabei). Grundlage ist `S.recipe`,
  die **rohe** Aufbauwahl mit noch unaufgelöstem `zufall`.
- **Karten:** Originalkarte (Standard), Große Karte, **Plättchenkarte** (die Zufallskarte,
  aus Dreiecken, eigene Form je Spielerzahl), eigene aus dem Editor. Der alte
  Rastergenerator (12 × 18 bzw. 12 × 8) ist in v51 **ersatzlos entfallen**, samt
  `randomMap`, `duelMap`, `makeRandomMap`, `MAP_MIX`, `RANDOM_CAPITALS`, `startFood`,
  `startSpots`, `carveSpot`, `boostFood`. Geblieben ist aus dem Block nur `mapRng`.
- **Startplätze der Viererkarte (v51):** die **beiden oberen und die beiden unteren**
  Dreiecke (Plätze 1, 3, 6, 8 – die einzigen, deren Fünferzeile auf der Ober- oder
  Unterkante liegt), nicht mehr jedes zweite des äußeren Rings. Dadurch liegen die Starts
  enger: Hauptstadtabstand im Median 7 statt 9, erlaubte Felder 11 statt 13–14 von 15
  (seit v73: 13 – eine Reihe näher, siehe unten).
- **Plättchenkarte + Legephase:** 20 handentworfene Dreiecke zu 15 Feldern (`js/tiles.js`).
  2 Reiche → Sechseck aus 6 (Mitte bleibt **als Loch offen**), 3 → großes Dreieck aus 9
  (Loch), 4 → gestrecktes Sechseck aus 10 (lückenlos). Jedes Reich legt sein Startdreieck
  **verdeckt**: eine von drei Lagen, Hauptstadt frei auf Land (gesperrt nur, was einem
  fremden Startplättchen näher als 2 liegt oder sich mit einer möglichen fremden Hauptstadt
  ein Umlandfeld teilen könnte – seit v73, vorher 3 Felder Abstand). Bots legen zufällig auf
  eines der drei mittigen Felder. Danach Aufdecken, dann startet das Spiel.
- **Legephase (v56):** keine Plättchennamen mehr in der Oberfläche (nur noch intern und im
  Druckbogen), dafür die Fähigkeit des Platzes und – nach dem Setzen der Hauptstadt – eine
  **Ertragsübersicht**. Sie rechnet nur mit den Plättchen, die dieser Platz sehen darf.
  Seit v73 tragen **dominierte Startfelder einen rötlichen Rand** (siehe unten).
- **Ausrollen (v55):** `node tools_version.js` vor jedem Hochladen – der Service Worker
  ist cache-first, ohne neue `VERSION` kommt eine Änderung bei niemandem an. `test.js`
  prüft das über `BUILD_HASH` und schlägt an, wenn Dateien geändert und die Version gleich
  geblieben ist.
- **Fähigkeit sichtbar (v54):** `abilInfo(p)` (engine) liefert `{k,n,e}`; die Kopfzeile
  zeigt den Kurznamen neben dem Reich, das Weltblatt listet alle Reiche mit Fähigkeit und
  Wirkung. Nötig, seit sich Fähigkeiten auslosen lassen.
- **Tutorial (v54):** fragt beim Öffnen nach Erfahrung. „Nein" = lange Fassung (29
  Schritte), „Ja" = kurze (24). **Eine** Schrittliste, jeder Schritt hat `kurz` (Text oder
  `false`); Aufgaben sind damit in beiden identisch. Schritte mit `enter`/`dice` dürfen nie
  `kurz: false` bekommen – „Eine gegnerische Armee vor der Stadt" setzt die Armee.
- **Balance (v53):** Englands **Kolonisten** zahlt doppelt für Bevölkerungswachstum
  (`GROW_ABIL_FACTOR` in `js/engine.js`), **Seemacht** gibt +1 statt +2 je Küstenstadt
  (`SEA_CITY_BONUS` in `js/data.js`).
- **Zivilisationen (v53):** stehen in `data/civs.json`, `js/civs.js` wird daraus erzeugt.
  Reihenfolge in der JSON = Anzeige, Feld `order` = Zugreihenfolge. Regeln zu Fähigkeiten
  bleiben im Code; der Test meldet Fähigkeiten, die nirgends geprüft werden.
- **Sprachen (v52):** zwei Flaggen im Menü, Deutsch ist Vorgabe und Quelle. Datentexte über
  `DATA_EN` (Tabelle, kein Eingriff im Code), Oberflächensätze über `T('deutscher Satz')`
  mit `UI_EN` (482 Einträge). Übersetzt sind Menü, Aufbau, alle Blätter, Technologiebogen,
  Protokoll, Spielende, Regelbogen, Editor und das **komplette Tutorial** (482 Einträge).
  `smoke.js` läuft die Oberfläche auf Englisch ab, Grenze für deutsche Reste: 2.
  **Achtung:** Das Tutorial filtert Knöpfe nach `data-label` (deutscher Schlüssel), nicht
  nach der sichtbaren Beschriftung – wer `btn()` umbaut, muss das mitnehmen, sonst hängt
  das Tutorial in der Fremdsprache. `TUT_STEPS` wird beim Laden gebaut – Titel und Aufgaben dort erst beim
  Anzeigen übersetzen (`T(st.t)`), sonst frieren sie auf Deutsch ein. Alte Protokollzeilen
  behalten ihre Sprache (das Protokoll speichert Sätze, keine Schlüssel).
- **Aufbau (v51):** Zivilisation, Fähigkeit und Startspieler lassen sich **auslosen**
  („Zufall", aufgelöst erst beim Start in `resolveRandom`); bei mehr als einem Menschen ist
  der zufällige Startspieler die Vorgabe. Doppelgänger bekommen **je eine der vier
  Zivilisationsfarben**, keine Schattierungen.
- **Siegschwellen:** `VICTORY_LABEL` / `DUEL_VICTORY_LABEL` in `js/data.js` sind die eine
  Quelle für Rechnung (`victoryOption`) und Anzeige (`techEffect`, Regelübersicht). Im
  Duell zeigte der Bogen vorher die Werte des Vierspielerspiels.
- **Zivilisationen (v51):** Auf Plättchenkarten darf jeder Platz frei wählen, **auch
  mehrfach dieselbe** (Doppelgänger: „Russland I/II/III", eigene Farbschattierung). Auf
  festen Karten bleibt jede Zivilisation einmalig. Identität ist damit `p.slot`, nicht
  `p.civ`: Plättchenkarten führen `map.capitals` als **Liste** `[{civ,r,c}]`, feste Karten
  weiter als Objekt; `capitalSpot()` kennt beide.
- **Spielerzahlen 2, 3 und 4.** „Drei Reiche" ist neu (Standard-Siegschwellen, nicht die
  des Duells); freie Zivilisationswahl bei 2 und 3.
- **1 gegen 1:** zwei frei gewählte Reiche, immer die Plättchenkarte aus sechs Dreiecken
  (die Kartenzeile bleibt deshalb weg), Wirtschaftssieg erst über 3/4 (Theologie 7/10,
  UN 2/3).
- **Spielende (v51):** Nur der **Militärsieg** endet sofort. Wirtschafts-, Forschungs- und
  Kultursieg werden **angemeldet** (`claimVictory`, `S.claims`, `S.endRound`); gespielt wird
  bis zum **Rundenende**, dort entscheidet `resolveClaims`. Mehrere Ansprüche in derselben
  Runde ⇒ **Punkte = Bevölkerung + Wunder + Technologien**. Ein Anspruch bleibt gültig, auch
  wenn die Bedingung später wegfällt. **Gleichstand: Mensch vor Bot**; mehrere Menschen
  gleichauf teilen den Sieg. Barbaren gewinnen nie. Details in `ANNAHMEN.md`.
- **Tutorial:** geführtes Übungsspiel in der normalen Oberfläche, 29 Schritte, 19 mit Aufgabe.

### Abwehr neu gewichtet, Wissenschaft für die Forschung, kein Knopf „Armeen" (v79)

Rückmeldung des Autors zu v78 (Schwer zu viert): zu viel Vorsorge, bevor eine Belagerung läuft,
zu wenig, wenn sie läuft; im Ernstfall Verteidigungstechnologien, Flanken, Armeen neben die
Stadt; die KI forsche viel zu langsam; der Knopf „Armeen" soll weg. Ausführlich in
`ANNAHMEN.md`, Abschnitt „Abwehr: vorher leicht, im Ernstfall alles".

- **Knopf „Armeen" entfernt** (`index.html`, `armySheet` in ui.js, Tutorial-Leiste, sieben
  Übersetzungen, README). Armeen wählt man auf der Karte (Armee antippen → „Diese Armee
  bewegen", in einer Stadt „Armee hier bewegen").
- **Vorher mild, für alle** (`kiRisk`): auch gegen Menschen die Schätzung von v77; kann die KI
  nach einem Treffer nachlegen, bleibt 2 % Rest-Gefahr (`KI_W.preFloor`).
- **Im Ernstfall alles** (`K.emergency`: eine eigene Stadt hat Belagerungszähler 1): gegen
  Menschen hart gerechnet, Gefahr linear (`kiSiegeChance`) – jeder Punkt zählt; Alchemie-
  Pakete nur hier; bleibende Verteidigung zählt extra (`kiDefPerm`, `KI_W.defPerm` 8 je Punkt).
- **Plätze an der Stadt** (`kiAttackSlots`): Armeen stapeln sich nicht – Angreifer brauchen
  freie Felder in Reichweite, eigene Armeen nehmen ihnen welche weg. Seine Reichweiten dafür
  ohne die Armeen der KI gerechnet (`kiEnemyInfo`), Pakete besetzen zuerst Felder, die er
  erreichen könnte; was sie nach einem Treffer nachlegen kann, zählt nur so viele Helfer, wie
  dann Platz haben (`kiRingRoom`).
- **Wissenschaft gehört der Forschung** (`KI_W.sciReserve` 3): außerhalb des Ernstfalls zählt
  Wissenschaft für alles andere dreifach.
- **Gemessen** (Tabellen in `ANNAHMEN.md`): 399 nachgestellte Vorstöße, gepaart – Macht und
  Armeen vor dem ersten Treffer 29,2 → 24,2 Münzen je Zug (Macht 16,3 → 10,6), danach
  40,2 → 46,4; Verteidigungstechnologien im Ernstfall 19 → 29; Hauptstadt fällt 43 → 41
  (alles in Macht) bzw. 40 → 42 (knapp) – so oft wie v78. Gegen die KI gleich (gepaart 76 : 80
  in 156 Partien). Forschung gepaart nach Startwerten: Runde 4 +9 %, Runde 5 +12 %. Stufen
  weiter getrennt (Schwer–Mittel 27 : 13, Mittel–Leicht 26 : 14, Schwer–Leicht 30 : 10 im
  Duell); gegen Bots stärker (Leicht 55/80 gegen Prinz, Schwer 39/80 gegen David).
- **Verworfen:** harte zweite Welle gegen Menschen schon vorher (mehr Vorsorge, mehr gefallene
  Hauptstädte), Rest-Gefahr ohne Sprung, Armeen bewerten, die er flankieren kann (die KI kaufte
  dann vorab Macht), mehr Wert je Technologie (kaum mehr Technologien).
- **Werkzeug:** `node tools_ki.js vorstoss …` zeigt jetzt auch, was die KI vor und nach dem
  ersten Treffer in Macht und Armeen steckt; `art=droh` misst die bloße Drohung.

**Abgesichert:** `test.js` – Plätze an der Stadt (vier Angreifer, vier bzw. sechs eigene
Nachbarn: zwei bzw. kein Platz, Angriff halbiert bzw. weg; wer schon steht, bleibt); im
Ernstfall hält die Hauptstadt mit Armeen und Macht, vorher steckt die KI weniger hinein;
bleibende Verteidigung zählt im Ernstfall extra und Stadtmauern werden erforscht; mit
Reserve mehr Wissenschaft in die Forschung. `smoke.js` – Knopf und `armySheet` fehlen,
Armeen wählt man auf der Karte.

### KI-Stufen deutlich getrennt, kürzere Züge (v78)

Bis v77 spielten Leicht und Mittel fast wie Schwer (Duell gegen Prinz 68/70/71 von 80).
Jetzt, alles in `KI_PARAMS` (js/ki.js), weiter nur Denkfehler bei gleichen Regeln:

- **`see`** (neu): Anteil der Möglichkeiten, die die KI je Planungsschritt erwägt – Leicht
  0,25, Mittel 0,5, Schwer 1. Findet sich unter dem Gesehenen nichts, schaut sie ein zweites
  Mal: Leicht gibt aus, was es hat, und wählt nur schlechter. Dazu mehr Rauschen und
  Fehlgriffe, weniger Gewicht auf Gefahr und Angriff.
- **Gemessen** (Tabellen in `ANNAHMEN.md`, Endstand samt Abwehr): gepaart im Duell
  Schwer–Mittel 27 : 13, Mittel–Leicht 26 : 14, Schwer–Leicht 32 : 8; zu viert 19 : 5,
  17 : 7, 21 : 3; zu dritt Schwer–Leicht 21 : 3. Gegen Bots im Duell: Leicht 48/80 gegen
  Prinz, Mittel 45/80 gegen König, Schwer 34/80 gegen David.
- **Verworfen:** weniger Planungsschritte je Zug (Leicht ließ bis zu zwei Drittel liegen),
  kürzerer Horizont (wirkungslos).
- **Abwehr gegen Vorstöße** (Rückmeldung des Autors, Schwer zu viert): Verteidigungspakete
  enthalten jetzt die Macht (sonst baute die KI Armeen ohne Macht – einzeln bringt keins von
  beiden etwas), wahlweise mit Alchemie davor. Gegen Menschen rechnet sie mit dem
  entschlossenen Angreifer (Budget samt Alchemie, zwei Wellen; `kiDetermined`,
  `kiThreatBudget`, `kiAttackWaves`), zu einem Viertel mit der milden Schätzung. Gemessen an
  187 nachgestellten Vorstößen: Hauptstadt fällt 32 → 20 (alles in Macht) bzw. 23 → 18 (knapp
  gekauft); gegen die KI unverändert (gepaart, beide Fassungen in denselben Partien).
  Verworfen: harte Schätzung gegen alle (zu viert 17 : 31), Wirtschaft nur zählen, wenn die
  Hauptstadt steht (Duell 25 : 35). Messwerkzeug: `node tools_ki.js vorstoss`.
- **Tempo:** Budget Schwer 1000 statt 2000 Bewertungen (gepaart genau gleich stark),
  `kiHits` (wer eine Stadt angreifen kann, einmal je Zug), über Schritte gemerkte
  Reichweiten (`kiMoveSig`), keine teuren Kandidaten nach dem Budget. Die drei letzten
  ändern keine Partie (30 Partien Zeichen für Zeichen gleich). Längster Zug in Node
  1,5 → 0,7 s.

**Abgesichert:** `test.js` – Stufe mit `see` 0,01 wächst und zahlt trotzdem; Werte nach
Stufen geordnet; gemerkte Reichweiten = frische nach jeder Aktionsart (3436 Vergleiche,
Gegenprobe ohne Straßen in der Signatur schlägt an); Abwehr: zwei Armeen eines Menschen
vor der Hauptstadt ohne Stadtmauern – nach ihrem Zug hält die KI jedem Angriff seines
nächsten Zuges stand, mit Armeen und Macht; entschlossen gegen Menschen, mild gegen die KI;
Budget mit Alchemie und die zwei Wellen nachgerechnet. Stärke lässt sich nicht in
`test.js` prüfen (zu viele Partien) – dafür `node tools_ki.js stufen …` und `vorstoss …`.

### KI als dritte Sitzart, Wirtschaftssieg, schnellere Wegsuche (v77)

Auf Wunsch des Autors: ein Gegner, der nach den Regeln für Menschen spielt. Gebaut auf v74,
dann auf v76 des Autors aufgesetzt. Ausführlich in `ANNAHMEN.md` (Abschnitte „KI",
„Wirtschaftssieg: mehr als 2/3, nicht in Runde 1", „reachable: Heap").

- **Sitzart `'ki'`** (Aufbau: Mensch / KI / Bot, Gegner ab Werk KI, Stufe Leicht/Mittel/
  Schwer für alle KI gemeinsam). Die Regelmaschine kennt nur `kind === 'bot'` als
  Ausnahme – die KI fällt damit überall unter die Regeln für Menschen. Neu in engine.js nur
  `isAuto` (Bot oder KI: zieht von selbst), `kindTag` (Zusatz im Protokoll) und `kiLevel`
  am Spieler.
- **`js/ki.js`**: bewertet Spielstände, probiert jede Aktion auf einer Kopie mit der echten
  Regelmaschine samt Kampf am Zugende, nimmt die beste je eingesetzter Ressource. Eigener
  Zufall (`p.kiRng`), kein Blick auf künftige Würfe, `S.evNext` oder verdeckte Plättchen.
  Legt ihr Startplättchen selbst (`kiPlaceSeat`). Die Oberfläche zeigt ihre Züge wie
  Bot-Züge (Blatt mit „Weiter", Titel „(KI)", ein Satz mit ihren Gründen im Protokoll).
- **Wirtschaftssieg** (Anweisung des Autors): überall „mehr als" 2/3, und in Runde 1 gar
  nicht – `victoryOption` (`strict: true`) und `checkVictory` (`S.round <= 1`).
- **`reachable`** (hex.js) mit Heap und gemerkter Passierbarkeit: gleiches Ergebnis, etwa
  doppelt so schnell; ohne das dauerte ein KI-Zug mit Luftwaffe bis 27 s.
- **Aufgesetzt auf v76:** die neuen Stellen der Oberfläche, die „zieht gerade ein Bot?"
  fragen (`viewerOf`, `redraw`, `toggleFoundMode`, `tapHex`), fragen jetzt `isAuto` – im
  KI-Zug zeigt die Ertragsansicht die Sicht des Menschen, der Gründungsmodus ist aus, das
  KI-Blatt beendet die Machtringe wie das Bot-Blatt. Die KI hatte „gegenüber" genauso in
  Zeile/Spalte gespiegelt wie die Bots bis v74; `kiFlankPlans` fragt jetzt `hexOpposite`.
  Gründen als eigene Aktion ist nur Oberfläche (`foundCity` unverändert) – die KI braucht
  dafür nichts Neues.

**Abgesichert:** `test.js`, Block „KI" – Regeln für Menschen (Fähigkeit, Macht, Ereignisse,
Wunder), neun volle Partien in allen Aufstellungen ohne Ausnahme und ohne Zug über 2 s,
Wiederholbarkeit, Fairness (Würfelstrom, `S.evNext`, verdecktes Legen), Punktvergleich;
Flanke über die Diagonale und jeder Flankenplan aus echten Partien nach `canFlank`;
Siedelplätze der KI = `foundSiteError`/`foundCost` Feld für Feld; `reachable` gegen die alte
Fassung; die Siegschwellen. `smoke.js` – Aufbau, KI-Züge mit „Weiter" (auch: Erträge aus
Sicht des Menschen, kein Gründungsmodus), Legephase, Englisch, „Nochmal spielen".
Gegenprobe: mit der alten Spiegelung schlagen die Flankentests an.

### Machtringe: ein Teilstück je Punkt (v76)

Auf Wunsch des Autors: jeder Punkt ist ein eigenes Stück des Rings – eine Stadt mit
Verteidigung 1 und Angriff 2 trägt drei Stücke, eines in der Farbe des Verteidigers, zwei
in der des Angreifers. Nur `powerRing` in `js/ui.js` hat sich geändert (dazu Legende
deutsch/englisch); `powerView` und alle Regeln sind unberührt.

- Über den Anteilen liegt je Punkt ein heller Trennstrich (`data-strich`), feiner, je
  mehr Punkte es sind. Die Werte sind ganze Zahlen, Reichsgrenzen fallen also auf Striche.
- **Obergrenze `RING_MAX_PUNKTE` = 60:** darüber nur der Anteil mit Grenzstrichen
  zwischen den Reichen (`data-grenze`), wie bis v75. Gemessen an 60 Bot-Partien liegen
  99 % der Stadtringe, 93 % der Ringe bedrohter Städte und alle Armeeringe darunter
  (Tabelle in `ANNAHMEN.md`). Bedrohte Städte haben im Median 22 Punkte – dort liest man
  in der Praxis den Anteil, abzählen lohnt bei Armeen und kleinen Städten.
- **0 Punkte** (Armee mit Macht 0, niemand flankiert): leerer Ring, nur die Kanten in der
  Besitzerfarbe. Bis v75 war er voll.

**Abgesichert:** `smoke.js` (Machtschritt) – jede Stadt und jede Armee trägt genau so
viele Striche, wie ihr Ring Punkte hat, auch nach einem Machtkauf; das Beispiel des
Autors (1 gegen 2) ergibt drei Striche bei 0°, 120° und 240° und die Anteile ⅓/⅔; über 60
Punkten keine Striche, aber zwei Grenzen (ein voller Ring: keine); 0 Punkte → leerer
Ring. Gegenproben (keine Striche, einer zu viel, um ein halbes Stück versetzt, Grenzen
fehlen, Obergrenze ignoriert, 0 Punkte wieder voll) schlagen jeweils genau dort an.

### Kartenansichten, Gründen in der Leiste, Flankieren diagonal (v75)

Drei Wünsche aus einer Testrunde, vorab mit dem Autor abgestimmt; Einzelheiten und
Auslegungen in `ANNAHMEN.md` (Abschnitt „Kartenansichten und Gründen als eigene Aktion").

- **Erträge** (`a-yields`, Umschalter, `hochciv.yields`): je Feld bis zu drei Chips,
  Wissenschaft blau, Nahrung grün, Münzen gold, gerechnet mit `tileYieldAt` für den
  Zuschauenden (`viewerOf`: beim Bot-Zug der Mensch). Reine Ansicht – auch im Tutorial und
  im Bot-Zug bedienbar, deshalb nicht in `TUT_BAR`.
- **Stadt gründen** (`a-found`, `ui.mode = 'found'`): Kosten auf jedem möglichen Platz,
  rot bei zu wenig Nahrung, Unmögliches abgeblendet, dazu die Erträge. Tipp → `foundSheet`
  mit Kosten, Ertrag beim Siedeln und **Hier gründen**. Das Feldblatt gründet nicht mehr
  (nur ein Hinweissatz). In der Regelmaschine: `canFound` geteilt in `foundSiteError`
  (Platz) + Nahrung; `withFoundTable` rechnet für das Zeichnen die Wege einmal vor.
- **Machtansicht** (`ui.powerView`, nur solange das Machtblatt offen ist): Ringe aus
  Kreisanteilen in Reichsfarben, ohne Zahl – Stadt: Verteidigung gegen jedes Reich mit
  Armeen in Reichweite; Armee: Machtwert gegen jedes Reich, das sie flankieren könnte.
  Quelle ist `powerView` (engine.js) mit denselben Funktionen wie der Kampf. Jedes andere
  Blatt, Schließen oder ein Feldtipp beendet die Ansicht (`sheet(html, { power: true })`).
- **Tutorial:** die drei Gründungsschritte laufen über die Leiste – neue Aufgabe und im
  Langtext von 4/29 der neue Weg (deutsch und englisch), Schienen `bar: ['a-found']`,
  `labels: [/Hier gründen/]`. Der Ablauf (Würfel, Bots) ist unverändert; `test.js` fährt
  ihn weiter zweimal auf Gleichheit.
- **Fehler behoben – Flankieren „gegenüber":** gespiegelt wurde in Zeile/Spalte; im
  versetzten Raster stimmt das nur Ost–West. Nordwest–Südost und Nordost–Südwest
  flankierten nicht, dafür Nordost+Südost (gerade Zeile) bzw. Nordwest+Südwest (ungerade).
  Aufgefallen beim Herauslösen von `canFlank`; ein alter Testkommentar hielt es sogar fest
  („liegt in odd-r nur waagerecht") und stellte die Flanker deshalb waagerecht. Jetzt
  `hexOpposite` (Würfelkoordinaten) in `canFlank` und in beiden Bot-Stellen
  (`botFlankOk`, Priorität 8). Gemessen: 200 Bot-Partien, Flankierungen 226 → 237,
  Militärsiege 161 → 169, Spielende im Median gleich (Runde 6).

**Abgesichert:** `test.js` – alle 15 Nachbarpaare in gerader und ungerader Zeile (genau die
drei Gegenüber flankieren), Taktik, Raketentechnik auf Distanz 2, Bot stellt sich diagonal
gegenüber; `canFound` = Platzprüfung + Nahrung auf jedem Feld; Wegtabelle = Einzelsuche
(864 Felder, vier Technikstände); `powerView` für Städte (zwei Armeen addieren sich,
ausgeschiedene Reiche zählen nicht) und Armeen. `smoke.js` – Chips Feld für Feld gegen
`tileYieldAt`, Kostenmarken Feld für Feld gegen `foundSiteError`/`foundCost`,
Gründungsblatt (Siedelertrag, Gründe, knappe Nahrung), Modus endet nach dem Gründen;
Machtringe: Anteil = Verteidigung/(Verteidigung + Angriff), wächst beim Kauf, verschwindet
beim Schließen, Feldtipp und Armeeblatt; Tutorial-Audit und -Durchlauf über die neue Leiste,
auch auf Englisch. Gegenproben (alte Spiegelung, Tabelle um eins daneben, Angriff nur einer
Armee, fehlende Marken/Ringe, falscher Zuschauer) schlagen jeweils an. Nebenbei: der
Smoke-Schritt „Leseschritte erlauben gar keine Aktion" prüfte seit jeher den
Gründungsschritt statt Schritt 2 (er blätterte nicht zurück) – korrigiert.

### Alternativer Techtree: drei Kosten der Industrialisierung (v74)

Auf Anweisung des Autors: im alternativen Techtree kosten **Chemie 11, Biologie 12,
Wissenschaftliche Methode 15** (Standard 12/15/11). Drei Einträge mehr in `ALT_TECH_COSTS`
(`js/data.js`), sonst kein Code: Leiter, Bogen, Regelbogen, Aufbauhinweis, Weltblatt,
Kopierpreise und Bot-Würfe lesen alle über `techBase`/`techsIn` bzw. `altTreeText`. Die
Leiter Forschung/Industrialisierung heißt im alternativen Techtree jetzt Chemie,
Biologie, Elektrizität (13, unverändert), Wissenschaftliche Methode. Alle drei Werte
bleiben im Zeitalter (11–15), `t.age` stimmt also weiter. Der Standard und das Tutorial
(immer Standard, „kostet 11" im Text) sind unberührt.

**Abgesichert:** `test.js` – die neun Werte, beide Leitern der Industrialisierung, „alle
übrigen Leitern gleich" (jetzt ohne Forschung/Industrialisierung), Kosten mit
Griechenland (12/8/9) und mit Wissenschaftlicher Methode (Chemie 5, Biologie 6),
Kopierpreise (Spionage 15/11/12, Kundschafterei 30/22/24). `smoke.js` – Aufbauhinweis,
Bogen (Spalte Forschung/Industrialisierung samt Kosten), Bogen der Legephase,
Regelbogen, und der Standard ohne Häkchen. Gegenprobe mit den Werten von v73 schlägt an.

### Plättchenmodus: eine Reihe näher, dominierte Startfelder, Grenzen am Rand (v73)

Vier Anweisungen des Autors auf einmal; Einzelheiten und Messungen in `ANNAHMEN.md`
(Abschnitt „Legephase eine Reihe näher …" am Ende und „Hauptstadt „frei"").

- **Internet-Gratiskachel** zeigt jetzt die Wirkung der Technologie (`techEffect`) statt
  „Internet · Gratiskopie"; das Preisfeld „gratis" läuft über `T()` (englisch „free").
- **Reichsgrenzen um leere Sechsecke:** `controlledTiles` schließt `X` aus (vorher nur Felder
  außerhalb des Rasters). Eine Stadt am Rand der Plättchenkarte oder am Loch zog ihre Grenze
  sonst um die `X`-Felder dahinter. `buyTile` lehnt `X` ebenfalls ab. Folge für Bots:
  Priorität 9 („an den Rand des Reichs") sieht den Kartenrand jetzt als Rand, wie auf den
  festen Karten.
- **Eine Reihe näher (2 und 4 Reiche):** `seatFreeCells` hat zwei Bedingungen statt „3 Felder
  Abstand zu fremden Startplättchen": mindestens 2 Felder (`PLACE_MIN_GAP`), und kein echtes
  Feld darf Umland dieser und einer möglichen fremden Hauptstadt sein (Löcher zählen nicht).
  Erlaubt: 2 Reiche 15 (vorher 14), 3 Reiche 15 (unverändert), 4 Reiche 13 (vorher 11). Im
  1 gegen 1 dürfen die Hauptstädte an der Mitte 2 auseinander liegen – geteilt wird nur das
  Loch. Bei 4 Reichen bleiben die Ecken am offenen Mittelplättchen gesperrt, weil sich zwei
  Hauptstädte dort dessen Spitze teilten (Offener Punkt 11).
- **Dominierte Startfelder** bekommen einen rötlichen Rand (`OVERLAY.dom` in `drawMap`,
  eingerückt innerhalb des goldenen Rahmens), dazu eine Legende in der Hinweiszeile.
  Dominiert = ein anderes erlaubtes Feld, **auch in einer anderen Lage**, bringt von einem
  Ertrag mehr und von keinem weniger (Offener Punkt 12). Maßstab ist die Ertragsübersicht,
  gerechnet in `placeYieldAt` (tiles.js, aus `placeYield` in ui.js herausgelöst); die
  Oberfläche rechnet die Tabelle einmal je Sitz (`placeInfo`, 3 × 15 Wegwerf-Partien, gut
  15 ms in Node). Nebenbei entfallen: der Hinweis „– noch verdeckte Nachbarfelder kommen
  dazu", der nur am Kartenrand und am Loch erschien, wo nie etwas dazukommt.

**Abgesichert:** `test.js` – Umland über alle Paare erlaubter Felder, die Zahlen 15/15/13,
„jedes bis v72 erlaubte Feld bleibt erlaubt", `yieldBeats`/`dominatedCells` an einer festen
Tabelle, **Vorschau = echtes Einkommen** für 580 Wahlmöglichkeiten (echte Partie gestartet,
auch mit Seemacht), jedes Randfeld jeder Form mit einer gedachten Stadt, `buyTile` auf `X`.
`smoke.js` – rote Ränder Feld für Feld gegen `dominatedCells` in allen drei Lagen, Legende,
Ertragszeile; die gezeichnete Reichsgrenze am Rand und am Loch Linie für Linie; die
Gratiskachel auf Deutsch und Englisch. Gegenproben (alter `controlledTiles`, alte
Platzregel, Regel ohne Umlandbedingung, fehlende Markierung, alter Kacheltext) schlagen
jeweils an der vorgesehenen Stelle an. Sichtkontrolle in Chromium.

### Kolonialismus 3 Münzen, Kundschafterei 2× – in beiden Techtrees (v71 → v72)

Auf Anweisung des Autors: Kolonialismus kauft ein Feld für **3** statt 5 Münzen,
Kundschafterei kopiert zum **Doppelten** statt zum Dreifachen der Grundkosten. v71 hatte
beides nur in den alternativen Techtree gelegt (die Anweisung nannte keinen Ort); der Autor
hat klargestellt: **beide Techtrees, der alternative unterscheidet sich nur in den
Forschungskosten.** v72 stellt das so her.

**Wie es gebaut ist:** zwei Einzelwerte in `js/data.js`, `COLONY_COST = 3` und
`SCOUTING_RATE = 2`. `buyTile` zahlt `COLONY_COST` und nennt den Preis im Protokoll,
`copyRate(p)` liefert für Kundschafterei `SCOUTING_RATE`, der Kaufknopf im Feldblatt zeigt
`COLONY_COST`. Die Techtexte stehen wieder fest in `TECHS` und `DATA_EN` (die v71-Sonderfälle
in `techEffect` und ihre `UI_EN`-Schlüssel sind entfallen); ein Test hält Text und Wert
zusammen, in beiden Sprachen. Kopiert wird zu den Grundkosten der Partie (`techBase`).

**Abgesichert:** `test.js` prüft Feldpreis, Protokoll und „zu wenig Münzen" in beiden
Techtrees, den Kopierfaktor im Standard (auch die älteren Prüfungen 2×5 und 2×1) und im
alternativen Techtree (Schrift 8), Spionage vor Kundschafterei und die Texte beider
Sprachen. `smoke.js` kauft in beiden Techtrees ein Feld über das Aktionsblatt („3🪙", 3
Münzen abgebucht) und prüft, dass der Aufbauhinweis nur Kosten nennt. Gegenproben (alter
deutscher bzw. englischer Text, fester Preis 5, fester Faktor 3) schlagen jeweils an.

### Alternativer Techtree (v70)

Auf Anweisung des Autors. Ein Häkchen **„Alternativer Techtree"** im Aufbau, je Partie, ab
Werk aus – **kein Modul**, die Zeile steht immer da. Angehakt gelten andere Grundkosten:
Forschung Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4; Produktion Bewässerung 1,
Landwirtschaft 5. Alles in der Antike, Feld und Wirkung bleiben. (Seit v74 dazu drei in
der Forschung der Industrialisierung, siehe oben.)

**Wie es gebaut ist:** eine Tabelle `ALT_TECH_COSTS` und eine Funktion `techBase(S, t)` in
`js/data.js` – die Grundkosten dieser Partie, vor Vergünstigungen. `techsIn` sortiert danach,
`techCost` und das Kopieren rechnen damit, der Regelbogen zeigt sie. Der Schalter steht als
`S.altTree` im Spielstand und als `altTree` im Rezept; beide Startwege (`setup-go` und
`startFromRecipe`) geben ihn weiter, ebenso die Wegwerf-Partien der Legephase (`rollSetup`
über die cfg, `placeTechView` ausdrücklich). Das Zeitalter kommt weiter aus den
Standardkosten (`t.age`) – ein Test verbietet Werte jenseits der Zeitaltergrenze.

**Folgen, die man kennen sollte:** Alle Würfe auf „die n-te Technologie einer Leiter"
(Verfügbarkeit, Bot-Forschung) folgen der neuen Leiter; derselbe Seed kann also andere
Starttechnologien ergeben. Griechenlands −1 und die Wissenschaftliche Methode setzen auf die
neuen Kosten auf. Die Gratis-Listen (Freie Forschung, Rückschau, Bibliothek/Oxford/Raumfahrt)
zeigen keine Kosten und bleiben in der Reihenfolge von `TECHS`. Tutorial immer Standard.

**Abgesichert:** 26 Prüfungen in `test.js` (Block „Alternativer Techtree (v70)" vor „1 gegen
1"), 7 Schritte in `smoke.js` (Aufbau, Englisch, Bogen, Regelbogen/Weltblatt/Protokoll,
„Nochmal spielen", Legephase, zurück zum Standard). Gegenproben: je eine absichtlich kaputt
gemachte Stelle (Sortierung, `techCost`, Kopierpreis, Schalter in `newGame`, Bogen der
Legephase, Regelbogen, Rezept) schlägt jeweils an der vorgesehenen Stelle an. Im Standard
sind Tutorial-Durchlauf und alle bisherigen Prüfungen unverändert grün. Sichtkontrolle in
Chromium: Bogen und Aufbau wie gewollt.

### Ökologie: +1 auf alle Erträge (v69)

Auf Anweisung des Autors. Vorher „Städte: +1 Nahrung / 2 Bevölkerung (abrunden)", jetzt
„Städte: +1 auf alle Erträge / 2 Bevölkerung (abrunden)" – je Stadt ⌊Bevölkerung / 2⌋ auf
Wissenschaft, Nahrung und Münzen. Geändert: eine Schleife in `incomeBreakdown`
(`js/engine.js`), der Techtext in `js/data.js` und in `DATA_EN.tech` (`js/i18n.js`).

**Bewusst gleich geblieben**, weil der Posten weiter in der Bevölkerungszeile steht:
Abrunden je Stadt (5 + 3 → 2 + 1, nicht 4), Verdopplung durch Bürokratie in der
Hauptstadt, Ausfall bei Revolution, und der Nahrungsanteil senkt `popFoodCost` wie bisher.
Die Nahrungsspalte ist in jedem geprüften Fall Zahl für Zahl die alte (Messung alter gegen
neuer Stand: Bevölkerung 1–8, zwei Städte, Bürokratie, Revolution, Hungersnot,
Wirtschaftskrise, Bot). Bots bekommen Ökologie wie jede Grundtechnologie. Neu als Folge: der
Wissenschaftsanteil zählt beim Nahrungsposten der Gentechnik mit.

**Abgesichert:** 14 neue Prüfungen in `test.js` (Block „Ökologie (v69)" hinter der
popFood-Prüfung). Gegenprobe mit dem alten Stand: 10 schlagen an, die übrigen vier halten
fest, was gleich bleiben soll (Bevölkerung 1, `popFoodCost`, Zeilensumme, Revolution).
Die zwei Tutorialstellen, die Ökologie als Nahrungstechnologie nennen, stimmen weiter und
sind unverändert.

### Aufräumen nach den Regeländerungen (v67)

Kein Verhalten geändert, abgesichert über `test.js` und `smoke.js`.

- **Sieben verwaiste Übersetzungen entfernt.** Ihr deutscher Satz stand nirgends mehr im
  Quelltext, sie wurden also nie nachgeschlagen: eine Rasterkarte, die es seit v50 nicht
  mehr gibt, ein gestrichener Aufbau-Hinweis, drei alte Tutorialtitel und zwei alte
  Tutorialabsätze. Gefunden über einen Mitschrieb aller `T()`-Anfragen während eines
  vollen `smoke.js`-Laufs, gegengeprüft gegen den Quelltext.
- **Neue Ratsche in `test.js`:** höchstens zwei verwaiste Schlüssel. Die zwei sind die
  Flaggen in der Zeile der Symbol-Identitäten (🔬🌾🪙 …), die Fehlmeldungen von `T()`
  abfängt — `langRow` nimmt die Flaggen direkt aus `LANGS`, ohne `T()`. Die Zahl darf
  sinken, nicht steigen.
- Unbenutzte lokale Variable in `botPlanArmies` entfernt.

### Plättchenmodus: erst würfeln, dann legen (v66)

Auf Anweisung des Autors. Verfügbare Technologien und Wunderstapel werden **vor** der
Legephase ausgewürfelt (`rollSetup` in `engine.js`), damit jeder sein Startplättchen mit
dieser Kenntnis legt. In der Legephase zeigt der Knopf **Forschung** denselben
Technologiebogen wie im Spiel, nur ohne Knöpfe (`techBoardHTML(..., { plain: true })` –
aus `techModal` herausgelöst, beide benutzen jetzt dieselbe Funktion), dazu die
Wunderstapel der Stufen 1 und 2.

Das Ergebnis geht als `cfg.avail` (nach PLATZ) und `cfg.wpool` in `newGame`, das es
übernimmt statt neu zu würfeln. `initWonderPools(S, vorab)` nimmt dafür einen zweiten
Parameter. Nur der Plättchenmodus geht diesen Weg; feste Karten haben keine Legephase.

Beschriftet werden die Knöpfe der Legephase nicht eigens: `applyStaticLang()` übersetzt
den Text aus `index.html` beim Sprachwechsel mit. (In v66 stand hier zunächst, `pl-rot`
bliebe auf Englisch deutsch — das war falsch, gemessen an einer Probe mit `switchLang`;
die dafür eingebauten `textContent`-Zeilen sind wieder raus.)

### Gentechnik und Massenmedien neu (v64/v65/v66)

Auf Anweisung des Autors geändert, mit Tests festgeschrieben.

**Massenmedien:** eine Münze ernährt jetzt **drei** Bevölkerung statt einer (v64: fünf)
(`FEED_COIN_RATE` in `data.js`). Es bleibt reines Füttern – gedeckt wird nie mehr, als die
Bevölkerung tatsächlich isst, und es ist weiter kein Kurs in `rates()`. Die letzte Münze
darf teilweise verfallen (3 offene Kosten kosten auch eine ganze Münze); mehr Münzen als
nötig lässt `coverPop` nicht zu. Dafür trägt der Spielstand jetzt zwei Zahlen je Quelle:
`popCoveredBy` = gedeckte Kosten, `popSpent` = eingesetzte Einheiten. Ein Spielstand aus
v63 bekommt `popSpent` aus `popCoveredBy` (damals Kurs 1:1) und lässt sich normal
zurücknehmen.

**Gentechnik kann beides** (v65): sie **füttert weiter aus Wissenschaft, unverändert 1:1**,
und bringt zu Zugbeginn **zusätzlich je vier Wissenschaft eine Nahrung** ins Einkommen
(`GENE_SCI_PER_FOOD`), als eigene Zeile in `incomeBreakdown`. `canFeed` prüft also weiter
beide Techs, die Nahrungsgrenze hebt Gentechnik nach wie vor auf.
Die Wirkungen rechnen nicht gegeneinander: der Einkommensposten hängt an der Wissenschaft,
die anfällt, das Füttern an der, die noch da ist — Verfüttern verkleinert den Posten nicht
nachträglich. In v64 war das Füttern kurzzeitig weg; seit v65 steht beides nebeneinander.

**Mitgezogen:** Techtexte (deutsch und englisch), der Absatz im Regelbogen, der
Tutorialschritt zur Nahrungsgrenze, das Nahrungsblatt (es zeigt jetzt den Kurs und auf dem
Knopf, was die Münzen **wirklich** decken) und die Zugbeginn-Meldung.

### Grenzen sperren, die Luftwaffe fliegt darüber (v63)

Auf Anweisung des Autors geändert, mit 27 neuen Assertions festgeschrieben (`test.js`,
Abschnitte „Was sperrt den Siedlerweg" und „Luftwaffe bei der Armeebewegung").

**Siedeln.** Unpassierbar sind jetzt zusätzlich **gegnerisches Territorium**
(`foreignTerritory`: Stadtumland und gekaufte Felder anderer, noch lebender Reiche) und
**gegnerische Städte** — vorher sperrten nur gegnerische Armeen, Vulkane und Wasser ohne
Technik. Ein Feld, das auch im eigenen Gebiet liegt, sperrt nicht. Gilt für Bots genauso
(`botSettlerPass` in `bots.js`), sonst wäre die Sperre ein einseitiger Nachteil des
Menschen. Die Meldung nennt den Grund getrennt: Wasser, Gebiet oder Gelände.

**Luftwaffe.** Sie überfliegt Vulkane, gegnerische Armeen, gegnerische Städte und Grenzen —
beim Siedeln als vollwertiger Weg, bei der Armee **nur als Durchflug**: anhalten darf sie
dort nicht. Dafür ist `canPass` (durchqueren) von `canStop` (anhalten) getrennt; `armyReach`
filtert Ziele über `canStop`, also greift die Trennung auch bei den Bots. Gesperrt bleiben
für alle: eigene Armeen, eigene Städte und Kartenlöcher (X).

**Aufwand:** keiner, der auffällt. `test.js` 12,2 s → 12,9 s, `smoke.js` 45,0 s → 46,9 s.
Das gegnerische Gebiet wird einmal je Wegsuche berechnet, nicht je Feld; die
Grundermittlung für die Meldung läuft nur, wenn schon feststeht, dass es keinen Weg gibt.

## Verifikationsmethoden (etabliert, unbedingt beibehalten)

1. **`node test.js`** muss grün sein — 1551 Assertions, darunter die Rechnungen aus dem
   Regelheft-Beispiel, ein Test je geänderter Regel, 40 Bot-Partien, 40 mit Erweiterungen,
   20 Mensch-Partien, 20 Duelle, der komplette Tutorial-Durchlauf (zweimal, auf Gleichheit).
2. **`node smoke.js`** fährt die echte UI durch jsdom (140 Schritte), inklusive
   Tutorial-Audit: in jedem der 29 Schritte wird geprüft, dass **nur** das Vorgesehene
   anklickbar ist — und dass überhaupt etwas anklickbar ist (beide Richtungen!).
3. **`python3 build_single.py && node check_single.js`** — Einzeldatei bauen und prüfen.
4. **Visuelle Kontrolle:** `playwright` (chromium) für die echte Oberfläche,
   `cairosvg` für SVG-Karten, dann mit dem `view`-Tool ansehen. Beides ist installiert;
   `playwright install` schlägt fehl, der mitgelieferte Chromium funktioniert trotzdem.
5. **Immer reproduzieren, nicht raten.** Die erste Vermutung war wiederholt falsch: der
   „leere Toast" war das geschlossene Aktionsblatt; die Wikinger-Fähigkeit war nicht kaputt,
   sondern kam eine Runde zu spät; mehr Forschungssiege mit Weltwundern waren Rauschen
   (60 Partien zu wenig, über 300 identisch). Zuletzt: „Eisenbahn ohne Rad" waren **zwei**
   Fehler, und der naheliegende Ein-Zeilen-Fix hätte nur den ersten behoben.
6. **Messen statt behaupten.** Bei Balance- und Häufigkeitsaussagen mit ausreichend großen
   Stichproben arbeiten und die Zahl nennen.
7. **KI messen mit `tools_ki.js`** (seit v77): gleiche Befehlszeile, gleiche Zahlen.
   Stufen immer **gepaart** vergleichen (`stufen`, druckt auch die Siege je Startspieler):
   im Duell gewinnt sonst vor allem der Startspieler (KI gegen KI gleicher Stärke 60–80 %),
   und das überdeckt jeden Unterschied. Eine Änderung, die kein Ergebnis ändern soll
   (Tempo), mit alter und neuer Fassung auf denselben Startwerten laufen lassen und die
   Protokolle vergleichen – so in v78 geprüft.

## Oberfläche und Regeln (Stand 22.8.)

- **Die Karte ist fest** — kein Zoomen, kein Schieben, immer vollständig sichtbar. Getippt
  wird direkt auf dem Sechseck (`attachTaps`, `data-r`/`data-c`), nicht über eine
  Koordinatenrechnung. Gilt auch für den Karteneditor.
- **Querformat:** Manifest `orientation: landscape`, dazu `screen.orientation.lock` wo
  vorhanden. **Auf iOS greift beides nicht** — dort dreht `html.turn` die App im Hochformat
  selbst um 90°. Abschaltbar im ☰-Menü. **Gedreht wird nur `screen-game`** (Liste
  `TURN_SCREENS`, nachgeführt aus `show()` über `applyTurn()`); Menü, Aufbau und Editor
  bleiben in der Lage, in der das Gerät gehalten wird.
- **`syncLayout()` statt Media Queries** für alles Layoutkritische: gedreht messen Media
  Queries den falschen Viewport. Klassen auf `<html>`: `w-wide`, `w-side`, `w-narrow`.
- **Das Aktionsblatt endet über der Leiste** (`--bar-h` aus `setBarHeight()`), sperrt sie
  also nicht mehr. `body.blocked` gilt nur noch fürs Bot-Fenster.
- **Tutorial:** erledigte Aufgaben schalten selbst weiter (`tutMaybeAdvance`,
  `TUT_AUTO_MS`); das Panel steht quer links neben der Karte.
- **Protokoll:** Würfe hängen eingeklappt an ihrer Aktionszeile (`logHtml`/`rollsBlock`).
- **Handelsrouten** (`tradeRoutes` in `engine.js`): Städte, die über einen durchgehenden
  Weg an der Hauptstadt hängen, bringen +1 (Straße) bzw. +2 (reine Eisenbahn) auf alle
  Erträge. Zwei getrennte Suchen — daher greift die Mischungsregel von selbst.
- **Nahrung:** Die Bevölkerungskosten (`popFood`) lassen sich mit Gentechnik/Massenmedien
  aus Wissenschaft oder Münzen bestreiten (`coverPop`/`uncoverPop`), höchstens bis zur
  Höhe der echten Kosten. Das Fenster (`foodSheet`) geht zu Zugbeginn auf.
  `ensureFoodState` zieht die Felder in alten Spielständen nach.
- **Feldblatt:** Feldertrag klein in der Unterzeile; **Ertrag beim Siedeln**
  (`settleGain` in `engine.js`) als Kästchen — aber nur, wo auch gegründet werden kann.
- **Technologiebogen:** verfügbare Kacheln sind grafisch geteilt in bezahlbar (`afford`,
  durchgezogen) und zu teuer (`costly`, gestrichelt). Maßstab ist `available(…, 'sci')`,
  Münzen zählen also über den Umrechnungskurs mit. **`costly` darf keine Deckkraft unter 1
  bekommen** – sonst verblasst der rote Rand und die Kachel sieht aus wie eine nicht
  verfügbare (ein Smoke-Test prüft das).

Alles Weitere steht ausführlich in `ANNAHMEN.md` — dort ist jede Änderung mit
Begründung und Messung festgehalten, chronologisch nach Versionen.

## Bekannte Fragilitäten

- **`sw.js`-Version** nach *jeder* Änderung hochzählen, sonst behält das installierte iPad
  den alten Stand.
- **Feste Spielerreihenfolge** Russland → Griechenland → England → Wikinger. Die gewünschte
  Zivilisation landet nicht automatisch auf Index 0; Test-Helfer `normalize()` sortiert um.
  `cfg.startPlayer` zeigt in die **Aufbau-Liste** (CIVS-Reihenfolge), nicht in die Zugreihenfolge.
- **Runde und Ereignis** wechseln beim **Startspieler** (`S.startIdx`), nicht bei Index 0.
- **`hasWonder` heißt „wirkt für dieses Reich"** und ist für Bots immer falsch; für reines
  Eigentum gibt es `ownsWonder`.
- **Tutorial-Schienen:** Ein fehlender Schlüssel in `allow` heißt „nichts erlaubt". Wer neue
  Schritte hinzufügt, muss `bar`, `labels`, `techs`, ggf. `hex`/`moveTo` setzen — sonst ist
  der Schritt eine Sackgasse (das Smoke-Audit meldet beides).
- **Mehrere Kosten immer über `payAll`/`affordAll`.** Zwei einzelne `available`-Prüfungen
  gegen denselben Vorrat sind falsch, weil sich die Ressourcen ineinander umtauschen
  lassen. Und der Rückgabewert von `pay` gehört ausgewertet.
- **Die Oberfläche darf Regelentscheidungen nicht selbst herleiten.** Zweimal derselbe
  Fehler: `payOpts` (Bürgerkrieg) und `roadTarget` (Eisenbahn ohne Rad). Wer im Blatt eine
  Bedingung schreibt, die die Regelmaschine auch kennt, muss deren Funktion benutzen.
- **Jede neue Kaufprüfung in der Oberfläche muss `payOpts(S, pi)` mitgeben**, sonst
  weicht sie von dem ab, was `pay()` tatsächlich erlaubt (das war der Bürgerkriegs-Fehler).
- **Smoke-Tests, die auf einem frischen Spiel aufsetzen, müssen ihre Ausgangslage selbst
  herstellen** (Nahrung, Wissenschaft, Verfügbarkeit setzen). `frischesSpiel()` würfelt
  Startreich und Technologieverfügbarkeit aus; zwei Tests hingen daran und schlugen in
  etwa der Hälfte der Läufe fehl (gefunden und behoben am 21.8.). Neue Tests deshalb
  mehrfach laufen lassen, nicht einmal.
- **`TUT_AUTO_MS`** steht in den Tests auf 0, damit das Auto-Weiterschalten synchron
  prüfbar ist. Wer den Tutorialteil von `smoke.js` umbaut, darf nicht mehr blind
  `tut-next` klicken — der Schritt ist nach einer erledigten Aufgabe schon weiter. Der
  Index kommt aus `tut-count`.
- **Gedrehte Darstellung und Media Queries** vertragen sich nicht. Neue layoutkritische
  Regeln gehören an `w-wide`/`w-side`/`w-narrow`, nicht an `@media (min-width…)`.
- **`hidden` allein versteckt nichts, was in `style.css` ein `display` bekommt** (v58).
  `[hidden] { display: none }` steht nur im Bogen des Browsers und verliert gegen **jede**
  Autorenregel, auch gegen `.row { display: flex }`. Seit v58 steht deshalb ein globales
  `[hidden] { display: none !important }` ganz oben in `style.css` — wer es entfernt, bringt
  jede versteckte Zeile im Aufbau zurück. Achtung auch beim Testen: `el.hidden` prüft die
  **Eigenschaft** und war die ganze Zeit korrekt, während die Zeile sichtbar blieb.
- **`resolveRandom` zieht nur aus dem, was frei ist.** Auf den festen Karten sitzt jede
  Zivilisation genau einmal; bei vier Reichen bleibt für einen einzelnen `zufall`-Platz
  genau eine übrig — nämlich seine eigene alte. „Nochmal spielen" tauscht deshalb selbst
  (ziehen aus allen vier, Halter bekommt die alte) statt `zufall` zu setzen. Wer daran
  etwas ändert, prüft das über viele Läufe, nicht über einen: ein Zufall, der immer
  dasselbe liefert, sieht bei einem Lauf richtig aus (`smoke.js` fährt 16).
- **Wunderwirkungen bekommen ihre Stadt (`city`), Warteschlangen müssen sie sich merken.**
  `applyWonderEffect(S, pi, city, w)` weiß, wo gebaut wurde — `spawnFreeArmies(S, pi)` nicht,
  weil es auch nach jeder Armeebewegung und zu Zugbeginn läuft. Wer eine Wirkung baut, die
  über den Bauzug hinaus nachwirkt, legt den Ort in den Spielerzustand (Vorbild:
  `p.freeArmyCity` beim Koloss). Ein Parameter am Aufruf reicht nicht: er wirkt nur beim
  ersten Mal. Und: Tests für ortsabhängige Wirkungen dürfen **nicht** in der Hauptstadt
  bauen, sonst sind sie blind (genau das verdeckte den Koloss-Fehler).
- **Neue Aktionen brauchen einen KI-Kandidaten** (seit v77). Die KI kennt nur, was in
  `kiCandidates` steht. Wer eine Aktion in die Oberfläche einbaut, baut sie auch dort ein –
  sonst benutzt die KI sie nie, und kein Test fällt auf.
- **Sitzart abfragen: `isAuto(p)` für „zieht von selbst", `p.kind === 'human'` nur für
  echte Menschen** (seit v77). Regeln, die `kind === 'bot'` prüfen, lassen die KI
  automatisch unter die Regeln für Menschen fallen – so soll es sein. Wer dagegen
  `kind === 'human'` prüft, schließt die KI aus; das ist nur für „Nochmal spielen" richtig
  (`humanSeats`), nicht für Regeln.
- **Die KI rechnet auf Kopien mit eigenem Zufall** (`kiClone`, seit v77). Eine Regelfunktion,
  die direkt `Math.random` benutzt statt `d6`/`nextRand`, würde das umgehen. Und wer
  `S.evNext` ohne Orakel irgendwo liest, macht die Fairness-Prüfung in `test.js` rot.
- **Die KI erwartet von Menschen mehr als von KI und Bots** (`kiDetermined` fragt
  `kind === 'human'`, seit v78): gegen Menschen rechnet sie mit dem entschlossenen Angreifer –
  seit v79 nur im Ernstfall (laufende Belagerung), vorher mild wie gegen alle. Wer eine neue
  Sitzart einführt, entscheidet dort, wie die KI ihr begegnet.
- **Jede Armeebewegung läuft über `arriveAt`** (seit v80): dort endet die Bewegung beim
  Betreten einer Kontrollzone (`army.halted`, zurückgesetzt in `beginTurn` und zu Beginn
  des Bot-Zugs). Wer Armeen anderswo direkt versetzt (`a.r = …`), umgeht die Regel – Bots,
  KI-Kopien und `moveArmy` benutzen sie; die Wegsuche nimmt `moveBudget(a)`, nicht `a.mp`.
- **Der Zugablauf fängt Fehler ab** (`sicher` in ui.js, seit v80): ein Fehler im Zug der KI,
  im Kampf oder beim Zugwechsel steht im Protokoll, und das Spiel läuft weiter. Das darf
  keine echten Fehler verstecken – `smoke.js` zählt `UI_ERRORS` als Fehler.
- **Der Regelbogen beschreibt Bewegung, Straßen, Eisenbahn und Kontrollzone** (seit v81, im
  Wortlaut des Autors): Bewegungspunkte, Baupreise, Kosten je Schritt, Handelswege, Reichweite
  der Zone. Wer eine dieser Regeln ändert, ändert den Text in `rulesModal` (und `UI_EN`) mit –
  der Block „Kurzregeln: Bewegung, Straßen, Eisenbahn, Kontrollzone" in `test.js` schlägt an.
- **Plätze an der Stadt hängen an „Armeen stapeln sich nicht"** (`kiAttackSlots`, seit v79):
  jeder Angreifer braucht ein eigenes Feld in Reichweite. Die Reichweiten der Gegner werden
  dafür ohne die Armeen der KI und ohne ihre eigenen gerechnet (`kiEnemyInfo`). Wer das
  Stapeln oder das Durchziehen durch Armeen erlaubt, muss beides anpassen – sonst hält die KI
  Städte für sicher, die es nicht sind.
- **`kiMoveSig` muss alles enthalten, wovon `armyReach` abhängt** (seit v78). Der Planer
  merkt sich Reichweiten über Schritte, solange diese Signatur gleich bleibt (Armeen,
  Städte, Straßen, eigene Technologien, Wunder). Wer eine Bewegungsregel einführt, die an
  etwas anderem hängt (Ereignis, Gelände, das sich ändert …), nimmt es dort auf – `test.js`
  vergleicht gemerkte mit frischen Reichweiten nach jeder Aktionsart der KI.
- **Zwei Stellen der KI rechnen eine Regel nach, statt sie zu fragen** (seit v77), beide
  aus Tempogründen und beide durch einen Test an die Regel gebunden: die Siedelplätze
  (`kiSitesAll`, eine Breitensuche statt einer Wegsuche je Feld – Test gegen
  `foundSiteError`/`foundCost`) und die Paare fürs Flankieren (`kiFlankPlans`, fragt
  `hexOpposite`; Test: jeder Plan steht nach `canFlank`). Wer die Gründungs- oder
  Flankenregel ändert, sieht dort, ob die KI nachziehen muss.
- **Technologiekosten immer über `techBase(S, t)`, nie über `t.c`** (seit v70). `t.c` sind
  seit v82 die Kosten des einzigen Techtrees; im alten (Tutorial und Partien von vor v82,
  `S.oldTree`) weichen neun davon ab. Wer eine neue Stelle baut, die Kosten zeigt,
  vergleicht oder sortiert, und dort `t.c` nimmt, zeigt im Tutorial falsche Zahlen.
- **`S.oldTree` steht in jedem neuen Spielstand, auch als `false`** (seit v82). Daran
  erkennt `migrateState` einen Spielstand von vor v82 (dort hieß der Schalter andersherum
  `altTree`). Wer Spielstände anders lädt als über „Spiel fortsetzen" und „Spielstand
  laden", ruft `migrateState` selbst – sonst läuft eine alte Partie im falschen Techtree.
- **Kosten am Knopf über `costText(Preis, alterText, opts)`** (seit v82): rechnet mit
  `costPaid`, also derselben Rechnung wie das Bezahlen. Wer einen neuen Knopf mit Kosten
  baut, gibt dieselben `opts` mit wie die Zahlung (`payOpts` bei Armee und Macht: im
  Bürgerkrieg zahlt Nahrung mit) – sonst zeigt der Knopf etwas anderes, als abgeht.
- **`CIV_KEYS` (js/civs.js) ist EINE Liste, kein frisches Array je Aufruf.** Der Aufbau
  schreibt an mehreren Stellen in Schlüssellisten (Doppelungen auflösen, Auslosung); wer
  dort die gemeinsame Liste nimmt statt `CIV_KEYS.slice()`, verbiegt sie für die ganze
  Sitzung. `renderSlots` kopiert deshalb. Ein Smoke-Schritt prüft am Ende, dass die Liste
  unverändert ist — er fängt ein `sort()`/`push()`, aber nicht jede denkbare Zuweisung.
- **`tileMap` zählt Hauptstädte nach PLATZ, nicht nach Spieler** (`capitals[seat.idx]`),
  weil auf Plättchenkarten dieselbe Zivilisation zweimal sitzen darf. Wer damit eine Partie
  mit weniger Spielern baut (z. B. die Wegwerf-Partie der Ertragsvorschau), muss die
  Indizes umlegen — `capitalSpot` liest `caps[p.slot]`, und Platz 0 ist dann der einzige,
  der zufällig stimmt. Genau das verdeckte den Fehler bis zum zweiten Menschen.
- **Die Ertragsvorschau der Legephase ist nur genau, weil `seatFreeCells` Bedingung 1 hält**
  (seit v73): das Umland einer erlaubten Hauptstadt liegt nie auf einem verdeckten
  Plättchen. Wer `PLACE_MIN_GAP` auf 1 senkt, macht Vorschau und rote Ränder zu
  Schätzungen – `test.js` schlägt dann an („kein Umland … auf einem fremden
  Startplättchen", „Vorschau = echtes Einkommen").
- **Die Leiste hat zwei Sorten Knöpfe** (seit v75): Aktionen, die das Tutorial bindet
  (`TUT_BAR` in ui.js, auch vom Smoke-Audit gelesen), und den Ansichtsschalter
  „Erträge", der immer frei ist. Wer einen Knopf ergänzt, trägt ihn in `TUT_BAR` ein oder
  begründet, warum nicht – sonst ist er im Tutorial entweder offen oder tot.
- **`withFoundTable` gilt nur innerhalb des Aufrufs und nur für (S, pi)** (seit v75). Wer
  zwischendurch den Spielstand ändert, darf das nicht im Bereich der Tabelle tun – sie
  kennt die Änderung nicht. `foundMarks` liest nur.
- **`X` ist nie Gebiet** (seit v73). Wer eine neue Stelle baut, die Umland oder Nachbarn
  zählt, nimmt `controlledTiles` oder prüft `isOff` – `terrainAt` allein liefert für `X`
  einen Wert und hält es für ein Feld.
- **Effekttexte, die mit der Bevölkerung skalieren, müssen das sagen.** `cityPopYield` wird
  mit der Einwohnerzahl multipliziert; „Stadt: +1 Wissenschaft" war um den Faktor der
  Bevölkerung falsch. Seit v60 heißt es „Je Bevölkerung: …" (Schrift, Universitätswesen,
  Fließband, Robotik, Maschinengewehr).
- **`S.recipe` ist die rohe Aufbauwahl, nicht die aufgelöste.** Wer dort das aufgelöste
  `players` ablegt, macht „Nochmal spielen" zu „genau dasselbe nochmal". Die Regeln lesen
  das Rezept nie; es gehört der Oberfläche.
- **Tutorial-Determinismus** hängt an drei Dingen zusammen: feste Würfelfolge `TUT_DICE`,
  vorgegebene Würfe je Schritt (`dice`) und die Schienen. Ändert sich die Engine an einer
  Stelle, die Würfe verbraucht, verschiebt sich der ganze Ablauf — dann die Textstellen
  prüfen, die Bot-Verhalten beschreiben, und ggf. eine neue Würfelfolge suchen (in `test.js`
  ist der Ablauf zweimal auf Gleichheit gepinnt).
- **Fähigkeiten nur über `abilitiesOf`/`hasAbil`/`isAbil` prüfen, nie über `p.ability`**
  (seit v83). Im Marathon steht die Wahl in `p.drafted`, und ein Reich kann fremde
  Fähigkeiten haben. Grundfähigkeiten heißen überall `basis` – `isAbil(p, 'basis')` wirft,
  und `test.js` sucht den Quelltext danach ab. Wer eine Fähigkeit mit Zahlwirkung baut,
  bedenkt, dass zwei zusammenkommen können (Vorbild: `growPrice` nimmt den größeren Faktor).
- **Der Wirtschaftssieg hängt an `markRoundStart`** (seit v83): es hält die Bevölkerung zu
  Rundenbeginn fest (`S.roundPop`, `S.roundPops`) und prüft dort alle. Wer einen neuen Weg
  baut, eine Runde zu beginnen, ruft es mit (`newGame`, `advanceTurn`). Tests, die die
  Bevölkerung direkt setzen, rufen danach `markRoundStart` – `checkVictory` allein rechnet mit
  dem festgehaltenen Stand. Spielstände von vor v83 haben ihn nicht; dann zählt bis zum
  nächsten Rundenbeginn der laufende (`victoryOwn`/`victoryWorld`).
- **Eine neue JS-Datei muss in sieben Listen** (zuletzt `js/marathon.js`): `index.html`,
  `sw.js`, `build_single.py`, `smoke.js`, `test.js` (Lade- und Übersetzungsliste),
  `tools_ki.js` – sonst fehlt sie offline, in der Einzeldatei oder in den Prüfprogrammen.
- **Der Draft zeigt eine Partie ohne Fähigkeiten** (`draftView`, seit v83). Wer in `newGame`
  etwas an Fähigkeiten hängt, sieht es dort nicht – richtig so, gedraftet ist ja noch
  nichts. Die echte Partie entsteht in `draftGo` neu aus `cfg` (gleiche Karte, gleiche Würfe
  über `cfg.avail`/`cfg.wpool`, gleicher Startwert).
- **Der Draftbildschirm dreht sich mit wie das Spiel** (`TURN_SCREENS`): er zeigt die Karte.
- **`tradeRoutes` rechnet mit einer eigenen Stadttabelle** (seit v83, Tempo): wer ändert, wie
  Städte Wege sperren oder als Straße zählen, ändert es dort mit – `effectiveRoad` allein
  reicht nicht. `test.js` vergleicht über eine ganze Marathonpartie mit der Fassung bis v82.

### Gründungskosten (geändert in v51)

`foundCost` rechnet Stadtkosten (1/3/6/10 …) + Distanzkosten. Englands **Kolonisten**
streicht die Stadtkosten, **Kartografie** die Distanzkosten. Beides zusammen kostete bis
v50 pauschal 1 Nahrung – ab der dritten Stadt praktisch gratis. Jetzt zahlt man die
**günstigere der beiden** Kosten, also anfangs die Stadtkosten und später den Weg. Die
Einzelvergünstigungen sind unverändert; der Mindestbetrag von 1 bleibt nur als Sperre
gegen 0-Kosten-Sonderfälle (Reich ohne Stadt).

### Siegansprüche (neu in v51)

- `S.over` wird an **zwei** Stellen gesetzt: sofort in `captureCity` (Militärsieg,
  `military: true`) und am Rundenende in `resolveClaims`. Alles andere geht über
  `claimVictory` – wer eine neue Siegbedingung einbaut, muss `claimVictory` benutzen,
  sonst endet das Spiel wieder mitten in der Runde.
- `resolveClaims` hängt in `advanceTurn` **genau an der Stelle, an der die Runde
  umschlägt** (`S.cur === first`, vor `S.round++`). Wer dort etwas umbaut, verschiebt das
  Spielende.
- Die Balance hat sich dadurch messbar verschoben (Militärsiege 49 % → 60 % über 200
  Bot-Partien, siehe `ANNAHMEN.md`). Beim nächsten Balance-Vergleich daran denken: Zahlen
  vor v51 sind nicht mehr vergleichbar.
- Alte Spielstände haben `claims`/`endRound` nicht; alle Zugriffe sind deshalb
  `(S.claims || [])`-fest.

### Plättchengeometrie (neu in v50)

- **Zeilenversatz:** Jede Form muss in einer **geraden** Zeile beginnen. Bei odd-r-Versatz
  kippt eine Verschiebung um eine ungerade Zeilenzahl den Versatz und verzerrt die Form.
  Die Anker in `TILE_SHAPES` sind entsprechend gelegt, ein Test prüft es.
- **Dreiecke aus 15 Feldern können die Ebene nicht periodisch parkettieren**
  (15 und 30 sind keine Normen der Form a² + ab + b²). Neue Formen deshalb **nicht**
  durch Fortsetzen eines Musters erfinden, sondern rechnen lassen: Überlappungen und
  Innenlücken prüft der Formteil in `test.js` für jede Form automatisch.
- **Zwei Windräder können sich keine zwei Plättchen teilen** — die Mitte des zweiten läge
  im Radius des ersten Sechsecks. Deshalb ist die Vierer-Karte ein Streifenverbund und
  keine „zwei Sechsecke".
- Wer Plättchen ergänzt: die drei mittigen Felder müssen Land sein **und** je mindestens
  4 Nahrung bringen (Bots setzen dort). Der Test rechnet es nach und nennt die Spanne.
  Zusätzlich geprüft: mit Russlands Bevölkerung 2 bleibt je Plättchen **mindestens ein**
  mittiges Feld bei 4 (8 der 60 fallen dort auf 3, siehe `ANNAHMEN.md`).
- **Meer nur am Rand**, und mit Dichte: einzelne Meerfelder in den Ecken bringen fast
  nichts, weil sie beim Zusammenlegen selten auf anderes Meer treffen. Erst ab etwa einem
  Viertel Meeranteil entstehen zusammenhängende Flächen (Schwellenverhalten, Zahlen in
  `ANNAHMEN.md`). Der Test misst die größte Meeresfläche über feste Startwerte mit.

### Aufräumen ohne Verhaltensänderung (v61)

Kein Regel- oder Oberflächenverhalten geändert; abgesichert über `test.js`, `smoke.js` und
einen Elementvergleich der gezeichneten Karte (826 SVG-Elemente, Attribut für Attribut
gegen die Fassung davor — identisch).

- **Alt-Namen entfallen.** `canEnter` und `botCanEnter` waren reine Weiterleitungen auf
  `canPass`, `feed()` eine auf `coverPop`, `TECHS_ACTIVE` eine auf `TECHS`. Wer in
  `ANNAHMEN.md` über `feed()` stolpert: dort steht die Geschichte, gemeint ist `coverPop`.
- **Toter Code weg:** `TRI_ROW_START`, `planDone` (tiles.js), `langName` (i18n.js),
  `feedSheet` (ui.js), `tutGainText` (tutorial.js), ungenutzte lokale Variablen.
- **Doppelte Schlüssel in `UI_EN`** (`'Münzen'`, `'Welt'`, `'Zug beenden'`). Die Werte waren
  gleich, der spätere Eintrag gewann still — ein Objektliteral verschluckt die Doppelung
  ohne Meldung. **Neuer Test:** er liest den QUELLTEXT von `js/i18n.js`, denn im fertigen
  Objekt ist die Doppelung schon weg.
- **Verdopplungen zusammengefasst:** vier wortgleiche Overlay-Blöcke in `drawMap` →
  `markHexes(liste, art)`; fünfmal dieselbe Handler-Zeile in `openTile` → `act(fn)`;
  siebenmal `CIVS.map(c => c.k)` → `CIV_KEYS` (kommt jetzt aus `tools_civs.js` mit).
- **Kommentare:** ein doppelt eingefügter Querformat-Block, drei übereinanderliegende
  Blöcke über `ownerMark` (zwei überholt). Leere `catch (e) { }` nennen jetzt ihren Grund.

**Bewusst NICHT angefasst** — das sind Entscheidungen, keine Aufräumarbeit:

- `BOT_RESEARCH_TWICE`, `SLAVERY_OBSOLETE_IN_MODERN` und `COMBAT.attackStacks` /
  `COMBAT.defenseStacks` haben je genau einen erreichbaren Wert; der andere Zweig ist
  toter, ungetesteter Code. Sie sind aber der benannte Merkposten für eine
  Regelauslegung, und `COMBAT` sitzt mitten in der Kampfrechnung. Wer sie auflösen will,
  entscheidet damit, dass die Auslegung endgültig ist.
- Einige Sätze stehen ohne `T()` im Code (`'Nur in eigenem oder neutralem Gebiet.'`,
  `'Schon vorhanden.'`, `'Bewegung '` in `mp()`; `'gratis'` und `'Internet · Gratiskopie'`
  auf der Internet-Kachel sind seit v73 erledigt).
  `missingStrings()` sieht sie deshalb nie. Das zu beheben ändert die englische Ausgabe —
  Fehlerbehebung, nicht Aufräumen. Ebenso schreibt `mp()` das Dezimalkomma fest.

## Vollständige Bug-Historie (alle behoben — nicht versehentlich rückgängig machen)

Aus früheren Sitzungen: Bürokratie verdoppelt Hauptstadt-Umland und Bevölkerung · doppelter
Kampf-Aufruf bei Bots · Stadtfelder zählen als Straße/Eisenbahn · Armee in eigener Stadt
anwählbar · Bot-Armeen nutzen Geländedistanz · Angriffswerte addieren sich · Reichweitensprung
wirkt sofort · England kann Nahrung für Forschung ausgeben · Internet-Gratiskopie ·
Navigation-Armeen halten nicht auf Wasser · v2-Tech-Labels · leeres Bot-Fenster (Log-Kappung).

Aus der Sitzung v80:
- **Eisenbahn durch die Kontrollzone (gemeldet):** Eine Kontrollzone beendete nur den Weg,
  nicht die übrige Bewegung, und das Startfeld ist von ihr ausgenommen. Noch einmal
  angetippt, zog die Armee weiter – auf der Eisenbahn (Schritt kostet 0) auch mit 0
  Bewegung, beliebig oft. Nicht wieder einführen: jede Armeebewegung läuft über `arriveAt`
  (Bewegung 0 und `army.halted` beim Betreten einer Zone); der Test fährt die Bahn ab.
- **Dieselbe KI zog nach einem Neuladen ein zweites Mal** (beim Suchen gefunden): gespeichert
  wird nach ihrem Zug, „Weiter" kommt danach. `S.autoPlayed` merkt sich, wer in dieser
  Runde schon gezogen hat; `smoke.js` lädt mitten im KI-Blatt neu.

Aus der Sitzung v79:
- **Angreifer ohne Platz gezählt (KI):** Jede Armee, die irgendein Feld an einer Stadt
  erreicht, zählte als Angreifer – auch die fünfte an einer Stadt mit vier freien
  Nachbarfeldern; dass eigene Armeen rund um die Stadt Plätze wegnehmen, sah die KI nicht.
  Nicht wieder einführen – `kiAttackSlots`; der Test prüft vier Angreifer gegen vier bzw.
  sechs eigene Nachbarn.
- **`S.evNext` beim Kopieren berührt** (während der Arbeit gefunden, nie ausgeliefert):
  `Object.assign({}, S, …)` liest jedes Feld, auch das vorgewürfelte Ereignis – der
  Fairness-Test schlug an. Für eine Sicht auf S mit anderen Armeen `Object.create(S, …)`.

Aus der Sitzung v76:
- **Machtring ohne Punkt voll gezeichnet** (Armee mit Macht 0 sah aus wie in voller
  Stärke). Jetzt leer; der Smoke-Schritt prüft es.

Aus der Sitzung v75:
- **Flankieren „gegenüber" nur waagerecht richtig** (Spiegelung in Zeile/Spalte statt in
  Würfelkoordinaten). Nicht wieder einführen – `hexOpposite` benutzen; der Test prüft alle
  Nachbarpaare in beiden Zeilenarten.

Aus der Sitzung v73:
- **Reichsgrenze um leere Sechsecke** am Rand der Plättchenkarte und am Loch: `X` zählte
  als Gebiet (`controlledTiles`). Nicht wieder einführen – der Test prüft jedes Randfeld.
- **„– noch verdeckte Nachbarfelder kommen dazu"** in der Legephase erschien nur, wo es
  falsch war (jedes `X` galt als verdeckt). Entfallen.
- **Internet-Gratiskachel ohne Wirkungstext**, dazu „gratis" ohne Übersetzung.

Aus der Sitzung v61–v68:
- **Burgstädte ohne Kontrollzone (v68, gemeldet aus einem 1-gegen-1):** Burgenbau stellt
  eine unbewegliche Armee in jede Stadt; sie verteidigte und flankierte, aber `zocStop`
  durchsuchte nur `S.armies`. Eine Mauer Armee – Burgstadt – Armee hatte deshalb an der
  Stadt ein Loch: nachgestellt kam eine Bot-Armee mit 3 Bewegung in einem Zug auf **vier**
  Felder hinter die Mauer; mit einer echten Armee an derselben Stelle auf keines.
  `zocStop` zählt Burgstädte jetzt als Wache (Schießpulver nötig, Reichweite wie Armeen).
  Bots rechnen über dasselbe `zocStop`, also greift es für beide Seiten. Zehn neue
  Prüfungen, Gegenprobe mit dem alten Stand schlägt an („4 ≠ 0").
- **Falsche Meldung beim Siedeln (v62):** War kein Weg zum Zielfeld frei, hieß es immer
  „Nicht erreichbar — dafür fehlt Navigation oder Panzerschiff". Bei einer Vulkanmauer,
  einem Kartenloch oder gegnerischen Armeen ist das schlicht falsch: dagegen hilft keine
  Schiffstechnik. `foundBlockReason` unterscheidet die Fälle jetzt (sucht einen Weg, der
  Wasser erlauben würde — gibt es ihn, lag es am Wasser). Die Regeln sind unverändert.
- **`flach()` in `test.js` zog die Karte nie glatt (v62):** `S.map.rows` ist eine Liste von
  Zeichenketten, die Schleife über `g[r][c]` lief ins Leere. Die 14 Prüfungen der
  Bot-Armeeprioritäten liefen also auf der erzeugten Karte, obwohl ihr Kommentar
  ausdrücklich eine glattgezogene verlangt („damit nicht das Gelände das Ergebnis
  bestimmt"). Behoben; alle Prüfungen bleiben grün.

Aus der Sitzung bis v60:
- Gentechnik/Massenmedien waren allgemeine Umtauschkurse — sind jetzt reines Füttern.
- **Alchemie** erlaubte keine Wissenschaft → Nahrung; jetzt transitiv über Münzen (2:1, mit
  Gilden 1:1).
- Rundenwechsel und Ereignis hingen an Index 0 statt am Startspieler.
- **Rückschau** wurde nur von bezahlter Forschung ausgelöst, nicht von kostenloser; außerdem
  gab es nur einen Anspruchsplatz — Oxford verlor einen. Beides sind jetzt Warteschlangen
  (`p.freePicks`, `p.backPicks`).
- **Oxford** konnte die Singularität nicht wählen (sie steht in keiner Techliste) und seine
  zweite Wahl wuchs mit neu freigeschalteten Techs — jetzt Momentaufnahme beim Bau.
- **Gründungsdistanz** wurde bei fehlendem Landweg als Luftlinie gerechnet — man konnte ohne
  Navigation auf Inseln siedeln. Jetzt Weg über passierbare Felder, sonst gesperrt.
- **Bot-Siedler** blieb in Landtaschen stecken (England 32 % Fehlschläge in Runde 1); jetzt
  die neuere Regelheft-Fassung, 0 %.
- Bots erhielten Wundereffekte (Große Mauer, Stonehenge, Kreml) und Effekte der neuen Techs.
- **Verbundwerkstoffe** erlaubte statt des kostenlosen Wachstums auch ein zweites bezahltes.
- Atomschlag-Knopf blieb bei Atomwaffenprotesten aktiv und lief ins Leere.
- Aktionsblatt lag auf breiten Geräten über „Zug beenden"; geschlossen blieb ein leerer
  Kasten stehen.
- Tutorial: Schienen-Lücke bei Schritten mit unvollständigem `allow`; Papier wurde still
  freigeschaltet statt ausgewürfelt.

Aus der Sitzung vom 21.–22.8. (Versionen v30–v49), grob nach Themen:

**Regeln und Rechnungen**
- **Bürgerkrieg:** Armee/Macht ließen sich nicht mit einer Mischung aus Nahrung und Münzen
  kaufen. Die Regelmaschine konnte es, die Oberfläche prüfte ohne die Bürgerkriegs-Option.
  Es gibt jetzt `payOpts(S, pi)` als einzige Wahrheit — beide Seiten benutzen sie.
- **Wachstum für 2 statt 3 Münzen:** `canGrow` prüfte Nahrung und Münzen getrennt gegen
  denselben Vorrat, und `growCity` ignorierte den Rückgabewert des zweiten `pay`. Jetzt
  `payAll`/`affordAll` — alles oder nichts, mit Rückrollen.
- **Gentechnik/Massenmedien:** `feed()` schrieb alles über dem Defizit in den
  Nahrungsvorrat und war damit doch ein 1:1-Umtausch. Ersetzt durch `coverPop`: die
  Bevölkerungskosten lassen sich aus Wissenschaft oder Münzen bestreiten, höchstens bis zu
  ihrer Höhe.
- **Nahrungsgrenze hing am Ereignis der Runde:** Dürre und Revolution verboten Wachstum und
  Siedeln, obwohl die Stadt dauerhaft gedeckt war. `growthBlocked` rechnet jetzt über
  `baseIncome()` auf dem dauerhaften Wert (`S.evMuted`).
- **Eisenbahn ohne Rad war nicht baubar:** Das Blatt zeigte den Knopf nur mit Rad und
  leitete die Zielstufe selbst her. Jetzt entscheidet `roadTargets(S, pi, r, c)` aus
  `engine.js`, und Blatt wie `doRoad` benutzen sie. Auf leerem Feld stehen mit beiden
  Technologien **beide** Knöpfe; der Preis kommt immer frisch aus `buildRoad`.
- **Oxford + Singularität:** `freePickModal` prüfte `S.over` nicht — das Spiel war vorbei,
  aber der Siegbildschirm kam nie.
- **Kostenlose Armeen** (Wikinger-Start, Koloss) erscheinen jetzt in der Hauptstadt und
  müssen sie verlassen; beim Koloss nacheinander über die Warteschlange `p.freeArmies`
  (`spawnFreeArmies`, aufgerufen beim Wunderbau, nach `moveArmy` und in `beginTurn`).
- **Zugende ist mit Armee in einer Stadt gesperrt** (`blockingIssues`), nicht mehr nur
  bestätigungspflichtig. Ausnahme, wenn die Armee gar nicht herauskann.

**Neue Regel**
- **Handelsrouten** (`tradeRoutes`): +1 bzw. +2 auf alle Erträge je angebundener Stadt.

**Bots**
- **Armeeprioritäten neu** (neunstufig, siehe ANNAHMEN.md). 1–6 werden in `botPlanArmies`
  über alle Armeen abgestimmt, 7–9 bleiben je Armee einzeln. Verteidigung löst **nur bei
  laufender Belagerung** aus (`S.sieges[Gegner|Stadt] >= 1`), nicht bei jeder
  danebenstehenden Armee.
- **Bots lassen keine Armee in der eigenen Stadt stehen** (`botOutOfCity`), außer es gibt
  gar keinen anderen Halteplatz.

**Tutorial**
- **Auf den neuen Bot-Ausgang umgebaut** (v40): Die Belagerung bricht nicht mehr von selbst
  — der Spieler lernt stattdessen den Gegenangriff. Fragil: das Zielfeld neben Griechenlands
  Hauptstadt ist das einzige erreichbare (`tutStrikeSpot` hat eine Rückfallebene).
- **Griechenlands Militärforschung ist vorgegeben** (`TUT_FOE_MILITARY`, Hook `tutBotTech`
  in `botResearch`): Eisenverarbeitung und Stahl statt Stadtmauern und Burgenbau, damit
  seine Hauptstadt angreifbar bleibt und der Gegenangriff überhaupt einen Zähler auslöst.
  Gewürfelt wird normal weiter, nur das Ergebnis wird getauscht.
- **Texte sind fest verdrahtet** (v44): keine berechneten Zahlen mehr in den Schritttexten.
- **Texte vom Autor überarbeitet** (v45–v49): Schritte 1–15 wörtlich übernommen, Einleitung
  ergänzt, Zugablauf-Einordnung (`sub`) überall entfernt.
- **Zurückblättern springt nicht mehr vor** (`ui.tut.max`).

**Oberfläche**
- **Techbogen** markiert, welche Technologien andere MENSCHEN erforschen könnten (blass und
  gestrichelt umkringelt, gegen satt und durchgezogen für „hat sie").
- **Versionsnummer im Hauptmenü** aus `APP_VERSION` (js/data.js).
- **`hidden` wirkte auf Aufbauzeilen nicht** (v58): `.row { display: flex }` schlug das
  `[hidden]` des Browsers, sichtbar an der Zeile *Ereignisstärke*, die ohne Ereignisse
  stehen blieb. Global gelöst mit `[hidden] { display: none !important }`.
- **„Nochmal spielen" hätte immer dasselbe Reich gegeben** (v58, vor der Auslieferung
  gefunden): siehe „Bekannte Fragilitäten", `resolveRandom` zieht nur aus dem Freien.

**Regeln**
- **Der Mensch gewann nur bei Punktgleichstand** (v60). Melden Mensch und Bot in derselben
  Runde einen Sieg an, gewinnt jetzt immer der Mensch – auch mit weniger Punkten. Der
  Punktvergleich entscheidet nur noch unter den Menschen; unter Bots wie bisher. Der alte
  Test hielt ausdrücklich das Gegenteil fest.
- **Im Plättchenmodus sah jeder Platz außer dem ersten keine Erträge** (v60). `tileMap`
  führt Hauptstädte nach Platz (`capitals[seat.idx]`), die Vorschau rechnet aber auf einer
  Partie mit einem Spieler auf Platz 0. `placeYield` legt die Hauptstadt jetzt vorher um.
- **Der Koloss stellte seine Armeen in der Hauptstadt** statt in der Stadt, die ihn gebaut
  hat (v58). `spawnFreeArmies` kannte den Bauort nicht und nahm `capitalOf`. Der Ort steht
  jetzt als Stadt-Id in `p.freeArmyCity` — nötig, weil die zweite Armee in der
  Warteschlange über Züge hinweg wartet. Fällt die Stadt weg, rücken sie in die Hauptstadt
  nach. Protokoll und Zugende-Warnung nennen ebenfalls die richtige Stadt.

## Offene Punkte / bewusst nicht umgesetzt

0a. **Die neuen Armeeprioritäten verschieben die Balance.** Je 200 Bot-Partien:
   Militärsiege 187 (alt) → 130 (v39) → 152 (v43, Trigger ist die laufende Belagerung),
   Median 5 → 7 → 6 Runden. Der größte Teil der Verschiebung ist damit zurückgenommen.
   Ob der Rest so gewollt ist, muss der Autor sagen.

0b. **Bots bauen keine Straßen** — gemessen über 25 vollständige Bot-Partien: null
   Straßen, null Handelsrouten. Die Regel ist damit praktisch ein reiner Vorteil für den
   Menschen. Ausgleich hieße `bots.js` um Straßenbau erweitern.

0. **Die erzwungene Drehung ist nicht auf echtem iOS geprüft**, nur in Chromium mit
   Hochformat-Viewport. Safari-Eigenheiten bei `position:fixed` in transformierten
   Vorfahren und bei `env(safe-area-inset-*)` sind ein Restrisiko. Auf dem iPad
   gegenprüfen.

1. **Ein ungedecktes Nahrungsdefizit kostet nichts.** Seit dem Umbau auf `coverPop` ist
   das weniger schlimm: Decken macht Nahrung frei, statt nur ein folgenloses Defizit zu
   tilgen. Ein Rest bleibt aber — wer gar nichts deckt, verliert nichts außer der Nahrung.
   Gemessen (vor dem Umbau): zwei identische Spielstände, einer füttert 3 Wissenschaft, der
   andere nicht; nach der Runde unterscheiden sie sich **nur** in diesen 3 Wissenschaft,
   Bevölkerung und Nahrung sind gleich. Alternativen, je etwa eine Zeile:
   - „ungedecktes Defizit kostet Bevölkerung",
   - „Wachstum nur so weit, wie diese Runde gedeckt werden kann".
   **Entscheidung des Autors steht aus.**

2. **Wikinger „Beutezüge"** funktioniert, zahlt aber selten: der Ertrag ist Angriffswert minus
   Verteidigungswert, und ein Mensch überbietet Bots (Machtwert = Gesamtbevölkerung) selten.
   Gemessen: mit Macht 30 über 20 Partien 1809 Beute, mit normal gekaufter Macht 0.
3. **Regelheft-Klausel, zweite Hälfte:** „gegnerische Territorien zählen als unpassierbar"
   ist in v63 umgesetzt (siehe unten). Offen bleibt „**neben** ihnen darf nicht gegründet
   werden" — das war nicht verlangt und würde die Ausbreitung noch deutlich stärker
   einengen. Ebenso offen: gesperrt ist der Weg, nicht das Zielfeld — auf einem von außen
   erreichbaren gekauften Fremdfeld darf weiter gegründet werden.
4. **Bot-Siedler** scheitert in späten Runden weiter gelegentlich, obwohl Platz da ist
   (Zufallslauf auf gefüllter Karte).
5. **Plättchenkarten sind enger als die festen Karten:** 45 Felder je Reich (2 Spieler),
   45 (3), 37,5 (4) gegen 54 auf der Originalkarte. Die Formen kommen so aus der Vorgabe;
   ob die Partien dadurch zu gedrängt sind, muss der Autor am Tisch entscheiden. Mehr Luft
   gäbe es nur über größere Formen (mehr Plättchen) oder Dreiecke mit Seite 6 (21 Felder).
6. **Bots legen ihr Startdreieck ohne Plan:** Lage zufällig, Hauptstadt zufällig auf einem
   der drei mittigen Felder. Sie bewerten das Gelände nicht, ein Mensch wählt hier also
   besser. Absicht (die Vorgabe verlangt genau das), aber ein Balancepunkt.
7. **Verteidigt die Burg auch Feldarmeen?** Seit v68 wirft sie eine Kontrollzone wie eine
   echte Armee. `armyDefenseValue` (Verteidigung einer Armee im Feld, auch für die
   Wikinger-Beute) zählt aber weiter nur echte Armeen in Reichweite. Das Regelheft sagt
   nur „verteidigt die eigene Stadt". Eine Zeile, falls gewünscht.
8. **Die Kontrollzone ist ein Halt, keine Mauer.** Wer ein Feld in Reichweite betritt,
   bleibt stehen – im nächsten Zug darf er weiter. (Seit v80 hält er wirklich für den Rest
   des Zuges an; vorher endete nur der Weg, und ein zweites Antippen zog weiter – gemeldet
   für die Eisenbahn.) Eine Lücke von einem Feld in einer
   sonst geschlossenen Reihe ist deshalb passierbar, kostet aber je Kontrollzonenfeld einen
   ganzen Zug: vor der Reihe, in der Lücke, hinter der Reihe. Gemessen (ganze Zeile voller
   Wachen, nur ein Feld frei, Armee mit 3 Bewegung drei Zeilen davor): **vier Züge** bis
   jenseits der Reihe, ohne Reihe wären es zwei; mit Luftwaffe **einer**.
   So steht es in ANNAHMEN 1 („halten an, sobald sie … betreten"). Wer eine echte Sperre
   will, bräuchte etwa „in einer Kontrollzone beginnt der Zug mit nur einem Feld".
   Ebenso Absicht: die **Luftwaffe** ignoriert Kontrollzonen und überfliegt seit v63
   gegnerische Armeen und Städte. Zieht ein Bot spät im Spiel mit Luftwaffe durch eine
   Mauer, ist das kein Fehler.
9. **„Ertrag beim Siedeln" rechnet immer mit Bevölkerung 1** – auch für Russland mit
   *Siedlertrecks*, dessen Städte mit 2 Bevölkerung gegründet werden (`foundCity`).
   Gemessen (Seed 7, erstes gründbares Feld): Vorschau 1🔬 −1🌾 5🪙, tatsächlich
   2🔬 −2🌾 6🪙; mit Ökologie seit v69 tatsächlich 3🔬 −1🌾 7🪙. Vorbestehend, durch v69 nur
   größer geworden. Behebung wäre eine Zeile in `settleGain` (Bevölkerung wie in
   `foundCity`); das Tutorial spielt Russland mit Grundfähigkeit und wäre nicht betroffen.
10. **Spieltipp zur Kundschafterei** („im Allgemeinen nicht effizient") stimmt seit v72 nur
   noch bedingt: 2× Grundkosten in Münzen sind beim Standardkurs (2 Münzen = 1 Wissenschaft)
   genau die Forschungskosten ohne Vergünstigung. Teurer als Forschen ist Kopieren nur noch
   mit Rabatt (Griechenland, Wiss. Methode) oder Computertechnik. Tipptext ist Sache des
   Autors, nicht geändert. Außerdem: **Bots kaufen keine Felder und kopieren nie** – beide
   Verbilligungen helfen nur Menschen (wie die Straßen, Punkt 0b).

11. **„Eine Reihe näher" (v73) – zwei Folgen, die der Autor kennen sollte.**
   *4 Reiche:* die Reihe vor der Spitze ist frei, die Ecke der langen Kante zum offenen
   Mittelplättchen bleibt gesperrt – zwei Hauptstädte in den beiden Ecken links und rechts
   davon lägen 2 auseinander und teilten sich dessen Spitzenfeld. Soll sie trotzdem frei
   sein: Bedingung 2 in `seatFreeCells` weglassen (14 statt 13 Felder, im schlimmsten Fall
   ein geteiltes Feld).
   *1 gegen 1:* setzen beide in die Ecke am Loch, stehen die Hauptstädte 2 auseinander.
   Gemessen über je 150 Bot-Duelle (Russland gegen England): beide Hauptstädte dort gegen
   normale Bot-Platzierung – Militärsiege 90 gegen 59, Spielende im Median Runde 4 gegen 8.
   Bots sind keine Menschen, und es braucht beide Ecken; aber so eine Partie kippt schnell.
12. **Dominiert über alle drei Lagen** (v73, Auslegung): ein Feld ist rot, wenn irgendein
   anderes erlaubtes Feld – auch in einer anderen Lage – rundum besser ist. Folge: selten
   (4 % der Lagen) ist eine ganze Lage rot. Nur je Lage verglichen wären 67 % statt 77 % der
   Wahlmöglichkeiten rot. Umstellen: `dominatedCells` je Zeile aufrufen.

13. **Ein Bot-Partner verlässt die Flanke** (vorbestehend, beim Testen von v75 gesehen):
   Steht der Partner neben dem Angreifer, aber nicht in Reichweite der bedrohten Stadt,
   zieht er in `botPlanArmies` (b) „verteidigen" nachträglich zur Stadt – die eben
   gebildete Flanke ist dann wieder offen. Der Test legt den Partner deshalb auch neben die
   Stadt. Lösung wäre, Flankenpartner in (a) mit zu belegen; Balancefrage, nicht angefasst.
14. **Wirtschaftssieg in Runde 2 im Duell (v77) – erledigt mit v83.** Seit der Wirtschaftssieg
   mit der Bevölkerung zu Rundenbeginn zählt, haben zu Beginn von Runde 2 beide Reiche genau
   einen Zug gehabt: 0 von 40 KI-Duellen enden in Runde 2 (v82: 7 von 40).
15. **Passt Leicht für Einsteiger? (v78)** Seit v78 sind die Stufen deutlich getrennt
   (Duell gepaart Schwer–Leicht 32 : 8, zu dritt und zu viert je 21 : 3) und an den Bots
   geeicht: im Duell spielte Leicht etwa wie Prinz, Mittel wie König, Schwer wie David. Die
   Abwehr von v79 hilft allen Stufen gegen Bots (Leicht 55 statt 48 von 80 gegen Prinz,
   Schwer 39 statt 34 gegen David) – Leicht liegt jetzt zwischen Prinz und König. Ob das für
   Menschen stimmt, zeigt erst das Spielen – nachstellen in `KI_PARAMS`, nachmessen mit
   `tools_ki.js stufen`. Im Duell wiegt zwischen Schwer und Mittel der Startvorteil etwa so
   viel wie der Abstand der Stufen (beginnt Mittel, gewinnt es 11 von 20).
16. **Rechenzeit der KI auf dem iPad nicht gemessen.** In Node (v78): Median um 20 ms je
   Zug, längster gemessener Zug 0,72 s (drei Reiche, KI gegen KI, Luftwaffe); zu viert und
   im Duell höchstens 0,3 s. v79 (Plätze an der Stadt kosten je Bewertung etwas): Median
   20–35 ms, längster Zug in `test.js` 0,77 s, in den Messreihen der Stufen bis 0,7 s. Das
   iPad dürfte zwei- bis fünfmal langsamer sein – Schätzung.
17. **Abwehr gegen Menschen nur gegen ein Skript gemessen (v78, v79).** Das Skript zieht
   heran und kauft Macht; ein Mensch plant geschickter (Flanken, Ablenkung, Ziel wechseln).
   In gut jeder zehnten nachgestellten Stellung fällt die Hauptstadt weiter (v79 so oft wie
   v78), die angesehenen davon waren wirtschaftlich verloren oder knapp. Seit v79 stellt die
   KI Armeen neben die bedrohte Stadt, um Angreifern die Plätze zu nehmen – ohne Macht sind
   sie leicht zu flankieren (bei bloßer Drohung 86 verlorene Armeen in 399 Stellungen, v78:
   27). Sie dagegen zu bewerten, ließ die KI vorab Macht kaufen – verworfen, weil genau das
   weg sollte. Ob der Autor lieber mehr Vorsorge oder mehr verlorene Armeen sieht, entscheidet
   das Spielen.
18. **Straßen fehlen im Bündel des Planers (bekannt seit v78, nicht angefasst).** `KI_BATCH`
   in `js/ki.js` erwartet `road:`, die Kandidaten heißen aber `road1:`/`road2:`. Folge:
   Straßen werden nicht gebündelt, und nach aufgebrauchtem Bewertungsbudget erwägt die KI
   keine Straßen mehr. Die Korrektur ändert Partien und gehört gemessen.
19. **Gesperrter Bildschirm nach KI-Zügen: Auslöser unbekannt (v80).** Gemeldet mit der
   Abhilfe aus der Konsole (Sperre aufheben, `humanTurnStart()`). Nicht nachgestellt –
   weder Zug um Zug noch mit zufälligem Tippen über die echte Oberfläche (zusammen gut 200
   Partien). v80 macht den Ablauf robust (siehe Fragilitäten); kommt es wieder vor, steht
   ein Fehler jetzt als „Interner Fehler (…)" im Protokoll – den Wortlaut brauchen wir.
20. **Regelbogen zu Bewegung, Straßen, Eisenbahn und Kontrollzone – erledigt (v81).** Der
   Autor hat den Entwurf unverändert freigegeben; damit gelten auch die zwei Punkte, die er
   dabei bestätigen sollte, als Regel: Straßen gehören niemandem (jede Armee fährt auf jeder
   Straße), und Kontrollzonen unterbrechen keine Handelsrouten.
21. **KI-Züge über lange Eisenbahnen (bemerkt v80, nicht gemessen).** Für ihre eigenen
   Angriffs- und Abwehrzüge sortiert die KI Armeen vorab nach Luftlinie aus (Bewegung +
   Reichweite + 4, sobald es Straßen gibt); weiter entfernte Armeen, die eine lange Bahn
   heranbrächte, erwägt sie nicht. Fremde Bedrohungen rechnet sie mit der echten Wegsuche.
22. **Tutorial im alten Techtree (v82, Anweisung des Autors: „bis ich ein besseres
   Tutorialspiel liefere").** Kommt das neue Übungsspiel, fällt `oldTree: true` in
   `tutorialSetup` weg. `OLD_TECH_COSTS` und `migrateState` bleiben, solange es Partien von
   vor v82 geben kann; das Beispiel aus dem Regelheft in `test.js` (Griechenland, Schrift
   kostet 0) rechnet ebenfalls im alten Techtree.
23. **Längster KI-Zug im neuen Techtree (v82, nicht angefasst).** Im Zeittest von `test.js`
   läuft eine Partie zu viert jetzt bis Runde 10 (24 Städte, 22 Armeen); der längste Zug
   dort braucht auf dem jetzigen Testrechner 1,7–2,7 s (Grenze deshalb 3 s statt 2 s; der
   Rechner selbst ist gut 1,5× langsamer als bis v81). Profil dieses Zuges: Bewertung über
   `kiRisk` gut ein Drittel, `income` ein Viertel, davon `tradeRoutes` 13 % – ein Merker
   für Handelsrouten je Spielstand wäre der erste Ansatz.
   v83: `tradeRoutes` mit Stadttabelle, das Einkommen vor dem Siedeln einmal je Bewertung
   (`settleGain(…, before)`), Straßenpläne mit Fächer-Schlange – gleiche Ergebnisse, die
   langsamsten Marathon-Züge 10–30 % kürzer (Punkt 24).
24. **KI-Zugzeit im Marathon (v83).** Auf der großen Karte stehen zur Mitte der Partie 50 und
   mehr Städte (ein Reich mit Kolonisten allein bis 58). Gemessen (8 Partien KI Schwer, nach
   den Tempo-Änderungen, allein auf dem Testrechner): Median je Partie 0,1–0,4 s, 90 % der
   Züge unter 1–2 s, längster Zug je Partie 1,2–6,5 s; der längste in einer Partie mit 83
   Städten. Dieselben Züge einzeln vor und nach den Tempo-Änderungen: 10,0 → 7,4 s,
   6,0 → 4,3 s, 4,4 → 3,7 s, 2,9 → 2,65 s. Auf dem iPad nicht gemessen. Was im Profil danach
   bleibt: Einkommen je Bewertung (Gebiet, Handelsrouten) knapp 30 %, `kiRisk` 17 %,
   Gründungskosten über die Wegsuche 13 %, Straßenpläne 14 %. Grenze in `test.js` 8 s.
25. **Kolonisten im Marathon (v83, gemessen, nicht angefasst).** In 40 Marathonpartien mit
   vier KI und zufällig zugeteilten Fähigkeiten gewann, wer Kolonisten hatte, 21 von 27 –
   bei gleicher Stärke wäre es ein Viertel. Auf der großen Karte mit teurer Forschung ist
   Gründen ohne Grundkosten offenbar das Stärkste. Ob Menschen das genauso ausnutzen, ist
   nicht gemessen; eine Balancefrage für den Autor (etwa Kolonisten im Marathon schwächer,
   oder höchstens einmal im Vorrat).
26. **Kriegerkultur zu viert (v83, gemessen).** Mit Burgenbau gewinnen die Wikinger mit
   Kriegerkultur 17 von 40 KI-Partien zu viert (v82: 12, gleich stark wären 10). Gewollt war
   die Stärkung; ob es so viel sein soll, entscheidet das Spielen.
27. **Der Draft wird nicht gespeichert (v83).** Wer die App mitten im Draft schließt, beginnt
   den Marathon neu („Spiel fortsetzen" führt dann in die vorige Partie). Der Draft dauert
   Sekunden bis wenige Minuten; gespeichert wird ab dem ersten Zug.
28. **Getroffene Auslegungen (v83) – zum Ändern angeboten.** (a) Wirtschaftssieg: eigene
   **und** Weltbevölkerung zu Rundenbeginn, geprüft dort; die wörtliche Lesart (nur der
   Nenner fest) ließ jedes KI-Duell in Runde 2 enden. (b) Kriegerkultur: +2 je Stadt, wie
   eine Armee. (c) Draft: n = Reiche außer Bots (Bots haben keine Fähigkeiten). (d) Keine
   Fähigkeit doppelt im eigenen Reich, solange anderes übrig ist. (e) Startertrag mit 2
   Bevölkerung gerechnet, ohne Technologien. (f) Der Kreml-Zuschlag auf die Singularität
   (+50) wird im Marathon nicht vervielfacht. (g) Das Tutorial erklärt den Zeitpunkt des
   Wirtschaftssiegs nicht (alter Techtree, feste Partie, bleibt bis zum neuen Übungsspiel).

## Arbeitsweise, die der Autor schätzt

Antworten sollen Experten-Prüfung standhalten. **Schwächen offen benennen**, auch eigene
Fehler. Keine Positionen ohne neue Evidenz umkehren. Keine erfundenen Zahlen — messen und die
Stichprobe nennen. Bei mehrdeutigen Regeln **vor dem Bauen nachfragen** statt raten; bei
Entscheidungen, die die Vorgabe offenlässt, die getroffene Auslegung nennen und anbieten, sie
zu ändern. Der Autor meldet Bugs knapp — reproduzieren und die tatsächliche Ursache finden,
nicht die erstbeste Vermutung umsetzen. Jede Regeländerung mit Test absichern.

## Typischer Abschluss-Ablauf nach Änderungen

1. `node test.js` und `node smoke.js` grün.
2. Version hochzählen — **beide Stellen**: `APP_VERSION` in `js/data.js` und `VERSION`
   in `sw.js`. Ein Test schlägt an, wenn sie auseinanderlaufen.
3. `python3 build_single.py && node check_single.js`.
4. Nach `/mnt/user-data/outputs/` paketieren (Ordner + Zip + Einzeldatei, ohne
   `node_modules`), aus dem ausgelieferten Zip **noch einmal** `test.js`/`smoke.js` laufen
   lassen, dann mit `present_files` präsentieren (Einzeldatei zuerst).
