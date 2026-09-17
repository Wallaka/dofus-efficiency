import { describe, it, expect } from "vitest";
import {
  normalizeArchimonster,
  buildArchimonsters,
} from "../build-archimonsters.mjs";

/**
 * Tests for the archimonster converter — pins how the fetched snapshot is
 * reduced to the bundled list, independent of any live API.
 */

describe("normalizeArchimonster", () => {
  it("keeps id (as number), name, level, img and the soul link", () => {
    expect(
      normalizeArchimonster({
        monsterId: 2354,
        name: " Bworkette ",
        level: 60,
        img: "m.png",
        soulItemId: 9001,
        soulName: "Âme de Bworkette",
        soulImg: "s.png",
      }),
    ).toEqual({
      monsterId: 2354,
      name: "Bworkette",
      level: 60,
      img: "m.png",
      soulItemId: "9001",
      soulName: "Âme de Bworkette",
      soulImg: "s.png",
    });
  });

  it("omits the soul fields when there is no soul item", () => {
    const rec = normalizeArchimonster({ monsterId: 58, name: "Tofu", level: 12 });
    expect(rec).toEqual({ monsterId: 58, name: "Tofu", level: 12 });
    expect("soulItemId" in rec).toBe(false);
  });

  it("drops records without a monster id", () => {
    expect(normalizeArchimonster({ name: "x" })).toBeNull();
    expect(normalizeArchimonster(null)).toBeNull();
  });
});

describe("buildArchimonsters", () => {
  it("dedupes by monster id and sorts by level then name", () => {
    const list = buildArchimonsters([
      { monsterId: 2, name: "Zt", level: 100 },
      { monsterId: 1, name: "Bb", level: 100 },
      { monsterId: 3, name: "Aa", level: 20 },
      { monsterId: 2, name: "dup", level: 999 }, // ignored — id already seen
    ]);
    expect(list.map((a) => a.monsterId)).toEqual([3, 1, 2]);
    expect(list[2].name).toBe("Zt"); // first record for id 2 wins
  });
});
