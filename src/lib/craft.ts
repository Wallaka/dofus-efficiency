import type {
  CraftEvaluation,
  Item,
  PriceMap,
  Recipe,
} from "../types";

/**
 * Evaluate a single recipe against the current price map.
 *
 * The craft cost is only computed when every ingredient has a known price;
 * a partial cost would be misleading (the manifesto values honest numbers over
 * fake-precise ones). Missing ingredient prices are reported instead.
 */
export function evaluateRecipe(
  recipe: Recipe,
  itemsById: Map<string, Item>,
  prices: PriceMap,
): CraftEvaluation {
  const resultItem = itemsById.get(recipe.resultItemId) ?? {
    id: recipe.resultItemId,
    name: recipe.resultItemId,
  };

  const missingPriceItemIds: string[] = [];
  let craftCost: number | undefined = 0;

  for (const ing of recipe.ingredients) {
    const unit = prices[ing.itemId];
    if (unit == null) {
      missingPriceItemIds.push(ing.itemId);
      craftCost = undefined; // can't trust a partial total
    } else if (craftCost !== undefined) {
      craftCost += unit * ing.quantity;
    }
  }

  const sellPrice = prices[recipe.resultItemId];

  let margin: number | undefined;
  let marginRatio: number | undefined;
  if (craftCost !== undefined && sellPrice != null) {
    margin = sellPrice - craftCost;
    marginRatio = craftCost > 0 ? margin / craftCost : undefined;
  }

  return {
    recipe,
    resultItem,
    craftCost,
    sellPrice,
    margin,
    marginRatio,
    missingPriceItemIds,
  };
}

/**
 * Evaluate all recipes and rank them by margin (most profitable first).
 * Recipes with an unknown margin (missing prices) sort to the bottom so the
 * actionable ones are always on top.
 */
export function rankRecipes(
  recipes: Recipe[],
  items: Item[],
  prices: PriceMap,
): CraftEvaluation[] {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const evaluated = recipes.map((r) => evaluateRecipe(r, itemsById, prices));

  return evaluated.sort((a, b) => {
    const am = a.margin;
    const bm = b.margin;
    if (am === undefined && bm === undefined) return 0;
    if (am === undefined) return 1;
    if (bm === undefined) return -1;
    return bm - am;
  });
}
