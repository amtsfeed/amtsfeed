#!/usr/bin/env tsx
/**
 * Schreibt einen Änderungsblock in UPDATES.md basierend auf dem aktuellen Working-Tree
 * gegenüber `git HEAD`. Soll nach einem Scraper-Lauf + `normalize-updated-at` aufgerufen
 * werden, damit reine `updatedAt`-Updates herausgefiltert sind.
 *
 * Pro Gemeinde + Kategorie (news/events/amtsblatt/notices) werden gezählt:
 *   - neu        (ID in Working Tree, nicht in HEAD)
 *   - aktualisiert (ID in beiden, Inhalt außer fetchedAt/updatedAt geändert)
 *   - entfernt   (ID in HEAD, nicht in Working Tree)
 *
 * Wenn nichts geändert ist, wird UPDATES.md NICHT angefasst.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const KINDS = ["news", "events", "amtsblatt", "notices"] as const;
type Kind = (typeof KINDS)[number];

function gitHeadJson(path: string): unknown | null {
  try {
    const txt = execSync(`git show HEAD:"${path}"`, { encoding: "utf-8", cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(txt);
  } catch { return null; }
}

function modifiedFiles(): string[] {
  // -uall: zeige untracked Dateien einzeln statt nur den Ordner zu listen.
  // Ohne den Flag würden neu angelegte Gemeinde-Ordner als "?? wiki/.../Foo/"
  // erscheinen und die JSON-Dateien darin nicht erkannt werden.
  const out = execSync("git status --porcelain -uall -z", { encoding: "utf-8", cwd: ROOT });
  const files: string[] = [];
  for (const e of out.split("\0").filter(Boolean)) {
    const status = e.slice(0, 2);
    const path = e.slice(3);
    if (!/^(.M| M|MM|A |AM|\?\?)$/.test(status)) continue;
    if (!/\/(news|events|amtsblatt|notices)\.json$/.test(path)) continue;
    files.push(path);
  }
  return files;
}

interface ItemLike { id?: string; [k: string]: unknown }

function contentKey(item: ItemLike): string {
  const filtered: Record<string, unknown> = {};
  for (const k of Object.keys(item).filter((k) => k !== "fetchedAt" && k !== "updatedAt").sort()) {
    filtered[k] = item[k];
  }
  return JSON.stringify(filtered);
}

interface Diff { added: number; updated: number; removed: number }
function diffItems(oldItems: ItemLike[], newItems: ItemLike[]): Diff {
  const oldById = new Map(oldItems.filter((i) => i.id).map((i) => [i.id!, i]));
  const newById = new Map(newItems.filter((i) => i.id).map((i) => [i.id!, i]));
  let added = 0, updated = 0, removed = 0;
  for (const [id, item] of newById) {
    const old = oldById.get(id);
    if (!old) added++;
    else if (contentKey(item) !== contentKey(old)) updated++;
  }
  for (const id of oldById.keys()) if (!newById.has(id)) removed++;
  return { added, updated, removed };
}

function isEmpty(d: Diff): boolean { return d.added === 0 && d.updated === 0 && d.removed === 0; }
function fmtDiff(d: Diff): string {
  const parts: string[] = [];
  if (d.added) parts.push(`+${d.added}`);
  if (d.updated) parts.push(`~${d.updated}`);
  if (d.removed) parts.push(`-${d.removed}`);
  return parts.length ? parts.join(" / ") : "—";
}

// Extract "Gemeinde"-Label aus Pfad: wiki/Bundesland/Landkreis/Gemeinde/(Unter…/)?{kind}.json
function locationFromPath(path: string): string {
  const parts = path.split("/");
  // wiki[0] / Bundesland[1] / Landkreis[2] / [Gemeinde[3] / [Unter…] /] kind.json
  if (parts.length === 4) return `${parts[2]!} (LK-Ebene)`;
  return parts.slice(3, -1).join(" / ");
}

function kindFromPath(path: string): Kind {
  return path.match(/\/(news|events|amtsblatt|notices)\.json$/)![1] as Kind;
}

const files = modifiedFiles();
if (files.length === 0) {
  console.log("Keine geänderten JSON-Dateien — UPDATES.md nicht angepasst.");
  process.exit(0);
}

// Aggregate: { location → { kind → Diff } }
const agg = new Map<string, Partial<Record<Kind, Diff>>>();
for (const file of files) {
  const kind = kindFromPath(file);
  const loc = locationFromPath(file);
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as { items?: ItemLike[] }) : { items: [] };
  const old = (gitHeadJson(file) as { items?: ItemLike[] } | null) ?? { items: [] };
  const d = diffItems(old.items ?? [], current.items ?? []);
  if (isEmpty(d)) continue;
  if (!agg.has(loc)) agg.set(loc, {});
  agg.get(loc)![kind] = d;
}

if (agg.size === 0) {
  console.log("Keine inhaltlichen Änderungen — UPDATES.md nicht angepasst.");
  process.exit(0);
}

// Build Markdown table
const rows = [...agg.entries()].sort(([a], [b]) => a.localeCompare(b));
const headerCells = ["Gemeinde", ...KINDS];
const lines = [
  `| ${headerCells.join(" | ")} |`,
  `|${headerCells.map(() => "---").join("|")}|`,
];
for (const [loc, kinds] of rows) {
  const cells = [loc, ...KINDS.map((k) => (kinds[k] ? fmtDiff(kinds[k]!) : "—"))];
  lines.push(`| ${cells.join(" | ")} |`);
}

// Heading: ISO-Datum + Uhrzeit (lokal)
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

// Totals
let totalA = 0, totalU = 0, totalR = 0;
for (const kinds of agg.values()) for (const k of KINDS) {
  const d = kinds[k]; if (d) { totalA += d.added; totalU += d.updated; totalR += d.removed; }
}

const block = `## ${stamp}\n\n` +
  `Insgesamt **${totalA} neu**, **${totalU} aktualisiert**, **${totalR} entfernt** in ${agg.size} Quelle${agg.size === 1 ? "" : "n"}.\n\n` +
  lines.join("\n") + "\n";

const updatesPath = `${ROOT}/UPDATES.md`;
let existingContent = "";
if (existsSync(updatesPath)) existingContent = readFileSync(updatesPath, "utf-8");

let newContent: string;
if (existingContent.startsWith("# Updates")) {
  // Header bleibt, neuer Block direkt darunter
  const headerEnd = existingContent.indexOf("\n\n");
  if (headerEnd === -1) newContent = `${existingContent}\n\n${block}\n`;
  else newContent = `${existingContent.slice(0, headerEnd + 2)}${block}\n${existingContent.slice(headerEnd + 2)}`;
} else {
  const header = `# Updates\n\nÄnderungslog der Scraper. Automatisch befüllt von \`scripts/append-update-log.ts\` (nach Scraper-Lauf + \`normalize-updated-at\`).\n\n`;
  newContent = `${header}${block}\n${existingContent}`;
}

writeFileSync(updatesPath, newContent);
console.log(`UPDATES.md erweitert: ${stamp} — ${agg.size} Quelle(n), +${totalA} ~${totalU} -${totalR}`);
