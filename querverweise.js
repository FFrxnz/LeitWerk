// Der Querverweis-Rechner. Das ist die eigentliche Arbeit dieser Sitzung: Nichts hier
// wird getippt. Blattnummer kommt aus der Position im Array, Rasterfeld aus x/y
// (raster.js), und der fertige Text "/10 A9" entsteht erst beim Aufruf – nie vorher.

const LEITWERK_QUERVERWEISE = (() => {
  // Formatiert einen Verweis auf eine Position (Blatt + Feld), z. B. "/10 A9".
  // Zeigt das Ziel-Blatt nicht mehr im Projekt (gelöscht), gibt es null zurück.
  function verweisAufPosition(projekt, blattId, x, y) {
    const nummer = LEITWERK_MODELL.blattNummer(projekt, blattId);
    if (nummer === null) return null;
    const feld = LEITWERK_RASTER.feldAusPosition(x, y);
    return `/${nummer} ${feld}`;
  }

  // Reiner Blattverweis ohne Feld, z. B. "/10" – für Fälle, in denen nur das Blatt zählt.
  function verweisAufBlatt(projekt, blattId) {
    const nummer = LEITWERK_MODELL.blattNummer(projekt, blattId);
    return nummer === null ? null : `/${nummer}`;
  }

  // Für ein Potenzial: sortiert seine Vorkommen nach der aktuellen Blattreihenfolge
  // (nicht nach der Reihenfolge im vorkommen-Array) und berechnet für jedes Vorkommen,
  // wo es herkommt (kommtVon) und wo es weiterläuft (weiterAuf). Erstes Vorkommen hat
  // kein kommtVon, letztes kein weiterAuf.
  function berechnePotenzialVerweise(projekt, potenzial) {
    const sortiert = potenzial.vorkommen
      .map((v) => ({ ...v, nummer: LEITWERK_MODELL.blattNummer(projekt, v.blattId) }))
      .filter((v) => v.nummer !== null)
      .sort((a, b) => a.nummer - b.nummer);

    return sortiert.map((v, i) => {
      const vorherige = sortiert[i - 1];
      const naechste = sortiert[i + 1];
      return {
        blattId: v.blattId,
        x: v.x,
        y: v.y,
        feld: LEITWERK_RASTER.feldAusPosition(v.x, v.y),
        kommtVon: vorherige ? verweisAufPosition(projekt, vorherige.blattId, vorherige.x, vorherige.y) : null,
        weiterAuf: naechste ? verweisAufPosition(projekt, naechste.blattId, naechste.x, naechste.y) : null,
      };
    });
  }

  // Für alle Potenziale im Projekt auf einmal, indiziert nach Potenzial-id.
  function berechneAlleVerweise(projekt) {
    const ergebnis = new Map();
    for (const potenzial of projekt.potenziale) {
      ergebnis.set(potenzial.id, berechnePotenzialVerweise(projekt, potenzial));
    }
    return ergebnis;
  }

  return { verweisAufPosition, verweisAufBlatt, berechnePotenzialVerweise, berechneAlleVerweise };
})();
