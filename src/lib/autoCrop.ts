/**
 * Automatic crop: given the word boxes from a first, full-image OCR pass and the
 * detected screen type, find the rectangle around the *relevant panel* so a
 * second OCR pass can read just that (much less noise, much better accuracy).
 *
 * The idea: each screen type has a few marker words that live inside the panel
 * we care about ("Prix moyen", "Panoplie", "Quantité en inventaire", "Cours du
 * marché", "ACHETER" …). We locate those words, keep the cluster that sits with
 * the primary marker (dropping matches from other windows on the far side of the
 * screen), take their bounding box, and pad it — extra on top for the item name,
 * extra at the bottom of the HDV for the lot list. If we can't find markers we
 * return null and the caller just uses the whole image.
 */
import type { CropRect } from "./cropImage";
import type { ScreenshotKind, ItemCategory } from "./screenshotAnalysis";

/** Minimal shape we need from an OCR word (compatible with OcrWord). */
export interface WordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface ImageSize {
  width: number;
  height: number;
}

interface Padding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Marker words (accent-stripped substrings) that sit inside each type's panel. */
const ANCHORS: Partial<Record<ScreenshotKind, string[]>> = {
  "market-trend": ["cours", "marche", "median", "moyen", "articles", "vendus"],
  hdv: ["quantite", "moyen", "lot", "acheter"],
  "item-tooltip": ["panoplie", "effets", "moyen", "poids", "niveau", "niv"],
};

// Padding as a fraction of image width/height. HDV gets a big bottom margin so
// the lot list is included; every type gets extra on top for the item name.
const PADDING: Partial<Record<ScreenshotKind, Padding>> = {
  // The "Cours du marché" window holds the title, stats line AND the graph. Pad
  // generously down (to include the graph + its date axis for the 7-day history)
  // and right, anchored on the title/stats even when only the title is read.
  "market-trend": { left: 0.03, right: 0.14, top: 0.06, bottom: 0.42 },
  hdv: { left: 0.03, right: 0.04, top: 0.05, bottom: 0.16 },
  "item-tooltip": { left: 0.04, right: 0.04, top: 0.05, bottom: 0.04 },
};

const DEFAULT_PADDING: Padding = { left: 0.04, right: 0.04, top: 0.05, bottom: 0.05 };

// A resource's lot list (x1/x10/x100/x1000) sits directly under the detail
// header, and the lot *prices* sit to the right of the label words we anchor on.
// Full-res pass 1 often misses that small text, so extend both down (to keep
// every lot row) and right (to keep the price column) around the top anchors.
const RESOURCE_HDV_PAD = { right: 0.1, bottom: 0.4 };
// Keep only markers whose left edge is within this fraction of the image width
// from the primary (leftmost) marker — drops matches from other windows.
const CLUSTER_WIDTH_FRACTION = 0.4;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Compute a crop rectangle (natural pixels) for the panel relevant to `kind`,
 * or null if no markers are found or the region is too small to be useful.
 */
export function computeAutoCrop(
  words: WordBox[],
  size: ImageSize,
  kind: ScreenshotKind,
  category?: ItemCategory,
): CropRect | null {
  const anchors = ANCHORS[kind];
  if (!anchors || words.length === 0) return null;

  const hits = words.filter((w) => {
    const t = normalize(w.text);
    return anchors.some((a) => t.includes(a));
  });
  if (hits.length === 0) return null;

  // Primary marker = the leftmost hit; keep the cluster around it so markers from
  // another window (e.g. the item list on the right of the HDV) are excluded.
  const primaryX = Math.min(...hits.map((h) => h.bbox.x0));
  const clustered = hits.filter(
    (h) => h.bbox.x0 - primaryX <= CLUSTER_WIDTH_FRACTION * size.width,
  );

  const x0 = Math.min(...clustered.map((h) => h.bbox.x0));
  const y0 = Math.min(...clustered.map((h) => h.bbox.y0));
  const x1 = Math.max(...clustered.map((h) => h.bbox.x1));
  const y1 = Math.max(...clustered.map((h) => h.bbox.y1));

  let pad = PADDING[kind] ?? DEFAULT_PADDING;
  if (kind === "hdv" && category === "resource") {
    pad = { ...pad, ...RESOURCE_HDV_PAD };
  }
  const px = size.width;
  const py = size.height;
  const left = clamp(x0 - pad.left * px, 0, px);
  const top = clamp(y0 - pad.top * py, 0, py);
  const right = clamp(x1 + pad.right * px, 0, px);
  const bottom = clamp(y1 + pad.bottom * py, 0, py);

  const width = right - left;
  const height = bottom - top;
  // Ignore a crop that's implausibly small (bad anchors) or basically the whole
  // image (no point second-passing).
  if (width < 0.05 * px || height < 0.03 * py) return null;
  if (width > 0.98 * px && height > 0.98 * py) return null;

  return { x: left, y: top, width, height };
}
