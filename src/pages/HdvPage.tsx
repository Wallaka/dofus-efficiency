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

/** The kama coin, DofusDB-style — inline so it needs no external image. */
function KamaIcon() {
  return (
    <svg className="kama-ic" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#e8b23a" stroke="#a9781f" strokeWidth="1" />
      <circle cx="8" cy="8" r="4.4" fill="none" stroke="#a9781f" strokeWidth="0.8" opacity="0.5" />
      <text
        x="8"
        y="11"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="#7a5410"
      >
        k
      </text>
    </svg>
  );
}

export function HdvPage() {
  const catalog = useMemo(() => loadCatalog(), []);
  const [entries, setEntries] = useState<PriceEntryMap>(loadPriceEntries);
  const [selected, setSelected] = useState(() =>
    catalog[0] ? keyOf(catalog[0].tab, catalog[0].categories[0]?.category ?? "") : "",
  );
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
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

  // Global search spans every category; when active it replaces the category
  // view with a flat results list (each row tagged with its category).
  const searching = search.trim() !== "";
  const gq = norm(search.trim());
  const results: { item: CatalogItem; category: string }[] = [];
  if (searching) {
    for (const tab of catalog) {
      for (const cat of tab.categories) {
        for (const it of cat.items) {
          if (norm(it.name).includes(gq)) {
            results.push({ item: it, category: cat.category });
          }
        }
      }
    }
  }

  const catQuery = norm(filter.trim());
  const catItems = active
    ? catQuery
      ? active.items.filter((it) => norm(it.name).includes(catQuery))
      : active.items
    : [];

  // What the right pane renders: search results (with category) or the category.
  const display: { item: CatalogItem; category: string }[] = searching
    ? results
    : catItems.map((item) => ({ item, category: "" }));

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

      <input
        className="hdv-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un objet dans tout le HDV…"
      />

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
                    className={
                      !searching && k === selected
                        ? "hdv-cat-btn active"
                        : "hdv-cat-btn"
                    }
                    onClick={() => {
                      setSelected(k);
                      setFilter("");
                      setSearch("");
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
            {searching ? (
              <>
                <h3>Résultats</h3>
                <span className="hdv-progress">
                  {results.length} objet{results.length > 1 ? "s" : ""}
                </span>
              </>
            ) : (
              <>
                <h3>{active?.category}</h3>
                <input
                  className="hdv-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrer dans cette catégorie…"
                />
                <span className="hdv-progress">
                  {pricedCount}/{active?.items.length ?? 0} prix
                </span>
              </>
            )}
          </div>

          <div className="hdv-rows" ref={listRef}>
            {display.length === 0 && (
              <p className="hint">Aucun objet ne correspond.</p>
            )}
            {display.map(({ item, category }) => {
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
                  <span className="hdv-lvl">
                    {category && <span className="hdv-cat-tag">{category}</span>}
                    {item.level ? ` niv. ${item.level}` : ""}
                  </span>
                  <span className="hdv-price-wrap">
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
                    <KamaIcon />
                  </span>
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
