import { describe, it, expect } from "vitest";
import {
  xpToNextLevel,
  cumulativeXp,
  craftPenalty,
  xpPerCraft,
  rankRecipes,
  buildLevelingPlan,
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

describe("rankRecipes", () => {
  const prices: PriceMap = { a: 100, b: 10 };
  it("orders by cost-per-XP, drops over-level recipes, unpriced last", () => {
    const recipes = [
      recipe("cheap", 50, [["b", 5]]), // cost 50
      recipe("dear", 50, [["a", 5]]), // cost 500
      recipe("noprice", 50, [["z", 1]]), // unknown cost
      recipe("locked", 80, [["b", 1]]), // above level 60 → excluded
    ];
    const r = rankRecipes(recipes, prices, 60, 1);
    expect(r.map((x) => x.recipe.recipeId)).toEqual(["cheap", "dear", "noprice"]);
    expect(r[0].costPerXp).toBeLessThan(r[1].costPerXp!);
  });
});

describe("buildLevelingPlan", () => {
  const prices: PriceMap = { b: 10 };

  it("computes crafts, cost, XP and shopping over a merged palier", () => {
    // recipe level 10, 1 ingredient ×2 @10 → unit cost 20.
    // lvl10: xpc=200, need 200 → 1 craft. lvl11: xpc=round(200×8/9)=178, need 220 → 2.
    const plan = buildLevelingPlan(
      [recipe("ring", 10, [["b", 2]])],
      prices,
      10,
      12,
      1,
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0];
    expect(step.fromLevel).toBe(10);
    expect(step.toLevel).toBe(12);
    expect(step.crafts).toBe(3);
    expect(step.cost).toBe(60);
    expect(plan.totalXp).toBe(420); // 200 + 220
    expect(plan.incomplete).toBe(false);
    expect(plan.shopping[0]).toMatchObject({ quantity: 6, subtotal: 60 });
  });

  it("flags incomplete totals when a price is missing", () => {
    const plan = buildLevelingPlan(
      [recipe("ring", 10, [["z", 2]])],
      prices,
      10,
      12,
      1,
    );
    expect(plan.incomplete).toBe(true);
    expect(plan.totalCost).toBeUndefined();
  });

  it("gets stuck when no recipe is craftable at a level", () => {
    const plan = buildLevelingPlan(
      [recipe("high", 50, [["b", 1]])],
      prices,
      10,
      20,
      1,
    );
    expect(plan.stuckAtLevel).toBe(10);
    expect(plan.steps).toHaveLength(0);
  });
});
