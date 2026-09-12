import { useEffect, useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";
import { Pagination, PAGE_SIZE } from "./Pagination";

interface Props {
  items: Item[];
  prices: PriceMap;
  onChange: (itemId: string, price: number | undefined) => void;
}

/**
 * The editable list of HDV unit prices — the "dynamic data" a user keeps
 * current. In Phase 1 these same values get auto-filled from OCR'd screenshots
 * instead of typed here. A filter + pagination keep it usable when a DofusDB
 * dataset brings in many items.
 */
export function PriceEditor({ items, prices, onChange }: Props) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [items],
  );

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((i) => i.name.toLowerCase().includes(q));
  }, [sorted, filter]);

  // Back to page 1 whenever the filter changes.
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));

  // Keep the current page in range when the list shrinks (filter / data change).
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="panel">
      <h2>Prix HDV (kamas / unité)</h2>
      <p className="hint">
        Entrez le prix unitaire vu à l'HDV. Ces valeurs seront un jour remplies
        automatiquement depuis vos captures Medal.
      </p>

      {items.length > PAGE_SIZE && (
        <input
          type="search"
          className="price-filter"
          placeholder={`Filtrer ${items.length} objets…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <ul className="price-list">
        {pageItems.map((item) => (
          <li key={item.id} className="price-row">
            <label htmlFor={`price-${item.id}`}>{item.name}</label>
            <input
              id={`price-${item.id}`}
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="—"
              value={prices[item.id] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onChange(item.id, v === "" ? undefined : Number(v));
              }}
            />
          </li>
        ))}
        {visible.length === 0 && (
          <li className="hint">Aucun objet ne correspond à « {filter} ».</li>
        )}
      </ul>

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </section>
  );
}
