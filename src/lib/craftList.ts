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

/** Turn a stored entry into the Recipe/itemsById shape evaluateRecipe expects. */
export function evaluateEntry(
  entry: CraftEntry,
  prices: PriceMap,
): CraftEvaluation {
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
  return evaluateRecipe(recipe, itemsById, prices);
}
