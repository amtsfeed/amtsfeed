#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewsFile, NewsItem, AmtsblattFile, AmtsblattItem, EventsFile, Event } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.muehlenbecker-land.de";
const NEWS_RSS_URL = "https://exchange.cmcitymedia.de/muehlenbeckerland/rssNews.php";
const AMTSBLATT_URL = `${BASE_URL}/de/politik-satzungen/aktuelles-aus-politischen-gremien-und-behoerden`;
const EVENTS_PAGE_URL = (page: number) =>
  page === 1
    ? `${BASE_URL}/veranstaltungskalender`
    : `${BASE_URL}/index.php?id=20&publish%5Bp%5D=20&publish%5Bstart%5D=${page}`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── News ──────────────────────────────────────────────────────────────────────
// TYPO3 RSS feed

function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const block of xml.split("<item>").slice(1)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);

    if (!titleMatch || !linkMatch) continue;
    const url = linkMatch[1]!.trim();
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    if (!title || !url) continue;

    const rawId = guidMatch ? guidMatch[1]!.trim() : url;
    const numericId = rawId.match(/(\d+)/)?.[1];
    const id = numericId ? `muehlenbecker-land-news-${numericId}` : `muehlenbecker-land-news-${encodeURIComponent(url).slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let publishedAt: string | undefined;
    if (pubDateMatch) {
      try { publishedAt = new Date(pubDateMatch[1]!.trim()).toISOString(); } catch { /* ignore */ }
    }

    items.push({ id, title, url, ...(publishedAt ? { publishedAt } : {}), fetchedAt: now, updatedAt: now });
  }

  return items;
}

// ── Events ────────────────────────────────────────────────────────────────────
// cmcitymedia TYPO3 calendar: events in <div class="list"> blocks.
// ID from <a id="event{ID}">, title from <div class="headline">, date from timeBlock strong,
// time "um HH:MM Uhr", location from <div class="location">.
// URL: exchange.cmcitymedia.de/muehlenbeckerland/veranstaltungenIcal.php?id={ID} (no HTML deeplink).

const CM_ICAL_BASE = "https://exchange.cmcitymedia.de/muehlenbeckerland/veranstaltungenIcal.php?id=";

const GERMAN_MONTHS_CAL: Record<string, string> = {
  Januar: "01", Februar: "02", März: "03", April: "04", Mai: "05", Juni: "06",
  Juli: "07", August: "08", September: "09", Oktober: "10", November: "11", Dezember: "12",
};

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const blocks = html.split('<div class="list">').slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/<a\s+id="event(\d+)"/);
    if (!idMatch) continue;
    const eventId = idMatch[1]!;
    if (seen.has(eventId)) continue;
    seen.add(eventId);

    const titleMatch = block.match(/<div class="headline">([\s\S]*?)<\/div>/);
    const title = decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const dateText = block.match(/<strong>[\s\S]*?den\s+(\d{1,2})\.\s+([A-Za-zÀ-ɏ]+)\s+(\d{4})/);
    if (!dateText) continue;
    const dd = dateText[1]!.padStart(2, "0");
    const mm = GERMAN_MONTHS_CAL[dateText[2]!] ?? "01";
    const yyyy = dateText[3]!;

    const timeMatch = block.match(/um\s+(\d{2}:\d{2})\s+Uhr/);
    const startDate = timeMatch
      ? `${yyyy}-${mm}-${dd}T${timeMatch[1]}:00.000Z`
      : `${yyyy}-${mm}-${dd}T00:00:00.000Z`;

    const ortMatch = block.match(/<div class="location">[^<]*<strong>[^<]*<\/strong>\s*([\s\S]*?)<\/div>/);
    const location = ortMatch ? decodeHtmlEntities(ortMatch[1]!.trim()) : undefined;

    events.push({
      id: `muehlenbecker-land-event-${eventId}`,
      title,
      url: `${CM_ICAL_BASE}${eventId}`,
      startDate,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin with "vom DD.MM.YYYY" after link text in <li>:
// <li><a href="/fileadmin/.../Amtsblaetter/YYYY/FILENAME.pdf" ...>Amtsblatt Nr. NN/YYYY</a> vom DD.MM.YYYY</li>

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  // Match link followed by "vom DD.MM.YYYY" (possibly with &nbsp;)
  const rx = /<a\s+href="(\/fileadmin\/[^"]*Amtsblaetter\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>(?:[\s&nbsp;]*|&nbsp;)vom\s+(\d{2})\.(\d{2})\.(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1]!;
    const linkText = decodeHtmlEntities((m[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!linkText.includes("Amtsblatt")) continue;

    // ID from filename
    const filename = href.split("/").pop()!.replace(".pdf", "");
    const id = `muehlenbecker-land-amtsblatt-${filename.slice(0, 60)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const publishedAt = `${m[5]}-${m[4]}-${m[3]}T00:00:00.000Z`;
    const url = `${BASE_URL}${href}`;
    items.push({ id, title: linkText, url, publishedAt, fetchedAt: now });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function mergeAmtsblatt(existing: AmtsblattItem[], incoming: AmtsblattItem[]): AmtsblattItem[] {
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, { ...a, fetchedAt: byId.get(a.id)?.fetchedAt ?? a.fetchedAt });
  return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/de/aktuelles-beteiligung/", "/de/", "/veranstaltungskalender"]);

const headers = { "User-Agent": AMTSFEED_UA };

async function fetchEventPages(): Promise<Event[]> {
  let all: Event[] = [];
  for (let page = 1; page <= 8; page++) {
    const html = await fetch(EVENTS_PAGE_URL(page), { headers }).then((r) => r.ok ? r.text() : "");
    const items = extractEvents(html);
    if (items.length === 0) break;
    all = all.concat(items);
  }
  return all;
}

const [rssXml, amtsblattHtml, incomingEvents] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${AMTSBLATT_URL}`); return r.text(); }),
  fetchEventPages(),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(rssXml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:      ${mergedNews.length} Einträge → ${newsPath}`);

const amtsblattPath = join(DIR, "amtsblatt.json");
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));
console.log(`amtsblatt: ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, incomingEvents);
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
console.log(`events:    ${mergedEvents.length} Einträge → ${eventsPath}`);
