// Symbolbibliothek für Stromlaufpläne, nach dem Tabellenbuch Elektrotechnik
// (Europa-Lehrmittel) nachgezeichnet – Scans dazu in
// raw/verarbeitet/2026/tabellenbuch-schaltzeichen/. Nicht aus einer Norm-PDF kopiert.
//
// Der Kerngedanke (siehe wiki/themen/leitwerk-symbole-tabellenbuch.md): das Buch malt
// kein Gerät fertig. Es zeigt auf S. 85 die Kontakte und auf S. 86 daneben die Antriebe –
// ein Taster entsteht erst aus „Schließer" plus „durch Drücken". Diese Datei bildet
// deshalb drei getrennte Bibliotheken ab, die erst beim Zeichnen zusammengesetzt werden:
//
//   KONTAKTE      – Gruppe 1, S. 85 (auch 84/91)
//   BETAETIGUNGEN – Gruppe 2, S. 86
//   KENNZEICHEN   – Gruppe 3, S. 85
//
// Dazu die festen Symbole (bauteil.typ), in GERAETE:
//
//   Gruppe 4 – Schalter und Schutzorgane (S. 86, Motorschutzschalter S. 93)
//   Gruppe 5 – Sicherungen (S. 84, 86)
//   Gruppe 6 – Widerstände (S. 84, 85, 88)
//   Gruppe 7 – Halbleiter und Sensoren (S. 88)
//   Gruppe 8 – Spannungs- und Stromquellen (S. 84, 85, 92)
//   Gruppe 9 – Anschlüsse: Reihenklemme, Stecker, Erdung, Masse, Schutzleiter (S. 84, 85)
//   Gruppe 10 – Passive Bauelemente und Leuchten (S. 84, 85)
//   Gruppe 11 – Messgeräte (S. 87, kWh-Zähler S. 84)
//
// Jedes Symbol (Kontakt wie festes) kann mehrpolig sein (bauteil.pole, FORMAT.md): dann
// wird es je Pol einen Strompfad weiter rechts wiederholt und durch die mechanische
// Verbindung (S. 84, gestrichelt) gekoppelt. Punkt, Abzweig und Kreuzung (S. 84) sind keine
// Bauteile – die zeichnet app.js aus dem Strompfad. Gruppe 12 (Binärelemente, SPS)
// kommt später.
//
// Jedes Symbol ist in lokalen Millimeter-Koordinaten um seinen Anschlusspunkt definiert.
// Ein Kontakt hat seinen Drehpunkt (wo eine Betätigung andockt) immer bei lokal
// (0, pivotY); eine Betätigung dockt dort mit ihrer gestrichelten Leitung an und hängt
// nach links heraus, wie im Buch. Kennzeichen sitzen auf der oberen Zuleitung.

const LEITWERK_SYMBOLE = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  function linie(x, y, x1, y1, x2, y2, klasse = "symbol-linie") {
    return el("line", { x1: x + x1, y1: y + y1, x2: x + x2, y2: y + y2, class: klasse });
  }

  function gestrichelt(x, y, x1, y1, x2, y2) {
    return linie(x, y, x1, y1, x2, y2, "symbol-linie symbol-gestrichelt");
  }

  function kreis(x, y, cx, cy, r, klasse = "symbol-linie") {
    return el("circle", { cx: x + cx, cy: y + cy, r, class: klasse });
  }

  function rechteck(x, y, rx, ry, breite, hoehe, klasse = "symbol-flaeche") {
    return el("rect", { x: x + rx, y: y + ry, width: breite, height: hoehe, class: klasse });
  }

  // d-Attribut in lokalen Koordinaten, um (x,y) verschoben, absolut ausgeschrieben (kein
  // SVG-<g transform>, damit die Zeichenfläche aus lauter einzelnen Elementen ohne
  // verschachtelte Transforms besteht, wie im Rest der App üblich).
  function pfad(x, y, punkte, klasse = "symbol-linie") {
    const d = punkte.map(([px, py], i) => `${i === 0 ? "M" : "L"}${x + px},${y + py}`).join(" ");
    return el("path", { d, class: klasse });
  }

  // Kleines Kästchen mit Buchstabe, wie „S" (selektiv) und „K" (kurzzeitverzögert) im Buch.
  function beschriftetesFeld(x, y, dx, dy, buchstabe) {
    const rahmen = rechteck(x, y, dx - 1.1, dy - 1.1, 2.2, 2.2);
    const beschriftung = el("text", { x: x + dx, y: y + dy, class: "symbol-buchstabe" });
    beschriftung.textContent = buchstabe;
    return [rahmen, beschriftung];
  }

  // ============================================================================
  // GRUPPE 1 – KONTAKTE (S. 85, auch 84/91)
  // ============================================================================
  // Grundform: obere Zuleitung, Drehpunkt bei (0,-kontaktAbstand), Kontaktfahne, fester
  // Kontakt bei (0,kontaktAbstand), untere Zuleitung. Öffner: Fahne berührt den festen
  // Kontakt (Knick, kein Spalt). Schließer: Fahne endet mit sichtbarem Spalt davor – die
  // beiden unterscheiden sich um genau diesen Spalt (siehe Prüfung der ersten Auflage).
  function kontaktfahne(x, y, geschlossen, leadEnde, kontaktAbstand) {
    const teile = [linie(x, y, 0, -leadEnde, 0, -kontaktAbstand)];
    teile.push(geschlossen
      ? pfad(x, y, [[0, -kontaktAbstand], [kontaktAbstand * 0.55, 0], [0, kontaktAbstand]])
      : pfad(x, y, [[0, -kontaktAbstand], [kontaktAbstand * 0.8, kontaktAbstand * 0.4]]));
    teile.push(linie(x, y, 0, kontaktAbstand, 0, leadEnde));
    return teile;
  }

  function einfacherKontakt(name, geschlossen, { leadEnde = 6, kontaktAbstand = 3 } = {}) {
    return {
      name, hoehe: leadEnde * 2, pivotY: -kontaktAbstand,
      anschluesse: { "1": { dx: 0, dy: -leadEnde }, "2": { dx: 0, dy: leadEnde } },
      zeichnen(x, y) { return kontaktfahne(x, y, geschlossen, leadEnde, kontaktAbstand); },
    };
  }

  // S. 85, oben links: „verlängerte Kontaktgabe" – dieselbe Fahne, nur mit größerem
  // Kontaktabstand gezeichnet (der Kontakt bleibt länger im Eingriff).
  const schliesser = einfacherKontakt("Schließer", false);
  const oeffner = einfacherKontakt("Öffner", true);
  const schliesserVerlaengert = einfacherKontakt("Schließer, verlängerte Kontaktgabe", false, { leadEnde: 8, kontaktAbstand: 5 });
  const oeffnerVerlaengert = einfacherKontakt("Öffner, verlängerte Kontaktgabe", true, { leadEnde: 8, kontaktAbstand: 5 });

  // Wechsler: Ruhekontakt (unten, berührend) wie der Öffner, plus ein isolierter
  // Arbeitskontakt seitlich mit eigener Stichleitung.
  function wechslerZeichnen(x, y, { leadEnde = 6, kontaktAbstand = 3, luecke = 1.2 } = {}) {
    const armX = kontaktAbstand * 0.55 + 1.5;
    return [
      ...kontaktfahne(x, y, true, leadEnde, kontaktAbstand),
      linie(x, y, armX, -luecke, armX, luecke),
      linie(x, y, armX, 0, armX + 1.6, 0),
    ];
  }
  function wechslerKontakt(name, opts = {}) {
    const leadEnde = opts.leadEnde ?? 6;
    const kontaktAbstand = opts.kontaktAbstand ?? 3;
    const armX = kontaktAbstand * 0.55 + 1.5 + 1.6;
    return {
      name, hoehe: leadEnde * 2, pivotY: -kontaktAbstand,
      anschluesse: {
        "1": { dx: 0, dy: -leadEnde }, "2": { dx: 0, dy: leadEnde }, "3": { dx: armX, dy: 0 },
      },
      zeichnen(x, y) { return wechslerZeichnen(x, y, opts); },
    };
  }
  const wechsler = wechslerKontakt("Wechsler");
  const wechslerVerlaengert = wechslerKontakt("Wechsler, verlängerte Kontaktgabe", { leadEnde: 8, kontaktAbstand: 5 });
  // S. 85: Wechsler ohne Unterbrechung – Arbeits- und Ruhekontakt liegen fast ohne
  // Zwischenraum, die Übergabe ist ohne Unterbrechung (make-before-break).
  const wechslerOhneUnterbrechung = wechslerKontakt("Wechsler ohne Unterbrechung", { luecke: 0.3 });

  // S. 85: Zweiweg-Schließer – gemeinsamer Drehpunkt (hohler Kreis), zwei Arbeitswege.
  const zweiwegSchliesser = {
    name: "Zweiweg-Schließer", hoehe: 12, pivotY: -2,
    anschluesse: { "1": { dx: 0, dy: -6 }, "2": { dx: -2.6, dy: 6 }, "3": { dx: 2.6, dy: 6 } },
    zeichnen(x, y) {
      return [
        linie(x, y, 0, -6, 0, -2),
        kreis(x, y, 0, -2, 0.7),
        pfad(x, y, [[0, -1.3], [-2.6, 2.5]]),
        pfad(x, y, [[0, -1.3], [2.6, 2.5]]),
        linie(x, y, -2.6, 2.5, -2.6, 6),
        linie(x, y, 2.6, 2.5, 2.6, 6),
      ];
    },
  };

  // S. 85: Zwillingsschließer/-öffner – zwei parallele Kontaktfahnen an gemeinsamer
  // unterer Zuleitung, gemeinsam betätigt.
  function zwillingKontakt(name, geschlossen) {
    const versatz = 2.6;
    return {
      name, hoehe: 12, pivotY: -3,
      anschluesse: {
        "1": { dx: -versatz, dy: -6 }, "2": { dx: versatz, dy: -6 }, "3": { dx: 0, dy: 6 },
      },
      zeichnen(x, y) {
        const teile = [];
        for (const dx of [-versatz, versatz]) {
          teile.push(linie(x + dx, y, 0, -6, 0, -3));
          teile.push(geschlossen
            ? pfad(x + dx, y, [[0, -3], [1.6, 0], [0, 3]])
            : pfad(x + dx, y, [[0, -3], [2.4, 1.2]]));
        }
        teile.push(linie(x, y, -versatz, 3, versatz, 3));
        teile.push(linie(x, y, 0, 3, 0, 6));
        return teile;
      },
    };
  }
  const zwillingsschliesser = zwillingKontakt("Zwillingsschließer", false);
  const zwillingsoeffner = zwillingKontakt("Zwillingsöffner", true);

  // S. 85: Einrastender Schließer/Öffner – kleine Raste-Kerbe auf der unteren Zuleitung.
  function mitZusatzmarke(basis, marke) {
    return {
      ...basis,
      zeichnen(x, y) { return [...basis.zeichnen(x, y), ...marke(x, y)]; },
    };
  }
  const rasteKerbe = (x, y) => [pfad(x, y, [[-0.8, 4], [0, 4.7], [0.8, 4]])];
  const einrastenderSchliesser = mitZusatzmarke(
    { ...schliesser, name: "Einrastender Schließer" }, rasteKerbe,
  );
  const einrastenderOeffner = mitZusatzmarke(
    { ...oeffner, name: "Einrastender Öffner" }, rasteKerbe,
  );

  // S. 85: Endschalter – kurzer Querstrich auf der unteren Zuleitung.
  const endschalterStrich = (x, y) => [linie(x, y, -0.7, 4.3, 0.7, 3.7)];
  const endschalterSchliesser = mitZusatzmarke(
    { ...schliesser, name: "Endschalter, Schließer" }, endschalterStrich,
  );
  const endschalterOeffner = mitZusatzmarke(
    { ...oeffner, name: "Endschalter, Öffner" }, endschalterStrich,
  );

  // S. 85: Wischer – kurzer Pfeil an der Kontaktfahne zeigt, wann Kontakt gegeben wird:
  // beim Anzug (Pfeil zur Fahne hin) oder beim Rückfall (Pfeil von ihr weg).
  const wischerAnzug = mitZusatzmarke(
    { ...schliesser, name: "Wischer bei Anzug" },
    (x, y) => [pfad(x, y, [[3.6, -2.2], [2.4, -0.6]]), pfad(x, y, [[2.7, -1.7], [2.4, -0.6], [3.5, -1.1]])],
  );
  const wischerRueckfall = mitZusatzmarke(
    { ...schliesser, name: "Wischer bei Rückfall" },
    (x, y) => [pfad(x, y, [[2.4, -0.6], [3.6, -2.2]]), pfad(x, y, [[2.5, -1.5], [3.6, -2.2], [3.3, -1.1]])],
  );

  // S. 85: verzögert schließender/öffnender Schließer – kleiner Bogen an der Kontaktfahne.
  const verzoegerungsBogen = (x, y) => [pfad(x, y, [[2.8, -0.6], [3.6, 0], [2.8, 0.6]])];
  const schliesserVerzoegert = mitZusatzmarke(
    { ...schliesser, name: "Schließer, schließt verzögert" }, verzoegerungsBogen,
  );
  const oeffnerVerzoegert = mitZusatzmarke(
    { ...oeffner, name: "Öffner, öffnet verzögert" }, verzoegerungsBogen,
  );

  // S. 85: Doppelschaltglieder – zwei Schließer nebeneinander, durch eine gestrichelte
  // Linie auf Höhe des Kontaktspalts verbunden: Schließer 1 schließt vor 2.
  const doppelschaltglied = {
    name: "Doppelschaltglied", hoehe: 12, pivotY: -3,
    anschluesse: { "1": { dx: -5, dy: 6 }, "2": { dx: 5, dy: 6 } },
    zeichnen(x, y) {
      return [
        ...kontaktfahne(x - 5, y, false, 6, 3),
        ...kontaktfahne(x + 5, y, false, 6, 3),
        gestrichelt(x, y, -3.8, -1.8, 3.8, -1.8),
      ];
    },
  };

  const KONTAKTE = {
    schliesser, oeffner, wechsler,
    "schliesser-verlaengert": schliesserVerlaengert,
    "oeffner-verlaengert": oeffnerVerlaengert,
    "wechsler-verlaengert": wechslerVerlaengert,
    "wechsler-ohne-unterbrechung": wechslerOhneUnterbrechung,
    "zweiweg-schliesser": zweiwegSchliesser,
    zwillingsschliesser, zwillingsoeffner,
    "einrastender-schliesser": einrastenderSchliesser,
    "einrastender-oeffner": einrastenderOeffner,
    doppelschaltglied,
    "endschalter-schliesser": endschalterSchliesser,
    "endschalter-oeffner": endschalterOeffner,
    "wischer-anzug": wischerAnzug,
    "wischer-rueckfall": wischerRueckfall,
    "schliesser-verzoegert": schliesserVerzoegert,
    "oeffner-verzoegert": oeffnerVerzoegert,
    // "Öffner als Ausschaltglied" (S. 85, Beispiele) ist derselbe Strich wie „oeffner" –
    // das Buch zeigt hier nur eine Anwendung desselben Zeichens, kein eigenes Symbol.
  };

  // ============================================================================
  // GRUPPE 2 – BETÄTIGUNGSARTEN / ANTRIEBE (S. 86)
  // ============================================================================
  // Jede Betätigung dockt mit ihrer gestrichelten Leitung am Drehpunkt (0,0) eines
  // Kontakts an und hängt nach links heraus, wie im Buch (dort: Anschluss ⊢ links,
  // Antriebszeichen, gestrichelte Leitung nach rechts zum Kontakt – hier gespiegelt,
  // weil die Kontakte in dieser Bibliothek von oben andocken).
  const STIEL_X = -5;
  const STIEL_OBEN = -1.8;
  const STIEL_UNTEN = 1.8;

  function antrieb(name, dekoration) {
    return {
      name,
      zeichnen(x, y) {
        return [gestrichelt(x, y, STIEL_X + 1, 0, 0, 0), ...dekoration(x, y)];
      },
    };
  }

  const handantriebAllgemein = antrieb("Handantrieb, allgemein", (x, y) => [
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X, STIEL_UNTEN),
  ]);
  const druecken = antrieb("durch Drücken", (x, y) => [
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X, STIEL_UNTEN),
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X + 0.9, STIEL_OBEN),
    linie(x, y, STIEL_X, 0, STIEL_X + 0.9, 0),
    linie(x, y, STIEL_X, STIEL_UNTEN, STIEL_X + 0.9, STIEL_UNTEN),
  ]);
  const ziehen = antrieb("durch Ziehen", (x, y) => [
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X, STIEL_UNTEN),
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X + 0.9, STIEL_OBEN),
    linie(x, y, STIEL_X, STIEL_UNTEN, STIEL_X + 0.9, STIEL_UNTEN),
  ]);
  const drehen = antrieb("durch Drehen", (x, y) => [
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X, STIEL_UNTEN),
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X + 0.9, STIEL_OBEN),
    pfad(x, y, [[STIEL_X, STIEL_UNTEN], [STIEL_X + 0.7, STIEL_UNTEN - 0.4]]),
  ]);
  const kippen = antrieb("durch Kippen", (x, y) => [
    linie(x, y, STIEL_X, STIEL_OBEN, STIEL_X, STIEL_UNTEN),
    linie(x, y, STIEL_X - 0.7, STIEL_OBEN, STIEL_X + 0.7, STIEL_OBEN),
  ]);
  const schluessel = antrieb("abnehmbar, z. B. Schlüssel", (x, y) => [
    kreis(x, y, STIEL_X, STIEL_OBEN - 0.1, 0.7),
    pfad(x, y, [[STIEL_X - 0.4, STIEL_OBEN + 0.6], [STIEL_X + 0.4, STIEL_OBEN + 0.6], [STIEL_X + 0.2, STIEL_UNTEN], [STIEL_X - 0.2, STIEL_UNTEN], [STIEL_X - 0.4, STIEL_OBEN + 0.6]]),
  ]);
  const pedal = antrieb("anderer Antrieb, z. B. Pedal", (x, y) => [
    pfad(x, y, [[STIEL_X - 0.7, 0.2], [STIEL_X, STIEL_UNTEN], [STIEL_X + 1, STIEL_OBEN]]),
  ]);
  const notAus = antrieb("Antrieb für NOT-AUS-Schalter", (x, y) => [
    pfad(x, y, [[STIEL_X + 0.6, STIEL_OBEN], [STIEL_X - 0.6, STIEL_OBEN], [STIEL_X - 0.6, 0]]),
    pfad(x, y, [[STIEL_X - 0.6, 0], [STIEL_X + 0.2, 0.5], [STIEL_X - 0.6, STIEL_UNTEN]]),
  ]);
  // S. 86/87: Raute mit Mittelstrich – dieselbe Form wie bei der Näherungsbetätigung, die
  // bereits gegen die Verwechslung mit dem Signalumformer (Quadrat mit Diagonale) geprüft
  // wurde. Hier zusätzlich die Berührungsbetätigung mit vorgesetztem Strich.
  function rauteMitStrich(x, y) {
    return [
      pfad(x, y, [[STIEL_X + 1, 0], [STIEL_X, -1.4], [STIEL_X - 1, 0], [STIEL_X, 1.4], [STIEL_X + 1, 0]], "symbol-flaeche"),
      linie(x, y, STIEL_X, -1.4, STIEL_X, 1.4),
    ];
  }
  const naeherung = antrieb("Näherungsbetätigung", rauteMitStrich);
  const beruehrung = antrieb("Berührungsbetätigung", (x, y) => [
    ...rauteMitStrich(x, y),
    linie(x, y, STIEL_X - 1.8, -1.4, STIEL_X - 1.8, 1.4),
  ]);

  // S. 86: elektromagnetischer Antrieb – Spulenkasten mit Zuleitungen, links eine
  // Kennzeichnung für die Verzögerung (Kreuzschraffur = Anzug, Vollton = Abfall).
  function spulenkasten(x, y) {
    return [
      linie(x, y, STIEL_X - 1.5, 0, STIEL_X - 3.5, 0),
      rechteck(x, y, STIEL_X - 6.5, -2, 3, 4, "symbol-linie"),
      linie(x, y, STIEL_X - 5, -2, STIEL_X - 5, -3.2),
      linie(x, y, STIEL_X - 5, 2, STIEL_X - 5, 3.2),
    ];
  }
  const elektromagnetischAnzugsverzoegerung = antrieb("elektromagnetischer Antrieb mit Anzugsverzögerung", (x, y) => [
    ...spulenkasten(x, y),
    pfad(x, y, [[STIEL_X - 6.2, -1.5], [STIEL_X - 4.7, 1.5]]),
    pfad(x, y, [[STIEL_X - 4.7, -1.5], [STIEL_X - 6.2, 1.5]]),
  ]);
  const elektromagnetischAbfallverzoegerung = antrieb("elektromagnetischer Antrieb mit Abfallverzögerung", (x, y) => [
    ...spulenkasten(x, y),
    rechteck(x, y, STIEL_X - 6.5, -2, 1.5, 4, "symbol-fuellung"),
  ]);
  const stromstossrelais = antrieb("Antrieb für Stromstoßrelais", (x, y) => [
    ...spulenkasten(x, y),
    pfad(x, y, [[STIEL_X - 5.8, -1], [STIEL_X - 5.8, 0], [STIEL_X - 5.1, 0], [STIEL_X - 5.1, 1]]),
  ]);

  // S. 86: thermische Betätigung – Bimetall-Haken (Z-Knick).
  const thermischerHaken = (x, y) => [
    pfad(x, y, [[STIEL_X, STIEL_OBEN], [STIEL_X, -0.3], [STIEL_X + 1, -0.3], [STIEL_X + 1, STIEL_UNTEN]]),
  ];
  const thermisch = antrieb("thermische Betätigung, z. B. Motorschutzrelais", thermischerHaken);
  const thermischDrehstrom = antrieb("thermische Betätigung bei Drehstromgerät", (x, y) => [
    linie(x, y, STIEL_X - 1.5, 0, STIEL_X - 3.5, 0),
    rechteck(x, y, STIEL_X - 6.5, -2, 3, 4, "symbol-linie"),
    linie(x, y, STIEL_X - 6, -2, STIEL_X - 6, -3.2),
    linie(x, y, STIEL_X - 5, -2, STIEL_X - 5, -3.2),
    linie(x, y, STIEL_X - 4, -2, STIEL_X - 4, -3.2),
    linie(x, y, STIEL_X - 6, 2, STIEL_X - 6, 3.2),
    linie(x, y, STIEL_X - 5, 2, STIEL_X - 5, 3.2),
    linie(x, y, STIEL_X - 4, 2, STIEL_X - 4, 3.2),
    pfad(x, y, [[STIEL_X - 5.7, -0.9], [STIEL_X - 5.7, 0], [STIEL_X - 4.9, 0], [STIEL_X - 4.9, 0.9]]),
  ]);
  const elektromagnetischUeberstromschutz = antrieb("elektromagnetische Betätigung für Überstromschutz (nicht allgemein verbreitet)", (x, y) => [
    pfad(x, y, [[STIEL_X + 0.6, STIEL_OBEN], [STIEL_X - 0.6, STIEL_OBEN + 0.4], [STIEL_X - 0.6, STIEL_UNTEN - 0.4], [STIEL_X + 0.6, STIEL_UNTEN]]),
  ]);

  const BETAETIGUNGEN = {
    "handantrieb-allgemein": handantriebAllgemein,
    druecken, ziehen, drehen, kippen, schluessel, pedal,
    "not-aus": notAus,
    naeherung, beruehrung,
    "elektromagnetisch-anzugsverzoegerung": elektromagnetischAnzugsverzoegerung,
    "elektromagnetisch-abfallverzoegerung": elektromagnetischAbfallverzoegerung,
    stromstossrelais, thermisch,
    "thermisch-drehstrom": thermischDrehstrom,
    "elektromagnetisch-ueberstromschutz": elektromagnetischUeberstromschutz,
  };

  // ============================================================================
  // GRUPPE 3 – KENNZEICHEN AN KONTAKT UND ANTRIEB (S. 85)
  // ============================================================================
  // Sitzen als kleine Marke auf der oberen Zuleitung eines Kontakts, mittig bei (0,0).
  function kennzeichenGlied(name, dekoration) {
    return { name, zeichnen(x, y) { return dekoration(x, y); } };
  }

  const selbsttaetigerRueckgang = kennzeichenGlied("selbsttätiger Rückgang", (x, y) => [
    linie(x, y, -2, 0, 2, 0),
    pfad(x, y, [[0.7, -0.9], [0.7, 0.9], [-0.6, 0], [0.7, -0.9]]),
  ]);
  const nichtSelbsttaetigerRueckgang = kennzeichenGlied("nicht selbsttätiger Rückgang", (x, y) => [
    linie(x, y, -2, 0, -0.5, 0),
    pfad(x, y, [[-0.5, 0], [0, 0.8], [0.5, 0]]),
    linie(x, y, 0.5, 0, 2, 0),
  ]);
  function verzoegerungspfeil(gespiegelt) {
    const r = gespiegelt ? -1 : 1;
    return (x, y) => [
      pfad(x, y, [[r * -1.6, -0.7], [r * 0.4, 0]]),
      pfad(x, y, [[r * -1.6, 0.7], [r * 0.4, 0]]),
      gestrichelt(x, y, r * 0.4, 0, r * 2.2, 0),
    ];
  }
  const verzoegerungLinks = kennzeichenGlied("Verzögerung nach links", verzoegerungspfeil(false));
  const verzoegerungRechts = kennzeichenGlied("Verzögerung nach rechts", verzoegerungspfeil(true));
  const mechanischeVerriegelung = kennzeichenGlied("mechanische Verriegelung", (x, y) => [
    linie(x, y, -2, 0, -0.6, 0),
    pfad(x, y, [[-0.6, -0.7], [0.6, -0.7], [0, 0.7], [-0.6, -0.7]]),
    linie(x, y, 0.6, 0, 2, 0),
  ]);
  const schuetzfunktion = kennzeichenGlied("Schützfunktion", (x, y) => [
    pfad(x, y, [[0, -0.9], [-0.8, 0], [0, 0.9], [0, -0.9]], "symbol-fuellung"),
  ]);
  const ausloeserfunktion = kennzeichenGlied("Auslöserfunktion", (x, y) => [
    rechteck(x, y, -0.5, -0.5, 1, 1, "symbol-fuellung"),
  ]);
  const betaetigt = kennzeichenGlied('Kennzeichen für „betätigt"', (x, y) => [
    linie(x, y, -0.3, 1.6, -0.3, -0.9),
    linie(x, y, 0.3, 1.6, 0.3, -0.9),
    pfad(x, y, [[-0.7, -0.5], [0, -1.6], [0.7, -0.5]]),
  ]);
  const zwangsgefuehrt = kennzeichenGlied("zwangsgeführte Betätigung, z. B. NOT-AUS", (x, y) => [
    kreis(x, y, 0, 0, 1.3),
    pfad(x, y, [[-0.7, 0], [0.7, 0]]),
    pfad(x, y, [[0.1, -0.5], [0.7, 0], [0.1, 0.5]]),
  ]);
  const selektivVerzoegert = kennzeichenGlied("selektiv (verzögert)", (x, y) => beschriftetesFeld(x, y, 0, 0, "S"));
  const kurzzeitverzoegert = kennzeichenGlied("kurzzeitverzögert", (x, y) => beschriftetesFeld(x, y, 0, 0, "K"));

  const KENNZEICHEN = {
    "selbsttaetiger-rueckgang": selbsttaetigerRueckgang,
    "nicht-selbsttaetiger-rueckgang": nichtSelbsttaetigerRueckgang,
    "verzoegerung-links": verzoegerungLinks,
    "verzoegerung-rechts": verzoegerungRechts,
    "mechanische-verriegelung": mechanischeVerriegelung,
    schuetzfunktion, ausloeserfunktion, betaetigt, zwangsgefuehrt,
    "selektiv-verzoegert": selektivVerzoegert,
    kurzzeitverzoegert,
  };

  // ============================================================================
  // FESTE SYMBOLE (bauteil.typ) – Gruppen 4, 5, 6 und 8
  // ============================================================================
  // Anders als die Kontakte oben zeigt das Buch diese Zeichen als ein fertiges Ganzes.
  // Alle stehen senkrecht im Strompfad (das Buch zeichnet sie meist waagerecht – hier um
  // 90° gedreht, wie ein Kontakt): Anschluss "1" oben, "2" unten, soweit nicht anders
  // angegeben. Felder je Symbol:
  //   hoehe, anschluesse, zeichnen(x, y) – wie bei den Kontakten
  //   pivotY      – Drehpunkt der Schaltfahne, an dem ein Antrieb andockt
  //   antrieb     – optional, einmal links an Pol 1 gezeichnet (z. B. Motorschutzschalter)
  //   kette       – welche Anschlüsse das obere/untere Ende in der Strompfad-Kette sind
  //                 (Standard "1"/"2", siehe FORMAT.md)
  //   schaltend   – schaltet es? Dann darf es nie an PE (FORMAT.md „Sammelschiene")
  //   kopplung    – Punkt auf der Schaltfahne, durch den die mechanische Kopplung eines
  //                 mehrpoligen Geräts läuft; fehlt sie, gibt es keine (drei Sicherungen
  //                 nebeneinander sind drei Sicherungen, nicht gekoppelt)
  //   standardPole, bmk – Vorschlag beim Platzieren aus der Palette

  const LEITUNG_OBEN = (x, y) => linie(x, y, 0, -6, 0, -3);
  const LEITUNG_UNTEN = (x, y) => linie(x, y, 0, 3, 0, 6);
  const ZWEI_ANSCHLUESSE = { "1": { dx: 0, dy: -6 }, "2": { dx: 0, dy: 6 } };
  const FAHNEN_MITTE = { dx: 1.2, dy: -0.9 }; // Mitte der offenen Schaltfahne von kontaktfahne()

  // Gefüllte Pfeilspitze an (px,py), in Richtung von (vx,vy) nach (px,py).
  function pfeilspitze(x, y, vx, vy, px, py, groesse = 1) {
    const l = Math.hypot(px - vx, py - vy);
    const ux = (px - vx) / l, uy = (py - vy) / l;
    const bx = px - ux * groesse, by = py - uy * groesse;
    return pfad(x, y, [[px, py], [bx - uy * groesse * 0.4, by + ux * groesse * 0.4],
      [bx + uy * groesse * 0.4, by - ux * groesse * 0.4], [px, py]], "symbol-fuellung");
  }
  function pfeil(x, y, vx, vy, px, py, groesse = 1) {
    return [linie(x, y, vx, vy, px, py), pfeilspitze(x, y, vx, vy, px, py, groesse)];
  }
  function beschriftung(x, y, dx, dy, inhalt, klasse = "symbol-buchstabe") {
    const e = el("text", { x: x + dx, y: y + dy, class: klasse });
    e.textContent = inhalt;
    return e;
  }

  // ---- Gruppe 4: Schalter und Schutzorgane (S. 86, Motorschutzschalter S. 93) ----------
  // Grundlage ist die offene Schaltfahne des Schließers; das Buch unterscheidet die
  // Schaltgeräte allein am Zeichen auf dem festen Kontakt (hier bei lokal (0, 3)).
  function schaltgeraet(name, marke, weiteres = {}) {
    return {
      name, gruppe: 4, hoehe: 12, pivotY: -3, anschluesse: ZWEI_ANSCHLUESSE,
      schaltend: true, kopplung: FAHNEN_MITTE, standardPole: 1, bmk: "Q",
      zeichnen(x, y) { return [...kontaktfahne(x, y, false, 6, 3), ...marke(x, y)]; },
      ...weiteres,
    };
  }
  // S. 86 a): Trennschalter/Leerschalter – Querbalken auf dem festen Kontakt.
  const querbalken = (x, y) => [linie(x, y, -0.9, 3, 0.9, 3)];
  // S. 86: Leistungsschalter – Kreuz auf dem festen Kontakt.
  const kreuz = (x, y) => [linie(x, y, -0.7, 2.3, 0.7, 3.7), linie(x, y, -0.7, 3.7, 0.7, 2.3)];
  // S. 86 b): Lasttrennschalter – Querbalken und kleiner Kreis davor.
  const balkenUndKreis = (x, y) => [...querbalken(x, y), kreis(x, y, 0, 2.45, 0.55)];
  // S. 86: Leistungskontakt eines Schützes – Halbkreis am festen Kontakt (Schützfunktion).
  const schuetzBogen = (x, y) => [el("path", {
    d: `M${x},${y + 3} A0.7,0.7 0 0 1 ${x},${y + 4.4}`, class: "symbol-linie",
  })];
  // S. 86: Lastschalter mit selbsttätiger Auslösung – Kreis am festen Kontakt, gefülltes
  // Kästchen (Auslöserfunktion) an der Schaltfahne.
  const selbsttaetigeAusloesung = (x, y) => [
    kreis(x, y, 0, 2.45, 0.55),
    rechteck(x, y, -0.9, -2.2, 1.1, 1.5, "symbol-fuellung"),
  ];
  // Motorschutz-/Leitungsschutzschalter: Leistungsschalter-Pole, links an Pol 1 die
  // thermische (Bimetall) und die elektromagnetische Überstromauslösung (S. 86), beide
  // über die gestrichelte Wirkungslinie an der Schaltfahne.
  const schutzschalterAntrieb = (x, pivotY) => [
    ...BETAETIGUNGEN.thermisch.zeichnen(x, pivotY),
    ...BETAETIGUNGEN["elektromagnetisch-ueberstromschutz"].zeichnen(x - 4.5, pivotY),
  ];

  // S. 93 (Installationsschaltpläne): RCD, Fehlerstrom-Schutzschalter. Das Buch zeichnet ihn
  // wie den Leitungsschutzschalter der Seite – Auslösepfeil vom Schaltglied nach links, Spitze
  // außen –, dazu links davor das Zeichen des Fehlerstromauslösers (⊣). Dort einpolig mit
  // Polzahl-Strich „4“; hier wie jedes Gerät allpolig, deshalb ohne diesen Strich.
  const fehlerstromAntrieb = (x, pivotY) => [
    ...pfeil(x, pivotY, 0, 0, -4, 0, 0.9),
    linie(x, pivotY, -5, -1, -5, 1),
    linie(x, pivotY, -6.6, 0, -5, 0),
  ];

  // Öffner-Fahne (geschlossen) mit Bimetall-Haken, S. 86 a) Thermokontakt.
  const thermokontakt = {
    name: "Thermokontakt mit Bimetall", gruppe: 4, hoehe: 12, pivotY: -3,
    anschluesse: ZWEI_ANSCHLUESSE, schaltend: true, kopplung: { dx: 0.8, dy: -1.5 },
    standardPole: 1, bmk: "B",
    zeichnen(x, y) {
      return [
        ...kontaktfahne(x, y, true, 6, 3),
        pfad(x, y, [[-3.6, 1.2], [-3.6, 0], [-2.2, 0], [-2.2, -1.2]]),
        linie(x, y, -2.2, -0.6, 0.66, -1.8),
      ];
    },
  };
  // S. 86 b) Öffner des Motorschutzrelais: Öffner, thermisch betätigt (gestrichelt).
  const motorschutzrelaisOeffner = {
    name: "Öffner des Motorschutzrelais", gruppe: 4, hoehe: 12, pivotY: -3,
    anschluesse: ZWEI_ANSCHLUESSE, schaltend: true, kopplung: { dx: 0.8, dy: -1.5 },
    standardPole: 1, bmk: "F", namen: { "1": "95", "2": "96" }, // S. 83: -F3 95/96
    zeichnen(x, y) { return kontaktfahne(x, y, true, 6, 3); },
    antrieb(x, pivotY) { return BETAETIGUNGEN.thermisch.zeichnen(x, pivotY); },
  };
  // S. 86: gasgefüllter Starter für Leuchtstofflampe mit Thermokontakt – Kreis, darin
  // Bimetall-Kontakt und der Punkt für Gasfüllung (S. 84).
  const starter = {
    name: "Starter für Leuchtstofflampe", gruppe: 4, hoehe: 12, pivotY: 0,
    anschluesse: ZWEI_ANSCHLUESSE, schaltend: true, standardPole: 1, bmk: "E",
    zeichnen(x, y) {
      return [
        linie(x, y, 0, -6, 0, -4), linie(x, y, 0, 4, 0, 6),
        kreis(x, y, 0, 0, 4),
        pfad(x, y, [[0, -4], [0, -2], [-1.3, -2], [-1.3, -0.6], [0, -0.6]]),
        pfad(x, y, [[0, 4], [0, 1.4], [1.4, 0.2]]),
        kreis(x, y, 1.6, 1.8, 0.4, "symbol-fuellung"),
      ];
    },
  };

  // ---- Gruppe 5: Sicherungen (S. 84, 86) -----------------------------------------------
  // Sicherung: Kästchen, durch das die Leitung durchläuft – das unterscheidet sie vom
  // Widerstand (Kästchen ohne durchlaufende Linie), siehe Wiki „Was die erste Auflage
  // gelehrt hat".
  function sicherungZeichnen(x, y, netz) {
    const teile = [rechteck(x, y, -1.2, -3, 2.4, 6)];
    if (netz) teile.push(rechteck(x, y, -1.2, -3, 2.4, 1.6, "symbol-fuellung"));
    teile.push(linie(x, y, 0, -6, 0, 6));
    return teile;
  }
  const sicherung = {
    name: "Sicherung, allgemein", gruppe: 5, hoehe: 12, pivotY: 0,
    anschluesse: ZWEI_ANSCHLUESSE, schaltend: true, standardPole: 1, bmk: "F", schutz: true,
    zeichnen(x, y) { return sicherungZeichnen(x, y, false); },
  };
  // S. 86: mit Kennzeichnung des Netzanschlusses – die gefüllte Seite zeigt zum Netz
  // (hier oben, Anschluss "1").
  const sicherungNetz = {
    ...sicherung, name: "Sicherung, Netzseite gekennzeichnet",
    zeichnen(x, y) { return sicherungZeichnen(x, y, true); },
  };
  // S. 86: Sicherungstrennschalter – Sicherung auf der Schaltfahne, Querbalken des
  // Trennschalters auf dem festen Kontakt.
  const sicherungstrennschalter = {
    name: "Sicherungstrennschalter", gruppe: 5, hoehe: 12, pivotY: -3,
    anschluesse: ZWEI_ANSCHLUESSE, schaltend: true, kopplung: { dx: 1.2, dy: -0.6 },
    standardPole: 3, bmk: "F", schutz: true,
    zeichnen(x, y) {
      const [ax, ay, bx, by] = [0, -3, 2.4, 1.8];
      const l = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / l, uy = (by - ay) / l, nx = -uy * 0.9, ny = ux * 0.9;
      const p = (t) => [ax + ux * l * t, ay + uy * l * t];
      const [p1, p2] = [p(0.15), p(0.85)];
      return [
        LEITUNG_OBEN(x, y), LEITUNG_UNTEN(x, y), ...querbalken(x, y),
        pfad(x, y, [[p1[0] + nx, p1[1] + ny], [p2[0] + nx, p2[1] + ny],
          [p2[0] - nx, p2[1] - ny], [p1[0] - nx, p1[1] - ny], [p1[0] + nx, p1[1] + ny]], "symbol-flaeche"),
        linie(x, y, ax, ay, bx, by),
      ];
    },
  };

  // ---- Gruppe 6: Widerstände (S. 84, 85, 88) -------------------------------------------
  const widerstandsKoerper = (x, y, breite = 2.4) => [
    LEITUNG_OBEN(x, y), LEITUNG_UNTEN(x, y), rechteck(x, y, -breite / 2, -3, breite, 6),
  ];
  function widerstandsSymbol(name, zusatz, weiteres = {}) {
    return {
      name, gruppe: 6, hoehe: 12, pivotY: 0, anschluesse: ZWEI_ANSCHLUESSE,
      schaltend: false, standardPole: 1, bmk: "R",
      zeichnen(x, y) { return [...widerstandsKoerper(x, y), ...zusatz(x, y)]; },
      ...weiteres,
    };
  }
  const diagonale = (x, y) => linie(x, y, -2.6, 3.4, 2.6, -3.4);
  // S. 85 „desgleichen, nicht linear": Schräge mit waagerechtem Fuß.
  const nichtlinear = (x, y) => pfad(x, y, [[-3.4, 3.6], [-2.2, 3.6], [2.6, -3.4]]);
  // Kleine senkrechte Pfeile neben PTC/NTC (S. 85): ↑↑ bzw. ↑↓.
  const temperaturPfeile = (gegensinnig) => (x, y) => [
    ...pfeil(x, y, 3.4, -0.6, 3.4, -3.4, 0.8),
    ...(gegensinnig ? pfeil(x, y, 4.5, -3.4, 4.5, -0.6, 0.8) : pfeil(x, y, 4.5, -0.6, 4.5, -3.4, 0.8)),
  ];

  const widerstand = widerstandsSymbol("Widerstand, allgemein", () => []);
  // S. 85 Beispiele: veränderbar – Pfeil schräg durch; einstellbar – Schräge mit Querstrich.
  const widerstandVeraenderbar = widerstandsSymbol("Widerstand, veränderbar", (x, y) => pfeil(x, y, -2.6, 3.4, 2.6, -3.4));
  const widerstandEinstellbar = widerstandsSymbol("Widerstand, einstellbar als Spannungsteiler", (x, y) => [
    diagonale(x, y), linie(x, y, 1.9, -3.9, 3.3, -2.9), linie(x, y, -2.6, 3.4, -4.5, 3.4),
  ], { anschluesse: { ...ZWEI_ANSCHLUESSE, "3": { dx: -4.5, dy: 3.4 } } });
  // S. 85: Potenziometer (Widerstand mit beweglichem Kontakt), Form 1: Pfeil schräg durch,
  // Schleifer am Pfeilfuß; Form 2: Schleifer als Pfeil seitlich auf den Körper.
  const potenziometer1 = widerstandsSymbol("Potenziometer, Form 1", (x, y) => [
    ...pfeil(x, y, -2.6, 3.4, 2.6, -3.4), linie(x, y, -2.6, 3.4, -4.5, 3.4),
  ], { anschluesse: { ...ZWEI_ANSCHLUESSE, "3": { dx: -4.5, dy: 3.4 } } });
  const potenziometer2 = widerstandsSymbol("Potenziometer, Form 2", (x, y) => pfeil(x, y, 4.5, 0, 1.2, 0),
    { anschluesse: { ...ZWEI_ANSCHLUESSE, "3": { dx: 4.5, dy: 0 } } });
  const ptc = widerstandsSymbol("PTC-Widerstand", (x, y) => [
    nichtlinear(x, y), beschriftung(x, y, -3.4, 5, "ϑ"), ...temperaturPfeile(false)(x, y),
  ]);
  const ntc = widerstandsSymbol("NTC-Widerstand", (x, y) => [
    nichtlinear(x, y), beschriftung(x, y, -3.4, 5, "ϑ"), ...temperaturPfeile(true)(x, y),
  ]);
  const vdr = widerstandsSymbol("VDR-Widerstand", (x, y) => [nichtlinear(x, y), beschriftung(x, y, -3.4, 5, "U")]);
  // S. 88: Fotowiderstand – zwei Pfeile auf den Körper zu (Licht fällt ein).
  const fotowiderstand = widerstandsSymbol("Fotowiderstand", (x, y) => [
    ...pfeil(x, y, -4.8, -4, -1.8, -1.6, 0.8), ...pfeil(x, y, -4.8, -1.8, -1.8, 0.6, 0.8),
  ]);
  // S. 88: Feldplatte (flussdichteabhängiger Widerstand) – Schräge mit × am Fuß.
  const feldplatte = widerstandsSymbol("Feldplatte", (x, y) => [
    diagonale(x, y), linie(x, y, -3.4, 3.8, -2.4, 4.8), linie(x, y, -3.4, 4.8, -2.4, 3.8),
  ]);
  // S. 88: Hallgenerator – × im Körper, zwei weitere Anschlüsse seitlich.
  const hallgenerator = {
    name: "Hallgenerator", gruppe: 6, hoehe: 12, pivotY: 0, schaltend: false,
    standardPole: 1, bmk: "B",
    anschluesse: { ...ZWEI_ANSCHLUESSE, "3": { dx: -4, dy: 0 }, "4": { dx: 4, dy: 0 } },
    zeichnen(x, y) {
      return [
        ...widerstandsKoerper(x, y, 3.2),
        linie(x, y, -4, 0, -1.6, 0), linie(x, y, 1.6, 0, 4, 0),
        linie(x, y, -0.7, -0.7, 0.7, 0.7), linie(x, y, -0.7, 0.7, 0.7, -0.7),
      ];
    },
  };
  // S. 88: Peltier-Element – schraffierter Körper.
  const peltier = widerstandsSymbol("Peltier-Element", (x, y) =>
    [-1.8, -0.6, 0.6, 1.8].map((k) => linie(x, y, -1.2, k + 0.8, 1.2, k - 0.8)),
  { bmk: "E" });

  // ---- Gruppe 7: Halbleiter und Sensoren (S. 88) -----------------------------------------
  // Senkrecht im Strompfad, Stromrichtung von oben nach unten: Anode oben, Kathode unten.
  // Anschlüsse heißen wie im Buch (A/K, C/B/E, G) statt 1/2 – `kette` sagt, welche davon
  // in der Strompfad-Kette oben und unten liegen. Diodendreiecke sind ausgefüllt.
  const DIODEN_ANSCHLUESSE = { A: { dx: 0, dy: -6 }, K: { dx: 0, dy: 6 } };
  const DIODEN_KETTE = { oben: "A", unten: "K" };
  // Gefülltes Dreieck mit Spitze nach unten (Durchlassrichtung) und Kathodenstrich.
  const diodenKoerper = (x, y) => [
    linie(x, y, 0, -6, 0, -1.5),
    pfad(x, y, [[-1.8, -1.5], [1.8, -1.5], [0, 1.5], [-1.8, -1.5]], "symbol-fuellung"),
    linie(x, y, -1.8, 1.5, 1.8, 1.5),
    linie(x, y, 0, 1.5, 0, 6),
  ];
  // Die beiden Lichtpfeile rechts neben dem Dreieck. LED und Fotodiode benutzen DIESELBEN
  // Linien – der einzige Unterschied ist die Richtung: LED abgehend (Spitze außen),
  // Fotodiode hinzeigend (Spitze am Bauelement). S. 88 a)/b).
  const LICHT_PFEILE = [[1.7, -0.6, 3.9, -2.8], [2.6, 0.5, 4.8, -1.7]];
  const lichtAbgehend = (x, y) => LICHT_PFEILE.flatMap(([x1, y1, x2, y2]) => pfeil(x, y, x1, y1, x2, y2, 0.8));
  const lichtHinzeigend = (x, y) => LICHT_PFEILE.flatMap(([x1, y1, x2, y2]) => pfeil(x, y, x2, y2, x1, y1, 0.8));
  // S. 88 Kennzeichen „Strahlung b) ionisierend": geschlängelter Pfeil zum Bauelement.
  const strahlungHinzeigend = (x, y) => [[4.3, -3.4], [5.2, -2.3]].flatMap(([sx, sy]) => [
    pfad(x, y, [[sx, sy], [sx - 0.2, sy + 0.7], [sx - 0.9, sy + 0.8], [sx - 1.1, sy + 1.5], [sx - 1.8, sy + 1.6]]),
    pfeilspitze(x, y, sx - 1.1, sy + 1.2, sx - 2.4, sy + 2.3, 0.8),
  ]);

  function halbleiter(name, zeichnen, weiteres = {}) {
    return {
      name, gruppe: 7, hoehe: 12, pivotY: 0, anschluesse: DIODEN_ANSCHLUESSE, kette: DIODEN_KETTE,
      schaltend: false, standardPole: 1, bmk: "R", zeichnen, ...weiteres,
    };
  }
  const diode = halbleiter("Halbleiterdiode", diodenKoerper);
  // Z-Diode: Kathodenstrich mit kurzem Schenkel an einem Ende.
  const zDiode = halbleiter("Z-Diode", (x, y) => [...diodenKoerper(x, y), linie(x, y, 1.8, 1.5, 1.8, 0.7)]);
  const led = halbleiter("Leuchtdiode (LED)", (x, y) => [...diodenKoerper(x, y), ...lichtAbgehend(x, y)], { bmk: "P" });
  const fotodiode = halbleiter("Fotodiode", (x, y) => [...diodenKoerper(x, y), ...lichtHinzeigend(x, y)], { bmk: "B" });
  const strahlungsdetektor = halbleiter("Strahlungsdetektor", (x, y) => [
    ...diodenKoerper(x, y), ...strahlungHinzeigend(x, y), beschriftung(x, y, 5.6, -4.4, "γ"),
  ], { bmk: "B" });
  // Fotoelement: Zelle wie das galvanische Element (langer Strich +), Licht hinzeigend.
  const fotoelement = {
    name: "Fotoelement", gruppe: 7, hoehe: 12, pivotY: 0, anschluesse: ZWEI_ANSCHLUESSE,
    schaltend: false, standardPole: 1, bmk: "B",
    zeichnen(x, y) {
      return [linie(x, y, 0, -6, 0, -0.8), ...zelle(x, y, -0.8), linie(x, y, 0, 0.75, 0, 6), ...lichtHinzeigend(x, y)];
    },
  };

  // Transistor: Kollektor oben, Emitter unten auf der Pfadachse, Basisstrich links, Basis
  // als seitlicher Anschluss B. NPN: Pfeil am Emitter zeigt weg von der Basis, PNP: hin.
  const TRANSISTOR_ANSCHLUESSE = { C: { dx: 0, dy: -6 }, E: { dx: 0, dy: 6 }, B: { dx: -6, dy: 0 } };
  function transistorKoerper(x, y, npn, mitBasis) {
    const teile = [
      linie(x, y, -2.5, -2.2, -2.5, 2.2),
      pfad(x, y, [[-2.5, -1], [0, -3], [0, -6]]),
      pfad(x, y, [[-2.5, 1], [0, 3], [0, 6]]),
      npn ? pfeilspitze(x, y, -2.5, 1, -0.3, 2.76, 0.9) : pfeilspitze(x, y, 0, 3, -2.2, 1.24, 0.9),
    ];
    if (mitBasis) teile.push(linie(x, y, -6, 0, -2.5, 0));
    return teile;
  }
  function transistor(name, npn, mitBasis, zusatz = () => []) {
    return {
      name, gruppe: 7, hoehe: 12, pivotY: 0,
      anschluesse: mitBasis ? TRANSISTOR_ANSCHLUESSE : { C: TRANSISTOR_ANSCHLUESSE.C, E: TRANSISTOR_ANSCHLUESSE.E },
      kette: { oben: "C", unten: "E" }, schaltend: false, standardPole: 1, bmk: "K",
      zeichnen(x, y) { return [...transistorKoerper(x, y, npn, mitBasis), ...zusatz(x, y)]; },
    };
  }
  const transistorNpn = transistor("NPN-Transistor", true, true);
  const transistorPnp = transistor("PNP-Transistor", false, true);
  // S. 88 zeigt den Fototransistor als PNP ohne Basisanschluss; Licht fällt auf die Basis.
  const fototransistor = transistor("PNP-Fototransistor", false, false, (x, y) =>
    [[-6.2, -3.6, -3.2, -1.2], [-6.2, -1.6, -3.2, 0.8]].flatMap(([x1, y1, x2, y2]) => pfeil(x, y, x1, y1, x2, y2, 0.8)));
  fototransistor.bmk = "B";

  // S. 88: Optokoppler, hier mit LED und Fototransistor – LED links auf der Pfadachse (in
  // der Kette), Fototransistor rechts daneben mit eigenen Anschlüssen C/E, Licht dazwischen
  // als Pfeile von der LED zum Transistor, alles in einem Rahmen.
  const optokoppler = {
    name: "Optokoppler", gruppe: 7, hoehe: 16, pivotY: 0, schaltend: false, standardPole: 1, bmk: "K",
    anschluesse: { A: { dx: 0, dy: -8 }, K: { dx: 0, dy: 8 }, C: { dx: 8, dy: -8 }, E: { dx: 8, dy: 8 } },
    kette: DIODEN_KETTE,
    zeichnen(x, y) {
      return [
        rechteck(x, y, -3, -5, 13, 10, "symbol-linie"),
        linie(x, y, 0, -8, 0, -1.5),
        pfad(x, y, [[-1.5, -1.5], [1.5, -1.5], [0, 1], [-1.5, -1.5]], "symbol-fuellung"),
        linie(x, y, -1.5, 1, 1.5, 1), linie(x, y, 0, 1, 0, 8),
        ...pfeil(x, y, 2, -0.9, 4.3, -0.9, 0.7), ...pfeil(x, y, 2, 0.5, 4.3, 0.5, 0.7),
        linie(x, y, 5.5, -2, 5.5, 2),
        pfad(x, y, [[5.5, -0.9], [8, -2.6], [8, -8]]),
        pfad(x, y, [[5.5, 0.9], [8, 2.6], [8, 8]]),
        pfeilspitze(x, y, 5.5, 0.9, 7.6, 2.33, 0.8),
      ];
    },
  };

  // Thyristor: Diode mit Steueranschluss G. P-Gate (häufigster Typ, S. 88): G an der
  // Kathodenseite; N-Gate: G an der Anodenseite.
  const thyristorP = halbleiter("P-Gate-Thyristor", (x, y) => [
    ...diodenKoerper(x, y), pfad(x, y, [[0.9, 1.5], [2.6, 3.2], [4.5, 3.2]]),
  ], { anschluesse: { ...DIODEN_ANSCHLUESSE, G: { dx: 4.5, dy: 3.2 } }, bmk: "Q" });
  const thyristorN = halbleiter("N-Gate-Thyristor", (x, y) => [
    ...diodenKoerper(x, y), pfad(x, y, [[0.9, -1.5], [2.6, -3.2], [4.5, -3.2]]),
  ], { anschluesse: { ...DIODEN_ANSCHLUESSE, G: { dx: 4.5, dy: -3.2 } }, bmk: "Q" });

  // Diac/Triac: zwei gegensinnige gefüllte Dreiecke zwischen zwei Strichen; der Triac
  // hat zusätzlich den Steueranschluss G.
  const gegensinnig = (x, y) => [
    linie(x, y, 0, -6, 0, -1.5), linie(x, y, 0, 1.5, 0, 6),
    linie(x, y, -2.6, -1.5, 2.6, -1.5), linie(x, y, -2.6, 1.5, 2.6, 1.5),
    pfad(x, y, [[-2.5, -1.5], [-0.1, -1.5], [-1.3, 1.5], [-2.5, -1.5]], "symbol-fuellung"),
    pfad(x, y, [[0.1, 1.5], [2.5, 1.5], [1.3, -1.5], [0.1, 1.5]], "symbol-fuellung"),
  ];
  const diac = {
    name: "Diac", gruppe: 7, hoehe: 12, pivotY: 0, anschluesse: ZWEI_ANSCHLUESSE,
    schaltend: false, standardPole: 1, bmk: "R", zeichnen: gegensinnig,
  };
  const triac = {
    ...diac, name: "Triac", bmk: "Q",
    anschluesse: { ...ZWEI_ANSCHLUESSE, G: { dx: -4.5, dy: 3.2 } },
    zeichnen(x, y) { return [...gegensinnig(x, y), pfad(x, y, [[-2, 1.5], [-3.2, 3.2], [-4.5, 3.2]])]; },
  };

  // ---- Gruppe 8: Spannungs- und Stromquellen (S. 84, 85, 92) ---------------------------
  function quelle(name, zeichnen, weiteres = {}) {
    return {
      name, gruppe: 8, hoehe: 12, pivotY: 0, anschluesse: ZWEI_ANSCHLUESSE,
      schaltend: false, standardPole: 1, bmk: "G", zeichnen, ...weiteres,
    };
  }
  // S. 84: galvanisches Element – langer Strich Pluspol (oben, "1"), kurzer dicker
  // Strich Minuspol.
  const zelle = (x, y, dy) => [
    linie(x, y, -2.6, dy, 2.6, dy),
    rechteck(x, y, -1.2, dy + 0.85, 2.4, 0.7, "symbol-fuellung"),
  ];
  const galvanischesElement = quelle("Galvanisches Element", (x, y) => [
    linie(x, y, 0, -6, 0, -0.8), ...zelle(x, y, -0.8), linie(x, y, 0, 0.75, 0, 6),
  ]);
  // S. 84: Akkumulatorenbatterie – zwei Zellen, dazwischen gestrichelt (beliebig viele).
  const akkumulator = quelle("Akkumulatorenbatterie", (x, y) => [
    linie(x, y, 0, -6, 0, -2.8), ...zelle(x, y, -2.8),
    gestrichelt(x, y, 0, -1.25, 0, 1.2),
    ...zelle(x, y, 1.2), linie(x, y, 0, 2.75, 0, 6),
  ]);
  // S. 85: idealer Spannungserzeuger – Kreis, Leitung läuft durch; idealer
  // Stromerzeuger – Kreis mit Querstrich, Leitung endet am Kreis.
  const spannungsquelle = quelle("Idealer Spannungserzeuger", (x, y) => [
    kreis(x, y, 0, 0, 3), linie(x, y, 0, -6, 0, 6),
  ]);
  const stromquelle = quelle("Idealer Stromerzeuger", (x, y) => [
    kreis(x, y, 0, 0, 3), linie(x, y, 0, -6, 0, -3), linie(x, y, 0, 3, 0, 6), linie(x, y, -3, 0, 3, 0),
  ]);
  // S. 92: Netzanschlussgerät – Kasten mit Diagonale, ~ oben, = unten (Zweitform AC/DC).
  // Wie -T1 auf IHK-Blatt 8: oben 1 (L) und 2 (N), unten 3 (+) und 4 (−). In der
  // Strompfad-Kette laufen 1 und 3 (auf der Pfadachse), 2 und 4 binden sich über
  // bauteil.schienen an N bzw. L-, siehe FORMAT.md.
  function netzteilZeichnen(x, y, oben, unten) {
    return [
      rechteck(x, y, -5, -5, 10, 10, "symbol-flaeche"),
      linie(x, y, -5, 5, 5, -5),
      linie(x, y, 0, -8, 0, -5), linie(x, y, 3.5, -8, 3.5, -5),
      linie(x, y, 0, 5, 0, 8), linie(x, y, 3.5, 5, 3.5, 8),
      beschriftung(x, y, -2.3, -2.2, oben), beschriftung(x, y, 2.3, 2.4, unten),
    ];
  }
  const NETZTEIL_ANSCHLUESSE = {
    "1": { dx: 0, dy: -8 }, "2": { dx: 3.5, dy: -8 }, "3": { dx: 0, dy: 8 }, "4": { dx: 3.5, dy: 8 },
  };
  const netzteil = quelle("Netzanschlussgerät", (x, y) => netzteilZeichnen(x, y, "~", "="), {
    hoehe: 16, anschluesse: NETZTEIL_ANSCHLUESSE, kette: { oben: "1", unten: "3" }, bmk: "T",
  });
  const netzteilAcDc = quelle("Netzanschlussgerät (AC/DC)", (x, y) => netzteilZeichnen(x, y, "AC", "DC"), {
    hoehe: 16, anschluesse: NETZTEIL_ANSCHLUESSE, kette: { oben: "1", unten: "3" }, bmk: "T",
  });

  // ---- Gruppe 9: Leitungen, Verbindungen, Anschlüsse (S. 84, 85) ---------------------
  // Reihenklemme: der lösbare Anschluss (S. 84, **hohler** Kreis – der ausgefüllte Punkt ist
  // die feste Verbindung). Sitzt wie jedes Bauteil im Strompfad; die Leitung endet am Kreis.
  // Ihre Nummer steht in bauteil.klemme, nicht in den Anschlussnummern "1"/"2" – daraus und
  // aus den Nachbarn im Pfad rechnet erzeugte-blaetter.js den Klemmenplan.
  const KLEMME_R = 1.4;
  const klemme = {
    name: "Reihenklemme", gruppe: 9, hoehe: 8, pivotY: 0, anschluesse: { "1": { dx: 0, dy: -4 }, "2": { dx: 0, dy: 4 } },
    schaltend: false, standardPole: 1, bmk: "X", istKlemme: true,
    zeichnen(x, y) {
      return [linie(x, y, 0, -4, 0, -KLEMME_R), kreis(x, y, 0, 0, KLEMME_R), linie(x, y, 0, KLEMME_R, 0, 4)];
    },
  };

  // S. 85: Steckerstift – Leitung endet in einem dicken ausgefüllten Stift; Steckerbuchse –
  // Leitung endet in einem Halbkreis, der sich zum Gegenstück hin öffnet. Im Buch waagerecht,
  // hier um 90° gedreht wie jedes Symbol im Strompfad: der Stift zeigt nach unten, die
  // Buchse öffnet sich nach unten. Anschluss 2 liegt an der Steckseite (Stiftspitze,
  // Buchsenöffnung) – Stift unter Buchse gesetzt ergibt so eine Steckverbindung.
  function anschlussElement(name, zeichnen) {
    return {
      name, gruppe: 9, hoehe: 8, pivotY: 0, anschluesse: { "1": { dx: 0, dy: -4 }, "2": { dx: 0, dy: 2.6 } },
      schaltend: false, standardPole: 1, bmk: "X", zeichnen,
    };
  }
  const steckerstift = anschlussElement("Steckerstift", (x, y) => [
    linie(x, y, 0, -4, 0, 0), rechteck(x, y, -0.55, 0, 1.1, 2.6, "symbol-fuellung"),
  ]);
  const steckerbuchse = anschlussElement("Steckerbuchse", (x, y) => [
    linie(x, y, 0, -4, 0, 1), el("path", { d: `M${x - 1.6},${y + 2.6} A1.6,1.6 0 0 1 ${x + 1.6},${y + 2.6}`, class: "symbol-linie" }),
  ]);

  // S. 85: Erdung, Körper/Masse, Schutzleiteranschluss – im Buch mit nur einer Zuleitung von
  // oben. LeitWerk kennt für jedes Bauteil ein oberes und ein unteres Kettenende; Anschluss
  // "2" liegt deshalb auf dem untersten Strich des Zeichens, darunter setzt man nichts.
  const erdStriche = (x, y, y0) => [
    linie(x, y, -2.4, y0, 2.4, y0), linie(x, y, -1.6, y0 + 0.9, 1.6, y0 + 0.9), linie(x, y, -0.8, y0 + 1.8, 0.8, y0 + 1.8),
  ];
  function erdElement(name, zeichnen, unten) {
    return {
      name, gruppe: 9, hoehe: 8, pivotY: 0, anschluesse: { "1": { dx: 0, dy: -4 }, "2": { dx: 0, dy: unten } },
      schaltend: false, standardPole: 1, bmk: "X", zeichnen,
    };
  }
  const erdung = erdElement("Erdung, allgemein", (x, y) => [linie(x, y, 0, -4, 0, 0), ...erdStriche(x, y, 0)], 1.8);
  // b) fremdspannungsarm: dieselben Striche unter einem Halbkreis.
  const erdungFremdspannungsarm = erdElement("Erdung, fremdspannungsarm", (x, y) => [
    linie(x, y, 0, -4, 0, 0), ...erdStriche(x, y, 0),
    el("path", { d: `M${x - 3.2},${y + 1.6} A3.2,3.2 0 0 1 ${x + 3.2},${y + 1.6}`, class: "symbol-linie" }),
  ], 1.8);
  // Körper, Masse: Querstrich mit schrägen Schraffen darunter (erste der wahlweisen Formen).
  const masse = erdElement("Körper, Masse", (x, y) => [
    linie(x, y, 0, -4, 0, 0), linie(x, y, -2.4, 0, 2.4, 0),
    linie(x, y, -1.6, 0, -2.6, 1.6), linie(x, y, 0, 0, -1, 1.6), linie(x, y, 1.6, 0, 0.6, 1.6),
  ], 0);
  // Schutzleiteranschluss (Form a): Erdzeichen im Kreis.
  const schutzleiteranschluss = erdElement("Schutzleiteranschluss", (x, y) => [
    linie(x, y, 0, -4, 0, -3), kreis(x, y, 0, 0, 3), linie(x, y, 0, -3, 0, -0.6), ...erdStriche(x, y, -0.6),
  ], 3);

  // ---- Gruppe 10: Passive Bauelemente und Leuchten (S. 84, 85) ------------------------
  // Im Buch waagerecht, hier um 90° gedreht wie jedes Symbol im Strompfad.
  function passiv(name, zeichnen, weiteres = {}) {
    return {
      name, gruppe: 10, hoehe: 12, pivotY: 0, anschluesse: ZWEI_ANSCHLUESSE,
      schaltend: false, standardPole: 1, bmk: "L", zeichnen, ...weiteres,
    };
  }
  // Wicklung: vier Halbbögen von y=-4 bis 4 an der Achse x=dx, nach rechts (+1) oder links (-1).
  function wicklung(x, y, dx = 0, richtung = 1) {
    const d = [`M${x + dx},${y - 4}`];
    for (let i = 0; i < 4; i++) d.push(`A1,1 0 0 ${richtung > 0 ? 1 : 0} ${x + dx},${y - 2 + 2 * i}`);
    return el("path", { d: d.join(" "), class: "symbol-linie" });
  }
  const zuleitungen = (x, y, innen, aussen = 6, dx = 0) => [linie(x, y, dx, -aussen, dx, -innen), linie(x, y, dx, innen, dx, aussen)];
  // S. 84: Induktivität, Spule, Wicklungsstrang – und mit Eisenkern als Drosselspule (der Kern
  // ist der gerade Strich an den Bögen entlang).
  const spule = passiv("Induktivität, Spule", (x, y) => [...zuleitungen(x, y, 4), wicklung(x, y)]);
  const drossel = passiv("Drosselspule mit Eisenkern", (x, y) => [
    ...zuleitungen(x, y, 4), wicklung(x, y), linie(x, y, 1.6, -4, 1.6, 4),
  ]);
  // S. 84: Transformator für Einphasen-Wechselstrom – zwei Wicklungen, die Bögen einander
  // zugewandt. Wie das Netzanschlussgerät: Primärwicklung 1/2 auf der Pfadachse (läuft in
  // der Kette), Sekundärwicklung 3/4 rechts daneben, erreichbar über Querverbindungen.
  const transformator = passiv("Transformator", (x, y) => [
    ...zuleitungen(x, y, 4), wicklung(x, y, 0, 1), ...zuleitungen(x, y, 4, 6, 4.4), wicklung(x, y, 4.4, -1),
  ], {
    bmk: "T",
    anschluesse: { "1": { dx: 0, dy: -6 }, "2": { dx: 0, dy: 6 }, "3": { dx: 4.4, dy: -6 }, "4": { dx: 4.4, dy: 6 } },
  });
  // S. 84: Kondensator – zwei Platten; S. 85: gepolt (Elektrolytkondensator), Plus an der
  // oberen Platte (Anschluss 1).
  const platten = (x, y) => [...zuleitungen(x, y, 0.6), linie(x, y, -2.4, -0.6, 2.4, -0.6), linie(x, y, -2.4, 0.6, 2.4, 0.6)];
  const kondensator = passiv("Kondensator", platten, { bmk: "C" });
  const kondensatorGepolt = passiv("Kondensator, gepolt (Elko)", (x, y) => [...platten(x, y), beschriftung(x, y, 2.4, -1.9, "+")], { bmk: "C" });
  // S. 84: Leuchte allgemein (Kreis mit Kreuz); Meldelampe (Kreis, Zuleitungen bis an zwei
  // Platten, „z. B. im Schalter, auch mit LED"); Glimmlampe (dazu der Punkt = Gasfüllung).
  const LEUCHTE_R = 3;
  const leuchte = passiv("Leuchte, allgemein", (x, y) => {
    const d = LEUCHTE_R * Math.SQRT1_2;
    return [...zuleitungen(x, y, LEUCHTE_R), kreis(x, y, 0, 0, LEUCHTE_R), linie(x, y, -d, -d, d, d), linie(x, y, -d, d, d, -d)];
  }, { bmk: "E" });
  const meldelampe = passiv("Meldelampe", (x, y) => [
    ...zuleitungen(x, y, 0.6), kreis(x, y, 0, 0, LEUCHTE_R), linie(x, y, -1.4, -0.6, 1.4, -0.6), linie(x, y, -1.4, 0.6, 1.4, 0.6),
  ], { bmk: "P" });
  const glimmlampe = passiv("Glimmlampe", (x, y) => [
    ...zuleitungen(x, y, 1.2), kreis(x, y, 0, 0, LEUCHTE_R), linie(x, y, -1.4, -1.2, 1.4, -1.2), linie(x, y, -1.4, 1.2, 1.4, 1.2),
    kreis(x, y, 0, 0, 0.35, "symbol-fuellung"),
  ], { bmk: "P" });
  // S. 84: Leuchtstofflampe – langgestreckter Kolben mit Elektroden an den Enden, darin
  // Kreuz und Punkt.
  const leuchtstofflampe = passiv("Leuchtstofflampe", (x, y) => [
    ...zuleitungen(x, y, 5, 7), el("rect", { x: x - 2, y: y - 5, width: 4, height: 10, rx: 2, class: "symbol-linie" }),
    linie(x, y, -2.8, -5, 2.8, -5), linie(x, y, -2.8, 5, 2.8, 5),
    linie(x, y, -1.1, -1.9, 1.1, 0.3), linie(x, y, -1.1, 0.3, 1.1, -1.9), kreis(x, y, 0, 1.8, 0.35, "symbol-fuellung"),
  ], { bmk: "E", hoehe: 14, anschluesse: { "1": { dx: 0, dy: -7 }, "2": { dx: 0, dy: 7 } } });
  // S. 84: Überspannungsableiter a) allgemein – Kasten mit Pfeil auf einen Querstrich; b)
  // Funkenstrecke – zwei Pfeilspitzen gegeneinander.
  const ableiterKasten = (x, y) => [...zuleitungen(x, y, 3.5), rechteck(x, y, -1.5, -3.5, 3, 7, "symbol-linie")];
  const ueberspannungsableiter = passiv("Überspannungsableiter", (x, y) => [
    ...ableiterKasten(x, y), linie(x, y, 0, -2.4, 0, 0.2), pfeilspitze(x, y, 0, -2.4, 0, 1, 1.1), linie(x, y, -1, 1.3, 1, 1.3),
  ], { bmk: "F" });
  const funkenstrecke = passiv("Funkenstrecke", (x, y) => [
    ...ableiterKasten(x, y), linie(x, y, 0, -2.6, 0, -1.2), pfeilspitze(x, y, 0, -2.6, 0, -0.35, 1.1),
    linie(x, y, 0, 2.6, 0, 1.2), pfeilspitze(x, y, 0, 2.6, 0, 0.35, 1.1),
  ], { bmk: "F" });

  // ---- Gruppe 11: Messgeräte (S. 87, kWh-Zähler S. 84) ---------------------------------
  // Grundformen: Kreis = Messinstrument anzeigend, Quadrat = Messgerät allgemein, Quadrat mit
  // Streifen oben = integrierendes Messgerät/Zähler, Quadrat mit Diagonale = Signalumformer
  // (nicht mit dem Sensor verwechseln), zwei Diagonalen = mit galvanischer Trennung.
  function messgeraet(name, zeichnen, weiteres = {}) {
    return {
      name, gruppe: 11, hoehe: 12, pivotY: 0, anschluesse: ZWEI_ANSCHLUESSE,
      schaltend: false, standardPole: 1, bmk: "P", zeichnen, ...weiteres,
    };
  }
  const MESS_R = 3;
  const messkreis = (x, y, zeichen) => [
    ...zuleitungen(x, y, MESS_R), kreis(x, y, 0, 0, MESS_R), ...(zeichen ? [beschriftung(x, y, 0, 0.15, zeichen, "symbol-messzeichen")] : []),
  ];
  const messkasten = (x, y) => [...zuleitungen(x, y, 3), rechteck(x, y, -3, -3, 6, 6, "symbol-linie")];
  const messinstrument = messgeraet("Messinstrument, anzeigend", (x, y) => messkreis(x, y));
  const strommesser = messgeraet("Strommesser", (x, y) => messkreis(x, y, "A"));
  const spannungsmesser = messgeraet("Spannungsmesser", (x, y) => messkreis(x, y, "V"));
  const messgeraetAllgemein = messgeraet("Messgerät, allgemein", messkasten);
  const zaehler = messgeraet("Integrierendes Messgerät, Zähler", (x, y) => [...messkasten(x, y), linie(x, y, -3, -1.4, 3, -1.4)]);
  const kwhZaehler = messgeraet("kWh-Zähler", (x, y) => [
    ...messkasten(x, y), linie(x, y, -3, -0.6, 3, -0.6), beschriftung(x, y, 0, -1.8, "kWh", "symbol-messzeichen-klein"),
  ]);
  const signalumformer = messgeraet("Signalumformer", (x, y) => [...messkasten(x, y), linie(x, y, -3, 3, 3, -3)], { bmk: "T" });
  const signalumformerTrennung = messgeraet("Signalumformer, galvanisch getrennt", (x, y) => [
    ...messkasten(x, y), linie(x, y, -3, 2, 2, -3), linie(x, y, -2, 3, 3, -2),
  ], { bmk: "T" });

  // ---- Gruppe 13: Schütz- und Relaisspulen (S. 83, Antriebe S. 86) ---------------------
  // S. 83: die Spule im Strompfad ist ein flacher Kasten, A1 oben, A2 unten; ihr BMK ist das
  // des Schützes – alle Kontakte mit demselben BMK gehören dazu (Kontaktspiegel, app.js).
  // Die Verzögerungs-Kennzeichen sitzen wie beim Antrieb S. 86 links im Kasten.
  const SPULE_ANSCHLUESSE = { A1: { dx: 0, dy: -6 }, A2: { dx: 0, dy: 6 } };
  function spulenGeraet(name, innen = () => []) {
    return {
      name, gruppe: 13, hoehe: 12, pivotY: 0, anschluesse: SPULE_ANSCHLUESSE,
      kette: { oben: "A1", unten: "A2" }, schaltend: false, standardPole: 1, bmk: "K", spule: true,
      zeichnen(x, y) {
        return [linie(x, y, 0, -6, 0, -1.6), rechteck(x, y, -3.2, -1.6, 6.4, 3.2), linie(x, y, 0, 1.6, 0, 6), ...innen(x, y)];
      },
    };
  }
  const schuetzspule = spulenGeraet("Schütz- oder Relaisspule");
  const spuleAnzugsverzoegert = spulenGeraet("Spule mit Anzugsverzögerung (Zeitrelais)", (x, y) => [
    linie(x, y, -1.6, -1.6, -1.6, 1.6), linie(x, y, -3.2, -1.6, -1.6, 1.6), linie(x, y, -3.2, 1.6, -1.6, -1.6),
  ]);
  const spuleAbfallverzoegert = spulenGeraet("Spule mit Abfallverzögerung", (x, y) => [
    rechteck(x, y, -3.2, -1.6, 1.6, 3.2, "symbol-fuellung"),
  ]);
  const spuleStromstoss = spulenGeraet("Spule eines Stromstoßrelais", (x, y) => [
    pfad(x, y, [[-0.9, 1], [-0.9, 0], [0.9, 0], [0.9, -1]]),
  ]);

  // ---- Gruppe 14: Motoren, Anlasser, Umrichter (S. 83, 98, 99) --------------------------
  // Ein Motor sitzt mit je einem Anschluss in so vielen Strompfaden, wie er Zuleitungen hat
  // (M 3~: drei, U1 V1 W1), die Zuleitungen laufen gestaffelt in den Kreis (S. 83: -M1).
  // PE rechts neben dem Motor (S. 83), als eigener Anschluss für die PE-Schiene.
  function motorGeraet(name, oben, unten, pole, namen, weiteres = {}) {
    return {
      name, gruppe: 14, hoehe: 18, pivotY: 0, anschluesse: { "1": { dx: 0, dy: -8 } }, namen,
      kette: { oben: "1", unten: null }, schaltend: false, standardPole: pole, festePole: pole, bmk: "M",
      zeichnen() { return []; },
      gesamt(x, y, polZahl, abstand) {
        const xc = x + ((polZahl - 1) * abstand) / 2, yc = y + 4, r = 5;
        const teile = [];
        for (let i = 0; i < polZahl; i++) {
          const xi = x + i * abstand;
          const versatz = (i - (polZahl - 1) / 2) * 2.4;
          const xe = xc + versatz;
          const ye = yc - Math.sqrt(r * r - versatz * versatz);
          const yk = versatz < 0 ? y - 5 : y - 3.5; // links höher als rechts: nichts kreuzt
          if (Math.abs(xi - xe) < 0.01) teile.push(el("line", { x1: xi, y1: y - 8, x2: xi, y2: ye, class: "symbol-linie" }));
          else teile.push(el("path", { d: `M${xi},${y - 8} L${xi},${yk} L${xe},${yk} L${xe},${ye}`, class: "symbol-linie" }));
        }
        teile.push(el("circle", { cx: xc, cy: yc, r, class: "symbol-flaeche" }));
        teile.push(beschriftung(xc, yc, 0, -1.6, "M", "symbol-buchstabe-gross"));
        if (oben || unten) teile.push(beschriftung(xc, yc, 0, 1.9, unten, "symbol-buchstabe"));
        // PE schräg oben rechts aus dem Kreis, dann hoch zur PE-Schiene (S. 83: PE rechts).
        const xpe = x + (polZahl - 1) * abstand + 7;
        teile.push(el("path", { d: `M${xc + r * 0.87},${yc - r / 2} L${xpe},${yc - r / 2} L${xpe},${y - 8}`, class: "symbol-linie" }));
        teile.push(beschriftung(xpe, y, 1.8, -5, "PE", "symbol-buchstabe"));
        // Wicklungsenden rechts (Stern-Dreieck-Motor, S. 83): kurze Stiche aus dem Kreis.
        for (const dy of weiteres.wicklungsenden ? [0.5, 2.5, 4.5] : []) {
          const xk = xc + Math.sqrt(r * r - dy * dy);
          teile.push(el("line", { x1: xk, y1: yc + dy, x2: xc + 8, y2: yc + dy, class: "symbol-linie" }));
        }
        return teile;
      },
      // S. 83: das BMK steht links neben dem Motorkreis, nicht über der Zuleitung.
      bmkPosition(x, y, polZahl, abstand) { return { x: x + ((polZahl - 1) * abstand) / 2 - 6.5, y: y + 5.2 }; },
      zusatzAnschluesse(polZahl, abstand) {
        const xc = ((polZahl - 1) * abstand) / 2;
        const enden = weiteres.wicklungsenden ? { U2: { dx: xc + 8, dy: 4.5 }, V2: { dx: xc + 8, dy: 6.5 }, W2: { dx: xc + 8, dy: 8.5 } } : {};
        return { ...enden, PE: { dx: (polZahl - 1) * abstand + 7, dy: -8 } };
      },
    };
  }
  const motorDrehstrom = motorGeraet("Drehstrommotor M 3~", "M", "3~", 3, { "1": "U1", "3": "V1", "5": "W1" });
  const motorWechselstrom = motorGeraet("Wechselstrommotor M 1~", "M", "1~", 2, { "1": "U1", "3": "U2" });
  const motorGleichstrom = motorGeraet("Gleichstrommotor M =", "M", "=", 2, { "1": "A1", "3": "A2" });
  // S. 83 (Stern-Dreieck): Wicklungsenden U2 V2 W2 rechts am Motor, für die Querverbindungen
  // zu Stern- und Dreieckschütz.
  const motorSternDreieck = motorGeraet("Drehstrommotor M 3~, Stern-Dreieck (U1…W2)", "M", "3~", 3,
    { "1": "U1", "3": "V1", "5": "W1" }, { wicklungsenden: true });

  // S. 99: Motorstarter/Anlasser – Kasten über alle Pole, oben ein Winkel, in der Mitte das
  // Kennzeichen der Anlassart. Zuleitungen oben (1/3/5), Abgänge unten (2/4/6).
  function anlasserGeraet(name, kennzeichen, namen, bmk = "Q") {
    return {
      name, gruppe: 14, hoehe: 16, pivotY: 0, anschluesse: { "1": { dx: 0, dy: -8 }, "2": { dx: 0, dy: 8 } }, namen,
      schaltend: true, standardPole: 3, festePole: 3, bmk,
      zeichnen(x, y) { return [linie(x, y, 0, -8, 0, -5), linie(x, y, 0, 5, 0, 8)]; },
      gesamt(x, y, polZahl, abstand) {
        const x1 = x - 4, x2 = x + (polZahl - 1) * abstand + 4, xc = (x1 + x2) / 2;
        return [
          el("rect", { x: x1, y: y - 5, width: x2 - x1, height: 10, class: "symbol-flaeche" }),
          el("path", { d: `M${x1},${y - 5} L${xc},${y - 2.6} L${x2},${y - 5}`, class: "symbol-linie" }),
          ...kennzeichen(xc, y + 1.2),
        ];
      },
    };
  }
  const anlasser = anlasserGeraet("Anlasser, Motorstarter allgemein", () => []);
  const anlasserSternDreieck = anlasserGeraet("Stern-Dreieck-Anlasser", (x, y) => [
    pfad(x, y, [[-2, 1.6], [0, -1.8], [2, 1.6], [-2, 1.6]]),
    linie(x, y, 0, 0.3, 0, -0.9), linie(x, y, 0, 0.3, -0.9, 0.9), linie(x, y, 0, 0.3, 0.9, 0.9),
  ]);
  // S. 99: „Anlasser für beide Drehrichtungen mit Thyristorschaltung, z. B. zur
  // Frequenzsteuerung“ – Doppelpfeil (beide Drehrichtungen) über dem Thyristor-Zeichen.
  const frequenzumrichter = anlasserGeraet("Frequenzumrichter (Anlasser mit Thyristor-/IGBT-Schaltung)", (x, y) => [
    linie(x, y, -2.6, -2.2, 2.6, -2.2),
    pfeilspitze(x, y, 0, -2.2, -2.8, -2.2, 0.8), pfeilspitze(x, y, 0, -2.2, 2.8, -2.2, 0.8),
    pfad(x, y, [[-1.2, 0.2], [1.2, 1.2], [-1.2, 2.2], [-1.2, 0.2]]),
    linie(x, y, 1.2, 0.2, 1.2, 2.2), linie(x, y, -2.6, 1.2, 2.6, 1.2), linie(x, y, 0.6, 0.9, 1.4, -0.1),
  ], { "1": "L1", "3": "L2", "5": "L3", "2": "U", "4": "V", "6": "W" }, "T");

  // S. 83: Motorschutzrelais im Hauptstromkreis (-F3) – ein Kasten über alle Pole, darin das
  // Bimetall-Zeichen; die Leiter laufen hindurch. Sein Hilfskontakt 95/96 ist das Symbol
  // „Öffner des Motorschutzrelais“ mit demselben BMK.
  const motorschutzrelais = {
    name: "Motorschutzrelais (thermischer Auslöser)", gruppe: 4, hoehe: 12, pivotY: 0,
    anschluesse: ZWEI_ANSCHLUESSE, schaltend: false, standardPole: 3, festePole: 3, bmk: "F",
    zeichnen(x, y) { return [linie(x, y, 0, -6, 0, 6)]; },
    gesamt(x, y, polZahl, abstand) {
      const x1 = x - 3.5, x2 = x + (polZahl - 1) * abstand + 3.5, xm = x + ((polZahl - 1) * abstand) / 2;
      return [
        el("rect", { x: x1, y: y - 2.6, width: x2 - x1, height: 5.2, class: "symbol-flaeche" }),
        pfad(xm, y, [[-0.6, -1.8], [-0.6, 0], [0.6, 0], [0.6, 1.8]]),
      ];
    },
  };

  const GERAETE = {
    // Gruppe 4
    trennschalter: schaltgeraet("Trennschalter, Leerschalter", querbalken),
    lasttrennschalter: schaltgeraet("Lasttrennschalter", balkenUndKreis),
    leistungsschalter: schaltgeraet("Leistungsschalter", kreuz, { schutz: true }),
    "lastschalter-selbsttaetig": schaltgeraet("Lastschalter mit selbsttätiger Auslösung", selbsttaetigeAusloesung, { schutz: true }),
    schuetz: schaltgeraet("Schütz, Hauptkontakte", schuetzBogen, { standardPole: 3 }),
    motorschutzschalter: schaltgeraet("Motorschutzschalter", kreuz, { antrieb: schutzschalterAntrieb, standardPole: 3, schutz: true }),
    leitungsschutzschalter: schaltgeraet("Leitungsschutzschalter", kreuz, { antrieb: schutzschalterAntrieb, bmk: "F", schutz: true }),
    fehlerstromschutzschalter: schaltgeraet("Fehlerstrom-Schutzschalter (RCD)", () => [], {
      antrieb: fehlerstromAntrieb, standardPole: 4, bmk: "F", schutz: true, fehlerstrom: true,
    }),
    thermokontakt,
    motorschutzrelais,
    "motorschutzrelais-oeffner": motorschutzrelaisOeffner,
    starter,
    // Gruppe 5
    sicherung,
    "sicherung-netz": sicherungNetz,
    sicherungstrennschalter,
    // Gruppe 6
    widerstand,
    "widerstand-veraenderbar": widerstandVeraenderbar,
    "widerstand-einstellbar": widerstandEinstellbar,
    "potenziometer-1": potenziometer1,
    "potenziometer-2": potenziometer2,
    ptc, ntc, vdr, fotowiderstand, feldplatte, hallgenerator, peltier,
    // Gruppe 7
    diode, "z-diode": zDiode, led, fotodiode, strahlungsdetektor, fotoelement,
    "transistor-npn": transistorNpn, "transistor-pnp": transistorPnp, fototransistor, optokoppler,
    thyristor: thyristorP, "thyristor-n": thyristorN, triac, diac,
    // Gruppe 8
    "galvanisches-element": galvanischesElement,
    akkumulator, spannungsquelle, stromquelle, netzteil,
    "netzteil-acdc": netzteilAcDc,
    // Gruppe 9
    klemme, steckerstift, steckerbuchse,
    erdung, "erdung-fremdspannungsarm": erdungFremdspannungsarm, masse, schutzleiteranschluss,
    // Gruppe 10
    spule, drossel, transformator, kondensator, "kondensator-gepolt": kondensatorGepolt,
    leuchte, meldelampe, glimmlampe, leuchtstofflampe, ueberspannungsableiter, funkenstrecke,
    // Gruppe 11
    messinstrument, strommesser, spannungsmesser, "messgeraet-allgemein": messgeraetAllgemein,
    zaehler, "kwh-zaehler": kwhZaehler, signalumformer, "signalumformer-getrennt": signalumformerTrennung,
    // Gruppe 13
    schuetzspule, "spule-anzugsverzoegert": spuleAnzugsverzoegert,
    "spule-abfallverzoegert": spuleAbfallverzoegert, "spule-stromstoss": spuleStromstoss,
    // Gruppe 14
    "motor-drehstrom": motorDrehstrom, "motor-stern-dreieck": motorSternDreieck,
    "motor-wechselstrom": motorWechselstrom, "motor-gleichstrom": motorGleichstrom,
    anlasser, "anlasser-stern-dreieck": anlasserSternDreieck, frequenzumrichter,
  };

  // Kontakte sind immer schaltend und mehrpolig koppelbar; die übrigen Felder, die ein
  // festes Symbol ausdrücklich trägt, bekommen sie hier nachgereicht.
  for (const def of Object.values(KONTAKTE)) {
    def.schaltend = true;
    def.kopplung = FAHNEN_MITTE;
  }

  // ============================================================================
  // Zusammensetzen: Symbol + optionale Betätigung + optionale Kennzeichen, 1..n Pole
  // ============================================================================

  const eigen = (obj, name) => Boolean(name) && Object.prototype.hasOwnProperty.call(obj, name);

  function hatKontakt(name) {
    return eigen(KONTAKTE, name);
  }

  // Die Symbol-Definition eines Bauteils: Kontakt (bauteil.kontakt) oder festes Symbol
  // (bauteil.typ), null für unbekannte Schlüssel (dann Platzhalter-Kasten in app.js).
  function symbolVon(bauteil) {
    if (bauteil.kontakt) return eigen(KONTAKTE, bauteil.kontakt) ? KONTAKTE[bauteil.kontakt] : null;
    if (bauteil.typ) return eigen(GERAETE, bauteil.typ) ? GERAETE[bauteil.typ] : null;
    return null;
  }
  function hatSymbol(bauteil) {
    return symbolVon(bauteil) !== null;
  }

  function polZahl(bauteil) {
    return bauteil.pole > 1 ? bauteil.pole : 1;
  }

  // Anschlussnummer an Pol i (ab 0): Pol 0 unverändert, sonst um 2i weitergezählt –
  // 1/2, 3/4, 5/6 wie auf jedem Schütz. Nie gespeichert, siehe FORMAT.md.
  function polNummer(nummer, pol) {
    return pol === 0 ? nummer : String(Number(nummer) + 2 * pol);
  }

  // Mehrpolig geht nur mit genau den Anschlüssen "1"/"2" – sonst wäre das Weiterzählen
  // mehrdeutig (Wechsler, Netzteil, Potenziometer …).
  function mehrpoligMoeglich(bauteil) {
    const def = symbolVon(bauteil);
    if (def && def.festePole) return polZahl(bauteil) === def.festePole; // Motor, Anlasser: feste Polzahl
    const nummern = def ? Object.keys(def.anschluesse).sort().join(",") : "1,2";
    return nummern === "1,2";
  }

  // Zeichnet ein Bauteil mit allen Polen. polAbstand = Abstand zweier Strompfade in mm
  // (kommt aus raster.js – die Symbolbibliothek kennt das Blattraster nicht).
  function zeichnenBauteil(bauteil, x, y, polAbstand = 0) {
    const def = symbolVon(bauteil);
    if (!def) return [];
    const pole = polZahl(bauteil);
    const teile = [];
    for (let i = 0; i < pole; i++) teile.push(...def.zeichnen(x + i * polAbstand, y));

    const pivotY = y + (def.pivotY ?? 0);
    if (bauteil.kontakt && eigen(BETAETIGUNGEN, bauteil.betaetigung)) {
      teile.push(...BETAETIGUNGEN[bauteil.betaetigung].zeichnen(x, pivotY));
    }
    if (def.antrieb) teile.push(...def.antrieb(x, pivotY));
    // Geräte, die über alle Pole ein gemeinsames Zeichen tragen (Motor, Anlasser,
    // Motorschutzrelais): einmal gezeichnet, nach den Polen – ihr Kasten liegt obenauf.
    if (def.gesamt) teile.push(...def.gesamt(x, y, pole, polAbstand));
    (bauteil.kennzeichen || []).forEach((name, i) => {
      if (!eigen(KENNZEICHEN, name)) return;
      const markeY = pivotY - 1.8 - i * 2.2;
      teile.push(...KENNZEICHEN[name].zeichnen(x + 3.5, markeY));
    });
    // Mechanische Verbindung (S. 84, gestrichelt) durch die Schaltfahnen aller Pole.
    if (pole > 1 && def.kopplung) {
      const k = def.kopplung;
      teile.push(gestrichelt(x, y, k.dx, k.dy, (pole - 1) * polAbstand + k.dx, k.dy));
    }
    return teile;
  }

  function hoeheVon(bauteil) {
    const def = symbolVon(bauteil);
    return def ? def.hoehe : null;
  }

  // Absolute Anschlusspunkte aller Pole, { nummer: {x, y} } – bei jeder Benutzung frisch
  // berechnet, nie gespeichert (FORMAT.md, seit Version 4). null für unbekannte Symbole.
  function anschlusspunkte(bauteil, x, y, polAbstand = 0) {
    const def = symbolVon(bauteil);
    if (!def) return null;
    const ergebnis = {};
    for (let pol = 0; pol < polZahl(bauteil); pol++) {
      for (const [nummer, punkt] of Object.entries(def.anschluesse)) {
        ergebnis[polNummer(nummer, pol)] = { x: x + pol * polAbstand + punkt.dx, y: y + punkt.dy };
      }
    }
    // Anschlüsse, die das Gerät als Ganzes hat (PE und Wicklungsenden eines Motors).
    if (def.zusatzAnschluesse) {
      for (const [nummer, punkt] of Object.entries(def.zusatzAnschluesse(polZahl(bauteil), polAbstand))) {
        ergebnis[nummer] = { x: x + punkt.dx, y: y + punkt.dy };
      }
    }
    return ergebnis;
  }

  // Oberes/unteres Ende von Pol `pol` in der Strompfad-Kette (FORMAT.md „Strompfad").
  function kettenEnden(bauteil, pol = 0) {
    const def = symbolVon(bauteil);
    const kette = (def && def.kette) || { oben: "1", unten: "2" };
    // unten null: das Gerät beendet die Kette (Motor) – darunter wird nichts angeschlossen.
    return { oben: polNummer(kette.oben, pol), unten: kette.unten === null ? null : polNummer(kette.unten, pol) };
  }

  // Schaltet dieses Bauteil? Dann darf keiner seiner Anschlüsse an PE (FORMAT.md).
  function istSchaltend(bauteil) {
    const def = symbolVon(bauteil);
    return def ? Boolean(def.schaltend) : false;
  }

  // Wie ein Anschluss im Plan heißt: bei Motoren, Umrichtern und dem Motorschutzrelais-
  // Öffner der Name aus dem Symbol (U1, L1, 95 …), sonst die Nummer selbst. Die Kennung im
  // Modell bleibt immer die Nummer – Verbindungen und Schienen hängen daran.
  function anschlussName(bauteil, nummer) {
    const def = symbolVon(bauteil);
    return (def && def.namen && def.namen[nummer]) || nummer;
  }
  // Wo das BMK eines Bauteils steht, wenn das Symbol es anders will als „links über Pol 1“
  // (Motor: links neben dem Kreis); sonst null.
  function bmkPosition(bauteil, x, y, polAbstand) {
    const def = symbolVon(bauteil);
    return def && def.bmkPosition ? def.bmkPosition(x, y, polZahl(bauteil), polAbstand) : null;
  }
  function istSpule(bauteil) {
    const def = symbolVon(bauteil);
    return Boolean(def && def.spule);
  }
  function festePole(bauteil) {
    const def = symbolVon(bauteil);
    return def ? def.festePole || 0 : 0;
  }

  // Eine Schutzeinrichtung (Sicherung, LS, Motorschutz, Leistungsschalter, RCD …)? Sie
  // begrenzt einen Stromkreis – Grundlage für Stromkreisverzeichnis und Prüfbericht
  // (DIN VDE 0100-510, 514.5; DIN VDE 0100-600, 6.4.4).
  function istSchutz(bauteil) {
    const def = symbolVon(bauteil);
    return Boolean(def && def.schutz);
  }
  function istFehlerstromschutz(bauteil) {
    const def = symbolVon(bauteil);
    return Boolean(def && def.fehlerstrom);
  }

  // Eine Reihenklemme? Dann trägt bauteil.klemme ihre Nummer (FORMAT.md „Bauteil").
  function istKlemme(bauteil) {
    const def = symbolVon(bauteil);
    return Boolean(def && def.istKlemme);
  }

  function listeKontakte() {
    return Object.entries(KONTAKTE).map(([kontakt, def]) => ({ kontakt, name: def.name }));
  }
  function listeBetaetigungen() {
    return Object.entries(BETAETIGUNGEN).map(([betaetigung, def]) => ({ betaetigung, name: def.name }));
  }
  function hatBetaetigung(name) {
    return eigen(BETAETIGUNGEN, name);
  }
  function hatKennzeichen(name) {
    return eigen(KENNZEICHEN, name);
  }
  function listeKennzeichen() {
    return Object.entries(KENNZEICHEN).map(([kennzeichen, def]) => ({ kennzeichen, name: def.name }));
  }
  function listeGeraete() {
    return Object.entries(GERAETE).map(([typ, def]) => ({
      typ, name: def.name, gruppe: def.gruppe, pole: def.standardPole || 1, bmk: def.bmk,
    }));
  }

  return {
    hatKontakt, hatSymbol, symbolVon, polZahl, mehrpoligMoeglich, zeichnenBauteil, hoeheVon,
    anschlusspunkte, kettenEnden, istSchaltend, istKlemme, listeKontakte, listeBetaetigungen, listeGeraete,
    hatBetaetigung, hatKennzeichen, listeKennzeichen, istSchutz, istFehlerstromschutz,
    anschlussName, istSpule, festePole, bmkPosition,
  };
})();
