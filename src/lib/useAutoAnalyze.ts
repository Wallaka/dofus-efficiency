import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenshotFile } from "./medalFolder";
import type { Item } from "../types";
import { priceToRecord, type ApplyPrice } from "./priceStore";
import {
  loadAnalyzed,
  recordAnalyzed,
  clearAnalyzed,
  screenshotKey,
  type AnalyzedMap,
  type AnalyzedRecord,
} from "./analyzedStore";
import { processScreenshot } from "./autoAnalyze";

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
 * Drives automatic OCR over the whole Medal folder: any screenshot not yet in
 * the analysed store is read (one at a time, so the single OCR worker isn't
 * contended) and its full reading recorded — but nothing reaches the price store
 * until the user accepts it. `accept` commits one reading to a chosen item.
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
      const record = await processScreenshot(file);
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

  /** Accept a reading into the price store, saving its price to `item`. */
  const accept = useCallback((key: string, item: Item) => {
    const rec = loadAnalyzed()[key];
    if (!rec) return;
    const recordable = priceToRecord(rec.analysis);
    if (!recordable) return;
    applyRef.current?.(item, recordable.price, recordable.detail, {
      lots: rec.analysis.lots,
    });
    const updated: AnalyzedRecord = {
      ...rec,
      status: "saved",
      savedItemId: item.id,
      savedItemName: item.name,
      savedAt: Date.now(),
    };
    recordAnalyzed(updated);
    setRecords((prev) => ({ ...prev, [key]: updated }));
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
    accept,
  };
}
