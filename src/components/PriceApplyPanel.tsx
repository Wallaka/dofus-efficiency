import { useEffect, useRef, useState } from "react";
import type { Item } from "../types";
import type { Lot } from "../lib/screenshotAnalysis";
import type { ApplyPrice } from "../lib/priceStore";
import { searchItems } from "../data/dofusApi";
import { rankItemMatches } from "../lib/matchItem";
import { formatKamas } from "../lib/format";
import { ItemAutocomplete } from "./ItemAutocomplete";

interface Props {
  /** The OCR'd item name (used to pre-search for a match). */
  itemName: string | null;
  /** Unit price to store, in kamas. */
  price: number;
  /** Short label of where the price came from (shown to the user). */
  detail: string;
  /** Per-quantity lot prices to keep alongside the unit price, when any. */
  lots?: Lot[];
  /** Persist the price for the chosen item. */
  onApply: ApplyPrice;
}

type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "results"; items: Item[] };

/**
 * The price feedback loop's UI: match the recognized item to a real DofusDB item
 * and store the price for it. Pre-searches the OCR'd name, ranks the candidates,
 * and lets the user confirm (or correct via a manual search).
 */
export function PriceApplyPanel({ itemName, price, detail, lots, onApply }: Props) {
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [applied, setApplied] = useState<Item | null>(null);

  // Pre-search the OCR'd name once.
  useEffect(() => {
    const q = itemName?.trim();
    if (!q || q.length < 2) return;
    const controller = new AbortController();
    setSearch({ status: "loading" });
    searchItems(q, controller.signal)
      .then((items) => {
        const ranked = rankItemMatches(q, items).map((m) => m.item);
        setSearch({ status: "results", items: ranked });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSearch({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => controller.abort();
  }, [itemName]);

  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  function apply(item: Item) {
    onApplyRef.current(item, price, detail, { lots });
    setApplied(item);
  }

  if (applied) {
    return (
      <div className="apply-panel apply-done">
        <p>
          ✓ Prix enregistré pour <strong>{applied.name}</strong> —{" "}
          {formatKamas(price)}
        </p>
        <button
          type="button"
          className="folder-secondary"
          onClick={() => setApplied(null)}
        >
          Changer d'objet
        </button>
      </div>
    );
  }

  return (
    <div className="apply-panel">
      <p className="apply-title">
        Enregistrer ce prix (<strong>{formatKamas(price)}</strong>, {detail})
        pour&nbsp;:
      </p>

      {search.status === "loading" && (
        <p className="hint">Recherche de «&nbsp;{itemName}&nbsp;»…</p>
      )}
      {search.status === "error" && (
        <p className="folder-error">Recherche indisponible : {search.message}</p>
      )}
      {search.status === "results" && search.items.length === 0 && (
        <p className="hint">Aucun objet trouvé pour «&nbsp;{itemName}&nbsp;».</p>
      )}
      {search.status === "results" && search.items.length > 0 && (
        <ul className="apply-candidates">
          {search.items.slice(0, 4).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="apply-candidate"
                onClick={() => apply(item)}
              >
                {item.img && (
                  <img src={item.img} alt="" className="autocomplete-icon" />
                )}
                <span className="autocomplete-name">{item.name}</span>
                {item.level != null && (
                  <span className="autocomplete-level">Niv. {item.level}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="hint apply-manual-hint">Ou choisissez manuellement&nbsp;:</p>
      <ItemAutocomplete onPick={apply} placeholder="Rechercher l'objet…" />
    </div>
  );
}
