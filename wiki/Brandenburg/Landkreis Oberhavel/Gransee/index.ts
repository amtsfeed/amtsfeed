#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventsFile, Event } from "../../../../scripts/types.ts";
import { checkRobots, assertAllowed, AMTSFEED_UA } from "../../../../scripts/robots.ts";

const BASE_URL = "https://www.gransee.de";
const TRIBE_API_URL = `${BASE_URL}/wp-json/tribe/events/v1/events`;
const DIR = dirname(fileURLToPath(import.meta.url));

// ── Events ────────────────────────────────────────────────────────────────────
// WordPress + The Events Calendar (Tribe Events) REST API
// GET /wp-json/tribe/events/v1/events?per_page=100&page=N
// Response: { events: [...], total, total_pages, next_rest_url }

interface TribeEvent {
  id: number;
  title: string;
  url: string;
  start_date: string; // "YYYY-MM-DD HH:MM:SS"
  end_date: string;
  venue?: { venue?: string; address?: string; city?: string };
}

interface TribeResponse {
  events: TribeEvent[];
  total: number;
  total_pages: number;
  next_rest_url?: string;
}

async function fetchAllEvents(headers: Record<string, string>): Promise<Event[]> {
  const events: Event[] = [];
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  let url: string | undefined = `${TRIBE_API_URL}?per_page=100&start_date=${today}`;

  while (url) {
    const data = await fetch(url, { headers }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return r.json() as Promise<TribeResponse>;
    });

    for (const ev of data.events ?? []) {
      const title = ev.title.replace(/<[^>]+>/g, "").trim();
      if (!title) continue;

      const startDate = new Date(ev.start_date).toISOString();
      const endDate = ev.end_date ? new Date(ev.end_date).toISOString() : undefined;

      const venueParts = [ev.venue?.venue, ev.venue?.city].filter(Boolean);
      const location = venueParts.length > 0 ? venueParts.join(", ") : undefined;

      events.push({
        id: `gransee-event-${ev.id}`,
        title,
        url: ev.url,
        startDate,
        ...(endDate && endDate !== startDate ? { endDate } : {}),
        ...(location ? { location } : {}),
        fetchedAt: now,
        updatedAt: now,
      });
    }

    url = data.next_rest_url ?? undefined;
  }

  return events;
}

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, { ...e, fetchedAt: byId.get(e.id)?.fetchedAt ?? e.fetchedAt });
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function loadJson<T>(path: string, fallback: T): T {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8")) as T;
  return fallback;
}

const robots = await checkRobots(DIR, BASE_URL);
assertAllowed(robots, ["/wp-json/"]);

const headers = { "User-Agent": AMTSFEED_UA };
const incomingEvents = await fetchAllEvents(headers);

const eventsPath = join(DIR, "events.json");
const existingEvents = loadJson<EventsFile>(eventsPath, { updatedAt: "", items: [] });
const mergedEvents = mergeEvents(existingEvents.items, incomingEvents);

const now = new Date().toISOString();
if (mergedEvents.length > 0)
  writeFileSync(eventsPath, JSON.stringify({ updatedAt: now, items: mergedEvents }, null, 2));

console.log(`events: ${mergedEvents.length} Einträge → ${eventsPath}`);
