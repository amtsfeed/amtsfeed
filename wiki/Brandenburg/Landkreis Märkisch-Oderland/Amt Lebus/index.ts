#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-lebus.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "")
    .replace(/&amp;amp;/g, "&")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&acute;/g, "´").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA variant: <div class="row events-entry-3">
// Date: <time class="events-entry-3-time" datetime="YYYY-MM-DD">
// Title: <h2 class="legacy_h5 events-entry-3-headline"><a href="URL">TITLE</a></h2>
// Location: <p class="events-entry-3-location"><a href="...">LOC</a></p>
// ID from URL: /veranstaltungen/ID/YYYY/MM/DD/slug.html

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s+class="row events-entry-3")/)
    .filter((b) => b.includes('class="row events-entry-3"'));

  for (const block of blocks) {
    const dateMatch = block.match(/<time\s+class="events-entry-3-time"\s+datetime="(\d{4}-\d{2}-\d{2})"/);
    if (!dateMatch) continue;
    const isoDate = dateMatch[1]!;

    const linkMatch = block.match(/<h2[^>]*events-entry-3-headline[^>]*>\s*<a\s+href="([^"]+)"/i);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;

    const idMatch = href.match(/\/veranstaltungen\/(\d+)\//);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleMatch = block.match(/<h2[^>]*events-entry-3-headline[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const locationMatch = block.match(/<p\s+class="events-entry-3-location">([\s\S]*?)<\/p>/i);
    const location = locationMatch
      ? decodeHtmlEntities((locationMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    const teaserMatch = block.match(/<p\s+class="tiny_p events-entry-3-teaser">([\s\S]*?)<\/p>/i);
    const description = teaserMatch
      ? decodeHtmlEntities((teaserMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({
      id,
      title,
      url,
      startDate: `${isoDate}T00:00:00.000Z`,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// PortUNA: <li class="news-entry-to-limit">
// Title: <h4 class="h4link"><a href="/news/1/ID/...">TITLE</a></h4>
// Date from: <p class="vorschau">DD.MM.YYYY: TEXT</p> (with &#8203; zero-width spaces)

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit")/)
    .filter((b) => b.includes('class="news-entry-to-limit"'));

  for (const block of blocks) {
    const titleMatch = block.match(/<h4[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const id = idMatch ? idMatch[1]! : href;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const vorschauMatch = block.match(/<p\s+class="vorschau">([\s\S]*?)<\/p>/i);
    let publishedAt: string | undefined;
    let description: string | undefined;
    if (vorschauMatch) {
      const text = decodeHtmlEntities((vorschauMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
      const dateMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4}):\s*/);
      if (dateMatch) {
        publishedAt = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
        description = text.slice(dateMatch[0].length).trim() || undefined;
      } else {
        description = text || undefined;
      }
    }

    items.push({
      id,
      title,
      url,
      ...(description ? { description } : {}),
      fetchedAt: now,
      ...(publishedAt ? { publishedAt } : {}),
      updatedAt: now,
    });
  }

  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────

function extractAmtsblatt(html: string, listingUrl: string, idPrefix: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>Nr\.\s*(\d+)\/(\d{4})<\/td>\s*<td>([\d.&#;]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[1]!.padStart(2, "0");
    const year = m[2]!;
    const dateStr = m[3]!.replace(/&#\d+;/g, "");
    const dateParts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    items.push({
      id: `${idPrefix}-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: listingUrl,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Notices ───────────────────────────────────────────────────────────────────
// PortUNA new layout: <tr><td valign="top">DD.MM.YYYY</td><td valign="top">Title</td>
//   <td valign="top"><a href="https://daten.verwaltungsportal.de/...">...</a></td></tr>

function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRx = /<tr>\s*<td\s+valign="top">\s*([\d.&#;]+)\s*<\/td>\s*<td\s+valign="top">([\s\S]*?)<\/td>\s*<td\s+valign="top">([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html)) !== null) {
    const dateStr = m[1]!.replace(/&#8203;/g, "");
    const dateParts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const publishedAt = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;

    const titleRaw = (m[2] ?? "").replace(/<p\s+class="mandate"[^>]*>[\s\S]*?<\/p>/gi, "");
    const title = decodeHtmlEntities(titleRaw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!title) continue;

    const downloadCell = m[3]!;
    const linkMatch = downloadCell.match(/href="([^"]+)"/);
    const href = linkMatch ? linkMatch[1]! : NOTICES_URL;

    const tokenMatch = href.match(/\/publicizing\/([^/]+\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/[^.]+)/);
    const id = tokenMatch
      ? `amt-lebus-notice-${tokenMatch[1]!.replace(/\//g, "")}`
      : `amt-lebus-notice-${publishedAt.slice(0, 10)}-${encodeURIComponent(title).slice(0, 40)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url: href, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, { ...n, fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

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
  return [...byId.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/index.php", "/news/1", "/amtsblatt/index.php", "/bekanntmachungen/index.php"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const existingNotices = loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml, AMTSBLATT_URL, "lebus"));
const mergedNotices = mergeNotices(existingNotices.items, extractNotices(noticesHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
