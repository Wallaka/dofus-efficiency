import { describe, it, expect } from "vitest";
import { FILETS, filetById, filetsForLevel, bestFiletFor } from "../filets";

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

  it("filters to a creature's filets plus the universal net", () => {
    const muldo = filetsForLevel(200, "Muldo");
    expect(muldo.map((f) => f.creature).sort()).toEqual([
      "Muldo",
      "Muldo",
      "Muldo",
      "Universel",
    ]);
    // At level 1 only the universal net qualifies for any creature.
    expect(filetsForLevel(1, "Muldo")).toHaveLength(1);
    expect(filetsForLevel(1, "Dragodinde")[0].creature).toBe("Universel");
  });

  it("sorts by level then name", () => {
    const list = filetsForLevel(200);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].level).toBeGreaterThanOrEqual(list[i - 1].level);
    }
  });
});

describe("bestFiletFor", () => {
  it("picks the highest-tier filet usable for the creature", () => {
    expect(bestFiletFor(200, "Muldo")?.name).toBe(
      "Filet multiplicateur de Muldo renforcé",
    );
    expect(bestFiletFor(150, "Muldo")?.name).toBe("Filet à Muldo renforcé");
    expect(bestFiletFor(100, "Muldo")?.name).toBe("Filet multiplicateur de Muldo");
    // Below 100 only the universal net qualifies.
    expect(bestFiletFor(1, "Muldo")?.creature).toBe("Universel");
    expect(bestFiletFor(0, "Muldo")).toBeUndefined();
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
