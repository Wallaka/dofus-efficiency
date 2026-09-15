import { CATALOG, CATALOG_GENERATED_AT } from "./catalog.generated";

/**
 * The in-app HDV catalog: a bundled snapshot of DofusDB items grouped like the
 * game's marketplace (tab → category → items). It ships in the repo (offline,
 * instant, identical for everyone) and is regenerated from pasted DofusDB
 * responses by `scripts/build-catalog.mjs` — see `catalog-src/README.md`.
 */

export interface CatalogItem {
  /** DofusDB item id, as a string (matches the price store's itemId). */
  id: string;
  name: string;
  img?: string;
  level?: number;
}

/** One in-game sub-category (e.g. "Bois", "Céréales"). */
export interface CatalogCategory {
  category: string;
  items: CatalogItem[];
}

/** One HDV top-tab (e.g. "Ressources"), holding its categories. */
export interface CatalogTab {
  tab: string;
  categories: CatalogCategory[];
}

export function loadCatalog(): CatalogTab[] {
  return CATALOG;
}

/** When the bundled snapshot was last regenerated (ISO string, "" if never). */
export const catalogGeneratedAt = CATALOG_GENERATED_AT;

/** Total item count across the whole catalog. */
export function catalogItemCount(): number {
  return CATALOG.reduce(
    (n, t) => n + t.categories.reduce((m, c) => m + c.items.length, 0),
    0,
  );
}
