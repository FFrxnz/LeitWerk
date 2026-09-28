// Claude-Aufsatz – Austausch per Datei (FORMAT.md „Claude-Aufsatz“, Stufe 3).
// Kein Netz, kein Schlüssel: LeitWerk schreibt eine Auftragsdatei, Claude antwortet mit einer
// Antwortdatei, LeitWerk prüft sie hier. Eine Antwort wird **ganz oder gar nicht**
// übernommen: Alle Änderungen laufen auf einer Kopie des Projekts; findet sich auch nur ein
// Fehler, bleibt das Projekt unberührt und die Kopie wird verworfen.

const LEITWERK_CLAUDE = (() => {
  const M = LEITWERK_MODELL;
  const S = LEITWERK_SYMBOLE;
  const R = LEITWERK_RASTER;

  const FORMAT_VERSION = 1;
  const AUFGABEN = {
    frage: "Frage beantworten",
    pruefen: "Plan prüfen",
    zeichnen: "Schaltung zeichnen",
  };
  const PFADE = 6; // Rasterspalten = Strompfade, FORMAT.md „Strompfad“
  const ANTWORT_FELDER = ["leitwerk", "version", "auftrag", "text", "befunde", "aenderungen"];
  const AENDERBARE_FELDER = ["bmk", "beschriftung", "betaetigung", "kennzeichen", "schienen",
    "pfad", "hoehe", "klemme", "kabel", "ader", "ort", "stromkreis"];
  const STROMKREIS_FELDER = ["verbraucher", "leitung", "laenge", "ik", "ausschaltvermoegen"];

  // Was Claude lesen muss, um richtig zu antworten. Steht in jeder Auftragsdatei, damit ein
  // Claude ohne LeitWerk-Kenntnis (z. B. im Chat auf claude.ai) nur diese eine Datei braucht.
  const ANLEITUNG = [
    "Du bekommst einen Auftrag aus LeitWerk, einer Zeichensoftware für Schaltpläne nach DIN EN 81346 / E-Plan-Art.",
    "Antworte mit genau einer JSON-Datei (sonst nichts) in dieser Form:",
    '{ "leitwerk": "antwort", "version": 1, "auftrag": "<id dieses Auftrags>", "text": "…", "befunde": [ … ], "aenderungen": [ … ] }',
    "text: deine Antwort in Klartext (Deutsch). Bei aufgabe \"frage\" die Antwort, bei \"pruefen\" der Prüfbericht, bei \"zeichnen\" eine kurze Erklärung.",
    "befunde (nur bei \"pruefen\", sonst weglassen): { \"blatt\": \"<blatt-id>\", \"bauteil\": \"<bauteil-id>\" (optional), \"schwere\": \"fehler\" | \"hinweis\", \"text\": \"…\" }.",
    "aenderungen (nur bei \"zeichnen\", sonst weglassen): Liste, wird der Reihe nach ausgeführt. Arten:",
    '  { "art": "blatt", "ref": "neu1", "titel": "…", "schienen": [ { "name": "L1", "lage": "oben" }, … ] } – neuer Stromlaufplan hinter dem letzten Zeichenblatt.',
    '  { "art": "schienen", "blatt": "<id|ref>", "schienen": [ … ] } – Sammelschienen eines Blatts ersetzen.',
    '  { "art": "bauteil", "ref": "s1", "blatt": "<id|ref>", "bmk": "-S1", "kontakt": "wechsler", "betaetigung": "druecken", "pfad": 1, "hoehe": 1, "schienen": { "1": "L1" }, "beschriftung": "…" }',
    '     – ein Bauteil trägt ENTWEDER "kontakt" (+ optional "betaetigung", "kennzeichen": [ … ]) ODER "typ" (festes Symbol, optional "pole"). Schlüssel nur aus "bibliothek".',
    '  { "art": "verbindung", "blatt": "<id|ref>", "von": { "bauteil": "<id|ref>", "anschluss": "2" }, "bis": { "bauteil": "<id|ref>", "anschluss": "2" } } – nur Querverbindungen zwischen Strompfaden.',
    '  { "art": "aendern", "blatt": "<id|ref>", "bauteil": "<id|ref>", "felder": { "bmk": "-S2", … } } – erlaubt: ' + AENDERBARE_FELDER.join(", ") + ".",
    '  { "art": "loeschen", "blatt": "<id|ref>", "bauteil": "<id|ref>" } – nimmt auch seine Verbindungen mit.',
    "Regeln des Plans: Strompfade 1–6 = Rasterspalten. Bauteile im selben Pfad sind von oben nach unten (hoehe 1, 2, …) automatisch verbunden – dafür KEINE verbindung.",
    "Das oberste/unterste Ende eines Pfads bindet sich über \"schienen\" (Anschlussnummer → Schienenname des Blatts) an eine Sammelschiene. Höchstens 5 Schienen je Lage.",
    "Anschlussnummern: Zweipole 1 (oben) / 2 (unten); Wechsler 1 = Wurzel oben, 2 = Ruhekontakt unten, 3 = Arbeitskontakt seitlich; mehrpolig Pol i: 2i+1 / 2i+2.",
    "Eine verbindung wird gezeichnet: vom \"von\"-Anschluss erst waagerecht, dann senkrecht zum \"bis\"-Anschluss. Bauteile so anordnen, dass dabei keine Linie durch ein Symbol läuft (Arbeitskontakt 3 eines Wechslers liegt rechts neben dem Symbol).",
    "Dokumentation (DIN VDE 0100-510): jedes Bauteil darf \"ort\" tragen (Einbauort, z. B. \"+UV-EG\"); Schutzeinrichtungen (Sicherung, Leitungsschutz-, Motorschutz-, Fehlerstrom-Schutzschalter) zusätzlich \"stromkreis\": { \"verbraucher\", \"leitung\", \"laenge\", \"ik\", \"ausschaltvermoegen\" } als Text mit Einheit. Die Bemessung (z. B. \"B16\") steht in \"beschriftung\".",
    "Schütze/Relais: die Spule ist ein eigenes Bauteil (typ \"schuetzspule\" o. ä., Anschlüsse \"A1\" oben, \"A2\" unten); ihre Kontakte tragen dasselbe bmk (Hauptkontakte typ \"schuetz\", Hilfskontakte kontakt ohne betaetigung). LeitWerk zeichnet den Kontaktspiegel und nummeriert Hilfskontakte selbst (13/14, 21/22 …) – im Modell bleiben ihre Anschlüsse \"1\"/\"2\"(/\"3\").",
    "Motoren (typ \"motor-…\") und Anlasser/Frequenzumrichter haben eine feste Polzahl (\"pole\" wie in der bibliothek). Motoranschlüsse im Modell \"1\", \"3\", \"5\" (angezeigt U1, V1, W1), dazu \"PE\" (an die Schiene PE binden) und beim Stern-Dreieck-Motor \"U2\", \"V2\", \"W2\". Unter einen Motor kommt nichts mehr in denselben Pfad.",
    "Ein mehrpoliges Gerät (\"pole\": 3) belegt die Pfade pfad … pfad+pole-1. Ein Platz (Pfad + hoehe) darf nicht doppelt belegt sein. PE/PEN wird nie geschaltet.",
    "Nichts ausrechnen, was LeitWerk selbst rechnet: keine Blattnummern, keine Koordinaten, keine Querverweise, keine Leitungen im Pfad.",
    "LeitWerk prüft die Antwort vollständig. Ist ein Punkt falsch, wird NICHTS übernommen und Franz sieht die Fehlerliste.",
  ];

  function bibliothek() {
    return {
      kontakte: S.listeKontakte(),
      betaetigungen: S.listeBetaetigungen(),
      kennzeichen: S.listeKennzeichen(),
      geraete: S.listeGeraete().map(({ typ, name, pole }) => ({ typ, name, pole })),
    };
  }

  // Auftragsdatei: Aufgabe + Freitext + das ganze Projekt nach FORMAT.md. `blaetter` ist nur
  // eine Lesehilfe (Nummern wie im Plan), gespeichert wird davon in LeitWerk nichts.
  function auftragErstellen(projekt, aufgabe, text, blattId) {
    if (!AUFGABEN[aufgabe]) throw new Error(`Unbekannte Aufgabe „${aufgabe}“.`);
    return {
      leitwerk: "auftrag",
      version: FORMAT_VERSION,
      id: M.neueId("a"),
      erstellt: new Date().toISOString().slice(0, 16),
      aufgabe,
      aufgabeName: AUFGABEN[aufgabe],
      text: text || "",
      blattId: blattId || null,
      anleitung: ANLEITUNG,
      bibliothek: bibliothek(),
      blaetter: projekt.blaetter.map((b) => ({
        id: b.id, nummer: M.blattNummernText(projekt, b.id), titel: b.titel, typ: b.typ,
      })),
      projekt,
    };
  }

  // ---- Prüfen und Anwenden ------------------------------------------------------------

  const istText = (w) => typeof w === "string";
  const istGanzzahl = (w) => Number.isInteger(w);
  const kopie = (o) => JSON.parse(JSON.stringify(o));

  function schienenPruefen(schienen, fehler) {
    if (!Array.isArray(schienen)) { fehler("„schienen“ muss eine Liste sein."); return false; }
    const namen = new Set();
    const jeLage = { oben: 0, unten: 0 };
    for (const s of schienen) {
      if (!s || !istText(s.name) || !s.name) { fehler("Schiene ohne Namen."); return false; }
      if (s.lage !== "oben" && s.lage !== "unten") { fehler(`Schiene ${s.name}: „lage“ muss „oben“ oder „unten“ sein.`); return false; }
      if (namen.has(s.name)) { fehler(`Schiene ${s.name} doppelt.`); return false; }
      namen.add(s.name);
      jeLage[s.lage] += 1;
    }
    const max = R.MAX_SCHIENEN_JE_LAGE || 5;
    if (jeLage.oben > max || jeLage.unten > max) { fehler(`Höchstens ${max} Schienen je Lage.`); return false; }
    return true;
  }

  // Prüft ein fertig zusammengesetztes Bauteil gegen FORMAT.md „Bauteil“ und gegen das Blatt.
  function bauteilPruefen(b, blatt, fehler) {
    let ok = true;
    const f = (t) => { fehler(t); ok = false; };
    if (!istText(b.bmk) || !b.bmk.startsWith("-")) f("„bmk“ muss mit Bindestrich beginnen, z. B. -S1.");
    if (b.kontakt && b.typ) f("Ein Bauteil trägt entweder „kontakt“ oder „typ“, nie beides.");
    if (!b.kontakt && !b.typ) f("Weder „kontakt“ noch „typ“ angegeben.");
    if (b.kontakt && !S.hatKontakt(b.kontakt)) f(`Kontakt „${b.kontakt}“ gibt es nicht (siehe bibliothek.kontakte).`);
    if (b.typ && !S.hatSymbol(b)) f(`Gerät „${b.typ}“ gibt es nicht (siehe bibliothek.geraete).`);
    if (b.betaetigung && !b.kontakt) f("„betaetigung“ nur bei einem Kontakt.");
    if (b.betaetigung && !S.hatBetaetigung(b.betaetigung)) f(`Betätigung „${b.betaetigung}“ gibt es nicht.`);
    if (b.kennzeichen !== undefined) {
      if (!Array.isArray(b.kennzeichen)) f("„kennzeichen“ muss eine Liste sein.");
      else for (const k of b.kennzeichen) if (!S.hatKennzeichen(k)) f(`Kennzeichen „${k}“ gibt es nicht.`);
    }
    if (b.pole !== undefined && (!istGanzzahl(b.pole) || b.pole < 1)) f("„pole“ muss eine ganze Zahl ab 1 sein.");
    if (!istGanzzahl(b.pfad) || b.pfad < 1 || b.pfad > PFADE) f(`„pfad“ muss 1 bis ${PFADE} sein.`);
    if (!istGanzzahl(b.hoehe) || b.hoehe < 1) f("„hoehe“ muss eine ganze Zahl ab 1 sein.");
    if (!ok) return false; // ohne gültiges Symbol lassen sich Anschlüsse nicht prüfen

    const pole = S.polZahl(b);
    if (pole > 1 && !S.mehrpoligMoeglich(b)) f(`${b.bmk}: dieses Symbol geht nur einpolig.`);
    if (b.pfad + pole - 1 > PFADE) f(`${b.bmk}: ${pole} Pole ab Pfad ${b.pfad} passen nicht aufs Blatt.`);
    if (S.istKlemme(b) && (!istText(b.klemme) || !b.klemme)) f(`${b.bmk}: Reihenklemme ohne „klemme“ (Nummer als Text).`);
    if (b.ort !== undefined && (!istText(b.ort) || !b.ort.startsWith("+"))) f(`${b.bmk}: „ort“ ist ein Ortskennzeichen mit +, z. B. +UV-EG.`);
    if (b.stromkreis !== undefined) {
      if (!S.istSchutz(b)) f(`${b.bmk}: „stromkreis“ nur an Schutzeinrichtungen (Sicherung, LS, RCD …).`);
      else if (!b.stromkreis || typeof b.stromkreis !== "object") f(`${b.bmk}: „stromkreis“ ist ein Objekt.`);
      else for (const [k, v] of Object.entries(b.stromkreis)) {
        if (!STROMKREIS_FELDER.includes(k)) f(`${b.bmk}: stromkreis.${k} gibt es nicht (erlaubt: ${STROMKREIS_FELDER.join(", ")}).`);
        else if (!istText(v)) f(`${b.bmk}: stromkreis.${k} muss Text sein.`);
      }
    }

    const anschluesse = Object.keys(S.anschlusspunkte(b, 0, 0, 1) || {});
    const schienenNamen = (blatt.schienen || []).map((s) => s.name);
    if (b.schienen !== undefined && (typeof b.schienen !== "object" || Array.isArray(b.schienen))) {
      f(`${b.bmk}: „schienen“ ist ein Objekt Anschluss → Schienenname.`);
    } else {
      for (const [anschluss, name] of Object.entries(b.schienen || {})) {
        if (!anschluesse.includes(anschluss)) f(`${b.bmk}: Anschluss „${anschluss}“ gibt es nicht (hat ${anschluesse.join(", ")}).`);
        if (!schienenNamen.includes(name)) f(`${b.bmk}: Schiene „${name}“ gibt es auf diesem Blatt nicht.`);
        if ((name === "PE" || name === "PEN") && S.istSchaltend(b)) f(`${b.bmk}: PE/PEN wird nie geschaltet.`);
      }
    }
    // Platz frei? Überschneidende Pfade auf derselben Höhe.
    for (const andere of blatt.bauteile) {
      if (andere.id === b.id || andere.hoehe !== b.hoehe) continue;
      const bis = b.pfad + pole - 1, andereBis = andere.pfad + S.polZahl(andere) - 1;
      if (andere.pfad <= bis && andereBis >= b.pfad) f(`${b.bmk}: Pfad ${b.pfad}, Höhe ${b.hoehe} ist schon von ${andere.bmk} belegt.`);
    }
    return ok;
  }

  // Prüft eine Antwort und führt sie auf einer Kopie aus. Ergebnis:
  // { ok, fehler: [Text], projekt (die geänderte Kopie, nur bei ok), geaendert: [blattId],
  //   text, befunde, anzahl }.
  function antwortPruefen(projekt, antwort) {
    const fehlerListe = [];
    const ergebnis = { ok: false, fehler: fehlerListe, projekt: null, geaendert: [], text: "", befunde: [], anzahl: 0 };
    if (!antwort || typeof antwort !== "object" || Array.isArray(antwort)) {
      fehlerListe.push("Die Datei enthält kein JSON-Objekt.");
      return ergebnis;
    }
    if (antwort.leitwerk !== "antwort") fehlerListe.push("„leitwerk“ muss „antwort“ sein – ist das eine Antwortdatei?");
    if (antwort.version !== FORMAT_VERSION) fehlerListe.push(`„version“ muss ${FORMAT_VERSION} sein.`);
    for (const feld of Object.keys(antwort)) {
      if (!ANTWORT_FELDER.includes(feld)) fehlerListe.push(`Unbekanntes Feld „${feld}“.`);
    }
    if (antwort.text !== undefined && !istText(antwort.text)) fehlerListe.push("„text“ muss Text sein.");
    if (antwort.aenderungen !== undefined && !Array.isArray(antwort.aenderungen)) fehlerListe.push("„aenderungen“ muss eine Liste sein.");
    if (antwort.befunde !== undefined && !Array.isArray(antwort.befunde)) fehlerListe.push("„befunde“ muss eine Liste sein.");
    if (fehlerListe.length) return ergebnis;

    const neu = kopie(projekt);
    const refs = new Map(); // ref aus der Antwort → echte id
    const geaendert = new Set();

    const blattFinden = (verweis) => {
      const id = refs.get(verweis) || verweis;
      return neu.blaetter.find((b) => b.id === id) || null;
    };
    const zeichenblatt = (verweis, fehler) => {
      const blatt = blattFinden(verweis);
      if (!blatt) { fehler(`Blatt „${verweis}“ gibt es nicht.`); return null; }
      if (M.istErzeugt(blatt)) { fehler(`Blatt „${blatt.titel}“ ist ein erzeugtes Blatt – darauf wird nicht gezeichnet.`); return null; }
      return blatt;
    };
    const bauteilFinden = (blatt, verweis) => {
      const id = refs.get(verweis) || verweis;
      return blatt.bauteile.find((b) => b.id === id) || null;
    };
    const refMerken = (ref, id, fehler) => {
      if (ref === undefined) return;
      if (!istText(ref) || !ref) { fehler("„ref“ muss Text sein."); return; }
      if (refs.has(ref)) { fehler(`„ref“ ${ref} doppelt.`); return; }
      refs.set(ref, id);
    };

    (antwort.aenderungen || []).forEach((a, i) => {
      const nr = `Änderung ${i + 1}${a && a.art ? ` (${a.art})` : ""}`;
      const fehler = (t) => fehlerListe.push(`${nr}: ${t}`);
      if (!a || typeof a !== "object") { fehler("kein Objekt."); return; }

      if (a.art === "blatt") {
        if (!istText(a.titel) || !a.titel) { fehler("„titel“ fehlt."); return; }
        const schienen = a.schienen || [];
        if (!schienenPruefen(schienen, fehler)) return;
        const blatt = M.neuesBlatt(a.titel, "stromlaufplan");
        blatt.schienen = schienen.map((s) => M.neueSchiene(s.name, s.lage));
        // Hinter das letzte Zeichenblatt, vor Klemmenplan, Stückliste & Co.
        M.blattEinfuegen(neu, blatt, neu.blaetter.reduce((pos, b, i) => (M.istErzeugt(b) ? pos : i + 1), 0));
        refMerken(a.ref, blatt.id, fehler);
        geaendert.add(blatt.id);
      } else if (a.art === "schienen") {
        const blatt = zeichenblatt(a.blatt, fehler);
        if (!blatt || !schienenPruefen(a.schienen, fehler)) return;
        blatt.schienen = a.schienen.map((s) => M.neueSchiene(s.name, s.lage));
        // Bindungen, deren Schiene es nicht mehr gibt, wären stille Fehler – melden.
        for (const b of blatt.bauteile) {
          for (const name of Object.values(b.schienen || {})) {
            if (!blatt.schienen.some((s) => s.name === name)) fehler(`${b.bmk} hängt an ${name}, die Schiene fiele weg.`);
          }
        }
        geaendert.add(blatt.id);
      } else if (a.art === "bauteil") {
        const blatt = zeichenblatt(a.blatt, fehler);
        if (!blatt) return;
        const erlaubt = ["art", "ref", "blatt", "bmk", "kontakt", "betaetigung", "kennzeichen", "typ", "pole",
          "pfad", "hoehe", "schienen", "beschriftung", "klemme", "kabel", "ader", "ort", "stromkreis"];
        for (const feld of Object.keys(a)) if (!erlaubt.includes(feld)) fehler(`unbekanntes Feld „${feld}“.`);
        const b = a.kontakt
          ? M.neuerKontakt(a.bmk, a.kontakt, a.betaetigung || null, a.kennzeichen || [], a.pfad, a.hoehe,
            a.beschriftung || "", a.pole || 1, a.schienen || {})
          : M.neuesBauteil(a.bmk, a.typ, a.pfad, a.hoehe, a.beschriftung || "", a.pole || 1, a.schienen || {});
        if (a.pole !== undefined) b.pole = a.pole; // auch ungültige Werte prüfen lassen
        for (const feld of ["klemme", "kabel", "ader", "ort", "stromkreis"]) if (a[feld] !== undefined) b[feld] = a[feld];
        if (!bauteilPruefen(b, blatt, fehler)) return;
        if (b.pole === 1) delete b.pole;
        blatt.bauteile.push(b);
        refMerken(a.ref, b.id, fehler);
        geaendert.add(blatt.id);
      } else if (a.art === "aendern") {
        const blatt = zeichenblatt(a.blatt, fehler);
        if (!blatt) return;
        const b = bauteilFinden(blatt, a.bauteil);
        if (!b) { fehler(`Bauteil „${a.bauteil}“ gibt es auf diesem Blatt nicht.`); return; }
        if (!a.felder || typeof a.felder !== "object") { fehler("„felder“ fehlt."); return; }
        const probe = { ...b };
        for (const [feld, wert] of Object.entries(a.felder)) {
          if (!AENDERBARE_FELDER.includes(feld)) { fehler(`Feld „${feld}“ lässt sich nicht ändern.`); return; }
          probe[feld] = wert;
        }
        if (!bauteilPruefen(probe, blatt, fehler)) return;
        Object.assign(b, probe);
        geaendert.add(blatt.id);
      } else if (a.art === "loeschen") {
        const blatt = zeichenblatt(a.blatt, fehler);
        if (!blatt) return;
        const b = bauteilFinden(blatt, a.bauteil);
        if (!b) { fehler(`Bauteil „${a.bauteil}“ gibt es auf diesem Blatt nicht.`); return; }
        blatt.bauteile = blatt.bauteile.filter((x) => x !== b);
        blatt.verbindungen = blatt.verbindungen.filter((v) => v.von.bauteilId !== b.id && v.bis.bauteilId !== b.id);
        geaendert.add(blatt.id);
      } else if (a.art === "verbindung") {
        const blatt = zeichenblatt(a.blatt, fehler);
        if (!blatt) return;
        const enden = [];
        for (const seite of ["von", "bis"]) {
          const e = a[seite];
          const b = e && bauteilFinden(blatt, e.bauteil);
          if (!b) { fehler(`„${seite}“: Bauteil „${e && e.bauteil}“ gibt es auf diesem Blatt nicht.`); return; }
          const anschluesse = Object.keys(S.anschlusspunkte(b, 0, 0, 1) || {});
          if (!anschluesse.includes(String(e.anschluss))) {
            fehler(`„${seite}“: ${b.bmk} hat keinen Anschluss „${e.anschluss}“ (hat ${anschluesse.join(", ")}).`);
            return;
          }
          enden.push({ bauteilId: b.id, anschluss: String(e.anschluss) });
        }
        if (enden[0].bauteilId === enden[1].bauteilId && enden[0].anschluss === enden[1].anschluss) {
          fehler("Anfang und Ende sind derselbe Anschluss.");
          return;
        }
        blatt.verbindungen.push(M.neueVerbindung(enden[0], enden[1]));
        geaendert.add(blatt.id);
      } else {
        fehler(`unbekannte Art „${a.art}“ (erlaubt: blatt, schienen, bauteil, verbindung, aendern, loeschen).`);
      }
    });

    for (const [i, befund] of (antwort.befunde || []).entries()) {
      const fehler = (t) => fehlerListe.push(`Befund ${i + 1}: ${t}`);
      if (!befund || !istText(befund.text) || !befund.text) { fehler("„text“ fehlt."); continue; }
      if (befund.schwere !== "fehler" && befund.schwere !== "hinweis") fehler("„schwere“ muss „fehler“ oder „hinweis“ sein.");
      const blatt = befund.blatt ? blattFinden(befund.blatt) : null;
      if (befund.blatt && !blatt) fehler(`Blatt „${befund.blatt}“ gibt es nicht.`);
      if (befund.bauteil && (!blatt || M.istErzeugt(blatt) || !bauteilFinden(blatt, befund.bauteil))) {
        fehler(`Bauteil „${befund.bauteil}“ gibt es auf diesem Blatt nicht.`);
      }
    }

    ergebnis.text = antwort.text || "";
    ergebnis.befunde = antwort.befunde || [];
    ergebnis.anzahl = (antwort.aenderungen || []).length;
    if (fehlerListe.length) return ergebnis;
    if (!ergebnis.text && !ergebnis.befunde.length && !ergebnis.anzahl) {
      fehlerListe.push("Die Antwort ist leer – weder Text noch Befunde noch Änderungen.");
      return ergebnis;
    }
    ergebnis.ok = true;
    ergebnis.projekt = neu;
    ergebnis.geaendert = [...geaendert];
    return ergebnis;
  }

  return { FORMAT_VERSION, AUFGABEN, ANLEITUNG, auftragErstellen, antwortPruefen };
})();
