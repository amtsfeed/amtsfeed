#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, Event } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://bad-saarow.de";
const EVENTS_SOURCE_BASE = "https://www.scharmuetzelsee.de";
const EVENTS_URL = `${EVENTS_SOURCE_BASE}/veranstaltungen/veranstaltungsplan`;
const DIR = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&ensp;/g, " ").replace(/&copy;/g, "©")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function parseGermanDate(d: string, m: string, y: string): string {
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00.000Z`;
}

// ── Events ────────────────────────────────────────────────────────────────────
// Source: scharmuetzelsee.de/veranstaltungen/veranstaltungsplan (TYPO3 + DAMAS tourism data)
// bad-saarow.de links to this page for events (no own event database).
// Container: <div class="teaser-card result-item" data-type="Event">
// Title: <span class="teaser-card__header">TITLE</span>
// Date:  <span class="teaser-card__subheader">DD.MM.YYYY[ - DD.MM.YYYY]</span>
// URL:   <a class="teaser-card__link" href="https://www.scharmuetzelsee.de/event/SLUG">

function extractEvents(html: string): Event[] {
  const now = new Date().toISOString();
  const events: Event[] = [];
  const seen = new Set<string>();

  const blocks = html.split(/(?=<div[^>]*class="teaser-card result-item")/).filter((b) =>
    b.includes('data-type="Event"')
  );

  for (const block of blocks) {
    const urlMatch = block.match(/href="(https:\/\/www\.scharmuetzelsee\.de\/event\/([^"]+))"/);
    const titleMatch = block.match(/<span[^>]*class="teaser-card__header">([\s\S]*?)<\/span>/);
    const dateMatch = block.match(/<span[^>]*class="teaser-card__subheader">([\s\S]*?)<\/span>/);

    if (!urlMatch || !titleMatch || !dateMatch) continue;

    const url = urlMatch[1]!;
    const slug = urlMatch[2]!;
    const title = decodeHtmlEntities(titleMatch[1]!.replace(/<[^>]+>/g, "").trim());
    const dateStr = decodeHtmlEntities(dateMatch[1]!.replace(/<[^>]+>/g, "").trim());

    if (!title || !dateStr) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);

    // Parse date: "DD.MM.YYYY" or "DD.MM.YYYY - DD.MM.YYYY"
    const rangeMatch = dateStr.match(/^(\d{1,2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{1,2})\.(\d{2})\.(\d{4})$/);
    const singleMatch = dateStr.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);

    let startDate: string;
    let endDate: string | undefined;

    if (rangeMatch) {
      const [, d1, m1, y1, d2, m2, y2] = rangeMatch;
      startDate = parseGermanDate(d1!, m1!, y1!);
      endDate = parseGermanDate(d2!, m2!, y2!);
    } else if (singleMatch) {
      const [, d1, m1, y1] = singleMatch;
      startDate = parseGermanDate(d1!, m1!, y1!);
    } else {
      continue;
    }

    const id = `scharmuetzelsee-${slug}`;
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

  return events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Check robots for both sites
const robotsBadSaarow = await checkRobots(DIR, BASE_URL);
assertAllowed(robotsBadSaarow, ["/veranstaltungen"]);

const robotsScharmuetzel = await checkRobots(DIR, EVENTS_SOURCE_BASE);
assertAllowed(robotsScharmuetzel, ["/veranstaltungen/veranstaltungsplan"]);

const headers = { "User-Agent": AMTSFEED_UA };
const eventsHtml = await fetch(EVENTS_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} ${EVENTS_URL}`);
  return r.text();
});

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, extractEvents(eventsHtml));

const now = new Date().toISOString();
writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
console.log(`news:   (keine — bad-saarow.de ist Tourismus-Website ohne eigenen Nachrichtenbereich)`);
