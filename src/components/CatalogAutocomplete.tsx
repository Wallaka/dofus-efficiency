import { useMemo, useRef, useState } from "react";
import { searchCatalog, type CatalogItem } from "../data/catalog";

interface Props {
  onPick: (item: CatalogItem) => void;
  /** Marks results already added, so the list can show a checkmark. */
  isPicked?: (id: string) => boolean;
  placeholder?: string;
}

/**
 * Type-ahead search over the bundled, offline HDV catalog (no network) — the
 * counterpart to ItemAutocomplete, which hits DofusDB. Picking an item calls
 * `onPick`. Used where the choice should come from the local catalog.
 */
export function CatalogAutocomplete({ onPick, isPicked, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => searchCatalog(query, 12), [query]);
  const q = query.trim();

  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  function pick(item: CatalogItem) {
    pickRef.current(item);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="autocomplete">
      <input
        type="search"
        className="autocomplete-input"
        placeholder={placeholder ?? "Rechercher une ressource…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="Rechercher une ressource dans le catalogue"
      />

      {open && q.length >= 2 && (
        <div className="autocomplete-panel">
          {results.length === 0 ? (
            <p className="autocomplete-msg">Aucun résultat.</p>
          ) : (
            <ul className="autocomplete-list">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="autocomplete-option"
                    onClick={() => pick(item)}
                    title={
                      item.level != null
                        ? `${item.name} (Niv. ${item.level})`
                        : item.name
                    }
                  >
                    {item.img && (
                      <img src={item.img} alt="" className="autocomplete-icon" />
                    )}
                    <span className="autocomplete-name">{item.name}</span>
                    {item.level != null && (
                      <span className="autocomplete-level">Niv. {item.level}</span>
                    )}
                    {isPicked?.(item.id) && (
                      <span className="autocomplete-check" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
