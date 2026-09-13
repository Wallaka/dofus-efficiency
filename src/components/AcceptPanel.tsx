import { useEffect, useState } from "react";
import type { Item } from "../types";
import { formatKamas } from "../lib/format";
import { searchItems } from "../data/dofusApi";
import { rankItemMatches } from "../lib/matchItem";
import { ItemAutocomplete } from "./ItemAutocomplete";

interface Props {
  /** Unit price that will be stored. */
  price: number;
  /** Short label of where the price came from. */
  detail: string;
  /** OCR'd item name, for a live search fallback when no candidates were found. */
  itemName: string | null;
  /** Ranked matches found during analysis (best first) — shown for one-click accept. */
  candidates?: Item[];
  /** The item this reading was already accepted to, if any. */
  savedItem?: Item | null;
  /** Commit the price to the chosen item. */
  onAccept: (item: Item) => void;
}

type Live =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "results"; items: Item[] };

/**
 * The accept step under a screenshot's reading: pick the item in one click from
 * the matches found during analysis — no typing. If analysis found none (it was
 * offline, say) we search the name live on demand; a manual search is always
 * there as a fallback. Once accepted it shows what was saved.
 */
export function AcceptPanel({
  price,
  detail,
  itemName,
  candidates,
  savedItem,
  onAccept,
}: Props) {
  const [changing, setChanging] = useState(false);
  const [live, setLive] = useState<Live>({ status: "idle" });

  const hasStored = (candidates?.length ?? 0) > 0;
  const showAccept = !savedItem || changing;

  // Fallback: if analysis stored no candidates but we have a name, search it
  // once when this card's accept step is shown.
  useEffect(() => {
    if (!showAccept || hasStored) return;
    const q = itemName?.trim();
    if (!q || q.length < 2) return;
    const controller = new AbortController();
    setLive({ status: "loading" });
    searchItems(q, controller.signal)
      .then((items) => {
        const ranked = rankItemMatches(q, items)
          .slice(0, 5)
          .map((m) => m.item);
        setLive({ status: "results", items: ranked });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLive({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => controller.abort();
  }, [showAccept, hasStored, itemName]);

  if (savedItem && !changing) {
    return (
      <div className="accept-panel accept-done">
        <p>
          ✓ Enregistré pour <strong>{savedItem.name}</strong> — {formatKamas(price)}
        </p>
        <button
          type="button"
          className="folder-secondary"
          onClick={() => setChanging(true)}
        >
          Changer d'objet
        </button>
      </div>
    );
  }

  const shown: Item[] = hasStored
    ? candidates!
    : live.status === "results"
      ? live.items
      : [];

  return (
    <div className="accept-panel">
      <p className="accept-title">
        Enregistrer <strong>{formatKamas(price)}</strong> ({detail}) pour&nbsp;:
      </p>

      {!hasStored && live.status === "loading" && (
        <p className="hint">Recherche de «&nbsp;{itemName}&nbsp;»…</p>
      )}
      {!hasStored && live.status === "error" && (
        <p className="folder-error">Recherche indisponible : {live.message}</p>
      )}

      {shown.length > 0 && (
        <ul className="apply-candidates">
          {shown.slice(0, 4).map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={`apply-candidate${i === 0 ? " accept-best" : ""}`}
                onClick={() => onAccept(item)}
              >
                {item.img && (
                  <img src={item.img} alt="" className="autocomplete-icon" />
                )}
                <span className="autocomplete-name">{item.name}</span>
                {item.level != null && (
                  <span className="autocomplete-level">Niv. {item.level}</span>
                )}
                <span className="accept-check" aria-hidden>
                  Accepter ✓
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown.length === 0 && (hasStored || live.status === "results") && (
        <p className="hint">
          Aucune correspondance pour «&nbsp;{itemName ?? "?"}&nbsp;».
        </p>
      )}

      <p className="hint apply-manual-hint">Ou choisissez un autre objet&nbsp;:</p>
      <ItemAutocomplete onPick={onAccept} placeholder="Rechercher l'objet…" />
    </div>
  );
}
