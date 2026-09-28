// Rückgängig und Wiederholen: Momentaufnahmen des Projekts als JSON-Text. Weil alles andere
// aus dem Projekt gerechnet wird, reicht es, das Projekt zurückzuholen. Ein Stand entsteht
// bei jedem Speichern, das etwas verändert hat – Ziehen speichert erst beim Loslassen, also
// ist ein Zug ein Schritt. Tippen in ein Feld wird zu einem Schritt zusammengefasst, solange
// zwischen zwei Tasten weniger als TIPP_PAUSE liegt.

const LEITWERK_VERLAUF = (() => {
  const GRENZE = 100;
  const TIPP_PAUSE = 1500; // ms

  let zurueck = [];
  let vor = [];
  let stand = null; // JSON des aktuellen Projekts
  let zeit = 0;
  let getippt = false;

  // Neuer Anfang, z. B. nach dem Öffnen eines anderen Projekts.
  function beginnen(json) {
    zurueck = [];
    vor = [];
    stand = json;
    getippt = false;
  }

  // Meldet einen gespeicherten Stand. Liefert true, wenn er sich vom vorigen unterscheidet.
  function merken(json, tippend = false) {
    if (stand === null) { stand = json; return false; }
    if (json === stand) return false;
    const jetzt = Date.now();
    const weiterGetippt = tippend && getippt && jetzt - zeit < TIPP_PAUSE;
    if (!weiterGetippt) {
      zurueck.push(stand);
      if (zurueck.length > GRENZE) zurueck.shift();
    }
    vor = [];
    stand = json;
    zeit = jetzt;
    getippt = tippend;
    return true;
  }

  // Beide liefern den Stand, der jetzt gelten soll, oder null, wenn es nichts gibt.
  function rueckgaengig() {
    if (!zurueck.length) return null;
    vor.push(stand);
    stand = zurueck.pop();
    getippt = false;
    return stand;
  }

  function wiederholen() {
    if (!vor.length) return null;
    zurueck.push(stand);
    stand = vor.pop();
    getippt = false;
    return stand;
  }

  return {
    beginnen, merken, rueckgaengig, wiederholen,
    kannZurueck: () => zurueck.length > 0,
    kannVor: () => vor.length > 0,
  };
})();
