/**
 * "Avis de recherche" — legendary-hunt wanted notices, sourced from DofusDB.
 *
 * They live in the `quests` collection under category 6, and each one rewards
 * avitons (item #13052) — that reward is what we read to build the catalog. The
 * chest resource and the criminal's picture are NOT on the quest object; they're
 * enrichment we resolve separately (chest item + monster) and will be wired in
 * once the avis→chest / avis→monster link is settled.
 */

/** Aviton reward item id in DofusDB. */
export const AVITON_ITEM_ID = 13052;

/** Quests category that holds the avis de recherche. */
export const AVIS_CATEGORY_ID = 6;

export interface AvisReward {
  /** DofusDB quest id. */
  id: number;
  /** French name, e.g. "On recherche Padgref Demoël". */
  name: string;
  /** Required level (levelMin). */
  level?: number;
  /** Aviton reward quantity. */
  avitons: number;
  /** Icon URL (the aviton coin, until the monster image is wired in). */
  img?: string;
}

/** The fetched catalog, cached with a timestamp. */
export interface AvisCatalog {
  list: AvisReward[];
  fetchedAt: number;
}
