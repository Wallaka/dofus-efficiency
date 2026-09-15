import { describe, it, expect } from "vitest";
import { MANGEOIRES, mangeoireById } from "../mangeoires";

describe("mangeoires", () => {
  it("has 20 fuels (4 families × 5 sizes)", () => {
    expect(MANGEOIRES).toHaveLength(20);
    expect(new Set(MANGEOIRES.map((m) => m.id)).size).toBe(20);
  });

  it("energy follows the size ladder 1000→5000 regardless of family", () => {
    const bySize = (word: string) =>
      MANGEOIRES.filter((m) => m.name.startsWith(word)).map((m) => m.energy);
    expect(bySize("Minuscule")).toEqual([1000, 1000, 1000, 1000]);
    expect(bySize("Gigantesque")).toEqual([5000, 5000, 5000, 5000]);
    // Base (no size prefix) = 3000, one per family.
    const base = MANGEOIRES.filter((m) => /^(Extrait|Philtre|Potion|Élixir) de/.test(m.name));
    expect(base.map((m) => m.energy)).toEqual([3000, 3000, 3000, 3000]);
  });

  it("looks up by id", () => {
    expect(mangeoireById("33341")?.energy).toBe(4000); // Grand Extrait
    expect(mangeoireById("nope")).toBeUndefined();
    expect(mangeoireById(undefined)).toBeUndefined();
  });
});
