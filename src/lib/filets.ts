/**
 * Capture nets ("filets de capture") for wild mounts, hardcoded from DofusDB
 * (item type 99). The API exposes each filet's id, name, level and icon, but
 * NOT how many mounts it yields per capture. That behaviour is set here from the
 * item description and the user's in-game observation:
 *  - universel: 1 mount.
 *  - multiplicateur: duplicates → 2 mounts.
 *  - « à … renforcé »: captures a whole cercle-3 zone → 1 to 5 mounts.
 *  - multiplicateur renforcé: same 1–5, each duplicated → 2 to 10 mounts.
 * Deterministic filets have `mountsMin === mountsMax`; the variable ones carry a
 * real range, which the page turns into a worst/best-case profit spread. Both
 * bounds stay editable in the UI.
 *
 * `level` is the DofusDB item level, treated as the éleveur level required to
 * use the filet — which is what the level-filtered picker keys off.
 */

export type FiletCreature = "Universel" | "Dragodinde" | "Volkorne" | "Muldo";

export interface FiletDef {
  /** DofusDB item id (as a string, matching the shared price map keys). */
  id: string;
  /** French name. */
  name: string;
  /** Éleveur level required to use it (from the DofusDB item level). */
  level: number;
  /** Icon URL. */
  img: string;
  /** Which wild mount it targets ("Universel" = any). */
  creature: FiletCreature;
  /** Fewest mounts obtained per capture. */
  mountsMin: number;
  /** Most mounts obtained per capture (=== min when deterministic). */
  mountsMax: number;
}

const IMG = (icon: number) => `https://api.dofusdb.fr/img/items/${icon}.png`;

export const FILETS: FiletDef[] = [
  {
    id: "32521",
    name: "Filet de capture universel",
    level: 1,
    img: IMG(99004),
    creature: "Universel",
    mountsMin: 1,
    mountsMax: 1,
  },
  // Multiplicateur (niv 100) — duplique la monture capturée (×2).
  {
    id: "32525",
    name: "Filet multiplicateur de Dragodinde",
    level: 100,
    img: IMG(99010),
    creature: "Dragodinde",
    mountsMin: 2,
    mountsMax: 2,
  },
  {
    id: "32526",
    name: "Filet multiplicateur de Volkorne",
    level: 100,
    img: IMG(99009),
    creature: "Volkorne",
    mountsMin: 2,
    mountsMax: 2,
  },
  {
    id: "32527",
    name: "Filet multiplicateur de Muldo",
    level: 100,
    img: IMG(99008),
    creature: "Muldo",
    mountsMin: 2,
    mountsMax: 2,
  },
  // « À X renforcé » (niv 150) — capture tout un cercle de 3 : 1 à 5 sauvages.
  {
    id: "32522",
    name: "Filet à Dragodinde renforcé",
    level: 150,
    img: IMG(99007),
    creature: "Dragodinde",
    mountsMin: 1,
    mountsMax: 5,
  },
  {
    id: "32523",
    name: "Filet à Volkorne renforcé",
    level: 150,
    img: IMG(99006),
    creature: "Volkorne",
    mountsMin: 1,
    mountsMax: 5,
  },
  {
    id: "32524",
    name: "Filet à Muldo renforcé",
    level: 150,
    img: IMG(99005),
    creature: "Muldo",
    mountsMin: 1,
    mountsMax: 5,
  },
  // Multiplicateur renforcé (niv 200) — 1 à 5 capturés, chacun dupliqué : 2 à 10.
  {
    id: "32528",
    name: "Filet multiplicateur de Dragodinde renforcé",
    level: 200,
    img: IMG(99013),
    creature: "Dragodinde",
    mountsMin: 2,
    mountsMax: 10,
  },
  {
    id: "32529",
    name: "Filet multiplicateur de Volkorne renforcé",
    level: 200,
    img: IMG(99012),
    creature: "Volkorne",
    mountsMin: 2,
    mountsMax: 10,
  },
  {
    id: "32530",
    name: "Filet multiplicateur de Muldo renforcé",
    level: 200,
    img: IMG(99011),
    creature: "Muldo",
    mountsMin: 2,
    mountsMax: 10,
  },
];

const byId = new Map(FILETS.map((f) => [f.id, f]));

/** Look up a filet definition by id. */
export function filetById(id: string | undefined): FiletDef | undefined {
  return id == null ? undefined : byId.get(id);
}

/**
 * The filets usable at a given éleveur level (requirement ≤ level), sorted by
 * level then name. Below level 1 this is empty. When `creature` is given, only
 * that creature's filets and the universal net are kept.
 */
export function filetsForLevel(
  level: number | undefined,
  creature?: FiletCreature,
): FiletDef[] {
  const lvl = level ?? 0;
  return FILETS.filter(
    (f) =>
      f.level <= lvl &&
      (creature == null ||
        f.creature === "Universel" ||
        f.creature === creature),
  ).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "fr"));
}
