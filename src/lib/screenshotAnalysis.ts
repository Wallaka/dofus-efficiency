/**
 * Heuristic analysis of a Medal screenshot's OCR text.
 *
 * Phase 1, first pass: from the raw text Tesseract reads off a screenshot, guess
 * *what* the screenshot shows (an HDV sale/buy window? something else?), what
 * kind of item it is (a resource sold in lots vs a piece of equipment), and —
 * for resources — the price of each lot (x1 / x10 / x100).
 *
 * These are deliberately simple keyword/structure heuristics. We don't have real
 * screenshots yet (see the Open Questions in TECH_NOTES), so everything here is
 * meant to be easy to retune once we see actual HDV layouts.
 */

/** What the screenshot appears to show. */
export type ScreenshotKind = "hdv-listing" | "other" | "unknown";

/** Rough item family, as far as we can tell from the text. */
export type ItemCategory = "resource" | "equipment" | "unknown";

/** One price row: a lot size and its (cheapest) price in kamas. */
export interface Lot {
  quantity: number;
  price: number | null;
  /** price / quantity, so different lot sizes can be compared. */
  unitPrice: number | null;
}

export interface ScreenshotAnalysis {
  kind: ScreenshotKind;
  category: ItemCategory;
  /** Best guess at the item's name (usually the title line). */
  itemName: string | null;
  /** Detected lots, ordered by quantity. Empty if none found. */
  lots: Lot[];
  /** Short human note about how confident/complete this guess is. */
  note: string;
  /** The raw OCR text, kept for debugging and manual correction. */
  rawText: string;
}

/** The lot sizes Dofus sells resources in. */
const LOT_SIZES = [1, 10, 100] as const;

// Keyword sets, matched against accent-stripped, lowercased text.
const HDV_KEYWORDS = [
  "hotel de vente",
  "mettre en vente",
  "en vente",
  "prix",
  "lot de",
  "acheter",
  "vendre",
  "quantite",
  "frais",
];
const EQUIPMENT_KEYWORDS = [
  "vitalite",
  "force",
  "intelligence",
  "chance",
  "agilite",
  "sagesse",
  "puissance",
  "dommages",
  "coup critique",
  "portee",
  "invocation",
  "soin",
  "niveau",
];

/** Lowercase and strip accents so keyword matching survives OCR/diacritics. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Turn an OCR number token ("1 234", "12.000", "115 000 k") into a number. */
function parsePrice(token: string): number | null {
  const digits = token.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * Find the price for each lot size, one line at a time: match a lot marker (a
 * bare 1/10/100, or "x10", or "Lot de 100 :") followed by a price on the same
 * line. Only 1/10/100 count, so stat lines like "+15 Vitalité" are ignored.
 * We deliberately do *not* guess by pairing arbitrary numbers — that produced
 * false positives on equipment. Refine with real screenshots (see TECH_NOTES).
 */
export function parseLots(text: string): Lot[] {
  const lines = text.split(/\r?\n/);
  const found = new Map<number, number>();

  for (const line of lines) {
    // Price token stays on this line (no \s, which would span newlines).
    const m = /(?:^|\b)(?:x|lot\s*de\s*)?\s*(1|10|100)\b[^\d\n]+(\d[\d.,  ]*\d|\d)/i.exec(
      line,
    );
    if (!m) continue;
    const qty = Number(m[1]);
    const price = parsePrice(m[2]);
    if (price != null && !found.has(qty)) found.set(qty, price);
  }

  return [...found.entries()]
    .map(([quantity, price]) => ({
      quantity,
      price,
      unitPrice: price != null ? price / quantity : null,
    }))
    .sort((a, b) => a.quantity - b.quantity);
}

/** Guess the item's name: the first "wordy" line (title), lightly cleaned. */
function guessItemName(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // Skip empty, pure-number, and very short lines.
    const letters = line.replace(/[^a-zA-Z\u00c0-\u00ff]/g, "");
    if (letters.length >= 3 && letters.length >= line.length / 2) {
      return line.replace(/\s{2,}/g, " ");
    }
  }
  return null;
}

function countMatches(haystack: string, needles: string[]): number {
  return needles.reduce((n, kw) => (haystack.includes(kw) ? n + 1 : n), 0);
}

/** Run all heuristics over the OCR text and return a structured analysis. */
export function analyzeScreenshot(rawText: string): ScreenshotAnalysis {
  const norm = normalize(rawText);
  const lots = parseLots(rawText);

  const hdvHits = countMatches(norm, HDV_KEYWORDS);
  const equipHits = countMatches(norm, EQUIPMENT_KEYWORDS);
  const hasLots = lots.length >= 2; // 1/10/100 structure is a strong HDV signal

  let kind: ScreenshotKind;
  if (hdvHits >= 1 || hasLots) kind = "hdv-listing";
  else if (norm.trim().length === 0) kind = "unknown";
  else kind = "other";

  let category: ItemCategory;
  if (hasLots) category = "resource";
  else if (equipHits >= 2) category = "equipment";
  else category = "unknown";

  const itemName = guessItemName(rawText);

  const note = buildNote({ kind, category, lots, hasLots });

  return { kind, category, itemName, lots, note, rawText };
}

function buildNote(a: {
  kind: ScreenshotKind;
  category: ItemCategory;
  lots: Lot[];
  hasLots: boolean;
}): string {
  if (a.kind === "unknown") return "Aucun texte lisible dans cette capture.";
  if (a.category === "resource") {
    const missing = LOT_SIZES.filter(
      (q) => !a.lots.some((l) => l.quantity === q && l.price != null),
    );
    if (missing.length === 0) return "Ressource : prix des lots x1, x10 et x100 détectés.";
    return `Ressource : lots manquants (${missing.map((q) => "x" + q).join(", ")}) — à vérifier.`;
  }
  if (a.category === "equipment")
    return "Équipement probable (caractéristiques détectées), pas de lots.";
  return "Type incertain — à affiner avec de vraies captures.";
}
