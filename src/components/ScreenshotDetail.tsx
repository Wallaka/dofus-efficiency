import { useEffect, useState } from "react";
import type { ScreenshotInfo } from "../lib/screenshotMeta";
import { recognizeImage } from "../lib/ocr";
import {
  analyzeScreenshot,
  type ScreenshotAnalysis,
} from "../lib/screenshotAnalysis";
import { type CropRect } from "../lib/cropImage";
import { analyzeImageBlob, cropSafe } from "../lib/analyzeFlow";
import { priceToRecord, type ApplyPrice } from "../lib/priceStore";
import { CropSelector } from "./CropSelector";
import { PriceApplyPanel } from "./PriceApplyPanel";
import { AnalysisView } from "./AnalysisView";
import { formatDateTime, formatBytes } from "../lib/format";

interface Props {
  file: ScreenshotInfo;
  imageUrl?: string;
  onClose: () => void;
  /** Persist an OCR'd price for a chosen item (the feedback loop). */
  onApplyPrice?: ApplyPrice;
}

type State =
  | { phase: "idle" }
  | { phase: "running"; progress: number }
  | { phase: "done"; analysis: ScreenshotAnalysis; dates: string[] }
  | { phase: "error"; message: string };

/**
 * Detail view for one screenshot: shows the image and, on demand, runs OCR and
 * displays what we could guess — screen type, item category, and (for resources)
 * the x1 / x10 / x100 lot prices.
 */
export function ScreenshotDetail({ file, imageUrl, onClose, onApplyPrice }: Props) {
  const [state, setState] = useState<State>({ phase: "idle" });
  // Manual region to OCR, in natural pixels; null = none drawn.
  const [crop, setCrop] = useState<CropRect | null>(null);
  // Auto-crop on by default; the box it chose (for display).
  const [autoCropOn, setAutoCropOn] = useState(true);
  const [autoRect, setAutoRect] = useState<CropRect | null>(null);

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
    setAutoRect(null);
    const onProgress = (p: number) => setState({ phase: "running", progress: p });
    try {
      const full = await file.handle.getFile();

      // 1) Manual selection wins: OCR exactly what the user drew.
      if (crop) {
        const ocr = await recognizeImage(await cropSafe(full, crop), { onProgress });
        setState({ phase: "done", analysis: analyzeScreenshot(ocr.text), dates: [] });
        return;
      }

      // 2) No auto-crop: single pass on the whole image.
      if (!autoCropOn) {
        const ocr = await recognizeImage(full, { onProgress });
        setState({ phase: "done", analysis: analyzeScreenshot(ocr.text), dates: [] });
        return;
      }

      // 3) Auto-crop two-pass (shared with the automatic batch analyser): pass 1
      //    classifies + locates the panel, pass 2 re-reads the upscaled crop.
      const { analysis, dates, autoRect: rect } = await analyzeImageBlob(
        full,
        onProgress,
      );
      if (rect) setAutoRect(rect);
      setState({ phase: "done", analysis, dates });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Échec de l'analyse OCR.",
      });
    }
  }

  const analyzeLabel = crop
    ? "Analyser la sélection"
    : autoCropOn
      ? "Analyser (recadrage auto)"
      : "Analyser (OCR)";

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
              <CropSelector
                src={imageUrl}
                alt={file.name}
                autoRect={autoRect}
                onSelectionChange={setCrop}
              />
            ) : (
              <span className="thumb-placeholder">🖼️</span>
            )}
            <p className="screenshot-sub">
              {formatDateTime(file.capturedAt)} · {formatBytes(file.size)}
            </p>
            <label className="auto-crop-toggle">
              <input
                type="checkbox"
                checked={autoCropOn}
                onChange={(e) => setAutoCropOn(e.target.checked)}
              />
              Recadrage automatique (zone du prix)
            </label>
          </div>

          <div className="modal-analysis">
            {state.phase === "idle" && (
              <>
                <p className="hint">
                  Lancez la reconnaissance pour deviner le type d'écran et lire les
                  prix. Le premier passage télécharge le moteur OCR (~quelques Mo).
                </p>
                <button type="button" className="folder-pick" onClick={analyze}>
                  {analyzeLabel}
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
              <AnalysisResult
                analysis={state.analysis}
                dates={state.dates}
                onReanalyze={analyze}
                reanalyzeLabel={analyzeLabel}
                onApplyPrice={onApplyPrice}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisResult({
  analysis,
  dates,
  onReanalyze,
  reanalyzeLabel,
  onApplyPrice,
}: {
  analysis: ScreenshotAnalysis;
  dates: string[];
  onReanalyze: () => void;
  reanalyzeLabel: string;
  onApplyPrice?: ApplyPrice;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const recordable = priceToRecord(analysis);
  return (
    <AnalysisView analysis={analysis} dates={dates}>
      {onApplyPrice && recordable && (
        <PriceApplyPanel
          itemName={analysis.itemName}
          price={recordable.price}
          detail={recordable.detail}
          lots={analysis.lots}
          onApply={onApplyPrice}
        />
      )}

      <div className="folder-actions">
        <button type="button" className="folder-secondary" onClick={onReanalyze}>
          {reanalyzeLabel}
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
    </AnalysisView>
  );
}
