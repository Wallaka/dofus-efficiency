import { useEffect, useState } from "react";
import type { ScreenshotInfo } from "../lib/screenshotMeta";
import { recognizeImage } from "../lib/ocr";
import {
  analyzeScreenshot,
  type ScreenshotAnalysis,
  type ScreenshotKind,
  type ItemCategory,
} from "../lib/screenshotAnalysis";
import { formatKamas, formatDateTime, formatBytes } from "../lib/format";

interface Props {
  file: ScreenshotInfo;
  imageUrl?: string;
  onClose: () => void;
}

type State =
  | { phase: "idle" }
  | { phase: "running"; progress: number }
  | { phase: "done"; analysis: ScreenshotAnalysis }
  | { phase: "error"; message: string };

const KIND_LABEL: Record<ScreenshotKind, string> = {
  "hdv-listing": "Fenêtre HDV",
  other: "Autre écran",
  unknown: "Indéterminé",
};

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  resource: "Ressource",
  equipment: "Équipement",
  unknown: "Type inconnu",
};

/**
 * Detail view for one screenshot: shows the image and, on demand, runs OCR and
 * displays what we could guess — screen type, item category, and (for resources)
 * the x1 / x10 / x100 lot prices.
 */
export function ScreenshotDetail({ file, imageUrl, onClose }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function analyze() {
    setState({ phase: "running", progress: 0 });
    try {
      const blob = await file.handle.getFile();
      const ocr = await recognizeImage(blob, {
        onProgress: (p) => setState({ phase: "running", progress: p }),
      });
      setState({ phase: "done", analysis: analyzeScreenshot(ocr.text) });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Échec de l'analyse OCR.",
      });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={`Capture ${file.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 title={file.name}>{file.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-image">
            {imageUrl ? (
              <img src={imageUrl} alt={file.name} />
            ) : (
              <span className="thumb-placeholder">🖼️</span>
            )}
            <p className="screenshot-sub">
              {formatDateTime(file.capturedAt)} · {formatBytes(file.size)}
            </p>
          </div>

          <div className="modal-analysis">
            {state.phase === "idle" && (
              <>
                <p className="hint">
                  Lancez la reconnaissance pour deviner le type d'écran et lire les
                  prix. Le premier passage télécharge le moteur OCR (~quelques Mo).
                </p>
                <button type="button" className="folder-pick" onClick={analyze}>
                  Analyser (OCR)
                </button>
              </>
            )}

            {state.phase === "running" && (
              <div>
                <p className="hint">Lecture en cours…</p>
                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.round(state.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {state.phase === "error" && (
              <>
                <p className="folder-error">{state.message}</p>
                <button type="button" className="folder-secondary" onClick={analyze}>
                  Réessayer
                </button>
              </>
            )}

            {state.phase === "done" && (
              <AnalysisView analysis={state.analysis} onReanalyze={analyze} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisView({
  analysis,
  onReanalyze,
}: {
  analysis: ScreenshotAnalysis;
  onReanalyze: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="analysis">
      <div className="analysis-tags">
        <span className="tag tag-kind">{KIND_LABEL[analysis.kind]}</span>
        <span className="tag tag-cat">{CATEGORY_LABEL[analysis.category]}</span>
      </div>

      {analysis.itemName && (
        <p className="analysis-name">
          Objet&nbsp;: <strong>{analysis.itemName}</strong>
        </p>
      )}

      {analysis.category === "resource" && analysis.lots.length > 0 && (
        <table className="lots">
          <thead>
            <tr>
              <th>Lot</th>
              <th className="num">Prix</th>
              <th className="num">Prix / unité</th>
            </tr>
          </thead>
          <tbody>
            {analysis.lots.map((lot) => (
              <tr key={lot.quantity}>
                <td>×{lot.quantity}</td>
                <td className="num">{formatKamas(lot.price ?? undefined)}</td>
                <td className="num">{formatKamas(lot.unitPrice ?? undefined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="analysis-note">{analysis.note}</p>

      <div className="folder-actions">
        <button type="button" className="folder-secondary" onClick={onReanalyze}>
          Relancer
        </button>
        <button
          type="button"
          className="folder-secondary"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Masquer le texte OCR" : "Voir le texte OCR"}
        </button>
      </div>

      {showRaw && <pre className="raw-ocr">{analysis.rawText || "(vide)"}</pre>}
    </div>
  );
}
