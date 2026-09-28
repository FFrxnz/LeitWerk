// Blattgeometrie A4 quer: Rahmen, Rasterfelder, Schriftfeld. Alles in Millimetern,
// 1 SVG-Einheit = 1 mm, damit ein späterer Vektor-PDF-Export die Zahlen direkt übernehmen kann.

const LEITWERK_RASTER = (() => {
  const BLATT_BREITE = 297;
  const BLATT_HOEHE = 210;

  const RAHMEN = { links: 10, rechts: 5, oben: 5, unten: 5 };
  const RAHMEN_X = RAHMEN.links;
  const RAHMEN_Y = RAHMEN.oben;
  const RAHMEN_BREITE = BLATT_BREITE - RAHMEN.links - RAHMEN.rechts;
  const RAHMEN_HOEHE = BLATT_HOEHE - RAHMEN.oben - RAHMEN.unten;

  // Streifen innerhalb des Rahmens, in dem Spaltenzahlen/Zeilenbuchstaben stehen.
  const BESCHRIFTUNG_STREIFEN = 6;

  const RASTER_X = RAHMEN_X + BESCHRIFTUNG_STREIFEN;
  const RASTER_Y = RAHMEN_Y + BESCHRIFTUNG_STREIFEN;
  const RASTER_BREITE = RAHMEN_BREITE - 2 * BESCHRIFTUNG_STREIFEN;
  const RASTER_HOEHE = RAHMEN_HOEHE - 2 * BESCHRIFTUNG_STREIFEN;

  const SPALTEN = 6;
  const ZEILEN = 6;
  const ZEILEN_BUCHSTABEN = "ABCDEF";

  const SPALTE_BREITE = RASTER_BREITE / SPALTEN;
  const ZEILE_HOEHE = RASTER_HOEHE / ZEILEN;

  const SCHRIFTFELD = {
    breite: 120,
    hoehe: 30,
    get x() { return RAHMEN_X + RAHMEN_BREITE - this.breite; },
    get y() { return RAHMEN_Y + RAHMEN_HOEHE - this.hoehe; },
  };

  function clamp(wert, min, max) {
    return Math.max(min, Math.min(max, wert));
  }

  // Rechnet eine Position auf dem Blatt in ein Rasterfeld um, z. B. "C4".
  // Das ist die einzige Stelle, die das darf – ein Feld wird nie getippt.
  function feldAusPosition(x, y) {
    const spalteIndex = clamp(Math.floor((x - RASTER_X) / SPALTE_BREITE), 0, SPALTEN - 1);
    const zeileIndex = clamp(Math.floor((y - RASTER_Y) / ZEILE_HOEHE), 0, ZEILEN - 1);
    return ZEILEN_BUCHSTABEN[zeileIndex] + (spalteIndex + 1);
  }

  // Mittelpunkt eines Rasterfelds, z. B. für die Platzierung von Beschriftungen.
  function mitteVonFeld(feld) {
    const zeileIndex = ZEILEN_BUCHSTABEN.indexOf(feld[0]);
    const spalteIndex = parseInt(feld.slice(1), 10) - 1;
    return {
      x: RASTER_X + (spalteIndex + 0.5) * SPALTE_BREITE,
      y: RASTER_Y + (zeileIndex + 0.5) * ZEILE_HOEHE,
    };
  }

  // Rastert eine Position auf den nächsten Kreuzungspunkt des Feinrasters ein
  // (für spätere interaktive Platzierung in Stufe 1).
  const FEINRASTER = 2.5;
  function einrasten(x, y) {
    return {
      x: Math.round(x / FEINRASTER) * FEINRASTER,
      y: Math.round(y / FEINRASTER) * FEINRASTER,
    };
  }

  // ---- Strompfad (Vorbild E-Plan) -------------------------------------------------------
  // Ein Stromlaufplan zeichnet keine Leitungen zwischen Bauteilen im selben Strompfad –
  // sie sitzen einfach im selben Pfad und sind dadurch verbunden. Die sechs Rasterspalten
  // SIND die Strompfade (Pfad 1–6, dieselbe Nummerierung wie beim Rasterfeld). Ein Bauteil
  // bekommt `pfad` + `hoehe` (Position von oben, 1 = oberste), nie ein freies x/y – die
  // Millimeter-Position ergibt sich hier, wie das Rasterfeld sich aus x/y ergibt.

  // ---- Sammelschienen ---------------------------------------------------------------------
  // Ein Blatt hat eine Liste von Schienen (L1, L2, L3, N, PE oben; L+, L- unten …), jede nur
  // Name + Lage, siehe FORMAT.md „Sammelschiene". Die y-Lage wird hier ausgerechnet, nie
  // gespeichert: die Schienen einer Lage liegen in Array-Reihenfolge im festen Abstand
  // übereinander – oben ab knapp unter der Rasteroberkante, unten so, dass die letzte knapp
  // über dem Schriftfeld liegt (nicht durch es hindurch).
  const SCHIENEN_SCHRITT = 4;
  const MAX_SCHIENEN_JE_LAGE = 5;
  const SCHIENE_OBEN_ERSTE_Y = RASTER_Y + 5;
  const SCHIENE_UNTEN_LETZTE_Y = SCHRIFTFELD.y - 4;
  // Links an jeder Schiene bleibt Platz für ihren Namen (und bei PE das Anschlusszeichen).
  const SCHIENE_X1 = RASTER_X + 8;
  const SCHIENE_X2 = RASTER_X + RASTER_BREITE;

  // Die Art einer Schiene folgt aus ihrem Namen, sie wird nicht gespeichert.
  function schienenArt(name) {
    if (name === "PE") return "schutz";
    if (name === "PEN") return "pen";
    if (name === "N") return "neutral";
    return "leiter";
  }

  // [{ name, lage, art, y }] in Array-Reihenfolge – die einzige Stelle, die die y-Lage
  // einer Schiene kennt.
  function schienenLagen(schienen = []) {
    const oben = schienen.filter((s) => s.lage === "oben");
    const unten = schienen.filter((s) => s.lage === "unten");
    return schienen.map((s) => {
      const y = s.lage === "oben"
        ? SCHIENE_OBEN_ERSTE_Y + oben.indexOf(s) * SCHIENEN_SCHRITT
        : SCHIENE_UNTEN_LETZTE_Y - (unten.length - 1 - unten.indexOf(s)) * SCHIENEN_SCHRITT;
      return { name: s.name, lage: s.lage, art: schienenArt(s.name), y };
    });
  }

  // Abstand von der Rasteroberkante zur ersten Bauteil-Position (Höhe 1) in einem Pfad –
  // fest unter der fünften möglichen oberen Schiene plus Platz für die obere Zuleitung,
  // damit Höhe 1 auf jedem Blatt gleich liegt, egal wie viele Schienen es hat.
  const STROMPFAD_RAND = SCHIENE_OBEN_ERSTE_Y - RASTER_Y + (MAX_SCHIENEN_JE_LAGE - 1) * SCHIENEN_SCHRITT + 11;
  // Senkrechter Abstand zwischen zwei Höhen-Stufen im selben Strompfad.
  const STROMPFAD_SCHRITT = 24;

  // x-Koordinate der Mittelachse eines Strompfads (= Mitte der Rasterspalte).
  function pfadX(pfad) {
    return RASTER_X + (pfad - 0.5) * SPALTE_BREITE;
  }

  // mm-Position eines Bauteils aus Pfad + Höhe – die einzige Stelle, die das darf.
  function positionInPfad(pfad, hoehe) {
    return { x: pfadX(pfad), y: RASTER_Y + STROMPFAD_RAND + (hoehe - 1) * STROMPFAD_SCHRITT };
  }

  // Welcher Strompfad zu einer x-Koordinate gehört (fürs Platzieren per Klick/Stift).
  function pfadAusX(x) {
    return clamp(Math.floor((x - RASTER_X) / SPALTE_BREITE), 0, SPALTEN - 1) + 1;
  }

  // Nächstgelegene Höhen-Stufe zu einer y-Koordinate (mindestens 1).
  function hoeheAusY(y) {
    return Math.max(1, Math.round((y - RASTER_Y - STROMPFAD_RAND) / STROMPFAD_SCHRITT) + 1);
  }

  // ---- Baugruppenrahmen ------------------------------------------------------------------
  // Ein Baugruppenrahmen (z. B. -A1) umschließt eine Gruppe von Strompfaden, kein freies
  // Rechteck mehr: `pfadVon`/`pfadBis` + `hoeheVon`/`hoeheBis` (dieselben Einheiten wie ein
  // Bauteil), die mm-Fläche ergibt sich hier – wie beim Bauteil selbst. Damit "wandert" der
  // Rahmen mit den Strompfaden, die er umschließt, statt an einer getippten Koordinate zu
  // hängen, die von Hand nachgezogen werden müsste.
  const BAUGRUPPE_RAND_X = 3;
  const BAUGRUPPE_RAND_Y = 9;
  function baugruppenBereich(pfadVon, pfadBis, hoeheVon, hoeheBis) {
    const x1 = pfadX(pfadVon) - SPALTE_BREITE / 2 + BAUGRUPPE_RAND_X;
    const x2 = pfadX(pfadBis) + SPALTE_BREITE / 2 - BAUGRUPPE_RAND_X;
    const y1 = positionInPfad(pfadVon, hoeheVon).y - BAUGRUPPE_RAND_Y;
    const y2 = positionInPfad(pfadVon, hoeheBis).y + BAUGRUPPE_RAND_Y;
    return { x: x1, y: y1, breite: x2 - x1, hoehe: y2 - y1 };
  }

  // ---- Funktionsklammer -------------------------------------------------------------------
  // Eine Klammer unter dem Plan, die über mehrere Strompfade spannt und eine Funktion
  // benennt (z. B. "Spannungsversorgung Automatisierungssystem"). Wie beim Baugruppenrahmen
  // nur `pfadVon`/`pfadBis`, keine freie Koordinate. Die Höhe ist für alle Klammern eines
  // Blatts gleich, knapp über dem Schriftfeld, damit sie nie mit ihm kollidiert.
  // Liegen untere Schienen höher als diese Linie, rückt die Klammer über sie.
  function funktionsklammerY(schienen = []) {
    const untenY = schienenLagen(schienen).filter((s) => s.lage === "unten").map((s) => s.y);
    return Math.min(SCHRIFTFELD.y - 20, ...untenY.map((y) => y - 7));
  }
  function funktionsklammerBereich(pfadVon, pfadBis, schienen = []) {
    const rand = 4;
    return {
      x1: pfadX(pfadVon) - SPALTE_BREITE / 2 + rand,
      x2: pfadX(pfadBis) + SPALTE_BREITE / 2 - rand,
      y: funktionsklammerY(schienen),
    };
  }

  // ---- Erzeugtes Blatt ---------------------------------------------------------------------
  // Tabellen eines erzeugten Blatts (Inhaltsverzeichnis, später Klemmenplan) liegen
  // nebeneinander in der Rasterfläche über dem Schriftfeld. Wie viele Zeilen passen, folgt
  // aus der Höhe – die einzige Stelle, die das weiß.
  const TABELLE = { rand: 6, abstand: 6, kopf: 10, spaltenkopf: 6, zeile: 5.5 };
  function tabellenBereiche(anzahl) {
    const x0 = RASTER_X + TABELLE.rand;
    const breiteGesamt = RASTER_BREITE - 2 * TABELLE.rand;
    const breite = (breiteGesamt - (anzahl - 1) * TABELLE.abstand) / Math.max(anzahl, 1);
    const y = RASTER_Y + TABELLE.rand;
    const hoehe = SCHRIFTFELD.y - TABELLE.rand - y;
    const maxZeilen = Math.floor((hoehe - TABELLE.kopf - TABELLE.spaltenkopf) / TABELLE.zeile);
    return Array.from({ length: anzahl }, (_, i) => ({
      x: x0 + i * (breite + TABELLE.abstand), y, breite, hoehe, maxZeilen,
    }));
  }

  return {
    TABELLE, tabellenBereiche,
    BLATT_BREITE, BLATT_HOEHE, RAHMEN_X, RAHMEN_Y, RAHMEN_BREITE, RAHMEN_HOEHE,
    BESCHRIFTUNG_STREIFEN, RASTER_X, RASTER_Y, RASTER_BREITE, RASTER_HOEHE,
    SPALTEN, ZEILEN, ZEILEN_BUCHSTABEN, SPALTE_BREITE, ZEILE_HOEHE, SCHRIFTFELD,
    feldAusPosition, mitteVonFeld, einrasten,
    SCHIENEN_SCHRITT, MAX_SCHIENEN_JE_LAGE, SCHIENE_X1, SCHIENE_X2, schienenArt, schienenLagen,
    pfadX, positionInPfad, pfadAusX, hoeheAusY,
    baugruppenBereich, funktionsklammerY, funktionsklammerBereich,
  };
})();
