# Hochzeivilization — Projekt-Übergabe (Stand 30.10., `sw.js` v98)

Dieses Dokument ist so geschrieben, dass es in einen neuen Chat kopiert werden kann.

## Was das ist

Eine **offline spielbare Web-App** eines selbstgebauten Civilization-artigen Hex-Brettspiels,
gebaut für den Autor (deutschsprachig). Zielplattform: **iPad, über GitHub Pages zum
Home-Bildschirm hinzugefügt** (PWA, funktioniert offline). Vollständige Regel-Engine mit
automatischen Bots, Solo-gegen-Bots und Hotseat für 2–4 Menschen. Oberfläche **deutsch
und englisch** (zwei Flaggen im Hauptmenü, Deutsch ist Vorgabe und Quelle).

## Letzte Sitzungen auf einen Blick (v61 → v98)

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
| v84 | **Sklaverei 7 Münzen** (vorher 10). **Stadtmauern 2, Eisenverarbeitung 4, Belagerungsmaschinen 5** (vorher 5/2/4; das Tutorial behält die alten). **Marathon:** Singularität 300, höchstens fünf Gründungen je Zug, Militärsieg erst mit der zweiten eroberten Hauptstadt (wer seine verliert, spielt ohne weiter). **Kolonien:** ein per Kolonialismus gekauftes Feld ist auch ohne Siedlerweg besiedelbar, Entfernung Luftlinie. **Städte zeigen ihre Bevölkerung als Zahl** in Reichsfarbe statt Symbol und Strichen. `kiRisk` schneller (gleiche Ergebnisse) | Regel + Modus + Oberfläche + KI |
| v85 | **Wirtschaftssieg am Rundenende:** einmal je Runde geprüft, wenn alle gleich oft gezogen haben, mit dem Stand von dort – gewinnt jemand, endet das Spiel sofort (Punktvergleich nur, wenn in derselben Runde ein anderer Sieg angemeldet war); auch schon in Runde 1. **Startausgleich:** im ersten Zug +1/+2/+3 Münzen für den Zweiten/Dritten/Vierten in der Zugfolge (Bots nicht). **Marathon:** Günstige Forschung und Wissenschaftliche Methode ziehen doppelt ab, Freie Forschung nur bis ins Mittelalter. Die KI sieht als Letzte der Runde ihren Wirtschaftssieg; ihre Draftwerte im Marathon sind neu gemessen (200 Partien) | Regel + Modus + KI |
| v86 | **Ökologie übers ganze Reich:** je 2 Bevölkerung des Reichs +1 auf alle drei Erträge, einmal abgerundet (vorher je Stadt). **Bürokratie** verdoppelt auch Handelsrouten, Ökologie und den Nahrungsposten der Gentechnik; die Ertragsübersicht sagt es („Bürokratie ×2"). Späte KI-Züge mit vielen Kolonien schneller (gleiche Ergebnisse) | Regel + KI-Tempo |
| v87 | **„Weiter" oben und unten** im Blatt eines Bot- oder KI-Zugs. **„Fähigkeiten" statt „Erträge"** (zeigte dasselbe wie der Gründungsmodus): eigene Fähigkeit mit Wirkung, Freie Forschung und Rückschau, Wunder-Technologien, **Alle Städte (kostenlos) wachsen**, **In allen Städten opfern**, Kopieren – Freie Forschung, Rückschau und Kopieren sind aus dem Technologiebogen ausgezogen; an der Leiste die **Zahl der Arten kostenloser Aktionen**. Fehler: ein Rückschau-Anspruch ohne Wahl blockierte die übrigen; **hochkant (gedreht) lag jedes Blatt außerhalb des Bildschirms** – auch das eines KI-Zugs samt „Weiter" (`setBarHeight` maß die gedrehte Leiste). Ein vom Zufall abhängiger Smoke-Schritt (Hungersnot) läuft jetzt ohne Ereignisse | Oberfläche + Fehler |
| v88 | **Ertragstechnologien schließen die billigeren ihres Feldes ein** – sie setzen den Bonus, statt ihn zu erhöhen: Mathematik/Elektrizität/KI geben dem Wald +1/+2/+3 Wissenschaft, auch alle drei zusammen +3; Containerlogistik dem Meer +2 Nahrung, +1 Münze; Universitätswesen und Robotik je Bevölkerung +2; verschiedene Felder addieren sich, wer eine Kette ganz hat, steht wie vorher. **Belagerungsmaschinen +3** (vorher +5). **Singularität 120** (vorher 100; Marathon bleibt 300). Die Ertragsübersicht sagt nicht mehr „(Bürokratie ×2)". Hauptmenü: „Ne Runde Civ? …" | Regel + Oberfläche |
| v89 | **Doppeltipp auf nachgerückte Knöpfe** (gemeldet: „beim Öffnen von Fähigkeiten wachsen alle Städte", nicht nachstellbar; nachgestellt: nach der Freien Forschung rückt „Alle Städte wachsen" unter den Finger): ein Knopf im Blatt zählt erst 0,4 s nach dem Öffnen/Neuzeichnen, derselbe Knopf und „Weiter" im Bot-Blatt sofort. Ertragstexte ohne „inkl. …". **Dampfmaschine: ein bezahltes Wachstum mehr** (wie Keramik, Wortlaut angeglichen) | Fehler + Regel + Oberfläche |
| v90 | **Kampf am Zugende nachgespielt:** jeder Kampf eine Sekunde lang auf der Karte – Kampffeld golden, Angreiferfelder umrandet, ⚔️ Angriff und 🛡️ Verteidigung mit > oder ≤, Zeile mit Ausgang; ein Tipp auf die Karte überspringt; auch in Bot- und KI-Zügen vor ihrem Blatt. **Regeländerung: erst Flankieren, dann die Städte** (bis v89 umgekehrt; in v91 zurückgenommen). **Zugfolge nach Plätzen**, wo der Aufbau Plätze nummeriert (Plättchenkarte, drei Reiche, Duell); klassisch und Marathon weiter R → G → E → W | Oberfläche + Regel |
| v91 | **Städte wieder vor den Flanken** (Anweisung des Autors: mit den Flanken zuerst fielen verteidigte Städte) – Rechenweg wie bis v89; das Nachspiel zeigt damit erst die Städte, dann die Flanken. `tools_ki.js … reihenfolge` vergleicht jetzt mit „Flanken zuerst" | Regel |
| v92 | **Erstes Spiel** (Wunsch des Autors): roter Knopf ganz oben im Menü („Neues Spiel" nicht mehr rot), eine ganze Partie 1 gegen 1 gegen England auf eigener Karte – Ziele statt Erklärtexten, „💡 Tipp anzeigen" mit goldener Markierung, Rückmeldung nach jedem Ziel, Schienen durch Ablehnen mit Begründung statt gesperrter Knöpfe; Runde 1–4 für alle gleich, dann wählt man Militär-, Wirtschafts- oder Forschungssieg (`js/firstgame.js`). Das Tutorial bleibt (dort zwei Textfehler behoben) | Modus + Oberfläche |
| v93 | **Erstes Spiel umgebaut** (Wünsche des Autors): zuerst eine **Seite** (eine Stadt in der Steinzeit, eine Zivilisation, die die Zeiten überdauert, mehrere Wege zum Sieg) mit **gleich der Wahl des Wegs**; Runde 1–4 lehren allen dasselbe, aber **vom Weg geführt** (Runde 3/4 je eine Technologie des Wegs, Lage und Tipps); neuer Schritt **„Ausgewürfelt"**: blasse Kacheln sind antippbar und nennen ihren Wurf, danach die Regel – 4–6, also 50 %; **ab dem Mittelalter fehlt etwa die Hälfte** (fest, 24 von 46), die Würfel im Protokoll passen dazu. Alle drei Wege siegen in Runde 6 | Modus + Oberfläche |
| v94 | **Macht fest für die Kampfphase** (Anweisung des Autors: eroberten die Wikinger mit Kriegerkultur und Burgenbau eine Stadt, flankierten sie im selben Zug schon stärker) – Kriegerkultur, Zeus und Bot-Macht wirken erst nach der Phase. **Züge von KI und Bots auf der Karte nachgespielt** (Wunsch des Autors): kein Blatt mehr, nach dem Zugende laufen alle ihre Züge durch, bis wieder ein Mensch dran ist – je Zug kurze Szenen (Armeen gleiten, Ringe um Neues, +1/−1, ein Satz über der Leiste), ein Tipp auf die Karte überspringt; alles im Protokoll (`js/anim.js`). Einstellung **„Keine Animationen"** bringt das Blatt mit „Weiter" zurück; das Tutorial behält es immer | Regel + Oberfläche |
| v95 | Nachspiel der KI- und Bot-Züge **je Aktion eine Szene** (Wunsch des Autors: v94 zeigte zu viel auf einmal, etwa alle Technologien zusammen) – jede Stadt, Technologie, Armee, jedes Straßenfeld für sich; wo der Stand täuscht, sagt die Aktion ihre Art (`log(…, art)`: geschenkte Armee, Kopie). Einstellung **„Animationen": Langsam (ab Werk, 1,5-facher Takt) / Schnell (Takt von v94) / Keine** statt des Häkchens. **Taiga** (Russland): **jedes Feld bringt mindestens 1 Nahrung** statt +1 Nahrung im Wald; zwei Tutorialzahlen angepasst (+5 🌾, 20 Nahrung) und jetzt geprüft | Oberfläche + Regel |
| v96 | Fünf Anweisungen des Autors: **Handelsroute über Eisenbahn +4** (vorher +2; `TRADE_RAIL_BONUS`); **per Kolonialismus gekaufte Felder zählen zur Hauptstadt** – mit Bürokratie doppelt; **Kacheln ohne Bürokratie-Zusatz** (Bürokratie: „Hauptstadt produziert doppelt"), der ganze Text nur im Regelbogen (`voll`, `techEffectFull`); **die KI erforscht die Wissenschaftliche Methode vor den übrigen Technologien eines Zugs** (`kiMethodeZuerst`, Neuplanen nach dem Freischalten) – vermeidbar verschenkter Rabatt in 40 Duellen 206 → 0; **laufender Vorrat in der Kopfzeile** beim Nachspielen von KI- und Bot-Zügen, mit „−x"/„+x" unter dem Kästchen (`hudStand`, `animKopf`, `animVorrat`) | Regel + KI + Oberfläche |
| v97 | Sechs Anweisungen des Autors: **Siedlertrecks** wachsen zum Preis einer um 1 kleineren Stadt (`growPrice`; eine Stadt mit 1 Bevölkerung damit für 0), **Fruchtbarkeit** bringt ein bezahltes Wachstum mehr (`growLimits`), **Günstige Forschung 1/1/2/2/5**, **Freie Forschung zweimal je Partie** aus jedem Zeitalter, nicht die Singularität (`FREE_TECH_USES`, `p.freeTechsUsed`; die KI hebt sie für die Moderne auf, `kiFreeTechChoices`), **Wissenschaftliche Methode 2/3/4/5/10** (der alte Techtree – das Tutorial – behält 2/4/6/8/10, `OLD_METHOD_DISCOUNT`), **Kriegerkultur +1** je Armee und Burgstadt (`WARRIOR_POWER`). Im Ersten Spiel siegt der Forschungsweg jetzt in Runde 7. Spieltipp zur Freien Forschung neu, Draftwerte im Marathon geschätzt | Regel + KI |
| v98 | Anweisung des Autors: **Startausgleich 2/4/6** Münzen für den Zweiten, Dritten und Vierten (bis v97 1/2/3), **zu zweit der Zweite 4** (bis v97 1; `START_BONUS_DUEL`, „zu zweit" = zwei Reiche ohne Barbaren), zu dritt 2 und 4. Der Satz im Regelbogen kommt aus den Zahlen (`startBonusText`) | Regel |

Neu in v98: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Startausgleich 2/4/6, zu zweit 4 (v98)"), die Fragilität zum Startausgleich ergänzt,
offener Punkt 34 nachgetragen, Punkt 55.

Neu in v97: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Siedlertrecks und Fruchtbarkeit · Günstige und Freie Forschung · Wissenschaftliche
Methode · Kriegerkultur (v97)"), zwei Fragilitäten neu, eine ergänzt („Das Erste Spiel hängt an
seiner Karte …": Forschungsweg Runde 7), die offenen Punkte 52–54.

Neu in v96: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Eisenbahn +4 · gekaufte Felder zählen zur Hauptstadt · Kacheln ohne Bürokratie-Zusatz ·
Wissenschaftliche Methode zuerst · laufender Vorrat beim Nachspielen (v96)"), fünf Fragilitäten
neu, eine ergänzt („Szenen hängen an den Protokollzeilen …"), zwei Einträge in der Bug-Historie,
die offenen Punkte 50 und 51; `tools_ki.js` hat den Modus `methode`.

Neu in v95: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Je Aktion eine Szene · Animationen langsam, schnell oder keine · Taiga: jedes Feld
mindestens 1 Nahrung (v95)", dazu Hinweise im Abschnitt v94 und bei den Ertragstechnologien v88),
die Zeile `js/anim.js` in der Dateitabelle, die Fragilitäten zum Nachspielen und zu Tutorialzahlen
nachgeführt, zwei Einträge in der Bug-Historie, der offene Punkt 49 (Punkt 48 nachgeführt).

Neu in v94: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Macht fest für die Kampfphase · Züge von KI und Bots nachspielen (v94)", dazu
Abschnitt 1), die Zeile `js/anim.js` in der Dateitabelle und bei den sieben Listen, drei
Fragilitäten neu, zwei ergänzt („Kampfreihenfolge und Nachspiel …", „Während `ui.combat` …"),
zwei Einträge in der Bug-Historie, der offene Punkt 48.

Neu in v93: der erste Punkt unter „Was das Spiel heute kann" (ergänzt), ausführlich in
`ANNAHMEN.md` (Abschnitt „Erstes Spiel: Seite vor der Partie, Weg von Anfang an, der Würfel im
Bogen (v93)"), die Zeile `js/firstgame.js` in der Dateitabelle, die Fragilität „Das Erste Spiel
hängt an seiner Karte …" ergänzt, die offenen Punkte 46 und 47 nachgeführt.

Neu in v92: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Erstes Spiel (v92)"), eine Zeile in der Dateitabelle (`js/firstgame.js`), eine
Fragilität („Das Erste Spiel hängt an seiner Karte …"), ein Eintrag in der Bug-Historie, die
offenen Punkte 46 und 47.

Neu in v91: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Städte wieder vor den Flanken (v91)", dazu Abschnitt 1 und ein Vermerk im Abschnitt
v90), eine Fragilität ergänzt („Kampfreihenfolge und Nachspiel …"), ein Eintrag in der
Bug-Historie, offener Punkt 44 erledigt.

Neu in v90: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Kampf am Zugende nachgespielt · erst Flanken, dann Städte · Zugfolge nach Plätzen
(v90)", dazu Abschnitt 1), eine Fragilität geändert („Feste Spielerreihenfolge"), drei neu, die
offenen Punkte 44 und 45.

Neu in v89: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Doppeltipp auf nachgerückte Knöpfe · Ertragstexte ohne „inkl." · Dampfmaschine:
ein Wachstum mehr (v89)"), zwei Fragilitäten neu, ein Eintrag in der Bug-Historie, die offenen
Punkte 42 und 43.

Neu in v88: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Ertragstechnologien schließen die billigeren ein · Belagerungsmaschinen +3 ·
Singularität 120 · Übersicht ohne Bürokratie-Zusatz · „Ne Runde Civ?" (v88)"), zwei
Fragilitäten neu, eine geändert („Wer eine neue Einkommenszeile baut …": kein `note` mehr), die
offenen Punkte 40 und 41.

Neu in v87: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Fähigkeiten statt Erträge · „Weiter" oben und unten · Rückschau ohne Wahl · Blätter
hochkant (v87)"),
fünf Fragilitäten neu, eine ersetzt („Die Leiste hat zwei Sorten Knöpfe"), drei Einträge in der
Bug-Historie, die offenen Punkte 38 und 39; Punkt 0 und 19 nachgetragen (der gedrehte
Bildschirm ist ein Kandidat für den gesperrten Bildschirm von v80).

Neu in v86: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Ökologie übers ganze Reich · Bürokratie auch für Handelsrouten, Ökologie und
Gentechnik (v86)"), eine Fragilität neu, die offenen Punkte 36 und 37; Punkt 9 und der
Abschnitt „Ökologie (v69)" nachgetragen.

Neu in v85: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Wirtschaftssieg am Rundenende · Marathon: Griechenland und Methode ·
Startausgleich (v85)"), eine Fragilität geändert, zwei neu, die offenen Punkte 33–35;
Punkt 14 und 28 nachgetragen.

Neu in v84: der erste Punkt unter „Was das Spiel heute kann", ausführlich in `ANNAHMEN.md`
(Abschnitt „Sklaverei 7 · drei Militärkosten · Marathonregeln · Kolonien · Bevölkerung als
Zahl (v84)"), vier neue Fragilitäten und die offenen Punkte 29–32.

Neu in v83: die nächsten vier Punkte unter „Was das Spiel heute kann", ausführlich in
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
verlässt die Flanke), seit v77 Punkt 14 (Wirtschaftssieg in Runde 2 im Duell), seit v85 Punkt 33
(Auslegungen zu Wirtschaftssieg, Startausgleich und Rabatten) und 34 (der Startausgleich
gleicht wenig aus), seit v86 Punkt 36 (Auslegungen zu Bürokratie und Ökologie), seit v87
Punkt 38 (Auslegungen zu „Fähigkeiten") und 39 (keine Erinnerung vor dem Zugende), seit v88
Punkt 40 (Auslegungen zu den Ertragstechnologien) und 41 (Balance nur grob gemessen), seit v89
Punkt 42 (gemeldetes Wachsen beim Öffnen nur eingegrenzt) und 43 (Auslegungen zu v89), seit v90
Punkt 45 (Auslegungen zu v90; Punkt 44, die Kampfreihenfolge, hat der Autor in v91 entschieden),
seit v92 Punkt 46 und 47 (Erstes Spiel), seit v94 Punkt 48 (Auslegungen zu v94), seit v95 Punkt 49
(Auslegungen zu v95, auch zur Taiga), seit v96 Punkt 50 (Auslegungen zu v96) und 51 (die
Stärke der neuen Forschungsreihenfolge nur knapp messbar), seit v97 Punkt 52 (Auslegungen zu v97:
Siedlertrecks bei 1 Bevölkerung, Freie Forschung ohne Singularität, Kriegerkultur auch je Burgstadt),
53 (Balance und Draftwerte der fünf Fähigkeiten nicht gemessen) und 54 (ein einmaliger Smoke-Fehler,
Schritt unbekannt), seit v98 Punkt 55 (Auslegungen zum Startausgleich zu zweit).

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
- **Deliverables in `/mnt/user-data/outputs/`:** Ordner `hochzeivilization/` (36 Dateien),
  `hochzeivilization.zip`, und `hochzeivilization-einzeldatei.html` — Letzteres ist, was der
  Autor tatsächlich aufs iPad lädt.
- **Wichtig beim Paketieren:** `node_modules` und `package*.json` ausschließen
  (`tar -c --exclude=node_modules --exclude='package*.json' .` bzw. `zip -x '*/node_modules/*'`).
  Einmal ist ein `node_modules` ins Zip gerutscht und ließ sich wegen eines I/O-Fehlers auf dem
  Mount nicht mehr löschen — nur durch Umbenennen aus dem Ordner heraus lösbar.

## Dateistruktur (~10 400 Zeilen)

| Datei | Zeilen | Inhalt |
|---|---|---|
| `js/i18n.js` | 1637 | Sprachen: `LANG`, `setLang`, `DATA_EN` (Spielobjekte), `UI_EN` + `T()` (Oberflächensätze), `missingStrings()` |
| `data/civs.json` | 69 | **Quelle** für die Zivilisationen · `node tools_civs.js` → `js/civs.js` |
| `js/civs.js` | 54 | ERZEUGT: `CIVS`, `CIV_BY_KEY`, `ORDER` (Zugfolge), `BARB_CIV` – nicht von Hand ändern |
| `js/data.js` | 551 | `APP_VERSION`, TERRAIN (inkl. Vulkan und `X` „Kein Feld"), TECHS (66, davon 62 Grundspiel) samt `OLD_TECH_COSTS`/`techBase` (alter Techtree, nur Tutorial), CIVS mit je 3 Fähigkeiten, feste Karten, `mapRng`, EVENT_ROWS (18), WONDERS (18), Regelkonstanten |
| `js/hex.js` | 157 | Hexraster (pointy-top, odd-r), `hexDistance`, `hexOpposite`, `reachable` (Heap, seit v77), `pathSteps` |
| `js/tiles.js` | 334 | Dreiecksplättchen: Würfelgeometrie, `TILE_POOL` (20), `TILE_SHAPES` (2/3/4), Plan, Legeregeln (`seatFreeCells`), Ertragsvorschau und dominierte Startfelder (`placeYieldTable`, `dominatedCells`), Kartenbau |
| `js/engine.js` | 2254 | Kernregeln: Einkommen, Kurse, Kampf, Bewegung, Wachstum inkl. Nahrungsgrenze, Handelsrouten, Zivilisationsfähigkeiten, Sieg, Zugablauf, Protokoll · `powerView` (Machtansicht), `canFlank`, `foundSiteError`/`withFoundTable` · `isAuto`/`kindTag` (Bot oder KI) · Sammelaktionen `growAll`/`growAllPlan`/`sacrificeAll` und `freeActions` (v87) |
| `js/expansion.js` | 524 | Ereignisse, Barbaren (neutrale Fraktion), Weltwunder, Kultursieg, Bot-Wunderbau |
| `js/bots.js` | 489 | Bot-Züge, Siedlerbewegung, **neunstufige Armeeprioritäten** (`botPlanArmies` für 1–6, `botMoveArmy` für 7–9), Bot-Forschung |
| `js/ki.js` | 1945 | **KI nach den Regeln für Menschen** (v77): Lage (`kiContext`), Bewertung (`kiValue`, `kiRisk` mit Ernstfall und Plätzen an der Stadt `kiAttackSlots`, `kiOffense`), Kandidaten und Planer auf Kopien (`kiCandidates`, `kiPlan`), Militärpakete (Angriff, Verteidigung, Flanke), Aufstellen, Startplättchen (`kiPlaceSeat`), Stufen (`KI_PARAMS`) |
| `js/anim.js` | 165 | **Züge von KI und Bots nachspielen** (v94, ohne Oberfläche): Aufnahme über `LOG_HOOK` (`animAufnahme`, `animSnap`), seit v95 je Aktion eine Szene (`animSzenen`; Art aus `log(…, art)` oder `animUnterschied`, Inhalt `animDetails`), Sätze (`animText`); abgespielt in `ui.js` (`playAnim`, `animFaktor`, `animDraw`, `animMarks`, `animCaption`) |
| `js/marathon.js` | 312 | **Marathon** (v83): Kartengenerator (`marathonTerrain`, Rauschen, Kämme, Flüsse), Hauptstädte (`marathonCapitals`, `marathonStartYield`), Draft (`draftView`, `draftNew`, `draftOptions`, `draftPick`, `ALL_ABILITIES`), Wahl der KI (`KI_DRAFT_BASE`, `kiDraftValue`, `kiDraftPick`) |
| `js/ui.js` | 3070 | SVG-Karte, Antippen, Aktionsblätter, Technologiebogen, Nahrungsfenster, Aufbau (inkl. 1-gegen-1, Sitzart Mensch / KI / Bot), Editor, Kurzregeln , Legephase (`screen-place`) · Kartenansichten: Gründungsmodus samt Erträgen, Machtringe (v75, ein Stück je Punkt seit v76) · Blatt „Fähigkeiten" (`abilSheet`, v87) |
| `js/tutorial.js` | 692 | Geführtes Übungsspiel: **29 Schritte** (19 mit Aufgabe), feste Würfelfolge, Schienen, feste Texte |
| `js/firstgame.js` | 1458 | **Erstes Spiel** (v92, v93): Seite vor der Partie mit der Wahl des Wegs (`fgSeite`), Karte, Verfügbarkeit und Würfel (`FG_SPAETER`, `fgVerfuegbar`, `fgWurf`, `fgNextDie`), Englands Drehbuch (`fgGegnerZug`), Schritte `FG_STEPS` (Ziel, Stand, Tipp, Rückmeldung, Schienen, Musterlösung; vom Weg geführt über `fgJe`, `fgRestSchritt`), blasse Kacheln (`fgBlass`), Schienen (`fgVeto`), Panel (`fgRenderPanel`), Spielende |
| `test.js` | 7863 | **1977 Assertions**, `node test.js` |
| `smoke.js` | 4906 | **182 Schritte** durch die echte UI via jsdom, `node smoke.js` |
| `build_single.py` / `check_single.js` | 21 / 83 | Einzeldatei bauen und in jsdom prüfen (inkl. Plättchenkarte) |
| `tools_version.js` | 69 | Version erhöhen + `BUILD_HASH` schreiben – **vor jedem Ausrollen** |
| `tools_docs.js` | 72 | Zahlen in dieser Übergabe nachziehen (Zeilen, Assertions, Schritte) |
| `tools_civs.js` | 82 | `data/civs.json` → `js/civs.js` |
| `tools_ki.js` | 372 | Messreihen mit der KI: Duell gegen Bots, eine KI gegen drei Bots, Stufen gepaart, KI gegen KI, nachgestellte Vorstöße samt Ausgaben vor/nach dem ersten Treffer (`node tools_ki.js duell 40 diff=david`, `… vorstoss 40 art=droh` …); seit v90 die Schalter `reihenfolge` (Kampfphase zusätzlich in der Reihenfolge bis v89, Unterschiede) und `kampflaenge` (Kämpfe je Phase) |
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

- **v98 auf einen Blick.** `START_BONUS_COINS` [0, 2, 4, 6] und `START_BONUS_DUEL` 4 (`js/data.js`);
  `startBonus` fragt `empireCount(S)` (Reiche ohne Barbaren, neu in `js/engine.js`, von `turnPosition`
  mitbenutzt): bei zwei Reichen bekommt Platz 1 `START_BONUS_DUEL`, sonst gilt die Reihe. Regelbogen:
  `startBonusText()` statt des festen Satzes (deutscher Schlüssel mit `%s`, englisch in `UI_EN`). Der
  Protokollsatz für „+1 Münze" bleibt im Code, wird mit diesen Zahlen aber nicht mehr erreicht. Tests:
  `test.js` „Startausgleich" (zu viert 0/2/4/6 samt Protokoll, Startspieler England, zu zweit 4 in
  beiden Richtungen, Duell mit KI, zu dritt 2/4, Bots nichts, zu zweit gegen einen Bot, der Satz deutsch
  und englisch); `smoke.js` der ganze Satz im Regelbogen des normalen Spiels.
- **v97 auf einen Blick.** Zahlen in `js/data.js`: `GREEK_DISCOUNT` [1,1,2,2,5], `METHOD_DISCOUNT`
  [2,3,4,5,10], `OLD_METHOD_DISCOUNT` [2,4,6,8,10] (nach `OLD_TECH_COSTS`), `FREE_TECH_USES` 2,
  `WARRIOR_POWER` 1; `MARATHON_FREE_TECH_AGE` ist weg. `techCost`: `f * GREEK_DISCOUNT[age]` und
  `f * methodDiscount(S)[age]` (`methodDiscount` = alt im alten Techtree); `techEffect` schreibt die
  Methode für Marathon und alten Techtree aus den Zahlen, `abilEffect` nur noch die Günstige
  Forschung im Marathon. Freie Forschung: `freeTechsLeft(p)`, `freeTechOptions` (alle verfügbaren
  aus `techPool`, keine Singularität), `useFreeTech` zählt `p.freeTechsUsed`; `migrateState` löscht
  `p.freeTechUsed`; `abilSheet` nennt den Rest (zwei neue Sätze in `UI_EN`, „Diese Runde schon
  genutzt." ist weg). Wachstum: `growPrice` (Siedlertrecks: `pop − 1`), `growLimits` (Fruchtbarkeit
  +1 bezahlt). Kriegerkultur: `powerBonus`, `kiPowerBonus`, `kiTechBonus('burgenbau')` mit
  `WARRIOR_POWER`. KI: `kiMethodeAnteil(S)` im Zuschlag der Methode, `kiFreeTechChoices(S, pi, K)`
  in `kiCandidates`; `KI_DRAFT_BASE` fünf Werte geschätzt. Texte: `data/civs.json` → `js/civs.js`,
  `DATA_EN.abil`/`.tech`, Spieltipp (Index 3, beide Sprachen), Marathontexte in `index.html` und
  `rulesModal` ohne „Freie Forschung nur bis ins Mittelalter", Erstes Spiel `faehigkeit.gut` mit
  `GREEK_DISCOUNT`. Tests: `test.js` Regelheft-Beispiel, Techtree, Kriegerkultur (samt Burgenbau und
  der Kampfphase von v94, jetzt aus `WARRIOR_POWER`), „Russland: Alternativen" (Siedlertrecks,
  Fruchtbarkeit, Marathon-Kombinationen), Freie Forschung (normal, Marathon, Singularität,
  Spielstand von v96), Zahlen in den Texten, Fähigkeiten-Zahl, alter Techtree und Tutorialtexte,
  KI (Anteil der Methode, Freie Forschung aufheben und gegen Ende nehmen), Erstes Spiel Runde 7;
  `smoke.js` Marathon- und Normalspiel-Regelbogen, Freie Forschung im Blatt (2 → 1 → verbraucht),
  „v97: …" (Stadtknopf mit Siedlertrecks und Fruchtbarkeit, Regelbogen englisch).
- **v96 auf einen Blick.** Handelsrouten: `TRADE_ROAD_BONUS` 1, `TRADE_RAIL_BONUS` 4 (data.js) in
  `tradeRoutes`; Regelbogen und Straßenknöpfe über `%s`, Tutorialtexte fest „+4" (`smoke.js`
  prüft sie); `kiTechBonus('eisenbahn')` × (4 − 1). Gekaufte Felder: `tileYieldAt` verdoppelt mit
  Bürokratie auch Felder aus `S.bought[pi]` (mit Hauptstadt; einmal; `pre.kol` als Menge in
  `incomeBreakdown`), `kiColonySpots` zählt es mit. Texte: `voll` an der Technologie (Bürokratie,
  Kolonialismus), englisch an dritter Stelle in `DATA_EN.tech`, `applyDataLang`/`snapshotGerman`
  tragen es; `techEffectFull(t, S)` = `t.voll || techEffect(t, S)` nur in `rulesModal`. KI:
  `kiMethodeZuerst(S, pi, scored, pick)` liefert den besten Kandidaten, der die Methode bringt
  (`KI_METHODE`), wenn der Schritt eine Technologie bezahlt (`kiImBuendel` – dieselbe Regel wie das
  Bündeln); `kiPlan` führt ihn aus und plant neu; das Bündel bricht ab, sobald eine Forschung die
  Methode verfügbar macht (`kiMethodeOffen`). Beide sind Funktionsdeklarationen – `tools_ki.js
  methode` schaltet sie je Platz ab (Messhaken, `partie(…, vorbereiten)`). Nachspielen:
  `animSnap` kopiert `res`; `animKopf(S, s)` → `{ vor, nach, delta, pop, welt }` (js/anim.js);
  `hudStand()` (ui.js, aus `redraw` ausgelagert) zeigt während `ui.anim` den Stand der Szene;
  `animFrame` → `animVorrat(kopf, ms)` hängt `.res-delta` (`minus`/`plus`, `still`) an die
  Kästchen, `endAnim` räumt ab und zeigt den Spielstand. Tests: `test.js` Handelsrouten-,
  Bürokratie- und Regelbogen-Blöcke, „Gekaufte Felder zählen zur Hauptstadt (v96)", „Kacheln ohne
  Bürokratie-Zusätze (v96)", „Wissenschaftliche Methode zuerst (v96)" samt Gegenprobe, „Laufender
  Vorrat in der Kopfzeile (v96)"; `smoke.js` zwei Schritte „v96: …".
- **v95 auf einen Blick.** `animSzenen` (js/anim.js) macht aus jedem Bild eine Szene `{ art,
  pi, vor, nach, bild, texte }` – `art` aus der Protokollzeile (`log(S, 'act', satz, art)`, neues
  viertes Argument, im Eintrag als `e.art`; gesetzt in `spawnFreeArmies` 'gratisarmee', `copyTech`
  'kopieren', Koloss/Pentagon/`claimOrphanWonders` 'sonst') oder aus `animUnterschied`;
  `animDetails` sammelt alles, was die Aktion geändert hat; `animText` hat 'gratisarmee',
  'kopieren' und „baut eine Straße". Gruppen, `ANIM_KARTE`, `animGruppe`, `teile` und die Art
  'armeen' sind weg. Oberfläche: `prefs.anim` ('langsam' | 'schnell' | 'aus', `ANIM_STUFEN`;
  `loadPrefs` macht aus `noAnim: true` 'aus'), Auswahl `#opt-anim` in den Einstellungen;
  `animFaktor(n)` statt `animTempo` (Langsam 1,5; Schnell wie v94 `min(1, max(0.6, 7/n))`),
  `animAn`/`animBlatt` lesen `prefs.anim`. Taiga: in `tileYield` nach dem Großen Leuchtturm
  `if (y[1] < 1 && hasAbil(p, 'russland', 'basis')) y[1] = 1` (die Zeile „Wald +1" ist weg);
  `data/civs.json` → `js/civs.js` (node tools_civs.js), `DATA_EN`, Tipp in `TIPS`/`DATA_EN.tips`,
  `kiDraftValue` zählt Wald + Gebirge; Tutorialtexte „Die vierte Stadt" (+5 🌾) und „Jede
  Bevölkerung isst" (20). Tests: `test.js` Taiga-Block bei den Ertragstechnologien, Siedelertrag,
  Draftwahl, Nachspielen (v94, v95); `smoke.js` Schritte „v95: …", Takt über einen
  mitschreibenden `setTimeout`, Tutorialzahlen im Tutorial-Durchlauf; `check_single.js` die
  Auswahl.
- **v94 auf einen Blick.** Kampf: `combatPhase` nimmt die Macht aller Reiche einmal vor dem
  ersten Kampf (`macht`) und gibt sie an `attackValue(S, pi, n, pow)` und `defenseValue(S, city,
  pow)` weiter, Flanken rechnen direkt damit; ohne `pow` rechnen beide wie bisher mit `powerOf`
  (`tools_ki.js … reihenfolge` rechnet die andere Reihenfolge ebenso, verglichen wird nur sie).
  Nachspielen: `log` ruft `LOG_HOOK` (engine.js); `animAufnahme(S, fn)` (js/anim.js, neu, ohne
  Oberfläche, zwischen `marathon.js` und `tutorial.js` geladen) setzt ihn für die Dauer des Zugs
  und sammelt je `act`-Zeile auf dem echten Spielstand ein Bild `{ m, snap }` (`animSnap`).
  `animSzenen(rec, pi)` → Szenen `{ art, pi, vor, nach, bild, texte, teile }`: Art je Bild aus
  `animUnterschied`, Gruppen über `animGruppe` (bauen + ziehen = `armeen`), Forschen/Macht je
  einmal je Zug; `animDetails` setzt `felder`, `zuege`, `ringe`, `marken`, `n`, `neu`, `techs`,
  `macht`, `wunder`; `animText` den Satz. Oberfläche: `runBots` nimmt den Zug auf (außer
  `animBlatt()`: „Keine Animationen" oder Tutorial → wie v93 `botSheet`), `playAnim(szenen,
  weiter)` setzt `ui.anim`, `animFrame` → `animDraw` (`drawMap` mit `anim`: goldene Felder,
  gleitende Armeen nicht fest gezeichnet, `animMarks`) + `animCaption` (Toast `.unten.anim`),
  Zeitgeber `ANIM_MS` × `animTempo(n)` (× 1,4 mit Zügen); `tapHex` → `endAnim`, ein Tipp
  neben die Felder ebenso (`attachTaps(svg, onTap, daneben)` → `kartenrandTipp`, auch für
  `endCombat`); danach
  `playCombat(kaempfe, weiterNachAuto)` → Zugwechsel und nächster `runBots` bis
  `humanTurnStart` (`ui.autoKette` gegen zu tiefe Aufrufketten ohne Wartezeit). `lockBar` und
  `endHumanTurn` beachten `ui.anim`; `endTutorialPanel` räumt Zeitgeber, Satz und Sperre ab.
  Einstellung `prefs.noAnim` (`opt-noanim`, `hochciv.prefs`). Erstes Spiel: `fgAnimAn()` wählt
  die Texte, `fgWiederDran`/`fgPruefe` warten auf das Ende von `ui.anim`. Tests: `test.js`
  „Die Macht steht für die ganze Kampfphase fest" und „Züge von KI und Bots nachspielen (v94)",
  zehn Smoke-Schritte „v94: …" (die älteren laufen mit `prefs.noAnim = true`, `ANIM_MS = 0`).
- **v93 auf einen Blick.** Erstes Spiel umgebaut. `m-first` → `fgStart()` ohne Weg →
  `fgSeite()`: Fenster über dem Menü (Steinzeit-Text, drei Wege als `[data-pfad]`, Haken aus
  `FG_KEY` = `hochciv.fg` über `fgGeschafft`); ein Weg → `fgStart(pfad)` → `fgSetup(pfad)`
  (`S.fg.v` 2, `pfad` von Anfang an). Schritt „wahl" und Schnappschuss (`fgSchnappschuss`,
  `fgAndererWeg`, `S.fg.wahl`, `S.fg.geschafft`) sind weg; „Anderen Weg ausprobieren" →
  `fgAnders` → `fgSeite` (neue Partie); `fgSpielende` merkt den Weg (`fgGeschafftMerken`).
  Der Weg führt: `fgJe(m, w, s)` in Texten, `fgRestSchritt(runde, st)` baut „rest3"/„rest4"
  (Ziel, Stand, Vorrang und Nachfrage für `fgRestTech(runde)`). Neuer Schritt „wuerfel" nach
  „gratis": blasse Kacheln tragen im Ersten Spiel `data-blass` statt `disabled`
  (`techBoardHTML`), `techModal` → `fgBlass` → Toast `fgBlassText` + `fgSieht('blass')`;
  `fgMarkUi` leuchtet auch `[data-blass]`. Verfügbarkeit: `fgVerfuegbar` (Antike `FG_ANTIKE`,
  danach `FG_SPAETER` bzw. für England `fgZahl`), Augen `fgWurf`. Spielstände von v92 ohne Weg:
  `fgRenderWahl` im Panel, `fgVeto`/`fgZugendeRegel` sperren bis `fgWaehle`.
- **v92 auf einen Blick.** Neues Modul `js/firstgame.js` (zwischen `tutorial.js` und `ui.js`
  geladen). `fgSetup` baut die Partie (Karte `FG_ROWS`, Griechenland Mensch gegen England
  Spielerart „KI", Duell, Platzfolge) und legt `S.fg` an (Schritt, Weg, Merker, Schnappschuss
  `wahl`); `ui.fg` nur für die Sitzung. Würfel: `d6` → `tutNextDie(ctx)` → `fgNextDie(ctx)`
  (Antike nach `FG_ANTIKE`, ab dem Mittelalter für Griechenland alles). England: `fgGegnerZug`
  aus `runBots` statt `kiTurn`, solange `S.fg` steht. Schritte `FG_STEPS` (17 gemeinsam, 2/2/4 je
  Weg, „ende"): `ziel`, `stand`, `info`, `tipp`, `hl`/`zeige`/`leiste`/`knopf`/`techs`,
  `fertig`, `gut`, `erlaubt`/`darf`, `zug`/`zugende`, `lassen`, `sofort`, `zurueck`, `loesung`.
  Schienen: `fgVeto(aktion)` (Oberfläche `fgDarf` vor jeder Aktion in `foundSheet`, `openTile`
  über `FG_AKTION`, `tapHex`, `techModal`, `powerSheet`, `abilSheet`; `fgZugendeOk` in
  `endHumanTurn`), dazu `fgSchwellenVeto` (kein Wirtschaftssieg außerhalb des Wirtschaftswegs),
  `fgNurHauptstadt`, `fgFriedlich`, `fgKeineSingularitaet`. Panel: `fgRenderPanel` aus `redraw`
  (Rückmeldung, Ziel samt Stand, Tipp, Lage, Wahl-Knöpfe), `fgPruefe` schaltet nach `FG_AUTO_MS`
  (900, Tests 0) weiter, `fgMarkUi` markiert Knöpfe (aus `sheet()`/`modal()`), `fgHighlight`
  die Felder. Ende: `gameOver` → `fgSpielende`; „Anderen Weg ausprobieren" → `fgAndererWeg`.
  Menü `m-first`; Fortsetzen/Laden → `fgFortsetzen`; „Beenden" → `fgBeenden`/`fgAus`.
  Tests: `test.js` „Erstes Spiel (v92)" (alle Wege, Schienen, Zufallsspiel), acht Smoke-Schritte „v92: …".
- **v91 auf einen Blick.** `combatPhase` wieder erst die Städte, dann das Flankieren
  (Flankenpositionen nach den Städten bestimmt) – der Rechenweg ist der von v89, dazu nur die
  Einträge für das Nachspiel; die Bilder kommen damit von selbst in dieser Reihenfolge.
  `tools_ki.js … reihenfolge` vergleicht jetzt mit „Flanken zuerst" (`anderePhase`). Tests:
  `test.js` „Kampfphase (v91)", Smoke-Schritt „v91: … erst die Stadt, dann die Flanke …".
- **v90 auf einen Blick.** Kampf: `combatPhase(S, pi, rec)` flankiert zuerst, dann die Städte
  (bis v89 umgekehrt; v91 wieder Städte zuerst); mit `rec` (aus `finishTurn(S, rec)`) je Kampf ein Eintrag – `art`
  `'flanke'`/`'stadt'`, `pi`, `gegner`, `r`/`c`, `a`, `d`, `sieg`, `von` (`flankersOf` bzw. die
  Angreifer), bei Städten `zug`/`genommen`/`zerstoert`/`gebrochen` – samt `snap` (Städte,
  Armeen, Wunder, Reiche vor dem Kampf; `combatEntry`). Jede Flankenstellung ist ein Eintrag,
  auch ohne Sieg. Oberfläche: `playCombat(kaempfe, weiter)` setzt `ui.combat`, zeigt je Kampf
  ein Bild (`combatFrame` → `combatDraw` → `drawMap` mit `fight`, gezeichnet von `fightMarks`)
  für `COMBAT_MS` (1000; smoke 0) und ruft danach `weiter(gezeigt)`. `fightMarks` wählt die Lage
  der Werte nach verdeckten Angreiferfiguren (sechs Lagen) und skaliert mit dem Kartenmaßstab
  (`turning()` beachtet). Gesperrt: `lockBar`, `endHumanTurn`, Füttern; `tapHex` überspringt
  (`endCombat`), ☰ ebenso; `redraw` zeichnet währenddessen das Kampfbild und speichert nicht;
  `tutMaybeAdvance` wartet. Hinweis ab zwei Kämpfen über der Leiste (`.toast.unten`, `toast()`
  nimmt die Klasse wieder weg). Eigener Zug: `finishTurn` → Nachspiel → Sieg/Zugwechsel/Bots,
  die Meldung des letzten Kampfs nur ohne Nachspiel. Bots/KI: Zug, `finishTurn`, `saveGame`,
  Nachspiel, `botSheet`. Messen: `tools_ki.js … reihenfolge kampflaenge`. Zugfolge: `newGame`
  mit `cfg.seatOrder` nach Plätzen, sonst `ORDER`; gesetzt aus `platzNummern(mode, mapPick, n)`
  in `setup-go` und `startFromRecipe`.
- **v89 auf einen Blick.** Blätter: `sheet()` setzt `sheetCalm.until` (jetzt + `SHEET_CALM_MS`
  400) und `sheetCalm.key` (beim Neuzeichnen aus einem Tipp der getippte Knopf, beim Öffnen
  keiner); `sheetCalmGuard` (Erfassung am `#sheet`, in `boot`) verwirft Klicks auf Knöpfe in
  `#sheet-body` vor ihrem `onclick`, solange das Fenster läuft und der Knopf ein anderer ist
  (`tapKey`: `data-act`, `data-label`, …), außer im gesperrten Bot-/KI-Blatt. Ein zweiter
  Listener vergisst den getippten Knopf nach dem Klick. Ertragstexte (TECHS, `DATA_EN`) nur
  die Summe. `growLimits`: `GROW_EXTRA_PAID = ['keramik', 'dampfmaschine']`, je +1 bezahlter
  Schritt; Texte Keramik/Dampfmaschine „1× zusätzliches Wachstum pro Stadt"; KI-Zuschlag der
  Dampfmaschine um den Keramik-Anteil erhöht.
- **v88 auf einen Blick.** Ertragstechnologien: `YIELD_TECHS` (data.js) nennt je Technologie
  ihr Ziel (Geländeart oder `'pop'`) und ihren eigenen Zuwachs; daraus `YIELD_CHAINS` – je Ziel
  und Feld eine Kette nach `t.c`, jedes Glied mit der Summe bis zu sich. `yieldBonus(p, on, y)`
  (engine.js) nimmt je Kette das höchste erforschte Glied; `tileYield` und `cityPopYield`
  lesen nur noch das (der `switch` je Gelände ist weg), Taiga und Großer Leuchtturm addieren
  sich weiter (Taiga seit v95 nicht mehr: eine Untergrenze von 1 Nahrung je Feld). Die Techtexte nennen die Summe und „inkl. …" (seit v89 nur die Summe), der
  Regelbogen erklärt es unter der Geländetabelle. `SIEGE_BONUS = 3` (data.js) für `attackValue`
  und `kiAttackPer`; `SINGULARITY_BASE = 120`. `incomeBreakdown` hängt kein `note` mehr an
  (Handelsrouten, Gentechnik), `yieldOverview` zeigt nur den Namen; der Schlüssel
  „Bürokratie ×2" ist aus `UI_EN` entfernt. Tutorialtexte: „+3 Angriff", „6 statt 3",
  „120 Wissenschaft, mit der wissenschaftlichen Methode 110". Hauptmenü `.lede` (index.html
  und `UI_EN`): „Ne Runde Civ? …".
- **v87 auf einen Blick.** Blatt eines Bot-/KI-Zugs: „Weiter" auch oben (`#bot-next-top` neben
  dem Titel, `.bot-head`), das Blatt beginnt oben. „Erträge" ist weg (Knopf, `showYields`,
  `toggleYields`, `hochciv.yields`, `viewerOf`) – die Chips gibt es im Gründungsmodus. An der
  Stelle **„Fähigkeiten"** (`a-abil`, `abilSheet`, in `TUT_BAR`): eigene Fähigkeit(en) mit
  Wirkung; Freie Forschung und Rückschau (aus dem Technologiebogen ausgezogen); kostenlose
  Technologie aus Wundern; „Alle Städte kostenlos wachsen" (Verbundwerkstoffe) und „Alle
  Städte wachsen" – `growAll` Stadt für Stadt über `growCity`, von der kleinsten an, was
  scheitert, wird ausgelassen, am Knopf „2 von 3 Städten" und was tatsächlich abgeht
  (`growAllPlan` auf einer Kopie, `paidText`); „In allen Städten opfern" (`sacrificeAll`,
  `sacrificeError`, nur solange Sklaverei nicht obsolet ist); Kopieren (Spionage,
  Kundschafterei, Internet – auch aus dem Bogen ausgezogen). An der Leiste die Zahl der
  **Arten** kostenloser Aktionen, die gerade gehen (`freeActions`: Freie Forschung, Rückschau,
  Wunder-Technologie, kostenloses Wachstum, Internet). Fehler behoben: ein Rückschau-Anspruch
  ohne Wahl blockierte jeden weiteren desselben Zugs (`backPick(p, S)`); hochkant gedreht
  setzte `setBarHeight` `--bar-h`/`--hud-h` auf die gedrehte Breite der Leisten (in Chromium
  1180px), jedes Blatt lag außerhalb des Bildschirms – jetzt gedreht die Breite des gemessenen
  Rechtecks.
- **v86 auf einen Blick.** Ökologie: ⌊Bevölkerung des Reichs / 2⌋ auf alle drei Erträge, in der
  Bevölkerungszeile von `incomeBreakdown` (senkt also weiter `popFoodCost`); bei Revolution
  zählt die Hauptstadt nicht. Bürokratie: Faktor `buro` in `incomeBreakdown` für Felder und
  Bevölkerung der Hauptstadt (wie bisher) und ganz für Handelsrouten, Ökologie und den
  Gentechnik-Posten; Wallfahrt und Seemacht nicht. Zeilen tragen dann `note: 'Bürokratie ×2'`,
  die Übersicht hängt es an den Namen (seit v88 nicht mehr, Anweisung des Autors). Zeilennamen
  „Handelsrouten"/„Wallfahrt" jetzt über `T()`.
  Tempo (gleiche Ergebnisse): `kiSitesAll` prüft Kolonien erst mit `kiSiteOk` und holt ihre
  Entfernungen aus einer Wegtabelle, `controlledTiles` kennt die Stadtfelder als Menge,
  `tileYieldAt(…, pre)` rechnet Hauptstadt und Geländeertrag je Einkommensrechnung einmal.
- **v85 auf einen Blick.** Wirtschaftssieg: geprüft nur noch am Rundenende
  (`checkEconomyRoundEnd` in `advanceTurn`, vor `resolveClaims`), für alle mit dem Stand von
  dort, auch in Runde 1; gewinnt jemand, ist das Spiel gleich aus – Punktvergleich nur mit
  Ansprüchen derselben Runde (Singularität, Kultursieg). `markRoundStart`, `S.roundPop(s)`
  und die Sperre für Runde 1 sind weg. Startausgleich: `START_BONUS_COINS` [0, 1, 2, 3] nach
  `turnPosition` in `beginTurn` der ersten Runde, Bots nicht. Marathon: `discountFactor` = 2
  für Günstige Forschung und Wissenschaftliche Methode in `techCost`, `freeTechMaxAge` = 1
  (Mittelalter) in `freeTechOptions`; Texte über `abilEffect(a, S)` und `techEffect`. KI:
  `kiLastInRound` → `checkVictory` in `kiScore`; Methode im Marathon doppelt gewertet;
  `KI_DRAFT_BASE` neu gemessen (200 Marathonpartien nach v85, Grundwert = 6 + 2,5 ·
  Logit-Stärke, Kartenanteil abgezogen).
- **v84 auf einen Blick.** Sklaverei bringt 7 Münzen (`SLAVERY_COINS`). Militär der Antike:
  Stadtmauern 2, Eisenverarbeitung 4, Belagerungsmaschinen 5 – im Tutorial (alter Techtree,
  `OLD_TECH_COSTS`) die alten 5/2/4. Marathon: Singularität 300 (`MARATHON_SINGULARITY`),
  höchstens fünf Gründungen je Zug (`MARATHON_MAX_FOUNDS`, `foundedThisTurn`), Militärsieg
  mit der zweiten eroberten Hauptstadt (`MARATHON_CAPITALS`, `p.capTaken`, `capitalsToWin`);
  eine eroberte Hauptstadt ist eine gewöhnliche Stadt, ihr altes Reich spielt ohne Hauptstadt
  weiter. Kolonien: ein per Kolonialismus gekauftes Feld ist ohne Siedlerweg besiedelbar,
  Entfernung die Luftlinie (`foundDistance`, `isColony`). Städte zeigen ihre Bevölkerung als
  Zahl in Reichsfarbe (`drawMap`), Symbol und Striche sind weg.
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
- **Wirtschaftssieg zu Rundenbeginn (v83, bis v84).** Gezählt mit eigener und
  Weltbevölkerung zu Beginn der Runde, geprüft dort für alle in Zugfolge; seit v85 ersetzt
  durch die Prüfung am Rundenende (siehe oben).
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
  Die Sperre für Runde 1 ist seit v85 weg (geprüft wird am Rundenende, wenn alle gezogen
  haben).
- **Eine Regelvariante.** Die früher „experimentell v2" genannten Regeln sind der Standard:
  Singularität 100 (seit v88 120), Keramik und Theologie in der Techliste, Verbundwerkstoffe = kostenloses
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
  Weg mit ihr verbunden ist, bringt +1 auf alle Erträge; bei reiner Eisenbahn +4 (seit v96,
  vorher +2). Gemischte Strecken zählen als Straße.
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

- **Erträge** (`a-yields`, Umschalter, `hochciv.yields` – seit v87 entfallen, die Chips nur noch
  im Gründungsmodus): je Feld bis zu drei Chips,
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

(Seit v86 übers ganze Reich gezählt statt je Stadt, und Bürokratie verdoppelt den ganzen
Posten – siehe „v86 auf einen Blick". Das Folgende ist der Stand von v69.)

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

1. **`node test.js`** muss grün sein — 1977 Assertions, darunter die Rechnungen aus dem
   Regelheft-Beispiel, ein Test je geänderter Regel, 40 Bot-Partien, 40 mit Erweiterungen,
   20 Mensch-Partien, 20 Duelle, der komplette Tutorial-Durchlauf (zweimal, auf Gleichheit).
2. **`node smoke.js`** fährt die echte UI durch jsdom (182 Schritte), inklusive
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
  Weg an der Hauptstadt hängen, bringen +1 (Straße) bzw. +4 (reine Eisenbahn, bis v95 +2) auf
  alle Erträge (`TRADE_ROAD_BONUS`/`TRADE_RAIL_BONUS`). Zwei getrennte Suchen — daher greift die
  Mischungsregel von selbst.
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
- **Spielerreihenfolge** (seit v90 zweierlei): ohne `cfg.seatOrder` fest Russland → Griechenland
  → England → Wikinger (klassische Aufstellung, Marathon, Tutorial, Tests, `tools_ki.js`), mit
  ihm die Reihenfolge der Aufbau-Liste (Plätze; die Oberfläche setzt es über `platzNummern`).
  Ohne Schalter landet die gewünschte Zivilisation nicht automatisch auf Index 0; Test-Helfer
  `normalize()` sortiert um. `cfg.startPlayer` zeigt in beiden Fällen in die **Aufbau-Liste**,
  nicht in die Zugreihenfolge. Wer einen neuen Weg baut, eine Partie zu starten, entscheidet über
  den Schalter (wie `setup-go` und `startFromRecipe`).
- **Das Erste Spiel hängt an seiner Karte und an Englands Drehbuch** (seit v92). Die beiden
  Gründungsrätsel sind nur auf `FG_ROWS` eindeutig (5/5 Nahrung, 2/3 Wissenschaft – `test.js`
  prüft es), England siedelt auf 6/8 und belagert von 5/6 aus. Wer die Karte, Startwerte des
  Duells, Kosten, Erträge oder Kampfregeln ändert, lässt `test.js` „Erstes Spiel" laufen:
  Es spielt alle drei Wege bis zum Sieg (seit v93 jeweils Runde 6, der Forschungsweg seit v97 Runde 7
  – Griechenlands Rabatt und die Methode ziehen weniger ab) und schlägt an, wenn ein Ziel
  nicht mehr erreichbar ist, ein Rätsel zwei Lösungen bekommt, ein Sieg auf dem falschen Weg fällt
  oder eine Lektion ausfällt. Die Texte nennen keine Zahl fest, außer den Staffeln der Regel
  (1/3/6 … Stadtkosten, 2/4/6/8/10 Methode, +3 Belagerungsmaschinen, 4 Münzen je Macht mit
  Eisenverarbeitung, 4–6 und 50 % beim Würfeln, 3/4 und 7/10 im Duell) – ändert sich eine davon,
  den Text mitändern (deutsch in `firstgame.js`, englisch in `UI_EN`). Seit v93 hängt es auch an
  `FG_SPAETER`: Was ein Ziel oder Tipp nennt, muss dort stehen (`test.js` prüft die genannten),
  und der Würfel-Schritt rechnet mit Mathematik und Taktik als den ersten freien Technologien.
- **Kampfreihenfolge und Nachspiel gehören zusammen** (seit v90): Das Nachspiel zeigt die
  Einträge von `combatPhase` in der Reihenfolge, in der gerechnet wurde, jeden im Stand davor
  (`snap`). Die Reihenfolge selbst ist Regel des Autors – erst die Städte, dann das Flankieren
  (v91; `test.js` „Kampfphase (v91)" prüft sie, auch dass eine verteidigte Stadt mit laufender
  Belagerung hält). Wer die Reihenfolge ändert oder eine neue Kampfart einführt, legt dort den Eintrag
  an (`combatEntry` vor dem Auflösen) und gibt ihm eine Zeile in `combatCaption`. Was
  `drawMap` aus dem Spielstand liest und ein Kampf ändern kann, muss in `snap` stehen (heute
  Städte, Armeen, Wunder, Reiche; Straßen und Karte ändert kein Kampf). Die Macht nimmt
  `combatPhase` seit v94 einmal für die ganze Phase (`macht`); wer eine neue Kampfart einführt,
  rechnet mit diesen Werten, nicht mit `powerOf` (`test.js` „Die Macht steht für die ganze
  Kampfphase fest").
- **Während `ui.combat` ist der Zug schon gerechnet, aber noch nicht gewechselt** (seit v90):
  Alles, was in dieser Sekunde je Kampf auf den Spielstand zugreifen könnte (Leiste, Blätter,
  Tipps, Tutorial, Füttern), ist gesperrt oder wartet; ☰ beendet das Nachspiel zuerst; `redraw`
  zeichnet das Kampfbild und **speichert nicht** – ein so gespeicherter Stand brächte nach dem
  Neuladen denselben Kampf ein zweites Mal. Wer einen neuen Weg ins Spiel baut (Knopf, Geste,
  Zeitgeber) oder irgendwo `saveGame` aufruft, prüft `ui.combat` mit. Tests laufen
  mit `COMBAT_MS = 0` (synchron wie bis v89); der Smoke-Schritt „v90" schaltet es eigens ein. Seit v94 kommt
  `ui.anim` dazu (Züge von KI und Bots): Dort ist der Zug schon gerechnet **und gespeichert**
  (samt `S.autoPlayed`) – `redraw` darf speichern, ein Neuladen zeigt nur die Szenen nicht mehr.
  Gesperrt ist dasselbe (`lockBar`, `endHumanTurn`); ein neuer Weg ins Spiel prüft beides.
- **Szenen hängen an den Protokollzeilen der Klasse `act`** (seit v94; seit v95 wird jede Zeile
  genau eine Szene): `animAufnahme` hält bei jeder solchen Zeile den Stand fest. Eine Aktion muss deshalb erst den Stand ändern und dann ins
  Protokoll schreiben (sonst zeigt ihr Bild den Stand davor), und was eine KI oder ein Bot tut,
  braucht eine `act`-Zeile – sonst erscheint es erst in der nächsten Szene und unter deren Satz.
  Zeigt der Unterschied im Stand etwas anderes, als die Aktion ist (eine geschenkte Armee sähe
  aus wie gebaut, geschenkte Macht wie gekauft), gibt sie ihre Art mit: `log(S, 'act', satz,
  art)` – 'sonst' zeigt den Satz selbst.
  `LOG_HOOK` ist ein einziger globaler Haken: nicht verschachteln, nur über `animAufnahme`.
  Seit v96 zeigt die Kopfzeile je Szene den Vorrat danach (`animKopf`): Was eine Aktion bezahlt,
  ohne selbst ins Protokoll zu schreiben (das Füttern mit Gentechnik oder Massenmedien vor dem
  Gründen), erscheint in der nächsten Szene mit – der Stand stimmt, die Marke fasst zusammen.
- **Was eine Szene zeigt, muss in `animSnap` stehen** (seit v94): `animDraw` zeichnet
  `Object.assign({}, S, s.bild)` – Städte, Armeen, Straßen, gekaufte Felder, Wunder und Reiche
  aus der Szene, alles andere (Gelände, Belagerungen, Ereignis) aus dem Stand nach dem Zug. Wer
  eine Aktion einführt, die etwas anderes auf der Karte ändert, nimmt es dort auf und gibt ihr in
  `animUnterschied`/`animDetails`/`animText` eine Art (sonst steht nur ihr Protokollsatz da).
  Gezeichnet wird `s.bild`, der Stand nach der Aktion.
- **Die Kette der KI- und Bot-Züge hält erst beim nächsten Menschen** (seit v94):
  `weiterNachAuto` wechselt den Zug und ruft `runBots`, bis `humanTurnStart`. Ohne Wartezeit
  (`ANIM_MS = 0`, Tests) ist das ein Aufruf im Aufruf; `ui.autoKette` bricht nach 40 Zügen über
  einen Zeitgeber ab. Wer in die Kette etwas einbaut, das auf eine Eingabe wartet (ein Fenster im
  Zug einer KI), muss die Kette danach selbst fortsetzen. `smoke.js` lässt die älteren Schritte
  mit Animationen „Keine" laufen (`prefs.anim = 'aus'`) – sie prüfen das Blatt; die Schritte
  „v94: …" und „v95: …" schalten sie ein (`mitAnimation`, ab Werk „Langsam").
- **Die Werte im Kampfbild messen die Karte auf dem Bildschirm** (seit v90): `fightMarks` liest
  `getBoundingClientRect` des SVG – gedreht (`turning()`) mit vertauschten Seiten. Wer die
  Karte anders einpasst (etwa wieder zoomen lässt), passt den Maßstab dort an.
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
  `S.oldTree`) weichen zwölf davon ab (seit v84 auch die drei militärischen der Antike). Wer eine neue Stelle baut, die Kosten zeigt,
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
- **Gedreht misst `getBoundingClientRect` das Rechteck nach der Drehung** (seit v87 bekannt):
  hochkant (`turning()`) sind Breite und Höhe vertauscht. `setBarHeight` nimmt deshalb gedreht
  die Breite; wer anderswo Größen misst, um daraus Layout zu setzen, macht es genauso oder
  nimmt `offsetHeight`/`offsetWidth` (ohne Drehung, ganze Pixel). Bis v86 lag dadurch jedes
  Blatt hochkant außerhalb des Bildschirms. jsdom kennt kein Layout – der Smoke-Schritt dazu
  gibt die gemessenen Rechtecke vor; geprüft ist es in Chromium (Hochformat-Viewport).
- **Alle Knöpfe der Leiste stehen in `TUT_BAR`** (seit v87; v75–v86 gab es daneben den
  Ansichtsschalter „Erträge", der immer frei war). `TUT_BAR` (ui.js) liest auch das
  Smoke-Audit, und `tutAllow` nennt dieselben Knöpfe für den Fall ohne Schritt. Wer einen
  Knopf ergänzt, trägt ihn dort ein oder begründet, warum nicht – sonst ist er im Tutorial
  entweder offen oder tot. „Fähigkeiten" bleibt im Tutorial zu: kein Schritt gibt es frei.
- **Sammelaktionen haben keine eigene Regel** (seit v87): `growAll` und `sacrificeAll` rufen
  Stadt für Stadt `growCity` bzw. `sacrifice`. Wer eine Wachstums- oder Opferregel ändert,
  ändert sie dort – die Sammelaktionen folgen von selbst; eine Prüfung nur in der
  Sammelaktion wäre falsch. Die Vorschau (`growAllPlan`) führt `growAll` auf einer Kopie aus
  (`stateCopy`, JSON ohne Protokoll): der Spielstand muss JSON-fähig bleiben, und würfelte
  `growCity` je, verriete die Vorschau den Wurf – die Kopie hat denselben Startwert.
- **Eine neue kostenlose Aktion gehört in `freeActions` und in `abilSheet`** (seit v87), sonst
  fehlt sie in der Zahl an „Fähigkeiten". `freeActions` läuft bei jedem Zeichnen (`redraw`) –
  teure Prüfungen dort nur mit Abbruch nach dem ersten Treffer (`some`), wie beim
  kostenlosen Wachstum.
- **Freie Forschung, Rückschau und Kopieren stehen nicht mehr im Technologiebogen** (seit v87),
  sondern unter „Fähigkeiten". Das Fenster der Wunder-Technologien (`freePickModal`) geht
  weiter von selbst auf; die Wahl steht zusätzlich unter „Fähigkeiten".
- **`backPick(p, S)` mit Spielstand liefert den ersten Rückschau-Anspruch, aus dem sich noch
  etwas wählen lässt, ohne den ersten überhaupt** (seit v87). `backPickOptions`/`useBackPick`
  nehmen den ersten nutzbaren; leere bleiben bis zum Zugende in `p.backPicks` liegen. Wer
  „ist eine Rückschau offen?" fragt, fragt `backPickOptions(...).length`, nicht
  `p.backPicks.length` (so jetzt auch `tutMaybeAdvance`).
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
- **Der Wirtschaftssieg hängt an `checkEconomyRoundEnd` in `advanceTurn`** (seit v85; v83/v84
  `markRoundStart` zu Rundenbeginn): genau beim Umschlag der Runde, vor `resolveClaims`. Wer
  einen anderen Weg baut, eine Runde zu beenden, ruft beides in dieser Reihenfolge. Tests,
  die die Bevölkerung direkt setzen, spielen die Runde zu Ende oder rufen
  `checkEconomyRoundEnd` selbst. Die KI weiß davon in `kiScore` (`kiLastInRound`).
- **Der Startausgleich hängt an `S.round === 1` und `turnPosition`** (seit v85): wer die
  erste Runde anders zählt (etwa eine Vorrunde einführt) oder Plätze in der Zugfolge
  verschiebt, prüft den Ausgleich mit. Barbaren hängen hinten an und zählen nicht. Seit v98
  zählt `empireCount` die Reiche ohne Barbaren: bei genau zwei gilt `START_BONUS_DUEL` – wer
  einen Modus mit zwei Reichen anders behandeln will (nur das Duell), prüft dort `S.duel`.
- **Wer eine neue Einkommenszeile baut, entscheidet über die Bürokratie** (seit v86): In
  `incomeBreakdown` verdoppelt `buro` Hauptstadtfelder, Hauptstadtbevölkerung, Handelsrouten,
  Ökologie und Gentechnik – sonst nichts. Eine neue Zeile ist ohne `buro` nicht verdoppelt.
  Die Übersicht sagt seit v88 bei keiner Zeile dazu, dass die Bürokratie mitgerechnet ist
  (Anweisung des Autors; v86/v87 trugen Handelsrouten und Gentechnik `note: 'Bürokratie ×2'`) –
  `note` gibt es nicht mehr, und `yieldOverview` zeigt nur `e.name`.
- **Ertragstechnologien nur über `YIELD_TECHS`** (seit v88): `tileYield` und `cityPopYield`
  kennen keine Technologie mehr beim Namen, sie lesen `yieldBonus` (je Kette das höchste
  Glied). Wer eine Ertragstechnologie ergänzt oder ihren Zuwachs ändert, trägt es dort ein und
  passt die Texte an (TECHS und `DATA_EN`; `test.js` rechnet jeden Text aus der Kette nach). Die
  Ketten sind einmal nach `t.c` sortiert – ändert sich die Reihenfolge einer Kette in einem
  Techtree (alter Techtree, Marathon), müssten sie je Partie gebaut werden; der Test
  „Reihenfolge jeder Kette" schlägt dann an. Boni, die nicht aus Technologien kommen (Großer
  Leuchtturm), addieren sich in `tileYield` – nicht in die Ketten legen. Die Taiga (seit v95) ist
  eine Untergrenze und steht deshalb zuletzt in `tileYield`: wer dort einen Zuschlag einführt,
  setzt ihn davor, sonst hebt Taiga auf 1 und der Zuschlag kommt obendrauf.
- **Feste Zahlen in Tutorialtexten** (seit v88 gebunden): „+3 Angriff gegen Städte", „6 statt
  3" (3 Macht + `SIEGE_BONUS`) und „120 Wissenschaft, mit der wissenschaftlichen Methode 110"
  stehen fest im Text, deutsch in `tutorial.js`, englisch in `UI_EN`. `test.js` liest beide
  Quellen und vergleicht mit `SIEGE_BONUS` bzw. `techCost` der Singularität im alten Techtree.
  Wer eine dieser Regeln ändert, ändert beide Texte (der deutsche Satz ist der Schlüssel).
  Seit v95 prüft `smoke.js` im Tutorial-Durchlauf auch „Die vierte Stadt" (Vorrat, Gründungskosten,
  Siedelertrag) und „Jede Bevölkerung isst" (Nahrung über den Verbrauch) gegen die Regelmaschine –
  die Taiga änderte zwei davon, und bis dahin merkte es kein Test. Das Tutorial spielt Russland
  mit Taiga: Wer Erträge, Fähigkeiten oder Kosten ändert, liest die übrigen Zahlen der Texte nach
  (etwa die Ertragstabelle in „Woher deine Ressourcen kommen", „Verteidigung 9").
- **Frisch gezeigte Blätter verwerfen Tipps** (seit v89): 0,4 s nach jedem `sheet()` zählt ein
  echter Klick auf einen Knopf in `#sheet-body` nur, wenn es der Knopf ist, dessen Tipp gerade
  neu gezeichnet hat. Folgen: (a) Wer ein Blatt baut, dessen Knöpfe sich wiederholt schnell
  tippen lassen sollen (wie „+1 Macht"), gibt ihnen eine feste `data-act`/`data-label` – die
  Zufalls-id ändert sich bei jedem Neuzeichnen und taugt nicht als Kennung (`tapKey`).
  (b) Tests, die echte Klick-Ereignisse schicken, setzen `sheetCalm.until = 0`, sonst verpufft
  der Klick; `.onclick()` direkt umgeht die Wache. (c) Ein Blatt ohne Wache braucht die Klasse
  `locked` (wie das Bot-/KI-Blatt).
- **Wie oft eine Stadt wächst, steht in `growLimits`** (seit v89 mit `GROW_EXTRA_PAID`): je
  Technologie dort ein bezahlter Schritt mehr. Die Texte von Keramik und Dampfmaschine sagen
  „1× zusätzliches Wachstum pro Stadt"; `test.js` hält Liste und Texte zusammen. Die KI wächst
  über die Regel, ihr fester Zuschlag je Technologie steht in `kiTechBonus`.
- **Fähigkeitstexte über `abilEffect(a, S)`** (seit v85): im Marathon wirken zwei Fähigkeiten
  anders, die Texte dazu stehen dort (die Methode in `techEffect`). Wer eine Fähigkeit im
  Marathon anders wirken lässt, ergänzt dort den Text – Kopfzeile, Weltblatt, Draft und
  Regelbogen lesen alle diese eine Stelle; `a.e` direkt zeigt den Text des Bogens.
- **Eine neue JS-Datei muss in sieben Listen** (zuletzt `js/anim.js`, v94): `index.html`,
  `sw.js`, `build_single.py`, `smoke.js`, `test.js` (Lade- und Übersetzungsliste),
  `tools_ki.js` – sonst fehlt sie offline, in der Einzeldatei oder in den Prüfprogrammen.
  `js/firstgame.js` (v92) und `js/anim.js` (v94) stehen wie `js/tutorial.js` in allen außer
  `tools_ki.js`: die Messreihen laden nur, was die Regelmaschine braucht.
- **Der Draft zeigt eine Partie ohne Fähigkeiten** (`draftView`, seit v83). Wer in `newGame`
  etwas an Fähigkeiten hängt, sieht es dort nicht – richtig so, gedraftet ist ja noch
  nichts. Die echte Partie entsteht in `draftGo` neu aus `cfg` (gleiche Karte, gleiche Würfe
  über `cfg.avail`/`cfg.wpool`, gleicher Startwert).
- **Der Draftbildschirm dreht sich mit wie das Spiel** (`TURN_SCREENS`): er zeigt die Karte.
- **Ein Reich kann ohne Hauptstadt sein** – im Marathon nach der ersten Eroberung regelmäßig
  (seit v84; vorher nur nach Barbarenüberfällen). `capitalOf` liefert dann `undefined`; jede
  Stelle, die eine Hauptstadt braucht, nimmt `capitalOf(S, pi) || citiesOf(S, pi)[0]` oder
  prüft auf leer. `p.capTaken` zählt genommene Hauptstädte; die Regel steht allein in
  `captureCity` (`capitalsToWin`).
- **Gründungen je Zug zählen über die Runde** (`p.foundRound`/`p.foundCount`, seit v84): jedes
  Reich hat genau einen Zug je Runde. Wer einen zweiten Zug in derselben Runde einführt, muss
  den Zähler beim Zugbeginn zurücksetzen.
- **Kolonien stecken in `foundDistance`** (seit v84): ohne Weg zählt für eigene gekaufte Felder
  die Luftlinie. Die KI rechnet Siedelplätze selbst (`kiSitesAll`) und fragt für Kolonien
  außerhalb ihrer Suche `foundDistance`; ihr Merker (`kiSiteKey`) enthält die gekauften Felder.
- **`kiAttackSlots` merkt sich Ergebnisse je Stadt und Gegner für einen Zug** (seit v84, am
  Objekt `hit`): der Schlüssel sind die freien Felder an der Stadt und welche seiner Armeen
  und Städte noch stehen. Wer die Funktion etwas Weiteres lesen lässt (Gelände, Technologien
  …), nimmt es in den Schlüssel auf – sonst rechnet die KI mit alten Plätzen.
- **Die Zuschläge der Handelsrouten stehen in `TRADE_ROAD_BONUS`/`TRADE_RAIL_BONUS`** (seit v96):
  `tradeRoutes`, Regelbogen, Straßenknöpfe und `kiTechBonus` lesen sie; die Tutorialtexte nennen
  „+1"/„+4" fest (deutsch in `tutorial.js`, englisch in `UI_EN` – der deutsche Satz ist der
  Schlüssel). `smoke.js` vergleicht die Tutorialtexte mit den Konstanten – wer den Zuschlag ändert,
  ändert dort beide Sprachen.
- **Kachel `e`, Regelbogen `voll`** (seit v96, Anweisung des Autors): Auf den Kacheln des Bogens
  und in den Knöpfen, die eine Technologie anbieten, steht `e` – ohne Hinweise, was die Bürokratie
  mitverdoppelt. Wer einen solchen Hinweis braucht, schreibt den ganzen Text nach `voll` (und
  englisch an die dritte Stelle von `DATA_EN.tech`); `test.js` prüft, dass keine Kachel die
  Bürokratie nennt und dass `voll` in beiden Sprachen bei denselben Technologien steht und mit der
  Kachel beginnt. Nur `rulesModal` liest `techEffectFull`.
- **Gekaufte Felder zählen zur Hauptstadt – in `tileYieldAt`** (seit v96): Wer Erträge eines
  Feldes braucht, nimmt `tileYieldAt` (Bürokratie samt Kolonien), nicht `tileYield` (das Gelände).
  Mit `pre` (aus `incomeBreakdown`) kommen die gekauften Felder aus `pre.kol` – wer `pre` anderswo
  baut, legt die Menge mit an (ohne `kol` fragt `tileYieldAt` die Liste, langsam, aber richtig).
- **Die Methode zuerst hängt an zwei Haken in `kiPlan`** (seit v96): `kiMethodeZuerst` (vor der
  Ausführung) und `kiMethodeOffen` (bricht das Bündel ab). Bündeln heißt `kiImBuendel` – eine Regel
  für beides; wer das Bündeln ändert, ändert es dort. Eine neue Art, die Methode zu bekommen
  (eigener Kandidat), gehört in `KI_METHODE`. Eine andere Technologie, die Folgendes verbilligt
  (etwa Eisenverarbeitung und Gewehre für Macht), hat keinen solchen Vorrang – offener Punkt 51.
- **Was die Kopfzeile im Nachspiel zeigt, muss in `animSnap` stehen** (seit v96): `animKopf` liest
  `res`, `foodDeficit`, Macht (über `powerOf`: `power`, Armeen, Städte, Wunder) und Bevölkerung aus
  den Bildern. `res` wird kopiert; wer etwas Weiteres anzeigt, das sich als Objekt ändert, kopiert
  es dort ebenso – sonst zeigt jede Szene den Endstand. Und: Eine Aktion muss bezahlen, bevor sie
  ins Protokoll schreibt (wie für die Karte) – sonst erscheinen ihre Kosten erst in der nächsten
  Szene.
- **Das Tutorial rechnet mit der Methode von bis v96** (seit v97): `methodDiscount(S)` gibt im alten
  Techtree `OLD_METHOD_DISCOUNT`. Burgenbau kostet dort mit der Methode 3, sonst ginge sein Zug mit
  Stadtmauern, Burgenbau, Belagerungsmaschinen und Rad nicht auf. Wer den alten Techtree aufgibt
  oder das Tutorial auf den heutigen umstellt, muss die Texte „2 in der Antike, 4 im Mittelalter …",
  „2/4/6/8" und „Burgenbau (3)" und den Ablauf neu rechnen – `test.js` bindet die Texte an
  `OLD_METHOD_DISCOUNT`, `smoke.js` spielt das Tutorial durch.
- **Die Freie Forschung zählt in `p.freeTechsUsed`** (seit v97, je Partie): nichts setzt den Zähler
  zurück. Wer sie wieder je Runde haben will, braucht wieder eine Runde (bis v96 `p.freeTechUsed`,
  das `migrateState` jetzt löscht). Die KI nimmt sie nur über `kiFreeTechChoices` – ein neuer Weg zu
  einer Gratistechnologie, der dasselbe Kontingent verbraucht, gehört dorthin.
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

Aus der Sitzung v96:
- **Die KI erforschte die Wissenschaftliche Methode zu spät** (gemeldet vom Autor: „schlechte
  Reihenfolge"): andere Technologien zuerst, zum vollen Preis, oder die Methode blieb bezahlbar
  liegen – in 40 Duellen 23 bzw. 37 Züge. Ursache: Der Planer wählt nach Nutzen je Kosten und
  bündelt, den Rabatt für alles Folgende sah er nicht; macht eine Forschung die Methode erst
  verfügbar, lief das geplante Bündel weiter. Jetzt kommt sie zuerst (`kiMethodeZuerst`) bzw. wird
  neu geplant (`kiMethodeOffen`).
- **`animSnap` teilte den Vorrat** (latent seit v94, nie sichtbar): Die Kopie eines Reichs nahm
  `res` als Verweis mit, jedes Bild zeigte also den lebenden Vorrat. Nichts las ihn – erst die
  laufende Kopfzeile hätte jede Szene mit dem Endstand gezeigt. `res` wird jetzt kopiert.

Aus der Sitzung v95:
- **Zwei Tutorialzahlen stimmten nach der neuen Taiga nicht mehr** (nie ausgeliefert): Die vierte
  Stadt bringt +5 🌾 statt +4, in Runde 4 sind es 20 Nahrung über den Verbrauch statt 19. Kein
  Test prüfte diese Zahlen – gefunden durch einen Vergleich der Tutorialwerte vor und nach der
  Änderung. Beide Texte angepasst (deutsch und englisch), `smoke.js` prüft sie jetzt.
- Beim Prüfen in Chromium (nie ausgeliefert): Der eigene Messhaken für die Szenendauer lief nach
  einem zweiten Start doppelt und meldete Unsinn – das Spiel selbst war richtig.

Aus der Sitzung v94:
- **Die Macht änderte sich mitten in der Kampfphase** (gemeldet vom Autor): Eroberten die
  Wikinger mit Kriegerkultur und Burgenbau eine Stadt, flankierten sie im selben Zug schon mit +2;
  ebenso Zeus und die Bot-Macht (Bevölkerung). Jetzt gilt die Macht vom Anfang der Phase, die neue
  erst danach.
- Beim Gegenprobieren gefunden (nie ausgeliefert): Der Test „Fehler im Zug … der Haken ist wieder
  ab" verglich `LOG_HOOK` über `JSON.stringify` – eine Funktion wird dort zu `null` und sah aus wie
  ein leerer Haken. Er vergleicht jetzt `LOG_HOOK === null`. Und das Gleiten der Armeen begann in
  Chromium zuerst gar nicht: Die SMIL-Uhr des SVG läuft seit dem Laden der Seite, ein einmaliges
  `<animateTransform>` war beim Einfügen schon vorbei – jetzt `begin="indefinite"` und
  `beginElement()`.

Aus der Sitzung v93:
- Beim Umbau mit zufälligem Spiel gefunden (nie ausgeliefert): Die Musterlösung des
  Gegenangriffs stellte die erste Armee auf das einzige Feld, das eine zweite (aus einer
  zufällig gegründeten Stadt) erreicht hätte, und wollte dann eine dritte bauen. Jetzt zieht die
  Armee mit den wenigsten erreichbaren Feldern zuerst; eine Armee in einer Stadt gilt nicht als
  „in Stellung".
- Protokoll des Ersten Spiels: Die Würfel zeigten nur Sechsen und Einsen (v92) – jetzt 4–6 bzw.
  1–3, je Technologie fest, und dieselbe Zahl nennt die blasse Kachel.

Aus der Sitzung v92:
- **Tutorial: „Weiter ›" und „Fertig" auf Englisch deutsch** – `renderTutPanel` setzte die
  Beschriftung ohne `T()`. Jetzt übersetzt; da das Erste Spiel dasselbe Panel nutzt, setzt das
  Tutorial auch Kopf, „Tutorial beenden" und die Leiste bei jedem Zeichnen zurück (Smoke-Schritt
  „v92: das klassische Tutorial hat sein Panel wieder ganz").
- **Tutorial: „Kosten oben links in der Kachel"** – der Preis steht oben rechts (`.tech .c`
  rechtsbündig); deutsch und englisch berichtigt.
- Beim Bauen des Ersten Spiels mit zufälligem Spiel gefunden (nie ausgeliefert): Auf dem
  Militärweg konnte Englands *andere* Stadt fallen, und Griechenland hatte am Rundenende mehr
  als 3/4 der Weltbevölkerung – Wirtschaftssieg vor der Hauptstadt; ein langer Militärweg kam an
  die Singularität heran. Dagegen `fgNurHauptstadt` und `fgKeineSingularitaet`
  (`ANNAHMEN.md`, „Erstes Spiel (v92)").
- Ebenfalls vor der Auslieferung, im Browser auf Telefongröße gefunden: Der aufgedeckte Tipp
  schob im niedrigen Panel (quer) das Ziel aus dem sichtbaren Teil. Jetzt steht der Tipp direkt
  unter dem Ziel, und `fgTippZeigen` scrollt das Ziel an den oberen Rand des Panels.

Aus der Sitzung v91:
- **Flanken vor den Städten (v90) zurückgenommen** (Anweisung des Autors): Mit den Flanken
  zuerst verlor eine Stadt ihre verteidigende Armee, bevor sie angegriffen wurde – Städte, die
  verteidigt waren, konnten fallen. Nicht wieder einführen: `test.js` „Kampfphase (v91)"
  (Belagerung 1/2, Armee an der Stadt: die Stadt hält, erst danach fällt die Armee) und der
  Smoke-Schritt „v91" (erst das Bild der Stadt, dann das der Flanke); Gegenprobe mit den Flanken
  zuerst schlägt in beiden an.

Aus der Sitzung v89:
- **Doppeltipp traf einen nachgerückten Knopf** (gemeldet als „beim Öffnen von Fähigkeiten
  wachsen alle Städte", so nicht nachstellbar; dieser Weg in Chromium nachgestellt): Nach
  einer Aktion zeichnet sich ein Blatt neu, was oben verschwindet (Liste der Freien
  Forschung, eine kopierte Technologie, „Kostenlos wachsen"), lässt den Rest nachrücken, und
  der zweite Tipp traf „Alle Städte wachsen", „Kopieren" bzw. „Bevölkerung wachsen". Nicht
  wieder einführen: `sheetCalm`/`sheetCalmGuard`; der Smoke-Schritt „v89" tippt mit echten
  Klick-Ereignissen (Gegenproben: ohne Wache, alles sperren, Bot-Blatt sperren).

Aus der Sitzung v87:
- **Hochkant lag jedes Blatt außerhalb des Bildschirms** (beim Prüfen in Chromium gefunden):
  `setBarHeight` nahm die Höhe aus `getBoundingClientRect` – gedreht ist das die Breite der
  Leiste. `--bar-h` und `--hud-h` standen auf der ganzen Bildschirmhöhe, und Stadtblatt,
  Macht, Fähigkeiten und das Blatt eines KI-Zugs samt „Weiter" lagen jenseits des Rands; im
  KI-Zug ist die Leiste zusätzlich gesperrt. Nicht wieder einführen: gedreht die Breite; der
  Smoke-Schritt „Gedreht: --bar-h …" gibt die Rechtecke vor (Gegenprobe: 1180px).
- **Rückschau-Anspruch ohne Wahl blockierte die übrigen** (beim Umbau gefunden): Gewählt wurde
  immer aus dem ersten Anspruch der Schlange; war für ihn nichts mehr übrig (alle früheren
  Technologien des Feldes erforscht), war jede weitere Rückschau desselben Zugs verloren – auch
  für die KI. Nicht wieder einführen: `backPick(p, S)`; der Test stellt Papier (leer) und
  Segeln (Produktion) nach, mit Gegenprobe nach der alten Regel.
- **Smoke-Schritt „Kosten (v82)" hing an einem Ereignis** (gesehen beim Prüfen): Mit den
  Ereignissen früherer Schritte konnte eine Hungersnot die Umtauschkurse verdoppeln, und der
  Schritt samt dem nächsten schlug grundlos an. Er startet jetzt ohne Ereignisse.

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
- **Handelsrouten** (`tradeRoutes`): +1 bzw. +2 auf alle Erträge je angebundener Stadt (seit
  v96 +1 bzw. +4).

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
   gegenprüfen. (v87: Bis dahin lag dort jedes Blatt außerhalb des Bildschirms, siehe
   Bug-Historie – die Prüfung in Chromium hatte das nicht erfasst.)

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
   2🔬 −2🌾 6🪙; mit Ökologie seit v69 tatsächlich 3🔬 −1🌾 7🪙 (gemessen mit v69 – seit v86
   zählt Ökologie übers Reich, die Zahlen sind nicht nachgemessen). Vorbestehend, durch v69 nur
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
   einen Zug gehabt: 0 von 40 KI-Duellen enden in Runde 2 (v82: 7 von 40). Seit v85 wird am
   Rundenende geprüft, auch in Runde 1: in 600 Duellen KI gegen KI kein Wirtschaftssieg vor
   Runde 3; gegen den Bot David einer in 400 am Ende von Runde 1 (Siedlertrecks und eine
   zweite Stadt, 4 von 5, der Bot verfehlte sein Wachstum) – vom Autor so gewollt.
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
   **v87, ein Kandidat:** Hochkant gehalten (die App dreht sich selbst) lag das Blatt eines
   KI-Zugs samt „Weiter" bis v86 außerhalb des Bildschirms, und die Leiste ist im KI-Zug
   gesperrt – genau dieses Bild. Nicht belegt, dass es der gemeldete Fall war (wurde das
   iPad hochkant gehalten?). Quer gehalten misst `setBarHeight` richtig; das Gerät zu
   drehen, hätte dann vermutlich geholfen (nicht auf dem iPad geprüft).
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
   Nenner fest) ließ jedes KI-Duell in Runde 2 enden (seit v85 überholt: geprüft am
   Rundenende). (b) Kriegerkultur: +2 je Stadt, wie
   eine Armee. (c) Draft: n = Reiche außer Bots (Bots haben keine Fähigkeiten). (d) Keine
   Fähigkeit doppelt im eigenen Reich, solange anderes übrig ist. (e) Startertrag mit 2
   Bevölkerung gerechnet, ohne Technologien. (f) Der Kreml-Zuschlag auf die Singularität
   (+50) wird im Marathon nicht vervielfacht. (g) Das Tutorial erklärt den Zeitpunkt des
   Wirtschaftssiegs nicht – seit v85 erledigt: „am Ende einer Runde", in beiden Fassungen.
29. **Hauptstadt verloren – und dann? (v84, Auslegung, zum Ändern angeboten).** Im Marathon
   wird eine eroberte Hauptstadt eine gewöhnliche Stadt, und ihr altes Reich spielt ohne
   Hauptstadt weiter (keine Handelsrouten, Gründungen ab der ersten Stadt) – so wie es nach
   einem Barbarenüberfall schon immer war. Alternative: Die größte Stadt wird neue Hauptstadt
   (dann könnte dasselbe Reich ein zweites Mal „enthauptet" werden). Gezählt wird, wie viele
   Hauptstädte ein Reich genommen hat, nicht wie viele es hält.
30. **Kolonie hinter einem Umweg (v84, wörtlich umgesetzt).** Die Luftlinie gilt nur, wenn es
   gar keinen Weg gibt; gibt es einen, zählt er, auch als langer Umweg. Eine Kolonie hinter
   einem Umweg kann deshalb mehr kosten als eine gleich weite ohne jeden Weg. Wer für eigene
   Kolonien immer die kürzere von beiden will: eine Zeile in `foundDistance`.
31. **Sklaverei 7 und die drei Militärkosten nicht gemessen (v84).** Die KI rechnet mit den
   neuen Werten (sie probiert Aktionen auf Kopien aus); ihr fester Zuschlag für die
   Technologie Sklaverei (`kiTechBonus` 2) ist nicht nachgestellt. Messreihen zur Balance gab
   es diesmal keine.
32. **Militärsiege im Marathon selten (v84, gemessen).** In 32 Marathonpartien der KI (v84) endeten 2
   militärisch, 22 mit der Singularität und 8 wirtschaftlich; dieselben 8 Startwerte der
   Stufe Schwer endeten in v83 viermal militärisch, jetzt keinmal. Eine erste Hauptstadt fiel
   in 8 von 24 Partien. Zwei Hauptstädte und die teurere Singularität wirken in dieselbe
   Richtung – ob der Militärsieg so selten sein soll, entscheidet das Spielen.
33. **Getroffene Auslegungen (v85) – zum Ändern angeboten.** (a) Im Punktvergleich neben dem
   Wirtschaftssieg am Rundenende steht jeder in derselben Runde angemeldete Sieg, auch der
   Kultursieg – genannt hatte der Autor die Singularität. (b) Bots bekommen keinen
   Startausgleich (sie zahlen nichts), ihr Platz zählt trotzdem mit. (c) Der Platz zählt ab
   dem Startspieler. (d) „Doppelter Bonus" = doppelter Abzug je Zeitalter, auch auf die
   Singularität. (e) Der feste KI-Zuschlag der Wissenschaftlichen Methode ist im Marathon
   verdoppelt (nicht gesondert gemessen).
34. **Der Startausgleich gleicht wenig aus (v85, gemessen).** KI gegen KI: im Duell gewinnt der
   Startspieler 72,0 % statt 74,3 % (mit +3 Münzen für den Zweiten 68,4 %), zu viert 37,5 %
   statt 42,7 %, der Vierte 6,0 % statt 4,2 % (auch mit 0/2/4/6 Münzen 5,5 %); zu dritt keine
   messbare Wirkung. Münzen im ersten Zug sind ein schwacher Hebel gegen diesen Vorteil –
   woran er hängt, ist nicht gemessen (zu viert entscheidet meist der Militärsieg, den der
   Startspieler am häufigsten holt). Zwischen Menschen nicht gemessen. Seit v98 (Anweisung des
   Autors) 2/4/6 und zu zweit 4 – genau so nicht gemessen; die Empfindlichkeit von v85 (Regeln von
   damals) liegt nahe: im Duell mit +3 für den Zweiten 68,4 %, zu viert mit 0/2/4/6 37,7 / 31,5 /
   25,3 / 5,5 %.
35. **Draftwerte im Marathon neu gemessen (v85).** 200 Partien nach den Regeln von v85 (v83: 40):
   Kolonisten weit vorn (105 Siege bei 139 Besitzern), die Freie Forschung trotz der Grenze
   an zweiter Stelle, die Günstige Forschung trotz doppeltem Abzug unter der Mitte;
   Kriegerkultur und Handelsreich deutlich schwächer als in v83 gemessen, Rückschau und
   Fruchtbarkeit stärker. `KI_DRAFT_BASE` folgt der Messung; ob die KI damit besser draftet
   als mit der alten Tabelle, ist nicht gegeneinander gemessen. Die alten Werte stehen in
   `ANNAHMEN.md` (v83 und v85), falls nur Griechenland nachgezogen werden soll.
36. **Getroffene Auslegungen (v86) – zum Ändern angeboten.** (a) Bei einer Revolution laufen
   Handelsrouten, die Ökologie der übrigen Städte und die Gentechnik weiter, mit Bürokratie
   verdoppelt; wer sie als „Teil der Hauptstadt" mit ausfallen lassen will: drei Stellen in
   `incomeBreakdown`. (b) Die Bevölkerung der Hauptstadt zählt bei Revolution nicht zur
   Ökologie. (c) Gentechnik wird verdoppelt, obwohl sie schon vorher indirekt an der
   Bürokratie hing (aus der verdoppelten Wissenschaft gerechnet). (d) Wallfahrt und Seemacht
   – auch der Seemacht-Bonus der Hauptstadt selbst – bleiben unverdoppelt (nicht genannt).
37. **Kolonien im Marathon (v86, gemessen).** Mit dem zusätzlichen Geld aus Bürokratie und
   Ökologie kauft die KI im Marathon viel mehr Felder: 722 statt 149 in 16 Partien, ein Reich
   bis 215. Das ist regelgerecht (3 Münzen je Feld, der Ertrag bleibt), macht aber späte
   Züge teuer – nach den Tempo-Änderungen höchstens 5,2 s in diesen Partien. Ob 200 gekaufte
   Felder so gewollt sind, entscheidet das Spielen; die KI-Grenze dafür wäre `kiColonySpots`.

38. **Getroffene Auslegungen (v87) – zum Ändern angeboten.** (a) „Alle Städte wachsen" steht
   immer da, nicht erst mit Verbundwerkstoffen. (b) Gewachsen wird von der kleinsten Stadt an;
   was an einer Stadt scheitert (Mittel, Nahrungsgrenze, schon gewachsen, neu, Sturmflut),
   wird ausgelassen, die übrigen wachsen – der Knopf sagt vorher „2 von 3 Städten" und warum.
   „Alle oder keine" wäre eine Zeile in `abilSheet` (Knopf sperren, wenn `done < of`). (c) Die
   kostenlosen Technologien aus Wundern (Bibliothek, Oxford, Raumfahrt) zählen in der Zahl mit
   und stehen unter „Fähigkeiten". (d) Freie Forschung, Rückschau und Kopieren sind aus dem
   Technologiebogen ausgezogen statt an beiden Stellen zu stehen. (e) „In allen Städten
   opfern" heißt so in Anlehnung an „Bevölkerung opfern" im Stadtblatt.
39. **Keine Erinnerung vor dem Zugende (v87, nicht umgesetzt).** Rückschau und Freie Forschung
   verfallen ungenutzt (Rückschau zum Zugende, Freie Forschung zum Rundenende); seit sie nicht
   mehr direkt unter dem Bogen stehen, erinnert nur die Zahl an „Fähigkeiten". „Zug beenden"
   könnte wie bei der wartenden Armee einmal nachfragen (`pendingWarnings`) – vielleicht
   lästig, wenn man kostenloses Wachstum bewusst liegen lässt. Entscheidung des Autors.
40. **Getroffene Auslegungen (v88) – zum Ändern angeboten.** (a) „Stapeln trotzdem" heißt:
   verschiedene Ertragsarten derselben Kette stecken beide im höheren Glied (Containerlogistik
   = +2 Nahrung von Fischerei/Segeln + eigene Münze, ebenso Grüne Revolution); Ketten
   verschiedener Felder addieren sich (Astronomie zu Containerlogistik, Papier zu
   Landwirtschaft). (b) „Niedriger" heißt billiger im selben Feld, in allen Techtrees dieselbe
   Reihenfolge. (c) Taiga und Großer Leuchtturm addieren sich weiter (Taiga seit v95: Punkt 49). (d) Ein billigeres Glied,
   das nach einem teureren kommt, bringt keinen Ertrag mehr dazu (Mathematik nach KI). (e) Gilt
   sofort auch in gespeicherten Partien. (f) Der Bürokratie-Zusatz fehlt an beiden Zeilen
   (Handelsrouten, Gentechnik); der Regelbogen („Mit Bürokratie zählt das doppelt.") und der
   Techtext der Bürokratie sagen es weiter. (g) „Ne Runde Civ?" mit großem R; die Tutorialfrage
   nennt weiter „Civilization". (h) Belagerungsmaschinen +3 und Singularität 120 gelten auch im
   Tutorial (Texte angepasst, Ablauf unverändert).
41. **Balance nach v88 nur grob gemessen.** Mit denselben Startwerten wie v87 (`tools_ki.js`:
   `selbst 100`, `selbst 40 reiche=4`, `duell 60 diff=david`, `vier 40 diff=koenig`) gewinnt die
   KI genau so oft wie vorher; im Duell gegen David gibt es weniger Forschungs- und mehr
   Wirtschaftssiege (21 → 13 bzw. 6 → 14 von 60). Nicht getrennt nach den drei Änderungen, kleine
   Reihen, Tabelle in `ANNAHMEN.md`. Nicht neu abgestimmt: der feste KI-Zuschlag für
   Belagerungsmaschinen (`kiTechBonus` 4). Ob Menschen jetzt Ketten überspringen (etwa gleich
   zur KI statt Mathematik zuerst), zeigt erst das Spielen.
42. **„Beim Öffnen von Fähigkeiten wachsen alle Städte" – nur eingegrenzt (v89).** Das Öffnen
   ändert nachweislich nichts am Spielstand (jsdom, 20 Partien × bis zu 8 Züge), ein
   Doppeltipp auf „Fähigkeiten" erreicht das Blatt nicht (die Leiste liegt darüber). Gefunden
   und behoben ist nur der Weg über einen zweiten Tipp auf einen nachgerückten Knopf bzw. auf
   ein noch hereingleitendes Blatt (Bug-Historie v89). Tritt es wieder auf: Reich, Fähigkeit,
   was davor getippt wurde und ob die Städte einmal oder mehrfach wuchsen, dazu das Protokoll
   („Stadt wächst …"-Zeilen zeigen, über welchen Weg).
43. **Getroffene Auslegungen (v89) – zum Ändern angeboten.** (a) 0,4 s Wartezeit nach dem
   Öffnen/Neuzeichnen, für alle Blätter außer dem Bot-/KI-Blatt; derselbe Knopf sofort. (b)
   Keine Rückfrage vor „Alle Städte wachsen". (c) „inkl. …" ist aus den Techtexten ganz
   entfernt, also auch aus der Technologieliste des Regelbogens (eine Textquelle); der Absatz
   unter der Geländetabelle erklärt die Regel weiter. (d) Der zusätzliche Schritt der
   Dampfmaschine ist ein bezahlter (je Stadt und Runde), für den die Dampfmaschine wie
   gewohnt keine Münzen verlangt. (e) Keramik heißt jetzt „1× zusätzliches Wachstum pro
   Stadt" – gleiche Wirkung wie „Bevölkerung 2× pro Runde wachsen lassen". (f) Gemessen
   (`tools_ki.js`, Startwerte wie v88): gegen Bots gewinnt die KI so oft wie vorher (29 → 30 von
   60 gegen David, 14 → 14 von 40 gegen drei Könige); KI gegen KI enden mehr Duelle mit dem
   Wirtschaftssieg (29 → 36 von 100). Tabelle in `ANNAHMEN.md`.
44. **Erledigt (v91): Kampfreihenfolge.** v90 hatte auf Flanken vor den Städten umgestellt (der
   Wunsch zum Nachspiel nannte diese Reihenfolge). Der Autor hat entschieden: erst die Städte,
   dann das Flankieren – sonst fielen verteidigte Städte. v91 rechnet wieder wie bis v89, das
   Nachspiel folgt (Bug-Historie v91, `ANNAHMEN.md` Abschnitt v91).
45. **Getroffene Auslegungen (v90) – zum Ändern angeboten.** (a) 1 s je Kampf auch bei vielen
   Kämpfen (gemessen meist 1–2 je Zug, selten über 10, höchstens 16); ein Tipp auf die Karte
   überspringt den Rest. (b) Auch Flanken, für die die Macht
   nicht reicht, sind ein Bild („hält"); Belagerungen ohne Angreifer nicht. (c) Die Werte
   stehen neben dem Kampffeld (mit Strich), nicht darauf. (d) Dazu eine Zeile mit Nummer und
   Ausgang. (e) Auch die Kämpfe von Bots und KI, vor ihrem Blatt. (f) Ab zwei Kämpfen ein
   Hinweis über der Leiste; die Meldung des letzten Kampfs nach dem eigenen Zugende entfällt.
   (g) Zugfolge nach Plätzen nur, wo der Aufbau Plätze nummeriert – klassisch und Marathon
   bleiben bei Russland → Griechenland → England → Wikinger. (h) Die Beutezüge der Wikinger
   erscheinen nicht im Nachspiel, nur im Protokoll.

46. **Getroffene Auslegungen (v92/v93, Erstes Spiel) – zum Ändern angeboten.** (a) Griechenland
   gegen England, Griechenland wegen der kostenlosen Technologien in Runde 1. (b) Verfügbarkeit:
   die Antike fest ausgewählt; ab dem Mittelalter (seit v93, auf Rückfrage „fest, etwa die Hälfte
   fehlt") 24 von 46 – was Ziele und Tipps nennen, ist dabei, was das Erste Spiel nicht erklärt,
   fehlt; die Würfel im Protokoll passen dazu. (c) England nach Drehbuch, ab Runde 5 wachsen
   seine Städte wieder. (d) Schienen durch Ablehnen mit Begründung statt gesperrter Knöpfe;
   Zugende nur dort hart gesperrt, wo es nicht umkehrbar wäre (belagerte Stadt, englische Armee),
   sonst eine Nachfrage. (e) Ziel oben im Panel, Tipp direkt darunter, Lage danach; weiter nach
   0,9 s ohne „Weiter"-Knopf. (f) Seit v93: die Seite vor der Partie ist ein Fenster über dem
   Menü (Schließen = zurück ins Menü); der Weg prägt Runde 1–4 über Texte und die Technologie in
   Runde 3/4 (Militär Belagerungsmaschinen/Eisenverarbeitung, Wirtschaft Keramik/Demokratie,
   Forschung Schrift/Papier), die Lektionen bleiben für alle dieselben (auf Rückfrage „gemeinsame
   Grundlagen, vom Weg geführt"). (g) „Anderen Weg ausprobieren" beginnt eine neue Partie; welche
   Wege gewonnen sind, merkt sich das Gerät. (h) Der Wirtschaftsweg darf die Schwelle jederzeit
   reißen (vor dem Ende von Runde 4 reicht es nicht). (i) Das Tutorial bleibt („vorerst") – ob und
   wann es geht, entscheidet der Autor.
47. **Nicht im Ersten Spiel** (bewusst, es sollte eine erste Partie bleiben): Eisenbahn,
   Kontrollzone (Schießpulver), Kopieren (Spionage, Kundschafterei, Internet), Sklaverei,
   Kolonialismus, Atomwaffen, die alternativen Fähigkeiten, Ereignisse und Weltwunder, Marathon.
   Der Schlusstext nennt sie und verweist auf „Regeln & Technologien"; seit v93 sind die
   Technologien davon in der Partie gar nicht verfügbar (`FG_SPAETER`). Möglich wäre ein zweites
   Szenario für Fortgeschrittene.
48. **Getroffene Auslegungen (v94) – zum Ändern angeboten.** (a) „Macht" fest heißt der Machtwert
   je Armee (`powerOf`); wer mitkämpft (eine eroberte Burgstadt als Flankenposition), ergibt sich
   weiter aus dem Stand. Auf die Balance nicht gemessen. (b) Ein Tipp auf die Karte überspringt
   den Rest eines Zugs, nicht alle bis zum nächsten Menschen. (c) Forschen und Macht zeigen nur
   ihren Satz, je einmal je Zug; Armeen bauen und ziehen ist eine Szene. (d) 0,9 s je Szene (mit
   Zügen 1,26 s), ab 8 Szenen schneller, höchstens bis 60 % – in Chromium dauerte eine Runde mit
   drei KI-Gegnern in Runde 3–5 meist 6–10 s; auf dem iPad nicht gemessen. (e) „Keine
   Animationen" bringt genau v93 zurück, das Nachspiel der Kämpfe (v90) bleibt also. (f) Das
   klassische Tutorial behält immer das Blatt. Seit v95 überholt: (b) und (c) – je Aktion eine
   Szene, nichts mehr zusammengefasst; (d) – die Auswahl Langsam/Schnell/Keine (Punkt 49).
49. **Getroffene Auslegungen (v95) – zum Ändern angeboten.** (a) „Etwa um die Hälfte langsamer"
   als das 1,5-Fache gelesen: 1,35 s je Szene, mit gezogener Armee 1,89 s; halbes Tempo wären 1,8
   bzw. 2,5 s. (b) Langsam kürzt lange Züge nicht – ein später KI-Zug mit über 40 Aktionen dauert
   dann eine Minute (gemessen: Median 9,4 s, 9 von 10 Zügen höchstens 23,5 s); Schnell kürzt wie
   v94. (c) Je Protokollzeile eine Szene: „Alle Städte wachsen" eines Menschen wären mehrere (die
   KI und Bots nutzen es nicht). (d) Taiga: Untergrenze nach Technologien und Leuchtturm, nicht für
   Vulkan und lahmgelegtes Gelände, Bürokratie verdoppelt danach; „alle Felder" = alle, die
   Erträge bringen (Umland, gekaufte Felder). (e) Der Grundwert der Taiga für die Draftwahl der KI
   im Marathon ist noch der alte (0) – die neue Taiga ist stärker, nicht neu gemessen; die Balance
   der Änderung auch nicht.

50. **Getroffene Auslegungen (v96) – zum Ändern angeboten.** (a) Gekaufte Felder: einmal doppelt,
   auch am Umland der Hauptstadt; ohne Hauptstadt einfach; bei einer Revolution produzieren sie
   weiter (wie die Handelsrouten seit v86). (b) „Kacheln" sind alle knappen Angebote einer
   Technologie (Bogen, Knöpfe unter „Fähigkeiten", Fenster der Wunder-Technologien); den ganzen
   Text hat nur der Regelbogen. Kolonialismus nennt dort ebenfalls, dass gekaufte Felder zur
   Hauptstadt zählen. (c) Die Methode zuerst gilt auf allen Stufen und auf jedem Weg zu ihr (auch
   Freie Forschung, Rückschau, Kopie); sie lohnt, wenn ihr eigener Nutzen positiv ist – es kann
   also einen Zug geben, in dem die KI sie nimmt, wo sie bis v95 zwei andere Technologien genommen
   hätte. (d) Kopfzeile: die Zahl springt mit der Szene auf den Stand danach, die Marke erklärt den
   Sprung; keine eigene Szene „Einkommen" vorweg. Auch die Macht und die Bevölkerung laufen mit.
   (e) Der Zuschlag der KI für die Technologie Eisenbahn ist aus dem Verhältnis abgeleitet (× 3),
   nicht gemessen.
51. **Wie viel stärker die KI mit der neuen Reihenfolge ist, ist nur knapp messbar.** Gepaart, KI
   Schwer gegen die Fassung bis v95: zu viert 217 : 183 in 400 Partien (p ≈ 0,09), im Duell siehe
   `ANNAHMEN.md`; klar ist der Unterschied in der Forschung (gut eine halbe Technologie mehr nach
   Runde 4 bei gleich viel Wissenschaft). Ähnliche Reihenfolgefehler sind denkbar, wo eine
   Technologie die übrigen Aktionen desselben Zugs verbilligt – Eisenverarbeitung und Gewehre vor
   dem Machtkauf, Dampfmaschine vor dem Wachsen, Demokratie und Nationalismus vor dem Armeebau –,
   nicht nachgestellt.
52. **Getroffene Auslegungen (v97) – zum Ändern angeboten.** (a) Siedlertrecks wörtlich: eine Stadt
   mit 1 Bevölkerung wächst für 0 (der bezahlte Schritt ist verbraucht) – mit Sklaverei also opfern
   und kostenlos zurückwachsen; eine Untergrenze wäre `Math.max(1, …)` in `growPrice`. (b) Freie
   Forschung: nur verfügbare Technologien, nicht die Singularität (wie Raumfahrt), beide im selben Zug
   erlaubt, im Marathon genauso (dort bis v96 nur bis ins Mittelalter); die Zahl an „Fähigkeiten" zählt
   sie, bis beide verbraucht sind. (c) Kriegerkultur: auch die Burgstädte +1 (bis v96 wie die Armeen
   +2) – die Anweisung nannte nur die Armeen. (d) Der alte Techtree (Tutorial, Spielstände von vor v82)
   behält die Methode 2/4/6/8/10. (e) Im Ersten Spiel siegt der Forschungsweg in Runde 7 statt 6 – nicht
   nachgebessert. (f) Der Spieltipp zur Freien Forschung ist neu geschrieben.
53. **Balance der fünf Fähigkeiten nicht gemessen.** Gemessen ist nur, wie die KI die Freie Forschung
   nutzt (`ANNAHMEN.md`). Die Draftwerte im Marathon für Freie und Günstige Forschung, Kriegerkultur,
   Siedlertrecks und Fruchtbarkeit sind geschätzt; ein Messwerkzeug für den Marathon fehlt im Paket.
54. **Ein Smoke-Lauf schlug in v97 einmal fehl – Schritt unbekannt.** Beim ersten `node tools_docs.js`
   brach `smoke.js` ab; `tools_docs.js` verschluckt die Ausgabe, zu sehen war nur, dass es nach dem
   Schritt „Wiederholtes „Nochmal spielen" …" geschah. Danach elf Läufe mit v97 und sechs mit v96 ohne
   Fehler, auch aus dem ausgelieferten Zip. Verdächtig sind die zeitabhängigen Schritte (v89: ein Tipp
   zählt erst 0,4 s nach dem Neuzeichnen – eine Pause der Maschine dazwischen ließe ihn zählen) und
   Schritte mit zufälligem Aufbau. Wer es wieder sieht: `node smoke.js` direkt laufen lassen, die
   Ausgabe nennt den Schritt.
55. **Getroffene Auslegungen (v98) – zum Ändern angeboten.** (a) „Zu zweit" heißt zwei Reiche (ohne
   Barbaren), nicht nur der Modus „1 gegen 1" – andere Partien mit zwei Reichen gibt es im Aufbau
   derzeit nicht, wohl aber in Tests und Werkzeugen. (b) Zu dritt gilt die Reihe: 2 und 4. (c) Bots
   bekommen weiter nichts; ist ein Bot Startspieler, bekommt der Mensch als Zweiter 4. (d) Im Ersten
   Spiel bekommt England (KI, Zweite) jetzt 4 statt 1 Münze im ersten Zug – sein Drehbuch gibt sie nicht
   aus (gründen, Hauptstadt wachsen), der Verlauf ist derselbe.

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
