import { useState } from "react";

interface Props {
  value?: number;
  ariaLabel: string;
  /** Highlight as needing a value (e.g. a missing ingredient price). */
  needs?: boolean;
  disabled?: boolean;
  width?: number;
  /** Called with the new value on blur/Enter, or null when cleared. */
  onCommit: (value: number | null) => void;
}

/**
 * An editable kamas price field. Keeps a local draft while typing and only
 * writes on blur/Enter when the value actually changed — so displaying an OCR
 * price never silently rewrites it as manual. Shared by the price-editing rows
 * across the app (Avis, Craft, Métiers).
 */
export function PriceInput({
  value,
  ariaLabel,
  needs,
  disabled,
  width = 82,
  onCommit,
}: Props) {
  const stored = value != null ? String(value) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? stored;

  function commit() {
    if (draft == null) return; // untouched
    const cleaned = draft.trim().replace(/[  ]/g, "");
    setDraft(null);
    if (cleaned === "") {
      if (value != null) onCommit(null);
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== value) onCommit(n);
  }

  return (
    <span className="price-edit">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        style={{ width }}
        className={needs && !disabled ? "needs" : undefined}
        aria-label={ariaLabel}
        placeholder="—"
        value={text}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </span>
  );
}
