#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Milower Land (PortUNA / VerwaltungsPortal CMS).
 * https://www.milow.de
 *
 * News:             /news/1                          — news-entry-to-limit (PortUNA Standard, kein eigenes Datumselement)
 * Events:           /veranstaltungen/index.php       — event-entry-new-1 (PortUNA-Variante mit URL-Datum)
 * Amtsblatt:        /amtsblatt/index.php             — Tabelle Nr./Datum/Form mit gazette_ID (POST-Download)
 * Bekanntmachungen: /bekanntmachungen/index.php      — table-title-Variante (PortUNA)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "milower-land";
const BASE_URL = "https://www.milow.de";
const NEWS_URL = `${BASE_URL}/news/1`;
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const AMTSBLATT_URL = `${BASE_URL}/amtsblatt/index.php`;
const NOTICES_URL = `${BASE_URL}/bekanntmachungen/index.php`;
// Zusätzliche Bekanntmachungen aus ALLRIS net (Ratsinformationssystem, ISO-8859-1)
const ALLRIS_BASE = "https://ratsinfo-online.net/milowerland-bi";
const ALLRIS_NOTICES_URL = `${ALLRIS_BASE}/do011_x.asp`;
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
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li\s+class="news-entry-to-limit)/).filter((b) => b.includes("news-entry-to-limit"));
  for (const block of blocks) {
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

    // Variante A: <p class="vorschau">DD.MM.YYYY: TEXT</p>
    const vorschauMatch = block.match(/<p\s+class="vorschau(?:_text)?"[^>]*>([\s\S]*?)<\/p>/i);
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
// PortUNA event-entry-new-1: Datum aus URL-Pfad /veranstaltungen/ID/YYYY/MM/DD/slug.html
function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div[^>]*class="[^"]*event-entry-new-1")/).filter((b) => b.includes("event-entry-new-1-content"));
  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/[^"]+)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const eventId = linkMatch[2]!;
    const yyyy = linkMatch[3]!;
    const mm = linkMatch[4]!;
    const dd = linkMatch[5]!;
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const url = `${BASE_URL}${href}`;

    const id = `${SLUG}-event-${eventId}-${yyyy}${mm}${dd}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const titleMatch = block.match(/<h[1-6][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = stripTags(titleMatch?.[1] ?? "");
    if (!title || title === "mehr") continue;

    const daytimeMatch = block.match(/event-entry-new-1-daytime[^>]*>([\s\S]*?)<\/div>/i);
    let startDate = `${isoDate}T00:00:00.000Z`;
    if (daytimeMatch) {
      const t = [...(daytimeMatch[1] ?? "").matchAll(/<time>(\d{1,2}:\d{2})<\/time>/g)].map((m) => m[1]!);
      if (t[0]) startDate = `${isoDate}T${t[0].padStart(5, "0")}:00.000Z`;
    }

    const locationMatch = block.match(/event-entry-new-1-location[^>]*>([\s\S]*?)<\/div>/i);
    const location = locationMatch ? stripTags(locationMatch[1] ?? "") || undefined : undefined;

    const teaserMatch = block.match(/event-entry-new-1-teaser[^>]*>([\s\S]*?)<\/div>/i);
    const description = teaserMatch ? stripTags(teaserMatch[1] ?? "") || undefined : undefined;

    items.push({ id, title, url, startDate, ...(location ? { location } : {}), ...(description ? { description } : {}), fetchedAt: now, updatedAt: now });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Tabelle: <td>Nr. N/YYYY</td><td>DD.MM.YYYY</td><td><form ...gazette_ID...>
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRe = /<td[^>]*>\s*(Nr\.\s*[^<]+?)\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const nrText = stripTags(m[1] ?? "");
    const dateRaw = m[2] ?? "";
    const formBlock = m[3] ?? "";
    if (!nrText.startsWith("Nr.")) continue;
    const publishedAt = parseGermanDate(decodeHtmlEntities(dateRaw));
    if (!publishedAt) continue;

    const gazetteMatch = formBlock.match(/gazette_(\d+)/);
    if (!gazetteMatch) continue;
    const gazetteId = gazetteMatch[1]!;

    const id = `${SLUG}-amtsblatt-${gazetteId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title: `Amtsblatt ${nrText}`, url: `${AMTSBLATT_URL}#gazette_${gazetteId}`, publishedAt, fetchedAt: now });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Bekanntmachungen ──────────────────────────────────────────────────────────
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

// ── Bekanntmachungen (ALLRIS net / RatsInfo) ──────────────────────────────────
// Tabellenzeile pro Sitzung: DOLFDNR (PDF-ID), Datum, optional TO-Button, Titel
function extractNoticesFromAllris(html: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rowRe = /<tr[^>]*class="zl1\d"[\s\S]*?<input[^>]+name="DOLFDNR"[^>]+value="(\d+)"[\s\S]*?(\d{2}\.\d{2}\.\d{4})[\s\S]*?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const dolfdnr = m[1]!;
    const dm = m[2]!.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dm) continue;
    const publishedAt = `${dm[3]}-${dm[2]}-${dm[1]}T00:00:00.000Z`;
    // Titel: letzte td-Zelle der Zeile
    const block = m[0]!;
    const tdCells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]!);
    const titleRaw = tdCells[tdCells.length - 1] ?? "";
    const title = stripTags(titleRaw);
    if (!title) continue;
    const id = `${SLUG}-allris-notice-${dolfdnr}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Bekanntmachung: ${title}`,
      url: `${ALLRIS_BASE}/do027.asp?DOLFDNR=${dolfdnr}&options=64`,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

async function fetchAllris(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers });
  if (!r.ok) return "";
  const bytes = Buffer.from(await r.arrayBuffer());
  return new TextDecoder("iso-8859-1").decode(bytes);
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
const [newsHtml, eventsHtml, amtsblattHtml, noticesHtml, allrisHtml] = await Promise.all([
  fetch(NEWS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(NOTICES_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetchAllris(ALLRIS_NOTICES_URL, headers),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsHtml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));
const incomingNotices = [...extractNotices(noticesHtml), ...extractNoticesFromAllris(allrisHtml)];
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, incomingNotices);

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
