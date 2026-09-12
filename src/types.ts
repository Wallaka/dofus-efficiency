/** An item that can be bought/sold at the HDV or used as a crafting ingredient. */
export interface Item {
  id: string;
  name: string;
  /** Profession level of the item, if known. Purely informational for now. */
  level?: number;
}

/** One ingredient line inside a recipe. */
export interface Ingredient {
  itemId: string;
  quantity: number;
}

/** A crafting recipe: the ingredients produce one unit of `resultItemId`. */
export interface Recipe {
  id: string;
  resultItemId: string;
  /** Profession that crafts this, if known (e.g. "Boulanger"). */
  job?: string;
  ingredients: Ingredient[];
}

/**
 * The dynamic, market-specific data: current HDV unit price per item, in kamas.
 * Keyed by item id. This is exactly the data we will later fill from OCR'd
 * screenshots instead of typing.
 */
export type PriceMap = Record<string, number | undefined>;

/** Result of evaluating a recipe against the current prices. */
export interface CraftEvaluation {
  recipe: Recipe;
  resultItem: Item;
  /** Sum of ingredient unit prices * quantities. undefined if any price missing. */
  craftCost?: number;
  /** Unit sell price of the crafted item. undefined if missing. */
  sellPrice?: number;
  /** sellPrice - craftCost. undefined if either side is missing. */
  margin?: number;
  /** margin / craftCost, as a ratio (0.25 = +25%). undefined if not computable. */
  marginRatio?: number;
  /** Ingredient item ids that have no known price yet. */
  missingPriceItemIds: string[];
}
