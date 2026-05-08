# Landkreis Elbe-Elster

**Quelle:** [lkee.de](https://www.lkee.de/)

**CMS:** IKISS (ISO-8859-15 / windows-1252)

| Inhaltstyp    | URL |
|---------------|-----|
| News          | https://www.lkee.de/Aktuelles-Kreistag/ |
| Veranstaltungen | https://www.lkee.de/Soziales-Kultur/Veranstaltungen/ |
| Amtsblatt     | https://www.lkee.de/index.php?La=1&object=tx,2112.1066.1&kuo=2&sub=0 |

**Besonderheiten:**
- Encoding: windows-1252 (ISO-8859-15) — wird mit `TextDecoder("windows-1252")` dekodiert
- News-Listenseite zeigt max. 15 Einträge (IKISS hat keine URL-Pagination)
- Amtsblatt-PDFs seit 2009; Datum aus Unix-Timestamp im PDF-URL-Parameter
- Veranstaltungen ohne Pagination, ca. 15–20 aktuelle Einträge sichtbar
