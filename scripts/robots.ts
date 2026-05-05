/**
 * Fetches and caches robots.txt per domain.
 * Uses robots-parser (spec-compliant) to check access for the amtsfeed UA.
 * Stores raw robots.txt content in robots.json (one entry per domain).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import robotsParser from "robots-parser";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
) as { version: string };

export const AMTSFEED_UA = `amtsfeed/${pkg.version} (contact: JanS@DracoBlue.de)`;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RobotsEntry {
  domain: string;
  baseUrl: string;
  updatedAt: string;
  content: string; // raw robots.txt text; empty string = no robots.txt
}

export async function checkRobots(dir: string, baseUrl: string): Promise<RobotsEntry> {
  const url = new URL(baseUrl);
  const domain = url.hostname;
  const origin = `${url.protocol}//${domain}`;
  const robotsPath = join(dir, "robots.json");

  let cache: RobotsEntry[] = [];
  if (existsSync(robotsPath)) {
    cache = JSON.parse(readFileSync(robotsPath, "utf-8")) as RobotsEntry[];
  }

  const existing = cache.find((e) => e.domain === domain);
  // Invalidate if stale or old format (no content field)
  if (existing?.content !== undefined && Date.now() - new Date(existing.updatedAt).getTime() < CACHE_TTL_MS) {
    return existing;
  }

  const robotsUrl = `${origin}/robots.txt`;
  const res = await fetch(robotsUrl, { headers: { "User-Agent": AMTSFEED_UA } });
  const content = res.ok ? await res.text() : "";

  const entry: RobotsEntry = { domain, baseUrl: origin, updatedAt: new Date().toISOString(), content };
  const updated = [...cache.filter((e) => e.domain !== domain), entry];
  writeFileSync(robotsPath, JSON.stringify(updated, null, 2));

  return entry;
}

export function assertAllowed(entry: RobotsEntry, paths: string[]): void {
  const parser = robotsParser(`${entry.baseUrl}/robots.txt`, entry.content);
  for (const path of paths) {
    if (parser.isAllowed(`${entry.baseUrl}${path}`, "amtsfeed") === false) {
      throw new Error(
        `robots.txt for ${entry.domain} disallows crawling "${path}" for amtsfeed`
      );
    }
  }
}
