# Annahmen, Auslegungen, offene Punkte

Ein Programm muss jede Regel eindeutig entscheiden, auch die, die am Tisch
per Zuruf geklärt würden. Hier steht, wo das Regelheft offen ist und wie die
Umsetzung entschieden hat. Alles davon lässt sich ändern – die Stellen sind genannt.

*Vom Autor durchgesehen und gegen das aktuelle Regelheft abgeglichen. Der frühere
Rechenfehler in Zug 1 ist in der vorliegenden Fassung behoben (jetzt „3 Münzen"). Diese
Datei beschreibt die Standardregeln; die experimentelle Variante v2 steht in Abschnitt 9.*

## 1. Kampf (aktualisiertes Regelheft)

- Angriffswert **je Armee** = Machtwert der Zivilisation; mehrere Armeen an derselben Stadt
  addieren sich. Belagerungsmaschinen geben +3 je Armee (seit v88; bis v87 +5), Dynamit
  verdoppelt danach.
- Verteidigung = Bevölkerung (Maschinengewehr: x3) + 5 mit Stadtmauern + Machtwert je
  verteidigender Armee + einmal Machtwert für Burgenbau.
- **Raketentechnik** projiziert den Machtwert einer Armee auf **zwei Ringe** - fuer Angriff,
  Verteidigung und Kontrollzone gleichermassen. Eine Armee neben mehreren gegnerischen
  Staedten (nur mit Raketentechnik erreichbar, da Staedte Mindestabstand haben) greift alle
  gleichzeitig an. Eine eigene Armee auf Distanz 2 verteidigt eine eigene Stadt mit.
- **Burgenbau** stellt eine virtuelle, unbewegliche Armee in die Stadt. Sie verteidigt die
  eigene Stadt und kann zum **Flankieren** genutzt werden (andere eigene Staedte liegen
  immer zu weit weg). Beim Flankieren zaehlt sie wie eine echte Armee auf dem Stadtfeld.
  **Mit Schiesspulver wirft sie auch eine Kontrollzone** (v68, gemeldeter Fehler): eine
  Armee ist eine Armee, auch wenn sie sich nicht bewegt – 1 Ring, mit Raketentechnik 2.
  Vorher fehlte das, und eine Mauer aus Armee – Burgstadt – Armee hatte an der Stadt ein
  Loch. **Nicht mitgeaendert:** ob die Burg auch eine eigene Feldarmee in Reichweite
  mitverteidigt (`armyDefenseValue` zaehlt nur echte Armeen). Das Regelheft sagt nur
  „verteidigt die eigene Stadt" – offene Auslegung, siehe Uebergabe.
- **Taktik**: Flankieren von zwei beliebigen benachbarten Feldern; ohne Taktik muessen die
  zwei Felder gegenueberliegen (mit Raketentechnik auf Distanz 2 gegenueberliegend).
  **Seit v75 auf allen drei Achsen** (behobener Fehler): gespiegelt wurde bis v74 in
  Zeile/Spalte, und das stimmt im versetzten Raster nur Ost–West. Nordwest–Suedost und
  Nordost–Suedwest flankierten nicht, dafuer zwei Felder derselben Seite (gerade Zeile
  Nordost + Suedost, ungerade Nordwest + Suedwest). Jetzt Wuerfelkoordinaten
  (`hexOpposite`), in Kampf und Bot-Zielwahl gleich. Gemessen an 200 Bot-Partien
  (Originalkarte, vier Bots): Flankierungen 226 → 237, Militaersiege 161 → 169, Spielende
  im Median unveraendert Runde 6.
- **Schiesspulver (Kontrollzone)**: gegnerische Armeen halten an, sobald sie ein Feld in
  Reichweite (1, mit Raketentechnik 2) einer deiner Armeen betreten. **Luftwaffe** ignoriert
  Kontrollzonen.
- Eroberung: -2 Bevoelkerung (Rittertum -1, Militaergericht 0). Bleibt 0 uebrig, wird die
  Stadt zerstoert. Die Stadt faellt, wenn der Angriff **zwei aufeinanderfolgende eigene
  Zuege** hoeher war; sinkt er dazwischen, beginnt die Zaehlung neu.

## 2. Bewegung und Armeen

- Armeen sind **nicht stapelbar**: kein Feld trägt zwei Armeen. Sie dürfen auf **keine Stadt**
  ziehen, auch nicht auf eine eigene. Eine frisch gebaute Armee steht im Zug ihrer Entstehung
  auf dem Stadtfeld und muss es im selben Zug verlassen.
- **Die Luftwaffe überfliegt, was andere sperrt (v63, Anweisung des Autors):** Vulkane,
  Felder mit gegnerischen Armeen und gegnerische Städte darf sie **durchqueren**, aber nicht
  als Zugziel wählen — ein Überflug ist kein Landeplatz. Getrennt in `canPass` (durchqueren)
  und `canStop` (anhalten); `armyReach` filtert die Ziele bereits über `canStop`, deshalb
  greift die Trennung überall gleich, auch bei den Bots.
  **Gesperrt bleiben auch für sie:** eigene Armeen (nicht stapelbar), eigene Städte (dort
  blockierte die Armee den Bauplatz) und Kartenlöcher (X) — die sind kein Gelände, sondern
  das Draußen der Karte.
- Reichweite: 3 Felder, mit Panzerschiff 6, mit Luftwaffe faktisch unbegrenzt (Wert 9, ignoriert
  Gelände). Ein durch Forschung gewonnener Reichweitensprung wirkt **sofort im selben Zug** –
  die Erhöhung wird der Restbewegung der eigenen Armeen gutgeschrieben.
- **Wasser**: Navigation erlaubt nur das **Durchqueren** von Wasser, nicht das Anhalten darauf.
  Auf einem Wasserfeld enden darf eine Armee erst mit **Panzerschiff** oder **Luftwaffe**.
- Spielerreihenfolge ist fest: **Russland → Griechenland → England → Wikinger**. Der Startspieler
  (wer zuletzt ein Weltwunder baute) bestimmt nur den Einstiegspunkt in dieser Rotation.

## 3. Rundungen und Zahlen

| Punkt | Entscheidung | Alternative |
|---|---|---|
| „Macht um 1/2 reduzieren (aufrunden)" | der **Verlust** wird aufgerundet: 8 → 4, 5 → 2 | das Ergebnis aufrunden: 5 → 3 |
| Stahl 1/3, Panzer 1/4 | ersetzen den Nenner, gleiche Rundung | |
| Stadtgründung | Grundkosten 1/3/6/10/15/… (n·(n+1)/2 bei n eigenen Städten) + Distanz zur **Hauptstadt** in passierbaren Feldern | |
| Kartografie | streicht nur den Distanzanteil, Grundkosten bleiben | |
| Singularität | Kosten 120 (seit v88; bis v87 100 – aus der Variante v2 –, das Regelheft nennt 25), im Marathon 300; griechischer Rabatt −5, Wissenschaftliche Methode −10 | |
| Armeekosten Wikinger | 5 × (Armeen inkl. neuer − 1), die erste Armee ist damit gratis | Mindestpreis 5 |
| Sklaverei | höchstens **einmal pro Runde pro Stadt**; die Stadt darf davor wachsen | |
| Kolonialismus | kauft nur **herrenlose** Felder (keine Stadt, keine Kontrolle), **3 Münzen** je Feld (`COLONY_COST`, bis v71: 5) | |

## 4. Was ein Feld einbringt

* Ressourcen sind **Fluss, kein Vorrat**: Wissenschaft, Nahrung und Münzen verfallen am
  Zugende, nur Macht bleibt liegen. (Das Regelheft sagt es nicht ausdrücklich, das
  Beispiel schon: „Mit der 1 Wissenschaft die sie übrig hat, kann sie nichts mehr anfangen.")
* Ein Feld, auf dem **irgendeine** Stadt steht, zählt für niemanden als Geländefeld.
* Kontrolle ist **nicht exklusiv**: liegt ein Feld an Städten zweier Reiche, erhalten es
  beide. So steht es wörtlich im Regelheft („Alle Felder, die an deine Städte angrenzen,
  sind unter deiner Kontrolle"), eine Konfliktregel fehlt.
* **Wald** bringt in der Grundtabelle 1 Münze. Die Zeile war in der Vorlage schwer zu
  lesen – bitte kurz gegen den gedruckten Bogen prüfen (`TERRAIN` in `js/data.js`).
* **Ertragstechnologien** (seit v88, Anweisung des Autors) schließen die billigeren ihres
  Feldes auf demselben Gelände bzw. je Bevölkerung ein: Mathematik gibt dem Wald +1
  Wissenschaft, Elektrizität +2, Künstliche Intelligenz +3, auch alle drei zusammen +3.
  Verschiedene Felder addieren sich. Bis v87 addierte jede ihren eigenen Zuwachs. Einzelheiten
  im Abschnitt v88 am Ende.
* **Nahrungsdefizit** (mehr Bevölkerung als Ertrag): wird, soweit möglich, automatisch mit
  Münzen bzw. Wissenschaft gedeckt (England, Massenmedien, Gentechnik zum Kurs 1:1).
  Bleibt ein Rest, passiert nichts weiter – eine Hungerregel gibt es nicht.
* **Bürokratie** („Hauptstadt produziert doppelt") verdoppelt alles, was die Hauptstadt
  einbringt: ihre Bevölkerung **und** ihre sechs Umlandfelder. Ein Feld, das gleichzeitig
  an eine zweite eigene Stadt grenzt, zählt als Hauptstadtumland und verdoppelt sich
  ebenfalls. Das Aktionsblatt zeigt bei diesen Feldern direkt den verdoppelten Ertrag.
* **Ökologie** („Städte: +1 auf alle Erträge / 2 Bevölkerung (abrunden)\", seit v69 auf
  Anweisung des Autors; vorher nur +1 Nahrung) gibt je Stadt ⌊Bevölkerung / 2⌋ auf
  Wissenschaft, Nahrung **und** Münzen. Abgerundet wird **je Stadt**, nicht über das
  ganze Reich: 5 + 3 Bevölkerung ergeben 2 + 1, nicht 4. *(So bis v85 – seit v86 über das
  ganze Reich gezählt und einmal abgerundet, siehe Abschnitt v86.)* Der Posten gehört zur
  Bevölkerungszeile von `incomeBreakdown` – daraus folgt, genau wie vorher schon für den
  Nahrungsanteil: Bürokratie verdoppelt ihn in der Hauptstadt, bei Revolution fällt er
  dort aus, und sein Nahrungsanteil senkt `popFoodCost` (Füttern mit Gentechnik/
  Massenmedien deckt also nur, was nach Ökologie noch gegessen wird). Hungersnot und
  Wirtschaftskrise kappen wie sonst nur ihren eigenen Ertrag. Als Grundtechnologie wirkt
  Ökologie auch für Bots. Neu als Folge: ihr Wissenschaftsanteil zählt beim
  Nahrungsposten der Gentechnik mit (je vier Wissenschaft eine Nahrung).

## 5. Straßen und Eisenbahn

Straßen liegen auf Feldern, nicht auf Kanten: 1 Münze für nichts → Straße oder
Straße → Eisenbahn, 2 Münzen für nichts → Eisenbahn. Ein Schritt zwischen zwei
Feldern kostet ½ Bewegungspunkt, wenn beide mindestens eine Straße haben, und 0,
wenn beide eine Eisenbahn haben.

**Stadtfelder zählen selbst als Straße bzw. Eisenbahn, sobald mindestens ein
angrenzendes Feld die jeweilige Stufe hat.** Ein Weg endet also nicht am Stadtrand,
sondern läuft durch die Stadt hindurch weiter; man muss (und kann) auf Stadtfeldern
nichts bauen. Zwei benachbarte Städte, die je an einer Straße liegen, sind dadurch
ebenfalls verbunden.

## 6. Technologien

* Verfügbarkeit: je Technologie ein Würfel, 4+ ist verfügbar. Griechenland +1 (im
  Standard) und Philosophie +1 **stapeln**. Ist danach nichts verfügbar, wird eine
  Technologie ausgewürfelt (Wurf über der Anzahl → neu würfeln).
* Das nächste Zeitalter wird ausgewürfelt, sobald in Feld + Zeitalter die **erste**
  Technologie erforscht ist – auch dann, wenn sie kopiert wurde.
* Jeder Effekt wirkt **sofort nach dem Forschen** im selben Zug (z. B. senkt Kartografie
  die Gründungskosten unmittelbar). `test.js` prüft das.
* Kopieren, drei **unabhängige** Wege: **Spionage** bezahlt (1× Basiskosten in Münzen, kein
  Rundenlimit), **Kundschafterei** bezahlt (2× Basiskosten, `SCOUTING_RATE`; bis v71 3×),
  **Internet** 1× pro Runde
  kostenlos. Wer einen bezahlten Weg **und** Internet hat, bekommt pro Technologie **beide**
  Optionen angeboten (bezahlt kopieren oder die eine Gratiskopie darauf verwenden). Beim
  Kopieren gelten keine Vergünstigungen (Wiss. Methode etc.), es zählen die Basiskosten.
  Die Gratiskachel zeigt seit v73 wie jede andere die **Wirkung** der Technologie; bis v72
  stand dort nur „Internet · Gratiskopie".
* **Alternativer Techtree** (v70, Anweisung des Autors): ein Häkchen im Aufbau, je Partie,
  ab Werk aus. Es ist **kein Modul** – die Zeile steht immer im Aufbau, die Einstellungen
  kennen sie nicht. Angehakt gelten andere Grundkosten (`ALT_TECH_COSTS` in `js/data.js`):
  Forschung Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 (vorher 2/3/4/1),
  Produktion Bewässerung 1, Landwirtschaft 5 (vorher 5/1). Seit v74 (Anweisung des
  Autors) zusätzlich in der Forschung der Industrialisierung: Chemie 11, Biologie 12,
  Wissenschaftliche Methode 15 (vorher 12/15/11) – die Leiter heißt dort jetzt Chemie,
  Biologie, Elektrizität (13, unverändert), Wissenschaftliche Methode. Ausgelegt so:
  - **Nur die Kosten ändern sich.** Feld, Zeitalter und Wirkung bleiben. Das Zeitalter
    kommt weiter aus den Standardkosten (`t.age`); alle neun Werte bleiben in ihrem
    Zeitalter (sechs in der Antike, 11/12/15 in der Industrialisierung, 11–15), ein Test
    hält fest, dass keiner die Zeitaltergrenze überschreitet. Wer später einen Wert über
    eine Grenze legen will, muss das Zeitalter mitrechnen lassen.
  - **Die Leitern ordnen sich nach den neuen Kosten** (`techsIn`): im Bogen, im
    Regelbogen und im Bogen der Legephase. Damit folgen auch alle Würfe auf „die n-te
    Technologie" der neuen Leiter – Verfügbarkeit, „keine verfügbar → eine auswürfeln"
    und die Bot-Forschung. Derselbe Seed kann deshalb andere Starttechnologien ergeben.
  - **Vergünstigungen setzen auf die neuen Grundkosten auf** (Griechenland −1 in der
    Antike, Wissenschaftliche Methode −2): Schrift kostet Griechenland also 3. In der
    Industrialisierung (−3 bzw. −6): Wissenschaftliche Methode kostet Griechenland 12,
    und wer sie hat, zahlt für Chemie 5 und für Biologie 6.
  - **Kopieren** zahlt die Basiskosten dieser Partie (Spionage: Schrift 4 Münzen,
    Wissenschaftliche Methode 15).
  - **Bots** spielen auf denselben Leitern. Das **Tutorial** läuft immer im Standard.
  - „Nochmal spielen" übernimmt den Schalter (er steht im Rezept). Spielstände und
    Rezepte aus v69 und früher kennen ihn nicht und laufen im Standard.
  - **Er unterscheidet sich nur in den Forschungskosten** (Klarstellung des Autors zu
    v72). Kolonialismus 3 Münzen je Feld und Kundschafterei 2× gelten in **beiden**
    Techtrees (Abschnitt 3 und oben); v71 hatte sie nur hier eingeordnet. Kopiert wird
    zu den Grundkosten der Partie: Kundschafterei kopiert Schrift im Standard für 2, im
    alternativen Techtree für 8 Münzen.
  - Die Listen mit **Gratis-Technologien** (Freie Forschung, Rückschau, Bibliothek,
    Oxford, Raumfahrt) zeigen keine Kosten und behalten ihre Reihenfolge aus `TECHS`.
  - Sichtbar ist der Schalter im Aufbau (mit Hinweis auf die geänderten Kosten), im
    Weltblatt, im Regelbogen und im Protokollkopf.

## 7. Bots

* Der Machtwert eines Bots ist immer seine Gesamtbevölkerung (so das Regelheft) – das macht
  Bots früh militärisch stark. In 40 Testpartien gewannen sie überwiegend militärisch.
  Für ein längeres Spiel niedrigere Schwierigkeit wählen.
* **Siedlerbewegung** (seit 17.8. nach den Schritten 1–7 der Bot-Regeln): Der Siedler zieht
  auf das **durch Bewegung erreichbare siedelbare Feld, das der Hauptstadt am nächsten
  liegt**; bei mehreren gleich nahen wird ausgewürfelt. Steht er auf einem siedelbaren Feld,
  würfelt er – bei 3+ siedelt er, sonst zieht er ein Feld in eine ausgewürfelte Richtung und
  prüft erneut. Er geht nie direkt zurück, betritt Meer nur mit Navigation/Panzerschiff/
  Luftwaffe, und trifft er auf eine eigene Stadt, beginnt er wieder mit dem Zug zum
  nächstgelegenen siedelbaren Feld. Erreichbarkeit ist Geländedistanz nach denselben
  Bewegungsregeln, die auch für Armeen gelten (`settleDistances` in `js/bots.js`).
  Vorher lief die ältere Fassung (nur würfelnde Wanderung ab der Hauptstadt). Die war
  fehlerhaft schwach: Englands Hauptstadt liegt auf der Originalkarte in einer Bucht, in der
  fünf von sechs Richtungen Meer sind, und der Siedler verschenkte jeden Schritt in eine
  gesperrte Richtung – in 32 % der Partien meldete er schon in Runde 1 „findet keinen Platz",
  obwohl 34 freie Plätze im Umkreis 5 lagen. Mit der neuen Fassung sind es **0 von 200**,
  und die Bots gründen deutlich mehr Städte (10,2 → rund 12 je Partie, in Testpartien ohne
  Kämpfe bis 17). Die Klausel „betritt keine durch Distanz nicht siedelbaren Felder" gilt
  weiter nur für die Wanderung, nicht für den Zug zum Zielfeld – sonst käme der Siedler nicht
  aus dem Sperrbereich der eigenen Stadt heraus.
* **Armeeprioritäten** (Reihenfolge des Regelhefts): 1. belagerte eigene Städte
  verteidigen, 2. gegnerische Städte angreifen, 3. gegnerische Armeen flankieren,
  4. an den Reichsrand ziehen, möglichst nah an einer gegnerischen Stadt. Innerhalb einer
  Priorität wählt der Bot die Option mit dem **geringsten gegnerischen Machtwert**, bei
  Städten die **Hauptstadt** bevorzugt; echte Gleichstände werden ausgewürfelt.
* Distanzen zu Gegnerstädten rechnet der Bot über **tatsächlich passierbares Gelände**
  (nicht Luftlinie): ohne die passende Technologie muss er Wasser umgehen.
* **v2**: Bots forschen zweimal pro Runde (zwei Würfe auf Erfolg) und dann in zwei
  **unterschiedlichen** Technologiefeldern.

## 8. Karten

Zur Wahl stehen zwei Karten, umschaltbar im Aufbaubildschirm:

**Originalkarte (12 × 18).** Aus dem Foto des gedruckten Bogens ausgemessen, nicht
geschätzt: Rasterorientierung (spitze Ecke oben, ungerade Reihen nach rechts versetzt),
Spaltenabstand 117,4 px und Reihenabstand 101,6 px wurden aus dem Bild bestimmt, dann jede
der 216 Waben über einen Farbring innerhalb der Wabe klassifiziert. Alle 216 Felder waren
eindeutig – das unsicherste hatte noch 25 Einheiten Abstand zur zweitbesten Farbe. Die
Geländefarben der App sind exakt die des Bogens.

**Große Karte (15 × 24).** Im selben Stil erzeugt und an den Kennzahlen der Originalkarte
ausgerichtet: 68 % Land (Original 70 %), Geländeanteile 49/23/13/13/2 % gegenüber
51/21/13/11/4 %. Etwas stärker durchmischt, wie gewünscht – 51 % gleichartige Nachbarn
statt 56 %, größte einfarbige Fläche 39 statt 31 Felder. Gebirgszüge tragen Flussläufe bis
ans Meer, Inseln liegen im offenen Wasser. Kleinster Hauptstadtabstand 10 statt 7, dadurch
läuft eine Partie länger (Median 8 statt 5 Runden in 40 Bot-Testpartien).

**Offen bleibt: welche Zivilisation an welchem Stern startet.** Die vier Sterne auf dem
gedruckten Bogen sind identisch, er sagt es nicht. Zugeordnet ist nach Himmelsrichtung:
Wikingerreich Norden, Russland Osten, England Westen, Griechenland Süden – auf beiden
Karten gleich, änderbar über *Karte bearbeiten*.

Ein Anhaltspunkt aus dem Erratum „die zwei Felder nördlich der Hauptstadt des
Wikingerreichs sollten Grasland sein": auf der abgelesenen Karte trifft das nur auf zwei
der vier Sterne zu, den nördlichen und den südlichen. Das passt zur obigen Zuordnung,
beweist sie aber nicht.

„Kernphysik" und „Raumfahrt" kommen im Technologiebogen ohnehin nicht vor.

## 9. Eine Regelvariante statt zwei

Die früher „experimentell v2" genannten Regeln **sind** jetzt die Regeln. Das Dropdown
„Regeln" im Aufbau ist weg, `RULESETS`/`setRules()` sind aus dem Code entfernt.
Übernommen wurde:

- **Singularität** kostet 100 (Rabatte gelten weiter: Griechenland −5, Wiss. Methode −10).
  Seit v88 120 (Anweisung des Autors, siehe dort).
- **Keramik** (Produktion, Antike, 4) und **Theologie** (Spezial, Mittelalter, 10) sind
  normale Technologien.
- **Verbundwerkstoffe**: 1× zusätzliches, **kostenloses** Wachstum pro Stadt und Runde.
  Allein also 2×, mit Keramik bis 3×, davon eins gratis. Eigener Knopf „Kostenlos wachsen".
  Bezahltes und kostenloses Kontingent werden **getrennt** geführt (`growLimits().paid` bzw.
  `.free`, verbraucht über `city.grown` und `city.freeUsed`): das Gratis-Kontingent lässt
  sich nicht in einen zweiten **bezahlten** Schritt umwandeln. Vorher prüfte `canGrowPaid`
  nur das Gesamtmaximum, sodass man mit Verbundwerkstoffen zweimal bezahlt wachsen konnte
  (behoben 20.8.); der Knopf begründet die Sperre jetzt mit „Diese Runde nur noch
  kostenloses Wachstum.".
- **Sklaverei** wird obsolet, sobald ein Reich die erste Technologie der Moderne hat. Im
  Technologiebogen ist die Kachel dann durchgestrichen und trägt den Hinweis „obsolet".
- **Siegschwellen** stapeln nicht: es gilt die niedrigste (Standard ≥2/3, Theologie >3/5,
  UN >1/2).
- **Bots** forschen zweimal pro Runde in unterschiedlichen Feldern.
- **Griechenland hat keinen Würfelbonus** auf die Techverfügbarkeit. Der
  Zivilisationsbogen nennt „3+ beim Würfeln", der Autor hat das ausdrücklich als Fehler im
  PDF bezeichnet; es gilt nur die Kostenvergünstigung.

## 10. Nahrungsproduktion darf nicht negativ werden

Grenze ist das **Einkommen** (Geländenahrung − Bevölkerung), nicht der Vorrat.

- Jedes Wachstum wird abgelehnt, wenn das Nahrungseinkommen danach unter 0 fiele – bezahlt,
  kostenlos und aus Wundereffekten gleichermaßen.
- Ein Wundereffekt, der um mehrere Punkte wachsen lässt (Hängende Gärten, Angkor Wat,
  Freiheitsstatue), wird **so weit ausgeführt, wie er passt**, und dann abgebrochen.
- Ein bereits negatives Einkommen (nach Eroberung, Sturmflut, Revolution) wird auf 0
  gekappt. **Es verhungert niemand**, die Bevölkerung bleibt stehen.
- **Wissenschaft → Nahrung** gibt es nur über die Münzen: mit **Alchemie** (Wissenschaft →
  Münzen 1:1) kostet 1 Nahrung 2 Wissenschaft, mit Gilden oder als England 1 Wissenschaft.
  Vorher war dieser Weg gar nicht möglich – ein Fehler, der beim Bezahlen von Wachstum und
  Stadtgründungen auffiel (behoben 17.8.).
- **Massenmedien** hebt die Grenze auf und ist seit v64 die **einzige** Technologie, die
  füttert. Sie ist ausdrücklich **kein allgemeiner Umtauschkurs**: sie steht nicht in
  `rates()`, man kann mit ihr also nichts kaufen. Sie füttert nur, über den Knopf am
  Nahrungszähler, und zwar **im Kurs 1 Münze : 3 Bevölkerung** (`FEED_COIN_RATE`;
  v64 zunächst 1:5, v66 auf 1:3 gesetzt, beides auf Anweisung des Autors; ursprünglich
  1:1). Der Spieler wählt zu Zugbeginn, wie viele Münzen – auch ohne Defizit, wenn er
  einfach mehr Nahrung möchte.
  **Die letzte Münze darf teilweise verfallen:** sind nur noch 2 Kosten offen, kostet es
  trotzdem eine ganze Münze und deckt eben nur 2. Anders ginge es nicht auf, solange Münzen
  ganzzahlig sind – und verschenkt ist dabei nichts, was es sonst gäbe: mehr als die
  Bevölkerung isst, deckt ohnehin niemand. Mehr Münzen als nötig lässt `coverPop` nicht zu.
- **Gentechnik kann seit v65 beides** (Anweisung des Autors):
  · Sie **füttert weiter aus Wissenschaft, unverändert 1:1** – wie Massenmedien über den
    Knopf am Nahrungszähler, höchstens bis zur Höhe dessen, was die Bevölkerung isst,
    und ebenfalls kein Kurs in `rates()`. Sie hebt die Nahrungsgrenze also weiter auf.
  · Sie bringt **zusätzlich je `GENE_SCI_PER_FOOD` (v64: 2, v66: 4) Wissenschaft eine Nahrung ins
    Einkommen**, abgerundet, zu Zugbeginn – gerechnet auf die Wissenschaft, die in dieser
    Runde tatsächlich anfällt, also nach Ereignissen und nach der Verdopplung durch den
    Tadsch Mahal. Eigene Zeile in `incomeBreakdown`.
  **Die beiden Wirkungen rechnen nicht gegeneinander:** der Einkommensposten hängt an der
  Wissenschaft, die ANFÄLLT, das Füttern an der, die noch DA ist. Wer seine Wissenschaft
  verfüttert, verkleinert den Nahrungsposten nicht nachträglich. Beides ist geprüft.
  **Bei Hungersnot bleibt der Einkommensposten aus** („keine Nahrung produziert") – sonst
  käme mitten in der Hungersnot Nahrung aus dem Labor. Das Füttern bleibt möglich, es
  verschiebt ja nur, was ohnehin da ist.
- Offene Frage, bewusst so umgesetzt: wer eine der beiden Techs hat, darf beliebig weit über
  die Grenze wachsen, und ein **nicht gefüttertes** Defizit kostet nichts (Nahrung steht dann
  bei 0). Die Techs heben die Mechanik damit eher auf, als sie in einen Handel zu verwandeln.
  Sollte die Grenze wirklich beißen, wäre die Regel „Wachstum nur so weit, wie der Spieler
  diese Runde auch füttern kann" oder „ungedecktes Defizit kostet Bevölkerung" – beides ist
  eine Zeile in `growthBlocked()` bzw. `beginTurn()`.

## 10c. Plättchenmodus: erst würfeln, dann legen (v66)

Auf Anweisung des Autors. Welche Technologien am Anfang **verfügbar** sind und welche
**Weltwunder** im Stapel liegen, hängt allein an den Würfeln – nicht an der Karte. Beides
wird deshalb im Plättchenmodus **vor** der Legephase ausgewürfelt (`rollSetup`), damit
jeder sein Startplättchen mit dieser Kenntnis legt: wer Fischerei und Navigation ziehen
kann, setzt die Hauptstadt anders als jemand mit Bewässerung.

- Gewürfelt wird in einer **Wegwerf-Partie auf der Standardkarte** – die echte Karte gibt
  es zu dem Zeitpunkt noch nicht, und für diese Würfe spielt sie keine Rolle.
- Das Ergebnis geht als `cfg.avail` (nach PLATZ, nicht nach Zugfolge) und `cfg.wpool` in
  die echte Partie. `newGame` **übernimmt** es, statt neu zu würfeln. Heute käme ohne die
  Übergabe dasselbe heraus, weil beide denselben Seed benutzen und Aufbau 3 die ersten
  Würfe sind; die Übergabe macht das unabhängig von der Würfelreihenfolge.
- In der Legephase zeigt der Knopf **Forschung** denselben Technologiebogen wie im Spiel,
  nur ohne Knöpfe und ohne Kostenampel: vor dem ersten Zug gibt es nichts zu kaufen.
- **Fremde Verfügbarkeiten stehen nicht darin.** Im Hotseat wird verdeckt gelegt; jeder
  sieht nur den eigenen Bogen. Die Wunderstapel sind dagegen für alle gleich.
- Nur der Plättchenmodus geht diesen Weg. Auf festen Karten gibt es keine Legephase, dort
  bleibt alles wie bisher.

## 10b. Stadtgründung

Zusätzlich zu den bekannten Bedingungen (Landfeld, kein Vulkan, kein besetztes Feld,
mindestens 3 Felder Abstand zu jeder Stadt):

- **Distanzkosten zählen den Weg, nicht die Luftlinie** (`foundDistance`). Passierbar sind
  Landfelder, Wasser nur mit Navigation, Panzerschiff oder Luftwaffe, keine Vulkane und keine
  Felder mit gegnerischen Armeen (Regelheft: „Von gegnerischen Armeen besetzte Felder …
  zählen als unpassierbar"). **Gibt es keinen Weg, ist das Feld nicht gründbar** – vorher
  wich die Rechnung auf die Luftlinie aus, wodurch man als England ohne Navigation auf einer
  Insel siedeln konnte (behoben 17.8.). Kartografie erlässt nur die Distanzkosten, nicht die
  Erreichbarkeit.
  **Gegnerisches Territorium sperrt den Weg (v63, Anweisung des Autors).** Damit ist die
  Regelheft-Klausel umgesetzt: als unpassierbar zählen jetzt Felder mit gegnerischen Armeen,
  **gegnerische Städte** und **gegnerisches Territorium** — Stadtumland und per Kolonialismus
  gekaufte Felder anderer, noch lebender Reiche, so wie `controlledTiles` Herrschaft überall
  im Spiel versteht (`foreignTerritory`). Ein Feld, das auch im eigenen Gebiet liegt, sperrt
  nicht: das eigene Herrschaftsrecht gilt vor dem fremden. Berechnet wird das Gebiet **einmal
  je Wegsuche**, nicht je Feld — je Feld war es zu teuer.
  Es gilt für **Bots genauso** (`botSettlerPass`), sonst wäre die Sperre ein einseitiger
  Nachteil des Menschen: der Bot-Siedler zöge weiter quer durch fremdes Land.
  **Die Luftwaffe überfliegt all das (v63):** Gelände, Vulkane, gegnerische Armeen,
  gegnerische Städte und Grenzen. Für den Siedler ist ein Überflug ein Weg — anders als bei
  der Armee gibt es hier kein „anhalten". Nur Kartenlöcher (X) bleiben gesperrt.
  Die Meldung nennt den Grund getrennt (`foundBlockReason`: `wasser` / `gebiet` / `gelaende`),
  weil „dafür fehlt Navigation" bei einer Grenze oder einem Vulkan schlicht falsch wäre.
  Alles davon steht in `test.js`, Abschnitt „Was sperrt den Siedlerweg".
  **Zwei Dinge sind dabei bewusst NICHT mitgeändert worden:**
  · Die zweite Hälfte der Klausel — „**neben** gegnerischen Territorien darf nicht gegründet
    werden" — ist weiter nicht umgesetzt. Verlangt war die Unpassierbarkeit, und das
    Nachbarschaftsverbot würde die Ausbreitung noch deutlich stärker einengen.
  · Gesperrt ist der **Weg**, nicht das Zielfeld. Auf einem einzelnen fremden Feld, das man
    von außen erreicht, darf weiter gegründet werden (`pathSteps` prüft das Zielfeld nie,
    und `canFound` hat dafür keine eigene Regel). Praktisch nur bei gekauften Feldern
    möglich: das Umland fremder Städte liegt ohnehin näher als drei Felder an einer Stadt.
- **Nicht direkt neben einer gegnerischen Armee.** Gilt für Menschen (`canFound`) und Bots
  (`settleable`) gleichermaßen; eigene Armeen stören nicht, zwei Felder Abstand genügt.
- **Ausweichen des Bot-Siedlers** (Fehlerbehebung 17.8.): Zeigt die gewürfelte Richtung ins
  Wasser, auf eine Stadt oder über den Kartenrand, weicht der Siedler im Uhrzeigersinn auf die
  nächste begehbare Richtung aus, statt den Schritt zu verschenken; ist er völlig
  eingeschlossen, darf er im zweiten Durchlauf auch zurück. Vorher blieb er in einer
  Landtasche stecken – Englands Hauptstadt auf der Originalkarte liegt in einer Bucht, in der
  fünf von sechs Richtungen Meer sind, und meldete in 32 % der Partien schon in Runde 1
  „Siedler findet keinen Platz", obwohl 34 freie Plätze im Umkreis 5 lagen. Danach 2 %.
  Gemeint ist die direkte Nachbarschaft (Distanz 1), unabhängig von Raketentechnik.
- **Gründen kostet immer mindestens 1 Nahrung.** Ohne diese Untergrenze wäre es mit
  Englands Alternative „Kolonisten" (keine Basiskosten) plus Kartografie (keine
  Distanzkosten) vollständig gratis.
- Bots siedeln jetzt ebenfalls nicht auf Vulkanfeldern (vorher möglich, weil `settleable`
  nur auf „Landfeld" prüfte).

## 10c. Zufallskarte und 1 gegen 1 (neu am 17.8.)

> **In v51 entfallen.** Der hier beschriebene Rastergenerator ist samt Startgüte-Garantie,
> festen Startpunkten und Duellkarte aus dem Spiel entfernt; Zufallskarten entstehen
> ausschließlich aus Dreiecksplättchen (Abschnitt „Zufallskarten aus Dreiecksplättchen").
> Der Abschnitt bleibt als Begründungsgeschichte stehen – die Startgüte von 4 Nahrung ist
> als Entwurfsregel für den Plättchenvorrat übernommen worden.

**Zufallskarte** (im Kartenmenü wählbar): feste Größe 12 × 18 und feste Startpunkte wie auf
der Originalkarte, nur das Gelände wird gewürfelt. Die Mischung folgt der gemessenen
Verteilung der Originalkarte – 36 % Grasland, 30 % Meer, 15 % Wald, 9 % Gebirge, 8 % Fluss,
3 % Insel (`MAP_MIX`). Unter einer Hauptstadt liegt nie Meer; zusätzlich sind dort **Inseln
ausgeschlossen**, weil eine Hauptstadt auf einer Insel ohne Navigation vollständig
abgeschnitten wäre. Karten sind aus einem Startwert reproduzierbar (`randomMap(seed)`).

**Mindestgüte jedes Startplatzes** (Vorgabe des Autors, 17.8.): Jede Hauptstadt muss im
ersten Zug **mindestens 4 Nahrung** aufbringen können – Münzen zählen dabei **2:1** – und
**mindestens ein siedelbares Feld in Distanz 3** haben. Gerechnet wird mit den
Grunderträgen: keine Technologien, keine Zivilisationsfähigkeit, Stadt mit 1 Bevölkerung
(verbraucht 1 Nahrung, bringt 1 Münze). Das ist genau die Zahl, die im Spiel als verfügbare
Nahrung im ersten Zug erscheint (per Test gegen `available(S, pi, 'food')` abgeglichen).
„Siedelbar" heißt: Landfeld, kein Vulkan, mindestens 3 Felder von jeder Hauptstadt entfernt
und **über Land erreichbar** – ohne Erreichbarkeit würde `canFound` es ohnehin ablehnen.

Erfüllt ein Startplatz das nicht, wird die Karte **nicht neu gewürfelt** – vier Startplätze
gleichzeitig passen nur selten, die Ablehnungsquote wäre zu hoch. Stattdessen wird das
Umland gezielt nachgebessert: erst legt `carveSpot` bei Bedarf einen Landweg zu einem Feld in
Distanz 3, dann macht `boostFood` das nahrungsärmste Nachbarfeld zu Grasland, bis die
Schwelle erreicht ist – Meer und Inseln zuletzt, damit Küsten möglichst erhalten bleiben.
Die Geländemischung der Gesamtkarte verschiebt sich dadurch kaum (gemessen: Grasland 36 %,
Meer 29 %, Wald 14 %, Gebirge 9 %, Fluss 8 %, Insel 3 %).

Gemessen über 1600 Startplätze auf Zufallskarten und 400 auf Duellkarten: **keiner** unter
4 Nahrung, **keiner** ohne Gründungsfeld; Startnahrung median 4, höchstens 7 – die
Originalkarte liegt bei 4/5/5/4, der Startplatz ist also vergleichbar. Vorher waren es 2 %
mit negativem Nahrungseinkommen, 12 % ohne Wachstumsmöglichkeit in Runde 1 und 1 % ohne
jedes erreichbare Gründungsfeld; alle drei Werte sind jetzt 0.

Ein Sonderfall bleibt und ist keine Kartenfrage: die **Gratis-Armee der Wikinger** steht zu
Beginn neben der Hauptstadt und kann einen einzelnen Landkorridor für den eigenen Siedler
blockieren (4 von 1200 Startplätzen). Die Armee muss die Stadt ohnehin verlassen, spätestens
in der nächsten Runde ist der Weg frei.

**1 gegen 1** (Umschalter oben im Aufbau): genau zwei Reiche, jeder Platz wählt frei eine der
vier Zivilisationen mit allen drei Fähigkeiten, jeder Platz ist Mensch oder Bot. Zwei Plätze
können nicht dieselbe Zivilisation nehmen – sie teilen sich Farbe und Symbol und wären auf der
Karte nicht unterscheidbar; wählt man die des anderen, wechselt der andere Platz automatisch.
Die Karte ist immer eine frische **Zufallskarte 12 × 8** (Spalten × Zeilen) mit zwei festen,
weit auseinanderliegenden Startpunkten (`DUEL_STARTS`, Distanz 12); Platz 1 bekommt den
ersten. Beide liegen ein Feld vom Rand entfernt, damit sie sechs Nachbarfelder haben und die
Mindestgüte aus Abschnitt 10c erreichen können. **Eine Kartenwahl gibt es im Duell nicht** –
die Zeile ist ausgeblendet und das Auswahlfeld abgeschaltet.
Die **Siegschwellen liegen höher**: Wirtschaftssieg erst über 3/4 der Weltbevölkerung, mit
Theologie über 7/10, mit Vereinten Nationen über 2/3 – auch hier gilt der niedrigste
verfügbare Wert, und alle drei sind strikt („mehr als"). Militär-, Forschungs- und Kultursieg
bleiben unverändert. Der Modus steht als `S.duel` im Spielstand; die Schwellen der
Vier-Reiche-Partie bleiben unberührt.

## 10d. Tutorial als geführtes Übungsspiel

Kein Textbildschirm, sondern die **normale Spieloberfläche**: echte Karte, echte Kopfzeile,
echte Aktionsleiste, darunter ein Erklärpanel (höchstens 46 % der Höhe). 27 Schritte, davon
18 mit Aufgabe, die der Spieler **selbst** ausführen muss; „Weiter" bleibt gesperrt, bis sie
erledigt ist. Einen „Für mich machen"-Ausweg gibt es bewusst **nicht** – die Schritt-Skripte
(`auto`) existieren nur noch als Testtreiber. Jede Aktionsart nennt den **Klickweg**
(„Stadt antippen → im Blatt auf Armee bauen"); ein Test prüft, dass kein Aufgabenschritt
ohne solchen Weg auskommt.

**Alles läuft auf Schienen.** Drei Mechanismen zusammen:

1. **Feste Würfelfolge** (`TUT_DICE`): solange das Tutorial läuft, zieht `d6()` seine Werte
   aus dieser Liste statt aus dem Zufallsgenerator (`tutNextDie`, eingehängt in `d6`). Damit
   sind auch alle **Bot-Entscheidungen** identisch – Wachstum, Siedeln, Forschen,
   Armeebewegung. Die Folge wurde aus mehreren Kandidaten so gewählt, dass die Beispielpartie
   erzählerisch aufgeht (siehe unten); jede Zahl 1–6 kommt vor, sonst könnten
   Auswürfel-Schleifen im Kreis laufen. `ui.tut` wird **vor** `newGame` gesetzt, damit schon
   die Aufbauwürfe daraus kommen.
2. **Festgelegte Startverfügbarkeit** (`TUT_START_AVAIL`) statt gewürfelter: Schrift,
   Fischerei, Rad, Keramik, Eisenverarbeitung, Belagerungsmaschinen, Stadtmauern, Demokratie
   – wie im Beispielprotokoll. Später nötige Technologien (Papier, Wissenschaftliche Methode,
   Burgenbau) werden im jeweiligen Schritt freigeschaltet.
3. **Schienen in der Oberfläche** (`allow` je Schritt): erlaubt sind nur die vorgesehene
   Leistentaste, die vorgesehenen Blatt-Knöpfe, Technologiekacheln, Zielfelder. **Ein
   fehlender Schlüssel im allow-Block heißt „nichts erlaubt", nicht „alles erlaubt"** – über
   diese Lücke kam man im Protokoll-Schritt (nur `bar: ['a-log']`) über das Stadtblatt an den
   Schienen vorbei. **Leseschritte
   und bereits erledigte Aufgaben erlauben gar keine Aktion** (nur Welt und Protokoll) –
   sonst könnte man in einem Erklärschritt irgendwo gründen oder den Zug ein zweites Mal
   beenden. Gegatet wird zentral in `sheet()`, also auch Macht- und Armeeblatt.
4. **Vorgegebene Würfe je Schritt** (`dice`): wo eine Technologie des nächsten Zeitalters
   gebraucht wird (Papier, Wissenschaftliche Methode, Burgenbau), ist der zugehörige
   Verfügbarkeitswurf gesetzt. Vorher wurde die Verfügbarkeit still überschrieben – im
   Protokoll stand dann ein misslungener Wurf und die Technologie war trotzdem da.

`test.js` startet den Ablauf **zweimal** über dieselbe Funktion, die auch die App benutzt
(`tutorialSetup`), und vergleicht Protokoll und Endzustand Zeichen für Zeichen.

**Der Bogen der Beispielpartie** (Runden 1–3): Einkommen 1/5/3 verstehen · Stadt auf 3/12
(1 Basiskosten + 3 Weg) · Schrift · Hauptstadt wachsen · Zug beenden und Bots lesen ·
Zinseszins in Runde 2 · Papier · dritte Stadt · zweimal wachsen · erste Armee bauen und an
den Reichsrand ziehen · Griechenland belagert die Grenzstadt aus eigenem Antrieb
(„Angriff 5 > Verteidigung 1 (Zug 1/2)") · Wissenschaftliche Methode, danach zwei
Technologien für null · **Stadtmauern und Burgenbau** · vier Macht · **Demokratie und
Keramik** vom Rest der Wissenschaft · **vierte Stadt** vom Rest der Nahrung · Zug beenden, und
die Belagerung bricht („Angriff 9 ≤ Verteidigung 14"). Danach Nahrungsgrenze, Siegwege,
Anfängerfehler, Abschluss.

Die Belagerung wird **nicht gestellt**: der Schritt übernimmt die Armee, die der griechische
Bot von sich aus neben die Stadt gezogen hat (Notfallpfad mit eigener Protokollzeile bleibt
für den Fall, dass sie fehlt). Burgenbau ist der Grund, warum gekaufte Macht der Verteidigung
hilft – ohne die virtuelle Armee in der Stadt wäre die Stadt in Runde 3 gefallen; das war
gemessen und hat die Auswahl der Würfelfolge mitbestimmt.

**Bewusst nicht erwähnt:** Ereignisse, Weltwunder, 1 gegen 1, Zufallskarten, Karteneditor,
Kultursieg – das Tutorial bleibt in der Grundform. Ebenso stehen **keine Feldkoordinaten** in
den Texten: es wird immer über die **goldene Umrandung** gesprochen. Beides prüft `test.js`. Auch Verweise auf „die Partie des Autors"
kommen nicht vor; die zitierten Protokollzeilen sind die des laufenden Übungsspiels. Beides
ist per Test abgesichert.

**Alle Zahlen im Text** kommen aus dem laufenden Spielstand (`incomeBreakdown`, `techCost`,
`growPrice`, `defenseValue`, `attackValue`, `powerPrice`, `foodAfterGrowth`, `victoryOption`)
und können deshalb nicht veralten. „Fertig" oder „Tutorial beenden" schließt nur das Panel –
das Übungsspiel läuft ohne Einschränkungen weiter.

## 10e. Blätter und Fenster überlagern die Aktionsleiste nicht mehr

Zusätzlich war das **geschlossene** Blatt nicht wirklich weg: `translateY(110 %)` schiebt es
um die eigene Höhe nach unten, und bei kurzem Inhalt blieb ein leerer Kasten über der
Aktionsleiste stehen. Geschlossen ist es jetzt `visibility: hidden` (verzögert, damit die
Animation erhalten bleibt).

Auf breiten Geräten schwebt das Aktionsblatt in der rechten unteren Ecke – es lag damit genau
über „Protokoll" und „Zug beenden". Jetzt endet es **über** der Leiste
(`bottom: 74px + safe`), und solange ein Blatt oder ein Fenster offen ist, ist die Leiste
**gesperrt und abgeblendet** (`body.blocked`, gesetzt in `sheet`/`closeSheet`/`modal`/
`closeModal`). Das betrifft auch das Bot-Zug-Fenster, das dasselbe Blatt benutzt. Ein
Fehlgriff auf „Zug beenden" neben dem Blatt ist damit ausgeschlossen.

## 11. Zivilisationsfähigkeiten (Bogen „Civs")

Der Bogen nennt andere Völkernamen als das Spiel; zugeordnet über die identischen
Fähigkeiten, die Namen im Spiel bleiben unverändert:
Keltenreich = **Wikinger**, Ägypten = **England**, Karthago = **Russland**,
Griechenland = Griechenland. Karthagos „+1 Nahrung in Wüste" bleibt Russlands „+1 Nahrung
in Wald" – Wüste gibt es auf den Karten nicht.

Je Reich sind im Aufbau drei Fähigkeiten wählbar (Grund + zwei Alternativen). Eine
Alternative **ersetzt** die Grundfähigkeit vollständig. **Bots erhalten keine
Zivilisationsfähigkeit** – auch keine Grundfähigkeit, ein Bot-Wikinger bekommt also keine
Gratisarmee.

Auslegungen:

- **Wikinger „Beutezüge"** (Fassung des Autors vom 17.8.): Am **Ende des eigenen Zuges** wird
  für jedes Ziel, an dem eigene Armeen stehen, **Angriffswert − Verteidigungswert** gerechnet;
  alle positiven Differenzen zusammen werden **zu Beginn der nächsten Runde** als
  Wissenschaft, Nahrung und Münzen ausgezahlt. Ziele sind jede gegnerische **Stadt** und jedes
  **Feld mit gegnerischer Armee**.
  Verwendet werden exakt die Kampfwerte des Spiels (`attackValue` / `defenseValue` bzw.
  `armyDefenseValue`): mehrere angreifende Armeen addieren sich im Angriffswert, mehrere
  verteidigende im Verteidigungswert, Belagerung/Dynamit/Stadtmauern/Burgenbau zählen mit,
  und mit Raketentechnik reicht die Projektion zwei Ringe weit. Ein Feld mit gegnerischer
  Armee ist ein **eigenes Ziel** – stehen zwei Gegnerarmeen nebeneinander, gibt es zwei
  Erträge, jeder um den zusätzlichen Verteidiger geringer.
  Gerechnet wird **vor** den Belagerungen: eine Stadt, die im selben Zug fällt, bringt noch
  Beute. Ausgezahlt wird über `p.raidPending`; die Ertragsübersicht zeigt den zu erwartenden
  Betrag als **Vorschauzeile unterhalb der Summe** (kein Einkommen, wird nicht mitgezählt).
  **Messung**: mit einem militärisch starken Reich (Macht 30) flossen über 20 Partien 1809
  Punkte Beute. Mit normal gekaufter Macht (0–2, halbiert sich jede Runde, 5 Münzen je Punkt)
  war es **0** – der Ertrag setzt voraus, dass man das Ziel tatsächlich überbietet, und
  Bot-Reiche haben als Machtwert ihre gesamte Bevölkerung. Das ist die Regel, kein Fehler.
- **Wikinger „Kriegerkultur"**: **+2** Machtwert je Armee (seit 17.8., vorher +1). Der Zuschlag erhöht den
  Machtverlust zu Zugbeginn (er rechnet auf den Gesamtwert), kann selbst aber nicht verloren
  gehen – abgezogen wird nur von der gekauften Macht. Genauso die Zeusstatue (+3).
- **Griechenland „Rückschau"**: die Gratis-Tech kommt aus einem Zeitalter unterhalb der
  gerade erforschten **im selben Technologiefeld**, ignoriert die Verfügbarkeit und löst
  **keine Kette** aus. Ausgelöst wird sie von **jeder** erforschten Technologie, auch von
  kostenlosen aus Großer Bibliothek, Oxford oder Raumfahrt (seit 17.8.; vorher hing der
  Auslöser nur an `doResearch`, kostenlose Forschung ging leer aus). Oxford gibt zwei
  Technologien und damit zwei Rückschau-Ansprüche – sie stehen in einer Warteschlange
  (`p.backPicks`) und werden nacheinander abgearbeitet; offene Ansprüche verfallen zum
  Zugende. Das **Kopieren** von Technologien (Spionage/Kundschafterei/Internet) löst keine
  Rückschau aus – kopieren ist kein Erforschen.
- **Griechenland „Freie Forschung"**: 1× pro Runde, nur **verfügbare** Techs bis
  Industrialisierung (Zeitalter 0–2). Zusätzlich zur normalen Forschung.
- **England „Seemacht"**: „an Wasser" heißt hier **Meer**. Der Ereignisbogen unterscheidet
  „an Wasser oder Fluss", Fluss zählt also nicht. +2 je **Stadt**, nicht je Meeresfeld.
- **England „Kolonisten"**: Basiskosten 0, Distanzkosten bleiben.
- **Russland „Fruchtbarkeit"**: nur die **Nahrungskosten** des Wachstums fallen weg. Münzen
  und die Nahrungsgrenze aus Abschnitt 10 gelten weiter.

## 12. Ereignisse (Bogen „Ereignisse")

Im Aufbau zuschaltbar, mit Stärke **hart** (jede Runde ein Ereignis) oder **leicht** (beim
Spaltenwurf treffen nur 1/3/5, 2/4/6 gehen ins Leere – etwa halb so viele Ereignisse).
Gewürfelt wird **einmal pro Runde** unmittelbar vor dem Zug des **Startspielers**: erst die
Zeile, dann die Spalte. Auch der Rundenzähler springt dort (`S.startIdx`); vorher hing beides
an Russland als Index 0, sodass mitten in der Umdrehung eine neue Runde begann, wenn jemand
anders Startspieler war (behoben 17.8.). Das
Ergebnis gilt **gleichzeitig für alle menschlichen Reiche**; Effekte wie „würfle eine deiner
Städte aus" werden für jedes Reich einzeln gewürfelt. **Bots sind nie betroffen.**

Auslegungen:

- **Bevölkerungsverluste zerstören keine Stadt.** Pest, Sturmflut und Vulkanausbruch lassen
  immer mindestens 1 Bevölkerung stehen. Der Bogen sagt dazu nichts; die Alternative wäre,
  dass die Pest Städte mit 1 Bevölkerung (auch Hauptstädte) auslöscht.
- **Hungersnot** setzt das Nahrungseinkommen auf **genau 0** – der Verbrauch der Bevölkerung
  wird in dieser Runde nicht gegengerechnet. Begründung: bei der Revolution steht
  ausdrücklich „verbraucht aber trotzdem normal Nahrung", bei der Hungersnot nicht.
  Der Notkurs 4:1 (mit Gilden 2:1) überschreibt Englands 1:1 **nicht**.
- **Revolution**: die Hauptstadt produziert nichts, und ihr Umland ebenfalls nicht – außer
  ein Feld grenzt zusätzlich an eine andere eigene Stadt. Das folgt der Bürokratie-Auslegung,
  die das Umland als Produktion der Hauptstadt behandelt. Nahrung verbraucht sie weiter.
- **Dunkles Zeitalter** verbietet Forschen (auch die griechischen Gratis-Techs), aber nicht
  das **Kopieren** von Technologien (Spionage/Kundschafterei/Internet).
- **Bürgerkrieg** trifft die Armeen aller Nicht-Bot-Reiche. Der Nahrungs-Notkauf gilt nur
  für Armeen und Macht, nicht allgemein.
- **Atomwaffenproteste** wirken dauerhaft und für alle Nicht-Bot-Reiche.
- **Vulkanausbruch**: das Feld wird unpassierbar (auch für die Luftwaffe), bringt keinen
  Ertrag, kann nicht besiedelt werden; eine dort stehende Armee wird zerstört. Gewählt wird
  nur unter benachbarten **Landfeldern ohne Stadt**.
- **Barbareninvasion**: Macht = max(10, doppelter eigener Machtwert), **beim Auftreten
  festgeschrieben**. Zwei Angriffe: einer sofort, einer zu Beginn der nächsten Runde vor dem
  neuen Ereignis. Nur zwei Erfolge in Folge erobern; scheitert der erste, ziehen die Barbaren
  ab. Eine eroberte Stadt gehört der neutralen Fraktion **Barbaren** (Totenkopf auf der
  Karte), verliert wie üblich 2 Bevölkerung, verteidigt sich **nur mit Bevölkerung** und ist
  normal zurückerobern. Die Barbaren handeln nie, kommen nie an den Zug und können keine
  Hauptstadt angreifen. Ihre Bevölkerung zählt weiter zur **Weltbevölkerung**, macht den
  Wirtschaftssieg also etwas schwerer.

## 12b. Technologien der Weltwunder-Erweiterung

Diese vier existieren **nur in einer Partie mit Weltwundern** (`wo: true` in `TECHS`,
gefiltert über `techPool(S)`); ohne Erweiterung erscheinen sie nicht im Bogen, werden nicht
ausgewürfelt und können auch nicht kopiert oder gratis genommen werden. Das Zeitalter war
nicht vorgegeben, folgt aber eindeutig den Kostenbereichen des Regelhefts
(Antike 1–5, Mittelalter 6–10, Industrialisierung 11–15, Moderne 16–20):

| Technologie | Feld | Zeitalter | Kosten | Wirkung |
|---|---|---|---|---|
| Baukräne | Produktion | Mittelalter | 9 | Wunder kosten 2/4/6/8/… weniger, also 8/16/24/32/… statt 10/20/30/40/… Das Muster setzt sich über das sechste Wunder hinaus fort. |
| Wallfahrt | Spezial | Antike | 4 | Je eigenem Weltwunder +3 Wissenschaft, Nahrung und Münzen. Eigene Zeile in der Ertragsübersicht. |
| Militärlogistik | Militär | Mittelalter | 6 | +1 Bewegungsweite je eigenem Weltwunder. Wirkt sofort: baut man ein Wunder, bekommen die eigenen Armeen die Bewegung noch im selben Zug gutgeschrieben (wie bei Luftwaffe/Panzerschiff). |
| Raumfahrt | Forschung | Moderne | 19 | Bei jedem Wunderbau eine Technologie gratis – nicht die Singularität und kein Zeitalter, das in diesem Feld noch nicht freigeschaltet ist (`unlockedAge`: freigeschaltet = dort ist etwas verfügbar oder erforscht). Verfügbarkeit der Tech selbst ist nicht nötig. Bots würfeln sie nach den normalen Bot-Forschungsregeln aus, ohne Singularitäts-Abkürzung. |

Raumfahrt stand in den Errata als wirkungslos und war deshalb entfernt; sie kommt hier mit
der neuen Wirkung zurück. Kernphysik bleibt gestrichen.

**Ansprüche auf kostenlose Forschung sind jetzt eine Warteschlange** (`p.freePicks`).
Vorher gab es nur einen Platz, und ein Wunderbau konnte zwei Ansprüche gleichzeitig
auslösen – Raumfahrt und das Wunder selbst (Große Bibliothek, Oxford). Der zweite
überschrieb den ersten; das ist behoben und mit Test abgesichert.

## 13. Weltwunder (Bogen „Wunder")

Im Aufbau zuschaltbar. Kosten 10/20/30/40 … Münzen für das 1./2./3./4. Wunder eines
Reiches, gezählt werden die **aktuell besessenen** – ein zerstörtes oder verlorenes Wunder
senkt den Preis wieder. Stufe 2 muss seltener sein als Stufe 1, Stufe 3 seltener als Stufe 2
(strikt: das dritte Stufe-2-Wunder braucht vier Stufe-1-Wunder). Je Stadt zwei Wunder,
markiert als Raute mit Stufenzahl unter dem Stadtsymbol. Verfügbar sind je drei ausgewürfelte
Wunder der Stufen 1 und 2 – nach jedem Bau wird nachgewürfelt – sowie **alle drei**
Stufe-3-Wunder (mehr gibt es nicht). Der Pool ist für alle Reiche gemeinsam.

- **Kultursieg**: Wer ein Stufe-3-Wunder gebaut hat, gewinnt **zu Beginn seines nächsten
  Zuges** – sofern er es dann noch besitzt. Wird die Stadt vorher erobert, erbt der Eroberer
  den Anspruch.
- **Eroberung**: dauerhafte Effekte wechseln mit dem Wunder den Besitzer, einmalige lösen
  nicht erneut aus.
- **Zerstörung** einer Stadt: die Wunder sind endgültig weg (nicht mehr im Pool) – **außer**
  bei Stonehenge. Dann bleiben sie **freistehend auf dem Feld** (Raute ◈), wirken für den
  Besitzer weiter und zählen für Kosten und Stufenregel. Wer später auf dem Feld eine Stadt
  gründet, übernimmt sie; das ist die Auslegung von „nur erobern kann sie dem Besitzer
  nehmen".
- **Zeusstatue** +3 Macht und **Kreml** +50 Singularitätskosten wirken dauerhaft; der Kreml
  verteuert für **alle** Reiche, auch für den Erbauer.
- **Große Mauer** rechnet die Verteidigung **jeder** eigenen Stadt mit der Gesamtbevölkerung
  des Reiches.
- **Große Bibliothek** ignoriert die Verfügbarkeit (Mittelalter oder früher), **Oxford** nur
  momentan verfügbare Techs – **einschließlich der Singularität**, sobald ihre
  Voraussetzungen erfüllt sind; sie steht in keiner Techliste und brauchte dafür einen
  eigenen Eintrag in der Auswahl (behoben 17.8.). Kostenlos erforscht gewinnt sie das Spiel
  genauso wie bezahlt. Die Bibliothek (Mittelalter oder früher) und Raumfahrt (ausdrücklich
  „außer Singularität") bieten sie nicht an.
  Bei Oxford wird die Auswahl **beim Bau festgehalten**
  (`only`-Liste): schließt die erste Gratis-Tech ein neues Zeitalter auf, erweitert das die
  zweite Wahl nicht – „momentan verfügbar" meint den Moment des Baus (behoben 17.8.).
- **Canal du Midi** gibt 40 Münzen, die wie jede Ressource am Zugende verfallen.
- **Taj Mahal** verdoppelt das Einkommen der nächsten eigenen Runde.
- **Koloss** stellt zwei Armeen auf freie Landfelder neben der Baustadt (Armeen dürfen nicht
  auf Städten stehen); sind weniger Felder frei, entsprechend weniger.
- **Das Orakel** zeigt in der Ansicht „Welt" das Ereignis der nächsten Runde. Es wird dabei
  einmal vorgewürfelt und zu Rundenbeginn genau so verwendet.
- **Apostolischer Palast** macht sein Reich immun gegen alle Ereignisse.
- **Bots** würfeln nach dem Siedeln einmal (gegen den Schwierigkeitsgrad) und bauen dann ein
  zufälliges verfügbares und baubares Wunder – **kostenlos**, wie alle Bot-Aktionen. Gebaut
  wird in der Hauptstadt, sonst in der bevölkerungsreichsten Stadt (Gleichstand wird
  ausgewürfelt). Ein Stufe-3-Wunder gewinnt auch für sie.
- **Bots erhalten grundsätzlich keine Wundereffekte** (Stand 17.8., ausdrücklich vom Autor
  festgelegt). Umgesetzt an einer Stelle: `hasWonder(S, pi, k)` heißt „wirkt dieses Wunder
  für dieses Reich" und ist für Bots und Barbaren immer falsch; für die reine Eigentumsfrage
  (Kosten, Stufenregel, Kultursieg, Kartenmarker) gibt es `ownsWonder`. Damit entfallen für
  Bots auch die dauerhaften Effekte, die vorher über Umwege wirkten:
  Große Mauer (Verteidigung mit der Gesamtbevölkerung), Stonehenge (Wunder überleben die
  Zerstörung der Stadt), Apostolischer Palast, Zeusstatue, Leuchtturm, Pyramiden,
  Burg Himeji, Orakel. Auch ein **Kreml in Bot-Besitz verteuert die Singularität für
  niemanden**.
- Ebenso erhalten Bots **keine Effekte der vier Erweiterungs-Technologien** – mit der
  **einen Ausnahme Militärlogistik**, die nur die Anzahl der eigenen Wunder zählt und
  deshalb bewusst nicht über `hasWonder` läuft (das Regelheft erlaubt Bots ausdrücklich
  passive Technologieeffekte wie mehr Bewegungsreichweite). Baukräne, Wallfahrt und
  Raumfahrt sind bei Bots wirkungslos; sie können sie weiter erforschen, verschenken damit
  aber einen Forschungsschritt – genau wie mit Alchemie oder Gilden, die Bots ebenfalls
  nichts bringen, weil sie keine Ressourcen verwalten.
- Erobert ein **Mensch** eine Bot-Stadt mit Wundern, werden die Effekte für ihn aktiv.

---

## Oberfläche: Designänderungen vom 21.8.

Sieben Änderungen auf Wunsch des Autors. Keine davon berührt die Regeln – bis auf
`settleGain`, das eine reine Rechnung über bestehende Regeln ist.

### 1 Feste Karte, erzwungenes Querformat

- **Kein Zoomen und Schieben mehr.** Die `viewBox` des SVG umfasst immer das ganze
  Spielfeld, der Browser passt sie ein (`xMidYMid meet`) – die Karte ist damit stets
  vollständig sichtbar. `attachGestures`, `applyView`, `fitMap` und die Zustände
  `view`/`edView` sind ersatzlos entfallen.
- **Treffer statt Rechnung:** `attachTaps` hängt einen Klick-Zuhörer an das SVG und liest
  `data-r`/`data-c` vom getroffenen Sechseck (`e.target.closest('[data-r]')`). Alles, was
  darüber liegt (Glyphen, Straßen, Grenzen, Städte, Armeen, Markierungen), hat schon vorher
  `pointer-events:none` – der Treffer landet also immer auf einem Feld. Das ist **genauer**
  als die alte Suche nach dem nächstgelegenen Mittelpunkt (Ecken gehören jetzt dem richtigen
  Feld) und funktioniert auch bei gedrehter Darstellung, weil der Browser die Trefferprüfung
  macht und nicht wir.
- **Die Editorkarte ist ebenfalls fest.** Entscheidung, nicht Vorgabe: der Autor sprach von
  „der Karte". Konsistenz schien wichtiger als Zoom beim Bemalen kleiner Felder. Rückgängig
  wäre es eine Zeile (`attachTaps` durch die alte Gestenfunktion ersetzen).
- **Gedreht wird nur der Spielbildschirm.** Menü, Aufbau, Editor und Regelseite haben
  keine feste Karte, die Breite bräuchte – dort wäre der Zwang lästig. `applyTurn()` setzt
  `html.turn` deshalb aus zwei Bedingungen: gespeicherte Wahl (`turnWanted()`) **und**
  aktiver Bildschirm in `TURN_SCREENS` (derzeit nur `screen-game`). Nachgeführt wird das
  aus `show()`. Wo `screen.orientation.lock` existiert, wird beim Verlassen des Spiels
  `unlock()` gerufen. Soll der Editor mitdrehen, genügt ein Eintrag in `TURN_SCREENS`.
- **Querformat lässt sich auf dem Zielgerät nicht erzwingen.** `screen.orientation.lock`
  existiert auf iOS Safari nicht, und das Manifest-Feld `orientation` sperrt eine iOS-PWA
  ebenfalls nicht. Umgesetzt sind deshalb drei Stufen:
  1. `"orientation": "landscape"` im Manifest (greift bei installiertem Android/Chrome),
  2. `screen.orientation.lock('landscape')`, wenn vorhanden – merkmalsgeprüft,
  3. **Notfalls dreht die App sich selbst:** `html.turn` rotiert im Hochformat den `<body>`
     um 90°. Abschaltbar im ☰-Menü, die Wahl liegt in `hochciv.noturn`.
- **Die Drehung macht Media Queries unbrauchbar** – sie messen den *ungedrehten* Viewport
  und lägen um 90° daneben. Deshalb setzt `syncLayout()` die Klassen `w-wide` (≥ 820),
  `w-side` (≥ 600 und quer) und `w-narrow` (< 600) aus der **effektiven** Layoutgröße auf
  `<html>`; die layoutkritischen Regeln hängen an diesen Klassen statt an `@media`.
  Modalinterne Aufteilungen (Technologiebogen) dürfen weiter Media Queries nutzen, weil sie
  in beiden Fällen dieselbe Seite wählen.
- Die Drehung ist in Chromium geprüft, **nicht auf echtem iOS**. Safari-Eigenheiten bei
  `position:fixed` in transformierten Vorfahren bleiben ein Restrisiko.

### 2 Ressourcenleiste

Vier eigene Kästchen (Symbol, große Zahl, Beschriftung) statt einer Zeile aus vier
Zahlenpaaren. Unter 600 px effektiver Breite fällt die Beschriftung weg, die Zahl bleibt
groß.

### 3 Das Aktionsblatt sperrt die Menüpunkte nicht mehr

Vorher galt: solange ein Blatt oder Fenster offen war, wurde die Aktionsleiste per
`body.blocked` gesperrt – gedacht als Schutz vor Fehlgriffen auf „Zug beenden" neben dem
schwebenden Blatt. Der Schutz ist jetzt **baulich** gelöst: das Blatt endet bei
`var(--bar-h)`, also exakt über der Leiste, statt darauf zu liegen. `--bar-h` und `--hud-h`
kommen aus `setBarHeight()` und werden aus der echten Höhe gemessen (`getBoundingClientRect`,
damit auch gedreht korrekt), weil die Leiste mit Schriftgröße und Geräteeinfassung wächst.
`body.blocked` bleibt nur noch für das **Bot-Fenster** – dort führt allein „Weiter" weiter.

### 4 Prozentzahl in der Kopfzeile

`Bevölkerung 8/18 (44 %)`. Kaufmännisch gerundet, bei leerer Welt 0 %. Begründung: die
Siegschwelle ist ein Anteil, keine Stückzahl.

### 5 Tutorial

- **Erledigte Aufgaben schalten selbst weiter** (`tutMaybeAdvance`, aufgerufen am Ende von
  `renderTutPanel` und aus `closeModal`). Verzögerung `TUT_AUTO_MS` = 900 ms, damit das
  Ergebnis der eigenen Aktion noch zu sehen ist; in den Tests auf 0 gesetzt, damit der
  Ablauf synchron prüfbar ist. Bewusst **nicht** automatisch:
  - im letzten Schritt (dort heißt „Weiter" *Fertig* und beendet das Tutorial),
  - solange ein Bot-Fenster offen ist,
  - solange eine kostenlose Technologie oder eine Rückschau offen ist,
  - in Leseschritten mit `keepOpen` (nur der Protokollschritt), solange das Fenster offen
    ist – sonst risse es dem Leser das Protokoll weg. `closeModal` stößt die Prüfung dann
    erneut an.
  - Es wird höchstens **eine** Stufe je Aktion geschaltet (`ui.tutAuto` sperrt während
    `tutMove`), damit kein Selbstlauf entsteht.
- **Determinismus bleibt erhalten:** zwischen „Ziel erreicht" und dem Weiterschalten wird
  nicht gewürfelt, weil erledigte Schritte über `TUT_LOOK_ONLY` ohnehin nur noch
  Nachschlagen erlauben. Die feste Würfelfolge verschiebt sich dadurch nicht.
- **Das Panel steht quer links neben der Karte** (`html.w-side`, `flex-direction:row-reverse`,
  weil im Quelltext erst die Karte kommt). Gestapelt bleibt es wie bisher unter der Karte,
  jetzt aber mit `min-height` für den Textbereich – ohne die quetschten Aufgabenzeile und
  Navigation den Text auf flachen Schirmen vollständig weg.

### 6 Protokoll: Würfe eingeklappt

Die Würfe hängen als `<details>` an **der Aktionszeile, zu der sie geführt haben** – nicht
als eigener Block. Eingeklappt sieht man nur, was passiert ist, plus ein `🎲 n`.
Die Zuordnung „Würfe davor gehören zur nächsten Zeile" stimmt, weil die Regelmaschine erst
würfelt und dann das Ergebnis protokolliert. Zwei Sonderfälle:
- **Rundenüberschriften** (`head`) bekommen nichts angehängt – sie trennen die Züge.
- **Würfe ohne folgende Aktion** (Fehlschläge am Zugende) stehen als eigener Sammelposten,
  zusammengefasst über den Grund im Wurftext (`🎲 4 — Siedeln (2+)` → „Siedeln").
Gilt für das Protokollfenster **und** das Bot-Fenster.

### 7 Ertrag beim Siedeln im Feldblatt

`settleGain(S, pi, r, c)` gibt den Einkommenszuwachs einer gedachten Stadt der Größe 1:
Einkommen mit der Stadt minus Einkommen ohne. Rechnet am echten Spielstand, also inklusive
Fähigkeiten, Wundern und Ereignissen, verändert ihn nicht (`try/finally`), und zählt
**überlappendes Umland nicht doppelt** – das fällt automatisch heraus, weil
`controlledTiles` eine Menge ist. Der eine Bevölkerungspunkt isst mit (−1 Nahrung).
Das Tutorial rechnet seine Beispielzahlen jetzt über dieselbe Funktion (`tutGain`
delegiert).

**Nachgebessert am 21.8. (zweiter Durchgang):**
- Der **Feldertrag steht wieder klein** in der Unterzeile (`Feld 6/9 · Ertrag 1🔬 0🌾 1🪙`),
  so wie vor dem Umbau – nicht mehr als eigenes Kästchen.
- Der **Siedelertrag erscheint nur, wenn hier auch gegründet werden kann**
  (`canFound` liefert null). Sonst wäre es die Antwort auf eine Frage, die sich nicht
  stellt; der Grund („Nicht auf Meer") steht ohnehin schon am Knopf *Stadt gründen*.
  Damit entfällt auch der Fall „hier steht schon eine Stadt".
- **Kein Untertext mehr** unter der Zahl (`.fact-n` ist entfallen).
- Bei Armeefeldern hängt kein Kästchen mehr an der Kopfzeile – dort ist ohnehin nie
  gründbar, und die Kopfzeile ist damit wieder wie im Original.

### 8 Technologiebogen: bezahlbar oder zu teuer

Verfügbare Technologien zerfielen bisher optisch in einen Topf, obwohl der Knopf bei zu
wenig Wissenschaft schon `disabled` war. Jetzt gibt es drei sichtbare Stufen statt zwei:

| Zustand | Klasse | Aussehen |
|---|---|---|
| erforscht | `owned` | grüner Grund, ✓ statt Kosten |
| verfügbar **und bezahlbar** | `avail afford` | roter Rand durchgezogen mit innerer Linie, heller Grund, schwarzer Titel |
| verfügbar, aber **zu teuer** | `avail costly` | derselbe rote Rand, nur gestrichelt und ohne innere Linie; **volle Deckkraft**, gedämpfter Titel, Kostenzahl rot und fett |
| nicht verfügbar | `locked` | grauer Rand, 32 % Deckkraft |

**Korrektur v32:** In v31 hatte `costly` 62 % Deckkraft. Damit verblasste auch der rote
Rand so weit, dass die Kachel einer nicht verfügbaren (40 %) ähnelte – der Unterschied,
auf den es ankommt, ging gerade verloren. Jetzt bleibt `costly` **voll deckend**; gedämpft
wird nur der Text, und die Kostenzahl steht rot und fett da – sie ist ja der Grund. `locked`
ist im Gegenzug auf 32 % gegangen. Ein Smoke-Test liest die CSS-Datei und schlägt Alarm,
falls jemand `costly` wieder eine Deckkraft gibt oder `locked` anhebt.

Rein grafisch, **ohne zusätzlichen Text** – die Kosten stehen schon in der Kachel.
Maßgeblich ist `available(S, pi, 'sci')`, nicht `res.sci`: Münzen zählen über den
Umrechnungskurs mit, eine Kachel kann also bezahlbar sein, obwohl die Wissenschaft allein
nicht reicht. Bei den **Kopien** (Spionage, Kundschafterei, Internet) gilt dasselbe mit
Münzen; **kostenlose** Angebote (Freie Forschung, Rückschau, Internet-Gratiskopie) sind
immer `afford`. Die Singularitätskachel folgt der gleichen Regel.

### 9 Hauptmenü

Die Fußzeile „Offline spielbar · zum Home-Bildschirm hinzufügen" ist entfernt (samt
`.foot`-Stil).


---

## Zwei gemeldete Fehler, behoben am 21.8. (v33)

### Bürgerkrieg: Armee/Macht mit Nahrung **und** Münzen ließ sich nicht kaufen

Nicht die Regel war falsch, sondern die Prüfung davor. `buildArmy` und `buyPower` zahlten
korrekt mit `{foodOk: …}`; die Oberfläche fragte für „ist der Knopf bedienbar?" aber
`available(S, pi, 'coins')` **ohne** diese Option. Bei reiner Nahrung fiel das nicht auf,
weil man es gar nicht erst probierte – bei einer Mischung aus Münzen und Nahrung sperrte
der Knopf einen Kauf, den die Regel erlaubt hätte. Dasselbe im Macht-Blatt (`maxN`).

Behoben, indem die Option nur noch **an einer Stelle** entsteht: `payOpts(S, pi)` in
`engine.js`. Regelmaschine und Oberfläche benutzen dieselbe Funktion. Ein Test prüft die
Invariante über **alle** Aufteilungen von Münzen und Nahrung bis zu den Armeekosten:
`available(…, payOpts) >= Kosten` genau dann, wenn `buildArmy` gelingt. Wer künftig eine
weitere Kaufprüfung in die Oberfläche schreibt, muss `payOpts` mitgeben.

### Gentechnik/Massenmedien tauschten doch in beliebiger Höhe

`rates()` bot den Kurs korrekt nicht an – aber `feed()` nahm jede Menge entgegen und
schrieb alles über dem Defizit in den Nahrungsvorrat (`p.res.food += amount - cover`).
Damit war Gentechnik faktisch ein 1:1-Kurs Wissenschaft → Nahrung, also genau das, was
seit der früheren Korrektur ausgeschlossen sein sollte. Der damalige Fix hatte nur die
Kurstabelle bereinigt, nicht das Füttern selbst.

**Jetzt gilt:** `feed()` nimmt höchstens so viel wie an Defizit offen ist, verbucht es
ausschließlich gegen `foodDeficit` und erhöht `p.res.food` **nicht mehr**. Ohne offenes
Defizit lehnt es ab. Das Blatt bietet entsprechend nur noch Beträge bis zum Defizit an.

**Getroffene Auslegung – der Autor kann sie ändern:** „füttern" heißt hier *das offene
Nahrungsdefizit decken*. Denkbar wäre auch *die laufende Nahrungsaufnahme der Bevölkerung
decken* – dann dürfte man über das Defizit hinaus geben, bekäme echten Nahrungsvorrat und
könnte in derselben Runde weiterwachsen.

**Drei Tests hatten den Fehler festgeschrieben** („3 deckt das Defizit, 2 werden Nahrung")
und mussten mitkorrigiert werden – das Verhalten war also getestet, nur gegen die falsche
Erwartung.


---

## Nahrung neu gedacht (v35)

### Bevölkerungskosten sind ein deckbarer Posten, kein fester Abzug

Bisher war die Bevölkerung ein Minusposten im Nahrungseinkommen, und mit Gentechnik/
Massenmedien durfte man ein entstandenes **Defizit** decken. Jetzt gilt: was die
Bevölkerung isst (`popFood`), ist ein eigener Posten, den man wahlweise aus Nahrung,
Wissenschaft oder Münzen bestreitet.

- `popFoodCost(S, pi)` kommt aus der Bevölkerungszeile von `incomeBreakdown` – enthält
  also Bürokratie (verdoppelt auch den Verbrauch der Hauptstadt) und Ökologie (senkt ihn)
  genau wie das Einkommen selbst. Bei Hungersnot ist er 0, weil dort das Einkommen
  ohnehin pauschal gekappt wird; sonst liefen Anzeige und Rechnung auseinander.
- `coverPop(S, pi, kind, n)` deckt `n` davon aus Wissenschaft oder Münzen. Obergrenzen:
  der noch offene Teil der Kosten und der eigene Vorrat. **Kein Umtausch:** mehr als die
  Bevölkerung isst geht nicht, es wird nur innerhalb des Rundeneinkommens verschoben.
- Der Anteil, der ein offenes Defizit tilgt, wird **nicht** zu nutzbarer Nahrung – nur
  der Rest. Sonst entstünde aus dem Decken mehr Nahrung, als verbraucht wird.
- `uncoverPop` nimmt zurück, **LIFO**: erst der Vorratsanteil, dann der Defizitanteil.
  Andersherum stünden Nahrung und Defizit gleichzeitig da. Zurückgenommen wird nur, was
  noch da ist: ist die gewonnene Nahrung schon ausgegeben, wird abgelehnt – sonst ließe
  sich Nahrung ausgeben, die Deckung zurückholen und die Wissenschaft behalten, da ein
  Defizit selbst nichts kostet.
- Verbucht wird **inkrementell**, nicht durch Neuberechnung aus dem Rohsaldo. Eine
  Neuberechnung machte Ausgaben derselben Runde rückgängig (im Bau gefunden und behoben).
- `ensureFoodState` zieht `foodRaw`/`popFood`/`popCovered` nach, wo sie fehlen: im
  allerersten Zug und in **Spielständen aus älteren Fassungen**.
- **Bots decken nichts.** Sie verhalten sich wie bisher – passend dazu, dass Bots auch
  sonst keine Fähigkeiten und keine Wundereffekte bekommen.

Damit ist auch begründet, warum man mit einer der beiden Techs in rechnerisch negative
Nahrung wachsen und siedeln darf: jeder Bevölkerungspunkt bringt +1 Wissenschaft und
+1 Münze und isst 1 Nahrung, lässt sich also im Zweifel immer selbst tragen.

### Das Fenster zu Zugbeginn

`foodSheet()` geht zu Zugbeginn auf, sobald Gentechnik oder Massenmedien erforscht sind
und Kosten offen sind. Es zeigt die Rechnung – Land produziert, Bevölkerung isst, davon
bestritten, bleibt nutzbar – und darunter Knöpfe zum Einsetzen und Zurücknehmen.
Voreingestellt ist **keine** Verschiebung, also Deckung aus Nahrung. Ohne die Techs zeigt
es nur die Übersicht. Über den Nahrungswert in der Kopfzeile lässt es sich jederzeit
wieder öffnen.

### Ereignisse verschieben die Nahrungsgrenze nicht mehr

Gemeldeter Fehler: Dürre oder Revolution machten das Nahrungseinkommen für **eine** Runde
negativ, und `growthBlocked` verbot daraufhin Wachstum und Siedeln – obwohl die Stadt
dauerhaft gedeckt gewesen wäre. Reproduziert für Dürre und Revolution.

Behoben über `baseIncome(S, pi)`: es rechnet mit `S.evMuted = true` (alle Ereigniswirkungen
aus, geprüft in `evActive` und `evTerrainDead`) und ohne den Taj-Mahal-Rundenbonus.
`foodAfterGrowth` und damit `growthBlocked` beruhen jetzt darauf.

**Was sich bewusst NICHT ändert:** die *Kosten* für Wachstum und Gründen kommen weiter aus
dem tatsächlichen Rundeneinkommen. Eine Hungersnot lässt also weiter wenig übrig – sonst
wären die Ereignisse wirkungslos. Die Grenze und die Kasse sind zwei verschiedene Dinge.


---

## Handelsrouten, Konfetti und der Oxford-Fehler (v36)

### Neue Regel: Handelsrouten

Jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden Weg mit ihr
verbunden ist, bringt **+1** auf alle drei Erträge; ist der Weg durchgehend Eisenbahn,
**+2**. Verbucht als eigene Zeile „Handelsrouten" in der Ertragsübersicht.

Umgesetzt in `tradeRoutes(S, pi)` als **zwei getrennte Suchen** von der Hauptstadt aus –
einmal nur über Eisenbahnfelder, einmal über Felder mit mindestens Straße. Die
Mischungsregel ergibt sich damit von selbst: eine Stadt, die nur die zweite Suche
erreicht, hängt an einer gemischten Strecke und bekommt +1. Es genügt also nicht, dass
irgendwo Eisenbahn liegt – sie muss durchgehend sein.

**Getroffene Auslegungen** (die Vorgabe lässt sie offen, der Autor kann sie ändern):
- **Stadtfelder zählen über `effectiveRoad` mit**, wie überall sonst: ein Weg endet nicht
  am Stadtrand, man muss auf dem Stadtfeld selbst keine Straße bauen. Konsequenz: grenzen
  zwei Städte direkt aneinander und liegt an einer davon eine Eisenbahn, gilt die
  Verbindung als reine Bahn. Praktisch irrelevant, weil zwischen zwei Städten mindestens
  drei Felder liegen müssen – die Zwischenfelder werden nicht aufgewertet.
- **Der Weg darf über neutrales Gebiet laufen**; nur **fremde Städte** sperren ihn.
  (Passend dazu, dass die Regelheft-Klausel „gegnerische Territorien sind unpassierbar"
  bewusst nicht umgesetzt ist.)
- **Ohne Hauptstadt keine Routen** – wird sie erobert, brechen alle weg.
- Es ist eine **Grundregel**, gilt also auch für Bots (anders als Wundereffekte).

**Gemessene Schwäche:** In 25 vollständigen Bot-Partien haben Bots **kein einziges Mal**
eine Straße gebaut – die Regel ist damit praktisch ein reiner Vorteil für den Menschen.
Wer das ausgleichen will, müsste `bots.js` um Straßenbau erweitern; das ist bewusst nicht
geschehen, weil es das Bot-Verhalten spürbar verändert.

Aufwand: kein messbarer. Testlauf mit und ohne die Regel jeweils ~5,4 s – die Kurzschlüsse
(keine zweite Stadt, keine Straßen auf der Karte) greifen fast immer.

### Fehler: Oxford + Singularität ließ das Spiel hängen

Die Universität von Oxford gibt zwei kostenlose Technologien, und die Singularität steht
dabei ausdrücklich zur Wahl. Wählt man sie, setzt `applyTech` sofort `S.over` – aber der
Klick-Handler in `freePickModal` prüfte das nicht. Er sah den **zweiten** offenen Anspruch,
rief sich selbst auf, fand keine Optionen mehr und schloss das Fenster stumm. Ergebnis:
Spiel vorbei, aber kein Siegbildschirm – es wirkte hängengeblieben. Reproduziert.

Behoben durch eine `S.over`-Prüfung an beiden Stellen (am Anfang von `freePickModal` und
nach jeder Wahl). Ein Smoke-Test spielt genau diesen Weg nach; mit künstlich
zurückgebautem Fehler schlägt er an.

### Konfetti

`confetti(farbe)` hängt 40 Papierschnipsel in der Reichsfarbe in einen Kasten über allem,
lässt sie gut zwei Sekunden fallen und räumt sich nach 3,4 s selbst ab. Bewusst klein.
`pointer-events:none`, damit „Zurück zum Menü" sofort erreichbar bleibt; ein zweiter Aufruf
ersetzt den alten Kasten, statt zu stapeln. Bei `prefers-reduced-motion: reduce` entfällt es.
Die Fallhöhe hängt an `--fall`, weil im gedrehten Hochformat „unten" die kurze Seite ist.


---

## Fehler: Eisenbahn ohne Rad war nicht baubar (v37)

Gemeldet und reproduziert: Wer die Eisenbahn erforscht hatte, aber nicht das Rad, konnte
überhaupt keine Wege bauen. **Zwei Fehler in einem**, beide in der Oberfläche:

1. Der Knopf erschien nur unter `has(p, 'rad')` – ohne Rad gab es ihn gar nicht.
2. Selbst mit Knopf hätte er auf leeren Feldern Stufe 1 gewählt (`roadLevel >= 1 ? 2 : 1`),
   und `buildRoad` hätte mit „Rad noch nicht erforscht" abgelehnt.

Die Regelmaschine konnte es die ganze Zeit: `buildRoad(S, pi, r, c, 2)` gelang auch ohne
Rad. Es ist derselbe Fehlertyp wie beim Bürgerkrieg – die Oberfläche leitet eine
Entscheidung selbst her, statt die der Regelmaschine zu übernehmen.

**Behoben mit `roadTarget(S, pi, r, c)`** in `engine.js` als einziger Wahrheit; Blatt und
`doRoad` benutzen sie. Dazu `canBuildRoads(p)` für die Frage, ob der Knopf überhaupt
erscheint. Die Regel:

| Stufe auf dem Feld | nur Rad | nur Eisenbahn | beides | keins |
|---|---|---|---|---|
| 0 (frei) | 1 | **2** (Straßenstufe übersprungen) | 1 | – |
| 1 (Straße) | – | 2 | 2 | – |
| 2 (Eisenbahn) | – | – | – | – |

**Getroffene Auslegung:** Wer beides hat, baut auf leerem Feld zuerst die Straße. Der
Zwischenschritt ist nicht teurer als der Direktbau (1 + 1 = 2) und lässt sich früher
bezahlen – ein Test pinnt diese Gleichheit. Wer nur die Eisenbahn hat, überspringt die
Straßenstufe und zahlt direkt 2.

Abgesichert durch eine Invariante über **alle zwölf** Kombinationen aus Technologien und
Ausbaustufe: was `roadTarget` vorschlägt, muss `buildRoad` auch annehmen. Dazu ein
Smoke-Test, der den gemeldeten Fall über die echte Oberfläche nachspielt; mit künstlich
zurückgebautem Fehler schlägt er an.

Nebenbei: die Untertexte am Knopf nennen jetzt auch den Handelsrouten-Bonus
(„Bewegung kostenlos · Handelsroute +2").


---

## Wachstum für 2 Münzen · beide Wege-Knöpfe (v38)

### Fehler: mehrere Kosten aus einem Topf wurden doppelt gedeckt

Gemeldet und reproduziert: Mit **2 Münzen** und ohne 1:1-Kurs wuchs eine Stadt von 1 auf 2,
obwohl das 1 Nahrung **und** 1 Münze kostet – bei einem Kurs von 2:1 also 3 Münzen.

Zwei Ursachen, die zusammenwirkten:
1. `canGrow` prüfte `available(…,'food')` und `available(…,'coins')` **getrennt**, jeweils
   gegen den vollen Vorrat. Da sich die Arten ineinander umtauschen lassen, griffen beide
   Prüfungen auf dieselben zwei Münzen zu und meldeten beide „gedeckt".
2. `growCity` rief `pay(…,'food',1)` und `pay(…,'coins',1)` nacheinander und **wertete den
   Rückgabewert nicht aus**. Der zweite Aufruf lieferte `false`, die Stadt wuchs trotzdem.

**Behoben mit `payAll` / `affordAll`** in `engine.js`: mehrere Kosten werden der Reihe nach
(`food`, `coins`, `sci`) aus demselben Vorrat bezahlt und bei einem Fehlschlag **vollständig
zurückgerollt**. `affordAll` ist dieselbe Rechnung ohne bleibende Wirkung. Prüfung und
Bezahlung folgen damit demselben Weg – sonst gehen sie wieder auseinander, wie hier.

Zusätzlich werten `foundCity`, `buildWonder` und der Technologiekauf den Rückgabewert von
`pay` jetzt aus. Dort war es bisher folgenlos (nur eine Kostenart), aber es war dieselbe
Zeitbombe.

Abgesichert durch eine Invariante über **28 Kombinationen** aus Münzen und Nahrung:
`canGrow` erlaubt genau dann, wenn `growCity` auch gelingt.

### Beide Wege-Knöpfe auf leerem Feld

`roadTargets(S, pi, r, c)` gibt jetzt **alle** jetzt baubaren Stufen zurück statt nur der
günstigsten; `roadTarget` bleibt als „günstigste" erhalten. Auf einem leeren Feld mit Rad
und Eisenbahn stehen damit beide Knöpfe: Straße für 1 Münze, Eisenbahn direkt für 2.

**Der Preis wird immer frisch von `buildRoad` bestimmt**, nie vom Knopf übernommen. Wer im
offenen Blatt erst die Straße baut und dann die Eisenbahn, zahlt 1 + 1 = 2 – nicht 1 + 2.
Damit die **Anzeige** dazu passt, zeichnet `doRoad` das Blatt anschließend neu
(`openTile`); vorher stand am Ausbau-Knopf noch der Direktbaupreis. Ein Smoke-Test prüft
genau das, und mit zurückgebautem `openTile` schlägt er an.


---

## Neue Bot-Armeeprioritäten (v39)

Auf Vorgabe des Autors ersetzt diese Reihenfolge die alte vierstufige:

| # | Priorität |
|---|---|
| 1 | Gegnerische **Hauptstadt** erobern, die im letzten Zug erfolgreich belagert wurde |
| 2 | Armee flankieren, die die **eigene Hauptstadt** angreift |
| 3 | Eigene Hauptstadt verteidigen (möglichst neben dem Angreifer) |
| 4 | Armee flankieren, die eine **andere eigene Stadt** angreift |
| 5 | Andere eigene Stadt verteidigen |
| 6 | Gegnerische Stadt erobern, die im letzten Zug belagert wurde |
| 7 | Gegnerische Stadt angreifen |
| 8 | Gegnerische Armee flankieren |
| 9 | An den Reichsrand, am nächsten zum Gegner |

**1–6 brauchen Absprache** zwischen den Armeen (wie viele reichen? wer verteidigt was?)
und laufen deshalb in `botPlanArmies(S, pi)` über alle Armeen gemeinsam, vor den
Einzelzügen. Was dort nicht gebunden wird (`army.botDone`), entscheidet wie bisher
`botMoveArmy` für sich – das sind die Prioritäten 7–9. Die alte Priorität 1
(„belagerte eigene Städte verteidigen") ist dort entfallen, sie steckt jetzt in 3 und 5.

**Umsetzungsdetails:**
- „Im letzten Zug belagert" heißt `S.sieges[pi+'|'+id] >= 1` – der nächste gewonnene
  Kampf erobert (der Zähler läuft bis 2).
- Prio 1 zieht **alle** erreichbaren Armeen zur Hauptstadt, Prio 6 nur so viele, wie für
  `attackValue > defenseValue` nötig sind (`attackersNeeded`). Beides nur, wenn es
  überhaupt reicht – sonst wird der Punkt übersprungen.
- Zugewiesen wird **nacheinander**, nicht gleichzeitig: sonst wählen mehrere Armeen
  dasselbe Feld und alle bis auf eine bleiben stehen (im Bau gefunden und behoben).
- Verteidigen heißt: auf ein Feld in `projectRange` der Stadt, unter diesen bevorzugt das
  dichteste am Angreifer. Flankieren rechnet mit derselben Formel wie die Kampfphase
  (gegenüberliegend; mit **Taktik** von zwei beliebigen Seiten; mit **Burgenbau** zählen
  eigene Städte als Partnerposition).
- Verteidigung geht vor Eroberung; innerhalb einer Stufe zählt die **größere Stadt**
  zuerst, die Hauptstadt immer vorher.
- `botReach` nimmt das **eigene Feld** als Option auf. `reachable()` liefert es nicht mit,
  weil es als besetzt gilt – ohne diese Ergänzung räumte eine Armee, die schon genau
  richtig stand, ihren Platz und verschlechterte die Lage.
- `botDone` wird nach dem Zug wieder entfernt und landet nicht im Spielstand.

### Gemessener Balance-Effekt — der Autor sollte das wissen

Je **200 vollständige Bot-Partien** (vier Bots, gleiche Seeds), mit und ohne die neue
Planung:

| | Median Runden | Militärsiege | Forschungssiege |
|---|---|---|---|
| alte Prioritäten | 5 | 187 | 13 |
| neue Prioritäten | 7 | 130 | 70 |

Die Partien dauern länger und Militärsiege werden deutlich seltener. Das ist plausibel:
Bots verteidigen jetzt zuerst und erobern sich dadurch langsamer gegenseitig. Der Effekt
ist groß genug, dass er kein Rauschen ist. Ob er erwünscht ist, ist eine Balance-Frage –
die Prioritätenliste selbst war die Vorgabe.


---

## Tutorial: Gegenangriff statt Verteidigung (v40)

Die neuen Bot-Prioritäten aus v39 haben den Ausgang der Beispielpartie verändert:
Griechenland schickt jetzt eine **zweite** Armee zur begonnenen Belagerung (Priorität 6),
Angriff 16 gegen Verteidigung 14 – die Stadt fiel. Der Schritt hieß aber noch
„Zug beenden – und die Belagerung bricht". Statt die Würfelfolge zu suchen, bis der alte
Ausgang wieder passt, zeigt das Tutorial jetzt die stärkere Lektion.

**Gemessener Vergleich, gleiche Würfelfolge:**

| Strategie | Griechenlands Armeen danach | eigene Städte |
|---|---|---|
| 4 Macht kaufen, Armee bleibt stehen | 7/12 und 6/12 – Belagerung geht weiter | 3 → **2** |
| Belagerungsmaschinen + 3 Macht + Armee neben die feindliche Hauptstadt | 9/11 und 9/10 – beide an der eigenen Hauptstadt | 3 → **3** |

Im Protokoll steht dann wörtlich „Griechenland: Armee verteidigt die Hauptstadt". Der
Effekt folgt direkt aus der Prioritätenliste: 2/3 (eigene Hauptstadt) stehen vor 6
(Belagerung abschließen). Kein Sonderfall im Code.

### Was sich geändert hat

- **Reihenfolge:** Der Belagerungsschritt steht jetzt hinter „Wissenschaftliche Methode"
  und „Zwei Technologien für null".
- **„Macht kaufen – aber spät" → „Rechne nach, bevor du kaufst":** reiner Lesetext mit
  zwei Rechentabellen (Verteidigung 14 mit 4 Macht · Angriff 10, wenn der Bot nachlegt).
  Es wird **nichts mehr gekauft**.
- **Neu: „Der Gegenangriff als Verteidigung"** – Belagerungsmaschinen forschen, 3 Macht
  kaufen, Armee auf das Feld neben Griechenlands Hauptstadt.
- **„Zwei billige Technologien" → „Der Rest der Wissenschaft: Rad"** – Rad statt
  Demokratie und Keramik, weil gleich Straßen gebraucht werden.
- **Neu: „Straßen: die Städte verbinden"** – vier Straßen für vier Münzen, die alle drei
  Nebenstädte an die Hauptstadt hängen (+3 auf jeden Ertrag). Die Erklärung der
  Handelsrouten ist damit aus dem Abschlusstext verschwunden.
- **„Belagerung bricht" → „und der Rückzug"** – Text auf den neuen Ausgang.

**Die Rechnung geht exakt auf** (gemessen, nicht geschätzt): 3 Wissenschaft →
Belagerungsmaschinen (2) + Rad (1) = 0. 16 Münzen → 3 Macht (12) + 4 Straßen (4) = 0.

### Fragile Stelle: das Zielfeld des Gegenangriffs

Von der Armeeposition aus ist bei 3 Bewegungspunkten **nur ein einziges** Nachbarfeld der
griechischen Hauptstadt erreichbar, mit Kosten von genau 3 – die übrigen sind Meer oder zu
weit. Deshalb hat `tutStrikeSpot()` eine Rückfallebene: ist das vorgesehene Feld belegt
oder unerreichbar, nimmt es das nächstbeste erreichbare Feld, das die Hauptstadt noch
bedroht. Ohne diese Ebene wäre der Schritt eine Sackgasse.

### Nebenbei behoben: „noch 33× wachsen"

Der Schritt „Jede Bevölkerung isst" zählte je Stadt einzeln, wie oft sie noch wachsen
könnte, und summierte. Jede Stadt tat dabei so, als wüchsen die anderen nicht – bei 11
Nahrung kam so „33×" heraus. Jetzt wird reihum probiert, bis keine Stadt mehr kann, und
der Text nennt zusätzlich die tatsächliche Produktion.


---

## Tutorial: Gegenrechnung und Griechenlands Militärforschung (v41)

### Der Machtvergleich war falsch herum

Der Schritt „Rechne nach, bevor du kaufst" behauptete, Griechenlands Angriff übersteige
die Verteidigung. Gemessen stimmte das nicht: Machtwert 5, zwei Armeen also **10 gegen
14** – die Verteidigung hätte gehalten. Der Text rechnet jetzt weiter:

| Posten | |
|---|---|
| Machtwert jetzt | 5 |
| 3 Städte wachsen je 1 | +3 |
| eine neue Stadt gegründet | +1 |
| **Machtwert dann** | **9** |
| × 2 Armeen | **18** |

18 gegen 14 – der Kauf wäre eine Runde später trotzdem verloren. Alle Zahlen kommen aus
dem laufenden Spielstand (Städtezahl, Bevölkerung), nicht aus dem Text.

### Griechenland forscht im Militärfeld jetzt vorgegeben

`TUT_FOE_MILITARY = ['eisenverarbeitung', 'stahl']` statt der ausgewürfelten Stadtmauern
und Burgenbau. Grund: Mit diesen beiden kam Griechenlands Hauptstadt auf **13**
Verteidigung, und die Drohung im Gegenangriffs-Schritt wäre bloß symbolisch gewesen –
der Spieler hätte sie nie erobern können. Jetzt steht sie bei **3** (nur Bevölkerung plus
Armeen daneben): Zieht der Bot seine Armeen nicht zurück, fällt sie tatsächlich, denn der
Spieler greift mit Belagerungsmaschinen und 3 Macht mit 8 an.

**Umgesetzt, ohne die Würfelfolge zu verschieben.** `botResearch` ignoriert `avail`
komplett – Bots würfeln direkt aus dem Techpool. Die Vorgabe konnte also nicht über die
Verfügbarkeit laufen. Stattdessen würfelt `botResearch` ganz normal weiter und tauscht am
Ende nur das **Ergebnis** (`tutBotTech`). Gemessen: Der Würfelzähler steht an derselben
Stelle wie vorher (195 beim Machtschritt), der übrige Ablauf ist unverändert.
Außerhalb des Tutorials greift der Hook nicht (`ui.tut` wird geprüft).

### Was das NICHT ändert

Die Bot-Prioritäten prüfen weiterhin **nicht**, wie gefährlich eine Bedrohung ist: Prio 3
greift, sobald eine feindliche Armee die eigene Hauptstadt in Reichweite hat – unabhängig
davon, ob sie sie erobern könnte. Vor dieser Änderung zog Griechenland also auch dann
zurück, wenn seine Hauptstadt mit 13 gegen 8 sicher gewesen wäre. Mit den neuen
Forschungen deckt sich das Verhalten mit der Lage; das Verhalten selbst ist unverändert.


---

## Verteidigt wird erst bei laufender Belagerung (v43)

Ursprünglich lösten die Verteidigungsprioritäten 2–5 aus, sobald **irgendeine** feindliche
Armee eine eigene Stadt in Reichweite hatte – auch eine chancenlose. Ein Zwischenstand
(v42) rechnete deshalb aus, ob der Angriff die Verteidigung ohne die eigenen beweglichen
Armeen überstiege. Das war unnötig kompliziert. Jetzt gilt schlicht:

```
bedroht  ⟺  S.sieges[Gegner|Stadt] >= 1
```

Also: **Hat ein Gegner in einem der letzten Züge einen erfolgreichen Angriff auf diese
Stadt geführt?** Nur dann ziehen alle erreichbaren Armeen zur Verteidigung zurück.

**Warum das reicht:** Eine Eroberung braucht zwei erfolgreiche Züge in Folge. Zieht der
Bot Verteidiger ab und beginnt dadurch überhaupt erst eine Belagerung, bleibt ihm eine
volle Runde, sie zurückzuholen – dieselbe Vorwarnzeit, die auch der Mensch hat („Zug 1/2"
ist die Warnung). Eine Kraftrechnung im Voraus ist damit überflüssig.

Nebeneffekt im Protokoll: Die Ursache ist jetzt sichtbar. Im Tutorial steht
`Kampf um Griechenlands Stadt: Angriff 8 > Verteidigung 3 (Zug 1/2)` und direkt darunter
`Griechenland: Armee verteidigt die Hauptstadt`.

### Gemessener Balance-Effekt

Je 200 vollständige Bot-Partien, gleiche Seeds:

| | Median Runden | Militärsiege | Forschungssiege |
|---|---|---|---|
| vor der neuen Prioritätenliste | 5 | 187 | 13 |
| jede Armee löst aus (v39–v41) | 7 | 130 | 70 |
| Kraftrechnung (v42, verworfen) | 6 | 146 | 54 |
| **nur laufende Belagerung (v43)** | **6** | **152** | **48** |

Der Belagerungs-Trigger liegt noch näher am alten Verhalten als die Kraftrechnung – Bots
binden nur dann Armeen, wenn wirklich etwas passiert ist.

### Wirkung im Tutorial

Genau deshalb bekommt Griechenland dort Eisenverarbeitung und Stahl statt Stadtmauern und
Burgenbau (v41): Mit Mauern und Burgenbau stünde seine Hauptstadt bei 13, der Angriff von
8 käme nicht durch, **es entstünde kein Belagerungszähler** – und der Bot hätte keinen
Grund zurückzuziehen. Mit den neuen Forschungen steht sie bei 3, der Angriff sitzt, der
Zähler springt auf 1/2 und der Rückzug folgt. Die beiden Änderungen greifen ineinander.

## Bot-Forschung: zufällig im Spiel, fest im Tutorial

Bots forschen **absichtlich** ohne Rücksicht auf Verfügbarkeiten – sie würfeln Feld,
Zeitalter und Technologie direkt aus dem Pool. Das bleibt so.

Nur im Tutorial liegt das Ergebnis fest, und zwar auf zwei Wegen:
- Die **feste Würfelfolge** (`TUT_DICE`) macht jeden Durchlauf identisch – auch für alle
  anderen Reiche.
- Der Hook **`tutBotTech`** tauscht zusätzlich das Ergebnis im Militärfeld für
  Griechenland. Gewürfelt wird trotzdem ganz normal, nur das Resultat wird ersetzt –
  sonst verschöbe sich die Folge.

Abgesichert durch zwei komplette Tutorial-Durchläufe im Test: identische Technologien bei
**allen** Reichen, identischer Würfelverbrauch, Eisenverarbeitung und Stahl dabei,
Stadtmauern und Burgenbau nicht. Außerhalb des Tutorials gibt der Hook `null` zurück.


---

## Tutorial: feste Texte, Zurückblättern, Armeen aus der Stadt (v44)

### Alle Schritttexte sind jetzt fest verdrahtet

Die Texte rechneten ihre Zahlen aus dem laufenden Spielstand (81 eingebettete Ausdrücke).
Das war beim Nachlesen verwirrend, weil dieselbe Stelle je nach Zeitpunkt andere Werte
zeigte – besonders auffällig beim Gegenangriffs-Schritt, wo der Verteidigungswert der
gegnerischen Hauptstadt beim Öffnen höher stand als in der Rechnung, weil die feindliche
Armee noch daneben stand.

Vorgehen: Alle 29 Schritte wurden im jeweils richtigen Zustand gerendert (jeder Schritt
nach den `auto()`-Aufrufen der vorherigen) und die `html`-Funktionen durch den gerenderten
Text ersetzt. `hl`, `goal`, `auto` und `allow` bleiben dynamisch – nur die Anzeige ist
eingefroren. Wer Zahlen ändert (Kosten, Kartenfelder), muss die Texte jetzt von Hand
nachziehen; dafür stimmen sie beim Zurückblättern immer.

### Zurückblättern springt nicht mehr vor

`tutMaybeAdvance` schaltete auch dann automatisch weiter, wenn man einen erledigten
Schritt noch einmal aufschlug – die Seiten waren damit praktisch nicht mehr lesbar.
`ui.tut.max` merkt jetzt den weitesten je erreichten Schritt; automatisch geht es nur
dort weiter. Vorwärtsblättern und die Aufgaben selbst bleiben unverändert.

### Die Zugablauf-Einordnung ist weg

Alle 29 `sub`-Felder („Zugablauf 2 von 5 · Macht") sind entfernt, ebenso die Anzeige.
Die Zeile bleibt im Aufbau erhalten (sie trägt „Tutorial beenden"), nur leer.

### Bots lassen keine Armee in der eigenen Stadt stehen

Gemeldet: Im Tutorial blieb die zweite griechische Armee in der Hauptstadt stehen.
`botOutOfCity` streicht eigene Stadtfelder jetzt aus den Halteplätzen – in `botReach`
(Prioritäten 1–6) und in `botMoveArmy` (7–9). **Ausnahme:** Gibt es gar keinen anderen
Halteplatz, bleibt das Stadtfeld erlaubt, sonst könnte eine Armee auf einer vollen Insel
gar nicht mehr ziehen.

Begründung: In der Stadt blockiert eine Armee den Bauplatz für die nächste, kann nicht
flankieren und niemanden abfangen; ein Feld daneben zählt genauso zur Verteidigung.


---

## Kostenlose Armeen erscheinen in der Hauptstadt (v48)

**Wikinger „Beutezüge"** stellte seine Startarmee bisher auf ein freies Nachbarfeld der
Hauptstadt. Jetzt erscheint sie **in** der Hauptstadt, mit `born = aktuelle Runde` – also
genau wie eine gebaute Armee, samt der Erinnerung beim Zugende, dass sie die Stadt noch
verlassen muss. Betrifft nur menschliche Wikinger: Bots bekommen keine Fähigkeiten und
damit auch keine Startarmee (`isAbil` ist für Bots immer false).

**Der Koloss** stellte zwei Armeen gleichzeitig auf Nachbarfelder. Jetzt kommen sie in die
Hauptstadt – aber **nacheinander**, weil auf einem Feld nur eine Armee stehen kann:

- `p.freeArmies` ist eine Warteschlange (der Koloss legt 2 hinein).
- `spawnFreeArmies(S, pi)` stellt so viele, wie Platz haben – praktisch also eine, denn
  danach ist die Hauptstadt besetzt.
- Aufgerufen wird sie an drei Stellen: beim Wunderbau, **nach jeder Armeebewegung**
  (`moveArmy`) und zu **Zugbeginn** (`beginTurn`), falls letzte Runde kein Platz war.
- Die Armeen bekommen `mp = moveAllowance` und `born = aktuelle Runde`, gelten also als
  frisch gebaut und dürfen sich sofort bewegen.
- `pendingWarnings` weist auf eine noch wartende Armee hin.

Damit gilt durchgängig dieselbe Regel wie beim normalen Armeebau: erscheinen in der Stadt,
sofort herausbewegen, ein Feld je Armee. Vorher waren die Gratisarmeen die einzige
Ausnahme – sie standen mit `mp: 0` neben der Stadt und konnten sich in der Runde ihres
Erscheinens gar nicht bewegen.


---

## Drei Anpassungen (v49)

### Techbogen zeigt, was andere Menschen erforschen könnten

Neben den Marken „hat diese Technologie" gibt es jetzt eine zweite Art: „könnte sie
erforschen". Sie erscheint **nur bei mehr als einem menschlichen Spieler** und **nur für
andere** – die eigene Verfügbarkeit sieht man ohnehin am Zustand der Kachel.

**Bots bekommen nie eine solche Marke.** Sie kennen keine Verfügbarkeiten, sondern würfeln
Feld, Zeitalter und Technologie direkt aus dem Pool; eine Anzeige „könnte" wäre dort
schlicht falsch.

Optisch nach demselben Muster wie bezahlbar/zu teuer im selben Bogen: beide Marken sind
umkringelt, „hat es" durchgezogen und satt, „könnte es" gestrichelt und blass. Eine
Möglichkeit soll nicht aussehen wie eine Tatsache. Die Legende über dem Raster erklärt
den Ring – aber nur, wenn es mehr als einen Menschen gibt.

### Versionsnummer im Hauptmenü

`APP_VERSION` in `js/data.js` ist die Quelle; das Menü zeigt sie unten als
„Hochzeivilization v49". Sie muss zur `VERSION` in `sw.js` passen – **ein Test bindet
beide aneinander**, sonst zeigt das Menü etwas anderes an, als der Offline-Cache
ausliefert. Beim Hochzählen also beide Stellen ändern; der Test schlägt sonst an.

### Zugende mit Armee in der Stadt ist gesperrt, nicht mehr nur bestätigungspflichtig

Bisher warnte `pendingWarnings` einmal, der zweite Tipp auf „Zug beenden" ließ durch.
Jetzt gibt es `blockingIssues(S, pi)`: Steht eine Armee auf einem Stadtfeld, ist das
Zugende **gar nicht** möglich – Städte tragen keine Armeen, der Zustand ist ungültig.

**Ausnahme gegen die Sackgasse:** Blockiert wird nur, wenn die Armee auch tatsächlich
herauskann. Geprüft wird über `armyReach`, ob ein erreichbares Feld außerhalb einer Stadt
existiert. Sonst wäre der Zug bei einer eingeschlossenen Insel, ringsum besetzten Feldern
oder aufgebrauchter Bewegung nicht mehr beendbar.

`pendingWarnings` behält nur noch die weichen Hinweise (wartende Gratisarmee).

## Zufallskarten aus Dreiecksplättchen (v50)

Zufallskarten entstehen nicht mehr Feld für Feld, sondern werden aus **Dreiecken zu je 15
Feldern** zusammengelegt. Der Vorrat in `js/tiles.js` (`TILE_POOL`) hat **20 von Hand
entworfene Plättchen**; gezogen wird ohne Zurücklegen. Ein Plättchen wird als fünf
Feldzeilen 5/4/3/2/1 notiert – so sieht es in einem A-Platz in Lage 1 auch auf der Karte aus.

### Geometrie: warum die Formen genau so aussehen

Gerechnet wird in Würfelkoordinaten (`x + y + z = 0`, `z` ist die Zeile). Ein Dreieck ist

* **Typ A**: Feld = `a + (i, j, k)` mit `i+j+k = 4` und `Summe(a) = −4` (Spitze unten),
* **Typ B**: Feld = `a − (i, j, k)` (Spitze oben).

Beide werden über dasselbe Tripel angesprochen; eine Drehung um 120° ist genau
`(i,j,k) → (j,k,i)`. Deshalb passt jedes Plättchen in **genau drei Lagen** in denselben
Platz und wird dabei **nie gespiegelt** – ein Fluss, der entlang einer Kante läuft, bleibt
ein Fluss entlang einer Kante.

Zwei Rechnungen haben die Formen bestimmt (beide von `test.js` nachgerechnet, nicht
geschätzt):

* **6 Dreiecke = Sechseck mit Radius 5 ohne das Mittelfeld** (90 = 91 − 1). Die sechs
  liegen als Windrad um genau ein freies Feld. Das ist kein Schönheitsfehler, sondern
  zwingend: 6 · 15 ist immer um eins kleiner als das nächste Sechseck.
  **Das Loch bleibt ein Loch** – dort ist kein Feld, es wird nicht aufgefüllt. Mitten in
  der Welt liegt also ein unpassierbarer Punkt, um den herum gezogen werden muss und der
  einer Stadt daneben ein Ertragsfeld nimmt. Das ist so gewollt (Entscheidung des Autors).
* **9 Dreiecke = großes Dreieck mit Seite 16 ohne das Mittelfeld** (135 = 136 − 1) –
  das Sechseck plus je ein Dreieck an drei abwechselnden Kanten. Exakt, keine weitere
  Lücke; das eine Loch sitzt genau dort, wo die drei Reiche aufeinandertreffen.

Für **vier Reiche** war die naheliegende Lesart (zwei Reihen à fünf, also zwei Windräder,
die sich zwei Plättchen teilen) **geometrisch unmöglich**: die Mitte des zweiten Windrads
läge im Radius des ersten Sechsecks und wäre dort schon überdeckt, könnte also nicht frei
bleiben. Gebaut ist deshalb ein **Streifenverbund**: zwei Reihen zu fünf Dreiecken,
abwechselnd A und B. Der deckt **150 Felder exakt ab – ohne Loch und ohne Überlappung**
(die Vierer-Karte ist also die einzige ohne Loch),
Form 10 × 18, und hat trotzdem die verlangte Struktur: zwei mittige Plättchen, acht
darum herum, die Reiche auf jedem zweiten davon.

Alle drei Formen beginnen in einer **geraden Zeile**. Das ist Pflicht, nicht Zufall: bei
odd-r-Versatz kippt eine Verschiebung um eine ungerade Zeilenzahl den Zeilenversatz und
verzerrt die Form. Ein Test prüft es.

### Was offen liegt und was verdeckt ist

* Die Plättchen, die **niemandem gehören**, liegen von Anfang an offen – mit gelosten
  Lagen, damit die Startaufstellung auch bei denselben Plättchen anders aussieht.
* Das **eigene Startplättchen** kennt nur, wer es legt. Sichtbar sind während des Legens
  die offenen Plättchen und das eigene, sonst nichts. Erst wenn alle fertig sind, wird
  aufgedeckt.
* **Auslegung:** Das Regelheft dieser Erweiterung gibt es nicht; verlangt war das
  verdeckte Legen ausdrücklich nur für zwei Reiche. Umgesetzt ist es für **alle**
  Spielerzahlen – bei drei und vier wäre offenes Legen sonst ein Vorteil für den, der
  zuletzt legt.

### Hauptstadt „frei" – mit einer Einschränkung

*Stand v73; bis v72 galt „3 Felder Abstand zu jedem fremden Startplättchen", siehe unten.*

Gesetzt werden darf auf **jedes Landfeld des eigenen Plättchens**, das zwei Bedingungen
erfüllt (`seatFreeCells` in `js/tiles.js`). Beide Seiten legen **verdeckt**, die Regel muss
also für jede Wahl der anderen halten – ein Verstoß wäre hinterher nicht mehr zu heilen.

1. **Mindestens 2 Felder** Abstand zu jedem Feld eines fremden Startplättchens
   (`PLACE_MIN_GAP = 2`). Damit liegt das Umland nie auf einem noch verdeckten Plättchen.
2. **Kein geteiltes Umland:** kein echtes Feld kann zugleich Nachbar dieser und einer
   möglichen fremden Hauptstadt sein („möglich" = erfüllt dort Bedingung 1). Umland an
   Umland ist erlaubt. „Kein Feld" zählt nicht – im 1 gegen 1 dürfen sich zwei
   Hauptstädte an der Mitte bis auf 2 nahe kommen, ihr einziges gemeinsames Nachbarfeld
   ist das Loch.

Erlaubte Felder je Startplättchen, rein geometrisch (vor Meer): 2 Reiche **15** (bis v72:
14, die Ecke am Loch), 3 Reiche **15** (unverändert, die Startplättchen liegen weit
auseinander), 4 Reiche **13** (bis v72: 11). Die **drei mittigen Felder sind nie gesperrt**
– dort setzen Bots.

**Auslegung bei vier Reichen:** „eine Reihe näher" (Anweisung des Autors, v73) öffnet dort
die Reihe vor der Spitze. Gesperrt bleiben die Spitze selbst und **eine Ecke** der langen
Kante: die zum offenen Mittelplättchen hin. Setzten die beiden oberen (bzw. unteren)
Reiche ihre Hauptstadt in diese beiden Ecken, lägen sie 2 auseinander und teilten sich
die Spitze des Mittelplättchens – genau das „ohne Überlappung", mit dem der Autor die
Lockerung begründet hat, wäre dann nicht mehr wahr. Wer die Ecken trotzdem freigeben will,
lässt Bedingung 2 weg (eine Zeile); dann sind es 14 Felder und im schlimmsten Fall ein
geteiltes Feld.

### Startgüte statt Startgarantie

Der alte Rasterkartengenerator hat den Startplatz **garantiert** (4 Nahrung, Siedelplatz
in Reichweite). Auf Plättchenkarten wählt man selbst, also braucht es keine Garantie mehr
– außer für Bots, die zufällig legen. Deshalb gilt für jedes Plättchen im Vorrat:

* die drei mittigen Felder sind Land,
* jedes davon bringt im ersten Zug **mindestens 4 Nahrung** (Münzen 2:1).

Das lässt sich beim Entwerfen entscheiden, weil die **sechs Nachbarn eines mittigen Feldes
sämtlich auf demselben Plättchen liegen** – ein mittiges Feld hat in `(i,j,k)` überall
Werte ≥ 1. Ein Test rechnet alle 60 Fälle nach; die Spanne liegt bei 4 bis 7 Nahrung
(Rasterkarte: 4 bis 7, also derselbe Bereich).

### Felder außerhalb der Karte

Plättchenkarten sind nicht rechteckig, die Datenstruktur aber schon. Alles, was nicht zur
Form gehört, ist das neue Gelände **`X` „Kein Feld"**: wird nicht gezeichnet, ist nicht
antippbar, unpassierbar, bringt nichts und taucht in keiner Ertragsübersicht auf.
`isOff(t)` unterscheidet es vom Vulkan, der ein echtes (nur wertloses) Feld ist.
Seit v73 gehört es auch **nie zum Gebiet** einer Stadt (`controlledTiles`) und lässt sich
nicht kaufen – vorher zog eine Stadt am Kartenrand ihre Reichsgrenze um die leeren
Sechsecke jenseits der Karte.

Im **Karteneditor** wird `X` blass und gestrichelt gezeichnet und bleibt antippbar –
sonst ließe sich ein versehentlich gesetztes „Kein Feld" nicht zurücknehmen. Damit lassen
sich auch eigene Karten mit beliebigem Umriss bauen.

### Drei Reiche

Bisher gab es „Vier Reiche" und „1 gegen 1". Für die Dreiecksform mit neun Plättchen
brauchte es einen **Drei-Reiche-Modus**: drei Plätze mit freier Zivilisationswahl wie im
Duell. Siegschwellen sind die **Standardschwellen** (2/3), nicht die des Duells – die
höhere Duellschwelle hängt daran, dass es dort nur einen Gegner gibt.

Die festen Karten (Original, Große Karte) stehen für drei Reiche weiter zur Wahl; der
vierte Startstern bleibt dann einfach unbenutzt.

### Kartenmenü nach Spielerzahl

Das Kartenmenü hängt jetzt an der Spielerzahl: die Plättchenkarte hat für 2, 3 und 4
Reiche eine eigene Form, die festen Karten haben vier Startsterne und passen nicht ins
Duell. Die alten Rastergeneratoren bleiben als **„Rasterkarte"** erhalten (12 × 8 im
Duell, 12 × 18 sonst) – wer die Legephase nicht will, hat damit weiter eine Zufallskarte
in einem Zug. Die zuletzt bewusst gewählte Karte wird gemerkt (`setupMapWanted`), damit
ein Ausflug in den Duellmodus die Wahl nicht still umstellt.

## Spielende: Ansprüche und Punktvergleich (v51)

Bis v50 endete das Spiel in der Sekunde, in der eine Siegbedingung erfüllt war. Auf
Wunsch des Autors gilt jetzt:

* **Militärsieg** (fremde Hauptstadt erobert) endet **sofort** und gewinnt für den
  Angreifer. Kein Vergleich, keine Wartezeit.
* **Wirtschafts-, Forschungs- und Kultursieg** enden das Spiel **nicht** sofort. Wer die
  Bedingung erfüllt, **meldet einen Sieg an**; die laufende Runde wird zu Ende gespielt.
  Das Spiel endet am **Rundenende** – dort, wo die Reihe wieder zum Startspieler kommt.
* Erfüllen in derselben Runde **mehrere** Reiche eine nichtmilitärische Bedingung,
  entscheiden **Punkte**:

      Punkte = Bevölkerung + Anzahl Weltwunder + Anzahl Technologien

* Ein Anspruch **bleibt gültig**, auch wenn die Bedingung später wieder wegfällt: sinkt
  die Bevölkerung unter die Schwelle oder wird das Stufe-3-Wunder erobert, zählt der
  Anspruch trotzdem – für das Rundenende genauso wie für den Punktvergleich. Gewertet
  werden die Punkte **am Rundenende**, nicht die zum Zeitpunkt des Anspruchs.

Im Code: `claimVictory(S, pi, how)` legt den Anspruch ab (`S.claims`, `S.endRound`),
`victoryScore(S, pi)` rechnet die Punkte, `resolveClaims(S)` läuft in `advanceTurn` genau
an der Stelle, an der die Runde umschlägt. `S.over` bekommt dann zusätzlich `winners`,
`score` (die volle Punktetafel) und `shared`. Der Militärsieg setzt `S.over` weiter direkt
und trägt `military: true`.

### Gleichstand: Mensch vor Bot

Steht es nach Punkten gleich, **gewinnen die Menschen allein** – ein Bot nimmt einem
Menschen den Sieg nicht weg, wenn beide gleich weit gekommen sind (Vorgabe des Autors).
Die Regel greift ausdrücklich **nur** beim Gleichstand: hat der Bot einen Punkt mehr,
gewinnt der Bot. Sind mehrere Menschen gleichauf, teilen sie den Sieg; sind nur Bots im
Vergleich, teilen die Bots. `S.over.tiebreak === 'mensch'` merkt sich, dass die Regel
gegriffen hat, das Spielende schreibt es dazu.

Gemessen: 400 Mischpartien (zwei Menschen, zwei Bots, alle von der Bot-Logik gespielt)
ergaben 21-mal mehrere Ansprüche in derselben Runde und **einen** echten Gleichstand –
die Regel entscheidet also selten, aber sie entscheidet dann eindeutig.

**Barbaren** melden nie einen Sieg an und stehen in keinem Vergleich (`canWin`). Sie sind
eine neutrale Fraktion und ohnehin als „dead" geführt; die Prüfung ist der Gürtel zum
Hosenträger, damit ein Barbarenreich mit erobertem Volk nicht über die Bevölkerung
gewinnen kann.

### Zwei Punkte, die die Vorgabe offenlässt

1. **Gleichstand unter Gleichen.** Mensch gegen Mensch (oder Bot gegen Bot) mit gleicher
   Punktzahl ⇒ **gemeinsamer Sieg** (`shared: true`), das Spielende nennt beide Reiche.
   Ein Stichentscheid (etwa „der frühere Anspruch gewinnt") wäre genauso vertretbar –
   eine Zeile in `resolveClaims`.
2. **Ausgeschiedene Reiche.** Wer keine Stadt mehr hat, gewinnt nicht, auch mit Anspruch.
   Die Vorgabe schützt vor dem Wegfallen der *Siegbedingung*, nicht vor dem Untergang;
   ein totes Reich mit vielen Technologien hätte sonst über die Punkte gewonnen. Verfällt
   dadurch der letzte Anspruch, **läuft das Spiel weiter** (`endRound` wird zurückgesetzt).
3. **Nachprüfung am Rundenende.** Wessen Zug schon vorbei war, als der erste Anspruch kam,
   würde sonst leer ausgehen – nur wegen der Sitzreihenfolge. `resolveClaims` prüft
   deshalb am Rundenende noch einmal **alle** Reiche auf den Wirtschaftssieg. Für Kultur-
   und Forschungssieg ist das nicht nötig: die hängen an Ereignissen im eigenen Zug.

Der Kultursieg behält seine eigene Verzögerung (Stufe-3-Wunder muss zu Beginn des
nächsten eigenen Zuges noch da sein, Abschnitt 13). Erst danach wird angemeldet.

### Was das mit der Balance macht (gemessen, nicht geschätzt)

200 Bot-Partien, identische Startwerte vor und nach der Änderung:

| | Militärsieg | Forschungssieg | Kultursieg | Median |
|---|---|---|---|---|
| v50 (sofortiges Ende) | 98 | 97 | 5 | Runde 5 |
| v51 (Rundenende) | 121 | 76 | 3 | Runde 5 |

**Militärsiege nehmen deutlich zu (49 % → 60 %).** Der Grund liegt in der Regel selbst:
ein angemeldeter Sieg gibt den anderen Reichen noch je einen Zug – und ein Militärsieg in
diesem Fenster schlägt den Anspruch. Gemessen: von den 121 Militärsiegen fielen 23 bei
schon offenem Anspruch, 10 davon haben einen fremden Anspruch überfahren. Das ist die
gewollte Folge („A military victory by anyone is still instant"), aber es verschiebt die
Balance – wer das nicht will, müsste den Militärsieg ebenfalls bis zum Rundenende
verschieben (dann wäre er einer von mehreren Ansprüchen und käme in den Punktvergleich).

Der Punktvergleich greift selten, aber er greift: in 14 von 200 Partien meldeten mehrere
Reiche in derselben Runde an, 13-mal entschieden die Punkte, einmal gab es einen
Gleichstand und damit einen gemeinsamen Sieg.

### Oberfläche

Sobald ein Anspruch steht, zeigt die Kopfzeile `… · letzte Runde (Reich)` – ohne diesen
Hinweis wirkte das Spielende eine Runde später willkürlich. Im Protokoll steht der
Anspruch als Überschrift samt Erklärung, dass die Runde noch zu Ende gespielt wird. Das
Spielende-Fenster zeigt bei mehreren Ansprüchen die **Punktetafel** (Bevölkerung, Wunder,
Technologien, Summe) und markiert den Sieger fett.

## Der Plättchenvorrat, zweiter Entwurf (v51)

Der erste Vorrat hatte zwei Schwächen, die der Autor benannt hat: zu viele Plättchen mit
nur zwei Geländearten, und zu wenig Meer am Rand, als dass beim Zusammenlegen größere
Meere hätten entstehen können. Beides ist neu entworfen.

**Vielfalt.** Jetzt hat jedes Plättchen mindestens drei Geländearten, 19 von 20 haben
vier oder fünf. Ein Test hält das fest, sonst schleicht sich die Eintönigkeit beim
nächsten Nachbessern wieder ein.

**Meer an den Rändern.** Meer liegt ausschließlich auf Randfeldern – nur dort kann es
sich mit dem Nachbarplättchen verbinden. Besonders geeignet sind die drei **Ecken**: dort
stoßen bis zu drei Plättchen zusammen, und sie sind die einzigen Felder, die neben keinem
der drei mittigen liegen – Meer dort kostet also nichts an Startgüte. 18 von 20 Plättchen
tragen jetzt Meer (vorher 8), im Vorrat sind es 71 von 300 Feldern (24 %, vorher 11 %).

**Wirkung, gemessen an 600 Karten** (je 200 Startwerte für 2, 3 und 4 Reiche, dieselben
Startwerte für beide Vorräte). Gemessen wird die größte zusammenhängende Meeresfläche:

| Vorrat | Meer auf der Karte | größte Fläche (Median) | Karten mit Fläche ≥ 8 |
|---|---|---|---|
| erster Entwurf | 13 % | 4 Felder | 10 % |
| erster Versuch „mehr Einzelfelder" | 16 % | 4 Felder | 8 % |
| **jetzt** | **24 %** | **8 Felder** | **51 %** |
| Variante „dicht" (verworfen) | 27 % | 13 Felder | 88 % |

Der erste Versuch zeigte etwas Lehrreiches: **mehr Meer allein bringt gar nichts**. Wer
nur einzelne Meerfelder in die Ecken streut, bekommt mehr, aber kleinere Flächen – die
Einzelfelder treffen beim Zusammenlegen fast nie auf ein anderes Meerfeld. Es braucht
eine gewisse **Dichte** an den Kanten, damit Kante auf Kante trifft; das ist ein
Schwellenverhalten, keine gleichmäßige Steigerung.

Gegen die dichte Variante (27 %) habe ich mich entschieden: dort ist auf 88 % der Karten
ein großes Meer, das ist dann kein Zufall mehr, sondern die Regel. Bei 24 % bekommt etwa
die Hälfte der Karten ein richtiges Meer, die andere Hälfte bleibt Landkarte – die
Streuung zwischen den Karten ist am größten, und darum ging es. Wer es nasser mag: das
ist eine Frage von ein paar Buchstaben in `TILE_POOL`, der Test lässt 15 bis 30 % zu.

**Preis dafür:** rund 12 % weniger Landfelder je Reich (4 Reiche: 28,5 statt 32,5). Meer
bringt eine Münze und lässt sich mit Hafen und Seefahrt nutzen, aber Städte brauchen
Land. Ob das die Partien spürbar verändert, muss der Autor am Tisch sehen.

Unverändert gilt: die drei mittigen Felder sind Land und bringen jedes mindestens 4
Nahrung. Auf den meerreichen Plättchen wird das über **Fluss- und Inselfelder** in der
Mitte erreicht (1 Nahrung *und* 1 Münze), die die fehlende Nahrung der Meernachbarn über
die Münzen ausgleichen.

## Der alte Rastergenerator ist raus (v51)

Zufallskarten entstehen jetzt nur noch aus Plättchen, also ist der Rastergenerator
vollständig entfernt statt als zweite Möglichkeit stehen zu bleiben: `randomMap`,
`duelMap`, `makeRandomMap`, `MAP_MIX`, `RANDOM_CAPITALS`, `DUEL_SIZE`, `DUEL_STARTS`,
`pickTerrain`, `isLandKey`, `startFood`, `startSpots`, `carveSpot`, `boostFood`,
`START_MIN_FOOD`, `LAND_KEYS` – dazu die Menüeinträge und 87 Zeilen Tests. `js/data.js`
schrumpft von 471 auf 344 Zeilen. Geblieben ist `mapRng`, der Startwert-Zufallsgenerator;
den braucht `js/tiles.js`.

Zwei Folgen, die dabei bewusst in Kauf genommen sind:

* **Im Duell gibt es nichts mehr zu wählen** – eine Auswahl mit einem einzigen Eintrag
  wäre albern, also bleibt die Kartenzeile dort weg, wie schon vor v50.
* **Die Startgüte-Garantie ist keine Rechenroutine mehr, sondern eine Entwurfsregel.**
  Früher hat der Generator jeden Startplatz nachgebessert, bis er 4 Nahrung und ein
  Gründungsfeld in Distanz 3 hergab. Auf Plättchenkarten sucht sich das jeder selbst aus;
  garantiert ist nur noch, dass die drei mittigen Felder jedes Plättchens 4 Nahrung
  bringen (Bots setzen dort). `START_MIN_FOOD` lebt deshalb nur noch als Erwartungswert
  im Test weiter.

## Gründungskosten: Kolonisten und Kartografie zusammen (v51)

Eine Stadt kostet **Stadtkosten + Distanzkosten** (1/3/6/10 … plus Weglänge zur
Hauptstadt). Englands Alternative **Kolonisten** streicht die Stadtkosten, die Technologie
**Kartografie** die Distanzkosten. Wer beides hatte, zahlte bis v50 eine Pauschale von
1 Nahrung – ab der dritten Stadt war Expansion damit praktisch umsonst.

Neu (Vorgabe des Autors): **man zahlt immer die günstigere der beiden Kosten.**

| Städte | Stadtkosten | Weg (Beispiel 9) | bis v50 | jetzt |
|---|---|---|---|---|
| 1 | 1 | 9 | 1 | 1 |
| 2 | 3 | 9 | 1 | 3 |
| 3 | 6 | 9 | 1 | 6 |
| 4 | 10 | 9 | 1 | 9 |
| 5 | 15 | 9 | 1 | 9 |

Die Kombination bleibt also stark – sie deckelt die Kosten bei der Weglänge, statt sie
mit jeder Stadt weiter steigen zu lassen –, ist aber nicht mehr gratis. Die einzelnen
Vergünstigungen sind unverändert (Kolonisten: nur der Weg, Kartografie: nur die
Stadtkosten). Der Mindestbetrag von 1 bleibt als Sperre für Sonderfälle stehen, etwa ein
Reich, das alle Städte verloren hat und dessen Weglänge deshalb 0 wäre.

## Startgüte nachgerechnet: Russland mit Bevölkerung 2, England mit zwei Städten (v51)

Zwei Nachfragen des Autors, beide nachgerechnet statt geschätzt.

### Gilt die Startgüte auch für Russland?

Russlands „Siedlertrecks" lässt auch die **Hauptstadt** mit Bevölkerung 2 anfangen
(`newGame`). Eine Stadt verbraucht je Bevölkerung 1 Nahrung und bringt 1 Münze, das
Startbudget sinkt dadurch um **0 oder 1** gegenüber Bevölkerung 1 – um 1 genau dann, wenn
die Münzsumme gerade ist (Münzen zählen 2:1).

Ergebnis: **auf jedem der 20 Plättchen bleibt mindestens ein mittiges Feld bei 4 Nahrung**
(bestes Feld je Plättchen: 4 bis 6). Ein Test hält das jetzt fest.

Aber nicht jedes mittige Feld schafft es: **8 der 60 mittigen Felder** fallen für Russland
auf 3. Betroffen sind Hochland (3/4/4), Taiga (3/3/4), Waldland (3/4/3), Küste (4/3/3),
Bergsee, Karst, Fjorde und Ferne Riffe mit je einem Feld. Für Menschen ist das
gleichgültig – sie suchen sich das Feld aus. **Bots setzen aber zufällig auf eines der
drei**, ein Russland-Bot kann also auf Taiga mit 3 statt 4 Nahrung anfangen. Zwei mögliche
Antworten darauf, beide klein: Bots das beste der drei mittigen Felder wählen lassen, oder
die betroffenen Plättchen um je ein Nahrungsfeld anheben. Bisher ist keine umgesetzt, weil
die Vorgabe „mindestens ein Feld je Plättchen" lautet.

### Kann England in Runde 1 zwei Städte gründen?

Zwei Städte kosten mindestens:

* mit **Kolonisten** (keine Stadtkosten): 3 + 3 = **6 Nahrung** (Städte müssen 3 Felder
  Abstand halten, der Weg ist also nie kürzer),
* mit jeder anderen Fähigkeit: (1 + 3) + (3 + 3) = **10 Nahrung**.

Geprüft an 11 671 Startplätzen (alle Lagen, alle erlaubten Felder, 360 Karten):

| Fähigkeit | zwei Städte in Runde 1 | höchstes Startbudget |
|---|---|---|
| **Kolonisten** | **ja, an 8,8 % der Startplätze** | 7 Nahrung |
| Seemacht | nein, an keinem | 9 Nahrung |
| Handelsreich | ja, an 0,6 % | 10 Nahrung |

**Kolonisten ist der Fall, der auffällt:** rund jeder elfte Startplatz erlaubt zwei Städte
im ersten Zug (Beispiel: Bergsee, Budget 7, Kosten 3 + 4). Das ist kein Fehler, sondern
die Fähigkeit – sie streicht genau die Kosten, die das sonst verhindern.

**Seemacht kommt rechnerisch auf 10 und damit knapp heran, praktisch aber nie:** die
Küstenprämie (+2 Nahrung, +2 Münzen) reicht nur, wenn die Hauptstadt außerdem fünf
Fluss- oder Inselfelder als Nachbarn hat und ein Meerfeld. Diese Nachbarschaft kann der
Vorrat rechnerisch gerade so hergeben, in der Stichprobe kam sie nie vor – das höchste
tatsächlich erreichte Budget war 9.

**Handelsreich** schafft es über die 1:1-Umrechnung von Münzen in Nahrung, ebenfalls nur
in Ausnahmefällen (0,6 %).

## Dieselbe Zivilisation mehrfach am Tisch (v51)

Auf der **Plättchenkarte** wählt jeder Platz seine Zivilisation frei – auch zweimal
dieselbe, mit gleicher oder verschiedener Fähigkeit. Auf den **festen Karten**
(Originalkarte, Große Karte, eigene) sitzt jede Zivilisation weiterhin genau einmal: dort
gehört zu jedem Reich ein fester Startstern, zwei Russlands hätten also keinen zweiten
Startplatz. Wählt man dort trotzdem eine schon vergebene Zivilisation, zieht der andere
Platz wie bisher auf eine freie um.

### Was dafür umgebaut werden musste

Bis v50 war die **Zivilisation die Identität** eines Reiches: `map.capitals` war nach
Zivilisation geschlüsselt, der Startspieler wurde über sie gesucht, Name und Farbe kamen
direkt aus `CIVS`. Mit Doppelgängern trägt jetzt der **Platz** die Identität:

* `S.players[i].slot` ist die Nummer des Platzes aus dem Aufbau und überlebt das
  Sortieren in die Zugreihenfolge.
* Plättchenkarten führen ihre Hauptstädte als **Liste** `[{civ, r, c}, …]`, ein Eintrag je
  Platz. Feste Karten bleiben beim Objekt `{russland: [r,c], …}` – `capitalSpot()` kennt
  beide Formen, gespeicherte Partien und der Karteneditor ändern sich nicht.
* Der Startspieler wird über die Objektidentität bestimmt (`ordered.indexOf`), nicht mehr
  über `p.civ === startCiv`. Sonst hätte „Startspieler: Russland II" auf Russland I
  gezeigt.

### Ziffern und Farben

Reiche derselben Zivilisation heißen **„Russland I", „Russland II", „Russland III"** und
bekommen verschiedene Farbschattierungen (Original, 45 % heller, 40 % dunkler). Ohne
Doppelung bleibt alles wie vorher – `name` und `color` sind dann leer und `civOf()` gibt
unverändert den Eintrag aus `CIVS` zurück.

Die Farbe ist dabei kein Schmuck: Städte, Armeen, Grenzen und Besitzmarken werden
ausschließlich über sie unterschieden. Zwei Reiche in demselben Grün wären auf der Karte
nicht auseinanderzuhalten – das Symbol ist bei gleicher Zivilisation ja auch dasselbe.

**Nebenbei gefunden:** das Konfetti beim Sieg las `civOf(...).c`, ein Feld, das es nie gab
(die Farbe heißt `color`). Es fiel nicht auf, weil `confetti()` ohne Farbe eine
Standardfarbe nimmt. Jetzt fliegt es in der Farbe des Siegers.

### Was gleich blieb

Fähigkeiten hängen ohnehin am Spieler, nicht an der Zivilisation (`isAbil(p, …)`), zwei
Russlands können also verschiedene Alternativen spielen. Regeln, die auf `p.civ` prüfen
(Wikinger-Startarmee, Griechenlands Forschungsrabatt …), gelten für jedes der
Doppelgänger-Reiche einzeln – so, wie man es erwartet.

## Fünf Nachbesserungen im Aufbau und im Technologiebogen (v51)

**Farben statt Schattierungen.** Doppelt besetzte Zivilisationen bekommen keine
aufgehellten Varianten mehr, sondern **je eine der vier Zivilisationsfarben**: die erste
behält ihre eigene, die Doppelgänger nehmen eine noch freie. Zwei Griechenland heißen also
Griechenland I (blau) und Griechenland II (zum Beispiel Englands Rot, falls England nicht
mitspielt, sonst Russlands Grün). Vier Plätze, vier Farben, keine Verwechslung. Die
Ziffern im Namen bleiben, weil das Symbol bei gleicher Zivilisation dasselbe ist.

**Zufall als Wahl.** Zivilisation und Fähigkeit haben je einen Eintrag „Zufall". Aufgelöst
wird erst beim Spielstart (`resolveRandom`), damit im Aufbau wirklich Zufall steht und
niemand vorher abliest, wer was bekommt. Ist die Zivilisation gelost, kann die Fähigkeit
nur „Zufall" oder „Grundfähigkeit" sein – die Alternativen unterscheiden sich ja je
Zivilisation. Auf festen Karten meidet die Auslosung bereits vergebene Zivilisationen.

**Zufälliger Startspieler.** Neuer Eintrag „Zufällig", und er ist die **Vorgabe, sobald
mehr als ein Mensch am Tisch sitzt** – sonst begänne immer Platz 1, was bei Hotseat-Partien
ein stiller Vorteil wäre. Eine bewusste Wahl bleibt stehen (`startWanted`), die Vorgabe
greift nur, solange niemand etwas anderes eingestellt hat.

**Theologie und Vereinte Nationen im Duell.** Der Technologiebogen zeigte dort die Werte
des Vierspielerspiels (3/5 und 1/2) statt der Duellwerte (7/10 und 2/3) – die Rechnung war
richtig, nur die Anzeige nicht. Jetzt gibt es **eine** Quelle für beide: `VICTORY_LABEL`
und `DUEL_VICTORY_LABEL` in `js/data.js`, benutzt von `victoryOption` (Rechnung) und
`techEffect` (Anzeige). Die Regelübersicht rechnet ebenfalls damit, statt die Zahlen im
Text zu wiederholen.

**„Hat sie" gegen „könnte sie".** Die Marken an einer Technologiekachel unterschieden
sich nur durch einen gestrichelten Ring und 45 % Deckkraft – bei gleicher Farbe und
gleichem Symbol war das kaum zu sehen. Jetzt ist „hat sie erforscht" eine **ausgefüllte**
Marke in der Reichsfarbe mit hellem Symbol, „könnte sie erforschen" eine **leere** mit
farbigem Symbol, gestricheltem Rand und einem kleinen Fragezeichen. Voll gegen leer trägt
auch bei 17 px und in Graustufen; das Fragezeichen ist der zweite, von der Farbe
unabhängige Unterschied. Dazu zeigt die Legende beide Marken jetzt **als Beispiel**
nebeneinander, statt sie zu beschreiben.

## Startplätze der Viererkarte verlegt (v51)

Bisher saßen die vier Reiche auf **jedem zweiten** der acht äußeren Plättchen des
Streifenverbunds. Auf Wunsch des Autors sind es jetzt die **beiden oberen und die beiden
unteren** Dreiecke – also die vier, deren Fünferzeile auf der Ober- bzw. Unterkante der
Form liegt (Plätze 1, 3, 6, 8). Genau diese vier liegen so; die übrigen sechs stoßen mit
ihrer breiten Seite an die Mittellinie und ragen nur mit einer Spitze an den Rand.

Zwei Folgen, gemessen an 300 Karten mit Bot-Platzierung:

| | alte Plätze (Ring) | neue Plätze (oben/unten) |
|---|---|---|
| Hauptstadtabstand Median | 9 | **7** |
| kleinster gemessener Abstand | 5 | 5 |
| garantierter Mindestabstand | 3 | 3 |
| erlaubte Hauptstadtfelder je Plättchen | 13–14 von 15 | **11 von 15** |

Die Startplätze liegen also **enger zusammen**: die Spitzen von 1 und 6 (links) sowie von
3 und 8 (rechts) berühren sich, dadurch sperrt die Abstandsregel je vier Felder statt
einem oder zwei. Der garantierte Mindestabstand von 3 Feldern bleibt, die drei mittigen
Felder bleiben überall erlaubt (dort setzen Bots). Wer wieder mehr Luft will, ändert
`seatSets` in `TILE_SHAPES[4]` – der Test prüft die Regel, nicht die Zahlen.

## Zwei Sprachen: Deutsch und Englisch (v52)

Im Hauptmenü stehen zwei Flaggen; die Wahl wird gespeichert (`hochciv.lang`), **Deutsch
bleibt die Vorgabe**. Deutsch ist auch die Quelle: englische Texte kommen auf zwei Wegen
dazu, beide in `js/i18n.js`.

**1. Datentexte** (`DATA_EN`) – Gelände, alle 66 Technologien samt Singularität, alle 18
Weltwunder, alle 18 Ereignisse, die vier Zivilisationen mit je drei Fähigkeiten,
Zeitalter, Technologiefelder, Schwierigkeitsgrade, Ereignisstärken, Kartennamen, die 20
Plättchennamen und die drei Kartenformen. Beim Wechsel werden die Felder `n` und `e` der
Spielobjekte ausgetauscht – **kein Aufrufer muss davon wissen**, und `node test.js` prüft,
dass für jeden Schlüssel eine englische Fassung existiert (134 Einträge, keine Lücke).

**2. Oberflächentexte** (`UI_EN`) laufen durch `T()`. **Schlüssel ist der deutsche Satz**,
Platzhalter sind `%s`. Das hat zwei Vorteile: der Code bleibt lesbar (kein
`t('setup.map.label')`), und eine fehlende Übersetzung fällt nicht aus, sondern zeigt den
deutschen Satz und landet in `missingStrings()`.

Der **feste Text aus `index.html`** wird beim Start einmal als Textknoten eingesammelt und
beim Wechsel neu gesetzt (`collectStatic`/`applyStaticLang`). Damit ist das ganze Markup
mit einer Handvoll Zeilen erfasst, statt 50 Elemente einzeln mit Schlüsseln zu versehen.

### Was fertig ist und was nicht (Stand nach dem zweiten Durchgang)

**Vollständig englisch:** Menü, Aufbau, Kopfzeile, Aktionsleiste, Legephase, Editor,
sämtliche Datentexte (Technologien, Ereignisse, Weltwunder, Fähigkeiten, Gelände,
Plättchen), alle **Blätter** (Feld, Stadt, Armee, Welt, Macht, Nahrung, Weltwunder), der
**Technologiebogen**, das **Protokoll** samt Würfelmeldungen, alle Fehlermeldungen der
Regelmaschine, der **Bot-Bericht**, das **Spielende** mit Punktetafel und der
**Regelbogen**. Zusammen 470 Wörterbucheinträge über den 134 Datentexten.

Dazu das **Tutorial**: alle 29 Schritte mit Überschrift, Aufgabe und Erklärtext, also
auch die 28 langen Prosablöcke (rund 19 000 Zeichen). Zusammen **470 Wörterbucheinträge**.

`node smoke.js` läuft die Bildschirme im englischen Modus ab und zählt die deutschen
Reste; die Grenze steht bei 2, gefunden wird 1 (die Zeile „Runde 1" eines vor dem Wechsel
geschriebenen Protokolleintrags). Ein neuer deutscher Text fällt damit sofort auf.

**Eine bewusste Ausnahme:** Protokollzeilen, die **vor** dem Sprachwechsel geschrieben
wurden, bleiben in der Sprache von damals. Das Protokoll ist ein Mitschrieb, kein
Anzeigetext – es speichert fertige Sätze, keine Schlüssel. Neue Zeilen kommen in der neuen
Sprache (ein Smoke-Schritt prüft genau das). Anders wäre das nur mit Schlüssel und
Argumenten im Spielstand zu haben, was alte Spielstände unlesbar machen würde.

**Zwei Fallen beim Umstellen**, beide gefunden und behoben:

* `TUT_STEPS` wird beim **Laden der Datei** gebaut. Titel und Aufgaben standen dort als
  fertige Zeichenketten – zu diesem Zeitpunkt ist die Sprache immer Deutsch, also blieben
  sie deutsch. Übersetzt wird jetzt beim **Anzeigen** (`T(st.t)` in `renderTutPanel`); die
  langen Texte sind Funktionen und liefen ohnehin bei jedem Zeichnen durch `T()`.
* Das **Tutorialpanel** behielt beim Sprachwechsel seinen alten Text, weil nur die Karte
  neu gezeichnet wurde. `switchLang` zeichnet es jetzt mit.

### Wie die Codesätze umgestellt wurden

Rund 230 Sätze waren im Code zusammengebaut (`` `${civ.n} erforscht ${t.n}` ``). Sie
wurden **maschinell** umgeschrieben: ein kleines Skript hat Template-Literale mit
deutschem Text erkannt, die `${…}`-Ausdrücke der Reihe nach durch `%s` ersetzt und den
Aufruf zu `T('%s erforscht %s', civ.n, t.n)` gemacht. Verschachtelte Template-Literale hat
es übersprungen (die wenigen von Hand). Das war deutlich verlässlicher als 230 Handgriffe
und hat die Schlüssel gleich als Liste geliefert – daraus wurde das Wörterbuch.

### Warum das Tutorial zuletzt kam

Die 28 Tutorial-Blöcke sind kein Beiwerk, sondern ein **Lehrtext**: Rechenbeispiele,
Begründungen, Merksätze, jeweils mit Auszeichnungen mitten im Satz. Deshalb kamen sie
zuletzt und nicht zwischendurch – mit stehender Maschinerie ließ sich der ganze Block in
einem Durchgang übersetzen, statt ihn zwischen Umbauarbeiten zu zerhacken. Die Übersetzung
ist bewusst frei, wo eine wörtliche schief klänge („Merke" → „Remember", „Und die
Faustregel" → „And the rule of thumb"); Zahlen, Auszeichnungen und die HTML-Struktur sind
identisch geblieben, damit die Rechenbeispiele weiter zum Spielstand passen.

## Fehler: Tutorial hing auf Englisch bei Schritt 4 (v52)

**Gemeldet:** „Im Tutorial bleibt das Spiel auf 4/29 stecken, man kann nicht auf dem
goldenen Feld siedeln."

**Ursache:** Das Tutorial hält jeden Schritt auf Schienen, indem es die Knöpfe im
Aktionsblatt nach ihrer **Beschriftung** filtert – notiert als deutsche Ausdrücke
(`labels: [/Stadt gründen/]`). Seit der Übersetzung trägt der Knopf aber den Text der
gewählten Sprache. Auf Englisch heißt er „Found city", der Ausdruck passt nicht, und
`tutGateSheet` schaltet ihn ab. Das Blatt ging auf, der Knopf war grau, das Tutorial kam
nicht weiter – und weil die ersten drei Schritte reine Lesetexte sind, war Schritt 4 genau
die erste Stelle, an der es auffiel.

**Behoben:** Jeder Knopf im Aktionsblatt trägt jetzt seinen **deutschen Schlüssel** als
`data-label`; `btn()` übersetzt die Anzeige selbst. Das Tutorial prüft `data-label` statt
der sichtbaren Beschriftung – die Schienen sind damit sprachunabhängig, und die Texte in
`TUT_STEPS` bleiben so notiert, wie sie geschrieben wurden. Dasselbe gilt für die Knöpfe
im Machtblatt und die Zeilen im Armeeblatt.

**Zweiter Fall derselben Sorte:** Beim ersten Durchgang blieben zwei `btn()`-Aufrufe
übersetzt, weil sie die Beschriftung über einen Bedingungsoperator wählen
(`btn(z === 2 ? T('Eisenbahn bauen') : T('Straße bauen'), …)`). Auf Englisch hing das
Tutorial deshalb erneut, diesmal beim Straßenbau (Schritt 24). Deshalb steht die Regel
jetzt nicht nur im Kommentar, sondern in `test.js`:

* **kein `btn()`-Aufruf** darf im ersten Parameter ein `T(…)` enthalten (der Test liest
  `js/ui.js` und zerlegt die Aufrufe selbst),
* **jeder Ausdruck** aus `TUT_STEPS` muss auf mindestens einen tatsächlich vergebenen
  Schlüssel passen – ein Tippfehler in `labels` fällt damit auf, ohne die Oberfläche zu
  starten,
* **alle 29 Schritte** haben Titel und Aufgabe auf Englisch.

Dazu zwei Smoke-Schritte, die Schritt 4 (gründen) und Schritt 24 (Straße bauen) **in
beiden Sprachen wirklich lösen**. Der alte Schritt „in jedem Schritt ist nur das
Vorgesehene anklickbar" lief nur auf Deutsch – dort stimmten Beschriftung und Schlüssel
überein, deshalb fiel nichts auf.

## Nachtrag zur Übersetzung: was beim ersten Durchgang durchgerutscht ist

Drei Stellen, alle vom Autor gemeldet:

* **Zwei Tutorialtitel** (6/29 „Die Hauptstadt wachsen lassen", 10/29 „Forschen: Papier")
  und fünf weitere plus zwei Aufgabentexte hatten keinen Eintrag im Wörterbuch. Der
  Sprachwechsel zeigte sie deshalb deutsch. Jetzt prüft `test.js` alle 29 Schritte.
* **Die Straßenknöpfe** (siehe oben).
* **„Ertrag beim Siedeln"** im Feldblatt. Diese Zeile erscheint nur, wenn auf dem Feld
  auch wirklich gegründet werden kann – der Durchlauf, der die deutschen Reste zählt,
  tippt auf die Hauptstadt und kam nie in diesen Zweig. Solche Zweige findet nur ein
  Blick in die Quelle: ein Skript, das alle Zeichenketten mit deutschen Wörtern sucht,
  die nicht durch `T()` laufen. Genau so sind die letzten drei Stellen gefunden worden
  (dazu zwei eingebettete Wörter in Protokollzeilen: „Wissenschaft/Münzen" und
  „Eisenbahn/Straße" in einem Bedingungsoperator).

## Balance v53: Kolonisten und Seemacht

Zwei Änderungen auf Wunsch des Autors, beide an Englands Alternativen:

**Kolonisten** (Städte gründen ohne Basiskosten) zahlt jetzt **doppelt für
Bevölkerungswachstum** – bei Bevölkerung 4 also 8 Nahrung und 8 Münzen statt 4 und 4. Die
Fähigkeit drückt die Expansionskosten auf die Weglänge; der Ausgleich sitzt jetzt dort, wo
England sonst am billigsten weiterkam. Umgesetzt als Tabelle `GROW_ABIL_FACTOR` in
`js/engine.js` – wer weitere Fähigkeiten mit Wachstumsfaktor will, trägt sie dort ein.

Wichtig: Russlands **Fruchtbarkeit** (keine Nahrung) und die **Dampfmaschine** (keine
Münzen) greifen weiter *vor* dem Faktor, streichen ihren Anteil also ganz. Mit
Dampfmaschine kostet Kolonisten-Wachstum 8 Nahrung und 0 Münzen.

**Seemacht** bringt je Stadt am Meer **+1** auf alle drei Erträge statt +2
(`SEA_CITY_BONUS` in `js/data.js`). Bei vier Küstenstädten sind das 12 Ertragspunkte je
Runde statt 24 – die Fähigkeit war damit stärker als jede Technologie im Spiel.

Beide Zahlen stehen als benannte Konstanten im Code, nicht in der Formel; ein Test liest
sie und rechnet gegen, statt die Zahlen zu wiederholen.

## Zivilisationen in data/civs.json (v53)

Die vier Reiche standen als Literal in `js/data.js`. Sie liegen jetzt in
**`data/civs.json`**; `node tools_civs.js` erzeugt daraus `js/civs.js`, das die App per
`<script>` lädt.

**Warum der Umweg über eine erzeugte Datei?** Die App läuft auch als einzelne HTML-Datei
von der Festplatte, und `fetch('data/civs.json')` darf unter `file://` nicht lesen. Ein
asynchroner Start hätte außerdem `boot()` und alle Prüfläufe umgebaut. Also: JSON als
Quelle zum Pflegen, erzeugte JS-Datei zum Laden – und ein Test, der beide vergleicht.
Wer die JSON ändert und das Erzeugen vergisst, merkt es im nächsten Testlauf, nicht im
Spiel.

`tools_civs.js` prüft beim Erzeugen die Form: Schlüssel klein und eindeutig, Farbe als
`#rrggbb`, genau drei Fähigkeiten, die erste heißt `basis`. Der Test prüft zusätzlich, dass
**jede Alternativfähigkeit im Code auch vorkommt** – eine Fähigkeit, die in der Auswahl
steht und nichts tut, fällt damit auf.

**Zwei Reihenfolgen, die nicht dasselbe sind:** die Reihenfolge in der JSON ist die
**Anzeigereihenfolge** (Aufbau, Regelbogen, Legenden), das Feld `order` die
**Zugreihenfolge** (`ORDER`, früher als Literal in `newGame`). Beim ersten Entwurf hatte
ich CIVS nach `order` sortiert – damit stand plötzlich Russland im Aufbau oben und vier
Tests fielen um. Der Generator hält die beiden jetzt auseinander.

**Nebenbei gefunden:** Beim Zurückschalten von Englisch auf Deutsch blieb der Name der
Barbaren englisch. Der Sprachwechsel sichert die deutschen Namen aus `CIVS` – und die
Barbaren stehen nicht in `CIVS`. Jetzt werden sie mitgesichert.

## Zwei Tutorialfassungen (v54)

Beim Öffnen fragt das Tutorial zuerst: **„Hast du schon Erfahrung mit Spielen wie
Civilization?"** – „Nein" führt in die bisherige ausführliche Fassung (29 Schritte),
„Ja" in eine kurze (24 Schritte, 27 % der Textmenge).

**Beide Fassungen kommen aus einer Schrittliste.** Jeder Schritt trägt zusätzlich ein Feld
`kurz`: entweder einen kurzen Text oder `false` – dann fällt der Schritt in der kurzen
Fassung weg. Das ist der wichtige Teil der Bauweise: die **Aufgaben sind identisch**, weil
es sie nur einmal gibt. Eine zweite Liste hätte über kurz oder lang auseinandergelebt.

Weggelassen werden nur reine Lesetexte: „Dein Umland", „Runde 2: exponentielles Wachstum",
„Rechne nach, bevor du kaufst", „Jede Bevölkerung isst", „Die drei Anfängerfehler". Ihre
Kernaussagen stecken, wo sie gebraucht werden, in den Kurztexten der Aufgabenschritte (die
Nahrungsgrenze etwa beim Wachsen-Schritt).

**Schritte mit Nebenwirkung dürfen nie wegfallen** – „Eine gegnerische Armee vor der Stadt"
ist ein Lesetext, setzt aber per `enter` die griechische Armee aufs Brett. Ein Test prüft
deshalb: jeder Schritt mit `enter`, `dice`, `goal` oder `task` ist in beiden Fassungen
dabei.

**Was die kurze Fassung erklärt** (und nur das): Ressourcen verfallen am Zugende ·
Kampfrechnung und „zwei Züge in Folge" · Zufall im Technologiebaum · Zivilisations-
fähigkeiten · Siegwege samt Anmeldung und Punktvergleich · Handelsrouten · Nahrungsgrenze ·
wie Bots würfeln. Ein Test hält diese Stichworte fest, damit sie beim nächsten Kürzen
nicht verschwinden.

### Der Siegtext war veraltet

Beide Fassungen sagen jetzt, was seit v51 gilt: **nur der Militärsieg endet sofort**, alle
anderen werden angemeldet und die Runde wird zu Ende gespielt; erfüllen mehrere in
derselben Runde eine Bedingung, entscheiden **Bevölkerung + Weltwunder + Technologien**,
bei Gleichstand der Mensch vor dem Bot; ein Anspruch bleibt gültig, auch wenn die Bedingung
später wegfällt. Der alte Text behauptete noch, der Wirtschaftssieg greife „am Ende deines
Zuges".

**Eine Ausnahme von einer alten Regel:** Das Tutorial erwähnt sonst keine Erweiterungen
(die Übungspartie läuft ohne sie). Der Punktvergleich zählt aber Weltwunder mit, also muss
das Wort im Siegschritt stehen – ohne Erweiterung sind es null für alle. Der Test erlaubt
das Wort deshalb genau dort und nirgends sonst.

## Ausgeloste Fähigkeit ablesbar machen (v54)

Seit Zivilisation und Fähigkeit sich auslosen lassen, fehlte die Gegenprobe: im Spiel
stand nirgends, **was** ausgelost wurde. Wer „Zufall" wählte, wusste hinterher nicht, ob
er Seemacht oder Kolonisten spielt.

Zwei Stellen zeigen es jetzt:

* **Kopfzeile** – neben dem Reichsnamen steht der Kurzname der Fähigkeit („Griechenland ·
  Rückschau"), der Wirkungstext hängt als `title` daran. Immer sichtbar, ohne Tippen.
* **Weltblatt** (`ⓘ`) – eine Liste „Die Reiche" mit Farbe, Symbol, Namen, Fähigkeit und
  Wirkungstext für **alle** Mitspieler; das eigene Reich ist umrandet, bei Bots steht
  „Bots haben keine Fähigkeit". Dort ist Platz für den ganzen Satz, den die Kopfzeile nur
  als Kurzform zeigt.

Die Fähigkeit anderer **menschlicher** Reiche ist damit offen einsehbar. Das ist Absicht:
im Aufbau wird sie ohnehin vor aller Augen gewählt, und bei Hotseat-Partien wäre eine
verdeckte Fähigkeit nur eine Gedächtnisübung. Nur die Startplättchen bleiben verdeckt –
dort ist die Verdeckung Teil der Regel.

Im Code: `abilInfo(p)` in `js/engine.js` liefert `{k, n, e}` oder `null` für Bots. Ein Test
prüft, dass **alle zwölf** Fähigkeiten darüber auffindbar sind – eine neue Zivilisation aus
`data/civs.json` fällt damit sofort auf, wenn ihre Fähigkeiten nicht sauber verdrahtet sind.

## Fehler beim Ausrollen: geänderte Dateien, gleiche Version (v55)

**Gemeldet:** „Ich sehe nach dem Updaten der Dateien immer noch v54, und nichts in der
Kopfzeile."

**Ursache:** Der Service Worker liefert `cache-first` und legt einen neuen Cache nur an,
wenn sich `VERSION` in `sw.js` ändert. Die Fähigkeit in der Kopfzeile kam **nach** dem
Versionssprung auf v54 dazu, ohne erneut zu erhöhen – `sw.js` war damit Byte für Byte
dieselbe Datei wie vorher, der Browser hatte keinen Anlass, irgendetwas neu zu laden, und
lieferte weiter das alte JavaScript. Der Code war korrekt und lag auch in den Dateien; er
kam nur nicht an. Die angezeigte v54 war kein Hinweis auf eine alte Kopie, sondern
schlicht dieselbe Nummer wie vorher.

**Behoben:** Version auf v55, und ein Werkzeug, das den Fehler künftig unmöglich macht:

* `node tools_version.js` erhöht die Nummer, schreibt `APP_VERSION`, `VERSION` und einen
  **`BUILD_HASH`** über alle zwischengespeicherten Dateien.
* `node test.js` rechnet den Hash nach. Wurde etwas geändert, ohne die Version zu erhöhen,
  schlägt der Test an und nennt das Werkzeug beim Namen.

Damit ist „Datei geändert, Version vergessen" kein stiller Fehler mehr, sondern ein roter
Testlauf. Bisher fiel es nur auf, wenn jemand das Ergebnis am Gerät nicht sah.

## Druckbogen, zweite Fassung (v55)

Der Autor wollte den Bogen anders: Optik wie im Spiel, keine Einkreisungen, größer, nichts
außer den Plättchen, wenig Weißraum. Alle fünf Punkte hängen zusammen, deshalb ist der
Bogen neu gebaut statt nachgebessert.

* **Optik wie im Spiel:** dieselben Geländefarben und dieselben Zeichen wie auf dem Brett –
  Grasbüschel, Wellen, Bergdreieck, Waldspitzen, Flussschlaufe, Inselpunkt. Sie sind aus
  `terrainGlyph` (js/ui.js) übernommen und mit `R / 30` skaliert, weil die Zeichen dort für
  den Feldradius 30 gebaut sind. Buchstaben und Ringe sind weg.
* **Nichts außer den Plättchen:** kein Papierhintergrund, keine Kopfzeile, keine
  Seitenzahl, keine Namen, keine Legende. Die Legendenseite der ersten Fassung ist damit
  entfallen – die Erträge stehen im Regelbogen der App.
* **Mit Luft, aber verzahnt:** die Dreiecke stehen frei, mit **4 mm Abstand** ringsum, und
  wechseln zeilenweise die Richtung (Spitze unten, Spitze oben, …). Dadurch greifen ihre
  Schrägen ineinander, ohne sich zu berühren: der Vorschub von einem Dreieck zum nächsten
  beträgt nur drei statt fünf Feldbreiten. So stehen **acht** Plättchen auf einer
  A4-Querseite statt vier – bei gleichzeitig **größeren** Feldern.

**Ergebnis:** Feldbreite 19,8 mm statt 17 mm, **3 Seiten statt 6**.

**Kein Umriss.** Ein erster Entwurf legte die Dreiecke lückenlos ineinander und zog dafür
einen dicken Rand um jedes – ohne Fuge wäre sonst nicht zu sehen gewesen, wo geschnitten
wird. Der Autor wollte beides nicht: die Luft zwischen den Dreiecken übernimmt jetzt die
Aufgabe des Umrisses, und jedes Feld trägt nur noch die dünne Linie, die es im Spiel auch
hat.

**Was das kostet:** ohne Namen auf dem Bogen sind die Plättchen nur noch am Muster zu
erkennen. Wer sie beschriftet haben will, setzt in `tools_startplaettchen_pdf.py` eine
Textzeile je Block – die Vorgabe lautete aber ausdrücklich „nichts außer den Plättchen".

## Legephase: drei Nachbesserungen (v56)

**Plättchennamen weg.** In der Hinweiszeile stand „Weite Ebene", „Fjorde" und so weiter.
Der Name sagt nichts darüber, welches Feld man wählt, und nahm Platz weg. Die Namen
bleiben in `TILE_POOL` als **interne Bezeichnung** – Testmeldungen sagen weiter
„Fjorde: zu wenig Nahrung", und der **Druckbogen** führt sie weiter, dort sind sie ein
Register, um über gedruckte Plättchen zu reden. Wenn sie auch dort verschwinden sollen,
ist das eine Zeile in `tools_startplaettchen_pdf.py`.

**Fähigkeit sichtbar.** Bei ausgeloster Zivilisation war die Legephase die erste Stelle,
an der man sein Reich sah – aber nicht seine Fähigkeit. Jetzt steht sie neben dem
Reichsnamen, der Wirkungstext hängt als `title` daran. `seatAbil()` holt sie über
`abilInfo` aus der Aufstellung, greift also auch, bevor die Partie existiert.

**Ertragsübersicht nach dem Setzen.** Sobald die Hauptstadt liegt, steht darunter, was sie
einbringt – dieselbe Rechnung wie „Ertrag beim Siedeln" im Spiel (`income` auf einer
Wegwerf-Partie, Fähigkeiten also eingerechnet).

Wichtig dabei: gerechnet wird auf dem Kartenstand, den **dieser Platz sehen darf**.
Verdeckte Nachbarplättchen zählen nicht mit – sonst verriete die Zahl, was dort liegt.
Grenzt das gewählte Feld an noch Verdecktes, steht der Hinweis „noch verdeckte
Nachbarfelder kommen dazu" dabei; auf den drei mittigen Feldern kann er nie erscheinen,
weil dort alle sechs Nachbarn auf dem eigenen Plättchen liegen. *(v73: entfallen – er
erschien nur am Kartenrand und am Loch, wo nie etwas dazukommt; an ein verdecktes
Plättchen grenzt eine erlaubte Hauptstadt gar nicht.)*

**Nebenbei behoben:** Der Name eines Doppelgängers („Griechenland II") war eine fest
zusammengebaute Zeichenkette und blieb beim Sprachwechsel deutsch. Gespeichert wird jetzt
nur die **Ziffer** (`p.roman`), den Namen setzt `civOf` bei jeder Anzeige neu zusammen.
Alte Spielstände mit `p.name` funktionieren unverändert weiter.

## Die Übergabe pflegt sich nicht selbst (v57)

Nach der Frage „taugt das Zip für einen neuen Chat?" habe ich `UEBERGABE.md` gegen die
Dateien geprüft, statt sie zu überfliegen – und drei Sorten Altlast gefunden:

* **Kennzahlen von vorgestern:** „muss grün sein — 816 Assertions" und „68 Schritte",
  während es 1153 und 94 sind. Wer damit anfängt, hält einen grünen Lauf für falsch.
* **Zeilenzahlen** in der Dateitabelle, um bis zu 7 Zeilen daneben.
* **Prosa**, die überholt war: „Deutsche Oberfläche" (ist zweisprachig), die
  Versionsnummer in der Kopfzeile, ein Arbeitsverzeichnis, das es nicht mehr gibt.

Interessant war der Gegenbefund: die Zeile zum Druckbogen („A4 quer, 3 Seiten, Spieloptik,
verzahnt mit 4 mm Luft") hielt ich für veraltet – sie stimmte, **meine Erinnerung** war
veraltet. Über eine so lange Sitzung ist die Datei die Quelle, nicht das Gedächtnis.

**Behoben und abgesichert:**

* `node tools_docs.js` setzt Zeilenzahlen, Assertions, Smoke-Schritte und die Dateizahl
  neu (mit Testläufen; `--schnell` lässt sie weg).
* `node tools_version.js` schreibt jetzt auch **Datum und Version in die Kopfzeile** der
  Übergabe.
* `node test.js` prüft die **Zeilenzahlen** der Dateitabelle und dass **jede Quelldatei
  dort auftaucht** – eine neue Datei ohne Eintrag fällt sofort auf.

Damit ist die Übergabe kein Dokument mehr, das man pflegen *muss*, sondern eines, das
meckert, wenn es nicht gepflegt ist.

## Vier Nachbesserungen am Rand des Spiels (v58)

Vier Wünsche, die alle nichts an den Regeln ändern, aber am Weg ins Spiel und aus dem
Spiel heraus. Zusammen genommen: die zweite Partie soll leichter zu beginnen sein als die
erste, und die erste soll weniger Fragen stellen.

### 1. „Nochmal spielen" am Spielende

Wer allein gegen Bots spielt, bekommt am Spielende einen zweiten, hervorgehobenen Knopf
über dem Weg ins Menü: **dieselbe Aufstellung, ein ausgelostes Reich** – und nach einem
Sieg **eine Stufe schwerer**. Ohne ihn führt der einzige Weg zur nächsten Partie über
Menü → Neues Spiel → alles wieder einstellen, und das ist genau der Moment, in dem man
es dann doch bleiben lässt.

**Wie „dieselben Einstellungen" gespeichert sind.** `newGame` legt ein `recipe` in den
Spielstand: die **rohe** Wahl aus dem Aufbau, `zufall` noch nicht aufgelöst. Roh ist der
Punkt – wer mit ausgelostem Reich gestartet ist, bekommt beim nächsten Mal ein neues, und
das Rezept muss dafür nichts wissen. Es liegt im Spielstand und nicht in einer Variablen
der Oberfläche, damit der Knopf auch nach einem Neuladen der App noch weiß, was er
wiederholen soll. Die Regeln lesen das Rezept nie.

**Nur bei genau einem Menschen.** Zu mehreren gehört die Aufstellung nicht einem allein;
ein ausgelostes Reich wäre eine Entscheidung über die anderen hinweg. Gezählt werden
Plätze, nicht Überlebende (`humanSeats`): wessen Hauptstadt gefallen ist, saß trotzdem mit
am Tisch. Barbaren sind eine Ereignisfraktion und kein Platz. Spielstände aus früheren
Fassungen und das Tutorial haben kein Rezept – dort erscheint der Knopf nicht.

**Das ausgeloste Reich musste wirklich ausgelost werden.** Der erste Entwurf setzte den
Platz des Menschen im Rezept auf `zufall` und ließ `resolveRandom` machen. Auf den festen
Karten sitzt aber jede Zivilisation genau einmal, und die Auslosung nimmt nur, was noch
frei ist: bei vier Reichen ist das **genau das eigene alte**. Man hätte jedes Mal
dasselbe Reich bekommen, und weil es sich um einen Zufall handelt, wäre das lange nicht
aufgefallen. Jetzt wird wirklich getauscht: gezogen wird aus allen vier Zivilisationen,
und wer die gezogene hatte, übernimmt die alte des Menschen. Die Reiche bleiben damit
paarweise verschieden, und auf der Plättchenkarte (wo Doppelte erlaubt sind) bleibt es
bei der freien Auslosung. `smoke.js` fährt 16 Wiederholungen und besteht auf Abwechslung –
eine Zusicherung über das Ergebnis, nicht über die Absicht.

**Eine Stufe schwerer nach einem Sieg.** `DIFFICULTIES` steht von leicht nach schwer
(Siedler … David); eine Stufe weiter heißt, die Bots brauchen weniger auf dem Würfel. Am
Ende der Liste bleibt es bei David – ein Grad wird nicht erfunden, der Hinweistext sagt
das dann auch. Nach einer Niederlage bleibt der Grad, wie er war: wer gerade verloren hat,
braucht keine Beförderung.

### 2. Ein Tipp am Spielende

Unter dem Ergebnis steht ein zufälliger Spieltipp – gewonnen wie verloren. Die 43 Tipps
sind die Sammlung des Autors, wörtlich übernommen (`TIPS` in `js/data.js`, englisch in
`DATA_EN.tips` an derselben Stelle der Liste, wie bei `AGES` und `FIELDS`).

**Einmal je Partie, nicht je Aufruf.** `gameOver()` wird aus fünf Wegen erreicht (Zugende,
Bot-Fenster, Forschen, Machtkauf, ein neu geladener beendeter Spielstand). Ein bei jedem
Aufruf neu gezogener Tipp würde beim Zurückblättern wechseln und wie ein Fehler aussehen.
Gezogen wird deshalb einmal und die **Nummer** in `S.tip` gemerkt – die Nummer, nicht der
Satz, damit ein Sprachwechsel den Tipp mitnimmt.

Geprüft wird an den Tipps nur, was still schiefgehen könnte: gleiche Länge beider Listen
(eine vergessene Übersetzung trüge sonst den deutschen Satz ins englische Spiel) und keine
Doppelten. Ob ein Tipp inhaltlich noch stimmt, prüft nichts – die Namen darin sind Prosa,
keine Schlüssel. Wer eine Technologie umbenennt, muss hier nachsehen.

### 3. Erweiterungsmodule in den Einstellungen

Ereignisse und Weltwunder sind Erweiterungen des Grundspiels, standen im Aufbau aber
gleichberechtigt neben Karte und Schwierigkeit. Wer zum ersten Mal spielt, wird damit nach
Regeln gefragt, die er noch nicht kennt. Beide sind jetzt **Module** und ab Werk **aus**;
eingeschaltet werden sie im Hauptmenü unter *Einstellungen* (geräteweit, gespeichert unter
`hochciv.opts`).

**Das Modul macht die Wahl verfügbar, es trifft sie nicht.** Ist ein Modul aus, fehlt seine
Zeile im Aufbau ganz. Ist es an, steht dort wieder das gewohnte Häkchen und entscheidet
weiterhin je Partie. Am Spiel selbst ändert das nichts: die Vorgabe im Aufbau war schon
immer „ohne", eine Partie mit abgeschalteten Modulen läuft also genau wie bisher eine
ohne Häkchen.

**Abschalten löscht das Häkchen mit.** Sonst könnte ein Modul, das jemand einmal
eingeschaltet und angehakt hat, nach dem Abschalten unsichtbar weiterlaufen – Zeile weg,
Häkchen noch gesetzt. Genau diese Sorte Fehler findet man später nur schwer.

### 4. „Grundfähigkeit" bei ausgelostem Reich entfällt

Wer im Aufbau die Zivilisation auslosen ließ, konnte bei der Fähigkeit zwischen *Zufall*
und *Grundfähigkeit* wählen. Der zweite Eintrag benannte nichts: die Grundfähigkeit heißt
bei jedem Reich anders und wirkt anders (Günstige Forschung, Handelsreich, Taiga,
Seefahrer), und welche man bekäme, entschied ohnehin erst die Auslosung. Es blieb also nur
die Wahl zwischen „irgendeine der drei" und „die erste von dreien, welche auch immer das
ist". Die Zeile ist ersatzlos weg; bei ausgelostem Reich steht die Fähigkeit auf *Zufall*
und das Menü still. Bei bekannter Zivilisation ändert sich nichts – dort stehen die drei
Fähigkeiten weiter mit ihren richtigen Namen.

### Nebenbei behoben: `hidden` wirkte auf Zeilen nicht

Aufgefallen an der Zeile *Ereignisstärke*: sie war im Code längst versteckt
(`$('setup-evmode-row').hidden = true`) und stand trotzdem im Aufbau. Grund ist die
Rangfolge der Stilbögen – `[hidden] { display: none }` steht nur im Bogen des Browsers,
und der verliert gegen **jede** Regel aus `style.css`, egal wie unspezifisch. `.row
{ display: flex }` hat also jede versteckte Zeile trotzdem gezeigt. Dass es niemandem
auffiel, lag auch am Test: geprüft wurde `.hidden`, die **Eigenschaft**, und die war die
ganze Zeit korrekt `true`. Ein `[hidden] { display: none !important }` in `style.css`
behebt es für alle Zeilen auf einmal – `#tut-panel[hidden]` war die Einzelfalllösung
desselben Problems und ist damit überflüssig geworden, bleibt aber harmlos stehen.

## Fehler: Der Koloss stellte seine Armeen in der Hauptstadt (v58)

Gemeldet: die zwei kostenlosen Armeen des Kolosses erscheinen immer in der Hauptstadt,
statt in der Stadt, die das Wunder gebaut hat.

Ursache war eine Zeile in `spawnFreeArmies`: `const cap = capitalOf(S, pi)`. Die Funktion
kannte den Bauort gar nicht – sie bekommt nur `(S, pi)`, weil sie an drei Stellen
aufgerufen wird (Wunderbau, nach jeder Armeebewegung, zu Zugbeginn). Aufgefallen ist es
lange nicht, weil Wunder meistens in der Hauptstadt gebaut werden; dort war das Ergebnis
zufällig richtig. Der bestehende Test baute den Koloss ebenfalls in der Hauptstadt und
war damit blind für den Fehler.

**Warum der Ort gemerkt werden muss.** Auf einem Feld steht nur eine Armee, die zweite
wartet also in der Warteschlange `p.freeArmies` – und die überdauert Züge. Ein Parameter
am Aufruf hätte nur die erste Armee richtig gesetzt; die zweite wäre beim nächsten
`spawnFreeArmies` wieder in der Hauptstadt gelandet. Der Bauort steht deshalb als
Stadt-Id in `p.freeArmyCity` und wird geleert, sobald die Schlange leer ist.

**Wenn die Stadt wegfällt.** Wird die Kolossstadt erobert oder zerstört, während noch
eine Armee wartet, rücken die Armeen in die Hauptstadt nach – besser dort als gar nicht,
und eine verschluckte Gratisarmee wäre der schlimmere Fehler. Alte Spielstände ohne
`freeArmyCity` laufen über denselben Weg und verhalten sich wie bisher.

**Mitgezogen:** das Protokoll und die Zugende-Warnung nannten fest die Hauptstadt. Beide
nennen jetzt die richtige Stadt (die Hauptstadt heißt so, jede andere steht bei ihren
Koordinaten – wie beim Gründen). Der Test baut ausdrücklich in einer zweiten Stadt und
prüft die wartende Armee mit; ohne die Korrektur schlägt er an drei Stellen an.

## Nachtrag: Regelmodus aus der README (v58)

Die README beschrieb weiter ein Dropdown *Originalregeln / Experimentell v2* im Aufbau.
Das gibt es seit der Vereinheitlichung nicht mehr – `smoke.js` prüft sogar, dass
`setup-rules` **nicht** existiert. Der Abschnitt ist ersatzlos gestrichen; im Code war
ohnehin nichts davon übrig. Was die frühere v2 ausmachte, steht als Erklärung weiter in
`js/data.js` über `SINGULARITY_BASE` und in dieser Datei bei der Vereinheitlichung.

## Zwei Fehler, eine Umbenennung, ein überarbeitetes Kurztutorial (v60)

### Fehler: im Plättchenmodus sah der zweite Mensch keine Erträge

Gemeldet für zwei menschliche Spieler: in der Legephase zeigte die Ertragsübersicht der
gewählten Hauptstadt nichts an – aber nur beim zweiten Menschen.

`tileMap` führt die Hauptstädte **nach Platz** (`capitals[seat.idx]`), weil auf
Plättchenkarten dieselbe Zivilisation zweimal sitzen darf. Die Vorschau rechnet dagegen auf
einer Wegwerf-Partie mit **einem einzigen** Spieler, und der sitzt zwangsläufig auf Platz 0.
Für Platz 0 stimmte das zufällig; jeder weitere Platz suchte seine Hauptstadt an Index 0,
fand `undefined`, bekam keine Stadt und damit keine Zahl. Mit einem Menschen fällt das nicht
auf, weil der meist auf Platz 0 sitzt – deshalb kam es erst zu zweit heraus. Nachgestellt:

    seat.idx=0: capitals = [{civ:'griechenland',…}]   → Ertrag {sci:1,food:2,coins:4}
    seat.idx=1: capitals = [null,{civ:'england',…}]   → keine Ertragsübersicht

`placeYield` legt die Hauptstadt des Platzes jetzt auf Index 0, bevor es die Wegwerf-Partie
baut. Kein Eingriff in `tileMap`: dessen Zählung nach Platz ist überall sonst richtig.

### Fehler: der Mensch gewann nur bei Punktgleichstand

Melden Mensch und Bot in derselben Runde einen Sieg an, sollte immer der Mensch gewinnen.
Tatsächlich entschieden zuerst die Punkte, und die Menschenregel griff nur, wenn es
**genau gleich** stand – ein Bot mit einem Punkt mehr rechnete dem Menschen den Sieg weg.
Auffällig wurde es im Tutorial.

`resolveClaims` sortiert weiter alle Ansprüche nach Punkten (die Tafel am Spielende zeigt
sie unverändert **alle**, auch die gleich ausgeschlossenen), wählt die Gewinner aber nur
noch aus den Menschen, sobald einer einen Anspruch hat. Unter Bots entscheiden die Punkte
wie bisher; ein untergegangenes Menschenreich verdrängt niemanden, weil sein Anspruch schon
vorher verfällt. Der Vermerk `tiebreak: 'mensch'` erscheint nur, wenn die Regel wirklich
etwas geändert hat, also ein Bot sonst gewonnen oder mitgewonnen hätte.

Der Wortlaut musste mit: „Gleichstand, Mensch vor Bot" wurde zu „Mensch vor Bot", und die
Erklärung am Spielende heißt jetzt „Melden Mensch und Bot in derselben Runde einen Sieg an,
gewinnt der Mensch – auch mit weniger Punkten." Der alte Test hielt ausdrücklich das
**Gegenteil** fest („die Menschenregel greift nur bei Gleichstand, nicht gegen mehr
Punkte"); er ist jetzt der Test der neuen Regel, mit zwei Grenzfällen daneben.

### Bevölkerung heißt Bevölkerung

`cityPopYield` wird mit der Einwohnerzahl multipliziert. „Stadt: +1 Wissenschaft" war damit
nicht bloß unscharf, sondern um den Faktor der Bevölkerung falsch: eine Stadt mit
Bevölkerung 5 bekommt durch Schrift +5. Betroffen waren Schrift, Universitätswesen,
Fließband und Robotik (jetzt „Je Bevölkerung: …") sowie Maschinengewehr, dessen
„+2 Verteidigung/Größe" dasselbe meinte („Städte: +2 Verteidigung je Bevölkerung").

Mitgezogen, weil es dieselbe Sache anders nannte als der Knopf im Spiel: Keramik und
Dampfmaschine sprachen von „erweitern" und „Stadterweiterung", während die Aktion
**Bevölkerung wachsen** heißt; Gentechnik und Massenmedien wollten „Stadt füttern", während
das Nahrungsblatt „Die Bevölkerung isst" schreibt. Alle vier heißen jetzt nach der
Bevölkerung.

### Das kurze Tutorial

Durchgang durch alle 24 Schritte der kurzen Fassung, nach Vorgaben des Autors. Der Kern:
weniger Beispiel, mehr Regel. 1/24 nennt die Zivilisationsfähigkeiten nur noch, ohne
Beispiel und ohne Hinweis auf das Tutorial selbst. 2/24 erklärt zuerst, **was man tun
kann** – frei so viele Aktionen, wie man bezahlen kann, mit Liste – und danach, woher das
Geld dafür kommt. 16/24 erklärt den Kampf von Grund auf statt an der Beispielrechnung
(Zeitpunkt, Nachbarschaft, zwei Züge, Angriffs- und Verteidigungswert); 18/24 übernimmt
umgekehrt die Beispielrechnung aus der langen Fassung und sagt dazu, **warum** die
Hauptstadt das Ziel ist: wer sie nimmt, gewinnt sofort.

Nachgeprüft, bevor der Text geschrieben wurde: `attackStacks`/`defenseStacks` stehen beide
auf `true`, die Machtwerte mehrerer Armeen addieren sich also wirklich – die neue Formel in
16/24 gibt `attackValue`/`defenseValue` korrekt wieder.

Zwei Wortfelder wurden im ganzen Spiel geradegezogen: **Meer statt Wasser** (das einzige
Nicht-Land-Gelände heißt „Meer"; Fluss ist Land, „Wasser" gab es als Begriff gar nicht) –
auch in den Technologien Navigation und Panzerschiff und in den Codekommentaren. Und
**forschen statt kaufen** in allen Forschungsaufgaben; gekauft werden weiter Macht,
Armeen und Straßen.

**Neu am Mechanismus:** ein Schritt darf über `tKurz` einen eigenen Titel für die kurze
Fassung tragen. Nötig für 2/24: die lange Fassung ist dort weiter die Ressourcentabelle
(„Woher deine Ressourcen kommen"), die kurze heißt „Aktionen". Ohne `tKurz` gilt weiter ein
gemeinsamer Titel – das bleibt der Normalfall, und `node test.js` verlangt auch für `tKurz`
eine englische Fassung.

## Legephase eine Reihe näher, dominierte Startfelder, Grenzen am Kartenrand (v73)

Vier Anweisungen des Autors, alle mit Tests festgeschrieben.

### Internet: die Gratiskachel zeigt die Wirkung

Im Kopierteil des Technologiebogens trug die Gratiskachel statt der Wirkung nur „Internet ·
Gratiskopie" (fest im Code, also auch auf Englisch). Jetzt steht dort `techEffect` wie auf
jeder anderen Kachel; dass es die Internet-Kopie ist, sagen das Preisfeld „gratis" (jetzt
über `T()`, englisch „free") und die Überschrift „· 1× gratis per Internet".

### Reichsgrenzen um „Kein Feld"

Plättchenkarten liegen in einem Rechteck aus `X`. `controlledTiles` schloss nur Felder
außerhalb des Rasters aus, nicht `X` – eine Stadt am Kartenrand oder am Loch hatte die
leeren Sechsecke dahinter im Gebiet, und `drawMap` zog die Reichsgrenze um sie herum.
Gemessen über je 30 Bot-Partien (Seeds 1–30): 2 Reiche 9, 3 Reiche 28, 4 Reiche 21 Partien
mit mindestens einem solchen Feld. Erträge änderte das nie (`X` bringt 0/0/0, und die
Übersicht blendete es schon aus), wohl aber die Grenze und die Bot-Priorität 9 („an den
Rand des eigenen Reichs"), die leere Sechsecke als Reich mitzählte – auf Plättchenkarten
verhalten sich Bots dort jetzt wie auf den festen Karten. `buyTile` lehnt `X` ebenfalls ab
(über die Oberfläche war es nie antippbar, die Regelmaschine hätte es aber verkauft).

### Hauptstadt eine Reihe näher am Gegner (2 und 4 Reiche)

Die Regel steht oben unter „Hauptstadt „frei" – mit einer Einschränkung". Kurz: statt
3 Felder Abstand zu fremden Startplättchen jetzt 2, dazu die Bedingung, dass sich zwei
mögliche Hauptstädte nie ein echtes Umlandfeld teilen. Die Begründung des Autors war
„ohne Überlappung, im 1 gegen 1 nur am Loch" – für 2 Reiche stimmt das genau, für 4 Reiche
bis auf die beiden Ecken neben dem offenen Mittelplättchen; die bleiben deshalb gesperrt
(Auslegung, oben begründet). Bei 3 Reichen war nie etwas gesperrt.

**Folge im 1 gegen 1, gemessen:** setzen beide in die Ecke am Loch, stehen die Hauptstädte
2 auseinander. Je 150 Bot-Duelle (Russland gegen England), beide Hauptstädte dort gegen
normale Bot-Platzierung: Militärsiege 90 gegen 59, Spielende im Median Runde 4 gegen 8.
Regelgerecht nach der Vorgabe (kein geteiltes Feld), aber eine Partie aus dieser Stellung
kippt schnell.

`test.js` prüft über **alle** Paare erlaubter Felder: kein geteiltes Umland, kein Umland auf
einem fremden Startplättchen, Abstand unter 3 nur im 1 gegen 1 und nur über das Loch, jedes
bis v72 erlaubte Feld bleibt erlaubt, und die Zahlen 15/15/13. Gegenproben: die alte Regel
(14 bzw. 11 Felder) und die Regel ohne Bedingung 2 (4 Reiche: zwei Paare mit geteiltem
Feld) schlagen jeweils an.

### Dominierte Startfelder: rötlicher Rand

In der Legephase trägt jedes erlaubte Feld einen rötlichen Rand (etwas eingerückt, innerhalb
des goldenen Plättchenrahmens), wenn ein **anderes erlaubtes Feld von einem Ertrag mehr und
von keinem weniger** bringt. Die Hinweiszeile erklärt den Rand, sobald einer zu sehen ist.

* **Maßstab** ist genau die Zahl der Ertragsübersicht: Einkommen des ersten Zugs, von der
  Regelmaschine auf einer Wegwerf-Partie gerechnet (`placeYieldAt`, Fähigkeiten
  eingerechnet). Siedelraum, Küste für später oder Abstand zum Gegner zählen nicht.
* **Verglichen wird über alle drei Lagen** (Auslegung): Lage und Hauptstadt wählt man
  zusammen, „anderswo" ist also auch ein Feld in einer anderen Lage. Folge: in seltenen
  Fällen ist eine ganze Lage rot – dann taugt sie nichts. Gleichstand dominiert nicht.
* **Gemessen** (180 Pläne, alle Sitze, 17 775 Wahlmöglichkeiten): 77 % dominiert; nur je
  Lage verglichen wären es 67 %. Ganz rote Lagen: 58 von 1620 (4 %). Nicht dominiert
  bleiben je Sitz 1 bis 21 Wahlmöglichkeiten, im Median 7 – über drei Lagen.
* **Die Vorschau ist genau**, obwohl sie die fremden Startplättchen nicht sieht: das Umland
  einer erlaubten Hauptstadt liegt nie auf einem verdeckten Plättchen (Bedingung 1 oben).
  `test.js` startet für 580 Wahlmöglichkeiten die echte Partie und vergleicht das
  Einkommen des ersten Zugs Zahl für Zahl.
* Nebenbei entfallen: der Hinweis „– noch verdeckte Nachbarfelder kommen dazu". Er zählte
  jedes `X` als verdeckt und erschien deshalb nur am Kartenrand und am Loch – dort, wo nie
  etwas dazukommt.

Umgesetzt in `js/tiles.js` (`placeYieldAt`, `placeYieldTable`, `yieldBeats`,
`dominatedCells`), in der Oberfläche `placeInfo` (einmal je Sitz gerechnet, 3 × 15
Wegwerf-Partien) und die Markierung `dom` in `drawMap`.

## Kartenansichten und Gründen als eigene Aktion (v75)

Drei Wünsche aus einer Testrunde, mit dem Autor vorab abgestimmt (Rückfragen: wann die
Machtansicht erscheint, was die Ringe zeigen, wie Gründen abläuft, wie Erträge aussehen).

### Erträge je Feld

(Seit v87 ist der Umschalter weg – er zeigte dasselbe wie der Gründungsmodus; an seiner
Stelle steht „Fähigkeiten", siehe dort. Die Chips gibt es weiter im Gründungsmodus. Das
Folgende ist der Stand von v75.)

Ein Umschalter **Erträge** in der Leiste legt auf jedes Feld bis zu drei farbige Chips mit
Zahl: Wissenschaft blau, Nahrung grün, Münzen gold; Nullen fehlen. Gerechnet wird mit
`tileYieldAt` für das Reich, das gerade schaut – also mit dessen Technologien, Ereignissen
und Bürokratie. Während Bots ziehen, bleibt es die Sicht des Menschen (`viewerOf`), sonst
sprängen die Zahlen mit jedem Bot um. Stadtfelder bleiben frei: das Feld unter der Stadt
bringt nichts. Die Wahl gilt je Gerät (`hochciv.yields`). Der Schalter ist reine Ansicht und
deshalb auch im Tutorial und während Bot-Zügen bedienbar.

### Stadt gründen

**Auslegung (vom Autor gewählt):** Gründen ist eine eigene Aktion der Leiste, nicht mehr
eine Möglichkeit im Feldblatt. „Stadt gründen" schaltet den Gründungsmodus an:
* jedes Feld zeigt seine Erträge (wie oben), jeder **mögliche** Platz seine Kosten in
  Nahrung – **rot**, wenn die Nahrung diesen Zug nicht reicht (Münzen 2:1 mitgerechnet);
* was **grundsätzlich** nicht geht (Meer, Vulkan, besetzt, neben einer fremden Armee, kein
  Weg, unter 3 Felder zur nächsten Stadt), ist abgeblendet;
* ein Tipp auf ein Feld öffnet das **Gründungsblatt**: Kosten, Ertrag beim Siedeln (auch
  dann, wenn nur die Nahrung fehlt – gerade dann will man wissen, ob sich Sparen lohnt),
  und der Knopf **Hier gründen**; geht es nicht, steht der Grund am gesperrten Knopf;
* nach dem Gründen endet der Modus, ebenso durch einen zweiten Tipp auf „Stadt gründen",
  durch Forschen, Macht, Armeen, Zugende oder den Bot-Zug.

Für die Trennung „geht nicht" / „zu wenig Nahrung" ist `canFound` geteilt:
`foundSiteError` prüft den Platz, `canFound` zusätzlich die Nahrung – Prüfungen und
Meldungen sind dieselben, ein Test vergleicht jedes Feld. Damit das Zeichnen schnell
bleibt, rechnet `withFoundTable` die Wege von der Hauptstadt einmal vor (eine
Breitensuche statt zwei bis vier je Feld; große Karte 126 → 7 ms, gemessen in Node) – die
Regeln bleiben in `foundPassable`, `foundSiteError` und `foundCost`, ein Test vergleicht
beide Wege Feld für Feld.

**Tutorial:** Die drei Gründungsschritte laufen jetzt über die Leiste (Aufgabe: „Tippe
unten auf Stadt gründen, dann auf das goldene Feld und auf Hier gründen."), im Langtext
von Schritt 4 steht der neue Weg. Die Kurztexte nannten den Weg nie und sind unverändert.
Schienen: `bar: ['a-found']`, `labels: [/Hier gründen/]`, dasselbe Feld wie bisher.

### Machtansicht

**Auslegung (vom Autor gewählt):** Solange das Machtblatt offen ist, tragen alle Städte und
Armeen einen Ring aus Kreisanteilen – **ohne Zahl**, wie in Ozymandias:
* **Stadt:** Anteil des Besitzers = Verteidigungswert (`defenseValue`); dazu je fremdem Reich
  mit Armeen in Reichweite dessen Angriffswert (`attackValue`) in seiner Farbe;
* **Armee:** Anteil des Besitzers = Machtwert seines Reichs; dazu je Reich, das sie gerade
  flankieren könnte (`canFlank`), dessen Machtwert.
Ein Reich ohne Gegenüber hat einen vollen Ring. Überwiegt ein fremder Anteil, läuft die
Belagerung bzw. fällt die Armee; bei Gleichstand hält der Verteidiger (Legende im Blatt).
Käufe verschieben die Ringe sofort. Die Zahlen stehen weiter im Feldblatt.

Die Ansicht ist eine **Momentaufnahme**: gekämpft wird am Ende des Zugs des Angreifers,
bis dahin kann er Macht kaufen und ziehen. Gerechnet wird mit denselben Funktionen wie im
Kampf (`powerView` in `engine.js`); das Flankieren ist dafür aus `combatPhase` in
`canFlank` herausgelöst – dabei fiel der Spiegelungsfehler auf (Abschnitt 1).

## Machtringe: ein Teilstück je Punkt (v76)

**Wunsch des Autors:** die Ringe der Machtansicht in Stücke der Größe eins teilen – eine
Stadt mit Verteidigung 1 und Angriff 2 trägt drei Stücke, eines in der Farbe des
Verteidigers und zwei in der des Angreifers.

Umgesetzt in `powerRing` (`js/ui.js`): Die Anteile bleiben wie in v75 (Besitzer ab zwölf
Uhr im Uhrzeigersinn, dann die fremden Reiche), darüber liegt je Punkt ein heller
Trennstrich. Die Werte sind ganze Zahlen, die Grenze zwischen zwei Reichen fällt also
immer auf einen Strich. Damit lässt sich jeder Wert abzählen, ohne dass eine Zahl
dasteht. Die Striche werden mit der Zahl der Punkte feiner (bis 12 Punkte 1,3, bis 24
0,9, darüber 0,55 Karteneinheiten), sonst verschwände die Farbe unter ihnen.

**Auslegung – Obergrenze 60 Punkte (`RING_MAX_PUNKTE`):** Der Stadtring ist in der Mitte
gut 120 Karteneinheiten lang; bei 60 Stücken bleiben je Stück gut 2 Einheiten, auf dem
iPad bei ganzer Karte etwa 2–3 Pixel (geschätzt aus der Kartenbreite von 987 Einheiten,
nicht auf dem Gerät gemessen). Darüber entfallen die Striche je Punkt; es bleibt der
Anteil mit einem Grenzstrich zwischen den Reichen, wie bis v75.

Wie groß die Ringe tatsächlich werden – 60 Bot-Partien mit allen vier Reichen, Ringe nach
jedem Zug von Reich 0 gezählt (Stadt: Verteidigung + Angriffe, Armee: Macht +
Flankierer):

| Ring | Anzahl | Median | 90 % | höchstens | ≤ 24 | ≤ 60 |
|---|---|---|---|---|---|---|
| Stadt | 3616 | 5 | 25 | 141 | 90 % | 99 % |
| Stadt mit Angreifern | 661 | 22 | 52 | 141 | 54 % | 93 % |
| Armee | 2539 | 7 | 16 | 54 | 98 % | 100 % |

Folge: Bei knapp der Hälfte der bedrohten Städte sind es mehr als 24 Stücke. So viele
zählt man nicht mehr auf einen Blick – dort liest man den Anteil, wie vorher. Genau
abzählen lässt sich, was klein ist: Armeen und Städte vor der ersten Belagerung.

**Null Punkte:** Hat ein Ring gar keinen Punkt – praktisch nur die Armee eines Menschen
mit Macht 0 ohne Flankierer; Städte behalten immer mindestens eine Bevölkerung und damit
Verteidigung 1 –, bleibt er leer: nur Innen- und Außenkante in der Farbe des Besitzers.
Bis v75 war er dann voll, als stünde die Armee in voller Stärke.

## KI: ein Gegner nach den Regeln für Menschen (v77)

Auf Wunsch des Autors: ein Gegner, der die Bots ersetzt und dabei nach den Regeln spielt,
die zwischen Menschen gelten. Entscheidungen des Autors vor dem Bau: **KI als dritte
Sitzart neben Mensch und Bot** (Bots bleiben, das Tutorial spielt weiter mit ihnen),
**Stufen durch Abschwächen der KI** statt durch Ressourcen-Handicap, abgestimmt vor allem
auf **1 gegen 1 und 3–4 Reiche auf der Plättchenkarte, mit Ereignissen/Weltwundern**.

### Was „nach den Regeln für Menschen" heißt

Bot ist in der Regelmaschine nur eine Sitzart: rund ein Dutzend Stellen fragen
`kind === 'bot'` ab (Macht = Bevölkerung, keine Fähigkeit, keine Wunderwirkung, immun
gegen Ereignisse …). Die KI hat die Sitzart `'ki'` und fällt damit überall unter die Regeln
für Menschen – ohne Änderung an diesen Stellen. Sie bekommt ihre Zivilisationsfähigkeit
(wählbar im Aufbau wie beim Menschen), zahlt jeden Preis, verliert Macht zu Zugbeginn,
Ereignisse treffen sie, Wunder wirken für sie.

Handeln kann sie nur über die Funktionen, die auch die Oberfläche benutzt (`foundCity`,
`growCity`, `doResearch`, `buyPower`, `moveArmy`, `buildRoad`, `copyTech`, `coverPop`, …).
Schummeln ist damit ausgeschlossen: die Regelmaschine rechnet ihr ab wie einem Menschen.
Die einzige Stelle, an der sie selbst in den Spielstand schreibt, ist ihr eigener
Zufallszustand `p.kiRng`.

**Auslegungen:**
* **Spielende:** Die KI zählt als vollwertiger Spieler (`isHumanPlayer` ist für sie wahr).
  Melden Mensch und KI in derselben Runde an, entscheiden nur die Punkte. Gegen einen Bot
  gilt für sie „Mensch vor Bot" genauso wie für Menschen.
* **Öffentlich** ist, was am Tisch sichtbar wäre: Karte, Städte, Armeen, Macht,
  Technologien und Verfügbarkeiten. Der Technologiebogen zeigt deshalb auch die
  Verfügbarkeiten der KI („könnte sie erforschen"), wie bei Menschen.
* **Nicht verwendet:** künftige Würfe (die KI rechnet auf Kopien mit eigenem Zufallswert),
  das vorgewürfelte Ereignis der nächsten Runde (`S.evNext`, auch nicht mit dem Orakel),
  die verdeckten Startplättchen der anderen. `test.js` prüft alle drei (siehe unten).

### Wie sie entscheidet (`js/ki.js`)

1. **Lage** (`kiContext`): geschätzte Restrunden (daraus ein abgezinster Horizont), für
   jeden Gegner, wohin seine Armeen im nächsten Zug kommen und aus welchen Städten er neue
   schicken könnte (`kiEnemyInfo`, mit den Reichweiten der Regelmaschine).
2. **Bewertung** (`kiValue`) eines Spielstands, alles in einer Einheit („eine Wissenschaft
   Einkommen für eine Runde"): dauerhaftes Einkommen über den Horizont, Bevölkerung, Städte,
   Technologien samt einer lesbaren Tabelle für Wirkungen jenseits der Erträge
   (`kiTechBonus`, z. B. Keramik, Rad, Kartografie), erschlossene Zeitalter, Gefahr für die
   eigenen Städte (`kiRisk`), Aussicht auf Eroberungen (`kiOffense`), Siegansprüche.
   **Übrige Ressourcen zählen nicht** – sie verfallen am Zugende.
3. **Gefahr:** je eigener Stadt und Gegner der kleinste und der größte mögliche Angriff am
   Ende seines nächsten Zuges (größter: neue Armeen und sein ganzes Münzbudget in Macht).
   Liegt die Verteidigung dazwischen, sinkt die Gefahr mit jedem Punkt, steil nahe am
   Höchstwert. Läuft schon eine Belagerung, ist der nächste Treffer die Eroberung; sonst
   zählt, ob man nach einem ersten Treffer genug nachlegen könnte (`kiDefensePotential`).
   Die Hauptstadt ist so viel wert wie das Spiel (`KI_W.game`).
4. **Planen** (`kiPlan`): Kandidaten bilden (Forschung, Wachstum, Gründung, Straßen zur
   Hauptstadt, Wunder, Kopieren, Sklaverei, Kolonialismus, Macht, Angriffs-, Verteidigungs-
   und Flankenpakete), jeden auf einer **Kopie** mit der echten Regelmaschine ausführen, den
   **Kampf am Zugende mitrechnen** (`combatPhase` auf der Kopie) und bewerten. Ausgeführt
   wird die beste Aktion je eingesetzter Ressource; danach wird neu geplant, damit Würfel
   (Verfügbarkeit nach einer Forschung) und neue Preise einfließen. Voneinander unabhängige
   Aktionen werden gebündelt.
5. **Militärpakete:** Angriff (Armeen in Reichweite ziehen, neue bauen, die nötige Macht
   kaufen), Verteidigung (Armeen und bis zu zwei neue an die Stadt), Flankieren (zwei
   Positionen gegenüber bzw. mit Taktik beliebig, auch mit neu gebauten Armeen). Eine Armee,
   die so eine Aufgabe bekommen hat, zieht im selben Zug nicht mehr um.
6. **Aufstellen** (`kiPositionArmies`): übrige Armeen dorthin, wo sie die Städte schützen
   oder einen späteren Angriff vorbereiten; keine bleibt in einer Stadt.
7. **Legen** (`kiPlaceSeat`): jede Lage × erlaubtes Feld nach dem Ertrag im ersten Zug
   (dieselbe Zahl wie die Ertragsübersicht), die besten acht zusätzlich nach Siedelplätzen
   auf der sichtbaren Karte.

### Stufen

`KI_LEVELS` (data.js): Leicht, Mittel (Vorgabe), Schwer. Alle drei spielen nach denselben
Regeln; `KI_PARAMS` (ki.js) regelt Rauschen in der Bewertung, gelegentliche bewusste
Fehlgriffe, wie ernst Gefahr und Angriffschancen genommen werden, und das Budget an
Bewertungen je Zug. „Nochmal spielen" erhöht nach einem Sieg die KI-Stufe.

**Gemessen (v77), noch schwach getrennt:** gepaarte Partien (derselbe Startwert zweimal,
die Stufen tauschen die Plätze): Duell Schwer–Leicht 25 : 15, Mittel–Leicht 22 : 18,
Schwer–Mittel 19 : 21 (je 40 Partien); zu viert 2× Schwer gegen 2× Leicht 17 : 7 (24).
Im Duell überdeckt der Startvorteil fast alles: der Startspieler gewann 31 bzw. 32 von 40.
Die Stufen deutlicher zu trennen ist der nächste Schritt. **(v78: getan – neue Werte und
Messungen im Abschnitt „KI-Stufen deutlich getrennt, kürzere Züge (v78)".)**

### Rechenzeit

Die KI zählt Bewertungen statt Zeit (Budget je Stufe), damit das Ergebnis nicht von der
Geschwindigkeit des Geräts abhängt. Gemessen in Node über die Messreihen unten (v77):
Median 18–34 ms je Zug, 90 % unter 140 ms; der längste Zug 1,5 s (drei Reiche, KI gegen
KI), gegen Bots höchstens 0,6 s. Auf einem iPad ist mit dem Zwei- bis Fünffachen zu
rechnen (Schätzung, nicht gemessen). Ein Zug mit Luftwaffe und
16 Armeen dauerte vorher 27 s; zwei Ursachen, beide behoben: `reachable` sortierte seine
Warteschlange vor jedem Schritt (jetzt Heap, siehe unten), und der Planer bewertete bis zu
53 Schritte mit je rund hundert Kandidaten (jetzt Bündeln und Budget).

### Stärke (Messungen v77, Plättchenkarte, Stufe Schwer)

| Aufstellung | Partien | KI gewinnt |
|---|---|---|
| Duell gegen Bot Prinz, Beginn abwechselnd | 80 | 71 |
| Duell gegen Bot David | 80 | 38 |
| 1 KI gegen 3 Bots Prinz, Platz wandert | 48 | 31 (fairer Anteil 12) |
| 1 KI gegen 3 Bots David | 48 | 9 (fairer Anteil 12) |

Befehle: `node tools_ki.js duell 80 diff=prinz`, `… duell 80 diff=david`,
`… vier 48 diff=prinz`, `… vier 48 diff=david`. **Berichtigung:** Während der Arbeit
genannte Zahlen (37/40, 17/40, 21/24, 8/24) stammten aus einem früheren Stand der KI und
waren nach den letzten Änderungen nicht neu gemessen; schon auf der v74-Grundlage ergab
`vier 24 diff=prinz` zuletzt 16 statt 21. Gegen David ist die KI zu viert also
**schwächer** als ein David-Bot, im Duell etwa gleich stark.

Zum Vergleich ein einfaches Skript nach Menschenregeln (wachsen, billigste Forschung,
siedeln, kein Militär) auf der Originalkarte gegen 3 Bots: 30 von 60 gegen Siedler, 4 von
60 gegen Prinz, 0 von 60 gegen David.

**Schwächen, die bleiben:** Die KI ist so gut wie ihre Bewertung und ein Zug Vorausschau.
Kampf rechnet sie exakt, mehrzügige Pläne (einen Angriff drei Züge vorbereiten, Ketten der
griechischen Rückschau) kaum. Partien KI gegen KI enden früh und meist militärisch (zu
viert Runde 4–7); ob das an der KI liegt oder an den Regeln, ist offen.

### Auf v76 des Autors aufgesetzt

Gebaut wurde die KI auf v74; während der Arbeit entstanden v75 und v76 des Autors. Die
KI-Fassung ist darauf aufgesetzt (v77). Was das inhaltlich verlangte:

* **Flankieren „gegenüber":** v75 hat die Spiegelung am Gegner auf Würfelkoordinaten
  umgestellt (`hexOpposite`, alle drei Achsen). Die KI hatte dieselbe Spiegelung in
  Zeile/Spalte in ihren Flankenplänen – sie schlug also dieselben falschen Paare vor wie die
  Bots bis v74 (auf der Diagonale dieselbe Seite statt gegenüber) und fand die richtigen
  nicht. Weil sie jeden Plan auf einer Kopie samt Kampf nachrechnet, führte sie falsche
  Paare nicht aus – sie ließ die Flanke nur aus. Jetzt fragt `kiFlankPlans` für jedes Paar
  `hexOpposite`, dieselbe Regel wie `canFlank` im Kampf.
* **Kartenansichten und Gründungsmodus:** die neuen Stellen der Oberfläche, die fragen, ob
  gerade ein Bot zieht (`viewerOf`, `redraw`, `toggleFoundMode`, `tapHex`), fragen jetzt
  `isAuto`. Im KI-Zug zeigt die Ertragsansicht also die Sicht des Menschen, der
  Gründungsmodus ist aus und nicht einschaltbar, und das KI-Blatt beendet die Machtringe
  wie das Bot-Blatt (`sheet` ohne `power`).
* **Gründen als eigene Aktion:** nur Oberfläche; `foundCity` und `canFound` antworten wie
  zuvor (der Test des Autors vergleicht das Feld für Feld). Die KI gründet weiter über
  `foundCity`. Ihre eigene Suche nach Siedelplätzen (eine Breitensuche je Zug) ist jetzt
  ebenfalls Feld für Feld an die Regel gebunden: gleiche Plätze, gleiche Kosten wie
  `foundSiteError`/`foundCost`, mit und ohne Kartografie und Navigation.

### Abgesichert

`test.js`, Block „KI": Fähigkeiten, Macht, Ereignisse und Wunder gelten für die KI; neun
volle Partien (2/3/4 Reiche, Plättchen mit Legephase und feste Karte, mit und ohne
Erweiterungen, alle Stufen, gemischt mit Bots) enden regulär, ohne Ausnahme, ohne negative
Ressourcen, ohne Armee in einer Stadt, kein Zug über 2 s; derselbe Startwert ergibt
dieselbe Partie; der Würfelstrom rückt in KI-Zügen genau um die protokollierten Würfe
weiter (die Kopien würfeln mit eigenem Wert); `S.evNext` wird nie gelesen (Feld, das beim
Lesen zählt); die Wahl beim Legen hängt nicht davon ab, wie der Gegner gelegt hat;
Punktvergleich Mensch gegen KI und KI gegen Bot; Flanke über die Diagonale (Partner
Nordwest, die zweite Armee geht nach Südost) und jeder Flankenplan aus drei Partien zu
dritt, auch mit Taktik, steht nach `canFlank`; Siedelplätze der KI = Regel, Feld für Feld.
Gegenprobe: mit der alten Spiegelung in Zeile/Spalte schlagen beide Flankentests an.
`smoke.js`: Aufbau mit drei Sitzarten, KI-Züge über das Blatt mit „Weiter" (dabei Erträge
aus Sicht des Menschen, kein Gründungsmodus), Legephase (nur der Mensch wird gefragt),
Englisch, „Nochmal spielen" mit KI-Stufe.

## Wirtschaftssieg: mehr als 2/3, nicht in Runde 1 (v77)

Beim Bau der KI aufgefallen, zwei Anweisungen des Autors.

**Mehr als 2/3.** Der Code verlangte für den Standard „mindestens 2/3" (`strict: false`),
Theologie und Vereinte Nationen dagegen „mehr als". Laut Autor gilt überall „mehr als" –
so stand es auch schon im Tutorial („mehr als zwei Drittel"). Jetzt `strict: true`; zu
dritt reichen 4 von 6 also nicht mehr.

**Nicht in Runde 1.** Mit einer Handvoll Bevölkerung auf der Welt reichte dem Startspieler
eine Gründung und ein Wachstum: im Duell 4 von 5 (mehr als 3/4), zu dritt 4 von 6 (vor der
ersten Änderung). Der Anspruch blieb gültig, auch wenn die anderen im selben Zug nachzogen.
Gemessen mit der KI, je 30 Partien KI gegen KI auf der Plättchenkarte: im Duell endeten
5 in Runde 1 und 2 in Runde 2, zu dritt 3 in Runde 1, zu viert keine. `checkVictory` meldet
in Runde 1 nichts an, auch nicht bei der Nachprüfung am Rundenende.

**Was bleibt (offener Punkt):** Dasselbe Muster rückt im Duell um eine Runde nach hinten –
nach der Änderung endeten 5 von 30 KI-Duellen in Runde 2 mit einem Wirtschaftssieg, und
der Startspieler gewann 18 von 30 Duellen (gemessen auf v77). Zu dritt endete 1 von 30 so in Runde 2, zu
viert keine.

`test.js`: genau 2/3 reicht nicht, mehr als 2/3 schon; in Runde 1 kein Anspruch, auch nicht
am Rundenende; ab Runde 2 wie gewohnt. Die Tests zum Rundenende laufen jetzt in Runde 2
mit 7 von 10 statt 6 von 9 Bevölkerung.

## reachable: Heap statt Sortieren, Passierbarkeit gemerkt (v77)

Reine Beschleunigung, Ergebnis unverändert. Die Warteschlange der Wegsuche (`hex.js`) wurde
vor jedem Schritt ganz sortiert; jetzt ist sie ein binärer Heap, und `passable` wird je
Feld nur einmal gefragt (es prüft Städte, Armeen und Kontrollzonen und wurde bis zu sechsmal
für dasselbe Feld gerufen). Gemessen an 1188 Aufrufen aus echten Partien: 734 → 360 ms.
`test.js` vergleicht die alte Fassung (wörtlich im Test) mit der neuen an 112 Spielständen
mit Reichweiten bis 20, Straßen und Eisenbahn: keine Abweichung. Nebenwirkung: `test.js`
läuft schneller.

## KI-Stufen deutlich getrennt, kürzere Züge (v78)

Bis v77 lagen die Stufen dicht beieinander (Duell Schwer–Leicht 25 : 15, Schwer–Mittel
19 : 21), und gegen Bots spielten Leicht und Mittel fast wie Schwer (Duell gegen Prinz 68,
70, 71 von 80). Leicht war damit keine Stufe für Einsteiger.

### Was eine Stufe schwächer macht

Weiterhin nur Denkfehler – gleiche Regeln, keine Ressourcen geschenkt oder abgezogen
(Anweisung des Autors). `KI_PARAMS` in `js/ki.js`:

| | Leicht | Mittel | Schwer |
|---|---|---|---|
| `see` – Anteil der Möglichkeiten, die sie je Schritt erwägt | 0,25 | 0,5 | 1 |
| `noise` – Rauschen auf den Nutzen (Faktor 1 ± noise) | 1,0 | 0,5 | 0 |
| `slip` – statt der besten eine der nächsten vier | 0,5 | 0,2 | 0 |
| `defend` – Gewicht der Gefahr für eigene Städte | 0,25 | 0,8 | 1 |
| `strike` – Gewicht einer begonnenen Belagerung | 0,2 | 0,7 | 1 |
| `evals` – Bewertungen je Zug (Tempo) | 600 | 1000 | 1000 |

**Neu ist `see`:** Jede mögliche Aktion wird je Planungsschritt nur mit dieser
Wahrscheinlichkeit überhaupt erwogen, in jedem Schritt neu gezogen – die KI übersieht mal
dies, mal das, wie ein Mensch, der nicht jede Stadt und jede Technologie durchgeht. Taugt
unter dem Gesehenen nichts, schaut sie ein zweites Mal auf den Rest. Ohne diesen zweiten
Blick beendete Leicht Züge mit vollen Taschen; so gibt es aus, was es hat (übrig am Zugende
je nach Runde 1–14 % des Ressourcenwerts, bei Schwer 4–14 % – 20 Duelle Leicht gegen
Schwer gemessen), und wählt nur schlechter.

**Gemessen und verworfen:**
* *Weniger Planungsschritte je Zug* (höchstens 2–4, teils zusammen mit `see`): trennt stark
  (Duell gegen Prinz 27–65 von 80, gegen Schwer gepaart 1–9 von 40), aber Leicht ließ ab
  Runde 4 zwischen gut einem Drittel und zwei Dritteln seiner Ressourcen liegen – sichtbar
  faul, kein Einsteiger spielt so.
* *Kürzerer Horizont* (30 % der Restrunden): praktisch wirkungslos (67 statt 68 von 80
  gegen Prinz).
* *Weniger Angriff und Verteidigung allein* (`strike` 0, `defend` 0,3): im Duell kaum
  Wirkung (66 von 80), zu viert deutlich (ältere Messung, v74-Grundlage: Schwer gegen
  Schwer ohne Angriffe 30 : 10) – deshalb für Leicht mit drin, aber nicht allein.

### Messungen (Plättchenkarte, `tools_ki.js`, reproduzierbar)

KI gegen KI, gepaart (jeder Startwert zweimal, die Stufen tauschen die Plätze), Siege –
gemessen mit dem Endstand von v78, also samt der Abwehr (Abschnitt unten):

| Paarung | Duell (40) | zu dritt (24) | zu viert (24) |
|---|---|---|---|
| Schwer – Mittel | 27 : 13 | | 19 : 5 |
| Mittel – Leicht | 26 : 14 | | 17 : 7 |
| Schwer – Leicht | 32 : 8 | 21 : 3 | 21 : 3 |
| Schwer – Leicht, mit Ereignissen und Wundern | 29 : 11 | | 23 : 1 |

Gegen die Bot-Stufen – Duell (80 Partien, Beginn abwechselnd) / eine KI gegen drei Bots
(48 Partien, fairer Anteil 12):

| KI | Siedler | Häuptling | Prinz | König | David |
|---|---|---|---|---|---|
| Leicht | 80 / 40 | 74 / 26 | 48 / 6 | 26 / 4 | 13 / 0 |
| Mittel | 80 / 42 | 78 / 36 | 69 / 21 | 45 / 7 | 20 / 2 |
| Schwer | – | – | 72 / 32 | 56 / 20 | 34 / 8 |

**Lesart:** Im Duell spielt Leicht etwa wie ein Prinz-Bot (48 von 80), Mittel etwa wie
König (45), Schwer etwa wie David (34). Zu dritt und zu viert trennen die Stufen stärker als
im Duell. (Vor der Abwehr, sonst gleicher Stand: Schwer–Mittel 24 : 16 im Duell, 15 : 9 zu
viert – die Pakete mit Macht helfen den Stufen, die Gefahr ernster nehmen.)

**Im Duell wiegt der Anzug schwer.** Schwer gegen Leicht: beginnt Schwer, gewinnt es 20
von 20; beginnt Leicht, gewinnt Leicht immerhin 8 von 20. Zwischen Schwer und Mittel:
beginnt Mittel, gewinnt Mittel 11 von 20 – der Startvorteil wiegt dort etwa so viel wie der
Abstand der Stufen. Zwischen gleich starken KI gewinnt der Startspieler 60–80 % der Duelle (`selbst 30`: 18 von 30;
Schwer gegen Schwer mit halbem Budget, also gleich stark: 32 von 40). Ob es zwischen
Menschen genauso ist, ist nicht gemessen (Schluss aus den KI-Partien); es gehört zur
Balancefrage „Wirtschaftssieg in Runde 2" (offener Punkt in der Übergabe).

**Einschränkung:** Bots und KI sind keine Menschen. Ob Leicht für Einsteiger passt, zeigt
erst das Spielen; die Stellschrauben stehen in einer Tabelle (`KI_PARAMS`), `tools_ki.js
stufen` misst jede Änderung gepaart nach.

### Kürzere Züge

Der längste gemessene Zug (drei Reiche, KI gegen KI, Luftwaffe und Eisenbahn) dauerte
1,5 s in Node. Jetzt 0,7 s, ohne dass sich eine Partie ändert:
* **Budget Schwer 1000 statt 2000 Bewertungen.** Es greift nur in wenigen Zügen mit
  Luftwaffe; gepaart gemessen (Duell 40, zu dritt 24 mit und ohne Erweiterungen, zu viert
  24): jeweils genau unentschieden, gegen Prinz und David dieselben Siegzahlen wie vorher.
* **Wer eine Stadt angreifen kann,** wird je Stadtfeld einmal je Zug gerechnet
  (`kiHits`) statt in jeder Bewertung.
* **Reichweiten** bleiben über Planungsschritte gemerkt, solange sich nichts ändert, wovon
  sie abhängen (`kiMoveSig`: Armeen, Städte, Straßen, eigene Technologien, Wunder).
* **Nach dem Budget** bildet der Planer Militär-, Wunder- und Sklaverei-Kandidaten gar nicht
  erst, statt sie zu bilden und wegzuwerfen.

Die drei letzten ändern kein Ergebnis: 30 Partien (Schwer, 2/3/4 Reiche, mit und ohne
Erweiterungen) laufen mit alter und neuer Fassung Zeichen für Zeichen gleich, 16 % schneller.
Gemessen über 30 Partien zu dritt: Median 20 ms je Zug, längster 0,72 s; zu viert und im
Duell höchstens 0,3 s. Auf dem iPad ist mit dem Zwei- bis Fünffachen zu rechnen (Schätzung).

### Abgesichert

`test.js`: eine Stufe, die fast nichts sieht (`see` 0,01), wächst trotzdem und zahlt (zweiter
Blick); die Werte sind nach Stufen geordnet; gemerkte Reichweiten gleichen nach jeder Art
Aktion, die die KI ausführt (Forschung, Wachstum, Gründung, Straße, Macht, Angriff,
Verteidigung, Flanke, Kopieren), einer frischen Rechnung – 3436 Vergleiche. Gegenprobe: ohne
Straßen in der Signatur schlägt der Test an.

## Abwehr gegen Vorstöße (v78)

**Anlass:** Rückmeldung des Autors aus Partien auf Schwer zu viert: die KI wehrt einen
menschlichen Rush – überhaupt jeden militärischen Vorstoß – schlecht ab.

### Nachgestellt

Stellungen aus echten Partien: bis Runde 3–5 spielen alle als KI, dann wird ein Platz zum
Menschen. Seine n Armeen stehen einen Zug vor der Hauptstadt der nächsten KI, mit Macht P;
die KI ist am Zug und sieht sie. Der Mensch zieht dann heran und kauft Macht – alles
(„allin") oder gerade genug, um die Verteidigung zu übertreffen („knapp") –, zweimal. Er
sieht dabei, was die KI aufgestellt hat. 187 Stellungen: 2 und 4 Reiche, Runde 3–5, 2–4
Armeen, Macht 2–6. Nachzurechnen mit `node tools_ki.js vorstoss …` (dort entstehen die
Stellungen mit der jeweils geprüften Fassung).

### Was schiefging (bis v77)

1. **Armeen ohne Macht, Macht ohne Armeen.** Gekaufte Macht verteidigt nur über Armeen neben
   der Stadt, und eine Armee daneben verteidigt nur mit Macht. Einzeln bringt keins von
   beiden etwas – der Planer, der Aktion für Aktion bewertet, nahm dann keins oder nur die
   Armeen. Beispiel: Russland baute zwei Armeen (15 Münzen) neben die Hauptstadt, kaufte
   keine Macht, Verteidigung 3; Griechenland traf mit 5.
2. **Den entschlossenen Angreifer unterschätzt.** Sein Budget fehlte Alchemie: wer sie
   verfügbar hat, erforscht sie im Angriffszug und tauscht seine Wissenschaft 1:1 in Münzen
   – gemessen sprang Griechenlands Budget so von 18 auf 51. Und die zweite Welle war mit
   1,3 × der ersten angesetzt; wer zweimal alles in Macht steckt, kommt auf gut das
   Anderthalbfache. Die KI verließ sich deshalb auf eine Antwort nach dem ersten Treffer,
   die es dann nicht gab.
3. Hielt sie die Lage für verloren, baute sie weiter aus, statt wenigstens den Preis des
   Angriffs hochzutreiben.

### Geändert

* **Macht gehört ins Verteidigungspaket** (`kiDefensePlan`): Umzüge und neue Armeen neben
  die Stadt, dazu Macht – „ziel" bis die Verteidigung den stärksten Angriff seines nächsten
  Zuges erreicht, „alles" was die Münzen hergeben, und ist Alchemie zu haben, wahlweise
  zuerst Alchemie (dann zahlt die Wissenschaft mit). Gilt gegen jeden Gegner.
* **Gegen Menschen rechnet die KI mit dem entschlossenen Angreifer** (`kiDetermined`,
  `kiThreatBudget`, `kiAttackWaves`): Budget samt Alchemie, die er diesen Zug erforschen
  kann, und die zweite Welle aus dem, was ihm von der ersten nach dem Machtverlust bleibt,
  plus einem neuen Budget und wahlweise einer Armee mehr. Gewichtet zu drei Vierteln; zu
  einem Viertel gilt die mildere Schätzung – ganz sicher wirft auch ein Mensch nicht alles
  hinein, und ohne diesen Anteil hielt die KI eine Lage, die sie nicht ganz halten kann,
  für verloren und baute weiter aus (Punkt 3). Gegen KI und Bots bleibt es bei der
  milderen Schätzung von v77.

**Auslegung:** Die KI behandelt Menschen damit anders als KI-Gegner – nicht mit anderen
Regeln, sondern mit einer anderen Erwartung, was der Gegner tun wird. Sie sieht dafür
nichts, was ein Mensch am Tisch nicht auch sähe.

### Gemessen

| | bis v77 | v78 |
|---|---|---|
| Stellungen, in denen die Hauptstadt fällt (allin, 187) | 32 | 20 |
| dasselbe, Angreifer kauft knapp (187) | 23 | 18 |
| darunter früher Vorstoß zu viert, Runde 3, 2 Armeen (39, allin) | 7 | 3 |

Beide Fassungen spielten dieselben Stellungen (erzeugt mit dem Stand vor der Änderung).
Gegen die KI ändert sich nichts Messbares: beide Fassungen in denselben Partien, die Plätze
gepaart getauscht – Duell 29 : 31, zu dritt 22 : 26, zu viert 25 : 23 (156 Partien,
76 : 80); Hauptstadt verloren zu dritt und zu viert gleich oft, im Duell 10 gegen 5 von 60
(bei so wenigen Fällen nicht von Zufall zu unterscheiden). Und die Vorsicht gegen Menschen
macht die KI nicht ausnutzbar: ein „Mensch", der in Wahrheit mit der KI Schwer spielt,
gewann zu viert gegen die alte wie die neue Fassung je 7 von 40 Partien.

Mit dem Werkzeug (Stellungen aus Partien der geprüften Fassung selbst):

| `node tools_ki.js vorstoss 40 …` | Stellungen | erster Treffer | Hauptstadt fällt |
|---|---|---|---|
| `reiche=4 runde=3 armeen=2 macht=2` | 39 | 20 | 3 |
| `reiche=4 runde=4 armeen=3 macht=4` | 34 | 12 | 4 |
| `… art=knapp` | 34 | 12 | 2 |
| `reiche=2 runde=4 armeen=3 macht=4` | 32 | 15 | 0 |

**Verworfen:**
* *Harte Schätzung gegen alle:* zu viert gegen die alte Fassung 17 : 31 – die KI gab Städte
  zu früh verloren und verteidigte, wo niemand angriff. Auch nur ab laufender Belagerung
  hart zu rechnen, änderte gegen die KI kein Ergebnis (Duell und zu viert, 108 Partien,
  dieselben Zahlen) – deshalb weggelassen.
* *Nur die harte Schätzung gegen Menschen*, ohne das Viertel der milden: 21 statt 20 bzw.
  19 statt 18 gefallene Hauptstädte – knapp, aber in beiden Reihen schlechter, und der
  Grund (Punkt 3) spricht dafür.
* *Alles andere nur zählen, wenn die Hauptstadt steht* (Wirtschaft × Wahrscheinlichkeit,
  dass sie hält): gegen den Menschen kaum besser (21 statt 20 gefallene Hauptstädte),
  gegen die KI im Duell 25 : 35 – vermutlich, weil auch eigene Angriffe nur noch mit dieser
  Wahrscheinlichkeit zählten.

### Was bleibt

In gut jeder zehnten Stellung fällt die Hauptstadt weiter. Die angesehenen Fälle waren
wirtschaftlich verloren: der Angreifer bringt je Zug das Doppelte an Münzen auf (etwa 104
gegen 56), oder schon seine Armeen ohne einen Kauf übertreffen alles, was die KI aufstellen
kann. Dagegen hilft nur, früher vorzusorgen (Stadtmauern, Armeen an der Hauptstadt, bevor
jemand kommt) oder ein Gegenangriff; beides plant die KI nicht gezielt. Und das Skript ist
kein Mensch – ob sich die KI jetzt besser wehrt, zeigt erst das Spielen.

### Abgesichert

`test.js`: zwei Armeen eines Menschen einen Zug vor der Hauptstadt, keine Stadtmauern – nach
ihrem Zug hält die KI jedem Angriff seines nächsten Zuges stand, mit Armeen neben der Stadt
und Macht dazu; gegen Menschen rechnet sie entschlossen, gegen eine KI mild (auch bei
laufender Belagerung); das Budget mit Alchemie ist das gewöhnliche plus die Wissenschaft
nach den Kosten der Alchemie, ohne verfügbare Alchemie das gewöhnliche; die zwei Wellen
nachgerechnet (7 und 14 mit vollem Budget, 20 und 10 ohne).

## Abwehr: vorher leicht, im Ernstfall alles · Wissenschaft für die Forschung · kein Knopf „Armeen" (v79)

**Anlass:** Rückmeldung des Autors zu v78 (Schwer, vier Reiche): Die KI steckt viel zu viel in
Vorsorge, solange noch keine Belagerung läuft, und viel zu wenig, wenn sie läuft. Im Ernstfall
soll sie Verteidigungstechnologien erforschen, die Angreifer flankieren, eigene Armeen neben
die Stadt stellen. Außerdem forsche sie viel zu langsam. Und der Knopf „Armeen" unten soll
ganz weg.

### Knopf „Armeen" entfernt

Knopf (`index.html`), `armySheet` (`js/ui.js`), sein Platz in der Tutorial-Leiste, sieben nur
dort benutzte Übersetzungen und die Zeile im README. Armeen wählt man auf der Karte: eigene
Armee antippen → „Diese Armee bewegen", in einer Stadt „Armee hier bewegen". `smoke.js` prüft,
dass Knopf und Funktion fehlen, keine Leistenbeschriftung mehr „Armee" enthält und das Antippen
weiter zum Bewegen führt.

### Was schiefging (v78)

1. **Vorsorge mit der harten Schätzung.** Gegen Menschen rechnete die KI schon vor dem ersten
   Treffer mit dem entschlossenen Angreifer und kaufte Macht – die zu Beginn ihres nächsten
   Zuges zur Hälfte verfällt –, auch wenn sie nach einem Treffer noch hätte nachlegen können.
2. **Im Ernstfall verzagt.** Die Gefahr folgte einer steilen Kurve: reichte die mögliche
   Verteidigung nicht ganz an den stärksten Angriff, brachte jeder Punkt fast nichts.
3. **Plätze an der Stadt nicht gesehen.** Jede Armee, die irgendein Feld an der Stadt
   erreicht, zählte als Angreifer – auch die fünfte bei vier freien Nachbarfeldern. Dass eigene
   Armeen rund um die Stadt Plätze wegnehmen, sah die KI nicht. Nachgestellt hielt v78 manche
   Hauptstadt nur, weil sie zufällig ein Nachbarfeld besetzt hatte und der Mensch deshalb mit
   einer Armee weniger kam (zwei Treffer mit 20 Macht: eine Armee 20 gegen Verteidigung 21,
   zwei wären 40 gewesen).
4. **Verteidigungstechnologien liegen gelassen.** Deckte gekaufte Macht den nächsten Angriff,
   war Maschinengewehr in der Bewertung nichts mehr wert – es wirkt aber auch in den Zügen
   danach. Nachgestellt blieb in v78 in 9 von 16 Ernstfällen mit bezahlbarer
   Verteidigungstechnologie diese liegen, mit der linearen Gefahr allein (unten) sogar in 13
   von 18.
5. **Wissenschaft in Münzen.** Mit Alchemie bezahlte der Planer Wachstum, Macht und Armeen mit
   Wissenschaft (1:1), wo eine Technologie kaum schlechter gewesen wäre.

### Geändert (`js/ki.js`)

* **Vorher mild, für alle** (`kiRisk`): vor dem ersten Treffer gilt auch gegen Menschen die
  milde Schätzung von v77. Kann die KI nach einem Treffer genug nachlegen, bleibt eine
  Rest-Gefahr von 2 % (`KI_W.preFloor`, bis v78 5 %). Was sie nachlegen kann
  (`kiDefensePotential`), zählt nur so viele eigene Armeen, wie neben der Stadt Platz haben,
  wenn seine Angreifer dort stehen (`kiRingRoom`).
* **Im Ernstfall alles** – eine eigene Stadt hat den Belagerungszähler 1 (`K.emergency`): gegen
  Menschen die harte Schätzung, und die Gefahr sinkt linear zwischen dem, was ohnehin kommt
  (seine Armeen mit der Macht nach dem Machtverlust), und allem, was er aufbringen kann
  (`kiSiegeChance`). Jeder Punkt Verteidigung und jede weggeflankte Armee zählt. Pakete mit
  Alchemie (Wissenschaft in Macht) gibt es nur noch hier, und Wissenschaft darf alles bezahlen.
* **Plätze an der Stadt** (`kiAttackSlots`): größte Paarung Angreifer ↔ freies Feld in
  Reichweite. Seine Reichweiten werden dafür ohne die Armeen der KI gerechnet – die ziehen ja
  noch; welche Felder sie am Ende besetzt, zählt die Bewertung. Verteidigungspakete stellen
  Armeen zuerst auf Felder, die er erreichen könnte.
* **Verteidigung, die bleibt** (`kiDefPerm`): im Ernstfall je bleibendem Punkt an der
  belagerten Stadt 8 dazu (`KI_W.defPerm`): Stadtmauern 5 Punkte, Maschinengewehr 2 je
  Bevölkerung, Burgenbau die Macht (mindestens 2).
* **Wissenschaft gehört der Forschung** (`KI_W.sciReserve` = 3): außerhalb des Ernstfalls
  zählt Wissenschaft, die nicht in Forschung oder Kopieren geht, dreifach – erst wird
  geforscht, was sich lohnt.

### Gemessen

**Nachgestellte Vorstöße, gepaart** – beide Fassungen spielen dieselben 399 Stellungen (195
aus Partien des Stands vor der Abwehr von v78, 204 aus Partien von v79; 2 und 4 Reiche, Runde
3–6, 2–4 Armeen mit Macht 2–8, einen Zug vor der Hauptstadt). Der Mensch zieht heran und kauft alles („allin") oder
gerade genug („knapp"), zweimal; bei „Drohung" bleibt er drei Züge einen Zug vor der Stadt,
hält seine Macht und greift nie an.

| | v78 | v79 |
|---|---|---|
| Hauptstadt fällt (allin / knapp) | 43 / 40 | 41 / 42 |
| erster Treffer | 184 | 157 |
| Macht und Armeen je Zug **vor** dem ersten Treffer (Münzen) | 29,2 | 24,2 |
| … davon Macht | 16,3 | 10,6 |
| … **nach** dem ersten Treffer (allin / knapp) | 40,2 / 41,5 | 46,4 / 48,7 |
| Verteidigungstechnologien im Ernstfall (allin) | 19 in 131 Zügen | 29 in 120 Zügen |
| eigene Armeen in Reichweite der belagerten Stadt | 1,67 | 1,79 |
| Technologien der KI in den zwei Zügen (allin) | +7,5 | +8,3 |
| Drohung: Macht und Armeen je Zug (davon Macht) | 33,0 (18,4) | 29,2 (13,7) |
| Drohung: Technologien in drei Zügen | +10,8 | +11,9 |

Mit dem Werkzeug (`node tools_ki.js vorstoss 40 …`, Stellungen aus den eigenen Partien der
jeweiligen Fassung, also nicht dieselben):

| | erster Treffer / fällt v78 | v79 | Macht+Armeen vorher → nachher v78 | v79 |
|---|---|---|---|---|
| `reiche=4 runde=3 armeen=2 macht=2` | 20 / 3 (39) | 18 / 3 (39) | 16,9 → 26,3 | 13,9 → 30,8 |
| `reiche=4 runde=4 armeen=3 macht=4` | 12 / 4 (34) | 14 / 5 (36) | 25,2 → 35,9 | 21,8 → 51,1 |
| `… art=knapp` | 12 / 2 (34) | 14 / 4 (36) | 25,2 → 45,1 | 21,8 → 53,8 |
| `reiche=2 runde=4 armeen=3 macht=4` | 15 / 0 (32) | 13 / 2 (31) | 38,4 → 47,3 | 25,1 → 54,9 |
| `… art=droh` (drei Züge) | 0 / 0 (34) | 0 / 0 (36) | 27,8 | 26,8 |

**Lesart:** Vorher gibt die KI ein Sechstel weniger aus (ein Drittel weniger Macht), nachher ein
Sechstel mehr, und im Ernstfall erforscht sie die Verteidigung. Die Hauptstadt hält sie damit
**so oft wie v78, nicht öfter**: gepaart 41 statt 43 bzw. 42 statt 40 von 399. Mit dem
Werkzeug fielen 14 statt 9 von gut 140 – andere Stellungen je Fassung, bei so wenigen Fällen
nicht von Zufall zu trennen (die gepaarten Reihen sind dafür die bessere Messung). Die
angesehenen gefallenen Hauptstädte waren wie in v78 meist wirtschaftlich verloren oder knapp
(Angriff 54 gegen Verteidigung 40 bei 3 Angreifern an einer Stadt mit 6 Nachbarfeldern).

**Gegen die KI ändert sich nichts Messbares:** beide Fassungen in denselben Partien, Plätze
gepaart getauscht – Duell 30 : 30 (60 Partien), zu dritt 23 : 25 (48), zu viert 23 : 25 (48).
Ein „Mensch", der in Wahrheit mit der KI Schwer spielt, gewinnt zu viert 12 von 40 (fairer
Anteil 10, v78: 7) – v79 begegnet Menschen vor dem ersten Treffer wie der KI.

**Forschung:** Gepaart nach Startwerten (16 Partien zu viert mit einem „Mensch"-Platz,
Technologien je Platz am Rundenende): Runde 3 +5 %, Runde 4 +9 %, Runde 5 +12 % gegenüber v78.
In den ersten vier Runden ging die Wissenschaft schon in v78 zu rund 90 % in die Forschung;
das Tempo hängt dort am Einkommen, nicht an der Verteilung. Verloren ging sie später und
unter Druck – mit Alchemie in Macht. Die Reserve wirkt genau dort: in einer Partie zu viert
(Startwert 300) flossen in den Zügen mit Alchemie 127 statt 105 Wissenschaft in die Forschung.

**Stufen** (Endstand v79, gepaart wie in v78): Schwer–Mittel 27 : 13 (Duell, 40) und 17 : 7 (zu
viert, 24), Mittel–Leicht 26 : 14 und 20 : 4, Schwer–Leicht 30 : 10. Gegen Bots im Duell (80):
Leicht 55 gegen Prinz (v78: 48), Mittel 48 gegen König (45), Schwer 39 gegen David (34) und
73 gegen Prinz (72); eine KI Schwer gegen drei David 8 von 48 (8). Die Abwehr hilft allen
Stufen gegen Bots; Leicht liegt damit zwischen Prinz und König.

**Verworfen:**
* *Harte Schätzung der zweiten Welle gegen Menschen schon vorher* (nur sie, der erste Treffer
  mild): mehr Vorsorge und mehr gefallene Hauptstädte (20 statt 16 bzw. 29 statt 25).
* *Rest-Gefahr ohne Sprung* (die Kurve auch, wenn die Antwort reicht): gleich viele gefallene
  Hauptstädte, etwas mehr Vorsorge.
* *Armeen bewerten, die er wegflankieren kann* (halber Preis einer neuen): gegen die KI
  gleich stark (30 : 30, 24 : 24), bei bloßer Drohung 14 % weniger verlorene Armeen – aber die
  KI kaufte dann vorab Macht, um sie zu schützen, also genau die Vorsorge, die weg sollte.
* *Mehr Wert je Technologie* (`KI_W.tech` 2,5, Reserve 4) oder je Wissenschaft im Einkommen
  (1,25): kaum mehr Technologien (Runde 4 +1 %), gegen die KI gleich stark (25 : 23).

### Was bleibt

* Eigene Armeen neben der Stadt halten Angreifer fern, sind aber ohne Macht leicht zu
  flankieren: bei bloßer Drohung verlor die KI in 399 Stellungen 86 Armeen (v78: 27; das
  Skript flankiert nur nebenbei, ein Mensch gezielt).
* Ob die KI sich gegen einen Menschen jetzt richtig verhält, zeigt erst das Spielen – das
  Skript ist kein Mensch (Ablenkung, Ziel wechseln, gezieltes Flankieren).

### Abgesichert

`test.js`: vier Armeen kommen an eine Stadt mit sechs freien Nachbarfeldern; vier eigene
Nachbarn lassen zwei Plätze, sechs keinen, und der größte Angriff halbiert sich bzw. fällt
weg; eine Armee, die schon an der Stadt steht, behält ihren Platz. Ernstfall heißt laufende
Belagerung; im Ernstfall hält die Hauptstadt jedem Angriff des nächsten Zuges stand, mit
Armeen daneben und Macht; vorher steckt die KI in dieselbe Lage weniger hinein (25 gegen 40
Münzen), die Rest-Gefahr ist höchstens 2 %. Im Ernstfall zählen Mauern +5 und Maschinengewehr
+2 je Bevölkerung extra, und die belagerte KI erforscht verfügbare Stadtmauern. Mit Reserve
fließt mehr Wissenschaft in die Forschung als ohne (Partie zu viert, Züge mit Alchemie). Der
Test von v78 (kleines Reich, zwei Armeen eines Menschen vor der Hauptstadt: sie sorgt vor,
weil sie nach einem Treffer nicht nachlegen könnte) gilt weiter. `smoke.js`: der Knopf
„Armeen" fehlt, Armeen wählt man auf der Karte.

## Gesperrter Bildschirm nach KI-Zügen · Eisenbahn durch Kontrollzonen (v80)

### Gesperrter Bildschirm (gemeldet)

**Meldung:** Nach den Zügen der KI blieb der Bildschirm gesperrt. Weiter ging es nur von Hand
in der Konsole: Sperre aufheben (`ui.botLock`, Klasse `locked`), Blatt schließen, neu
zeichnen, `humanTurnStart()`. Der Mensch war also schon am Zug, das Blatt eines KI-Zugs aber
noch gesperrt – „Weiter" ohne Wirkung, das Blatt nicht zu schließen.

**Nicht nachgestellt.** Gesucht über die echte Oberfläche in jsdom: 60 Partien Zug um Zug
(Mensch spielt über die Regelmaschine, drei KI, mit und ohne Erweiterungen) und gut 100 mit
zufälligem Tippen (Felder, Armeen, alle Blätter, Macht, Forschung, Gründen, Nahrung, auch
während die KI-Meldung offen ist) – kein Hänger, keine Ausnahme. In den Zustand führen nur
zwei Wege: „Zug beenden", während das KI-Blatt offen ist (die Leiste ist dann gesperrt –
denkbar nur über eine Eingabe, die das Gerät noch zustellt), oder ein Fehler mitten im
Zugwechsel. Gegen beides und gegen einen unbekannten Dritten:

* **„Zug beenden" wirkt nur im eigenen Zug** und nie bei offenem KI-Blatt. Sonst liefe der
  Kampf der KI ein zweites Mal, und der Zug spränge an ihrem „Weiter" vorbei.
* **Der Zug eines Menschen beginnt immer ohne Sperre** (`humanTurnStart` hebt eine übrig
  gebliebene auf) – genau der gemeldete Zustand löst sich damit selbst.
* **Ein Fehler hält das Spiel nicht mehr an** (`sicher`): in Zug der KI oder eines Bots,
  im Kampf, im Zugwechsel und zu Zugbeginn wird er abgefangen, steht im Protokoll
  („Interner Fehler (…): … – das Spiel läuft weiter. Bitte melden.") und in der Konsole,
  und es geht weiter. `smoke.js` zählt solche Fehler (`UI_ERRORS`) als Fehler.
* **Dieselbe KI zieht nie zweimal in einer Runde** (`S.autoPlayed`). Gefunden beim Suchen:
  gespeichert wird nach ihrem Zug, „Weiter" kommt erst danach. Wurde die App dazwischen neu
  geladen, zog sie noch einmal – samt zweitem Kampf, der eine Belagerung um einen Zähler
  weiterbringen kann. Jetzt zeigt das Blatt nur wieder, was sie getan hat.
* **Ein verspätetes zweites „Weiter"** überspringt keinen Menschen.

Kommt es wieder vor, steht der Grund jetzt im Protokoll (☰ → „Protokoll" bzw. die Leiste).

### Eisenbahn durch die Kontrollzone (gemeldet)

**Meldung:** Mit mehrfachem Antippen derselben Armee kam man auf der Eisenbahn durch eine
Kontrollzone. Erwartet: wer eine Kontrollzone betritt, dessen Bewegung endet ganz, und eine
von einer Kontrollzone unterbrochene Bahn ist nicht befahrbar.

**Ursache:** zweierlei. Eine Kontrollzone beendete nur den Weg, nicht die übrige Bewegung –
und das Startfeld einer Armee ist von der Kontrollzone ausgenommen (wer seinen Zug darin
beginnt, darf heraus). Noch einmal angetippt, zog die Armee also mit der übrigen Bewegung
weiter. Und auf der Eisenbahn kostet ein Schritt nichts, also ging das auch mit 0 Bewegung,
beliebig oft.

**Jetzt** (`arriveAt` in engine.js, für Menschen, Bots und KI dieselbe Stelle): wer ein Feld
in einer Kontrollzone betritt, hält für den Rest des Zuges an – Bewegung 0 und angehalten
(`army.halted`), also auch keine kostenlosen Schritte auf der Eisenbahn mehr. Im nächsten
eigenen Zug darf die Armee wieder heraus. Unverändert: eine Bahn, die durch eine
Kontrollzone führt, endet für den Weg am ersten Feld der Zone; wer in der Zone beginnt,
darf heraus, aber nicht durch das nächste Zonenfeld hindurch. Das entspricht dem, was hier
schon unter 1 stand („halten an, sobald sie … betreten") und was Punkt 8 der offenen Punkte
in der Übergabe beschreibt – nur hielt die Armee bisher nicht wirklich an.

Auf dem Bildschirm: hält eine Armee an, meldet das eine Einblendung („Kontrollzone – die
Armee hält für diesen Zug an."), und im Blatt der Armee steht am gesperrten Knopf „Diese
Armee bewegen" der Grund („Kontrollzone – hält bis zum nächsten Zug"). Bisher stand das nur
im Protokoll, und ein gesperrter Knopf ohne Grund sähe nach dem nächsten Fehler aus.
Nebenbei übersetzt: „Bewegung 3" im Armeeblatt und zwei Meldungen beim Straßenbau („Nur in
eigenem oder neutralem Gebiet.", „Schon vorhanden.") blieben auf Englisch deutsch.

**Am Rand bemerkt:** Ohne Kontrollzone ließe die Regelmaschine eine Armee mit 0 Bewegung
weiter Eisenbahn fahren (jeder Schritt kostet 0). Genutzt wird das nirgends: das Feldblatt
bietet „Diese Armee bewegen" erst ab Bewegung über 0 an, Bots ziehen jede Armee einmal, die
KI überspringt Armeen ohne Bewegung. Deshalb nicht angefasst.

**Ebenfalls bemerkt, nicht geändert:** Für ihre eigenen Angriffs- und Abwehrzüge sortiert die
KI Armeen vorab nach Luftlinie aus – Bewegung + Reichweite + 4, sobald es irgendwo Straßen
gibt. Über eine lange Eisenbahn käme eine Armee weiter; solche Züge sieht die KI also nicht.
Die Bedrohung durch FREMDE Armeen rechnet sie dagegen mit der echten Wegsuche (Eisenbahn und
Kontrollzonen inklusive). Gemessen ist der Verlust nicht.

### Abgesichert

`test.js`: Eisenbahn quer über die Karte, eine Wache mit Schießpulver daneben – die Bahn
endet für den Weg am ersten Zonenfeld; in die Zone hinein darf die Armee, danach ist ihre
Bewegung zu Ende (auch auf der Bahn), ein zweites Antippen bringt sie nicht weiter, das
Protokoll sagt warum; im nächsten eigenen Zug darf sie heraus; ohne Schießpulver keine Zone;
wer in der Zone beginnt, darf heraus, aber nicht über die Bahn durch das nächste Zonenfeld,
und wer sie verlässt, behält seine Bewegung. `smoke.js`: „Zug beenden" wirkt nicht bei
offenem KI-Blatt; ein übrig gebliebenes gesperrtes KI-Blatt ist weg, sobald der Mensch am
Zug ist; nach einem Neuladen mitten im KI-Blatt zieht die KI nicht noch einmal; ein Fehler im
KI-Zug steht im Blatt, und das Spiel geht weiter; eine Armee, die über die Oberfläche in eine
Kontrollzone zieht, hält an, die Einblendung sagt es, und ihr Blatt nennt den Grund. Nach
allen Änderungen noch einmal 40 Partien mit zufälligem Tippen über die echte Oberfläche –
ohne Hänger und ohne abgefangenen Fehler.

## Regelbogen: Bewegung, Straßen, Eisenbahn, Kontrollzone (v81)

Auf Wunsch des Autors stehen diese Regeln jetzt im Regelbogen („Regeln & Technologien"),
nach dem Absatz zur Nahrung, in zwei Abschnitten: „Bewegung, Straßen und Eisenbahn" (darin
der bisherige Absatz zu den Handelsrouten, um einen Satz ergänzt) und „Kontrollzone
(Schießpulver)". Der Wortlaut wurde dem Autor vorher vorgelegt und unverändert freigegeben
(deutsch und englisch). Er beschreibt die Regeln, wie die Regelmaschine sie umsetzt – auch
zwei Auslegungen, die der Autor dabei ausdrücklich bestätigen sollte: **Straßen und
Eisenbahnen gehören niemandem** (auch gegnerische Armeen fahren darauf, `S.roads` kennt
keinen Besitzer) und **Kontrollzonen unterbrechen keine Handelsrouten** (`tradeRoutes`
sperrt nur an fremden Städten).

Die Kurztexte der drei Technologien (Rad „Straßen", Eisenbahn „Eisenbahn", Schießpulver
„Kontrollzone") bleiben, wie sie sind – derselbe Text steht auf den Karten im Forschungsblatt.

**Abgesichert:** `test.js` prüft jede Aussage des Textes an der Regelmaschine (Bewegungspunkte,
Armee muss aus der Stadt, Preise und Gebiet beim Bau, Eisenbahn ohne Rad, Kosten je Schritt,
Stadtfelder, fremde Armeen auf der eigenen Bahn, Handelsroute durch fremdes Gebiet und durch
eine Kontrollzone, fremde Stadt unterbricht, Reichweite der Zone mit Raketentechnik,
Burgstädte nur mit Schießpulver, eigene Zone, Luftwaffe). `smoke.js` öffnet den Bogen auf
Deutsch und Englisch: beide Abschnitte an ihrem Platz, die Handelsrouten genau einmal, auf
Englisch kein Satz ohne Übersetzung.

## Kosten am Knopf: was tatsächlich abgeht · ein Techtree (v82)

**Anweisung des Autors (5.10.):** Kosten so anzeigen, wie sie tatsächlich anfallen – Gründen
für 10 Nahrung mit nur 8 Nahrung im Vorrat zeigt 8 Nahrung und 4 Münzen. Das ist die neue
Vorgabe; die alte Anzeige bleibt als Häkchen in den Einstellungen. Außerdem: der
alternative Techtree wird der Standard, der alte und das Häkchen im Aufbau fallen weg – nur
das Tutorial behält den alten, bis der Autor ein besseres Übungsspiel liefert.

### Kosten am Knopf

* **Gerechnet von der Regelmaschine:** `costPaid(S, pi, Preis, opts)` (engine.js) bezahlt auf
  Probe mit `payAll` und stellt alles wieder her – dieselbe Rechnung wie beim echten
  Bezahlen, mit allen Kursen (Gilden, England, Alchemie, Computertechnik, Hungersnot,
  Bürgerkrieg über `payOpts`). Die Oberfläche (`costText` in ui.js) formatiert nur: erst die
  Arten des Preises, dann was einspringt – „8🌾 4🪙", „1🔬 4🪙", „1🌾 5🪙".
* **Wo:** Gründungsblatt, Wachsen, Armee, Macht, Weltwunder (Stadt- und Wunderblatt),
  Straße/Eisenbahn, Feld kaufen, Kopieren und die Kacheln im Technologiebogen.
* **Wann der Preis stehen bleibt (Auslegung):** wenn nichts umgetauscht wird (dann sind
  beide gleich – auch die Zahl ohne Zeichen im Bogen bleibt), wenn es gar nicht reicht
  (dann ginge nichts ab; der Preis sagt, was fehlt), im Bogen auf Kacheln, die man gerade
  nicht erforschen kann (dort wäre die Rechnung hypothetisch), und **auf der Karte im
  Gründungsmodus** – sie dient dem Vergleich der Plätze, und mit wenig Nahrung stünde sonst
  auf fast jedem Platz dieselbe Nahrungszahl. Erst probiert: Plätze, die teils in Münzen
  bezahlt würden, mit einem Ring in Münzfarbe – in der Sichtprobe war das bei wenig Nahrung
  fast jeder Platz, und die Kostenkreise verschwammen mit den Münzchips der Erträge.
  Verworfen.
* **Einstellung „Kosten ohne Umtausch anzeigen"** (Einstellungen im Hauptmenü, ab Werk aus,
  `hochciv.prefs`): überall wieder genau der Text bis v81.
* **Tutorial:** Die Aufgaben sind so gebaut, dass der Vorrat genau reicht – an den Knöpfen,
  die das Tutorial verlangt, steht deshalb der Preis wie im Text (geprüft: der ganze
  Durchlauf über die Oberfläche mitgeschrieben, keine Abweichung an einem Zielknopf). Andere
  Kacheln im Bogen zeigen, was sie mit Münzen kosten würden, wie im Spiel.

### Ein Techtree

* Die Kosten des früheren alternativen Techtrees (v70/v74) stehen jetzt direkt in `TECHS`:
  Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 · Bewässerung 1, Landwirtschaft 5 ·
  Chemie 11, Biologie 12, Wissenschaftliche Methode 15. Die Liste behält ihre alte
  Reihenfolge – wo Code sie der Reihe nach durchgeht, ändert sich so nichts.
* Der alte Techtree heißt `OLD_TECH_COSTS`, eine Partie trägt ihn als `S.oldTree`.
  `newGame` setzt den Schalter immer (auch `false`); nur das Tutorial setzt ihn auf `true`.
* **Spielstände von vor v82** (Auslegung): eine laufende Partie behält ihren Techtree –
  mitten im Spiel Kosten und Leitern zu tauschen, wäre unfair. `migrateState` übersetzt beim
  Fortsetzen und beim Laden einer Datei: `altTree: true` → heutiger Standard, `false` oder
  fehlend (vor v70) → alter Techtree. In solchen Partien nennen Weltblatt und Regelbogen den
  alten Techtree; im Tutorial nicht (für Neulinge nur verwirrend).
* „Nochmal spielen" startet immer im heutigen Techtree, auch nach einer alten Partie oder mit
  einem Rezept, das noch `altTree` trägt.
* Weg: Häkchen und Hinweis im Aufbau, `altTreeRow`, der Zusatz im Protokollkopf, vier
  Übersetzungen.

### Gemessen: die KI im neuen Techtree

Die KI rechnet mit den Kosten der Regelmaschine, an ihr ist nichts geändert. Gegenprobe mit
`tools_ki.js` (neu: Schalter `alterbaum`), gleiche Startwerte, beide Techtrees: Duell KI
Schwer gegen David 28 bzw. 27 von 60 (heute bzw. alt), eine KI Schwer gegen drei David 11
bzw. 12 von 90. Kein messbarer Unterschied.

### Was sich in den Tests verschoben hat

* Das Beispiel aus dem Regelheft (Griechenland: Schrift kostet 0, Biologie mit
  Wissenschaftlicher Methode 6) rechnet mit den alten Kosten – es läuft jetzt im alten
  Techtree. Die Abzüge auf die heutigen Kosten prüft der Block „Techtree".
* KI, „Wissenschaft gehört der Forschung" (v79): Startwert 303 statt 300. Im heutigen
  Techtree kommt die KI mit 300 nur zweimal mit Alchemie an die gemessene Stelle, beide Male
  ohne Unterschied; mit 303 sechsmal (225 statt 188 Wissenschaft in die Forschung). Über die
  Startwerte 300–307 zusammen: 393 statt 356 (heute), 1140 statt 928 (alter Techtree).
* KI-Zeittest: Grenze 3 s statt 2 s. Der Testrechner ist seit dieser Sitzung langsamer
  (dieselben Partien im alten Techtree: längster Zug 0,97 s statt 0,54–0,65 s), und im
  heutigen Techtree läuft eine dieser Partien bis Runde 10 mit 24 Städten und 22 Armeen –
  längster Zug dort 1,7–2,7 s (Übergabe, offener Punkt 23).

### Abgesichert

`test.js`: die neun Kosten in `TECHS` und in `OLD_TECH_COSTS`, Leitern beider Techtrees,
alle übrigen Leitern gleich, keine Zeitaltergrenze überschritten, Kosten mit Griechenland und
Wissenschaftlicher Methode, Forschen mit 3 bzw. 4 Wissenschaft, Kopierpreise (Spionage,
Kundschafterei), Kolonialismus in beiden, Vorabwurf im Plättchenmodus, `migrateState` für
Spielstände vor v70, aus v70–v81 (beide Schalterstellungen) und aus v82, das Tutorial im
alten Techtree, je zehn Bot-Partien in beiden. `smoke.js`: keine Zeile mehr im Aufbau, Bogen
und Regelbogen im heutigen Techtree, kein Hinweis auf einen anderen, „Nochmal spielen" auch
aus alten Rezepten, Legephase, eine Partie aus v81 läuft im alten weiter (Bogen, Regelbogen,
Weltblatt, auch englisch), das Tutorial im alten ohne Hinweis. Kosten: das Beispiel des
Autors und weitere Fälle über `costText`, die Vorschau bezahlt nichts und stimmt mit dem
Bezahlen überein, Gründungsblatt, Karte (Preis), Bogen (nur erforschbare Kacheln), Stadtblatt,
die Einstellung (ab Werk aus, gemerkt, englisch). Sichtprobe in Chromium: Gründungsblatt,
Bogen, Stadtblatt, Einstellungen.


## Kriegerkultur mit Burgenbau · Wirtschaftssieg zu Rundenbeginn · Marathon (v83)

**Anweisung des Autors (9.10.):**
1. Die Kriegerkultur der Wikinger soll mit Burgen wirken: nach Burgenbau bringt jede Stadt
   Macht.
2. Der Wirtschaftssieg wird gegen die Bevölkerung zu Beginn der Runde gezählt, nicht während
   des Zuges – in einer Runde ist die Weltbevölkerung im Nenner für alle Reiche dieselbe.
3. Ein Spielmodus **Marathon** für vier Reiche: Zufallskarte, viermal so groß wie die
   Europakarte; Startplätze mit Nahrung + ½ Münzen ≥ 4, immer – auch mit Russlands Start mit
   zwei Bevölkerung; Technologien Antike ×2, Mittelalter ×3, Industrialisierung ×4,
   Moderne ×5, Singularität ×2,5. Vor dem Start sehen alle die Karte und die
   Starttechnologien jedes Reichs und draften dann ihre Fähigkeiten: je zwei, in
   Schlangenreihenfolge, aus (2 × Spieler) + 1 – der Letzte wählt aus zweien. Zufällig
   gezogen, dieselbe darf mehrfach vorkommen.
4. Prüfen, dass die KI den Marathon spielt; KI-Messreihen für die Änderungen am normalen
   Spiel.

### Kriegerkultur mit Burgenbau

* **Regel:** +2 Macht je eigener Armee, mit Burgenbau zusätzlich +2 je eigener Stadt.
  Auslegung von „each city should add power": genau so viel wie eine Armee – mit Burgenbau
  steht in jeder Stadt eine unbewegliche Armee, die verteidigt, flankiert und eine
  Kontrollzone wirft wie eine echte (`warriorUnits` in engine.js). Für die **Baukosten**
  weiterer Armeen zählt sie nicht, dort bleiben es die echten Armeen.
* Text auf dem Bogen: „Jede eigene Armee gibt +2 Macht – mit Burgenbau auch jede eigene
  Stadt" (`data/civs.json`, englisch in `DATA_EN`).
* **KI:** rechnet den Zuschlag mit, auch mit geplanten Armeen (`kiPowerBonus` über
  `warriorUnits`), und bewertet Burgenbau mit Kriegerkultur höher (`kiTechBonus`: +1,5 je
  Stadt, dazu der Zuschlag in der Verteidigungsrechnung).
* **Gemessen** (KI Schwer, Plättchenkarte, ohne Module, je 40 Partien auf denselben
  Startwerten; Werkzeug im Arbeitsordner der Sitzung, nicht im Paket):

  | Reihe | v82 | v83 | v83 ohne die Burgen-Wirkung |
  |---|---|---|---|
  | 4 KI, Wikinger mit Kriegerkultur: Siege der Wikinger | 12 | **17** | 12 |
  | … davon Burgenbau erforscht | 13 | 20 | 15 |
  | … größter Machtzuschlag im Mittel | 4,8 | 7,9 | 4,8 |
  | Duell Wikinger (Kriegerkultur) gegen KI: Siege der Wikinger | 19 | **22** | 17 |
  | … größter Machtzuschlag im Mittel | 7,3 | 12,8 | 7,8 |

  Die Gegenprobe läuft mit dem Code von v83, nur ohne die Städte in `warriorUnits` – der
  Anstieg kommt also von der Burgen-Wirkung (zu viert 12 → 17, im Duell 17 → 22), nicht von
  der Änderung am Wirtschaftssieg. Zu viert gewinnen die Wikinger mit Kriegerkultur jetzt 17
  von 40 Partien, bei gleich starken Reichen wären es 10 (Schätzung der Unsicherheit bei 40
  Partien: etwa ± 6).

### Wirtschaftssieg zu Rundenbeginn

* **Auslegung:** gezählt wird mit der eigenen Bevölkerung **und** der Weltbevölkerung zu
  Beginn der Runde, geprüft gleich dort – für alle Reiche, in Zugfolge ab dem Startspieler,
  ab Runde 2 (`markRoundStart`, `victoryOwn`, `victoryWorld`). Ein Anspruch fällt also zu
  Beginn einer Runde; wie jeder Anspruch endet das Spiel am Ende dieser Runde, und alle
  anderen haben die ganze Runde für einen eigenen Anspruch (dann Punktvergleich) oder einen
  Militärsieg.
* **Die wörtliche Lesart verworfen:** nur den Nenner auf den Rundenbeginn festzuhalten und
  die eigene Bevölkerung weiter laufend am Ende des eigenen Zuges zu zählen. Dann zählt das
  eigene Wachstum im Zug oben schon, unten noch nicht – im Duell reicht in Runde 2 eine
  Gründung und ein Wachstum (Welt 3 zu Rundenbeginn, Schwelle über 3/4 · 3 = 2,25, also
  genügen 3 eigene). Gemessen: KI-Duelle 40 von 40 mit Wirtschaftssieg, 38 davon in Runde 2;
  KI gegen David ebenso 40 von 40, alle in Runde 2. Wer die wörtliche Lesart doch will: eine
  Zeile in `checkVictory` (`mine = popOf(S, pi)`) und die Prüfung zurück ans Zugende.
* **Weggefallen:** die Prüfung am Ende jedes Zuges (`finishTurn`) und die Nachprüfung aller
  am Rundenende (`resolveClaims`; sie gab es, damit der Vergleich nicht an der
  Sitzreihenfolge hing – das leistet jetzt die gemeinsame Prüfung zu Rundenbeginn). Die KI
  prüft in ihren Probezügen nicht mehr; sie bewertet weiter ihren Anteil am Ende ihres
  Zuges – das ist, was zu Beginn der nächsten Runde zählt, solange niemand mehr etwas ändert.
* **Anzeige:** Die Kopfzeile zeigt weiter den laufenden Stand (also den, der zu Beginn der
  nächsten Runde zählen wird); der Regelbogen sagt „geprüft zu Beginn jeder Runde ab Runde
  2, für alle mit der Bevölkerung von dort". Das Tutorial (alter Techtree, feste Partie)
  sagt nichts zum Zeitpunkt und bleibt unverändert.
* **Gemessen** (je 40 Partien, KI Schwer, gleiche Startwerte, Plättchenkarte, ohne Module):

  | Reihe | v82 | v83 |
  |---|---|---|
  | Duell KI gegen KI | Wirtschaft 26, Militär 9, Forschung 5 · Endrunde Median 5 · Startspieler gewinnt 32 | Militär 19, Forschung 12, Wirtschaft 9 · Median 7 · Startspieler 29 |
  | … davon Wirtschaftssieg in Runde 2 | 7 | 0 |
  | Duell KI gegen David | Militär 18, Forschung 12, Wirtschaft 10 · Median 6 · KI gewinnt 20 | Militär 23, Forschung 16, Wirtschaft 1 · Median 6 · KI gewinnt 20 |
  | 4 KI | Militär 33, Forschung 6, Wirtschaft 1 · Median 6 | Militär 33, Forschung 7 · Median 6 (37 von 40 Partien gleich) |
  | Duell Wikinger (Kriegerkultur) gegen KI | Wirtschaft 17, Militär 15, Forschung 8 | Militär 31, Wirtschaft 5, Forschung 4 |

  Von den 26 Wirtschaftssiegen des KI-Duells in v82 gewinnt in v83 23-mal dasselbe Reich
  (8-mal weiter wirtschaftlich, sonst militärisch oder über die Forschung; meist eine Runde
  später, die sieben früheren Siege in Runde 2 eine bis sechs Runden später), 3-mal ein
  anderes. Der Wirtschaftssieg wird im Duell deutlich seltener, und der **Wirtschaftssieg in
  Runde 2** (Übergabe, offener Punkt 14) kommt nicht mehr vor: zu Beginn von Runde 2 haben
  beide genau einen Zug gehabt.

### Fähigkeiten als Liste

Bis v82 hatte ein Reich genau eine Fähigkeit seiner Zivilisation (`p.ability`). Im Marathon
hat es zwei gedraftete, auch fremde – Russland mit Handelsreich tauscht 1:1. Deshalb:

* `abilitiesOf(p)` liefert Schlüssel „Zivilisation:Fähigkeit", aus `p.drafted` (Marathon)
  oder aus Zivilisation und `p.ability` (sonst); Bots und Barbaren haben keine.
* Grundfähigkeiten heißen bei allen Zivilisationen `basis` und werden immer **mit der
  Zivilisation** geprüft: `hasAbil(p, 'griechenland', 'basis')`. `isAbil(p, k)` bleibt für die
  eindeutigen Schlüssel und wirft bei `'basis'` – ein Test sucht den Quelltext danach ab.
* Doppelt wirkt nichts doppelt (Liste, keine Zählung). Wachstumskosten mit zwei Fähigkeiten:
  der größere Faktor (Kolonisten ×2), Fruchtbarkeit streicht weiter die Nahrung – beide
  zusammen: keine Nahrung, doppelte Münzen.
* Kopfzeile, Weltblatt und Protokoll nennen alle Fähigkeiten eines Reichs.

### Marathon

**Karte** (`js/marathon.js`): 24 × 36 Felder – die Originalkarte hat 12 × 18, viermal die
Fläche. Höhenfeld aus Wertrauschen (drei Oktaven), zum Rand hin abfallend; die tiefsten 30 %
werden Meer, Landstücke bis 3 Felder Inseln, Binnenseen bis 2 Felder Fluss. Gebirge entlang
eines „geknickten" Rauschens (Kämme statt Klumpen, oberste 13 % des Landes), Flüsse von den
Gebirgsrändern bergab bis Meer oder Fluss (bis 8 % der Karte), Wald nach eigenem Rauschen
(etwa 15 %), ein paar Inseln im offenen Meer (gut 2 %). Gemessen über 100 Karten: Meer 28 %,
Grasland 38 %, Wald 15 %, Gebirge 9 %, Fluss 8 %, Insel 2 % – nah an der Originalkarte.
Erzeugung rund 5 ms.

**Hauptstädte:** je Kartenviertel eine, im Umkreis von 6 Feldern um dessen Mitte, nicht
direkt am Rand, mindestens 14 Felder voneinander entfernt, mit mindestens 30 Landfeldern im
Umkreis von 4. Erlaubt nur, wo **Nahrung + ½ Münzen ≥ 4** im ersten Zug:

* **Auslegung von „immer, auch mit Russlands Start mit zwei Bevölkerung":** gerechnet für
  den ungünstigsten Fall – Hauptstadt mit **2 Bevölkerung** (Siedlertrecks lässt sich
  draften, und jede Bevölkerung kostet 1 Nahrung und bringt 1 Münze, zusammen −½), ohne
  Technologien und ohne Ertragsfähigkeit. Mit 1 Bevölkerung ist es immer ½ mehr.
* Unter allen erlaubten Vierergruppen die, deren schwächste Hauptstadt am besten dasteht
  (Startertrag, gedeckelt bei 8, und Land ringsum) – so fair wie möglich. Welcher Platz
  welches Viertel bekommt, ist Zufall.
* Gemessen über 100 Karten: höchstens 3 Anläufe (findet sich keine Aufstellung, wird mit dem
  nächsten Startwert neu erzeugt), kleinster Abstand 14, Startertrag im Median 5,5.

**Technologien:** `techBase` multipliziert die Grundkosten: Antike ×2, Mittelalter ×3,
Industrialisierung ×4, Moderne ×5, Singularität ×2,5 (250). Rabatte (Griechenland,
Wissenschaftliche Methode) ziehen danach ab, der Kreml-Zuschlag kommt danach dazu (nicht
mit vervielfacht). Kopieren zahlt die Marathonkosten. Regelbogen und Technologiebogen zeigen
die umgerechneten Zahlen, der Regelbogen mit einem Satz dazu.

**Draft:**

* Nach dem Aufbau wird die Karte erzeugt und die Starttechnologien werden ausgewürfelt (wie
  im Plättchenmodus vorab, `rollSetup`). Der Draftbildschirm zeigt die ganze Karte mit allen
  Hauptstädten (die des Wählenden hervorgehoben), den Vorrat und die Reiche in Zugfolge –
  je Reich die gewählten Fähigkeiten, den Ertrag der Hauptstadt im ersten Zug und die
  Starttechnologien, dazu ein Knopf **Bogen** für den Technologiebogen mit Marathonkosten.
* **Während des Drafts hat niemand eine Fähigkeit** (`draftView`): Bogen und Ertrag zeigen
  die Werte ohne. Die erste Fassung zeigte Griechenland mit dem Rabatt seiner Grundfähigkeit,
  Russland mit Taiga und die Gratisarmee der Wikinger auf der Karte – alles Fähigkeiten, die
  erst noch gedraftet werden (gefunden beim Smoke-Test des Bogens).
* **Vorrat:** 2n + 1 Fähigkeiten, zufällig aus allen zwölf gezogen, mit Zurücklegen –
  dieselbe kann mehrfach im Vorrat liegen. **Reihenfolge:** Zugfolge ab dem Startspieler,
  dann rückwärts (1-2-3-4-4-3-2-1); der Letzte wählt aus den letzten zwei, eine bleibt liegen.
* **Auslegung: n = Reiche, die draften.** Bots haben nach den Bot-Regeln keine Fähigkeiten;
  sie draften nicht, und der Vorrat richtet sich nach den übrigen (mit einem Bot 7 statt 9).
* **Auslegung: keine Fähigkeit doppelt im eigenen Reich,** solange es noch etwas anderes
  gibt – doppelt wirkt sie nicht doppelt. Liegt nur noch Doppeltes, darf man es nehmen.
* Fremde Fähigkeiten wirken bei jeder Zivilisation, die eigene Grundfähigkeit hat ein Reich
  nur, wenn es sie draftet (Wikinger ohne Seefahrer: keine Gratisarmee).
* Mehrere Menschen wählen nacheinander am selben Bildschirm; die KI wählt, sobald sie dran
  ist. Danach **Spiel beginnen**: die Partie entsteht mit genau dieser Karte, diesen
  Starttechnologien und den gedrafteten Fähigkeiten (`p.drafted`, im Spielstand).
* „Nochmal spielen" führt wieder in den Draft, mit neuer Karte. Der Draft selbst wird nicht
  gespeichert – wer die App mittendrin schließt, beginnt den Marathon neu.

**Wahl der KI** (`kiDraftPick`): Grundwert je Fähigkeit (`KI_DRAFT_BASE`) plus Karte um die
eigene Hauptstadt (Wald für Taiga, Küste für Seemacht, Land für Siedlertrecks und
Kolonisten), +1,5 für eine zweite Wikinger-Kriegsfähigkeit, +1 für Kolonisten mit
Fruchtbarkeit; was sie schon hat, ist ihr nichts wert. Die Grundwerte sind **gemessen**:
40 Marathonpartien mit vier KI (Schwer), jedes Reich mit zwei zufällig zugeteilten
Fähigkeiten, Sieger gezählt; dazu ein bedingtes Logit (wer gewinnt, gegeben die Fähigkeiten
aller vier), damit eine Fähigkeit nicht von ihrem Partner profitiert.

| Fähigkeit | Siege / Partien | Logit-Stärke |
|---|---|---|
| Kolonisten (England) | **21 / 27** | **+3,7** |
| Handelsreich (England) | 10 / 27 | +0,8 |
| Kriegerkultur (Wikinger) | 9 / 30 | +0,6 |
| Freie Forschung (Griechenland) | 6 / 22 | +0,6 |
| Seefahrer (Wikinger) | 6 / 24 | +0,2 |
| Günstige Forschung (Griechenland) | 9 / 38 | −0,3 |
| Rückschau (Griechenland) | 3 / 24 | −0,6 |
| Seemacht (England) | 2 / 19 | −0,8 |
| Taiga (Russland) | 3 / 20 | −0,9 |
| Siedlertrecks (Russland) | 5 / 28 | −0,9 |
| Beutezüge (Wikinger) | 4 / 34 | −0,9 |
| Fruchtbarkeit (Russland) | 2 / 27 | −1,5 |

Eindeutig ist nur **Kolonisten**: 21 Siege in 27 Partien, wo bei gleicher Stärke ein Viertel
zu erwarten wäre. Auf der großen Karte mit teurer Forschung ist Gründen ohne Grundkosten
offenbar das Stärkste, was es gibt – jedenfalls so, wie die KI spielt (ob Menschen das
genauso ausnutzen, ist nicht gemessen). Die übrigen liegen dicht beieinander und sind auf 40
Partien unsicher; die Grundwerte folgen der gemessenen Reihenfolge, etwas zur Mitte gezogen
(Kolonisten 15, Handelsreich 8, Kriegerkultur und Freie Forschung 7,5, Seefahrer 6,5,
Günstige Forschung 5, Rückschau 4,5, Beutezüge 3,5, Siedlertrecks und Fruchtbarkeit 2,5,
Seemacht 2, Taiga 1). Taiga, Seemacht und Siedlertrecks bekommen von der Karte im Mittel
+2,8, +2,4 und +1,5 dazu (120 Hauptstädte) – gemessen war der Wert samt Karte. Bis zur
Messung standen Schätzungen da (Freie Forschung 9, Fruchtbarkeit und Siedlertrecks 8,
Kolonisten 7) – die KI hätte Kolonisten oft liegen lassen.

**Die KI spielt den Marathon** (ganze Partien mit Draft, vier Reiche):

* **56 ganze Partien, alle ohne Fehler und mit einem Sieg zu Ende** (Runde 4 bis 12): 8 mit
  vier KI Schwer samt Draft der KI, 4 mit zwei KI Mittel und zwei Bots (König), 4 mit vier
  KI Leicht, dazu die 40 Partien der Draftmessung (vier KI Schwer, Fähigkeiten zugeteilt).
  Siegarten zusammen: Militär 29, Forschung 23, Wirtschaft 4 – die KI forscht also trotz der
  höheren Kosten bis zur Singularität, gründet auf der großen Karte reichlich (in den 8
  Partien der KI Schwer am Ende 3 bis 21 Städte je Reich, mit Kolonisten 23 bis 58) und
  erobert Hauptstädte.
* **Zugzeit** (8 Partien KI Schwer, Endfassung, allein auf dem Testrechner): Median je
  Partie 0,1–0,4 s, 90 % der Züge unter 1,0–2,0 s, längster Zug je Partie 1,2–6,5 s – der
  längste in einer Partie mit 83 Städten auf der Karte, 56 davon in einem Reich. Die
  Tempo-Änderungen (unten) kürzen die langsamsten Züge um 10–30 %. Auf dem iPad nicht
  gemessen.
* Mit den gemessenen Grundwerten draftet die KI Kolonisten, sobald sie im Vorrat liegt: in
  den 8 Partien lag sie viermal im Vorrat, und viermal gewann, wer sie hatte (einmal zwei
  Reiche mit Kolonisten – gewonnen hat eines davon).

### Tempo der KI auf großen Karten

Im Marathon stehen zur Mitte der Partie 50 und mehr Städte auf der Karte (bis über 80, ein
Reich mit Kolonisten allein bis 58). Der längste Zug einer Partie dauerte auf dem
Testrechner bis 10 s. Profile der zwei
langsamsten Züge: im einen das Einkommen 41 % (davon die Handelsrouten 26 %) und die
Bewertung der Siedelplätze 26 %, im anderen – ein Reich mit über 50 Städten, viele ohne
Anschluss – die Straßenpläne 25 %. Drei Änderungen, **alle ohne andere Ergebnisse**:

* `tradeRoutes`: Städte einmal in eine Tabelle statt je Feld zweimal `cityAt` über alle
  Städte, die Wegstufe je Feld nur einmal.
* `settleGain(S, pi, r, c, before)`: die KI rechnet das Einkommen ohne die neue Stadt einmal
  je Bewertung der Siedelplätze statt einmal je Platz.
* `kiRoadPlans`: dieselbe Stadttabelle, und die Warteschlange des Dijkstra in Fächern je
  Entfernung (`kiRoadQueue`) statt vor jeder Entnahme alles zu sortieren. Damit dieselben
  Wege herauskommen, gibt die Schlange die Felder in **genau** der Reihenfolge des
  sortierten Feldes heraus, auch bei gleicher Entfernung; die naheliegende Vorrangschlange
  (Entfernung, dann Zeitpunkt des Einreihens) tut das nicht – in 309 von 400 Zufallsfolgen
  anders, weil ein Feld, dessen Entfernung sinkt, im sortierten Feld hinter die schon
  wartenden rückt.

Geprüft: dieselben Endstände (ganzer Spielstand samt Protokoll) mit und ohne die Änderungen
über 20 ganze Partien (8 im Marathon mit gemischten Stufen, einem Bot, Ereignissen und
Wundern; 12 zu viert auf der Plättchenkarte, die Hälfte mit Modulen); `test.js` vergleicht
die Handelsrouten über eine ganze Marathonpartie mit der Fassung bis v82, den Ertrag beim
Siedeln mit und ohne vorab gerechnetes Einkommen und die Schlange mit dem sortierten Feld an
400 Zufallsfolgen. Gemessen an den vier langsamsten Zügen zweier Marathonpartien, jeder
einzeln, je zwei Läufe, allein auf dem Rechner: 10,0 → 7,4 s, 6,0 → 4,3 s, 4,4 → 3,7 s und
2,9 → 2,65 s – 10 bis 30 % weniger. Was bleibt, steht in der Übergabe (offener Punkt 24).

### Was sich in den Tests verschoben hat

* Siegschwellen und Spielende prüfen den Wirtschaftssieg über `markRoundStart` statt über
  `checkVictory` am Zugende. Der Fall „Russland erfüllt die Schwelle erst nach dem Anspruch
  der Wikinger und kommt am Rundenende in den Vergleich" gilt nicht mehr: seit v83 kommt
  Russland erst zu Beginn der nächsten Runde dran – da ist das Spiel schon aus, die Wikinger
  gewinnen.
* KI-Tests mit festen Startwerten (Flankenpläne, Reichweiten-Merker, Wissenschaft für die
  Forschung) hängen am Spielverlauf. Mit der wörtlichen Lesart endeten ihre Partien in
  Runde 2 und es gab nichts mehr zu prüfen; mit der umgesetzten laufen sie wie vorher
  (Flankenpläne 28, Vergleiche der Reichweiten 6653, Wissenschaft in die Forschung 225
  gegen 188).
* `smoke.js`, Schritt „KI: Züge laufen über das Blatt": schaltet Ereignisse für diesen
  Schritt ab. Die Häkchen aus den Modulschritten standen dort noch, und ein Ereignis der
  ersten Runde lässt eine KI zu Recht untätig – gemessen in 23 von 600 ersten KI-Zügen, mit
  v82 auf denselben Startwerten genauso; der Schritt prüft aber, dass jede KI gehandelt hat.
  Vorher ein seltener Zufallsfehler, beim Lauf für v83 einmal aufgetreten.

### Abgesichert

`test.js`: Siegschwellen über `markRoundStart`; Wirtschaftssieg zu Rundenbeginn (Nenner die
ganze Runde derselbe, Anspruch zu Beginn der nächsten Runde vor dem ersten Zug, gezählt mit
der Bevölkerung von dort, kein Anspruch am Zugende, wer bis zum Rundenbeginn wieder fällt,
meldet nichts an); Spielende (Anspruch zu Rundenbeginn, Militärsieg schlägt ihn, keine
Nachprüfung am Rundenende). Kriegerkultur mit Burgenbau (Armee + zwei Städte = +6, Baukosten
unberührt, die KI rechnet gleich – auch mit geplanten Armeen –, Burgenbau allein gibt
nichts, die KI schätzt Burgenbau mit Kriegerkultur höher). Fähigkeiten als Liste (normal
eine, Bots keine, `hasAbil`/`isAbil`, `isAbil(…, 'basis')` wirft und steht nirgends im
Quelltext, fremde Fähigkeiten wirken, die eigene Grundfähigkeit fehlt ohne Draft, doppelt
wirkt einfach, Kolonisten mit Fruchtbarkeit). Marathon: 40 Karten (Größe, vier Hauptstädte,
Startertrag ≥ 4 mit der echten Regelmaschine und Siedlertrecks bei allen, Abstand ≥ 14,
Geländeanteile, höchstens 5 Anläufe, gleicher Startwert gleiche Karte), Technologiekosten
×2–×5 und 250, Rabatte danach, Kopierpreise; Draft (Vorrat 2n + 1, Schlange ab dem
Startspieler, aus allen zwölf, Doppeltes im Vorrat möglich, niemand wählt außer der Reihe,
der Letzte aus zwei, Doppeltes im eigenen Reich nur ohne Alternative, Bots draften nicht),
Draftansicht ohne Fähigkeiten, die Partie danach mit denselben Starttechnologien und
Hauptstädten; eine ganze Marathonpartie mit vier KI (zu Ende ohne Fehler, kein Zug über 8 s,
Handelsrouten wie bis v82, Ertrag beim Siedeln mit vorab gerechnetem Einkommen); die
Warteschlange des Straßenplans gegen das sortierte Feld. `smoke.js`: Aufbau des Marathons
(vier Plätze, keine Karten- und Fähigkeitswahl, Hinweis, zurück zu „Vier Reiche"), Draft
(Karte 24 × 36, Vorrat 7 mit einem Bot, Reiche mit Starttechnologien, die KI wählt selbst,
der Mensch tippt, der Bot wählt nicht, jeder Bogen zeigt die Marathonkosten ohne Rabatt,
keine Armee auf der Draftkarte), Spielbeginn (dieselbe Karte, dieselben Fähigkeiten,
Kopfzeile mit beiden, Regelbogen mit Hinweis und umgerechneten Kosten, Protokoll, Speichern
und Fortsetzen), „Nochmal spielen" in einen neuen Draft, der Draft auf Englisch.

## Sklaverei 7 · drei Militärkosten · Marathonregeln · Kolonien · Bevölkerung als Zahl (v84)

**Anweisung des Autors (16.10.):**
1. Sklaverei bringt nur noch 7 Münzen je Opfer.
2. Eisenverarbeitung kostet 4, Belagerungsmaschinen 5, Stadtmauern 2.
3. Nur im Marathon: höchstens 5 Städte je Zug gründen; ein Militärsieg verlangt zwei
   eroberte Hauptstädte; die Singularität kostet 300.
4. Fehler: Ist ein Platz nur deshalb nicht besiedelbar, weil er über Wasser oder durch
   fremdes Gebiet nicht erreichbar ist, sonst aber erlaubt, und kontrolliert der Spieler das
   Feld per Kolonialismus, soll er besiedelbar sein – die Entfernung dann direkt, wie mit
   Flugzeugen.
5. Oberfläche: In der Stadt statt des Symbols die Bevölkerung als Zahl, die Striche weg;
   die Zahl bleibt in der Farbe des Reichs, damit man sieht, wem die Stadt gehört.

### Sklaverei 7, drei Militärkosten

* `SLAVERY_COINS = 7` (data.js) – Regel (`sacrifice`), Knopf („+7🪙"), Protokoll, Techtext,
  englisch ebenso. Die KI probiert das Opfern auf Kopien aus und sieht die 7 von selbst; ihr
  fester Zuschlag für die Technologie (`kiTechBonus`: 2) ist nicht nachgestellt.
* Militär der Antike: **Stadtmauern 2, Eisenverarbeitung 4, Belagerungsmaschinen 5**
  (bis v83: 5, 2, 4). Die Leiter dort ist jetzt Taktik 1, Stadtmauern 2, Eisenverarbeitung 4,
  Belagerungsmaschinen 5 – auch die Würfe auf „die n-te Technologie" folgen ihr. Im Marathon
  das Doppelte (4, 8, 10).
* **Das Tutorial behält die alten Kosten** (Auslegung): Es läuft im alten Techtree und ist
  auf feste Würfe gebaut; mit anderen Kosten verschöbe sich sein Ablauf. Die drei stehen
  deshalb in `OLD_TECH_COSTS` (jetzt zwölf Einträge) und gelten dort und in Partien von vor
  v82. Partien aus v82/v83 bekommen die neuen Kosten.

### Marathon: Singularität 300, fünf Gründungen je Zug, zwei Hauptstädte

* **Singularität 300** (`MARATHON_SINGULARITY`; v83: das 2,5-Fache, 250). Rabatte ziehen
  danach ab, der Kreml schlägt seine 50 danach auf.
* **Höchstens fünf Gründungen je Zug** (`MARATHON_MAX_FOUNDS`). Gezählt in `p.foundRound` /
  `p.foundCount` beim Gründen (`foundCity`) – jedes Reich hat genau einen Zug je Runde. Ist die
  Grenze erreicht, nennt `foundSiteError` das als ersten Grund („Höchstens 5 neue Städte je
  Zug"), die Karte im Gründungsmodus blendet jeden Platz ab, und „Stadt gründen" geht gar
  nicht erst in den Modus, sondern sagt es. Die KI bietet danach keine Gründung mehr an.
  Bots gründen ohnehin höchstens eine Stadt je Zug. Was nicht zählt: Eroberungen.
* **Militärsieg mit der zweiten eroberten Hauptstadt** (`MARATHON_CAPITALS`). Wie bisher
  wird eine eroberte Hauptstadt eine gewöhnliche Stadt des Eroberers (`captureCity` setzt
  `cap: false` – das galt schon immer, sichtbar wurde es bisher nur, wenn Barbaren eine
  Hauptstadt nahmen). Daraus folgt (**Auslegung**):
  - gezählt wird, wie viele Hauptstädte ein Reich **genommen hat** (`p.capTaken`), nicht wie
    viele es hält – wer die erste wieder verliert, behält den Zähler;
  - dieselbe Hauptstadt zählt nur einmal, zurückerobert für niemanden – die zweite muss also
    die eines anderen Reichs sein;
  - wer seine Hauptstadt verloren hat, **spielt ohne Hauptstadt weiter**: keine
    Handelsrouten mehr, Gründungsentfernung ab seiner ersten Stadt, Bürokratie ohne Wirkung,
    Bots bauen ihre Armeen in ihrer ersten Stadt. Eine neue Hauptstadt gibt es nicht.
  Die erste Eroberung steht im Protokoll („… 1 von 2 Hauptstädten für den Militärsieg"), das
  Weltblatt nennt bei jedem Reich, wie viele es genommen hat und ob es noch eine Hauptstadt
  hat; der Sieg nennt beide Reiche. Im normalen Spiel bleibt alles beim Alten
  (`capitalsToWin` = 1).
* **KI:** Eine Belagerung der ersten fremden Hauptstadt ist ihr die Hälfte des Spielwerts
  wert, der zweiten der ganze (`kiCapitalShare`); eine genommene Hauptstadt zählt als halber
  Sieg (`kiVictory`). Die eigene Hauptstadt zu verlieren, wiegt gegen einen Gegner, der schon
  eine genommen hat, das ganze Spiel, sonst die Hälfte (`kiRisk`, je Gegner gewichtet). Dass
  Bots ohne Hauptstadt in ihrer ersten Stadt bauen, weiß sie auch.
* **Gemessen** (Marathon, vier KI, Draft der KI): 32 ganze Partien (20 mit vier KI Schwer, 12 mit
  vier KI Mittel), alle ohne Fehler und mit einem Sieg zu Ende, Runde 6 bis 12: Forschung 22,
  Wirtschaft 8, Militär 2. Eine erste Hauptstadt fiel in 8 der 24 Partien, in denen es
  mitgezählt wurde; zweimal folgte die zweite und damit der Militärsieg (beide Male Stufe
  Mittel, der Siegtext nennt beide Reiche). Dieselben 8 Startwerte der Stufe Schwer endeten
  in v83 viermal militärisch, jetzt keinmal (Forschung 6, Wirtschaft 2) – zwei Hauptstädte
  und die teurere Singularität verschieben die Partien zur Forschung. Längster Zug je Partie
  allein auf dem Testrechner 1,5–5,6 s (8 Partien), mit zwei Läufen nebeneinander bis 7,2 s.

### Kolonien ohne Siedlerweg

* `foundDistance`: findet sich kein Weg (Wasser ohne Navigation, fremdes Gebiet, Vulkane,
  fremde Armeen …) und das Feld ist **per Kolonialismus gekauft** (`S.bought[pi]`), zählt die
  Luftlinie von der Hauptstadt (`hexDistance`, wie mit der Luftwaffe); ohne Hauptstadt von
  der ersten Stadt, wie jede Gründungsentfernung. Damit gehen `foundSiteError`, `foundCost`,
  der Gründungsmodus und die KI denselben Weg.
* **Auslegungen:**
  - nicht nur Wasser und fremdes Gebiet, sondern **jeder** fehlende Weg – der Autor nannte
    diese beiden als Beispiel, und „wie mit Flugzeugen" überfliegt alles;
  - alles andere gilt weiter: nur auf Land, nicht auf einem Vulkan, nicht auf einer Armee,
    nicht neben einer gegnerischen Armee, mindestens 3 Felder von jeder Stadt;
  - nur die eigenen Kolonien – ein Feld, das ein anderes Reich gekauft hat, hilft nicht;
  - **gibt es einen Weg, gilt der Weg**, auch als Umweg (wörtlich „in that case"). Eine
    Kolonie hinter einem langen Umweg kostet also mehr als eine gleich weite ohne jeden Weg.
  - Kartografie erlässt die Distanzkosten auch hier.
* **KI:** `kiSitesAll` nimmt eigene Kolonien, die ihre Breitensuche nicht erreicht, mit der
  Entfernung aus `foundDistance` auf; ihr Merker für Siedelplätze kennt jetzt auch die
  gekauften Felder (sonst sah sie eine eben gekaufte Kolonie erst nach der nächsten Gründung).
* Der Techtext von Kolonialismus sagt es: „Für 3 Münzen Feld kaufen; dort auch ohne Weg
  gründen".

### Bevölkerung als Zahl

* Die Stadtscheibe zeigt die Bevölkerung als fette Zahl in der Farbe des Reichs; die Striche
  darüber und das Reichssymbol in der Stadt sind weg. Zweistellige Zahlen 17 statt 20 Punkt,
  dreistellige 13. Die Hauptstadt behält ihren dunklen, dicken Ring, andere Städte den Ring
  in Reichsfarbe; Armeen tragen weiter das Symbol. Legephase und Editor zeigen weiter Symbole
  – dort gibt es noch keine Stadt mit Bevölkerung.
* Das Tutorial sagt es (deutsch und englisch): „Der Kreis ist die Stadt, die Zahl darin ihre
  Bevölkerung – in der Farbe des Reichs, dem sie gehört."
* Sichtprobe in Chromium: Originalkarte mit Bevölkerungen 1 bis 12, Marathonkarte bis 15 –
  auch auf den kleinen Feldern des Marathons lesbar.

### Tempo der KI (Marathon, späte Züge)

Mit Singularität 300 und zwei Hauptstädten dauern Marathonpartien länger; die Partie aus
`test.js` lief eine Runde länger, bis 53 Städte und 27 Armeen, längster Zug 7,7 s. Profil:
`kiRisk` 55 % – je eigene Stadt und Gegner die Plätze an der Stadt (`kiAttackSlots`, eine
Paarung Armee ↔ Feld), und das zweimal (Wellen und Mindestangriff), mit `cityAt`/`armyAt`
je Feld über alle Städte und Armeen. Geändert, **ohne andere Ergebnisse**:

* `kiOccupancy`: Städte und Armeen je Feld und Id, einmal je `kiRisk`;
* die Plätze einmal je Stadt und Gegner, für Wellen und Mindestangriff gemeinsam;
* ein Merker je Stadt und Gegner und Zug: das Ergebnis hängt nur an den freien Feldern und
  daran, welche seiner Armeen und Städte noch stehen.

Geprüft: dieselben Endstände über 14 ganze Partien (6 Marathon mit gemischten Stufen, Bot,
Ereignissen, Wundern; 8 zu viert auf der Plättchenkarte) und dieselben Ergebnisse auf vier
gespeicherten späten Zügen; dort 8,2 → 5,2 s, 6,1 → 4,9 s, 6,7 → 6,0 s, 4,0 → 3,5 s. Die
Grenze des Zeittests in `test.js` steht jetzt bei 10 s (v83: 8 s).

### Abgesichert

`test.js`: 7 Münzen je Opfer und im Techtext; die drei Kosten, die Leiter Militär/Antike in
beiden Techtrees, die übrigen Leitern unverändert, `OLD_TECH_COSTS` mit zwölf Einträgen,
Kopierpreise mit Stadtmauern 2; Marathon: Singularität 300, fünf Gründungen und dann die
Meldung als erster Grund, im nächsten Zug von vorn, ohne Marathon keine Grenze; zwei
Hauptstädte (die erste ohne Sieg, die eroberte ist gewöhnlich, das alte Reich ohne
Hauptstadt, Protokoll, zurückerobert zählt nicht, die zweite siegt, der Siegtext nennt beide,
im normalen Spiel genügt eine), der Anteil der KI; Kolonien hinter Wasser, fremdem Gebiet,
Vulkanen und fremden Armeen (gründbar, Luftlinie, Kosten, Kartografie), was weiter gilt
(gegnerische Armee daneben, Vulkan, Abstand, fremde Kolonie), Umweg zählt als Weg, die KI
sieht die Kolonie zu denselben Kosten; die ganze Marathonpartie der KI (höchstens fünf
Gründungen je Zug, ein Militärsieg mit zwei Hauptstädten). `smoke.js`: Städte zeigen ihre
Bevölkerung als Zahl in Reichsfarbe (auch zweistellig verkleinert), kein Symbol in Städten,
keine Striche; Marathon: „Stadt gründen" nach fünf Gründungen mit Meldung, danach wieder;
Weltblatt mit eroberten Hauptstädten und „ohne Hauptstadt"; Kolonialismus-Kachel mit dem
neuen Text.

## Wirtschaftssieg am Rundenende · Marathon: Griechenland und Methode · Startausgleich (v85)

**Anweisung des Autors (17.10.):**
1. Der Wirtschaftssieg wird nur noch einmal berechnet, am Rundenende (wenn jeder gleich oft
   gezogen hat). Gewinnt dort jemand, endet das Spiel sofort – höchstens Punktvergleich, wenn
   andere die Singularität haben. Die Rundenbeschränkung fällt weg: auch in Runde 1, wenn
   die Bedingung erfüllt ist.
2. Nur im Marathon: Griechenlands Günstige Forschung und die Wissenschaftliche Methode
   bekommen den doppelten Bonus. Griechenlands Freie Forschung reicht nur bis ins
   Mittelalter.
3. Ausgleich für die Startplätze: im allerersten Zug bekommen der Zweite, Dritte und Vierte
   1, 2 bzw. 3 Münzen dazu – zu zweit nur der Zweite 1, zu dritt der Zweite 1 und der
   Dritte 2.

### Wirtschaftssieg am Rundenende

* `checkEconomyRoundEnd` steht in `advanceTurn` genau dort, wo die Runde umschlägt (nach dem
  Zug des Letzten in der Zugfolge, vor dem Ereignis der neuen Runde), und prüft alle lebenden
  Reiche in Zugfolge ab dem Startspieler mit dem Stand dieses Moments – eigene und
  Weltbevölkerung. Gleich danach entscheidet `resolveClaims`: Ist der Wirtschaftssieg der
  einzige Anspruch der Runde, ist das Spiel aus; hat in derselben Runde schon jemand einen
  anderen Sieg angemeldet, entscheiden die Punkte wie bisher (Mensch vor Bot). Alle
  Schwellen liegen über der Hälfte – am Rundenende kann also höchstens ein Reich den
  Wirtschaftssieg haben.
* Weg sind `markRoundStart` und der festgehaltene Stand zu Rundenbeginn (`S.roundPop`,
  `S.roundPops`); `migrateState` räumt die beiden Felder aus alten Spielständen. Am Zugende
  wird nichts geprüft (`finishTurn` rechnet nur noch die Kampfphase).
* **Runde 1:** seit v77 gesperrt, weil der Startspieler damals am Ende seines eigenen Zuges
  anmelden konnte, bevor die anderen gezogen hatten (die KI fand den Sieg mit 4 von 5
  Bevölkerung im Duell). Am Rundenende haben alle einmal gezogen; die Sperre ist weg.
* **Auslegungen:**
  - „Andere haben die Singularität": Auch ein **Kultursieg** derselben Runde (Wunder der
    Stufe 3) kommt in den Punktvergleich – er ist wie die Singularität ein angemeldeter Sieg,
    der am Rundenende fällt. Wer nur die Singularität gelten lassen will: eine Zeile in
    `resolveClaims`.
  - Ein Militärsieg mitten in der Runde beendet das Spiel wie immer sofort – ein Rundenende
    gibt es dann nicht mehr.
  - Die Meldung „Das Spiel endet am Ende dieser Runde" entfällt beim Wirtschaftssieg (es ist
    schon das Ende); im Protokoll steht der Anspruch und gleich darauf das Ergebnis.
* **Regelbogen und Tutorial** sagen es: „geprüft am Ende jeder Runde, wenn alle gleich oft
  gezogen haben – dann endet das Spiel sofort"; im Tutorial (beide Fassungen) „am Ende einer
  Runde" und im Merkkasten, dass nur noch der Forschungssieg angemeldet wird und der
  Wirtschaftssieg am Rundenende zählt. Damit ist Punkt 28 (g) der offenen Punkte erledigt.
* **KI:** Wer die Runde beschließt, sieht in seiner Bewertung jetzt seinen Anspruch
  (`kiScore` ruft `checkVictory`, wenn `kiLastInRound`) – wie bis v82 jedes Reich am Zugende.
  Für alle anderen bleibt es beim laufenden Anteil an der Schwelle (`kiVictory`), denn nach
  ihnen ziehen noch andere. Gepaart gemessen (600 Duelle mit und ohne): 8 Partien ändern
  sich, in allen gewinnt dasselbe Reich – der Zweite, jetzt wirtschaftlich in derselben Runde
  oder früher statt mit Forschung oder Militär.
* **Gemessen** (KI Schwer gegen KI Schwer, Plättchenkarte, ohne Ereignisse und Wunder,
  dieselben Startwerte in jeder Fassung; „v85 ohne Ausgleich" = v85 mit genulltem
  Startausgleich, um die beiden Änderungen zu trennen)::

  | v84 → v85 ohne Ausgleich | Duell (600) | zu dritt (400) | zu viert (600) | KI gegen Bot David (400) |
  |---|---|---|---|---|
  | Wirtschaftssiege | 128 → 199 | 24 → 55 | 4 → 8 | 38 → 66 |
  | mittlere Endrunde | 6,24 → 5,91 | 6,26 → 6,13 | 5,25 → 5,24 | 6,11 → 5,97 |
  | Partien mit anderem Ergebnis | 199 | 55 | 8 | 66 |

  Gepaart im Duell: Alle 128 Wirtschaftssiege aus v84 gewinnt in v85 dasselbe Reich, genau
  eine Runde früher – die Runde, die v84 nach dem Anspruch noch spielte, fällt weg. In 62
  weiteren Partien gewann in v84 dasselbe Reich in eben dieser Runde militärisch; jetzt endet
  die Partie davor mit seinem Wirtschaftssieg. **Wer gewinnt, ändert sich kaum:** Der
  Startspieler gewinnt im Duell 74,2 % (v84) bzw. 74,3 %; zu viert sind 592 von 600 Partien
  gleich, weil dort selten jemand die Schwelle erreicht.
  **Runde 1:** In 600 Duellen KI gegen KI fiel kein Wirtschaftssieg vor Runde 3. Gegen den Bot
  David einmal in 400 Duellen, am Ende von Runde 1: Russland (KI, Siedlertrecks) gründete im
  ersten Zug eine zweite Stadt mit 2 Bevölkerung – 4 von 5 –, der Bot verfehlte seinen
  Wachstumswurf. In v84 endete dieselbe Partie eine Runde später genauso. Das ist der Fall,
  der v77 zur Sperre führte; der Autor hat sie bewusst aufgehoben.

### Marathon: Rabatte doppelt, Freie Forschung bis ins Mittelalter

* `techCost` zieht im Marathon das Doppelte ab (`discountFactor`, `MARATHON_DISCOUNT_FACTOR`
  = 2): Günstige Forschung 2/4/6/8/10 statt 1/2/3/4/5 je Zeitalter, Wissenschaftliche
  Methode 4/8/12/16/20 statt 2/4/6/8/10 – wie bisher nach dem Marathonaufschlag. Papier
  kostet Griechenland damit 18 − 4 = 14 (v84: 16), die Singularität mit beidem
  300 − 10 − 20 = 270 (v84: 285).
* Freie Forschung: `freeTechOptions` bietet im Marathon nur Antike und Mittelalter an
  (`freeTechMaxAge`, `MARATHON_FREE_TECH_AGE` = 1), im normalen Spiel weiter bis zur
  Industrialisierung.
* **Auslegungen:**
  - „doppelter Bonus" = doppelter Abzug je Zeitalter;
  - auch für die Singularität (beide Rabatte galten schon immer auch für sie);
  - Kopieren zahlt weiter die Grundkosten ohne Rabatt (unverändert);
  - wer beide Fähigkeiten bzw. Fähigkeit und Methode hat, bekommt beide Abzüge, wie bisher.
* **Texte:** `abilEffect(a, S)` gibt im Marathon „Techs 2/4/6/8/10 günstiger (je Zeitalter,
  im Marathon doppelt)" und „… eine verfügbare Technologie des Mittelalters oder früher
  umsonst erforschen (Marathon)" – in Kopfzeile, Weltblatt, Draft und Regelbogen; der
  Techtext der Methode heißt im Marathon „Techkosten −4/−8/−12/−16/−20 (je Zeitalter, im
  Marathon doppelt)". Der Marathonhinweis im Regelbogen und im Aufbau nennt beides.
* **KI:** Kosten (`techCost`) und Gratisauswahl (`freeTechOptions`) sieht sie von selbst.
  Ihr fester Zuschlag für die Methode (`kiTechBonus`) ist im Marathon verdoppelt – doppelte
  Ersparnis, doppelter Wert (Auslegung, nicht gesondert gemessen).

* **Draftwerte der KI neu gemessen** (`KI_DRAFT_BASE`): 200 Marathonpartien nach den Regeln
  von v85, vier KI Schwer, je Reich zwei zufällig zugeteilte Fähigkeiten, Startspieler
  reihum – alle 200 ohne Fehler zu Ende (Forschung 133, Wirtschaft 60, Militär 7; Runde 5
  bis 12). Bedingtes Logit wie in v83, jetzt mit dem Platz in der Zugfolge als eigener
  Größe; Bereiche aus 40 Bootstrap-Stichproben.

  | Fähigkeit | Siege / Besitzer | Stärke (90 %-Bereich) | Grundwert v83 → v85 |
  |---|---|---|---|
  | Kolonisten (England) | 105 / 139 | +4,1 (3,8 … 5,0) | 15 → 14,5 |
  | Freie Forschung (Griechenland) | 43 / 144 | +1,0 (0,7 … 1,5) | 7,5 → 8,5 |
  | Rückschau (Griechenland) | 38 / 142 | +0,5 (0,0 … 1,1) | 4,5 → 7 |
  | Handelsreich (England) | 29 / 127 | −0,2 (−0,7 … 0,3) | 8 → 5,5 |
  | Fruchtbarkeit (Russland) | 27 / 126 | −0,3 (−0,7 … 0,1) | 2,5 → 5 |
  | Günstige Forschung (Griechenland) | 30 / 140 | −0,5 (−0,9 … −0,1) | 5 → 5 |
  | Beutezüge (Wikinger) | 25 / 147 | −0,5 (−1,0 … −0,1) | 3,5 → 5 |
  | Siedlertrecks (Russland) | 30 / 141 | −0,5 (−0,8 … −0,2) | 2,5 → 3 |
  | Seemacht (England) | 21 / 127 | −0,6 (−1,1 … −0,1) | 2 → 2 |
  | Seefahrer (Wikinger) | 18 / 112 | −0,9 (−1,4 … −0,3) | 6,5 → 4 |
  | Kriegerkultur (Wikinger) | 18 / 139 | −0,9 (−1,5 … −0,5) | 7,5 → 3,5 |
  | Taiga (Russland) | 16 / 116 | −1,2 (−1,8 … −0,6) | 1 → 0 |

  Grundwert = 6 + 2,5 · Stärke, auf halbe Punkte gerundet; bei Taiga, Seemacht,
  Siedlertrecks und Kolonisten abzüglich dessen, was die Karte im Mittel dazugibt (2,8 /
  2,4 / 1,5 / 1,5) – dieselbe Zuordnung, die v83 von Hand getroffen hatte, jetzt als Regel.
  **Für Griechenland:** Die Freie Forschung bleibt trotz der Grenze die zweitstärkste
  Fähigkeit (die KI holte sich 384-mal eine Technologie des Mittelalters umsonst, 67-mal eine
  der Antike), die Günstige Forschung bleibt trotz doppeltem Abzug unter der Mitte. Dass sich
  die Tabelle sonst stärker bewegt – Kriegerkultur und Handelsreich nach unten, Rückschau und
  Fruchtbarkeit nach oben –, liegt an fünfmal so vielen Partien und an den Regeln von v84
  (zwei Hauptstädte, Singularität 300, fünf Gründungen), nach denen bisher nicht gemessen
  war. Kolonisten bleiben weit vorn (Punkt 25 der offenen Punkte). Ob die KI mit der neuen
  Tabelle besser draftet als mit der alten, ist nicht gegeneinander gemessen. Platz in der
  Zugfolge im Marathon: Siege 56 / 70 / 38 / 36 vom Startspieler an – flacher als auf der
  Plättchenkarte.
* **Die KI spielt den Marathon von v85** (Draft der KI mit der neuen Tabelle): 20 ganze
  Partien – 16 mit vier KI Schwer, 4 mit zwei KI Mittel und zwei Bots –, alle ohne Fehler zu
  Ende, Runde 6 bis 12: Forschung 17, Wirtschaft 3, Militär 0; eine erste Hauptstadt fiel in 6
  der 20. Längster KI-Zug 3,8 s (61 Städte auf der Karte, zwei Partien gleichzeitig auf dem
  Testrechner).

### Startausgleich

* `START_BONUS_COINS` = [0, 1, 2, 3] nach dem Platz in der Zugfolge vom Startspieler aus
  (`turnPosition`), in `beginTurn` nach dem Einkommen der ersten Runde aufgeschlagen
  (`startBonus`), im Protokoll: „Startausgleich: +2 Münzen (3. in der Zugfolge)."; der
  Regelbogen nennt die Regel.
* **Auslegungen:**
  - Platz = Zugfolge ab dem Startspieler, nicht Zivilisation oder Platz im Aufbau;
  - **Bots bekommen nichts** – nach den Bot-Regeln zahlen sie nichts, Münzen nützen ihnen
    nicht. Ihr Platz zählt trotzdem: Ein Mensch hinter einem Bot bekommt den Betrag seines
    Platzes. Die KI bekommt den Ausgleich wie ein Mensch;
  - Münzen wie jedes Einkommen: nur in diesem Zug gültig;
  - im Tutorial ändert sich nichts (der Mensch beginnt, die anderen sind Bots).
* **Gemessen:**

  | Sieganteil nach Platz in der Zugfolge (%) | v84 | v85 ohne Ausgleich | **v85** | Empfindlichkeit |
  |---|---|---|---|---|
  | Duell (600 Partien) | 74,2 / 25,8 | 74,3 / 25,7 | **72,0 / 28,0** | Zweiter +3 Münzen: 68,4 / 31,6 |
  | zu dritt (400) | 45,0 / 32,3 / 22,8 | 45,5 / 32,8 / 21,8 | **45,1 / 34,5 / 20,4** | – |
  | zu viert (600) | 42,7 / 33,8 / 19,3 / 4,2 | 42,7 / 33,8 / 19,3 / 4,2 | **37,5 / 34,7 / 21,8 / 6,0** | 0/2/4/6 Münzen: 37,7 / 31,5 / 25,3 / 5,5 |

  KI Schwer gegen KI Schwer, sonst wie oben; Standardfehler je Anteil etwa 2 Punkte (zu
  dritt 2,4). Der Ausgleich wirkt in die richtige Richtung – im Duell etwa 2 Punkte je Münze
  für den Zweiten, zu viert 5 Punkte weniger für den Startspieler –, **das Gefälle bleibt
  aber steil**: zu viert gewinnt der Vierte 6 % der Partien, der Startspieler 37 %; zu dritt
  ist keine Wirkung messbar. Der doppelte Ausgleich (0/2/4/6) hilft zu viert dem Dritten,
  nicht dem Vierten.
  Gegen den Bot David (400 Duelle) gewinnt die KI als Zweite 33,5 % – mit und ohne Ausgleich
  dieselbe Zahl in anderen Partien –, als Erste 61,5 % (der Bot bekommt nichts). Woran der
  Startvorteil hängt, ist nicht gemessen; zu viert endet die Partie meist militärisch (508
  von 600), und diese Siege holt der Startspieler am häufigsten (186, der Vierte 28). Alles
  KI gegen KI – wie stark der Vorteil zwischen Menschen ist, zeigt erst das Spielen.

### Abgesichert

`test.js`: Wirtschaftssieg erst am Rundenende (kein Anspruch mitten in der Runde, Sieg mit
dem Stand am Rundenende, wieder unter der Schwelle kein Sieg), schon am Ende von Runde 1 (auch
4 von 5 im Duell), sofort entschieden, mit Punktvergleich neben Singularität und Kultursieg
derselben Runde, Militärsieg schlägt weiterhin jeden Anspruch; Marathon: beide Rabatte
doppelt (Papier, Chemie, Singularität, einzeln und zusammen), normal unverändert, Freie
Forschung bis Mittelalter (Chemie nicht, Papier ja), normal bis Industrialisierung, Texte von
Fähigkeit und Methode in beiden Spielarten, der verdoppelte KI-Zuschlag; Startausgleich zu
viert, dritt und zweit, ab einem anderen Startspieler, nur in Runde 1, Bots nicht, KI schon,
Protokoll. `smoke.js`: Regelbogen im Marathon mit doppelten Rabatten, Freier Forschung bis ins
Mittelalter, Startausgleich und Rundenende (deutsch und englisch, ohne fehlende Übersetzung);
im normalen Spiel die alten Texte und der Ausgleich der beiden KI im Protokoll.

## Ökologie übers ganze Reich · Bürokratie auch für Handelsrouten, Ökologie und Gentechnik (v86)

**Anweisung des Autors (18.10.):**
1. Ökologie soll für die Gesamtbevölkerung wirken, nicht nur je Stadt – vier Städte mit je
   1 Bevölkerung sollen sie zweimal auslösen, nicht keinmal.
2. Bürokratie soll auch das Einkommen aus Handelsrouten, Ökologie und Gentechnik betreffen,
   „da sie eigentlich Teil der Hauptstadt sind".

### Ökologie

* +1 auf alle drei Erträge je **zwei Bevölkerung des ganzen Reichs**, einmal abgerundet
  (`incomeBreakdown`). Bis v85 je Stadt abgerundet: 5 + 3 Bevölkerung gaben +3, jetzt +4;
  vier Städte mit je 1 Bevölkerung gaben nichts, jetzt +2. Beim Abrunden geht höchstens
  noch ein halber Punkt verloren, nicht mehr bis zu einem halben je Stadt.
* Der Posten steht weiter in der Bevölkerungszeile der Ertragsübersicht; sein Nahrungsanteil
  senkt also wie seit v69, was die Bevölkerung isst (`popFoodCost`, das Füttern mit
  Gentechnik/Massenmedien).
* **Revolution** (Ereignis, „die Hauptstadt produziert nichts"): Die Bevölkerung der
  Hauptstadt zählt nicht mit – wie bis v85, als ihr Anteil in der Hauptstadtzeile ausfiel
  (Auslegung).
* Bots bekommen Ökologie wie bisher. Techtext: „+1 auf alle Erträge je 2 Bevölkerung im
  ganzen Reich (abrunden)", englisch „… across the empire …".

### Bürokratie

* Verdoppelt wie bisher Felder und Bevölkerung der Hauptstadt, **dazu jetzt ganz**:
  Handelsrouten (Straße +2, Eisenbahn +4 je verbundener Stadt), die Ökologie des ganzen
  Reichs und den Nahrungsposten der Gentechnik. Ein Faktor `buro` in `incomeBreakdown` an
  diesen Stellen.
* **Gentechnik hing schon vorher an der Bürokratie, nur indirekt:** Ihr Posten wird aus der
  Wissenschaftssumme gerechnet, in der die verdoppelte Wissenschaft der Hauptstadt schon
  steckt. Jetzt wird der Posten selbst noch einmal verdoppelt (so verstanden: „Bürokratie
  soll auch das Einkommen aus der Gentechnik betreffen"). Beispiel (Originalkarte,
  Startwert 7, Griechenland, nur die Hauptstadt mit 8 Bevölkerung): ohne Bürokratie 8
  Wissenschaft → 2 Nahrung; mit Bürokratie 16 Wissenschaft → bis v85 4 Nahrung, jetzt
  2 × 4 = 8.
* **Nicht verdoppelt** (nicht genannt): Wallfahrt (+3 je Wunder), Seemacht – auch nicht der
  Bonus der Hauptstadt selbst, wenn sie am Meer liegt –, die Beute der Wikinger und der Taj
  Mahal, der ohnehin das ganze Einkommen verdoppelt.
* **Revolution:** Felder und Bevölkerung der Hauptstadt produzieren nichts, wie bisher.
  Handelsrouten, die Ökologie der übrigen Städte und die Gentechnik laufen weiter und bleiben
  mit Bürokratie verdoppelt (Auslegung). Wer sie als „Teil der Hauptstadt" auch bei einer
  Revolution ausfallen lassen will: drei Stellen in `incomeBreakdown`.
* **Anzeige:** In der Ertragsübersicht heißen die Zeilen mit Bürokratie „Handelsrouten
  (Bürokratie ×2)" und „Gentechnik (Bürokratie ×2)"; die Ökologie steckt wie bisher in der
  Bevölkerungszeile. Techtext: „Hauptstadt produziert doppelt, dazu Handelsrouten, Ökologie
  und Gentechnik". Im Regelbogen steht hinter dem Absatz zu den Handelsrouten (Wortlaut vom
  Autor, v81, unverändert) ein Satz mehr: „Mit Bürokratie zählt das doppelt."
* Nebenbei: Die Zeilen „Handelsrouten" und „Wallfahrt" der Ertragsübersicht blieben auf
  Englisch deutsch – jetzt „Trade routes" und „Pilgrimage".

### KI

Sie bewertet Technologien und Aktionen über das Einkommen (`kiValue`, `baseIncome`) und hat
für Bürokratie und Ökologie keinen festen Zuschlag – beide Änderungen sieht sie also von
selbst, auch beim Straßenbau für Handelsrouten. Nicht nachgestellt.

**Gemessen** (KI Schwer gegen KI Schwer, dieselben Startwerte in v85 und v86):

| | Duell (600 Partien) | zu viert (600) | Marathon (16, Draft der KI) |
|---|---|---|---|
| Siegarten v85 → v86 | Forschung 225 → 234, Militär 198 → 193, Wirtschaft 177 → 173 | Militär 508 → 511, Forschung 78 → 80, Wirtschaft 14 → 9 | Forschung 11 → 12, Wirtschaft 4 → 2, Militär 1 → 2 |
| mittlere Endrunde | 5,95 → 5,91 | 5,14 → 5,10 | 9,25 → 9,38 |
| gleiches Ergebnis | 414 von 600 | 469 von 600 | – |
| Ökologie erforscht | 40 % → 41 % der Reiche | 18 % → 19 % | 24 → 33 von 64 Reichen |

Auf der Plättchenkarte ändert sich wenig: Die Partien enden nach fünf, sechs Runden, Ökologie
kommt spät, große Reiche entstehen kaum. Im Marathon greifen beide Änderungen, und die KI
setzt das zusätzliche Geld in **Kolonien** um: gekaufte Felder in 16 Partien zusammen 149
(v85) gegen 722 (v86), in drei Partien ein Reich mit über 50, höchstens 215.

**Tempo:** Mit so vielen Kolonien wurden späte KI-Züge langsam – bis 10 s allein auf dem
Testrechner (15 s, als drei Messungen gleichzeitig liefen; v85 höchstens 5,7 s). Die Ursache
lag schon in v84/v85, sie wurde nur jetzt sichtbar: Auf denselben Spielständen brauchte v85
genauso lange. Drei Stellen sind jetzt schneller, **ohne andere Ergebnisse**:
* `kiSitesAll`: Kolonien nur noch prüfen, wenn das Feld überhaupt als Siedelplatz in Frage
  kommt (`kiSiteOk`, dieselbe Prüfung wie danach), und alle Entfernungen aus einer Wegtabelle
  (`withFoundTable`) statt je Feld eine eigene Wegsuche samt fremdem Gebiet;
* `controlledTiles`: die Stadtfelder einmal als Menge statt je Feld `cityAt` über alle Städte;
* `incomeBreakdown`: Hauptstadt und Ertrag je Geländeart einmal je Rechnung (`tileYieldAt`
  mit `pre`).
Geprüft: dieselben Endstände über 10 ganze Partien (4 Marathon mit gemischten Stufen, Bot,
Ereignissen und Wundern, 6 zu viert auf der Plättchenkarte) und dieselben Ergebnisse auf fünf
gespeicherten Zügen; die 16 Marathonpartien von oben enden gleich (Sieger, Siegart, Runde,
Punkte). Die langsamsten Stände: 9,4 → 4,3 s, 9,5 → 5,1 s, 7,1 → 5,4 s, 6,4 →
4,8 s; ohne Kolonien unverändert (2,9 s). Längster KI-Zug in den 16 Marathonpartien jetzt
5,2 s (zwei Partien gleichzeitig).

### Abgesichert

`test.js`: Ökologie bei 1, 2 und 5 Bevölkerung, übers Reich gezählt (5 + 3 → +4, das Beispiel
des Autors vier Einzelstädte → +2, drei Bevölkerung → +1), mit Bürokratie ganz doppelt (+8,
+4), Bevölkerungskosten (5 → 3, vier Einzelstädte 4 → 2), Zeile und Summe, Revolution (nur
die übrigen Städte), Hungersnot, Wirtschaftskrise, Bots, Techtext deutsch und englisch;
Bürokratie: Handelsroute über Straße +1 → +2, über Eisenbahn +4, Hinweis in der Zeile,
Revolution, Gentechnik doppelt aus der schon verdoppelten Wissenschaft, Zeilen und Summe,
Wallfahrt und Seemacht nicht, Techtext; Regelbogen: Handelsroute +2, mit Bürokratie +4.
`smoke.js`: Ertragsübersicht mit „Handelsrouten (Bürokratie ×2)" und +4, englisch „Trade
routes (Bureaucracy ×2)" ohne fehlende Übersetzung; der neue Satz im Regelbogen, deutsch und
englisch.

## Fähigkeiten statt Erträge · „Weiter" oben und unten · Rückschau ohne Wahl · Blätter hochkant (v87)

**Wunsch des Autors (18.10.):**
1. Im Blatt eines Bot- oder KI-Zugs „Weiter" oben **und** unten – bei langem Protokoll muss man
   sonst jedes Mal erst ans Ende scrollen.
2. „Erträge" zeigt dasselbe wie „Stadt gründen": weg damit, an seiner Stelle **„Fähigkeiten"** –
   der Ort für besondere Zivilisationsfähigkeiten (Griechenlands Freie Forschung, Rückschau);
   mit Verbundwerkstoffen „Alle Städte kostenlos wachsen" (das kostenlose Wachstum in jeder
   Stadt, statt durch alle Städte zu gehen); „Alle Städte wachsen" mit den Kosten am Knopf; mit
   Sklaverei (solange nicht obsolet) „alle Städte opfern"; dazu jede Art des Kopierens. Sind
   kostenlose Aktionen offen (Fähigkeiten, kostenloses Wachstum, Internet), steht an
   „Fähigkeiten" eine Zahl – je Art, nicht jedes kostenlose Wachstum einzeln.

### „Weiter" oben und unten

* Neben dem Titel des Blatts (`.bot-head`, `#bot-next-top`) und wie bisher darunter
  (`#bot-next`); beide rufen `afterAutoTurn`. Das Schließen-Kreuz ist in diesem Blatt ohnehin
  ausgeblendet, die Ecke also frei.
* Das Blatt beginnt oben (`scrollTop = 0` in `runBots`). Sonst bliebe die Scrollstelle des
  vorigen Blatts stehen: wer dort unten „Weiter" getippt hat, sähe beim nächsten Bot den oberen
  Knopf nicht.
* Nicht mitlaufend (sticky) – gewünscht war oben und unten; wer liest, findet „Weiter" am Ende.

### Fähigkeiten

* Knopf in der Leiste an der Stelle von „Erträge" (`a-abil`), öffnet ein Blatt (`abilSheet`)
  wie „Macht". Gesperrt, wenn kein Mensch am Zug ist oder die Partie vorbei ist; im Tutorial zu
  (er steht in `TUT_BAR`, und kein Schritt gibt ihn frei – „Alle Städte wachsen" wäre ein Weg
  an den Schienen vorbei).
* **Inhalt**, je nachdem, was das Reich hat:
  1. **Deine Fähigkeit(en)** – Name und Wirkung (`abilEffect`). Auf dem iPad stand bisher nur
     der Name in der Kopfzeile; die Wirkung lag im `title` (ohne Maus nicht lesbar) und im
     Weltblatt. Aktiv: **Freie Forschung** (die Wahl, sonst der Grund: schon genutzt, Dunkles
     Zeitalter, nichts verfügbar) und **Rückschau** (die offene Wahl, sonst wie sie entsteht –
     „nur im selben Zug"). Im Marathon doppelt gedraftet, steht eine Fähigkeit einmal da.
  2. **Kostenlose Technologie** aus Wundern (Bibliothek, Oxford, Raumfahrt). Das Fenster dazu
     geht weiter von selbst auf (Zugbeginn, nach dem Bau); hier bleibt die Wahl greifbar, wenn
     man es geschlossen hat – bis v86 ging das erst zu Beginn des nächsten Zugs wieder.
  3. **Wachstum:** „Alle Städte kostenlos wachsen" (mit Verbundwerkstoffen) und „Alle Städte
     wachsen".
  4. **Sklaverei:** „In allen Städten opfern", nur solange sie nicht obsolet ist.
  5. **Technologien kopieren:** Spionage bzw. Kundschafterei (den Preis nennt der Text der
     Technologie) und die Gratiskopie per Internet, je Technologie mit Wirkung und den Reichen,
     die sie haben.
* **Aus dem Technologiebogen ausgezogen:** Freie Forschung, Rückschau und Kopieren standen bis
  v86 unter dem Bogen – auf dem iPad erst nach Scrollen zu sehen. Der Bogen zeigt jetzt nur
  noch die Forschung.
* **Die Zahl am Knopf** (`freeActions`, engine.js): die Arten kostenloser Aktionen, die gerade
  gehen – Freie Forschung, Rückschau, Wunder-Technologie, kostenloses Wachstum,
  Internet-Kopie. Je Art eins: fünf Städte mit kostenlosem Wachstum zählen einmal, zwei offene
  Rückschau-Ansprüche auch. Nur, was sich nutzen lässt: kostenloses Wachstum, das in jeder
  Stadt an der Nahrungsgrenze scheitert, oder eine Internet-Kopie ohne etwas zu kopieren
  zählen nicht. Dieselben Knöpfe sind im Blatt hervorgehoben (`.opt.free`). Gerechnet bei
  jedem Zeichnen; gemessen mit 60 Städten an der Nahrungsgrenze (jede Stadt wird geprüft)
  15–18 ms in Node, sonst meist nach der ersten Stadt fertig.
* **Auslegung – Wunder-Technologien zählen mit**, obwohl der Autor „Zivilisationsfähigkeiten,
  kostenloses Wachstum, Internet" nannte: Sie sind derselbe Anspruch wie die Freie Forschung
  (eine Technologie gratis), und ihre Wahl war nach dem Schließen des Fensters bis v86 gar
  nicht mehr zu erreichen. Bezahltes (Wachsen, Kopieren, Sklaverei) zählt nie.
* **Auslegung – „Alle Städte wachsen" steht immer da**, nicht erst mit Verbundwerkstoffen: die
  Abkürzung hilft mit und ohne.

### Sammelaktionen: alle Städte wachsen, in allen Städten opfern

* **Keine neue Regel.** `growAll` und `sacrificeAll` (engine.js) rufen Stadt für Stadt
  `growCity` bzw. `sacrifice` – dieselben Prüfungen, Preise und Protokollzeilen wie der
  Einzelknopf. Die KI braucht keinen Kandidaten: sie erwägt jede Stadt ohnehin einzeln.
* **Reihenfolge (Auslegung):** von der kleinsten Stadt an, gleich große in der Reihenfolge der
  Städte (`growAllOrder`). Wachstum kostet je Bevölkerung – reichen die Mittel nicht für alle,
  wachsen so die meisten.
* **Teilweise (Auslegung):** Was an einer Stadt scheitert – schon gewachsen, in dieser Runde
  gegründet, Sturmflut, Nahrungsgrenze, zu wenig Mittel –, wird ausgelassen, die übrigen
  wachsen. Vorher steht am Knopf, wie viele es werden („2 von 3 Städten") und der häufigste
  Grund für den Rest; geht keine, ist er gesperrt und nennt den Grund. Die Alternative „alle
  oder keine" hieße: eine einzige zu teure Stadt, und man tippt wieder jede einzeln an.
* **Kosten am Knopf:** was tatsächlich abgeht, wie seit v82 überall („3🌾 9🪙", wenn Münzen für
  fehlende Nahrung einspringen); mit „Kosten ohne Umtausch anzeigen" der Preis, die Summe der
  Einzelpreise. Gerechnet wird nicht über eine Summe (`costPaid`): die Sammelaktion läuft auf
  einer Wegwerfkopie (`growAllPlan`, `stateCopy`), denn welche Städte wachsen, hängt an Vorrat
  und Nahrungsgrenze nach jedem einzelnen Schritt. Wachsen alle, ist das Bezahlte genau, was
  `costPaid` für die Summe sagt (gemessen an 2847 zufälligen Ständen mit England, Alchemie,
  Gilden, Computertechnik, Fruchtbarkeit, Dampfmaschine – keine Abweichung).
* **Ein Klick, ein Schritt je Stadt.** Mit Keramik (zwei bezahlte Schritte je Runde) lässt ein
  zweiter Klick jede Stadt noch einmal wachsen, zum neuen Preis.
* **Nebenbei bemerkt, nicht im Blatt erklärt:** Wer erst bezahlt und dann kostenlos wachsen
  lässt, zahlt weniger – der Preis hängt an der Bevölkerung vor dem Schritt. Das gilt für die
  Einzelknöpfe genauso.
* **Opfern:** in jeder Stadt mit mindestens 2 Bevölkerung, die diese Runde noch nicht geopfert
  hat, je eine – unabhängig voneinander, also ohne Reihenfolge. Am Knopf der Ertrag (+7 🪙 je
  Stadt). Die Prüfung ist aus `sacrifice` herausgelöst (`sacrificeError`), sonst unverändert.
* **Nie zugleich:** Verbundwerkstoffe ist eine Technologie der Moderne, und mit der Moderne wird
  Sklaverei obsolet – „Alle Städte kostenlos wachsen" und „In allen Städten opfern" stehen nie
  zusammen im Blatt.

### „Erträge" entfallen

* Knopf, Umschalter (`showYields`, `toggleYields`), die gemerkte Wahl (`hochciv.yields`, wird
  beim Start gelöscht) und `viewerOf` (die Sicht des Menschen während Bot-Zügen) sind weg. Die
  Chips je Feld zeichnet weiter `yieldChips` – im Gründungsmodus, den es nur im eigenen Zug
  gibt.
* Damit stehen alle Knöpfe der Leiste in `TUT_BAR`; „Erträge" war der einzige, der im Tutorial
  und im Bot-Zug immer frei war.

### Rückschau: ein Anspruch ohne Wahl blockierte die übrigen (Fehler, beim Umbau gefunden)

* Rückschau gibt je erforschter Technologie ab dem Mittelalter einen Anspruch auf eine
  Technologie eines früheren Zeitalters desselben Feldes; die Ansprüche warten in einer
  Schlange (`p.backPicks`) und verfallen zum Zugende. Gewählt wurde immer aus dem **ersten**.
  War für ihn nichts mehr übrig – alle früheren Technologien des Feldes schon erforscht –,
  blieb er vorn stehen, und **jeder weitere Anspruch desselben Zugs war verloren**.
  Nachgestellt: Griechenland mit Rückschau, die ganze Antike der Forschung erforscht, dann
  Papier (Forschung, Mittelalter: leerer Anspruch) und Segeln (Produktion: hätte die Antike der
  Produktion zur Wahl) – es gab nichts zu wählen, weder im Bogen noch für die KI.
* Jetzt gilt der erste Anspruch, aus dem sich noch etwas wählen lässt (`backPick(p, S)`); der
  leere bleibt liegen und verfällt zum Zugende wie bisher. Ohne Spielstand liefert `backPick(p)`
  weiter den ersten. Betrifft auch die KI (sie wählt über `backPickOptions`/`useBackPick`) –
  nicht nachgemessen, der Fall ist selten.

### Hochkant lag jedes Blatt außerhalb des Bildschirms (Fehler, beim Prüfen gefunden)

Beim Ansehen der neuen Blätter in Chromium mit Hochformat-Viewport (820 × 1180, die App
dreht sich selbst quer): Stadtblatt, Macht, Fähigkeiten und das Blatt eines KI-Zugs lagen
rechts außerhalb des Bildschirms – in v86 genauso. Ursache: `setBarHeight` setzt `--bar-h`
und `--hud-h` aus `getBoundingClientRect().height`, und das misst das Rechteck **nach** der
Drehung um 90°; dessen Höhe ist die Breite der Leiste. Gemessen 1180px statt 53px, das Blatt
endet „über" der Leiste, also jenseits des Rands. Im KI-Zug ist die Leiste außerdem gesperrt –
man kommt an „Weiter" nicht heran. Der Kommentar dort behauptete das Gegenteil („auch dann
korrekt, wenn die App gedreht dargestellt wird").

* Jetzt nimmt `setBarHeight` gedreht (`turning()`) die Breite des Rechtecks – quer wie bisher
  die Höhe. Geprüft in Chromium: iPad hochkant und quer, Telefon hochkant und quer – das Blatt
  „Fähigkeiten" und beide „Weiter" sind antippbar, ein echter Klick oben führt weiter.
* **Kandidat für den gesperrten Bildschirm nach KI-Zügen** (v80, Offener Punkt 19): genau
  dieses Bild, wenn das iPad hochkant gehalten wurde. Nicht belegt.
* `smoke.js` gibt die gemessenen Rechtecke vor (jsdom kennt kein Layout): gedreht 53 × 1180 →
  `--bar-h` 53px; Gegenprobe mit der alten Rechnung: 1180px.

### Nebenbei: ein Smoke-Schritt hing am Zufall

„Kosten (v82): das Beispiel des Autors" startete seine Partie mit den Ereignissen, die frühere
Schritte eingeschaltet hatten. Eine Hungersnot in der ersten Runde macht Nahrung doppelt so
teuer, und der Schritt (samt dem nächsten) schlug grundlos an – gesehen beim Prüfen von v87
(„8🌾 8🪙" statt „8🌾 4🪙"). Er startet jetzt ohne Ereignisse, wie die KI-Schritte.

### Abgesichert

`test.js`, Block „Fähigkeiten: Sammelaktionen (v87)" und die drei folgenden: Reihenfolge
(kleinste zuerst, Gleichstand nach Städten); „alle wachsen" = jede einzeln, Stadt für Stadt
bezahlt, mit Standardkurs, Alchemie, Gilden und Handelsreich; die Vorschau ändert nichts und
sagt dasselbe wie die Tat (Anzahl, Gründe, Preis, Abgang); genug Mittel (Preis 2 + 3 + 4),
zweiter Klick, Keramik; knappe Mittel (die zwei kleinen); Nahrungsgrenze (genau die kleinste,
Gründe, Gentechnik hebt sie auf); kostenlos (kein Abzug, einmal je Stadt, Nahrungsgrenze);
neue Stadt ausgelassen; häufigster Grund. Opfern: `sacrificeError` je Stadt, alle Städte, einmal
je Runde, obsolet in der Moderne. `freeActions`: Freie Forschung, kostenloses Wachstum in zwei
Städten als eine Art, Nahrungsgrenze und Massenmedien, Internet nur mit etwas zu kopieren,
bezahltes Kopieren und Sklaverei nicht, vier Arten zusammen. Rückschau: der nachgestellte Fall,
`backPick` mit und ohne Spielstand, Gegenprobe nach der alten Regel.
Gegenproben (je eine Stelle absichtlich falsch): `backPick` nach der alten Regel, kostenloses
Wachstum je Stadt gezählt, ohne Sortierung, Nahrungsgrenze in der Zahl vergessen, Vorschau auf
dem echten Spielstand, Opfern ohne Prüfung – jede schlägt an.

`smoke.js`: Bot-Blatt mit „Weiter" oben (neben dem Titel) und unten, alle Bots allein über den
oberen Knopf, „Fähigkeiten" im Bot-Zug zu und ohne Zahl, auch wenn der Bot etwas gratis offen
hätte; Leiste mit „Fähigkeiten" an der Stelle von „Erträge", in `TUT_BAR`, Zahl 1 → 3, bezahltes
Kopieren zählt nicht, genau die drei Arten im Blatt hervorgehoben, Zahl sinkt nach Gebrauch;
Freie Forschung und Rückschau nur noch hier (nicht im Bogen), Wahl = Regelmaschine, danach
weg; „Alle Städte wachsen" mit „3🌾 9🪙" am Knopf, „5🌾 5🪙" ohne Umtausch, „2 von 3 Städten"
samt Grund, genau das abgebucht, danach gesperrt; kostenlos ohne Abzug; Opfern „+7🪙", „1 von 2
Städten", danach gesperrt, ab der Moderne weg; englisch ohne fehlende Übersetzung samt
Wunder-Technologie; Gratiskopie mit Wirkung und Besitzern, deutsch und englisch, einmal je
Runde; Erträge nur noch im Gründungsmodus, Umschalter und gemerkte Wahl weg; Tutorial: Leiste
samt „Fähigkeiten" in Leseschritten zu, nach „Fertig" frei; gedreht `--bar-h`/`--hud-h` 53/61px
statt der gedrehten Breite.
Gegenproben: oberer Knopf ohne Wirkung, „Fähigkeiten" nicht in `TUT_BAR`, Preis statt Abgang
am Knopf, Zahl auch im Bot-Zug, die alte Höhenmessung gedreht – jede schlägt an.

`check_single.js` öffnet in der Einzeldatei „Fähigkeiten" (Marathon, gedraftete Fähigkeiten).
Sichtkontrolle in Chromium: iPad quer und hochkant (gedreht), Telefon quer und hochkant,
deutsch und englisch – Blatt, Zahl an der Leiste, beide „Weiter".

## Ertragstechnologien schließen die billigeren ein · Belagerungsmaschinen +3 · Singularität 120 · Übersicht ohne Bürokratie-Zusatz · „Ne Runde Civ?" (v88)

**Wunsch des Autors (21.10.):**
1. Ertragstechnologien: Der Nutzen der niedrigeren Technologien desselben Feldes auf einem
   Gelände steckt in den höheren. Mit Mathematik bringt Wald +1 Wissenschaft, mit Elektrizität
   +2, mit Künstlicher Intelligenz +3 – wer alle drei hat, bekommt trotzdem nur +3, die
   Technologie setzt den Ertrag. Ebenso die Bevölkerungstechnologien. Hat ein Feld in der
   Produktion zwei verschiedene Boni, stapeln sie trotzdem (Containerlogistik setzt das Meer
   auf 2 Nahrung, 1 Münze).
2. Belagerungsmaschinen nur noch +3.
3. Der Bürokratie-Bonus soll nicht im Text der Ertragsübersicht stehen.
4. Hauptmenü: „Ne Runde Civ? …" statt „Civilization" (Urheberrecht).
5. Singularität im normalen Modus 120.

### Ertragstechnologien

* **Die Regel:** Je Ziel – eine Geländeart oder „je Bevölkerungspunkt" – und je Feld des
  Technologiebogens bilden die Ertragstechnologien eine Kette, nach Kosten geordnet. Jedes
  Glied bringt die Summe aller Zuwächse bis zu sich; es zählt nur das teuerste erforschte.
  Ketten verschiedener Felder addieren sich.

  | Ziel | Feld | Kette (Bonus mit diesem Glied) |
  |---|---|---|
  | Wald | Forschung | Mathematik +1 🔬 → Elektrizität +2 🔬 → Künstliche Intelligenz +3 🔬 |
  | Grasland | Forschung | Papier +1 🔬 → Biologie +2 🔬 |
  | je Bevölkerung | Forschung | Schrift +1 🔬 → Universitätswesen +2 🔬 |
  | Meer | Produktion | Fischerei +1 🌾 → Segeln +2 🌾 → Containerlogistik +2 🌾 +1 🪙 |
  | Grasland | Produktion | Landwirtschaft +1 🌾 → Grüne Revolution +1 🌾 +1 🪙 |
  | je Bevölkerung | Produktion | Fließband +1 🪙 → Robotik +2 🪙 |
  | einzeln | | Astronomie (Meer 🔬), Buchdruck (Fluss 🔬), Chemie (Gebirge 🔬) · Bewässerung (Gebirge 🌾), Mühlentechnik (Fluss 🪙), Kunstdünger (Wald 🌾) |

* **Auslegung – „stapeln trotzdem":** Gelesen als: verschiedene Ertragsarten einer Kette
  stecken beide im höheren Glied (Containerlogistik = die Nahrung von Fischerei und Segeln
  plus die eigene Münze; ebenso Grüne Revolution = Nahrung der Landwirtschaft plus Münze) –
  genau das Beispiel des Autors. In der Forschung gibt es keine gemischten Ketten, dort ist
  alles Wissenschaft. Ketten **verschiedener Felder** addieren sich: Astronomie (Forschung)
  kommt zu Containerlogistik dazu (Meer +1 🔬 +2 🌾 +1 🪙 + Grundertrag), Papier zu
  Landwirtschaft. Die Alternative „je Ertragsart eine Kette" (Containerlogistik allein nur
  +1 🪙) widerspräche dem Beispiel.
* **Auslegung – „niedriger" heißt billiger im selben Feld**, nach den Grundkosten. Im alten
  Techtree (Tutorial) und im Marathon ist die Reihenfolge jeder Kette dieselbe – kein
  Glied wechselt dort den Platz (Schrift 1 statt 4, Biologie 15 statt 12, Landwirtschaft 1
  statt 5 ändern daran nichts); ein Test hält das fest.
* **Was gleich bleibt:** Wer eine Kette ganz erforscht hat, hat genau die Erträge wie bis
  v87, als jede Technologie +1 addierte. Anders ist es nur, wenn ein billigeres Glied fehlt:
  Elektrizität allein bringt dem Wald jetzt +2 statt +1, Containerlogistik allein dem Meer +2
  🌾 +1 🪙 statt +1 🪙, Robotik allein je Bevölkerung +2 🪙 statt +1. Umgekehrt bringt ein
  billigeres Glied, das man **nach** einem teureren erforscht, keinen Ertrag mehr dazu
  (Mathematik nach KI: +0) – zählt aber weiter als Technologie (Punkte, Zeitalter,
  Rückschau usw.).
* **Nicht aus Technologien:** Taiga (Russland, Wald +1 🌾) und der Große Leuchtturm (Meer
  +1 auf alles) addieren sich wie bisher.
* **Laufende Partien:** Die Regel gilt ab dem Laden auch für gespeicherte Spielstände (kein
  Schalter im Spielstand) – wie schon die Änderungen an Ökologie und Bürokratie in v86.
* **Umsetzung:** `YIELD_TECHS` (data.js) nennt je Technologie Ziel und eigenen Zuwachs,
  `YIELD_CHAINS` die Ketten mit den Summen, `yieldBonus` (engine.js) nimmt je Kette das
  höchste erforschte Glied. `tileYield` und `cityPopYield` lesen nur noch das; der `switch` mit
  den Technologien je Gelände ist weg. Die KI bewertet Technologien über das Einkommen
  (`kiValue`), sie sieht die neue Regel ohne eigene Änderung – auch, dass Mathematik nach KI
  nichts mehr bringt.
* **Texte:** Die Techtexte nennen die Summe und die eingeschlossenen Technologien („Wald: +3
  Wissenschaft (inkl. Mathematik, Elektrizität)", englisch „Forest: +3 science (incl.
  Mathematics, Electricity)"); die ersten Glieder und die einzelnen bleiben, wie sie waren.
  Der Regelbogen erklärt die Regel in einem Absatz unter der Geländetabelle.

### Belagerungsmaschinen +3

* `SIEGE_BONUS` = 3 (data.js; bis v87 stand die 5 fest in `attackValue` und in der
  KI-Rechnung `kiAttackPer`). Dynamit verdoppelt danach: (Macht + 3) × 2 je Armee.
* **Tutorial:** Der Schritt „Der Gegenangriff als Verteidigung" rechnet es vor – jetzt „+3
  Angriff gegen Städte" und „mit 6 statt 3" (3 Macht + 3) gegen die Verteidigung 3. Der Ablauf
  bleibt gleich: Der erste Treffer sitzt weiterhin, und der Bot zieht seine Armeen zur
  Hauptstadt zurück; die beiden festgepinnten Tutorialläufe in `test.js` sind unverändert.
* Die KI gewichtet die Technologie selbst weiter mit einem festen Zuschlag (`kiTechBonus`
  4) – nicht neu abgestimmt; ihre Angriffe rechnet sie mit dem neuen Wert.

### Singularität 120

* `SINGULARITY_BASE` = 120 (bis v87 100). Griechenland −5, Wissenschaftliche Methode −10 und
  der Kreml (+50 für alle) wirken wie bisher; im Marathon bleibt es bei 300.
* Gilt auch im Tutorial (alter Techtree – für die Singularität gab es dort nie eigene
  Kosten); die Texte dort nennen 120 bzw. 110 mit der Methode.

### Ertragsübersicht ohne „(Bürokratie ×2)"

* Die Zahlen bleiben verdoppelt (Hauptstadt, Handelsrouten, Ökologie, Gentechnik), nur der
  Zusatz am Zeilennamen entfällt – an beiden Zeilen, die ihn trugen (Handelsrouten,
  Gentechnik). `incomeBreakdown` hängt kein `note` mehr an, `yieldOverview` zeigt nur den
  Namen, der Schlüssel „Bürokratie ×2" ist aus `UI_EN` entfernt.
* **Nicht geändert (Auslegung):** Der Regelbogen sagt bei den Handelsrouten weiter „Mit
  Bürokratie zählt das doppelt.", und der Techtext der Bürokratie nennt Handelsrouten,
  Ökologie und Gentechnik – beides ist nicht die Ertragsübersicht, und ohne sie stünde die
  Regel nirgends.

### Hauptmenü

* „Ne Runde Civ? Auf dem Tablet, ohne Bleistift und Radiergummi." – „Runde" bleibt groß
  (Substantiv, wie bisher), sonst wörtlich. Englisch: „A round of Civ? On the tablet, without
  pencil and eraser."
* **Nicht geändert:** Die Frage zu Beginn des Tutorials („Hast du schon Erfahrung mit Spielen
  wie Civilization?") nennt den Namen weiter – nicht verlangt, eine Zeile in `ui.js`
  (`tutorialAsk`) und `UI_EN`, falls gewünscht.

### Gemessen: wie sich die Partien verschieben (alle drei Regeländerungen zusammen)

`tools_ki.js`, dieselben Startwerte mit v87 und v88 (Partien je Reihe, Siege der KI bzw. Siegarten):

| Reihe | v87 | v88 |
|---|---|---|
| `selbst 100` (KI gegen KI, Duell) | Forschung 41, Wirtschaft 31, Militär 28 · Endrunde Median 6 | Forschung 43, Wirtschaft 29, Militär 28 · Median 6 |
| `selbst 40 reiche=4` | Militär 30, Forschung 9, Wirtschaft 1 · Median 6 | Militär 34, Forschung 6 · Median 6 |
| `duell 60 diff=david` | KI 29, Bot 31 · Militär 33, Forschung 21, Wirtschaft 6 | KI 29, Bot 31 · Militär 33, Forschung 13, Wirtschaft 14 |
| `vier 40 diff=koenig` | KI 14, Bots 26 · Militär 38, Forschung 2 | KI 14, Bots 26 · Militär 37, Forschung 3 |

Die Siege der KI ändern sich in keiner Reihe; die Siegarten verschieben sich stellenweise (im
Duell gegen David weniger Forschungs-, mehr Wirtschaftssiege). Welche der drei Änderungen das
bewirkt, ist nicht getrennt gemessen, und die Reihen sind klein. KI-Zugzeit unverändert
(Median 20–26 ms; die Läufe teilten sich die Rechenzeit mit anderen, also grob).

### Abgesichert

`test.js`, Block „Ertragstechnologien (v88)" (gleich nach den Beispielen aus dem Regelheft):
die Beispiele des Autors (Wald 1/2/3 und mit allen dreien 3; Containerlogistik allein wie mit
Fischerei und Segeln; Segeln allein +2), verschiedene Felder addieren sich (Astronomie,
Papier/Biologie mit Grüner Revolution), je Bevölkerung (Universitätswesen und Robotik auch
ohne Schrift bzw. Fließband), Einzelglieder, Taiga dazu; alle Ertragstechnologien = die
Erträge bis v87; die Ketten selbst (Glieder, Summen, je Feld, jede Technologie genau einmal);
dieselbe Reihenfolge im alten Techtree und im Marathon; Gegenprobe ohne `YIELD_CHAINS` über 400
zufällige Techstände × 7 Ziele; jeder Techtext deutsch und englisch aus der Kette nachgerechnet.
Belagerungsmaschinen (7 + 3) je Armee, mit Dynamit verdoppelt, die KI-Rechnung gleich, Techtext
deutsch und englisch an `SIEGE_BONUS`, Tutorialtexte (lang und kurz, deutsch und englisch)
„+3" und „6 statt 3". Singularität 120 (Griechenland 115, mit Methode 105; Kreml 165/170;
Marathon 300), Tutorialtexte 120/110 an `techCost` im alten Techtree gebunden. Bürokratie:
keine Zeile trägt mehr `note`.
Gegenproben (je eine Stelle absichtlich falsch): Erträge wieder addiert wie bis v87 (9 Fehler),
ein Techtext mit falscher Summe, `SIEGE_BONUS` 5, die KI mit fester 5, `note` wieder an den
Handelsrouten, „8 statt 3" im Tutorial, Singularität 100, Ketten absteigend sortiert – jede
schlägt an.

`smoke.js`: die Handelsroutenzeile heißt mit Bürokratie schlicht „Handelsrouten" (dreimal 4)
bzw. „Trade routes", keine Zeile nennt die Bürokratie; neuer Schritt „v88": Hauptmenü
deutsch und englisch („Ne Runde Civ? …", „A round of Civ? …", kein „Civilization"), Meer mit
Containerlogistik allein 🌾2 🪙2 je Feld in der Ertragsübersicht, die neuen Texte im
Technologiebogen und im Regelbogen samt erklärendem Satz, Singularität 120 – deutsch und
englisch ohne fehlende Übersetzung.
Gegenproben: der Zusatz wieder an der Zeile, der alte Menüsatz, der Satz im Regelbogen
entfernt – jede schlägt an.

Sichtkontrolle in Chromium (iPad quer, deutsch und englisch; Telefon quer): Hauptmenü,
Technologiebogen mit den längeren Texten (Kacheln brechen sauber um, wie schon bei längeren
Texten), Ertragsübersicht mit Bürokratie ohne Zusatz, der Satz im Regelbogen unter der
Geländetabelle.

## Bots nicht mehr wählbar · Duell auf den festen Karten (Mehrspieler-Erweiterung)

**Bots.** Im Aufbau gibt es je Platz nur noch Mensch oder KI; die Zeile für die
Bot-Schwierigkeit ist weg. Die Bot-Regeln (`js/bots.js`) bleiben vollständig erhalten:
Spielstände mit Bots laufen weiter, das Tutorial spielt weiter gegen Bots. „Nochmal spielen"
nach einer Partie mit Bots setzt die KI ein, auf der Stufe, die dem Grad entspricht
(Siedler/Häuptling/Prinz → Leicht, König → Mittel, David → Schwer – die Zuordnung aus
`KI_LEVELS`). Der Mehrspielerserver füllt freie Plätze ebenfalls mit der KI und kann Partien
ganz ohne KI für zwei oder drei Menschen anlegen.

**Duell auf den festen Karten.** Im 1 gegen 1 stehen jetzt auch Originalkarte und Große
Karte zur Wahl, nicht nur die Plättchenkarte. Jedes Reich setzt seine Hauptstadt auf seinen
Stern, zwei Sterne bleiben leer – wie zu dritt einer. Die Sterne liegen auf der Originalkarte
7 bis 12 Felder auseinander, auf der Großen Karte 10 bis 20; kein Paar steht sich also auf
den Füßen. Die Duellschwellen hängen an `S.duel`, nicht an der Karte, und gelten auch hier.
Bewusst in Kauf genommen: die festen Karten sind für vier gebaut, zu zweit bleibt viel freies
Land – das Duell dauert dort eher länger. Die eigene Karte bleibt drei und vier Reichen
vorbehalten. `smoke.js` spielt ein Duell auf beiden festen Karten an.

## Meine Karten: eigene Karten mit Namen, auch im Mehrspielermodus (Mehrspieler-Erweiterung)

Vor der Mehrspieler-Erweiterung gab es genau eine eigene Karte (`hochciv.map`), und nur der lokale Aufbau kannte sie.
Jetzt liegen eigene Karten als Liste mit Namen im Browser (`hochciv.maps`, höchstens 30);
die alte Einzelkarte wird beim ersten Start übernommen (heißt sie noch wie eine feste Karte,
aus der sie gebaut wurde, dann „Eigene Karte"). Der Editor hat ein Namensfeld und „Meine
Karten" (Bearbeiten, Exportieren, Löschen, neue Karte, Datei importieren); gleicher Name =
dieselbe Karte, Speichern fragt vor dem Überschreiben.

**Spielbar ist, was `checkCustomMap` (engine.js) besteht** – dieselbe Regel im Browser und
auf dem Server, weil eine Karte im Mehrspielermodus vom Rechner des Hosts kommt: rechteckig,
4 bis 40 Felder je Richtung, nur Gelände aus `TERRAIN`, alle vier Zivilisationen mit
Hauptstadt auf begehbarem Land (kein Meer, kein Vulkan, kein „Kein Feld"), je zwei mindestens
3 Felder auseinander (wie beim Gründen). Weiter geht nur eine bereinigte Kopie: Name (ohne
spitze Klammern und Steuerzeichen, höchstens 40 Zeichen), Zeilen, Hauptstädte. Weil alle
vier Sterne verlangt sind, passt jede eigene Karte zu zwei, drei und vier Reichen – gespielt
wird sie wie eine feste Karte. Gespeichert wird nur eine spielbare Karte; laden (Datei) darf
man auch eine halbfertige und sie im Editor zu Ende bauen.

**Aufbau:** jede eigene Karte steht im Kartenmenü (Wert `karte:<Name>`), auch im Duell. Ein
Rezept von vor der Mehrspieler-Erweiterung mit dem Wert `eigene` nimmt die erste Karte der Liste.

**Mehrspieler:** In der Live-Lobby und beim Anlegen eines Rundenspiels gibt es „Eigene Karte";
der Host wählt aus „Meine Karten" oder lädt eine Datei. Der Server prüft die Karte beim
Setzen (Lobby) bzw. beim Anlegen (Rundenspiel) und noch einmal beim Spielstart; in Listen
der Rundenspiele steht nur ihr Name (`customMapName`), die Zeilen stehen im Spielstand.
Die Karten bleiben im Browser des Hosts – auf ein anderes Gerät kommen sie als Datei.

## Meine Karten im Spielerkonto, veröffentlichen mit Code (Mehrspieler-Erweiterung)

Mit dem Mehrspielerserver liegen eigene Karten im **Spielerkonto** (Tabelle `custom_maps`,
höchstens 30 je Konto, Name je Konto eindeutig). Das Spiel selbst bleibt ohne Server
spielbar: `js/ui.js` kennt nur den Haken `mapAccount`, den `mp.js` setzt; ohne ihn ist alles
wie ohne Server, die Liste im Browser (`hochciv.maps`) ist dann die einzige.

**Abgleich nach der Anmeldung.** Das Konto ist maßgeblich, die Liste im Browser sein Abbild:
gleichnamige Karten nimmt das Gerät aus dem Konto; Karten, die nur auf dem Gerät liegen,
gehen ins Konto – außer sie lagen beim letzten Abgleich auf diesem Gerät schon im Konto
(`hochciv.maps.synced.<Konto>`): dann wurden sie auf einem anderen Gerät gelöscht und
verschwinden auch hier. Speichern und Löschen im Editor gehen sofort ins Konto. Bewusst in
Kauf genommen: wer auf zwei Geräten dieselbe Karte ohne Verbindung ändert, behält beim
nächsten Abgleich die Fassung im Konto.

**Veröffentlichen.** Eine Karte bekommt einen **6-stelligen Code** aus 32 Zeichen ohne die
leicht verwechselten 0/O und 1/I (rund eine Milliarde Codes; beim seltenen Zusammenstoß
wird neu gewürfelt). Mit dem Code lädt **jeder** die Karte, auch ohne Konto – Groß-/
Kleinschreibung, Leerzeichen und Bindestriche zählen nicht. Der Code liefert immer die
aktuelle Fassung: speichert die Besitzerin die Karte neu, spielen alle danach die neue.
„Zurückziehen" macht den Code ungültig; ein neues Veröffentlichen gibt einen neuen Code.
Wer eine Karte per Code lädt, bekommt eine eigene Kopie in „Meine Karten" (und ins eigene
Konto, unveröffentlicht); heißt dort schon eine andere Karte so, hängt der Code am Namen.
Gezählt wird, wie oft andere eine Karte geladen haben (`loads`), die Besitzerin nicht.
Code-Abfragen sind auf 20 je Minute begrenzt, damit sich Codes nicht durchprobieren lassen.

**Lobbys.** In der Live-Lobby gibt der Host unter „Eigene Karte" einen Code ein (die Karte
wird sofort Karte der Lobby), beim Rundenspiel lädt „Karte mit Code laden" sie in „Meine
Karten" und wählt sie aus. Geprüft wird wie oben auf dem Server mit `checkCustomMap`.

**Konto löschen** löscht seine Karten, auch veröffentlichte – Partien, die schon laufen,
haben ihre Kopie im Spielstand. **Konten zusammenführen** (Discord-Activity-Konto) nimmt die
Karten mit, samt Code; doppelte Namen bekommen „ (2)", „ (3)" …

## Bis zu acht Reiche · Zufall für alle · Karteneditor mit Einstellungen (Mehrspieler-Erweiterung)

**Spielerzahl.** 2 bis 8 Reiche (`MIN_PLAYERS`, `MAX_PLAYERS`). Wie viele, entscheidet die
Karte (`mapLimits`, engine.js): Originalkarte und Große Karte 2–4 (vier Startsterne, je
Zivilisation einer), Standard-Marathon genau 4, Plättchenkarte 2–8, eigene Karten 2 bis zur
Zahl ihrer Startpunkte. Der Aufbau fragt deshalb erst nach der Karte und dann nach der Zahl;
die Spielarten „Vier Reiche", „Drei Reiche", „1 gegen 1" und „Marathon" sind darin
aufgegangen (Duell = zu zweit, auf jeder Karte; Marathon = Eintrag der Kartenwahl oder
Einstellung einer eigenen Karte). Es gibt vier Zivilisationen – ab fünf Reichen sitzen sie
mehrfach: römische Ziffern bis VIII und eine eigene Farbe, erst eine freie
Zivilisationsfarbe, dann `EXTRA_COLORS` (Orange, Gold, Magenta, Schiefer – deutlich
verschieden von den vier Zivilisationsfarben und dem Braun der Barbaren). Die Regel dafür
(`markDoubles`) liegt jetzt in engine.js und gilt im Browser wie auf dem Server.

**Startausgleich ab fünf Reichen:** die Reihe des Autors (Zweiter 1, Dritter 2, Vierter 3
Münzen) geht weiter – Fünfter 4 … Achter 7. *Annahme*, nicht Anweisung des Autors.

**Plättchenkarte für 5–8.** Die Vierer-Form (zwei Reihen zu fünf Dreiecken) wird verlängert:
zwei Reihen zu 7 Dreiecken für 5 und 6 Reiche (14 Plättchen), zu 9 für 7 und 8 (18 – der
Vorrat hat 20, gezogen wird weiter ohne Zurücklegen). Gesessen wird wie zu viert auf den
Dreiecken, die mit der breiten Seite an der Ober- bzw. Unterkante liegen; zwischen zwei
Sitzen liegt immer ein offenes Dreieck. Damit hat jeder Sitz dieselbe Nachbarschaft wie in
der Vierer-Form, und `seatFreeCells` gilt unverändert: `test.js` prüft für 2–8 dieselben
Invarianten (keine Überlappung, keine Lücke, nie geteiltes Umland, mindestens 3 Felder
zwischen Hauptstädten, 420 Ziehungen, eine ganze Partie je Größe). Erlaubte Felder je
Startplättchen: 13 an den Enden, 12 mit Nachbarn auf beiden Seiten, 14 neben einer Lücke.
Bei ungerader Zahl bleibt auf einer Kante ein innerer Sitz frei (gelost wird, welche Kante).

**Zufällige Nationen für alle** (Aufbau, Live-Lobby, Rundenspiel): jedem Platz werden
Zivilisation und Fähigkeit ausgelost – auf jeder Karte. Auf festen Karten paarweise
verschieden, sonst gleichmäßig (jede Zivilisation einmal, bevor eine zweimal kommt).

**Eigene Karten, neue Form:** `{ name, rows, spawns: [[r, c], …], marathon }`. Startpunkte
gehören keiner Zivilisation; jede darf mehrfach sitzen. Spielen weniger Reiche, als die Karte
Startpunkte hat, nimmt `mapForPlayers` die, deren kleinster Abstand am größten ist, und
verteilt sie per Startwert auf die Plätze. Ältere Karten (Hauptstadt je Zivilisation)
werden zu vier Startpunkten. Größe jetzt bis 48 × 48.

**Karteneditor.** Einstellungen der Karte (Name, Max. Reiche = Zahl der Startpunkte,
Marathonregeln, Größe), eine Prüfzeile („Spielbar …" oder was fehlt), Startpunkt-Werkzeuge
1…N (nach dem Setzen liegt der nächste fehlende bereit; zweimal tippen entfernt; wird ein
Startpunkt mit Meer oder Vulkan übermalt, fällt er weg) und eigene Knöpfe **Speichern** und
**Veröffentlichen** – Speichern bleibt im Editor; Veröffentlichen speichert und zeigt den
Code (mit Kopieren und Zurückziehen), ohne Mehrspielerserver oder Anmeldung sagt es, warum
es nicht geht.

**Mehrspieler.** Live-Lobby und Rundenspiel fragen nach „Reiche insgesamt" und „davon KI".
In der Live-Lobby nimmt die Lobby so viele Menschen auf, wie Plätze nicht der KI gehören;
freie Plätze besetzt beim Start die KI. Im Rundenspiel sind die KI-Plätze von Anfang an
vergeben; ohne KI wartet die Partie auf alle (bei Zeitablauf spielt, wer da ist, wenn die
Karte das zulässt, sonst wird abgebrochen). Ein Rundenspiel beginnt sofort mit dem Zug des
Hosts nur, wenn die Plätze schon feststehen (Nationen ausgelost, oder alle vier Nationen
einer festen Karte) – sonst, sobald alle da sind.
