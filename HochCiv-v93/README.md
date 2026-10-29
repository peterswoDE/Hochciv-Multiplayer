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
| **Fähigkeiten** (v87) | Blatt mit der eigenen Zivilisationsfähigkeit samt Wirkung und allem, was über eine einzelne Stadt hinausgeht: **Freie Forschung** und **Rückschau** (Griechenland), kostenlose Technologien aus Wundern (Bibliothek, Oxford, Raumfahrt), **Alle Städte kostenlos wachsen** (mit Verbundwerkstoffen), **Alle Städte wachsen** (am Knopf, was tatsächlich abgeht), **In allen Städten opfern** (Sklaverei, solange sie nicht obsolet ist) und **Kopieren** (Spionage, Kundschafterei, Internet). Gewachsen wird von der kleinsten Stadt an; was an einer Stadt scheitert (schon gewachsen, neu, Nahrungsgrenze, zu wenig Mittel), wird ausgelassen – der Knopf sagt vorher „2 von 3 Städten" und warum. Die **Zahl am Knopf** nennt, wie viele *Arten* kostenloser Aktionen gerade offen sind (Freie Forschung, Rückschau, Wunder-Technologie, kostenloses Wachstum, Internet-Kopie) – kostenloses Wachstum in fünf Städten zählt einmal. An dieser Stelle stand bis v86 der Umschalter „Erträge"; die Erträge je Feld zeigt weiter der Gründungsmodus |
| **Macht** | Macht kaufen. Solange das Blatt offen ist, tragen Städte und Armeen **Ringe** aus **einem Teilstück je Punkt**: in der Farbe des Besitzers seine Verteidigung bzw. sein Machtwert, in fremder Farbe Angreifer bzw. Flankierer – Verteidigung 1 gegen Angriff 2 sind drei Stücke, eines gegen zwei. Überwiegt ein fremder Anteil, läuft die Belagerung bzw. fällt die Armee; Käufe verschieben die Ringe sofort. Über 60 Punkte zeigt der Ring nur noch den Anteil, bei 0 Punkten bleibt er leer |
| Bevölkerung wachsen | zwei Knöpfe, wenn Verbundwerkstoffe ein Gratis-Wachstum erlaubt: „Kostenlos wachsen" und der bezahlte „Bevölkerung wachsen". Für alle Städte auf einmal: **Fähigkeiten**. Je Stadt und Runde einmal bezahlt, mit **Keramik** und seit v89 mit der **Dampfmaschine** je einmal mehr (beide: dreimal), dazu einmal kostenlos mit Verbundwerkstoffen |
| Blätter antippen (v89) | Ein Knopf in einem Blatt reagiert erst **0,4 s nach dem Öffnen oder Neuzeichnen** des Blatts. Sonst traf ein Doppeltipp, was nach einer Aktion an die Stelle gerückt war – nach der Freien Forschung etwa „Alle Städte wachsen". Denselben Knopf gleich wieder zu tippen (zweimal „+1 Macht", noch einmal wachsen) geht sofort, „Weiter" im Blatt eines Bot- oder KI-Zugs auch |
| **Erstes Spiel** (v92, v93) | Der rote Knopf ganz oben im Menü: erst eine Seite (eine Stadt in der Steinzeit, mehrere Wege zum Sieg) mit der Wahl des Wegs, dann eine ganze Partie bis zum Sieg, 1 gegen 1 gegen England, mit **Zielen** statt Erklärtexten und **💡 Tipp anzeigen**, wenn man festhängt. Alles bleibt antippbar; was den Verlauf verlassen würde, wird mit einem Satz abgelehnt. Siehe unten |
| Tutorial | Geführtes Übungsspiel in der normalen Oberfläche: 24 Schritte mit Erklärpanel unter der Karte, 15 davon mit Aufgabe und genauem Klickweg. Läuft auf Schienen (nur der vorgesehene Schritt ist möglich) und deterministisch. „Fertig" gibt das Spiel frei, es läuft weiter. |
| Einstellungen | Im Hauptmenü: die Erweiterungsmodule **Ereignisse** und **Weltwunder** zuschalten. Ab Werk sind beide aus und fehlen im Aufbau ganz; eingeschaltet steht dort wieder das Häkchen und entscheidet je Partie. Dazu **Kosten ohne Umtausch anzeigen** (ab Werk aus, siehe Kosten) |
| Kosten (v82) | Jeder Knopf zeigt, was **tatsächlich** abgeht: fehlt Nahrung oder Wissenschaft, steht dort auch der Rest in Münzen (bzw. was sonst einspringt) – Gründen für 10 Nahrung mit 8 im Vorrat zeigt **8🌾 4🪙**. Reicht es gar nicht oder wird nichts umgetauscht, steht der Preis selbst da. Im Technologiebogen gilt das für die Kacheln, die man gerade erforschen kann; die Karte im Gründungsmodus zeigt weiter den Preis (zum Vergleichen). Mit **Kosten ohne Umtausch anzeigen** in den Einstellungen wie bis v81 überall nur der Preis |
| Techtree (v82) | Seit v82 gibt es einen Techtree – den früheren „alternativen": Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 · Bewässerung 1, Landwirtschaft 5 · in der Forschung der Industrialisierung Chemie 11, Biologie 12, Wissenschaftliche Methode 15. Das Häkchen im Aufbau ist weg. Der alte (Schrift 1, Mathematik 2 … Landwirtschaft 1, Bewässerung 5, Wiss. Methode 11, Chemie 12, Biologie 15) gilt nur noch im **Tutorial** und in Partien, die vor v82 mit ihm begonnen wurden – dort nennen Weltblatt und Regelbogen ihn. Seit v84 im Militär der Antike: **Stadtmauern 2, Eisenverarbeitung 4, Belagerungsmaschinen 5** (vorher 5, 2, 4 – das Tutorial behält die alten). Quelle: die Kosten in `TECHS`, die alten in `OLD_TECH_COSTS` (`js/data.js`) |
| Ertragstechnologien (v88) | Technologien, die einem Gelände oder jeder Bevölkerung etwas bringen, **schließen die billigeren ihres Feldes ein** – sie setzen den Bonus, statt ihn zu erhöhen: Mathematik gibt dem Wald +1 Wissenschaft, Elektrizität +2, Künstliche Intelligenz +3, und mit allen dreien bleibt es bei +3 (bis v87 brachte jede +1, zusammen also auch +3). Ebenso Papier → Biologie (Grasland), Fischerei → Segeln → Containerlogistik (Meer: zuletzt +2 Nahrung und +1 Münze), Landwirtschaft → Grüne Revolution (Grasland: +1 Nahrung, +1 Münze), Schrift → Universitätswesen und Fließband → Robotik (je Bevölkerung +2). Verschiedene Felder addieren sich (Papier und Landwirtschaft auf Grasland), ebenso Taiga und Großer Leuchtturm. Wer eine Kette ganz hat, steht wie vorher; anders ist es, wenn eine billigere fehlt. Die Techtexte nennen die Summe („Wald: +3 Wissenschaft"; v88 dazu „inkl. …", seit v89 nicht mehr), der Regelbogen erklärt die Regel unter der Geländetabelle |
| Belagerungsmaschinen / Singularität (v88) | **Belagerungsmaschinen** geben seit v88 **+3** Angriff je Armee gegen Städte (vorher +5; Dynamit verdoppelt danach). Die **Singularität** kostet **120** Wissenschaft (vorher 100; Griechenland −5, Wissenschaftliche Methode −10, Kreml +50 wie bisher), im Marathon weiter 300 |
| Reiche | Erst die Karte, dann **2 bis 8 Reiche** – so viele, wie die Karte zulässt: Originalkarte und Große Karte 2–4, Plättchenkarte 2–8, **Marathon** (Zufallskarte 24 × 36, teurere Technologien, Fähigkeiten im Draft) genau 4, eigene Karten so viele, wie sie Startpunkte haben. Zu zweit ist es ein Duell (Wirtschaftssieg erst über 3/4). Ab fünf Reichen sitzen Zivilisationen mehrfach („England II“, eigene Farbe). **Zufällige Nationen für alle** lost jedem Platz Zivilisation und Fähigkeit aus |
| Mensch / KI | Je Platz im Aufbau (Bots stehen nicht mehr zur Wahl; laufende Partien und das Tutorial spielen sie weiter). Die **KI** spielt nach den Regeln für Menschen: sie bezahlt alles, hat ihre Zivilisationsfähigkeit, Ereignisse treffen sie, und sie legt ihr Startplättchen verdeckt selbst. Stufe Leicht/Mittel/Schwer für alle KI gemeinsam – gleiche Regeln, nur übersieht und verrechnet sich die leichtere Stufe öfter; im Duell gemessen Leicht zwischen den Bots Prinz und König, Mittel etwas über König, Schwer etwas über David. **Bots** spielen nach den Bot-Regeln (Würfelproben, Macht = Bevölkerung) und haben ihre eigene Schwierigkeit. Ab Werk sind die Gegner KI |
| Zivilisationen | Auf der Plättchenkarte und auf eigenen Karten darf jeder Platz frei wählen, auch mehrmals dieselbe (Doppelgänger bekommen Ziffern und eine eigene Farbe – erst eine freie Zivilisationsfarbe, ab fünf Reichen eine von vier weiteren). Auf den festen Karten und dem Standard-Marathon sitzt jede genau einmal. Zivilisation und Fähigkeit lassen sich auch auslosen. Bei ausgelostem Reich steht die Fähigkeit zwangsläufig ebenfalls auf Zufall |
| Startspieler | frei wählbar oder zufällig – bei mehr als einem Menschen ist Zufall die Vorgabe. **Startausgleich** (seit v85): im allerersten Zug bekommen der Zweite, Dritte und Vierte in der Zugfolge **1, 2 bzw. 3 Münzen** dazu – zu zweit nur der Zweite 1, zu dritt 1 und 2; ab fünf Reichen weiter bis 7 für den Achten. Gezählt ab dem Startspieler; Bots bekommen nichts (sie zahlen nichts) |
| Fähigkeit sehen | Die eigene Fähigkeit steht in der Kopfzeile neben dem Reichsnamen; das Weltblatt (ⓘ) listet alle Reiche mit Fähigkeit und Wirkung. Im Marathon stehen dort beide gedrafteten |
| Karte | Originalkarte, Große Karte, **Plättchenkarte** (die Zufallskarte), Marathon oder eine eigene aus „Meine Karten“ |
| Karteneditor | Einstellungen der Karte: Name, **Max. Reiche** (= Zahl der Startpunkte, 2–8), **Marathonregeln**, Größe bis 48 × 48. Gelände malen, Startpunkte 1…N setzen; unten steht laufend, ob die Karte spielbar ist und was fehlt. **Speichern** legt sie in „Meine Karten“ (mit Anmeldung im Spielerkonto), **Veröffentlichen** gibt ihr einen 6-stelligen Code, mit dem jeder sie laden kann. Spielen weniger Reiche, als die Karte Startpunkte hat, beginnen sie an denen, die am weitesten auseinanderliegen |
| Plättchenkarte | Zufallskarte aus Dreiecken zu 15 Feldern. Vor dem Spiel legt jedes Reich verdeckt sein eigenes Startdreieck: Lage wählen (drei), Hauptstadt setzen. Dann wird aufgedeckt. **Rötlich umrandet** sind Startfelder, bei denen ein anderes Feld – auch in einer anderen Lage – von einem Ertrag mehr und von keinem weniger bringt |
| **Welt** | Ereignis dieser Runde, eigene und fremde Weltwunder, verfügbarer Wunder-Pool |
| 🌾 in der Kopfzeile | Städte füttern (nur mit Gentechnik oder Massenmedien) |
| Weltwunder bauen | im Stadtblatt, wenn die Erweiterung an ist |
| **Forschen** | links die Ertragsübersicht (Felder, **Handelsrouten**, Bevölkerung, Summe fürs nächste Einkommen), rechts der Technologiebogen |
| Armee auf der Karte | antippen → *Bewegen*; steht sie in der eigenen Stadt, steht die Aktion im Stadtblatt |
| Feld antippen | Aktionsblatt mit dem Feldertrag. Den **Ertrag beim Siedeln** — was eine Stadt hier ab der nächsten Runde brächte — zeigt das Blatt des Gründungsmodus |
| Karte | fest und immer vollständig sichtbar – kein Zoomen, kein Schieben. Im Hochformat dreht die App sich selbst quer (im ☰-Menü abschaltbar) |
| **Forschen** | Technologiebogen; erforschbares ist rot umrandet — durchgezogen heißt bezahlbar, gestrichelt zu teuer. Kopieren (Spionage/Kundschafterei/Internet), Freie Forschung und Rückschau stehen seit v87 unter **Fähigkeiten** (vorher unten in diesem Fenster) |
| Atomwaffen | Zielfeld antippen → *Atomschlag* im Aktionsblatt (einmal pro Runde) |
| Sklaverei / Kolonialismus | im Aktionsblatt der Stadt bzw. eines herrenlosen Feldes; Sklaverei für alle Städte auf einmal unter **Fähigkeiten**. Sklaverei bringt seit v84 **7 Münzen** je geopferter Bevölkerung (vorher 10). Ein per Kolonialismus gekauftes Feld darf seit v84 auch **ohne Siedlerweg** besiedelt werden (übers Meer, über fremdes Gebiet hinweg), sofern sonst alles passt; die Entfernung zählt dann wie mit der Luftwaffe als Luftlinie. Gibt es einen Weg, gilt der Weg |
| Ökologie / Bürokratie | **Ökologie** bringt seit v86 je 2 Bevölkerung **des ganzen Reichs** +1 auf alle drei Erträge, einmal abgerundet (vorher je Stadt: vier Städte mit je 1 Bevölkerung brachten nichts, jetzt +2). **Bürokratie** verdoppelt die Hauptstadt samt Umland und seit v86 auch **Handelsrouten, Ökologie und den Nahrungsposten der Gentechnik**. Die Ertragsübersicht zeigt die verdoppelten Zahlen seit v88 ohne Zusatz am Namen (v86/v87: „Handelsrouten (Bürokratie ×2)") |
| Städte auf der Karte | Scheibe mit der **Bevölkerung als Zahl** in der Farbe des Reichs (seit v84; vorher Reichssymbol und Striche); die Hauptstadt hat einen dunklen, dicken Ring. Armeen tragen weiter das Reichssymbol |
| **Protokoll** | jede Aktion; die Würfe dahinter hängen eingeklappt an der Zeile und lassen sich antippen |
| Züge von Bots und KI | Blatt mit dem, was sie getan haben; **Weiter** steht seit v87 oben neben dem Titel und unten – wer das Protokoll nicht lesen will, muss nicht ans Ende scrollen |
| Kampf am Zugende (v90, Reihenfolge v91) | Nach **Zug beenden** – und im Zug eines Bots oder der KI vor ihrem Blatt – läuft **jeder Kampf einzeln eine Sekunde lang** ab, in der Reihenfolge der Regel: **erst die Städte, dann die Flankierungen** – eine Armee verteidigt ihre Stadt mit, auch wenn sie danach weggeflankt wird (v90 hatte die Reihenfolge umgedreht, seit v91 wieder wie zuvor; `ANNAHMEN.md`, Abschnitt 1). Das Kampffeld ist golden umrandet, die Felder des Angreifers in seiner Farbe; daneben stehen **⚔️ Angriff** (Farbe des Angreifers) und **🛡️ Verteidigung** (Farbe des Verteidigers), dazwischen **>** (der Angriff gewinnt) oder **≤** (die Verteidigung hält, auch bei Gleichstand), darüber etwa „Stadt 1/2 · hält" oder „Flanke 2/2 · Armee zerstört". Die Karte zeigt jeweils den Stand vor diesem Kampf. Die Werte stehen gut zwei Felder über oder unter dem Kampffeld und zeigen mit einem Strich darauf – auf der Seite, wo sie keine Figur des Angreifers verdecken; auf dem Telefon größer. Solange das läuft, ist die Leiste gesperrt; **ein Tipp auf die Karte überspringt** den Rest (bei mehreren Kämpfen steht der Hinweis über der Leiste), das Menü ☰ ebenso. Wer mitten im Nachspiel neu lädt, steht wieder vor „Zug beenden". Gerechnet ist alles schon vorher – das Nachspiel zeigt es nur |
| Zugfolge (v90) | Wo der Aufbau **nummerierte Plätze** zeigt – auf der Plättchenkarte und bei weniger als vier Reichen (Drei Reiche, 1 gegen 1) –, ziehen die Reiche **in der Reihenfolge der Plätze**, ab dem Startspieler. Zweimal dieselbe Zivilisation zieht also dort, wo sie sitzt (bis v89 nach der Zivilisation: Platz 1 Russland, Platz 3 Russland, erst dann Platz 2). Die klassische Aufstellung mit allen vier Zivilisationen und der Marathon bleiben bei Russland → Griechenland → England → Wikinger – auf der Originalkarte Ost, Süd, West, Nord, also im Uhrzeigersinn |

## Spielende

Ein **Militärsieg** (fremde Hauptstadt erobert, im Marathon die zweite) endet das Spiel auf
der Stelle.
Der **Wirtschaftssieg** verlangt mehr als 2/3 der Weltbevölkerung (im Duell mehr als 3/4,
mit Theologie oder Vereinten Nationen weniger). Seit v85 wird er **einmal je Runde geprüft,
am Rundenende** – wenn alle gleich oft gezogen haben –, für alle Reiche mit dem Stand von
genau diesem Moment, auch schon am Ende von Runde 1. Erfüllt ihn dort jemand, **endet das
Spiel sofort**; nur wenn in derselben Runde schon ein anderer Sieg angemeldet war
(Singularität, Weltwunder), entscheiden die Punkte. Die Kopfzeile zeigt den laufenden
Stand. (v83/v84: zu Beginn jeder Runde ab Runde 2, danach lief die Runde noch zu Ende;
bis v82 am Ende jedes Zuges.)
**Forschungs- und Kultursieg** werden angemeldet: die Runde wird noch zu Ende gespielt,
die Kopfzeile zeigt dann „letzte Runde". Erfüllen mehrere Reiche in derselben Runde eine
Bedingung, entscheiden am Rundenende Punkte:

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
  Vierfache (Industrialisierung) und Fünffache (Moderne), die Singularität **300** (seit
  v84; v83: das 2,5-Fache, 250). Rabatte ziehen danach ab, **seit v85 doppelt**:
  Griechenlands Günstige Forschung 2/4/6/8/10 und die Wissenschaftliche Methode
  4/8/12/16/20 je Zeitalter. Griechenlands **Freie Forschung** reicht im Marathon nur bis
  ins **Mittelalter** (sonst bis zur Industrialisierung). Kopieren zahlt die Marathonkosten.
  Regelbogen, Technologiebogen, Draft und Kopfzeile zeigen die Marathonwerte.
* **Höchstens fünf neue Städte je Zug** (seit v84). „Stadt gründen" sagt danach, warum es
  nicht mehr geht.
* **Militärsieg erst mit zwei eroberten Hauptstädten** (seit v84). Eine eroberte Hauptstadt
  wird eine gewöhnliche Stadt – sie zählt also nur einmal, auch zurückerobert für niemanden –,
  und ihr altes Reich spielt ohne Hauptstadt weiter, wie nach einem Barbarenüberfall: keine
  Handelsrouten mehr, Gründungsentfernungen ab seiner ersten Stadt. Weltblatt und Protokoll
  zeigen, wer wie viele Hauptstädte genommen hat.
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

## Erstes Spiel (v92, umgebaut in v93)

Der **rote Knopf ganz oben** im Menü („Neues Spiel" sieht seitdem aus wie die Knöpfe darunter).
Eine ganze Partie bis zum Sieg, 1 gegen 1 auf einer kleinen Karte (10 × 13): **Griechenland**
(du) gegen **England**. Statt Erklärtexten nennt jeder Schritt ein **Ziel** – „Gründe eine Stadt
dort, wo sie dir am meisten 🌾 Nahrung bringt" –, den Weg findet man selbst. Wer festhängt, tippt
**💡 Tipp anzeigen**: Dann steht der Weg unter dem Ziel, und Feld und Knopf leuchten golden. Wo es
etwas zu rechnen gibt, steht der Stand gleich dabei (etwa „Verteidigung 2 · Englands Angriff 3 ✗").
Ist das Ziel erreicht, geht es von selbst weiter, und oben steht ein Satz, warum es wichtig war.

* **Zuerst eine Seite (v93):** Du führst eine einzige Stadt in der Steinzeit, dein Ziel ist eine
  Zivilisation, die die Zeiten überdauert – und weil es viele Wege zu einem blühenden Reich gibt,
  gibt es mehrere Wege zum Sieg. Gleich darunter die Wahl: **Militärsieg** (Englands Hauptstadt
  zwei Züge hintereinander schlagen), **Wirtschaftssieg** (mehr als 3/4 der Weltbevölkerung am
  Rundenende, mit Theologie 7/10) oder **Forschungssieg** (die Singularität). Wer die Seite
  schließt, ist wieder im Menü. Gewonnene Wege hakt sie ab (das Gerät merkt sie sich).
* **Runde 1–4 lehren allen dasselbe (17 Schritte), aber vom Weg geführt:** Hauptstadt und
  Umland · die eigene Fähigkeit · alles erforschen, was nichts kostet · **der Würfel im
  Technologiebogen** (v93): eine Technologie finden, die es in dieser Partie nicht gibt – blasse
  Kacheln lassen sich antippen und sagen, warum sie blass sind (durchgefallen, mit der Augenzahl
  aus dem Protokoll, oder noch nicht ausgewürfelt); danach die Regel: je Technologie ein Würfel,
  4–6 = es gibt sie, also 50 % · die Stadt mit der meisten Nahrung, später die mit der meisten
  Wissenschaft – beide Rätsel haben genau eine Lösung · wachsen (Münzen springen ein) · Zug beenden
  und Englands Zug lesen · alle Städte wachsen · Rad und Handelsroute · **belagert werden** und die
  Stadt mit Armee und Macht halten · **flankieren** mit Taktik. In Runde 3 und 4 geht es je um die
  Technologie, die den Weg voranbringt – Militär: Belagerungsmaschinen, dann Eisenverarbeitung;
  Wirtschaft: Keramik, dann Demokratie (öffnet die Theologie); Forschung: Schrift, dann Papier
  (öffnet die Industrialisierung) –, danach wird ausgegeben, was noch geht. Auch Lage und Tipps
  sprechen vom Weg („auf Straßen ziehen Armeen doppelt so weit – gut für deinen Angriff").
* **Ab Runde 5 die Schritte des Wegs:** belagern und erobern · Theologie und die Mehrheit ·
  Wissenschaftliche Methode, in jedem Feld die Moderne, die Singularität. Mit der Musterlösung
  fällt der Sieg jeweils in Runde 6. Danach: **Anderen Weg ausprobieren** (die Seite wieder, eine
  neue Partie).
* **Technologien ab dem Mittelalter (v93):** fest für diese Partie und wie gewürfelt – in jedem
  Feld und Zeitalter fehlt etwa die Hälfte (24 von 46), nie alle; was Ziele und Tipps nennen, ist
  dabei. Die Würfel im Protokoll passen dazu (4–6 verfügbar, 1–3 nicht).
* **Auf Schienen, ohne gesperrte Knöpfe:** Abgelehnt wird mit einem Satz, warum – eine Stadt am
  schlechteren Platz, Forschen, während die Stadt belagert ist, eine Armee, die nicht mehr
  zurückkäme, Macht, bevor die Armee steht, in Runde 3 und 4 andere Forschung vor der des Wegs,
  ein Sieg auf einem anderen Weg als dem gewählten (zu viel Bevölkerung, die Singularität,
  Englands andere Stadt). Wo ein Ziel mehrere Lösungen hat, zählt jede, die die Regel erfüllt.
  Gespielt wird nach den echten Regeln.
* **England** zieht nach einem festen Drehbuch, nach den Regeln für Menschen (es bezahlt alles):
  zweite Stadt, in Runde 2 Belagerungsmaschinen und eine Armee neben deiner neuen Stadt, in Runde 3
  der zweite Angriff, ab Runde 4 Verteidigung der Hauptstadt mit Armee und Macht, ab Runde 5
  wachsen seine Städte wieder.
* Gespeichert wird wie bei jeder Partie: **Spiel fortsetzen** macht mit Führung weiter (ein
  Spielstand von v92 vor der Wahl fragt im Panel zuerst nach dem Weg). **Beenden** im Panel lässt
  die Partie ohne Führung weiterlaufen, England spielt dann als KI.

Die Schritte stehen in `js/firstgame.js` (`FG_STEPS`), jeder mit Ziel, Tipp, Schienen und einer
Musterlösung, mit der `test.js` alle drei Wege bis zum Sieg spielt.

## Tutorial

Das klassische Tutorial (Russland gegen drei Bots, alter Techtree) bleibt vorerst im Menü.

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
`order` die **Zugreihenfolge** im Spiel – seit v90 nur noch in der klassischen Aufstellung mit
allen vier Zivilisationen und im Marathon; mit nummerierten Plätzen gilt deren Reihenfolge. Was die JSON nicht enthält, sind die Regeln: eine
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
js/tutorial.js        Tutorial (Russland gegen drei Bots, feste Würfel, Schienen)
js/firstgame.js       Erstes Spiel: Seite vor der Partie, Karte, Würfel, Englands Drehbuch, Ziele, Tipps, Schienen, Panel
js/ui.js              Karte, Gesten, Aktionsblätter, Editor
sw.js                 Offline-Cache
ANNAHMEN.md           wo die Regeln offen sind und wie hier entschieden wurde
data/civs.json        die Zivilisationen – Quelle für js/civs.js (node tools_civs.js)
Startplaettchen.pdf   Druckbogen der 20 Plättchen (aus js/tiles.js erzeugt)
```
