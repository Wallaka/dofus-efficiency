import { useEffect, useRef, useState } from "react";
import type { AvisReward } from "../lib/avis";
import { fetchAvisDeRecherche } from "../data/dofusApi";
import { loadAvisCatalog, loadPrices, saveAvisCatalog } from "../lib/storage";
import { formatDateTime } from "../lib/format";
import { AvisCard } from "../components/AvisCard";

type Status = "idle" | "loading" | "error";

/** Catalog of aviton-rewarding avis de recherche, sourced from DofusDB. */
export function AvisPage() {
  const cached = useRef(loadAvisCatalog()).current;
  const [list, setList] = useState<AvisReward[]>(cached?.list ?? []);
  const [fetchedAt, setFetchedAt] = useState<number | undefined>(
    cached?.fetchedAt,
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  // Shared price map (from the craft/prix pages) → chest resource prices.
  const prices = useRef(loadPrices() ?? {}).current;

  async function load() {
    setStatus("loading");
    setError(undefined);
    try {
      const data = await fetchAvisDeRecherche();
      setList(data);
      saveAvisCatalog(data);
      setFetchedAt(Date.now());
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  // Auto-load on first visit when we have nothing cached yet.
  useEffect(() => {
    if (list.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="avis-page">
      <section className="panel">
        <h2>Avis de recherche</h2>
        <p className="hint">
          Tous les avis de recherche qui rapportent des avitons (source DofusDB).
        </p>
        <div className="avis-toolbar">
          <button type="button" onClick={load} disabled={status === "loading"}>
            {status === "loading"
              ? "Chargement…"
              : list.length
                ? "Rafraîchir"
                : "Charger"}
          </button>
          <span className="hint avis-meta">
            {status === "error" && (
              <span className="error-text">Erreur : {error}</span>
            )}
            {status !== "error" && list.length > 0 && (
              <>
                {list.length} avis
                {fetchedAt != null && ` · maj ${formatDateTime(fetchedAt)}`}
              </>
            )}
          </span>
        </div>
      </section>

      {list.length === 0 && status === "loading" && (
        <p className="hint">Récupération des avis de recherche…</p>
      )}

      <ul className="avis-grid">
        {list.map((avis) => (
          <AvisCard
            key={avis.id}
            avis={avis}
            cartePrice={
              avis.carteItemId ? prices[avis.carteItemId] : undefined
            }
            resourcePrice={
              avis.resourceItemId ? prices[avis.resourceItemId] : undefined
            }
          />
        ))}
      </ul>
    </main>
  );
}
