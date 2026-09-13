import type { ScreenshotFile } from "./medalFolder";
import type { ScreenshotKind } from "./screenshotAnalysis";

/**
 * A record of which screenshots the automatic analyser has already processed, so
 * a screenshot is never OCR'd twice. Keyed by a stable identity (name + size +
 * mtime) — if a file is replaced its key changes and it gets re-analysed.
 *
 * We keep the outcome (price read, whether it was saved to an item) alongside,
 * so the listing can show a status per capture and let the user confirm an
 * uncertain match without re-running OCR.
 */

const KEY = "dofus-efficiency:analyzed:v1";

export type AnalyzedStatus =
  /** Price read and saved to a confidently-matched item. */
  | "saved"
  /** Price read but no confident item match — needs the user to confirm. */
  | "unmatched"
  /** Analysed, but no price could be read from this screen. */
  | "no-price"
  /** OCR or read failed. */
  | "error";

export interface AnalyzedRecord {
  key: string;
  /** Screenshot file name, for display. */
  name: string;
  analyzedAt: number;
  status: AnalyzedStatus;
  kind: ScreenshotKind;
  /** Item name read from the screen, when any. */
  itemName: string | null;
  /** Unit price read, when any. */
  price: number | null;
  /** Where the price came from, e.g. "Prix moyen" / "Cours du marché". */
  detail: string | null;
  /** The DofusDB item the price was saved to (status "saved"). */
  savedItemId?: string;
  savedItemName?: string;
  /** Short error/skip reason, for the "error" status. */
  message?: string;
}

export type AnalyzedMap = Record<string, AnalyzedRecord>;

/** Stable identity for a screenshot file. */
export function screenshotKey(file: ScreenshotFile): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function loadAnalyzed(): AnalyzedMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AnalyzedMap;
    return {};
  } catch {
    return {};
  }
}

function saveAnalyzed(map: AnalyzedMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // non-fatal (quota / private mode)
  }
}

/** Insert or replace one screenshot's analysis record. */
export function recordAnalyzed(record: AnalyzedRecord): void {
  const map = loadAnalyzed();
  map[record.key] = record;
  saveAnalyzed(map);
}

/** Forget one screenshot's record (so it will be analysed again). */
export function deleteAnalyzed(key: string): void {
  const map = loadAnalyzed();
  if (key in map) {
    delete map[key];
    saveAnalyzed(map);
  }
}

/** Forget every record — the whole folder gets re-analysed. */
export function clearAnalyzed(): void {
  saveAnalyzed({});
}
