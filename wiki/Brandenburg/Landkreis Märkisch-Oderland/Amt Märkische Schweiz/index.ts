#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.amt-maerkische-schweiz.de";
const EVENTS_URL = `${BASE_URL}/tourismus/veranstaltungen/`;
const NEWS_URL = `${BASE_URL}/portal/meldungen/uebersicht-0-34490.html?titel=Aktuelle+Meldungen`;
const AMTSBLATT_BASE = `${BASE_URL}/verwaltung/amtsblatt/amtsblatt-`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// NOLIS CMS: each event has <a name="terminanker_ID"> anchor.
// Date in <span class="manager_untertitel">:
//   "Di., 05.05.2026, 09:00 - 10:00 Uhr"  → point event with optional time range
//   " läuft bis zum Di., 30.06.2026"       → ongoing exhibition; use that date as startDate

function parseUntertitel(raw: string): { startDate: string; endDate?: string } {
  const text = decodeHtmlEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const dateMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!dateMatch) return { startDate: new Date().toISOString() };
  const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  if (text.includes("läuft bis zum")) {
    return { startDate: `${isoDate}T00:00:00.000Z` };
  }

  const times = [...text.matchAll(/(\d{2}:\d{2})/g)].map((m) => m[1]);
  const startDate = times[0] ? `${isoDate}T${times[0]}:00.000Z` : `${isoDate}T00:00:00.000Z`;
  const endDate = times[1] ? `${isoDate}T${times[1]}:00.000Z` : undefined;
  return { startDate, ...(endDate ? { endDate } : {}) };
}

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<a\s+name="terminanker_\d+")/)
    .filter((b) => /name="terminanker_\d+"/.test(b));

  for (const block of blocks) {
    const idMatch = block.match(/name="terminanker_(\d+)"/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+title="Detailseite"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titleMatch = block.match(/<span\s+class="manager_titel"[^>]*title="([^"]+)"/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1]!.trim());
    if (!title) continue;

    // manager_untertitel may have extra attrs (style=); capture content incl. nested span_enduhrzeit
    // by matching up to </span></span> (untertitel close + parent manager_titel_container close)
    const untertitelMatch = block.match(/<span\s[^>]*class="manager_untertitel[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/);
    const { startDate, endDate } = untertitelMatch
      ? parseUntertitel(untertitelMatch[1] ?? "")
      : { startDate: now };

    events.push({
      id,
      title,
      url,
      startDate,
      ...(endDate ? { endDate } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// NOLIS CMS: nolis-list-inner blocks with schema.org Article markup.
// Date: <p class="nolis-list-date">DD.MM.YYYY</p>
// Title: <h4 itemprop="name"><a href="URL">TITLE</a></h4>
// Description: <p class="nolis-list-text" itemprop="description">TEXT ...</p>

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=class="nolis-list-inner")/)
    .filter((b) => b.includes('class="nolis-list-inner"'));

  for (const block of blocks) {
    const titleMatch = block.match(/<h4[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Skip PDF-only items (no canonical news ID)
    if (href.endsWith(".pdf") || href.includes("/medien/")) continue;

    const dateMatch = block.match(/<p\s+class="nolis-list-date">(\d{2})\.(\d{2})\.(\d{4})<\/p>/);
    const publishedAt = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`
      : undefined;

    const textMatch = block.match(/<p\s+class="nolis-list-text"[^>]*>([\s\S]*?)<\/p>/i);
    const rawDesc = textMatch ? (textMatch[1] ?? "") : "";
    const description = decodeHtmlEntities(rawDesc.replace(/<[^>]+>/g, "").trim()) || undefined;

    // ID from URL: /portal/meldungen/SLUG-NUMERICALID-34490.html
    const idMatch = href.match(/-(\d+)-34490\.html/);
    const id = idMatch ? idMatch[1]! : href;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

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
// NOLIS: /verwaltung/amtsblatt/amtsblatt-{YEAR}/
// Links: <a class="link_dokument nolis-link-intern" href=".../downloads/datei/TOKEN">
// Title text: "Amtsblatt Mai 2026 (Erscheinungsdatum 30.04.2026)"
// Extract date from "Erscheinungsdatum DD.MM.YYYY" in title text

function extractAmtsblatt(html: string, year: number): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();

  const rx = /<a[^>]+class="[^"]*link_dokument[^"]*"[^>]+href="([^"]+\/downloads\/datei\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const url = m[1]!.startsWith("http") ? m[1]! : `${BASE_URL}${m[1]!}`;
    const rawText = decodeHtmlEntities((m[2] ?? "").replace(/<[^>]+>/g, " ").trim());
    if (!rawText.toLowerCase().includes("amtsblatt")) continue;

    const erschDate = rawText.match(/Erscheinungsdatum\s+(\d{2})\.(\d{2})\.(\d{4})/i);
    let publishedAt: string;
    let idYear: string;
    let monthNum: string;
    if (erschDate) {
      publishedAt = `${erschDate[3]}-${erschDate[2]}-${erschDate[1]}T00:00:00.000Z`;
      idYear = erschDate[3]!;
      monthNum = erschDate[2]!;
    } else {
      publishedAt = `${year}-01-01T00:00:00.000Z`;
      idYear = String(year);
      monthNum = "01";
    }

    items.push({
      id: `amt-maerkische-schweiz-amtsblatt-${idYear}-${monthNum}`,
      title: rawText.replace(/\s*\(Erscheinungsdatum[^)]+\)/, "").trim(),
      url,
      publishedAt,
      fetchedAt: now,
    });
  }
  return items;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, { ...i, fetchedAt: byId.get(i.id)?.fetchedAt ?? i.fetchedAt });
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
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
assertAllowed(robots, ["/tourismus/veranstaltungen/", "/portal/meldungen/", "/verwaltung/amtsblatt/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const currentYear = new Date().getFullYear();
const [eventsHtml, newsHtml, amtsblattHtml0, amtsblattHtml1] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(`${AMTSBLATT_BASE}${currentYear}/`, { headers }).then((r) => r.ok ? r.text() : ""),
  fetch(`${AMTSBLATT_BASE}${currentYear - 1}/`, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const incomingAmtsblatt = [
  ...extractAmtsblatt(amtsblattHtml0, currentYear),
  ...extractAmtsblatt(amtsblattHtml1, currentYear - 1),
];

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, incomingAmtsblatt);

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
