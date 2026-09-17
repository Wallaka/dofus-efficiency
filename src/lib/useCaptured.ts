import { useCallback, useEffect, useState } from "react";
import { loadOcreCaptured, saveOcreCaptured } from "./storage";

/**
 * The Ocre capture log: a persisted map of archimonster monster id → capture
 * timestamp. Mirrors `useFavourites` — the rest of the app just asks
 * `isCaptured` and calls `toggle`. Backed by localStorage.
 */
export function useCaptured() {
  const [captured, setCaptured] = useState<Record<string, number>>(
    loadOcreCaptured,
  );

  useEffect(() => {
    saveOcreCaptured(captured);
  }, [captured]);

  const isCaptured = useCallback(
    (id: string | number) => captured[String(id)] != null,
    [captured],
  );

  const toggle = useCallback((id: string | number) => {
    const key = String(id);
    setCaptured((prev) => {
      const next = { ...prev };
      if (next[key] != null) delete next[key];
      else next[key] = Date.now();
      return next;
    });
  }, []);

  const capturedCount = Object.keys(captured).length;

  return { captured, isCaptured, toggle, capturedCount };
}
