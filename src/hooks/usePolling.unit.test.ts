// Feature: marketplace-improvements, Requirements 2.1, 2.2 (polling interval bound and success update)
//
// Validates: Requirements 2.1, 2.2
//
// This is the example-based UNIT test companion to the polling work (task 13.x).
// It pins down two pieces of the analytics polling hook (src/hooks/usePolling.ts):
//
//   (a) Requirement 2.1 — the effective poll interval is FIXED and always lies
//       within the allowed window [POLLING_MIN_MS, POLLING_MAX_MS] = [15s, 30s],
//       regardless of what `intervalMs` the caller requests (below-min, above-max,
//       at the boundaries, and the default). This exercises `clampPollInterval`,
//       the pure helper the hook itself uses to compute its timer interval, so the
//       tested behavior is exactly the runtime behavior.
//
//   (b) Requirement 2.2 — on a successful fetch the exposed data updates to the
//       freshly fetched value (in-place success update). This exercises the shared
//       `applyPollOutcome` reducer the hook applies on each successful tick.
//
// ---------------------------------------------------------------------------------------
// Runner / dependency note:
//   The design names `fast-check`/`vitest` for the web project, but neither is listed
//   in package.json (the web project currently declares no test runner at all). Per the
//   fallback established by the translation tests (task 12.2), this test uses the built-in
//   Node test runner (`node:test` / `node:assert`) which ships with the Node runtime and
//   requires no install. The pure helpers under test (`clampPollInterval`,
//   `applyPollOutcome`) need no React renderer or fake timers — they are total functions —
//   so the assertions are deterministic and framework-agnostic.
//
//   This sandbox is INTEGRATIONS_ONLY with no node_modules installed, so the test is not
//   expected to execute here. With the project's TypeScript toolchain available it can be
//   run, for example, with:
//       node --import tsx --test src/hooks/usePolling.unit.test.ts
//   or under vitest (`vitest run src/hooks/usePolling.unit.test.ts`) if the team adds a
//   runner — the assertions only rely on the standard `node:test` / `node:assert` APIs.
// ---------------------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampPollInterval,
  applyPollOutcome,
  POLLING_MIN_MS,
  POLLING_MAX_MS,
  POLLING_DEFAULT_MS,
} from './usePolling';

// ---------------------------------------------------------------------------------------
// (a) Requirement 2.1 — interval is always bounded to [15s, 30s].
// ---------------------------------------------------------------------------------------

test('Req 2.1: clampPollInterval keeps in-window values unchanged', () => {
  // The default must sit inside the window and be returned as-is.
  assert.equal(clampPollInterval(POLLING_DEFAULT_MS), POLLING_DEFAULT_MS);
  assert.ok(
    POLLING_DEFAULT_MS >= POLLING_MIN_MS && POLLING_DEFAULT_MS <= POLLING_MAX_MS,
    'default interval must be within the allowed window',
  );

  // A representative in-range value passes through untouched.
  assert.equal(clampPollInterval(22000), 22000);

  // Exact boundaries are inside the window and unchanged.
  assert.equal(clampPollInterval(POLLING_MIN_MS), POLLING_MIN_MS);
  assert.equal(clampPollInterval(POLLING_MAX_MS), POLLING_MAX_MS);
});

test('Req 2.1: clampPollInterval clamps below-min requests up to POLLING_MIN_MS', () => {
  assert.equal(clampPollInterval(0), POLLING_MIN_MS);
  assert.equal(clampPollInterval(1), POLLING_MIN_MS);
  assert.equal(clampPollInterval(14999), POLLING_MIN_MS);
  assert.equal(clampPollInterval(-100000), POLLING_MIN_MS);
});

test('Req 2.1: clampPollInterval clamps above-max requests down to POLLING_MAX_MS', () => {
  assert.equal(clampPollInterval(30001), POLLING_MAX_MS);
  assert.equal(clampPollInterval(60000), POLLING_MAX_MS);
  assert.equal(clampPollInterval(Number.MAX_SAFE_INTEGER), POLLING_MAX_MS);
});

test('Req 2.1: effective interval is always within [15s, 30s] for any requested value', () => {
  // Exhaustive-in-spirit sweep across, below, above, and at the boundaries.
  const requested = [
    -1_000_000, -1, 0, 1, 14_999,
    POLLING_MIN_MS, POLLING_MIN_MS + 1,
    16_000, 18_000, POLLING_DEFAULT_MS, 25_000, 29_999,
    POLLING_MAX_MS - 1, POLLING_MAX_MS, POLLING_MAX_MS + 1,
    45_000, 1_000_000,
  ];

  for (const ms of requested) {
    const effective = clampPollInterval(ms);
    assert.ok(
      effective >= POLLING_MIN_MS && effective <= POLLING_MAX_MS,
      `clampPollInterval(${ms}) = ${effective} escaped [${POLLING_MIN_MS}, ${POLLING_MAX_MS}]`,
    );
    // Clamping is idempotent: clamping an already-clamped value is a no-op.
    assert.equal(
      clampPollInterval(effective),
      effective,
      `clampPollInterval is not idempotent at ${ms}`,
    );
  }
});

// ---------------------------------------------------------------------------------------
// (b) Requirement 2.2 — on a successful fetch the exposed data updates in place.
// ---------------------------------------------------------------------------------------

test('Req 2.2: a successful outcome replaces the exposed data with the fetched value', () => {
  // From an empty (null) state, success exposes the fetched value.
  assert.equal(applyPollOutcome<number>(null, { ok: true, data: 42 }), 42);

  // From a prior value, success overwrites it in place with the new value.
  assert.equal(applyPollOutcome<number>(42, { ok: true, data: 99 }), 99);
});

test('Req 2.2: success updates work for object-shaped analytics payloads', () => {
  const prev = { revenue: 100, units: 3 };
  const next = { revenue: 250, units: 7 };

  const updated = applyPollOutcome(prev, { ok: true, data: next });

  // The exposed data must become exactly the freshly fetched object (in-place update),
  // not a merge of old and new.
  assert.strictEqual(updated, next);
  assert.deepEqual(updated, { revenue: 250, units: 7 });
});

test('Req 2.2: repeated successes always track the most recently fetched value', () => {
  let data: number | null = null;
  for (const value of [1, 2, 3, 10, 7]) {
    data = applyPollOutcome(data, { ok: true, data: value });
    assert.equal(data, value);
  }
  assert.equal(data, 7);
});
