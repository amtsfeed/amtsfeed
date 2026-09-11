# Landkreis Elbe-Elster

**Quelle:** [lkee.de](https://www.lkee.de/)

**CMS:** IKISS (ISO-8859-15 / windows-1252)

| Inhaltstyp    | URL |
|---------------|-----|
| News          | https://www.lkee.de/Aktuelles-Kreistag/ |
| Veranstaltungen | https://www.lkee.de/Soziales-Kultur/Veranstaltungen/ |
| Amtsblatt     | https://www.lkee.de/Unser-Landkreis/Kreisanzeiger-Amtsblatt/index.php?La=1&object=tx,2112.219.1&kat=&kuo=2&sub=0 |

**Besonderheiten:**
- Encoding: windows-1252 (ISO-8859-15) — wird mit `TextDecoder("windows-1252")` dekodiert
- News-Listenseite zeigt max. 15 Einträge (IKISS hat keine URL-Pagination)
- Amtsblatt-PDFs seit 2009; Datum aus Unix-Timestamp im PDF-URL-Parameter
- Die Amtsblatt-Jahrgangsliste liegt seit dem lkee.de-Umbau (2026) unter der Rubrik
  "Kreisanzeiger/Amtsblatt". Die alte URL `/index.php?…object=tx,2112.1066.1…` läuft in eine
  307-Weiterleitungsschleife. Zusätzlich muss ein `Referer` auf
  `/Unser-Landkreis/Kreisanzeiger-Amtsblatt/` mitgeschickt werden — ohne ihn antwortet iKISS
  ebenfalls mit einer Weiterleitungsschleife.
- Veranstaltungen ohne Pagination, ca. 15–20 aktuelle Einträge sichtbar
