/**
 * Wild mounts you can capture, put in an enclos, raise and later brise. Chosen
 * at the top of the éleveur page; the selection will drive which filets apply
 * (same creature) and which runes brisage yields.
 *
 * Hardcoded from DofusDB monsters (only the capturable ones —
 * `soulCaptureForbidden: false`). Ids are DofusDB monster ids; `img` is the
 * monster sprite. `level` is the grade-1 level, informational.
 *
 * For now this covers the five wild Muldos. Dragodindes and Volkornes will be
 * added the same way.
 */

import type { FiletCreature } from "./filets";

export interface MountDef {
  /** DofusDB monster id. */
  id: string;
  /** Display name (the wild colour variant). */
  name: string;
  /** Monster sprite URL. */
  img: string;
  /** Which breeding line it belongs to (matches the filet creature). */
  creature: FiletCreature;
  /** Grade-1 level, informational. */
  level: number;
}

const MONSTER_IMG = (gfx: number) =>
  `https://api.dofusdb.fr/img/monsters/${gfx}.png`;

/** The five wild, capturable Muldos. */
export const MULDOS: MountDef[] = [
  { id: "4438", name: "Muldo doré", img: MONSTER_IMG(1409), creature: "Muldo", level: 62 },
  { id: "4437", name: "Muldo pourpre", img: MONSTER_IMG(1408), creature: "Muldo", level: 62 },
  { id: "4436", name: "Muldo orchidée", img: MONSTER_IMG(1407), creature: "Muldo", level: 62 },
  { id: "4435", name: "Muldo ébène", img: MONSTER_IMG(1406), creature: "Muldo", level: 62 },
  { id: "4434", name: "Muldo indigo", img: MONSTER_IMG(1405), creature: "Muldo", level: 62 },
];

/** All selectable mounts (Muldos for now). */
export const MOUNTS: MountDef[] = [...MULDOS];

const byId = new Map(MOUNTS.map((m) => [m.id, m]));

/** Look up a mount definition by id. */
export function mountById(id: string | undefined): MountDef | undefined {
  return id == null ? undefined : byId.get(id);
}

/**
 * One rune obtained by brising a mount. Brisage is random, so a yield is a
 * probability of obtaining the rune × a quantity range when obtained (see the
 * expected-value maths in eleveur.ts). Ids/icons come from the HDV catalog so
 * the price resolves from the shared store.
 */
export interface RuneYield {
  itemId: string;
  label: string;
  img: string;
  /** Probability (0..1) of obtaining the rune. */
  chance: number;
  /** Quantity when obtained (low / high of the range). */
  quantityMin: number;
  quantityMax: number;
}

const IMG = (icon: number) => `https://api.dofusdb.fr/img/items/${icon}.png`;

// Rune catalog entries used by muldo brisage (ids/icons from the HDV catalog).
const RUNE = {
  gaPme: { itemId: "1558", label: "Rune Ga Pme", img: IMG(78056) },
  pui: { itemId: "7436", label: "Rune Pui", img: IMG(78016) },
  rePerAir: { itemId: "7458", label: "Rune Ré Per Air", img: IMG(78033) },
  rePerFeu: { itemId: "7457", label: "Rune Ré Per Feu", img: IMG(78029) },
  rePerTerre: { itemId: "7459", label: "Rune Ré Per Terre", img: IMG(78035) },
  rePerEau: { itemId: "7560", label: "Rune Ré Per Eau", img: IMG(78031) },
} as const;

const y = (
  base: { itemId: string; label: string; img: string },
  chance: number,
  quantityMin: number,
  quantityMax: number,
): RuneYield => ({ ...base, chance, quantityMin, quantityMax });

// Every muldo: 50 % of 1 Rune Ga Pme, plus 50 % of 4–15 of its signature rune.
const GA_PME = y(RUNE.gaPme, 0.5, 1, 1);
const sig = (base: { itemId: string; label: string; img: string }) =>
  y(base, 0.5, 4, 15);

/** Brisage yield per muldo (monster id → runes). */
const BRISAGE: Record<string, RuneYield[]> = {
  "4435": [GA_PME, sig(RUNE.rePerAir)], // ébène → Air
  "4438": [GA_PME, sig(RUNE.pui)], // doré → Puissance
  "4436": [GA_PME, sig(RUNE.rePerFeu)], // orchidée → Feu
  "4437": [GA_PME, sig(RUNE.rePerTerre)], // pourpre → Terre
  "4434": [GA_PME, sig(RUNE.rePerEau)], // indigo → Eau
};

/** The runes a mount yields when broken (empty if unknown). */
export function brisageFor(mountId: string | undefined): RuneYield[] {
  return (mountId != null && BRISAGE[mountId]) || [];
}
