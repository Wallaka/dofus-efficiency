import { useEffect, useMemo, useState } from "react";
import {
  computeRaising,
  defaultRaisingInput,
  newCostLine,
  type RaisingInput,
} from "../lib/eleveur";
import { loadEleveur, saveEleveur } from "../lib/storage";
import { formatKamas, formatPercent } from "../lib/format";

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

  useEffect(() => {
    saveEleveur(input);
  }, [input]);

  const result = useMemo(() => computeRaising(input), [input]);

  function setSellPrice(v: string) {
    setInput((prev) => ({
      ...prev,
      sellPrice: v === "" ? undefined : Number(v),
    }));
  }

  function setDays(v: string) {
    setInput((prev) => ({ ...prev, days: v === "" ? undefined : Number(v) }));
  }

  function setCostLabel(id: string, label: string) {
    setInput((prev) => ({
      ...prev,
      costs: prev.costs.map((c) => (c.id === id ? { ...c, label } : c)),
    }));
  }

  function setCostAmount(id: string, v: string) {
    setInput((prev) => ({
      ...prev,
      costs: prev.costs.map((c) =>
        c.id === id ? { ...c, amount: v === "" ? undefined : Number(v) } : c,
      ),
    }));
  }

  function addCost() {
    setInput((prev) => ({ ...prev, costs: [...prev.costs, newCostLine()] }));
  }

  function removeCost(id: string) {
    setInput((prev) => ({
      ...prev,
      costs: prev.costs.filter((c) => c.id !== id),
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
            Achat de la dragodinde, nourriture, enclos… Ajoutez ce qui compte.
          </p>

          <ul className="cost-list">
            {input.costs.map((cost) => (
              <li key={cost.id} className="cost-row">
                <input
                  type="text"
                  className="cost-label"
                  placeholder="Poste de coût"
                  value={cost.label}
                  onChange={(e) => setCostLabel(cost.id, e.target.value)}
                  aria-label="Nom du coût"
                />
                <input
                  type="number"
                  className="cost-amount"
                  min={0}
                  inputMode="numeric"
                  placeholder="—"
                  value={cost.amount ?? ""}
                  onChange={(e) => setCostAmount(cost.id, e.target.value)}
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
            ))}
          </ul>

          <div className="cost-actions">
            <button type="button" onClick={addCost}>
              + Ajouter un coût
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Réinitialiser
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
