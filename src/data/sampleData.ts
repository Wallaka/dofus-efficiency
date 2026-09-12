import type { Item, Recipe } from "../types";

/**
 * Bundled SAMPLE data so Phase 0 works fully offline and proves the calculator
 * before we wire up the live DofusDB API (see src/data/dofusApi.ts).
 *
 * These names are Dofus-flavoured but the recipes are illustrative, NOT verified
 * against the real game. Once the DofusDB adapter is mapped, real items/recipes
 * replace this.
 */

export const SAMPLE_ITEMS: Item[] = [
  { id: "ble", name: "Blé", level: 1 },
  { id: "eau", name: "Eau", level: 1 },
  { id: "farine", name: "Farine", level: 1 },
  { id: "pain", name: "Pain", level: 1 },
  { id: "cereales", name: "Céréales", level: 20 },
  { id: "pain_complet", name: "Pain complet", level: 20 },
  { id: "ortie", name: "Ortie", level: 1 },
  { id: "potion_rappel", name: "Potion de rappel", level: 1 },
];

export const SAMPLE_RECIPES: Recipe[] = [
  {
    id: "r-farine",
    resultItemId: "farine",
    job: "Paysan",
    ingredients: [{ itemId: "ble", quantity: 3 }],
  },
  {
    id: "r-pain",
    resultItemId: "pain",
    job: "Boulanger",
    ingredients: [
      { itemId: "farine", quantity: 3 },
      { itemId: "eau", quantity: 1 },
    ],
  },
  {
    id: "r-pain-complet",
    resultItemId: "pain_complet",
    job: "Boulanger",
    ingredients: [
      { itemId: "cereales", quantity: 3 },
      { itemId: "farine", quantity: 2 },
      { itemId: "eau", quantity: 1 },
    ],
  },
  {
    id: "r-potion-rappel",
    resultItemId: "potion_rappel",
    job: "Alchimiste",
    ingredients: [{ itemId: "ortie", quantity: 3 }],
  },
];

/**
 * Some plausible starting prices (kamas) so the app shows something meaningful
 * on first load. Users overwrite these with real HDV prices. Purely a demo seed.
 */
export const SAMPLE_PRICES: Record<string, number> = {
  ble: 2,
  eau: 1,
  farine: 10,
  pain: 40,
  cereales: 5,
  pain_complet: 60,
  ortie: 3,
  potion_rappel: 15,
};
