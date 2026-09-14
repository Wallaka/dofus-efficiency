import { describe, it, expect } from "vitest";
import { questValue, type Quest } from "../quests";
import type { PriceMap } from "../../types";

const mk = (over: Partial<Quest> = {}): Quest => ({
  id: "q1",
  name: "Test",
  period: "daily",
  kamas: 1000,
  rewards: [
    { item: { id: "10", name: "Bois de Frêne" }, quantity: 5 },
    { item: { id: "20", name: "Frêne" }, quantity: 2 },
  ],
  ...over,
});

describe("questValue", () => {
  it("adds raw kamas to priced resource rewards", () => {
    const prices: PriceMap = { "10": 100, "20": 50 };
    const v = questValue(mk(), prices);
    expect(v.resourcesValue).toBe(5 * 100 + 2 * 50); // 600
    expect(v.total).toBe(1000 + 600); // 1600
    expect(v.missing).toHaveLength(0);
  });

  it("flags rewards with no known price and excludes them from the total", () => {
    const prices: PriceMap = { "10": 100 }; // "20" missing
    const v = questValue(mk(), prices);
    expect(v.resourcesValue).toBe(500);
    expect(v.total).toBe(1500);
    expect(v.missing.map((r) => r.item.id)).toEqual(["20"]);
  });

  it("handles a kamas-only quest with no rewards", () => {
    const v = questValue(mk({ rewards: [], kamas: 2500 }), {});
    expect(v.total).toBe(2500);
    expect(v.missing).toHaveLength(0);
  });
});
