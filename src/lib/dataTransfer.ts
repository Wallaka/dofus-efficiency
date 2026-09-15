/**
 * Import / export of the user's own data as a portable JSON file, so prices and
 * settings can be shared with someone else who imports them.
 *
 * Only user-generated data travels — never the DofusDB caches (re-fetchable) or
 * device-local screenshot readings. Each shareable slice is a "section" in the
 * registry below; adding a future one is a single entry.
 *
 * File shape (a versioned envelope, decoupled from localStorage key versions):
 *   { app: "dofus-efficiency", schema: 1, exportedAt, sections: { <id>: value } }
 */
import type { Item } from "../types";
import type { EleveurInput } from "./eleveur";
import {
  loadPriceEntries,
  savePriceEntries,
  type PriceEntryMap,
} from "./priceStore";
import { loadCraftList, saveCraftList, type CraftEntry } from "./craftList";
import { loadResources, saveResources, type ResourceMap } from "./resources";
import {
  loadFavourites,
  saveFavourites,
  loadEleveur,
  saveEleveur,
  loadAvisParticipation,
  saveAvisParticipation,
  loadAvisAviton,
  saveAvisAviton,
  loadAvisOverrides,
  saveAvisOverrides,
  type AvisAvitonRate,
  type AvisOverrides,
} from "./storage";

export const APP_ID = "dofus-efficiency";
export const SCHEMA = 1;

export type ImportMode = "merge" | "replace";

/** One shareable slice of the user's data. */
export interface PortableSection {
  id: string;
  label: string;
  /** Current stored value. */
  load: () => unknown;
  /** Persist a value (used for merge results and for replace). */
  save: (value: unknown) => void;
  /** Combine incoming into current, returning the value to save (merge mode). */
  merge: (current: unknown, incoming: unknown) => unknown;
  /** Basic shape check on untrusted incoming data. */
  valid: (value: unknown) => boolean;
  /** How many items this value holds (collections); undefined for a singleton. */
  size: (value: unknown) => number | undefined;
  /** True when the value holds something worth exporting. */
  present: (value: unknown) => boolean;
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

/** Shape check for the éleveur settings singleton (level + mount). */
const isEleveurInput = (x: unknown): x is EleveurInput => isObject(x);

/** Merge two id-keyed maps; `incoming` wins on a key clash. */
function mergeMap(
  current: unknown,
  incoming: unknown,
): Record<string, unknown> {
  const cur = isObject(current) ? current : {};
  const inc = isObject(incoming) ? incoming : {};
  return { ...cur, ...inc };
}

/** Merge two Item-like arrays by id; `incoming` wins on a clash. */
function mergeById<T extends { id: string }>(current: unknown, incoming: unknown): T[] {
  const cur = Array.isArray(current) ? (current as T[]) : [];
  const inc = Array.isArray(incoming) ? (incoming as T[]) : [];
  const byId = new Map<string, T>();
  for (const x of cur) byId.set(x.id, x);
  for (const x of inc) byId.set(x.id, x);
  return [...byId.values()];
}

export const SECTIONS: PortableSection[] = [
  {
    id: "priceEntries",
    label: "Prix enregistrés",
    load: () => loadPriceEntries(),
    save: (value) => {
      // Entries are the single source of truth; the price map derives from them.
      savePriceEntries((isObject(value) ? value : {}) as PriceEntryMap);
    },
    merge: (current, incoming) => {
      const cur = (isObject(current) ? current : {}) as PriceEntryMap;
      const inc = (isObject(incoming) ? incoming : {}) as PriceEntryMap;
      const out: PriceEntryMap = { ...cur };
      for (const [id, entry] of Object.entries(inc)) {
        const mine = out[id];
        // Newer price wins; ties keep the incoming one.
        if (!mine || (entry.updatedAt ?? 0) >= (mine.updatedAt ?? 0)) {
          out[id] = entry;
        }
      }
      return out;
    },
    valid: (v) => isObject(v),
    size: (v) => (isObject(v) ? Object.keys(v).length : 0),
    present: (v) => isObject(v) && Object.keys(v).length > 0,
  },
  {
    id: "favourites",
    label: "Objets suivis",
    load: () => loadFavourites(),
    save: (value) => saveFavourites(Array.isArray(value) ? (value as Item[]) : []),
    merge: (current, incoming) => mergeById<Item>(current, incoming),
    valid: (v) => Array.isArray(v),
    size: (v) => (Array.isArray(v) ? v.length : 0),
    present: (v) => Array.isArray(v) && v.length > 0,
  },
  {
    id: "craftList",
    label: "Liste de craft",
    load: () => loadCraftList(),
    save: (value) =>
      saveCraftList(Array.isArray(value) ? (value as CraftEntry[]) : []),
    merge: (current, incoming) => {
      // Craft entries are keyed by recipeId, not id.
      const cur = Array.isArray(current) ? (current as CraftEntry[]) : [];
      const inc = Array.isArray(incoming) ? (incoming as CraftEntry[]) : [];
      const byId = new Map<string, CraftEntry>();
      for (const x of cur) byId.set(x.recipeId, x);
      for (const x of inc) byId.set(x.recipeId, x);
      return [...byId.values()];
    },
    valid: (v) => Array.isArray(v),
    size: (v) => (Array.isArray(v) ? v.length : 0),
    present: (v) => Array.isArray(v) && v.length > 0,
  },
  {
    id: "resources",
    label: "Mes ressources",
    load: () => loadResources(),
    save: (value) =>
      saveResources(isObject(value) ? (value as ResourceMap) : {}),
    merge: (current, incoming) => mergeMap(current, incoming),
    valid: (v) => isObject(v),
    size: (v) => (isObject(v) ? Object.keys(v).length : 0),
    present: (v) => isObject(v) && Object.keys(v).length > 0,
  },
  {
    id: "eleveur",
    label: "Éleveur (réglages)",
    load: () => loadEleveur(),
    save: (value) => {
      if (isEleveurInput(value)) saveEleveur(value);
    },
    // Singleton settings object: incoming replaces.
    merge: (_current, incoming) => incoming,
    valid: (v) => isEleveurInput(v),
    size: () => undefined,
    present: (v) => isEleveurInput(v),
  },
  {
    id: "avisParticipation",
    label: "Avis · participation",
    load: () => loadAvisParticipation(),
    save: (value) =>
      saveAvisParticipation(
        isObject(value) ? (value as Record<string, number>) : {},
      ),
    merge: (current, incoming) => mergeMap(current, incoming),
    valid: (v) => isObject(v),
    size: (v) => (isObject(v) ? Object.keys(v).length : 0),
    present: (v) => isObject(v) && Object.keys(v).length > 0,
  },
  {
    id: "avisAviton",
    label: "Avis · taux avitons",
    load: () => loadAvisAviton(),
    save: (value) => {
      if (isObject(value)) saveAvisAviton(value as unknown as AvisAvitonRate);
    },
    merge: (_current, incoming) => incoming,
    valid: (v) => isObject(v),
    size: () => undefined,
    present: (v) => {
      const r = v as AvisAvitonRate | undefined;
      return isObject(v) && ((r?.qty ?? 0) > 0 || (r?.price ?? 0) > 0);
    },
  },
  {
    id: "avisOverrides",
    label: "Avis · corrections",
    load: () => loadAvisOverrides(),
    save: (value) =>
      saveAvisOverrides(isObject(value) ? (value as AvisOverrides) : {}),
    merge: (current, incoming) => mergeMap(current, incoming),
    valid: (v) => isObject(v),
    size: (v) => (isObject(v) ? Object.keys(v).length : 0),
    present: (v) => isObject(v) && Object.keys(v).length > 0,
  },
];

const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

export interface ExportFile {
  app: string;
  schema: number;
  exportedAt: number;
  sections: Record<string, unknown>;
}

/** Build the JSON string for the chosen section ids (only non-empty ones ship). */
export function buildExport(sectionIds: string[]): string {
  const sections: Record<string, unknown> = {};
  for (const s of SECTIONS) {
    if (!sectionIds.includes(s.id)) continue;
    const value = s.load();
    if (s.present(value)) sections[s.id] = value;
  }
  const file: ExportFile = {
    app: APP_ID,
    schema: SCHEMA,
    exportedAt: Date.now(),
    sections,
  };
  return JSON.stringify(file, null, 2);
}

export interface ParsedImport {
  exportedAt?: number;
  /** Section id → parsed value, for the sections this build understands. */
  sections: { id: string; label: string; value: unknown; size?: number }[];
  /** True if the file declared a newer schema than we support. */
  newerSchema: boolean;
}

/** Parse and validate a file's text; throws with a French message on bad input. */
export function parseImport(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Fichier illisible (JSON invalide).");
  }
  if (!isObject(raw) || raw.app !== APP_ID) {
    throw new Error("Ce fichier n'est pas un export dofus-efficiency.");
  }
  const schema = typeof raw.schema === "number" ? raw.schema : 0;
  const rawSections = isObject(raw.sections) ? raw.sections : {};
  const sections: ParsedImport["sections"] = [];
  for (const [id, value] of Object.entries(rawSections)) {
    const section = SECTION_BY_ID.get(id);
    if (!section || !section.valid(value) || !section.present(value)) continue;
    sections.push({ id, label: section.label, value, size: section.size(value) });
  }
  return {
    exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : undefined,
    sections,
    newerSchema: schema > SCHEMA,
  };
}

export interface ImportResult {
  applied: { label: string; size?: number }[];
}

/** Apply the chosen sections from a parsed file, merging or replacing. */
export function applyImport(
  parsed: ParsedImport,
  sectionIds: string[],
  mode: ImportMode,
): ImportResult {
  const applied: ImportResult["applied"] = [];
  for (const entry of parsed.sections) {
    if (!sectionIds.includes(entry.id)) continue;
    const section = SECTION_BY_ID.get(entry.id);
    if (!section) continue;
    const current = section.load();
    const final =
      mode === "replace" ? entry.value : section.merge(current, entry.value);
    section.save(final);
    applied.push({ label: section.label, size: section.size(final) });
  }
  return { applied };
}

/** Suggested download filename, e.g. dofus-efficiency-2026-09-14.json. */
export function exportFilename(now = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `${APP_ID}-${iso}.json`;
}
