import type { Item, PriceMap, Recipe, CraftEvaluation } from "../types";
import type { ResolvedRecipe } from "../data/dofusApi";
import { evaluateRecipe } from "./craft";

/**
 * The Craft page's list: crafts the user searched for and pinned, each with its
 * recipe resolved (result item + ingredients) so it renders and recomputes
 * without re-hitting DofusDB. Prices themselves live in the shared price store
 * (see trackedPrices.ts), not here — this is only the recipe catalog.
 */
export interface CraftEntry extends ResolvedRecipe {
  /** When it was added, ms since epoch. */
  addedAt: number;
}

const CRAFT_LIST_KEY = "dofus-efficiency:craftList:v1";
const CRAFT_TAX_KEY = "dofus-efficiency:craftTax:v1";

/** Default HDV sell tax, as a percentage of the sale price. */
export const DEFAULT_TAX_PERCENT = 2;

/** Evaluation of a craft, with the HDV sell tax folded into a net benefit. */
export interface CraftBenefit extends CraftEvaluation {
  /** Tax paid to sell at the HDV: sellPrice × rate, in kamas. undefined if no sell price. */
  tax?: number;
  /** Net margin after tax: sellPrice − tax − craftCost. undefined if not computable. */
  netMargin?: number;
  /** netMargin / craftCost, as a ratio. undefined if not computable. */
  netMarginRatio?: number;
}

function isItem(x: unknown): x is Item {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as Item).id === "string" &&
    typeof (x as Item).name === "string"
  );
}

/** Validate a stored entry defensively — a bad shape shouldn't break the page. */
function isCraftEntry(x: unknown): x is CraftEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as CraftEntry;
  return (
    typeof e.recipeId === "string" &&
    isItem(e.resultItem) &&
    Array.isArray(e.ingredients) &&
    e.ingredients.every((i) => isItem(i?.item) && typeof i?.quantity === "number")
  );
}

export function loadCraftList(): CraftEntry[] {
  try {
    const raw = localStorage.getItem(CRAFT_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(isCraftEntry);
    return [];
  } catch {
    return [];
  }
}

export function saveCraftList(entries: CraftEntry[]): void {
  try {
    localStorage.setItem(CRAFT_LIST_KEY, JSON.stringify(entries));
  } catch {
    // non-fatal (quota / private mode)
  }
}

/** The HDV sell-tax percentage, persisted; falls back to the default. */
export function loadCraftTaxPercent(): number {
  try {
    const raw = localStorage.getItem(CRAFT_TAX_KEY);
    if (raw == null) return DEFAULT_TAX_PERCENT;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TAX_PERCENT;
  } catch {
    return DEFAULT_TAX_PERCENT;
  }
}

export function saveCraftTaxPercent(percent: number): void {
  try {
    localStorage.setItem(CRAFT_TAX_KEY, String(percent));
  } catch {
    // non-fatal
  }
}

/**
 * Evaluate a stored entry against the current prices, then fold in the HDV sell
 * tax (a fraction, e.g. 0.02 for 2 %). The tax is charged on the sale price, so
 * the net benefit is sellPrice − tax − craftCost — only when both are known.
 */
export function evaluateEntry(
  entry: CraftEntry,
  prices: PriceMap,
  taxRate = 0,
): CraftBenefit {
  const recipe: Recipe = {
    id: entry.recipeId,
    resultItemId: entry.resultItem.id,
    job: entry.job,
    ingredients: entry.ingredients.map((i) => ({
      itemId: i.item.id,
      quantity: i.quantity,
    })),
  };
  const itemsById = new Map<string, Item>();
  itemsById.set(entry.resultItem.id, entry.resultItem);
  for (const i of entry.ingredients) itemsById.set(i.item.id, i.item);
  const base = evaluateRecipe(recipe, itemsById, prices);

  const { craftCost, sellPrice } = base;
  const tax = sellPrice != null ? Math.round(sellPrice * taxRate) : undefined;

  let netMargin: number | undefined;
  let netMarginRatio: number | undefined;
  if (craftCost != null && sellPrice != null) {
    netMargin = sellPrice - (tax ?? 0) - craftCost;
    netMarginRatio = craftCost > 0 ? netMargin / craftCost : undefined;
  }

  return { ...base, tax, netMargin, netMarginRatio };
}
