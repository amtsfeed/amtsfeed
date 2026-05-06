# Stahnsdorf

Website: https://www.stahnsdorf.de

## Kein Scraper vorhanden

Die Website der Gemeinde Stahnsdorf bietet folgende Bereiche:

- **Nachrichten**: `/aktuell-informativ/` – Meldungen werden als `<h3><a href="...">Titel</a></h3>` ohne maschinenlesbare Datumsfelder aufgelistet. Datumsangaben erscheinen nur im Fließtext des Vorschautexts, nicht in strukturierten Elementen.
- **Veranstaltungen**: `/aktuell-informativ/veranstaltungen/veranstaltungskalender/` – Ein Kalender-Grid, der JavaScript zum Rendern benötigt. Keine statischen Event-Einträge im HTML.
- **Amtsblatt**: `/verwaltung-politik/rathaus/amtsblaetter/` – Redirect auf ein externes Ratsinformationssystem (ratsinfo-online.net), das keine maschinenlesbare Struktur für direkten Zugriff bietet.

Für einen Scraper wäre mindestens eine strukturierte Nachrichtenliste mit Datum notwendig. Sollte die Website dahingehend erweitert werden, kann hier ein Scraper ergänzt werden.
