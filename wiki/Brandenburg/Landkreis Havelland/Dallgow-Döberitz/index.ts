#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Dallgow-Döberitz (PortUNA / VerwaltungsPortal CMS).
 * https://www.dallgow.de
 *
 * News:             /news/1                          — news-entry-to-limit, vorschau_text mit DD.MM.YYYY-Prefix
 * Events:           /veranstaltungen/index.php       — events-entry-3 (PortUNA-Variante)
 * Amtsblatt:        /amtsblatt/index.php             — gazette-tab (PortUNA-Variante)
 * Bekanntmachungen: /bekanntmachungen/index.php      — table-title-Variante (PortUNA)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "dallgow-doeberitz";
const BASE_URL = "https://www.dallgow.de";
const NEWS_URL = `${BASE_URL}/news/1`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
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

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseGermanDate(raw: string): string | null {
  const s = raw.replace(/&#8203;/g, "").replace(/​/g, "").trim();
  const m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
}

// ── News ──────────────────────────────────────────────────────────────────────
// <li class="news-entry-to-limit ..."><h3><a href="/news/{rubrik}/{id}/...">TITLE</a></h3>
//   <p class="vorschau_text">DD.&#8203;MM.&#8203;YYYY: TEXT [<a>mehr</a>]</p>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit)/).filter((b) => b.includes("news-entry-to-limit"));
  for (const block of blocks) {
    // Title link – prefer the one inside <h3>/<h4>
    const titleMatch = block.match(/<h[1-6][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = stripTags(titleMatch[2] ?? "");
    if (!title) continue;

    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const id = `${SLUG}-news-${idMatch ? idMatch[1] : encodeURIComponent(href).slice(0, 50)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    let publishedAt: string | undefined;
    let description: string | undefined;
    const vorschauMatch = block.match(/<p\s+class="vorschau_text">([\s\S]*?)<\/p>/i);
    if (vorschauMatch) {
      const text = stripTags(vorschauMatch[1] ?? "").replace(/\s*\[\s*mehr\s*\]\s*$/i, "").trim();
      const dateMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4}):\s*/);
      if (dateMatch) {
        publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
        description = text.slice(dateMatch[0].length).trim() || undefined;
      } else {
        description = text || undefined;
      }
    }

    items.push({ id, title, url, ...(description ? { description } : {}), ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA events-entry-3: <div class="row events-entry-3">
//   <time class="events-entry-3-time" datetime="YYYY-MM-DD">
//   <h2/h3 class="... events-entry-3-headline"><a href="/veranstaltungen/ID/YYYY/MM/DD/slug.html">TITLE</a>
//   <p class="events-entry-3-location">
//   <p class="tiny_p events-entry-3-teaser">
function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s+class="row events-entry-3")/).filter((b) => b.includes('class="row events-entry-3"'));
  for (const block of blocks) {
    const dateMatch = block.match(/<time\s+class="events-entry-3-time"\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    const linkMatch = block.match(/<h[1-6][^>]*events-entry-3-headline[^>]*>\s*<a\s+href="([^"]+)"/i);
    if (!dateMatch || !linkMatch) continue;
    const isoDate = dateMatch[1]!;
    const href = linkMatch[1]!;

    const idMatch = href.match(/\/veranstaltungen\/(\d+)\//);
    if (!idMatch) continue;
    const id = `${SLUG}-event-${idMatch[1]}-${isoDate.replace(/-/g, "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleMatch = block.match(/<h[1-6][^>]*events-entry-3-headline[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = stripTags(titleMatch?.[1] ?? "");
    if (!title) continue;

    const locationMatch = block.match(/<p\s+class="events-entry-3-location"[^>]*>([\s\S]*?)<\/p>/i);
    const location = locationMatch ? stripTags(locationMatch[1] ?? "") || undefined : undefined;

    const teaserMatch = block.match(/<p\s+class="[^"]*events-entry-3-teaser[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = teaserMatch ? stripTags(teaserMatch[1] ?? "") || undefined : undefined;

    items.push({
      id, title, url,
      startDate: `${isoDate}T00:00:00.000Z`,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// PortUNA gazette-tab: <article class="gazette-tab ..."><time datetime="YYYY-MM-DD">...
//   <h3 class="legacy_h4">Ausgabe Nr. N/YYYY</h3>
//   <form action="/amtsblatt/index.php#gazette_{ID}" ...>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<article\s+class="gazette)/).filter((b) => b.includes('class="gazette'));
  for (const block of blocks) {
    const timeMatch = block.match(/<time\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const gazMatch = block.match(/gazette_(\d+)/);
    if (!timeMatch || !titleMatch || !gazMatch) continue;
    const title = stripTags(titleMatch[1] ?? "");
    if (!title.toLowerCase().startsWith("ausgabe")) continue;

    const gazetteId = gazMatch[1]!;
    const id = `${SLUG}-amtsblatt-${gazetteId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt ${title}`,
      url: `${AMTSBLATT_URL}#gazette_${gazetteId}`,
      publishedAt: `${timeMatch[1]}T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Bekanntmachungen ──────────────────────────────────────────────────────────
// <tr valign="top"><td class="table-title">DD.&#8203;MM.&#8203;YYYY</td><td width="66%">TITLE</td><td><a href="...pdf">...</a></td></tr>
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRe = /<tr[^>]*>\s*<td[^>]*class="table-title"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>(?:\s*<td[^>]*>([\s\S]*?)<\/td>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const publishedAt = parseGermanDate(stripTags(m[1] ?? ""));
    if (!publishedAt) continue;

    const titleCell = m[2] ?? "";
    const downloadCell = m[3] ?? "";

    const title = stripTags(titleCell);
    if (!title) continue;

    const linkMatch = downloadCell.match(/<a[^>]+href="([^"]+)"/i) ?? titleCell.match(/<a[^>]+href="([^"]+)"/i);
    const href = linkMatch ? linkMatch[1]! : NOTICES_URL;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const id = `${SLUG}-notice-${publishedAt.slice(0, 10)}-${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
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
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/", "/veranstaltungen/", "/amtsblatt/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
