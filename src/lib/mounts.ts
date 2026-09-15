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
