/**
 * Heuristic analysis of a Medal screenshot's OCR text.
 *
 * Calibrated against real screenshots, which turned out to be *full-screen* game
 * captures (lots of noise: chat, quests, menus), most often showing an item
 * tooltip. So we key off distinctive tooltip markers rather than generic words:
 *
 *   - "PRIX MOYEN <n>"  → the item's average HDV price (the main signal)
 *   - "Niveau <n> · <Type>" + "Panoplie de <Set>" + "EFFETS" → an item tooltip
 *   - x1 / x10 / x100 rows → the HDV buy window for a resource (kept for later)
 *
 * Everything is deliberately simple and easy to retune. Because captures are
 * full-screen, robust extraction ultimately wants a crop/region step (see the
 * roadmap) — these text heuristics are the first, no-crop pass.
 */

/** What the screenshot appears to show. */
export type ScreenshotKind =
  | "item-tooltip"
  | "hdv-lots"
  | "inventory"
  | "character-sheet"
  | "other"
  | "unknown";

/** Rough item family, as far as we can tell from the text. */
export type ItemCategory = "resource" | "equipment" | "unknown";

/** One HDV lot row: a lot size and its (cheapest) price in kamas. */
export interface Lot {
  quantity: number;
  price: number | null;
  /** price / quantity, so different lot sizes can be compared. */
  unitPrice: number | null;
}

export interface ScreenshotAnalysis {
  kind: ScreenshotKind;
  category: ItemCategory;
  /** Best guess at the item's name (the tooltip title line). */
  itemName: string | null;
  /** Item level, from "Niveau N". */
  level: number | null;
  /** Item type, e.g. "Chapeau", "Cape", "Amulette". */
  itemType: string | null;
  /** Set name, from "Panoplie de X". */
  set: string | null;
  /** Average HDV price, from "PRIX MOYEN". This is the main price signal. */
  averagePrice: number | null;
  /** HDV lot prices (x1/x10/x100), for resource buy windows. Usually empty. */
  lots: Lot[];
  /** Short human note about the guess. */
  note: string;
  /** The raw OCR text, kept for debugging and manual correction. */
  rawText: string;
}

const LOT_SIZES = [1, 10, 100] as const;

// Equipment/resource type words as they appear after "Niveau N ·".
const EQUIPMENT_TYPES = [
  "chapeau",
  "cape",
  "amulette",
  "anneau",
  "bottes",
  "ceinture",
  "bouclier",
  "coiffe",
  "sac",
  "familier",
  "montilier",
  "dofus",
  "trophee",
  "epee",
  "dague",
  "dagues",
  "marteau",
  "hache",
  "pelle",
  "arc",
  "baguette",
  "baton",
  "faux",
  "pioche",
];
const RESOURCE_TYPES = [
  "ressource",
  "ressources",
  "poudre",
  "plante",
  "fleur",
  "minerai",
  "bois",
  "cereale",
  "cereales",
  "poisson",
  "viande",
  "cuir",
  "laine",
  "peau",
  "os",
  "alliage",
  "etoffe",
  "teinture",
  "huile",
  "fragment",
  "rune",
];
// Distinctive of the character sheet, unlikely to appear in chat noise.
const CHARACTER_SHEET_MARKERS = [
  "prospection",
  "initiative",
  "tacle",
  "retrait pa",
  "retrait pm",
  "esquive pa",
  "esquive pm",
  "pods",
];
// Item-tooltip stat lines (used only as a weak equipment hint).
const STAT_KEYWORDS = [
  "vitalite",
  "force",
  "intelligence",
  "chance",
  "agilite",
  "sagesse",
  "puissance",
  "dommages",
];

/** Lowercase + strip accents so keyword matching survives OCR/diacritics. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Turn an OCR number token ("4 538 401", "12.000") into a number. */
function parsePrice(token: string): number | null {
  const digits = token.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function countMatches(haystack: string, needles: string[]): number {
  return needles.reduce((n, kw) => (haystack.includes(kw) ? n + 1 : n), 0);
}

/** Extract the "PRIX MOYEN" value, the average HDV price shown in tooltips. */
export function parseAveragePrice(text: string): number | null {
  const m = /prix\s*moyen[\s:]*(\d[\d\s., ]*\d|\d)/i.exec(text);
  return m ? parsePrice(m[1]) : null;
}

/** Set name from "Panoplie de X". */
function parseSet(text: string): string | null {
  const m = /panoplie\s+d[eu']\s*([^\n]+)/i.exec(text);
  return m ? m[1].trim().replace(/\s{2,}/g, " ") : null;
}

interface TypeLine {
  index: number;
  level: number | null;
  itemType: string | null;
}

/**
 * Find the tooltip's "Niveau N · Type" line and read the level and type from it.
 * We anchor on a line that both says "Niveau N" and contains a known item type,
 * so we don't pick up a stray "Niveau 200" from the map header or chat.
 */
function findTypeLine(lines: string[]): TypeLine | null {
  const allTypes = [...EQUIPMENT_TYPES, ...RESOURCE_TYPES];
  for (let i = 0; i < lines.length; i++) {
    const norm = normalize(lines[i]);
    if (!/niveau\s*\d/.test(norm)) continue;
    const level = Number(/niveau\s*(\d{1,3})/.exec(norm)?.[1] ?? NaN);
    const type = allTypes.find((t) => new RegExp(`\\b${t}\\b`).test(norm));
    if (type) {
      return { index: i, level: Number.isFinite(level) ? level : null, itemType: type };
    }
  }
  return null;
}

/** The item name: the non-empty line just above the "Niveau N · Type" line. */
function nameBefore(lines: string[], typeIndex: number): string | null {
  for (let i = typeIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(line)) {
      return line.replace(/\s{2,}/g, " ");
    }
  }
  return null;
}

/**
 * Parse HDV lot prices (x1 / x10 / x100), one line at a time. An explicit lot
 * marker ("x10" or "Lot de 100") is REQUIRED — full-screen captures are full of
 * bare numbers (stat ranges like "[101 à 150]", flavor text like "10 000
 * exemplaires") that would otherwise be mistaken for lots. Once we have a real
 * HDV resource screenshot we can widen this to the exact layout it shows.
 */
export function parseLots(text: string): Lot[] {
  const found = new Map<number, number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /(?:^|[^a-z0-9])(?:x\s*|lots?\s*de\s+)(1|10|100)\b[^\d\n]*(\d[\d.,  ]*\d|\d)/i.exec(
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

/** Run all heuristics over the OCR text and return a structured analysis. */
export function analyzeScreenshot(rawText: string): ScreenshotAnalysis {
  const norm = normalize(rawText);
  const lines = rawText.split(/\r?\n/);

  const lots = parseLots(rawText);
  const averagePrice = parseAveragePrice(rawText);
  const set = parseSet(rawText);
  const typeLine = findTypeLine(lines);
  const itemType = typeLine?.itemType ?? null;
  const level = typeLine?.level ?? null;
  const itemName = typeLine ? nameBefore(lines, typeLine.index) : null;

  const hasLots = lots.length >= 2;
  const hasEffets = norm.includes("effets");
  const looksLikeTooltip =
    averagePrice != null || (typeLine != null && (set != null || hasEffets));
  const sheetHits = countMatches(norm, CHARACTER_SHEET_MARKERS);
  const isInventory =
    norm.includes("inventaire") &&
    /(toutes categories|recettes|equiper un ensemble)/.test(norm);

  let kind: ScreenshotKind;
  if (hasLots) kind = "hdv-lots";
  else if (looksLikeTooltip) kind = "item-tooltip";
  else if (sheetHits >= 3) kind = "character-sheet";
  else if (isInventory) kind = "inventory";
  else if (norm.trim().length === 0) kind = "unknown";
  else kind = "other";

  let category: ItemCategory;
  if (itemType && EQUIPMENT_TYPES.includes(itemType)) category = "equipment";
  else if (hasLots || (itemType && RESOURCE_TYPES.includes(itemType)))
    category = "resource";
  else if (countMatches(norm, STAT_KEYWORDS) >= 2 && hasEffets)
    category = "equipment";
  else category = "unknown";

  return {
    kind,
    category,
    itemName,
    level,
    itemType: itemType ? capitalize(itemType) : null,
    set,
    averagePrice,
    lots,
    note: buildNote({ kind, category, averagePrice, lots }),
    rawText,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildNote(a: {
  kind: ScreenshotKind;
  category: ItemCategory;
  averagePrice: number | null;
  lots: Lot[];
}): string {
  switch (a.kind) {
    case "item-tooltip":
      return a.averagePrice != null
        ? "Infobulle d'objet : prix moyen détecté."
        : "Infobulle d'objet, mais prix moyen non lu — à vérifier.";
    case "hdv-lots": {
      const missing = LOT_SIZES.filter(
        (q) => !a.lots.some((l) => l.quantity === q && l.price != null),
      );
      return missing.length === 0
        ? "Fenêtre HDV : prix des lots x1, x10 et x100 détectés."
        : `Fenêtre HDV : lots manquants (${missing.map((q) => "x" + q).join(", ")}).`;
    }
    case "character-sheet":
      return "Fiche de personnage — pas de prix ici.";
    case "inventory":
      return "Inventaire — ouvrez une infobulle d'objet pour lire un prix.";
    case "unknown":
      return "Aucun texte lisible dans cette capture.";
    default:
      return "Type incertain — aucun marqueur de prix reconnu.";
  }
}
