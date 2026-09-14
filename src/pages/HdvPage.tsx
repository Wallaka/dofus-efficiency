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
import { formatKamas } from "../lib/format";

/**
 * The in-app HDV: the bundled catalog laid out like the game's marketplace
 * (tab → category → items). You never type a name — you find the item in its
 * category and punch the price. Enter saves and jumps to the next field, so a
 * whole category is a quick numpad run. Prices go straight to the price store.
 */

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function HdvPage() {
  const catalog = useMemo(() => loadCatalog(), []);
  const [entries, setEntries] = useState<PriceEntryMap>(loadPriceEntries);
  const [tabName, setTabName] = useState(catalog[0]?.tab ?? "");
  const [filter, setFilter] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const activeTab = catalog.find((t) => t.tab === tabName) ?? catalog[0];
  const query = norm(filter.trim());

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
      gridRef.current?.querySelectorAll<HTMLInputElement>("input.hdv-price") ?? [],
    );
    const i = inputs.indexOf(current);
    inputs[i + 1]?.focus();
  }

  if (catalog.length === 0) {
    return (
      <section className="panel hdv-page">
        <h2>HDV</h2>
        <p className="hint">
          Le catalogue est vide. Colle des catégories DofusDB dans{" "}
          <code>catalog-src/&lt;Onglet&gt;/&lt;Catégorie&gt;.json</code> puis lance{" "}
          <code>npm run build:catalog</code> — voir <code>catalog-src/README.md</code>.
        </p>
      </section>
    );
  }

  const now = Date.now();
  const shownCategories = activeTab.categories
    .map((cat) => ({
      ...cat,
      items: query
        ? cat.items.filter((it) => norm(it.name).includes(query))
        : cat.items,
    }))
    .filter((cat) => cat.items.length > 0);

  // Progress for the active tab.
  const tabItems = activeTab.categories.flatMap((c) => c.items);
  const pricedCount = tabItems.filter((it) => entries[it.id] != null).length;

  return (
    <section className="panel hdv-page">
      <h2>HDV</h2>
      <p className="hint">
        Trouve l'objet dans sa catégorie et tape son prix — <kbd>Entrée</kbd>{" "}
        enregistre et passe au suivant. «&nbsp;3k&nbsp;» = 3000. Les prix vont
        directement dans la page Prix.
      </p>

      <div className="hdv-toolbar">
        <div className="hdv-tabs">
          {catalog.map((t) => (
            <button
              key={t.tab}
              className={t.tab === activeTab.tab ? "hdv-tab active" : "hdv-tab"}
              onClick={() => setTabName(t.tab)}
            >
              {t.tab}
            </button>
          ))}
        </div>
        <input
          className="hdv-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer dans cet onglet…"
        />
        <span className="hdv-progress">
          {pricedCount}/{tabItems.length} avec prix
        </span>
      </div>

      <div className="hdv-grid" ref={gridRef}>
        {shownCategories.length === 0 && (
          <p className="hint">Aucun objet ne correspond.</p>
        )}
        {shownCategories.map((cat) => (
          <div key={cat.category} className="hdv-cat">
            <h3 className="hdv-cat-title">
              {cat.category} <span className="hdv-cat-count">{cat.items.length}</span>
            </h3>
            <div className="hdv-rows">
              {cat.items.map((item) => {
                const entry = entries[item.id];
                const stale = entry ? isStale(entry.updatedAt, now) : false;
                return (
                  <label key={item.id} className="hdv-row">
                    {item.img ? (
                      <img src={item.img} alt="" className="hdv-ic" />
                    ) : (
                      <span className="hdv-ic hdv-ic-empty" />
                    )}
                    <span className="hdv-name">
                      {item.name}
                      {item.level ? <em className="hdv-lvl"> niv. {item.level}</em> : null}
                    </span>
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
                    <span className="hdv-age">
                      {entry ? (
                        <span className={stale ? "hdv-stale" : "hdv-fresh"}>
                          {formatKamas(entry.price)} · {relativeAge(entry.updatedAt, now)}
                        </span>
                      ) : (
                        ""
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {catalogGeneratedAt && (
        <p className="hdv-footer hint">
          Catalogue mis à jour le {new Date(catalogGeneratedAt).toLocaleDateString("fr")}.
        </p>
      )}
    </section>
  );
}
