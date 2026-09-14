/**
 * Turn a spoken phrase like "bois de frêne 147" into structured data
 * `{ name: "bois de frêne", price: 147 }`.
 *
 * This is the heart of the voice-entry experiment: speech-to-text gives us a
 * raw French string, and these *pure* functions pull out the item name and the
 * price. Keeping them free of any browser/mic dependency means we can unit-test
 * the tricky bits (French number words, "k"/"mille", chaining) exactly.
 *
 * Grammar we understand (loosely):
 *   <name> <price>       →  "chanvre 12"       → chanvre, 12
 *   <name> <price> k     →  "frostiz 3 k"      → frostiz, 3000
 * Prices are always the *unit* price. Numbers may be digits ("147", "12 000")
 * or French words ("cent quarante-sept").
 *
 * Several items may be chained in one breath — the *price* is the delimiter, so
 * "bois de frêne 147 chanvre 12 ortie 5" splits into three. See
 * `parseUtterances`; `parseUtterance` keeps the single-item shape for callers
 * that want just the first.
 */

export interface ParsedUtterance {
  /** The item name as spoken (accents kept, trimmed). */
  name: string;
  /** Unit price in kamas, or null if we couldn't find a trailing number. */
  price: number | null;
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
 * Split a spoken phrase into one `{ name, price }` per item.
 *
 * Strategy: walk left→right accumulating name words; a contiguous run of number
 * tokens is the (unit) price and closes the current item, then the next words
 * start the next item.
 */
export function parseUtterances(raw: string): ParsedUtterance[] {
  const text = raw.replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return [];
  const tokens = text.split(" ").filter(Boolean);

  const out: ParsedUtterance[] = [];
  let nameTokens: string[] = [];

  // Emit the item built so far (skipping nameless fragments), then reset.
  function flush(price: number | null) {
    const name = nameTokens.join(" ").replace(/[.,]+$/, "").trim();
    if (name !== "") out.push({ name, price });
    nameTokens = [];
  }

  for (let i = 0; i < tokens.length; ) {
    // A price closes the current item: swallow the whole contiguous number run.
    if (isNumberToken(tokens[i])) {
      const run: string[] = [];
      while (i < tokens.length && isNumberToken(tokens[i])) run.push(tokens[i++]);
      flush(parseFrenchNumber(run.join(" ")));
      continue;
    }

    nameTokens.push(tokens[i]);
    i++;
  }
  // A trailing name with no price (e.g. "frostiz") still counts as an item.
  if (nameTokens.length > 0) flush(null);
  return out;
}

/** Parse just the first item from a phrase (single-item convenience). */
export function parseUtterance(raw: string): ParsedUtterance | null {
  return parseUtterances(raw)[0] ?? null;
}
