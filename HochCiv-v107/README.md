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
Nach Änderungen an den Dateien `node tools_version.js` ausführen: Es zählt `VERSION` in `sw.js`
hoch und setzt `BUILD_HASH` – sonst behalten installierte Geräte die alte Fassung.

Seit v106 übernimmt die App eine neue Fassung erst, wenn **alle** Dateien auf dem Server zu
`BUILD_HASH` passen. Ein halb fertiger Upload schadet also nicht mehr: Bis er komplett ist, bleibt
die App bei der alten Fassung (bis v105 konnte sie alte und neue Dateien mischen). Ist beim
Übernehmen das Menü offen, lädt sie sich selbst neu; mitten im Spiel kommt die neue Fassung beim
nächsten Start. GitHub Pages liefert die Dateien unverändert aus – ein Dienst, der sie beim
Ausliefern umschreibt (etwa verkleinert), verhindert jede Aktualisierung.

## Bedienung

| | |
|---|---|
| Feld antippen | Aktionsblatt für dieses Feld (Bevölkerungswachstum, Armee bauen, Armee bewegen, Straße, Feld beanspruchen …) – gegründet wird seit v75 über **Stadt gründen** in der Leiste. Eine eigene Armee bewegt seit v103 derselbe Knopf **Armee bewegen**, ob sie in einer Stadt steht oder auf freiem Feld (bis v102 „Armee hier bewegen" und „Diese Armee bewegen") |
| **Stadt gründen** | Gründungsmodus: jedes Feld zeigt seine Erträge, jeder mögliche Platz die Kosten in Nahrung (rot, wenn sie diesen Zug nicht reichen), unmögliche Felder sind abgeblendet. Feld antippen → Blatt mit Kosten und **Ertrag beim Siedeln** → **Hier gründen**. Nochmal tippen beendet den Modus |
| **Fähigkeiten** (v87) | Blatt mit der eigenen Zivilisationsfähigkeit samt Wirkung und allem, was über eine einzelne Stadt hinausgeht: **Freie Forschung** und **Rückschau** (Griechenland), kostenlose Technologien aus Wundern (Bibliothek, Oxford, Raumfahrt), **Alle Städte kostenlos wachsen** (mit Verbundwerkstoffen), **Alle Städte wachsen** (am Knopf, was tatsächlich abgeht), **In allen Städten opfern** (Sklaverei, solange sie nicht obsolet ist) und **Kopieren**: Internet, Spionage und Kundschafterei sind seit v105 **je eine Kopie je Runde**, unabhängig voneinander – gratis, zum Einfachen und zum Doppelten der Grundkosten in Münzen (bis v104 kopierten die beiden bezahlten beliebig oft, und Spionage ersetzte Kundschafterei). Eine Zeile je Technologie, rechts je offenem Weg sein Preis als Knopf; ein genutzter Weg verschwindet aus allen Zeilen. Gewachsen wird von der kleinsten Stadt an; was an einer Stadt scheitert (schon gewachsen, neu, Nahrungsgrenze, zu wenig Mittel), wird ausgelassen – der Knopf sagt vorher „2 von 3 Städten" und warum. Die **Zahl am Knopf** nennt, wie viele *Arten* kostenloser Aktionen gerade offen sind (Freie Forschung, Rückschau, Wunder-Technologie, kostenloses Wachstum, Internet-Kopie) – kostenloses Wachstum in fünf Städten zählt einmal. An dieser Stelle stand bis v86 der Umschalter „Erträge"; die Erträge je Feld zeigt weiter der Gründungsmodus |
| **Macht** | Der Stand und die Käufe – was nicht bezahlbar ist, ist gesperrt (v102). Solange das Blatt offen ist, tragen Städte und Armeen **Ringe** aus **einem Teilstück je Punkt**: in der Farbe des Besitzers seine Verteidigung bzw. sein Machtwert, in fremder Farbe Angreifer bzw. Flankierer – Verteidigung 1 gegen Angriff 2 sind drei Stücke, eines gegen zwei. Überwiegt ein fremder Anteil, läuft die Belagerung bzw. fällt die Armee; Käufe verschieben die Ringe sofort. Über 60 Punkte zeigt der Ring nur noch den Anteil, bei 0 Punkten bleibt er leer |
| Bevölkerungswachstum | zwei Knöpfe, wenn Verbundwerkstoffe ein Gratis-Wachstum erlaubt: „Kostenlos wachsen" und der bezahlte „Bevölkerungswachstum" (bis v102 „Bevölkerung wachsen"). Für alle Städte auf einmal: **Fähigkeiten**. Je Stadt und Runde einmal bezahlt, mit **Keramik**, seit v89 mit der **Dampfmaschine** und seit v97 mit Russlands **Fruchtbarkeit** je einmal mehr (alle drei: viermal), dazu einmal kostenlos mit Verbundwerkstoffen |
| Blätter antippen (v89) | Ein Knopf in einem Blatt reagiert erst **0,4 s nach dem Öffnen oder Neuzeichnen** des Blatts. Sonst traf ein Doppeltipp, was nach einer Aktion an die Stelle gerückt war – nach der Freien Forschung etwa „Alle Städte wachsen". Denselben Knopf gleich wieder zu tippen (zweimal „+1 Macht", noch einmal wachsen) geht sofort, „Weiter" im Blatt eines Bot- oder KI-Zugs auch |
| **Erstes Spiel** (v92, v93) | Der rote Knopf ganz oben im Menü: erst eine Seite (eine Stadt in der Steinzeit, mehrere Wege zum Sieg) mit der Wahl des Wegs, dann eine ganze Partie bis zum Sieg, 1 gegen 1 gegen England, mit **Zielen** statt Erklärtexten und **💡 Tipp anzeigen**, wenn man festhängt. Alles bleibt antippbar; was den Verlauf verlassen würde, wird mit einem Satz abgelehnt. Siehe unten |
| Kopfzeile (v102) | Links das Zeichen und der Name des Reichs am Zug, darunter Runde und Ereignis der Runde; ein Tipp auf den Namen (▾) öffnet die **Welt**. Rechts fünf Kästchen ohne Beschriftung: **Bevölkerung** (eigene / Welt, darunter ein Balken in der Reichsfarbe; der Strich markiert die Siegschwelle – mit Theologie oder Vereinten Nationen rückt er nach links; ein Tipp öffnet ebenfalls die Welt), Wissenschaft, Nahrung, Münzen, Macht. Sitzen mehrere Menschen am Gerät, pulsiert beim Wechsel einmal das Zeichen – einen Hinweis „… ist am Zug" gibt es nicht mehr |
| Spielmenü ☰ (v102) | Regeln & Technologien · Protokoll · **Animationen** (Langsam – ab Werk –, Schnell, Keine; die einzige Vorliebe) · Spielstand exportieren · Spiel beenden. Den Bildschirm „Einstellungen" gibt es seit v102 nicht mehr: Ereignisse und Weltwunder wählt man im Aufbau, Kosten zeigen immer, was tatsächlich abgeht, und im Hochformat dreht sich das Spiel immer quer |
| Große Bildschirme (v103) | Ab 1366 × 720 wächst die ganze Oberfläche mit dem Fenster – Symbole, Schrift, Blätter, ein Faktor nach der knapperen Seite: ein maximiertes Fenster auf 1080p etwa ×1,33, Vollbild ×1,41, 1440p etwa ×1,8. Jedes iPad (auch 1366 × 1024) und jedes Telefon bleibt bei 1, das gedrehte Hochformat ebenso. Die Karte füllt ihre Fläche wie bisher |
| Kosten (v82) | Jeder Knopf zeigt, was **tatsächlich** abgeht: fehlt Nahrung oder Wissenschaft, steht dort auch der Rest in Münzen (bzw. was sonst einspringt) – Gründen für 10 Nahrung mit 8 im Vorrat zeigt **8🌾 4🪙**. Reicht es gar nicht oder wird nichts umgetauscht, steht der Preis selbst da. Im Technologiebogen gilt das für die Kacheln, die man gerade erforschen kann; die Karte im Gründungsmodus zeigt weiter den Preis (zum Vergleichen). Bis v101 ließ sich mit **Kosten ohne Umtausch anzeigen** wie bis v81 überall nur der Preis zeigen; den Schalter gibt es seit v102 nicht mehr |
| Techtree (v82) | Seit v82 gibt es einen Techtree – den früheren „alternativen": Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 · Bewässerung 1, Landwirtschaft 5 · in der Forschung der Industrialisierung Chemie 11, Biologie 12, Wissenschaftliche Methode 15. Das Häkchen im Aufbau ist weg. Der alte (Schrift 1, Mathematik 2 … Landwirtschaft 1, Bewässerung 5, Wiss. Methode 11, Chemie 12, Biologie 15) gilt nur noch in Partien, die vor v82 mit ihm begonnen wurden – dort nennen Weltblatt und Regelbogen ihn. Seit v84 im Militär der Antike: **Stadtmauern 2, Eisenverarbeitung 4, Belagerungsmaschinen 5** (vorher 5, 2, 4 – der alte Techtree behält sie). Quelle: die Kosten in `TECHS`, die alten in `OLD_TECH_COSTS` (`js/data.js`) |
| Technologiekosten (v105) | Getauscht bzw. gedreht, jeweils im selben Zeitalter: **Theologie 8, Bürokratie 10** (vorher 10, 8) · **Militärgericht 11, Nationalismus 13** (13, 11) · **Stahl 7, Burgenbau 8** (8, 7) · **Kunstdünger 11, Dampfmaschine 13, Eisenbahn 14** (14, 11, 13). Die Leitern im Bogen folgen den Kosten. Der alte Techtree (Spielstände von vor v82) behält die alten |
| Ertragstechnologien (v88, v103) | Technologien, die einem Gelände oder jeder Bevölkerung etwas bringen, **zählen nicht zusammen – es gilt die beste**: Mit Mathematik bringt Wald 1 Wissenschaft, mit Elektrizität 2, mit Künstlicher Intelligenz 3, auch mit allen dreien (bis v87 brachte jede +1, zusammen also auch 3). Ebenso Papier → Biologie (Grasland), Fischerei → Segeln → Containerlogistik (Meer: zuletzt 2 Nahrung und 2 Münzen), Landwirtschaft → Grüne Revolution (Grasland: 2 Nahrung, 1 Münze), Schrift → Universitätswesen und Fließband → Robotik (Bevölkerung: je 3). Ketten verschiedener Felder betreffen verschiedene Erträge (auf Grasland Papier die Wissenschaft, Landwirtschaft die Nahrung); dazu kommt der Große Leuchtturm; Russlands Taiga ist seit v95 eine Untergrenze (siehe Taiga). **Die Techtexte nennen seit v103, was das Feld damit insgesamt bringt**, samt Grundertrag: „Wald bringt 2 Wissenschaft", „Grasland bringt 2 Nahrung", „Bevölkerung bringt je 2 Wissenschaft" (v88–v102 „Wald: +2 Wissenschaft" – das las sich, als stapelten sie). Der Regelbogen sagt die Regel unter der Geländetabelle |
| Maschinengewehr (v107) | **+3** Verteidigung je Bevölkerung (bis v106 +2): eine Stadt verteidigt mit dem Vierfachen ihrer Bevölkerung. Zahl in `MG_DEFENSE` (`js/data.js`) |
| Belagerungsmaschinen / Singularität (v88) | **Belagerungsmaschinen** geben seit v88 **+3** Angriff je Armee gegen Städte (vorher +5; Dynamit verdoppelt danach). Die **Singularität** kostet **120** Wissenschaft (vorher 100; Griechenland −5, Wissenschaftliche Methode −10, Kreml +50 wie bisher), im Marathon weiter 300 |
| Reiche | Erst die Karte, dann **2 bis 8 Reiche** – so viele, wie die Karte zulässt: Originalkarte 2–4, Plättchenkarte 2–8, **Marathon** (Zufallskarte 24 × 36, teurere Technologien, Fähigkeiten im Draft) genau 4, eigene Karten so viele, wie sie Startpunkte haben. Zu zweit ist es ein Duell (Wirtschaftssieg erst über 3/4), zu viert seit v101 schon über 4/7 – siehe Spielende. Ab fünf Reichen sitzen Zivilisationen mehrfach („England II“, eigene Farbe). **Zufällige Nationen für alle** lost jedem Platz Zivilisation und Fähigkeit aus |
| Mensch / KI | Je Platz im Aufbau (Bots stehen nicht mehr zur Wahl; laufende Partien spielen sie weiter). Die **KI** spielt nach den Regeln für Menschen: sie bezahlt alles, hat ihre Zivilisationsfähigkeit, Ereignisse treffen sie, und sie legt ihr Startplättchen verdeckt selbst. Stufe Leicht/Mittel/Schwer für alle KI gemeinsam – gleiche Regeln, nur übersieht und verrechnet sich die leichtere Stufe öfter; im Duell gemessen Leicht zwischen den Bots Prinz und König, Mittel etwas über König, Schwer etwas über David. Seit v96 erforscht die KI die **Wissenschaftliche Methode vor den übrigen Technologien eines Zugs** (sie verbilligt alles danach) und plant neu, sobald eine Forschung sie verfügbar macht. **Bots** spielen nach den Bot-Regeln (Würfelproben, Macht = Bevölkerung) und haben ihre eigene Schwierigkeit. Ab Werk sind die Gegner KI |
| Zivilisationen | Auf der Plättchenkarte und auf eigenen Karten darf jeder Platz frei wählen, auch mehrmals dieselbe (Doppelgänger bekommen Ziffern und eine eigene Farbe – erst eine freie Zivilisationsfarbe, ab fünf Reichen eine von vier weiteren). Auf den festen Karten und dem Standard-Marathon sitzt jede genau einmal. Zivilisation und Fähigkeit lassen sich auch auslosen. Bei ausgelostem Reich steht die Fähigkeit zwangsläufig ebenfalls auf Zufall |
| **Fähigkeiten wählen** (v107) | Sind auf der Plättchenkarte **alle** Reiche ausgelost, wählt vor dem Legen jedes seine Fähigkeit – und mit ihr die Zivilisation – **rückwärts in der Zugfolge** aus einem Vorrat mit genau so vielen verschiedenen Fähigkeiten, wie gewählt wird; der Startspieler bekommt die letzte. Die Starttechnologien sind dann schon gewürfelt und stehen bei jedem Platz, links liegen die offenen Plättchen. Die Plätze stehen in der Reihenfolge des Aufbaus, vorn ihr Platz in der Zugfolge. Die KI wählt sofort, Bots wählen nicht (ihr Reich bleibt ausgelost); zwei Fähigkeiten eines Reichs ergeben Doppelgänger. Hat kein Mensch eine Wahl, geht es gleich ans Legen |
| Startspieler | frei wählbar oder zufällig – **„Zufällig“ ist seit v99 immer die Vorgabe**, bis man etwas anderes wählt. **Startausgleich** (seit v85, Werte seit v98): im allerersten Zug bekommen der Zweite, Dritte und Vierte in der Zugfolge **2, 4 bzw. 6 Münzen** dazu – zu zweit der Zweite **4**, zu dritt 2 und 4 (bis v97 1/2/3, zu zweit 1); ab fünf Reichen weiter bis 14 für den Achten. Gezählt ab dem Startspieler; Bots bekommen nichts (sie zahlen nichts). Zahlen in `START_BONUS_COINS` und `START_BONUS_DUEL` (`js/data.js`) |
| Fähigkeit sehen | Im Blatt **Fähigkeiten** (Name, Wirkung, bei der Freien Forschung je kostenloser Forschung ein Punkt, gefüllt solange offen) und in der Welt, die alle Reiche mit Fähigkeit und Wirkung listet – seit v99 **in Zugfolge**, durchnummeriert ab dem Startspieler. Im Marathon stehen dort beide gedrafteten. In der Kopfzeile steht sie seit v102 nicht mehr |
| Karte | Originalkarte, **Plättchenkarte** (die Zufallskarte), seit v107 die experimentelle **Plättchenkarte (14 Dreiecke)** (nur vier Reiche), Marathon oder eine eigene aus „Meine Karten“. Die **große Karte** (15 × 24) ist seit v99 entfernt; laufende Partien darauf spielen weiter |
| Karteneditor | Werkzeuge **Malen** (im Ziehen, Pinsel 1/7/19 Felder), **Füllen**, **Verschieben**; **Rückgängig/Wiederholen**; neue Karte aus einer Vorlage oder leer. Einstellungen der Karte: Name, **Max. Reiche** (= Zahl der Startpunkte, 2–8), **Marathonregeln**, Größe bis 48 × 48. Gelände malen, Startpunkte 1…N setzen; unten steht laufend, ob die Karte spielbar ist und was fehlt. **Speichern** legt sie in „Meine Karten“ (mit Anmeldung im Spielerkonto), **Veröffentlichen** gibt ihr einen 6-stelligen Code, mit dem jeder sie laden kann. Spielen weniger Reiche, als die Karte Startpunkte hat, beginnen sie an denen, die am weitesten auseinanderliegen |
| Plättchenkarte | Zufallskarte aus Dreiecken zu 15 Feldern. Vor dem Spiel legt jedes Reich verdeckt sein eigenes Startdreieck: Lage wählen (drei), Hauptstadt setzen. Nach dem letzten beginnt gleich das Spiel (bis v98 kam dazwischen ein eigener Schritt mit „Spiel beginnen“). Beim Legen stehen **Forschung** und seit v99 **Welt** zur Ansicht. **Rötlich umrandet** sind Startfelder, bei denen ein anderes Feld – auch in einer anderen Lage – von einem Ertrag mehr und von keinem weniger bringt |
| **Experimenteller Plättchenmodus** (v107) | Bei vier Reichen die Karte **Plättchenkarte (14 Dreiecke)**: die zehn Dreiecke der Vierer-Karte liegen alle offen, die **vier Startdreiecke außen** an jeder zweiten Außenkante – oben, rechts, unten, links, benachbarte je 8 Felder auseinander (siehe Karten). v99–v106 war es ein Häkchen mit zehn Sechsecken; sie sind entfernt |
| **Welt** (Reichsname ▾ in der Kopfzeile) | Die Reiche in Zugfolge mit ihren Fähigkeiten, Ereignis dieser Runde, eigene und fremde Weltwunder, verfügbarer Wunder-Pool |
| 🌾 in der Kopfzeile | Städte füttern (nur mit Gentechnik oder Massenmedien) |
| Weltwunder bauen | im Stadtblatt, wenn die Erweiterung an ist |
| **Forschen** | links die Ertragsübersicht (Felder, **Handelsrouten**, Bevölkerung, Summe fürs nächste Einkommen), rechts der Technologiebogen |
| Armee auf der Karte | antippen → *Bewegen*; steht sie in der eigenen Stadt, steht die Aktion im Stadtblatt |
| Feld antippen | Aktionsblatt mit dem Feldertrag. Den **Ertrag beim Siedeln** — was eine Stadt hier ab der nächsten Runde brächte — zeigt das Blatt des Gründungsmodus |
| Karte | fest und immer vollständig sichtbar – kein Zoomen, kein Schieben. Im Hochformat dreht die App sich selbst quer (im ☰-Menü abschaltbar) |
| **Forschen** | Technologiebogen; erforschbares ist rot umrandet — durchgezogen heißt bezahlbar, gestrichelt zu teuer. Kopieren (Spionage/Kundschafterei/Internet), Freie Forschung und Rückschau stehen seit v87 unter **Fähigkeiten** (vorher unten in diesem Fenster) |
| Atomwaffen | Zielfeld antippen → *Atomschlag* im Aktionsblatt (einmal pro Runde) |
| Sklaverei / Kolonialismus | im Aktionsblatt der Stadt bzw. eines herrenlosen Feldes; Sklaverei für alle Städte auf einmal unter **Fähigkeiten**. Sklaverei bringt seit v84 **7 Münzen** je geopferter Bevölkerung (vorher 10). **Kolonialismus** beansprucht seit v103 **dreimal je Runde kostenlos** ein herrenloses Feld (`COLONY_CLAIMS`; bis v102 kaufen für 3 Münzen): Knopf **Feld beanspruchen**, rechts die Ansprüche dieser Runde als Punkte (gefüllt = offen); was nicht genutzt wird, verfällt. **Auf und neben einem fremden beanspruchten Feld wird seit v104 nicht gegründet** (wie neben einer gegnerischen Armee; bis v103 ging es, und das Feld gehörte danach beiden); wer neben einem eigenen gründet, macht es zu einem gewöhnlichen Feld der neuen Stadt. Ein so beanspruchtes Feld darf seit v84 auch **ohne Siedlerweg** besiedelt werden (übers Meer, über fremdes Gebiet hinweg), sofern sonst alles passt; die Entfernung zählt dann wie mit der Luftwaffe als Luftlinie. Gibt es einen Weg, gilt der Weg. Seit v96 **zählen diese Felder zur Hauptstadt**: mit Bürokratie bringen sie das Doppelte, wo sie auch liegen (nicht ohne Hauptstadt; bei einer Revolution produzieren sie weiter, wie die Handelsrouten) |
| Ökologie / Bürokratie | **Ökologie** bringt seit v86 je 2 Bevölkerung **des ganzen Reichs** +1 auf alle drei Erträge, einmal abgerundet (vorher je Stadt: vier Städte mit je 1 Bevölkerung brachten nichts, jetzt +2). **Bürokratie** verdoppelt die Hauptstadt samt Umland und seit v86 auch **Handelsrouten, Ökologie und den Nahrungsposten der Gentechnik**, seit v96 auch die **per Kolonialismus beanspruchten Felder** (bis v102 gekauft). Die Ertragsübersicht zeigt die verdoppelten Zahlen seit v88 ohne Zusatz am Namen (v86/v87: „Handelsrouten (Bürokratie ×2)"). Die **Kachel** im Technologiebogen sagt seit v96 nur „Hauptstadt produziert doppelt" (wie der gedruckte Bogen); was alles mitverdoppelt wird, steht im **Regelbogen** („Regeln & Technologien", Feld `voll` der Technologie) |
| Handelsrouten (v96) | Jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden Weg mit ihr verbunden ist, bringt **+1** auf alle drei Erträge, über durchgehende **Eisenbahn +4** (bis v95 +2; gemischte Strecken zählen als Straße), mit Bürokratie doppelt. Die Zahlen stehen in `TRADE_ROAD_BONUS`/`TRADE_RAIL_BONUS` (`js/data.js`); Regelbogen und Straßenknöpfe lesen sie |
| Fähigkeiten und Methode (v97) | Sechs Anweisungen des Autors. **Siedlertrecks** (Russland): Städte beginnen mit 2 Bevölkerung und wachsen zum Preis einer um 1 kleineren Stadt – von 2 auf 3 für 1 🌾 und 1 🪙; eine Stadt mit 1 Bevölkerung wächst damit für 0. **Fruchtbarkeit** (Russland): Wachsen kostet keine Nahrung, dazu **ein bezahltes Wachstum mehr** je Stadt und Runde (wie Keramik). **Günstige Forschung** (Griechenland): **1/1/2/2/5** weniger je Zeitalter (bis v96 1/2/3/4/5). **Freie Forschung** (Griechenland): in v97–v98 **zweimal je Partie** eine verfügbare Technologie aus jedem Zeitalter, ohne die Singularität – seit v99 siehe die nächste Zeile. **Wissenschaftliche Methode**: **−2/−3/−4/−5/−10** (bis v96 −2/−4/−6/−8/−10); der alte Techtree (Spielstände von vor v82) behält die alte. **Kriegerkultur** (Wikinger): **+1** Macht je Armee, mit Burgenbau auch je Stadt (bis v96 +2). Zahlen in `GREEK_DISCOUNT`, `METHOD_DISCOUNT`, `OLD_METHOD_DISCOUNT`, `WARRIOR_POWER` (`js/data.js`) |
| Freie Forschung (v99) | Anweisung des Autors: Griechenlands **Freie Forschung** gilt wieder **einmal je Runde**, jetzt für **jede erforschbare Technologie** – jedes Zeitalter **und die Singularität**, also den Forschungssieg, sobald man je Feld eine Technologie der Moderne hat; in jeder Spielart, auch im Marathon (bis v96 einmal je Runde bis zur Industrialisierung, im Marathon bis ins Mittelalter; v97–v98 zweimal je Partie ohne die Singularität). Das Blatt **Fähigkeiten** bietet genau an, was der Technologiebogen erforschbar nennt; genutzt steht dort „Diese Runde schon genutzt.“ Die KI erwägt sie jede Runde (bis v98 hob sie sie für die Moderne auf); ihr Draftwert im Marathon ist geschätzt (12) |
| Freie Forschung (v101) | Anweisung des Autors: Griechenlands **Freie Forschung** gilt **höchstens zweimal je Partie und höchstens einmal je Runde** – weiter für jede erforschbare Technologie samt Singularität, in jeder Spielart (v99–v100 einmal je Runde ohne Grenze je Partie). Das Blatt **Fähigkeiten** nennt den Rest („Noch 2 von 2 kostenlosen Forschungen in dieser Partie.“, nach einer Nutzung dazu „Diese Runde schon genutzt.“, nach beiden „Die kostenlosen Forschungen dieser Partie sind verbraucht.“). Die KI nutzt sie, sobald es geht – Aufheben (für die Moderne oder die Singularität) war gemessen schwächer; Griechenland mit Freier Forschung gewinnt zu viert unter vier KI jetzt 20,5 % statt 30,3 % (gleiche Chance 25 %; `ANNAHMEN.md`, Abschnitt v101). Spielstände von v99/v100, in denen sie schon genutzt wurde, zählen eine als verbraucht. Zahl in `FREE_TECH_USES` (`js/data.js`) |
| Kolonisten (v100) | Anweisung des Autors: Englands **Kolonisten** halbieren die **Gründungskosten, aufgerundet** – Stadtkosten plus Weg, mit Kartografie nur die Stadtkosten. Bis v99 fielen die Stadtkosten weg, und wer dazu Kartografie hatte, zahlte nach einer Sonderregel die günstigere der beiden Kosten; die Sonderregel ist weg, beides zusammen ergibt sich jetzt von selbst. Das **doppelte Bevölkerungswachstum bleibt**. Beispiele, 4 Felder Weg: erste neue Stadt (1 + 4) / 2 → **3** (bis v99: 4), mit Kartografie 1 / 2 → **1**; vierte neue Stadt (10 + 4) / 2 = **7** (bis v99: 4), mit Kartografie 10 / 2 = **5** (bis v99: 4). Im Marathon gibt es seit v100 außerdem keine Grenze von fünf Gründungen je Zug mehr. Rechnung in `foundCostOf` (`js/engine.js`), für Regel und KI gleich; der Draftwert im Marathon ist geschätzt (7, gemessen waren 14,5 für die alte Fassung). Gemessen (KI gegen KI zu viert, je 400 Partien, gepaart gegen v99): auf den Sechsecken gewinnen Kolonisten 37 % statt 50 %, auf den Dreiecken 33 % statt 30 % (gleiche Chance 25 %) |
| Taiga (v95) | Russlands Grundfähigkeit: **jedes Feld bringt mindestens 1 Nahrung** (bis v94: +1 Nahrung im Wald). Eine Untergrenze nach Technologien und Großem Leuchtturm, kein Zuschlag: Wald, Gebirge und Meer bringen ohne eigene Nahrung 1; wo schon Nahrung ist (Kunstdünger, Bewässerung, Fischerei, Landwirtschaft …), ändert sich nichts. Vulkan und vom Ereignis lahmgelegtes Gelände bringen weiter nichts, Bürokratie verdoppelt danach |
| Städte auf der Karte | Scheibe mit der **Bevölkerung als Zahl** in der Farbe des Reichs (seit v84; vorher Reichssymbol und Striche); die Hauptstadt hat einen dunklen, dicken Ring. Armeen tragen weiter das Reichssymbol |
| **Protokoll** (im Spielmenü ☰) | jede Aktion; die Würfe dahinter hängen eingeklappt an der Zeile und lassen sich antippen |
| Züge von Bots und KI (v94, v95, v96) | Laufen nach **Zug beenden** von selbst ab, bis wieder ein Mensch dran ist – jeder Zug als Folge von **Szenen auf der Karte**, seit v95 **eine je Aktion**, so wie ein Mensch sie ausführt: jede gegründete Stadt, jede Technologie, jede gebaute oder gezogene Armee, jedes Straßenfeld für sich, in der Reihenfolge des Zugs (v94 fasste Gleiches zusammen). Neue Städte und Armeen bekommen einen Ring, gezogene Armeen **gleiten** vom alten aufs neue Feld (eine gestrichelte Spur in der Farbe des Reichs bleibt stehen), gewachsene Städte zeigen **+1**, geopferte **−1**, neue Straßen, gekaufte Felder und Wunder sind golden umrandet. Über der Leiste steht ein Satz – „England (KI) gründet eine Stadt", „Russland (Bot) erforscht Schrift" – und die wievielte Szene es ist. Seit v96 **läuft der Vorrat in der Kopfzeile mit**: Wissenschaft, Nahrung, Münzen und Macht zeigen den Stand nach der Aktion der Szene (bis v95 den ganzen Zug über, was das Reich zu Zugbeginn hatte – sein Einkommen), und unter dem Kästchen erscheint, was die Aktion gekostet oder gebracht hat – „−10" rot, „+7" grün; die Bevölkerung darunter läuft ebenso mit. Bots zahlen nichts, bei ihnen bewegt sich nur die Macht (ihre Bevölkerung). Takt: **Langsam** (ab Werk) 1,35 s je Szene, mit gezogener Armee 1,9 s; **Schnell** wie v94 (0,9 bzw. 1,26 s; bei Zügen mit mehr als 7 Szenen kürzer, bis auf 60 %). Danach kommt sein Kampf wie bisher. Solange das läuft, ist die Leiste gesperrt; **ein Tipp auf die Karte** (auch auf den Rand neben den Feldern) **überspringt** den Rest dieses Zugs. Alles steht im **Protokoll**. Mit Animationen **Keine** wie bis v93 nach jedem ihrer Züge ein Blatt mit dem, was sie getan haben, und **Weiter** (seit v87 oben neben dem Titel und unten) |
| Kampf am Zugende (v90, Reihenfolge v91) | Nach **Zug beenden** – und im Zug eines Bots oder der KI nach seinen Szenen (mit Animationen „Keine" vor dem Blatt) – läuft **jeder Kampf einzeln eine Sekunde lang** ab, in der Reihenfolge der Regel: **erst die Städte, dann die Flankierungen** – eine Armee verteidigt ihre Stadt mit, auch wenn sie danach weggeflankt wird (v90 hatte die Reihenfolge umgedreht, seit v91 wieder wie zuvor; `ANNAHMEN.md`, Abschnitt 1). Das Kampffeld ist golden umrandet, die Felder des Angreifers in seiner Farbe; daneben stehen **⚔️ Angriff** (Farbe des Angreifers) und **🛡️ Verteidigung** (Farbe des Verteidigers), dazwischen **>** (der Angriff gewinnt) oder **≤** (die Verteidigung hält, auch bei Gleichstand), darüber etwa „Stadt 1/2 · hält" oder „Flanke 2/2 · Armee zerstört". Die Karte zeigt jeweils den Stand vor diesem Kampf. Die Werte stehen gut zwei Felder über oder unter dem Kampffeld und zeigen mit einem Strich darauf – auf der Seite, wo sie keine Figur des Angreifers verdecken; auf dem Telefon größer. Solange das läuft, ist die Leiste gesperrt; **ein Tipp auf die Karte überspringt** den Rest (bei mehreren Kämpfen steht der Hinweis über der Leiste), das Menü ☰ ebenso. Wer mitten im Nachspiel neu lädt, steht wieder vor „Zug beenden". Gerechnet ist alles schon vorher – das Nachspiel zeigt es nur. Die **Macht** beider Seiten steht seit v94 für die ganze Kampfphase fest: Was eine Eroberung an Macht bringt oder kostet (Kriegerkultur mit Burgenbau, Zeus, bei Bots die Bevölkerung), gilt erst danach |
| Zugfolge (v90) | Wo der Aufbau **nummerierte Plätze** zeigt – auf der Plättchenkarte und bei weniger als vier Reichen (Drei Reiche, 1 gegen 1) –, ziehen die Reiche **in der Reihenfolge der Plätze**, ab dem Startspieler. Zweimal dieselbe Zivilisation zieht also dort, wo sie sitzt (bis v89 nach der Zivilisation: Platz 1 Russland, Platz 3 Russland, erst dann Platz 2). Die klassische Aufstellung mit allen vier Zivilisationen und der Marathon bleiben bei Russland → Griechenland → England → Wikinger – auf der Originalkarte Ost, Süd, West, Nord, also im Uhrzeigersinn |

## Spielende

Ein **Militärsieg** (fremde Hauptstadt erobert, im Marathon die zweite) endet das Spiel auf
der Stelle.
Der **Wirtschaftssieg** verlangt mehr als einen Anteil der Weltbevölkerung, der von der Spielart
abhängt – mit Theologie oder Vereinten Nationen weniger, es gilt die niedrigste. Die Brüche stehen
an genau einer Stelle, `VICTORY_THRESHOLDS` in `js/data.js` (seit v102 auch nicht mehr hier);
die App zeigt sie unter **Regeln → Spielarten**, in den Technologiekacheln und als Strich am
Bevölkerungsbalken der Kopfzeile. Geändert: zu viert in v101, im Duell in v102 (Anweisungen
des Autors, `ANNAHMEN.md`).

Gezählt werden die Reiche der Aufstellung, ohne Barbaren – wer zu viert beginnt, behält die
Schwellen zu viert. Gemessen mit vier KI (je 400
Partien, gepaart): Wirtschaftssiege auf der Plättchenkarte 3 → 35, auf den Sechsecken 7 → 45
(`ANNAHMEN.md`, Abschnitt v101).

Seit v85 wird der Wirtschaftssieg **einmal je Runde geprüft, am Rundenende** – wenn alle gleich oft gezogen haben –, für alle Reiche mit dem Stand von
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
Blätter, Technologiebogen, Protokoll, Spielende, Regelbogen, Editor und alle Spielinhalte. `node smoke.js` läuft die Oberfläche auf Englisch ab und lässt keinen
neuen deutschen Text durch.

Eine Ausnahme: Protokollzeilen, die vor dem Sprachwechsel geschrieben wurden, bleiben in der
Sprache von damals – das Protokoll speichert fertige Sätze. Neue Zeilen kommen in der neuen
Sprache.

Neue Texte übersetzen: Spielinhalte in `DATA_EN` (`js/i18n.js`), Oberflächensätze mit
`T('deutscher Satz')` und einem Eintrag in `UI_EN`. Fehlt einer, erscheint der deutsche
Satz und `missingStrings()` nennt ihn.

## Karten

Im Aufbaubildschirm steht bei vier Reichen eine feste Karte zur Wahl: die **Originalkarte**
(12 × 18, aus dem Foto des gedruckten Bogens ausgemessen). Bis v98 gab es daneben eine
**große Karte** (15 × 24) im selben Stil; sie ist seit v99 entfernt (Anweisung des Autors).
Welche Zivilisation an welchem Stern startet, steht auf dem Bogen nicht –
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
| 4, experimentell | dieselben 10 Dreiecke, alle offen, dazu 4 Startdreiecke außen | 20 × 23, 210 Felder |

Bei zwei und drei Reichen bleibt **genau in der Mitte ein Feld frei** – dort ist kein
Feld, da führt kein Weg durch. Das ist rechnerisch unvermeidlich (6 · 15 = 91 − 1) und
bleibt bewusst offen.

Jedes Reich legt sein eigenes Dreieck selbst und verdeckt: **Drehen** wählt eine der drei
Lagen, ein Tipp auf ein markiertes Feld setzt die Hauptstadt. Gesperrt sind nur Felder,
die einem fremden Startdreieck näher als 2 Felder liegen oder deren Umland sich mit dem
einer möglichen fremden Hauptstadt ein echtes Feld teilen könnte (gelegt wird blind). Im
1 gegen 1 dürfen sich die Hauptstädte deshalb an der Mitte bis auf 2 nahe kommen – ihr
einziger gemeinsamer Nachbar ist das Loch. Bots drehen zufällig und setzen auf eines der
drei mittigen Felder. Erst wenn alle fertig sind, wird aufgedeckt – und seit v99 beginnt
damit gleich die Partie.

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

### Experimenteller Plättchenmodus: 14 Dreiecke (v107)

Nur bei vier Reichen, als eigene Karte im Aufbau. Die zehn Dreiecke der Vierer-Karte liegen **alle
offen** – gezogen und gedreht wie die offenen sonst –, die **vier Startdreiecke** legen die Reiche
**außen** an, an jede zweite der acht Außenkanten, Kante an Kante mit je einem offenen Dreieck:

```
    ▲
  △ ▽ △ ▽ △ ▼          ▲▼ Startdreiecke (verdeckt gelegt)
▲ ▽ △ ▽ △ ▽            △▽ zehn offene
        ▼
```

| | |
|---|---|
| Startplätze | oben links, rechts oben, unten rechts, links unten (`seatSets` `[10, 11, 12, 13]`); gezogen wird im Uhrzeigersinn. Benachbarte Startdreiecke liegen alle **8 Felder** auseinander, gegenüberliegende 11 und 19 – die gespiegelte Wahl gäbe auf dem Sechseckgitter abwechselnd 6 und 9. Jedes Feld eines Startdreiecks ist als Hauptstadt erlaubt |
| Karte | 14 von 20 Plättchen, 20 × 23, 210 Felder; alles eine Zeile tiefer als die Vierer-Karte, damit die oberste Feldzeile gerade bleibt |
| Legen | wie auf jeder Plättchenkarte: drei Lagen, Hauptstadt setzen, verdeckt |

Gemessen (KI gegen KI, je 400 Partien, Regeln von v107): Der Startspieler gewinnt auf den 14 Dreiecken
30 % der Partien, auf den 10 Dreiecken 41 % (der Vierte 12 % gegen 5 %); die vier Startdreiecke
gewinnen je 24–26 %. Mehr Partien enden mit der Singularität. Einzelheiten in `ANNAHMEN.md`,
Abschnitt v107.

Bis v106 bestand der Modus aus zehn Sechsecken zu 19 Feldern (schräg 3/4/3, Häkchen
„Sechseck-Plättchen"); sie sind seit v107 entfernt. Laufende Partien darauf spielen weiter.

### Flüsse und Inseln auf der Karte (v99)

Ein **Flussfeld** ist grünes Flusstal mit einem **blauen Wasserlauf**: von der Mitte zu den
Kanten, an denen der Fluss weiterläuft, und an einem Ende ins angrenzende Meer; ohne Meer
endet der Lauf als Quelle im Feld. Zusammenhängende Flussfelder werden wie ein Baum
verbunden, damit drei aneinanderliegende keinen Kreis zeichnen (`riverLines` in `js/ui/map.js`).
Bis v98 war ein Flussfeld blau wie das Meer, nur dunkler. Eine **Insel** ist ein Eiland mit
Strand und Grün, rundum ein schmaler Wasserrand – das Feld trägt die Meerfarbe. An den
Regeln ändert beides nichts.

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
  Griechenlands Günstige Forschung seit v97 2/2/4/4/10 (v85–v96 2/4/6/8/10) und die
  Wissenschaftliche Methode 4/6/8/10/20 (v85–v96 4/8/12/16/20) je Zeitalter. Griechenlands
  **Freie Forschung** gilt wie sonst – seit v101 zweimal je Partie, höchstens einmal je Runde,
  für alles Erforschbare samt Singularität (v99–v100 einmal je Runde ohne Grenze je Partie;
  v97–v98 zweimal je Partie ohne Singularität; v85–v96 im Marathon jede Runde, nur bis ins
  Mittelalter). Kopieren zahlt die Marathonkosten. Der Marathon hat vier Reiche, also die
  Siegschwellen zu viert.
  Regelbogen, Technologiebogen, Draft und Kopfzeile zeigen die Marathonwerte.
* **Gründen ohne Grenze je Zug** (seit v100, Anweisung des Autors; v84–v99 höchstens fünf neue
  Städte je Zug).
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
  zwei Züge hintereinander schlagen), **Wirtschaftssieg** (mehr als die Schwelle des Duells an der
  Weltbevölkerung, am Rundenende) oder **Forschungssieg** (die Singularität). Wer die Seite
  schließt, ist wieder im Menü. Gewonnene Wege hakt sie ab (das Gerät merkt sie sich).
* **Runde 1–4 lehren allen dasselbe (17 Schritte), aber vom Weg geführt:** Hauptstadt und
  Umland · die eigene Fähigkeit · alles erforschen, was nichts kostet · **der Würfel im
  Technologiebogen** (v93): eine Technologie finden, die es in dieser Partie nicht gibt – blasse
  Kacheln lassen sich antippen und sagen, warum sie blass sind (durchgefallen, mit der Augenzahl
  aus dem Protokoll, oder noch nicht ausgewürfelt); danach die Regel: je Technologie ein Würfel,
  4–6 = es gibt sie, also 50 % · die Stadt mit der meisten Nahrung, später die mit der meisten
  Wissenschaft – beide Rätsel haben genau eine Lösung · wachsen (Münzen springen ein) · Zug beenden
  und Englands Zug ansehen (seit v94 auf der Karte) · alle Städte wachsen · Rad und Handelsroute · **belagert werden** und die
  Stadt mit Armee und Macht halten · **flankieren** mit Taktik. In Runde 3 und 4 geht es je um die
  Technologie, die den Weg voranbringt – Militär: Belagerungsmaschinen, dann Eisenverarbeitung;
  Wirtschaft: Keramik, dann Demokratie (öffnet die Theologie); Forschung: Schrift, dann Papier
  (öffnet die Industrialisierung) –, danach wird ausgegeben, was noch geht. Auch Lage und Tipps
  sprechen vom Weg („auf Straßen ziehen Armeen doppelt so weit – gut für deinen Angriff").
* **Ab Runde 5 die Schritte des Wegs:** belagern und erobern · Theologie und die Mehrheit ·
  Wissenschaftliche Methode, in jedem Feld die Moderne, die Singularität. Mit der Musterlösung
  fällt der Sieg auf dem Militär- und dem Wirtschaftsweg in Runde 6, auf dem Forschungsweg seit v97 in
  Runde 7 (bis v96 auch in Runde 6 – Griechenlands Rabatt und die Methode ziehen jetzt weniger ab). Danach: **Anderen Weg ausprobieren** (die Seite wieder, eine
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

Das klassische Tutorial (Russland gegen drei Bots, bis v101) ist seit v102 entfallen
(Anweisung des Autors): **Erstes Spiel** ist der eine Einstieg.

## Prüfprogramme (nur für die Entwicklung)

```bash
node test.js     # Regeln gegen die Beispiele aus dem Regelheft
node smoke.js    # Oberfläche in jsdom durchspielen (braucht: npm install jsdom)
python3 build_single.py && node check_single.js   # Einzeldatei bauen und in jsdom prüfen
node tools_ki.js duell 40 diff=david   # Messreihen mit der KI (siehe Kopf der Datei)
node tools_ki.js methode 200           # v96: Methode zuerst gegen die Reihenfolge bis v95, gepaart
node tools_ki.js selbst 400 reiche=4 dreiecke14   # v107: KI gegen KI auf 14 Dreiecken, Siege nach Platz in der Zugfolge
```

Grün schreibt jeder Lauf **eine Zeile** (`test   2004 passed`, `smoke  172 passed`, `single  ok`),
rot jede FAIL-Zeile; alles andere – „ok"-Zeilen und Messwerte – mit `--verbose` (v102).
`smoke.js` würfelt mit festem Startwert (`SMOKE_SEED=…` probiert einen anderen).

`test.js` rechnet unter anderem die Einkommensbeispiele des Regelhefts nach,
prüft Technologiekosten, Stadtgründungs- und Armeekosten und spielt 40 Bot-Partien
komplett durch.

## Dateien

```
index.html            Aufbau der Bildschirme – und die eine Liste der Skripte (v102): Build,
                      Service Worker und Tests lesen ihre <script>-Tags
css/style.css         Optik des gedruckten Spielbogens
js/data.js            Technologien, Zivilisationen, Erträge, Karte, Siegschwellen
js/civs.js            Zivilisationen, erzeugt aus data/civs.json (node tools_civs.js)
js/i18n.js            Englisch: Spielinhalte und Oberflächensätze
js/hex.js             Hexraster, Distanzen, Wegsuche
js/tiles.js           Dreiecksplättchen: Vorrat, Formen (auch 14 Dreiecke), Legephase, Kartenbau
js/engine.js          Regeln: Einkommen, Aktionen, Kampf, Sieg
js/expansion.js       Erweiterungen: Ereignisse, Weltwunder, Barbaren
js/bots.js            Bot-Züge nach den Bot-Regeln
js/ki.js              KI-Züge nach den Regeln für Menschen
js/marathon.js        Marathon: Kartengenerator, Hauptstädte, Draft, Draftwahl der KI; Fähigkeitswahl der Plättchenkarte (v107)
js/anim.js            Züge von KI und Bots aufnehmen und in Szenen teilen
js/firstgame.js       Erstes Spiel: Seite vor der Partie, Karte, Würfel, Englands Drehbuch, Ziele, Tipps, Schienen, Panel
js/ui/base.js         Oberfläche (seit v102 je Bildschirm eine Datei): Fenster, Blätter, Leiste, Drehung, Speichern
js/ui/map.js          die Karte: Gelände, Städte, Armeen, Ringe, Flüsse, Antippen
js/ui/game.js         Spielbildschirm: Kopfzeile, Leiste, Gründen, Feld- und Stadtblatt, Erträge
js/ui/sheets.js       Technologien, Macht, Fähigkeiten, Protokoll
js/ui/turns.js        Zugende, KI und Bots, Kämpfe und Züge nachspielen
js/ui/end.js          Spielende, Nochmal spielen
js/ui/world.js        Welt, Ereignis, Wunder, Nahrung, Zugbeginn
js/ui/setup.js        Aufbau und die eine Vorliebe (Animationen)
js/ui/place.js        Legephase der Plättchenkarte
js/ui/draft.js        Fähigkeiten wählen: Draft des Marathons, Fähigkeitswahl der Plättchenkarte
js/ui/editor.js       Karteneditor
js/ui/boot.js         Start: Sprache, Menü, Verdrahtung, Regeln, Laden und Speichern
sw.js                 Offline-Cache
ANNAHMEN.md           wo die Regeln offen sind und wie hier entschieden wurde
data/civs.json        die Zivilisationen – Quelle für js/civs.js (node tools_civs.js)
Startplaettchen.pdf   Druckbogen der 20 Plättchen (aus js/tiles.js erzeugt)
```
