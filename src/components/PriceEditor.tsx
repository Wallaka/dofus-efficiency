import type { Item, PriceMap } from "../types";

interface Props {
  items: Item[];
  prices: PriceMap;
  onChange: (itemId: string, price: number | undefined) => void;
}

/**
 * The editable list of HDV unit prices — the "dynamic data" a user keeps
 * current. In Phase 1 these same values get auto-filled from OCR'd screenshots
 * instead of typed here.
 */
export function PriceEditor({ items, prices, onChange }: Props) {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <section className="panel">
      <h2>Prix HDV (kamas / unité)</h2>
      <p className="hint">
        Entrez le prix unitaire vu à l'HDV. Ces valeurs seront un jour remplies
        automatiquement depuis vos captures Medal.
      </p>
      <ul className="price-list">
        {sorted.map((item) => (
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
      </ul>
    </section>
  );
}
