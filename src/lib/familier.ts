import type { PriceMap } from "../types";
import { findCatalogItemByName } from "../data/catalog";

/**
 * "Familier" (pet) leveling economics: the cheapest way to feed a pet to level
 * 100, so it can be resold. Deliberately generic — rather than model Dofus's
 * per-pet foods, cooldowns and per-meal caps, we treat feeding as "XP per unit"
 * of a food you choose, with its price. That's enough to compare foods by
 * kamas/XP and see what a level-100 pet actually costs to make.
 */

/** XP a pet needs to reach level 100 (the page's default goal). */
export const PET_TARGET_XP = 196159;

/** A candidate food: a catalog item with a user-entered XP-per-unit value. */
export interface FamilierFood {
  itemId: string;
  name: string;
  img?: string;
  /** XP granted per unit fed. undefined until the user enters it. */
  xp?: number;
}

/** The persisted page state: the XP goal and the chosen foods. */
export interface FamilierInput {
  /** XP goal (defaults to level 100). */
  targetXp: number;
  foods: FamilierFood[];
}

/** One food costed against the target and the current prices. */
export interface FoodResult {
  food: FamilierFood;
  /** Unit price from the shared store, if known. */
  price?: number;
  /** kamas per XP (price / xp); undefined if xp or price is unknown. Lower is better. */
  perXp?: number;
  /** Units needed to reach the target with this food; undefined if xp unknown. */
  unitsNeeded?: number;
  /** unitsNeeded × price; undefined if the price is unknown. */
  totalCost?: number;
  /** Both xp and price known → fully costable. */
  priced: boolean;
}

/** Cost one food against the target XP and the shared price map. */
export function evaluateFood(
  food: FamilierFood,
  prices: PriceMap,
  targetXp: number,
): FoodResult {
  const price = prices[food.itemId];
  const xp = food.xp;
  let perXp: number | undefined;
  let unitsNeeded: number | undefined;
  let totalCost: number | undefined;
  if (xp != null && xp > 0) {
    unitsNeeded = Math.ceil(Math.max(0, targetXp) / xp);
    if (price != null) {
      perXp = price / xp;
      totalCost = unitsNeeded * price;
    }
  }
  return {
    food,
    price,
    perXp,
    unitsNeeded,
    totalCost,
    priced: xp != null && xp > 0 && price != null,
  };
}

/**
 * Rank foods cheapest-first by kamas/XP. Fully-costable foods come first
 * (cheapest kamas/XP on top), then foods with an XP but no price, then the rest
 * — so the actionable, cheapest option is always at the top.
 */
export function rankFoods(results: FoodResult[]): FoodResult[] {
  return [...results].sort((a, b) => {
    if (a.perXp != null && b.perXp != null) return a.perXp - b.perXp;
    if (a.perXp != null) return -1;
    if (b.perXp != null) return 1;
    const ax = a.food.xp != null && a.food.xp > 0;
    const bx = b.food.xp != null && b.food.xp > 0;
    if (ax !== bx) return ax ? -1 : 1;
    return a.food.name.localeCompare(b.food.name, "fr");
  });
}

// --- Persistence -----------------------------------------------------------

const KEY = "dofus-efficiency:familier:v1";

function isFood(x: unknown): x is FamilierFood {
  if (!x || typeof x !== "object") return false;
  const f = x as FamilierFood;
  return (
    typeof f.itemId === "string" &&
    typeof f.name === "string" &&
    (f.xp == null || typeof f.xp === "number")
  );
}

/** First-visit seed: the enriched kibble (500 XP) if it's in the catalog. */
function defaultFoods(): FamilierFood[] {
  const c = findCatalogItemByName("Croquette enrichie");
  return c ? [{ itemId: c.id, name: c.name, img: c.img, xp: 500 }] : [];
}

export function loadFamilier(): FamilierInput {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { targetXp: PET_TARGET_XP, foods: defaultFoods() };
    const parsed = JSON.parse(raw) as Partial<FamilierInput>;
    const targetXp =
      typeof parsed.targetXp === "number" && parsed.targetXp > 0
        ? parsed.targetXp
        : PET_TARGET_XP;
    const foods = Array.isArray(parsed.foods) ? parsed.foods.filter(isFood) : [];
    return { targetXp, foods };
  } catch {
    return { targetXp: PET_TARGET_XP, foods: defaultFoods() };
  }
}

export function saveFamilier(input: FamilierInput): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // non-fatal (quota / private mode)
  }
}
