#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, EventsFile, Event, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.hennigsdorf.de";
const NEWS_URL = `${BASE_URL}/Rathaus/Aktuelles/`;
const EVENTS_URL = `${BASE_URL}/Stadtleben/Veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/Rathaus/Verwaltung/Amtliche-Bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const GERMAN_MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08",
  September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// IKISS CMS news list:
// <ul class="result-list"><li>
//   <a href="/Rathaus/Aktuelles/..." data-ikiss-mfid="7.3590.NNNN.1">
//   <span class="news-date">...<span class="sr-only">Datum: </span>DD.MM.YYYY</span>
//   <h3 class="list-title">Title</h3>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*>)/).filter((b) => /data-ikiss-mfid="7\.3590\./.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="([^"]+)"[^>]*data-ikiss-mfid="7\.3590\.(\d+)\.1"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const newsId = hrefMatch[2]!;
    const id = `hennigsdorf-news-${newsId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h3\s+class="list-title">([\s\S]*?)<\/h3>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = block.match(/Datum:\s*<\/span>(\d{2})\.(\d{2})\.(\d{4})/);
    const publishedAt = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z` : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// IKISS CMS events list:
// <a href="/Stadtleben/Veranstaltungen/..." data-ikiss-mfid="11.3590.NNNN.1">
//   <h3 class="list-title">Title</h3>
//   <p class="date"><span class="sr-only">Datum: </span>DD. Monat YYYY[ bis DD. Monat YYYY]<br>Location</p>

function parseGermanDate(dd: string, month: string, yyyy: string): string | undefined {
  const mm = GERMAN_MONTHS[month];
  if (!mm) return undefined;
  return `${yyyy}-${mm}-${dd.padStart(2, "0")}T00:00:00.000Z`;
}

function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li[^>]*>|<a\s)/).filter((b) => /data-ikiss-mfid="11\.3590\./.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="([^"]+)"[^>]*data-ikiss-mfid="11\.3590\.(\d+)\.1"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!;
    const eventId = hrefMatch[2]!;
    const id = `hennigsdorf-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h3\s+class="list-title">([\s\S]*?)<\/h3>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Date format: "DD. Monat YYYY bis DD. Monat YYYY" (German month names)
    const dateBlock = block.match(/Datum:\s*<\/span>([\s\S]{0,120}?)(?:<br|<\/p>)/)?.[1] ?? "";
    const dateRx = /(\d{1,2})\.\s*(\w+)\s+(\d{4})/g;
    const dates: string[] = [];
    let dm: RegExpExecArray | null;
    while ((dm = dateRx.exec(dateBlock)) !== null) {
      const d = parseGermanDate(dm[1]!, dm[2]!, dm[3]!);
      if (d) dates.push(d);
    }
    if (dates.length === 0) continue;

    const startDate = dates[0]!;
    const endDate = dates.length > 1 ? dates[dates.length - 1] : undefined;

    // Location: text after <br> in the date block
    const locMatch = block.match(/<p\s+class="date">[\s\S]*?<br\s*\/?>([\s\S]*?)<\/p>/);
    const location = locMatch ? decodeHtmlEntities((locMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined : undefined;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title, url, startDate, ...(endDate && endDate !== startDate ? { endDate } : {}), ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// IKISS amtsblatt (mixed with other PDFs — filter "Amtsblatt Nr."):
// <a href="/media/custom/3590_NNNN_1.PDF?timestamp" class="csslink_PDF hide-icon"> Amtsblatt Nr. N YYYY</a>
// <small>...<span class="sr-only">Beschreibung: </span>Herausgabe DD.MM.YYYY</small>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Split on each csslink_PDF block, capture link + following small tag
  const blocks = html.split(/(?=<a\s[^>]*class="csslink_PDF)/).filter((b) => /csslink_PDF/.test(b));
  for (const block of blocks) {
    const hrefMatch = block.match(/<a\s+href="(\/media\/custom\/3590_(\d+)_1\.PDF[^"]*)"[^>]*class="csslink_PDF[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!hrefMatch) continue;

    const linkText = decodeHtmlEntities((hrefMatch[3] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!linkText.startsWith("Amtsblatt Nr.")) continue;

    const href = hrefMatch[1]!;
    const itemId = hrefMatch[2]!;
    const id = `hennigsdorf-amtsblatt-${itemId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const dateMatch = block.match(/Herausgabe\s+(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) continue;
    const publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href.split("?")[0]!}`;
    items.push({ id, title: linkText, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/Rathaus/Aktuelles/", "/Stadtleben/Veranstaltungen/", "/Rathaus/Verwaltung/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);

const amtsblattPath = join(DIR, "amtsblatt.json");
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
