import "server-only";

/**
 * Wall-clock reads.
 *
 * Server components are render functions, so the react-hooks purity rule —
 * rightly — refuses `Date.now()` inside a component body: the same props must
 * always produce the same output. Comparing a visit's start time against "now"
 * is genuinely time-dependent, so the read is moved behind these helpers.
 *
 * The value is still resolved per request; nothing is cached across renders.
 */
export function nowMs(): number {
  return Date.now();
}

/** True when an ISO timestamp is earlier than the given (or current) instant. */
export function isPast(iso: string, now: number = nowMs()): boolean {
  const then = new Date(iso).getTime();
  return Number.isFinite(then) && then < now;
}