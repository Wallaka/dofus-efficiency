import { useState, type ReactNode } from "react";
import type { AvisReward } from "../lib/avis";
import {
  computeAvisBenefit,
  questCriminalName,
  type AvisBenefit,
} from "../lib/avis";
import type { Item } from "../types";
import type { PriceSource } from "../lib/priceStore";
import { formatKamas, formatKamasSigned } from "../lib/format";
import { ItemAutocomplete } from "./ItemAutocomplete";
import { CopyName } from "./CopyName";

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

/** A priced ingredient of the carte's craft recipe. */
export interface CarteCraftIngredient {
  item: Item;
  quantity: number;
  price?: number;
}

/** The "craft the carte instead of buying it" option for one avis. */
export interface CarteCraft {
  /** idle: not fetched yet · ok: recipe loaded · none: not craftable. */
  status: "idle" | "loading" | "error" | "none" | "ok";
  ingredients?: CarteCraftIngredient[];
  /** Total craft cost when every ingredient price is known; else undefined. */
  cost?: number;
  /** Fetch the recipe (called on first expand). */
  onExpand: () => void;
  /** Edit an ingredient's price (writes the shared store). */
  onIngredientPrice: (item: Item, value: number | null) => void;
}

interface Props {
  avis: AvisReward;
  carte: AvisSlot;
  resource: AvisSlot;
  /** Buy-vs-craft option for the carte; absent when the carte isn't resolved. */
  carteCraft?: CarteCraft;
  /** Effective aviton count to show (already halved when done via chasse alone). */
  avitons?: number;
  /** Value of this avis's avitons (avitons × per-aviton rate); 0 when unset. */
  avitonValue?: number;
  /** Flat fee paid to join this hunt's "spot" (per avis). */
  participationCost?: number;
  onParticipationChange?: (value: number) => void;
  /** Whether this avis is starred as a favourite (one the user runs often). */
  favourite?: boolean;
  /** Toggle this avis's favourite state. */
  onToggleFavourite?: () => void;
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
  extra,
  below,
}: {
  variant: "cost" | "reward";
  label: string;
  avisName: string;
  slot: AvisSlot;
  /** Extra controls in the label row (e.g. the carte's "⚒ craft" toggle). */
  extra?: ReactNode;
  /** Content rendered right under the line (e.g. the craft breakdown). */
  below?: ReactNode;
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
            initialQuery={questCriminalName(avisName)}
            autoFocus
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
    <>
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
            {extra}
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
      {below}
    </>
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

/** The carte's craft recipe: editable ingredient prices + a craft-cost total. */
function CarteCraftPanel({ craft }: { craft: CarteCraft }) {
  if (craft.status === "loading") {
    return (
      <div className="avis-cardcraft">
        <span className="hint">Chargement de la recette…</span>
      </div>
    );
  }
  if (craft.status === "error") {
    return (
      <div className="avis-cardcraft">
        <span className="hint error-text">Recette indisponible.</span>
      </div>
    );
  }
  if (craft.status === "none") {
    return (
      <div className="avis-cardcraft">
        <span className="hint">Cette carte n'est pas craftable.</span>
      </div>
    );
  }
  const ings = craft.ingredients ?? [];
  return (
    <div className="avis-cardcraft">
      <div className="avis-cardcraft-h">⚒ Craft de la carte — recette DofusDB</div>
      {ings.map((ing) => (
        <div className="avis-ci" key={ing.item.id}>
          <span className="avis-ci-namewrap">
            <span className="avis-ci-name" title={ing.item.name}>
              {ing.item.name} <span className="avis-ci-q">×{ing.quantity}</span>
            </span>
            <CopyName text={ing.item.name} />
          </span>
          <PriceInput
            value={ing.price}
            needs={ing.price == null}
            ariaLabel={`Prix unitaire de ${ing.item.name}`}
            onCommit={(v) => craft.onIngredientPrice(ing.item, v)}
          />
          <span
            className={`avis-ci-sub${ing.price == null ? " missing" : ""}`}
          >
            {ing.price != null ? formatKamas(ing.price * ing.quantity) : "prix ?"}
          </span>
        </div>
      ))}
      <div className="avis-cardcraft-tot">
        <span className="hint">Coût de craft de la carte</span>
        <b>{craft.cost != null ? formatKamas(craft.cost) : "prix ?"}</b>
      </div>
    </div>
  );
}

/** One avis de recherche: picture, name, level, avitons + carte cost / resource + aviton reward / benefit. */
export function AvisCard({
  avis,
  carte,
  resource,
  carteCraft,
  avitons = avis.avitons,
  avitonValue = 0,
  participationCost = 0,
  onParticipationChange,
  favourite = false,
  onToggleFavourite,
}: Props) {
  const [showCraft, setShowCraft] = useState(false);

  const benefit = computeAvisBenefit({
    cartePrice: carte.price,
    resourcePrice: resource.price,
    avitonValue,
    participationCost,
  });
  const craftCost = carteCraft?.cost;
  const craftBenefit =
    craftCost != null
      ? computeAvisBenefit({
          cartePrice: craftCost,
          resourcePrice: resource.price,
          avitonValue,
          participationCost,
        })
      : null;

  // Craft is the cheaper carte source when its cost is known and below the buy price.
  const craftCheaper =
    craftCost != null && carte.price != null && craftCost < carte.price;
  // Which benefit to highlight (higher is better; craft wins ties).
  const craftIsBest =
    craftBenefit != null &&
    (benefit.value == null ||
      (craftBenefit.value ?? -Infinity) >= (benefit.value ?? -Infinity));

  const benefitClass = (b: AvisBenefit | null) =>
    !b || b.value == null
      ? ""
      : b.value > 0
        ? "avis-benefit--positive"
        : b.value < 0
          ? "avis-benefit--negative"
          : "";
  const benefitText = (b: AvisBenefit) =>
    b.known
      ? `${b.partial ? "≈ " : ""}${formatKamasSigned(b.value)}`
      : "—";

  return (
    <li className={`avis-card${favourite ? " avis-card--fav" : ""}`}>
      {onToggleFavourite && (
        <button
          type="button"
          className={`avis-fav-star${favourite ? " on" : ""}`}
          aria-pressed={favourite}
          aria-label={
            favourite ? "Retirer des favoris" : "Ajouter aux favoris"
          }
          title={favourite ? "Retirer des favoris" : "Ajouter aux favoris"}
          onClick={onToggleFavourite}
        >
          {favourite ? "★" : "☆"}
        </button>
      )}
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
            <span className="avis-avitons">{avitons} avitons</span>
          </div>
        </div>
      </header>

      <div className="avis-lines">
        <EditableItemLine
          variant="cost"
          label="Carte requise"
          avisName={avis.name}
          slot={carte}
          extra={
            carteCraft && carte.item ? (
              <>
                {craftCheaper && (
                  <span className="avis-cheap-badge">
                    craft −{formatKamas(carte.price! - craftCost!)}
                  </span>
                )}
                <button
                  type="button"
                  className="avis-craft-toggle"
                  aria-expanded={showCraft}
                  onClick={() => {
                    const next = !showCraft;
                    setShowCraft(next);
                    if (next) carteCraft.onExpand();
                  }}
                >
                  ⚒ craft {showCraft ? "▲" : "▼"}
                </button>
              </>
            ) : undefined
          }
          below={
            carteCraft && carte.item && showCraft ? (
              <CarteCraftPanel craft={carteCraft} />
            ) : undefined
          }
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
            name={`${avitons} avitons`}
            placeholder="🪙"
            price={avitonValue}
          />
        )}
        <AvisLine
          variant="reward"
          label="Participation (spot)"
          name="Reçu du groupe"
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
            </span>
          }
        />
      </div>

      {craftBenefit ? (
        <footer className="avis-benefit2">
          <div className={`avis-b2row ${craftIsBest ? "dim" : "best"}`}>
            <span className="avis-b2lab">
              Bénéfice · carte achetée
              {!craftIsBest && <span className="avis-best-badge">meilleur</span>}
            </span>
            <span className={`avis-b2val ${benefitClass(benefit)}`}>
              {benefitText(benefit)}
            </span>
          </div>
          <div className={`avis-b2row ${craftIsBest ? "best" : "dim"}`}>
            <span className="avis-b2lab">
              Bénéfice · carte craftée
              {craftIsBest && <span className="avis-best-badge">meilleur</span>}
            </span>
            <span className={`avis-b2val ${benefitClass(craftBenefit)}`}>
              {benefitText(craftBenefit)}
            </span>
          </div>
        </footer>
      ) : (
        <footer
          className={`avis-benefit ${benefitClass(benefit)}`}
          title={
            benefit.partial
              ? "Bénéfice = ressource + avitons + participation − carte. Estimation : un prix manque (compté à 0)."
              : "Bénéfice = ressource + avitons + participation − carte."
          }
        >
          <span className="avis-benefit-label">
            Bénéfice
            {benefit.partial && (
              <span className="avis-benefit-partial"> · estimé</span>
            )}
          </span>
          <span className="avis-benefit-value">{benefitText(benefit)}</span>
        </footer>
      )}
    </li>
  );
}
