// Testprojekt zum Beweis: Blatt 1 ist ein erzeugtes Inhaltsverzeichnis, danach läuft ein
// Potenzial (L+) von der Einspeisung zum Steuerstromkreis. Zeigt, dass
// die berechneten Querverweise auf beiden Blättern stimmen – und, über den Knopf "Blatt
// dazwischen einfügen" in der Werkzeugleiste, dass sie es nach dem Einfügen eines Blattes
// immer noch tun. Blatt 2 ist die Einspeisung von IHK-Blatt 8 (Version 5: mehrere
// Sammelschienen L1/L2/L3/N/PE + L+/L-, Anbindung über bauteil.schienen, ein dreipoliges
// Betriebsmittel). Bauteile brauchen nichts als pfad/hoehe (+ Kontakt/Typ, + pole) –
// Anschlusspunkte, Schienenlagen und alle Leitungen werden berechnet, nie gespeichert
// (siehe FORMAT.md).

const LEITWERK_TESTPROJEKT = (() => {
  function bauen() {
    const M = LEITWERK_MODELL;
    const R = LEITWERK_RASTER;
    const S = LEITWERK_SYMBOLE;
    const projekt = M.neuesProjekt({
      auftraggeber: "Franz Wahl", anlage: "Testanlage", plantitel: "LeitWerk – Fundament-Test",
      ersteller: "Franz Wahl", errichter: "Muster-Elektro GmbH, Musterstraße 1, 57000 Siegen",
      zeichnungsnummer: "LW-0001",
      aenderungen: [{ index: "a", datum: "2026-09-25", text: "Schriftfeld nach DIN EN 61082", name: "Franz Wahl" }],
    });

    const blatt1 = M.neuesBlatt("Hauptstromkreis – Einspeisung", "stromlaufplan");
    const blatt2 = M.neuesBlatt("Steuerstromkreis – Baugruppe", "stromlaufplan");
    M.blattEinfuegen(projekt, blatt1);
    M.blattEinfuegen(projekt, blatt2);

    // Nachzeichnung der Einspeisung aus Blatt 8 der IHK-Vorlage (Hauptstromkreis). Quelle:
    // raw/verarbeitet/2026/leitwerk-vorbilder/ihk-2021-blatt08-hauptstromkreis.jpg
    //
    // Einspeisung 3/N/PE ~400V/230V 50Hz auf fünf oberen Schienen, die 24-V-Seite des
    // Netzteils auf L+/L- unten. Pfad 1 wie im Original: -F1 (6 A) von L1 auf -T1, -T1
    // mit N an Anschluss 2, 24 V über -F2 (4 A) auf L+, Minus (Anschluss 4) direkt auf L-.
    // Die Klemmen -X1/-X2 und die Schutzleiterbrücke von -X2:12 auf PE fehlen noch
    // (Klemmen sind noch keine Bauteile, ein Anschluss bindet genau eine Schiene).
    //
    // Dazu das dreipolige Betriebsmittel für die Abnahme: -Q1 (Motorschutzschalter) und
    // -Q2 (Schütz, Hauptkontakte) in Pfad 3–5, je EIN Bauteil mit pole: 3, gekoppelt durch
    // die gestrichelte mechanische Verbindung, BMK je einmal. -Q1 hängt mit 1/3/5 an
    // L1/L2/L3; -Q2 sitzt darunter und ist allein über die Strompfad-Kette mit -Q1
    // verbunden. PE bleibt ungeschaltet.
    for (const name of ["L1", "L2", "L3", "N", "PE"]) blatt1.schienen.push(M.neueSchiene(name, "oben"));
    blatt1.schienen.push(M.neueSchiene("L+", "unten"), M.neueSchiene("L-", "unten"));
    blatt1.texte.push({ id: M.neueId("x"), x: R.SCHIENE_X1 + 14, y: R.RASTER_Y + 3.4, text: "3/N/PE ~400V/230V 50Hz", kursiv: false });
    // Freihand-Notiz (Stift-Ebene): ein Kringel mit Pfeil, wie man ihn am Tablet an den Plan
    // schreibt – prüft, dass Notizen über allem liegen und nur eingeblendet gedruckt werden.
    const kringel = Array.from({ length: 25 }, (_, i) => {
      const w = (i / 24) * 2 * Math.PI;
      return [Math.round((200 + 14 * Math.cos(w)) * 10) / 10, Math.round((150 + 8 * Math.sin(w)) * 10) / 10];
    });
    blatt1.freihand.striche.push({ punkte: kringel }, { punkte: [[214, 150], [236, 168], [231, 167.5], [236, 168], [235, 163]] });

    // Stufe 4a: die Einspeisung läuft wie im Original über die Reihenklemme -X1:1 auf -F1
    // (Klemmenplan der IHK-Vorlage Teil 2: -X1:1 L1 → -F1:1).
    const klemme = (leiste, nummer, pfad, hoehe, schienen = {}) =>
      Object.assign(M.neuesBauteil(leiste, "klemme", pfad, hoehe, "", 1, schienen), { klemme: nummer });
    blatt1.bauteile.push(klemme("-X1", "1", 1, 1, { "1": "L1" }));
    blatt1.bauteile.push(M.neuesBauteil("-F1", "sicherung", 1, 2, "6 A"));
    blatt1.bauteile.push(M.neuesBauteil("-T1", "netzteil", 1, 3, "230 V~ / 24 V=", 1, { "2": "N", "4": "L-" }));
    blatt1.bauteile.push(M.neuesBauteil("-F2", "leitungsschutzschalter", 1, 4, "4 A", 1, { "2": "L+" }));

    blatt1.bauteile.push(M.neuesBauteil("-Q1", "motorschutzschalter", 3, 1, "6,3 A", 3, { "1": "L1", "3": "L2", "5": "L3" }));
    blatt1.bauteile.push(M.neuesBauteil("-Q2", "schuetz", 3, 2, "Netzschütz", 3));
    // Motorabgang über -X1:2…4 – drei einzelne Klemmen, je eine im Pfad unter einem Pol.
    ["2", "3", "4"].forEach((nummer, i) => blatt1.bauteile.push(klemme("-X1", nummer, 3 + i, 3)));
    // Stufe 4c: von dort geht die Motorleitung -W1 nach außen, Adern nach Farbe. Gespeichert
    // wird nur Kabel + Ader an der Klemme und der Typ – der Kabelplan rechnet den Rest.
    ["bn", "sw", "gr"].forEach((ader, i) => Object.assign(blatt1.bauteile.at(-3 + i), { kabel: "-W1", ader }));
    projekt.kabel.push({ bmk: "-W1", typ: "H07RN-F 4G1,5" });

    blatt1.funktionsklammern.push(M.neueFunktionsklammer(1, 2, "Netzteil 24 V DC"));
    blatt1.funktionsklammern.push(M.neueFunktionsklammer(3, 5, "Motorabgang"));

    // Nachzeichnung des Steuerstromkreises der IHK-Vorlage (Blatt 10), Stufe 1c zweiter
    // Teil: Baugruppenrahmen, Anschlussnummern, Funktionsklammern. Quelle:
    // raw/verarbeitet/2026/leitwerk-vorbilder/ihk-2021-blatt10-steuerstromkreis.jpg
    //
    // -P11…-P14 sind Leuchtdioden (Gruppe 7) – seit 2026-09-23 echte Symbole statt
    // Platzhalter. Das Original hat neun Spalten und fünf Zweige (-R11…R15/-P11…P15/-B12…B15) unter
    // -Q1; A4 hat nur sechs. Auf vier Zweige verkürzt (Pfad 2–5), Pfad 6 bleibt frei,
    // sonst kollidiert die Funktionsklammer unten mit dem Schriftfeld. -Q1 speist im
    // Original alle Zweige über eine gemeinsame Leitung; hier zapfen -Q1 und die vier
    // Zweige L+ je über bauteil.schienen an, statt eine Verbindung zu erfinden, die das
    // Strompfad-Modell noch nicht hergibt.
    blatt2.schienen.push(M.neueSchiene("L+", "oben"));

    blatt2.bauteile.push(M.neuesBauteil("-Q1", "trennschalter", 1, 1, "Trennschalter", 1, { "1": "L+" }));

    [11, 12, 13, 14].forEach((n, i) => {
      const pfad = i + 2;
      blatt2.bauteile.push(M.neuesBauteil(`-R${n}`, "widerstand", pfad, 1, "", 1, { "1": "L+" }));
      blatt2.bauteile.push(M.neuesBauteil(`-P${n}`, "led", pfad, 2, ""));
      blatt2.bauteile.push(M.neuerKontakt(`-B${n + 1}`, "schliesser", "naeherung", [], pfad, 3, "Näherungsschalter"));
    });

    // -A1 umschließt die vier Zweige – Rechteck aus Pfad/Höhe, nicht aus x/y (siehe
    // FORMAT.md „Baugruppenrahmen").
    blatt2.baugruppenrahmen.push(M.neuerBaugruppenrahmen("-A1", 2, 5, 1, 3, ""));

    // Funktionsklammern unter dem Plan, wie auf Blatt 8/10 der IHK-Vorlage.
    blatt2.funktionsklammern.push(M.neueFunktionsklammer(1, 1, "Spannungsversorgung Automatisierungssystem"));
    blatt2.funktionsklammern.push(M.neueFunktionsklammer(2, 5, "Prozess-Simulationsplatine"));

    // -X4: Klemmenleiste unter -Q1, freier Rasterfeld-Platz (Klemmenleisten bleiben x/y,
    // siehe FORMAT.md „Klemmenleiste"). Reihe C: in B läge sie seit Version 5 (Höhe 1
    // tiefer, unter Platz für fünf Schienen) auf der Beschriftung von -Q1, in D reichte die
    // achtpolige Leiste bis in die Funktionsklammer-Zeile hinein.
    const feldMitteX4 = R.mitteVonFeld("C1");
    blatt2.klemmenleisten.push(
      M.neueKlemmenleiste("-X4", feldMitteX4.x, feldMitteX4.y,
        ["5", "6", "7", "8", "9", "10", "11", "12"])
    );

    // Das Potenzial, das über die Blattgrenze läuft: auf Blatt 1 am rechten Ende der
    // Schiene L+ raus, auf Blatt 2 an der Schiene L+ wieder rein – wie eine echte
    // Potenzialschiene. Getrennt von blatt.schienen, das nur für die Strompfad-Verdrahtung
    // innerhalb eines Blatts zuständig ist (siehe FORMAT.md). Ein Potenzial-Vorkommen ist
    // laut Format noch ein freier Punkt; hier einmalig beim Aufbau auf die Schiene gelegt.
    const potenzial = M.neuesPotenzial("L+");
    potenzial.vorkommen.push({
      blattId: blatt1.id,
      x: R.RASTER_X + R.RASTER_BREITE - 5,
      y: R.schienenLagen(blatt1.schienen).find((s) => s.name === "L+").y,
    });
    potenzial.vorkommen.push({
      blattId: blatt2.id,
      x: R.RASTER_X + R.RASTER_BREITE - 5, // rechts, wo Pfad 6 frei ist – links liegt -Q1s Anbindung
      y: R.schienenLagen(blatt2.schienen).find((s) => s.name === "L+").y,
    });
    projekt.potenziale.push(potenzial);

    // Drittes Blatt: jede Kontaktform einmal allein, dazu einige Kombinationen aus
    // Kontakt und Betätigung – reines Sichtblatt zur Formprüfung von Gruppe 1–3 der
    // Symbolbibliothek. Mehrere Symbole je Strompfad zeigen nebenbei, dass die
    // automatische Verdrahtung auch bei purem Anschauungsmaterial anstandslos mitläuft.
    const blatt3 = M.neuesBlatt("Symbolprüfung", "stromlaufplan");
    M.blattEinfuegen(projekt, blatt3);

    S.listeKontakte().forEach(({ kontakt, name }, i) => {
      blatt3.bauteile.push(M.neuerKontakt(`-K${i + 1}`, kontakt, null, [], (i % 6) + 1, Math.floor(i / 6) + 1, name));
    });

    const kombinationen = [
      { kontakt: "schliesser", betaetigung: "druecken", name: "Taster, Schließer" },
      { kontakt: "oeffner", betaetigung: "druecken", name: "Taster, Öffner" },
      { kontakt: "schliesser", betaetigung: "drehen", name: "Drehschalter" },
      { kontakt: "schliesser", betaetigung: "handantrieb-allgemein", name: "Schalter, allgemein" },
      { kontakt: "schliesser", betaetigung: "naeherung", name: "Näherungsschalter" },
      { kontakt: "schliesser", betaetigung: "schluessel", name: "Schlüsselschalter" },
      { kontakt: "schliesser", betaetigung: "not-aus", name: "NOT-AUS-Taster" },
      { kontakt: "oeffner", betaetigung: "elektromagnetisch-anzugsverzoegerung", name: "Relaiskontakt, Anzugsverzögerung" },
    ];
    kombinationen.forEach(({ kontakt, betaetigung, name }, i) => {
      const n = 19 + i; // Fortsetzung der Zählung nach den 19 einzelnen Kontaktformen.
      blatt3.bauteile.push(M.neuerKontakt(`-K${n + 1}`, kontakt, betaetigung, [], (n % 6) + 1, Math.floor(n / 6) + 1, name));
    });

    // Sichtblätter zur Formprüfung gegen das Tabellenbuch (Seiten stehen in symbole.js):
    // jedes feste Symbol einmal, einpolig, sechs je Reihe, höchstens fünf Reihen (eine
    // sechste läge auf Höhe des Schriftfelds) – also höchstens 30 je Blatt.
    const symbolblatt = (titel, gruppen) => {
      const blatt = M.neuesBlatt(titel, "stromlaufplan");
      M.blattEinfuegen(projekt, blatt);
      S.listeGeraete().filter((g) => gruppen.includes(g.gruppe)).forEach(({ typ, name, bmk }, i) => {
        blatt.bauteile.push(M.neuesBauteil(`-${bmk}${i + 1}`, typ, (i % 6) + 1, Math.floor(i / 6) + 1, name));
      });
    };
    symbolblatt("Symbolprüfung Gruppen 4–6", [4, 5, 6]);
    symbolblatt("Symbolprüfung Gruppen 7–8", [7, 8]);
    symbolblatt("Symbolprüfung Gruppen 9–11", [9, 10, 11]);
    // Gruppen 13/14 (S. 83, 98, 99): Spulen einpolig, Motoren und Anlasser mit ihrer festen
    // Polzahl – deshalb von Hand gesetzt statt über symbolblatt().
    const blatt1314 = M.neuesBlatt("Symbolprüfung Gruppen 13–14", "stromlaufplan");
    M.blattEinfuegen(projekt, blatt1314);
    ["schuetzspule", "spule-anzugsverzoegert", "spule-abfallverzoegert", "spule-stromstoss"].forEach((typ, i) => {
      blatt1314.bauteile.push(M.neuesBauteil(`-K5${i + 1}`, typ, i + 1, 1, S.symbolVon({ typ }).name));
    });
    blatt1314.bauteile.push(
      M.neuesBauteil("-T51", "frequenzumrichter", 1, 2, "", 3),
      M.neuesBauteil("-Q51", "anlasser-stern-dreieck", 4, 2, "", 3),
      M.neuesBauteil("-M51", "motor-stern-dreieck", 1, 3, "", 3),
      M.neuesBauteil("-M52", "motor-wechselstrom", 4, 3, "", 2),
      M.neuesBauteil("-Q52", "anlasser", 4, 4, "", 3),
      M.neuesBauteil("-M53", "motor-gleichstrom", 1, 4, "", 2),
    );

    // Musteranlage Unterverteilung EG (Anlagenmappe) und Folgeschaltung nach Tabellenbuch
    // S. 83 – dieselben Bausteine wie die Vorlagen der Startseite (vorlagen.js). Die
    // Folgeschaltung zählt ab 31, weil die Prüfblätter -Q1 … -Q27 schon vergeben.
    const V = LEITWERK_VORLAGEN;
    const messwerte = V.unterverteilung(projekt);
    V.folgeschaltung(projekt, 31);

    // Ganz vorn: das Inhaltsverzeichnis als erzeugtes Blatt – es speichert nichts als
    // Titel und Schriftfeld, seine Zeilen rechnet erzeugte-blaetter.js bei jedem Rendern
    // aus der Blattreihenfolge (FORMAT.md „Erzeugtes Blatt"). Alle anderen Blätter rücken
    // dadurch eine Nummer weiter, ohne dass irgendwo eine Nummer nachgezogen wird.
    M.blattEinfuegen(projekt, M.neuesErzeugtesBlatt("Inhaltsverzeichnis", "inhaltsverzeichnis"), 0);
    // Ganz hinten: der Klemmenplan, ebenso erzeugt (Stufe 4a) – -X1 aus der Einspeisung mit
    // gerechneten Zielen, -X4 (Leiste alter Art) ohne.
    M.blattEinfuegen(projekt, M.neuesErzeugtesBlatt("Klemmenplan", "klemmenplan"));
    M.blattEinfuegen(projekt, M.neuesErzeugtesBlatt("Stückliste", "stueckliste"));
    M.blattEinfuegen(projekt, M.neuesErzeugtesBlatt("Kabelplan", "kabelplan"));
    M.blattEinfuegen(projekt, M.neuesErzeugtesBlatt("Stromkreisverzeichnis", "stromkreisverzeichnis"));
    // Stufe 5: das Prüfprotokoll als Formularblatt – Anlage, Blattnummer und Messpunkte
    // (die Klemmen -X1:1…4) kommen aus dem Plan, ausgefüllt ist noch nichts.
    const pruefblatt = M.neuesErzeugtesBlatt("Prüfprotokoll", "pruefprotokoll");
    M.blattEinfuegen(projekt, pruefblatt);
    // Prüfbericht der Musteranlage, Werte aus der Anlagenmappe (Erstprüfung 25.09.2026).
    V.pruefberichtFuellen(pruefblatt, messwerte);

    return projekt;
  }

  return { bauen };
})();
