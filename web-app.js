// Nur in der Internet-Fassung (veroeffentlichen.sh hängt es an index.html): meldet den
// Offline-Speicher (sw.js) an. Damit lässt sich LeitWerk am Tablet „Zum Startbildschirm
// hinzufügen“ und läuft danach ohne Netz. Die ZIP-Fassung und der Prüfstand bekommen es
// nicht – dort würde der Speicher nur alte Dateien festhalten.
//
// Neue Version: Der Browser lädt sie im Hintergrund komplett, bevor sie gilt. Dann erscheint
// unten ein Hinweis mit „Neu starten“ – vorher läuft die alte Fassung ungestört weiter.
// Projekte gehen dabei nicht verloren: sie liegen im Browserspeicher, nicht im Offline-Speicher.
(() => {
  // localhost nur zum Ausprobieren der Internet-Fassung (Ordner ../leitwerk-web).
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  function hinweisZeigen(wartend) {
    if (document.getElementById("neueVersion")) return;
    const leiste = document.createElement("div");
    leiste.id = "neueVersion";
    leiste.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;" +
      "background:#1c2430;color:#f4f1ea;padding:10px 14px;border-radius:8px;font:14px system-ui,sans-serif;" +
      "display:flex;gap:12px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:calc(100% - 32px)";
    leiste.textContent = "Eine neue LeitWerk-Version ist da.";
    const knopf = document.createElement("button");
    knopf.textContent = "Neu starten";
    knopf.style.cssText = "background:#c8773a;color:#fff;border:0;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer";
    knopf.addEventListener("click", () => wartend.postMessage("jetztWechseln"));
    leiste.appendChild(knopf);
    document.body.appendChild(leiste);
  }

  let neuGeladen = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Schon beim Öffnen eine fertige neue Fassung da? (nur wenn bisher eine lief)
      if (reg.waiting && navigator.serviceWorker.controller) hinweisZeigen(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const neu = reg.installing;
        neu.addEventListener("statechange", () => {
          if (neu.state === "installed" && navigator.serviceWorker.controller) hinweisZeigen(neu);
        });
      });
    }).catch(() => { /* ohne Offline-Speicher läuft LeitWerk trotzdem, nur nicht ohne Netz */ });
  });
})();
