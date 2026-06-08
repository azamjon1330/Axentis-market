import { useEffect, useState } from 'react';

/**
 * Allowed bounds for the analytics polling interval (Requirement 2.1).
 * The interval is FIXED per mount and always clamped into this window.
 */
export const POLLING_MIN_MS = 15000;
export const POLLING_MAX_MS = 30000;
export const POLLING_DEFAULT_MS = 20000;

/**
 * Clamp a requested poll interval into the fixed allowed window
 * [POLLING_MIN_MS, POLLING_MAX_MS] (Requirement 2.1).
 *
 * Pure helper extracted from {@link usePolling} so the bound logic can be
 * unit-tested without a React renderer. The hook uses this same function, so
 * the tested behavior is exactly the runtime behavior.
 *
 * @param ms Desired interval in milliseconds.
 * @returns The interval clamped to [15000, 30000].
 */
export function clampPollInterval(ms: number): number {
  return Math.min(POLLING_MAX_MS, Math.max(POLLING_MIN_MS, ms));
}

/**
 * Outcome of a single poll tick: either a successful fetch carrying fresh
 * data, or a failure carrying nothing.
 */
export type PollOutcome<T> = { ok: true; data: T } | { ok: false };

/**
 * Pure state transition for the polling hook's retained data.
 *
 * Given the previously retained value and the latest poll outcome:
 * - On success, the new value is the freshly fetched data (in-place update,
 *   Requirement 2.2).
 * - On failure, the previous value is RETAINED unchanged — a failure never
 *   clears or overwrites prior good data (Requirement 2.3).
 *
 * Starting from `null` (no successful fetch yet) and folding any finite
 * sequence of outcomes with this reducer, the result is always the data of the
 * most recent successful outcome, or `null` if none has succeeded. This is the
 * single source of truth for the retention invariant; {@link usePolling}
 * applies this exact reducer so tests exercise the real transition logic.
 *
 * @param prev    The currently displayed data (or null if none yet).
 * @param outcome The result of the latest poll tick.
 * @returns The next data value to display.
 */
export function applyPollOutcome<T>(
  prev: T | null,
  outcome: PollOutcome<T>,
): T | null {
  return outcome.ok ? outcome.data : prev;
}

/**
 * Reusable polling hook that drives auto-refreshing data fetches
 * (e.g. the web Advanced Analytics dashboards).
 *
 * Behavior:
 * - Fetches immediately on mount, then re-fetches every `intervalMs`.
 * - `intervalMs` is FIXED and clamped to the 15000–30000 ms window
 *   (default 20000) per Requirement 2.1.
 * - On a successful fetch the exposed `data` is updated in place
 *   (Requirement 2.2).
 * - On a failed fetch the last successfully loaded `data` is RETAINED — it is
 *   never cleared or overwritten with null/error — and the next tick retries
 *   (Requirement 2.3).
 * - Cleans up the interval on unmount and guards against setting state after
 *   unmount.
 *
 * Consumers should memoize `fetcher` (e.g. with `useCallback`) so that the
 * polling timer only restarts when its real dependencies change.
 *
 * @param fetcher   Async function that resolves with the latest data.
 * @param intervalMs Desired poll interval; clamped to [15000, 30000].
 * @returns The most recent successfully fetched data, or null if none yet.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = POLLING_DEFAULT_MS,
): T | null {
  const [data, setData] = useState<T | null>(null);

  // Keep the interval fixed within the allowed window (Req 2.1).
  const interval = clampPollInterval(intervalMs);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const next = await fetcher();
        // Success: update displayed data in place (Req 2.2) via the shared
        // pure reducer so the hook and its property tests agree.
        if (alive) setData((prev) => applyPollOutcome(prev, { ok: true, data: next }));
      } catch {
        // Failure: retain last good data and retry next tick (Req 2.3).
        // Folding a failure outcome through applyPollOutcome returns the
        // previous value unchanged, so we intentionally leave `data` as-is.
        if (alive) setData((prev) => applyPollOutcome(prev, { ok: false }));
      }
    };

    // Fetch immediately, then on every fixed interval.
    tick();
    const id = setInterval(tick, interval);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetcher, interval]);

  return data;
}

export default usePolling;
