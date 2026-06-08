// Property-based test for per-variant cart-line uniqueness and increment.
//
// Feature: marketplace-improvements, Property 23: Cart lines are unique per
// variant and re-adds increment.
//
// Validates: Requirements 17.2, 17.3
//
// fast-check is NOT a dependency of Homepage/package.json and there is no jest
// RN preset configured, so this test uses the built-in node:test runner with a
// small seeded generator instead.
//
// CartContext.js imports React Native + AuthContext, which cannot be loaded in
// plain node, so we cannot import its `addItem` (it lives inside a React
// provider and talks to the backend). The pure reducer below is a LOCAL MIRROR
// of the dedup semantics of CartContext.addItem: a cart line is uniquely keyed
// by (productId, color, size); adding an existing variant increments that
// line's quantity, otherwise a new line is appended. `lineKey` here is a
// byte-for-byte mirror of the exported `lineKey` in
// Homepage/src/context/CartContext.js — keep them in sync.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// --- Local mirror of CartContext.lineKey ---
const lineKey = (productId, color, size) =>
  `${productId}::${color || ''}::${size || ''}`;

// --- Pure mirror of CartContext.addItem dedup semantics ---
// applyAdd(lines, {productId, color, size, qty}) returns a NEW lines array:
//  - if a line with the same lineKey exists, increment its quantity by qty;
//  - otherwise append a new line carrying that variant's color/size.
function applyAdd(lines, { productId, color, size, qty }) {
  const key = lineKey(productId, color, size);
  const idx = lines.findIndex(
    (l) => lineKey(l.productId, l.color, l.size) === key
  );
  if (idx >= 0) {
    const next = lines.slice();
    next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
    return next;
  }
  return lines.concat([{ productId, color: color || '', size: size || '', quantity: qty }]);
}

// --- Seeded PRNG (mulberry32) so failures are reproducible ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small fixed input space of variant keys so re-adds collide frequently.
const PRODUCT_IDS = [1, 2, 3];
const COLORS = ['', 'red', 'blue'];
const SIZES = ['', 'S', 'M'];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Generate one random add operation over the small key space.
function genAdd(rng) {
  return {
    productId: pick(rng, PRODUCT_IDS),
    color: pick(rng, COLORS),
    size: pick(rng, SIZES),
    qty: Math.floor(rng() * 3) + 1, // 1..3
  };
}

const ITERATIONS = 300;

test('Property 23: cart lines are unique per variant and re-adds increment', () => {
  const rng = mulberry32(0x23add5);

  for (let i = 0; i < ITERATIONS; i++) {
    const opCount = Math.floor(rng() * 12) + 1; // 1..12 adds per sequence
    const ops = [];
    let lines = [];
    for (let j = 0; j < opCount; j++) {
      const op = genAdd(rng);
      ops.push(op);
      lines = applyAdd(lines, op);
    }

    // Build the expected per-key quantity sums independently of the reducer.
    const expected = new Map(); // key -> { qty, color, size }
    for (const op of ops) {
      const key = lineKey(op.productId, op.color, op.size);
      const prev = expected.get(key);
      expected.set(key, {
        qty: (prev ? prev.qty : 0) + op.qty,
        color: op.color || '',
        size: op.size || '',
      });
    }

    const ctx = `i=${i} ops=${JSON.stringify(ops)} => ${JSON.stringify(lines)}`;

    // (a) At most one line per (productId, color, size) key — no duplicates.
    const seen = new Set();
    for (const l of lines) {
      const key = lineKey(l.productId, l.color, l.size);
      assert.ok(!seen.has(key), `duplicate line for key ${key} (${ctx})`);
      seen.add(key);
    }

    // (c) Total lines equals the number of distinct keys added.
    assert.equal(lines.length, expected.size, `line count must equal distinct keys (${ctx})`);

    // (b) Each line's quantity equals the sum of qty added for that key.
    for (const l of lines) {
      const key = lineKey(l.productId, l.color, l.size);
      const exp = expected.get(key);
      assert.ok(exp, `unexpected line key ${key} (${ctx})`);
      assert.equal(l.quantity, exp.qty, `quantity mismatch for ${key} (${ctx})`);
    }

    // (d) No variant-less line is created for an add that carried a size/color.
    // A line is variant-less iff both color and size are empty. Such a line may
    // only exist if EVERY add contributing to it was itself variant-less.
    for (const l of lines) {
      const variantless = (l.color || '') === '' && (l.size || '') === '';
      if (variantless) {
        const key = lineKey(l.productId, '', '');
        const contributing = ops.filter(
          (op) => lineKey(op.productId, op.color, op.size) === key
        );
        for (const op of contributing) {
          assert.ok(
            (op.color || '') === '' && (op.size || '') === '',
            `variant-less line absorbed a variant add ${JSON.stringify(op)} (${ctx})`
          );
        }
      }
    }

    // Conversely: every add that carried a color/size must map to a line that
    // carries that exact color/size (i.e. it was not collapsed variant-less).
    for (const op of ops) {
      if ((op.color || '') !== '' || (op.size || '') !== '') {
        const key = lineKey(op.productId, op.color, op.size);
        const line = lines.find(
          (l) => lineKey(l.productId, l.color, l.size) === key
        );
        assert.ok(line, `variant add ${JSON.stringify(op)} produced no matching variant line (${ctx})`);
        assert.equal((line.color || ''), op.color || '', `line color must match variant add (${ctx})`);
        assert.equal((line.size || ''), op.size || '', `line size must match variant add (${ctx})`);
      }
    }
  }
});
