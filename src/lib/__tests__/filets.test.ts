import { describe, it, expect } from "vitest";
import { FILETS, filetById, filetsForLevel } from "../filets";

describe("filetsForLevel", () => {
  it("returns nothing below level 1", () => {
    expect(filetsForLevel(0)).toEqual([]);
    expect(filetsForLevel(undefined)).toEqual([]);
  });

  it("includes only the universal net at low levels", () => {
    const l1 = filetsForLevel(1);
    expect(l1).toHaveLength(1);
    expect(l1[0].creature).toBe("Universel");
  });

  it("unlocks each tier at its required level", () => {
    expect(filetsForLevel(99)).toHaveLength(1); // still just universal
    expect(filetsForLevel(100)).toHaveLength(4); // + 3 multiplicateurs
    expect(filetsForLevel(150)).toHaveLength(7); // + 3 renforcés
    expect(filetsForLevel(200)).toHaveLength(10); // + 3 multiplicateurs renforcés
  });

  it("sorts by level then name", () => {
    const list = filetsForLevel(200);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].level).toBeGreaterThanOrEqual(list[i - 1].level);
    }
  });
});

describe("filetById", () => {
  it("finds a known filet and misses unknown ids", () => {
    expect(filetById("32521")?.name).toBe("Filet de capture universel");
    expect(filetById("nope")).toBeUndefined();
    expect(filetById(undefined)).toBeUndefined();
  });

  it("keeps every id unique", () => {
    const ids = new Set(FILETS.map((f) => f.id));
    expect(ids.size).toBe(FILETS.length);
  });
});
