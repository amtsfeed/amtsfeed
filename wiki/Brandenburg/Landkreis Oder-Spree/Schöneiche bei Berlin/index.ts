#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.schoeneiche.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungskalender`;
const NEWS_URL = `${BASE_URL}/rathaus/pressemitteilungen`;
const AMTSBLATT_URL = `${BASE_URL}/rathaus/informationen/amtsblatt`;
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

// ── Events ────────────────────────────────────────────────────────────────────
// Contao CMS: <div class="date-item">
//   <div class="date-time"><span class="day">DD.MM.YYYY</span><span class="time">HH:MM Uhr</span></div>
//   <div class="date-details"><strong>Title</strong></div>
//   <a href="/freizeit/..." class="full-link"></a>
// </div>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div class="date-item">)/)
    .filter((b) => /class="date-item"/.test(b));

  for (const block of blocks) {
    const dayMatch = block.match(/<span class="day">(\d{2}\.\d{2}\.\d{4})<\/span>/);
    if (!dayMatch) continue;
    const startDate = parseGermanShortDate(dayMatch[1]!);

    const timeMatch = block.match(/<span class="time">(\d{2}:\d{2})/);
    const startDateTime = timeMatch
      ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`)
      : startDate;

    const titleMatch = block.match(/<strong>([^<]+)<\/strong>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    const linkMatch = block.match(/href="(\/[^"]+)"[^>]*class="full-link"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;

    const slugMatch = href.match(/\/([^/]+)$/);
    const id = slugMatch ? `schoeneiche-event-${slugMatch[1]!}` : href;

    events.push({
      id,
      title,
      url: `${BASE_URL}${href}`,
      startDate: startDateTime,
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Contao: <p>DD.MM.YYYY <a href="/files/uploads/.../PM...pdf">Title</a></p>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const rx = /<p>(\d{2}\.\d{2}\.\d{4})\s+<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const publishedAt = parseGermanShortDate(m[1]!);
    const href = m[2]!;
    const title = decodeHtmlEntities(m[3]!.trim());
    if (!title) continue;

    const slugMatch = href.match(/\/([^/]+)\.pdf/i);
    const id = slugMatch ? `schoeneiche-news-${slugMatch[1]!.replace(/%[0-9a-f]{2}/gi, "").replace(/\s+/g, "-").slice(0, 60)}` : href;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    items.push({
      id,
      title,
      url,
      fetchedAt: now,
      publishedAt,
      updatedAt: now,
    });
  }
  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Contao: <a href="/files/.../Amtsblatt...pdf">Amtsblatt Nr. N vom DD.MM.YYYY</a>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<a href="(\/files\/uploads\/[^"]*\.pdf[^"]*)"[^>]*>Amtsblatt Nr\.\s*(\d+)\s+vom\s+(\d{2}\.\d{2}\.\d{4})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const num = m[2]!.padStart(2, "0");
    const publishedAt = parseGermanShortDate(m[3]!);
    const year = m[3]!.slice(6); // YYYY from DD.MM.YYYY
    items.push({
      id: `schoeneiche-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: `${BASE_URL}${href}`,
      publishedAt,
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
  return [...byId.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

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
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungskalender", "/rathaus/", "/files/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
