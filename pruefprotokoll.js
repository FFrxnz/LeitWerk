// Prüfprotokoll nach DIN VDE 0100-600 (Stufe 5). Vorlage: IHK Teil 2 Winter 2024/25,
// raw/verarbeitet/2026/ihk-teil2-winter-2024-25/gedreht/pruefprotokoll-vde-0100-600-
// arbeitsauftrag.jpg und …-messen-pruefen.jpg. Die Prüfpunkte hier sind die der Vorlage,
// Wort für Wort; Grenzwerte stehen dort keine, also auch hier keine.
//
// Ein Prüfprotokoll ist ein Formularblatt (FORMAT.md „Prüfprotokoll"): Was sich aus dem
// Projekt ergibt (Auftraggeber, Anlage, Blattnummer, Datum, Messpunkte = Klemmen), wird
// gerechnet; gespeichert in blatt.pruefprotokoll wird nur, was man tippt oder ankreuzt.
// Nichts hier greift aufs DOM zu – app.js zeichnet Formular und Druckseite.

//
// Seit 2026-09-25 ein Prüfbericht nach DIN VDE 0100-600, 6.4.4: Messwerte **je Stromkreis**
// (Zeilen = Schutzeinrichtungen, stromkreise.js), Umfang der Anlage, Verantwortliche für
// Planung/Errichtung/Prüfung, Messgerät mit Kalibrierstand, Empfehlung für die erste
// Wiederholungsprüfung. Alte Messwerte je Klemme bleiben erhalten und werden mit angezeigt.

const LEITWERK_PRUEFPROTOKOLL = (() => {
  const M = LEITWERK_MODELL;
  const SK = LEITWERK_STROMKREISE;

  const ARTEN = ["Neuanlage", "Erweiterung", "Änderung", "Instandsetzung"];

  // Abschnitte und Punkte der Vorlage. `wert`: Einheit eines einzelnen gemessenen Werts,
  // `tabelle`: Einheit einer Messpunkt-Tabelle (eine Zeile je Klemme).
  const ABSCHNITTE = [
    { titel: "Besichtigung", punkte: [
      { id: "unterlagen", titel: "Schaltungsunterlagen komplett", detail: "Vervollständigung aller Unterlagen, Übereinstimmung" },
      { id: "betriebsmittel", titel: "Betriebsmittel", detail: "Richtige Auswahl, keine Schäden, Betriebsmittelkennzeichnung" },
      { id: "anschluesse", titel: "Leitungsanschlüsse", detail: "Isolierung, Absetzen, Befestigung" },
      { id: "leitung", titel: "Leitungswahl und Verlegung", detail: "Leitungstyp, Querschnitt, Farbe, ordnungsgemäße Verlegung" },
      { id: "pen", titel: "PE- und N-Leiter", detail: "Auswahl, Anschluss, Verlegung, Kennzeichnung" },
      { id: "beruehren", titel: "Schutzmaßnahmen gegen direktes Berühren", detail: "Fingersicherheit, Abdeckungen" },
      { id: "ueberstrom", titel: "Überstromschutzeinrichtungen", detail: "Auswahl, Einstellungen" },
      { id: "maengel", titel: "Zum Zeitpunkt der Prüfung keine erkennbaren Mängel", detail: "" },
    ]},
    { titel: "Messen / Prüfen", punkte: [
      { id: "schutzleiter", titel: "Durchgängigkeit des Schutzleiters", detail: "je Stromkreis siehe Messwerte" },
      { id: "potentialausgleich", titel: "Schutzpotentialausgleich", detail: "Haupterdungsschiene, Verbindungen", wert: "Ω" },
      { id: "isolation", titel: "Isolationsmessung", detail: "je Stromkreis siehe Messwerte" },
      { id: "abschaltung", titel: "Schleifenimpedanz / Abschaltbedingung", detail: "je Stromkreis siehe Messwerte" },
      { id: "rcdSpannung", titel: "RCD", detail: "Berührungsspannung", wert: "V" },
      { id: "rcdZeit", titel: "Auslösezeit im Stromkreis mit RCD", detail: "", wert: "ms" },
      { id: "drehfeld", titel: "Drehfeldprüfung", detail: "Rechtsdrehfeld" },
    ]},
    { titel: "Erprobung", punkte: [
      { id: "funktion", titel: "Funktion der Anlage", detail: "Funktion gemäß Schaltplan" },
      { id: "rcdFunktion", titel: "Funktion RCD", detail: "Prüftaste aktivieren" },
    ]},
  ];

  const PUNKTE = ABSCHNITTE.flatMap((a) => a.punkte);

  // Messgrößen je Stromkreis (Spalten der Messtabelle). Grenzwerte nur als Hinweis (unten),
  // bewertet wird oben über OK / nicht OK.
  const MESSGROESSEN = [
    { id: "rpe", name: "R_PE", einheit: "Ω", titel: "Schutzleiterwiderstand" },
    { id: "riso", name: "R_ISO", einheit: "MΩ", titel: "Isolationswiderstand" },
    { id: "zs", name: "Z_S", einheit: "Ω", titel: "Schleifenimpedanz" },
    { id: "ik", name: "I_k", einheit: "A", titel: "Kurzschlussstrom" },
    { id: "idn", name: "I_Δ", einheit: "mA", titel: "RCD-Auslösestrom" },
    { id: "ta", name: "t_A", einheit: "ms", titel: "RCD-Auslösezeit" },
    { id: "ub", name: "U_B", einheit: "V", titel: "Berührungsspannung" },
  ];

  // Grenzwerte als Hinweis am Bildschirm (2026-09-26). Nur, was im Tabellenbuch mit Zahlen
  // steht – nichts sperrt, nichts wird bewertet, der Druck bleibt gleich.
  // - R_ISO ≥ 1 MΩ (Bemessungsspannung bis AC 500 V, Messspannung DC 500 V); SELV/PELV
  //   ≥ 0,5 MΩ – Tabellenbuch S. 115 „Mindestwerte der Isolation“.
  // - I_k ≥ I_a = I_N · m, Endstromkreise ≤ 32 A: m = 5 / 10 / 20 für LS B / C / D –
  //   S. 115 (Beispiel LS16B: 80 A), Formel 3 auf S. 246.
  // - U_B ≤ 50 V (25 V) – S. 115, Auslösestrom von RCD.
  // - Z_S ≤ 2/3 · U₀ / I_a mit U₀ = 230 V (Formel 5 S. 246; U₀ = 230 V entschieden von
  //   Franz 2026-09-28), I_a wie oben.
  // - RCD: Abschaltung beim Bemessungsdifferenzstrom innerhalb 300 ms (DIN EN 61008-1,
  //   Siemens Technik-Fibel Fehlerstrom-Schutzeinrichtungen S. 17), also I_Δ ≤ I_ΔN und
  //   t_A ≤ 300 ms. Selektive RCD (Typ S) ohne Zeithinweis – die Fibel zeigt ihre Grenze nur
  //   als Kurve.
  const U0 = 230;
  const ZEIT_RCD = 300;
  function zahl(text) {
    const m = String(text).replace(/\s/g, "").match(/^[<>≤≥~]?(\d+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  }
  function deutsch(x) { return String(x).replace(".", ","); }

  function grenzwertHinweis(groesse, text, kreis = {}) {
    const wert = zahl(text);
    if (wert === null) return null;
    if (groesse === "riso" && wert < 1) {
      return "Mindestwert 1 MΩ (bei SELV/PELV 0,5 MΩ) – Tabellenbuch S. 115";
    }
    if (groesse === "ub" && wert > 50) {
      return "Höchstens 50 V Berührungsspannung (in besonderen Bereichen 25 V) – Tabellenbuch S. 115";
    }
    if ((groesse === "ik" || groesse === "zs") && kreis.typ === "leitungsschutzschalter") {
      const b = String(kreis.bemessung || "").replace(/\s/g, "").match(/^([BCD])(\d+(?:[.,]\d+)?)/i);
      if (!b) return null;
      const iN = parseFloat(b[2].replace(",", "."));
      const m = { B: 5, C: 10, D: 20 }[b[1].toUpperCase()];
      if (iN > 32) return null;
      if (groesse === "ik" && wert < iN * m) {
        return `Mindestens ${deutsch(iN * m)} A Abschaltstrom (I_a = ${deutsch(iN)} A × ${m}, LS ${b[1].toUpperCase()}) – Tabellenbuch S. 115`;
      }
      const zsMax = Math.floor((2 / 3) * U0 / (iN * m) * 100) / 100;
      if (groesse === "zs" && wert > zsMax) {
        return `Höchstens ${deutsch(zsMax)} Ω Schleifenimpedanz (2/3 · ${U0} V / ${deutsch(iN * m)} A, LS ${b[1].toUpperCase()}${deutsch(iN)}) – Tabellenbuch S. 246, Formel 5`;
      }
    }
    if ((groesse === "idn" || groesse === "ta") && kreis.fehlerstrom) {
      const text = String(kreis.bemessung || "");
      if (groesse === "ta") {
        if (/\bTyp\s*S\b|selektiv|\bS\s*$/i.test(text)) return null;
        if (wert > ZEIT_RCD) return `Höchstens ${ZEIT_RCD} ms beim Bemessungsdifferenzstrom (DIN EN 61008-1) – Technik-Fibel Fehlerstrom S. 17`;
      }
      if (groesse === "idn") {
        const d = text.replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)(mA|A)(?!.*\d+(?:[.,]\d+)?(mA|A))/i);
        if (!d) return null;
        const iDn = parseFloat(d[1].replace(",", ".")) * (d[2].toLowerCase() === "a" ? 1000 : 1);
        if (wert > iDn) return `Höchstens ${deutsch(iDn)} mA – der RCD muss spätestens bei I_ΔN = ${deutsch(iDn)} mA auslösen – Technik-Fibel Fehlerstrom S. 17`;
      }
    }
    return null;
  }

  function leer() {
    return {
      art: "", kundenNr: "", protokollNr: "", auftragnehmer: "", pruefer: null, ort: "",
      bewertung: {}, werte: {}, messpunkte: {}, maengelfrei: false,
      umfang: "", verantwortlich: { planung: "", errichtung: "", pruefung: "" },
      messgeraet: { typ: "", seriennummer: "", kalibriertBis: "" },
      naechstePruefung: "", bemerkungen: "", stromkreise: {},
    };
  }

  // Fehlende Felder ergänzen (älter gespeicherte oder von Hand gebaute Protokolle).
  function vervollstaendigen(pp) {
    const basis = leer();
    for (const [k, v] of Object.entries(basis)) if (pp[k] === undefined) pp[k] = v;
    for (const k of ["verantwortlich", "messgeraet"]) {
      for (const [f, v] of Object.entries(basis[k])) if (pp[k][f] === undefined) pp[k][f] = v;
    }
    return pp;
  }

  // Messpunkte = alle Reihenklemmen des Projekts, natürlich sortiert. Gerechnet: kommt im
  // Plan eine Klemme dazu, hat die Tabelle eine Zeile mehr.
  function messpunkte(projekt) {
    const namen = new Set();
    for (const blatt of M.zeichenblaetter(projekt)) {
      for (const b of blatt.bauteile) {
        if (b.typ === "klemme") namen.add(`${b.bmk}:${b.klemme || "?"}`);
      }
    }
    return [...namen].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  }

  // Alte Protokolle hatten Messwerte je Klemme (pp.messpunkte). Nur die, in denen etwas
  // steht, werden weiter gezeigt – als Zeilen „Klemme …“ unter den Stromkreisen.
  function klemmenwerte(pp) {
    const zeilen = new Map();
    for (const [punkt, spalte] of [["schutzleiter", "rpe"], ["isolation", "riso"]]) {
      for (const [klemme, wert] of Object.entries(pp.messpunkte[punkt] || {})) {
        if (!wert) continue;
        if (!zeilen.has(klemme)) zeilen.set(klemme, {});
        zeilen.get(klemme)[spalte] = wert;
      }
    }
    return [...zeilen.entries()].sort(([a], [b]) => a.localeCompare(b, "de", { numeric: true }))
      .map(([klemme, werte]) => ({ klemme, werte }));
  }

  // Die Messwerte eines Stromkreises (Schlüssel: Bauteil-id, übersteht Umbenennen); {} wenn keine.
  function messwerte(pp, bauteilId) {
    return pp.stromkreise[bauteilId] || {};
  }

  // Alles, was Formular und Druckseite anzeigen – gerechnet plus gespeichert.
  function ansicht(projekt, blatt) {
    const pp = vervollstaendigen(blatt.pruefprotokoll ||= leer());
    const bewertet = PUNKTE.filter((p) => pp.bewertung[p.id]).length;
    const nichtOk = PUNKTE.filter((p) => pp.bewertung[p.id] === "nok").length;
    const alleOk = PUNKTE.every((p) => pp.bewertung[p.id] === "ok");
    return {
      pp,
      stamm: {
        blattnummer: String(M.blattNummer(projekt, blatt.id)),
        auftraggeber: M.schriftfeldWert(projekt, blatt, "auftraggeber"),
        anlage: M.schriftfeldWert(projekt, blatt, "anlage"),
        pruefer: pp.pruefer ?? projekt.meta.ersteller ?? "",
        datum: M.schriftfeldWert(projekt, blatt, "datum"),
        // Auftragnehmer und Errichter: getippt oder der Errichter aus den Projektangaben.
        auftragnehmer: pp.auftragnehmer || projekt.meta.errichter || "",
        errichtung: pp.verantwortlich.errichtung || projekt.meta.errichter || "",
        pruefung: pp.verantwortlich.pruefung || pp.pruefer || projekt.meta.ersteller || "",
      },
      messpunkte: messpunkte(projekt),
      stromkreise: SK.liste(projekt),
      klemmenwerte: klemmenwerte(pp),
      gesamt: PUNKTE.length, bewertet, nichtOk, alleOk,
      // „mängelfrei" gilt nur, solange wirklich alles OK ist – wird danach ein Punkt
      // „nicht OK", fällt der Haken von selbst weg, statt Falsches zu bestätigen.
      maengelfrei: alleOk && pp.maengelfrei,
    };
  }

  return { ARTEN, ABSCHNITTE, PUNKTE, MESSGROESSEN, grenzwertHinweis, leer, ansicht, messpunkte, messwerte, klemmenwerte };
})();
