import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeAutoCrop, type WordBox, type ImageSize } from "../autoCrop";
import type { ScreenshotKind } from "../screenshotAnalysis";

/**
 * Crop-geometry tests over the real locate-pass word boxes. The important property
 * is resolution independence: the crop is derived from anchor positions + text
 * height, so scaling the whole page must scale the crop by the same factor (it must
 * NOT depend on absolute pixel positions or image dimensions).
 */

const here = dirname(fileURLToPath(import.meta.url));
const IDS = [
  "market",
  "hdv-buy-resource",
  "hdv-sell-1",
  "hdv-sell-2",
  "hdv-sell-3",
  "hdv-sell-4",
  "hdv-sell-5",
];

function load(id: string): { size: ImageSize; pass1Kind: ScreenshotKind; pass1Words: WordBox[] } {
  return JSON.parse(readFileSync(join(here, "fixtures", `${id}.json`), "utf8"));
}

const scaleWords = (words: WordBox[], k: number): WordBox[] =>
  words.map((w) => ({
    text: w.text,
    bbox: { x0: w.bbox.x0 * k, y0: w.bbox.y0 * k, x1: w.bbox.x1 * k, y1: w.bbox.y1 * k },
  }));

describe.each(IDS)("computeAutoCrop: %s", (id) => {
  const { size, pass1Kind, pass1Words } = load(id);
  const kind = pass1Kind as ScreenshotKind;

  it("returns a rect inside the image bounds", () => {
    const r = computeAutoCrop(pass1Words, size, kind)!;
    expect(r).toBeTruthy();
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(size.width + 1);
    expect(r.y + r.height).toBeLessThanOrEqual(size.height + 1);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it("is resolution-independent (scaling the page scales the crop by the same factor)", () => {
    const base = computeAutoCrop(pass1Words, size, kind)!;
    const k = 2;
    const scaled = computeAutoCrop(
      scaleWords(pass1Words, k),
      { width: size.width * k, height: size.height * k },
      kind,
    )!;
    // Each dimension should scale by ~k (within 3% — text-height median is stable).
    for (const key of ["x", "y", "width", "height"] as const) {
      const expected = base[key] * k;
      const tol = Math.max(4, Math.abs(expected) * 0.03);
      expect(Math.abs(scaled[key] - expected)).toBeLessThanOrEqual(tol);
    }
  });
});
