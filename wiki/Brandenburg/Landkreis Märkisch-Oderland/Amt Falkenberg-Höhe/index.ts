#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-fahoe.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const NEWS_URL = `${BASE_URL}/news/1`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/seite/374694/bekanntmachungen.html`;
const NOTICES_LISTING_URL = `${BASE_URL}/bekanntmachungen/index.php`;
// Department subpages with bekanntmachungen content
const NOTICES_SUBPAGE_IDS = [374695, 374696, 374697, 374699, 374700];
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  let s = str
    .replace(/&#8203;/g, "")  // zero-width space (used as dot separator in dates)
    .replace(/&amp;amp;/g, "&")  // double-encoded ampersand
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&acute;/g, "´").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
  return s;
}

// ── Events ────────────────────────────────────────────────────────────────────
// PortUNA variant: <div class="event-box">
// startDate from URL: /veranstaltungen/ID/YYYY/MM/DD/slug.html
// Optional time: <span class="event-time"><time>HH:MM</time> Uhr</span>

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s+class="event-box")/)
    .filter((b) => b.includes('class="event-box"'));

  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+href="([^"]*\/veranstaltungen\/[^"]+)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // ID + date from URL: /veranstaltungen/ID/YYYY/MM/DD/slug.html
    const datePathMatch = href.match(/\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (!datePathMatch) continue;
    const id = datePathMatch[1]!;
    const isoDate = `${datePathMatch[2]}-${datePathMatch[3]}-${datePathMatch[4]}`;

    const titleMatch = block.match(/<span\s+class="event-title">\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Time: <time>HH:MM</time> Uhr [bis <time>HH:MM</time> Uhr]
    const timeMatch = block.match(/<span\s+class="event-time">([\s\S]*?)<\/span>/i);
    let startDate = `${isoDate}T00:00:00.000Z`;
    let endDate: string | undefined;
    if (timeMatch) {
      const times = [...(timeMatch[1] ?? "").matchAll(/<time>(\d{2}:\d{2})<\/time>/g)].map((m) => m[1]);
      if (times[0]) startDate = `${isoDate}T${times[0]}:00.000Z`;
      if (times[1]) endDate = `${isoDate}T${times[1]}:00.000Z`;
    }

    const locationMatch = block.match(/<span\s+class="event-ort">([\s\S]*?)<\/span>/i);
    const location = locationMatch
      ? decodeHtmlEntities((locationMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    const infoMatch = block.match(/<span\s+class="event-info">([\s\S]*?)<\/span>/i);
    const description = infoMatch
      ? decodeHtmlEntities((infoMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({
      id,
      title,
      url,
      startDate,
      ...(endDate ? { endDate } : {}),
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
// Title: <h3 class="..."><a href="/news/RUBRIK/ID/slug">TITLE</a></h3>
// Date embedded in: <p class="vorschau">DD.&#8203;MM.&#8203;YYYY: TEXT</p>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit")/)
    .filter((b) => b.includes('class="news-entry-to-limit"'));

  for (const block of blocks) {
    // Title link is always inside <h3 class="...h4link">
    const titleMatch = block.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    if (!href.includes("/news/")) continue;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // ID from URL: /news/RUBRIK/ID/slug
    const idMatch = href.match(/\/news\/[^/]+\/(\d+)\//);
    const id = idMatch ? idMatch[1]! : href;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // Date from start of vorschau text: "DD.MM.YYYY: ..."
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
// PortUNA: <td>Nr. NN/YYYY</td> <td>DD.&#8203;MM.&#8203;YYYY</td>
// PDFs behind POST/CSRF → listing URL used

function extractAmtsblatt(html: string): AmtsblattItem[] {
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
      id: `falkenberg-hoehe-amtsblatt-${year}-${num}`,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: AMTSBLATT_URL,
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

// ── Notices ───────────────────────────────────────────────────────────────────
// Two sources:
// 1. PortUNA announcement-view table (bekanntmachungen/index.php):
//    <td valign="top">DD.&#8203;MM.&#8203;YYYY</td>
//    <td valign="top">TITLE</td>
//    <td valign="top"><a href="PDF_URL">TITLE (pdf)</a></td>
// 2. Seitengenerator pages (main + subpages): static HTML with direct PDF links
//    <a href="https://daten2.verwaltungsportal.de/dateien/seitengenerator/HASH/FILENAME.pdf" title="TITLE">LABEL</a>
// ID for type 1: publicizing numeric path token
// ID for type 2: seitengenerator filename

function extractNoticesFromTable(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Three-column table: date | title | download link
  // Date format: DD.&#8203;MM.&#8203;YYYY (dots with zero-width space entities between groups)
  const rx = /<td[^>]*valign="top">\s*(\d{2})\.&#8203;(\d{2})\.&#8203;(\d{4})\s*<\/td>\s*<td[^>]*valign="top">\s*([\s\S]*?)\s*<\/td>\s*<td[^>]*valign="top">([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const titleCell = decodeHtmlEntities((m[4] ?? "").replace(/<[^>]+>/g, "").trim());
    const downloadCell = m[5]!;
    const linkMatch = downloadCell.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

    let url = NOTICES_LISTING_URL;
    if (linkMatch) url = linkMatch[1]!;

    const title = titleCell || decodeHtmlEntities((linkMatch?.[2] ?? "").replace(/<[^>]+>/g, "").replace(/\s*\(pdf\)\s*$/i, "").trim());
    if (!title) continue;

    const pathMatch = url.match(/\/publicizing\/([\d/]+)\//);
    const pathId = pathMatch ? pathMatch[1]!.replace(/\//g, "") : undefined;
    const id = pathId ? `amt-falkenberg-hoehe-notice-${pathId}` : `amt-falkenberg-hoehe-notice-${encodeURIComponent(title).slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items;
}

function extractNoticesFromPage(html: string, _pageUrl: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Extract direct PDF links from seitengenerator pages
  const rx = /<a[^>]+href="(https?:\/\/daten2?\.verwaltungsportal\.de\/dateien\/seitengenerator\/[^"]+\.pdf)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!;
    // Prefer link text content over title attribute
    const linkText = decodeHtmlEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim());
    const titleAttr = decodeHtmlEntities(m[2]!.trim());
    const title = linkText || titleAttr;
    if (!title) continue;

    // ID from filename
    const fnMatch = url.match(/\/([^/]+\.pdf)$/i);
    const fn = fnMatch ? fnMatch[1]!.replace(/\.pdf$/i, "") : undefined;
    const id = fn ? `amt-falkenberg-hoehe-notice-${fn.slice(0, 60)}` : `amt-falkenberg-hoehe-notice-${encodeURIComponent(title).slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // No date available on these pages, use today
    const publishedAt = new Date().toISOString().split("T")[0]! + "T00:00:00.000Z";
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items;
}

function mergeNotices(existing: NoticeItem[], incoming: NoticeItem[]): NoticeItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, {
    ...n,
    fetchedAt: byId.get(n.id)?.fetchedAt ?? n.fetchedAt,
    publishedAt: byId.get(n.id)?.publishedAt ?? n.publishedAt,
  });
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
assertAllowed(robots, ["/veranstaltungen/index.php", "/news/1", "/amtsblatt/", "/seite/", "/bekanntmachungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsHtml, amtsblattHtml, noticesListingHtml, noticesMainHtml, ...noticesSubHtmls] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_LISTING_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  ...NOTICES_SUBPAGE_IDS.map((id) =>
    fetch(`${BASE_URL}/seite/${id}/`, { headers }).then((r) => r.ok ? r.text() : "")
  ),
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
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

// Combine notices from listing table + main page + all subpages
const incomingNotices = [
  ...extractNoticesFromTable(noticesListingHtml),
  ...extractNoticesFromPage(noticesMainHtml, NOTICES_URL),
  ...(noticesSubHtmls as string[]).flatMap((html, i) =>
    extractNoticesFromPage(html, `${BASE_URL}/seite/${NOTICES_SUBPAGE_IDS[i]}/`)
  ),
];
const mergedNotices = mergeNotices(existingNotices.items, incomingNotices);

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices } satisfies NoticesFile, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
