import { useMemo, useState } from "react";
import type { Item, PriceMap } from "../types";

interface Props {
  items: Item[];
  prices: PriceMap;
  onChange: (itemId: string, price: number | undefined) => void;
}

/**
 * The editable list of HDV unit prices — the "dynamic data" a user keeps
 * current. In Phase 1 these same values get auto-filled from OCR'd screenshots
 * instead of typed here. A filter keeps it usable when a DofusDB dataset brings
 * in many items.
 */
export function PriceEditor({ items, prices, onChange }: Props) {
  const [filter, setFilter] = useState("");

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [items],
  );

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((i) => i.name.toLowerCase().includes(q));
  }, [sorted, filter]);

  return (
    <section className="panel">
      <h2>Prix HDV (kamas / unité)</h2>
      <p className="hint">
        Entrez le prix unitaire vu à l'HDV. Ces valeurs seront un jour remplies
        automatiquement depuis vos captures Medal.
      </p>

      {items.length > 12 && (
        <input
          type="search"
          className="price-filter"
          placeholder={`Filtrer ${items.length} objets…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <ul className="price-list">
        {visible.map((item) => (
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
    </section>
  );
}
