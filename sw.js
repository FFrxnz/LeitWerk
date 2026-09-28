// Offline-Speicher der Internet-Fassung. Vorlage – veroeffentlichen.sh setzt VERSION (mit
// Prüfsumme über alle Dateien, jede Änderung gibt also eine neue) und DATEIEN ein.
// Grundsatz gegen die Cache-Falle: immer ein vollständiger, zusammenpassender Satz Dateien.
// Eine neue Fassung wird komplett geladen und gilt erst nach „Neu starten“ (web-app.js)
// oder wenn LeitWerk ganz geschlossen war – nie halb alt, halb neu.
const VERSION = "0.3-10273734";
const DATEIEN = ["./","app.js","claude-aufsatz.js","erzeugte-blaetter.js","index.html","kontakte.js","manifest.webmanifest","modell.js","pruefprotokoll.js","querverweise.js","raster.js","speicher.js","stromkreise.js","styles.css","symbole.js","symbol.svg","symbol/symbol-16.png","symbol/symbol-180.png","symbol/symbol-192.png","symbol/symbol-32.png","symbol/symbol-512.png","testprojekt.js","verlauf.js","version.js","vorlagen.js","web-app.js","zip.js"];
const SPEICHER = "leitwerk-" + VERSION;

self.addEventListener("install", (evt) => {
  // cache: "reload" – am Browser-Cache vorbei, sonst landen alte Dateien im neuen Satz.
  evt.waitUntil(caches.open(SPEICHER).then((c) =>
    c.addAll(DATEIEN.map((d) => new Request(d, { cache: "reload" })))));
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n.startsWith("leitwerk-") && n !== SPEICHER).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (evt) => { if (evt.data === "jetztWechseln") self.skipWaiting(); });

self.addEventListener("fetch", (evt) => {
  const anfrage = evt.request;
  if (anfrage.method !== "GET" || new URL(anfrage.url).origin !== location.origin) return;
  evt.respondWith(caches.open(SPEICHER).then((c) =>
    c.match(anfrage, { ignoreSearch: true })
      .then((treffer) => treffer || (anfrage.mode === "navigate" ? c.match("./") : null))
      .then((treffer) => treffer || fetch(anfrage))));
});
