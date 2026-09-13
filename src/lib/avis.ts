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
  /** Picture: the bounty monster's image when matched, else the aviton coin. */
  img?: string;
  /** The "Coffre de …" chest item. */
  chestItemId?: string;
  chestName?: string;
  chestImg?: string;
  /** The "Carte de …" hunt map — the item you buy/consume to do the avis (a cost). */
  carteItemId?: string;
  carteName?: string;
  carteImg?: string;
  /** The resource inside the chest ("<Type> de …") — the valuable, priceable drop. */
  resourceItemId?: string;
  resourceName?: string;
  resourceImg?: string;
}

/**
 * Avis, monster and chest carry no shared id — only the criminal's name links
 * them. These helpers derive a normalized key (accent/case-insensitive) so we
 * can match a quest ("On recherche X") to its bounty monster ("X") and its
 * chest ("Coffre de X").
 */
function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function questCriminalKey(name: string): string {
  return normalizeKey(name).replace(/^on recherche\s+/, "").trim();
}

/** The criminal's display name from a quest name ("On recherche X" → "X"). */
export function questCriminalName(name: string): string {
  return name.replace(/^On recherche\s+/i, "").trim();
}

export function monsterCriminalKey(name: string): string {
  return normalizeKey(name);
}

export function chestCriminalKey(name: string): string {
  return normalizeKey(name).replace(/^coffre de\s+/, "").trim();
}

export function carteCriminalKey(name: string): string {
  return normalizeKey(name).replace(/^carte de\s+/, "").trim();
}

/**
 * Inputs to an avis's benefit.
 *
 * Benefit = what you get back − what you spend:
 *   gain  = resource sale  (+ aviton conversion — not handled yet, see below)
 *   cost  = the "Carte de …" you buy + an optional spot participation fee
 *
 * Avitons are a real part of the gain, but their value depends on a conversion
 * we don't model yet; `avitonValue` is reserved so it can be folded in later
 * without changing callers.
 */
export interface AvisBenefitInput {
  /** HDV price of the "Carte de …" you must buy (a cost). */
  cartePrice?: number;
  /** HDV price of the resource you sell (a gain). */
  resourcePrice?: number;
  /** Optional flat fee paid to join a hunt "spot" (a cost). */
  participationCost?: number;
  /** Reserved: value of the avitons once conversion is handled (a gain). */
  avitonValue?: number;
}

export interface AvisBenefit {
  /** Net benefit in kamas, or undefined when a required price is missing. */
  value?: number;
  /** True when every price needed for a real number is known. */
  complete: boolean;
}

/**
 * Net benefit of doing one avis. Needs both the carte cost and the resource
 * price to be a real number; the participation fee defaults to 0, and the
 * aviton value is not counted yet.
 */
export function computeAvisBenefit(input: AvisBenefitInput): AvisBenefit {
  const {
    cartePrice,
    resourcePrice,
    participationCost = 0,
    avitonValue = 0,
  } = input;
  if (cartePrice == null || resourcePrice == null) {
    return { complete: false };
  }
  const gain = resourcePrice + avitonValue;
  const cost = cartePrice + participationCost;
  return { value: gain - cost, complete: true };
}

/** The fetched catalog, cached with a timestamp. */
export interface AvisCatalog {
  list: AvisReward[];
  fetchedAt: number;
}
