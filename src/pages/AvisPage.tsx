import { useEffect, useRef, useState } from "react";
import type { AvisReward } from "../lib/avis";
import { avitonUnitValue } from "../lib/avis";
import type { Item, PriceMap } from "../types";
import { fetchAvisDeRecherche } from "../data/dofusApi";
import {
  loadAvisAviton,
  loadAvisCatalog,
  loadAvisParticipation,
  loadPrices,
  saveAvisAviton,
  saveAvisCatalog,
  saveAvisParticipation,
} from "../lib/storage";
import { loadPriceEntries, type PriceEntryMap } from "../lib/priceStore";
import { setManualPrice, clearPrice } from "../lib/trackedPrices";
import { formatDateTime, formatKamas } from "../lib/format";
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
  // Shared price store (carte + resource prices). Held in state so hand-typed
  // prices re-render and recompute benefits; `entries` carries each price's
  // source (OCR vs manual) for the badge.
  const [prices, setPrices] = useState<PriceMap>(() => loadPrices() ?? {});
  const [entries, setEntries] = useState<PriceEntryMap>(loadPriceEntries);

  function onPriceChange(item: Item, value: number | null) {
    if (value == null) {
      clearPrice(item.id);
      setPrices((p) => {
        const next = { ...p };
        delete next[item.id];
        return next;
      });
      setEntries((e) => {
        const next = { ...e };
        delete next[item.id];
        return next;
      });
      return;
    }
    const entry = setManualPrice(item, value);
    setPrices((p) => ({ ...p, [item.id]: value }));
    setEntries((e) => ({ ...e, [item.id]: entry }));
  }

  // Per-avis "spot" fee (avis id → kamas), persisted.
  const [participation, setParticipation] = useState<Record<string, number>>(
    loadAvisParticipation,
  );
  // Aviton resale rate: `qty` avitons sell for `price` kamas.
  const [aviton, setAviton] = useState(loadAvisAviton);
  const avitonUnit = avitonUnitValue(aviton.qty, aviton.price);

  function setParticipationFor(id: string, value: number) {
    setParticipation((prev) => {
      const next = { ...prev };
      if (value > 0) next[id] = value;
      else delete next[id];
      saveAvisParticipation(next);
      return next;
    });
  }

  function setAvitonField(field: "qty" | "price", value: string) {
    setAviton((prev) => {
      const n = Math.max(0, Math.round(Number(value) || 0));
      const next = { ...prev, [field]: n };
      saveAvisAviton(next);
      return next;
    });
  }

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
          Les prix carte et ressource sont remplis par l'OCR ou saisissables à la
          main&nbsp;; ils alimentent aussi les pages Objets suivis et Prix.
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
        <div className="avis-aviton">
          <span className="avis-aviton-label">Valeur des avitons</span>
          <input
            type="number"
            min={0}
            step={10}
            inputMode="numeric"
            aria-label="Quantité d'avitons"
            value={aviton.qty || ""}
            placeholder="100"
            onChange={(e) => setAvitonField("qty", e.target.value)}
          />
          <span className="avis-aviton-eq">avitons =</span>
          <input
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            aria-label="Prix de vente des avitons"
            value={aviton.price || ""}
            placeholder="0"
            onChange={(e) => setAvitonField("price", e.target.value)}
          />
          <span className="avis-aviton-unit">k</span>
          {avitonUnit > 0 && (
            <span className="hint">≈ {formatKamas(avitonUnit)} / aviton</span>
          )}
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
            carteSource={
              avis.carteItemId ? entries[avis.carteItemId]?.source : undefined
            }
            onCartePriceChange={
              avis.carteItemId
                ? (value) =>
                    onPriceChange(
                      {
                        id: avis.carteItemId!,
                        name: avis.carteName ?? "Carte",
                        img: avis.carteImg,
                      },
                      value,
                    )
                : undefined
            }
            resourcePrice={
              avis.resourceItemId ? prices[avis.resourceItemId] : undefined
            }
            resourceSource={
              avis.resourceItemId
                ? entries[avis.resourceItemId]?.source
                : undefined
            }
            onResourcePriceChange={
              avis.resourceItemId
                ? (value) =>
                    onPriceChange(
                      {
                        id: avis.resourceItemId!,
                        name: avis.resourceName ?? "Ressource",
                        img: avis.resourceImg,
                      },
                      value,
                    )
                : undefined
            }
            avitonValue={avitonUnit * avis.avitons}
            participationCost={participation[avis.id] ?? 0}
            onParticipationChange={(value) =>
              setParticipationFor(String(avis.id), value)
            }
          />
        ))}
      </ul>
    </main>
  );
}
