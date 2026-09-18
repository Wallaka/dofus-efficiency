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

/** Accent/case-insensitive normalization for name matching. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Every catalog item, flattened and de-duplicated by id (built once, cached). */
let flatCache: CatalogItem[] | null = null;
export function catalogItems(): CatalogItem[] {
  if (flatCache) return flatCache;
  const byId = new Map<string, CatalogItem>();
  for (const tab of CATALOG) {
    for (const cat of tab.categories) {
      for (const it of cat.items) if (!byId.has(it.id)) byId.set(it.id, it);
    }
  }
  flatCache = [...byId.values()];
  return flatCache;
}

/** Offline name search over the bundled catalog (accent/case-insensitive). */
export function searchCatalog(query: string, limit = 12): CatalogItem[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const out: CatalogItem[] = [];
  for (const it of catalogItems()) {
    if (norm(it.name).includes(q)) {
      out.push(it);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Find a catalog item by exact (normalized) name — for seeding known items. */
export function findCatalogItemByName(name: string): CatalogItem | undefined {
  const target = norm(name);
  return catalogItems().find((it) => norm(it.name) === target);
}
