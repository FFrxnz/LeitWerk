// Stromkreise (DIN VDE 0100-510, 514.5): Jede Schutzeinrichtung im Plan – Sicherung, LS,
// Motorschutz-, Leistungs-, Fehlerstrom-Schutzschalter – begrenzt einen Stromkreis. Was
// sich aus dem Plan ergibt (BMK, Art, Polzahl, Lage im Plan), wird gerechnet; was sich
// nicht rechnen lässt (Verbraucher, Leitung, Länge, Kurzschlussstrom, Ausschaltvermögen),
// steht am Bauteil in `stromkreis`, der Einbauort in `ort` (FORMAT.md „Bauteil“).
// Grundlage für das Stromkreisverzeichnis (erzeugte-blaetter.js) und die Messtabelle des
// Prüfberichts (pruefprotokoll.js). Nichts hier greift aufs DOM zu.

const LEITWERK_STROMKREISE = (() => {
  const M = LEITWERK_MODELL;
  const S = LEITWERK_SYMBOLE;
  const R = LEITWERK_RASTER;

  // Die Felder, die man je Stromkreis einträgt – Reihenfolge = Spalten.
  const FELDER = [
    { id: "verbraucher", name: "Verbraucher / Funktion", platzhalter: "z. B. Steckdosen Küche" },
    { id: "leitung", name: "Leitung", platzhalter: "NYM-J 3×2,5" },
    { id: "laenge", name: "Länge", platzhalter: "m" },
    { id: "ik", name: "Ik", platzhalter: "kA" },
    { id: "ausschaltvermoegen", name: "Ausschaltverm.", platzhalter: "kA" },
  ];

  const nachBmk = (a, b) => a.bmk.localeCompare(b.bmk, "de", { numeric: true }) || a.blattIndex - b.blattIndex;

  // Alle Schutzeinrichtungen des Projekts, nach BMK sortiert. `nr(id)` liefert die
  // Blattnummer (echt oder Platzhalter, siehe erzeugte-blaetter.js).
  function liste(projekt, nr = (id) => M.blattNummer(projekt, id)) {
    const ergebnis = [];
    M.zeichenblaetter(projekt).forEach((blatt, blattIndex) => {
      for (const b of blatt.bauteile) {
        if (!S.istSchutz(b)) continue;
        const def = S.symbolVon(b);
        const pole = S.polZahl(b);
        const p = R.positionInPfad(b.pfad, b.hoehe);
        ergebnis.push({
          bauteil: b, blatt, blattIndex,
          bmk: b.bmk || "(ohne BMK)",
          art: pole > 1 ? `${def.name}, ${pole}-polig` : def.name,
          bemessung: b.beschriftung && !def.name.startsWith(b.beschriftung) ? b.beschriftung : "",
          fehlerstrom: S.istFehlerstromschutz(b),
          ort: b.ort || "",
          daten: b.stromkreis || {},
          planOrt: `/${nr(blatt.id)} ${R.feldAusPosition(p.x, p.y)}`,
        });
      }
    });
    return ergebnis.sort(nachBmk);
  }

  // Schreibt ein Feld eines Stromkreises ans Bauteil; leere Werte werden entfernt, ein
  // leeres `stromkreis` verschwindet ganz (nichts Leeres speichern).
  function feldSetzen(bauteil, feld, wert) {
    if (feld === "ort") {
      if (wert) bauteil.ort = wert; else delete bauteil.ort;
      return;
    }
    if (feld === "bemessung") { bauteil.beschriftung = wert; return; }
    const sk = bauteil.stromkreis || {};
    if (wert) sk[feld] = wert; else delete sk[feld];
    if (Object.keys(sk).length) bauteil.stromkreis = sk; else delete bauteil.stromkreis;
  }

  return { FELDER, liste, feldSetzen };
})();
