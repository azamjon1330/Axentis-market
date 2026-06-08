// Feature: marketplace-improvements, Property 21: Empty quantity input is treated as one
//
// Validates: Requirements 19.3
//
// Edge-case property test. The cart quantity TextInput (CartScreen.js) commits
// its raw string via clampQuantity(parseInt(raw, 10), stock). When the field is
// empty, whitespace-only, or otherwise non-numeric, parseInt(...) is NaN, which
// clampQuantity normalizes to a quantity of 1. This test asserts that behavior.
//
// fast-check is NOT a dependency of Homepage/package.json and there is no jest
// RN preset configured here, so this test uses the built-in node:test runner
// with a small seeded generator (mirroring the sibling property tests).
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

// Inputs that represent an "empty / cleared / non-numeric" quantity field.
// parseInt(...) of every one of these is NaN.
const EMPTY_OR_NON_NUMERIC = [
  '', // fully cleared field
  ' ', // single space
  '   ', // multiple spaces
  '\t', // tab
  '\n', // newline
  ' \t \n ', // mixed whitespace
  'abc', // letters
  'NaN', // literal NaN text
  '.', // bare decimal point
  '-', // bare minus sign
  '+', // bare plus sign
  'e5', // exponent without mantissa
  '$5', // currency-prefixed (parseInt stops before any digit)
  'one', // spelled-out
  'null',
  'undefined',
  '%',
  '#',
];

// Generator for "stock": mixes known finite>=1 stock with unknown
// (<1 / non-finite) values so the "treated as one" guarantee is exercised
// across every stock regime.
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

test('Property 21: empty/whitespace/non-numeric quantity input is treated as one', () => {
  const rng = mulberry32(0x21e3179e);

  for (const raw of EMPTY_OR_NON_NUMERIC) {
    // Sanity: every sampled raw string really does parse to NaN, matching the
    // CartScreen commit path `clampQuantity(parseInt(raw, 10), stock)`.
    const parsed = parseInt(raw, 10);
    assert.ok(Number.isNaN(parsed), `parseInt(${JSON.stringify(raw)}, 10) should be NaN`);

    // Exercise across many stock regimes (finite, unknown, non-finite).
    for (let i = 0; i < 50; i++) {
      const stock = genStock(rng);
      const { quantity, warning } = clampQuantity(parsed, stock);
      const ctx = `raw=${JSON.stringify(raw)} stock=${String(stock)} => ${JSON.stringify({ quantity, warning })}`;

      // The core guarantee: empty/non-numeric input commits as quantity 1.
      assert.equal(quantity, 1, `empty/non-numeric input must yield quantity 1 (${ctx})`);
      // A quantity of 1 is never above any valid stock (>= 1), so no warning fires.
      assert.equal(warning, null, `treated-as-one input must not warn (${ctx})`);
    }
  }
});

test('Property 21: cleared field (empty string) always commits to one for any finite stock', () => {
  // Focused check on the most common case: the user deletes everything in the
  // field. parseInt('') === NaN => quantity 1 regardless of the stock cap.
  for (let stock = 1; stock <= 500; stock++) {
    const { quantity, warning } = clampQuantity(parseInt('', 10), stock);
    assert.equal(quantity, 1, `cleared field must yield 1 (stock=${stock})`);
    assert.equal(warning, null, `cleared field must not warn (stock=${stock})`);
  }
});
