import { useMemo, useRef, useState } from "react";
import { ARCHIMONSTERS } from "../data/archimonsters.generated";
import { parseMetamob, metamobUpdates, type MetamobQuest } from "../data/ocre";

/**
 * Import a Metamob JSON export to update Ocre capture progress. Matches each
 * archimonster by name and sets captured = owned (quantity > 0). Prices are
 * never touched. When the export holds several "ocre" quests (one per
 * character), the user picks which one to apply.
 */
interface Props {
  /** Apply the chosen quest's capture updates (monsterId → captured). */
  onApply: (updates: Record<string, boolean>) => void;
}

export function MetamobImport({ onApply }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [quests, setQuests] = useState<MetamobQuest[] | null>(null);
  const [sel, setSel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    setQuests(null);
    try {
      const parsed = parseMetamob(JSON.parse(await file.text()));
      if (parsed.length === 0) {
        setError("Aucune quête « ocre » trouvée dans ce fichier.");
        return;
      }
      // Default to the character with the most captured (usually the main).
      const best = parsed
        .map((q, i) => [i, q.monsters.filter((m) => m.owned).length] as const)
        .sort((a, b) => b[1] - a[1])[0][0];
      setQuests(parsed);
      setSel(best);
    } catch {
      setError("Fichier illisible (JSON invalide).");
    }
  }

  const result = useMemo(
    () => (quests ? metamobUpdates(quests[sel], ARCHIMONSTERS) : null),
    [quests, sel],
  );

  function apply() {
    if (!result) return;
    onApply(result.updates);
    const q = quests![sel];
    setQuests(null);
    setDone(`Progression mise à jour depuis « ${q.character} » : ${result.owned} capturés.`);
  }

  return (
    <div className="metamob">
      <div className="metamob-bar">
        <button
          type="button"
          className="metamob-btn"
          onClick={() => fileRef.current?.click()}
        >
          Importer Metamob
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        {error && <span className="metamob-error">{error}</span>}
        {done && <span className="metamob-done">{done}</span>}
      </div>

      {quests && result && (
        <div className="metamob-panel panel">
          {quests.length > 1 && (
            <label className="metamob-pick">
              Personnage&nbsp;:
              <select
                className="ocre-field"
                value={sel}
                onChange={(e) => setSel(Number(e.target.value))}
              >
                {quests.map((q, i) => (
                  <option key={i} value={i}>
                    {q.character}
                    {q.server ? ` (${q.server})` : ""} —{" "}
                    {q.monsters.filter((m) => m.owned).length} capturés
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="metamob-summary">
            <b>{result.owned}</b> capturés / {result.matched} reconnus
            {result.unknown > 0 && ` · ${result.unknown} non reconnus (ignorés)`}
          </p>
          <p className="hint">
            Met à jour uniquement l'état capturé / non capturé — les prix ne sont
            pas touchés. Les archimonstres non possédés dans Metamob seront
            décochés.
          </p>
          <div className="metamob-actions">
            <button type="button" className="metamob-apply" onClick={apply}>
              Appliquer à ma progression
            </button>
            <button
              type="button"
              className="folder-secondary"
              onClick={() => setQuests(null)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
