import type { Item } from "../types";

/**
 * Rank candidate items by how well their name matches an OCR'd name, so the best
 * guess can be pre-selected in the "record price" step. DofusDB's search already
 * returns relevant items; this just re-orders them by closeness to what OCR read
 * (which may contain small errors), and gives a 0–1 confidence for the UI.
 */

export interface ItemMatch {
  item: Item;
  /** 0–1, higher is closer. */
  score: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance (small strings, so the simple DP is fine). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity 0–1 combining edit distance with token overlap. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const maxLen = Math.max(na.length, nb.length);
  const editSim = 1 - levenshtein(na, nb) / maxLen;

  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const tokenSim = inter / Math.max(ta.size, tb.size);

  // Weight token overlap a bit higher: OCR often nails whole words but drops one.
  return 0.5 * editSim + 0.5 * tokenSim;
}

/** Rank candidates against `name`, best first. */
export function rankItemMatches(name: string, candidates: Item[]): ItemMatch[] {
  return candidates
    .map((item) => ({ item, score: similarity(name, item.name) }))
    .sort((a, b) => b.score - a.score);
}
