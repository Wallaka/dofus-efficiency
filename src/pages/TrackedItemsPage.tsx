import { useMemo, useState } from "react";
import type { Item } from "../types";
import { ItemAutocomplete } from "../components/ItemAutocomplete";
import { useFavourites } from "../lib/useFavourites";
import {
  loadPriceEntries,
  isStale,
  relativeAge,
  type PriceEntryMap,
} from "../lib/priceStore";
import { setManualPrice, clearPrice } from "../lib/trackedPrices";
import { formatDateTime } from "../lib/format";

/**
 * The "objets suivis" page: the manual counterpart to OCR. Every tracked item is
 * listed with its known price (from OCR or typed here) — and for those with no
 * price yet, an inline field to fill it by hand. Prices set here flow into the
 * same store the craft/éleveur maths read, and show up dated on the Prix page.
 */
export function TrackedItemsPage() {
  const { favourites, isFavourite, add, remove } = useFavourites();
  const [entries, setEntries] = useState<PriceEntryMap>(loadPriceEntries);
  // In-progress text per row, so typing doesn't fight the stored value.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const now = Date.now();

  const sorted = useMemo(
    () => [...favourites].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [favourites],
  );

  const knownCount = favourites.filter((f) => entries[f.id] != null).length;

  function commit(item: Item, raw: string) {
    const text = raw.trim().replace(/[  ]/g, "");
    setDrafts((d) => {
      const next = { ...d };
      delete next[item.id];
      return next;
    });
    if (text === "") {
      clearPrice(item.id);
      setEntries((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) return;
    const entry = setManualPrice(item, value);
    setEntries((prev) => ({ ...prev, [item.id]: entry }));
  }

  function untrack(item: Item) {
    remove(item.id);
    // Keep the recorded price: the item may still be crafted/sold elsewhere.
  }

  return (
    <section className="panel prices-page">
      <h2>Objets suivis</h2>
      <p className="hint">
        Les objets que vous suivez, avec leur prix quand il est connu. L'OCR le
        remplit automatiquement depuis vos captures&nbsp;; sinon, saisissez-le à
        la main ici. Le prix alimente les calculs de craft et d'élevage.
      </p>

      <ItemAutocomplete
        onPick={add}
        isPicked={isFavourite}
        placeholder="Rechercher un objet à suivre…"
      />

      {favourites.length === 0 ? (
        <p className="hint fav-empty">
          Aucun objet suivi pour l'instant. Cherchez un objet ci-dessus pour le
          suivre.
        </p>
      ) : (
        <>
          <div className="prices-summary">
            <span className="badge badge-fresh">{knownCount} avec prix</span>
            <span className="badge">
              {favourites.length - knownCount} sans prix
            </span>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Objet</th>
                  <th className="num">Prix (kamas)</th>
                  <th>Origine</th>
                  <th>Dernière maj</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const entry = entries[item.id];
                  const stale = entry ? isStale(entry.updatedAt, now) : false;
                  const draft = drafts[item.id];
                  const value =
                    draft ?? (entry?.price != null ? String(entry.price) : "");
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="price-item">
                          {item.img && (
                            <img
                              src={item.img}
                              alt=""
                              className="autocomplete-icon"
                            />
                          )}
                          <span className="item-name">{item.name}</span>
                          {item.level != null && (
                            <span className="recipe-detail">
                              Niv. {item.level}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="tracked-price-input"
                          placeholder="—"
                          value={value}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [item.id]: e.target.value,
                            }))
                          }
                          onBlur={(e) => commit(item, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          aria-label={`Prix de ${item.name}`}
                        />
                      </td>
                      <td>
                        {entry ? (
                          <>
                            {entry.source === "ocr" ? "OCR" : "Manuel"}
                            {entry.detail && (
                              <span className="recipe-detail">
                                {entry.detail}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="recipe-detail">Prix inconnu</span>
                        )}
                      </td>
                      <td
                        title={entry ? formatDateTime(entry.updatedAt) : undefined}
                      >
                        {entry ? (
                          <span
                            className={`badge ${stale ? "badge-stale" : "badge-fresh"}`}
                          >
                            {relativeAge(entry.updatedAt, now)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="folder-secondary price-del"
                          onClick={() => untrack(item)}
                          aria-label={`Ne plus suivre ${item.name}`}
                          title="Retirer des suivis"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Astuce&nbsp;: retirer un objet des suivis ne supprime pas son prix
            enregistré (voir la page Prix).
          </p>
        </>
      )}
    </section>
  );
}
