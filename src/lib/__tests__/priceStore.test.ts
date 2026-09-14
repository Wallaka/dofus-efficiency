import { describe, it, expect } from "vitest";
import { pricesFromEntries, type PriceEntryMap } from "../priceStore";
import { SECTIONS } from "../dataTransfer";

const entry = (itemId: string, price: number, updatedAt: number): PriceEntryMap[string] => ({
  itemId,
  name: `Item ${itemId}`,
  price,
  updatedAt,
  source: "manual",
});

describe("pricesFromEntries", () => {
  it("derives a plain id→price map from entries", () => {
    const entries: PriceEntryMap = {
      "1": entry("1", 100, 10),
      "2": entry("2", 250, 20),
    };
    expect(pricesFromEntries(entries)).toEqual({ "1": 100, "2": 250 });
  });

  it("is empty for no entries", () => {
    expect(pricesFromEntries({})).toEqual({});
  });
});

describe("priceEntries import merge (newer wins)", () => {
  const section = SECTIONS.find((s) => s.id === "priceEntries")!;

  it("keeps the more recent price on a conflict", () => {
    const mine: PriceEntryMap = { "1": entry("1", 100, 10) };
    const theirs: PriceEntryMap = { "1": entry("1", 999, 20) };
    const merged = section.merge(mine, theirs) as PriceEntryMap;
    expect(merged["1"].price).toBe(999);
  });

  it("keeps mine when it is newer", () => {
    const mine: PriceEntryMap = { "1": entry("1", 100, 30) };
    const theirs: PriceEntryMap = { "1": entry("1", 999, 20) };
    const merged = section.merge(mine, theirs) as PriceEntryMap;
    expect(merged["1"].price).toBe(100);
  });

  it("unions items that only exist on one side", () => {
    const mine: PriceEntryMap = { "1": entry("1", 100, 10) };
    const theirs: PriceEntryMap = { "2": entry("2", 200, 10) };
    const merged = section.merge(mine, theirs) as PriceEntryMap;
    expect(Object.keys(merged).sort()).toEqual(["1", "2"]);
  });
});
