import type { Item, Recipe } from "../types";

/**
 * Adapter for the live DofusDB API (https://api.dofusdb.fr) — a Feathers-style
 * JSON API. This runs in the browser (where the API is reachable); the dev
 * sandbox blocks external egress, so it can only be exercised from a real
 * browser, not from CI/tooling.
 *
 * Endpoints used (confirmed shapes):
 *   GET /recipes → { total, limit, skip, data: [{ resultId, ingredientIds[],
 *                    quantities[], jobId, resultLevel }] }
 *   GET /items   → { total, limit, skip, data: [{ id, name: {fr,en,…}, level }] }
 *   GET /jobs    → { ..., data: [{ id, name: {fr,en,…} }] }  (best-effort)
 *
 * Strategy: fetch recipes within a level range (bounds the load), collect every
 * item id they reference, then fetch just those items to resolve names.
 */

export const DOFUSDB_BASE_URL = "https://api.dofusdb.fr";

/** How many recipe pages we'll ever fetch, as a safety valve against runaway loops. */
const MAX_PAGES = 60;
const PAGE_SIZE = 50;
/** DofusDB caps the length of an `$in` array; keep id batches comfortably under it. */
const ID_BATCH_SIZE = 50;

interface FeathersPage<T> {
  total: number;
  limit: number;
  skip: number;
  data: T[];
}

type Translated = { fr?: string; en?: string; [lang: string]: string | undefined };

interface RawItem {
  id: number;
  name?: Translated;
  level?: number;
}

interface RawRecipe {
  resultId: number;
  ingredientIds?: number[];
  quantities?: number[];
  jobId?: number;
  resultLevel?: number;
}

interface RawJob {
  id: number;
  name?: Translated;
}

export interface LoadOptions {
  minLevel?: number;
  maxLevel?: number;
  signal?: AbortSignal;
}

export interface CraftDataset {
  items: Item[];
  recipes: Recipe[];
}

/** Prefer the French name, fall back to English, then to a stable placeholder. */
function pickName(name: Translated | undefined, fallback: string): string {
  return name?.fr?.trim() || name?.en?.trim() || fallback;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`DofusDB a répondu ${res.status} (${res.statusText})`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch every page of a Feathers collection matching `query` (a pre-built query
 * string without pagination params). Stops at MAX_PAGES as a safety valve.
 */
async function fetchAllPages<T>(
  path: string,
  query: string,
  signal?: AbortSignal,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = [];
  let skip = 0;

  for (let page = 0; page < maxPages; page++) {
    const sep = query ? "&" : "";
    const url = `${DOFUSDB_BASE_URL}${path}?${query}${sep}$limit=${PAGE_SIZE}&$skip=${skip}`;
    const res = await getJson<FeathersPage<T>>(url, signal);
    const batch = res.data ?? [];
    out.push(...batch);

    skip += res.limit || PAGE_SIZE;
    const total = res.total ?? out.length;
    if (batch.length === 0 || skip >= total) break;
  }

  return out;
}

/** Resolve item ids to normalized Items, fetching only the ids we actually need. */
async function fetchItemsByIds(
  ids: number[],
  signal?: AbortSignal,
): Promise<Map<number, Item>> {
  const byId = new Map<number, Item>();
  const unique = [...new Set(ids)];

  for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) {
    const batch = unique.slice(i, i + ID_BATCH_SIZE);
    const query = batch.map((id) => `id[$in][]=${id}`).join("&");
    const raw = await fetchAllPages<RawItem>("/items", query, signal, 3);
    for (const it of raw) {
      byId.set(it.id, {
        id: String(it.id),
        name: pickName(it.name, `#${it.id}`),
        level: it.level,
      });
    }
  }

  return byId;
}

/** Best-effort jobId → job name map. Returns an empty map if /jobs is unavailable. */
async function fetchJobNames(signal?: AbortSignal): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const raw = await fetchAllPages<RawJob>("/jobs", "", signal, 5);
    for (const job of raw) {
      map.set(job.id, pickName(job.name, `Métier ${job.id}`));
    }
  } catch {
    // Non-fatal: recipes just won't show a profession name.
  }
  return map;
}

/**
 * Load a real craft dataset from DofusDB for the given result-item level range.
 * The level range keeps the number of recipes (and therefore requests) bounded.
 */
export async function loadCraftData(
  opts: LoadOptions = {},
): Promise<CraftDataset> {
  const minLevel = opts.minLevel ?? 1;
  const maxLevel = opts.maxLevel ?? 20;
  const { signal } = opts;

  const recipeQuery =
    `resultLevel[$gte]=${minLevel}&resultLevel[$lte]=${maxLevel}` +
    `&$sort[resultLevel]=1`;
  const rawRecipes = await fetchAllPages<RawRecipe>(
    "/recipes",
    recipeQuery,
    signal,
  );

  // Every item id we need a name for: results + all ingredients.
  const idSet = new Set<number>();
  for (const r of rawRecipes) {
    if (r.resultId != null) idSet.add(r.resultId);
    for (const ing of r.ingredientIds ?? []) idSet.add(ing);
  }

  const [itemsById, jobNames] = await Promise.all([
    fetchItemsByIds([...idSet], signal),
    fetchJobNames(signal),
  ]);

  // Normalize recipes, keeping ids unique even if an item has several recipes.
  const recipes: Recipe[] = [];
  const recipeCountByResult = new Map<number, number>();
  for (const r of rawRecipes) {
    if (r.resultId == null || !Array.isArray(r.ingredientIds)) continue;

    const ingredients = r.ingredientIds.map((itemId, idx) => ({
      itemId: String(itemId),
      quantity: r.quantities?.[idx] ?? 1,
    }));

    const seen = recipeCountByResult.get(r.resultId) ?? 0;
    recipeCountByResult.set(r.resultId, seen + 1);
    const id = seen === 0 ? `r-${r.resultId}` : `r-${r.resultId}-${seen}`;

    recipes.push({
      id,
      resultItemId: String(r.resultId),
      job: r.jobId != null ? jobNames.get(r.jobId) : undefined,
      ingredients,
    });
  }

  // Make sure every referenced item exists in the items list, even if the
  // /items fetch didn't return it (so the UI never shows a bare numeric id).
  const items = new Map<string, Item>();
  for (const it of itemsById.values()) items.set(it.id, it);
  for (const id of idSet) {
    const key = String(id);
    if (!items.has(key)) items.set(key, { id: key, name: `#${key}` });
  }

  return { items: [...items.values()], recipes };
}
