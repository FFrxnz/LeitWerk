// Speichern im Browser (localStorage) und als Datei. Alles offline, kein Server nötig.
//
// Im Browser liegen mehrere Projekte: jedes unter "leitwerk-projekt:<id>", das offene unter
// AKTUELL, dazu ein Verzeichnis (Name, Blattzahl, zuletzt benutzt) unter VERZEICHNIS. Das
// Verzeichnis ist nur eine Abkürzung für die Startseite – gerechnet aus dem Projekt bei
// jedem Speichern, nie von Hand gepflegt.
// Bis 25.09.2026 gab es genau ein Projekt unter ALT. Es wird beim ersten Start übernommen
// und bleibt als Sicherung liegen.

const LEITWERK_SPEICHER = (() => {
  const ALT = "leitwerk-projekt";
  const VERZEICHNIS = "leitwerk-projekte";
  const AKTUELL = "leitwerk-aktuell";
  const projektSchluessel = (id) => `leitwerk-projekt:${id}`;

  function lesen(schluessel) {
    try {
      const roh = localStorage.getItem(schluessel);
      return roh ? JSON.parse(roh) : null;
    } catch {
      return null;
    }
  }

  function neueId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function projektName(projekt) {
    const m = projekt.meta || {};
    return m.plantitel || m.anlage || m.auftraggeber || "Unbenanntes Projekt";
  }

  function liste() {
    const eintraege = lesen(VERZEICHNIS) || [];
    return eintraege.slice().sort((a, b) => b.zuletzt.localeCompare(a.zuletzt));
  }

  function aktuelleId() {
    return localStorage.getItem(AKTUELL);
  }

  // Einmalig: das alte Einzelprojekt wird zum ersten Eintrag der Liste.
  function uebernehmen() {
    if (localStorage.getItem(VERZEICHNIS) !== null) return;
    const alt = lesen(ALT);
    localStorage.setItem(VERZEICHNIS, "[]");
    // Nur ein echtes Projekt übernehmen – ein kaputter Stand darf den Start nicht verhindern.
    if (!alt || !Array.isArray(alt.blaetter)) return;
    const id = neueId();
    localStorage.setItem(AKTUELL, id);
    speichern(alt);
  }

  // Speichert unter dem offenen Projekt; gibt es keins, wird ein neuer Eintrag angelegt.
  function speichern(projekt) {
    let id = aktuelleId();
    if (!id) { id = neueId(); localStorage.setItem(AKTUELL, id); }
    localStorage.setItem(projektSchluessel(id), JSON.stringify(projekt));
    const eintraege = (lesen(VERZEICHNIS) || []).filter((e) => e.id !== id);
    eintraege.push({
      id,
      name: projektName(projekt),
      blaetter: projekt.blaetter.length,
      zuletzt: new Date().toISOString(),
    });
    localStorage.setItem(VERZEICHNIS, JSON.stringify(eintraege));
  }

  // Das offene Projekt (ohne id) oder das mit dieser id, das dann das offene wird.
  function laden(id = aktuelleId()) {
    if (!id) return null;
    const projekt = lesen(projektSchluessel(id));
    if (projekt) localStorage.setItem(AKTUELL, id);
    return projekt;
  }

  // Das nächste Speichern legt ein neues Projekt an (Neu, Datei öffnen, Vorlage).
  function neuesAnfangen() {
    localStorage.removeItem(AKTUELL);
  }

  function loeschen(id) {
    localStorage.removeItem(projektSchluessel(id));
    const eintraege = (lesen(VERZEICHNIS) || []).filter((e) => e.id !== id);
    localStorage.setItem(VERZEICHNIS, JSON.stringify(eintraege));
    if (aktuelleId() === id) localStorage.removeItem(AKTUELL);
  }

  function dateiname(projekt) {
    const name = projektName(projekt).replace(/[\\/:*?"<>|]+/g, "-").trim();
    return `${name || "leitwerk-projekt"}.leitwerk`;
  }

  function exportieren(inhalt, name = dateiname(inhalt)) {
    const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Liest eine vom Nutzer ausgewählte Datei ein und liefert das geparste Projekt per Promise.
  function importieren(datei) {
    return new Promise((resolve, reject) => {
      const leser = new FileReader();
      leser.onload = () => {
        try {
          resolve(JSON.parse(leser.result));
        } catch (fehler) {
          reject(fehler);
        }
      };
      leser.onerror = () => reject(leser.error);
      leser.readAsText(datei, "utf-8");
    });
  }

  try {
    uebernehmen();
  } catch (fehler) {
    console.warn("Altes Projekt nicht übernommen:", fehler);
  }

  return { speichern, laden, liste, aktuelleId, neuesAnfangen, loeschen, projektName, exportieren, importieren };
})();
