import { describe, it, expect } from "vitest";
import {
  normalizeItem,
  flattenRawItems,
  itemsFromParsed,
  buildCatalog,
} from "../build-catalog.mjs";

/**
 * Tests for the catalog converter — pins how pasted DofusDB JSON is reduced to
 * the bundled catalog, independent of any live API.
 */

describe("normalizeItem", () => {
  it("keeps id (as string), fr name, img, level", () => {
    expect(
      normalizeItem({ id: 311, name: { fr: "Frêne", en: "Ash" }, img: "a.png", level: 1 }),
    ).toEqual({ id: "311", name: "Frêne", img: "a.png", level: 1 });
  });

  it("falls back to en, then to #id", () => {
    expect(normalizeItem({ id: 7, name: { en: "Wheat" } })).toEqual({
      id: "7",
      name: "Wheat",
    });
    expect(normalizeItem({ id: 9, name: {} })).toEqual({ id: "9", name: "#9" });
  });

  it("drops items without an id", () => {
    expect(normalizeItem({ name: { fr: "x" } })).toBeNull();
    expect(normalizeItem(null)).toBeNull();
  });
});

describe("flattenRawItems", () => {
  const item = { id: 1, name: { fr: "a" } };
  it("accepts a bare array", () => {
    expect(flattenRawItems([item])).toEqual([item]);
  });
  it("accepts a Feathers page object", () => {
    expect(flattenRawItems({ total: 1, data: [item] })).toEqual([item]);
  });
  it("accepts an array of page objects", () => {
    expect(flattenRawItems([{ data: [item] }, { data: [item] }])).toEqual([item, item]);
  });
});

describe("itemsFromParsed", () => {
  it("dedupes by id and sorts by name", () => {
    const parsed = {
      data: [
        { id: 2, name: { fr: "Orme" } },
        { id: 1, name: { fr: "Chêne" } },
        { id: 1, name: { fr: "Chêne (dup)" } },
      ],
    };
    expect(itemsFromParsed(parsed)).toEqual([
      { id: "1", name: "Chêne" },
      { id: "2", name: "Orme" },
    ]);
  });
});

describe("buildCatalog", () => {
  it("groups by tab and category, ordering Ressources first", () => {
    const catalog = buildCatalog([
      { tab: "Consommables", category: "Pains", parsed: [{ id: 5, name: { fr: "Pain" } }] },
      { tab: "Ressources", category: "Bois", parsed: [{ id: 1, name: { fr: "Frêne" } }] },
    ]);
    expect(catalog.map((t) => t.tab)).toEqual(["Ressources", "Consommables"]);
    expect(catalog[0].categories[0]).toEqual({
      category: "Bois",
      items: [{ id: "1", name: "Frêne" }],
    });
  });

  it("merges the same category split across files", () => {
    const catalog = buildCatalog([
      { tab: "Ressources", category: "Bois", parsed: [{ id: 1, name: { fr: "Frêne" } }] },
      { tab: "Ressources", category: "Bois", parsed: [{ id: 2, name: { fr: "Chêne" } }] },
    ]);
    expect(catalog[0].categories[0].items).toEqual([
      { id: "2", name: "Chêne" },
      { id: "1", name: "Frêne" },
    ]);
  });
});
