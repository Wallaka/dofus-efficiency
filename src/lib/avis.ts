import type { Item, PriceMap } from "../types";

/**
 * "Avis de recherche" — legendary-hunt wanted notices.
 *
 * Each one rewards avitons + a chest resource, costs a "carte" to trigger the
 * chasse légendaire, and can optionally be sold as paid spots. This models one
 * notice and computes its kamas benefit, pricing the resource and carte from
 * the shared price map (so OCR'd HDV prices flow straight in).
 */
export interface AvisDeRecherche {
  id: string;
  /** Label — the notice / target name. */
  name: string;
  /** Aviton reward count. */
  avitons?: number;

  /** Chest resource reward (tracked item, priced from the shared map). */
  resourceItemId?: string;
  resourceName?: string;
  resourceImg?: string;
  resourceQty?: number;

  /** The carte/map that triggers the chasse (tracked item). */
  carteItemId?: string;
  carteName?: string;
  carteImg?: string;

  /** Optional paid spots: how many, and kamas each. */
  spots?: number;
  pricePerSpot?: number;
}

/** Persisted state for the whole page. */
export interface AvisState {
  list: AvisDeRecherche[];
  /** Optional kamas value of one aviton, to fold avitons into the benefit. */
  avitonValue?: number;
}

export interface AvisResult {
  resourceValue: number;
  carteCost: number;
  spotIncome: number;
  /** resourceValue + spotIncome − carteCost. */
  kamasBenefit: number;
  avitons: number;
  /** kamasBenefit + avitons × avitonValue, when an aviton value is set. */
  benefitWithAvitons?: number;
  /** Priced item is referenced but has no known price. */
  missingResourcePrice: boolean;
  missingCartePrice: boolean;
}

export function computeAvis(
  avis: AvisDeRecherche,
  prices: PriceMap,
  avitonValue?: number,
): AvisResult {
  const resourcePrice =
    avis.resourceItemId != null ? prices[avis.resourceItemId] : undefined;
  const cartePrice =
    avis.carteItemId != null ? prices[avis.carteItemId] : undefined;

  const resourceValue =
    resourcePrice != null ? resourcePrice * (avis.resourceQty ?? 1) : 0;
  const carteCost = cartePrice ?? 0;
  const spotIncome = (avis.spots ?? 0) * (avis.pricePerSpot ?? 0);
  const kamasBenefit = resourceValue + spotIncome - carteCost;
  const avitons = avis.avitons ?? 0;

  return {
    resourceValue,
    carteCost,
    spotIncome,
    kamasBenefit,
    avitons,
    benefitWithAvitons:
      avitonValue != null ? kamasBenefit + avitons * avitonValue : undefined,
    missingResourcePrice: avis.resourceItemId != null && resourcePrice == null,
    missingCartePrice: avis.carteItemId != null && cartePrice == null,
  };
}

export interface AvisTotals {
  kamasBenefit: number;
  avitons: number;
  benefitWithAvitons?: number;
}

export function computeAvisTotals(
  list: AvisDeRecherche[],
  prices: PriceMap,
  avitonValue?: number,
): AvisTotals {
  let kamasBenefit = 0;
  let avitons = 0;
  let benefitWithAvitons = avitonValue != null ? 0 : undefined;

  for (const avis of list) {
    const r = computeAvis(avis, prices, avitonValue);
    kamasBenefit += r.kamasBenefit;
    avitons += r.avitons;
    if (benefitWithAvitons != null && r.benefitWithAvitons != null) {
      benefitWithAvitons += r.benefitWithAvitons;
    }
  }

  return { kamasBenefit, avitons, benefitWithAvitons };
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `avis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newAvis(name = ""): AvisDeRecherche {
  return { id: makeId(), name, resourceQty: 1 };
}

/** A minimal Item rebuilt from an avis's stored resource fields (for pricing). */
export function resourceItem(avis: AvisDeRecherche): Item | null {
  if (avis.resourceItemId == null) return null;
  return {
    id: avis.resourceItemId,
    name: avis.resourceName ?? avis.resourceItemId,
    img: avis.resourceImg,
  };
}

/** A minimal Item rebuilt from an avis's stored carte fields (for pricing). */
export function carteItem(avis: AvisDeRecherche): Item | null {
  if (avis.carteItemId == null) return null;
  return {
    id: avis.carteItemId,
    name: avis.carteName ?? avis.carteItemId,
    img: avis.carteImg,
  };
}
