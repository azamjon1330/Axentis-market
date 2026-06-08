// Property-based test for orderListing subscribed-first ordering.
//
// Feature: marketplace-improvements, Property 8: Subscribed products precede
// non-subscribed products.
//
// Validates: Requirements 9.1
//
// Property 8 (design.md): For any product list, after `orderListing`, the index
// of every subscribed-company product is less than the index of every
// non-subscribed-company product.
//
// fast-check is NOT a dependency of Homepage/package.json, so this test uses a
// hand-rolled seeded generator together with Node's built-in test runner
// (`node:test`) and assertions (`node:assert`). The generator is itself driven
// by a small deterministic PRNG so failures are reproducible: each failing case
// prints the integer `caseSeed` that produced it, which can be replayed.
//
// Run standalone with:  node --test orderListing.subscribedFirst.property.test.js
// (the source module orderListing.js is dependency-free and importable in plain
//  Node when treated as an ES module).

import test from 'node:test';
import assert from 'node:assert/strict';
import { orderListing } from './orderListing.js';

// ---------------------------------------------------------------------------
// Deterministic PRNG for the GENERATOR (independent of the PRNG inside the
// module under test). Same mulberry32 algorithm; kept local so the test does
// not depend on internals it is meant to exercise.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// Generate a random product array. Each item: { id, companyId, isSubscribed }.
// We intelligently constrain the input space: a small pool of company ids, a
// mix of subscribed/non-subscribed companies, and lengths spanning empty up to
// moderately large lists so round-robin across multiple companies is exercised.
function genProducts(rng) {
  const numCompanies = randInt(rng, 0, 6);
  // Decide, per company, whether it is a subscribed company.
  const companySubscribed = {};
  for (let c = 0; c < numCompanies; c++) {
    companySubscribed[c] = rng() < 0.5;
  }

  const length = randInt(rng, 0, 40);
  const products = [];
  for (let i = 0; i < length; i++) {
    if (numCompanies === 0) {
      // No companies: emit a non-subscribed product with no company.
      products.push({ id: i, companyId: null, isSubscribed: false });
      continue;
    }
    const companyId = randInt(rng, 0, numCompanies - 1);
    const isSubscribed = companySubscribed[companyId];
    products.push({ id: i, companyId, isSubscribed });
  }
  return products;
}

function lastSubscribedIndex(ordered) {
  let last = -1;
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i] && ordered[i].isSubscribed === true) last = i;
  }
  return last;
}

function firstNonSubscribedIndex(ordered) {
  for (let i = 0; i < ordered.length; i++) {
    if (!(ordered[i] && ordered[i].isSubscribed === true)) return i;
  }
  return ordered.length;
}

const ITERATIONS = 500;

test('Property 8: subscribed products precede non-subscribed products', () => {
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Two independent seeds: one drives input generation, one is the listing
    // reload seed passed to orderListing (Req 9.3 re-randomization).
    const caseSeed = (iter * 2654435761) >>> 0;
    const rng = makeRng(caseSeed);
    const listingSeed = randInt(rng, 0, 0x7fffffff);
    const products = genProducts(rng);

    const ordered = orderListing(products, listingSeed);

    // Core property: index of every subscribed product < index of every
    // non-subscribed product. Equivalent to: the last subscribed index is
    // strictly less than the first non-subscribed index.
    const lastSub = lastSubscribedIndex(ordered);
    const firstNon = firstNonSubscribedIndex(ordered);

    const detail = JSON.stringify({ caseSeed, listingSeed, lastSub, firstNon });
    assert.ok(
      lastSub < firstNon,
      `Property 8 violated: a subscribed product appears after a non-subscribed product. ${detail}`,
    );

    // Sanity: orderListing is a permutation (no products lost or added). This
    // guards against the property holding vacuously due to dropped items.
    assert.equal(
      ordered.length,
      products.length,
      `orderListing changed length. ${detail}`,
    );
  }
});

test('Property 8: explicit example — subscribed grouped ahead of non-subscribed', () => {
  const products = [
    { id: 1, companyId: 10, isSubscribed: false },
    { id: 2, companyId: 20, isSubscribed: true },
    { id: 3, companyId: 30, isSubscribed: false },
    { id: 4, companyId: 20, isSubscribed: true },
  ];
  const ordered = orderListing(products, 12345);
  const lastSub = lastSubscribedIndex(ordered);
  const firstNon = firstNonSubscribedIndex(ordered);
  assert.ok(lastSub < firstNon);
  // Both subscribed products land in the first two slots.
  assert.deepEqual(
    ordered.slice(0, 2).map((p) => p.isSubscribed),
    [true, true],
  );
});

test('Property 8: edge cases — empty, all-subscribed, none-subscribed', () => {
  assert.deepEqual(orderListing([], 1), []);

  const allSub = [
    { id: 1, companyId: 1, isSubscribed: true },
    { id: 2, companyId: 2, isSubscribed: true },
  ];
  const orderedAll = orderListing(allSub, 7);
  assert.equal(firstNonSubscribedIndex(orderedAll), orderedAll.length);

  const noneSub = [
    { id: 1, companyId: 1, isSubscribed: false },
    { id: 2, companyId: 2, isSubscribed: false },
  ];
  const orderedNone = orderListing(noneSub, 7);
  assert.equal(lastSubscribedIndex(orderedNone), -1);
});
