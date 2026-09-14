import { useEffect, useRef, useState } from "react";
import type { AvisReward } from "../lib/avis";
import { avitonUnitValue, effectiveAvitons, avisInLevelRange } from "../lib/avis";
import type { Item } from "../types";
import { fetchAvisDeRecherche, fetchRecipesFor } from "../data/dofusApi";
import {
  loadAvisAviton,
  loadAvisCatalog,
  loadAvisChasseOnly,
  loadAvisLevelRange,
  loadAvisOverrides,
  loadAvisParticipation,
  loadCarteRecipes,
  saveAvisAviton,
  saveAvisCatalog,
  saveAvisChasseOnly,
  saveAvisLevelRange,
  saveAvisOverrides,
  saveAvisParticipation,
  saveCarteRecipes,
  type AvisOverrides,
  type CarteRecipeCache,
} from "../lib/storage";
import { usePrices } from "../lib/usePrices";
import { formatDateTime, formatKamas } from "../lib/format";
import {
  AvisCard,
  type AvisSlot,
  type CarteCraft,
} from "../components/AvisCard";

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
  // Free-text name filter, so a given avis is one keystroke away.
  const [filter, setFilter] = useState("");
  // Level-range filter (min/max, null = open). Persisted so it sticks.
  const [levelRange, setLevelRange] = useState(loadAvisLevelRange);
  function setLevelBound(field: "min" | "max", value: string) {
    setLevelRange((prev) => {
      let n: number | null = null;
      const t = value.trim();
      if (t !== "") {
        const parsed = Math.round(Number(t));
        if (Number.isFinite(parsed) && parsed > 0) n = parsed;
      }
      const next = { ...prev, [field]: n };
      saveAvisLevelRange(next);
      return next;
    });
  }
  // Shared price store (carte + resource prices). Entries are the single source
  // of truth; the map derives from them, and each entry's source drives the badge.
  const { prices, entries, setPrice, clearPrice } = usePrices();

  function onPriceChange(item: Item, value: number | null) {
    if (value == null) clearPrice(item.id);
    else setPrice(item, value);
  }

  // Per-avis manual item corrections (wrong/missing auto-detection).
  const [overrides, setOverrides] = useState<AvisOverrides>(loadAvisOverrides);

  function setOverride(
    avisId: string,
    slot: "carte" | "resource",
    item: Item | null,
  ) {
    setOverrides((prev) => {
      const cur = { ...(prev[avisId] ?? {}) };
      if (item) cur[slot] = item;
      else delete cur[slot];
      const next = { ...prev };
      if (cur.carte || cur.resource) next[avisId] = cur;
      else delete next[avisId];
      saveAvisOverrides(next);
      return next;
    });
  }

  // Carte craft recipes (carte id → ingredients), cached; fetched on demand when
  // a card's craft breakdown is first opened. `[]` means "not craftable".
  const [carteRecipes, setCarteRecipes] =
    useState<CarteRecipeCache>(loadCarteRecipes);
  const [carteStatus, setCarteStatus] = useState<
    Record<string, "loading" | "error">
  >({});

  async function loadCarteRecipe(carteId: string) {
    if (carteId in carteRecipes || carteStatus[carteId] === "loading") return;
    setCarteStatus((s) => ({ ...s, [carteId]: "loading" }));
    try {
      const recipes = await fetchRecipesFor(carteId);
      const ings = (recipes[0]?.ingredients ?? []).map((i) => ({
        item: i.item,
        quantity: i.quantity,
      }));
      setCarteRecipes((prev) => {
        const next = { ...prev, [carteId]: ings };
        saveCarteRecipes(next);
        return next;
      });
      setCarteStatus((s) => {
        const next = { ...s };
        delete next[carteId];
        return next;
      });
    } catch {
      setCarteStatus((s) => ({ ...s, [carteId]: "error" }));
    }
  }

  /** Build the buy-vs-craft option for one avis's carte (undefined if unresolved). */
  function buildCarteCraft(carteItem: Item | undefined): CarteCraft | undefined {
    if (!carteItem) return undefined;
    const carteId = carteItem.id;
    const ings = carteRecipes[carteId]; // undefined = not fetched yet
    let cost = 0;
    let complete = true;
    const ingredients = ings?.map((i) => {
      const price = prices[i.item.id];
      if (price == null) complete = false;
      else cost += price * i.quantity;
      return { item: i.item, quantity: i.quantity, price };
    });
    const status: CarteCraft["status"] = ings
      ? ings.length > 0
        ? "ok"
        : "none"
      : (carteStatus[carteId] ?? "idle");
    return {
      status,
      ingredients,
      cost: ings && ings.length > 0 && complete ? cost : undefined,
      onExpand: () => loadCarteRecipe(carteId),
      onIngredientPrice: (item, value) => onPriceChange(item, value),
    };
  }

  /** Build a carte/resource slot: effective item (override ?? auto), price, hooks. */
  function buildSlot(
    avisId: string,
    kind: "carte" | "resource",
    auto: Item | undefined,
    override: Item | undefined,
  ): AvisSlot {
    const item = override ?? auto;
    return {
      item,
      price: item ? prices[item.id] : undefined,
      source: item ? entries[item.id]?.source : undefined,
      overridden: override != null,
      onPick: (picked) => setOverride(avisId, kind, picked),
      onRevert: () => setOverride(avisId, kind, null),
      onPriceChange: (value) => item && onPriceChange(item, value),
    };
  }

  // Per-avis "spot" fee (avis id → kamas), persisted.
  const [participation, setParticipation] = useState<Record<string, number>>(
    loadAvisParticipation,
  );
  // Aviton resale rate: `qty` avitons sell for `price` kamas.
  const [aviton, setAviton] = useState(loadAvisAviton);
  const avitonUnit = avitonUnitValue(aviton.qty, aviton.price);
  // Done via the legendary hunt alone (no quest) → avitons are halved.
  const [chasseOnly, setChasseOnly] = useState(loadAvisChasseOnly);
  function toggleChasseOnly(on: boolean) {
    setChasseOnly(on);
    saveAvisChasseOnly(on);
  }

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

  // Accent/case-insensitive name filter (so "fouduglan" finds "Fouduglan").
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const query = norm(filter.trim());
  const filtersActive =
    query !== "" || levelRange.min != null || levelRange.max != null;
  const visible = list.filter(
    (a) =>
      (query === "" || norm(a.name).includes(query)) &&
      avisInLevelRange(a.level, levelRange.min, levelRange.max),
  );

  return (
    <main className="avis-page">
      <section className="panel">
        <h2>Avis de recherche</h2>
        <p className="hint">
          Tous les avis de recherche qui rapportent des avitons (source DofusDB).
          Les prix carte et ressource sont remplis par l'OCR ou saisissables à la
          main&nbsp;; ils alimentent aussi les pages Objets suivis et Prix.
          Détection carte/ressource incorrecte&nbsp;? Cliquez l'icône de la ligne
          pour chercher et fixer le bon objet.
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
        <label className="avis-chasse-only">
          <input
            type="checkbox"
            checked={chasseOnly}
            onChange={(e) => toggleChasseOnly(e.target.checked)}
          />
          <span>
            Chasse légendaire seule (sans la quête)&nbsp;: avitons divisés par 2
          </span>
        </label>
      </section>

      {list.length === 0 && status === "loading" && (
        <p className="hint">Récupération des avis de recherche…</p>
      )}

      {list.length > 0 && (
        <div className="avis-filter">
          <input
            type="search"
            className="avis-filter-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer par nom… (ex. Fouduglan)"
            aria-label="Filtrer les avis par nom"
          />
          <span className="avis-level-range">
            <span className="avis-level-label">Niveau</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="avis-level-input"
              value={levelRange.min ?? ""}
              placeholder="1"
              aria-label="Niveau minimum"
              onChange={(e) => setLevelBound("min", e.target.value)}
            />
            <span className="avis-level-dash" aria-hidden>
              –
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="avis-level-input"
              value={levelRange.max ?? ""}
              placeholder="200"
              aria-label="Niveau maximum"
              onChange={(e) => setLevelBound("max", e.target.value)}
            />
          </span>
          {filtersActive && (
            <span className="hint">
              {visible.length} / {list.length}
            </span>
          )}
        </div>
      )}

      {list.length > 0 && visible.length === 0 && (
        <p className="hint">Aucun avis ne correspond aux filtres.</p>
      )}

      <ul className="avis-grid">
        {visible.map((avis) => {
          const id = String(avis.id);
          const ov = overrides[id] ?? {};
          const carteAuto: Item | undefined = avis.carteItemId
            ? {
                id: avis.carteItemId,
                name: avis.carteName ?? "Carte",
                img: avis.carteImg,
              }
            : undefined;
          const resourceAuto: Item | undefined = avis.resourceItemId
            ? {
                id: avis.resourceItemId,
                name: avis.resourceName ?? "Ressource",
                img: avis.resourceImg,
              }
            : undefined;
          const avitons = effectiveAvitons(avis.avitons, chasseOnly);
          const carteItem = ov.carte ?? carteAuto;
          return (
            <AvisCard
              key={avis.id}
              avis={avis}
              carte={buildSlot(id, "carte", carteAuto, ov.carte)}
              resource={buildSlot(id, "resource", resourceAuto, ov.resource)}
              carteCraft={buildCarteCraft(carteItem)}
              avitons={avitons}
              avitonValue={avitonUnit * avitons}
              participationCost={participation[avis.id] ?? 0}
              onParticipationChange={(value) => setParticipationFor(id, value)}
            />
          );
        })}
      </ul>
    </main>
  );
}
