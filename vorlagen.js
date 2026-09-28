// Vorlagen für die Startseite – und dieselben Bausteine für das Testprojekt, damit es die
// Schaltungen nur einmal gibt. Beide sind nachgezeichnet, nicht ausgedacht:
// - Folgeschaltung mit zwei Schützen nach Tabellenbuch S. 83
//   (raw/verarbeitet/2026/tabellenbuch-schaltzeichen/): M2 läuft nur, wenn M1 läuft.
// - Unterverteilung EG aus der Muster-Anlagenmappe
//   (raw/verarbeitet/2026/elektrotechnik-allgemein/Anlagenmappe_Elektronische_Anlage.pdf):
//   zwei RCD 40 A / 30 mA, dahinter die LS mit Verbraucher, Leitung, Einbauort und den
//   Messwerten der Mappe. BMK wie in der Mappe.
// Gebaut wird im Code statt aus einer Datei, weil LeitWerk per Doppelklick (file://) keine
// Dateien nachladen darf.

const LEITWERK_VORLAGEN = (() => {
  const M = () => LEITWERK_MODELL;

  // Haupt- und Steuerstromkreis. `n` ist die erste BMK-Nummer (Vorlage 1, Testprojekt 31,
  // weil dort die Prüfblätter -Q1 … -Q27 schon belegen). S. 83 zählt F1, F2, F4.
  function folgeschaltung(projekt, n = 1) {
    const m = M();
    const b = (art, i) => `-${art}${n + i}`;
    const haupt = m.neuesBlatt("Folgeschaltung – Hauptstromkreis", "stromlaufplan");
    m.blattEinfuegen(projekt, haupt);
    for (const name of ["L1", "L2", "L3", "N", "PE"]) haupt.schienen.push(m.neueSchiene(name, "oben"));
    const dreiPhasen = { 1: "L1", 3: "L2", 5: "L3" };
    haupt.bauteile.push(
      m.neuesBauteil(b("F", 0), "sicherung", 1, 1, "16 A", 3, dreiPhasen),
      m.neuesBauteil(b("Q", 0), "schuetz", 1, 2, "", 3),
      m.neuesBauteil(b("F", 1), "motorschutzrelais", 1, 3, "5,4 A", 3),
      m.neuesBauteil(b("M", 0), "motor-drehstrom", 1, 4, "", 3, { PE: "PE" }),
      m.neuesBauteil(b("F", 3), "sicherung", 4, 1, "16 A", 3, dreiPhasen),
      m.neuesBauteil(b("Q", 1), "schuetz", 4, 2, "", 3),
      m.neuesBauteil(b("M", 1), "motor-drehstrom", 4, 3, "", 3, { PE: "PE" }),
    );
    const steuer = m.neuesBlatt("Folgeschaltung – Steuerstromkreis", "stromlaufplan");
    m.blattEinfuegen(projekt, steuer);
    steuer.schienen.push(m.neueSchiene("L1", "oben"), m.neueSchiene("N", "unten"));
    const kontakt = (bmk, art, betaetigung, pfad, hoehe, schienen = {}) =>
      m.neuerKontakt(bmk, art, betaetigung, [], pfad, hoehe, "", 1, schienen);
    const s1 = kontakt(b("S", 0), "oeffner", "druecken", 1, 1, { 1: "L1" });
    const s2 = kontakt(b("S", 1), "schliesser", "druecken", 1, 2);
    const q1h = kontakt(b("Q", 0), "schliesser", null, 2, 2);
    const k1 = m.neuesBauteil(b("Q", 0), "schuetzspule", 1, 3, "", 1, { A2: "N" });
    const s3 = kontakt(b("S", 2), "schliesser", "druecken", 3, 2);
    const q2h = kontakt(b("Q", 1), "schliesser", null, 4, 2);
    const q1f = kontakt(b("Q", 0), "schliesser", null, 3, 3);
    const f2 = m.neuesBauteil(b("F", 1), "motorschutzrelais-oeffner", 3, 4, "");
    const k2 = m.neuesBauteil(b("Q", 1), "schuetzspule", 3, 5, "", 1, { A2: "N" });
    steuer.bauteile.push(s1, s2, q1h, k1, s3, q2h, q1f, f2, k2);
    const quer = (a, an, z, zn) => steuer.verbindungen.push(m.neueVerbindung({ bauteilId: a.id, anschluss: an }, { bauteilId: z.id, anschluss: zn }));
    quer(q1h, "1", s2, "1"); quer(q1h, "2", s2, "2"); // Selbsthaltung parallel zu S2
    quer(s3, "1", q1h, "1");                          // Zweig 2 hinter S1
    quer(q2h, "1", s3, "1"); quer(q2h, "2", s3, "2"); // Selbsthaltung parallel zu S3
    return { haupt, steuer };
  }

  const UV_KREISE = {
    "-1Q1": [
      { bmk: "-1F1", bemessung: "B16", verbraucher: "Steckdosen Küche (Arbeitsplatte)", leitung: "NYM-J 3×2,5 mm²", werte: ["0,11", ">200", "0,45", "515", "22", "18"] },
      { bmk: "-1F2", bemessung: "B16", verbraucher: "Geschirrspüler", leitung: "NYM-J 3×2,5 mm²", werte: ["0,13", ">200", "0,48", "483", "22", "18"] },
      { bmk: "-1F3", bemessung: "B10", verbraucher: "Beleuchtung Wohnzimmer und Flur", leitung: "NYM-J 3×1,5 mm²", werte: ["0,15", ">200", "0,55", "423", "22", "18"] },
      { bmk: "-1F4", bemessung: "B16", verbraucher: "Steckdosen Wohnzimmer", leitung: "NYM-J 3×1,5 mm²", werte: ["0,14", ">200", "0,52", "446", "22", "18"] },
    ],
    "-2Q1": [
      { bmk: "-2F1", bemessung: "C16", verbraucher: "Waschmaschine (Bad)", leitung: "NYM-J 3×2,5 mm²", werte: ["0,09", ">200", "0,39", "594", "21", "22"] },
      { bmk: "-2F2", bemessung: "B16", verbraucher: "Steckdosen und Licht Bad", leitung: "NYM-J 3×2,5 mm²", werte: ["0,10", ">200", "0,41", "565", "21", "22"] },
    ],
  };

  // Zwei Stromlaufpläne „Unterverteilung EG – RCD 1/2“. Liefert je LS-id die Messwerte der
  // Mappe (Reihenfolge R_PE, R_ISO, Z_S, I_k, I_Δ, t_A) für den Prüfbericht.
  function unterverteilung(projekt) {
    const m = M();
    const messwerte = {};
    const gruppe = (titel, rcd) => {
      const kreise = UV_KREISE[rcd];
      const blatt = m.neuesBlatt(titel, "stromlaufplan");
      m.blattEinfuegen(projekt, blatt);
      for (const name of ["L1", "L2", "L3", "N", "PE"]) blatt.schienen.push(m.neueSchiene(name, "oben"));
      // RCD rechts (Pfade 3–6: L1, L2, L3, N), damit ein vierter LS links daneben (Pfad 2)
      // ohne Leitung quer durch die anderen Pole an L1 hängen kann.
      const q = m.neuesBauteil(rcd, "fehlerstromschutzschalter", 3, 1, "40 A / 30 mA", 4, { 1: "L1", 3: "L2", 5: "L3", 7: "N" });
      q.ort = "+UV-EG";
      q.stromkreis = { verbraucher: `Fehlerstromschutz ${kreise.map((k) => k.bmk).join(", ")}` };
      blatt.bauteile.push(q);
      let ersterLs = null;
      kreise.forEach((k, i) => {
        // LS 1–3 direkt unter den Polen L1–L3 des RCD, ein vierter LS in Pfad 2 über eine
        // Querverbindung an den Eingang des ersten LS – derselbe Knoten wie der L1-Ausgang
        // des RCD, die Leitung kreuzt nichts.
        const pfad = i < 3 ? i + 3 : 2;
        const ls = m.neuesBauteil(k.bmk, "leitungsschutzschalter", pfad, 2, k.bemessung);
        ls.ort = "+UV-EG";
        ls.stromkreis = { verbraucher: k.verbraucher, leitung: k.leitung };
        blatt.bauteile.push(ls);
        if (i === 0) ersterLs = ls;
        if (i >= 3) blatt.verbindungen.push(m.neueVerbindung({ bauteilId: ls.id, anschluss: "1" }, { bauteilId: ersterLs.id, anschluss: "1" }));
        messwerte[ls.id] = k.werte;
      });
    };
    gruppe("Unterverteilung EG – RCD 1", "-1Q1");
    gruppe("Unterverteilung EG – RCD 2", "-2Q1");
    return messwerte;
  }

  // Prüfbericht der Musteranlage, Werte aus der Anlagenmappe (Erstprüfung 25.09.2026).
  function pruefberichtFuellen(pruefblatt, messwerte) {
    const P = LEITWERK_PRUEFPROTOKOLL;
    const pp = pruefblatt.pruefprotokoll = P.leer();
    Object.assign(pp, {
      art: "Änderung", protokollNr: "P-2026-01", umfang: "Unterverteilung EG (+UV-EG) mit allen Stromkreisen",
      messgeraet: { typ: "Gossen Metrawatt Profitest Prime", seriennummer: "123456", kalibriertBis: "03/2027" },
      naechstePruefung: "4 Jahre", werte: { potentialausgleich: "0,05" },
    });
    for (const p of P.PUNKTE) pp.bewertung[p.id] = "ok";
    pp.maengelfrei = true;
    const spalten = ["rpe", "riso", "zs", "ik", "idn", "ta"];
    for (const [id, werte] of Object.entries(messwerte)) {
      pp.stromkreise[id] = Object.fromEntries(spalten.map((s, i) => [s, werte[i]]));
    }
  }

  // Die beiden Vorlagen der Startseite: je ein vollständiges Projekt, frisch gebaut.
  const VORLAGEN = {
    folgeschaltung() {
      const m = M();
      const p = m.neuesProjekt({ plantitel: "Beispiel Folgeschaltung", anlage: "Zwei Motoren, M2 nur nach M1" });
      folgeschaltung(p, 1);
      m.blattEinfuegen(p, m.neuesErzeugtesBlatt("Stückliste", "stueckliste"));
      return p;
    },
    unterverteilung() {
      const m = M();
      const p = m.neuesProjekt({
        plantitel: "Beispiel Unterverteilung EG", anlage: "Musteranlage (Anlagenmappe)",
        errichter: "Muster-Elektro GmbH",
      });
      const messwerte = unterverteilung(p);
      m.blattEinfuegen(p, m.neuesErzeugtesBlatt("Stromkreisverzeichnis", "stromkreisverzeichnis"));
      const pruefblatt = m.neuesErzeugtesBlatt("Prüfprotokoll", "pruefprotokoll");
      m.blattEinfuegen(p, pruefblatt);
      pruefberichtFuellen(pruefblatt, messwerte);
      return p;
    },
  };

  return { folgeschaltung, unterverteilung, pruefberichtFuellen, bauen: (name) => VORLAGEN[name]() };
})();
