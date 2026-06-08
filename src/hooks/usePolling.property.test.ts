// Feature: marketplace-improvements, Property 2: Polling retains last successful data on failure
//
// Validates: Requirements 2.3
//
// Property 2 (from design.md, section B):
//   "For any finite sequence of fetch outcomes (each success carrying a payload, or a
//    failure), the polling hook's exposed `data` always equals the payload of the most
//    recent successful fetch, or `null` if none has succeeded yet -- a failure never
//    overwrites or clears prior good data."
//
// What is under test
// -------------------
// The hook `usePolling<T>(fetcher, intervalMs)` (src/hooks/usePolling.ts, task 13.1) keeps
// its retained `data` through a single pure state transition. That transition is exported
// from the hook as `applyPollOutcome(prev, outcome)`:
//
//     applyPollOutcome(prev, { ok: true, data })  === data    // success replaces
//     applyPollOutcome(prev, { ok: false })        === prev     // failure retains
//
// The hook's `tick` folds each poll result through this exact reducer (success ->
// {ok:true,data}, failure -> {ok:false}), so testing the reducer over a sequence of
// outcomes is testing the hook's real retention logic -- no replica, no mock. We model the
// React state evolution by folding the reducer across the outcome sequence starting at the
// hook's initial state (`null`), which mirrors `useState<T | null>(null)` plus repeated
// `setData(prev => applyPollOutcome(prev, outcome))` calls.
//
// Runner / dependency note
// ------------------------
//   The design names `fast-check` as the JS property-testing library, but `fast-check` is
//   NOT in package.json (the web project declares no test runner). Per the task's fallback
//   -- and consistent with the sibling test src/utils/translations.property.test.ts (task
//   12.2) -- this test uses a small hand-rolled, seeded generator plus the built-in Node
//   test runner (`node:test` / `node:assert`), which needs no install.
//
//   This sandbox is INTEGRATIONS_ONLY with no node_modules installed, so the test is not
//   expected to execute here. With the project's TypeScript toolchain available it can be
//   run, for example, with:
//       node --import tsx --test src/hooks/usePolling.property.test.ts
//   or under vitest (`vitest run src/hooks/usePolling.property.test.ts`) if a runner is
//   added. The assertions rely only on the standard node:test / node:assert APIs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPollOutcome, type PollOutcome } from './usePolling';

// --- Hand-rolled deterministic PRNG (mulberry32) for reproducible sampling -------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Generator: a finite sequence of fetch outcomes ------------------------------------
// Each outcome is either a success carrying a payload (a distinct integer so we can tell
// payloads apart) or a failure. The failure probability is biased high so sequences
// regularly exercise "failure after success" and "leading failures" cases.
function genOutcomeSequence(
  rng: () => number,
  maxLen: number,
): Array<PollOutcome<number>> {
  const len = Math.floor(rng() * (maxLen + 1)); // 0..maxLen (includes empty sequence)
  const seq: Array<PollOutcome<number>> = [];
  for (let i = 0; i < len; i++) {
    // ~45% failures so both branches and ordering edge cases are well covered.
    if (rng() < 0.45) {
      seq.push({ ok: false });
    } else {
      // Unique, recognizable payload per step (offset avoids clashing with `null`/0 edge).
      seq.push({ ok: true, data: i + 1 });
    }
  }
  return seq;
}

// --- Reference oracle: the most recent successful payload, or null ---------------------
// Computed independently of the reducer so the test does not merely restate the code.
function lastSuccessfulPayload(
  seq: ReadonlyArray<PollOutcome<number>>,
): number | null {
  let expected: number | null = null;
  for (const o of seq) {
    if (o.ok) expected = o.data;
  }
  return expected;
}

// --- Fold the real reducer across the sequence, mirroring the hook's state evolution ---
function foldWithHookReducer(
  seq: ReadonlyArray<PollOutcome<number>>,
): number | null {
  let data: number | null = null; // initial hook state: useState<T | null>(null)
  for (const outcome of seq) {
    data = applyPollOutcome(data, outcome);
  }
  return data;
}

function describeFailure(
  seq: ReadonlyArray<PollOutcome<number>>,
  actual: number | null,
  expected: number | null,
): string {
  const rendered = seq
    .map((o) => (o.ok ? `ok(${o.data})` : 'fail'))
    .join(', ');
  return (
    `Property 2 violated -- retained data did not equal the most recent successful payload.\n` +
    `  outcome sequence: [${rendered}]\n` +
    `  reducer result:   ${JSON.stringify(actual)}\n` +
    `  expected:         ${JSON.stringify(expected)}`
  );
}

// --- Property-based test: random sampling over outcome sequences -----------------------
test('Property 2: polling retains last successful data on failure (randomized)', () => {
  const SEED = 0x2a7b91e3;
  const ITERATIONS = 200; // design requires a minimum of 100 iterations
  const MAX_LEN = 24;
  const rng = mulberry32(SEED);

  for (let i = 0; i < ITERATIONS; i++) {
    const seq = genOutcomeSequence(rng, MAX_LEN);
    const actual = foldWithHookReducer(seq);
    const expected = lastSuccessfulPayload(seq);

    try {
      assert.deepStrictEqual(actual, expected, describeFailure(seq, actual, expected));

      // Strengthen: a failure as the LAST step must leave the value identical to the
      // value held just before it (failure never clears/overwrites good data, Req 2.3).
      if (seq.length > 0 && !seq[seq.length - 1].ok) {
        const beforeLast = foldWithHookReducer(seq.slice(0, -1));
        assert.deepStrictEqual(
          actual,
          beforeLast,
          `Property 2 violated -- a trailing failure changed the retained data.\n` +
            `  before failure: ${JSON.stringify(beforeLast)}\n` +
            `  after failure:  ${JSON.stringify(actual)}`,
        );
      }
    } catch (err) {
      const note = `\n  (seed: 0x${SEED.toString(16)}, iteration: ${i})`;
      if (err instanceof assert.AssertionError) {
        err.message += note;
      }
      throw err;
    }
  }
});

// --- Deterministic companion checks: pin down the boundary cases -----------------------
test('Property 2: no successful fetch yet => data stays null', () => {
  // Empty sequence.
  assert.strictEqual(foldWithHookReducer([]), null);
  // Only failures, of varying length: never a success, so always null.
  assert.strictEqual(foldWithHookReducer([{ ok: false }]), null);
  assert.strictEqual(
    foldWithHookReducer([{ ok: false }, { ok: false }, { ok: false }]),
    null,
  );
});

test('Property 2: a single success is retained through any number of later failures', () => {
  const seq: Array<PollOutcome<number>> = [
    { ok: true, data: 42 },
    { ok: false },
    { ok: false },
    { ok: false },
  ];
  assert.strictEqual(foldWithHookReducer(seq), 42);
});

test('Property 2: the MOST RECENT success wins, not the first', () => {
  const seq: Array<PollOutcome<number>> = [
    { ok: true, data: 1 },
    { ok: false },
    { ok: true, data: 2 },
    { ok: false },
    { ok: true, data: 3 },
    { ok: false },
  ];
  assert.strictEqual(foldWithHookReducer(seq), 3);
});

test('Property 2: leading failures before the first success resolve to null then the payload', () => {
  // Before the first success the value is null; after it, the payload; a trailing
  // failure retains that payload.
  assert.strictEqual(foldWithHookReducer([{ ok: false }, { ok: false }]), null);
  assert.strictEqual(
    foldWithHookReducer([{ ok: false }, { ok: true, data: 7 }, { ok: false }]),
    7,
  );
});

// --- Single-step reducer law: the exact transition the hook relies on ------------------
test('Property 2 (unit): applyPollOutcome replaces on success and retains on failure', () => {
  // Success replaces the previous value with the payload, regardless of prior state.
  assert.strictEqual(applyPollOutcome<number>(null, { ok: true, data: 5 }), 5);
  assert.strictEqual(applyPollOutcome<number>(99, { ok: true, data: 5 }), 5);
  // Failure retains the previous value exactly (including null).
  assert.strictEqual(applyPollOutcome<number>(null, { ok: false }), null);
  assert.strictEqual(applyPollOutcome<number>(99, { ok: false }), 99);
});
