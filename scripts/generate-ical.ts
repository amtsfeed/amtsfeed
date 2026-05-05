#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EventsFile, Event } from "./types.ts";

const dir = resolve(process.argv[2] ?? ".");

function escapeIcalText(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  const chunks = line.match(/.{1,70}/gu) ?? [""];
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

function property(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDate(dateString: string): string {
  return dateString.slice(0, 10).replace(/-/g, "");
}

function isAllDay(dateString: string): boolean {
  return dateString.endsWith("T00:00:00.000Z");
}

function addDays(dateString: string, days: number): string {
  const date = new Date(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function normalizeEndDate(startDate: string, endDate: string): string {
  let end = new Date(endDate);
  const start = new Date(startDate);

  while (end <= start) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  return end.toISOString();
}

function eventToVevent(event: Event): string {
  const lines = ["BEGIN:VEVENT"];
  lines.push(property("UID", escapeIcalText(`${event.id}@amtsfeed.de`)));
  lines.push(property("DTSTAMP", formatDateTime(event.updatedAt ?? event.fetchedAt)));

  if (isAllDay(event.startDate)) {
    lines.push(property("DTSTART;VALUE=DATE", formatDate(event.startDate)));
    lines.push(property("DTEND;VALUE=DATE", formatDate(addDays(event.endDate ?? event.startDate, 1))));
  } else {
    lines.push(property("DTSTART", formatDateTime(event.startDate)));
    if (event.endDate) {
      lines.push(property("DTEND", formatDateTime(normalizeEndDate(event.startDate, event.endDate))));
    }
  }

  lines.push(property("SUMMARY", escapeIcalText(event.title)));
  lines.push(property("URL", escapeIcalText(event.url)));

  if (event.description) {
    lines.push(property("DESCRIPTION", escapeIcalText(event.description)));
  }

  if (event.location) {
    lines.push(property("LOCATION", escapeIcalText(event.location)));
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const eventsFile = readJson<EventsFile>(join(dir, "events.json"));
const events = eventsFile
  ? [...eventsFile.items].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )
  : [];

const calendarName = dir.split("/").at(-1) ?? "amtsfeed";
const now = formatDateTime(new Date().toISOString());

const ical = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//amtsfeed//amtsfeed//DE",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  property("X-WR-CALNAME", escapeIcalText(calendarName)),
  property("X-WR-CALDESC", escapeIcalText(`Amtliche Veranstaltungen für ${calendarName}`)),
  property("X-PUBLISHED-TTL", "PT1H"),
  ...events.map(eventToVevent),
  "END:VCALENDAR",
  "",
].join("\r\n");

const outPath = join(dir, "events.ics");
writeFileSync(outPath, ical, "utf-8");
console.log(`Wrote ${events.length} events to ${outPath}`);
