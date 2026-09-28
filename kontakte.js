// Kontaktnummern und Kontaktspiegel (Tabellenbuch S. 83, vgl. DIN EN 61082). Alles hier wird
// gerechnet, nichts gespeichert – wie Blattnummern und Querverweise:
//
// - Kontaktnummern: Die einpoligen Kontakte eines Betriebsmittels (gleiches BMK) werden in
//   Planreihenfolge durchgezählt (Ordnungsziffer 1, 2, 3 …); dazu die Funktionsziffer nach
//   Kontaktart – Öffner 1/2, Schließer 3/4, Wechsler 1/2/4, mit Sonderfunktion (Verzögerung)
//   Öffner 5/6, Schließer 7/8 (S. 83: 13/14, 21/22, 33/34, 17/18, 25/26). Die Kennung im
//   Modell bleibt "1"/"2"/"3" – Verbindungen, Schienen und die Claude-Schnittstelle hängen
//   daran; nur Anzeige, Klemmen- und Kabelplan zeigen die Kontaktnummer.
// - Kontaktspiegel: unter jeder Spule die Kontakte mit demselben BMK, je mit Nummern und dem
//   Ort im Plan; am Kontakt umgekehrt der Ort seiner Spule.

const LEITWERK_KONTAKTE = (() => {
  const M = LEITWERK_MODELL;
  const S = LEITWERK_SYMBOLE;
  const R = LEITWERK_RASTER;

  // Kontaktart eines einpoligen kontaktbasierten Bauteils, sonst null.
  function art(bauteil) {
    if (!bauteil.kontakt || S.polZahl(bauteil) > 1) return null;
    const k = bauteil.kontakt;
    const sonder = k.includes("verzoegert") || (bauteil.kennzeichen || []).some((z) => z.startsWith("verzoegerung"));
    if (k.includes("wechsler")) return { art: "wechsler", sonder };
    if (k.includes("oeffner")) return { art: "oeffner", sonder };
    return { art: "schliesser", sonder };
  }

  const FUNKTION = {
    schliesser: { "1": "3", "2": "4" },
    oeffner: { "1": "1", "2": "2" },
    wechsler: { "1": "1", "2": "2", "3": "4" },
  };
  const FUNKTION_SONDER = {
    schliesser: { "1": "7", "2": "8" },
    oeffner: { "1": "5", "2": "6" },
    wechsler: { "1": "5", "2": "6", "3": "8" },
  };

  // Map bauteil-id → { ordnung, art, sonder } für alle einpoligen Kontakte, gezählt je BMK in
  // der Reihenfolge Blatt, Pfad, Höhe.
  function ordnungen(projekt) {
    const liste = [];
    M.zeichenblaetter(projekt).forEach((blatt, bi) => {
      for (const b of blatt.bauteile) {
        const a = art(b);
        if (a) liste.push({ b, bi, ...a });
      }
    });
    liste.sort((p, q) => p.bi - q.bi || p.b.pfad - q.b.pfad || p.b.hoehe - q.b.hoehe);
    const zaehler = new Map();
    const ergebnis = new Map();
    for (const { b, art: kontaktArt, sonder } of liste) {
      const n = (zaehler.get(b.bmk) || 0) + 1;
      zaehler.set(b.bmk, n);
      ergebnis.set(b.id, { ordnung: n, art: kontaktArt, sonder });
    }
    return ergebnis;
  }

  // Wie ein Anschluss im Plan heißt: Kontaktnummer (13, 21 …), sonst der Name aus dem Symbol
  // (U1, L1, 95 …), sonst die Nummer selbst. `ord` = ordnungen(projekt).
  function anschlussText(ord, bauteil, nummer) {
    const info = ord.get(bauteil.id);
    if (info) {
      const f = (info.sonder ? FUNKTION_SONDER : FUNKTION)[info.art][nummer];
      if (f) return `${info.ordnung}${f}`;
    }
    return S.anschlussName(bauteil, nummer);
  }

  // Ort eines Bauteils im Plan wie ein Querverweis: „/3 C2“.
  function ortImPlan(projekt, blatt, bauteil) {
    const p = R.positionInPfad(bauteil.pfad, bauteil.hoehe);
    return `/${M.blattNummer(projekt, blatt.id)} ${R.feldAusPosition(p.x, p.y)}`;
  }

  // Gehört ein Bauteil als Kontakt zu einer Spule? Hauptkontakte eines Schützes und Kontakte
  // ohne eigene Betätigung (Relais-/Schützkontakte). Ein Taster oder Motorschutzschalter mit
  // zufällig gleichem BMK gehört nicht in den Spiegel.
  function istSpulenKontakt(bauteil) {
    if (bauteil.typ === "schuetz") return true;
    return Boolean(bauteil.kontakt) && !bauteil.betaetigung;
  }

  // Kontaktspiegel: Map BMK → { spulen: [{ blatt, bauteil }], zeilen: [{ art, sonder, links,
  // rechts, ort }] } für jedes BMK, zu dem es eine Spule gibt. Zeilen = die Spulenkontakte
  // mit diesem BMK: einpolige Kontakte mit ihren Nummern, mehrpolige (Hauptkontakte) je Pol.
  function spiegel(projekt) {
    const ord = ordnungen(projekt);
    const spulen = new Map();
    for (const blatt of M.zeichenblaetter(projekt)) {
      for (const b of blatt.bauteile) {
        if (!S.istSpule(b)) continue;
        if (!spulen.has(b.bmk)) spulen.set(b.bmk, { spulen: [], zeilen: [] });
        spulen.get(b.bmk).spulen.push({ blatt, bauteil: b });
      }
    }
    if (!spulen.size) return spulen;
    for (const blatt of M.zeichenblaetter(projekt)) {
      for (const b of blatt.bauteile) {
        const eintrag = spulen.get(b.bmk);
        if (!eintrag || S.istSpule(b) || !istSpulenKontakt(b)) continue;
        const ort = ortImPlan(projekt, blatt, b);
        const info = ord.get(b.id);
        if (info) {
          eintrag.zeilen.push({
            art: info.art, sonder: info.sonder, ort, sortierung: info.ordnung,
            links: anschlussText(ord, b, "1"), rechts: anschlussText(ord, b, "2"),
            wechsel: info.art === "wechsler" ? anschlussText(ord, b, "3") : null,
          });
        } else {
          // Hauptkontakte (Schütz dreipolig, mehrpoliger Kontakt): eine Zeile je Pol.
          for (let pol = 0; pol < S.polZahl(b); pol++) {
            const oben = S.kettenEnden(b, pol).oben, unten = S.kettenEnden(b, pol).unten;
            eintrag.zeilen.push({
              art: b.kontakt && b.kontakt.includes("oeffner") ? "oeffner" : "schliesser", sonder: false, ort,
              sortierung: pol, links: S.anschlussName(b, oben), rechts: S.anschlussName(b, unten), haupt: true,
            });
          }
        }
      }
    }
    // Hauptkontakte zuerst, dann Hilfskontakte nach Ordnungsziffer – wie S. 83.
    for (const e of spulen.values()) {
      e.zeilen.sort((a, b) => (b.haupt ? 1 : 0) - (a.haupt ? 1 : 0) || a.sortierung - b.sortierung);
    }
    return spulen;
  }

  // Wo die Spule zu einem Kontakt sitzt (erste Spule mit diesem BMK), sonst null.
  function spulenOrt(projekt, spiegelMap, bauteil) {
    if (S.istSpule(bauteil) || !istSpulenKontakt(bauteil)) return null;
    const e = spiegelMap.get(bauteil.bmk);
    if (!e || !e.spulen.length) return null;
    const { blatt, bauteil: spule } = e.spulen[0];
    return ortImPlan(projekt, blatt, spule);
  }

  return { ordnungen, anschlussText, spiegel, spulenOrt, ortImPlan };
})();
