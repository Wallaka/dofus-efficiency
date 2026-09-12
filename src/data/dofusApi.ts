import type { Item, Recipe } from "../types";

/**
 * Adapter for the live DofusDB API (https://api.dofusdb.fr).
 *
 * ⚠️ STUB — not wired up yet. Phase 0 runs entirely on the bundled sample data
 * (src/data/sampleData.ts). This file marks exactly where the real static data
 * (items + recipes) will come from, and isolates the mapping so the rest of the
 * app never depends on DofusDB's exact response shape.
 *
 * TODO (do this in the browser, where the API is reachable — the dev sandbox
 * blocks external egress):
 *   1. Confirm endpoints & response shape:
 *        GET https://api.dofusdb.fr/items?$limit=50&lang=fr
 *        GET https://api.dofusdb.fr/recipes?$limit=50
 *      Feathers-style API: responses look like { data, total, limit, skip },
 *      and localized names are typically objects like { fr, en, ... }.
 *   2. Fill in the mapping functions below.
 *   3. Cache the normalized result in IndexedDB so we don't refetch or depend
 *      on the API being up every load (static data rarely changes).
 */

export const DOFUSDB_BASE_URL = "https://api.dofusdb.fr";

export interface FetchOptions {
  lang?: "fr" | "en";
  signal?: AbortSignal;
}

/** Fetch and normalize items. Not implemented yet — see TODO above. */
export async function fetchItems(_opts: FetchOptions = {}): Promise<Item[]> {
  throw new Error(
    "dofusApi.fetchItems is not implemented yet — Phase 0 uses bundled sample data.",
  );
}

/** Fetch and normalize recipes. Not implemented yet — see TODO above. */
export async function fetchRecipes(_opts: FetchOptions = {}): Promise<Recipe[]> {
  throw new Error(
    "dofusApi.fetchRecipes is not implemented yet — Phase 0 uses bundled sample data.",
  );
}
