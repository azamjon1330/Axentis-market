// Feature: marketplace-improvements, Property 9: Round-robin interleaving is fair and lossless
//
// Property 9 (design.md): "For any grouping of subscribed products by company,
// the interleaved subscribed segment is a permutation of the inputs (no product
// lost or duplicated), and at every point in that segment the difference between
// the emitted counts of any two not-yet-exhausted companies is at most 1."
//
// **Validates: Requirements 9.2, 9.3**
//
// Requirement 9.2 — while multiple subscribed companies have products, their
//   products are round-robin interleaved so no single company dominates.
// Requirement 9.3 — each reload supplies a fresh seed that re-randomizes the
//   order of subscribed companies (deterministic for a fixed seed).
//
// This is a hand-rolled property-based test: `fast-check` is NOT a dependency of
// Homepage/package.json, so we use a small seeded generator plus node:test /
// node:assert. The module under test (orderListing.js) is dependency-free, so
// this test validates the real implementation standalone.
//
// Run (from Homepage/):
//   node --experimental-default-type=module --test \
//     src/utils/orderListing.roundRobin.property.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderListing, shuffle, mulberry32 } from './orderListing.js';

// ---------------------------------------------------------------------------
// Seeded generator for the property test itself (independent of mulberry32 so a
// bug in mulberry32 cannot mask a generation bias). Simple 32-bit LCG.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    // Numerical Recipes LCG constants.
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const intIn = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// Build a random listing: several subscribed companies (each with >=1 product)
// interleaved at the input level with some non-subscribed products. Every
// product gets a globally-unique id so we can check the multiset exactly.
function genListing(rng) {
  const companyCount = intIn(rng, 1, 5);
  const products = [];
  let nextId = 1;

  // Subscribed products grouped across `companyCount` companies. We push them in
  // arbitrary interleaved input order to make sure orderListing's own grouping
  // (not the input order) drives fairness.
  const perCompany = [];
  for (let c = 0; c < companyCount; c++) {
    perCompany.push(intIn(rng, 1, 5)); // products this company contributes
  }
  // Emit subscribed products in a randomized arrival order.
  const arrivals = [];
  for (let c = 0; c < companyCount; c++) {
    for (let k = 0; k < perCompany[c]; k++) arrivals.push(c);
  }
  // Fisher-Yates on arrivals using rng.
  for (let i = arrivals.length - 1; i > 0; i--) {
    const j = intIn(rng, 0, i);
    const t = arrivals[i];
    arrivals[i] = arrivals[j];
    arrivals[j] = t;
  }
  for (const c of arrivals) {
    products.push({ id: nextId++, companyId: `c${c}`, isSubscribed: true });
  }

  // Some non-subscribed products (possibly zero).
  const nonSubCount = intIn(rng, 0, 6);
  for (let n = 0; n < nonSubCount; n++) {
    const fromExistingCompany = rng() < 0.5;
    const companyId = fromExistingCompany
      ? `c${intIn(rng, 0, companyCount - 1)}`
      : `x${intIn(rng, 0, 3)}`;
    products.push({ id: nextId++, companyId, isSubscribed: false });
  }

  return { products, companyCount };
}

const idMultiset = (arr) => {
  const m = new Map();
  for (const p of arr) m.set(p.id, (m.get(p.id) || 0) + 1);
  return m;
};

const sameMultiset = (a, b) => {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
};

// The subscribed segment is the leading run of subscribed products (Req 9.1
// guarantees all subscribed precede non-subscribed; we only need the prefix).
function subscribedSegment(output) {
  const seg = [];
  for (const p of output) {
    if (p && p.isSubscribed === true) seg.push(p);
    else break;
  }
  return seg;
}

const ITERATIONS = 400;

test('Property 9: orderListing output is a LOSSLESS permutation of the input', () => {
  const rng = makeRng(0xC0FFEE);
  for (let i = 0; i < ITERATIONS; i++) {
    const { products } = genListing(rng);
    const seed = intIn(rng, 0, 2 ** 31 - 1);
    const out = orderListing(products, seed);

    assert.equal(out.length, products.length, `length preserved (iter ${i})`);
    assert.ok(
      sameMultiset(idMultiset(products), idMultiset(out)),
      `output is a permutation of input ids — none lost or duplicated (iter ${i})`,
    );
  }
});

test('Property 9: round-robin segment is FAIR — pairwise gap among non-exhausted companies <= 1', () => {
  const rng = makeRng(0x1234ABCD);
  for (let i = 0; i < ITERATIONS; i++) {
    const { products } = genListing(rng);
    const seed = intIn(rng, 0, 2 ** 31 - 1);
    const out = orderListing(products, seed);
    const seg = subscribedSegment(out);

    // Total subscribed products per company (the exhaustion targets).
    const totals = new Map();
    for (const p of seg) totals.set(p.companyId, (totals.get(p.companyId) || 0) + 1);

    // Walk every prefix; verify the round-robin invariant.
    const emitted = new Map();
    for (let k = 0; k < seg.length; k++) {
      const cid = seg[k].companyId;
      emitted.set(cid, (emitted.get(cid) || 0) + 1);

      // Among companies not yet exhausted, counts differ by at most 1.
      let min = Infinity;
      let max = -Infinity;
      for (const [company, total] of totals) {
        const got = emitted.get(company) || 0;
        if (got < total) {
          if (got < min) min = got;
          if (got > max) max = got;
        }
      }
      if (max !== -Infinity) {
        assert.ok(
          max - min <= 1,
          `fairness gap <= 1 at prefix ${k} (iter ${i}); min=${min} max=${max}`,
        );
      }
    }
  }
});

test('Property 9 / Req 9.3: orderListing is deterministic for a fixed seed', () => {
  const rng = makeRng(0x55AA55AA);
  for (let i = 0; i < ITERATIONS; i++) {
    const { products } = genListing(rng);
    const seed = intIn(rng, 0, 2 ** 31 - 1);
    const a = orderListing(products, seed).map((p) => p.id);
    const b = orderListing(products, seed).map((p) => p.id);
    assert.deepEqual(a, b, `same seed => identical order (iter ${i})`);
  }
});

test('Property 9 / Req 9.3: different seeds can re-randomize subscribed company ordering', () => {
  const rng = makeRng(0x0BADF00D);
  let observedDifference = false;

  for (let i = 0; i < ITERATIONS && !observedDifference; i++) {
    const { products, companyCount } = genListing(rng);
    if (companyCount < 2) continue; // need >=2 companies to reorder

    // The leading company of the subscribed segment is driven purely by the
    // seeded shuffle of company order; scan seeds for a different leader.
    const baseSeed = intIn(rng, 0, 2 ** 31 - 1);
    const baseSeg = subscribedSegment(orderListing(products, baseSeed));
    if (baseSeg.length === 0) continue;
    const baseLeader = baseSeg[0].companyId;

    for (let s = 0; s < 50; s++) {
      const seg = subscribedSegment(orderListing(products, baseSeed + s + 1));
      if (seg.length && seg[0].companyId !== baseLeader) {
        observedDifference = true;
        break;
      }
    }
  }

  assert.ok(
    observedDifference,
    're-randomization (Req 9.3): different seeds produce different company orderings',
  );
});

test('shuffle is a deterministic, lossless permutation given a fixed seed', () => {
  const rng = makeRng(0xFEEDFACE);
  for (let i = 0; i < 100; i++) {
    const arr = Array.from({ length: intIn(rng, 0, 8) }, (_, k) => k);
    const seed = intIn(rng, 0, 2 ** 31 - 1);
    const a = shuffle(arr, seed);
    const b = shuffle(arr, seed);
    assert.deepEqual(a, b, 'shuffle deterministic for fixed seed');
    assert.deepEqual([...a].sort((x, y) => x - y), [...arr].sort((x, y) => x - y),
      'shuffle preserves the multiset');
    assert.notEqual(a, arr, 'shuffle returns a new array (no mutation)');
  }
});

test('mulberry32 is deterministic and yields floats in [0, 1)', () => {
  const seqA = Array.from({ length: 20 }, ((g) => () => g())(mulberry32(42)));
  const seqB = Array.from({ length: 20 }, ((g) => () => g())(mulberry32(42)));
  assert.deepEqual(seqA, seqB, 'same seed => same sequence');
  for (const v of seqA) {
    assert.ok(v >= 0 && v < 1, `value ${v} in [0,1)`);
  }
});
