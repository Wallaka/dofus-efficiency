import { useState, type ReactNode } from "react";
import type { AvisReward } from "../lib/avis";
import { computeAvisBenefit } from "../lib/avis";
import type { Item } from "../types";
import type { PriceSource } from "../lib/priceStore";
import { formatKamas, formatKamasSigned } from "../lib/format";
import { ItemAutocomplete } from "./ItemAutocomplete";

/** Everything a carte/resource line needs: the resolved item, its price, and edit hooks. */
export interface AvisSlot {
  /** Effective item (manual override, else auto-detected); undefined if neither. */
  item?: Item;
  price?: number;
  source?: PriceSource;
  /** True when the item was pinned by hand rather than auto-detected. */
  overridden: boolean;
  /** Pin a searched item as the correct one for this avis. */
  onPick: (item: Item) => void;
  /** Drop the manual override, back to auto-detection. */
  onRevert: () => void;
  /** Set/clear this item's price by hand (null clears). */
  onPriceChange: (value: number | null) => void;
}

interface Props {
  avis: AvisReward;
  carte: AvisSlot;
  resource: AvisSlot;
  /** Value of this avis's avitons (avitons × per-aviton rate); 0 when unset. */
  avitonValue?: number;
  /** Flat fee paid to join this hunt's "spot" (per avis). */
  participationCost?: number;
  onParticipationChange?: (value: number) => void;
}

/**
 * An editable price field. Keeps a local draft while typing and only writes on
 * blur/Enter when the value actually changed — so showing an OCR price never
 * silently rewrites it as manual.
 */
function PriceInput({
  value,
  ariaLabel,
  needs,
  disabled,
  onCommit,
}: {
  value?: number;
  ariaLabel: string;
  needs?: boolean;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
}) {
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
    <span className="avis-line-price avis-line-price-edit">
      <input
        type="number"
        min={0}
        inputMode="numeric"
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
      />
      <span className="avis-line-unit">k</span>
    </span>
  );
}

/**
 * A carte/resource line whose icon is a button: clicking it opens an item search
 * so a wrong or missing auto-detection can be corrected by hand.
 */
function EditableItemLine({
  variant,
  label,
  avisName,
  slot,
}: {
  variant: "cost" | "reward";
  label: string;
  avisName: string;
  slot: AvisSlot;
}) {
  const [editing, setEditing] = useState(false);

  const tag = slot.overridden
    ? { label: "corrigé", cls: "avis-src--fix" }
    : !slot.item
      ? { label: "introuvable", cls: "avis-src--todo" }
      : slot.price == null
        ? { label: "à saisir", cls: "avis-src--todo" }
        : slot.source === "ocr"
          ? { label: "OCR", cls: "avis-src--ocr" }
          : slot.source === "manual"
            ? { label: "manuel", cls: "" }
            : null;

  const iconInner = slot.item?.img ? (
    <img src={slot.item.img} alt="" />
  ) : (
    <span aria-hidden>—</span>
  );

  if (editing) {
    return (
      <div className={`avis-line avis-line--${variant} avis-line--editing`}>
        <button
          type="button"
          className="avis-line-icon avis-icon-btn active"
          onClick={() => setEditing(false)}
          aria-label="Fermer la recherche"
        >
          {iconInner}
        </button>
        <div className="avis-line-edit">
          <ItemAutocomplete
            placeholder={`Rechercher : ${label.toLowerCase()}…`}
            onPick={(item) => {
              slot.onPick(item);
              setEditing(false);
            }}
          />
        </div>
        <button
          type="button"
          className="avis-edit-cancel"
          onClick={() => setEditing(false)}
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className={`avis-line avis-line--${variant}`}>
      <button
        type="button"
        className="avis-line-icon avis-icon-btn"
        onClick={() => setEditing(true)}
        aria-label={`Corriger l'objet (${label})`}
        title="Corriger l'objet"
      >
        {iconInner}
        <span className="avis-icon-pen" aria-hidden>
          ✎
        </span>
      </button>
      <div className="avis-line-body">
        <span className="avis-line-label-row">
          <span className="avis-line-label">{label}</span>
          {tag && <span className={`avis-src ${tag.cls}`}>{tag.label}</span>}
          {slot.overridden && (
            <button
              type="button"
              className="avis-revert"
              onClick={slot.onRevert}
              title="Revenir à la détection automatique"
            >
              ↺ auto
            </button>
          )}
        </span>
        <span className="avis-line-name" title={slot.item?.name}>
          {slot.item?.name ?? "Inconnu"}
        </span>
      </div>
      <PriceInput
        value={slot.price}
        needs={slot.price == null}
        disabled={!slot.item}
        ariaLabel={`Prix (${label}) pour ${avisName}`}
        onCommit={slot.onPriceChange}
      />
    </div>
  );
}

/** One line: icon, label + item name, and a static price (for the aviton/participation rows). */
function AvisLine({
  variant,
  label,
  name,
  placeholder = "—",
  price,
  priceInput,
}: {
  variant: "cost" | "reward";
  label: string;
  name?: string;
  placeholder?: string;
  price?: number;
  priceInput?: ReactNode;
}) {
  return (
    <div className={`avis-line avis-line--${variant}`}>
      <div className="avis-line-icon">
        <span aria-hidden>{placeholder}</span>
      </div>
      <div className="avis-line-body">
        <span className="avis-line-label">{label}</span>
        <span className="avis-line-name" title={name}>
          {name}
        </span>
      </div>
      {priceInput ?? (
        <span className="avis-line-price">
          {price != null ? formatKamas(price) : "—"}
        </span>
      )}
    </div>
  );
}

/** One avis de recherche: picture, name, level, avitons + carte cost / resource + aviton reward / benefit. */
export function AvisCard({
  avis,
  carte,
  resource,
  avitonValue = 0,
  participationCost = 0,
  onParticipationChange,
}: Props) {
  const benefit = computeAvisBenefit({
    cartePrice: carte.price,
    resourcePrice: resource.price,
    avitonValue,
    participationCost,
  });
  const benefitClass =
    benefit.value == null
      ? ""
      : benefit.value > 0
        ? "avis-benefit--positive"
        : benefit.value < 0
          ? "avis-benefit--negative"
          : "";

  return (
    <li className="avis-card">
      <header className="avis-head">
        <div className="avis-thumb">
          {avis.img ? (
            <img src={avis.img} alt="" />
          ) : (
            <span className="avis-thumb-placeholder" aria-hidden>
              🗺️
            </span>
          )}
        </div>
        <div className="avis-info">
          <span className="avis-name" title={avis.name}>
            {avis.name}
          </span>
          <div className="avis-tags">
            {avis.level != null && (
              <span className="avis-level">Niv. {avis.level}</span>
            )}
            <span className="avis-avitons">{avis.avitons} avitons</span>
          </div>
        </div>
      </header>

      <div className="avis-lines">
        <EditableItemLine
          variant="cost"
          label="Carte requise"
          avisName={avis.name}
          slot={carte}
        />
        <EditableItemLine
          variant="reward"
          label="Ressource obtenue"
          avisName={avis.name}
          slot={resource}
        />
        {avitonValue > 0 && (
          <AvisLine
            variant="reward"
            label="Avitons"
            name={`${avis.avitons} avitons`}
            placeholder="🪙"
            price={avitonValue}
          />
        )}
        <AvisLine
          variant="cost"
          label="Participation (spot)"
          name="Frais pour ce spot"
          placeholder="🎟️"
          priceInput={
            <span className="avis-line-price avis-line-price-edit">
              <input
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                aria-label={`Participation pour ${avis.name}`}
                value={participationCost || ""}
                placeholder="0"
                onChange={(e) =>
                  onParticipationChange?.(
                    Math.max(0, Math.round(Number(e.target.value) || 0)),
                  )
                }
              />
              <span className="avis-line-unit">k</span>
            </span>
          }
        />
      </div>

      <footer
        className={`avis-benefit ${benefitClass}`}
        title="Bénéfice = ressource + avitons − carte − participation."
      >
        <span className="avis-benefit-label">Bénéfice</span>
        <span className="avis-benefit-value">
          {benefit.complete ? formatKamasSigned(benefit.value) : "—"}
        </span>
      </footer>
    </li>
  );
}
