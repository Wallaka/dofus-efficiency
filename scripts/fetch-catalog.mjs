#!/usr/bin/env node
/**
 * Fetch the HDV catalog straight from the DofusDB API and build the bundled
 * snapshot — no copy/paste. Run it LOCALLY (this repo's remote sandbox can't
 * reach api.dofusdb.fr; your machine can):
 *
 *   npm run fetch:catalog                 # default: Ressources
 *   npm run fetch:catalog -- 9 34 9      # explicit super-type ids
 *
 * What it does:
 *   1. GET /item-super-types  → names the HDV tabs.
 *   2. GET /item-types        → the categories (one "type" = one category),
 *                               filtered to the wanted super-type ids.
 *   3. GET /items?typeId=…    → every item in each category, paginated.
 *   4. Writes raw pages to catalog-src/<Tab>/<Category>.json (the committed
 *      snapshot source) and regenerates src/data/catalog.generated.ts.
 *
 * Node 20+ (uses global fetch). Re-runnable; it overwrites the raw files.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromDisk } from "./build-catalog.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC_DIR = join(ROOT, "catalog-src");
const BASE = "https://api.dofusdb.fr";
const PAGE = 50;
const PAUSE_MS = 120; // be polite between calls

/** Super-type ids to pull. Default: 9 = Ressources. Override via CLI args. */
const SUPER_TYPE_IDS = process.argv.slice(2).map(Number).filter(Boolean);
const WANT = new Set(SUPER_TYPE_IDS.length ? SUPER_TYPE_IDS : [9]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      const wait = 500 * 2 ** (attempt - 1);
      console.warn(`  … ${err.message}, retry ${attempt}/${tries - 1} in ${wait}ms`);
      await sleep(wait);
    }
  }
}

const fr = (name, fallback) =>
  (name && (name.fr || name.en)) ||
  (typeof name === "string" ? name : "") ||
  fallback;

/** Fetch every page of a Feathers collection, returning all rows. */
async function getAll(path, params = "") {
  const rows = [];
  for (let skip = 0; ; skip += PAGE) {
    const url = `${BASE}/${path}?$limit=${PAGE}&$skip=${skip}&lang=fr${params}`;
    const page = await getJson(url);
    const data = Array.isArray(page?.data) ? page.data : [];
    rows.push(...data);
    const total = typeof page?.total === "number" ? page.total : rows.length;
    if (data.length === 0 || rows.length >= total) break;
    await sleep(PAUSE_MS);
  }
  return rows;
}

/** Filesystem-safe category file name (keep accents; drop path separators). */
const safe = (s) => s.replace(/[\\/:*?"<>|]/g, "-").trim() || "Divers";

async function main() {
  console.log(`[fetch-catalog] super-types: ${[...WANT].join(", ")}`);

  const superTypes = await getAll("item-super-types");
  const superName = new Map(superTypes.map((st) => [st.id, fr(st.name, `super-${st.id}`)]));

  const types = await getAll("item-types");
  const wantedTypes = types.filter((t) => WANT.has(t.superTypeId));
  console.log(`[fetch-catalog] ${wantedTypes.length} categories to fetch`);

  // Fresh start for the tabs we're rebuilding, so removed items don't linger.
  for (const stId of WANT) {
    const dir = join(SRC_DIR, safe(superName.get(stId) ?? `super-${stId}`));
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  let total = 0;
  for (const type of wantedTypes) {
    const tab = safe(superName.get(type.superTypeId) ?? "Ressources");
    const category = fr(type.name, `type-${type.id}`);
    const items = await getAll("items", `&typeId=${type.id}`);
    if (items.length === 0) continue;
    const slim = items.map((it) => ({
      id: it.id,
      name: { fr: fr(it.name, `#${it.id}`) },
      img: it.img,
      level: it.level,
    }));
    const dir = join(SRC_DIR, tab);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${safe(category)}.json`), JSON.stringify(slim, null, 2));
    total += slim.length;
    console.log(`  ${tab}/${category}: ${slim.length}`);
    await sleep(PAUSE_MS);
  }

  console.log(`[fetch-catalog] fetched ${total} items; regenerating bundle…`);
  buildFromDisk();
}

main().catch((err) => {
  console.error(`[fetch-catalog] failed: ${err.message}`);
  process.exit(1);
});
