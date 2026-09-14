import { describe, it, expect } from "vitest";
import {
  xpToNextLevel,
  cumulativeXp,
  craftPenalty,
  xpPerCraft,
  xpBetween,
  planRecipeToTarget,
  planRecipesToTarget,
  type MetierRecipe,
} from "../metierXp";
import type { PriceMap } from "../../types";

const recipe = (
  id: string,
  resultLevel: number,
  ings: [string, number][],
): MetierRecipe => ({
  recipeId: id,
  result: { id: `res-${id}`, name: id },
  resultLevel,
  slots: ings.length,
  ingredients: ings.map(([itemId, quantity]) => ({
    item: { id: itemId, name: itemId },
    quantity,
  })),
});

describe("XP formula", () => {
  it("uses 20 × level per level and 10·N·(N−1) cumulative", () => {
    expect(xpToNextLevel(100)).toBe(2000);
    expect(cumulativeXp(100)).toBe(99000);
    expect(cumulativeXp(1)).toBe(0);
    // cumulative diff equals the per-level requirement
    expect(cumulativeXp(101) - cumulativeXp(100)).toBe(xpToNextLevel(100));
  });

  it("penalises out-levelled recipes (1 at gap 0, 0.5 at gap 8)", () => {
    expect(craftPenalty(0)).toBe(1);
    expect(craftPenalty(8)).toBeCloseTo(0.5);
  });

  it("crafting at your level yields exactly one level of XP", () => {
    expect(xpPerCraft(100, 100)).toBe(xpToNextLevel(100)); // 2000
  });

  it("applies the gap penalty, the coefficient, and blocks over-level recipes", () => {
    expect(xpPerCraft(108, 100)).toBe(1000); // 20×100×0.5
    expect(xpPerCraft(100, 100, 1.2)).toBe(2400);
    expect(xpPerCraft(50, 60)).toBe(0); // recipe above job level
  });
});

describe("planRecipeToTarget", () => {
  const prices: PriceMap = { b: 10 };

  it("sums crafts level by level (penalty grows) with cost and shopping", () => {
    // recipe level 10, 1 ingredient ×2 @10 → unit cost 20.
    // lvl10: xpc=200, need 200 → 1 craft. lvl11: xpc=round(200×8/9)=178, need 220 → 2.
    const plan = planRecipeToTarget(recipe("ring", 10, [["b", 2]]), prices, 10, 12, 1);
    expect(plan.crafts).toBe(3);
    expect(plan.cost).toBe(60);
    expect(plan.costPerXp).toBeCloseTo(60 / xpBetween(10, 12));
    expect(plan.incomplete).toBe(false);
    expect(plan.shopping[0]).toMatchObject({ quantity: 6, subtotal: 60 });
  });

  it("flags incomplete when a price is missing", () => {
    const plan = planRecipeToTarget(recipe("ring", 10, [["z", 2]]), prices, 10, 12, 1);
    expect(plan.incomplete).toBe(true);
    expect(plan.cost).toBeUndefined();
    expect(plan.crafts).toBe(3); // crafts don't depend on price
  });
});

describe("planRecipesToTarget", () => {
  const prices: PriceMap = { a: 100, b: 10 };
  it("ranks craftable recipes cheapest-first, drops over-level, unpriced last", () => {
    const recipes = [
      recipe("cheap", 40, [["b", 5]]), // cost 50
      recipe("dear", 40, [["a", 5]]), // cost 500
      recipe("noprice", 40, [["z", 1]]), // unknown cost → last
      recipe("locked", 80, [["b", 1]]), // above level 60 → excluded
    ];
    const plans = planRecipesToTarget(recipes, prices, 60, 80, 1);
    expect(plans.map((p) => p.recipe.recipeId)).toEqual(["cheap", "dear", "noprice"]);
    expect(plans[0].cost!).toBeLessThan(plans[1].cost!);
  });
});
