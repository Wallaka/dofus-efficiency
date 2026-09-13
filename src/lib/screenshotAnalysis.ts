/**
 * Heuristic analysis of a Medal screenshot's OCR text.
 *
 * Calibrated against real, full-screen captures (several windows open at once,
 * plus chat/quest/menu noise). We recognize the screen type from *distinctive*
 * window markers, in priority order (the focused overlay wins), never from
 * generic words that also appear in chat:
 *
 *   - "Cours du marché" + "articles vendus" / "Prix médian" → price-history graph
 *   - "Hôtel de vente" (ACHAT/VENTE, ACHETER, category panels)               → HDV
 *       · "Catégories d'armes"  / weapon type word     → weapon
 *       · "Catégories de ressources" / resource type   → resource (lots 1/10/100/1000)
 *   - "Panoplie de X" / "EFFETS" / "Niveau N · Type" + "PRIX MOYEN" → item tooltip
 *   - character-sheet stats / "Inventaire"                          → those screens
 *
 * Prices we pull out: "Prix moyen" (main), "Prix médian" (market graph), and
 * resource lot prices when we're in the HDV on a resource.
 */

export type ScreenshotKind =
  | "market-trend"
  | "hdv"
  | "hdv-sell"
  | "item-tooltip"
  | "inventory"
  | "character-sheet"
  | "other"
  | "unknown";

export type ItemCategory =
  | "resource"
  | "rune"
  | "weapon"
  | "equipment"
  | "unknown";

/** One HDV lot row: a lot size and its (cheapest) price in kamas. */
export interface Lot {
  quantity: number;
  price: number | null;
  unitPrice: number | null;
}

export interface ScreenshotAnalysis {
  kind: ScreenshotKind;
  category: ItemCategory;
  itemName: string | null;
  level: number | null;
  itemType: string | null;
  set: string | null;
  /** "Prix moyen" — the main price signal. */
  averagePrice: number | null;
  /** "Prix médian" — shown on the market-trend graph. */
  medianPrice: number | null;
  /** "N articles vendus" over the graph's period, when shown. */
  articlesSold: number | null;
  /** Resource lot prices (x1/x10/x100/x1000), when in the HDV on a resource. */
  lots: Lot[];
  note: string;
  rawText: string;
}

const LOT_SIZES = [1, 10, 100, 1000] as const;

const WEAPON_TYPES = [
  "arc",
  "epee",
  "dague",
  "dagues",
  "lance",
  "marteau",
  "baguette",
  "baton",
  "hache",
  "pelle",
  "faux",
  "pioche",
];
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
];
const RESOURCE_TYPES = [
  "bois",
  "ressource",
  "ressources",
  "poudre",
  "plante",
  "fleur",
  "minerai",
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
  "carapace",
  "coquille",
  "ecorce",
  "galet",
];
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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function parseNumber(token: string): number | null {
  const digits = token.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function countMatches(haystack: string, needles: string[]): number {
  return needles.reduce((n, kw) => (haystack.includes(kw) ? n + 1 : n), 0);
}

function firstNumberAfter(text: string, label: RegExp): number | null {
  const m = label.exec(text);
  return m ? parseNumber(m[1]) : null;
}

// A kamas amount: 1–3 digits, then groups of 3 after a single space/dot. This
// deliberately does NOT bridge a double-space column gap, so "… 104  1 387 925 …"
// reads as 104, not 1041387925.
const PRICE = "\\d{1,3}(?:[ .\\u00a0]\\d{3})*";

// Between the "Prix moyen"/"médian" label and its value there's often a small
// graph icon that OCR reads as junk ("Fr", "[A", "#"), and the value may sit on
// the next line — so allow a short run of non-digits (incl. one line break).
// A real price value: a thousand-grouped number, or 2+ plain digits. Excludes a
// lone single digit — the small graph icon next to "Prix moyen/médian" is often
// OCR'd as a stray "7"/"4", and the true value follows (sometimes on the next line).
const VALUE_RE = /\d{1,3}(?:[ . ]\d{3})+|\d{2,}/;

/**
 * Read the number for a labeled price ("Prix moyen", "Prix médian"). Line-based:
 * find the label, then take the first real value on that line (after the label) or
 * the next two lines — robust to an icon glyph between the label and its value, and
 * to the value sitting on the following line, without scanning the whole screen.
 */
function parseLabeledPrice(text: string, label: RegExp): number | null {
  const lines = normalize(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const end = Math.min(i + 2, lines.length - 1);
    for (let j = i; j <= end; j++) {
      const hay = j === i ? lines[j].slice(m.index + m[0].length) : lines[j];
      const v = VALUE_RE.exec(hay);
      if (v) return parseNumber(v[0]);
    }
    return null; // label found but no value nearby
  }
  return null;
}

export function parseAveragePrice(text: string): number | null {
  return parseLabeledPrice(text, /prix\s*moyen/);
}

export function parseMedianPrice(text: string): number | null {
  // normalize() strips the accent so "médian" matches "median".
  return parseLabeledPrice(text, /prix\s*median/);
}

/** "1 387 925 articles vendus" → total sold over the graph's period. */
export function parseArticlesSold(text: string): number | null {
  return firstNumberAfter(
    normalize(text),
    new RegExp(`(${PRICE})\\s*articles?\\s*vendus?`, "i"),
  );
}

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
 * Find the item header's level line — "Niveau N · Type", "Niv. N · Type", or just
 * "NIV. N" with no type word (the HDV sell panel shows the name + "NIV. 40" and no
 * type). Returns the first such line; `itemType` is null when no type word is on
 * it. The name is the line just above (see nameBefore).
 */
function findTypeLine(lines: string[]): TypeLine | null {
  const allTypes = [...WEAPON_TYPES, ...EQUIPMENT_TYPES, ...RESOURCE_TYPES];
  for (let i = 0; i < lines.length; i++) {
    const norm = normalize(lines[i]);
    // Match "Niveau", "Niv." and the OCR slip "Ni." (v optional, "eau" optional).
    if (!/\bniv?(?:eau)?\.?\s*\d/.test(norm)) continue;
    const level = Number(/\bniv?(?:eau)?\.?\s*(\d{1,3})/.exec(norm)?.[1] ?? NaN);
    const type = allTypes.find((t) => new RegExp(`\\b${t}\\b`).test(norm)) ?? null;
    return { index: i, level: Number.isFinite(level) ? level : null, itemType: type };
  }
  return null;
}

function nameBefore(lines: string[], typeIndex: number): string | null {
  for (let i = typeIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(line)) {
      return cleanItemName(line);
    }
  }
  return null;
}

/**
 * An item-name line read off a busy screen often has leading/trailing OCR junk
 * ("3, 3 4 5, Bois de Frêne CL: 4 e ."). Drop everything before the first letter,
 * then keep the leading run of real words (letters, apostrophes, hyphens),
 * stopping at the first token with a digit or punctuation — that's where the name
 * ends and noise begins.
 */
/** UI words that can bleed onto the item-name line and must not be kept as name. */
const NAME_STOP_WORDS = new Set([
  "q",
  "rechercher",
  "filtrer",
  "nom",
  "lot",
  "prix",
  "achat",
  "vente",
  "aux",
  "materiaux",
  "niveaux",
]);

function cleanItemName(line: string): string | null {
  const stripped = line.replace(/^[^A-Za-zÀ-ÿ]+/, "");
  const kept: string[] = [];
  for (const tok of stripped.split(/\s+/)) {
    // Stop at UI chrome that bleeds onto the name row (search box, table headers).
    if (NAME_STOP_WORDS.has(normalize(tok))) break;
    if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(tok)) kept.push(tok);
    else break;
  }
  // Drop stray single-letter tokens at either end (OCR speckle like a lone "L").
  while (kept.length > 1 && kept[kept.length - 1].length === 1) kept.pop();
  while (kept.length > 1 && kept[0].length === 1) kept.shift();
  const name = kept.join(" ").trim();
  return name.length >= 2 ? name : null;
}

/**
 * Parse resource lot rows (x1 / x10 / x100 / x1000). The lot size must start the
 * line (that's how the HDV lays them out: "1  93", "1 000  119 000"), so item
 * rows elsewhere on screen ("Bois de Frêne … 1 113") aren't mistaken for lots.
 * Longest quantity is tried first so "1 000" isn't read as "1".
 */
export function parseLots(text: string): Lot[] {
  const found = new Map<number, number>();
  for (const line of text.split(/\r?\n/)) {
    // Allow leading non-letter junk (a lot row starts with a star/coin icon that
    // OCR renders as a stray glyph or punctuation) before the quantity — but not
    // leading letters, so item-list rows like "Bois de Frêne … 1 113" are still
    // rejected. Then an optional x/"Lot de" marker, the quantity, and the price.
    const m = /^[^\dA-Za-zÀ-ÿ\n]*(?:x\s*|lots?\s*de\s+)?(1\s?000|100|10|1)\b[^\d\n]*?(\d[\d.,  ]*\d|\d)/i.exec(
      line,
    );
    if (!m) continue;
    const qty = parseNumber(m[1]);
    const price = parseNumber(m[2]);
    if (qty != null && price != null && !found.has(qty)) found.set(qty, price);
  }
  return [...found.entries()]
    .map(([quantity, price]) => ({
      quantity,
      price,
      unitPrice: price != null ? price / quantity : null,
    }))
    .sort((a, b) => a.quantity - b.quantity);
}

/**
 * Lot prices from the HDV sell panel's "Actuellement en vente" table only. The
 * panel also shows "Prix du lot" and "Prix moyen" numbers that plain parseLots
 * would mistake for a x1 lot, so we start parsing after the section header.
 */
export function parseSellLots(text: string): Lot[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /actuellement/.test(normalize(l)));
  const region = start >= 0 ? lines.slice(start + 1) : lines;

  const rows: { quantity: number; price: number }[] = [];
  for (const raw of region) {
    // Each row starts with the item icon (OCR renders it as stray glyphs), then
    // the quantity, then the price. Drop everything up to the first digit.
    const line = raw.replace(/^[^0-9\n]*/, "");
    const m = /^(1\s?000|100|10|1)\s+(\d[\d . ]*\d|\d)/.exec(line);
    if (!m) continue;
    const quantity = parseNumber(m[1]);
    const price = parseNumber(m[2]);
    if (quantity != null && price != null && !rows.some((r) => r.quantity === quantity)) {
      rows.push({ quantity, price });
    }
    if (rows.length === LOT_SIZES.length) break;
  }

  // A row whose per-unit price is a wild outlier means OCR dropped the quantity
  // digit and mis-split the price (e.g. "1 328" read as qty 1 / price 328). Drop
  // it rather than store a wrong lot — better a missing row than a bad one.
  const units = rows.map((r) => r.price / r.quantity).sort((a, b) => a - b);
  const median = units.length ? units[Math.floor(units.length / 2)] : 0;
  const kept =
    rows.length >= 3 && median > 0
      ? rows.filter((r) => {
          const u = r.price / r.quantity;
          return u >= median / 3 && u <= median * 3;
        })
      : rows;

  return kept
    .map((r) => ({ quantity: r.quantity, price: r.price, unitPrice: r.price / r.quantity }))
    .sort((a, b) => a.quantity - b.quantity);
}

export function analyzeScreenshot(rawText: string): ScreenshotAnalysis {
  const norm = normalize(rawText);
  const lines = rawText.split(/\r?\n/);

  const averagePrice = parseAveragePrice(rawText);
  const medianPrice = parseMedianPrice(rawText);
  const articlesSold = parseArticlesSold(rawText);
  const set = parseSet(rawText);
  const typeLine = findTypeLine(lines);
  const itemType = typeLine?.itemType ?? null;
  const level = typeLine?.level ?? null;
  const itemName = typeLine ? nameBefore(lines, typeLine.index) : null;
  const hasEffets = norm.includes("effets");

  // --- Screen type, most-specific overlay first ---
  const isMarketTrend =
    norm.includes("cours du marche") ||
    (norm.includes("articles vendus") && norm.includes("prix median"));
  // The HDV "Vente" (sell) panel: distinctive left column with the current lot
  // prices ("Actuellement en vente") and the sale form ("Prix du lot").
  const isHdvSell =
    /actuellement\s+en\s+vente/.test(norm) || norm.includes("prix du lot");
  const isHdv =
    norm.includes("hotel de vente") ||
    norm.includes("reinitialiser les filtres") ||
    // The buy detail popup's own markers, in case the window title didn't OCR.
    norm.includes("quantite en inventaire") ||
    (norm.includes("acheter") && /\blot\b/.test(norm));
  const looksTooltip =
    norm.includes("panoplie") ||
    (hasEffets && typeLine != null) ||
    (averagePrice != null && typeLine != null);
  const isInventory =
    norm.includes("inventaire") &&
    /(toutes categories|recettes|equiper un ensemble)/.test(norm);
  const sheetHits = countMatches(norm, CHARACTER_SHEET_MARKERS);

  let kind: ScreenshotKind;
  if (isMarketTrend) kind = "market-trend";
  else if (isHdvSell) kind = "hdv-sell";
  else if (isHdv) kind = "hdv";
  else if (looksTooltip) kind = "item-tooltip";
  else if (sheetHits >= 3) kind = "character-sheet";
  else if (isInventory) kind = "inventory";
  else if (norm.trim().length === 0) kind = "unknown";
  else kind = "other";

  // --- Item category ---
  // Each HDV building sells one category, shown by the icon left of "Hôtel de
  // vente" AND by its category-filter / footer text (which OCR *can* read):
  //   · "Catégories de ressources" / "…les ressources en vente"      → resources
  //   · "forgemagie" / "Rune astrale" / "Rune de transcendance"      → runes
  //   · "…les équipements en vente" / "Catégories d'armes"           → equipment
  // These are the reliable signal; item-type words refine it when present.
  const runeHdv = /forgemagie|transcendance|rune\s*astrale/.test(norm);
  const weaponHdv = /categories\s*d.{0,2}armes/.test(norm);
  const resourceHdv =
    /categories\s*de\s*ressour/.test(norm) || /uniquement\s*les\s*ressources/.test(norm);
  const equipHdv = /uniquement\s*les\s*equipements/.test(norm);
  const typeIsWeapon = itemType != null && WEAPON_TYPES.includes(itemType);
  const typeIsResource = itemType != null && RESOURCE_TYPES.includes(itemType);
  const typeIsEquip = itemType != null && EQUIPMENT_TYPES.includes(itemType);
  // Runes' names all begin with "Rune " — covers the sell tab, which shows no
  // category filter to read.
  const nameIsRune = itemName != null && /^\s*rune\b/.test(normalize(itemName));

  let category: ItemCategory;
  if (runeHdv || nameIsRune) category = "rune";
  else if (resourceHdv || typeIsResource) category = "resource";
  else if (weaponHdv || typeIsWeapon) category = "weapon";
  else if (
    equipHdv ||
    typeIsEquip ||
    (hasEffets && countMatches(norm, STAT_KEYWORDS) >= 2)
  )
    category = "equipment";
  else category = "unknown";

  // Lot tables appear in the HDV buy view (a resource's x1/x10/x100/x1000) and in
  // the sell panel's "Actuellement en vente" — the sell panel needs the header-
  // scoped parser so its "Prix du lot"/"Prix moyen" numbers aren't read as lots.
  const lots =
    kind === "hdv-sell"
      ? parseSellLots(rawText)
      : kind === "hdv"
        ? parseLots(rawText)
        : [];

  return {
    kind,
    category,
    itemName,
    level,
    itemType: itemType ? capitalize(itemType) : null,
    set,
    averagePrice,
    medianPrice,
    articlesSold,
    lots,
    note: buildNote({ kind, category, averagePrice, medianPrice, lots }),
    rawText,
  };
}

/**
 * Merge a full-image analysis (which sees every window marker, so it decides the
 * screen type and category) with a cropped-panel analysis (cleaner, so it wins
 * on the actual fields). Used for the two-pass auto-crop flow.
 */
export function mergeAnalyses(
  full: ScreenshotAnalysis,
  cropped: ScreenshotAnalysis,
): ScreenshotAnalysis {
  const kind = full.kind;
  const category = full.category !== "unknown" ? full.category : cropped.category;
  const pick = <T>(a: T | null, b: T | null): T | null => (a != null ? a : b);
  // The crop pass usually loses the "Hôtel de vente" marker, so it classifies as
  // a tooltip and skips lot parsing. For an HDV resource, re-parse lots from the
  // clean, upscaled crop text and prefer it whenever it found at least as many
  // rows as the noisy full-image pass — the crop is exactly what should read the
  // small lot list best, so it must not be overridden by a partial full read.
  let lots = cropped.lots.length > 0 ? cropped.lots : full.lots;
  if (kind === "hdv" || kind === "hdv-sell") {
    const cropLots =
      kind === "hdv-sell"
        ? parseSellLots(cropped.rawText)
        : parseLots(cropped.rawText);
    if (cropLots.length >= lots.length) lots = cropLots;
  }
  // For the market graph and the sell panel, the full image is dominated by the
  // inventory/listing/other windows, so its name AND prices are noise — trust only
  // the cropped panel there (a null field beats a wrong full-image number). Don't
  // fall back to the full-image reads for those.
  const cropOnly = kind === "market-trend" || kind === "hdv-sell";
  const merged: Omit<ScreenshotAnalysis, "note"> = {
    kind,
    category,
    itemName: cropOnly ? cropped.itemName : pick(cropped.itemName, full.itemName),
    level: cropOnly ? cropped.level : pick(cropped.level, full.level),
    itemType: cropOnly ? cropped.itemType : pick(cropped.itemType, full.itemType),
    set: pick(cropped.set, full.set),
    averagePrice: cropOnly ? cropped.averagePrice : pick(cropped.averagePrice, full.averagePrice),
    medianPrice: cropOnly ? cropped.medianPrice : pick(cropped.medianPrice, full.medianPrice),
    articlesSold: cropOnly ? cropped.articlesSold : pick(cropped.articlesSold, full.articlesSold),
    lots,
    rawText: cropped.rawText,
  };
  return {
    ...merged,
    note: buildNote({ kind, category, averagePrice: merged.averagePrice, medianPrice: merged.medianPrice, lots }),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildNote(a: {
  kind: ScreenshotKind;
  category: ItemCategory;
  averagePrice: number | null;
  medianPrice: number | null;
  lots: Lot[];
}): string {
  switch (a.kind) {
    case "market-trend":
      return a.medianPrice != null || a.averagePrice != null
        ? "Cours du marché : prix médian / moyen détectés."
        : "Cours du marché — prix non lus, à vérifier.";
    case "hdv": {
      const cat =
        a.category === "weapon"
          ? "arme"
          : a.category === "resource"
            ? "ressource"
            : "objet";
      if (a.category === "resource") {
        const missing = LOT_SIZES.filter(
          (q) => !a.lots.some((l) => l.quantity === q && l.price != null),
        );
        return missing.length === 0
          ? "HDV ressource : lots x1, x10, x100, x1000 détectés."
          : `HDV ressource : lots manquants (${missing.map((q) => "x" + q).join(", ")}).`;
      }
      return `HDV ${cat}${a.averagePrice != null ? " : prix moyen détecté." : "."}`;
    }
    case "hdv-sell": {
      const missing = LOT_SIZES.filter(
        (q) => !a.lots.some((l) => l.quantity === q && l.price != null),
      );
      return missing.length === 0
        ? "HDV (vente) : prix moyen + lots x1/x10/x100/x1000 détectés."
        : `HDV (vente)${a.averagePrice != null ? " : prix moyen détecté" : ""}${
            missing.length < LOT_SIZES.length
              ? ` (lots manquants : ${missing.map((q) => "x" + q).join(", ")})`
              : ""
          }.`;
    }
    case "item-tooltip":
      return a.averagePrice != null
        ? "Infobulle d'objet : prix moyen détecté."
        : "Infobulle d'objet, prix moyen non lu — à vérifier.";
    case "character-sheet":
      return "Fiche de personnage — pas de prix ici.";
    case "inventory":
      return "Inventaire — ouvrez une infobulle ou l'HDV pour lire un prix.";
    case "unknown":
      return "Aucun texte lisible dans cette capture.";
    default:
      return "Type incertain — aucun marqueur reconnu.";
  }
}
