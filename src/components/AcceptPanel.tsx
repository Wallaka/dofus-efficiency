import { useState } from "react";
import type { Item } from "../types";
import { formatKamas } from "../lib/format";
import { ItemAutocomplete } from "./ItemAutocomplete";

interface Props {
  /** Unit price that will be stored. */
  price: number;
  /** Short label of where the price came from. */
  detail: string;
  /** Best-guess item from the OCR'd name (pre-filled for one-click accept). */
  suggested?: Item | null;
  /** The item this reading was already accepted to, if any. */
  savedItem?: Item | null;
  /** Commit the price to the chosen item. */
  onAccept: (item: Item) => void;
}

/**
 * The accept step, shown under a screenshot's reading: confirm the price against
 * the suggested item in one click, or pick another. Uses the match already found
 * during analysis, so opening the card fires no extra search. Once accepted it
 * shows what was saved and lets the user re-accept to a different item.
 */
export function AcceptPanel({ price, detail, suggested, savedItem, onAccept }: Props) {
  const [changing, setChanging] = useState(false);

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

  return (
    <div className="accept-panel">
      <p className="accept-title">
        Enregistrer <strong>{formatKamas(price)}</strong> ({detail}) pour&nbsp;:
      </p>

      {suggested && (
        <button
          type="button"
          className="apply-candidate accept-suggested"
          onClick={() => onAccept(suggested)}
        >
          {suggested.img && (
            <img src={suggested.img} alt="" className="autocomplete-icon" />
          )}
          <span className="autocomplete-name">{suggested.name}</span>
          {suggested.level != null && (
            <span className="autocomplete-level">Niv. {suggested.level}</span>
          )}
          <span className="accept-check" aria-hidden>
            Accepter ✓
          </span>
        </button>
      )}

      <p className="hint apply-manual-hint">
        {suggested ? "Ou choisissez un autre objet :" : "Choisissez l'objet :"}
      </p>
      <ItemAutocomplete onPick={onAccept} placeholder="Rechercher l'objet…" />
    </div>
  );
}
