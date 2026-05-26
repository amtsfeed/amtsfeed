#!/usr/bin/env tsx
/**
 * Führt alle `wiki/** /index.ts`-Scraper sequenziell aus (NICHT parallel) und erstellt am Ende
 * einen Report:
 *   - Wie viele Einträge sind in news/events/amtsblatt/notices.json vor und nach dem Lauf?
 *   - Welche Scraper sind fehlgeschlagen, welche liefern auffällig weniger Einträge?
 *
 * Aufruf:  tsx scripts/run-all-scrapers.ts          (alle Scraper)
 *          tsx scripts/run-all-scrapers.ts Barnim   (Filter auf Pfadsubstring)
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const FILTER = process.argv[2] ?? "";
const KINDS = ["news", "events", "amtsblatt", "notices"] as const;
type Kind = (typeof KINDS)[number];

function findScrapers(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findScrapers(full, acc);
    else if (entry === "index.ts") acc.push(full);
  }
  return acc;
}

function counts(dir: string): Record<Kind, number | null> {
  const out: Record<Kind, number | null> = { news: null, events: null, amtsblatt: null, notices: null };
  for (const kind of KINDS) {
    const path = join(dir, `${kind}.json`);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      out[kind] = Array.isArray(data.items) ? data.items.length : 0;
    } catch { out[kind] = -1; }
  }
  return out;
}

function fmtDiff(before: number | null, after: number | null): string {
  if (before === null && after === null) return "—";
  if (before === null) return `(neu) ${after}`;
  if (after === null) return `${before} → (weg)`;
  const d = after - before;
  if (d === 0) return `${after}`;
  const sign = d > 0 ? "+" : "";
  return `${before} → ${after} (${sign}${d})`;
}

interface Result {
  path: string;
  ok: boolean;
  durationMs: number;
  before: Record<Kind, number | null>;
  after: Record<Kind, number | null>;
  error?: string;
}

const scrapers = findScrapers(join(ROOT, "wiki"))
  .filter((p) => !FILTER || p.includes(FILTER))
  .sort();

console.log(`Found ${scrapers.length} scrapers${FILTER ? ` (filter: ${FILTER})` : ""}\n`);

const results: Result[] = [];
const tsxBin = join(ROOT, "node_modules", ".bin", "tsx");

for (let i = 0; i < scrapers.length; i++) {
  const scraper = scrapers[i]!;
  const dir = scraper.replace(/\/index\.ts$/, "");
  const rel = relative(ROOT, scraper);
  const before = counts(dir);
  process.stdout.write(`[${i + 1}/${scrapers.length}] ${rel} ... `);
  const t0 = Date.now();
  const proc = spawnSync(tsxBin, [scraper], { cwd: ROOT, encoding: "utf-8", timeout: 120_000 });
  const durationMs = Date.now() - t0;
  const ok = proc.status === 0;
  const after = counts(dir);
  const err = ok ? undefined : (proc.stderr.trim().split("\n").slice(-3).join(" | ") || `exit ${proc.status}`);
  results.push({ path: rel, ok, durationMs, before, after, error: err });
  console.log(ok ? `OK (${durationMs}ms)` : `FAILED (${durationMs}ms)`);
  if (!ok) console.log(`   ${err}`);
}

// ── Report ─────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(100));
console.log("REPORT");
console.log("=".repeat(100));

const failed = results.filter((r) => !r.ok);
const zeroAfterNonzero = results.filter((r) =>
  KINDS.some((k) => (r.before[k] ?? 0) > 0 && (r.after[k] ?? 0) === 0)
);
const bigDrops = results.filter((r) =>
  KINDS.some((k) => {
    const b = r.before[k] ?? 0;
    const a = r.after[k] ?? 0;
    return b >= 5 && a > 0 && a / b < 0.5; // >50 % weniger und vorher mindestens 5
  })
);
const noData = results.filter((r) =>
  r.ok && KINDS.every((k) => r.after[k] === null || r.after[k] === 0)
);

console.log(`Total:           ${results.length}`);
console.log(`OK:              ${results.length - failed.length}`);
console.log(`Failed:          ${failed.length}`);
console.log(`Zero-after-nonzero (Kategorie auf 0 abgefallen): ${zeroAfterNonzero.length}`);
console.log(`Drops >50 %:     ${bigDrops.length}`);
console.log(`Kein einziger Eintrag in irgendeiner Kategorie:   ${noData.length}`);
console.log();

if (failed.length) {
  console.log("─── FAILED ───");
  for (const r of failed) console.log(`  ✗ ${r.path}\n    ${r.error}`);
  console.log();
}

if (zeroAfterNonzero.length) {
  console.log("─── KATEGORIE AUF 0 ABGEFALLEN ───");
  for (const r of zeroAfterNonzero) {
    const lost = KINDS.filter((k) => (r.before[k] ?? 0) > 0 && (r.after[k] ?? 0) === 0)
      .map((k) => `${k}: ${r.before[k]} → 0`).join(", ");
    console.log(`  ! ${r.path}  [${lost}]`);
  }
  console.log();
}

if (bigDrops.length) {
  console.log("─── EINBRÜCHE > 50 % ───");
  for (const r of bigDrops) {
    const drops = KINDS.filter((k) => {
      const b = r.before[k] ?? 0; const a = r.after[k] ?? 0;
      return b >= 5 && a > 0 && a / b < 0.5;
    }).map((k) => `${k}: ${r.before[k]} → ${r.after[k]}`).join(", ");
    console.log(`  ⚠ ${r.path}  [${drops}]`);
  }
  console.log();
}

// Full table (compact)
console.log("─── ALLE ERGEBNISSE ───");
const colW = { path: 70, news: 18, events: 18, amts: 18, not: 18 };
const pad = (s: string, w: number) => (s + " ".repeat(w)).slice(0, w);
console.log(pad("Pfad", colW.path) + pad("news", colW.news) + pad("events", colW.events) + pad("amtsblatt", colW.amts) + pad("notices", colW.not));
for (const r of results) {
  const short = r.path.replace(/^wiki\//, "").replace(/\/index\.ts$/, "");
  console.log(
    pad(short, colW.path) +
    pad(fmtDiff(r.before.news, r.after.news), colW.news) +
    pad(fmtDiff(r.before.events, r.after.events), colW.events) +
    pad(fmtDiff(r.before.amtsblatt, r.after.amtsblatt), colW.amts) +
    pad(fmtDiff(r.before.notices, r.after.notices), colW.not)
  );
}

const failedCount = failed.length + zeroAfterNonzero.length;
process.exit(failedCount > 0 ? 1 : 0);
