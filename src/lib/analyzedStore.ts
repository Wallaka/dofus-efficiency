import type { ScreenshotFile } from "./medalFolder";
import type { ScreenshotAnalysis } from "./screenshotAnalysis";
import type { Item } from "../types";

/**
 * A record of every screenshot the analyser has read, so a capture is never
 * OCR'd twice. Keyed by a stable identity (name + size + mtime) — if a file is
 * replaced its key changes and it gets re-analysed.
 *
 * We keep the full reading alongside so the listing can show what the OCR found
 * without re-running it, and let the user Accept it into the price store in one
 * click. Nothing reaches the price store until the user accepts.
 */

const KEY = "dofus-efficiency:analyzed:v2";

export type AnalyzedStatus =
  /** Read, with a price ready to accept into the store. */
  | "pending"
  /** Accepted — its price is saved to a chosen item. */
  | "saved"
  /** Read, but no price could be extracted from this screen. */
  | "no-price"
  /** OCR or read failed. */
  | "error";

export interface AnalyzedRecord {
  key: string;
  /** Screenshot file name, for display. */
  name: string;
  analyzedAt: number;
  status: AnalyzedStatus;
  /** The full OCR reading, so the card renders without re-analysing. */
  analysis: ScreenshotAnalysis;
  /** Market-graph dates, when the screen is a price history. */
  dates: string[];
  /** Best-guess DofusDB item (from the OCR'd name), pre-filled for Accept. */
  match?: Item | null;
  /** Set once accepted: the item the price was saved to. */
  savedItemId?: string;
  savedItemName?: string;
  savedAt?: number;
  /** Short error reason, for the "error" status. */
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
