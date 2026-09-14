import { useMemo, useRef, useState } from "react";
import { loadCatalog, catalogGeneratedAt, type CatalogItem } from "../data/catalog";
import {
  loadPriceEntries,
  recordPriceEntry,
  deletePriceEntry,
  isStale,
  relativeAge,
  type PriceEntry,
  type PriceEntryMap,
} from "../lib/priceStore";
import { parseFrenchNumber } from "../lib/voiceParse";

/**
 * The in-app HDV: a game-like marketplace. The left rail lists categories
 * (grouped by tab); picking one shows its items on the right, where you punch
 * prices. You never type a name — you find the item and fill the price. Enter
 * saves and jumps to the next field. Prices go straight to the price store.
 */

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const keyOf = (tab: string, category: string) => `${tab}::${category}`;

export function HdvPage() {
  const catalog = useMemo(() => loadCatalog(), []);
  const [entries, setEntries] = useState<PriceEntryMap>(loadPriceEntries);
  const [selected, setSelected] = useState(() =>
    catalog[0] ? keyOf(catalog[0].tab, catalog[0].categories[0]?.category ?? "") : "",
  );
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Flat lookup of the active category's items.
  const active = useMemo(() => {
    for (const tab of catalog) {
      for (const cat of tab.categories) {
        if (keyOf(tab.tab, cat.category) === selected) {
          return { tab: tab.tab, category: cat.category, items: cat.items };
        }
      }
    }
    return null;
  }, [catalog, selected]);

  function commit(item: CatalogItem, raw: string) {
    const text = raw.trim();
    if (text === "") {
      if (entries[item.id]) {
        deletePriceEntry(item.id);
        setEntries((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
      return;
    }
    const price = parseFrenchNumber(text);
    if (price == null || price <= 0) return;
    const entry: PriceEntry = {
      itemId: item.id,
      name: item.name,
      level: item.level,
      img: item.img,
      price,
      updatedAt: Date.now(),
      source: "manual",
      detail: "HDV (saisie manuelle)",
    };
    recordPriceEntry(entry);
    setEntries((prev) => ({ ...prev, [item.id]: entry }));
  }

  function focusNext(current: HTMLInputElement) {
    const inputs = Array.from(
      listRef.current?.querySelectorAll<HTMLInputElement>("input.hdv-price") ?? [],
    );
    const i = inputs.indexOf(current);
    inputs[i + 1]?.focus();
  }

  if (catalog.length === 0) {
    return (
      <section className="panel hdv-page">
        <h2>HDV</h2>
        <p className="hint">
          Le catalogue est vide. Lance <code>npm run fetch:catalog</code> en local
          (DofusDB n'est pas joignable depuis le sandbox) — voir{" "}
          <code>catalog-src/README.md</code>.
        </p>
      </section>
    );
  }

  const now = Date.now();
  const query = norm(filter.trim());
  const shownItems =
    active && query
      ? active.items.filter((it) => norm(it.name).includes(query))
      : (active?.items ?? []);
  const pricedCount = active
    ? active.items.filter((it) => entries[it.id] != null).length
    : 0;

  return (
    <section className="panel hdv-page">
      <h2>HDV</h2>
      <p className="hint">
        Choisis la catégorie à gauche, remplis les prix à droite —{" "}
        <kbd>Entrée</kbd> enregistre et passe au suivant. «&nbsp;3k&nbsp;» = 3000.
      </p>

      <div className="hdv-layout">
        <nav className="hdv-rail">
          {catalog.map((tab) => (
            <div key={tab.tab} className="hdv-rail-group">
              <div className="hdv-rail-tab">{tab.tab}</div>
              {tab.categories.map((cat) => {
                const k = keyOf(tab.tab, cat.category);
                return (
                  <button
                    key={k}
                    className={k === selected ? "hdv-cat-btn active" : "hdv-cat-btn"}
                    onClick={() => {
                      setSelected(k);
                      setFilter("");
                    }}
                  >
                    {cat.category}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="hdv-detail">
          <div className="hdv-detail-head">
            <h3>{active?.category}</h3>
            <input
              className="hdv-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer…"
            />
            <span className="hdv-progress">
              {pricedCount}/{active?.items.length ?? 0} prix
            </span>
          </div>

          <div className="hdv-rows" ref={listRef}>
            {shownItems.length === 0 && (
              <p className="hint">Aucun objet ne correspond.</p>
            )}
            {shownItems.map((item) => {
              const entry = entries[item.id];
              const stale = entry ? isStale(entry.updatedAt, now) : false;
              return (
                <label key={item.id} className="hdv-row">
                  {item.img ? (
                    <img src={item.img} alt="" className="hdv-ic" />
                  ) : (
                    <span className="hdv-ic hdv-ic-empty" />
                  )}
                  <span className="hdv-name">{item.name}</span>
                  {item.level ? <span className="hdv-lvl">niv. {item.level}</span> : <span />}
                  <input
                    className="hdv-price"
                    type="text"
                    inputMode="numeric"
                    defaultValue={entry ? String(entry.price) : ""}
                    placeholder="prix"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commit(item, e.currentTarget.value);
                        focusNext(e.currentTarget);
                      }
                    }}
                    onBlur={(e) => commit(item, e.currentTarget.value)}
                  />
                  <span className={stale ? "hdv-age hdv-stale" : "hdv-age"}>
                    {entry ? relativeAge(entry.updatedAt, now) : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {catalogGeneratedAt && (
        <p className="hdv-footer hint">
          Catalogue : {new Date(catalogGeneratedAt).toLocaleDateString("fr")}.
        </p>
      )}
    </section>
  );
}
