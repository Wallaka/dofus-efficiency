/**
 * Read the date axis of the "Cours du marché" line graph.
 *
 * We deliberately do NOT try to reconstruct each day's price from the curve:
 * real-OCR testing showed pixel-sampling a line chart is unreliable (partial
 * days, wrong values), and the reliable price signal is the "Prix médian / moyen"
 * text, which we read elsewhere. So here we only read the x-axis dates, to show
 * the period the médian/moyen covers.
 */

export interface WordBoxLike {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

const DATE_RE = /\b(\d{2})[/.-](\d{2})\b/;
// OCR sometimes drops the separator ("08/09" → "0809"); accept a bare 4-digit
// token only when it looks like DD MM, and only on the confirmed date row.
const DATE_NOSEP_RE = /\b(\d{2})(\d{2})\b/;

function looksLikeDay(dd: number, mm: number): boolean {
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12;
}

/**
 * X-axis date labels (e.g. "05/09"), de-duplicated and left→right. OCR often
 * emits the same date more than once (block + line levels, or a faint repeat),
 * which would double the list — so we collapse repeats and average positions.
 */
export function parseDateLabels(
  words: WordBoxLike[],
): { date: string; x: number; y: number }[] {
  const cx = (w: WordBoxLike) => (w.bbox.x0 + w.bbox.x1) / 2;
  const cy = (w: WordBoxLike) => (w.bbox.y0 + w.bbox.y1) / 2;

  const byDate = new Map<string, { xs: number[]; ys: number[] }>();
  const add = (date: string, w: WordBoxLike) => {
    const e = byDate.get(date) ?? { xs: [], ys: [] };
    e.xs.push(cx(w));
    e.ys.push(cy(w));
    byDate.set(date, e);
  };

  // 1) Separated dates ("05/09") are unambiguous — collect them first.
  for (const w of words) {
    const m = DATE_RE.exec(w.text);
    if (m) add(`${m[1]}/${m[2]}`, w);
  }

  // 2) If we have a date row, also accept bare "DDMM" tokens sitting on it (OCR
  //    dropped the slash), so the list isn't missing days.
  const seededYs = [...byDate.values()].flatMap((e) => e.ys);
  if (seededYs.length > 0) {
    const rowY = seededYs.reduce((s, v) => s + v, 0) / seededYs.length;
    for (const w of words) {
      if (DATE_RE.test(w.text)) continue;
      const m = DATE_NOSEP_RE.exec(w.text);
      if (!m) continue;
      if (!looksLikeDay(Number(m[1]), Number(m[2]))) continue;
      if (Math.abs(cy(w) - rowY) > 20) continue; // must be on the date row
      add(`${m[1]}/${m[2]}`, w);
    }
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return [...byDate.entries()]
    .map(([date, e]) => ({ date, x: avg(e.xs), y: avg(e.ys) }))
    .sort((a, b) => a.x - b.x);
}

/** The unique x-axis dates read from the graph, left→right. */
export function extractMarketDates(words: WordBoxLike[]): string[] {
  return parseDateLabels(words).map((d) => d.date);
}
