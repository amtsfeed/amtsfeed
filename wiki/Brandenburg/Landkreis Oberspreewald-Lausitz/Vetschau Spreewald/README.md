# Vetschau/Spreewald

Stadt Vetschau/Spreewald (sorbisch: Wětošow/Błota) im Landkreis Oberspreewald-Lausitz.
Quelle: https://stadt.vetschau.de/cms/ (www.vetschau.de leitet per Redirect dorthin)

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://stadt.vetschau.de/startseite/nachrichten/ |
| Events           | https://stadt.vetschau.de/startseite/veranstaltungen/ |
| Amtsblatt        | https://stadt.vetschau.de/highlights/vetschauer-mittteilungsblatt-und-amtsblatt.html |
| Bekanntmachungen | https://stadt.vetschau.de/startseite/wahlen/wahlbekanntmachungen/ |

## Datenqualität

- **News:** 20 Einträge (Titel + URL, **kein Veröffentlichungsdatum im Listing**)
- **Events:** 74 Einträge (Datum, Start-/Endzeit, Ort)
- **Amtsblatt:** 4 Einträge (Ausgabe 2026, nur „Amtsblatt"-PDFs; das parallele „Vetschauer Mitteilungsblatt" wird bewusst ausgelassen)
- **Bekanntmachungen:** 4 Einträge (Wahlbekanntmachungen, kein eigener Datums-Index)

## Besonderheiten

- CMS: **CONTENIDO 4.10** (in CMS.md bisher nicht gelistet — neues System für dieses Projekt)
- News-Liste enthält weder im Listing noch im RSS ein Veröffentlichungsdatum → `publishedAt` bleibt leer; Sortierung nach `fetchedAt`.
- Event-Block-Struktur: `<div class="event">` → `<h2>Titel</h2>` + `<ul><li><strong>am:</strong> DD.MM.YYYY</li><li><strong>um:</strong> HH:MM Uhr</li><li><strong>bis</strong> HH:MM Uhr</li><li><strong>Ort:</strong> ...</li></ul>`.
- Event-URL über `idart=NNN`-Parameter (CONTENIDO-Artikel-ID); fehlt das Mapping, wird auf die Listenseite verlinkt.
- Amtsblatt-Dateien folgen der Konvention `Vetschau_Amtsblatt_YYMM.pdf`; ältere Jahre liegen in eigenen Archivseiten (aktuell nicht traversiert).
- Bekanntmachungen werden auf der Stadt-Seite nicht als zentrale Liste, sondern verteilt unter `/wahlen/wahlbekanntmachungen/` u.ä. geführt; aktuell nur die Wahlbekanntmachungen indiziert.
- Sorbische Doppelnamen werden bei den Dateien nicht ausgewertet.
