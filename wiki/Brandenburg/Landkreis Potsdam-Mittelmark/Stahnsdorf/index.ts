#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://stahnsdorf.de";
const RATSINFO_BASE = "https://ratsinfo-online.net/stahnsdorf-bi";
const NEWS_URL = `${BASE_URL}/aktuell-informativ/`;
const EVENTS_URL = `${BASE_URL}/aktuell-informativ/veranstaltungen/veranstaltungskalender/`;
const AMTSBLATT_CURRENT_URL = `${RATSINFO_BASE}/filelist.asp?id=1`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanShortDate(s: string): string {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// News: date appears after h3 in DOM; find each date, look back for nearest h3+link
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const dateRx = /\b(\d{2}\.\d{2}\.\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = dateRx.exec(html)) !== null) {
    const dateStr = m[1]!;
    const year = parseInt(dateStr.slice(6), 10);
    if (year < 2010 || year > 2100) continue;
    // Look backwards for the closest h3 with a link
    const before = html.slice(Math.max(0, m.index - 800), m.index);
    const h3Rx = /<h3[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let h3m: RegExpExecArray | null;
    let lastH3: RegExpExecArray | null = null;
    while ((h3m = h3Rx.exec(before)) !== null) lastH3 = h3m;
    if (!lastH3) continue;
    const rawHref = lastH3[1]!;
    const href = rawHref.startsWith("http") ? rawHref : `${BASE_URL}/${rawHref.replace(/^(\.\.\/)+/, "").replace(/^\//, "")}`;
    const id = `stahnsdorf-news-${href.slice(-40).replace(/[^a-zA-Z0-9]/g, "_")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = decodeHtmlEntities((lastH3[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;
    const publishedAt = parseGermanShortDate(dateStr);
    items.push({ id, title, url: href, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Events: calendar cells with data-ids, event divs with h3 "HH:MM - HH:MM Title"
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  // Build id -> date map from calendar cells
  const cellDates = new Map<string, string>();
  const tableRx = /<table[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tableRx.exec(html)) !== null) {
    const year = tMatch[1]!;
    const month = (tMatch[2] ?? "").padStart(2, "0");
    const tbody = tMatch[3] ?? "";
    const cellRx = /<td[^>]*data-ids="([^"]+)"[^>]*>(\d+)<\/td>/gi;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = cellRx.exec(tbody)) !== null) {
      const day = (cMatch[2] ?? "").padStart(2, "0");
      for (const id of (cMatch[1] ?? "").trim().split(/\s+/)) {
        if (!cellDates.has(id)) cellDates.set(id, `${year}-${month}-${day}T00:00:00.000Z`);
      }
    }
  }

  // Extract event detail divs
  const eventRx = /<div id="paragraphcalenderevent([a-f0-9]+)">([\s\S]*?)(?=<div id="paragraphcalenderevent|<\/div>\s*<\/div>\s*<\/div>)/gi;
  let eMatch: RegExpExecArray | null;
  while ((eMatch = eventRx.exec(html)) !== null) {
    const hexId = eMatch[1]!;
    const content = eMatch[2] ?? "";
    const startDate = cellDates.get(hexId) ?? now;
    const h3Match = content.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!h3Match) continue;
    const h3Text = decodeHtmlEntities(h3Match[1]!.replace(/<[^>]+>/g, "").trim());
    if (!h3Text) continue;

    // h3 format: "HH:MM - HH:MM Title" or just "Title"
    const timeMatch = h3Text.match(/^(\d{2}:\d{2})(?:\s*[-–]\s*\d{2}:\d{2})?\s+([\s\S]+)$/);
    const title = timeMatch ? timeMatch[2]!.trim() : h3Text;
    const startDateTime = timeMatch
      ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`)
      : startDate;

    const linkMatch = content.match(/<a href="([^"]+)"/i);
    const url = linkMatch
      ? (linkMatch[1]!.startsWith("http") ? linkMatch[1]! : `${BASE_URL}/${linkMatch[1]!.replace(/^\.\.\//, "").replace(/^\//, "")}`)
      : EVENTS_URL;

    events.push({ id: `stahnsdorf-event-${hexId}`, title, url, startDate: startDateTime, fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// Amtsblatt current: PDF links with "Nr.NN Jahrgang YY am DD.MM.YYYY" filename
function parseAmtsblattTitle(text: string): { num: string; date: string } | null {
  const m = text.trim().match(/Nr\.(\d+)\s+Jahrgang\s+\d+\s+am\s+(\d{2}\.\d{2}\.\d{4})/i);
  if (!m) return null;
  return { num: m[1]!.padStart(2, "0"), date: parseGermanShortDate(m[2]!) };
}

function extractAmtsblattCurrent(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /href="(download\/[^"]+\.pdf[^"]*)"[^>]*>([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const parsed = parseAmtsblattTitle(m[2]!);
    if (!parsed) continue;
    const url = `${RATSINFO_BASE}/${m[1]!}`;
    const year = parsed.date.slice(0, 4);
    items.push({
      id: `stahnsdorf-amtsblatt-${year}-${parsed.num}`,
      title: `Amtsblatt Nr. ${parsed.num}/${year}`,
      url,
      publishedAt: parsed.date,
      fetchedAt: now,
    });
  }
  return items;
}

// Amtsblatt archive year: list of subfolder links
function extractArchiveSubfolders(html: string, year: string): string[] {
  const rx = new RegExp(`href="(filelist\\.asp\\?id=1&folder=Archiv/${year}/[^"]+)"`, "gi");
  const seen = new Set<string>();
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    if (!seen.has(m[1]!)) { seen.add(m[1]!); result.push(m[1]!); }
  }
  return result;
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/aktuell-informativ/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_CURRENT_URL, { headers }).then((r) => r.ok ? r.arrayBuffer().then((b) => new TextDecoder("latin1").decode(b)) : ""),
]);

// Fetch last archive year (2025) subfolders + each issue
const prevYear = String(new Date().getFullYear() - 1);
const archiveYearHtml = await fetch(`${RATSINFO_BASE}/filelist.asp?id=1&folder=Archiv/${prevYear}/`, { headers })
  .then((r) => r.ok ? r.arrayBuffer().then((b) => new TextDecoder("latin1").decode(b)) : "");
const subfolders = extractArchiveSubfolders(archiveYearHtml, prevYear);
const subfolderHtmls = await Promise.all(
  subfolders.map((path) => fetch(`${RATSINFO_BASE}/${path}`, { headers })
    .then((r) => r.ok ? r.arrayBuffer().then((b) => new TextDecoder("latin1").decode(b)) : ""))
);

const amtsblattItems: AmtsblattItem[] = [
  ...extractAmtsblattCurrent(amtsblattHtml),
  ...subfolderHtmls.flatMap((h) => extractAmtsblattCurrent(h)),
];

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, amtsblattItems);

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
