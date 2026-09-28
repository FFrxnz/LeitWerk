// Erzeugte Blätter: Blätter ohne eigenen Inhalt, deren Tabellen bei jedem Rendern aus dem
// übrigen Projekt ausgerechnet werden – derselbe Grundsatz wie beim Querverweis, nur für
// ein ganzes Blatt (FORMAT.md „Erzeugtes Blatt"). Nichts hier greift aufs DOM zu oder
// merkt sich etwas; app.js' zeichneErzeugtesBlatt() zeichnet das Ergebnis.
//
// Jeder erzeugte Typ ist eine Funktion (projekt, blatt, nr) → Liste von Tabellen:
//   { titel, untertitel, spalten: [{ name, breite }], zeilen: [{ zellen: [...], ziel }] }
// `breite` ist relativ, `ziel` optional eine Blatt-id (Antippen springt dorthin).
// Weitere Typen sind je ein weiterer Eintrag in ERZEUGER. `nr` liefert Blattnummern
// ({ nummer(id), text(id) }): beim Zeichnen die echten, beim Seitenzählen Platzhalter –
// die Zahl der Zeilen hängt nie von Nummern ab, so zählt sich nichts im Kreis.

const LEITWERK_ERZEUGT = (() => {
  const M = LEITWERK_MODELL;
  const S = LEITWERK_SYMBOLE;
  const R = LEITWERK_RASTER;

  // Inhaltsverzeichnis: eine Zeile je Blatt in Blattreihenfolge. Nummer = Position,
  // Typ = Anzeigename, Datum mit derselben Vererbung wie im Schriftfeld. Das Verzeichnis
  // selbst steht mit drin.
  function inhaltsverzeichnis(projekt, blatt, nr) {
    return [{
      titel: "Inhaltsverzeichnis",
      untertitel: projekt.meta.anlage || "",
      spalten: [
        { name: "Blatt", breite: 1 },
        { name: "Titel", breite: 6 },
        { name: "Typ", breite: 2.4 },
        { name: "Datum", breite: 1.8 },
      ],
      zeilen: projekt.blaetter.map((blatt) => ({
        zellen: [
          nr.text(blatt.id),
          blatt.titel,
          M.blatttypName(blatt.typ),
          M.schriftfeldWert(projekt, blatt, "datum"),
        ],
        ziel: blatt.id,
      })),
    }];
  }

  // Wie ein Bauteil in einer Zielspalte heißt: „-F1:1" (BMK:Anschluss), bei einer Klemme
  // „-X2:5" (Leiste:Nummer). Kontakte mit ihrer Kontaktnummer (-K1:13), Motoren mit dem
  // Klemmennamen (-M1:U1) – kontakte.js. `ord` = LEITWERK_KONTAKTE.ordnungen(projekt).
  function zielName(bauteil, anschluss, ord) {
    if (S.istKlemme(bauteil)) return `${bauteil.bmk}:${bauteil.klemme}`;
    if (anschluss === null) return bauteil.bmk;
    return `${bauteil.bmk}:${LEITWERK_KONTAKTE.anschlussText(ord, bauteil, anschluss)}`;
  }

  // Natürliche Sortierung von Klemmennummern: 2 vor 10, „9/PE" nach 8.
  const nachNummer = (a, b) => String(a).localeCompare(String(b), "de", { numeric: true });

  // Jede Reihenklemme im Strompfad mit ihren gerechneten Zielen – gemeinsame Grundlage für
  // Klemmenplan und Kabelplan, damit beide nie auseinanderlaufen.
  // → [{ k, blatt, oben: [...], unten: [...], funktion: [...] }]
  function klemmenZiele(projekt) {
    const ergebnis = [];
    const ord = LEITWERK_KONTAKTE.ordnungen(projekt);
    for (const blatt of M.zeichenblaetter(projekt)) {
      // Die Pole jedes Pfads nach Höhe – dieselbe Kette wie app.js' poleImPfad().
      const kette = (pfad) => blatt.bauteile
        .map((b) => ({ b, pol: pfad - b.pfad }))
        .filter(({ b, pol }) => pol >= 0 && pol < S.polZahl(b))
        .sort((x, y) => x.b.hoehe - y.b.hoehe);

      for (const k of blatt.bauteile.filter(S.istKlemme)) {
        const pfad = kette(k.pfad);
        const i = pfad.findIndex((e) => e.b === k);
        const ende = (e, seite) => S.kettenEnden(e.b, e.pol)[seite];
        const oben = [], unten = [], funktion = [];
        if (i > 0) oben.push(zielName(pfad[i - 1].b, ende(pfad[i - 1], "unten"), ord));
        if (i < pfad.length - 1) unten.push(zielName(pfad[i + 1].b, ende(pfad[i + 1], "oben"), ord));
        for (const v of blatt.verbindungen) {
          for (const [hier, dort] of [[v.von, v.bis], [v.bis, v.von]]) {
            if (hier.bauteilId !== k.id) continue;
            const gegen = blatt.bauteile.find((b) => b.id === dort.bauteilId);
            const name = gegen ? zielName(gegen, dort.anschluss, ord) : null;
            if (name) (hier.anschluss === "1" ? oben : unten).push(name);
          }
        }
        for (const schiene of Object.values(k.schienen || {})) funktion.push(schiene);
        ergebnis.push({ k, blatt, oben, unten, funktion });
      }
    }
    return ergebnis;
  }

  // Klemmenplan (Vorlage: IHK Teil 2 Winter 2024/25, raw/verarbeitet/2026/
  // ihk-teil2-winter-2024-25/gedreht/klemmenplan-x1-x2-x4-steckerleiste-x10.jpg): eine
  // Tabelle je Klemmenleiste, Spalten Funktion | Ziel | Klemme | Brücke | Ziel.
  // Gerechnet, nicht getippt: Eine Klemme sitzt im Strompfad, ihr Ziel oben ist das
  // Bauteil direkt darüber im selben Pfad, ihr Ziel unten das direkt darunter – genau die
  // Leitungen, die der Stromlaufplan zeichnet. Dazu gespeicherte Querverbindungen an einen
  // ihrer Anschlüsse. Hängt ein Ende an einer Sammelschiene, steht deren Name unter
  // Funktion. Brücken kennt das Format noch nicht – die Spalte bleibt leer, statt eine
  // Brücke aus gleichen Potenzialen zu erraten.
  function klemmenplan(projekt) {
    const leisten = new Map(); // BMK der Leiste → [{ nummer, zellen, ziel }]
    const leiste = (bmk) => { if (!leisten.has(bmk)) leisten.set(bmk, []); return leisten.get(bmk); };

    for (const { k, blatt, oben, unten, funktion } of klemmenZiele(projekt)) {
      leiste(k.bmk).push({
        nummer: k.klemme || "?",
        zellen: [funktion.join(", "), oben.join(", "), k.klemme || "?", "", unten.join(", ")],
        ziel: blatt.id,
      });
    }

    for (const blatt of M.zeichenblaetter(projekt)) {
      // Klemmenleisten alter Art (Liste mit x/y, FORMAT.md „Klemmenleiste"): ihre Klemmen
      // stehen mit im Plan, aber ohne Ziel – sie hängen an keinem Strompfad.
      for (const kl of blatt.klemmenleisten || []) {
        for (const klemme of kl.klemmen) {
          leiste(kl.bmk).push({ nummer: klemme.nummer, zellen: ["", "", klemme.nummer, "", ""], ziel: blatt.id });
        }
      }
    }

    const spalten = [
      { name: "Funktion", breite: 2 }, { name: "Ziel", breite: 2.4 }, { name: "Klemme", breite: 1.4 },
      { name: "Brücke", breite: 1.2 }, { name: "Ziel", breite: 2.4 },
    ];
    if (leisten.size === 0) {
      return [{
        titel: "Klemmenplan", untertitel: "", spalten: [{ name: "Hinweis", breite: 1 }],
        zeilen: [{ zellen: ["Noch keine Klemmen – Reihenklemme aus der Palette (9 Anschlüsse) in einen Strompfad setzen."] }],
      }];
    }
    return [...leisten.keys()].sort(nachNummer).map((bmk) => ({
      titel: `Reihenklemme ${bmk}`,
      untertitel: "",
      spalten,
      zeilen: leisten.get(bmk).sort((a, b) => nachNummer(a.nummer, b.nummer))
        .map(({ zellen, ziel }) => ({ zellen, ziel })),
    }));
  }

  // Stückliste (Stufe 4b): eine Zeile je Betriebsmittel, also je BMK über alle Blätter –
  // ein Schütz mit Spule und Kontakten auf drei Blättern ist ein Gerät, ein dreipoliges
  // ebenso. Eine Klemmenleiste ist eine Zeile, Anzahl = Zahl ihrer Klemmen. Benennung aus
  // dem Symbol (+ Betätigung), Angabe aus der Beschriftung („6 A"), Ort als Querverweis
  // „/2 B1". Typ und Hersteller kennt das Modell nicht – die Spalte bleibt zum Eintragen
  // leer, statt etwas zu erfinden.
  function stueckliste(projekt, blatt, nr) {
    const betaetigungName = Object.fromEntries(S.listeBetaetigungen().map((b) => [b.betaetigung, b.name]));
    const geraete = new Map(); // BMK → { anzahl, benennungen, angaben, orte, typen, ziel }
    const eintrag = (bmk, ziel) => {
      if (!geraete.has(bmk)) geraete.set(bmk, { anzahl: 0, benennungen: new Set(), angaben: new Set(), orte: new Set(), typen: new Set(), ziel });
      return geraete.get(bmk);
    };

    for (const blatt of M.zeichenblaetter(projekt)) {
      const nummer = nr.nummer(blatt.id);
      for (const b of blatt.bauteile) {
        const e = eintrag(b.bmk || "(ohne BMK)", blatt.id);
        const def = S.symbolVon(b);
        let benennung = def ? def.name : (b.kontakt || b.typ || "unbekanntes Symbol");
        if (b.kontakt && b.betaetigung && betaetigungName[b.betaetigung]) benennung += `, ${betaetigungName[b.betaetigung]}`;
        if (S.polZahl(b) > 1 && !S.festePole(b)) benennung += `, ${S.polZahl(b)}-polig`;
        e.benennungen.add(benennung);
        // Beschriftung als Angabe – außer sie wiederholt nur den Symbolnamen.
        if (b.beschriftung && !benennung.startsWith(b.beschriftung)) e.angaben.add(b.beschriftung);
        const p = R.positionInPfad(b.pfad, b.hoehe);
        e.orte.add(`/${nummer} ${R.feldAusPosition(p.x, p.y)}`);
        // Klemmen zählen einzeln, jedes andere Gerät einmal – egal wie oft es vorkommt.
        e.anzahl = S.istKlemme(b) ? e.anzahl + 1 : 1;
      }
      for (const kl of blatt.klemmenleisten || []) {
        const e = eintrag(kl.bmk, blatt.id);
        e.benennungen.add("Reihenklemme");
        e.anzahl += kl.klemmen.length;
        e.orte.add(`/${nummer} ${R.feldAusPosition(kl.x, kl.y)}`);
      }
    }

    // Kabel (seit 2026-09-26): je Kabel eine Zeile, belegte Adern gezählt, Typ aus
    // projekt.kabel in „Typ / Hersteller“, Ort = die erste Klemme im Plan. Wie im Kabelplan
    // ist ein Kabel nur die Menge der Klemmen mit diesem `kabel` – ohne Klemme keine Zeile.
    const kabelTypen = new Map((projekt.kabel || []).map((w) => [w.bmk, w.typ]));
    const kabelAdern = new Map(); // Kabel-BMK → Set der Adern
    for (const { k, blatt } of klemmenZiele(projekt)) {
      if (!k.kabel) continue;
      const e = eintrag(k.kabel, blatt.id);
      if (!kabelAdern.has(k.kabel)) {
        kabelAdern.set(k.kabel, new Set());
        const p = R.positionInPfad(k.pfad, k.hoehe);
        e.orte.add(`/${nr.nummer(blatt.id)} ${R.feldAusPosition(p.x, p.y)}`);
        if (kabelTypen.get(k.kabel)) e.typen.add(kabelTypen.get(k.kabel));
      }
      kabelAdern.get(k.kabel).add(k.ader || `${k.bmk}:${k.klemme}`);
    }
    for (const [bmk, adern] of kabelAdern) {
      const e = geraete.get(bmk);
      e.anzahl = 1;
      e.benennungen.add(`Kabel, ${adern.size === 1 ? "1 Ader" : `${adern.size} Adern`} belegt`);
    }

    const zeilen = [...geraete.keys()].sort(nachNummer).map((bmk) => {
      const e = geraete.get(bmk);
      return {
        zellen: [bmk, String(e.anzahl), [...e.benennungen].join(", "), [...e.angaben].join(", "), [...e.orte].join(", "), [...e.typen].join(", ")],
        ziel: e.ziel,
      };
    });
    return [{
      titel: "Stückliste",
      untertitel: projekt.meta.anlage || "",
      spalten: [
        { name: "BMK", breite: 1.2 }, { name: "Anz.", breite: 0.7 }, { name: "Benennung", breite: 4.2 },
        { name: "Angabe", breite: 1.8 }, { name: "Ort", breite: 1.8 }, { name: "Typ / Hersteller", breite: 2.6 },
      ],
      zeilen: zeilen.length ? zeilen : [{ zellen: ["", "", "Noch keine Bauteile im Projekt.", "", "", ""] }],
    }];
  }

  // Kabelplan (Stufe 4c): eine Tabelle je Kabel. Ein Kabel ist nichts Gespeichertes, sondern
  // alle Klemmen mit demselben `kabel` (FORMAT.md „Kabel"); aus projekt.kabel kommt nur der
  // Typ. Funktion und Ziele sind dieselben wie im Klemmenplan (klemmenZiele).
  function kabelplan(projekt, blatt, nr) {
    const typen = new Map((projekt.kabel || []).map((w) => [w.bmk, w.typ]));
    const kabel = new Map(); // Kabel-BMK → [{ ader, zellen, ziel }]
    for (const { k, blatt, oben, unten, funktion } of klemmenZiele(projekt)) {
      if (!k.kabel) continue;
      if (!kabel.has(k.kabel)) kabel.set(k.kabel, []);
      const p = R.positionInPfad(k.pfad, k.hoehe);
      kabel.get(k.kabel).push({
        ader: k.ader || "",
        klemme: `${k.bmk}:${k.klemme || ""}`,
        zellen: [k.ader || "?", funktion.join(", "), `${k.bmk}:${k.klemme || "?"}`, oben.join(", "), unten.join(", "),
          `/${nr.nummer(blatt.id)} ${R.feldAusPosition(p.x, p.y)}`],
        ziel: blatt.id,
      });
    }
    const spalten = [
      { name: "Ader", breite: 1 }, { name: "Funktion", breite: 1.6 }, { name: "Klemme", breite: 1.6 },
      { name: "Ziel", breite: 2.2 }, { name: "Ziel", breite: 2.2 }, { name: "Ort", breite: 1.4 },
    ];
    if (kabel.size === 0) {
      return [{
        titel: "Kabelplan", untertitel: "", spalten: [{ name: "Hinweis", breite: 1 }],
        zeilen: [{ zellen: ["Noch keine Kabel – Reihenklemme auswählen und im Feld „Kabel\" z. B. -W1:3 eintragen (Kabel:Ader)."] }],
      }];
    }
    // Adern nach Nummer, wenn alle nummeriert sind; Farben (bn, sw, gr) haben keine
    // Reihenfolge, die sich sortieren ließe – dann in Klemmenfolge.
    const reihenfolge = (adern) => adern.every((a) => /^\d+$/.test(a.ader))
      ? (a, b) => nachNummer(a.ader, b.ader)
      : (a, b) => nachNummer(a.klemme, b.klemme);
    return [...kabel.keys()].sort(nachNummer).map((bmk) => ({
      titel: `Kabel ${bmk}`,
      untertitel: typen.get(bmk) || "Typ fehlt",
      spalten,
      zeilen: kabel.get(bmk).sort(reihenfolge(kabel.get(bmk))).map(({ zellen, ziel }) => ({ zellen, ziel })),
    }));
  }

  // Stromkreisverzeichnis (DIN VDE 0100-510, 514.5): eine Zeile je Schutzeinrichtung –
  // Art und Bemessung aus dem Plan, Verbraucher/Leitung/Länge/Ik/Ausschaltvermögen und
  // Einbauort vom Bauteil (stromkreise.js), Lage im Plan als Querverweis.
  function stromkreisverzeichnis(projekt, blatt, nr) {
    const SK = LEITWERK_STROMKREISE;
    const zeilen = SK.liste(projekt, nr.nummer).map((k) => ({
      zellen: [k.bmk, k.art, k.bemessung, ...SK.FELDER.map((f) => k.daten[f.id] || ""), k.ort, k.planOrt],
      ziel: k.blatt.id,
    }));
    return [{
      titel: "Stromkreisverzeichnis",
      untertitel: [projekt.meta.anlage, "DIN VDE 0100-510"].filter(Boolean).join(" · "),
      spalten: [
        { name: "BMK", breite: 1 }, { name: "Schutzeinrichtung", breite: 3.6 }, { name: "Bemessung", breite: 1.2 },
        { name: "Verbraucher / Funktion", breite: 3 }, { name: "Leitung", breite: 2 }, { name: "Länge", breite: 0.9 },
        { name: "Ik", breite: 0.9 }, { name: "Ausschaltv.", breite: 1.1 }, { name: "Einbauort", breite: 1.4 },
        { name: "Plan", breite: 1.1 },
      ],
      zeilen,
    }];
  }

  const ERZEUGER = { inhaltsverzeichnis, klemmenplan, stueckliste, kabelplan, stromkreisverzeichnis };

  // Prüfbericht (DIN VDE 0100-600, 6.4.4): Seite 1 ist das Protokoll selbst (app.js), die
  // Folgeseiten tragen die Messwerte je Stromkreis – eine Zeile je Schutzeinrichtung, dazu
  // alte Messwerte je Klemme, falls ein älteres Protokoll welche hat. Keine Zeilen, keine
  // Folgeseite.
  function pruefMesswerte(projekt, blatt, nr) {
    const P = LEITWERK_PRUEFPROTOKOLL;
    const SK = LEITWERK_STROMKREISE;
    const pp = blatt.pruefprotokoll || P.leer();
    const gemessen = (id) => (pp.stromkreise || {})[id] || {};
    const zeilen = SK.liste(projekt, nr.nummer).map((k) => ({
      zellen: [k.bmk, k.art, k.bemessung, k.daten.verbraucher || "", ...P.MESSGROESSEN.map((g) => gemessen(k.bauteil.id)[g.id] || "")],
    }));
    for (const { klemme, werte } of P.klemmenwerte(pp)) {
      zeilen.push({ zellen: [klemme, "Klemme (älteres Protokoll)", "", "", ...P.MESSGROESSEN.map((g) => werte[g.id] || "")] });
    }
    if (!zeilen.length) return [];
    return [{
      titel: "Prüfbericht – Messwerte je Stromkreis",
      untertitel: "DIN VDE 0100-600, 6.4.4",
      spalten: [
        { name: "Stromkreis", breite: 1.1 }, { name: "Schutzeinrichtung", breite: 3 }, { name: "Bemessung", breite: 1.1 },
        { name: "Verbraucher", breite: 2.6 },
        ...P.MESSGROESSEN.map((g) => ({ name: `${g.name} ${g.einheit}`, breite: 1 })),
      ],
      zeilen,
    }];
  }

  const ECHTE_NUMMERN = (projekt) => ({
    nummer: (id) => M.blattNummer(projekt, id),
    text: (id) => M.blattNummernText(projekt, id),
  });
  const PLATZHALTER = { nummer: () => 0, text: () => "" };

  // Die Tabellen eines erzeugten Blatts; [] für einen Typ ohne Erzeuger.
  function tabellen(projekt, blatt, nr = ECHTE_NUMMERN(projekt)) {
    if (blatt.typ === "pruefprotokoll") return pruefMesswerte(projekt, blatt, nr);
    const erzeuger = ERZEUGER[blatt.typ];
    return erzeuger ? erzeuger(projekt, blatt, nr) : [];
  }

  // Folgeblätter: Jede Tabelle wird in Stücke zu höchstens so vielen Zeilen geteilt, wie auf
  // eine Seite passen (Stück 2 ff. mit „(Fortsetzung)" im Titel); die Stücke laufen der
  // Reihe nach über die Seiten, bis zu drei nebeneinander. → [{ tabellen, spalten }] je Seite.
  const MAX_NEBENEINANDER = 3;
  function seiten(projekt, blatt, nr = ECHTE_NUMMERN(projekt)) {
    const alle = tabellen(projekt, blatt, nr);
    if (alle.length === 0) return [{ tabellen: [], spalten: 1 }];
    const spalten = Math.min(alle.length, MAX_NEBENEINANDER);
    const maxZeilen = Math.max(1, R.tabellenBereiche(spalten)[0].maxZeilen);
    const stuecke = [];
    for (const t of alle) {
      for (let i = 0; i === 0 || i < t.zeilen.length; i += maxZeilen) {
        stuecke.push({ ...t, titel: i === 0 ? t.titel : `${t.titel} (Fortsetzung)`, zeilen: t.zeilen.slice(i, i + maxZeilen) });
      }
    }
    const ergebnis = [];
    for (let i = 0; i < stuecke.length; i += spalten) ergebnis.push({ tabellen: stuecke.slice(i, i + spalten), spalten });
    return ergebnis;
  }

  // Seitenzahl ohne echte Nummern (sonst fragte blattNummer sich über die Stückliste selbst).
  // Prüfbericht: Seite 1 plus die Messwert-Seiten (nur wenn es Messzeilen gibt).
  M.seitenzaehlerSetzen((projekt, blatt) => {
    if (blatt.typ === "pruefprotokoll") return 1 + (tabellen(projekt, blatt, PLATZHALTER).length ? seiten(projekt, blatt, PLATZHALTER).length : 0);
    return ERZEUGER[blatt.typ] ? seiten(projekt, blatt, PLATZHALTER).length : 1;
  });

  return { tabellen, seiten };
})();
