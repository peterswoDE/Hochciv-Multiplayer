# Hochzeivilization – digitale Fassung

Vollständige Regelmaschine mit KI-Gegnern (nach den Regeln für Menschen), Bots, Technologiebogen und Karteneditor.
Läuft als Web-App offline auf dem iPad.

## Auf GitHub Pages stellen

1. Neues Repository anlegen, den Inhalt dieses Ordners hochladen (`index.html` muss im
   Wurzelverzeichnis liegen).
2. *Settings → Pages → Source: Deploy from a branch*, Branch `main`, Ordner `/ (root)`.
3. Nach ein bis zwei Minuten ist die Seite unter `https://<name>.github.io/<repo>/` erreichbar.
4. Auf dem iPad in Safari öffnen → Teilen → **Zum Home-Bildschirm**.
   Beim ersten Aufruf lädt der Service Worker alle Dateien in den Cache; danach läuft
   das Spiel ohne Netz.

Alle Pfade sind relativ, ein Unterverzeichnis ist also kein Problem.
Nach Änderungen an den Dateien in `sw.js` die Zeile `const VERSION` hochzählen,
sonst behalten installierte Geräte die alte Fassung.

## Bedienung

| | |
|---|---|
| Feld antippen | Aktionsblatt für dieses Feld (wachsen, Armee bauen, Straße, Feld kaufen …) – gegründet wird seit v75 über **Stadt gründen** in der Leiste |
| **Stadt gründen** | Gründungsmodus: jedes Feld zeigt seine Erträge, jeder mögliche Platz die Kosten in Nahrung (rot, wenn sie diesen Zug nicht reichen), unmögliche Felder sind abgeblendet. Feld antippen → Blatt mit Kosten und **Ertrag beim Siedeln** → **Hier gründen**. Nochmal tippen beendet den Modus |
| **Erträge** | Umschalter: auf jedem Feld bis zu drei Chips – Wissenschaft blau, Nahrung grün, Münzen gold –, gerechnet mit den eigenen Technologien. Die Wahl bleibt gespeichert |
| **Macht** | Macht kaufen. Solange das Blatt offen ist, tragen Städte und Armeen **Ringe** aus **einem Teilstück je Punkt**: in der Farbe des Besitzers seine Verteidigung bzw. sein Machtwert, in fremder Farbe Angreifer bzw. Flankierer – Verteidigung 1 gegen Angriff 2 sind drei Stücke, eines gegen zwei. Überwiegt ein fremder Anteil, läuft die Belagerung bzw. fällt die Armee; Käufe verschieben die Ringe sofort. Über 60 Punkte zeigt der Ring nur noch den Anteil, bei 0 Punkten bleibt er leer |
| Bevölkerung wachsen | zwei Knöpfe, wenn Verbundwerkstoffe ein Gratis-Wachstum erlaubt: „Kostenlos wachsen" und der bezahlte „Bevölkerung wachsen" |
| Tutorial | Geführtes Übungsspiel in der normalen Oberfläche: 24 Schritte mit Erklärpanel unter der Karte, 15 davon mit Aufgabe und genauem Klickweg. Läuft auf Schienen (nur der vorgesehene Schritt ist möglich) und deterministisch. „Fertig" gibt das Spiel frei, es läuft weiter. |
| Einstellungen | Im Hauptmenü: die Erweiterungsmodule **Ereignisse** und **Weltwunder** zuschalten. Ab Werk sind beide aus und fehlen im Aufbau ganz; eingeschaltet steht dort wieder das Häkchen und entscheidet je Partie. Dazu **Kosten ohne Umtausch anzeigen** (ab Werk aus, siehe Kosten) |
| Kosten (v82) | Jeder Knopf zeigt, was **tatsächlich** abgeht: fehlt Nahrung oder Wissenschaft, steht dort auch der Rest in Münzen (bzw. was sonst einspringt) – Gründen für 10 Nahrung mit 8 im Vorrat zeigt **8🌾 4🪙**. Reicht es gar nicht oder wird nichts umgetauscht, steht der Preis selbst da. Im Technologiebogen gilt das für die Kacheln, die man gerade erforschen kann; die Karte im Gründungsmodus zeigt weiter den Preis (zum Vergleichen). Mit **Kosten ohne Umtausch anzeigen** in den Einstellungen wie bis v81 überall nur der Preis |
| Techtree (v82) | Seit v82 gibt es einen Techtree – den früheren „alternativen": Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 · Bewässerung 1, Landwirtschaft 5 · in der Forschung der Industrialisierung Chemie 11, Biologie 12, Wissenschaftliche Methode 15. Das Häkchen im Aufbau ist weg. Der alte (Schrift 1, Mathematik 2 … Landwirtschaft 1, Bewässerung 5, Wiss. Methode 11, Chemie 12, Biologie 15) gilt nur noch im **Tutorial** und in Partien, die vor v82 mit ihm begonnen wurden – dort nennen Weltblatt und Regelbogen ihn. Quelle: die Kosten in `TECHS`, die alten in `OLD_TECH_COSTS` (`js/data.js`) |
| Spielart | „Vier Reiche“, „Drei Reiche“, „1 gegen 1“ (freie Zivilisationswahl; im Duell Wirtschaftssieg erst über 3/4) oder **„Marathon“** (v83: vier Reiche auf einer großen Zufallskarte, teurere Technologien, Fähigkeiten im Draft – siehe unten) |
| Mensch / KI / Bot | Je Platz im Aufbau. Die **KI** spielt nach den Regeln für Menschen: sie bezahlt alles, hat ihre Zivilisationsfähigkeit, Ereignisse treffen sie, und sie legt ihr Startplättchen verdeckt selbst. Stufe Leicht/Mittel/Schwer für alle KI gemeinsam – gleiche Regeln, nur übersieht und verrechnet sich die leichtere Stufe öfter; im Duell gemessen Leicht zwischen den Bots Prinz und König, Mittel etwas über König, Schwer etwas über David. **Bots** spielen nach den Bot-Regeln (Würfelproben, Macht = Bevölkerung) und haben ihre eigene Schwierigkeit. Ab Werk sind die Gegner KI |
| Zivilisationen | Auf der Plättchenkarte darf jeder Platz frei wählen, auch zweimal dieselbe (Doppelgänger bekommen Ziffern und je eine der vier Zivilisationsfarben). Auf den festen Karten sitzt jede genau einmal. Zivilisation und Fähigkeit lassen sich auch auslosen. Bei ausgelostem Reich steht die Fähigkeit zwangsläufig ebenfalls auf Zufall |
| Startspieler | frei wählbar oder zufällig – bei mehr als einem Menschen ist Zufall die Vorgabe |
| Fähigkeit sehen | Die eigene Fähigkeit steht in der Kopfzeile neben dem Reichsnamen; das Weltblatt (ⓘ) listet alle Reiche mit Fähigkeit und Wirkung. Im Marathon stehen dort beide gedrafteten |
| Karte | Originalkarte, Große Karte, **Plättchenkarte** (die Zufallskarte) oder eigene aus dem Editor |
| Plättchenkarte | Zufallskarte aus Dreiecken zu 15 Feldern. Vor dem Spiel legt jedes Reich verdeckt sein eigenes Startdreieck: Lage wählen (drei), Hauptstadt setzen. Dann wird aufgedeckt. **Rötlich umrandet** sind Startfelder, bei denen ein anderes Feld – auch in einer anderen Lage – von einem Ertrag mehr und von keinem weniger bringt |
| **Welt** | Ereignis dieser Runde, eigene und fremde Weltwunder, verfügbarer Wunder-Pool |
| 🌾 in der Kopfzeile | Städte füttern (nur mit Gentechnik oder Massenmedien) |
| Weltwunder bauen | im Stadtblatt, wenn die Erweiterung an ist |
| **Forschen** | links die Ertragsübersicht (Felder, **Handelsrouten**, Bevölkerung, Summe fürs nächste Einkommen), rechts der Technologiebogen |
| Armee auf der Karte | antippen → *Bewegen*; steht sie in der eigenen Stadt, steht die Aktion im Stadtblatt |
| Feld antippen | Aktionsblatt mit dem Feldertrag. Den **Ertrag beim Siedeln** — was eine Stadt hier ab der nächsten Runde brächte — zeigt das Blatt des Gründungsmodus |
| Karte | fest und immer vollständig sichtbar – kein Zoomen, kein Schieben. Im Hochformat dreht die App sich selbst quer (im ☰-Menü abschaltbar) |
| **Forschen** | Technologiebogen; erforschbares ist rot umrandet — durchgezogen heißt bezahlbar, gestrichelt zu teuer. Kopieren (Spionage/Kundschafterei/Internet) erscheint unten im selben Fenster |
| Atomwaffen | Zielfeld antippen → *Atomschlag* im Aktionsblatt (einmal pro Runde) |
| Sklaverei / Kolonialismus | im Aktionsblatt der Stadt bzw. eines herrenlosen Feldes |
| **Protokoll** | jede Aktion; die Würfe dahinter hängen eingeklappt an der Zeile und lassen sich antippen |

## Spielende

Ein **Militärsieg** (fremde Hauptstadt erobert) endet das Spiel auf der Stelle.
Der **Wirtschaftssieg** verlangt mehr als 2/3 der Weltbevölkerung (im Duell mehr als 3/4,
mit Theologie oder Vereinten Nationen weniger). Seit v83 wird er **zu Beginn jeder Runde**
geprüft, ab Runde 2, für alle Reiche mit der Bevölkerung von genau diesem Moment – eigene
und Weltbevölkerung. Was im Lauf einer Runde wächst oder fällt, zählt erst zu Beginn der
nächsten; so gilt in einer Runde für alle derselbe Nenner. Die Kopfzeile zeigt den
laufenden Stand, also das, was zu Beginn der nächsten Runde zählen wird.
**Wirtschafts-, Forschungs- und Kultursieg** werden angemeldet: die Runde wird noch zu
Ende gespielt, die Kopfzeile zeigt dann „letzte Runde". Erfüllen mehrere Reiche in
derselben Runde eine Bedingung, entscheiden am Rundenende Punkte:

> Punkte = Bevölkerung + Anzahl Weltwunder + Anzahl Technologien

Ein Anspruch bleibt gültig, auch wenn die Bedingung später wieder wegfällt. Melden
**Mensch und Bot** in derselben Runde einen Sieg an, **gewinnt der Mensch** – auch mit
weniger Punkten; der Punktvergleich entscheidet dann nur noch unter den Menschen, und
mehrere Menschen gleichauf teilen den Sieg. Das Spielende zeigt die Punktetafel mit allen
Ansprüchen, auch den ausgeschlossenen.

Unter dem Ergebnis steht immer ein **Spieltipp** aus der Tippsammlung – gewonnen wie
verloren. Gezogen wird einer je Partie, er wechselt also nicht, wenn man das Fenster
noch einmal öffnet. Die Tipps stehen in `TIPS` (`js/data.js`), englisch in
`DATA_EN.tips` an derselben Stelle der Liste.

Wer **allein gegen KI oder Bots** spielt, findet dort außerdem **„Nochmal spielen"**: dieselbe
Aufstellung, aber ein ausgelostes Reich samt ausgeloster Fähigkeit – und nach einem Sieg
eine Stufe schwerer (bei Schwer bzw. David bleibt es dabei). Auf der Plättchenkarte wird dafür neu
gelegt. Zu mehreren Menschen gibt es den Knopf nicht: die Aufstellung gehört dann nicht
einem allein. Möglich ist das, weil `newGame` die rohe Wahl aus dem Aufbau als `recipe`
im Spielstand ablegt – Spielstände aus älteren Fassungen haben keines und zeigen nur den
Weg ins Menü.

Straßen laufen durch Städte hindurch: ein Stadtfeld zählt selbst als Straße oder
Eisenbahn, sobald ein solches Feld daran grenzt.

Kontrollzonen (Schießpulver): wer ein Feld neben einer fremden Armee betritt (mit
Raketentechnik bis zwei Felder weit), hält für den Rest des Zuges an – auch auf der
Eisenbahn. Wer seinen Zug in einer Kontrollzone beginnt, darf heraus.

Ressourcen gelten nur für den laufenden Zug – nur Macht bleibt liegen.
Bezahlt wird automatisch mit dem günstigsten Umrechnungskurs
(2 Münzen = 1 Nahrung/Wissenschaft, mit England, Gilden, Alchemie usw. entsprechend besser).

## Sprache

Im Hauptmenü schalten zwei Flaggen zwischen **Deutsch** (Vorgabe) und **Englisch** um; die
Wahl bleibt gespeichert. Englisch ist **vollständig**: Menü, Aufbau, Spielbildschirm, alle
Blätter, Technologiebogen, Protokoll, Spielende, Regelbogen, Editor, das komplette Tutorial
und alle Spielinhalte. `node smoke.js` läuft die Oberfläche auf Englisch ab und lässt keinen
neuen deutschen Text durch.

Eine Ausnahme: Protokollzeilen, die vor dem Sprachwechsel geschrieben wurden, bleiben in der
Sprache von damals – das Protokoll speichert fertige Sätze. Neue Zeilen kommen in der neuen
Sprache.

Neue Texte übersetzen: Spielinhalte in `DATA_EN` (`js/i18n.js`), Oberflächensätze mit
`T('deutscher Satz')` und einem Eintrag in `UI_EN`. Fehlt einer, erscheint der deutsche
Satz und `missingStrings()` nennt ihn.

## Karten

Im Aufbaubildschirm stehen zwei feste Karten zur Wahl: die **Originalkarte** (12 × 18, aus
dem Foto des gedruckten Bogens ausgemessen) und eine **große Karte** (15 × 24) im selben
Stil, mit weiter auseinanderliegenden Hauptstädten und dadurch längeren Partien. Welche Zivilisation an welchem Stern startet, steht auf dem Bogen nicht –
zugeordnet ist nach Himmelsrichtung: Wikinger Norden, Russland Osten, England Westen,
Griechenland Süden.

### Plättchenkarte (Zufallskarte)

Aus einem Vorrat von 20 handentworfenen Dreiecken zu je 15 Feldern werden Plättchen
gezogen und zu einer Form zusammengelegt:

| Reiche | Form | Größe |
|---|---|---|
| 2 | Sechseck aus 6 Dreiecken, 4 offen, 2 verdeckt | 11 × 11, 90 Felder |
| 3 | großes Dreieck aus 9 Dreiecken, 6 offen | 16 × 16, 135 Felder |
| 4 | gestrecktes Sechseck aus 10 Dreiecken, 6 offen (Startplätze: die zwei oberen und die zwei unteren) | 10 × 18, 150 Felder |

Bei zwei und drei Reichen bleibt **genau in der Mitte ein Feld frei** – dort ist kein
Feld, da führt kein Weg durch. Das ist rechnerisch unvermeidlich (6 · 15 = 91 − 1) und
bleibt bewusst offen.

Jedes Reich legt sein eigenes Dreieck selbst und verdeckt: **Drehen** wählt eine der drei
Lagen, ein Tipp auf ein markiertes Feld setzt die Hauptstadt. Gesperrt sind nur Felder,
die einem fremden Startdreieck näher als 2 Felder liegen oder deren Umland sich mit dem
einer möglichen fremden Hauptstadt ein echtes Feld teilen könnte (gelegt wird blind). Im
1 gegen 1 dürfen sich die Hauptstädte deshalb an der Mitte bis auf 2 nahe kommen – ihr
einziger gemeinsamer Nachbar ist das Loch. Bots drehen zufällig und setzen auf eines der
drei mittigen Felder. Erst wenn alle fertig sind, wird aufgedeckt.

Startfelder, die nichts für sich haben, tragen einen **rötlichen Rand**: ein anderes
erlaubtes Feld bringt im ersten Zug von einem Ertrag mehr und von keinem weniger. Verglichen
wird über alle drei Lagen und genau mit der Zahl der Ertragsübersicht (Quelle:
`dominatedCells` in `js/tiles.js`).

Meer liegt immer am Rand eines Plättchens, oft an den Ecken – trifft beim Zusammenlegen
Kante auf Kante, wächst daraus ein zusammenhängendes Meer. Etwa die Hälfte der Karten
bekommt so eine Fläche von acht Feldern oder mehr, die andere Hälfte bleibt Landkarte.

Neue Plättchen kommen in `js/tiles.js`, `TILE_POOL` – fünf Zeilen zu 5/4/3/2/1 Feldern.
`node test.js` prüft dabei, dass jedes Plättchen mindestens drei Geländearten hat, dass
Meer nur am Rand liegt und dass die drei mittigen Felder Land sind und jedes davon im
ersten Zug mindestens 4 Nahrung bringt.

## Marathon (v83)

Ein eigener Spielmodus im Aufbau (**Marathon**), immer vier Reiche – Mensch, KI oder Bot je
Platz, jede Zivilisation einmal.

* **Karte:** zufällig erzeugt, 24 × 36 Felder – viermal die Originalkarte (12 × 18).
  Höhenrauschen mit Meer am Rand und den tiefsten 30 % als Meer, Gebirgskämme, Flüsse von
  den Bergen bergab, Wald nach eigenem Rauschen, ein paar Inseln (Anteile ähnlich der
  Originalkarte). Je Kartenviertel eine Hauptstadt, mindestens 14 Felder voneinander
  entfernt, jede mit **Nahrung + ½ Münzen ≥ 4** im ersten Zug – gerechnet mit 2
  Bevölkerung (falls jemand Siedlertrecks draftet) und ohne Technologien. Unter den
  erlaubten Aufstellungen die, deren schwächste Hauptstadt am besten dasteht.
* **Technologien** kosten je Zeitalter das Doppelte (Antike), Dreifache (Mittelalter),
  Vierfache (Industrialisierung) und Fünffache (Moderne), die Singularität das 2,5-Fache
  (250). Rabatte (Griechenland, Wissenschaftliche Methode) ziehen danach ab; Kopieren zahlt
  die Marathonkosten. Regelbogen und Technologiebogen zeigen die umgerechneten Zahlen.
* **Draft der Fähigkeiten:** Vor dem ersten Zug sehen alle die Karte, jede Hauptstadt mit
  ihrem Ertrag und die ausgewürfelten Starttechnologien jedes Reichs (Knopf **Bogen**).
  Dann wählt jedes Reich in Schlangenreihenfolge (Zugfolge ab dem Startspieler, dann
  rückwärts: 1-2-3-4-4-3-2-1) zwei Fähigkeiten aus einem Vorrat von 2n + 1 – bei vier
  Wählenden neun. Der Vorrat wird zufällig aus allen zwölf Fähigkeiten gezogen, dieselbe
  kann mehrfach darin liegen; der Letzte wählt aus den letzten zwei. Fremde Fähigkeiten
  wirken wie eigene (Russland mit Handelsreich tauscht 1:1). Eine, die man schon hat, darf
  man nur nehmen, wenn nichts anderes übrig ist – doppelt wirkt sie nicht doppelt.
  **Bots draften nicht** (nach den Bot-Regeln haben sie keine Fähigkeiten); sitzt einer am
  Tisch, ist der Vorrat 2 · 3 + 1 = 7. Die KI wählt selbst.
* Während des Drafts hat noch niemand eine Fähigkeit – Bogen und Hauptstadtertrag zeigen
  deshalb die Werte ohne (kein griechischer Rabatt, keine Gratisarmee).
* „Nochmal spielen" führt wieder in den Draft, mit neuer Karte.

## Tutorial

Beim Öffnen kommt eine Frage: **schon Erfahrung mit Spielen wie Civilization?**

* **Nein** → die ausführliche Fassung, 29 Schritte, erklärt alles von Grund auf.
* **Ja** → eine kurze Fassung, 24 Schritte, **dieselben Aufgaben**, aber nur die
  Eigenheiten dieses Spiels: Ressourcen verfallen am Zugende, Kampfrechnung, Zufall im
  Technologiebaum, Zivilisationsfähigkeiten, die Siegwege samt Punktvergleich.

Beide kommen aus einer Schrittliste (`TUT_STEPS` in `js/tutorial.js`): jeder Schritt hat
neben `html` ein Feld `kurz` – kurzer Text oder `false` für „in der kurzen Fassung nicht
dabei". Aufgaben stehen damit nur einmal im Code und können nicht auseinanderlaufen.

* **Im Spiel:** *Karte bearbeiten* → Gelände antippen; Hauptstädte über die
  Zivilisationsfelder der Palette setzen, oben rechts mit ✓ speichern.
  Über *Exportieren* / *Importieren* lässt sich die Karte als Datei sichern.
* **Im Code:** `js/data.js`, `DEFAULT_MAP`. Eine Zeile = eine Hexreihe,
  ungerade Zeilen sind nach rechts versetzt.
  `G` Grasland · `W` Wald · `B` Gebirge · `F` Fluss · `M` Meer · `I` Insel ·
  `X` kein Feld (liegt außerhalb der Karte – so entstehen nicht rechteckige Umrisse;
  im Editor blass gestrichelt, sonst unsichtbar).

### Druckbogen der Plättchen

`Startplaettchen.pdf` (3 Seiten A4 quer) zeigt alle 20 Plättchen zum Ausschneiden – in der
Optik des Spiels (dieselben Farben und Geländezeichen, dieselbe dünne Feldlinie),
Feldbreite rund 20 mm. Auf dem Bogen steht **nichts außer den Plättchen**: kein
Hintergrund, keine Überschrift, keine Namen, kein Umriss. Zwischen den Dreiecken bleiben
4 mm Luft; sie wechseln zeilenweise die Richtung (Spitze unten, Spitze oben, …) und
greifen so mit ihren Schrägen ineinander, ohne sich zu berühren – dadurch passen acht auf
eine Seite statt vier.

Neu erzeugen nach Änderungen an `TILE_POOL`:

```bash
node tools_startplaettchen_dump.js    # liest js/tiles.js → tiles.json
python3 tools_startplaettchen_pdf.py  # tiles.json → Startplaettchen.pdf (braucht reportlab)
```

Der Bogen kann so nicht vom Spiel abweichen – er wird aus derselben Quelle gebaut.

### Neue Zivilisation hinzufügen

Alle Reiche stehen in **`data/civs.json`** – Name, Zeichen, Farbe, Zugreihenfolge und je
drei Fähigkeiten. Danach:

```bash
node tools_civs.js     # schreibt js/civs.js aus data/civs.json
node test.js           # prüft, dass beide zusammenpassen
```

Die Reihenfolge in der JSON ist die **Anzeigereihenfolge** (Aufbau, Regelbogen), das Feld
`order` die **Zugreihenfolge** im Spiel. Was die JSON nicht enthält, sind die Regeln: eine
neue Alternativfähigkeit braucht zusätzlich Code in `js/engine.js`, der ihren Schlüssel
über `isAbil(p, '…')` prüft – der Test meldet eine Fähigkeit, die nirgends geprüft wird.
Grundfähigkeiten heißen bei allen Zivilisationen `basis` und werden deshalb immer mit der
Zivilisation geprüft: `hasAbil(p, 'russland', 'basis')` (seit v83 – im Marathon kann jedes
Reich jede Fähigkeit draften). Neue Fähigkeiten kommen automatisch in den Draft
(`ALL_ABILITIES`); die KI wählt sie mit dem Grundwert 0, bis sie einen in `KI_DRAFT_BASE`
(`js/marathon.js`) bekommt.
Englische Namen und Wirkungstexte kommen in `js/i18n.js` unter `DATA_EN.civ` und
`DATA_EN.abil`.

Warum die JSON nicht direkt geladen wird: die App läuft auch als einzelne HTML-Datei von
der Festplatte, und von `file://` darf `fetch` nicht lesen. Deshalb ist die JSON die
Quelle und `js/civs.js` die daraus erzeugte Fassung.

### Version erhöhen (wichtig beim Ausrollen)

Der Service Worker liefert **zuerst aus dem Cache**. Ein neuer Cache entsteht nur, wenn
sich `VERSION` in `sw.js` ändert – wer Dateien ändert und die Version stehen lässt, rollt
etwas aus, das bei niemandem ankommt. Deshalb vor dem Hochladen:

```bash
node tools_version.js        # Nummer +1, schreibt APP_VERSION, BUILD_HASH und die
                             # Kopfzeile von UEBERGABE.md
python3 build_single.py      # Einzeldatei neu bauen
node tools_version.js $(…)   # danach nochmal mit derselben Nummer: die Einzeldatei
                             # gehört mit in den BUILD_HASH
node tools_docs.js           # Zahlen in UEBERGABE.md nachziehen (führt die Tests aus)
node test.js                 # meckert, wenn etwas davon vergessen wurde
```

Im Browser reicht danach ein Neuladen; die alte Fassung räumt der Service Worker selbst weg.

## Prüfprogramme (nur für die Entwicklung)

```bash
node test.js     # Regeln gegen die Beispiele aus dem Regelheft
node smoke.js    # Oberfläche in jsdom durchspielen (braucht: npm install jsdom)
node tools_ki.js duell 40 diff=david   # Messreihen mit der KI (siehe Kopf der Datei)
```

`test.js` rechnet unter anderem die Einkommensbeispiele des Regelhefts nach,
prüft Technologiekosten, Stadtgründungs- und Armeekosten und spielt 40 Bot-Partien
komplett durch.

## Dateien

```
index.html            Aufbau der Bildschirme
css/style.css         Optik des gedruckten Spielbogens
js/data.js            Technologien, Zivilisationen, Erträge, Karte
js/hex.js             Hexraster, Distanzen, Wegsuche
js/tiles.js           Dreiecksplättchen: Vorrat, Formen, Legephase, Kartenbau
js/engine.js          Regeln: Einkommen, Aktionen, Kampf, Sieg
js/bots.js            Bot-Züge nach den Bot-Regeln
js/ki.js              KI-Züge nach den Regeln für Menschen
js/marathon.js        Marathon: Kartengenerator, Hauptstädte, Draft, Draftwahl der KI
js/ui.js              Karte, Gesten, Aktionsblätter, Editor
sw.js                 Offline-Cache
ANNAHMEN.md           wo die Regeln offen sind und wie hier entschieden wurde
data/civs.json        die Zivilisationen – Quelle für js/civs.js (node tools_civs.js)
Startplaettchen.pdf   Druckbogen der 20 Plättchen (aus js/tiles.js erzeugt)
```
