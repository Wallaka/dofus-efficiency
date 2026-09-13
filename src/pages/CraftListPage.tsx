import { useEffect, useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";
import { fetchRecipesFor } from "../data/dofusApi";
import {
  loadCraftList,
  saveCraftList,
  evaluateEntry,
  type CraftEntry,
} from "../lib/craftList";
import { loadPrices } from "../lib/storage";
import { loadPriceEntries, type PriceEntryMap } from "../lib/priceStore";
import { setManualPrice, clearPrice } from "../lib/trackedPrices";
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
  const [prices, setPrices] = useState<PriceMap>(() => loadPrices() ?? {});
  const [priceEntries, setPriceEntries] =
    useState<PriceEntryMap>(loadPriceEntries);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  // Name of the craft currently being fetched, for the "Ajout de … " hint.
  const [adding, setAdding] = useState<string>();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    saveCraftList(entries);
  }, [entries]);

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
    if (value == null) {
      clearPrice(item.id);
      setPrices((p) => {
        const next = { ...p };
        delete next[item.id];
        return next;
      });
      setPriceEntries((e) => {
        const next = { ...e };
        delete next[item.id];
        return next;
      });
      return;
    }
    const entry = setManualPrice(item, value);
    setPrices((p) => ({ ...p, [item.id]: value }));
    setPriceEntries((e) => ({ ...e, [item.id]: entry }));
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
    const evaluated = entries.map((entry) => ({
      entry,
      evaluation: evaluateEntry(entry, prices),
    }));
    evaluated.sort((a, b) => {
      const am = a.evaluation.margin;
      const bm = b.evaluation.margin;
      if (am == null && bm == null) return b.entry.addedAt - a.entry.addedAt;
      if (am == null) return 1;
      if (bm == null) return -1;
      return bm - am;
    });
    return query
      ? evaluated.filter((r) => norm(r.entry.resultItem.name).includes(query))
      : evaluated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, prices, query]);

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
                  prices={prices}
                  entries={priceEntries}
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
