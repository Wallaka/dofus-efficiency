import { useMemo, useRef, useState } from "react";
import { formatDateTime } from "../lib/format";
import {
  SECTIONS,
  buildExport,
  parseImport,
  applyImport,
  exportFilename,
  type ImportMode,
  type ParsedImport,
} from "../lib/dataTransfer";

/** A "✓" for singleton sections, else the item count. */
function sizeLabel(size: number | undefined): string {
  return size == null ? "✓" : String(size);
}

/**
 * The "Données" page: export the user's own data (prices, tracked items, craft
 * list, éleveur and avis settings) as a JSON file to share, and import someone
 * else's — merging (newer price wins) or replacing.
 */
export function DonneesPage() {
  // Which sections currently hold data, computed once on mount.
  const present = useMemo(
    () =>
      SECTIONS.map((s) => {
        const value = s.load();
        return { id: s.id, label: s.label, present: s.present(value), size: s.size(value) };
      }).filter((s) => s.present),
    [],
  );

  const [exportSel, setExportSel] = useState<Set<string>>(
    () => new Set(present.map((s) => s.id)),
  );

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function doExport() {
    const json = buildExport([...exportSel]);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Import ---
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [importSel, setImportSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ImportMode>("merge");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<string>();

  async function onFile(file: File) {
    setError(undefined);
    setResult(undefined);
    try {
      const text = await file.text();
      const p = parseImport(text);
      if (p.sections.length === 0) {
        setParsed(null);
        setError("Aucune donnée reconnue dans ce fichier.");
        return;
      }
      setParsed(p);
      setFileName(file.name);
      setImportSel(new Set(p.sections.map((s) => s.id)));
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function doImport() {
    if (!parsed) return;
    const res = applyImport(parsed, [...importSel], mode);
    if (res.applied.length === 0) {
      setResult("Rien à importer (aucune section sélectionnée).");
      return;
    }
    const summary = res.applied
      .map((a) => (a.size == null ? a.label : `${a.label} (${a.size})`))
      .join(" · ");
    setResult(
      `Importé — ${summary}. Rechargez l'app pour voir les changements partout.`,
    );
  }

  return (
    <main className="donnees-page">
      <section className="panel">
        <h2>Exporter mes données</h2>
        <p className="hint">
          Coche ce que tu veux partager, puis télécharge un fichier JSON à donner
          à quelqu'un. Les caches DofusDB et tes captures ne sont jamais inclus.
        </p>
        {present.length === 0 ? (
          <p className="hint">Aucune donnée à exporter pour l'instant.</p>
        ) : (
          <>
            <ul className="dt-sections">
              {present.map((s) => (
                <li key={s.id} className="dt-row">
                  <label className="dt-check">
                    <input
                      type="checkbox"
                      checked={exportSel.has(s.id)}
                      onChange={() => setExportSel((set) => toggle(set, s.id))}
                    />
                    <span className="dt-name">{s.label}</span>
                  </label>
                  <span className="dt-count">{sizeLabel(s.size)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="folder-pick"
              onClick={doExport}
              disabled={exportSel.size === 0}
            >
              ⬇ Exporter le JSON
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Importer des données</h2>
        <p className="hint">
          Charge un fichier reçu de quelqu'un. Un récapitulatif s'affiche avant
          d'appliquer.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        <button
          type="button"
          className="folder-secondary"
          onClick={() => fileRef.current?.click()}
        >
          Choisir un fichier…
        </button>

        {error && <p className="folder-error">{error}</p>}

        {parsed && (
          <>
            <div className="dt-summary">
              <b>📦 {fileName}</b>
              {parsed.exportedAt != null && (
                <span className="dt-summary-date">
                  {" "}
                  · {formatDateTime(parsed.exportedAt)}
                </span>
              )}
              <div className="dt-summary-body">
                {parsed.sections
                  .map((s) =>
                    s.size == null ? s.label : `${s.label} (${s.size})`,
                  )
                  .join(" · ")}
              </div>
              {parsed.newerSchema && (
                <p className="hint dt-warn">
                  ⚠ Fichier créé par une version plus récente ; certaines données
                  peuvent être ignorées.
                </p>
              )}
            </div>

            <div className="dt-mode">
              <label className={mode === "merge" ? "sel" : ""}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>
                  <span className="dt-mode-t">Fusionner</span>
                  <span className="dt-mode-d">
                    Garde tes données ; le prix le plus récent gagne.
                  </span>
                </span>
              </label>
              <label className={mode === "replace" ? "sel" : ""}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                <span>
                  <span className="dt-mode-t">Remplacer</span>
                  <span className="dt-mode-d">
                    Écrase tes données par le fichier.
                  </span>
                </span>
              </label>
            </div>

            <ul className="dt-sections">
              {parsed.sections.map((s) => (
                <li key={s.id} className="dt-row">
                  <label className="dt-check">
                    <input
                      type="checkbox"
                      checked={importSel.has(s.id)}
                      onChange={() => setImportSel((set) => toggle(set, s.id))}
                    />
                    <span className="dt-name">{s.label}</span>
                  </label>
                  <span className="dt-count">{sizeLabel(s.size)}</span>
                </li>
              ))}
            </ul>

            <div className="dt-actions">
              <button
                type="button"
                className="folder-pick"
                onClick={doImport}
                disabled={importSel.size === 0}
              >
                ⬆ Importer
              </button>
              {result && (
                <button
                  type="button"
                  className="folder-secondary"
                  onClick={() => window.location.reload()}
                >
                  Recharger l'app
                </button>
              )}
            </div>
          </>
        )}

        {result && <p className="folder-status dt-result">{result}</p>}
      </section>
    </main>
  );
}
