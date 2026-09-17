import { describe, it, expect } from "vitest";
import {
  stoneForLevel,
  ocreRow,
  ocreSummary,
  SOUL_STONES,
  type Archimonster,
} from "../../data/ocre";

const archi = (over: Partial<Archimonster> = {}): Archimonster => ({
  monsterId: 1,
  name: "Test",
  level: 100,
  soulItemId: "soul1",
  ...over,
});

describe("stoneForLevel", () => {
  it("picks the smallest stone whose cap covers the level", () => {
    expect(stoneForLevel(1).tier).toBe("petite"); // ≤ 50
    expect(stoneForLevel(50).tier).toBe("petite");
    expect(stoneForLevel(51).tier).toBe("moyenne"); // ≤ 100
    expect(stoneForLevel(113).tier).toBe("grande"); // ≤ 150 (the worked example)
    expect(stoneForLevel(178).tier).toBe("enorme"); // ≤ 190
    expect(stoneForLevel(200).tier).toBe("gigantesque");
  });
});

describe("ocreRow", () => {
  const stonePrices = Object.fromEntries(SOUL_STONES.map((s) => [s.itemId, 0]));

  it("buying cheaper → bestPath buy, benefit negative", () => {
    const r = ocreRow(archi({ level: 60 }), false, {
      ...stonePrices,
      soul1: 3000,
      [stoneForLevel(60).itemId]: 8000,
    });
    expect(r.stone.tier).toBe("moyenne");
    expect(r.buyPrice).toBe(3000);
    expect(r.stonePrice).toBe(8000);
    expect(r.benefit).toBe(-5000); // buy − stone
    expect(r.bestPath).toBe("buy");
    expect(r.bestCost).toBe(3000);
  });

  it("capturing cheaper → bestPath capture, benefit positive (resell profit)", () => {
    const r = ocreRow(archi({ level: 60 }), false, {
      soul1: 9000,
      [stoneForLevel(60).itemId]: 2500,
    });
    expect(r.benefit).toBe(6500);
    expect(r.bestPath).toBe("capture");
    expect(r.bestCost).toBe(2500);
  });

  it("no soul price → capture is the only path, no benefit", () => {
    const r = ocreRow(archi({ soulItemId: undefined, level: 60 }), false, {
      [stoneForLevel(60).itemId]: 2500,
    });
    expect(r.buyPrice).toBeUndefined();
    expect(r.benefit).toBeUndefined();
    expect(r.bestPath).toBe("capture");
    expect(r.bestCost).toBe(2500);
  });

  it("no prices at all → no path", () => {
    const r = ocreRow(archi(), false, {});
    expect(r.bestPath).toBeUndefined();
    expect(r.bestCost).toBeUndefined();
  });
});

describe("ocreSummary", () => {
  it("aggregates progress, packs and cost-to-complete over missing rows", () => {
    const petite = SOUL_STONES[0].itemId; // covers lvl ≤ 50
    const prices = { [petite]: 2000, a: 5000, b: 1000 };
    const rows = [
      // missing: buy 5000 vs stone 2000 → capture (2000)
      ocreRow(archi({ monsterId: 1, level: 30, soulItemId: "a" }), false, prices),
      // missing: buy 1000 vs stone 2000 → buy (1000), saving 0 vs bestCost
      ocreRow(archi({ monsterId: 2, level: 30, soulItemId: "b" }), false, prices),
      // captured: excluded from cost-to-complete
      ocreRow(archi({ monsterId: 3, level: 30, soulItemId: "a" }), true, prices),
    ];
    const s = ocreSummary(rows);
    expect(s.total).toBe(3);
    expect(s.capturedCount).toBe(1);
    expect(s.missingCount).toBe(2);
    expect(s.progress).toBeCloseTo(1 / 3);
    expect(s.packHdv).toBe(5000 + 1000 + 5000); // all rows with a known soul price
    expect(s.packCaptured).toBe(2000 * 3); // all rows' stone priced
    expect(s.costToComplete).toBe(2000 + 1000); // missing: min(5000,2000)+min(1000,2000)
    expect(s.saving).toBe(5000 - 2000 + 0); // (buy−bestCost) over missing
  });

  it("counts unpriced rows", () => {
    const rows = [ocreRow(archi(), false, {})];
    const s = ocreSummary(rows);
    expect(s.packHdvUnpriced).toBe(1);
    expect(s.packCapturedUnpriced).toBe(1);
    expect(s.completeUnpriced).toBe(1);
  });
});
