#!/usr/bin/env tsx
/**
 * Walks all wiki subdirectories, finds robots.json files, and re-fetches
 * robots.txt for every domain listed — ignoring the cache TTL.
 *
 * Run manually or after adding a new domain to a robots.json.
 * Usage: pnpm tsx scripts/update-robots.ts
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AMTSFEED_UA } from "./robots.ts";
import type { RobotsEntry } from "./robots.ts";

const WIKI_DIR = join(import.meta.dirname, "..", "wiki");

function parseRobotsTxt(text: string, domain: string): RobotsEntry {
  interface Group { agents: string[]; allowed: string[]; disallowed: string[] }
  const groups: Group[] = [];
  let current: Group = { agents: [], allowed: [], disallowed: [] };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      if (current.agents.length > 0) { groups.push(current); current = { agents: [], allowed: [], disallowed: [] }; }
      continue;
    }
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    switch (key?.trim().toLowerCase()) {
      case "user-agent": current.agents.push(value.toLowerCase()); break;
      case "allow":      if (value) current.allowed.push(value); break;
      case "disallow":   if (value) current.disallowed.push(value); break;
    }
  }
  if (current.agents.length > 0) groups.push(current);

  const specific = groups.find((g) => g.agents.includes("amtsfeed"));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const active = specific ?? wildcard;

  return {
    domain,
    updatedAt: new Date().toISOString(),
    allowed:    active?.allowed.length    ? active.allowed    : ["*"],
    disallowed: active?.disallowed.length ? active.disallowed : [],
  };
}

async function refreshDomain(domain: string): Promise<RobotsEntry> {
  const url = `https://${domain}/robots.txt`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": AMTSFEED_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parseRobotsTxt(text, domain);
  } catch (err) {
    console.warn(`  ⚠ ${domain}: ${(err as Error).message} — assuming allow all`);
    return { domain, updatedAt: new Date().toISOString(), allowed: ["*"], disallowed: [] };
  }
}

function* findRobotsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* findRobotsFiles(full);
    else if (name === "robots.json") yield full;
  }
}

const robotsFiles = [...findRobotsFiles(WIKI_DIR)];

if (robotsFiles.length === 0) {
  console.log("No robots.json files found in wiki/.");
  process.exit(0);
}

for (const filePath of robotsFiles) {
  const entries = JSON.parse(readFileSync(filePath, "utf-8")) as RobotsEntry[];
  console.log(`\n${filePath.replace(WIKI_DIR + "/", "wiki/")}`);

  const updated: RobotsEntry[] = [];
  for (const entry of entries) {
    process.stdout.write(`  ${entry.domain} … `);
    const fresh = await refreshDomain(entry.domain);
    console.log(`allowed: ${fresh.allowed.join(", ") || "(none)"}, disallowed: ${fresh.disallowed.join(", ") || "(none)"}`);
    updated.push(fresh);
  }

  writeFileSync(filePath, JSON.stringify(updated, null, 2));
}

console.log("\nDone.");
