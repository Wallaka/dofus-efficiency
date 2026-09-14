import { describe, it, expect } from "vitest";
import { questValue, periodTotal, importCatalog, type Quest } from "../quests";
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

describe("periodTotal", () => {
  it("sums independent quests", () => {
    const quests: Quest[] = [
      { id: "a", name: "A", period: "daily", kamas: 1000, rewards: [] },
      { id: "b", name: "B", period: "daily", kamas: 500, rewards: [] },
    ];
    expect(periodTotal(quests, {})).toBe(1500);
  });

  it("counts only the best quest of a variant group", () => {
    const quests: Quest[] = [
      { id: "a", name: "A", period: "daily", kamas: 1000, rewards: [], variantGroup: "bonta" },
      { id: "b", name: "B", period: "daily", kamas: 3000, rewards: [], variantGroup: "bonta" },
      { id: "c", name: "C", period: "daily", kamas: 200, rewards: [] },
    ];
    // best of the bonta variant (3000) + the standalone quest (200)
    expect(periodTotal(quests, {})).toBe(3200);
  });

  it("keeps separate variant groups independent", () => {
    const quests: Quest[] = [
      { id: "a", name: "A", period: "daily", kamas: 1000, rewards: [], variantGroup: "g1" },
      { id: "b", name: "B", period: "daily", kamas: 500, rewards: [], variantGroup: "g1" },
      { id: "c", name: "C", period: "daily", kamas: 800, rewards: [], variantGroup: "g2" },
      { id: "d", name: "D", period: "daily", kamas: 400, rewards: [], variantGroup: "g2" },
    ];
    expect(periodTotal(quests, {})).toBe(1000 + 800);
  });
});

describe("importCatalog", () => {
  it("seeds an empty list from the bundled catalog", () => {
    const { quests, added } = importCatalog([]);
    expect(added).toBeGreaterThan(0);
    expect(quests).toHaveLength(added);
    // Every imported quest carries an id and a valid period.
    for (const q of quests) {
      expect(q.id).toBeTruthy();
      expect(["daily", "weekly"]).toContain(q.period);
    }
  });

  it("is idempotent: a second import adds nothing", () => {
    const first = importCatalog([]);
    const second = importCatalog(first.quests);
    expect(second.added).toBe(0);
    expect(second.quests).toHaveLength(first.quests.length);
  });

  it("keeps existing quests and only appends missing catalog entries", () => {
    const existing: Quest[] = [
      { id: "mine", name: "Ma quête", period: "daily", kamas: 42, rewards: [] },
    ];
    const { quests, added } = importCatalog(existing);
    expect(quests[0]).toEqual(existing[0]);
    expect(quests).toHaveLength(existing.length + added);
  });
});
