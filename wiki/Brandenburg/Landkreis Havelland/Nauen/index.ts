#!/usr/bin/env tsx
/**
 * Scraper for Stadt Nauen (LivingData komXcms).
 * https://www.nauen.de
 *
 * News (Amtliche Mitteilungen): /meta/amtliche-mitteilungen/
 *   - <li class="card news-item-item list-group-item ...">
 *   - URL aus <a class="news-item-item-link">
 *   - Datum: <span class="font-weight-bold">DD. Monat YYYY: </span>
 *   - Titel: <h4>...</h4>
 *   - Paginierung: ?page=N (1-N, bis Seite leer)
 *
 * Events: /leben-arbeiten/kultur/veranstaltungskalender/
 *   - <li class="events-item ...">
 *   - URL aus <a class="events-item-link">
 *   - Datum: <time itemprop="startDate" datetime="ISO">
 *   - Titel: <h4>
 *   - Ort: <span itemprop="name">
 *   - Slug-Prefix bei datierten Events: DDMMYYYY-... → Event-ID via Slug
 *
 * Amtsblatt: /politik-verwaltung/amtsblatt/
 *   - <li class="documents-item">
 *   - PDF-Link + <span>Nr. N_YYYY_Erscheinungstag DD. Monat YYYY</span>
 *
 * Bekanntmachungen: keine separate Liste — bei Nauen sind die amtlichen
 *   Mitteilungen identisch mit News, daher kein notices.json.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const SLUG = "nauen";
const BASE_URL = "https://www.nauen.de";
const NEWS_BASE = `${BASE_URL}/meta/amtliche-mitteilungen/`;
const EVENTS_URL = `${BASE_URL}/leben-arbeiten/kultur/veranstaltungskalender/`;
const AMTSBLATT_URL = `${BASE_URL}/politik-verwaltung/amtsblatt/`;
const DIR = dirname(fileURLToPath(import.meta.url));

const NEWS_MAX_PAGES = 20;

const MONTHS: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", Maerz: "03", April: "04",
  Mai: "05", Juni: "06", Juli: "07", August: "08", September: "09",
  Oktober: "10", November: "11", Dezember: "12",
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseGermanLongDate(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/(\d{1,2})\.\s*(\S+)\s+(\d{4})/);
  if (m && MONTHS[m[2]!]) {
    return `${m[3]}-${MONTHS[m[2]!]}-${m[1]!.padStart(2, "0")}T00:00:00.000Z`;
  }
  return null;
}

// ── News ──────────────────────────────────────────────────────────────────────
function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li\s+class="card news-item-item)/).filter((b) => b.includes("news-item-item-link"));
  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+class="news-item-item-link[^"]*"\s+href="([^"]+)"/i);
    const titleMatch = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!linkMatch || !titleMatch) continue;

    const href = decodeHtmlEntities(linkMatch[1]!);
    const title = stripTags(titleMatch[1] ?? "");
    if (!title) continue;

    const dateMatch = block.match(/<span\s+class="font-weight-bold"[^>]*>([\s\S]*?)<\/span>/i);
    let publishedAt: string | undefined;
    if (dateMatch) {
      const text = stripTags(dateMatch[1] ?? "").replace(/:$/, "");
      const parsed = parseGermanLongDate(text);
      if (parsed) publishedAt = parsed;
    }

    const slugMatch = href.match(/\/meta\/amtliche-mitteilungen\/([^/?#]+)/);
    const slug = slugMatch ? slugMatch[1]! : encodeURIComponent(href).slice(0, 60);
    const id = `${SLUG}-news-${slug.slice(0, 80)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Events ────────────────────────────────────────────────────────────────────
function extractEvents(html: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li\s+class="events-item)/).filter((b) => b.includes("events-item-link"));
  for (const block of blocks) {
    const linkMatch = block.match(/<a\s+class="events-item-link[^"]*"\s+href="([^"]+)"/i);
    const titleMatch = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!linkMatch || !titleMatch) continue;

    const href = decodeHtmlEntities(linkMatch[1]!);
    const title = stripTags(titleMatch[1] ?? "");
    if (!title) continue;

    // ISO Datum aus <time itemprop="startDate" datetime="YYYY-MM-DDTHH:MM+TZ">
    const startMatch = block.match(/itemprop="startDate"\s+datetime="(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?)?)"/i);
    if (!startMatch) continue;
    const startDate = new Date(startMatch[1]!).toISOString();

    const endMatch = block.match(/itemprop="endDate"\s+datetime="([^"]+)"/i);
    const endDate = endMatch ? new Date(endMatch[1]!).toISOString() : undefined;

    const locMatch = block.match(/<span\s+itemprop="name"[^>]*>([\s\S]*?)<\/span>/i);
    const location = locMatch ? stripTags(locMatch[1] ?? "") : undefined;

    const slugMatch = href.match(/\/veranstaltungskalender\/([^/?#]+)/);
    const slug = slugMatch ? slugMatch[1]! : encodeURIComponent(href).slice(0, 60);
    const id = `${SLUG}-event-${slug.slice(0, 80)}-${startDate.slice(0, 10).replace(/-/g, "")}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    items.push({
      id,
      title,
      url,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split(/(?=<li\s+class="documents-item)/).filter((b) => b.includes("documents-item") && b.includes("href="));
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]+href="([^"]+\.pdf)"/i);
    const titleMatch = block.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    if (!linkMatch || !titleMatch) continue;

    const href = decodeHtmlEntities(linkMatch[1]!);
    const titleText = stripTags(titleMatch[1] ?? "");
    if (!titleText) continue;

    // Parse "Nr. 2_2026_Erscheinungstag 20. April 2026"
    const idMatch = titleText.match(/Nr\.?\s*(\d+)[_\s/](\d{4})/i);
    const dateMatch = titleText.match(/(?:Erscheinungstag\s+)?(\d{1,2})\.\s*(\S+)\s+(\d{4})/);

    let publishedAt: string | undefined;
    if (dateMatch && MONTHS[dateMatch[2]!]) {
      publishedAt = `${dateMatch[3]}-${MONTHS[dateMatch[2]!]}-${dateMatch[1]!.padStart(2, "0")}T00:00:00.000Z`;
    } else if (idMatch) {
      // Fallback: 1. Tag des Monats des Jahres
      publishedAt = `${idMatch[2]}-01-01T00:00:00.000Z`;
    }
    if (!publishedAt) continue;

    const id = idMatch
      ? `${SLUG}-amtsblatt-${idMatch[2]}-${idMatch[1]!.padStart(2, "0")}`
      : `${SLUG}-amtsblatt-${href.split("/").pop()!.replace(/\.pdf$/i, "")}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const title = idMatch ? `Amtsblatt Nr. ${idMatch[1]}/${idMatch[2]}` : titleText;

    items.push({ id, title, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) byId.set(n.id, n);
    else {
      const old = byId.get(n.id)!;
      byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt });
    }
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

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, [
  "/meta/amtliche-mitteilungen/",
  "/leben-arbeiten/kultur/veranstaltungskalender/",
  "/politik-verwaltung/amtsblatt/",
]);

const headers = { "User-Agent": AMTSFEED_UA };

// News über alle Seiten
const allNews: NewsItem[] = [];
const seenNewsIds = new Set<string>();
for (let page = 1; page <= NEWS_MAX_PAGES; page++) {
  const url = page === 1 ? NEWS_BASE : `${NEWS_BASE}?page=${page}`;
  const r = await fetch(url, { headers });
  if (!r.ok) break;
  const html = await r.text();
  const items = extractNews(html);
  if (items.length === 0) break;
  let newOnes = 0;
  for (const it of items) {
    if (!seenNewsIds.has(it.id)) {
      seenNewsIds.add(it.id);
      allNews.push(it);
      newOnes++;
    }
  }
  if (newOnes === 0) break;
}

const [eventsHtml, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const eventsPath = join(DIR, "events.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const mergedNews = mergeNews(loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] }).items, allNews);
const mergedEvents = mergeEvents(loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] }).items, extractEvents(eventsHtml));
const mergedAmtsblatt = mergeAmtsblatt(loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] }).items, extractAmtsblatt(amtsblattHtml));

writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
