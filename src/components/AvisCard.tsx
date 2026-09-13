import { useState, type ReactNode } from "react";
import type { AvisReward } from "../lib/avis";
import { computeAvisBenefit } from "../lib/avis";
import type { PriceSource } from "../lib/priceStore";
import { formatKamas, formatKamasSigned } from "../lib/format";

interface Props {
  avis: AvisReward;
  /** Tracked price + source of the "Carte de …" you must buy. */
  cartePrice?: number;
  carteSource?: PriceSource;
  /** Set/clear the carte price by hand (null clears); absent when unresolved. */
  onCartePriceChange?: (value: number | null) => void;
  /** Tracked price + source of the resource inside the chest. */
  resourcePrice?: number;
  resourceSource?: PriceSource;
  onResourcePriceChange?: (value: number | null) => void;
  /** Value of this avis's avitons (avitons × per-aviton rate); 0 when unset. */
  avitonValue?: number;
  /** Flat fee paid to join this hunt's "spot" (per avis). */
  participationCost?: number;
  onParticipationChange?: (value: number) => void;
}

/** A small source badge: OCR / manuel / à saisir. */
function sourceTag(price: number | undefined, source: PriceSource | undefined) {
  if (price == null) return { label: "à saisir", cls: "avis-src--todo" };
  if (source === "ocr") return { label: "OCR", cls: "avis-src--ocr" };
  if (source === "manual") return { label: "manuel", cls: "" };
  return null;
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
      if (value != null) onCommit(null); // clear an existing price
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

/** One line: icon, label (+ optional source tag) + item name, and a price or input. */
function AvisLine({
  variant,
  label,
  tag,
  name,
  img,
  placeholder = "—",
  price,
  priceInput,
}: {
  variant: "cost" | "reward";
  label: string;
  tag?: { label: string; cls: string } | null;
  name?: string;
  img?: string;
  placeholder?: string;
  price?: number;
  priceInput?: ReactNode;
}) {
  return (
    <div className={`avis-line avis-line--${variant}`}>
      <div className="avis-line-icon">
        {img ? <img src={img} alt="" /> : <span aria-hidden>{placeholder}</span>}
      </div>
      <div className="avis-line-body">
        <span className="avis-line-label-row">
          <span className="avis-line-label">{label}</span>
          {tag && <span className={`avis-src ${tag.cls}`}>{tag.label}</span>}
        </span>
        <span className="avis-line-name" title={name}>
          {name ?? "Inconnu"}
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
  cartePrice,
  carteSource,
  onCartePriceChange,
  resourcePrice,
  resourceSource,
  onResourcePriceChange,
  avitonValue = 0,
  participationCost = 0,
  onParticipationChange,
}: Props) {
  const benefit = computeAvisBenefit({
    cartePrice,
    resourcePrice,
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
        <AvisLine
          variant="cost"
          label="Carte requise"
          tag={sourceTag(cartePrice, carteSource)}
          name={avis.carteName}
          img={avis.carteImg}
          priceInput={
            <PriceInput
              value={cartePrice}
              needs={cartePrice == null}
              disabled={!onCartePriceChange}
              ariaLabel={`Prix de la carte pour ${avis.name}`}
              onCommit={(v) => onCartePriceChange?.(v)}
            />
          }
        />
        <AvisLine
          variant="reward"
          label="Ressource obtenue"
          tag={sourceTag(resourcePrice, resourceSource)}
          name={avis.resourceName}
          img={avis.resourceImg}
          priceInput={
            <PriceInput
              value={resourcePrice}
              needs={resourcePrice == null}
              disabled={!onResourcePriceChange}
              ariaLabel={`Prix de la ressource pour ${avis.name}`}
              onCommit={(v) => onResourcePriceChange?.(v)}
            />
          }
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
