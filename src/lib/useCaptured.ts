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

  /**
   * Apply a batch of capture updates (id → captured), e.g. from a Metamob
   * import. `true` marks captured (keeping any existing timestamp), `false`
   * clears it. Only touches the ids present in `updates`.
   */
  const applyCaptures = useCallback((updates: Record<string, boolean>) => {
    setCaptured((prev) => {
      const next = { ...prev };
      const now = Date.now();
      for (const [id, owned] of Object.entries(updates)) {
        if (owned) {
          if (next[id] == null) next[id] = now;
        } else {
          delete next[id];
        }
      }
      return next;
    });
  }, []);

  const capturedCount = Object.keys(captured).length;

  return { captured, isCaptured, toggle, applyCaptures, capturedCount };
}
