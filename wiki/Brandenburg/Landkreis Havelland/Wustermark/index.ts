#!/usr/bin/env tsx
/**
 * Scraper for Gemeinde Wustermark (IKISS / Advantic CMS, windows-1252-Kodierung).
 * https://www.wustermark.de
 *
 * News:             /media/rss/Meldungen_aus_Wustermark.xml — RSS-Feed (NOLIS-Variante 1-ähnlich)
 * Events:           /Verwaltung-Politik/Allgemeines/Veranstaltungen/  — IKISS result-list mit ModID=11
 * Amtsblatt:        /Verwaltung-Politik/Allgemeines/Amtsblatt/        — Accordion mit Amtsblatt-PDFs (kein konkretes Datum, nur Nr./Jahr)
 * Bekanntmachungen: /Verwaltung-Politik/Allgemeines/öffentliche-Bekanntmachungen/ — IKISS result-list mit ModID=6 (kein Datum)
 *
 * Besonderheit: HTML-Antworten in windows-1252 → TextDecoder. Bekanntmachungen liefern kein Datum
 * im HTML; wir nutzen dann das Abrufdatum als publishedAt.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem, NoticesFile, NoticeItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "wustermark";
const BASE_URL = "https://www.wustermark.de";
const NEWS_RSS_URL = `${BASE_URL}/media/rss/Meldungen_aus_Wustermark.xml`;
const EVENTS_URL = `${BASE_URL}/Verwaltung-Politik/Allgemeines/Veranstaltungen/`;
const AMTSBLATT_URL = `${BASE_URL}/Verwaltung-Politik/Allgemeines/Amtsblatt/`;
const NOTICES_URL = `${BASE_URL}/Verwaltung-Politik/Allgemeines/%C3%B6ffentliche-Bekanntmachungen/`;
const DIR = dirname(fileURLToPath(import.meta.url));

async function fetchDecoded(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  return new TextDecoder("windows-1252").decode(bytes);
}

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

// ── News (RSS, windows-1252) ──────────────────────────────────────────────────
function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1]!;
    const title = decodeHtmlEntities((body.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim());
    const link = decodeHtmlEntities((body.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim());
    const pubDate = (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim();
    const desc = decodeHtmlEntities((body.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "").trim());
    if (!title || !link) continue;

    const fidMatch = link.match(/FID=3847\.(\d+)\.1/);
    const id = `${SLUG}-news-${fidMatch ? fidMatch[1] : encodeURIComponent(link).slice(0, 40)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    items.push({
      id, title, url: link,
      ...(desc ? { description: desc } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      fetchedAt: now, updatedAt: now,
    });
  }
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ── Events (IKISS result-list, ModID=11) ──────────────────────────────────────
// <div class="result-list_object js-link" data-ikiss-mfid="11.3847.{ID}.1">
//   <a class="result-list_object-link" href="/.../slug.php?...FID=3847.{ID}.1..." title="...">
//   <time datetime="YYYY-MM-DD HH:MM:SS">DD.MM.YYYY</time>
//   Uhrzeit: HH:MM bis HH:MM Uhr
function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s+class="result-list_object js-link"\s+data-ikiss-mfid="11\.3847)/)
    .filter((b) => /data-ikiss-mfid="11\.3847\.\d+\.1"/.test(b));

  for (const block of blocks) {
    const idMatch = block.match(/data-ikiss-mfid="11\.3847\.(\d+)\.1"/);
    if (!idMatch) continue;
    const eventId = idMatch[1]!;

    const linkMatch = block.match(/<a\s+class="result-list_object-link[^"]*"\s+href="([^"]+)"[^>]*title="([^"]*)"/);
    if (!linkMatch) continue;
    const href = decodeHtmlEntities(linkMatch[1]!).replace(/&amp;/g, "&");
    const titleAttr = decodeHtmlEntities(linkMatch[2] ?? "");
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleAnchorMatch = block.match(/<a\s+class="result-list_object-link[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const title = stripTags(titleAnchorMatch?.[1] ?? "").replace(/: Datei in neuem Fenster öffnen$/, "").trim() || titleAttr;
    if (!title) continue;

    const dateMatch = block.match(/<time\s+datetime="(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?"/);
    if (!dateMatch) continue;
    let startDate = `${dateMatch[1]}T${(dateMatch[2] ?? "00")}:${(dateMatch[3] ?? "00")}:${(dateMatch[4] ?? "00")}.000Z`;

    // optional time range "HH:MM bis HH:MM"
    const rangeMatch = block.match(/(\d{2}:\d{2})\s+bis\s+(\d{2}:\d{2})/);
    let endDate: string | undefined;
    if (rangeMatch) {
      const [h1, m1] = rangeMatch[1]!.split(":");
      const [h2, m2] = rangeMatch[2]!.split(":");
      startDate = `${dateMatch[1]}T${h1}:${m1}:00.000Z`;
      endDate = `${dateMatch[1]}T${h2}:${m2}:00.000Z`;
    }

    const descMatch = block.match(/<p\s+class="descr">([\s\S]*?)<\/p>/i);
    const description = descMatch ? stripTags(descMatch[1] ?? "") || undefined : undefined;

    const id = `${SLUG}-event-${eventId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, startDate, ...(endDate ? { endDate } : {}), ...(description ? { description } : {}), fetchedAt: now, updatedAt: now });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// Accordion-Sektionen pro Jahr ("Amtsblatt 2026"), pro Eintrag:
//   <a href="/loadDocument.phtml?FID=3847.{ID}.1&Ext=PDF">Amtsblatt N der Gemeinde Wustermark aus YYYY</a>
// Es gibt kein konkretes Erscheinungsdatum; verwenden wir YYYY-01-01 als publishedAt-Fallback,
// damit RSS-Sortierung stabil bleibt.
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rx = /<a[^>]+href="(\/loadDocument\.phtml\?FID=3847\.(\d+)\.1[^"]*?)"[^>]*>\s*Amtsblatt\s+(\d+)\s+der\s+Gemeinde\s+Wustermark\s+aus\s+(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1]!).replace(/&amp;/g, "&");
    const fid = m[2]!;
    const nr = m[3]!.padStart(2, "0");
    const year = m[4]!;
    const id = `${SLUG}-amtsblatt-${year}-${nr}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      title: `Amtsblatt Nr. ${nr}/${year}`,
      url: `${BASE_URL}${href}`,
      publishedAt: `${year}-01-01T00:00:00.000Z`,
      fetchedAt: now,
    });
  }
  return items.sort((a, b) => b.id.localeCompare(a.id));
}

// ── Bekanntmachungen ──────────────────────────────────────────────────────────
// IKISS result-list ModID=6 (data-ikiss-mfid="6.3847.{ID}.1"). Kein Datum im HTML —
// publishedAt = fetchedAt damit der Datentyp NoticeItem (mit Pflicht-publishedAt) erfüllt ist.
function extractNotices(html: string, fetchedAt: string): NoticeItem[] {
  const items: NoticeItem[] = [];
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div\s+class="result-list_object js-link"\s+data-ikiss-mfid="6\.3847)/)
    .filter((b) => /data-ikiss-mfid="6\.3847\.\d+\.1"/.test(b));

  for (const block of blocks) {
    const idMatch = block.match(/data-ikiss-mfid="6\.3847\.(\d+)\.1"/);
    if (!idMatch) continue;
    const noticeId = idMatch[1]!;

    const linkMatch = block.match(/<a\s+class="result-list_object-link[^"]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const href = decodeHtmlEntities(linkMatch[1]!).replace(/&amp;/g, "&");
    const title = stripTags(linkMatch[2] ?? "").replace(/: Datei in neuem Fenster öffnen$/, "").trim();
    if (!title) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const id = `${SLUG}-notice-${noticeId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, title, url, publishedAt: fetchedAt, fetchedAt });
  }
  return items;
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
  // For notices we keep the first-seen fetchedAt/publishedAt
  for (const i of incoming) {
    const old = byId.get(i.id);
    byId.set(i.id, old ? { ...i, fetchedAt: old.fetchedAt, publishedAt: old.publishedAt } : i);
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/Verwaltung-Politik/Allgemeines/", "/media/rss/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [newsXml, eventsHtml, amtsblattHtml, noticesHtml] = await Promise.all([
  fetchDecoded(NEWS_RSS_URL, headers),
  fetchDecoded(EVENTS_URL, headers),
  fetchDecoded(AMTSBLATT_URL, headers),
  fetchDecoded(NOTICES_URL, headers),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");
const noticesPath = join(DIR, "notices.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, extractNews(newsXml));
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));
const mergedNotices = mergeNotices(loadJson<NoticesFile>(noticesPath, { updatedAt: "", items: [] }).items, extractNotices(noticesHtml, now));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
writeFileSync(noticesPath, JSON.stringify({ updatedAt: now, items: mergedNotices }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
console.log(`notices:    ${mergedNotices.length} Einträge → ${noticesPath}`);
