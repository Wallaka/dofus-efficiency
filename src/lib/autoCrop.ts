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
import type { ScreenshotKind } from "./screenshotAnalysis";

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
  // Only the market stats line's *distinctive* words — "cours"/"marche"/"moyen"
  // also appear in the chat ("en cours") and other windows, and would drag the
  // crop cluster onto the wrong panel. "médian/articles/vendus" are unique to the
  // "Cours du marché" window.
  "market-trend": ["median", "articles", "vendus"],
  // The buy detail's unique marker "Quantité en inventaire" — one line, present in
  // both the inline and floating-popup layouts. Anchoring here (not on
  // moyen/lot/acheter, which also appear in the listing, category filter and the
  // inventory tooltip) keeps the crop on the item detail. Name is above, lot table
  // below, prices to the right (see PADDING/HDV_LOT_PAD).
  hdv: ["quantite", "inventaire"],
  // The sell panel's left column only — these words don't appear in the listing
  // to its right, so the crop stays on the name + prix moyen + lot table.
  "hdv-sell": ["actuellement", "quantite", "restant", "retirer", "modifier"],
  "item-tooltip": ["panoplie", "effets", "moyen", "poids", "niveau", "niv"],
};

// Padding is expressed in *text heights* (ems) — multiples of the panel's OCR'd
// line height — NOT a fraction of the image. Dofus' UI is a fixed pixel size for a
// given UI scale, independent of screen resolution, and the OCR word boxes measure
// that size directly. So the crop follows the panel wherever it sits AND whatever
// the resolution/UI scale (the whole point: it must work on someone else's setup,
// not just the layout it was tuned on). The values below were calibrated at ~21px
// line height; see textHeightEm().
const PADDING: Partial<Record<ScreenshotKind, Padding>> = {
  // Anchored on the stats line (médian/articles/vendus), which sits to the right
  // of and below the item's header. Pad well left + up to reach the item name and
  // level, and far down to include the graph + its 7-day date axis.
  "market-trend": { left: 55, right: 12, top: 19, bottom: 52 },
  hdv: { left: 2.3, right: 2, top: 6, bottom: 8 },
  // Narrow left column: pad up to the item name, down to the lot table, and only a
  // little right (the listing sits just past the price column).
  "hdv-sell": { left: 7, right: 16, top: 17, bottom: 25 },
  "item-tooltip": { left: 9, right: 9, top: 6, bottom: 5 },
};

const DEFAULT_PADDING: Padding = { left: 9, right: 9, top: 6, bottom: 6 };

// The HDV lot list (x1/x10/x100/x1000) sits below the detail header, and the lot
// *prices* sit to the right of the quantities. The anchor cluster only reliably
// covers the labels (the "ACHETER" buttons on the far right aren't always read),
// so pad generously down and right to keep every row and the whole price column —
// regardless of how wide the detected cluster happens to be. Applied to all HDV
// (category is often still "unknown" at the locate pass).
const HDV_LOT_PAD = { right: 19, bottom: 20 };
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
 * The panel's line height in pixels — the unit padding is measured in. Uses the
 * median height of the anchor word boxes (so it tracks the actual UI scale), with
 * a fallback and clamp so a stray giant/tiny OCR box can't blow up the crop.
 */
function textHeightEm(words: WordBox[], size: ImageSize): number {
  // Median over ALL detected words (a large, stable sample) — the UI text is one
  // size, so this tracks the UI scale far more reliably than a few anchor boxes.
  const heights = words
    .map((w) => w.bbox.y1 - w.bbox.y0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const median = heights.length ? heights[heights.length >> 1] : 0;
  const em = median > 0 ? median : size.height * 0.02;
  return clamp(em, size.height * 0.005, size.height * 0.06);
}

/**
 * Compute a crop rectangle (natural pixels) for the panel relevant to `kind`,
 * or null if no markers are found or the region is too small to be useful.
 */
export function computeAutoCrop(
  words: WordBox[],
  size: ImageSize,
  kind: ScreenshotKind,
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
  if (kind === "hdv") {
    pad = { ...pad, ...HDV_LOT_PAD };
  }
  const px = size.width;
  const py = size.height;
  // Padding in text-heights (resolution-independent), measured from the whole page.
  const em = textHeightEm(words, size);
  const left = clamp(x0 - pad.left * em, 0, px);
  const top = clamp(y0 - pad.top * em, 0, py);
  const right = clamp(x1 + pad.right * em, 0, px);
  const bottom = clamp(y1 + pad.bottom * em, 0, py);

  const width = right - left;
  const height = bottom - top;
  // Ignore a crop that's implausibly small (bad anchors) or basically the whole
  // image (no point second-passing).
  if (width < 0.05 * px || height < 0.03 * py) return null;
  if (width > 0.98 * px && height > 0.98 * py) return null;

  return { x: left, y: top, width, height };
}
