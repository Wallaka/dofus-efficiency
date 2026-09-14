import { describe, it, expect } from "vitest";
import {
  slotXp,
  givesXpAt,
  xpPerCraft,
  buildLevelingPlan,
  rankRecipes,
  type MetierRecipe,
} from "../metierXp";
import type { PriceMap } from "../../types";

const recipe = (
  id: string,
  slots: number,
  ings: [string, number][],
): MetierRecipe => ({
  recipeId: id,
  result: { id: `res-${id}`, name: id },
  resultLevel: 1,
  slots,
  ingredients: ings.map(([itemId, quantity]) => ({
    item: { id: itemId, name: itemId },
    quantity,
  })),
});

describe("slot XP model", () => {
  it("maps slot counts to the community XP table and clamps 1..8", () => {
    expect(slotXp(1)).toBe(1);
    expect(slotXp(4)).toBe(50);
    expect(slotXp(8)).toBe(1000);
    expect(slotXp(12)).toBe(1000); // clamped
    expect(slotXp(0)).toBe(0);
  });

  it("applies the level ceiling per slot count", () => {
    expect(givesXpAt(39, 1)).toBe(true);
    expect(givesXpAt(40, 1)).toBe(false); // 1-slot dead at 40
    expect(givesXpAt(79, 3)).toBe(true);
    expect(givesXpAt(80, 3)).toBe(false); // 3-slot dead at 80
  });

  it("scales XP per craft by the coefficient", () => {
    expect(xpPerCraft(4, 1)).toBe(50);
    expect(xpPerCraft(4, 1.2)).toBe(60);
  });
});

describe("rankRecipes", () => {
  const prices: PriceMap = { a: 100, b: 10 };
  const recipes = [
    recipe("cheap", 4, [["b", 5]]), // cost 50, xp 50 -> 1 k/xp
    recipe("dear", 4, [["a", 5]]), // cost 500, xp 50 -> 10 k/xp
    recipe("noprice", 4, [["z", 1]]), // unknown cost -> last
  ];

  it("orders by cost-per-XP, unpriced last", () => {
    const r = rankRecipes(recipes, prices, 10, 1);
    expect(r.map((x) => x.recipe.recipeId)).toEqual(["cheap", "dear", "noprice"]);
    expect(r[0].costPerXp).toBeCloseTo(1);
    expect(r[2].costPerXp).toBeUndefined();
  });

  it("drops recipes that no longer give XP at the level", () => {
    const r = rankRecipes([recipe("small", 2, [["b", 1]])], prices, 60, 1);
    expect(r).toHaveLength(0); // 2-slot dead at 60
  });
});

describe("buildLevelingPlan", () => {
  // Flat curve: every level needs exactly 100 XP.
  const curve: number[] = [];
  for (let l = 1; l <= 11; l++) curve[l] = (l - 1) * 100;
  const prices: PriceMap = { b: 10 };

  it("computes crafts, cost and a merged palier over a level range", () => {
    // 4-slot recipe: 50 XP/craft, cost 5×10=50/craft. 100 XP/level -> 2 crafts/level.
    const plan = buildLevelingPlan(
      [recipe("ring", 4, [["b", 5]])],
      prices,
      curve,
      1,
      6,
      1,
    );
    expect(plan.steps).toHaveLength(1); // merged into one palier 1..6
    const step = plan.steps[0];
    expect(step.fromLevel).toBe(1);
    expect(step.toLevel).toBe(6);
    expect(step.crafts).toBe(10); // 5 levels × 2 crafts
    expect(step.cost).toBe(500); // 10 crafts × 50
    expect(plan.totalXp).toBe(500);
    expect(plan.avgCostPerXp).toBeCloseTo(1);
    expect(plan.incomplete).toBe(false);
    // Shopping list aggregates the ingredient across the palier.
    expect(plan.shopping[0]).toMatchObject({ quantity: 50, subtotal: 500 });
  });

  it("flags incomplete totals when a price is missing", () => {
    const plan = buildLevelingPlan(
      [recipe("ring", 4, [["z", 5]])],
      prices,
      curve,
      1,
      3,
      1,
    );
    expect(plan.incomplete).toBe(true);
    expect(plan.totalCost).toBeUndefined();
    expect(plan.steps[0].cost).toBeUndefined();
  });

  it("stops when no recipe gives XP at a level", () => {
    // 1-slot recipe dies at 40, so a plan from 39 can't pass level 40.
    const bigCurve: number[] = [];
    for (let l = 1; l <= 60; l++) bigCurve[l] = (l - 1) * 100;
    const plan = buildLevelingPlan(
      [recipe("tiny", 1, [["b", 1]])],
      prices,
      bigCurve,
      39,
      50,
      1,
    );
    expect(plan.stuckAtLevel).toBe(40);
  });
});
