import { useState } from "react";
import { loadCraftData, type CraftDataset } from "../data/dofusApi";
import { loadDataset, saveDataset } from "../lib/storage";

export type SourceKind = "sample" | "dofusdb";

interface Props {
  active: SourceKind;
  itemCount: number;
  recipeCount: number;
  onUseSample: () => void;
  onLoaded: (key: string, data: CraftDataset) => void;
}

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; recipes: number; fromCache: boolean };

function datasetKey(min: number, max: number): string {
  return `dofusdb:lvl-${min}-${max}`;
}

/** Lets the user switch between bundled sample data and live DofusDB data. */
export function DataSourcePanel({
  active,
  itemCount,
  recipeCount,
  onUseSample,
  onLoaded,
}: Props) {
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(20);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function load(forceRefresh: boolean) {
    const min = Math.max(1, Math.min(minLevel, maxLevel));
    const max = Math.max(minLevel, maxLevel);
    const key = datasetKey(min, max);

    if (!forceRefresh) {
      const cached = loadDataset(key);
      if (cached) {
        onLoaded(key, cached);
        setStatus({ state: "done", recipes: cached.recipes.length, fromCache: true });
        return;
      }
    }

    setStatus({ state: "loading" });
    try {
      const data = await loadCraftData({ minLevel: min, maxLevel: max });
      saveDataset(key, data);
      onLoaded(key, data);
      setStatus({ state: "done", recipes: data.recipes.length, fromCache: false });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const loading = status.state === "loading";

  return (
    <section className="panel">
      <h2>Source des données</h2>

      <div className="source-toggle">
        <button
          type="button"
          className={active === "sample" ? "seg active" : "seg"}
          onClick={onUseSample}
        >
          Exemple
        </button>
        <button
          type="button"
          className={active === "dofusdb" ? "seg active" : "seg"}
          onClick={() => load(false)}
        >
          DofusDB (réel)
        </button>
      </div>

      <div className="level-range">
        <label>
          Niveau min
          <input
            type="number"
            min={1}
            max={200}
            value={minLevel}
            onChange={(e) => setMinLevel(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          Niveau max
          <input
            type="number"
            min={1}
            max={200}
            value={maxLevel}
            onChange={(e) => setMaxLevel(Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div className="source-actions">
        <button type="button" onClick={() => load(false)} disabled={loading}>
          {loading ? "Chargement…" : "Charger depuis DofusDB"}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => load(true)}
          disabled={loading}
          title="Ignorer le cache et retélécharger"
        >
          Rafraîchir
        </button>
      </div>

      <p className="hint" role="status">
        {status.state === "loading" && "Récupération des recettes et objets…"}
        {status.state === "error" && (
          <span className="error-text">Erreur : {status.message}</span>
        )}
        {status.state === "done" &&
          `${status.recipes} recette(s) chargée(s)${
            status.fromCache ? " (cache)" : ""
          }.`}
        {status.state === "idle" &&
          "Un niveau plus large charge plus de recettes (et prend plus de temps)."}
      </p>

      <p className="hint">
        Actif : <strong>{active === "sample" ? "Exemple" : "DofusDB"}</strong> —{" "}
        {itemCount} objets, {recipeCount} recettes.
      </p>
    </section>
  );
}
