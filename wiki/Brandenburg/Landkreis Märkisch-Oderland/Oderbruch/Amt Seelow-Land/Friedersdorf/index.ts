#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, Event } from "../../../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../../../scripts/robots.ts";

const BASE_URL = "https://www.kunstspeicher-friedersdorf.de";
const EVENTS_URL = `${BASE_URL}/veranstaltungen/index.php`;
const EXHIBITIONS_URL = `${BASE_URL}/veranstaltungen/rubrik.php?nummer=5`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

// ── Events ────────────────────────────────────────────────────────────────────
// CMS uses <div class="row events-entry-3"> blocks.
// Date: <time class="events-entry-3-time" datetime="YYYY-MM-DD">
// Title: <h2 class="legacy_h5 events-entry-3-headline"><a href="...">TITLE</a>
// Exhibitions have two <time> tags (start + end range).

function extractEvents(html: string, label: string): Event[] {
  const events: Event[] = [];
  const now = new Date().toISOString();

  const blocks = html.split(/(?=class="row events-entry-3")/)
    .filter((b) => b.includes('class="row events-entry-3"'));

  for (const block of blocks) {
    const linkMatch = block.match(/href="(\/veranstaltungen\/[^"]+\.html)"/);
    if (!linkMatch) continue;
    const href = linkMatch[1]!;

    const titleMatch = block.match(/class="[^"]*events-entry-3-headline[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities((titleMatch[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title) continue;

    const timeMatches = [...block.matchAll(/<time\s+class="events-entry-3-time"\s+datetime="(\d{4}-\d{2}-\d{2})"/g)];
    if (timeMatches.length === 0) continue;
    const startDate = `${timeMatches[0]![1]}T00:00:00.000Z`;
    const endDate = timeMatches.length > 1 ? `${timeMatches[1]![1]}T00:00:00.000Z` : undefined;

    const teaserMatch = block.match(/class="[^"]*events-entry-3-teaser[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = teaserMatch
      ? decodeHtmlEntities((teaserMatch[1] ?? "").replace(/<[^>]+>/g, "").trim())
      : undefined;

    events.push({
      id: `${label}-${href.replace(/^\//, "").replace(/\//g, "-")}`,
      title,
      url: `${BASE_URL}${href}`,
      startDate,
      ...(endDate ? { endDate } : {}),
      ...(description ? { description } : {}),
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
assertAllowed(robots, ["/veranstaltungen/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const [eventsHtml, exhibitionsHtml] = await Promise.all([
  fetch(EVENTS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`); return r.text(); }),
  fetch(EXHIBITIONS_URL, { headers }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${EXHIBITIONS_URL}`); return r.text(); }),
]);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });

const incoming = [
  ...extractEvents(eventsHtml, "ev"),
  ...extractEvents(exhibitionsHtml, "exh"),
];

const mergedEvents = mergeEvents(existingEvents.items, incoming);

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
