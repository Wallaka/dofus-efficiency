/**
 * Rotation scheduling for the éleveur brisage loop.
 *
 * A rotation takes a fixed number of hours to raise (≈ 11 h), which doesn't
 * divide 24 h — so a strict chain drifts (08:00 → 18:56 → 05:52 → …). And you
 * can only brise + re-place while you're connected. This planner simulates the
 * loop over a few days within a connection window, finds the best placement
 * hour, and returns the login schedule and the realistic rotations/day.
 *
 * Times are in hours. "Absolute" hours count from day 0 at 00:00; a "clock"
 * hour is that mod 24.
 */

export interface PlanEvent {
  /** Absolute hours from day 0 00:00. */
  atHour: number;
  /** 0-based day index. */
  day: number;
  /** Clock hour of the event (0–24, may be fractional). */
  clock: number;
  /** "place" = first mise en enclos; "cycle" = brise the batch + re-place. */
  type: "place" | "cycle";
  /** Idle hours wasted waiting for the window before this event (0 for place). */
  idleHours: number;
}

export interface RotationPlan {
  /** Ideal clock hour to first put mounts in the enclos. */
  startClock: number;
  /** The schedule (place, then each brise+replace) within the horizon. */
  events: PlanEvent[];
  /** Completed rotations over the horizon. */
  rotations: number;
  /** Rotations completed per day (rotations / horizonDays). */
  rotationsPerDay: number;
  /** Total idle hours (waiting for the window) over the horizon. */
  idleHours: number;
  horizonDays: number;
}

export interface PlanOptions {
  /** Connection window start clock hour (you can log in from here). */
  availFrom: number;
  /** Connection window end clock hour (exclusive). 24 = midnight. */
  availTo: number;
  /** Hours to raise a batch to brisage level. */
  rotationHours: number;
  /** How many days to simulate (default 3). */
  horizonDays?: number;
}

const clockOf = (t: number): number => ((t % 24) + 24) % 24;

/** Whether you're connected at absolute hour t, given the daily window. */
function available(t: number, from: number, to: number): boolean {
  if (from <= 0 && to >= 24) return true;
  const h = clockOf(t);
  return h >= from && h < to;
}

/** The first moment ≥ t that falls inside the window. */
function nextAvailable(t: number, from: number, to: number): number {
  if (from <= 0 && to >= 24) return t;
  if (available(t, from, to)) return t;
  const h = clockOf(t);
  const dayStart = t - h;
  return h < from ? dayStart + from : dayStart + 24 + from;
}

interface SimResult {
  events: PlanEvent[];
  rotations: number;
  idleHours: number;
}

function toEvent(atHour: number, type: PlanEvent["type"], idleHours: number): PlanEvent {
  return {
    atHour,
    day: Math.floor(atHour / 24),
    clock: clockOf(atHour),
    type,
    idleHours,
  };
}

/** Simulate the loop from a placement time, over the horizon. */
function simulate(
  startAbs: number,
  from: number,
  to: number,
  rh: number,
  horizon: number,
): SimResult {
  const events: PlanEvent[] = [];
  let t = nextAvailable(startAbs, from, to);
  events.push(toEvent(t, "place", 0));
  let rotations = 0;
  let idleHours = 0;
  // Safety bound: a rotation is ≥ ~1 h, so events can't exceed horizon/1 + slack.
  while (events.length < 1000) {
    const ready = t + rh;
    const brise = nextAvailable(ready, from, to);
    if (brise >= horizon) break;
    const idle = brise - ready;
    events.push(toEvent(brise, "cycle", idle));
    idleHours += idle;
    rotations += 1;
    t = brise;
  }
  return { events, rotations, idleHours };
}

/**
 * Plan the rotations. Tries each candidate placement hour in the window and
 * keeps the one with the most rotations (ties broken by least idle time).
 */
export function planRotations(opts: PlanOptions): RotationPlan {
  const horizonDays = Math.max(1, Math.round(opts.horizonDays ?? 3));
  const horizon = horizonDays * 24;
  const rh = Math.max(0.1, opts.rotationHours);
  let from = Math.min(24, Math.max(0, opts.availFrom));
  let to = Math.min(24, Math.max(0, opts.availTo));
  // A non-positive or inverted window means "always available".
  if (to <= from) {
    from = 0;
    to = 24;
  }

  // Candidate start hours across the window (half-hour granularity).
  const candidates: number[] = [];
  if (from <= 0 && to >= 24) {
    candidates.push(0);
  } else {
    for (let c = from; c < to; c += 0.5) candidates.push(c);
  }

  let best: SimResult | null = null;
  let bestStart = from;
  for (const c of candidates) {
    const sim = simulate(c, from, to, rh, horizon);
    if (
      best == null ||
      sim.rotations > best.rotations ||
      (sim.rotations === best.rotations && sim.idleHours < best.idleHours)
    ) {
      best = sim;
      bestStart = c;
    }
  }

  const result = best ?? { events: [], rotations: 0, idleHours: 0 };
  return {
    startClock: clockOf(bestStart),
    events: result.events,
    rotations: result.rotations,
    rotationsPerDay: result.rotations / horizonDays,
    idleHours: result.idleHours,
    horizonDays,
  };
}

/** Format an hour count as "HH:MM" (clock), e.g. 18.933 → "18:56". */
export function formatClock(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const hh = m === 60 ? (h + 1) % 24 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
