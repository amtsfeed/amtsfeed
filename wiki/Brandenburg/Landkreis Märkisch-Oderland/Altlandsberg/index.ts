#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.altlandsberg.de";
const EVENTS_PAGE_URL = `${BASE_URL}/leben-wohnen/kultur-freizeit/veranstaltungen/`;
const NEWS_URL = `${BASE_URL}/buergerservice-verwaltung/weitere-themen/stadtnachrichten/`;
const AMTSBLATT_URL = `${BASE_URL}/buergerservice-verwaltung/rathaus/amtsblatt-und-stadtmagazin/`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Custom TYPO3 extension: altlandsbergevents_list
// Events loaded via AJAX POST with form data:
//   iconateAjaxDispatcherID=altlandsberg_events__list__geteventslist
//   actionData[currentPage]=N
// Container: <div class="event-list-item">
// Date: <div class="event-date">DD.MM.YYYY</div>
// Title: <div class="event-title"><a href="URL">TITLE</a></div>
// Location: <div class="event-location">LOCATION</div>
// Description: <div class="event-bodytext">TEXT</div>
// ID: last numeric segment of URL slug

function parseEventPage(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s+class="event-list-item")/)
    .filter((b) => b.includes('class="event-list-item"'));

  for (const block of blocks) {
    const dateMatch = block.match(/<div\s+class="event-date">(\d{2})\.(\d{2})\.(\d{4})<\/div>/);
    if (!dateMatch) continue;
    const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

    const titleMatch = block.match(/<div\s+class="event-title">\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    // ID from trailing number in slug: /..../slug-NUMBER/
    const idMatch = href.match(/-(\d+)\/?$/);
    const id = idMatch ? idMatch[1]! : href.split("/").filter(Boolean).pop()!;

    const locationMatch = block.match(/<div\s+class="event-location">([\s\S]*?)<\/div>/i);
    const location = locationMatch
      ? decodeHtmlEntities((locationMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    const descMatch = block.match(/<div\s+class="event-bodytext">([\s\S]*?)<\/div>/i);
    const description = descMatch
      ? decodeHtmlEntities((descMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
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

async function fetchAllEvents(headers: Record<string, string>): Promise<Event[]> {
  const allEvents: Event[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 20; page++) {
    const body = new FormData();
    body.append("iconateAjaxDispatcherID", "altlandsberg_events__list__geteventslist");
    body.append("actionData[currentPage]", String(page));

    const res = await fetch(EVENTS_PAGE_URL, {
      method: "POST",
      headers: { ...headers, "X-Requested-With": "XMLHttpRequest" },
      body,
    });
    if (!res.ok) break;
    const html = await res.text();

    if (!html.includes('class="event-list-item"')) break;

    const events = parseEventPage(html);
    if (events.length === 0) break;

    let anyNew = false;
    for (const e of events) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        allEvents.push(e);
        anyNew = true;
      }
    }
    if (!anyNew) break;
  }
  return allEvents;
}

// ── News ──────────────────────────────────────────────────────────────────────
// Container: <div class="news-item-content-container">
// Date: <span class="item-date">DD.MM.YY</span> (2-digit year!)
// Title: <div class="item-headline"><a href="URL">TITLE</a></div>
// ID: last slug segment of URL

function extractNews(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=<div\s+class="news-item-content-container")/)
    .filter((b) => b.includes('class="news-item-content-container"'));

  for (const block of blocks) {
    const titleMatch = block.match(/<div\s+class="item-headline">\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const href = titleMatch[1]!;
    const title = decodeHtmlEntities((titleMatch[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const id = href.split("/").filter(Boolean).pop() ?? href;

    // Date: DD.MM.YY (2-digit year) → expand to 4-digit
    const dateMatch = block.match(/<span\s+class="item-date">\s*(\d{2})\.(\d{2})\.(\d{2})\s*<\/span>/);
    let publishedAt: string | undefined;
    if (dateMatch) {
      const year = parseInt(dateMatch[3]!, 10);
      const fullYear = year >= 50 ? 1900 + year : 2000 + year;
      publishedAt = `${fullYear}-${dateMatch[2]}-${dateMatch[1]}T00:00:00.000Z`;
    }

    items.push({
      id,
      title,
      url,
      fetchedAt: now,
      ...(publishedAt ? { publishedAt } : {}),
      updatedAt: now,
    });
  }
  return items;
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// TYPO3 fileadmin — /fileadmin/user_upload/Dokumente/Amtsblatt/YYYY/YYYY_Amtsblatt_Altlandsberg_NN.pdf
// Link text: "Amtsblatt Nr. N vom DD.MM.YYYY"

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rx = /href="(\/fileadmin\/user_upload\/Dokumente\/Amtsblatt\/(\d{4})\/[^"]*_(\d{2})\.pdf)"[^>]*>[\s\S]*?Amtsblatt Nr\.\s*\d+\s+vom\s+(\d{2})\.(\d{2})\.(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const path = m[1]!;
    const fileYear = m[2]!;
    const num = m[3]!;
    const day = m[4]!;
    const month = m[5]!;
    const year = m[6]!;
    const id = `altlandsberg-amtsblatt-${fileYear}-${num}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: `Amtsblatt Nr. ${num}/${year}`,
      url: `${BASE_URL}${path}`,
      publishedAt: `${year}-${month}-${day}T00:00:00.000Z`,
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
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return b.id.localeCompare(a.id);
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, [
  "/leben-wohnen/kultur-freizeit/veranstaltungen/",
  "/buergerservice-verwaltung/weitere-themen/stadtnachrichten/",
  "/buergerservice-verwaltung/rathaus/",
]);

const headers = { "User-Agent": AMTSFEED_UA };
const [incomingEvents, newsHtml, amtsblattHtml] = await Promise.all([
  fetchAllEvents(headers),
  fetch(NEWS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_URL}`); return r.text(); }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, incomingEvents);
const mergedNews = mergeNews(existingNews.items, extractNews(newsHtml));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
