// Kleinster ZIP-Schreiber für die Rückmeldung: Dateien werden nur gespeichert, nicht
// gepackt (Methode 0) – das reicht für Text, ein Blatt als SVG und das Projekt, und es
// braucht keine Bibliothek und kein Internet. Dateinamen in UTF-8 (Bit 11).

const LEITWERK_ZIP = (() => {
  const CRC_TABELLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(daten) {
    let c = 0xffffffff;
    for (let i = 0; i < daten.length; i++) c = CRC_TABELLE[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosZeit(d) {
    return {
      zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  // dateien: [{ name, inhalt }] mit inhalt als Text oder Uint8Array. Liefert einen Blob.
  function erstellen(dateien, zeitpunkt = new Date()) {
    const kodierer = new TextEncoder();
    const { zeit, datum } = dosZeit(zeitpunkt);
    const teile = [];
    const verzeichnis = [];
    let versatz = 0;
    for (const datei of dateien) {
      const name = kodierer.encode(datei.name);
      const daten = typeof datei.inhalt === "string" ? kodierer.encode(datei.inhalt) : datei.inhalt;
      const crc = crc32(daten);
      const kopf = new DataView(new ArrayBuffer(30));
      kopf.setUint32(0, 0x04034b50, true);
      kopf.setUint16(4, 20, true);
      kopf.setUint16(6, 0x0800, true);
      kopf.setUint16(8, 0, true);
      kopf.setUint16(10, zeit, true);
      kopf.setUint16(12, datum, true);
      kopf.setUint32(14, crc, true);
      kopf.setUint32(18, daten.length, true);
      kopf.setUint32(22, daten.length, true);
      kopf.setUint16(26, name.length, true);
      kopf.setUint16(28, 0, true);
      teile.push(kopf.buffer, name, daten);

      const eintrag = new DataView(new ArrayBuffer(46));
      eintrag.setUint32(0, 0x02014b50, true);
      eintrag.setUint16(4, 20, true);
      eintrag.setUint16(6, 20, true);
      eintrag.setUint16(8, 0x0800, true);
      eintrag.setUint16(10, 0, true);
      eintrag.setUint16(12, zeit, true);
      eintrag.setUint16(14, datum, true);
      eintrag.setUint32(16, crc, true);
      eintrag.setUint32(20, daten.length, true);
      eintrag.setUint32(24, daten.length, true);
      eintrag.setUint16(28, name.length, true);
      eintrag.setUint32(42, versatz, true);
      verzeichnis.push(eintrag.buffer, name);
      versatz += 30 + name.length + daten.length;
    }
    const verzeichnisGroesse = verzeichnis.reduce((s, t) => s + t.byteLength, 0);
    const ende = new DataView(new ArrayBuffer(22));
    ende.setUint32(0, 0x06054b50, true);
    ende.setUint16(8, dateien.length, true);
    ende.setUint16(10, dateien.length, true);
    ende.setUint32(12, verzeichnisGroesse, true);
    ende.setUint32(16, versatz, true);
    return new Blob([...teile, ...verzeichnis, ende.buffer], { type: "application/zip" });
  }

  return { erstellen, crc32 };
})();
