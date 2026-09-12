import { useEffect, useMemo, useState } from "react";
import type { ScreenshotFile } from "../lib/medalFolder";
import { describeScreenshot, type ScreenshotInfo } from "../lib/screenshotMeta";
import { formatBytes, formatDateTime } from "../lib/format";
import { ScreenshotDetail } from "./ScreenshotDetail";

interface Props {
  files: ScreenshotFile[];
}

/**
 * The screenshots listing: a thumbnail grid of the images found in the Medal
 * folder, each with its capture time (parsed from the Medal filename when
 * possible) and size. Phase 1 will hang OCR'd prices off these same entries.
 */
export function ScreenshotList({ files }: Props) {
  const items = useMemo(
    () =>
      files
        .map(describeScreenshot)
        .sort((a, b) => b.capturedAt - a.capturedAt),
    [files],
  );

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

  return (
    <section className="panel screenshots">
      <h2>Captures ({items.length})</h2>
      <p className="hint">
        Les captures de votre dossier Medal, les plus récentes d'abord. Cliquez
        une capture pour l'analyser (OCR) : type d'écran et prix.
      </p>
      <ul className="screenshot-grid">
        {items.map((item) => (
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
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <ScreenshotDetail
          file={selected}
          imageUrl={urls[selected.name]}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
