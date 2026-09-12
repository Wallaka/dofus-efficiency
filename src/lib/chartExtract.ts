/**
 * Read a per-day price series off the "Cours du marché" line graph.
 *
 * A line chart has no number printed on each day's point — the value IS the
 * height of the curve. So we can't OCR the daily prices directly; instead we:
 *   1. OCR gives us the x-axis DATE labels and the y-axis PRICE tick labels
 *      (with their pixel positions).
 *   2. Build a pixel→price scale from the y-axis ticks (linear fit).
 *   3. For each date's x column, find where the curve/filled area sits (topmost
 *      non-background pixel with fill below it), and convert that y to a price.
 *
 * The axis reading is plain OCR; the curve reading is light image processing on
 * the same image. Colours/thresholds may need tuning to the real graph.
 */

export interface WordBoxLike {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const DATE_RE = /\b(\d{2})[/.-](\d{2})\b/;
// OCR sometimes drops the separator ("08/09" → "0809"); accept a bare 4-digit
// token only when it looks like DD MM, and only on the confirmed date row.
const DATE_NOSEP_RE = /\b(\d{2})(\d{2})\b/;

function looksLikeDay(dd: number, mm: number): boolean {
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12;
}

interface Labelled {
  value: number;
  x: number;
  y: number;
}

/**
 * X-axis date labels (e.g. "05/09"), de-duplicated and left→right. OCR often
 * emits the same date more than once (block + line levels, or a faint repeat),
 * which would double the series — so we collapse repeats of the same day and
 * average their positions.
 */
export function parseDateLabels(
  words: WordBoxLike[],
): { date: string; x: number; y: number }[] {
  const cx = (w: WordBoxLike) => (w.bbox.x0 + w.bbox.x1) / 2;
  const cy = (w: WordBoxLike) => (w.bbox.y0 + w.bbox.y1) / 2;

  // 1) Separated dates ("05/09") are unambiguous — collect them first.
  const byDate = new Map<string, { xs: number[]; ys: number[] }>();
  const add = (date: string, w: WordBoxLike) => {
    const e = byDate.get(date) ?? { xs: [], ys: [] };
    e.xs.push(cx(w));
    e.ys.push(cy(w));
    byDate.set(date, e);
  };
  for (const w of words) {
    const m = DATE_RE.exec(w.text);
    if (m) add(`${m[1]}/${m[2]}`, w);
  }

  // 2) If we have a date row, also accept bare "DDMM" tokens sitting on it (OCR
  //    dropped the slash), so the series isn't missing days.
  const seededYs = [...byDate.values()].flatMap((e) => e.ys);
  if (seededYs.length > 0) {
    const rowY = seededYs.reduce((s, v) => s + v, 0) / seededYs.length;
    for (const w of words) {
      if (DATE_RE.test(w.text)) continue;
      const m = DATE_NOSEP_RE.exec(w.text);
      if (!m) continue;
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      if (!looksLikeDay(dd, mm)) continue;
      if (Math.abs(cy(w) - rowY) > 20) continue; // must be on the date row
      add(`${m[1]}/${m[2]}`, w);
    }
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return [...byDate.entries()]
    .map(([date, e]) => ({ date, x: avg(e.xs), y: avg(e.ys) }))
    .sort((a, b) => a.x - b.x);
}

function asPlainNumber(text: string): number | null {
  if (!/^\d[\d  .]*\d$|^\d$/.test(text.trim())) return null;
  const n = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Y-axis price ticks: the vertical stack of plain numbers on the left. We take
 * the largest cluster of numeric words that share an x (a column) and spread in
 * y — that's the axis, whatever the price magnitude.
 */
export function parsePriceTicks(words: WordBoxLike[]): Labelled[] {
  const nums: Labelled[] = [];
  for (const w of words) {
    if (DATE_RE.test(w.text)) continue;
    const value = asPlainNumber(w.text);
    if (value == null) continue;
    nums.push({
      value,
      x: (w.bbox.x0 + w.bbox.x1) / 2,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
    });
  }
  if (nums.length < 3) return [];

  // Cluster by x (axis numbers are vertically aligned).
  const X_TOL = 40;
  let best: Labelled[] = [];
  for (const seed of nums) {
    const group = nums.filter((n) => Math.abs(n.x - seed.x) <= X_TOL);
    const ySpread = Math.max(...group.map((g) => g.y)) - Math.min(...group.map((g) => g.y));
    if (group.length > best.length && group.length >= 3 && ySpread > 20) {
      best = group;
    }
  }
  return best.sort((a, b) => a.y - b.y);
}

/** Least-squares fit price = a·pixelY + b, returned as a converter. */
export function buildLinearScale(
  samples: { value: number; pixel: number }[],
): ((pixel: number) => number) | null {
  const n = samples.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const s of samples) {
    sx += s.pixel;
    sy += s.value;
    sxx += s.pixel * s.pixel;
    sxy += s.pixel * s.value;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  return (pixel: number) => a * pixel + b;
}

function px(img: PixelImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function diff(a: [number, number, number], b: [number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/**
 * In column `x` between yTop and yBottom, the topmost pixel that differs from the
 * background AND has more background-different pixels below it (a filled area,
 * not a thin gridline). Returns that y, or null.
 */
export function findCurveYInColumn(
  img: PixelImage,
  x: number,
  yTop: number,
  yBottom: number,
  bg: [number, number, number],
  threshold = 60,
): number | null {
  const RUN = 6; // pixels below that should also be "fill"
  const MIN_FILL = 4;
  const xi = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  for (let y = Math.max(0, yTop); y <= Math.min(img.height - 1, yBottom); y++) {
    if (diff(px(img, xi, y), bg) <= threshold) continue;
    let fill = 0;
    for (let k = 1; k <= RUN && y + k <= yBottom; k++) {
      if (diff(px(img, xi, y + k), bg) > threshold) fill++;
    }
    if (fill >= MIN_FILL) return y;
  }
  return null;
}

/** Estimate the plot background from a patch near the top of the plot area. */
function estimateBackground(
  img: PixelImage,
  plotLeft: number,
  plotRight: number,
  plotTop: number,
): [number, number, number] {
  const xs = [plotLeft + 5, (plotLeft + plotRight) / 2, plotRight - 5];
  const ys = [plotTop + 3, plotTop + 8];
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of xs) {
    for (const y of ys) {
      const [pr, pg, pb] = px(img, Math.round(x), Math.round(y));
      r += pr; g += pg; b += pb; n++;
    }
  }
  return [r / n, g / n, b / n];
}

/** Extract the per-day price series from the graph image + OCR word boxes. */
export function extractMarketHistory(
  img: PixelImage,
  words: WordBoxLike[],
): PricePoint[] {
  const dates = parseDateLabels(words);
  const ticks = parsePriceTicks(words);
  if (dates.length < 2 || ticks.length < 2) return [];

  const yToPrice = buildLinearScale(
    ticks.map((t) => ({ value: t.value, pixel: t.y })),
  );
  if (!yToPrice) return [];

  // Plot bounds: horizontally across the dates, vertically across the ticks.
  const plotLeft = Math.min(...dates.map((d) => d.x));
  const plotRight = Math.max(...dates.map((d) => d.x));
  const plotTop = Math.min(...ticks.map((t) => t.y));
  const plotBottom = Math.max(...ticks.map((t) => t.y));
  const bg = estimateBackground(img, plotLeft, plotRight, plotTop);

  const out: PricePoint[] = [];
  for (const d of dates) {
    // Sample a band of columns around the date and take the median curve y —
    // robust to antialiased plot edges and to the label not sitting exactly on a
    // point. The band scales with the image so it works at any resolution.
    const half = Math.max(3, Math.round(img.width * 0.006));
    const ys: number[] = [];
    for (let dx = -half; dx <= half; dx++) {
      const cy = findCurveYInColumn(img, d.x + dx, plotTop, plotBottom, bg);
      if (cy != null) ys.push(cy);
    }
    if (ys.length === 0) continue;
    ys.sort((a, b) => a - b);
    const medY = ys[Math.floor(ys.length / 2)];
    out.push({ date: d.date, price: Math.round(yToPrice(medY)) });
  }
  return out;
}
