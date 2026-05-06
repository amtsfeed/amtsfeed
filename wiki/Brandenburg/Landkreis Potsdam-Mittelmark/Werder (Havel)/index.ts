#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.werder-havel.de";
const NEWS_URL = `${BASE_URL}/politik-rathaus/aktuelles/neuigkeiten.html`;
const EVENTS_URL = `${BASE_URL}/tourismus/veranstaltungen/veranstaltungskalender.html`;
const AMTSBLATT_URL = `${BASE_URL}/service/ortsrecht-werder/amtsblatt.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&ndash;/g, "–")
    .replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&#8203;/g, "").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanShortDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date().toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// Joomla news: <span class="date">DD.MM.YYYY</span>
//              <h4>Title</h4>
//              <a href="/politik-rathaus/aktuelles/neuigkeiten/CAT-ID-name/POST-ID-slug.html">
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="(\/politik-rathaus\/aktuelles\/neuigkeiten\/[^/]+-[^/]+\/(\d+)-[^"]+\.html)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const postId = m[2]!;
    if (seen.has(postId)) continue;
    seen.add(postId);

    // Title and date come AFTER the href in the same <a> block
    const context = html.slice(m.index, m.index + 600);
    const titleMatch = context.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateMatch = context.match(/<h5>[^|<]+\|\s*(\d{2}\.\d{2}\.\d{4})<\/h5>/i)
      ?? context.match(/<span[^>]*class="date"[^>]*>(\d{2}\.\d{2}\.\d{4})<\/span>/i);
    const publishedAt = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;

    items.push({ id: `werder-havel-news-${postId}`, title, url: `${BASE_URL}${href}`, fetchedAt: now, publishedAt, updatedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Joomla events calendar: <a href="/tourismus/veranstaltungen/veranstaltungskalender.html?eventid=ID">
// Date shown as "DD.MM.YYYY | HH:MM" or "Heute | HH:MM" above the heading
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="(\/tourismus\/veranstaltungen\/veranstaltungskalender\.html\?eventid=(\d+))"/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const eventId = m[2]!;
    if (seen.has(eventId)) continue;
    seen.add(eventId);

    // Look for date/title context around this link
    const context = html.slice(Math.max(0, m.index - 500), m.index + 200);

    // Date: "DD.MM.YYYY" or "Heute"
    const dateMatch = context.match(/(\d{2}\.\d{2}\.\d{4})\s*\|/);
    const startDate = dateMatch ? parseGermanShortDate(dateMatch[1]!) : now;

    // Time: "| HH:MM"
    const timeMatch = context.match(/\|\s*(\d{2}:\d{2})/);
    const startDateTime = timeMatch
      ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`)
      : startDate;

    // Title: h4 heading
    const titleMatch = context.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Location: first non-empty line after heading
    const locMatch = context.match(/class="event-ort"[^>]*>([^<]+)/i)
      ?? context.match(/(?:<\/h4>[\s\S]{0,50})([A-ZÜÄÖ][^<\n]{5,})/);
    const location = locMatch ? decodeHtmlEntities(locMatch[1]!.trim()) : undefined;

    events.push({
      id: `werder-havel-event-${eventId}`,
      title,
      url: `${BASE_URL}${href}`,
      startDate: startDateTime,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }
  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// Werder (Havel) amtsblatt: static HTML page with PDF links
// <a href="/...amtsblatt...pdf">Amtsblatt Nr. N/YYYY</a> or similar
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*Amtsblatt[^<]*)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const label = m[2]!.trim();
    const numMatch = label.match(/(\d+)\/(\d{4})/);
    if (!numMatch) continue;
    const num = numMatch[1]!.padStart(2, "0");
    const year = numMatch[2]!;
    const id = `werder-havel-amtsblatt-${year}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pdfUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    items.push({ id, title: `Amtsblatt Nr. ${num}/${year}`, url: pdfUrl, publishedAt: `${year}-01-01T00:00:00.000Z`, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
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
assertAllowed(robots, ["/politik-rathaus/", "/tourismus/", "/service/"]);

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
