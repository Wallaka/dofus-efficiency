/**
 * Turn a spoken phrase like "bois de frêne 147" into structured data
 * `{ name: "bois de frêne", price: 147 }`.
 *
 * This is the heart of the voice-entry experiment: speech-to-text gives us a
 * raw French string, and these *pure* functions pull out the item name and the
 * price. Keeping them free of any browser/mic dependency means we can unit-test
 * the tricky bits (French number words, "k"/"mille", lot quantities) exactly.
 *
 * Grammar we understand (loosely):
 *   <name> <price>                  →  "chanvre 12"          → chanvre, 12
 *   <name> <price> k                →  "frostiz 3 k"         → frostiz, 3000
 *   <name> fois <qty> <price>       →  "ortie fois cent 900" → ortie, 900, lot 100
 *   <name> x<qty> <price>           →  "ortie x100 900"      → ortie, 900, lot 100
 * Numbers may be digits ("147", "12 000") or French words ("cent quarante-sept").
 */

export interface ParsedUtterance {
  /** The item name as spoken (accents kept, trimmed). */
  name: string;
  /** Price in kamas, or null if we couldn't find a trailing number. */
  price: number | null;
  /** Lot quantity (x1/x10/x100/x1000) if a "fois N" / "xN" was spoken. */
  lot?: number;
}

/** French number words → value. Enough for realistic HDV prices. */
const WORDS: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  cent: 100,
  cents: 100,
  mille: 1000,
  million: 1_000_000,
  millions: 1_000_000,
};

/** Words that glue a number together but carry no value of their own. */
const NUMBER_GLUE = new Set(["et", "k"]);

/** Strip accents/case so "frêne" and "FRENE" compare equal. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Is this token part of a spoken number? (digits, a number word, or glue.) */
function isNumberToken(token: string): boolean {
  const t = fold(token).replace(/[.,]/g, "");
  if (t === "") return false;
  if (/^\d+k?$/.test(t)) return true; // 147, 12000, 3k
  if (t in WORDS) return true;
  if (NUMBER_GLUE.has(t)) return true;
  return false;
}

/**
 * Parse a French number from a short phrase. Handles digits ("12 000", "3k"),
 * French words ("cent quarante-sept", "douze mille"), and the quatre-vingt
 * special case. Returns null if nothing number-like is found.
 */
export function parseFrenchNumber(text: string): number | null {
  const cleaned = fold(text).replace(/[,]/g, " ").trim();
  if (cleaned === "") return null;

  // Fast path: a plain digit run, possibly grouped by spaces/dots, maybe "k".
  const digits = cleaned.replace(/[\s.]/g, "");
  const kSuffix = /^(\d+)k$/.exec(digits);
  if (kSuffix) return Number(kSuffix[1]) * 1000;
  if (/^\d+$/.test(digits)) return Number(digits);

  // Word path. Split on spaces and hyphens, fold "quatre vingt(s)" → 80 first.
  let tokens = cleaned.split(/[\s-]+/).filter(Boolean);
  const folded: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (
      tokens[i] === "quatre" &&
      (tokens[i + 1] === "vingt" || tokens[i + 1] === "vingts")
    ) {
      folded.push("__80__");
      i++; // consume "vingt"
    } else {
      folded.push(tokens[i]);
    }
  }
  tokens = folded;

  let result = 0;
  let current = 0;
  let sawAny = false;
  for (const tok of tokens) {
    if (tok === "et") continue;
    let value: number;
    if (tok === "__80__") value = 80;
    else if (/^\d+k?$/.test(tok)) {
      value = tok.endsWith("k") ? Number(tok.slice(0, -1)) * 1000 : Number(tok);
    } else if (tok in WORDS) value = WORDS[tok];
    else continue; // unknown word — skip, stay lenient
    sawAny = true;

    if (tok === "__80__") {
      current += 80;
    } else if (value === 100) {
      current = (current === 0 ? 1 : current) * 100;
    } else if (value === 1000 || value === 1_000_000) {
      result += (current === 0 ? 1 : current) * value;
      current = 0;
    } else {
      current += value;
    }
  }
  if (!sawAny) return null;
  return result + current;
}

/**
 * Split a spoken phrase into `{ name, price, lot? }`.
 *
 * Strategy: peel number-like tokens off the END to get the price, then look for
 * a "fois N" / "xN" lot marker just before the remaining name.
 */
export function parseUtterance(raw: string): ParsedUtterance | null {
  let text = raw.replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return null;

  // Pull out an optional lot marker first — "x100", "x 100", or "fois cent" —
  // so its quantity doesn't get swallowed into the price when the two numbers
  // sit next to each other ("ortie x100 900").
  let lot: number | undefined;
  const lotRe = /\b(?:x\s*(\d+)|fois\s+([\wÀ-ɏ]+))\b/i;
  const lotMatch = lotRe.exec(text);
  if (lotMatch) {
    const qty = lotMatch[1]
      ? Number(lotMatch[1])
      : parseFrenchNumber(lotMatch[2]);
    if (qty && qty > 0) {
      lot = qty;
      text = (text.slice(0, lotMatch.index) + text.slice(lotMatch.index + lotMatch[0].length))
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  // Peel the trailing number tokens off what remains as the price.
  const tokens = text.split(" ").filter(Boolean);
  let cut = tokens.length;
  while (cut > 0 && isNumberToken(tokens[cut - 1])) cut--;
  const price =
    cut < tokens.length ? parseFrenchNumber(tokens.slice(cut).join(" ")) : null;

  const name = tokens.slice(0, cut).join(" ").replace(/[.,]+$/, "").trim();
  if (name === "" && price === null) return null;
  return { name, price, ...(lot ? { lot } : {}) };
}
