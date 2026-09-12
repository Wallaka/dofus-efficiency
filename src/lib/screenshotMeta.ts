import type { ScreenshotFile } from "./medalFolder";

/**
 * Medal names screenshots after the captured window plus a timestamp, e.g.
 * "Dofus 2026.09.12 - 18.14.52.png" (sometimes with trailing hundredths:
 * "... - 18.14.52.34.png"). This pulls that date/time out of the name.
 *
 * Returns ms since epoch, or null if the name doesn't match — callers fall
 * back to the file's own last-modified time.
 */
const MEDAL_NAME_RE =
  /(\d{4})\.(\d{2})\.(\d{2})\s*[-_]\s*(\d{2})\.(\d{2})\.(\d{2})/;

export function parseMedalDate(name: string): number | null {
  const m = MEDAL_NAME_RE.exec(name);
  if (!m) return null;
  const [, year, month, day, hour, min, sec] = m.map(Number);
  const d = new Date(year, month - 1, day, hour, min, sec);
  // Guard against nonsense like month 13 (Date would roll it over silently).
  if (d.getFullYear() !== year || d.getMonth() !== month - 1) return null;
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** A screenshot enriched with its best-known capture time. */
export interface ScreenshotInfo extends ScreenshotFile {
  /** Best capture time in ms: parsed from the name if possible, else file mtime. */
  capturedAt: number;
  /** True when `capturedAt` came from the filename rather than the file's mtime. */
  fromFilename: boolean;
}

/** Attach capture-time info to each screenshot. */
export function describeScreenshot(file: ScreenshotFile): ScreenshotInfo {
  const parsed = parseMedalDate(file.name);
  return {
    ...file,
    capturedAt: parsed ?? file.lastModified,
    fromFilename: parsed != null,
  };
}
