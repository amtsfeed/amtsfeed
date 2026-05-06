# Seddiner See

Website: https://www.seddiner-see.de

## Kein Scraper vorhanden

Die Website der Gemeinde Seddiner See basiert auf dem **Pagekit CMS** mit Twig-Templates. Inhalte werden serverseitig über Template-Engine gerendert – die eigentlichen Daten (Veranstaltungen, Nachrichten) sind nicht im statischen HTML verfügbar, sondern werden dynamisch über Template-Variablen wie `{{ event.title }}` und `{{ event.start._i | date "short" }}` eingebunden.

Folgende Bereiche existieren, sind aber ohne JavaScript-Rendering nicht maschinell auswertbar:

- **Aktuelles**: `/bildung-soziales/aktuelles`
- **Veranstaltungen**: `/calendar/category?id=2`
- **Amtsblatt**: `/gemeinde/amtsblatt`

Sobald die Website auf ein CMS mit statisch auslesbarem HTML wechselt oder eine strukturierte API anbietet, kann hier ein Scraper ergänzt werden.
