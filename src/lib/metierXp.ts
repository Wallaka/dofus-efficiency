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

/** One palier: a band of levels crafted with a single chosen recipe. */
export interface MetierStep {
  fromLevel: number;
  toLevel: number;
  recipe: MetierRecipe;
  /** XP/craft at the palier's starting level (it drifts down across the band). */
  xpPerCraft: number;
  crafts: number;
  /** recipe cost × crafts; undefined if any ingredient price is missing. */
  cost?: number;
  /** cost per XP for this step; undefined if the cost is unknown. */
  costPerXp?: number;
  ingredients: PlanIngredient[];
}

export interface MetierPlan {
  steps: MetierStep[];
  totalCrafts: number;
  totalXp: number;
  /** undefined if any step's cost is unknown. */
  totalCost?: number;
  /** undefined if the total cost is unknown. */
  avgCostPerXp?: number;
  shopping: PlanIngredient[];
  /** True when at least one ingredient price is missing (totals are partial). */
  incomplete: boolean;
  /** First level with no craftable recipe, if the plan can't reach the target. */
  stuckAtLevel?: number;
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

/** A recipe scored for a given job level: XP/craft, cost/craft and cost-per-XP. */
export interface RankedRecipe {
  recipe: MetierRecipe;
  xpPerCraft: number;
  cost?: number;
  costPerXp?: number;
}

/**
 * Rank a job's recipes for a crafter at `level` by cost-per-XP (cheapest first).
 * Only recipes you can craft (level ≤ yours) that still grant XP are included;
 * ones with a missing price sort last (by highest XP/craft).
 */
export function rankRecipes(
  recipes: MetierRecipe[],
  prices: PriceMap,
  level: number,
  coef = 1,
): RankedRecipe[] {
  const ranked: RankedRecipe[] = [];
  for (const recipe of recipes) {
    const xpc = xpPerCraft(level, recipe.resultLevel, coef);
    if (xpc <= 0) continue;
    const cost = recipeCost(recipe, prices);
    ranked.push({
      recipe,
      xpPerCraft: xpc,
      cost,
      costPerXp: cost != null ? cost / xpc : undefined,
    });
  }
  ranked.sort((a, b) => {
    if (a.costPerXp == null && b.costPerXp == null)
      return b.xpPerCraft - a.xpPerCraft;
    if (a.costPerXp == null) return 1;
    if (b.costPerXp == null) return -1;
    return a.costPerXp - b.costPerXp;
  });
  return ranked;
}

/** Pick the cheapest recipe (per XP) craftable at `level`; unpriced as a last resort. */
function pickRecipe(
  recipes: MetierRecipe[],
  level: number,
  prices: PriceMap,
  coef: number,
): MetierRecipe | undefined {
  return rankRecipes(recipes, prices, level, coef)[0]?.recipe;
}

/**
 * Build a leveling plan from `fromLevel` to `toLevel` for one job, choosing the
 * cheapest recipe at each level and merging consecutive levels that share a
 * recipe into paliers. No external XP data is needed — everything comes from the
 * formula above.
 */
export function buildLevelingPlan(
  recipes: MetierRecipe[],
  prices: PriceMap,
  fromLevel: number,
  toLevel: number,
  coef = 1,
): MetierPlan {
  const from = Math.max(1, Math.floor(fromLevel));
  const to = Math.min(200, Math.floor(toLevel));

  const steps: MetierStep[] = [];
  let stuckAtLevel: number | undefined;

  for (let level = from; level < to; level++) {
    const recipe = pickRecipe(recipes, level, prices, coef);
    if (!recipe) {
      stuckAtLevel = level;
      break;
    }
    const xpc = xpPerCraft(level, recipe.resultLevel, coef);
    const crafts = Math.ceil(xpToNextLevel(level) / xpc);

    const last = steps[steps.length - 1];
    if (last && last.recipe.recipeId === recipe.recipeId) {
      last.crafts += crafts;
      last.toLevel = level + 1;
    } else {
      steps.push({
        fromLevel: level,
        toLevel: level + 1,
        recipe,
        xpPerCraft: xpc,
        crafts,
        ingredients: [],
      });
    }
  }

  // Cost + per-step and whole-plan shopping lists.
  const shoppingById = new Map<string, PlanIngredient>();
  let incomplete = false;
  let totalCrafts = 0;
  let totalCost: number | undefined = 0;

  for (const step of steps) {
    totalCrafts += step.crafts;
    const stepXp = cumulativeXp(step.toLevel) - cumulativeXp(step.fromLevel);

    const unitCost = recipeCost(step.recipe, prices);
    if (unitCost != null) {
      step.cost = unitCost * step.crafts;
      step.costPerXp = stepXp > 0 ? step.cost / stepXp : undefined;
      if (totalCost != null) totalCost += step.cost;
    } else {
      incomplete = true;
      totalCost = undefined;
    }

    for (const ing of step.recipe.ingredients) {
      const qty = ing.quantity * step.crafts;
      const unit = prices[ing.item.id];
      if (unit == null) incomplete = true;
      step.ingredients.push({
        item: ing.item,
        quantity: qty,
        unitPrice: unit,
        subtotal: unit != null ? unit * qty : undefined,
      });
      const agg = shoppingById.get(ing.item.id);
      if (agg) {
        agg.quantity += qty;
        agg.subtotal = agg.unitPrice != null ? agg.unitPrice * agg.quantity : undefined;
      } else {
        shoppingById.set(ing.item.id, {
          item: ing.item,
          quantity: qty,
          unitPrice: unit,
          subtotal: unit != null ? unit * qty : undefined,
        });
      }
    }
  }

  const totalXp = cumulativeXp(to) - cumulativeXp(from);
  const avgCostPerXp =
    totalCost != null && totalXp > 0 ? totalCost / totalXp : undefined;

  return {
    steps,
    totalCrafts,
    totalXp,
    totalCost,
    avgCostPerXp,
    shopping: [...shoppingById.values()],
    incomplete,
    stuckAtLevel,
  };
}
