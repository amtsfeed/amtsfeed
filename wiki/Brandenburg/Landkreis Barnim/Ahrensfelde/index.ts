#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.ahrensfelde.de";
const NEWS_URL = `${BASE_URL}/aktuelles-mehr/aktuelle-meldungen/`;
const AMTSBLATT_ARCHIVE_URL = `${BASE_URL}/aktuelles-mehr/amtsblatt/amtsblatt-archiv/`;
const NOTICES_URL = `${BASE_URL}/aktuelles-mehr/amtliche-bekanntmachungen/`;
const KOMMUNE_ID = "30601";
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// NOLIS iCal export: /veranstaltungen/veranstaltungen.ical
// Parameters: zeitauswahl=1&auswahl_woche_tage=365&selected_kommune=30601&beginn=YYYYMMDD000000&ende=YYYYMMDD235959&intern=0
// VEVENT fields: SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION, X-ID (e.g. 30601_900004756)

function unfoldIcal(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, "");
}

function icalDateToIso(val: string): string {
  // YYYYMMDDTHHMMSSZ or YYYYMMDD
  if (val.length >= 15 && val[8] === "T") {
    return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T${val.slice(9, 11)}:${val.slice(11, 13)}:${val.slice(13, 15)}Z`;
  }
  return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T00:00:00.000Z`;
}

// Build {eventId → fullUrl} map from search-results pages.
// NOLIS sucheplus.html mit Datumsbereich+Pagination liefert alle Slug-URLs (eine Seite = ca. 15 Einträge).
// "p0=N" steuert die Seite; oben in der Antwort steht "Seite 1 von X".
const SUCHEPLUS_BASE_URL = `${BASE_URL}/regional/veranstaltungen/sucheplus.html`;
async function fetchSearchUrlMap(headers: Record<string, string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const today = new Date();
  const past = new Date(today); past.setFullYear(past.getFullYear() - 3);
  const future = new Date(today); future.setFullYear(future.getFullYear() + 2);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const baseBody = new URLSearchParams({
    action: "1", naviID: "0", titel: "Veranstaltungen", intern: "0",
    zeitauswahl: "4", beginn_datum: fmt(past), ende_datum: fmt(future),
  });
  const linkRx = /href="(https?:\/\/www\.ahrensfelde\.de\/regional\/veranstaltungen\/[^"\/]+-(\d{9})-30601\.html)[^"]*"/g;

  const fetchPage = async (page: number): Promise<string> => {
    const body = new URLSearchParams(baseBody); body.set("p0", String(page));
    const res = await fetch(SUCHEPLUS_BASE_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? res.text() : "";
  };

  const first = await fetchPage(0);
  // "Seite 1 von N"
  const totalMatch = first.match(/Seite\s+\d+\s+von\s+(\d+)/);
  const totalPages = totalMatch ? parseInt(totalMatch[1]!, 10) : 1;
  const collect = (html: string) => { for (const m of html.matchAll(linkRx)) map.set(m[2]!, m[1]!); };
  collect(first);

  const CONC = 5;
  for (let p = 1; p < totalPages; p += CONC) {
    const batch = Array.from({ length: Math.min(CONC, totalPages - p) }, (_, i) => p + i);
    const pages = await Promise.all(batch.map(fetchPage));
    for (const html of pages) collect(html);
  }
  return map;
}

function slugifyTitle(title: string): string {
  return title.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function eventUrl(eventId: string, urlMap: Map<string, string>, title?: string): string {
  const mapped = urlMap.get(eventId);
  if (mapped) return mapped;
  if (title) {
    const slug = slugifyTitle(title);
    if (slug) return `${BASE_URL}/regional/veranstaltungen/${slug}-${eventId}-30601.html?naviID=0`;
  }
  return `${BASE_URL}/regional/veranstaltungen/sucheplus.html?detail=1&id=${eventId}`;
}

const SLUG_URL_RX = /\/regional\/veranstaltungen\/[^"\/]+-\d{9}-30601\.html/;

function extractEvents(ical: string, urlMap: Map<string, string>): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const unfolded = unfoldIcal(ical);

  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const get = (key: string) => block.match(new RegExp(`^${key}[;:][^\r\n]*`, "m"))?.[0]?.replace(/^[^:]+:/, "").trim() ?? "";

    const summary = get("SUMMARY").replace(/\\,/g, ",").replace(/\\n/g, " ").trim();
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    const location = get("LOCATION").replace(/\\,/g, ",").replace(/\\n/g, "\n").trim();
    const description = get("DESCRIPTION").replace(/\\,/g, ",").replace(/\\n/g, "\n").trim();
    const xid = get("X-ID"); // e.g. 30601_900004756

    if (!summary || !dtstart) continue;

    const eventId = xid ? xid.split("_")[1] : undefined;
    const id = eventId ? `ahrensfelde-event-${eventId}` : `ahrensfelde-event-${dtstart}-${summary.slice(0, 20)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = eventId
      ? eventUrl(eventId, urlMap, summary)
      : `${BASE_URL}/leben-freizeit/veranstaltungen/veranstaltungsuebersicht/`;

    items.push({
      id,
      title: summary,
      url,
      startDate: icalDateToIso(dtstart),
      ...(dtend ? { endDate: icalDateToIso(dtend) } : {}),
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items;
}

// ── News ──────────────────────────────────────────────────────────────────────
// NOLIS CMS nolis-list-item variant
// Container: <div id="nolis-list-item..." class="nolis-list-item ...">
// Date: <p class="nolis-list-date">DD.MM.YYYY</p>
// Title+URL: <h4 ...><a href="URL">TITLE</a></h4>
// ID: numeric part from URL pattern (\d{6,})-30601

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split('class="nolis-list-item ').filter((b) =>
    b.includes("nolis-list-date")
  );

  for (const block of blocks) {
    const dateMatch = block.match(/<p class="nolis-list-date">(\d{2})\.(\d{2})\.(\d{4})<\/p>/);
    const titleMatch = block.match(/<h4[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = titleMatch[1]!.startsWith("http") ? titleMatch[1]! : `${BASE_URL}${titleMatch[1]!}`;
    const title = decodeHtmlEntities(titleMatch[2]!.replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = url.match(/(\d{6,})-30601/);
    const id = idMatch ? `ahrensfelde-${idMatch[1]!}` : url;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (dateMatch) {
      const [, dd, mm, yyyy] = dateMatch;
      publishedAt = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    }

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// NOLIS dokumenteplus format: archive page lists year folders, each year page has
// managerbox blocks with download href and title like "Amtsblatt MONTH YEAR"

const GERMAN_MONTHS_FULL: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function extractAmtsblattFromYearPage(html: string, year: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split("managerbox ").slice(1);
  for (const block of blocks) {
    const hrefMatch = block.match(/href="(https?:\/\/www\.ahrensfelde\.de\/downloads\/datei\/[^"]+)"/);
    if (!hrefMatch) continue;
    const url = hrefMatch[1]!;

    const titleMatch = block.match(/<td[^>]*class="dokumente_inhalt"[^>]*>([^<]+)<\/td>/);
    if (!titleMatch) continue;
    const rawTitle = decodeHtmlEntities(titleMatch[1]!.trim());

    // Title like "Amtsblatt Januar 2026" or "Amtsblatt 01/2025"
    let mm: string | undefined;
    let yyyy = year;

    const longMatch = rawTitle.match(/([A-Za-zäöüÄÖÜß]+)\s+(\d{4})/);
    if (longMatch) {
      mm = GERMAN_MONTHS_FULL[longMatch[1]!];
      yyyy = longMatch[2]!;
    }
    if (!mm) continue;

    const id = `ahrensfelde-amtsblatt-${yyyy}-${mm}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = `${yyyy}-${mm}-01T00:00:00.000Z`;
    items.push({ id, title: `Amtsblatt Ahrensfelde ${mm}/${yyyy}`, url, publishedAt, fetchedAt: now });
  }

  return items;
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// NOLIS CMS Bekanntmachungen list:
// <td class="datum_news">DD.MM.YYYY&nbsp;-</td>
// <td class="titel_news"><a href="URL"><span itemprop="name">TITLE</span></a></td>
// ID: numeric part from URL pattern (\d{6,})-30601, else slug-based

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<td class="datum_news">(\d{2})\.(\d{2})\.(\d{4})[\s\S]{0,20}?<\/td>\s*<td class="titel_news"><a[^>]+href="([^"]+)"[^>]*><span[^>]*itemprop="name">([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[4]!.startsWith("http") ? m[4]! : `${BASE_URL}${m[4]!}`;
    const title = decodeHtmlEntities((m[5] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = url.match(/(\d{6,})-30601/);
    const id = idMatch ? `ahrensfelde-notice-${idMatch[1]!}` : `ahrensfelde-notice-${encodeURIComponent(title).slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

const NEWS_LIMIT = 50;

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) {
      byId.set(n.id, n);
    } else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
      return 0;
    })
    .slice(0, NEWS_LIMIT);
}

const EVENTS_LIMIT = 200;

function mergeEvents(existing: Event[], incoming: Event[], urlMap: Map<string, string>): Event[] {
  // Upgrade auf Slug-URL, wenn die Map sie kennt und der Eintrag noch das alte 404-Muster
  // oder den sucheplus-Fallback nutzt
  const isSlugUrl = (url: string) => SLUG_URL_RX.test(url);
  const fixUrl = (e: Event): Event => {
    if (isSlugUrl(e.url)) return e;
    const idMatch = e.id.match(/-(\d{9})$/);
    if (!idMatch) return e;
    const better = urlMap.get(idMatch[1]!);
    return better ? { ...e, url: better } : { ...e, url: eventUrl(idMatch[1]!, urlMap) };
  };
  const byId = new Map(existing.map((e) => [e.id, fixUrl(e)]));
  for (const e of incoming) {
    const fixed = fixUrl(e);
    if (!byId.has(fixed.id)) {
      byId.set(fixed.id, fixed);
    } else {
      const old = byId.get(fixed.id)!;
      byId.set(fixed.id, { ...fixed, fetchedAt: old.fetchedAt ?? fixed.fetchedAt });
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, EVENTS_LIMIT);
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/aktuelles-mehr/aktuelle-meldungen/", "/veranstaltungen/veranstaltungen.ical", "/aktuelles-mehr/amtsblatt/", "/aktuelles-mehr/amtliche-bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };

const today = new Date();
const nextYear = new Date(today);
nextYear.setFullYear(nextYear.getFullYear() + 1);
const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const eventsIcalUrl = `${BASE_URL}/veranstaltungen/veranstaltungen.ical?zeitauswahl=1&auswahl_woche_tage=365&kategorie=0&selected_kommune=${KOMMUNE_ID}&beginn=${fmt(today)}000000&ende=${fmt(nextYear)}235959&intern=0`;
const [newsHtml, eventsIcal, archiveHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`);
    return r.text();
  }),
  fetch(eventsIcalUrl, { headers }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} ${eventsIcalUrl}`);
    return r.text();
  }),
  fetch(AMTSBLATT_ARCHIVE_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews } satisfies NewsFile, null, 2));
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);

const urlMap = await fetchSearchUrlMap(headers);
const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
// Slugs aus bestehenden events.json-Einträgen als Backup übernehmen
for (const item of existingEvents.items) {
  const idM = item.id.match(/-(\d{9})$/);
  if (idM && !urlMap.has(idM[1]!) && SLUG_URL_RX.test(item.url)) urlMap.set(idM[1]!, item.url);
}
const incomingEvents = extractEvents(eventsIcal, urlMap);
if (incomingEvents.length > 0) {
  const mergedEvents = mergeEvents(existingEvents.items, incomingEvents, urlMap);
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents } satisfies EventsFile, null, 2));
  console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
} else {
  console.log("events: 0 Einträge – keine events.json geschrieben");
}

// Amtsblatt: extract year → dokumenteplus URL pairs from archive page, then fetch recent years
const yearUrlRx = /href="(https?:\/\/www\.ahrensfelde\.de\/portal\/dokumenteplus-\d+-30601\.html[^"]*)"[^>]*>(\d{4})</g;
const currentYear = new Date().getFullYear();
const yearUrls: Array<{ year: string; url: string }> = [];
let ym: RegExpExecArray | null;
while ((ym = yearUrlRx.exec(archiveHtml)) !== null) {
  const year = ym[2]!;
  if (parseInt(year) >= currentYear - 2) yearUrls.push({ year, url: ym[1]! });
}

const amtsblattPath = join(DIR, "amtsblatt.json");
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
let allIncoming: AmtsblattItem[] = [];

if (yearUrls.length > 0) {
  const yearPages = await Promise.all(
    yearUrls.map(({ year, url }) =>
      fetch(url, { headers }).then((r) => r.ok ? r.text() : "").then((html) => ({ year, html }))
    )
  );
  for (const { year, html } of yearPages) {
    allIncoming = allIncoming.concat(extractAmtsblattFromYearPage(html, year));
  }
}

const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, allIncoming);
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);

const noticesPath = join(DIR, "notices.json");
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices } satisfies NoticesFile, null, 2));
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
