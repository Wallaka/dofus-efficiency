#!/usr/bin/env node
/**
 * Build the bundled HDV catalog from pasted DofusDB responses.
 *
 * You drop raw DofusDB `/items` JSON into `catalog-src/<Tab>/<Category>.json`
 * (folder = HDV tab, file = category). This script flattens every file into a
 * clean tab → category → items tree and writes `src/data/catalog.generated.ts`.
 *
 * Each file may contain any of:
 *   - a bare array of items:            [ { id, name, img, level }, … ]
 *   - a Feathers page object:           { total, data: [ … ] }
 *   - an array of page objects (pages): [ { data: […] }, { data: […] } ]
 * so you can paste one page, several pages, or just the data array.
 *
 * Usage: node scripts/build-catalog.mjs   (or: npm run build:catalog)
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC_DIR = join(ROOT, "catalog-src");
const OUT_FILE = join(ROOT, "src", "data", "catalog.generated.ts");

/** Preferred tab order (others follow, alphabetically). Mirrors the HDV tabs. */
const TAB_ORDER = ["Ressources", "Consommables", "Équipements", "Familiers", "Divers"];

/** Reduce a DofusDB raw item to our catalog shape (mirrors dofusApi's toItem). */
export function normalizeItem(raw) {
  if (raw == null || raw.id == null) return null;
  const name =
    (raw.name && (raw.name.fr || raw.name.en)) ||
    (typeof raw.name === "string" ? raw.name : "") ||
    `#${raw.id}`;
  const item = { id: String(raw.id), name: String(name).trim() };
  if (raw.img) item.img = raw.img;
  if (typeof raw.level === "number") item.level = raw.level;
  return item;
}

/** Pull the item array out of whatever shape a pasted file holds. */
export function flattenRawItems(parsed) {
  if (Array.isArray(parsed)) {
    // Array of items, or array of page objects.
    return parsed.flatMap((el) =>
      el && typeof el === "object" && Array.isArray(el.data) ? el.data : [el],
    );
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.data)) {
    return parsed.data;
  }
  return [];
}

/** Turn one file's parsed JSON into a deduped, sorted list of catalog items. */
export function itemsFromParsed(parsed) {
  const byId = new Map();
  for (const raw of flattenRawItems(parsed)) {
    const item = normalizeItem(raw);
    if (item && !byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Order tabs by the preferred list, then alphabetically. */
function tabRank(tab) {
  const i = TAB_ORDER.indexOf(tab);
  return i === -1 ? TAB_ORDER.length : i;
}

/** Build the full catalog tree from [{ tab, category, parsed }] entries. */
export function buildCatalog(entries) {
  const tabs = new Map();
  for (const { tab, category, parsed } of entries) {
    if (!tabs.has(tab)) tabs.set(tab, new Map());
    const cats = tabs.get(tab);
    const items = itemsFromParsed(parsed);
    // Merge if the same category is split across files.
    const existing = cats.get(category);
    if (existing) {
      const seen = new Set(existing.map((it) => it.id));
      for (const it of items) if (!seen.has(it.id)) existing.push(it);
      existing.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    } else {
      cats.set(category, items);
    }
  }
  return [...tabs.entries()]
    .sort((a, b) => tabRank(a[0]) - tabRank(b[0]) || a[0].localeCompare(b[0], "fr"))
    .map(([tab, cats]) => ({
      tab,
      categories: [...cats.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "fr"))
        .map(([category, items]) => ({ category, items })),
    }));
}

/** Recursively collect JSON files under catalog-src as {tab, category, parsed}. */
function collectEntries(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...collectEntries(full));
      continue;
    }
    if (!name.endsWith(".json")) continue;
    const rel = relative(SRC_DIR, full).split(sep);
    // <Tab>/<Category>.json → [tab, category]; a top-level file → Ressources tab.
    const tab = rel.length >= 2 ? rel[0] : "Ressources";
    const category = basename(name, ".json");
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, "utf8"));
    } catch (err) {
      console.error(`[build-catalog] skipping ${rel.join("/")}: ${err.message}`);
      continue;
    }
    entries.push({ tab, category, parsed });
  }
  return entries;
}

function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`[build-catalog] no ${relative(ROOT, SRC_DIR)}/ — nothing to build.`);
    return;
  }
  const entries = collectEntries(SRC_DIR);
  const catalog = buildCatalog(entries);
  const count = catalog.reduce(
    (n, t) => n + t.categories.reduce((m, c) => m + c.items.length, 0),
    0,
  );

  const banner =
    "import type { CatalogTab } from \"./catalog\";\n\n" +
    "/**\n * AUTO-GENERATED — do not edit by hand.\n" +
    " * Run `npm run build:catalog` to regenerate from `catalog-src/`.\n */\n\n";
  const body =
    `export const CATALOG_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};\n\n` +
    `export const CATALOG: CatalogTab[] = ${JSON.stringify(catalog, null, 2)};\n`;
  writeFileSync(OUT_FILE, banner + body);

  const summary = catalog
    .map((t) => `${t.tab} (${t.categories.reduce((m, c) => m + c.items.length, 0)})`)
    .join(", ");
  console.log(
    `[build-catalog] wrote ${count} items across ${catalog.length} tab(s): ${summary || "—"}`,
  );
}

// Only run when invoked directly (so tests can import the pure functions).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
