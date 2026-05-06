#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.kleinmachnow.de";
const NEWS_URL = `${BASE_URL}/Kleinmachnow/Aktuelles/`;
const EVENTS_URL = `${BASE_URL}/Kultur-Freizeit/Freizeit/Veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/Politik-Verwaltung/Amtliche-Informationen/Amtsblatt-Kleinmachnow/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanShortDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// Advantic CMS news:
// <a href="/Kleinmachnow/Aktuelles/slug.php?object=tx,3692.5.1&ModID=7&FID=3692.ID.1&...">
//   <h3>Title</h3>
//   <p>Datum: DD.MM.YYYY</p>
// </a>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="(\/Kleinmachnow\/Aktuelles\/[^"]+FID=3692\.(\d+)\.1[^"]+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const fid = m[2]!;
    const id = `kleinmachnow-news-${fid}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const body = m[3]!;
    const titleMatch = body.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const dateMatch = body.match(/Datum:\s*(\d{2}\.\d{2}\.\d{4})/);
    const publishedAt = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;

    items.push({ id, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Advantic CMS events:
// <a href="/Kultur-Freizeit/Freizeit/Veranstaltungen/slug.php?object=tx,3692.4.1&ModID=11&FID=3692.ID.1&...">
//   <h3>Title</h3>
//   <p>Datum: DD.MM.YYYY</p>
//   <p>Uhrzeit: HH:MM bis HH:MM Uhr</p>
// </a>
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="(\/Kultur-Freizeit\/Freizeit\/Veranstaltungen\/[^"]+FID=3692\.(\d+)\.1[^"]+)"[^>]*>([\s\S]{0,800}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const fid = m[2]!;
    const id = `kleinmachnow-event-${fid}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const body = m[3]!;
    const titleMatch = body.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const dateMatch = body.match(/Datum:\s*(\d{2}\.\d{2}\.\d{4})/);
    if (!dateMatch) continue;
    const startDate = parseGermanShortDate(dateMatch[1]!);

    const timeMatch = body.match(/Uhrzeit:\s*(\d{2}:\d{2})/);
    const startDateTime = timeMatch ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`) : startDate;

    events.push({ id, title, url: `${BASE_URL}${href}`, startDate: startDateTime, fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// Advantic CMS amtsblatt:
// "Amtsblatt NUMBER vom DATE" + <a href="/output/download.php?fid=3692.ID.1.PDF">
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /Amtsblatt\s+(\d+)\s+vom\s+(\d{1,2}\.\d{1,2}\.\d{4})([\s\S]{0,300}?)href="(\/output\/download\.php\?fid=3692\.[^"]+\.PDF)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const numRaw = m[1]!;
    const dateStr = m[2]!;
    const href = m[4]!;

    // Extract year from date: DD.M.YYYY or DD.MM.YYYY
    const dateParts = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!dateParts) continue;
    const year = dateParts[3]!;
    const month = dateParts[2]!.padStart(2, "0");
    const day = dateParts[1]!.padStart(2, "0");
    const num = numRaw.padStart(2, "0");
    const id = `kleinmachnow-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: `${BASE_URL}${href}`,
      publishedAt: `${year}-${month}-${day}T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
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
assertAllowed(robots, ["/Kleinmachnow/", "/Kultur-Freizeit/", "/Politik-Verwaltung/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
