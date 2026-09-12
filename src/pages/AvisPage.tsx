import { useEffect, useMemo, useState } from "react";
import {
  computeAvisTotals,
  newAvis,
  type AvisDeRecherche,
  type AvisState,
} from "../lib/avis";
import type { Item, PriceMap } from "../types";
import { loadAvis, loadPrices, saveAvis, savePrices } from "../lib/storage";
import {
  deletePriceEntry,
  recordPriceEntry,
  type PriceEntry,
} from "../lib/priceStore";
import { formatKamas } from "../lib/format";
import { AvisCard } from "../components/AvisCard";

/** Avis de recherche: list legendary-hunt notices and compute each one's benefit. */
export function AvisPage() {
  const [state, setState] = useState<AvisState>(
    () => loadAvis() ?? { list: [newAvis()] },
  );
  // Shared with the craft & prix pages via localStorage.
  const [prices, setPrices] = useState<PriceMap>(() => loadPrices() ?? {});

  useEffect(() => {
    saveAvis(state);
  }, [state]);

  useEffect(() => {
    savePrices(prices);
  }, [prices]);

  const totals = useMemo(
    () => computeAvisTotals(state.list, prices, state.avitonValue),
    [state, prices],
  );

  function updateAvis(id: string, patch: Partial<AvisDeRecherche>) {
    setState((s) => ({
      ...s,
      list: s.list.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }

  function addAvis() {
    setState((s) => ({ ...s, list: [...s.list, newAvis()] }));
  }

  function removeAvis(id: string) {
    setState((s) => ({ ...s, list: s.list.filter((a) => a.id !== id) }));
  }

  function setAvitonValue(v: string) {
    setState((s) => ({ ...s, avitonValue: v === "" ? undefined : Number(v) }));
  }

  // Update a picked item's shared price and stamp a "manuel" entry (or forget
  // it when cleared), so the Prix page shows its date/source too.
  function setItemPrice(item: Item, price: number | undefined) {
    setPrices((prev) => ({ ...prev, [item.id]: price }));
    if (price == null) {
      deletePriceEntry(item.id);
      return;
    }
    const entry: PriceEntry = {
      itemId: item.id,
      name: item.name,
      level: item.level,
      img: item.img,
      price,
      updatedAt: Date.now(),
      source: "manual",
    };
    recordPriceEntry(entry);
  }

  return (
    <main className="avis-page">
      <section className="panel">
        <h2>Avis de recherche</h2>
        <p className="hint">
          Les avis qui rapportent des avitons. Bénéfice = ressource du coffre +
          places vendues − carte de la chasse. Les prix viennent des prix suivis
          (et de l'OCR).
        </p>

        <div className="avis-summary">
          <div className="avis-total">
            <span>Bénéfice total</span>
            <strong className={totals.kamasBenefit >= 0 ? "positive" : "negative"}>
              {formatKamas(totals.kamasBenefit)}
            </strong>
          </div>
          <div className="avis-total">
            <span>Avitons</span>
            <strong>{totals.avitons}</strong>
          </div>
          {totals.benefitWithAvitons != null && (
            <div className="avis-total">
              <span>Total avec avitons</span>
              <strong
                className={
                  totals.benefitWithAvitons >= 0 ? "positive" : "negative"
                }
              >
                {formatKamas(totals.benefitWithAvitons)}
              </strong>
            </div>
          )}
          <label className="avis-aviton-value">
            <span>Valeur d'un aviton (kamas, option.)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="—"
              value={state.avitonValue ?? ""}
              onChange={(e) => setAvitonValue(e.target.value)}
            />
          </label>
        </div>
      </section>

      <ul className="avis-list">
        {state.list.map((avis) => (
          <AvisCard
            key={avis.id}
            avis={avis}
            prices={prices}
            avitonValue={state.avitonValue}
            onChange={(patch) => updateAvis(avis.id, patch)}
            onRemove={() => removeAvis(avis.id)}
            onSetItemPrice={setItemPrice}
          />
        ))}
        {state.list.length === 0 && (
          <li className="hint">Aucun avis pour l'instant.</li>
        )}
      </ul>

      <button type="button" className="avis-add" onClick={addAvis}>
        + Ajouter un avis
      </button>
    </main>
  );
}
