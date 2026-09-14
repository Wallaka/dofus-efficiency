import type { MetierRecipe } from "./metierXp";
import type { JobOption } from "../data/dofusApi";

/**
 * Persistence for the Métiers page: the user's picker state, plus caches for the
 * static-ish DofusDB data (jobs list, XP curve, and a job's recipes) so revisits
 * are instant and don't re-hit the API. All wrapped in try/catch — a cache miss
 * or quota failure just means a refetch, never a crash.
 */

const INPUT_KEY = "dofus-efficiency:metierInput:v1";
const CURVE_KEY = "dofus-efficiency:metierXpCurve:v1";
const JOBS_KEY = "dofus-efficiency:metierJobs:v1";
const RECIPES_PREFIX = "dofus-efficiency:metierRecipes:v1:";

export interface MetierInput {
  jobId?: number;
  jobName?: string;
  current: number;
  target: number;
  /** XP coefficient as a percentage (100 = none). */
  coefPercent: number;
}

export function defaultMetierInput(): MetierInput {
  return { current: 1, target: 100, coefPercent: 100 };
}

export function loadMetierInput(): MetierInput {
  try {
    const raw = localStorage.getItem(INPUT_KEY);
    if (!raw) return defaultMetierInput();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...defaultMetierInput(), ...parsed } as MetierInput;
    }
    return defaultMetierInput();
  } catch {
    return defaultMetierInput();
  }
}

export function saveMetierInput(input: MetierInput): void {
  try {
    localStorage.setItem(INPUT_KEY, JSON.stringify(input));
  } catch {
    // non-fatal
  }
}

export function loadXpCurve(): number[] | null {
  try {
    const raw = localStorage.getItem(CURVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 1 ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

export function saveXpCurve(curve: number[]): void {
  try {
    localStorage.setItem(CURVE_KEY, JSON.stringify(curve));
  } catch {
    // non-fatal
  }
}

export function loadJobs(): JobOption[] | null {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as JobOption[])
      : null;
  } catch {
    return null;
  }
}

export function saveJobs(jobs: JobOption[]): void {
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {
    // non-fatal
  }
}

export function loadJobRecipes(jobId: number): MetierRecipe[] | null {
  try {
    const raw = localStorage.getItem(RECIPES_PREFIX + jobId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MetierRecipe[]) : null;
  } catch {
    return null;
  }
}

export function saveJobRecipes(jobId: number, recipes: MetierRecipe[]): void {
  try {
    localStorage.setItem(RECIPES_PREFIX + jobId, JSON.stringify(recipes));
  } catch {
    // non-fatal (recipe lists can be large; a quota miss just means refetch)
  }
}
