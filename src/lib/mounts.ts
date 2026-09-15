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
 * One rune obtained by brising a mount, with its catalog id (so its price comes
 * from the shared store) and the average quantity per mount.
 */
export interface RuneYield {
  itemId: string;
  label: string;
  img: string;
  quantity: number;
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

const yields = (base: { itemId: string; label: string; img: string }, quantity: number): RuneYield => ({
  ...base,
  quantity,
});

/**
 * Brisage yield per muldo (monster id → runes). Each muldo gives 1 Rune Ga Pme
 * plus its signature rune. The Ga Pme (1) and the ébène Air count (13) are
 * confirmed; the other signature-rune counts default to 13 by symmetry and are
 * editable per line on the page.
 */
const BRISAGE: Record<string, RuneYield[]> = {
  "4435": [yields(RUNE.gaPme, 1), yields(RUNE.rePerAir, 13)], // ébène → Air
  "4438": [yields(RUNE.gaPme, 1), yields(RUNE.pui, 13)], // doré → Puissance
  "4436": [yields(RUNE.gaPme, 1), yields(RUNE.rePerFeu, 13)], // orchidée → Feu
  "4437": [yields(RUNE.gaPme, 1), yields(RUNE.rePerTerre, 13)], // pourpre → Terre
  "4434": [yields(RUNE.gaPme, 1), yields(RUNE.rePerEau, 13)], // indigo → Eau
};

/** The runes a mount yields when broken (empty if unknown). */
export function brisageFor(mountId: string | undefined): RuneYield[] {
  return (mountId != null && BRISAGE[mountId]) || [];
}
