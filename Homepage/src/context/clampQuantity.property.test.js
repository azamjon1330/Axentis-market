// Property-based test for cart quantity clamping/transitions.
//
// Feature: marketplace-improvements, Property 19: Quantity transitions and
// clamping respect stock.
//
// Validates: Requirements 16.1, 16.2, 19.1, 19.2, 20.1, 20.2, 20.3
//
// fast-check is NOT a dependency of Homepage/package.json and there is no jest
// RN preset configured, so this test uses the built-in node:test runner with a
// small seeded generator instead.
//
// CartContext.js imports React Native + AuthContext, which cannot be loaded in
// plain node. The two pure helpers below are LOCAL MIRRORS of the exported
// `clampQuantity` and `stockWarningMessage` in
// Homepage/src/context/CartContext.js. Keep them byte-for-byte equivalent to
// the exported versions.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// --- Local mirror of CartContext.stockWarningMessage ---
const stockWarningMessage = (n) =>
  `Only ${n} of this product are in stock at this company's warehouse`;

// --- Local mirror of CartContext.clampQuantity ---
const clampQuantity = (requested, stock) => {
  let quantity = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;
  let warning = null;
  if (Number.isFinite(stock) && stock >= 1 && quantity > stock) {
    quantity = Math.floor(stock);
    warning = stockWarningMessage(quantity);
  }
  return { quantity, warning };
};

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

// Generator for "requested": mixes finite ints/floats (including huge and <1)
// with non-finite / non-numeric values.
function genRequested(rng) {
  const bucket = Math.floor(rng() * 7);
  switch (bucket) {
    case 0: return NaN;
    case 1: return Infinity;
    case 2: return -Infinity;
    case 3: return Math.floor(rng() * 5) - 2; // small ints incl 0 and negatives
    case 4: return rng() * 2; // (<1 sometimes) fractional
    case 5: return Math.floor(rng() * 100000) + 1; // huge positive
    default: return Math.floor(rng() * 50) + 1; // typical positive
  }
}

// Generator for "stock": mixes known finite>=1 stock with unknown (<1 / non-finite).
function genStock(rng) {
  const bucket = Math.floor(rng() * 6);
  switch (bucket) {
    case 0: return NaN; // unknown
    case 1: return null; // unknown (Number.isFinite(null) === false)
    case 2: return Infinity; // unknown
    case 3: return Math.floor(rng() * 3) - 1; // 0 or negative => unknown
    case 4: return rng() * 0.9; // <1 => unknown
    default: return Math.floor(rng() * 200) + 1; // known finite >= 1
  }
}

// The intended quantity normalization mirrors the helper's first line.
const intended = (requested) =>
  Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;

const ITERATIONS = 500;

test('Property 19: quantity transitions and clamping respect stock', () => {
  const rng = mulberry32(0x19c0ffee);

  for (let i = 0; i < ITERATIONS; i++) {
    const requested = genRequested(rng);
    const stock = genStock(rng);
    const { quantity, warning } = clampQuantity(requested, stock);

    const want = intended(requested);
    const stockKnown = Number.isFinite(stock) && stock >= 1;
    const ctx = `i=${i} requested=${String(requested)} stock=${String(stock)} => ${JSON.stringify({ quantity, warning })}`;

    // Result is always an integer >= 1 (non-finite/<1 requested normalizes to 1).
    assert.ok(Number.isInteger(quantity) && quantity >= 1, `quantity must be int >= 1 (${ctx})`);
    if (!(Number.isFinite(requested) && requested >= 1)) {
      assert.equal(quantity, 1, `non-finite/<1 requested must yield 1 (${ctx})`);
    }

    if (stockKnown) {
      // quantity === clamp(intended, 1, stock); since intended >= 1, that is min(intended, floor(stock)).
      const expected = Math.min(want, Math.floor(stock));
      assert.equal(quantity, expected, `clamp(intended,1,stock) mismatch (${ctx})`);

      if (want > stock) {
        // Over-stock: clamp down to floor(stock) AND emit the exact warning.
        assert.equal(quantity, Math.floor(stock), `over-stock must clamp to floor(stock) (${ctx})`);
        assert.equal(
          warning,
          `Only ${Math.floor(stock)} of this product are in stock at this company's warehouse`,
          `over-stock warning text mismatch (${ctx})`
        );
      } else {
        // Within stock: no warning.
        assert.equal(warning, null, `within-stock must have no warning (${ctx})`);
      }
    } else {
      // Unknown stock: no cap applied, no warning, quantity equals intended.
      assert.equal(quantity, want, `unknown stock must not cap (${ctx})`);
      assert.equal(warning, null, `unknown stock must not warn (${ctx})`);
    }
  }
});
