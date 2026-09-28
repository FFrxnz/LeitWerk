// Datenmodell: Fabrikfunktionen für ein leeres Projekt und seine Bestandteile,
// plus die Operationen auf der Blattreihenfolge. Format siehe FORMAT.md.

const LEITWERK_MODELL = (() => {
  // Version 2 (2026-09-22): bauteil.typ als Kontakt-Ersatz (z.B. "schalter",
  // "taster-schliesser") wich bauteil.kontakt/betaetigung/kennzeichen.
  // Version 3 (2026-09-22): bauteil.x/y wich bauteil.pfad/hoehe (Vorbild E-Plan:
  // Strompfad statt freier Koordinate) und blatt bekam potenzialOben/potenzialUnten.
  // Version 4 (2026-09-22): bauteil.anschluesse gestrichen (wird berechnet, nie
  // gespeichert, siehe app.js' bauteilAnschluesse) und Verbindung.von/bis als freier
  // Punkt {x,y} gestrichen.
  // Version 5 (2026-09-23): blatt.potenzialOben/-Unten wich der Liste blatt.schienen
  // (L1/L2/L3/N/PE, L+/L- …, nur Name + Lage); ein Bauteilanschluss bindet sich über
  // bauteil.schienen namentlich an eine Schiene; bauteil.pole für mehrpolige
  // Betriebsmittel. Siehe FORMAT.md und CLAUDE.md. Ein Projekt mit anderer version wird
  // beim Laden erkannt (app.js).
  const VERSION = 5;

  // Blatttypen mit Anzeigenamen. `erzeugt`: der Inhalt wird aus dem übrigen Projekt
  // gerechnet, nie gespeichert (FORMAT.md „Erzeugtes Blatt", erzeugte-blaetter.js).
  const BLATTTYPEN = {
    stromlaufplan: { name: "Stromlaufplan", erzeugt: false },
    installationsplan: { name: "Installationsplan", erzeugt: false },
    anschlussplan: { name: "Anschlussplan", erzeugt: false },
    inhaltsverzeichnis: { name: "Inhaltsverzeichnis", erzeugt: true },
    klemmenplan: { name: "Klemmenplan", erzeugt: true },
    stueckliste: { name: "Stückliste", erzeugt: true },
    kabelplan: { name: "Kabelplan", erzeugt: true },
    // Stromkreisverzeichnis (DIN VDE 0100-510, 514.5): Zeilen gerechnet (eine je
    // Schutzeinrichtung), die Angaben dazu tippt man am Bildschirm in eine Tabelle – sie
    // landen an den Bauteilen, nicht am Blatt (stromkreise.js).
    stromkreisverzeichnis: { name: "Stromkreisverzeichnis", erzeugt: true, formular: true },
    // Formularblatt: wie ein erzeugtes Blatt ohne Zeichnung, aber mit eigenen Eingaben in
    // blatt.pruefprotokoll (FORMAT.md „Prüfprotokoll").
    pruefprotokoll: { name: "Prüfprotokoll", erzeugt: true, formular: true },
  };

  // Die erzeugten Blatttypen, für die Auswahl „+ Liste…".
  function erzeugteTypen() {
    return Object.entries(BLATTTYPEN).filter(([, t]) => t.erzeugt).map(([typ, t]) => ({ typ, name: t.name }));
  }

  function istErzeugt(blatt) {
    return Boolean(BLATTTYPEN[blatt.typ] && BLATTTYPEN[blatt.typ].erzeugt);
  }

  function istFormular(blatt) {
    return Boolean(BLATTTYPEN[blatt.typ] && BLATTTYPEN[blatt.typ].formular);
  }

  // Nur die Blätter mit eigenem Inhalt (Bauteile, Schienen, …) – alles, was über
  // Bauteile aller Blätter läuft, nimmt diese Liste statt projekt.blaetter.
  function zeichenblaetter(projekt) {
    return projekt.blaetter.filter((b) => !istErzeugt(b));
  }

  function blatttypName(typ) {
    return BLATTTYPEN[typ] ? BLATTTYPEN[typ].name : typ;
  }

  // Ein Schriftfeld-Wert, der `null` ist, erbt aus projekt.meta (FORMAT.md „Blatt"). Eine
  // Stelle für Schriftfeld und Inhaltsverzeichnis, damit beide dasselbe Datum zeigen.
  const META_FELD = { datum: "erstelltAm", name: "ersteller" };
  function schriftfeldWert(projekt, blatt, feld) {
    const eigen = blatt.schriftfeld ? blatt.schriftfeld[feld] : null;
    if (eigen !== null && eigen !== undefined && eigen !== "") return eigen;
    return projekt.meta[META_FELD[feld] || feld] ?? "";
  }

  function neueId(praefix) {
    const zufall = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8);
    return `${praefix}-${zufall}`;
  }

  function neuesProjekt(meta = {}) {
    return {
      version: VERSION,
      meta: {
        auftraggeber: meta.auftraggeber || "",
        anlage: meta.anlage || "",
        plantitel: meta.plantitel || "",
        ersteller: meta.ersteller || "",
        erstelltAm: meta.erstelltAm || new Date().toISOString().slice(0, 10),
        errichter: meta.errichter || "",
        zeichnungsnummer: meta.zeichnungsnummer || "",
        aenderungen: meta.aenderungen || [],
      },
      blaetter: [],
      potenziale: [],
      kabel: [],
    };
  }

  function neuesBlatt(titel, typ = "stromlaufplan") {
    return {
      id: neueId("b"),
      titel,
      typ,
      schriftfeld: { auftraggeber: null, anlage: null, plantitel: null, name: "", datum: null },
      schienen: [],
      anschlussnummernSichtbar: true,
      bauteile: [],
      verbindungen: [],
      klemmenleisten: [],
      baugruppenrahmen: [],
      funktionsklammern: [],
      texte: [],
      freihand: { sichtbar: true, striche: [] },
      pruefprotokoll: null,
    };
  }

  // Ein erzeugtes Blatt speichert nur id, titel, typ und schriftfeld – kein Inhalt,
  // auch kein leeres Array (FORMAT.md „Erzeugtes Blatt").
  function neuesErzeugtesBlatt(titel, typ) {
    const blatt = {
      id: neueId("b"), titel, typ,
      schriftfeld: { auftraggeber: null, anlage: null, plantitel: null, name: "", datum: null },
    };
    // Ein Formularblatt bringt sein leeres Formular mit; gefüllt wird es beim Ausfüllen.
    if (istFormular(blatt)) blatt.pruefprotokoll = null;
    return blatt;
  }

  // Bauteil mit festem Symbol (Sicherung, Netzteil, … spätere Gruppen), siehe FORMAT.md.
  // pfad (1–6) + hoehe (Position von oben im Pfad, 1 = oberste) ersetzen x/y vollständig.
  // Kein anschluesse-Feld – app.js' bauteilAnschluesse(bauteil) berechnet sie bei Bedarf.
  // pole > 1: mehrpoliges Betriebsmittel (Schütz, Motorschutzschalter), Pol i sitzt in
  // pfad + i. schienen: { Anschlussnummer: Schienenname }, siehe FORMAT.md.
  function neuesBauteil(bmk, typ, pfad, hoehe, beschriftung = "", pole = 1, schienen = {}) {
    const bauteil = { id: neueId("t"), bmk, typ, pfad, hoehe, schienen, beschriftung };
    if (pole > 1) bauteil.pole = pole;
    return bauteil;
  }

  // Kontaktbasiertes Bauteil (Schalter, Taster, Relaiskontakt, …): Kontakt, Betätigung
  // und Kennzeichen sind getrennte Angaben statt eines einzelnen Typs, siehe FORMAT.md.
  function neuerKontakt(bmk, kontakt, betaetigung, kennzeichen, pfad, hoehe, beschriftung = "", pole = 1, schienen = {}) {
    const bauteil = {
      id: neueId("t"), bmk, kontakt, betaetigung, kennzeichen: kennzeichen || [],
      pfad, hoehe, schienen, beschriftung,
    };
    if (pole > 1) bauteil.pole = pole;
    return bauteil;
  }

  // Eine Sammelschiene: nur Name + Lage, die y-Lage rechnet raster.js aus.
  function neueSchiene(name, lage) {
    return { name, lage };
  }

  function neueKlemmenleiste(bmk, x, y, klemmenNummern) {
    return {
      id: neueId("k"), bmk, x, y,
      klemmen: klemmenNummern.map((nummer) => ({ nummer, ziel: null })),
    };
  }

  // Umschließt eine Gruppe von Strompfaden (pfadVon–pfadBis, hoeheVon–hoeheBis), kein
  // freies Rechteck – raster.js' baugruppenBereich() liefert die mm-Fläche daraus, siehe
  // FORMAT.md „Baugruppenrahmen".
  function neuerBaugruppenrahmen(bmk, pfadVon, pfadBis, hoeheVon, hoeheBis, beschriftung = "") {
    return { id: neueId("a"), bmk, pfadVon, pfadBis, hoeheVon, hoeheBis, beschriftung };
  }

  // Eine Funktionsklammer unter dem Plan, die über pfadVon–pfadBis spannt und einen Text
  // trägt (z. B. "Spannungsversorgung Automatisierungssystem"). Kein freier Punkt, siehe
  // FORMAT.md.
  function neueFunktionsklammer(pfadVon, pfadBis, text) {
    return { id: neueId("f"), pfadVon, pfadBis, text };
  }

  function neuesPotenzial(name) {
    return { id: neueId("p"), name, vorkommen: [] };
  }

  // von/bis siehe FORMAT.md: { bauteilId, anschluss } | { potenzialId }. Kein freier
  // Punkt {x,y} – eine Leitung ohne echtes Ziel wird nicht erfunden, siehe FORMAT.md.
  function neueVerbindung(von, bis) {
    return { id: neueId("v"), von, bis };
  }

  // Fügt ein Blatt an gegebener Position ein (Standard: ans Ende). Sonst tut sich
  // nichts weiter – die Blattnummern und alle Querverweise ergeben sich neu, weil sie
  // nie gespeichert waren, siehe querverweise.js.
  function blattEinfuegen(projekt, blatt, anPosition = projekt.blaetter.length) {
    projekt.blaetter.splice(anPosition, 0, blatt);
  }

  function blattLoeschen(projekt, blattId) {
    projekt.blaetter = projekt.blaetter.filter((b) => b.id !== blattId);
    for (const potenzial of projekt.potenziale) {
      potenzial.vorkommen = potenzial.vorkommen.filter((v) => v.blattId !== blattId);
    }
  }

  function blattVerschieben(projekt, blattId, neuePosition) {
    const index = projekt.blaetter.findIndex((b) => b.id === blattId);
    if (index === -1) return;
    const [blatt] = projekt.blaetter.splice(index, 1);
    projekt.blaetter.splice(neuePosition, 0, blatt);
  }

  // Folgeblätter (Stufe 11): Ein erzeugtes Blatt kann über mehrere Seiten laufen, jede
  // Seite trägt eine eigene Blattnummer. Wie viele Seiten es sind, weiß nur
  // erzeugte-blaetter.js (es rechnet die Tabellen) – es meldet seinen Zähler hier an, weil
  // es nach modell.js geladen wird. Gespeichert wird davon nichts.
  let seitenzaehler = () => 1;
  function seitenzaehlerSetzen(zaehler) { seitenzaehler = zaehler; }
  function seitenzahl(projekt, blatt) {
    return istErzeugt(blatt) ? Math.max(1, seitenzaehler(projekt, blatt)) : 1;
  }

  // Inhaltsverzeichnis automatisch (Franz 2026-09-24): Ab zwei Blättern steht es von selbst
  // als Blatt 1 vorn, bei nur einem Blatt gibt es keins. Es speichert nichts als Titel und
  // Schriftfeld, also geht beim Entfernen nichts verloren. true, wenn sich etwas geändert hat.
  function inhaltsverzeichnisPflegen(projekt) {
    const verzeichnisse = projekt.blaetter.filter((b) => b.typ === "inhaltsverzeichnis");
    const andere = projekt.blaetter.length - verzeichnisse.length;
    if (andere < 2) {
      if (verzeichnisse.length === 0) return false;
      projekt.blaetter = projekt.blaetter.filter((b) => b.typ !== "inhaltsverzeichnis");
      return true;
    }
    const [erstes, ...doppelte] = verzeichnisse;
    if (erstes && projekt.blaetter[0] === erstes && doppelte.length === 0) return false;
    projekt.blaetter = projekt.blaetter.filter((b) => b.typ !== "inhaltsverzeichnis");
    projekt.blaetter.unshift(erstes || neuesErzeugtesBlatt("Inhaltsverzeichnis", "inhaltsverzeichnis"));
    return true;
  }

  // Die (erste) Blattnummer: 1 + alle Seiten aller Blätter davor. Die eine Stelle, an der
  // Nummern entstehen – Querverweise, Inhaltsverzeichnis, Schriftfeld, Reiter und Druck
  // fragen alle hier.
  function blattNummer(projekt, blattId) {
    let nummer = 1;
    for (const blatt of projekt.blaetter) {
      if (blatt.id === blattId) return nummer;
      nummer += seitenzahl(projekt, blatt);
    }
    return null;
  }

  // Gesamtzahl der Blattnummern im Projekt (für „Blatt 3 / 16" im Schriftfeld) – gerechnet.
  function blattZahl(projekt) {
    return projekt.blaetter.reduce((summe, blatt) => summe + seitenzahl(projekt, blatt), 0);
  }

  // Projektangaben, die ältere Dateien noch nicht kennen: leer ergänzen (keine Formatversion).
  function metaVervollstaendigen(projekt) {
    const m = projekt.meta ||= {};
    for (const feld of ["auftraggeber", "anlage", "plantitel", "ersteller", "errichter", "zeichnungsnummer"]) m[feld] ??= "";
    m.aenderungen ||= [];
  }

  // „8" oder, bei Folgeseiten, „8–11".
  function blattNummernText(projekt, blattId) {
    const erste = blattNummer(projekt, blattId);
    if (erste === null) return "";
    const blatt = projekt.blaetter.find((b) => b.id === blattId);
    const seiten = seitenzahl(projekt, blatt);
    return seiten > 1 ? `${erste}–${erste + seiten - 1}` : String(erste);
  }

  return {
    VERSION, BLATTTYPEN, istErzeugt, istFormular, erzeugteTypen, zeichenblaetter, blatttypName, schriftfeldWert,
    neuesErzeugtesBlatt, neueId, neuesProjekt, neuesBlatt, neuesBauteil, neuerKontakt, neueSchiene,
    neueKlemmenleiste, neuerBaugruppenrahmen, neueFunktionsklammer, neuesPotenzial,
    neueVerbindung, blattEinfuegen, blattLoeschen, blattVerschieben, blattNummer,
    blattNummernText, seitenzahl, seitenzaehlerSetzen, inhaltsverzeichnisPflegen, blattZahl,
    metaVervollstaendigen,
  };
})();
