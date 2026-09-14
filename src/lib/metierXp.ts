import type { Item, PriceMap } from "../types";

/**
 * Profession (métier) leveling maths, from the modern Dofus (2.29+) model.
 *
 * Two well-established facts drive everything:
 *  1. The XP to go from job level L to L+1 is `20 × L`, so the cumulative XP to
 *     reach level N is `10 · N · (N−1)` (e.g. level 100 = 10·100·99 = 99 000).
 *  2. A successful craft grants `20 × recipeLevel`, reduced by a penalty that
 *     grows with the gap between your job level and the recipe's level — so
 *     crafting an item *at* your level gives exactly one level's worth of XP
 *     ("1 craft ≈ 1 level"), and out-levelled recipes give steadily less.
 *
 * The penalty is modelled as `8 / (8 + gap)`, which fits the community-documented
 * breakpoints within ~2 % across the whole range (gap 1→0.89, 3→0.73, 8→0.50,
 * 22→0.27, 55→0.13). It's isolated here so it's trivial to refine. The XP is
 * therefore a close estimate; the *cost* side (from your prices) is exact, so
 * "kamas per XP" — what actually decides the cheapest craft — is trustworthy.
 */

/** XP required to advance from job level `level` to the next. */
export function xpToNextLevel(level: number): number {
  return 20 * Math.max(0, level);
}

/** Cumulative XP required to reach `level` (0 at level 1). */
export function cumulativeXp(level: number): number {
  const l = Math.max(1, level);
  return 10 * l * (l - 1);
}

/** XP kept when crafting a recipe `gap` levels below your job level (1 = at level). */
export function craftPenalty(gap: number): number {
  return 8 / (8 + Math.max(0, gap));
}

/**
 * XP from one successful craft of a recipe of `recipeLevel`, by a crafter at
 * `jobLevel`, scaled by an XP coefficient (1 = none, 1.2 = +20 %). Returns 0 for
 * a recipe above the crafter's level (can't be crafted yet).
 */
export function xpPerCraft(
  jobLevel: number,
  recipeLevel: number,
  coef = 1,
): number {
  if (recipeLevel > jobLevel || recipeLevel <= 0) return 0;
  return Math.round(20 * recipeLevel * craftPenalty(jobLevel - recipeLevel) * coef);
}

// --- Leveling plan --------------------------------------------------------

/** A recipe as the planner needs it: its result, level, slots, and ingredients. */
export interface MetierRecipe {
  recipeId: string;
  result: Item;
  resultLevel: number;
  /** Number of ingredient slots ("cases") — shown for info, not used for XP. */
  slots: number;
  ingredients: { item: Item; quantity: number }[];
}

/** One aggregated ingredient line (a step's or the whole plan's shopping list). */
export interface PlanIngredient {
  item: Item;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
}

/** Sum a recipe's ingredient cost; undefined if any price is missing. */
export function recipeCost(
  recipe: MetierRecipe,
  prices: PriceMap,
): number | undefined {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const unit = prices[ing.item.id];
    if (unit == null) return undefined;
    total += unit * ing.quantity;
  }
  return total;
}

/** Total XP to go from level `from` to level `to`. */
export function xpBetween(from: number, to: number): number {
  return cumulativeXp(Math.min(200, to)) - cumulativeXp(Math.max(1, from));
}

/** The full plan for reaching a target by spamming one chosen recipe. */
export interface RecipePlan {
  recipe: MetierRecipe;
  /** XP/craft at the starting level (it drifts down as you out-level the recipe). */
  xpPerCraft: number;
  /** Total successful crafts to go from `from` to `to` with this recipe. */
  crafts: number;
  /** crafts × recipe cost; undefined if any ingredient price is missing. */
  cost?: number;
  /** cost ÷ total XP; undefined if the cost is unknown. */
  costPerXp?: number;
  /** This recipe's ingredients scaled to the whole run — the shopping list. */
  shopping: PlanIngredient[];
  /** True when at least one ingredient price is missing. */
  incomplete: boolean;
}

/**
 * How many crafts of one recipe it takes to go from `fromLevel` to `toLevel`,
 * summed level by level so the growing out-level penalty is accounted for, plus
 * the resulting cost and shopping list. Assumes the recipe is craftable over the
 * range (its level ≤ fromLevel); callers filter to those.
 */
export function planRecipeToTarget(
  recipe: MetierRecipe,
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
): RecipePlan {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(200, Math.floor(toLevel));

  let crafts = 0;
  for (let level = from; level < to; level++) {
    const xpc = xpPerCraft(level, recipe.resultLevel, coef);
    if (xpc <= 0) continue;
    crafts += Math.ceil(xpToNextLevel(level) / xpc);
  }

  const unitCost = recipeCost(recipe, prices);
  const cost = unitCost != null ? unitCost * crafts : undefined;
  const totalXp = xpBetween(from, to);
  const costPerXp = cost != null && totalXp > 0 ? cost / totalXp : undefined;

  const shopping: PlanIngredient[] = recipe.ingredients.map((ing) => {
    const unit = prices[ing.item.id];
    const quantity = ing.quantity * crafts;
    return {
      item: ing.item,
      quantity,
      unitPrice: unit,
      subtotal: unit != null ? unit * quantity : undefined,
    };
  });

  return {
    recipe,
    xpPerCraft: xpPerCraft(from, recipe.resultLevel, coef),
    crafts,
    cost,
    costPerXp,
    shopping,
    incomplete: recipe.ingredients.some((ing) => prices[ing.item.id] == null),
  };
}

/**
 * Plan every recipe craftable at `fromLevel` for reaching `toLevel`, cheapest
 * first (by total cost; recipes with a missing price sort last, by fewest
 * crafts). The first entry is the recommended recipe.
 */
export function planRecipesToTarget(
  recipes: MetierRecipe[],
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
): RecipePlan[] {
  const from = Math.max(1, Math.floor(fromLevel));
  const plans = recipes
    .filter((r) => r.resultLevel <= from && xpPerCraft(from, r.resultLevel, coef) > 0)
    .map((r) => planRecipeToTarget(r, prices, fromLevel, toLevel, coef));

  plans.sort((a, b) => {
    if (a.cost == null && b.cost == null) return a.crafts - b.crafts;
    if (a.cost == null) return 1;
    if (b.cost == null) return -1;
    return a.cost - b.cost;
  });
  return plans;
}
