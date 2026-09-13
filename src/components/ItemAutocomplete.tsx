import { useEffect, useRef, useState } from "react";
import type { Item } from "../types";
import { searchItems } from "../data/dofusApi";

interface Props {
  onPick: (item: Item) => void;
  /** Marks results already tracked, so the list can show a checkmark. */
  isPicked?: (id: string) => boolean;
  placeholder?: string;
  /** Seed the search box (and auto-run the search) with this text. */
  initialQuery?: string;
  /** Focus the input on mount. */
  autoFocus?: boolean;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "results"; items: Item[] };

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

/** Type-ahead search over DofusDB items; picking one calls `onPick`. */
export function ItemAutocomplete({
  onPick,
  isPicked,
  placeholder,
  initialQuery,
  autoFocus,
}: Props) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const items = await searchItems(q, controller.signal);
        setState({ status: "results", items });
        setOpen(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        setOpen(true);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  function pick(item: Item) {
    pickRef.current(item);
    setQuery("");
    setState({ status: "idle" });
    setOpen(false);
  }

  return (
    <div className="autocomplete">
      <input
        type="search"
        className="autocomplete-input"
        placeholder={placeholder ?? "Rechercher un objet…"}
        value={query}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        aria-label="Rechercher un objet"
      />

      {open && state.status !== "idle" && (
        <div className="autocomplete-panel">
          {state.status === "loading" && (
            <p className="autocomplete-msg">Recherche…</p>
          )}
          {state.status === "error" && (
            <p className="autocomplete-msg error-text">
              Erreur : {state.message}
            </p>
          )}
          {state.status === "results" && state.items.length === 0 && (
            <p className="autocomplete-msg">Aucun résultat.</p>
          )}
          {state.status === "results" && state.items.length > 0 && (
            <ul className="autocomplete-list">
              {state.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="autocomplete-option"
                    onClick={() => pick(item)}
                    title={item.level != null ? `${item.name} (Niv. ${item.level})` : item.name}
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
