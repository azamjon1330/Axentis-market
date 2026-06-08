// Subscription-based product listing order for the Buyer App home feed.
//
// Implements Requirement 9 (subscription-based product ranking):
//   9.1 Products from companies with an active subscription appear before
//       products from companies without an active subscription.
//   9.2 While multiple subscribed companies have products in a listing, their
//       products are ordered using round-robin interleaving so no single
//       company dominates.
//   9.3 On each listing reload a fresh `seed` is supplied so the order of
//       subscribed companies is re-randomized.
//
// See design.md section G ("Top Companies section + subscription round-robin").
//
// All functions here are PURE: they never mutate their inputs and, given the
// same `seed`, produce the same output (deterministic-given-seed). This keeps
// them trivially testable by the property tests in tasks 19.3 / 19.4.

// mulberry32 — a small, fast, seeded PRNG. Given a 32-bit integer seed it
// returns a function producing deterministic floats in [0, 1). Using a seeded
// PRNG (rather than Math.random) makes shuffling reproducible for a given seed
// while still re-randomizing whenever the caller supplies a new seed (Req 9.3).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// shuffle — returns a NEW array containing the elements of `array` in a
// seed-determined order using a Fisher-Yates shuffle driven by mulberry32.
// The input array is not mutated (pure). Given the same `seed` the permutation
// is identical; a different `seed` yields a (generally) different permutation.
export function shuffle(array, seed) {
  const result = Array.isArray(array) ? array.slice() : [];
  const rand = mulberry32(typeof seed === 'number' ? seed : 0);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// Group products by their owning company, preserving each company's first-seen
// order and the backend order of products within that company. Returns
// `{ order: [companyKey...], buckets: { [companyKey]: product[] } }`.
function groupByCompany(products) {
  const order = [];
  const buckets = {};
  for (const p of products) {
    // Backend returns `companyId`; tolerate snake_case just in case.
    const rawId = p && (p.companyId != null ? p.companyId : p.company_id);
    const key = String(rawId == null ? 'unknown' : rawId);
    if (!buckets[key]) {
      buckets[key] = [];
      order.push(key);
    }
    buckets[key].push(p);
  }
  return { order, buckets };
}

// orderListing — produces the display order for a product list (Req 9.1–9.3).
//
//   1. Partition into subscribed-company products (product.isSubscribed === true)
//      and the rest, preserving backend order within each partition.
//   2. Subscribed products come first (Req 9.1).
//   3. Subscribed products are grouped by company; the company order is shuffled
//      with `seed` (Req 9.3) and then round-robin interleaved one product per
//      company per pass so no company dominates (Req 9.2).
//   4. Non-subscribed products are appended after, in their original order.
//
// The result is a pure permutation of `products` — every input appears exactly
// once and nothing is added or lost.
export function orderListing(products, seed) {
  if (!Array.isArray(products)) return [];

  const subscribed = products.filter((p) => p && p.isSubscribed === true);
  const rest = products.filter((p) => !(p && p.isSubscribed === true));

  const { order, buckets } = groupByCompany(subscribed);
  const companies = shuffle(order, seed);

  // Round-robin: copy each company's bucket into a cursor so we never mutate the
  // grouped arrays, emitting one product per company per pass until exhausted.
  const cursors = companies.map((key) => ({ items: buckets[key], pos: 0 }));
  const interleaved = [];
  let added = true;
  while (added) {
    added = false;
    for (const cursor of cursors) {
      if (cursor.pos < cursor.items.length) {
        interleaved.push(cursor.items[cursor.pos]);
        cursor.pos += 1;
        added = true;
      }
    }
  }

  return [...interleaved, ...rest];
}
