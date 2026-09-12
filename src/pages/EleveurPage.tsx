import { useEffect, useMemo, useState } from "react";
import {
  computeRaising,
  defaultRaisingInput,
  isMissingPrice,
  lineCost,
  newCostLine,
  newItemCostLine,
  type CostLine,
  type RaisingInput,
} from "../lib/eleveur";
import type { Item, PriceMap } from "../types";
import {
  loadEleveur,
  loadPrices,
  saveEleveur,
  savePrices,
} from "../lib/storage";
import { useFavourites } from "../lib/useFavourites";
import { formatKamas, formatPercent } from "../lib/format";
import { ItemAutocomplete } from "../components/ItemAutocomplete";

function marginClass(value: number | undefined): string {
  if (value == null) return "";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

/** Éleveur calculator: is raising a mount worth it in kamas? */
export function EleveurPage() {
  const [input, setInput] = useState<RaisingInput>(
    () => loadEleveur() ?? defaultRaisingInput(),
  );
  // Shared with the craft page via localStorage: item-linked cost lines price
  // themselves from here, and edits made here show up on the craft page too.
  const [prices, setPrices] = useState<PriceMap>(() => loadPrices() ?? {});
  const { favourites } = useFavourites();

  useEffect(() => {
    saveEleveur(input);
  }, [input]);

  useEffect(() => {
    savePrices(prices);
  }, [prices]);

  const result = useMemo(() => computeRaising(input, prices), [input, prices]);

  const linkedIds = useMemo(
    () => new Set(input.costs.map((c) => c.itemId).filter(Boolean) as string[]),
    [input.costs],
  );

  function setSellPrice(v: string) {
    setInput((prev) => ({
      ...prev,
      sellPrice: v === "" ? undefined : Number(v),
    }));
  }

  function setDays(v: string) {
    setInput((prev) => ({ ...prev, days: v === "" ? undefined : Number(v) }));
  }

  function updateCost(id: string, patch: Partial<CostLine>) {
    setInput((prev) => ({
      ...prev,
      costs: prev.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function addManualCost() {
    setInput((prev) => ({ ...prev, costs: [...prev.costs, newCostLine()] }));
  }

  function addItemCost(item: Item) {
    if (linkedIds.has(item.id)) return; // already a line
    setInput((prev) => ({
      ...prev,
      costs: [...prev.costs, newItemCostLine(item)],
    }));
  }

  function removeCost(id: string) {
    setInput((prev) => ({
      ...prev,
      costs: prev.costs.filter((c) => c.id !== id),
    }));
  }

  function setUnitPrice(itemId: string, v: string) {
    setPrices((prev) => ({
      ...prev,
      [itemId]: v === "" ? undefined : Number(v),
    }));
  }

  function reset() {
    setInput(defaultRaisingInput());
  }

  return (
    <main className="layout">
      <section className="panel">
        <h2>Résultat</h2>
        <p className="hint">
          Est-ce que lever cette monture est rentable, en kamas ?
        </p>

        <dl className="result-grid">
          <div>
            <dt>Coût total</dt>
            <dd className="num">{formatKamas(result.totalCost)}</dd>
          </div>
          <div>
            <dt>Prix de vente</dt>
            <dd className="num">{formatKamas(input.sellPrice)}</dd>
          </div>
          <div>
            <dt>Bénéfice net</dt>
            <dd className={`num big ${marginClass(result.profit)}`}>
              {formatKamas(result.profit)}
            </dd>
          </div>
          <div>
            <dt>Marge</dt>
            <dd className={`num ${marginClass(result.profit)}`}>
              {formatPercent(result.marginRatio)}
            </dd>
          </div>
          <div>
            <dt>Bénéfice / jour</dt>
            <dd className={`num ${marginClass(result.profitPerDay)}`}>
              {result.profitPerDay == null
                ? "—"
                : `${formatKamas(result.profitPerDay)} / j`}
            </dd>
          </div>
        </dl>
      </section>

      <div>
        <section className="panel">
          <h2>Vente & durée</h2>
          <div className="field">
            <label htmlFor="sell-price">Prix de vente (kamas)</label>
            <input
              id="sell-price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="—"
              value={input.sellPrice ?? ""}
              onChange={(e) => setSellPrice(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="days">Durée d'élevage (jours)</label>
            <input
              id="days"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="—"
              value={input.days ?? ""}
              onChange={(e) => setDays(e.target.value)}
            />
            <p className="hint">Sert à calculer le bénéfice par jour.</p>
          </div>
        </section>

        <section className="panel">
          <h2>Coûts d'élevage</h2>
          <p className="hint">
            Un montant fixe, ou un objet suivi (coût = prix × quantité, calculé
            depuis les prix suivis).
          </p>

          <ul className="cost-list">
            {input.costs.map((cost) =>
              cost.itemId != null ? (
                <li key={cost.id} className="cost-row item">
                  <span className="cost-item-name">{cost.label}</span>
                  <input
                    type="number"
                    className="cost-qty"
                    min={0}
                    inputMode="numeric"
                    placeholder="Qté"
                    value={cost.quantity ?? ""}
                    onChange={(e) =>
                      updateCost(cost.id, {
                        quantity:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    aria-label={`Quantité de ${cost.label}`}
                  />
                  <span className="cost-x">×</span>
                  <input
                    type="number"
                    className="cost-unit"
                    min={0}
                    inputMode="numeric"
                    placeholder="prix"
                    value={prices[cost.itemId] ?? ""}
                    onChange={(e) => setUnitPrice(cost.itemId!, e.target.value)}
                    aria-label={`Prix unitaire de ${cost.label}`}
                  />
                  <span
                    className={`cost-line-total ${
                      isMissingPrice(cost, prices) ? "missing" : ""
                    }`}
                  >
                    {isMissingPrice(cost, prices)
                      ? "prix ?"
                      : formatKamas(lineCost(cost, prices))}
                  </span>
                  <button
                    type="button"
                    className="cost-remove"
                    onClick={() => removeCost(cost.id)}
                    aria-label={`Retirer ${cost.label}`}
                  >
                    ✕
                  </button>
                </li>
              ) : (
                <li key={cost.id} className="cost-row">
                  <input
                    type="text"
                    className="cost-label"
                    placeholder="Poste de coût"
                    value={cost.label}
                    onChange={(e) =>
                      updateCost(cost.id, { label: e.target.value })
                    }
                    aria-label="Nom du coût"
                  />
                  <input
                    type="number"
                    className="cost-amount"
                    min={0}
                    inputMode="numeric"
                    placeholder="—"
                    value={cost.amount ?? ""}
                    onChange={(e) =>
                      updateCost(cost.id, {
                        amount:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    aria-label="Montant en kamas"
                  />
                  <button
                    type="button"
                    className="cost-remove"
                    onClick={() => removeCost(cost.id)}
                    aria-label={`Retirer ${cost.label || "ce coût"}`}
                  >
                    ✕
                  </button>
                </li>
              ),
            )}
          </ul>

          <div className="cost-actions">
            <button type="button" onClick={addManualCost}>
              + Ajouter un coût
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Réinitialiser
            </button>
          </div>

          <div className="cost-items">
            <p className="hint">Ajouter un objet suivi comme coût :</p>
            {favourites.length > 0 && (
              <div className="fav-chips">
                {favourites.map((fav) => (
                  <button
                    type="button"
                    key={fav.id}
                    className="fav-chip"
                    onClick={() => addItemCost(fav)}
                    disabled={linkedIds.has(fav.id)}
                    title={
                      linkedIds.has(fav.id) ? "Déjà ajouté" : "Ajouter comme coût"
                    }
                  >
                    {fav.name}
                  </button>
                ))}
              </div>
            )}
            <ItemAutocomplete
              onPick={addItemCost}
              isPicked={(id) => linkedIds.has(id)}
              placeholder="Rechercher un objet à ajouter…"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
