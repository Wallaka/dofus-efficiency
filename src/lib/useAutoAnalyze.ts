import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenshotFile } from "./medalFolder";
import {
  loadAnalyzed,
  recordAnalyzed,
  clearAnalyzed,
  screenshotKey,
  type AnalyzedMap,
} from "./analyzedStore";
import { processScreenshot, type ApplyPrice } from "./autoAnalyze";

const AUTO_KEY = "dofus-efficiency:autoAnalyze:v1";

/** Auto-analysis is on unless the user explicitly turned it off. */
function loadAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

export interface AutoAnalyzeProgress {
  done: number;
  total: number;
  /** Name of the capture currently being read. */
  current: string | null;
}

/**
 * Drives automatic OCR over the Medal folder: any screenshot not yet in the
 * analysed store is read (one at a time, so the single OCR worker isn't
 * contended), its price saved when a confident item match is found, and the
 * outcome recorded so it's never re-processed. Exposes state for a small status
 * bar and manual run/stop/reset controls.
 */
export function useAutoAnalyze(files: ScreenshotFile[], onApplyPrice?: ApplyPrice) {
  const [records, setRecords] = useState<AnalyzedMap>(loadAnalyzed);
  const [auto, setAutoState] = useState<boolean>(loadAuto);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AutoAnalyzeProgress>({
    done: 0,
    total: 0,
    current: null,
  });

  // Guards for the async loop (avoid double-runs; allow cancel on unmount/stop).
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const applyRef = useRef(onApplyPrice);
  applyRef.current = onApplyPrice;

  const pending = useMemo(
    () => files.filter((f) => !(screenshotKey(f) in records)),
    [files, records],
  );

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    const queue = files.filter((f) => !(screenshotKey(f) in loadAnalyzed()));
    if (queue.length === 0) return;

    runningRef.current = true;
    cancelRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: queue.length, current: null });

    for (let i = 0; i < queue.length; i++) {
      if (cancelRef.current) break;
      const file = queue[i];
      setProgress({ done: i, total: queue.length, current: file.name });
      const record = await processScreenshot(file, applyRef.current);
      if (cancelRef.current) break; // discard a result the user cancelled past
      recordAnalyzed(record);
      setRecords((prev) => ({ ...prev, [record.key]: record }));
      setProgress({ done: i + 1, total: queue.length, current: null });
    }

    runningRef.current = false;
    setRunning(false);
  }, [files]);

  const stop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const setAuto = useCallback((value: boolean) => {
    setAutoState(value);
    try {
      localStorage.setItem(AUTO_KEY, value ? "1" : "0");
    } catch {
      // non-fatal
    }
  }, []);

  const resetAll = useCallback(() => {
    clearAnalyzed();
    setRecords({});
  }, []);

  // Auto mode: process new captures as they appear.
  useEffect(() => {
    if (auto && !runningRef.current && pending.length > 0) {
      void runAll();
    }
  }, [auto, pending.length, runAll]);

  // Cancel any in-flight loop when the component using this hook unmounts.
  useEffect(() => () => {
    cancelRef.current = true;
  }, []);

  return {
    records,
    pending,
    running,
    progress,
    auto,
    setAuto,
    runAll,
    stop,
    resetAll,
  };
}
