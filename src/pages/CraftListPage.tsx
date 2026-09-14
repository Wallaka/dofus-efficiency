import { useEffect, useMemo, useState } from "react";
import type { Item } from "../types";
import { fetchRecipesFor } from "../data/dofusApi";
import {
  loadCraftList,
  saveCraftList,
  loadCraftTaxPercent,
  saveCraftTaxPercent,
  evaluateEntry,
  type CraftEntry,
} from "../lib/craftList";
import { usePrices } from "../lib/usePrices";
import {
  loadResources,
  stockQuantities,
  loadUseMaterials,
  saveUseMaterials,
} from "../lib/resources";
import { ItemAutocomplete } from "../components/ItemAutocomplete";
import { CraftRow } from "../components/CraftRow";

type Status = "idle" | "loading" | "error";

/**
 * The Craft page: search an item, add it to a list, and read its craft benefit.
 * Each row's ingredient/sell prices come from the shared price store (OCR or
 * manual) and edits here write straight back to it, so a price typed on this
 * page updates the Prix, Objets suivis and other craft views too.
 */
export function CraftListPage() {
  const [entries, setEntries] = useState<CraftEntry[]>(loadCraftList);
  const { prices, entries: priceEntries, setPrice, clearPrice } = usePrices();
  // "Mes ressources": loaded once; deducted from costs when the toggle is on.
  const [resources] = useState(loadResources);
  const [useMaterials, setUseMaterials] = useState(loadUseMaterials);
  const stock = useMemo(
    () => (useMaterials ? stockQuantities(resources) : undefined),
    [useMaterials, resources],
  );

  function toggleMaterials(on: boolean) {
    setUseMaterials(on);
    saveUseMaterials(on);
  }

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  // Name of the craft currently being fetched, for the "Ajout de … " hint.
  const [adding, setAdding] = useState<string>();
  const [filter, setFilter] = useState("");
  // HDV sell tax, as a percentage of the sale price.
  const [taxPercent, setTaxPercent] = useState<number>(loadCraftTaxPercent);

  useEffect(() => {
    saveCraftList(entries);
  }, [entries]);

  function onTaxChange(value: string) {
    const n = Math.max(0, Number(value) || 0);
    setTaxPercent(n);
    saveCraftTaxPercent(n);
  }

  const pickedIds = useMemo(
    () => new Set(entries.map((e) => e.resultItem.id)),
    [entries],
  );

  async function addCraft(item: Item) {
    // Already in the list — just surface it, don't refetch.
    if (pickedIds.has(item.id)) return;
    setStatus("loading");
    setError(undefined);
    setAdding(item.name);
    try {
      const recipes = await fetchRecipesFor(item.id);
      if (recipes.length === 0) {
        setError(`« ${item.name} » n'a pas de recette de craft.`);
        setStatus("error");
        return;
      }
      // Most items have one recipe; take the richest (see fetchRecipesFor).
      const entry: CraftEntry = { ...recipes[0], addedAt: Date.now() };
      setEntries((prev) => [entry, ...prev]);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      setAdding(undefined);
    }
  }

  function removeCraft(recipeId: string) {
    setEntries((prev) => prev.filter((e) => e.recipeId !== recipeId));
  }

  // Manual price edit → write both shared stores, then mirror into local state
  // so the affected rows recompute immediately. (Same path as the Avis page.)
  function onPriceChange(item: Item, value: number | null) {
    if (value == null) clearPrice(item.id);
    else setPrice(item, value);
  }

  // Evaluate every entry, then rank by margin (best first, unknown last) and
  // apply the name filter — so the most profitable craft is always on top.
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const query = norm(filter.trim());

  const rows = useMemo(() => {
    const taxRate = taxPercent / 100;
    const evaluated = entries.map((entry) => ({
      entry,
      evaluation: evaluateEntry(entry, prices, taxRate, stock),
    }));
    evaluated.sort((a, b) => {
      const am = a.evaluation.netMargin;
      const bm = b.evaluation.netMargin;
      if (am == null && bm == null) return b.entry.addedAt - a.entry.addedAt;
      if (am == null) return 1;
      if (bm == null) return -1;
      return bm - am;
    });
    return query
      ? evaluated.filter((r) => norm(r.entry.resultItem.name).includes(query))
      : evaluated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, prices, query, taxPercent, stock]);

  return (
    <main className="craft-page">
      <section className="panel">
        <h2>Craft</h2>
        <p className="hint">
          Cherchez un objet craftable et ajoutez-le à la liste. Cliquez une ligne
          pour voir et éditer les prix des ingrédients. Les prix viennent de l'OCR
          / des prix suivis, ou se saisissent à la main&nbsp;; ils alimentent aussi
          les pages Objets suivis et Prix. La marge n'est calculée que si tous les
          prix sont connus.
        </p>
        <div className="craft-search">
          <ItemAutocomplete
            onPick={addCraft}
            isPicked={(id) => pickedIds.has(id)}
            placeholder="Rechercher un objet à crafter… (ex. Gelano)"
          />
          <span className="craft-search-status">
            {status === "loading" && adding && `Ajout de « ${adding} »…`}
            {status === "error" && (
              <span className="error-text">{error}</span>
            )}
          </span>
        </div>
        <div className="craft-tax">
          <label htmlFor="craft-tax-input" className="craft-tax-label">
            Taxe HDV
          </label>
          <input
            id="craft-tax-input"
            type="number"
            min={0}
            max={100}
            step={0.5}
            inputMode="decimal"
            value={taxPercent || ""}
            placeholder="0"
            onChange={(e) => onTaxChange(e.target.value)}
          />
          <span className="craft-tax-unit">%</span>
          <span className="hint">
            prélevée sur le prix de vente et déduite du bénéfice.
          </span>
        </div>
        <label className="use-materials">
          <input
            type="checkbox"
            checked={useMaterials}
            onChange={(e) => toggleMaterials(e.target.checked)}
          />
          <span>
            <b>Utiliser mes ressources</b>
            <span className="hint">
              Déduit ton stock (page « Mes ressources ») des quantités à
              acheter&nbsp;; le coût affiché = ce qu'il reste à payer.
            </span>
          </span>
        </label>
      </section>

      {entries.length === 0 ? (
        <p className="hint">
          Aucun craft pour l'instant. Cherchez un objet ci-dessus pour commencer.
        </p>
      ) : (
        <>
          <div className="craft-filter">
            <input
              type="search"
              className="craft-filter-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer par nom…"
              aria-label="Filtrer les crafts par nom"
            />
            {filter.trim() !== "" && (
              <span className="hint">
                {rows.length} / {entries.length}
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="hint">Aucun craft ne correspond à « {filter.trim()} ».</p>
          ) : (
            <ul className="craft-list">
              <li className="craft-list-head" aria-hidden>
                <span></span>
                <span>Objet</span>
                <span className="col-num">Coût</span>
                <span className="col-num">Vente</span>
                <span className="col-num">Bénéfice</span>
                <span className="col-num">Marge</span>
              </li>
              {rows.map(({ entry, evaluation }) => (
                <CraftRow
                  key={entry.recipeId}
                  entry={entry}
                  evaluation={evaluation}
                  taxPercent={taxPercent}
                  prices={prices}
                  entries={priceEntries}
                  stock={stock}
                  onPriceChange={onPriceChange}
                  onRemove={() => removeCraft(entry.recipeId)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
