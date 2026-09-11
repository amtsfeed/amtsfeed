#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

// oberkraemer.de läuft seit 2026 auf Portuna (verwaltungsportal.de) — dieselbe Plattform
// wie Calau, Großräschen & Co. Die alten Pfade (/artikel-ansicht/, /buergerservice/downloads/)
// existieren nicht mehr; die Bestandseinträge in den JSON-Dateien bleiben als Archiv liegen.
const BASE_URL = "https://www.oberkraemer.de";
const SLUG = "oberkraemer";
const NEWS_URL = `${BASE_URL}/news/index.php`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&ndash;/g, "–")
    .replace(/&bdquo;/g, "„").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&raquo;/g, "»").replace(/&#8203;/g, "").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Portuna schreibt Datumsangaben mit eingestreuten Zero-Width-Spaces: "08.&#8203;09.&#8203;2026"
function parseGermanDate(raw: string): string | null {
  const m = decodeHtmlEntities(raw).replace(/\s+/g, "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
}

// News-Archiv: <div class="row entry"> … <h3 class="title_archive_…">08.09.2026</h3> …
//              <li><a href="/news/4620/1283386/kategorie/titel.html">Titel</a></li>
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRx = /<div class="row entry">([\s\S]*?)(?=<div class="row entry">|<\/section|$)/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRx.exec(html)) !== null) {
    const body = row[1] ?? "";
    const dateMatch = body.match(/<h3[^>]*class="title_archive[^"]*"[^>]*>([\s\S]*?)<\/h3>/i);
    const publishedAt = (dateMatch && parseGermanDate(dateMatch[1] ?? "")) ?? now;

    const linkRx = /<a href="(\/news\/\d+\/(\d+)\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
    let link: RegExpExecArray | null;
    while ((link = linkRx.exec(body)) !== null) {
      const newsId = link[2]!;
      const id = `${SLUG}-news-${newsId}`;
      if (seen.has(id)) continue;
      const title = decodeHtmlEntities(stripHtml(link[3] ?? ""));
      if (!title || title === "[mehr]") continue;
      seen.add(id);
      items.push({ id, title, url: `${BASE_URL}${decodeHtmlEntities(link[1]!)}`, fetchedAt: now, publishedAt, updatedAt: now });
    }
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// Veranstaltungen: /veranstaltungen/<id>/<YYYY>/<MM>/<DD>/<slug>.html
function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a\b[^>]*href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"[^>]*>\s*(?!<img\b)([\s\S]{1,300}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const eventId = m[2]!;
    if (seen.has(eventId)) continue;
    const title = decodeHtmlEntities(stripHtml(m[6] ?? ""));
    if (!title || title.length < 3 || title === "[mehr]") continue;
    seen.add(eventId);

    const startDate = `${m[3]}-${m[4]}-${m[5]}T00:00:00.000Z`;
    const after = html.slice(m.index, m.index + 600);
    const timeMatch = after.match(/<time[^>]*>(\d{2}:\d{2})<\/time>/i) ?? after.match(/Zeit:<\/strong>\s*(\d{2}:\d{2})/i);
    const startDateTime = timeMatch ? startDate.replace("T00:00:00.000Z", `T${timeMatch[1]}:00.000Z`) : startDate;
    const locMatch = after.match(/Ort:<\/strong>\s*([^<]+)/i);
    const location = locMatch ? decodeHtmlEntities(locMatch[1]!.trim()) : undefined;

    events.push({ id: `${SLUG}-event-${eventId}`, title, url: `${BASE_URL}${decodeHtmlEntities(m[1]!)}`, startDate: startDateTime, ...(location ? { location } : {}), fetchedAt: now, updatedAt: now });
  }
  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// Amtsblatt: <article class="gazette-tab …"><time datetime="2026-06-11">…</time>
//            <h3>Ausgabe Nr. 2/2026</h3> … name="gazette_88408"
// Der Download läuft über ein POST-Formular, es gibt also keinen direkten PDF-Link —
// verlinkt wird der Anker der Ausgabe auf der Amtsblattseite.
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<article class="gazette-tab[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const body = m[1] ?? "";
    const dateMatch = body.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/i);
    const titleMatch = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!dateMatch || !titleMatch) continue;
    const title = decodeHtmlEntities(stripHtml(titleMatch[1] ?? ""));
    if (!title) continue;

    const gazetteMatch = body.match(/gazette_(\d+)/);
    const id = `${SLUG}-amtsblatt-${gazetteMatch ? gazetteMatch[1] : dateMatch[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt ${title}`,
      url: gazetteMatch ? `${AMTSBLATT_URL}#gazette_${gazetteMatch[1]}` : AMTSBLATT_URL,
      publishedAt: `${dateMatch[1]}T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Bekanntmachungen: <td valign="top">08.09.2026</td>
//                   <td valign="top"><a … href="https://daten.verwaltungsportal.de/…pdf">Titel (pdf)</a>
//                   … <a href="/bekanntmachung/97727/slug.html">
function extractNotices(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRx = /<tr>\s*<td valign="top">([\s\S]*?)<\/td>\s*<td valign="top">([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html)) !== null) {
    const publishedAt = parseGermanDate(m[1] ?? "");
    if (!publishedAt) continue;
    const body = m[2] ?? "";

    const detailMatch = body.match(/href="(\/bekanntmachung\/(\d+)\/[^"]+)"/i);
    const pdfMatch = body.match(/href="(https?:\/\/[^"]*verwaltungsportal\.de\/[^"]+)"/i);
    const titleMatch = body.match(/<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const title = decodeHtmlEntities(stripHtml(titleMatch[1] ?? "")).replace(/\s*\((?:pdf|docx?|xlsx?)\)$/i, "");
    if (!title) continue;

    const id = `${SLUG}-notice-${detailMatch ? detailMatch[2] : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = detailMatch ? `${BASE_URL}${decodeHtmlEntities(detailMatch[1]!)}` : (pdfMatch ? decodeHtmlEntities(pdfMatch[1]!) : NOTICES_URL);
    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeById<T extends { id: string; fetchedAt?: string }>(existing: T[], incoming: T[], sort: (a: T, b: T) => number): T[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort(sort);
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/news/index.php", "/veranstaltungen/index.php", "/amtsblatt/index.php", "/bekanntmachungen/index.php"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetch(NOTICES_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NOTICES_URL}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const byDateDesc = <T extends { publishedAt: string | null }>(a: T, b: T) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");

const mergedNews = mergeById(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml), byDateDesc);
const mergedEvents = mergeById(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml), (a, b) => a.startDate.localeCompare(b.startDate));
const mergedAmtsblatt = mergeById(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml), byDateDesc);
const mergedNotices = mergeById(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml), byDateDesc);

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:   ${mergedNotices.length} Einträge → ${noticesPath}`);
