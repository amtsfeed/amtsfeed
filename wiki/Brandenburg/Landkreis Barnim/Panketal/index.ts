#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, NewsFile, Event } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://panketal.de";
const EVENTS_URL = `${BASE_URL}/freizeit/veranstaltungen.html`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// Joomla + screendriverFOUR-Events template
// Container: <div class="col-xs-12 eventbox ...">
// Date: <p class="dat"><strong>DD.MM.YYYY</strong> | HH:MM Uhr</p>
// Title: <h2>TITLE</h2>
// Location: <p class="place"><img ...> <strong>LOCATION</strong></p>
// URL: href="/freizeit/veranstaltungen/eventdetail-laden.html?se=ID"

function extractEvents(html: string): Event[] {
  const events: Event[] = [];
  const seenIds = new Set<string>();
  const now = new Date().toISOString();

  // Split on eventbox class substring to get individual event blocks
  // The actual class is "col-xs-12 eventbox schatten ..."
  const blocks = html.split("eventbox schatten").filter((_, i) => i > 0);

  for (const block of blocks) {
    // Extract event ID from se= parameter
    const idMatch = block.match(/se=(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Extract date: <strong>DD.MM.YYYY</strong>
    const dateMatch = block.match(/<strong>(\d{1,2})\.(\d{1,2})\.(\d{4})<\/strong>/);
    if (!dateMatch) continue;
    const [, day, month, year] = dateMatch;
    const dateStr = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;

    // Extract time: | HH:MM Uhr
    const timeMatch = block.match(/\|\s*(\d{1,2}:\d{2})\s*Uhr/);
    const time = timeMatch ? timeMatch[1]!.padStart(5, "0") : "00:00";
    const startDate = `${dateStr}T${time}:00.000Z`;

    // Extract title from <h2>
    const titleMatch = block.match(/<h2>([\s\S]*?)<\/h2>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    // Extract location from class="place" block
    const placeMatch = block.match(/class="place"[\s\S]*?<strong>([^<]+)<\/strong>/);
    const location = placeMatch
      ? decodeHtmlEntities(placeMatch[1]!.trim()) || undefined
      : undefined;

    // Extract URL
    const hrefMatch = block.match(/href="([^"]*se=\d+[^"]*)"/);
    const url = hrefMatch ? `${BASE_URL}${hrefMatch[1]!}` : EVENTS_URL;

    events.push({
      id,
      title,
      url,
      startDate,
      ...(location ? { location } : {}),
      fetchedAt: now,
      updatedAt: now,
    });
  }

  return events;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/freizeit/veranstaltungen.html"]);

const headers = { "User-Agent": AMTSFEED_UA };
const eventsHtml = await fetch(EVENTS_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`);
  return r.text();
});

const eventsPath = join(DIR, "events.json");
const newsPath = join(DIR, "news.json");

const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });

const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

// Write empty news.json if it doesn't exist
if (!existsSync(newsPath)) {
  writeFileSync(newsPath, JSON.stringify({ updatedAt: now, items: [] } satisfies NewsFile, null, 2));
}

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   0 Einträge (keine Nachrichten) → ${newsPath}`);
