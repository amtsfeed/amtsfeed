#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.glienicke.eu";
const NEWS_RSS_URL = `${BASE_URL}/portal/rss.xml`;
const KOMMUNE_ID = "22451";
const DIR = dirname(fileURLToPath(import.meta.url));

// ── News ──────────────────────────────────────────────────────────────────────
// PortUNA RSS feed at /portal/rss.xml

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8203;/g, "").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function extractNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const block of xml.split("<item>").slice(1)) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch || !linkMatch) continue;
    const url = linkMatch[1]!.trim();
    const title = decodeHtmlEntities((titleMatch[1] ?? "").trim());
    if (!title || !url) continue;

    const idMatch = url.match(/\/(\d+)\//);
    const id = idMatch ? `glienicke-news-${idMatch[1]!}` : url;
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
// NOLIS iCal bulk export at /veranstaltungen/veranstaltungen.ical
// VEVENT fields: SUMMARY, DTSTART, DTEND, LOCATION, X-ID (e.g. 22451_NNNNNN)

function unfoldIcal(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, "");
}

function icalDateToIso(val: string): string {
  if (val.length >= 15 && val[8] === "T") {
    return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T${val.slice(9, 11)}:${val.slice(11, 13)}:${val.slice(13, 15)}Z`;
  }
  return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T00:00:00.000Z`;
}

function extractEvents(ical: string): Event[] {
  const items: Event[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const unfolded = unfoldIcal(ical);

  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (key: string) => block.match(new RegExp(`^${key}[;:][^\r\n]*`, "m"))?.[0]?.replace(/^[^:]+:/, "").trim() ?? "";

    const summary = get("SUMMARY").replace(/\\,/g, ",").replace(/\\n/g, " ").trim();
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    const location = get("LOCATION").replace(/\\,/g, ",").replace(/\\n/g, "\n").trim();
    const xid = get("X-ID"); // e.g. 22451_904005818

    if (!summary || !dtstart) continue;

    const eventId = xid ? xid.split("_")[1] : undefined;
    const id = eventId ? `glienicke-event-${eventId}` : `glienicke-event-${dtstart}-${summary.slice(0, 20)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = eventId
      ? `${BASE_URL}/veranstaltungen/${eventId}-${KOMMUNE_ID}.html`
      : `${BASE_URL}/freizeit-kultur/veranstaltungskalender/`;

    items.push({
      id,
      title: summary,
      url,
      startDate: icalDateToIso(dtstart),
      ...(dtend ? { endDate: icalDateToIso(dtend) } : {}),
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeNews(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    if (!byId.has(n.id)) { byId.set(n.id, n); }
    else { const old = byId.get(n.id)!; byId.set(n.id, { ...n, fetchedAt: old.fetchedAt ?? n.fetchedAt, publishedAt: old.publishedAt ?? n.publishedAt }); }
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/portal/rss.xml", "/veranstaltungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };

const today = new Date();
const nextYear = new Date(today);
nextYear.setFullYear(nextYear.getFullYear() + 1);
const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const eventsIcalUrl = `${BASE_URL}/veranstaltungen/veranstaltungen.ical?zeitauswahl=1&auswahl_woche_tage=365&kategorie=0&selected_kommune=${KOMMUNE_ID}&beginn=${fmt(today)}000000&ende=${fmt(nextYear)}235959&intern=0`;

const [rssXml, eventsIcal] = await Promise.all([
  fetch(NEWS_RSS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_RSS_URL}`); return r.text(); }),
  fetch(eventsIcalUrl, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${eventsIcalUrl}`); return r.text(); }),
]);

const now = new Date().toISOString();

const newsPath = join(DIR, "news.json");
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const mergedNews = mergeNews(existingNews.items, extractNews(rssXml));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
console.log(`news:   ${mergedNews.length} Einträge → ${newsPath}`);

const incomingEvents = extractEvents(eventsIcal);
if (incomingEvents.length > 0) {
  const eventsPath = join(DIR, "events.json");
  const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
  const mergedEvents = mergeEvents(existingEvents.items, incomingEvents);
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
  console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
} else {
  console.log("events: 0 Einträge – keine events.json geschrieben");
}
