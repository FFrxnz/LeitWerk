// Die eine Stelle für die Versionsnummer und das, was die Tester dazu wissen sollen.
// Startseite, „Bekannte Lücken“ und Rückmeldung lesen von hier – jede Rückmeldung gehört
// damit zu einer Version. Bei jeder neuen Testversion: Nummer, Datum, neu, lücken nachziehen.
const LEITWERK_VERSION = {
  nummer: "0.3",
  datum: "2026-09-28",
  testversion: true,
  neu: [
    "Projektangaben (Auftraggeber, Anlage, Plantitel, Errichter …) fragt LeitWerk bei jedem neuen Projekt gleich ab. Später erreichst du sie über den Projektnamen oben mit dem Stift-Zeichen ✎. Das Datum wählst du im Kalender.",
    "Prüfprotokoll: Schleifenimpedanz wird gegen die Grenze geprüft (Z_S ≤ 2/3 · 230 V / I_a, Tabellenbuch S. 246), RCD-Auslösestrom gegen I_ΔN und RCD-Auslösezeit gegen 300 ms (DIN EN 61008-1). Nur Hinweis, gesperrt wird nichts.",
    "Aus 0.2: Projekte aus „Zuletzt verwendet“ löschen, Kabel in der Stückliste, Grenzwert-Hinweise für Isolationswiderstand, Kurzschlussstrom und Berührungsspannung.",
  ],
  bitten: [
    "Die Schaltzeichen folgen dem Tabellenbuch Elektrotechnik (Europa-Lehrmittel). Andere Auflagen und Hersteller zeichnen manches anders – sag bitte Bescheid, wo dir ein Zeichen falsch oder fremd vorkommt.",
    "Die Projekte liegen im Browser. Wer die Browserdaten löscht, verliert sie – wichtige Pläne mit „Als Datei speichern“ sichern.",
    "Der Knopf „Claude…“ funktioniert nur mit einem eigenen Claude-Zugang.",
  ],
  luecken: [
    "Installations- und Anschlusspläne gibt es noch nicht, nur Stromlaufpläne und die Listen.",
    "Binärelemente für SPS-Pläne (Symbolgruppe 12) fehlen noch.",
    "Kabel stehen im Kabelplan und in der Stückliste, aber noch nicht am Stromlaufplan.",
    "Kontaktnummern werden gerechnet und lassen sich nicht von Hand vorgeben; der Kontaktspiegel zeigt nur belegte Kontakte.",
    "Bei selektiven RCD (Typ S) wird die Auslösezeit nicht geprüft; der Auslösestrom nur, wenn I_ΔN in der Beschriftung steht (z. B. „40 A / 30 mA“). Pro Projekt gibt es ein Prüfprotokoll.",
    "Freihand-Notizen lassen sich nur von hinten zurücknehmen, einen Radierer gibt es nicht.",
    "Claude kann keine blattübergreifenden Potenziale setzen.",
    "Am Tablet (Android oder iPad) die Internet-Adresse öffnen und „Zum Startbildschirm hinzufügen“ – danach läuft LeitWerk ohne Netz. Die Bedienung mit dem Finger ist noch wenig erprobt.",
  ],
};
