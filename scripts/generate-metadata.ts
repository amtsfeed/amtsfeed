#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EventsFile, NewsFile, AmtsblattFile } from "./types.ts";

const WIKI_BASE = resolve(import.meta.dirname, "../wiki");
const RAW_BASE = "https://raw.githubusercontent.com/amtsfeed/amtsfeed/main/wiki";

export interface Source {
  type: "rss" | "ical";
  url: string;
  title?: string;
}

export interface FeedEntry {
  path: string;
  breadcrumb: string[];
  name: string;
  hasRss: boolean;
  hasIcal: boolean;
  eventCount: number;
  newsCount: number;
  amtsblattCount: number;
  updatedAt: string | null;
  rssUrl: string | null;
  icalUrl: string | null;
  eventsUrl: string | null;
  newsUrl: string | null;
  amtsblattUrl: string | null;
  sources: Source[];
}

export interface Metadata {
  updatedAt: string;
  feeds: FeedEntry[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function walkWiki(dir: string, breadcrumb: string[]): FeedEntry[] {
  const results: FeedEntry[] = [];
  const hasEvents = existsSync(join(dir, "events.json"));
  const hasNews = existsSync(join(dir, "news.json"));

  if (hasEvents || hasNews) {
    const eventsFile = hasEvents ? readJson<EventsFile>(join(dir, "events.json")) : null;
    const newsFile = hasNews ? readJson<NewsFile>(join(dir, "news.json")) : null;
    const hasAmtsblatt = existsSync(join(dir, "amtsblatt.json"));
    const amtsblattFile = hasAmtsblatt ? readJson<AmtsblattFile>(join(dir, "amtsblatt.json")) : null;
    const hasRss = existsSync(join(dir, "rss.xml"));
    const hasIcal = existsSync(join(dir, "events.ics"));
    const relPath = dir.slice(WIKI_BASE.length + 1);
    const encodedPath = relPath.split("/").map(encodeURIComponent).join("/");

    const updatedAt = eventsFile?.updatedAt ?? newsFile?.updatedAt ?? null;
    const sources = readJson<Source[]>(join(dir, "sources.json")) ?? [];

    results.push({
      path: relPath,
      breadcrumb,
      name: breadcrumb.at(-1)!,
      hasRss,
      hasIcal,
      eventCount: eventsFile?.items.length ?? 0,
      newsCount: newsFile?.items.length ?? 0,
      amtsblattCount: amtsblattFile?.items.length ?? 0,
      updatedAt,
      rssUrl: hasRss ? `${RAW_BASE}/${encodedPath}/rss.xml` : null,
      icalUrl: hasIcal ? `${RAW_BASE}/${encodedPath}/events.ics` : null,
      eventsUrl: hasEvents ? `${RAW_BASE}/${encodedPath}/events.json` : null,
      newsUrl: hasNews ? `${RAW_BASE}/${encodedPath}/news.json` : null,
      amtsblattUrl: hasAmtsblatt ? `${RAW_BASE}/${encodedPath}/amtsblatt.json` : null,
      sources,
    });
  }

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkWiki(full, [...breadcrumb, entry]));
    }
  }

  return results;
}

const feeds = walkWiki(WIKI_BASE, []);
const metadata: Metadata = {
  updatedAt: new Date().toISOString(),
  feeds,
};

const outPath = join(WIKI_BASE, "metadata.json");
writeFileSync(outPath, JSON.stringify(metadata, null, 2), "utf-8");
console.log(`Wrote ${feeds.length} feeds to ${outPath}`);
