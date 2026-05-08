# Werder (Havel)

Stadt Werder (Havel) mit News, Veranstaltungen, Amtsblatt und Bekanntmachungen.
Quelle: https://www.werder-havel.de

## Quellen

| Typ              | URL |
|------------------|-----|
| News             | https://www.werder-havel.de/politik-rathaus/aktuelles/neuigkeiten.html |
| Events           | https://www.werder-havel.de/tourismus/veranstaltungen/veranstaltungskalender.html |
| Amtsblatt        | https://www.werder-havel.de/service/ortsrecht-werder/amtsblatt.html |
| Bekanntmachungen | https://www.werder-havel.de/service/ortsrecht-werder/bekanntmachungen.html |

## Datenqualität

- **News:** 875 Einträge
- **Events:** 593 Einträge
- **Amtsblatt:** 59 Einträge
- **Bekanntmachungen:** 59 Einträge

## Besonderheiten

- CMS: **Joomla** mit com_form2content für Downloads
- Sehr umfangreicher Datenbestand bei News (875) und Events (593)
- Amtsblatt: PDF-Links mit Titelformat `Beschreibung - VÖ: DD.MM.YYYY`, Datei-ID aus URL-Pfad `/f<ID>/`
- Bekanntmachungen: Joomla com_form2content Dokumente unter `/media/com_form2content/documents/`
- Events: eventid-Parameter in Kalender-URL, Datum aus `<p class="subhead">`
