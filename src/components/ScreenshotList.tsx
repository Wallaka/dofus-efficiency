import { useEffect, useMemo, useState } from "react";
import type { ScreenshotFile } from "../lib/medalFolder";
import { describeScreenshot, type ScreenshotInfo } from "../lib/screenshotMeta";
import { formatBytes, formatDateTime, formatKamas } from "../lib/format";
import { screenshotKey, type AnalyzedRecord } from "../lib/analyzedStore";
import { useAutoAnalyze } from "../lib/useAutoAnalyze";
import { ScreenshotDetail } from "./ScreenshotDetail";
import type { Item } from "../types";

interface Props {
  files: ScreenshotFile[];
  /** Persist an OCR'd price for a chosen item (the feedback loop). */
  onApplyPrice?: (item: Item, price: number, detail: string) => void;
}

const STATUS_LABEL: Record<AnalyzedRecord["status"], string> = {
  saved: "Enregistré",
  unmatched: "À confirmer",
  "no-price": "Aucun prix",
  error: "Échec",
};

/**
 * The screenshots listing: a thumbnail grid of the images found in the Medal
 * folder. New captures are analysed automatically (OCR → price → save) unless
 * the user turns that off; each card shows what the analysis found, and clicking
 * one opens the detailed view to re-run or confirm by hand.
 */
export function ScreenshotList({ files, onApplyPrice }: Props) {
  const items = useMemo(
    () =>
      files
        .map(describeScreenshot)
        .sort((a, b) => b.capturedAt - a.capturedAt),
    [files],
  );

  const { records, pending, running, progress, auto, setAuto, runAll, stop, resetAll } =
    useAutoAnalyze(files, onApplyPrice);

  // Tally outcomes across the captures currently in the folder.
  const counts = useMemo(() => {
    const c = { saved: 0, unmatched: 0, "no-price": 0, error: 0, total: 0 };
    for (const it of items) {
      const rec = records[screenshotKey(it)];
      if (rec) {
        c[rec.status]++;
        c.total++;
      }
    }
    return c;
  }, [items, records]);

  // Read each file into an object URL for the thumbnail, and revoke on change.
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    (async () => {
      const next: Record<string, string> = {};
      for (const item of items) {
        try {
          const file = await item.handle.getFile();
          if (cancelled) break;
          const url = URL.createObjectURL(file);
          created.push(url);
          next[item.name] = url;
        } catch {
          // Skip unreadable files; the card still shows its metadata.
        }
      }
      if (!cancelled) setUrls(next);
    })();

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  // Which screenshot is open in the detail/OCR view, if any.
  const [selected, setSelected] = useState<ScreenshotInfo | null>(null);

  if (items.length === 0) return null;

  function handleReset() {
    if (
      window.confirm(
        "Réinitialiser l'analyse ? Toutes les captures seront ré-analysées (les prix déjà enregistrés sont conservés).",
      )
    ) {
      resetAll();
    }
  }

  return (
    <section className="panel screenshots">
      <h2>Captures ({items.length})</h2>
      <p className="hint">
        Les captures de votre dossier Medal, les plus récentes d'abord. Les
        nouvelles captures sont analysées automatiquement&nbsp;; cliquez une
        capture pour la revoir ou confirmer un objet.
      </p>

      <div className="auto-analyze-bar">
        <label className="auto-analyze-toggle">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Analyse automatique
        </label>

        {running ? (
          <>
            <span className="auto-analyze-status">
              Analyse… {progress.done}/{progress.total}
              {progress.current && (
                <span className="auto-analyze-current"> · {progress.current}</span>
              )}
            </span>
            <div className="progress auto-analyze-progress">
              <div
                className="progress-bar"
                style={{
                  width: `${
                    progress.total
                      ? Math.round((progress.done / progress.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <button type="button" className="folder-secondary" onClick={stop}>
              Arrêter
            </button>
          </>
        ) : pending.length > 0 ? (
          <button type="button" className="folder-pick" onClick={() => void runAll()}>
            Analyser {pending.length} capture{pending.length > 1 ? "s" : ""}
          </button>
        ) : (
          <span className="auto-analyze-status">Toutes les captures sont analysées.</span>
        )}
      </div>

      <div className="auto-analyze-summary">
        {counts.saved > 0 && (
          <span className="badge badge-fresh">{counts.saved} enregistré{counts.saved > 1 ? "s" : ""}</span>
        )}
        {counts.unmatched > 0 && (
          <span className="badge badge-warn">{counts.unmatched} à confirmer</span>
        )}
        {counts["no-price"] > 0 && (
          <span className="badge">{counts["no-price"]} sans prix</span>
        )}
        {counts.error > 0 && (
          <span className="badge badge-stale">{counts.error} échec{counts.error > 1 ? "s" : ""}</span>
        )}
        {counts.total > 0 && (
          <button
            type="button"
            className="folder-secondary auto-analyze-reset"
            onClick={handleReset}
          >
            Réinitialiser l'analyse
          </button>
        )}
      </div>

      <ul className="screenshot-grid">
        {items.map((item) => {
          const rec = records[screenshotKey(item)];
          return (
            <li key={item.name} className="screenshot-card">
              <button
                type="button"
                className="screenshot-open"
                onClick={() => setSelected(item)}
                title={`Analyser ${item.name}`}
              >
                <div className="thumb">
                  {urls[item.name] ? (
                    <img src={urls[item.name]} alt={item.name} loading="lazy" />
                  ) : (
                    <span className="thumb-placeholder">🖼️</span>
                  )}
                </div>
                <div className="screenshot-meta">
                  <span className="screenshot-filename" title={item.name}>
                    {item.name}
                  </span>
                  <span className="screenshot-sub">
                    {formatDateTime(item.capturedAt)}
                    {!item.fromFilename && (
                      <span
                        className="screenshot-approx"
                        title="Date du fichier (non trouvée dans le nom)"
                      >
                        {" "}
                        ~
                      </span>
                    )}
                  </span>
                  <span className="screenshot-sub">{formatBytes(item.size)}</span>
                  {rec ? (
                    <span className={`ss-status ss-status-${rec.status}`}>
                      {STATUS_LABEL[rec.status]}
                      {rec.status === "saved" && rec.savedItemName && (
                        <span className="ss-status-detail">
                          {" "}
                          {rec.savedItemName} · {formatKamas(rec.price ?? undefined)}
                        </span>
                      )}
                      {rec.status === "unmatched" && rec.price != null && (
                        <span className="ss-status-detail">
                          {" "}
                          {formatKamas(rec.price)}
                          {rec.itemName ? ` · ${rec.itemName}` : ""}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="ss-status ss-status-pending">Non analysé</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <ScreenshotDetail
          file={selected}
          imageUrl={urls[selected.name]}
          onClose={() => setSelected(null)}
          onApplyPrice={onApplyPrice}
        />
      )}
    </section>
  );
}
