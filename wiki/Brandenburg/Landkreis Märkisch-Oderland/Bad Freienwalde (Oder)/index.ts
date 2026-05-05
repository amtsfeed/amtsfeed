#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event, NewsItem, AmtsblattFile, AmtsblattItem } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://bad-freienwalde.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/`;
const NEWS_API_URL = `${BASE_URL}/wp-json/wp/v2/posts?per_page=20&_fields=id,date,slug,link,title,excerpt`;
const AMTSBLATT_BASE = "https://stadt.bad-freienwalde.de";
const AMTSBLATT_URL = `${AMTSBLATT_BASE}/veroeffentlichung/typ/812`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// WordPress + TMB Events plugin
// Container: <div class="tmb-event-wrapper ... tmb-event-id-ID">
// Date: <p id="tmb-event-date-range">DD.MM.YYYY bis DD.MM.YYYY | H:MM Uhr</p>
//   or: <p id="tmb-event-date-range">DD.MM.YYYY | H:MM Uhr</p>
// Title: <div class="tmb-event-meta-title"><a href="URL"><h5>TITLE</h5></a></div>
// Location: <p class="tmb-event-location">LOCATION</p>
// ID: {tmb-event-id}-{YYYY-MM-DD} (composite to handle recurring events)
// Filter: startDate < 2000-01-01 = TMB epoch bug → skip

function parseGermanDate(day: string, month: string, year: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const minYear = 2000;

  const blocks = html.split("class=\"tmb-event-wrapper ").filter((_, i) => i > 0);

  for (const block of blocks) {
    const idMatch = block.match(/tmb-event-id-(\d+)/);
    if (!idMatch) continue;
    const tmb_id = idMatch[1]!;

    const dateMatch = block.match(/id="tmb-event-date-range">(\d{2})\.(\d{2})\.(\d{4})(?: bis (\d{2})\.(\d{2})\.(\d{4}))?(?: \| (\d+:\d+) Uhr)?<\/p>/);
    if (!dateMatch) continue;
    const [, d1, m1, y1, d2, m2, y2, time] = dateMatch;
    if (parseInt(y1!, 10) < minYear) continue;

    const paddedTime = time ? time.padStart(5, "0") : null;
    const startDate = `${parseGermanDate(d1!, m1!, y1!)}T${paddedTime ? `${paddedTime}:00.000Z` : "00:00:00.000Z"}`;
    const endDate = d2 ? `${parseGermanDate(d2, m2!, y2!)}T${paddedTime ? `${paddedTime}:00.000Z` : "00:00:00.000Z"}` : undefined;

    const dateKey = startDate.slice(0, 10).replace(/-/g, "");
    const id = `${tmb_id}-${dateKey}`;

    const urlMatch = block.match(/href="(https:\/\/bad-freienwalde\.de\/veranstaltungen\/[^"]+)"/);
    const url = urlMatch ? urlMatch[1]! : EVENTS_URL;

    const titleMatch = block.match(/<h5>([\s\S]*?)<\/h5>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const locationMatch = block.match(/class="tmb-event-location">([\s\S]*?)<\/p>/);
    const location = locationMatch
      ? decodeHtmlEntities((locationMatch[1] ?? "").replace(/<[^>]+>/g, "").trim()) || undefined
      : undefined;

    events.push({
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
  return events;
}

// ── News ──────────────────────────────────────────────────────────────────────
// WordPress REST API: /wp-json/wp/v2/posts
// Returns JSON array of posts with id, date, slug, link, title.rendered, excerpt.rendered

interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
}

function wpPostsToNews(posts: WpPost[]): NewsItem[] {
  const now = new Date().toISOString();
  return posts.map((post) => ({
    id: String(post.id),
    title: decodeHtmlEntities(post.title.rendered.replace(/<[^>]+>/g, "").trim()),
    url: post.link,
    description: decodeHtmlEntities(post.excerpt.rendered.replace(/<[^>]+>/g, "").trim()) || undefined,
    fetchedAt: now,
    publishedAt: new Date(post.date).toISOString(),
    updatedAt: now,
  }));
}

// ── Amtsblatt ─────────────────────────────────────────────────────────────────
// VerwaltungsPortal (PortUNA) at stadt.bad-freienwalde.de — PDFs behind POST/CSRF
// Table: <td>Amtsblatt Nr. N</td> <td>DD.MM.YYYY</td>
// Year derived from the published date (not in title)

function extractAmtsblatt(html: string): AmtsblattItem[] {
  const items: AmtsblattItem[] = [];
  const now = new Date().toISOString();
  const rx = /<td>Amtsblatt Nr\.\s*(\d+)<\/td>\s*<td>([\d.&#;]+)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    const num = m[1]!.padStart(2, "0");
    const dateStr = m[2]!.replace(/&#\d+;/g, "");
    const dateParts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateParts) continue;
    const year = dateParts[3]!;
    const publishedAt = `${year}-${dateParts[2]}-${dateParts[1]}T00:00:00.000Z`;
    items.push({
      id: `bad-freienwalde-amtsblatt-${year}-${num}`,
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
    return 0;
  });
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/veranstaltungen/", "/wp-json/wp/v2/posts"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, newsRes, amtsblattHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(NEWS_API_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${NEWS_API_URL}`); return r.json() as Promise<WpPost[]>; }),
  fetch(AMTSBLATT_URL, { headers }).then((r) => r.ok ? r.text() : ""),
]);

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");
const amtsblattPath = join(DIR, "amtsblatt.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const existingNews = loadJson<NewsFile>(newsPath, { updatedAt: "", items: [] });
const existingAmtsblatt = loadJson<AmtsblattFile>(amtsblattPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));
const mergedNews = mergeNews(existingNews.items, wpPostsToNews(newsRes));
const mergedAmtsblatt = mergeAmtsblatt(existingAmtsblatt.items, extractAmtsblatt(amtsblattHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));
writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: mergedNews }, null, 2));
writeFileSync(amtsblattPath, JSON.stringify({ updatedAt: now, items: mergedAmtsblatt }, null, 2));

console.log(`events:     ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:       ${mergedNews.length} Einträge → ${newsPath}`);
console.log(`amtsblatt:  ${mergedAmtsblatt.length} Einträge → ${amtsblattPath}`);
