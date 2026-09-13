import { describe, it, expect } from "vitest";
import { evaluateEntry, type CraftEntry } from "../craftList";
import type { PriceMap } from "../../types";

/**
 * The craft benefit math, focused on the HDV sell tax: it is charged on the
 * sale price and deducted from the net benefit, only when both sides are known.
 */

const ENTRY: CraftEntry = {
  recipeId: "r-1",
  resultItem: { id: "1", name: "Anneau" },
  job: "Bijoutier",
  ingredients: [
    { item: { id: "10", name: "Poudre" }, quantity: 5 },
    { item: { id: "11", name: "Émeraude" }, quantity: 2 },
  ],
  addedAt: 0,
};

// craftCost = 5×2000 + 2×500 = 11 000 ; sellPrice = 18 000
const PRICES: PriceMap = { "1": 18000, "10": 2000, "11": 500 };

describe("evaluateEntry — HDV sell tax", () => {
  it("charges the tax on the sale price and nets it out of the benefit", () => {
    const r = evaluateEntry(ENTRY, PRICES, 0.02);
    expect(r.craftCost).toBe(11000);
    expect(r.sellPrice).toBe(18000);
    expect(r.tax).toBe(360); // 18 000 × 2 %
    expect(r.netMargin).toBe(6640); // 18 000 − 360 − 11 000
    expect(r.netMarginRatio).toBeCloseTo(6640 / 11000);
  });

  it("with no tax, the net benefit equals the raw margin", () => {
    const r = evaluateEntry(ENTRY, PRICES, 0);
    expect(r.tax).toBe(0);
    expect(r.netMargin).toBe(r.margin);
    expect(r.netMargin).toBe(7000);
  });

  it("leaves the net benefit unknown when an ingredient price is missing", () => {
    const r = evaluateEntry(ENTRY, { "1": 18000, "10": 2000 }, 0.02);
    expect(r.craftCost).toBeUndefined();
    expect(r.tax).toBe(360); // still computable from the sale price
    expect(r.netMargin).toBeUndefined();
    expect(r.netMarginRatio).toBeUndefined();
  });

  it("leaves tax and net benefit unknown when there is no sale price", () => {
    const r = evaluateEntry(ENTRY, { "10": 2000, "11": 500 }, 0.02);
    expect(r.tax).toBeUndefined();
    expect(r.netMargin).toBeUndefined();
  });
});
