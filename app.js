// Zeichenfläche: Rendering, Zoom/Pan per Pointer Events (Maus + Stift + Touch),
// Werkzeugleiste. Alles gegen das globale Projekt-Objekt, das FORMAT.md beschreibt.

const SVG_NS = "http://www.w3.org/2000/svg";
const R = LEITWERK_RASTER;
const M = LEITWERK_MODELL;
const Q = LEITWERK_QUERVERWEISE;
const S = LEITWERK_SYMBOLE;
const E = LEITWERK_ERZEUGT;
const P = LEITWERK_PRUEFPROTOKOLL;
const K = LEITWERK_KONTAKTE;
const V = LEITWERK_VERLAUF;

const svg = document.getElementById("zeichenflaeche");
const blattinhalt = document.getElementById("blattinhalt");

// Start: der gespeicherte Stand, sonst ein leeres Projekt mit einem leeren Blatt. Das
// Testprojekt (Prüfstand mit einem Blatt je Funktion) nur noch über index.html?testprojekt.
function leeresProjekt(ersteller = "") {
  const p = M.neuesProjekt({ ersteller });
  M.blattEinfuegen(p, M.neuesBlatt("Neues Blatt"));
  return p;
}
const MIT_TESTPROJEKT = new URLSearchParams(location.search).has("testprojekt");
let projekt = MIT_TESTPROJEKT ? LEITWERK_TESTPROJEKT.bauen() : (LEITWERK_SPEICHER.laden() || leeresProjekt());
// Der Prüfstand darf nie den gespeicherten Stand überschreiben: mit ?testprojekt wird nicht
// gespeichert (Laden/Export/Import gehen weiter).
// Ebenso nie während der Vorschau einer Claude-Antwort: Die Vorschau ist eine Kopie, die
// erst mit „Übernehmen“ zum Projekt wird.
let vorschau = null; // { vorher, blattVorher, anzahl } solange eine Claude-Antwort zur Ansicht liegt
const echtesSpeichern = LEITWERK_SPEICHER.speichern;
LEITWERK_SPEICHER.speichern = (p) => {
  // Hinter der offenen Startseite wird nichts gespeichert: sonst legte schon das Öffnen der
  // App ein leeres „Unbenanntes Projekt“ an.
  if (vorschau || startseiteOffen()) return;
  verlaufMerken(p);
  if (MIT_TESTPROJEKT) return;
  try {
    echtesSpeichern(p);
  } catch (fehler) {
    status("Im Browser ist kein Platz mehr – bitte „Als Datei speichern“ und alte Projekte löschen.", "warnung");
  }
};
let aktivesBlattId = projekt.blaetter[0] ? projekt.blaetter[0].id : null;

// Stufe 1c: Platzieren/Verbinden/Verschieben – Zustand der Zeichenfläche jenseits von Zoom/Pan.
let werkzeug = "auswaehlen"; // "auswaehlen" | "platzieren" | "verbinden" | "stift"
let aktivesPlatzierSymbol = null; // { kontakt } oder { typ, pole, bmk } aus der Palette
let aktiveBetaetigung = ""; // Betätigungs-Schlüssel oder "" (keine)
let ausgewaehltesBauteilId = null;
let verschobenesBauteil = null; // Bauteil-Objekt, während es gezogen wird
let verbindenStart = null; // { bauteilId, anschluss, x, y } – erster gewählter Anschlusspunkt
let druckLaeuft = false; // true, solange druckbereichFuellen() zeichnet: keine Auswahl, keine Vorschau
let laufenderStrich = null; // { pointerId, punkte, linie } – Freihandstrich, solange der Stift aufliegt
let stiftGesehen = false; // einmal ein echter Stift benutzt: ab dann schwenkt der Finger statt zu schreiben

function aktivesBlatt() {
  return projekt.blaetter.find((b) => b.id === aktivesBlattId);
}

// Das aktive Blatt, wenn es ein Zeichenblatt ist – null bei einem erzeugten Blatt, das
// keine Bauteile/Schienen hat und auf dem kein Zeichenwerkzeug etwas tun darf.
function aktivesZeichenblatt() {
  const blatt = aktivesBlatt();
  return blatt && !M.istErzeugt(blatt) ? blatt : null;
}

// Ein Bauteil hat keine gespeicherte x/y-Koordinate mehr, nur pfad + hoehe (Vorbild
// E-Plan, siehe FORMAT.md „Strompfad"). Die mm-Position (von Pol 1) kommt hier heraus.
function bauteilPosition(bauteil) {
  return R.positionInPfad(bauteil.pfad, bauteil.hoehe);
}

// Die Strompfade, die ein Bauteil belegt: pfad, pfad + 1, … – einer je Pol.
function bauteilPfade(bauteil) {
  return Array.from({ length: S.polZahl(bauteil) }, (_, i) => bauteil.pfad + i);
}

// Alle Pole, die in einem Strompfad sitzen, nach Höhe sortiert – die Grundlage der
// Strompfad-Kette. Ein mehrpoliges Bauteil taucht in jedem seiner Pfade mit einem Pol auf.
function poleImPfad(blatt, pfad, ausser = null) {
  const pole = [];
  for (const bauteil of blatt.bauteile) {
    if (bauteil === ausser) continue;
    const pol = pfad - bauteil.pfad;
    if (pol >= 0 && pol < S.polZahl(bauteil)) pole.push({ bauteil, pol, ...S.kettenEnden(bauteil, pol) });
  }
  return pole.sort((a, b) => a.bauteil.hoehe - b.bauteil.hoehe);
}

// Anschlusspunkte eines Bauteils, immer frisch aus kontakt/typ + pfad + hoehe berechnet –
// kein bauteil.anschluesse-Feld mehr (Version 4). Ein zwischengespeichertes Array wäre
// genau die Art Cache, die FORMAT.md nirgends duldet: Version 1c hatte trotzdem eins und
// bekam prompt einen Bug, weil eine Stelle beim Verschieben anderer Bauteile vergaß, es
// nachzuziehen (siehe CLAUDE.md, 2026-09-22). Seit Version 4 gibt es nichts nachzuziehen.
function bauteilAnschluesse(bauteil) {
  const { x, y } = bauteilPosition(bauteil);
  const punkte = S.anschlusspunkte(bauteil, x, y, R.SPALTE_BREITE);
  if (punkte) return Object.entries(punkte).map(([nummer, p]) => ({ nummer, x: p.x, y: p.y }));
  // Unbekannter Schlüssel (Gruppe noch nicht gebaut): generische Anschlüsse oben/unten je
  // Pol, damit es trotzdem im Strompfad mitläuft, siehe FORMAT.md.
  return bauteilPfade(bauteil).flatMap((pfad, pol) => [
    { nummer: String(2 * pol + 1), x: R.pfadX(pfad), y: y - PLATZHALTER_HOEHE / 2 },
    { nummer: String(2 * pol + 2), x: R.pfadX(pfad), y: y + PLATZHALTER_HOEHE / 2 },
  ]);
}

function bauteilHalbeHoehe(bauteil) {
  return (S.hoeheVon(bauteil) ?? PLATZHALTER_HOEHE) / 2;
}

// ---- SVG-Hilfsfunktionen -----------------------------------------------------------

function svgEl(tag, attrs = {}, kinder = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kind of kinder) el.appendChild(kind);
  return el;
}

function text(inhalt, attrs) {
  const el = svgEl("text", attrs);
  el.textContent = inhalt;
  return el;
}

// ---- Rendering: ein Blatt ------------------------------------------------------------

function zeichneRahmenUndRaster(gruppe) {
  gruppe.appendChild(svgEl("rect", {
    x: 0, y: 0, width: R.BLATT_BREITE, height: R.BLATT_HOEHE, class: "blatt-hintergrund",
  }));
  gruppe.appendChild(svgEl("rect", {
    x: R.RAHMEN_X, y: R.RAHMEN_Y, width: R.RAHMEN_BREITE, height: R.RAHMEN_HOEHE,
    class: "blatt-rahmen",
  }));

  // Feine Rasterlinien innerhalb der Zeichenfläche.
  for (let s = 1; s < R.SPALTEN; s++) {
    const x = R.RASTER_X + s * R.SPALTE_BREITE;
    gruppe.appendChild(svgEl("line", { x1: x, y1: R.RASTER_Y, x2: x, y2: R.RASTER_Y + R.RASTER_HOEHE, class: "raster-linie" }));
  }
  for (let z = 1; z < R.ZEILEN; z++) {
    const y = R.RASTER_Y + z * R.ZEILE_HOEHE;
    gruppe.appendChild(svgEl("line", { x1: R.RASTER_X, y1: y, x2: R.RASTER_X + R.RASTER_BREITE, y2: y, class: "raster-linie" }));
  }

  // Spaltenzahlen oben/unten, Zeilenbuchstaben links/rechts – wie auf den IHK-Vorbildern.
  for (let s = 0; s < R.SPALTEN; s++) {
    const x = R.RASTER_X + (s + 0.5) * R.SPALTE_BREITE;
    gruppe.appendChild(text(String(s + 1), { x, y: R.RAHMEN_Y + R.BESCHRIFTUNG_STREIFEN / 2, class: "raster-beschriftung" }));
    gruppe.appendChild(text(String(s + 1), { x, y: R.RAHMEN_Y + R.RAHMEN_HOEHE - R.BESCHRIFTUNG_STREIFEN / 2, class: "raster-beschriftung" }));
  }
  for (let z = 0; z < R.ZEILEN; z++) {
    const y = R.RASTER_Y + (z + 0.5) * R.ZEILE_HOEHE;
    gruppe.appendChild(text(R.ZEILEN_BUCHSTABEN[z], { x: R.RAHMEN_X + R.BESCHRIFTUNG_STREIFEN / 2, y, class: "raster-beschriftung" }));
    gruppe.appendChild(text(R.ZEILEN_BUCHSTABEN[z], { x: R.RAHMEN_X + R.RAHMEN_BREITE - R.BESCHRIFTUNG_STREIFEN / 2, y, class: "raster-beschriftung" }));
  }
}

// Schriftfeld nach DIN EN 61082 (Praxisform): Errichter | Auftraggeber · Anlage, Plantitel und
// Blatttitel, Bearbeiter, Datum, Zeichnungsnummer, letzter Änderungsstand, Blatt x / y. Alles
// aus projekt.meta bzw. gerechnet – je Blatt gespeichert sind nur Abweichungen (FORMAT.md).
function zeichneSchriftfeld(gruppe, blatt, seite = 0) {
  const sf = R.SCHRIFTFELD;
  const meta = projekt.meta;
  gruppe.appendChild(svgEl("rect", { x: sf.x, y: sf.y, width: sf.breite, height: sf.hoehe, class: "schriftfeld-rahmen" }));
  const linie = (x1, y1, x2, y2) => gruppe.appendChild(svgEl("line", {
    x1: sf.x + x1, y1: sf.y + y1, x2: sf.x + x2, y2: sf.y + y2, class: "schriftfeld-linie",
  }));
  // Feld: kleine Bezeichnung oben links, Wert darunter – zu lange Werte werden mit „…“
  // gekürzt, statt ins Nachbarfeld zu laufen (SVG bricht nicht um).
  const feld = (x, y, bezeichnung, wert, breite, klasse = "schriftfeld-text") => {
    gruppe.appendChild(text(bezeichnung, { x: sf.x + x + 1, y: sf.y + y + 2.2, class: "schriftfeld-bezeichnung" }));
    gruppe.appendChild(text(gekuerzt(wert || "", breite - 2, 2.8), { x: sf.x + x + 1, y: sf.y + y + 5.6, class: klasse }));
  };
  linie(0, 7, sf.breite, 7);
  linie(0, 17, sf.breite, 17);
  linie(0, 23.5, sf.breite, 23.5);
  linie(55, 0, 55, 7);
  linie(40, 17, 40, 30);
  linie(75, 17, 75, 30);

  const auftraggeber = M.schriftfeldWert(projekt, blatt, "auftraggeber");
  const anlage = M.schriftfeldWert(projekt, blatt, "anlage");
  const plantitel = M.schriftfeldWert(projekt, blatt, "plantitel");
  const datum = M.schriftfeldWert(projekt, blatt, "datum");
  const name = M.schriftfeldWert(projekt, blatt, "name");
  // Folgeseite eines erzeugten Blatts: eigene Nummer = erste Nummer + Seite.
  const nummer = M.blattNummer(projekt, blatt.id) + seite;
  const letzte = (meta.aenderungen || [])[(meta.aenderungen || []).length - 1];

  feld(0, 0, "Errichter", meta.errichter, 55);
  feld(55, 0, "Auftraggeber · Anlage", [auftraggeber, anlage].filter(Boolean).join(" · "), 65);
  gruppe.appendChild(text(gekuerzt(plantitel || "", sf.breite - 2, 1.8), { x: sf.x + 1, y: sf.y + 10.2, class: "schriftfeld-bezeichnung" }));
  gruppe.appendChild(text(gekuerzt(blatt.titel + (seite > 0 ? " (Fortsetzung)" : ""), sf.breite - 2, 4), { x: sf.x + 1, y: sf.y + 15, class: "schriftfeld-titel" }));
  feld(0, 17, "Bearbeiter", name, 40);
  feld(40, 17, "Datum", datum, 35);
  feld(75, 17, "Zeichnungsnummer", meta.zeichnungsnummer, 45);
  feld(0, 23.5, "Änderung", letzte ? `${letzte.index} · ${letzte.datum}` : "–", 40);
  feld(40, 23.5, "Dokumentart", M.blatttypName(blatt.typ), 35);
  feld(75, 23.5, "Blatt", `${nummer} / ${M.blattZahl(projekt)}`, 45);
}

// Kürzt einen Text auf ungefähr `breiteMm` bei Schriftgröße `schriftMm`. `faktor` ist die
// mittlere Zeichenbreite je Schriftgröße (0,55 vorsichtig, 0,5 für gemischten Text in
// Tabellen) – für Druck und Bildschirm gleich gerechnet.
function gekuerzt(inhalt, breiteMm, schriftMm, faktor = 0.55) {
  const max = Math.floor(breiteMm / (schriftMm * faktor));
  return inhalt.length > max ? `${inhalt.slice(0, Math.max(1, max - 1))}…` : inhalt;
}

const PLATZHALTER_BREITE = 14, PLATZHALTER_HOEHE = 10;

function zeichneBauteile(gruppe, blatt) {
  for (const bauteil of blatt.bauteile) {
    const { x, y } = bauteilPosition(bauteil);
    const halbeHoehe = bauteilHalbeHoehe(bauteil);
    const breite = (S.polZahl(bauteil) - 1) * R.SPALTE_BREITE;
    if (S.hatSymbol(bauteil)) {
      for (const el of S.zeichnenBauteil(bauteil, x, y, R.SPALTE_BREITE)) gruppe.appendChild(el);
    } else {
      // Gruppe noch nicht angelegt oder unbekannter Schlüssel: beschrifteter
      // Platzhalter-Kasten je Pol, siehe FORMAT.md.
      for (const pfad of bauteilPfade(bauteil)) {
        gruppe.appendChild(svgEl("rect", {
          x: R.pfadX(pfad) - PLATZHALTER_BREITE / 2, y: y - halbeHoehe,
          width: PLATZHALTER_BREITE, height: halbeHoehe * 2, class: "bauteil-rahmen",
        }));
      }
    }
    if (bauteil.id === ausgewaehltesBauteilId && !druckLaeuft) {
      gruppe.appendChild(svgEl("rect", {
        x: x - 7, y: y - halbeHoehe - 2.5, width: breite + 14, height: 2 * halbeHoehe + 5,
        rx: 2, class: "bauteil-auswahl",
      }));
    }
    // Das BMK steht einmal am Betriebsmittel (links über Pol 1, neben der Zuleitung statt
    // auf ihr), nicht an jedem Pol.
    const bmkOrt = S.bmkPosition(bauteil, x, y, R.SPALTE_BREITE) || { x: x - 1.2, y: y - halbeHoehe - 1.2 };
    gruppe.appendChild(text(bauteil.bmk, { x: bmkOrt.x, y: bmkOrt.y, class: "bauteil-bmk" }));
    // Reihenklemme: ihre Nummer rechts neben dem Kreis, wie im Stromlaufplan üblich.
    if (S.istKlemme(bauteil)) {
      gruppe.appendChild(text(bauteil.klemme || "?", { x: x + 2.4, y: y + 1, class: "klemme-nummer" }));
    }
    if (bauteil.beschriftung) {
      gruppe.appendChild(text(bauteil.beschriftung, { x, y: y + halbeHoehe + 3.5, class: "bauteil-beschriftung" }));
    }
  }
}

// Kontaktspiegel (Tabellenbuch S. 83): unter jeder Spule ihre Kontakte – waagerecht, mit
// Kontaktnummern, gestrichelter Wirklinie und dem Ort jedes Kontakts im Plan. Sitzt unter der
// untersten unteren Schiene; ginge er dort ins Schriftfeld, rechts neben der Spule. Am Kontakt
// umgekehrt klein unter dem BMK der Ort seiner Spule. Alles gerechnet (kontakte.js).
const SPIEGEL_ZEILE = 3.2;
function zeichneKontaktspiegel(gruppe, blatt) {
  const spiegel = K.spiegel(projekt);
  if (!spiegel.size) return;
  const untere = R.schienenLagen(blatt.schienen || []).filter((s) => s.lage === "unten").map((s) => s.y);
  const sf = R.SCHRIFTFELD;
  for (const b of blatt.bauteile) {
    const verweis = K.spulenOrt(projekt, spiegel, b);
    const { x, y } = bauteilPosition(b);
    if (verweis) {
      gruppe.appendChild(text(verweis, { x: x - 1.2, y: y - bauteilHalbeHoehe(b) + 1.6, class: "spulen-verweis" }));
    }
    if (!S.istSpule(b)) continue;
    const e = spiegel.get(b.bmk);
    if (!e || !e.zeilen.length) continue;
    const hoehe = e.zeilen.length * SPIEGEL_ZEILE;
    const unter = untere.length ? Math.max(...untere) + 2.5 : y + 8;
    const passtUnten = x + 12 < sf.x && unter + hoehe < sf.y + sf.hoehe - 1;
    const x0 = passtUnten ? x - 5 : x + 7;
    const y0 = passtUnten ? unter : y - 5;
    e.zeilen.forEach((z, i) => zeichneSpiegelZeile(gruppe, z, x0, y0 + (i + 0.75) * SPIEGEL_ZEILE));
    gruppe.appendChild(svgEl("line", { x1: x0 + 5.2, y1: y0, x2: x0 + 5.2, y2: y0 + hoehe, class: "symbol-linie symbol-gestrichelt" }));
  }
}

// Eine Zeile des Kontaktspiegels: Kontakt waagerecht (wie S. 83), Nummern darüber, der Ort
// im Plan links davor.
function zeichneSpiegelZeile(gruppe, z, xa, yr) {
  const l = (x1, y1, x2, y2) => gruppe.appendChild(svgEl("line", { x1: xa + x1, y1: yr + y1, x2: xa + x2, y2: yr + y2, class: "symbol-linie" }));
  l(0, 0, 3.5, 0);
  l(6.5, 0, 10, 0);
  if (z.art === "schliesser") {
    l(3.5, 0, 6.9, -1.3);
  } else {
    l(6.5, 0, 6.5, 1);
    l(3.5, 0, 7, 1.2);
    if (z.art === "wechsler") {
      l(6.5, -1.4, 10, -1.4);
      gruppe.appendChild(text(z.wechsel, { x: xa + 10, y: yr - 1.9, class: "spiegel-nummer rechts" }));
    }
  }
  gruppe.appendChild(text(z.links, { x: xa + 0.2, y: yr - 0.6, class: "spiegel-nummer" }));
  gruppe.appendChild(text(z.rechts, { x: xa + 10, y: yr - 0.6, class: "spiegel-nummer rechts" }));
  gruppe.appendChild(text(z.ort, { x: xa - 1, y: yr + 0.6, class: "spiegel-ort" }));
}

// Anschlussnummern (z. B. "3"/"4" an einem Taster) klein neben jedem Anschlusspunkt – nie
// getippt, immer aus bauteilAnschluesse() (also aus symbole.js) gelesen. Ein-/ausblendbar
// pro Blatt über blatt.anschlussnummernSichtbar, siehe FORMAT.md.
function zeichneAnschlussnummern(gruppe, blatt) {
  if (!blatt.anschlussnummernSichtbar) return;
  const ord = K.ordnungen(projekt); // Kontaktnummern 13/14, 21/22 … (kontakte.js)
  for (const bauteil of blatt.bauteile) {
    if (S.istKlemme(bauteil)) continue; // hat eine Klemmennummer statt "1"/"2"
    const { x } = bauteilPosition(bauteil);
    for (const a of bauteilAnschluesse(bauteil)) {
      if (a.nummer === "PE") continue; // der Motor schreibt „PE“ selbst an seine Zuleitung
      // Seitlicher Anschluss links vom Symbol (Basis B, Gate G): Nummer darüber statt auf
      // die eigene waagerechte Zuleitung.
      const links = a.x < x - 3;
      gruppe.appendChild(text(K.anschlussText(ord, bauteil, a.nummer), links
        ? { x: a.x, y: a.y - 0.8, class: "anschluss-nummer" }
        : { x: a.x + 1.3, y: a.y + 0.9, class: "anschluss-nummer" }));
    }
  }
}

// Baugruppenrahmen: umschließt eine Gruppe von Strompfaden (pfadVon–pfadBis, hoeheVon–
// hoeheBis), kein freies Rechteck – raster.js' baugruppenBereich() liefert die mm-Fläche,
// siehe FORMAT.md. Wird vor den Bauteilen gezeichnet, damit er im Hintergrund liegt.
function zeichneBaugruppenrahmen(gruppe, blatt) {
  for (const rahmen of blatt.baugruppenrahmen) {
    const b = R.baugruppenBereich(rahmen.pfadVon, rahmen.pfadBis, rahmen.hoeheVon, rahmen.hoeheBis);
    gruppe.appendChild(svgEl("rect", {
      x: b.x, y: b.y, width: b.breite, height: b.hoehe, class: "baugruppenrahmen-linie",
    }));
    gruppe.appendChild(text(rahmen.bmk, { x: b.x + 1, y: b.y - 1.5, class: "baugruppenrahmen-bmk" }));
    if (rahmen.beschriftung) {
      gruppe.appendChild(text(rahmen.beschriftung, {
        x: b.x + b.breite / 2, y: b.y + b.hoehe + 4, class: "baugruppenrahmen-beschriftung", "text-anchor": "middle",
      }));
    }
  }
}

// Funktionsklammern unter dem Plan: waagerechte Linie mit Endstrichen von pfadVon bis
// pfadBis, Text darüber – raster.js' funktionsklammerBereich() liefert die mm-Fläche,
// siehe FORMAT.md.
function zeichneFunktionsklammern(gruppe, blatt) {
  const TICK = 3;
  // Ältere gespeicherte Blätter (vor diesem Feld) haben kein funktionsklammern-Array –
  // kein Versionssprung nötig dafür, ein leeres Array ist gültiger Startzustand.
  for (const klammer of blatt.funktionsklammern || []) {
    const { x1, x2, y } = R.funktionsklammerBereich(klammer.pfadVon, klammer.pfadBis, blatt.schienen);
    gruppe.appendChild(svgEl("line", { x1, y1: y, x2, y2: y, class: "funktionsklammer-linie" }));
    gruppe.appendChild(svgEl("line", { x1, y1: y - TICK, x2: x1, y2: y, class: "funktionsklammer-linie" }));
    gruppe.appendChild(svgEl("line", { x1: x2, y1: y - TICK, x2, y2: y, class: "funktionsklammer-linie" }));
    gruppe.appendChild(text(klammer.text, {
      x: (x1 + x2) / 2, y: y - TICK - 1.5, class: "funktionsklammer-text", "text-anchor": "middle",
    }));
  }
}

// ---- Rendering: Strompfade (Vorbild E-Plan) --------------------------------------------
// Kein Freihand, keine gespeicherte Leitung: Bauteile im selben Strompfad sind allein
// dadurch verbunden, dass sie dort sitzen. Diese Funktion berechnet und zeichnet die
// Verbindung – oben/unten zu den Sammelschienen des Blatts, untereinander nach `hoehe`
// sortiert – bei jedem Rendern neu, nie gespeichert. Siehe FORMAT.md „Strompfad".
function anschlussPunkt(bauteil, nummer) {
  const treffer = bauteilAnschluesse(bauteil).find((a) => a.nummer === nummer);
  return treffer ? { x: treffer.x, y: treffer.y } : null;
}

// Leiterkennzeichen nach Tabellenbuch S. 93 an einem Punkt einer Leitung: Schrägstrich,
// bei N mit Punkt, bei PE mit Querbalken, bei PEN mit beidem. `senkrecht` für die
// Anbindung eines Bauteils („desgl. bei senkrecht gezeichneten Leitungen").
function zeichneLeiterkennzeichen(gruppe, art, x, y, senkrecht = false) {
  if (art === "leiter") return;
  // Schrägstrich von (x+a, y+b) nach (x-a, y-b); bei senkrechter Leitung um 90° gedreht.
  const [a, b] = senkrecht ? [1.3, 0.7] : [0.7, 1.3];
  const oben = senkrecht ? { x: x - a, y: y - b } : { x: x + a, y: y - b };
  gruppe.appendChild(svgEl("line", {
    x1: senkrecht ? x + a : x - a, y1: y + b, x2: oben.x, y2: oben.y, class: "schiene-marke",
  }));
  if (art === "neutral" || art === "pen") {
    gruppe.appendChild(svgEl("circle", { cx: oben.x, cy: oben.y, r: 0.45, class: "schiene-punkt" }));
  }
  if (art === "schutz" || art === "pen") {
    gruppe.appendChild(svgEl("line", senkrecht
      ? { x1: oben.x, y1: oben.y - 0.8, x2: oben.x, y2: oben.y + 0.8, class: "schiene-marke" }
      : { x1: oben.x - 0.8, y1: oben.y, x2: oben.x + 0.8, y2: oben.y, class: "schiene-marke" }));
  }
}

// Schutzleiteranschluss (Tabellenbuch S. 85 a): Kreis mit Erdungszeichen.
function zeichneSchutzleiteranschluss(gruppe, x, y) {
  gruppe.appendChild(svgEl("circle", { cx: x, cy: y, r: 1.8, class: "schiene-anschluss" }));
  gruppe.appendChild(svgEl("line", { x1: x, y1: y - 1.3, x2: x, y2: y - 0.1, class: "schiene-marke" }));
  for (const [dy, halb] of [[-0.1, 1.1], [0.5, 0.7], [1.1, 0.3]]) {
    gruppe.appendChild(svgEl("line", { x1: x - halb, y1: y + dy, x2: x + halb, y2: y + dy, class: "schiene-marke" }));
  }
}

// Sammelschienen des Blatts: y-Lage aus raster.js' schienenLagen(), nie gespeichert
// (FORMAT.md „Sammelschiene"). Name links, bei N/PE/PEN das Leiterkennzeichen, bei PE/PEN
// vorn der Schutzleiteranschluss.
function zeichneStrompfadSchienen(gruppe, blatt) {
  for (const schiene of R.schienenLagen(blatt.schienen)) {
    const mitAnschluss = schiene.art === "schutz" || schiene.art === "pen";
    const x1 = R.SCHIENE_X1 + (mitAnschluss ? 1.8 : 0);
    gruppe.appendChild(svgEl("line", {
      x1, y1: schiene.y, x2: R.SCHIENE_X2, y2: schiene.y, class: `schiene-linie schiene-${schiene.art}`,
    }));
    if (mitAnschluss) zeichneSchutzleiteranschluss(gruppe, R.SCHIENE_X1, schiene.y);
    gruppe.appendChild(text(schiene.name, { x: R.RASTER_X + 0.8, y: schiene.y + 1.1, class: "schiene-name" }));
    zeichneLeiterkennzeichen(gruppe, schiene.art, R.SCHIENE_X1 + 6, schiene.y);
  }
}

function zeichneStrompfadVerbindungen(gruppe, blatt) {
  for (let pfad = 1; pfad <= R.SPALTEN; pfad++) {
    const pole = poleImPfad(blatt, pfad);
    for (let i = 0; i < pole.length - 1; i++) {
      const unten = anschlussPunkt(pole[i].bauteil, pole[i].unten);
      const naechstesOben = anschlussPunkt(pole[i + 1].bauteil, pole[i + 1].oben);
      if (unten && naechstesOben) {
        gruppe.appendChild(svgEl("line", {
          x1: unten.x, y1: unten.y, x2: naechstesOben.x, y2: naechstesOben.y, class: "strompfad-linie",
        }));
      }
    }
  }
}

// Ist diese Bindung verboten? PE/PEN wird nie geschaltet (FORMAT.md „Sammelschiene").
function bindungVerboten(bauteil, schienenName) {
  const art = R.schienenArt(schienenName);
  return S.istSchaltend(bauteil) && (art === "schutz" || art === "pen");
}

// Für jeden Eintrag in bauteil.schienen: senkrechte Leitung vom Anschluss zur Schiene,
// Verbindungspunkt (S. 84) auf der Schiene, bei N/PE/PEN das Leiterkennzeichen auf der
// senkrechten Leitung. Berechnet, nie gespeichert. Fehlt die Schiene auf dem Blatt, bleibt
// die Anbindung ungezeichnet statt ein Ziel zu erfinden.
function zeichneSchienenAnbindungen(gruppe, blatt) {
  const alleLagen = R.schienenLagen(blatt.schienen);
  const lagen = new Map(alleLagen.map((s) => [s.name, s]));
  // Leiterkennzeichen auf der Anbindung kurz hinter dem Schienenpaket, nicht zwischen
  // zwei Schienen (sonst liest es sich als Kennzeichen der gekreuzten Schiene).
  const paketRand = (lage) => {
    const ys = alleLagen.filter((s) => s.lage === lage).map((s) => s.y);
    return lage === "oben" ? Math.max(...ys) + 5 : Math.min(...ys) - 5;
  };
  for (const bauteil of blatt.bauteile) {
    for (const [nummer, name] of Object.entries(bauteil.schienen || {})) {
      const schiene = lagen.get(name);
      const punkt = anschlussPunkt(bauteil, nummer);
      if (!schiene || !punkt) continue;
      const klasse = bindungVerboten(bauteil, name) ? "strompfad-linie anbindung-fehler" : "strompfad-linie";
      gruppe.appendChild(svgEl("line", { x1: punkt.x, y1: schiene.y, x2: punkt.x, y2: punkt.y, class: klasse }));
      gruppe.appendChild(svgEl("circle", { cx: punkt.x, cy: schiene.y, r: 0.6, class: "schiene-punkt" }));
      const markeY = paketRand(schiene.lage);
      zeichneLeiterkennzeichen(gruppe, schiene.art, punkt.x, markeY, true);
    }
  }
}

// Freie Textfelder (FORMAT.md „Textfeld"), z. B. die Netzangabe an den Schienen.
function zeichneTexte(gruppe, blatt) {
  for (const t of blatt.texte || []) {
    gruppe.appendChild(text(t.text, { x: t.x, y: t.y, class: t.kursiv ? "textfeld kursiv" : "textfeld" }));
  }
}

// Freihand-Notizen (FORMAT.md „Blatt", `freihand`): Striche als Linienzug in mm, blau wie
// Kugelschreiber, damit sie sich vom Plan abheben. Ausgeblendet = auch nicht gedruckt.
const FREIHAND_FARBE = "#1f4fa8";
const FREIHAND_BREITE = 0.35;

function freihandLinie(punkte) {
  return svgEl("polyline", {
    points: punkte.map(([x, y]) => `${x},${y}`).join(" "),
    fill: "none", stroke: FREIHAND_FARBE, "stroke-width": FREIHAND_BREITE,
    "stroke-linecap": "round", "stroke-linejoin": "round", class: "freihand-strich",
  });
}

function zeichneFreihand(gruppe, blatt) {
  if (!blatt.freihand || !blatt.freihand.sichtbar) return;
  for (const strich of blatt.freihand.striche) gruppe.appendChild(freihandLinie(strich.punkte));
}

// ---- Rendering: Verbindungslinien ------------------------------------------------------
// Eine Verbindung merkt sich nur bauteilId + Anschlussnummer, nie eine Koordinate – kein
// freier Punkt mehr (Version 4, siehe FORMAT.md). Die Koordinate kommt live aus
// bauteilAnschluesse(), genau wie sich ein Querverweis erst beim Rendern ergibt.
// Verschiebt sich ein Bauteil, zeigt die Verbindung danach automatisch wieder richtig.
function punktVonEndpunkt(endpunkt, blatt) {
  if (endpunkt.bauteilId) {
    const bauteil = blatt.bauteile.find((b) => b.id === endpunkt.bauteilId);
    return bauteil ? anschlussPunkt(bauteil, endpunkt.anschluss) : null;
  }
  return null; // potenzialId: Potenziale werden separat von zeichnePotenziale gezeichnet.
}

// Nur waagerecht/senkrecht, kein Freihand: liegen die Punkte nicht auf einer Linie, geht
// die Verbindung über eine Ecke (erst waagerecht, dann senkrecht).
function zeichneVerbindungen(gruppe, blatt) {
  for (const verbindung of blatt.verbindungen) {
    const von = punktVonEndpunkt(verbindung.von, blatt);
    const bis = punktVonEndpunkt(verbindung.bis, blatt);
    if (!von || !bis) continue;
    if (von.x === bis.x || von.y === bis.y) {
      gruppe.appendChild(svgEl("line", { x1: von.x, y1: von.y, x2: bis.x, y2: bis.y, class: "verbindung-linie" }));
    } else {
      gruppe.appendChild(svgEl("path", {
        d: `M${von.x},${von.y} L${bis.x},${von.y} L${bis.x},${bis.y}`, class: "verbindung-linie",
      }));
    }
  }
  if (werkzeug === "verbinden" && verbindenStart && !druckLaeuft) {
    gruppe.appendChild(svgEl("circle", {
      cx: verbindenStart.x, cy: verbindenStart.y, r: 1.4, class: "anschluss-vorschau",
    }));
  }
}

function zeichneKlemmenleisten(gruppe, blatt) {
  const ABSTAND = 4.5;
  for (const kl of blatt.klemmenleisten) {
    gruppe.appendChild(text(kl.bmk, { x: kl.x - 6, y: kl.y - 4, class: "klemmenleiste-bmk" }));
    kl.klemmen.forEach((klemme, i) => {
      const y = kl.y + i * ABSTAND;
      gruppe.appendChild(svgEl("circle", { cx: kl.x, cy: y, r: 1.4, class: "klemme-kreis" }));
      gruppe.appendChild(text(klemme.nummer, { x: kl.x + 3, y: y + 1, class: "klemme-nummer" }));
    });
  }
}

function zeichnePotenziale(gruppe, blatt) {
  const alleVerweise = Q.berechneAlleVerweise(projekt);
  for (const potenzial of projekt.potenziale) {
    const vorkommen = alleVerweise.get(potenzial.id).filter((v) => v.blattId === blatt.id);
    for (const v of vorkommen) {
      const laenge = 18;
      const linksAusgerichtet = v.x < R.RASTER_X + R.RASTER_BREITE / 2;
      const x1 = linksAusgerichtet ? v.x : v.x - laenge;
      const x2 = linksAusgerichtet ? v.x + laenge : v.x;
      gruppe.appendChild(svgEl("line", { x1, y1: v.y, x2, y2: v.y, class: "potenzial-linie" }));
      gruppe.appendChild(text(potenzial.name, { x: (x1 + x2) / 2, y: v.y - 2, class: "potenzial-name", "text-anchor": "middle" }));
      if (v.weiterAuf) {
        gruppe.appendChild(text(`→ ${v.weiterAuf}`, { x: x2 + 1, y: v.y + 1, class: "potenzial-verweis" }));
      }
      if (v.kommtVon) {
        gruppe.appendChild(text(`← ${v.kommtVon}`, { x: x1 - 1, y: v.y + 1, class: "potenzial-verweis", "text-anchor": "end" }));
      }
    }
  }
}

// ---- Rendering: erzeugtes Blatt --------------------------------------------------------
// Inhaltsverzeichnis (später Klemmenplan, Stückliste): die Tabellen kommen bei jedem
// Rendern frisch aus erzeugte-blaetter.js, nie aus dem Blatt selbst (FORMAT.md „Erzeugtes
// Blatt"). Tabellen nebeneinander, Kopf mit Titel/Untertitel, Spaltenköpfe, Zeilen.
// Läuft eine Liste über mehrere Seiten (Folgeblätter), zeichnet das hier eine Seite davon.
let tabellenZiele = []; // [{ x, y, breite, hoehe, ziel }] – Trefferflächen fürs Antippen

function zeichneErzeugtesBlatt(gruppe, blatt, seite = 0, yVersatz = 0) {
  const T = R.TABELLE;
  const inhalt = E.seiten(projekt, blatt)[seite];
  if (!inhalt) return;
  const bereiche = R.tabellenBereiche(inhalt.spalten);
  inhalt.tabellen.forEach((tabelle, i) => {
    const b = bereiche[i];
    const gesamt = tabelle.spalten.reduce((summe, s) => summe + s.breite, 0);
    const spaltenX = [];
    let x = b.x;
    for (const spalte of tabelle.spalten) { spaltenX.push(x); x += (spalte.breite / gesamt) * b.breite; }
    spaltenX.push(b.x + b.breite);

    // E.seiten teilt schon so, dass jedes Stück auf seine Seite passt (Folgeblätter).
    const zeilen = tabelle.zeilen.slice(0, b.maxZeilen);
    const yKopf = b.y + T.kopf;
    const yDaten = yKopf + T.spaltenkopf;
    const yEnde = yDaten + zeilen.length * T.zeile;

    gruppe.appendChild(svgEl("rect", { x: b.x, y: b.y, width: b.breite, height: yEnde - b.y, class: "tabelle-rahmen" }));
    gruppe.appendChild(text(tabelle.titel, { x: b.x + b.breite / 2, y: b.y + 4.5, class: "tabelle-titel" }));
    if (tabelle.untertitel) {
      gruppe.appendChild(text(tabelle.untertitel, { x: b.x + b.breite / 2, y: b.y + 8.3, class: "tabelle-untertitel" }));
    }
    gruppe.appendChild(svgEl("line", { x1: b.x, y1: yKopf, x2: b.x + b.breite, y2: yKopf, class: "tabelle-linie-stark" }));
    gruppe.appendChild(svgEl("line", { x1: b.x, y1: yDaten, x2: b.x + b.breite, y2: yDaten, class: "tabelle-linie-stark" }));
    tabelle.spalten.forEach((spalte, s) => {
      gruppe.appendChild(text(spalte.name, { x: spaltenX[s] + 1.5, y: yKopf + 4, class: "tabelle-spaltenkopf" }));
      if (s > 0) gruppe.appendChild(svgEl("line", { x1: spaltenX[s], y1: yKopf, x2: spaltenX[s], y2: yEnde, class: "tabelle-linie" }));
    });
    zeilen.forEach((zeile, z) => {
      const y = yDaten + z * T.zeile;
      if (z > 0) gruppe.appendChild(svgEl("line", { x1: b.x, y1: y, x2: b.x + b.breite, y2: y, class: "tabelle-linie" }));
      zeile.zellen.forEach((inhalt, s) => {
        // Zu lang für die Spalte: mit „…“ kürzen statt in die Nachbarspalte zu laufen.
        const breite = spaltenX[s + 1] - spaltenX[s] - 2.5;
        gruppe.appendChild(text(gekuerzt(String(inhalt), breite, 2.8, 0.5), { x: spaltenX[s] + 1.5, y: y + 3.8, class: "tabelle-zelle" }));
      });
      if (zeile.ziel && !druckLaeuft) tabellenZiele.push({ x: b.x, y: y + yVersatz, breite: b.breite, hoehe: T.zeile, ziel: zeile.ziel });
    });
  });
}

// Antippen einer Zeile mit Ziel springt auf das Blatt – true, wenn getroffen.
function erzeugtesBlattBeiKlick(punkt) {
  const treffer = tabellenZiele.find((t) =>
    punkt.x >= t.x && punkt.x <= t.x + t.breite && punkt.y >= t.y && punkt.y <= t.y + t.hoehe);
  if (!treffer || !projekt.blaetter.some((b) => b.id === treffer.ziel)) return false;
  aktivesBlattId = treffer.ziel;
  bauteilAuswaehlen(null);
  renderAlles();
  return true;
}

// ---- Formularblatt: Prüfprotokoll (Stufe 5) --------------------------------------------
// Am Bildschirm ein HTML-Formular statt der Zeichenfläche (große Tasten fürs Tablet), im
// Druck eine A4-Seite in SVG wie jedes andere Blatt. Beides liest dieselbe Ansicht aus
// pruefprotokoll.js; gespeichert wird nur, was getippt oder angekreuzt wird.

const formular = document.getElementById("formular");
let formularFuer = null; // id des Blatts, für das das Formular gerade aufgebaut ist
let formularAktualisieren = () => {};

function el(tag, attrs = {}, kinder = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const kind of kinder) if (kind) e.appendChild(kind);
  return e;
}

function formularAufbauen(blatt) {
  if (blatt.typ === "stromkreisverzeichnis") { stromkreisFormularAufbauen(blatt); return; }
  const A = P.ansicht(projekt, blatt);
  const pp = A.pp;
  formular.innerHTML = "";
  formularFuer = blatt.id;
  const merken = () => { LEITWERK_SPEICHER.speichern(projekt); formularAktualisieren(); };

  // Eingabefeld mit Beschriftung. `plan`: Wert kommt aus dem Plan (kupfern unterlegt, nur lesen).
  const feld = (name, wert, { plan = false, mono = false, breit = false, platzhalter = "", beiEingabe } = {}) =>
    el("label", { class: `pp-feld${breit ? " pp-breit" : ""}` }, [
      document.createTextNode(name),
      el("input", {
        type: "text", value: wert, placeholder: platzhalter, readonly: plan,
        class: `${plan ? "pp-plan" : ""}${mono ? " pp-mono" : ""}`,
        title: plan ? "Kommt aus dem Plan – dort ändern" : null,
        oninput: beiEingabe ? (e) => { beiEingabe(e.target.value); merken(); } : null,
      }),
    ]);

  const knoepfe = []; // [{ id, ok, nok }] – für formularAktualisieren
  const artKnoepfe = [];

  // Kopf: Norm, Titel, Fortschritt
  const standText = el("span", { class: "pp-stand-text" });
  const balkenOk = el("div", { class: "pp-balken-ok" });
  const balkenNok = el("div", { class: "pp-balken-nok" });
  formular.appendChild(el("div", { class: "pp-kopf" }, [
    el("div", {}, [el("span", { class: "pp-norm", text: "DIN VDE 0100-600" }), el("h1", { text: blatt.titel })]),
    el("div", { class: "pp-stand" }, [standText, el("div", { class: "pp-balken" }, [balkenOk, balkenNok])]),
  ]));

  // Anlage / Stammdaten
  const arten = el("div", { class: "pp-arten", role: "group", "aria-label": "Prüfung nach" });
  for (const art of P.ARTEN) {
    const knopf = el("button", { type: "button", text: art, onclick: () => { pp.art = pp.art === art ? "" : art; merken(); } });
    artKnoepfe.push({ art, knopf });
    arten.appendChild(knopf);
  }
  formular.appendChild(el("section", { class: "pp-karte" }, [
    el("div", { class: "pp-karte-kopf" }, [
      el("h2", { text: "Anlage" }),
      el("span", { class: "pp-legende" }, [el("span", { class: "pp-legende-farbe" }), document.createTextNode("aus dem Plan übernommen")]),
    ]),
    el("div", { class: "pp-raster" }, [
      feld("Kunden-Nr.", pp.kundenNr, { platzhalter: "Kunden-Nr.", beiEingabe: (v) => { pp.kundenNr = v; } }),
      feld("Prüfprotokoll-Nr.", pp.protokollNr, { platzhalter: "Protokoll-Nr.", beiEingabe: (v) => { pp.protokollNr = v; } }),
      feld("Blattnummer", A.stamm.blattnummer, { plan: true, mono: true }),
      feld("Auftraggeber", A.stamm.auftraggeber, { plan: true }),
      feld("Auftragnehmer", pp.auftragnehmer, { platzhalter: projekt.meta.errichter || "Betrieb", beiEingabe: (v) => { pp.auftragnehmer = v; } }),
      feld("Prüfer", A.stamm.pruefer, { beiEingabe: (v) => { pp.pruefer = v; } }),
      feld("Anlage", A.stamm.anlage, { plan: true, breit: true }),
      feld("Umfang der Prüfung", pp.umfang, { breit: true, platzhalter: "z. B. Unterverteilung EG mit allen Stromkreisen",
        beiEingabe: (v) => { pp.umfang = v; } }),
    ]),
    el("div", { class: "pp-feld pp-breit" }, [document.createTextNode("Prüfung nach"), arten]),
  ]));

  // Abschnitte mit Prüfpunkten
  for (const abschnitt of P.ABSCHNITTE) {
    const stand = el("span", { class: "pp-abschnitt-stand" });
    const karte = el("section", { class: "pp-karte" }, [
      el("div", { class: "pp-karte-kopf" }, [el("h2", { text: abschnitt.titel }), stand]),
    ]);
    for (const p of abschnitt.punkte) {
      const ok = el("button", { type: "button", class: "pp-ok", onclick: () => { pp.bewertung[p.id] = pp.bewertung[p.id] === "ok" ? undefined : "ok"; merken(); } }, [
        haken(), document.createTextNode("OK")]);
      const nok = el("button", { type: "button", class: "pp-nok", onclick: () => { pp.bewertung[p.id] = pp.bewertung[p.id] === "nok" ? undefined : "nok"; merken(); } }, [
        kreuz(), document.createTextNode("nicht OK")]);
      knoepfe.push({ id: p.id, ok, nok });
      karte.appendChild(el("div", { class: "pp-punkt" }, [
        el("div", { class: "pp-punkt-text" }, [el("strong", { text: p.titel }), p.detail ? el("span", { text: p.detail }) : null]),
        p.wert ? el("label", { class: "pp-wert" }, [
          document.createTextNode("gemessen"),
          el("input", { type: "text", inputmode: "decimal", value: pp.werte[p.id] || "", placeholder: "—",
            "aria-label": `${p.titel} Messwert`, oninput: (e) => { pp.werte[p.id] = e.target.value; merken(); } }),
          el("span", { class: "pp-einheit", text: p.wert }),
        ]) : null,
        el("div", { class: "pp-urteil", role: "group", "aria-label": p.titel }, [ok, nok]),
      ]));
    }
    if (abschnitt.titel === "Messen / Prüfen") karte.appendChild(stromkreisMesstabelle(A, pp, merken));
    karte.stand = { stand, abschnitt };
    formular.appendChild(karte);
  }

  // Messgerät, Verantwortliche, Empfehlung (DIN VDE 0100-600, 6.4.4)
  const gv = pp.verantwortlich, mg = pp.messgeraet;
  formular.appendChild(el("section", { class: "pp-karte" }, [
    el("div", { class: "pp-karte-kopf" }, [el("h2", { text: "Messgerät und Verantwortliche" })]),
    el("div", { class: "pp-raster" }, [
      feld("Messgerät (Typ)", mg.typ, { platzhalter: "z. B. Profitest …", beiEingabe: (v) => { mg.typ = v; } }),
      feld("Seriennummer", mg.seriennummer, { mono: true, beiEingabe: (v) => { mg.seriennummer = v; } }),
      feld("Kalibriert bis", mg.kalibriertBis, { mono: true, platzhalter: "MM/JJJJ", beiEingabe: (v) => { mg.kalibriertBis = v; } }),
      feld("Verantwortlich Planung", gv.planung, { platzhalter: projekt.meta.errichter || "", beiEingabe: (v) => { gv.planung = v; } }),
      feld("Verantwortlich Errichtung", gv.errichtung, { platzhalter: projekt.meta.errichter || "", beiEingabe: (v) => { gv.errichtung = v; } }),
      feld("Verantwortlich Prüfung", gv.pruefung, { platzhalter: A.stamm.pruefer || "", beiEingabe: (v) => { gv.pruefung = v; } }),
      feld("Empfohlene Frist bis zur ersten Wiederholungsprüfung", pp.naechstePruefung, { breit: true,
        platzhalter: "z. B. 4 Jahre", beiEingabe: (v) => { pp.naechstePruefung = v; } }),
      feld("Bemerkungen, Mängel, Empfehlungen", pp.bemerkungen, { breit: true, beiEingabe: (v) => { pp.bemerkungen = v; } }),
    ]),
  ]));

  // Abschluss
  const haekchen = el("input", { type: "checkbox", onchange: (e) => { pp.maengelfrei = e.target.checked; merken(); } });
  const hinweis = el("span", { class: "pp-hinweis" });
  const abschluss = el("section", { class: "pp-karte pp-abschluss" }, [
    el("label", { class: "pp-erklaerung" }, [haekchen,
      el("span", { text: "Die elektrische Anlage entspricht den anerkannten Regeln der Elektrotechnik und ist mängelfrei." })]),
    hinweis,
    el("div", { class: "pp-raster" }, [
      feld("Ort", pp.ort, { platzhalter: "Ort", beiEingabe: (v) => { pp.ort = v; } }),
      feld("Datum", A.stamm.datum, { plan: true, mono: true }),
      el("div", { class: "pp-feld" }, [document.createTextNode("Unterschrift Elektrofachkraft"), el("div", { class: "pp-unterschrift" })]),
    ]),
  ]);
  formular.appendChild(abschluss);

  formularAktualisieren = () => {
    const B = P.ansicht(projekt, blatt);
    // Ist nicht mehr alles OK, gilt eine frühere Bestätigung nicht mehr – sie muss neu
    // gesetzt werden, statt von selbst wiederzukommen.
    if (!B.alleOk && pp.maengelfrei) { pp.maengelfrei = false; LEITWERK_SPEICHER.speichern(projekt); }
    standText.innerHTML = "";
    standText.append(el("b", { text: String(B.bewertet) }), document.createTextNode(` von ${B.gesamt} Punkten bewertet`));
    balkenOk.style.width = `${((B.bewertet - B.nichtOk) / B.gesamt) * 100}%`;
    balkenNok.style.width = `${(B.nichtOk / B.gesamt) * 100}%`;
    for (const { id, ok, nok } of knoepfe) {
      ok.setAttribute("aria-pressed", String(pp.bewertung[id] === "ok"));
      nok.setAttribute("aria-pressed", String(pp.bewertung[id] === "nok"));
    }
    for (const { art, knopf } of artKnoepfe) knopf.setAttribute("aria-pressed", String(pp.art === art));
    for (const karte of formular.querySelectorAll(".pp-karte")) {
      if (!karte.stand) continue;
      const { stand, abschnitt } = karte.stand;
      stand.textContent = `${abschnitt.punkte.filter((p) => pp.bewertung[p.id]).length} / ${abschnitt.punkte.length}`;
    }
    haekchen.disabled = !B.alleOk;
    haekchen.checked = B.maengelfrei;
    abschluss.classList.toggle("pp-alles-ok", B.alleOk);
    hinweis.classList.toggle("pp-warnung", B.nichtOk > 0);
    hinweis.textContent = B.nichtOk > 0
      ? `${B.nichtOk} Punkt(e) nicht OK – erst beheben, dann bestätigen.`
      : B.alleOk ? "Alle Punkte OK." : `Noch ${B.gesamt - B.bewertet} Punkt(e) offen.`;
  };
  formularAktualisieren();
}

// ---- Stromkreisverzeichnis am Bildschirm (DIN VDE 0100-510, 514.5) ---------------------------
// Eine Tabelle zum Ausfüllen: Zeilen = Schutzeinrichtungen aus dem Plan (gerechnet), getippt
// werden Verbraucher, Leitung, Länge, Ik, Ausschaltvermögen, Einbauort und Bemessung – sie
// landen am Bauteil. Gedruckt wird das Blatt als Tabelle mit Folgeseiten wie die Stückliste.
const SK = LEITWERK_STROMKREISE;
const SK_PFLICHT = ["verbraucher", "leitung", "ort"]; // 514.5: Verbraucher, Leiter/Kabelart, Einbauort

function stromkreisFormularAufbauen(blatt) {
  formular.innerHTML = "";
  formularFuer = blatt.id;
  const stand = el("span", { class: "pp-stand-text" });
  formular.appendChild(el("div", { class: "pp-kopf" }, [
    el("div", {}, [el("span", { class: "pp-norm", text: "DIN VDE 0100-510, 514.5" }), el("h1", { text: blatt.titel })]),
    el("div", { class: "pp-stand" }, [stand]),
  ]));
  const kreise = SK.liste(projekt);
  const karte = el("section", { class: "pp-karte" });
  formular.appendChild(karte);
  if (!kreise.length) {
    karte.appendChild(el("p", { text: "Im Plan gibt es noch keine Schutzeinrichtung (Sicherung, Leitungsschutz-, Motorschutz-, Fehlerstrom-Schutzschalter …). Sobald eine gesetzt ist, steht hier ihre Zeile." }));
    stand.textContent = "keine Stromkreise";
    return;
  }
  karte.appendChild(el("p", { class: "sk-hinweis", text: "Pflicht nach 514.5: Verbraucher, Leitung (Art, Aderzahl × Querschnitt) und Einbauort. Länge, Ik und Ausschaltvermögen empfiehlt die Norm. Die Bemessung steht auch am Symbol im Plan." }));

  const spalten = [["bemessung", "Bemessung", "z. B. B16"], ...SK.FELDER.map((f) => [f.id, f.name, f.platzhalter]), ["ort", "Einbauort", "+UV-EG"]];
  const kopf = el("tr", {}, [el("th", { text: "BMK" }), el("th", { text: "Schutzeinrichtung" }),
    ...spalten.map(([, name]) => el("th", { text: name })), el("th", { text: "Plan" })]);
  const koerper = el("tbody");
  const zaehlen = () => {
    const offen = SK.liste(projekt).filter((k) => SK_PFLICHT.some((f) => !(f === "ort" ? k.ort : k.daten[f]))).length;
    stand.textContent = offen ? `${kreise.length} Stromkreise, ${offen} mit fehlenden Pflichtangaben` : `${kreise.length} Stromkreise, alle Pflichtangaben da`;
  };
  for (const k of kreise) {
    const zellen = spalten.map(([id, name, platzhalter]) => {
      const wert = id === "ort" ? k.ort : id === "bemessung" ? k.bemessung : (k.daten[id] || "");
      const eingabe = el("input", { type: "text", value: wert, placeholder: platzhalter, "aria-label": `${k.bmk} ${name}`,
        class: SK_PFLICHT.includes(id) ? "sk-pflicht" : "" });
      eingabe.addEventListener("input", () => {
        SK.feldSetzen(k.bauteil, id, eingabe.value.trim());
        LEITWERK_SPEICHER.speichern(projekt);
        zaehlen();
      });
      return el("td", {}, [eingabe]);
    });
    const hin = el("button", { type: "button", class: "sk-plan", text: k.planOrt, title: "Im Plan zeigen",
      onclick: () => { aktivesBlattId = k.blatt.id; renderAlles(); bauteilAuswaehlen(k.bauteil.id); renderBlatt(); } });
    koerper.appendChild(el("tr", {}, [el("td", { class: "sk-bmk", text: k.bmk }), el("td", { class: "sk-art", text: k.art }), ...zellen, el("td", {}, [hin])]));
  }
  karte.appendChild(el("div", { class: "sk-rahmen" }, [el("table", { class: "sk-tabelle" }, [el("thead", {}, [kopf]), koerper])]));
  zaehlen();
}

// Messwerte je Stromkreis (DIN VDE 0100-600, 6.4.4): Zeilen = Schutzeinrichtungen aus dem Plan,
// Spalten = P.MESSGROESSEN. Werte hängen an der Bauteil-id. Alte Klemmenwerte darunter.
function stromkreisMesstabelle(A, pp, merken) {
  const block = el("div", { class: "pp-messpunkte" });
  block.appendChild(el("strong", { text: "Messwerte je Stromkreis" }));
  if (!A.stromkreise.length) {
    block.appendChild(el("p", { class: "sk-hinweis", text: "Stromkreise entstehen aus den Schutzeinrichtungen im Plan (Sicherung, LS, RCD …) – noch keine gesetzt." }));
  } else {
    const kopf = el("tr", {}, [el("th", { text: "Stromkreis" }), el("th", { text: "Verbraucher" }),
      ...P.MESSGROESSEN.map((g) => el("th", { title: g.titel, text: `${g.name} ${g.einheit}` }))]);
    const koerper = el("tbody");
    for (const k of A.stromkreise) {
      const id = k.bauteil.id;
      const werte = pp.stromkreise[id] || {};
      koerper.appendChild(el("tr", {}, [
        el("td", { class: "sk-bmk", title: k.art, text: k.bmk + (k.fehlerstrom ? " (RCD)" : "") }),
        el("td", { class: "sk-art", text: k.daten.verbraucher || k.bemessung || "" }),
        ...P.MESSGROESSEN.map((g) => {
          // Grenzwert verletzt → Feld kupfern/rot mit Erklärung; nur Hinweis, nichts gesperrt.
          const kreis = { typ: k.bauteil.typ, bemessung: k.bauteil.beschriftung, fehlerstrom: k.fehlerstrom };
          const pruefen = (feld) => {
            const hinweis = P.grenzwertHinweis(g.id, feld.value, kreis);
            feld.classList.toggle("grenze-verletzt", Boolean(hinweis));
            feld.title = hinweis || g.titel;
          };
          const feld = el("input", {
            type: "text", inputmode: "decimal", value: werte[g.id] || "", placeholder: "—",
            "aria-label": `${k.bmk} ${g.titel}`,
            // Nichts Leeres speichern: ein Stromkreis ohne Werte verschwindet aus pp.stromkreise.
            oninput: (e) => {
              if (e.target.value) werte[g.id] = e.target.value; else delete werte[g.id];
              if (Object.keys(werte).length) pp.stromkreise[id] = werte; else delete pp.stromkreise[id];
              pruefen(e.target);
              merken();
            },
          });
          pruefen(feld);
          return el("td", {}, [feld]);
        }),
      ]));
    }
    block.appendChild(el("div", { class: "sk-rahmen" }, [el("table", { class: "sk-tabelle pp-messwerte" }, [el("thead", {}, [kopf]), koerper])]));
  }
  if (A.klemmenwerte.length) {
    block.appendChild(el("p", { class: "sk-hinweis", text: "Aus einem älteren Protokoll (Messwerte je Klemme):" }));
    const liste = el("ul");
    for (const { klemme, werte } of A.klemmenwerte) {
      liste.appendChild(el("li", { text: `${klemme}: ${P.MESSGROESSEN.filter((g) => werte[g.id]).map((g) => `${g.name} ${werte[g.id]} ${g.einheit}`).join(", ")}` }));
    }
    block.appendChild(liste);
  }
  return block;
}


function haken() {
  return svgEl("svg", { viewBox: "0 0 14 14", width: 14, height: 14, "aria-hidden": "true" },
    [svgEl("path", { d: "M2.5 7.5l3 3 6-7", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" })]);
}
function kreuz() {
  return svgEl("svg", { viewBox: "0 0 12 12", width: 12, height: 12, "aria-hidden": "true" },
    [svgEl("path", { d: "M2.5 2.5l7 7M9.5 2.5l-7 7", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" })]);
}

// Druckseite: dieselben Punkte wie das Formular auf einer A4-Seite quer, links Anlage,
// Besichtigung und Erprobung, rechts Messen/Prüfen und Abschluss (über dem Schriftfeld).
function zeichnePruefprotokoll(gruppe, blatt) {
  const A = P.ansicht(projekt, blatt);
  const pp = A.pp;
  const Z = 4.4; // Zeilenhöhe mm
  const links = { x: R.RASTER_X + 4, breite: R.RASTER_BREITE / 2 - 7 };
  const rechts = { x: R.RASTER_X + R.RASTER_BREITE / 2 + 3, breite: R.RASTER_BREITE / 2 - 7 };
  const t = (inhalt, x, y, klasse = "pp-druck-text") => gruppe.appendChild(text(inhalt, { x, y, class: klasse }));
  const linie = (x1, y1, x2, y2, klasse = "pp-druck-linie") => gruppe.appendChild(svgEl("line", { x1, y1, x2, y2, class: klasse }));
  const kaestchen = (x, y, an, beschriftung) => {
    gruppe.appendChild(svgEl("rect", { x, y: y - 2.4, width: 2.8, height: 2.8, class: "pp-druck-kasten" }));
    if (an) linie(x + 0.5, y - 1.9, x + 2.3, y - 0.1, "pp-druck-kreuz"), linie(x + 2.3, y - 1.9, x + 0.5, y - 0.1, "pp-druck-kreuz");
    t(beschriftung, x + 3.8, y);
  };
  const urteil = (spalte, y, id) => {
    const ende = spalte.x + spalte.breite;
    kaestchen(ende - 30, y, pp.bewertung[id] === "ok", "OK");
    kaestchen(ende - 16, y, pp.bewertung[id] === "nok", "nicht OK");
  };

  // Links: Titel, Kopfdaten, Prüfung nach
  let y = R.RASTER_Y + 6;
  t("Prüfprotokoll nach DIN VDE 0100-600", links.x, y, "pp-druck-titel");
  y += 4;
  const kopf = [
    [["Kunden-Nr.", pp.kundenNr], ["Prüfprotokoll-Nr.", pp.protokollNr], ["Blattnummer", A.stamm.blattnummer]],
    [["Auftraggeber", A.stamm.auftraggeber], ["Auftragnehmer", A.stamm.auftragnehmer]],
    [["Anlage", A.stamm.anlage], ["Prüfer", A.stamm.pruefer]],
    [["Umfang der Prüfung", pp.umfang]],
  ];
  const kopfHoehe = 7.5;
  gruppe.appendChild(svgEl("rect", { x: links.x, y, width: links.breite, height: kopf.length * kopfHoehe, class: "pp-druck-rahmen" }));
  kopf.forEach((reihe, r) => {
    const yr = y + r * kopfHoehe;
    if (r > 0) linie(links.x, yr, links.x + links.breite, yr);
    const b = links.breite / reihe.length;
    reihe.forEach(([name, wert], s) => {
      const xs = links.x + s * b;
      if (s > 0) linie(xs, yr, xs, yr + kopfHoehe);
      t(name, xs + 1.2, yr + 2.6, "pp-druck-klein");
      t(gekuerzt(wert || "", b - 2.4, 3, 0.5), xs + 1.2, yr + 6.2);
    });
  });
  y += kopf.length * kopfHoehe + 5;
  t("Prüfung nach:", links.x, y, "pp-druck-fett");
  P.ARTEN.forEach((art, i) => kaestchen(links.x + 24 + i * 25, y, pp.art === art, art));
  y += 4;

  // Links: Besichtigung, Erprobung
  const abschnittZeichnen = (spalte, abschnitt, yStart) => {
    let yy = yStart + 5;
    t(abschnitt.titel, spalte.x, yy, "pp-druck-fett");
    linie(spalte.x, yy + 1.2, spalte.x + spalte.breite, yy + 1.2);
    yy += 1.2;
    for (const p of abschnitt.punkte) {
      yy += Z;
      t(p.titel, spalte.x, yy);
      if (p.wert) t(`gemessen: ${pp.werte[p.id] || "______"} ${p.wert}`, spalte.x + spalte.breite - 68, yy);
      urteil(spalte, yy, p.id);
      if (p.detail) { yy += Z - 1; t(p.detail, spalte.x + 3, yy, "pp-druck-klein"); }
    }
    return yy;
  };
  const [besichtigung, messen, erprobung] = P.ABSCHNITTE;
  y = abschnittZeichnen(links, besichtigung, y);
  y = abschnittZeichnen(links, erprobung, y + 2);

  // Rechts: Messen/Prüfen (Messwerte je Stromkreis stehen auf den Folgeseiten)
  let yr = R.RASTER_Y + 1;
  yr = abschnittZeichnen(rechts, messen, yr);
  const platzBis = R.SCHRIFTFELD.y - 34; // Abschluss braucht darunter ~30 mm
  let yTabEnde = yr;

  // Rechts: Verweis auf die Messwert-Seiten, Messgerät, Verantwortliche, Empfehlung,
  // Bemerkungen (DIN VDE 0100-600, 6.4.4).
  let yi = yTabEnde + 2;
  const zeile = (name, wert) => {
    yi += Z;
    t(name, rechts.x, yi, "pp-druck-klein");
    t(gekuerzt(wert || "—", rechts.breite - 44, 3, 0.5), rechts.x + 44, yi);
  };
  const seiten = M.seitenzahl(projekt, blatt);
  if (seiten > 1) {
    const erste = M.blattNummer(projekt, blatt.id) + 1;
    yi += Z;
    t(`Messwerte je Stromkreis: Blatt ${erste}${seiten > 2 ? `–${erste + seiten - 2}` : ""}`, rechts.x, yi, "pp-druck-fett");
  }
  const mg = pp.messgeraet;
  zeile("Messgerät", mg.typ);
  zeile("Seriennr. / kalibriert bis", [mg.seriennummer, mg.kalibriertBis].filter(Boolean).join(" / "));
  zeile("Verantwortlich Planung", pp.verantwortlich.planung || projekt.meta.errichter);
  zeile("Verantwortlich Errichtung", A.stamm.errichtung);
  zeile("Verantwortlich Prüfung", A.stamm.pruefung);
  zeile("Nächste Prüfung empfohlen in", pp.naechstePruefung);
  zeile("Bemerkungen", pp.bemerkungen);
  yTabEnde = yi;

  // Rechts unten: Abschluss
  let ya = Math.max(yTabEnde + 6, platzBis);
  kaestchen(rechts.x, ya, A.maengelfrei, "Die elektrische Anlage entspricht den anerkannten Regeln");
  ya += Z - 0.8;
  t("der Elektrotechnik und ist mängelfrei.", rechts.x + 3.8, ya);
  ya += 12;
  const drittel = rechts.breite / 3;
  [["Ort", pp.ort], ["Datum", A.stamm.datum], ["Unterschrift Elektrofachkraft", ""]].forEach(([name, wert], i) => {
    const x = rechts.x + i * drittel;
    t(wert || "", x, ya - 1.5);
    linie(x, ya, x + drittel - 4, ya);
    t(name, x, ya + 3, "pp-druck-klein");
  });
}

// Ein ganzes Blatt in eine SVG-Gruppe zeichnen – für die Zeichenfläche wie für den Druck.
// `seite` zählt die Folgeseiten eines erzeugten Blatts (0 = erste), `yVersatz` ist, wie weit
// diese Seite am Bildschirm unter der ersten liegt – nur für die Trefferflächen.
function zeichneBlatt(gruppe, blatt, seite = 0, yVersatz = 0) {
  zeichneRahmenUndRaster(gruppe);
  if (M.istErzeugt(blatt)) {
    // Prüfbericht: Seite 1 das Protokoll, danach die Messwert-Seiten (erzeugte-blaetter.js).
    if (blatt.typ === "pruefprotokoll" && seite === 0) zeichnePruefprotokoll(gruppe, blatt);
    else zeichneErzeugtesBlatt(gruppe, blatt, blatt.typ === "pruefprotokoll" ? seite - 1 : seite, yVersatz);
    zeichneSchriftfeld(gruppe, blatt, seite);
    return;
  }
  zeichneStrompfadSchienen(gruppe, blatt);
  zeichneBaugruppenrahmen(gruppe, blatt);
  zeichneStrompfadVerbindungen(gruppe, blatt);
  zeichneSchienenAnbindungen(gruppe, blatt);
  zeichneBauteile(gruppe, blatt);
  zeichneAnschlussnummern(gruppe, blatt);
  zeichneKontaktspiegel(gruppe, blatt);
  zeichneVerbindungen(gruppe, blatt);
  zeichneKlemmenleisten(gruppe, blatt);
  zeichneFunktionsklammern(gruppe, blatt);
  zeichneTexte(gruppe, blatt);
  zeichnePotenziale(gruppe, blatt);
  zeichneSchriftfeld(gruppe, blatt);
  zeichneFreihand(gruppe, blatt); // zuletzt: Notizen liegen über allem, auch über dem Schriftfeld
}

const SEITEN_ABSTAND = 12; // mm zwischen Folgeseiten am Bildschirm

function renderBlatt() {
  blattinhalt.innerHTML = "";
  tabellenZiele = [];
  const blatt = aktivesBlatt();
  if (!blatt) return;
  const erzeugt = M.istErzeugt(blatt);
  document.body.classList.toggle("erzeugtes-blatt-aktiv", erzeugt);
  if (blattTitelFeld.value !== blatt.titel) blattTitelFeld.value = blatt.titel;
  blattArtAuswahl.value = blatt.typ;
  blattArtAuswahl.disabled = blatt.typ === "inhaltsverzeichnis";
  // Formularblatt: das Formular statt der Zeichenfläche. Neu aufgebaut nur beim Wechsel
  // auf das Blatt – sonst verlöre ein Feld beim Tippen den Fokus.
  const istFormular = M.istFormular(blatt);
  svg.style.display = istFormular ? "none" : "";
  document.body.classList.toggle("formular-aktiv", istFormular);
  formular.hidden = !istFormular;
  if (istFormular) {
    if (formularFuer !== blatt.id) formularAufbauen(blatt);
    return;
  }
  formularFuer = null;
  // Folgeseiten liegen am Bildschirm untereinander – nach unten schieben zeigt sie.
  const seiten = M.seitenzahl(projekt, blatt);
  for (let seite = 0; seite < seiten; seite++) {
    const versatz = seite * (R.BLATT_HOEHE + SEITEN_ABSTAND);
    const gruppe = seite === 0 ? blattinhalt : svgEl("g", { transform: `translate(0 ${versatz})` });
    if (seite > 0) blattinhalt.appendChild(gruppe);
    zeichneBlatt(gruppe, blatt, seite, versatz);
  }
  if (erzeugt) return;
  anschlussnummernSchalter.checked = blatt.anschlussnummernSichtbar;
  notizenSchalter.checked = blatt.freihand.sichtbar;
  schienenVorlageAuswahl.value = schienenVorlageVon(blatt);
  bindungsfelderAktualisieren();
}

// ---- Meldungsleiste: Statuszeile + Rückfrage statt native alert()/confirm() ----------
// Native Dialoge werden auf dem Android-Tablet mit Stift unbrauchbar und in manchen
// Umgebungen stumm unterdrückt (siehe CLAUDE.md). Ersatz: eine Leiste im Fenster.

const meldungsleiste = document.getElementById("meldungsleiste");
const meldungText = document.getElementById("meldungText");
const meldungAktionen = document.getElementById("meldungAktionen");
let meldungTimer = null;

function meldungVerbergen() {
  clearTimeout(meldungTimer);
  meldungTimer = null;
  meldungsleiste.hidden = true;
  meldungsleiste.classList.remove("status", "warnung", "rueckfrage");
  meldungAktionen.innerHTML = "";
}

// Ersetzt alert(): kurze Statusmeldung, verschwindet von selbst wieder.
function status(nachricht, art = "status") {
  clearTimeout(meldungTimer);
  meldungAktionen.innerHTML = "";
  meldungText.textContent = nachricht;
  meldungsleiste.hidden = false;
  meldungsleiste.classList.remove("status", "warnung", "rueckfrage");
  meldungsleiste.classList.add(art);
  meldungTimer = setTimeout(meldungVerbergen, 4000);
}

// Ersetzt confirm(): Ja/Nein-Leiste, bleibt stehen bis Franz antwortet. beiJa wird nur
// bei "Ja" aufgerufen, bei "Nein" oder Ignorieren passiert nichts.
function rueckfrage(frage, beiJa) {
  clearTimeout(meldungTimer);
  meldungText.textContent = frage;
  meldungAktionen.innerHTML = "";
  meldungsleiste.hidden = false;
  meldungsleiste.classList.remove("status", "warnung", "rueckfrage");
  meldungsleiste.classList.add("rueckfrage");

  const jaKnopf = document.createElement("button");
  jaKnopf.textContent = "Ja";
  jaKnopf.addEventListener("click", () => {
    meldungVerbergen();
    beiJa();
  });

  const neinKnopf = document.createElement("button");
  neinKnopf.textContent = "Nein";
  neinKnopf.addEventListener("click", meldungVerbergen);

  meldungAktionen.appendChild(jaKnopf);
  meldungAktionen.appendChild(neinKnopf);
}

// ---- Format-Version: prüfen und Altlasten umschreiben ----------------------------------
// Version 2 hat bauteil.typ als Kontakt-Ersatz (z.B. "schalter", "taster-schliesser")
// durch kontakt/betaetigung/kennzeichen ersetzt. Version 3 hat bauteil.x/y durch
// pfad/hoehe ersetzt (Vorbild E-Plan: Strompfad statt freier Koordinate). Version 4 hat
// bauteil.anschluesse gestrichen (wird berechnet, nie gespeichert) und Verbindung.von/bis
// als freien Punkt {x,y} gestrichen – eine Leitung zu einer Sammelschiene ergibt sich aus
// Pfad + Schienenlage, nicht aus einer getippten Koordinate. Version 5 hat
// blatt.potenzialOben/-Unten durch die Liste blatt.schienen ersetzt; die Anbindung steht
// seitdem am Bauteilanschluss (bauteil.schienen). Siehe FORMAT.md und CLAUDE.md. Ohne diese Prüfung sieht ein Projekt im alten Format genauso aus wie eins
// mit Bauteilen aus einer noch nicht gebauten Gruppe – beides nur Platzhalter-Kästen,
// nicht zu unterscheiden.
const ALTE_KONTAKT_TYPEN = {
  schalter: { kontakt: "schliesser", betaetigung: "handantrieb-allgemein" },
  "taster-schliesser": { kontakt: "schliesser", betaetigung: "druecken" },
  "taster-oeffner": { kontakt: "oeffner", betaetigung: "druecken" },
};

function bauteilBrauchtMigration(bauteil) {
  return Boolean(ALTE_KONTAKT_TYPEN[bauteil.typ])
    || typeof bauteil.x === "number"
    || bauteil.anschluesse !== undefined;
}

function migriereBauteil(bauteil) {
  const ersatz = ALTE_KONTAKT_TYPEN[bauteil.typ];
  if (ersatz) {
    delete bauteil.typ;
    bauteil.kontakt = ersatz.kontakt;
    bauteil.betaetigung = ersatz.betaetigung;
    bauteil.kennzeichen = [];
  }
  if (typeof bauteil.x === "number") {
    bauteil.pfad = R.pfadAusX(bauteil.x);
    bauteil.hoehe = R.hoeheAusY(bauteil.y);
    delete bauteil.x;
    delete bauteil.y;
  }
  delete bauteil.anschluesse; // wird seit Version 4 nie gespeichert, siehe FORMAT.md.
}

// Verbindung.von/bis als freier Punkt {x,y} – seit Version 4 nicht mehr unterstützt, wird
// beim Migrieren entfernt statt umgeschrieben, weil es kein echtes Ziel gibt.
function verbindungBrauchtMigration(verbindung) {
  return [verbindung.von, verbindung.bis].some((e) => typeof e.x === "number");
}

// Version 5: potenzialOben/-Unten → blatt.schienen. Früher hing jeder belegte Pfad an
// beiden Schienen; damit das Blatt danach genauso aussieht, bekommt in jedem belegten
// Pfad das oberste Bauteil schienen["1"] = alte obere, das unterste schienen["2"] = alte
// untere Schiene (FORMAT.md, „Umschreiben auf Version 5"). Verlustfrei.
function blattBrauchtMigration(blatt) {
  return !Array.isArray(blatt.schienen) || "potenzialOben" in blatt || "potenzialUnten" in blatt;
}

function migriereBlattSchienen(blatt) {
  const oben = blatt.potenzialOben || null;
  const unten = blatt.potenzialUnten || null;
  blatt.schienen = Array.isArray(blatt.schienen) ? blatt.schienen : [];
  if (oben) blatt.schienen.push(M.neueSchiene(oben, "oben"));
  if (unten && unten !== oben) blatt.schienen.push(M.neueSchiene(unten, "unten"));
  for (let pfad = 1; pfad <= R.SPALTEN; pfad++) {
    const pole = poleImPfad(blatt, pfad);
    if (pole.length === 0) continue;
    const erster = pole[0], letzter = pole[pole.length - 1];
    if (oben) (erster.bauteil.schienen ||= {})[erster.oben] = oben;
    if (unten) (letzter.bauteil.schienen ||= {})[letzter.unten] = unten;
  }
  delete blatt.potenzialOben;
  delete blatt.potenzialUnten;
}

// Bindungen eines schaltenden Bauteils an PE/PEN – nie erlaubt (FORMAT.md). Nicht
// automatisch löschbar (welche Schiene gemeint war, weiß nur der Zeichner), deshalb nur
// gemeldet und rot gezeichnet.
function verboteneBindungen(p) {
  let zahl = 0;
  for (const blatt of M.zeichenblaetter(p)) {
    for (const bauteil of blatt.bauteile) {
      zahl += Object.values(bauteil.schienen || {}).filter((name) => bindungVerboten(bauteil, name)).length;
    }
  }
  return zahl;
}

// Liefert true, wenn eine Meldung/Rückfrage gezeigt wurde (dann keine weitere
// Statuszeile obendrauf, z.B. "Geladen." beim Laden-Knopf).
function pruefeUndMigriere(p) {
  if (!p) return false;
  // Kabel (Stufe 4c) fehlen in älteren Projekten – das heißt nur: noch keine. Ebenso die
  // Freihand-Ebene auf Blättern, die vor ihr entstanden sind.
  p.kabel ||= [];
  M.metaVervollstaendigen(p);
  for (const blatt of M.zeichenblaetter(p)) blatt.freihand ||= { sichtbar: true, striche: [] };
  if (p.version === M.VERSION) {
    const verboten = verboteneBindungen(p);
    if (verboten === 0) return false;
    status(`${verboten} Anschluss/Anschlüsse eines Schaltgeräts an PE gebunden (rot) – PE wird nie geschaltet.`, "warnung");
    return true;
  }
  const alteVersion = p.version ?? "unbekannt";
  // Erzeugte Blätter haben keinen Inhalt, also auch nichts umzuschreiben.
  const blaetterBetroffen = M.zeichenblaetter(p).filter(blattBrauchtMigration);
  const bauteileBetroffen = [];
  for (const blatt of M.zeichenblaetter(p)) {
    for (const bauteil of blatt.bauteile) {
      if (bauteilBrauchtMigration(bauteil)) bauteileBetroffen.push(bauteil);
    }
  }
  const verbindungenBetroffen = M.zeichenblaetter(p).reduce(
    (summe, blatt) => summe + blatt.verbindungen.filter(verbindungBrauchtMigration).length, 0,
  );
  if (bauteileBetroffen.length === 0 && verbindungenBetroffen === 0 && blaetterBetroffen.length === 0) {
    p.version = M.VERSION;
    status(`Projekt im alten Format (Version ${alteVersion}) geladen – auf Version ${M.VERSION} gebracht.`);
    return true;
  }
  rueckfrage(
    `Altes Dateiformat (Version ${alteVersion}): ${blaetterBetroffen.length} Blatt/Blätter mit ` +
    `oberer/unterer Sammelschiene statt Schienenliste, ${bauteileBetroffen.length} Bauteil(e) und ` +
    `${verbindungenBetroffen} Verbindung(en) verwenden alte Typen, freie Koordinaten oder ` +
    `gespeicherte Anschlusspunkte statt Kontakt + Betätigung, Strompfad + Höhe und berechnete ` +
    `Anschlüsse. Bis zum Umschreiben fehlen Sammelschienen, Bauteile erscheinen als Platzhalter ` +
    `oder falsch platziert, Verbindungen zu freien Punkten haben kein echtes Ziel mehr. Jetzt umschreiben?`,
    () => {
      bauteileBetroffen.forEach(migriereBauteil);
      // Nach den Bauteilen: die Schienen-Anbindung braucht deren pfad/hoehe.
      blaetterBetroffen.forEach(migriereBlattSchienen);
      for (const blatt of M.zeichenblaetter(p)) {
        blatt.verbindungen = blatt.verbindungen.filter((v) => !verbindungBrauchtMigration(v));
      }
      p.version = M.VERSION;
      renderAlles();
      status(
        `${blaetterBetroffen.length} Blatt/Blätter und ${bauteileBetroffen.length} Bauteil(e) umgeschrieben, ${verbindungenBetroffen} ` +
        `Verbindung(en) entfernt, Projekt auf Version ${M.VERSION} gebracht.`,
      );
    },
  );
  return true;
}

// ---- Rendering: Blatt-Tabs -----------------------------------------------------------

function renderTabs() {
  const container = document.getElementById("blatttabs");
  container.innerHTML = "";
  projekt.blaetter.forEach((blatt) => {
    // Registerreiter: Nummer (Position) klein vorweg, bei erzeugten Blättern kupfern.
    const knopf = document.createElement("button");
    const nummer = document.createElement("span");
    nummer.className = M.istErzeugt(blatt) ? "tab-nummer erzeugt" : "tab-nummer";
    nummer.textContent = `/${M.blattNummernText(projekt, blatt.id)}`;
    knopf.append(nummer, ` ${blatt.titel}`);
    if (blatt.id === aktivesBlattId) knopf.classList.add("aktiv");
    knopf.addEventListener("click", () => {
      aktivesBlattId = blatt.id;
      bauteilAuswaehlen(null);
      renderAlles();
    });
    container.appendChild(knopf);
  });
}

// ---- Rendering: Querverweise-Panel ---------------------------------------------------

function renderQuerverweise() {
  const liste = document.getElementById("querverweiseListe");
  liste.innerHTML = "";
  const alleVerweise = Q.berechneAlleVerweise(projekt);
  if (projekt.potenziale.length === 0) {
    liste.innerHTML = '<p class="hinweis">Keine Potenziale im Projekt.</p>';
    return;
  }
  for (const potenzial of projekt.potenziale) {
    const eintrag = document.createElement("div");
    eintrag.className = "querverweis-eintrag";
    const vorkommen = alleVerweise.get(potenzial.id);
    const zeilen = vorkommen.map((v) => {
      const blatt = projekt.blaetter.find((b) => b.id === v.blattId);
      const nummer = M.blattNummer(projekt, v.blattId);
      const teile = [];
      if (v.kommtVon) teile.push(`kommt von ${v.kommtVon}`);
      teile.push(`liegt auf /${nummer} ${v.feld}`);
      if (v.weiterAuf) teile.push(`geht weiter auf ${v.weiterAuf}`);
      return `<li><span>${blatt ? blatt.titel : "?"}</span><span class="verweis">${teile.join(" · ")}</span></li>`;
    }).join("");
    eintrag.innerHTML = `<span class="name">${potenzial.name}</span><ul class="vorkommen">${zeilen}</ul>`;
    liste.appendChild(eintrag);
  }
}

function renderAlles() {
  formularFuer = null; // Blattwechsel, Laden, Import: Formular frisch aufbauen
  M.inhaltsverzeichnisPflegen(projekt);
  if (!aktivesBlatt()) aktivesBlattId = projekt.blaetter[0].id;
  document.getElementById("projektname").textContent =
    ([projekt.meta.anlage, projekt.meta.ersteller].filter(Boolean).join(" · ") || "Projektangaben eintragen") + " ✎";
  renderTabs();
  renderBlatt();
  renderQuerverweise();
  LEITWERK_SPEICHER.speichern(projekt);
  if (vorschau) vorschauLeisteZeigen();
}

// ---- Zoom & Pan per Pointer Events ----------------------------------------------------

const RAND_MM = 10;
let view = { x: -RAND_MM, y: -RAND_MM, w: R.BLATT_BREITE + 2 * RAND_MM, h: R.BLATT_HOEHE + 2 * RAND_MM };
const MIN_BREITE = 60;
const MAX_BREITE = 900;

function anwendenViewBox() {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}
anwendenViewBox();

function clientZuMm(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.w,
    y: view.y + ((clientY - rect.top) / rect.height) * view.h,
  };
}

function zoomAn(mmPunkt, faktor) {
  const neueBreite = Math.min(MAX_BREITE, Math.max(MIN_BREITE, view.w * faktor));
  const tatsaechlicherFaktor = neueBreite / view.w;
  view.x = mmPunkt.x - (mmPunkt.x - view.x) * tatsaechlicherFaktor;
  view.y = mmPunkt.y - (mmPunkt.y - view.y) * tatsaechlicherFaktor;
  view.w = neueBreite;
  view.h = view.h * tatsaechlicherFaktor;
  anwendenViewBox();
}

function verschieben(deltaClientX, deltaClientY) {
  const rect = svg.getBoundingClientRect();
  view.x -= (deltaClientX / rect.width) * view.w;
  view.y -= (deltaClientY / rect.height) * view.h;
  anwendenViewBox();
}

const aktivePointer = new Map();
let vorherigerAbstand = null;

svg.addEventListener("pointerdown", (evt) => {
  if (verschobenesBauteil) return; // ein zweiter Finger während des Ziehens tut nichts.
  // Zweiter Finger, während der erste schreibt: war wohl eine Zoomgeste – Strich verwerfen.
  if (laufenderStrich) { strichVerwerfen(); return; }
  // Erster Zeiger (nicht der zweite Finger einer Pinch-Geste) und ein Werkzeug aktiv,
  // das den Klick selbst deutet: Platzieren/Verbinden/Ziehen statt Schwenken.
  if (aktivePointer.size === 0 && bauteilWerkzeugBeiKlick(evt)) return;

  svg.setPointerCapture(evt.pointerId);
  aktivePointer.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
  vorherigerAbstand = null;
});

svg.addEventListener("pointermove", (evt) => {
  if (laufenderStrich) {
    if (evt.pointerId === laufenderStrich.pointerId) strichWeiter(evt);
    return;
  }
  if (verschobenesBauteil) {
    const punkt = clientZuMm(evt.clientX, evt.clientY);
    const { pfad, hoehe } = pfadHoeheAusPunkt(punkt, S.polZahl(verschobenesBauteil));
    if (pfad !== verschobenesBauteil.pfad || hoehe !== verschobenesBauteil.hoehe) {
      bauteilEinordnen(aktivesBlatt(), verschobenesBauteil, pfad, hoehe);
      renderBlatt();
    }
    return;
  }
  if (!aktivePointer.has(evt.pointerId)) return;
  const vorher = aktivePointer.get(evt.pointerId);
  aktivePointer.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

  if (aktivePointer.size === 1) {
    verschieben(evt.clientX - vorher.x, evt.clientY - vorher.y);
  } else if (aktivePointer.size === 2) {
    const punkte = [...aktivePointer.values()];
    const abstand = Math.hypot(punkte[0].x - punkte[1].x, punkte[0].y - punkte[1].y);
    const mitte = { x: (punkte[0].x + punkte[1].x) / 2, y: (punkte[0].y + punkte[1].y) / 2 };
    if (vorherigerAbstand !== null) {
      const faktor = vorherigerAbstand / abstand;
      zoomAn(clientZuMm(mitte.x, mitte.y), faktor);
    }
    vorherigerAbstand = abstand;
  }
});

function pointerEnde(evt) {
  if (laufenderStrich && evt.pointerId === laufenderStrich.pointerId) strichEnde();
  if (verschobenesBauteil) {
    verschobenesBauteil = null;
    renderAlles();
  }
  aktivePointer.delete(evt.pointerId);
  vorherigerAbstand = null;
}
svg.addEventListener("pointerup", pointerEnde);
svg.addEventListener("pointercancel", pointerEnde);
svg.addEventListener("pointerleave", pointerEnde);

svg.addEventListener("wheel", (evt) => {
  evt.preventDefault();
  const faktor = evt.deltaY > 0 ? 1.1 : 1 / 1.1;
  zoomAn(clientZuMm(evt.clientX, evt.clientY), faktor);
}, { passive: false });

document.getElementById("zoomPlus").addEventListener("click", () => {
  zoomAn({ x: view.x + view.w / 2, y: view.y + view.h / 2 }, 1 / 1.3);
});
document.getElementById("zoomMinus").addEventListener("click", () => {
  zoomAn({ x: view.x + view.w / 2, y: view.y + view.h / 2 }, 1.3);
});
document.getElementById("zoomZuruecksetzen").addEventListener("click", () => {
  view = { x: -RAND_MM, y: -RAND_MM, w: R.BLATT_BREITE + 2 * RAND_MM, h: R.BLATT_HOEHE + 2 * RAND_MM };
  anwendenViewBox();
});

// ---- Bauteile: Platzieren, Verschieben, Löschen, Verbinden ----------------------------
// Stufe 1c (Vorbild E-Plan). Platzieren/Verschieben bestimmen aus der Klick-/Zeigerposition
// einen Strompfad + eine Höhe – kein freies x/y mehr, siehe FORMAT.md „Strompfad". Nur
// Querverbindungen zwischen zwei Strompfaden bleiben eine gespeicherte Verbindung – die
// Verdrahtung innerhalb eines Pfads zeichnet zeichneStrompfadVerbindungen oben, berechnet
// aus pfad/hoehe, nie gespeichert – genau wie bauteilAnschluesse() oben nie ein
// anschluesse-Feld füllt, das jemand vergessen könnte nachzuziehen.

// Setzt ein Bauteil auf (pfad, hoehe). Ist die Höhe dort schon von einem anderen Bauteil
// belegt, rücken alle ab dieser Höhe im selben Pfad eins nach unten – ein Symbol auf eine
// bestehende Leitung gesetzt trennt sie auf und hängt sich ein, siehe FORMAT.md. Sonst
// nichts zu tun: Anschlusspunkte sind nie gespeichert, es gibt nichts nachzuziehen.
// Ein mehrpoliges Bauteil belegt mehrere Pfade – verdrängt wird alles, was sich mit
// einem davon überschneidet.
function bauteilEinordnen(blatt, bauteil, pfad, hoehe) {
  const von = pfad, bis = pfad + S.polZahl(bauteil) - 1;
  for (const andere of blatt.bauteile) {
    const andereBis = andere.pfad + S.polZahl(andere) - 1;
    const ueberschneidung = andere.pfad <= bis && andereBis >= von;
    if (andere !== bauteil && ueberschneidung && andere.hoehe >= hoehe) andere.hoehe += 1;
  }
  bauteil.pfad = pfad;
  bauteil.hoehe = hoehe;
}

// Pfad (von Pol 1) und Höhe unter einem Punkt; ein mehrpoliges Bauteil wird so weit nach
// links gerückt, dass sein letzter Pol noch auf dem Blatt steht.
function pfadHoeheAusPunkt(punkt, pole = 1) {
  return { pfad: Math.min(R.pfadAusX(punkt.x), R.SPALTEN - pole + 1), hoehe: R.hoeheAusY(punkt.y) };
}

// Schienen, an die ein Bauteil binden darf – für ein schaltendes nie PE/PEN (FORMAT.md).
function erlaubteSchienen(blatt, bauteil, lage = null) {
  return (blatt.schienen || []).filter((s) =>
    (!lage || s.lage === lage) && !bindungVerboten(bauteil, s.name));
}

// Beim Platzieren: Bindungen an Sammelschienen vorschlagen bzw. übernehmen, je Pol.
// - Alle Pfade des Bauteils waren leer: oberes Kettenende von Pol i an die i-te erlaubte
//   obere Schiene (L1/L2/L3 für drei Pole, L+ für einen), bei einpoligen Bauteilen das
//   untere an die erste erlaubte untere Schiene – wie früher potenzialOben/-Unten. Ist
//   nur ein Teil der Pfade leer, gibt es keinen Vorschlag (ein halb angebundenes
//   Drehstromgerät wäre schlimmer als gar keins).
// - Das neue Bauteil steht jetzt ganz oben (unten) im Pfad und das bisher oberste
//   (unterste) war an eine Schiene gebunden: das neue hat sich in diese Leitung
//   eingehängt und übernimmt die Bindung (FORMAT.md „Strompfad").
// Ein Bearbeitungsschritt beim Platzieren, kein Nachziehen eines Zwischenspeichers.
function schienenBeimPlatzieren(blatt, bauteil) {
  bauteil.schienen ||= {};
  // Motor: sein PE-Anschluss geht von selbst an die PE-Schiene des Blatts, wenn es eine gibt.
  if (anschlussPunkt(bauteil, "PE") && (blatt.schienen || []).some((s) => s.name === "PE")) bauteil.schienen.PE = "PE";
  const obenSchienen = erlaubteSchienen(blatt, bauteil, "oben");
  const untenSchienen = erlaubteSchienen(blatt, bauteil, "unten");
  const allesLeer = bauteilPfade(bauteil).every((pfad) => poleImPfad(blatt, pfad, bauteil).length === 0);
  bauteilPfade(bauteil).forEach((pfad, pol) => {
    const eigene = S.kettenEnden(bauteil, pol);
    const andere = poleImPfad(blatt, pfad, bauteil);
    if (allesLeer) {
      if (obenSchienen[pol]) bauteil.schienen[eigene.oben] = obenSchienen[pol].name;
      if (S.polZahl(bauteil) === 1 && untenSchienen[0] && eigene.unten !== null) bauteil.schienen[eigene.unten] = untenSchienen[0].name;
      return;
    }
    if (andere.length === 0) return;
    const oberster = andere[0], unterster = andere[andere.length - 1];
    const uebernehmen = (nachbar, nachbarEnde, eigenesEnde) => {
      const name = nachbar.bauteil.schienen && nachbar.bauteil.schienen[nachbarEnde];
      if (!name || bindungVerboten(bauteil, name)) return;
      delete nachbar.bauteil.schienen[nachbarEnde];
      bauteil.schienen[eigenesEnde] = name;
    };
    if (bauteil.hoehe < oberster.bauteil.hoehe) uebernehmen(oberster, oberster.oben, eigene.oben);
    if (bauteil.hoehe > unterster.bauteil.hoehe) uebernehmen(unterster, unterster.unten, eigene.unten);
  });
}

// Nächstgelegenes Bauteil an einem Punkt (mm), innerhalb seiner ungefähren Symbolgröße –
// fürs Auswählen/Verschieben.
function bauteilUnterPunkt(punkt, blatt) {
  let treffer = null, bester = Infinity;
  for (const bauteil of blatt.bauteile) {
    const { y } = bauteilPosition(bauteil);
    const radius = bauteilHalbeHoehe(bauteil) + 2;
    for (const pfad of bauteilPfade(bauteil)) {
      const abstand = Math.hypot(R.pfadX(pfad) - punkt.x, y - punkt.y);
      if (abstand <= radius && abstand < bester) { treffer = bauteil; bester = abstand; }
    }
  }
  return treffer;
}

// Nächstgelegener Anschlusspunkt an einem Punkt (mm) über alle Bauteile des Blatts –
// fürs Einrasten beim Verbinden (Querverbindung zwischen zwei Strompfaden).
function anschlussUnterPunkt(punkt, blatt, radiusMm = 3) {
  let treffer = null, bester = Infinity;
  for (const bauteil of blatt.bauteile) {
    for (const a of bauteilAnschluesse(bauteil)) {
      const abstand = Math.hypot(a.x - punkt.x, a.y - punkt.y);
      if (abstand <= radiusMm && abstand < bester) {
        treffer = { bauteilId: bauteil.id, anschluss: a.nummer, x: a.x, y: a.y };
        bester = abstand;
      }
    }
  }
  return treffer;
}

function bauteilAuswaehlen(id) {
  ausgewaehltesBauteilId = id;
  const blatt = aktivesZeichenblatt();
  const bauteil = blatt && blatt.bauteile.find((b) => b.id === id);
  bauteilBmkFeld.hidden = !bauteil;
  // Der kupferne Kasten gehört zur Auswahl: ohne ausgewähltes Bauteil verschwindet er. Beim
  // Stift steht er ebenfalls, dann nimmt sein Löschknopf den letzten Strich zurück.
  const stift = werkzeug === "stift" && Boolean(blatt);
  document.getElementById("auswahlKasten").hidden = !bauteil && !stift;
  document.getElementById("bauteilLoeschen").title = stift && !bauteil
    ? "Letzten Strich zurücknehmen" : "Ausgewähltes Bauteil löschen";
  if (stift && !bauteil) document.getElementById("auswahlArt").textContent = "Stift";
  if (bauteil) document.getElementById("auswahlArt").textContent = S.istKlemme(bauteil) ? "Klemme" : "Bauteil";
  if (bauteil) bauteilBmkFeld.value = S.istKlemme(bauteil) ? `${bauteil.bmk}:${bauteil.klemme}` : bauteil.bmk;
  bauteilOrtFeld.hidden = !bauteil;
  if (bauteil) bauteilOrtFeld.value = bauteil.ort || "";
  kabelfelderAktualisieren();
  bindungsfelderAktualisieren();
}

function platziereBeiKlick(punkt) {
  if (!aktivesPlatzierSymbol) { status("Erst ein Symbol aus der Palette wählen.", "warnung"); return; }
  const blatt = aktivesBlatt();
  const wahl = aktivesPlatzierSymbol;
  const { pfad, hoehe } = pfadHoeheAusPunkt(punkt, wahl.pole || 1);
  // bmk aus der Pfadnummer abgeleitet (-K3 in Pfad 3, -Q3 für ein Schaltgerät) – nur ein
  // Vorschlag, siehe FORMAT.md.
  const bauteil = wahl.kontakt
    ? M.neuerKontakt(`-K${pfad}`, wahl.kontakt, aktiveBetaetigung || null, [], pfad, hoehe, "")
    : M.neuesBauteil(`-${wahl.bmk}${pfad}`, wahl.typ, pfad, hoehe, "", wahl.pole);
  // Eine Klemme gehört zu einer Leiste, nicht zu einem Pfad: Vorschlag -X1 und die nächste
  // freie Nummer dort. Umbenennen im BMK-Feld als „-X2:7".
  if (S.istKlemme(bauteil)) {
    bauteil.bmk = "-X1";
    bauteil.klemme = String(naechsteKlemme("-X1"));
  }
  // Einbauort: Vorschlag ist der des zuletzt gesetzten Bauteils mit Ort auf diesem Blatt –
  // meist ist ein Blatt ein Verteiler (DIN EN 81346, „+UV-EG").
  const letzterOrt = [...blatt.bauteile].reverse().find((b) => b.ort);
  if (letzterOrt) bauteil.ort = letzterOrt.ort;
  bauteilEinordnen(blatt, bauteil, pfad, hoehe);
  schienenBeimPlatzieren(blatt, bauteil);
  blatt.bauteile.push(bauteil);
  bauteilAuswaehlen(bauteil.id);
  renderAlles();
  status(`${bauteil.bmk} in Pfad ${pfad} platziert.`);
}

// Nächste freie Klemmennummer einer Leiste über alle Blätter.
function naechsteKlemme(leiste) {
  let hoechste = 0;
  for (const blatt of M.zeichenblaetter(projekt)) {
    for (const b of blatt.bauteile) {
      if (S.istKlemme(b) && b.bmk === leiste) hoechste = Math.max(hoechste, parseInt(b.klemme, 10) || 0);
    }
  }
  return hoechste + 1;
}

function verbindenBeiKlick(punkt, blatt) {
  const treffer = anschlussUnterPunkt(punkt, blatt);
  if (!treffer) {
    if (verbindenStart) {
      verbindenStart = null;
      renderBlatt();
    }
    status("Kein Anschlusspunkt getroffen.", "warnung");
    return;
  }
  if (!verbindenStart) {
    verbindenStart = treffer;
    renderBlatt();
    status(`Startpunkt ${treffer.anschluss} gewählt – zweiten Anschlusspunkt antippen.`);
    return;
  }
  if (verbindenStart.bauteilId === treffer.bauteilId && verbindenStart.anschluss === treffer.anschluss) {
    status("Anfang und Ende sind derselbe Punkt.", "warnung");
    return;
  }
  blatt.verbindungen.push(M.neueVerbindung(
    { bauteilId: verbindenStart.bauteilId, anschluss: verbindenStart.anschluss },
    { bauteilId: treffer.bauteilId, anschluss: treffer.anschluss },
  ));
  verbindenStart = null;
  renderAlles();
  status("Verbindung gezogen.");
}

// Zentraler Einstieg für pointerdown auf der Zeichenfläche: true, wenn das aktive
// Werkzeug den Klick verbraucht hat (dann kein Schwenken/Zoomen).
function bauteilWerkzeugBeiKlick(evt) {
  if (vorschau) return false; // Vorschau: nur schwenken und zoomen
  const punkt = clientZuMm(evt.clientX, evt.clientY);
  // Erzeugtes Blatt: kein Zeichenwerkzeug, nur Antippen einer Zeile (sonst Schwenken).
  if (aktivesBlatt() && M.istErzeugt(aktivesBlatt())) return erzeugtesBlattBeiKlick(punkt);
  const blatt = aktivesZeichenblatt();
  if (!blatt) return false;

  if (werkzeug === "platzieren") {
    platziereBeiKlick(punkt);
    return true;
  }
  if (werkzeug === "verbinden") {
    verbindenBeiKlick(punkt, blatt);
    return true;
  }
  if (werkzeug === "stift") return strichBeginnen(evt, punkt, blatt);
  // Werkzeug "auswaehlen": auf ein Bauteil getroffen? Dann ziehen statt schwenken.
  const bauteil = bauteilUnterPunkt(punkt, blatt);
  if (bauteil) {
    svg.setPointerCapture(evt.pointerId);
    verschobenesBauteil = bauteil;
    bauteilAuswaehlen(bauteil.id);
    renderBlatt();
    return true;
  }
  if (ausgewaehltesBauteilId) {
    bauteilAuswaehlen(null);
    renderBlatt();
  }
  return false;
}

// ---- Freihand: Striche mit Stift, Finger oder Maus ----------------------------------------
// Ein Strich ist nur eine Punktliste in mm (FORMAT.md „Blatt", `freihand`). Keine
// Handschrift-Erkennung. Hat das Gerät einmal einen Stift gemeldet, schwenkt der Finger
// wieder (Handballen und Zeigefinger schreiben dann nicht mit).
function strichBeginnen(evt, punkt, blatt) {
  if (evt.pointerType === "pen") stiftGesehen = true;
  if (evt.pointerType === "touch" && stiftGesehen) return false;
  if (!blatt.freihand.sichtbar) {
    blatt.freihand.sichtbar = true; // wer schreibt, will es sehen
    renderAlles();
  }
  svg.setPointerCapture(evt.pointerId);
  const start = [runde(punkt.x), runde(punkt.y)];
  const linie = freihandLinie([start, start]);
  blattinhalt.appendChild(linie);
  laufenderStrich = { pointerId: evt.pointerId, punkte: [start], linie };
  return true;
}

function runde(mm) { return Math.round(mm * 10) / 10; }

function strichWeiter(evt) {
  const ereignisse = evt.getCoalescedEvents ? evt.getCoalescedEvents() : [evt];
  for (const e of ereignisse.length ? ereignisse : [evt]) {
    const p = clientZuMm(e.clientX, e.clientY);
    const letzter = laufenderStrich.punkte[laufenderStrich.punkte.length - 1];
    if (Math.hypot(p.x - letzter[0], p.y - letzter[1]) < 0.3) continue; // Zittern, kein neuer Punkt
    laufenderStrich.punkte.push([runde(p.x), runde(p.y)]);
  }
  laufenderStrich.linie.setAttribute("points", laufenderStrich.punkte.map(([x, y]) => `${x},${y}`).join(" "));
}

function strichEnde() {
  const { punkte } = laufenderStrich;
  laufenderStrich = null;
  if (punkte.length === 1) punkte.push([...punkte[0]]); // Antippen = Punkt
  aktivesZeichenblatt().freihand.striche.push({ punkte });
  renderAlles();
}

function strichVerwerfen() {
  laufenderStrich.linie.remove();
  laufenderStrich = null;
}

// ---- Werkzeugleiste + Symbolpalette -----------------------------------------------------
// "Platzieren" ist kein eigenes Werkzeug-Knöpfchen mehr: eine Kachel aus der Palette zu
// wählen, ist das Werkzeug (Symbolauswahl statt Aufklappliste, siehe CLAUDE.md).

const werkzeugKnoepfe = {
  auswaehlen: document.getElementById("werkzeugAuswaehlen"),
  verbinden: document.getElementById("werkzeugVerbinden"),
  stift: document.getElementById("werkzeugStift"),
};
const symbolpalette = document.getElementById("symbolpalette");
const betaetigungAuswahl = document.getElementById("betaetigungAuswahl");
const bauteilBmkFeld = document.getElementById("bauteilBmk");
const bauteilOrtFeld = document.getElementById("bauteilOrt");
bauteilOrtFeld.addEventListener("input", () => {
  const blatt = aktivesZeichenblatt();
  const bauteil = blatt && blatt.bauteile.find((b) => b.id === ausgewaehltesBauteilId);
  if (!bauteil) return;
  LEITWERK_STROMKREISE.feldSetzen(bauteil, "ort", bauteilOrtFeld.value.trim());
  LEITWERK_SPEICHER.speichern(projekt);
});
const anschlussnummernSchalter = document.getElementById("anschlussnummernSichtbar");
const notizenSchalter = document.getElementById("notizenSichtbar");

notizenSchalter.addEventListener("change", () => {
  const blatt = aktivesZeichenblatt();
  if (!blatt) return;
  blatt.freihand.sichtbar = notizenSchalter.checked;
  renderAlles();
});

anschlussnummernSchalter.addEventListener("change", () => {
  const blatt = aktivesZeichenblatt();
  if (!blatt) return;
  blatt.anschlussnummernSichtbar = anschlussnummernSchalter.checked;
  renderAlles();
});

// symbol: { kontakt } oder { typ, pole, bmk } – genau das, was platziereBeiKlick braucht.
// ---- Sammelschienen: Vorlage je Blatt, Bindung des ausgewählten Bauteils ---------------
// Die Schienen eines Blatts sind nur Name + Lage (FORMAT.md „Sammelschiene"); die üblichen
// Zusammenstellungen gibt es als Vorlage. Die Bindung eines Bauteils an eine Schiene steht
// am Anschluss (bauteil.schienen) und wird hier für Pol 1 gewählt; weitere Pole gehen an
// die jeweils folgenden erlaubten Schienen (L1 → L1/L2/L3).
const schienenVorlageAuswahl = document.getElementById("schienenVorlage");
const bindungsfelder = document.getElementById("bindungsfelder");
const schieneObenAuswahl = document.getElementById("schieneOben");
const schieneUntenAuswahl = document.getElementById("schieneUnten");

const SCHIENEN_VORLAGEN = {
  keine: { name: "keine Schienen", schienen: [] },
  steuer: { name: "Schienen L+ / L-", schienen: [["L+", "oben"], ["L-", "unten"]] },
  haupt: { name: "Schienen L1 L2 L3 N PE", schienen: [["L1", "oben"], ["L2", "oben"], ["L3", "oben"], ["N", "oben"], ["PE", "oben"]] },
  "haupt-steuer": {
    name: "L1 L2 L3 N PE + L+ / L-",
    schienen: [["L1", "oben"], ["L2", "oben"], ["L3", "oben"], ["N", "oben"], ["PE", "oben"], ["L+", "unten"], ["L-", "unten"]],
  },
};
for (const [schluessel, vorlage] of Object.entries(SCHIENEN_VORLAGEN)) {
  const option = document.createElement("option");
  option.value = schluessel;
  option.textContent = vorlage.name;
  schienenVorlageAuswahl.appendChild(option);
}
const eigeneOption = document.createElement("option");
eigeneOption.value = "eigene";
eigeneOption.textContent = "eigene Schienen";
eigeneOption.disabled = true;
schienenVorlageAuswahl.appendChild(eigeneOption);

function schienenVorlageVon(blatt) {
  const ist = JSON.stringify((blatt.schienen || []).map((s) => [s.name, s.lage]));
  const treffer = Object.entries(SCHIENEN_VORLAGEN).find(([, v]) => JSON.stringify(v.schienen) === ist);
  return treffer ? treffer[0] : "eigene";
}

schienenVorlageAuswahl.addEventListener("change", () => {
  const blatt = aktivesZeichenblatt();
  const vorlage = SCHIENEN_VORLAGEN[schienenVorlageAuswahl.value];
  if (!blatt || !vorlage) return;
  blatt.schienen = vorlage.schienen.map(([name, lage]) => M.neueSchiene(name, lage));
  const namen = new Set(blatt.schienen.map((s) => s.name));
  const offen = blatt.bauteile.reduce((summe, b) =>
    summe + Object.values(b.schienen || {}).filter((n) => !namen.has(n)).length, 0);
  renderAlles();
  status(offen
    ? `${vorlage.name}. ${offen} Anbindung(en) zeigen auf eine Schiene, die es hier nicht mehr gibt – ungezeichnet, bis die Schiene zurückkommt oder neu gewählt wird.`
    : `${vorlage.name}.`);
});

function ausgewaehltesBauteil() {
  const blatt = aktivesZeichenblatt();
  return blatt && blatt.bauteile.find((b) => b.id === ausgewaehltesBauteilId);
}

function bindungsAuswahlFuellen(auswahl, blatt, bauteil, ende) {
  auswahl.innerHTML = "";
  const keine = document.createElement("option");
  keine.value = "";
  keine.textContent = "—";
  auswahl.appendChild(keine);
  for (const schiene of erlaubteSchienen(blatt, bauteil)) {
    const option = document.createElement("option");
    option.value = schiene.name;
    option.textContent = schiene.name;
    auswahl.appendChild(option);
  }
  const nummer = S.kettenEnden(bauteil, 0)[ende];
  auswahl.value = (bauteil.schienen && bauteil.schienen[nummer]) || "";
}

function bindungsfelderAktualisieren() {
  const blatt = aktivesZeichenblatt();
  const bauteil = ausgewaehltesBauteil();
  bindungsfelder.hidden = !bauteil || !blatt || (blatt.schienen || []).length === 0;
  if (bindungsfelder.hidden) return;
  bindungsAuswahlFuellen(schieneObenAuswahl, blatt, bauteil, "oben");
  bindungsAuswahlFuellen(schieneUntenAuswahl, blatt, bauteil, "unten");
}

function bindungSetzen(ende, name) {
  const blatt = aktivesBlatt();
  const bauteil = ausgewaehltesBauteil();
  if (!bauteil) return;
  bauteil.schienen ||= {};
  const erlaubt = erlaubteSchienen(blatt, bauteil).map((s) => s.name);
  const start = erlaubt.indexOf(name);
  for (let pol = 0; pol < S.polZahl(bauteil); pol++) {
    const nummer = S.kettenEnden(bauteil, pol)[ende];
    if (nummer === null) continue; // Motor: unten endet die Kette
    const ziel = name && start >= 0 ? erlaubt[start + pol] : undefined;
    if (ziel) bauteil.schienen[nummer] = ziel;
    else delete bauteil.schienen[nummer];
  }
  renderAlles();
}
schieneObenAuswahl.addEventListener("change", () => bindungSetzen("oben", schieneObenAuswahl.value));
schieneUntenAuswahl.addEventListener("change", () => bindungSetzen("unten", schieneUntenAuswahl.value));

function palettenKachel(symbol, name) {
  const kachel = document.createElement("button");
  kachel.type = "button";
  kachel.className = "paletten-kachel";
  kachel.title = name;

  const vorschau = document.createElementNS(SVG_NS, "svg");
  vorschau.setAttribute("viewBox", "-10 -10 20 20");
  vorschau.setAttribute("class", "paletten-vorschau");
  // Mehrpolige Geräte in der Vorschau mit engem Polabstand, damit alle Pole hineinpassen.
  const pole = symbol.pole || 1;
  const abstand = 5;
  for (const el of S.zeichnenBauteil(symbol, -(pole - 1) * abstand / 2, 0, abstand)) vorschau.appendChild(el);
  const beschriftung = document.createElement("span");
  beschriftung.textContent = name;
  kachel.appendChild(vorschau);
  kachel.appendChild(beschriftung);

  kachel.addEventListener("click", () => {
    aktivesPlatzierSymbol = symbol;
    werkzeugSetzen("platzieren");
    for (const andere of symbolpalette.querySelectorAll(".paletten-kachel")) {
      andere.classList.toggle("aktiv", andere === kachel);
    }
  });
  return kachel;
}
function palettenUeberschrift(inhalt) {
  const h = document.createElement("h3");
  h.className = "paletten-ueberschrift";
  h.textContent = inhalt;
  symbolpalette.appendChild(h);
}
palettenUeberschrift("1 Kontakte");
for (const { kontakt, name } of S.listeKontakte()) {
  symbolpalette.appendChild(palettenKachel({ kontakt }, name));
}
const GRUPPEN_NAMEN = { 4: "4 Schalter, Schutzorgane", 5: "5 Sicherungen", 6: "6 Widerstände", 7: "7 Halbleiter, Sensoren", 8: "8 Quellen", 9: "9 Anschlüsse", 10: "10 Passive, Leuchten", 11: "11 Messgeräte", 13: "13 Spulen, Relais", 14: "14 Motoren, Anlasser" };
let letzteGruppe = null;
for (const { typ, name, gruppe, pole, bmk } of S.listeGeraete()) {
  if (gruppe !== letzteGruppe) palettenUeberschrift(GRUPPEN_NAMEN[gruppe] || `Gruppe ${gruppe}`);
  letzteGruppe = gruppe;
  symbolpalette.appendChild(palettenKachel({ typ, pole, bmk }, pole > 1 ? `${name}, ${pole}-polig` : name));
}

const keineBetaetigung = document.createElement("option");
keineBetaetigung.value = "";
keineBetaetigung.textContent = "— keine Betätigung —";
betaetigungAuswahl.appendChild(keineBetaetigung);
for (const { betaetigung, name } of S.listeBetaetigungen()) {
  const option = document.createElement("option");
  option.value = betaetigung;
  option.textContent = name;
  betaetigungAuswahl.appendChild(option);
}
betaetigungAuswahl.addEventListener("change", () => { aktiveBetaetigung = betaetigungAuswahl.value; });

function werkzeugSetzen(neu) {
  werkzeug = neu;
  verbindenStart = null;
  Object.entries(werkzeugKnoepfe).forEach(([name, knopf]) => knopf.classList.toggle("aktiv", name === neu));
  if (neu !== "platzieren") {
    aktivesPlatzierSymbol = null;
    for (const kachel of symbolpalette.querySelectorAll(".paletten-kachel")) kachel.classList.remove("aktiv");
  }
  svg.classList.toggle("werkzeug-platzieren", neu === "platzieren");
  svg.classList.toggle("werkzeug-verbinden", neu === "verbinden");
  svg.classList.toggle("werkzeug-stift", neu === "stift");
  bauteilAuswaehlen(neu === "stift" ? null : ausgewaehltesBauteilId); // Kasten nachführen
  renderBlatt();
}
werkzeugKnoepfe.auswaehlen.addEventListener("click", () => werkzeugSetzen("auswaehlen"));
werkzeugKnoepfe.verbinden.addEventListener("click", () => werkzeugSetzen("verbinden"));
werkzeugKnoepfe.stift.addEventListener("click", () => werkzeugSetzen("stift"));

bauteilBmkFeld.addEventListener("input", () => {
  const blatt = aktivesZeichenblatt();
  const bauteil = blatt && blatt.bauteile.find((b) => b.id === ausgewaehltesBauteilId);
  if (!bauteil) return;
  if (S.istKlemme(bauteil)) {
    // Eine Klemme schreibt man wie im Klemmenplan: Leiste und Nummer, „-X1:5".
    const i = bauteilBmkFeld.value.lastIndexOf(":");
    bauteil.bmk = i < 0 ? bauteilBmkFeld.value : bauteilBmkFeld.value.slice(0, i);
    bauteil.klemme = i < 0 ? "" : bauteilBmkFeld.value.slice(i + 1);
  } else {
    bauteil.bmk = bauteilBmkFeld.value;
  }
  renderBlatt();
  LEITWERK_SPEICHER.speichern(projekt);
});

// Kabel und Ader an einer Reihenklemme (Stufe 4c, FORMAT.md „Kabel"): ein Feld wie das
// BMK-Feld („-W1:3"), dazu der Typ des Kabels. Der Typ steht einmal je Kabel in
// projekt.kabel und gilt für alle seine Adern; alles andere rechnet der Kabelplan.
const klemmeKabelFeld = document.getElementById("klemmeKabel");
const kabelTypFeld = document.getElementById("kabelTyp");

function kabelfelderAktualisieren() {
  const bauteil = ausgewaehltesBauteil();
  const istKlemme = Boolean(bauteil && S.istKlemme(bauteil));
  klemmeKabelFeld.hidden = !istKlemme;
  kabelTypFeld.hidden = !istKlemme || !bauteil.kabel;
  if (!istKlemme) return;
  if (document.activeElement !== klemmeKabelFeld) {
    klemmeKabelFeld.value = bauteil.kabel ? `${bauteil.kabel}:${bauteil.ader || ""}` : "";
  }
  const eintrag = (projekt.kabel || []).find((w) => w.bmk === bauteil.kabel);
  if (document.activeElement !== kabelTypFeld) kabelTypFeld.value = eintrag ? eintrag.typ : "";
}

klemmeKabelFeld.addEventListener("input", () => {
  const bauteil = ausgewaehltesBauteil();
  if (!bauteil || !S.istKlemme(bauteil)) return;
  const wert = klemmeKabelFeld.value.trim();
  const i = wert.lastIndexOf(":");
  const kabel = i < 0 ? wert : wert.slice(0, i);
  if (kabel) {
    bauteil.kabel = kabel;
    bauteil.ader = i < 0 ? "" : wert.slice(i + 1);
  } else {
    delete bauteil.kabel;
    delete bauteil.ader;
  }
  kabelfelderAktualisieren();
  renderBlatt();
  LEITWERK_SPEICHER.speichern(projekt);
});

kabelTypFeld.addEventListener("input", () => {
  const bauteil = ausgewaehltesBauteil();
  if (!bauteil || !bauteil.kabel) return;
  projekt.kabel ||= [];
  let eintrag = projekt.kabel.find((w) => w.bmk === bauteil.kabel);
  if (!eintrag) projekt.kabel.push(eintrag = { bmk: bauteil.kabel, typ: "" });
  eintrag.typ = kabelTypFeld.value;
  LEITWERK_SPEICHER.speichern(projekt);
});

document.getElementById("bauteilLoeschen").addEventListener("click", () => {
  const blatt = aktivesZeichenblatt();
  if (!ausgewaehltesBauteilId && werkzeug === "stift" && blatt) {
    if (!blatt.freihand.striche.length) { status("Keine Notiz auf diesem Blatt.", "warnung"); return; }
    blatt.freihand.striche.pop();
    renderAlles();
    status("Letzten Strich zurückgenommen.");
    return;
  }
  if (!ausgewaehltesBauteilId || !blatt) { status("Kein Bauteil ausgewählt.", "warnung"); return; }
  const bauteil = blatt.bauteile.find((b) => b.id === ausgewaehltesBauteilId);
  blatt.bauteile = blatt.bauteile.filter((b) => b.id !== ausgewaehltesBauteilId);
  // Verbindungen gehen mit: keine Leitung darf auf ein gelöschtes Bauteil zeigen.
  blatt.verbindungen = blatt.verbindungen.filter((v) =>
    v.von.bauteilId !== ausgewaehltesBauteilId && v.bis.bauteilId !== ausgewaehltesBauteilId);
  bauteilAuswaehlen(null);
  renderAlles();
  status(`${bauteil ? bauteil.bmk : "Bauteil"} gelöscht.`);
});

// ---- Werkzeugleiste: Blätter, Speichern/Laden -----------------------------------------

document.getElementById("blattHinzufuegen").addEventListener("click", () => {
  const blatt = M.neuesBlatt("Neues Blatt");
  M.blattEinfuegen(projekt, blatt);
  aktivesBlattId = blatt.id;
  renderAlles();
});

// Blattart (Franz 2026-09-24): Die Auswahl zeigt, was das aktive Blatt ist, und stellt es
// um – ein leeres Blatt wird so zum Stromlaufplan, zur Stückliste oder zum Prüfprotokoll.
// Zeichenblätter gibt es beliebig oft, Listen und Prüfprotokoll je einmal (steht die Art
// schon woanders, springt die Auswahl dorthin). Das Inhaltsverzeichnis wählt man nicht, es
// kommt von selbst (M.inhaltsverzeichnisPflegen). Hat das Blatt Inhalt, wird vorher gefragt.
const blattArtAuswahl = document.getElementById("blattArt");
const BLATTARTEN = ["stromlaufplan", "klemmenplan", "stueckliste", "kabelplan", "stromkreisverzeichnis", "pruefprotokoll"];
for (const typ of [...BLATTARTEN, "inhaltsverzeichnis"]) {
  const option = document.createElement("option");
  option.value = typ;
  option.textContent = M.blatttypName(typ);
  if (typ === "inhaltsverzeichnis") option.hidden = true; // nur zur Anzeige, nicht wählbar
  blattArtAuswahl.appendChild(option);
}

function blattHatInhalt(blatt) {
  if (M.istFormular(blatt)) {
    const pp = blatt.pruefprotokoll;
    return Boolean(pp && (Object.keys(pp.bewertung || {}).length || Object.values(pp.werte || {}).some(Boolean)));
  }
  if (M.istErzeugt(blatt)) return false; // rechnet sich, speichert nichts
  return ["bauteile", "verbindungen", "klemmenleisten", "baugruppenrahmen", "funktionsklammern", "texte"]
    .some((feld) => (blatt[feld] || []).length > 0) || Boolean(blatt.freihand && blatt.freihand.striche.length);
}

function blattArtSetzen(typ) {
  const blatt = aktivesBlatt();
  if (!blatt || blatt.typ === typ) return;
  const name = M.blatttypName(typ);
  if (M.istErzeugt({ typ })) {
    const vorhanden = projekt.blaetter.find((b) => b.typ === typ);
    if (vorhanden) {
      aktivesBlattId = vorhanden.id;
      bauteilAuswaehlen(null);
      renderAlles();
      status(`Es gibt schon ein Blatt „${name}" – hierhin gesprungen.`);
      return;
    }
  }
  const umstellen = () => {
    // Ein selbst vergebener Titel bleibt, ein Vorgabetitel folgt der neuen Art.
    const vorgabe = blatt.titel === "Neues Blatt" || blatt.titel === M.blatttypName(blatt.typ);
    const titel = vorgabe ? (typ === "stromlaufplan" ? "Neues Blatt" : name) : blatt.titel;
    const neu = M.istErzeugt({ typ }) ? M.neuesErzeugtesBlatt(titel, typ) : M.neuesBlatt(titel, typ);
    neu.schriftfeld = blatt.schriftfeld;
    projekt.blaetter[projekt.blaetter.indexOf(blatt)] = neu;
    aktivesBlattId = neu.id;
    bauteilAuswaehlen(null);
    renderAlles();
    status(`Blatt ${M.blattNummernText(projekt, neu.id)} ist jetzt: ${name}.`);
  };
  if (blattHatInhalt(blatt)) {
    rueckfrage(`Dieses Blatt hat schon Inhalt – beim Umstellen auf „${name}" geht er verloren. Umstellen?`, umstellen);
  } else {
    umstellen();
  }
}
blattArtAuswahl.addEventListener("change", () => {
  const typ = blattArtAuswahl.value;
  const blatt = aktivesBlatt();
  if (blatt) blattArtAuswahl.value = blatt.typ; // zeigt weiter die echte Art, bis umgestellt ist
  blattArtSetzen(typ);
});

// Titel des aktiven Blatts – das einzige, was das Inhaltsverzeichnis von einem Blatt
// außer Position, Typ und Datum liest.
const blattTitelFeld = document.getElementById("blattTitel");
blattTitelFeld.addEventListener("input", () => {
  const blatt = aktivesBlatt();
  if (!blatt) return;
  blatt.titel = blattTitelFeld.value;
  renderTabs();
  renderBlatt(); // steht das Inhaltsverzeichnis offen, zeigt es den neuen Titel sofort
  LEITWERK_SPEICHER.speichern(projekt);
});

document.getElementById("blattEinfuegenDazwischen").addEventListener("click", () => {
  const index = projekt.blaetter.findIndex((b) => b.id === aktivesBlattId);
  const blatt = M.neuesBlatt("Neues Blatt");
  M.blattEinfuegen(projekt, blatt, index + 1);
  aktivesBlattId = blatt.id;
  renderAlles();
});

document.getElementById("blattLoeschen").addEventListener("click", () => {
  if (aktivesBlatt() && aktivesBlatt().typ === "inhaltsverzeichnis") {
    status("Das Inhaltsverzeichnis führt sich selbst – es verschwindet, wenn nur noch ein Blatt übrig ist.");
    return;
  }
  // Das Inhaltsverzeichnis zählt nicht mit – ohne ein echtes Blatt verschwände auch es.
  if (projekt.blaetter.filter((b) => b.typ !== "inhaltsverzeichnis").length <= 1) {
    status("Das letzte Blatt kann nicht gelöscht werden.", "warnung");
    return;
  }
  rueckfrage("Aktives Blatt wirklich löschen?", () => {
    const index = projekt.blaetter.findIndex((b) => b.id === aktivesBlattId);
    M.blattLoeschen(projekt, aktivesBlattId);
    aktivesBlattId = projekt.blaetter[Math.max(0, index - 1)].id;
    renderAlles();
    status("Blatt gelöscht.");
  });
});

// Ein anderes Projekt kommt auf den Tisch: Verlauf neu, erstes Blatt aktiv. Das bisherige
// bleibt im Browser gespeichert (speicher.js).
function projektWechseln(neues, meldung) {
  projekt = neues;
  aktivesBlattId = projekt.blaetter[0] ? projekt.blaetter[0].id : null;
  verbindenStart = null;
  bauteilAuswaehlen(null);
  V.beginnen(null);
  renderAlles();
  verlaufKnoepfe();
  if (!pruefeUndMigriere(projekt) && meldung) status(meldung);
}

// Nach dem Löschen des offenen Projekts: ein leeres dahinter, das erst beim ersten Ändern
// als neues Projekt gespeichert wird (die Startseite speichert ohnehin nicht).
function projektWechselnOhneSpeichern() {
  LEITWERK_SPEICHER.neuesAnfangen();
  projekt = leeresProjekt(projekt.meta.ersteller);
  aktivesBlattId = projekt.blaetter[0].id;
  V.beginnen(null);
}

function projektOeffnen(id) {
  const geladen = LEITWERK_SPEICHER.laden(id);
  if (!geladen) { status("Dieses Projekt ist im Browser nicht mehr vorhanden.", "warnung"); return; }
  projektWechseln(geladen, `„${LEITWERK_SPEICHER.projektName(geladen)}“ geöffnet.`);
}

document.getElementById("exportieren").addEventListener("click", () => {
  LEITWERK_SPEICHER.exportieren(projekt);
});

document.getElementById("importieren").addEventListener("click", () => {
  document.getElementById("importDatei").click();
});
document.getElementById("importDatei").addEventListener("change", async (evt) => {
  const datei = evt.target.files[0];
  if (!datei) return;
  try {
    const geoeffnet = await LEITWERK_SPEICHER.importieren(datei);
    if (!geoeffnet || !Array.isArray(geoeffnet.blaetter)) throw new Error("keine LeitWerk-Datei");
    if (!MIT_TESTPROJEKT) LEITWERK_SPEICHER.neuesAnfangen();
    document.getElementById("startseite").hidden = true;
    projektWechseln(geoeffnet, `„${datei.name}“ geöffnet – als neues Projekt im Browser gespeichert.`);
  } catch (fehler) {
    status("Datei konnte nicht gelesen werden: " + fehler.message, "warnung");
  }
  evt.target.value = "";
});

document.getElementById("neu").addEventListener("click", () => {
  if (!MIT_TESTPROJEKT) LEITWERK_SPEICHER.neuesAnfangen();
  projektWechseln(leeresProjekt(projekt.meta.ersteller),
    "Neues Projekt – ein leeres Blatt. Das vorige bleibt im Browser gespeichert.");
  // Gleich nach Auftraggeber und Anlage fragen – sonst bleibt das Schriftfeld leer, weil
  // keiner das Fenster hinter dem Projektnamen findet (Franz 2026-09-28).
  projektFensterOeffnen();
});

// ---- Startseite ----------------------------------------------------------------------------
// Erscheint beim Start (nicht im Prüfstand ?testprojekt) und über das LeitWerk-Zeichen im Kopf.
// Nur Wege, die es in der App schon gibt: Neu, Datei öffnen, ein gespeichertes Projekt.
const startseite = document.getElementById("startseite");
function startseiteOffen() { return !document.getElementById("startseite").hidden; }

function wannText(iso) {
  const d = new Date(iso), jetzt = new Date();
  const tag = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const tage = Math.round((tag(jetzt) - tag(d)) / 86400000);
  if (tage === 0) return "heute " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (tage === 1) return "gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: tage > 300 ? "numeric" : undefined });
}

function startseiteZeigen() {
  if (tourSchritt >= 0) tourBeenden();
  const stunde = new Date().getHours();
  document.getElementById("startGruss").textContent =
    stunde >= 5 && stunde < 11 ? "Guten Morgen" : stunde >= 11 && stunde < 18 ? "Guten Tag" : "Guten Abend";
  document.getElementById("startVersion").textContent =
    `Testversion ${LEITWERK_VERSION.nummer} · ${LEITWERK_VERSION.datum.split("-").reverse().join(".")}`;
  const liste = document.getElementById("startListe");
  liste.innerHTML = "";
  const offen = LEITWERK_SPEICHER.aktuelleId();
  const eintraege = LEITWERK_SPEICHER.liste();
  if (!eintraege.length) liste.appendChild(el("div", { class: "start-leer", text: "Noch keine Projekte – fang mit einem leeren an oder öffne eine Datei." }));
  for (const e of eintraege) {
    const bild = el("span", { class: "projekt-bild" });
    bild.innerHTML = '<svg viewBox="0 0 46 32" width="40" height="28" aria-hidden="true"><path d="M6 6h34M6 26h34M16 6v20M30 6v8M30 18v8"/><circle cx="30" cy="16" r="2"/></svg>';
    const oeffnen = el("button", { class: "start-projekt" }, [
      bild,
      el("span", { class: "projekt-text" }, [
        el("span", { class: "projekt-name", text: e.name }),
        el("span", { class: "projekt-info", text: e.blaetter === 1 ? "1 Blatt" : `${e.blaetter} Blätter` }),
      ]),
      el("span", { class: "projekt-wann", text: wannText(e.zuletzt) }),
    ]);
    oeffnen.addEventListener("click", () => {
      startseite.hidden = true;
      if (e.id !== offen) projektOeffnen(e.id);
    });
    // Entfernen mit Rückfrage. Ist es das offene Projekt, bleibt es als leere Arbeitsfläche
    // im Speicher des Tabs, wird aber erst wieder gespeichert, wenn man es ändert – und dann
    // als neues Projekt (neuesAnfangen), nie unter der gelöschten id.
    const weg = el("button", { class: "projekt-weg symbolknopf", title: "Aus dem Browser löschen", "aria-label": `„${e.name}“ löschen` });
    weg.textContent = "×";
    weg.addEventListener("click", () => {
      rueckfrage(`„${e.name}“ aus dem Browser löschen? Als Datei gespeicherte Kopien bleiben.`, () => {
        LEITWERK_SPEICHER.loeschen(e.id);
        if (e.id === offen) projektWechselnOhneSpeichern();
        startseiteZeigen();
        status(`„${e.name}“ gelöscht.`);
      });
    });
    liste.appendChild(el("div", { class: "start-eintrag" + (e.id === offen ? " offen" : "") }, [oeffnen, weg]));
  }
  startseite.hidden = false;
}

document.getElementById("startseiteZeigen").addEventListener("click", startseiteZeigen);
const startNeu = () => { startseite.hidden = true; document.getElementById("neu").click(); };
document.getElementById("startNeu").addEventListener("click", startNeu);
document.getElementById("kachelLeer").addEventListener("click", startNeu);
// Eine Vorlage wird ein neues Projekt im Browser – frisch gebaut, die Vorlage selbst ändert
// sich also nie.
for (const [knopf, name] of [["kachelFolgeschaltung", "folgeschaltung"], ["kachelUnterverteilung", "unterverteilung"]]) {
  document.getElementById(knopf).addEventListener("click", () => {
    if (!MIT_TESTPROJEKT) LEITWERK_SPEICHER.neuesAnfangen();
    startseite.hidden = true;
    const neu = LEITWERK_VORLAGEN.bauen(name);
    neu.meta.ersteller = projekt.meta.ersteller || "";
    projektWechseln(neu, `Vorlage „${neu.meta.plantitel}“ als neues Projekt angelegt – nach Belieben ändern.`);
  });
}

// Die Startseite bleibt stehen, bis wirklich eine Datei gewählt ist (Abbrechen = nichts passiert).
document.getElementById("startOeffnen").addEventListener("click", () => document.getElementById("importDatei").click());

// ---- Rückmeldung an Franz ---------------------------------------------------------------------
// Nach dem Entwurf (Tafel „Rückmeldefenster“). Eine ZIP-Datei mit Text, dem Blatt als SVG und
// auf Wunsch dem Projekt, dazu eine E-Mail an Franz – anhängen muss der Tester selbst.
const RUECKMELDUNG_AN = "wahlfa0109@gmail.com";
const rmFenster = document.getElementById("rueckmeldungFenster");
const rmBlatt = document.getElementById("rmBlatt");

function browserText() {
  const ua = navigator.userAgent;
  let browser = "Browser unbekannt";
  for (const [kennung, name] of [["Edg/", "Edge"], ["OPR/", "Opera"], ["Firefox/", "Firefox"], ["Chrome/", "Chrome"], ["Version/", "Safari"]]) {
    if (ua.includes(kennung)) { browser = `${name} ${ua.split(kennung)[1].split(/[ .]/)[0]}`; break; }
  }
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "System unbekannt";
  return `${browser} · ${system}`;
}

function zeitText(d) {
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

function rmDateiname(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `rueckmeldung-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.zip`;
}

// Das Blatt als eigenständiges SVG: gezeichnet wie beim Druck, die Stile aus styles.css
// direkt an jedes Element geschrieben, damit die Datei auch ohne LeitWerk richtig aussieht.
const SVG_STILE = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "font-size", "font-weight", "font-style", "font-family", "text-anchor", "dominant-baseline", "paint-order", "opacity", "display"];
function blattAlsSvg(blatt, eigenstaendig = true) {
  const gruppe = svgEl("g");
  druckLaeuft = true;
  try { zeichneBlatt(gruppe, blatt, 0); } finally { druckLaeuft = false; }
  const bild = svgEl("svg", {
    xmlns: SVG_NS, class: "druck-seite", viewBox: `0 0 ${R.BLATT_BREITE} ${R.BLATT_HOEHE}`,
    width: `${R.BLATT_BREITE}mm`, height: `${R.BLATT_HOEHE}mm`,
  }, [svgEl("rect", { x: 0, y: 0, width: R.BLATT_BREITE, height: R.BLATT_HOEHE, fill: "#ffffff" }), gruppe]);
  if (!eigenstaendig) return bild;
  const halter = document.createElement("div");
  halter.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden";
  halter.appendChild(bild);
  document.body.appendChild(halter);
  for (const e of bild.querySelectorAll("*")) {
    if (!e.getAttribute("class")) continue;
    const cs = getComputedStyle(e);
    e.setAttribute("style", SVG_STILE.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
    e.removeAttribute("class");
  }
  halter.remove();
  bild.removeAttribute("class");
  return bild;
}

function rmVorschau() {
  const blatt = projekt.blaetter.find((b) => b.id === rmBlatt.value) || aktivesBlatt();
  const bild = blattAlsSvg(blatt, false);
  bild.removeAttribute("width");
  bild.removeAttribute("height");
  document.getElementById("rmBild").replaceChildren(bild);
}

function rueckmeldungOeffnen() {
  rmBlatt.replaceChildren(...projekt.blaetter.map((b) => el("option", {
    value: b.id, text: `Blatt ${M.blattNummernText(projekt, b.id)} – ${b.titel}${b.id === aktivesBlattId ? " (aktuelles Blatt)" : ""}`,
  })));
  rmBlatt.value = aktivesBlattId;
  const jetzt = new Date();
  document.getElementById("rmTechnik").textContent = `LeitWerk ${LEITWERK_VERSION.nummer} · ${browserText()} · ${zeitText(jetzt)}`;
  document.getElementById("rmDateiname").textContent = rmDateiname(jetzt);
  rmVorschau();
  rmFenster.hidden = false;
  document.getElementById("rmPassiert").focus();
}

function rueckmeldungSenden() {
  const passiert = document.getElementById("rmPassiert").value.trim();
  const erwartet = document.getElementById("rmErwartet").value.trim();
  if (!passiert && !erwartet) {
    status("Bitte kurz schreiben, was passiert ist.", "warnung");
    document.getElementById("rmPassiert").focus();
    return;
  }
  const jetzt = new Date();
  const blatt = projekt.blaetter.find((b) => b.id === rmBlatt.value) || aktivesBlatt();
  const nummer = M.blattNummernText(projekt, blatt.id);
  const name = rmDateiname(jetzt);
  const mitProjekt = document.getElementById("rmProjekt").checked;
  const zeilen = [
    `LeitWerk ${LEITWERK_VERSION.nummer} (${LEITWERK_VERSION.datum}) – Rückmeldung`,
    `Zeit:    ${zeitText(jetzt)}`,
    `Browser: ${browserText()}`,
    `Projekt: ${LEITWERK_SPEICHER.projektName(projekt)} (${M.blattZahl(projekt)} Blätter)`,
    `Blatt:   ${nummer} – ${blatt.titel}`,
    "",
    "Was ist passiert?",
    passiert || "–",
    "",
    "Was hast du erwartet?",
    erwartet || "–",
  ];
  const text = zeilen.join("\r\n") + "\r\n";
  const dateien = [
    { name: "rueckmeldung.txt", inhalt: text },
    { name: `blatt-${nummer}.svg`, inhalt: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(blattAlsSvg(blatt)) },
  ];
  if (mitProjekt) dateien.push({ name: "projekt.leitwerk", inhalt: JSON.stringify(projekt, null, 2) });
  const zip = LEITWERK_ZIP.erstellen(dateien, jetzt);
  const url = URL.createObjectURL(zip);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  // Mailprogramme schneiden lange mailto-Links ab – der vollständige Text steht in der Datei.
  const koerper = zeilen.join("\n").slice(0, 1500) + `\n\nAnhang: ${name} (liegt im Download-Ordner) – bitte an diese E-Mail hängen.`;
  const mail = document.createElement("a");
  mail.href = `mailto:${RUECKMELDUNG_AN}?subject=${encodeURIComponent(`LeitWerk ${LEITWERK_VERSION.nummer} – Rückmeldung`)}&body=${encodeURIComponent(koerper)}`;
  mail.click();

  document.getElementById("rmPassiert").value = "";
  document.getElementById("rmErwartet").value = "";
  rmFenster.hidden = true;
  status(`Gespeichert als ${name} – bitte an die E-Mail hängen. Danke!`);
}

document.getElementById("rueckmeldungOeffnen").addEventListener("click", rueckmeldungOeffnen);
document.getElementById("startRueckmeldung").addEventListener("click", rueckmeldungOeffnen);
rmBlatt.addEventListener("change", rmVorschau);
document.getElementById("rmSenden").addEventListener("click", rueckmeldungSenden);
for (const id of ["rmSchliessen", "rmAbbrechen"]) document.getElementById(id).addEventListener("click", () => { rmFenster.hidden = true; });

// ---- Kurze Tour ------------------------------------------------------------------------------
// Legt die Vorlage Folgeschaltung als Projekt an und zeigt nacheinander auf fünf Stellen.
// Beenden entfernt nur Kästchen und Markierung – das Beispielprojekt bleibt zum Ausprobieren.
const TOUR = [
  { ziel: "#symbolpalette", titel: "Bauteil setzen",
    text: "Links ein Schaltzeichen antippen, dann auf das Blatt tippen. Bauteile im selben Strompfad verbindet LeitWerk von selbst, die Nummer (-Q1, -S2 …) schlägt es vor.",
    vorher: () => blattWaehlen((b) => /Steuerstromkreis/.test(b.titel)) },
  { ziel: "#werkzeugVerbinden", titel: "Verbinden",
    text: "Nur für Leitungen quer zwischen zwei Strompfaden: „Verbinden“ wählen, dann zwei Anschlusspunkte antippen. Falsch gesetzt? Strg+Z oder der Pfeil links." },
  { ziel: "#blatttabs", titel: "Blätter",
    text: "Jedes Blatt ist ein Reiter. Inhaltsverzeichnis, Blattnummern und Querverweise wie /2 C4 rechnen sich selbst – auch wenn du Blätter einfügst oder verschiebst." },
  { ziel: "#blattArt", titel: "Listen und Prüfprotokoll",
    text: "Hier stellst du ein, was ein Blatt ist: Stromlaufplan, Klemmenplan, Stückliste, Kabelplan, Stromkreisverzeichnis oder Prüfprotokoll nach DIN VDE 0100-600. Die Listen füllen sich aus dem Plan." },
  { ziel: "#drucken", titel: "Drucken und Rückmeldung",
    text: "„Drucken / PDF“ gibt alle Blätter als A4 quer aus. Klemmt etwas oder fehlt dir etwas: „Rückmeldung“ – das geht direkt an Franz." },
];
const tourKarte = document.getElementById("tourKarte");
let tourSchritt = -1;

function blattWaehlen(passt) {
  const blatt = projekt.blaetter.find(passt);
  if (blatt) { aktivesBlattId = blatt.id; renderAlles(); }
}

function tourZeigen() {
  document.querySelectorAll(".tour-ziel").forEach((e) => e.classList.remove("tour-ziel"));
  const schritt = TOUR[tourSchritt];
  if (schritt.vorher) schritt.vorher();
  const ziel = document.querySelector(schritt.ziel);
  document.getElementById("tourSchritt").textContent = `Schritt ${tourSchritt + 1} von ${TOUR.length}`;
  document.getElementById("tourTitel").textContent = schritt.titel;
  document.getElementById("tourText").textContent = schritt.text;
  document.getElementById("tourWeiter").textContent = tourSchritt === TOUR.length - 1 ? "Fertig" : "Weiter";
  tourKarte.hidden = false;
  // Kästchen neben das Ziel: rechts davon, sonst darunter, immer im Fenster.
  const r = ziel.getBoundingClientRect(), k = tourKarte.getBoundingClientRect();
  let x = r.right + 12, y = r.top;
  if (x + k.width > innerWidth - 16) { x = Math.min(r.left, innerWidth - k.width - 16); y = r.bottom + 12; }
  if (y + k.height > innerHeight - 16) y = Math.max(16, r.top - k.height - 12);
  tourKarte.style.left = `${Math.max(16, x)}px`;
  tourKarte.style.top = `${Math.max(16, y)}px`;
  ziel.classList.add("tour-ziel");
  document.getElementById("tourWeiter").focus();
}

function tourBeenden() {
  document.querySelectorAll(".tour-ziel").forEach((e) => e.classList.remove("tour-ziel"));
  tourKarte.hidden = true;
  tourSchritt = -1;
}

document.getElementById("kachelTour").addEventListener("click", () => {
  if (!MIT_TESTPROJEKT) LEITWERK_SPEICHER.neuesAnfangen();
  startseite.hidden = true;
  projektWechseln(LEITWERK_VORLAGEN.bauen("folgeschaltung"));
  tourSchritt = 0;
  tourZeigen();
});
document.getElementById("tourWeiter").addEventListener("click", () => {
  if (++tourSchritt >= TOUR.length) tourBeenden(); else tourZeigen();
});
document.getElementById("tourEnde").addEventListener("click", tourBeenden);
window.addEventListener("keydown", (evt) => { if (evt.key === "Escape" && tourSchritt >= 0) tourBeenden(); });
window.addEventListener("resize", () => { if (tourSchritt >= 0) tourZeigen(); });

// ---- Was ist neu · Bekannte Lücken ----------------------------------------------------------
const lueckenFenster = document.getElementById("lueckenFenster");
document.getElementById("startLuecken").addEventListener("click", () => {
  const V0 = LEITWERK_VERSION;
  document.getElementById("lueckenTitel").textContent = `Testversion ${V0.nummer} vom ${V0.datum.split("-").reverse().join(".")}`;
  for (const [id, zeilen] of [["lueckenNeu", V0.neu], ["lueckenBitten", V0.bitten], ["lueckenListe", V0.luecken]]) {
    document.getElementById(id).replaceChildren(...zeilen.map((z) => el("li", { text: z })));
  }
  lueckenFenster.hidden = false;
});
document.getElementById("lueckenSchliessen").addEventListener("click", () => { lueckenFenster.hidden = true; });
lueckenFenster.addEventListener("click", (evt) => { if (evt.target === lueckenFenster) lueckenFenster.hidden = true; });

// ---- Projektangaben und Änderungsstand ------------------------------------------------------
// Klick auf den Projektnamen im Kopf – kein eigener Knopf. Alles landet in projekt.meta und
// erscheint von dort im Schriftfeld jedes Blatts und im Prüfprotokoll (FORMAT.md „Projekt“).
const projektFenster = document.getElementById("projektFenster");
const PROJEKT_FELDER = [
  ["auftraggeber", "Auftraggeber / Kunde"], ["anlage", "Anlage und Standort"],
  ["plantitel", "Plantitel", "breit"], ["errichter", "Errichter (Fachbetrieb)", "breit"],
  ["zeichnungsnummer", "Zeichnungsnummer"], ["ersteller", "Bearbeiter"],
  ["erstelltAm", "Datum", "", "date"],
];

// Datumsfelder als type="date": am Tablet ein Kalender statt Tippen; der Wert bleibt JJJJ-MM-TT.
function eingabe(bezeichnung, wert, beiAenderung, klasse = "", typ = "text") {
  const label = element("label", klasse, bezeichnung);
  const feld = document.createElement("input");
  feld.type = typ;
  feld.value = wert || "";
  feld.addEventListener("input", () => beiAenderung(feld.value));
  label.appendChild(feld);
  return label;
}

function projektFensterAufbauen() {
  const felder = document.getElementById("projektFelder");
  felder.innerHTML = "";
  for (const [schluessel, bezeichnung, klasse, typ] of PROJEKT_FELDER) {
    felder.appendChild(eingabe(bezeichnung, projekt.meta[schluessel], (wert) => {
      projekt.meta[schluessel] = wert;
      renderAlles();
    }, klasse, typ));
  }
  const liste = document.getElementById("projektAenderungen");
  liste.innerHTML = "";
  projekt.meta.aenderungen.forEach((eintrag, i) => {
    const zeile = element("div", "aenderung-zeile");
    for (const [schluessel, bezeichnung, typ] of [["index", "Index"], ["datum", "Datum", "date"], ["text", "Was geändert"], ["name", "Name"]]) {
      zeile.appendChild(eingabe(bezeichnung, eintrag[schluessel], (wert) => { eintrag[schluessel] = wert; renderAlles(); }, "", typ));
    }
    const weg = element("button", "symbolknopf", "×");
    weg.title = "Eintrag entfernen";
    weg.addEventListener("click", () => {
      projekt.meta.aenderungen.splice(i, 1);
      projektFensterAufbauen();
      renderAlles();
    });
    zeile.appendChild(weg);
    liste.appendChild(zeile);
  });
}

// Nächster Index: auf „a" folgt „b", auf „3" folgt „4"; sonst leer lassen.
function naechsterIndex(liste) {
  const letzter = liste.length ? String(liste[liste.length - 1].index || "") : "";
  if (!letzter) return liste.length ? "" : "a";
  if (/^\d+$/.test(letzter)) return String(Number(letzter) + 1);
  if (/^[a-y]$/i.test(letzter)) return String.fromCharCode(letzter.charCodeAt(0) + 1);
  return "";
}

function projektFensterOeffnen() {
  projektFensterAufbauen();
  projektFenster.hidden = false;
  projektFenster.querySelector("input").focus();
}
document.getElementById("projektname").addEventListener("click", projektFensterOeffnen);
document.getElementById("projektSchliessen").addEventListener("click", () => { projektFenster.hidden = true; });
projektFenster.addEventListener("click", (evt) => { if (evt.target === projektFenster) projektFenster.hidden = true; });
document.getElementById("aenderungNeu").addEventListener("click", () => {
  const liste = projekt.meta.aenderungen;
  liste.push({ index: naechsterIndex(liste), datum: new Date().toISOString().slice(0, 10), text: "", name: projekt.meta.ersteller || "" });
  projektFensterAufbauen();
  renderAlles();
  const zeilen = document.querySelectorAll("#projektAenderungen .aenderung-zeile");
  zeilen[zeilen.length - 1].querySelectorAll("input")[2].focus();
});

// ---- Claude-Aufsatz (Stufe 3): Austausch per Datei ----------------------------------------
// Ein Knopf, ein Fenster: Auftrag schreiben und als Datei speichern, Antwortdatei einlesen.
// LEITWERK_CLAUDE prüft die Antwort vollständig auf einer Kopie; Änderungen erscheinen erst
// als Vorschau (nichts gespeichert, nichts bearbeitbar) und werden nur auf „Übernehmen“ das
// Projekt. Kein Netz, kein Schlüssel – siehe FORMAT.md „Claude-Aufsatz“.
const C = LEITWERK_CLAUDE;
const claudeFenster = document.getElementById("claudeFenster");
const claudeAufgabe = document.getElementById("claudeAufgabe");
const claudeText = document.getElementById("claudeText");
const claudeErgebnis = document.getElementById("claudeErgebnis");

for (const [wert, name] of Object.entries(C.AUFGABEN)) {
  const option = document.createElement("option");
  option.value = wert;
  option.textContent = name;
  claudeAufgabe.appendChild(option);
}

function claudeFensterZeigen(offen) {
  claudeFenster.hidden = !offen;
  if (offen) claudeText.focus();
}
document.getElementById("claudeOeffnen").addEventListener("click", () => claudeFensterZeigen(true));
document.getElementById("claudeSchliessen").addEventListener("click", () => claudeFensterZeigen(false));
claudeFenster.addEventListener("click", (evt) => { if (evt.target === claudeFenster) claudeFensterZeigen(false); });

document.getElementById("claudeAuftrag").addEventListener("click", () => {
  if (!claudeText.value.trim() && claudeAufgabe.value !== "pruefen") {
    status("Erst hineinschreiben, was Claude tun soll.", "warnung");
    claudeText.focus();
    return;
  }
  const auftrag = C.auftragErstellen(projekt, claudeAufgabe.value, claudeText.value.trim(), aktivesBlattId);
  const stempel = auftrag.erstellt.replace(/[-:]/g, "").replace("T", "-");
  LEITWERK_SPEICHER.exportieren(auftrag, `leitwerk-auftrag-${stempel}.json`);
  status("Auftrag gespeichert – jetzt bei Claude hochladen, die Antwortdatei hier einlesen.");
});

document.getElementById("claudeAntwort").addEventListener("click", () => {
  document.getElementById("claudeAntwortDatei").click();
});
document.getElementById("claudeAntwortDatei").addEventListener("change", async (evt) => {
  const datei = evt.target.files[0];
  evt.target.value = "";
  if (!datei) return;
  let antwort;
  try {
    antwort = await LEITWERK_SPEICHER.importieren(datei);
  } catch (fehler) {
    ergebnisZeigen({ ok: false, fehler: [`Die Datei ist kein lesbares JSON: ${fehler.message}`], text: "", befunde: [] });
    return;
  }
  ergebnisZeigen(C.antwortPruefen(projekt, antwort));
});

function element(tag, klasse, inhalt) {
  const el = document.createElement(tag);
  if (klasse) el.className = klasse;
  if (inhalt !== undefined) el.textContent = inhalt;
  return el;
}

// Zeigt Text, Befunde und Fehler im Fenster; gültige Änderungen gehen in die Vorschau.
function ergebnisZeigen(ergebnis) {
  claudeErgebnis.innerHTML = "";
  claudeErgebnis.hidden = false;
  if (!ergebnis.ok) {
    claudeErgebnis.appendChild(element("p", "claude-fehler",
      "Antwort abgelehnt – nichts übernommen. Diese Liste kann so an Claude zurück:"));
    const liste = element("ul", "claude-fehler");
    for (const f of ergebnis.fehler) liste.appendChild(element("li", "", f));
    claudeErgebnis.appendChild(liste);
    return;
  }
  if (ergebnis.text) claudeErgebnis.appendChild(element("div", "claude-antworttext", ergebnis.text));
  if (ergebnis.befunde.length) {
    claudeErgebnis.appendChild(element("p", "", `${ergebnis.befunde.length} Befund(e) – antippen springt hin:`));
    const liste = element("ul");
    for (const befund of ergebnis.befunde) {
      const blatt = projekt.blaetter.find((b) => b.id === befund.blatt);
      const bauteil = blatt && !M.istErzeugt(blatt) && befund.bauteil && blatt.bauteile.find((b) => b.id === befund.bauteil);
      const ort = [blatt ? `/${M.blattNummernText(projekt, blatt.id)} ${blatt.titel}` : "", bauteil ? bauteil.bmk : ""]
        .filter(Boolean).join(", ");
      const zeile = element("li", `befund befund-${befund.schwere}`,
        `${befund.schwere === "fehler" ? "Fehler" : "Hinweis"}${ort ? ` (${ort})` : ""}: ${befund.text}`);
      zeile.addEventListener("click", () => {
        if (!blatt) return;
        aktivesBlattId = blatt.id;
        bauteilAuswaehlen(bauteil ? bauteil.id : null);
        claudeFensterZeigen(false);
        renderAlles();
      });
      liste.appendChild(zeile);
    }
    claudeErgebnis.appendChild(liste);
  }
  if (ergebnis.anzahl) {
    claudeFensterZeigen(false);
    vorschauBeginnen(ergebnis);
  }
}

function vorschauBeginnen(ergebnis) {
  vorschau = { vorher: projekt, blattVorher: aktivesBlattId, anzahl: ergebnis.anzahl };
  projekt = ergebnis.projekt;
  if (ergebnis.geaendert.length) aktivesBlattId = ergebnis.geaendert[0];
  bauteilAuswaehlen(null);
  werkzeugSetzen("auswaehlen");
  document.body.classList.add("vorschau-aktiv");
  renderAlles();
}

function vorschauLeisteZeigen() {
  clearTimeout(meldungTimer);
  meldungText.textContent = `Vorschau: ${vorschau.anzahl} Änderung(en) von Claude – noch nicht übernommen.`;
  meldungAktionen.innerHTML = "";
  meldungsleiste.hidden = false;
  meldungsleiste.classList.remove("status", "warnung");
  meldungsleiste.classList.add("rueckfrage");
  const uebernehmen = element("button", "", "Übernehmen");
  uebernehmen.addEventListener("click", () => vorschauBeenden(true));
  const verwerfen = element("button", "", "Verwerfen");
  verwerfen.addEventListener("click", () => vorschauBeenden(false));
  const antwort = element("button", "", "Antwort lesen");
  antwort.addEventListener("click", () => claudeFensterZeigen(true));
  meldungAktionen.append(uebernehmen, verwerfen, antwort);
}

function vorschauBeenden(uebernehmen) {
  const { vorher, blattVorher, anzahl } = vorschau;
  vorschau = null;
  document.body.classList.remove("vorschau-aktiv");
  if (!uebernehmen) {
    projekt = vorher;
    aktivesBlattId = blattVorher;
  }
  bauteilAuswaehlen(null);
  renderAlles();
  claudeErgebnis.hidden = true;
  status(uebernehmen ? `${anzahl} Änderung(en) von Claude übernommen.` : "Claudes Änderungen verworfen – der Plan ist wie vorher.");
}

// ---- Drucken / PDF (Stufe 2) -------------------------------------------------------------
// Alle Blätter in Blattreihenfolge, eins je Seite A4 quer (@page in styles.css). Jedes Blatt
// ist ein eigenes <svg> mit width/height in mm und viewBox 0 0 297 210 – 1 Einheit bleibt
// 1 mm, die Druckengine des Browsers schreibt Linien und Text als Vektoren ins PDF, kein
// Umweg über Pixel. Gezeichnet wird mit denselben Funktionen wie die Zeichenfläche, nur ohne
// Auswahlrahmen und Verbinden-Vorschau. Der Druckbereich wird erst beim Drucken gefüllt
// (auch bei Strg+P) und danach wieder geleert – nichts davon wird gespeichert.
const druckbereich = document.getElementById("druckbereich");
let titelVorDruck = null;

function druckbereichFuellen() {
  druckbereich.innerHTML = "";
  druckLaeuft = true;
  try {
    for (const blatt of projekt.blaetter) {
      for (let seite = 0; seite < M.seitenzahl(projekt, blatt); seite++) {
        const gruppe = svgEl("g");
        zeichneBlatt(gruppe, blatt, seite);
        druckbereich.appendChild(svgEl("svg", {
          class: "druck-seite", viewBox: `0 0 ${R.BLATT_BREITE} ${R.BLATT_HOEHE}`,
          width: `${R.BLATT_BREITE}mm`, height: `${R.BLATT_HOEHE}mm`,
        }, [gruppe]));
      }
    }
  } finally {
    druckLaeuft = false;
  }
  // Der Dokumenttitel wird beim „Als PDF speichern“ zum Dateinamen-Vorschlag.
  titelVorDruck ??= document.title;
  document.title = `LeitWerk – ${projekt.meta.plantitel || "Schaltplan"}`;
}

function druckbereichLeeren() {
  druckbereich.innerHTML = "";
  if (titelVorDruck !== null) document.title = titelVorDruck;
  titelVorDruck = null;
}

window.addEventListener("beforeprint", druckbereichFuellen);
window.addEventListener("afterprint", druckbereichLeeren);

// ---- Rückgängig und Wiederholen ---------------------------------------------------------
// Jeder Stand, der gespeichert wird, landet im Verlauf (verlauf.js). Zurückgeholt wird das
// ganze Projekt; das aktive Blatt bleibt, wenn es den Stand davor schon gab.
function tipptGerade() {
  const e = document.activeElement;
  if (!e) return false;
  if (e.tagName === "TEXTAREA") return true;
  return e.tagName === "INPUT" && ["text", "number", "search", "date", ""].includes(e.type);
}

function verlaufKnoepfe() {
  document.getElementById("rueckgaengig").disabled = !V.kannZurueck();
  document.getElementById("wiederholen").disabled = !V.kannVor();
}

function verlaufMerken(p) {
  V.merken(JSON.stringify(p), tipptGerade());
  verlaufKnoepfe();
}

function verlaufAnwenden(json, meldung) {
  if (!json) return;
  projekt = JSON.parse(json);
  verbindenStart = null;
  bauteilAuswaehlen(null);
  renderAlles();
  verlaufKnoepfe();
  status(meldung);
}

const rueckgaengigAusfuehren = () => verlaufAnwenden(V.rueckgaengig(), "Rückgängig gemacht.");
const wiederholenAusfuehren = () => verlaufAnwenden(V.wiederholen(), "Wiederholt.");
document.getElementById("rueckgaengig").addEventListener("click", rueckgaengigAusfuehren);
document.getElementById("wiederholen").addEventListener("click", wiederholenAusfuehren);

// Strg+Z / Strg+Y / Strg+Umschalt+Z. In einem Textfeld gilt das Rückgängig des Felds selbst.
window.addEventListener("keydown", (evt) => {
  if (!(evt.ctrlKey || evt.metaKey) || evt.altKey || tipptGerade() || vorschau) return;
  const taste = evt.key.toLowerCase();
  if (taste === "z" && !evt.shiftKey) { evt.preventDefault(); rueckgaengigAusfuehren(); }
  else if (taste === "y" || (taste === "z" && evt.shiftKey)) { evt.preventDefault(); wiederholenAusfuehren(); }
});

// Das Inhaltsverzeichnis pflegt sich selbst (M.inhaltsverzeichnisPflegen) – kein Hinweis nötig.
document.getElementById("drucken").addEventListener("click", () => window.print());

if (!MIT_TESTPROJEKT) startseiteZeigen();
pruefeUndMigriere(projekt);
renderAlles();
