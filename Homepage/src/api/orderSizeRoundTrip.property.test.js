// Feature: marketplace-improvements, Property 18: Ordered items preserve their variant size
//
// Validates: Requirements 15.1, 15.2
//
// Property statement (design.md, Property 18):
//   For any ordered item that has a variant with a size, the size persisted
//   into the order and read back in the orders view equals the originally
//   selected size (and the same holds for color).
//
// The real round-trip in the app is:
//   cart item {selected_size, selected_color}
//     --(CheckoutScreen.handlePlaceOrder items.map)-->
//   order item payload {selected_size, size, selected_color, color, ...}
//     --(api/index.js mapOrder item map)-->
//   rendered order item {size, color, ...}
//
// Network mode is INTEGRATIONS_ONLY and there is no test framework / fast-check
// installed, so this test:
//   - replicates the two pure mappings below (mirrors of the production code,
//     with comments referencing the exact source), and
//   - uses a small seeded generator + node:test/node:assert instead of fast-check.
//
// If the production mappings change, update the mirrors below to match.

const test = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// Mirror #1 of Homepage/src/screens/Checkout/CheckoutScreen.js handlePlaceOrder
// (the `companyItems.map(i => { ... })` block). Pure projection of a single
// cart item into the order `items` payload. Only the fields relevant to the
// size/color round-trip are reproduced here.
//
//   const selectedColor = i.selected_color ?? i.selectedColor ?? undefined;
//   const selectedSize  = i.selected_size  ?? i.selectedSize  ?? undefined;
//   return { ..., selected_color, selected_size, color: selectedColor, size: selectedSize };
// ---------------------------------------------------------------------------
function cartItemToOrderItem(cartItem) {
  const selectedColor = cartItem.selected_color ?? cartItem.selectedColor ?? undefined;
  const selectedSize = cartItem.selected_size ?? cartItem.selectedSize ?? undefined;
  return {
    productId: cartItem.productId,
    quantity: cartItem.quantity,
    // Both snake_case (as the cart uses) and the plain color/size keys are
    // sent for backend compatibility (Req 15.1, 15.2).
    selected_color: selectedColor,
    selected_size: selectedSize,
    color: selectedColor,
    size: selectedSize,
  };
}

// ---------------------------------------------------------------------------
// Mirror #2 of Homepage/src/api/index.js mapOrder's `o.items.map((i) => ...)`.
// Pure projection of a raw order item (as returned by the backend) into the
// rendered order item. Only the size/color round-trip fields are reproduced.
//
//   color: i.color ?? i.selected_color ?? i.selectedColor,
//   size:  i.size  ?? i.selected_size  ?? i.selectedSize,
// ---------------------------------------------------------------------------
function mapOrderItem(raw) {
  return {
    productId: raw.productId ?? raw.product_id ?? 0,
    quantity: raw.quantity ?? 1,
    color: raw.color ?? raw.selected_color ?? raw.selectedColor,
    size: raw.size ?? raw.selected_size ?? raw.selectedSize,
  };
}

// Composition of the two mappings: cart line -> order payload -> rendered item.
function roundTrip(cartItem) {
  return mapOrderItem(cartItemToOrderItem(cartItem));
}

// ---------------------------------------------------------------------------
// Tiny seeded PRNG (mulberry32) + generators. Deterministic so failures
// reproduce from the printed seed.
// ---------------------------------------------------------------------------
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

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '40', '42', '44'];
const COLORS = ['Red', 'Blue', 'Green', 'Black', 'White', 'Beige'];

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

// Generate a random cart item with/without size and color, using either the
// snake_case (selected_size) or camelCase (selectedSize) key the cart may carry.
function genCartItem(rnd) {
  const hasSize = rnd() < 0.7; // bias toward having a size
  const hasColor = rnd() < 0.6;
  const useCamelForSize = rnd() < 0.5;
  const useCamelForColor = rnd() < 0.5;

  const item = {
    productId: 1 + Math.floor(rnd() * 1000),
    quantity: 1 + Math.floor(rnd() * 5),
  };

  let expectedSize;
  if (hasSize) {
    expectedSize = pick(rnd, SIZES);
    if (useCamelForSize) item.selectedSize = expectedSize;
    else item.selected_size = expectedSize;
  } else {
    expectedSize = undefined;
  }

  let expectedColor;
  if (hasColor) {
    expectedColor = pick(rnd, COLORS);
    if (useCamelForColor) item.selectedColor = expectedColor;
    else item.selected_color = expectedColor;
  } else {
    expectedColor = undefined;
  }

  return { item, expectedSize, expectedColor };
}

const ITERATIONS = 200; // >= 100 iterations per spec convention

test('Property 18: ordered items preserve their variant size (and color) through the round-trip', () => {
  const baseSeed = (process.env.PBT_SEED ? Number(process.env.PBT_SEED) : Date.now()) >>> 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const seed = (baseSeed + i) >>> 0;
    const rnd = mulberry32(seed);
    const { item, expectedSize, expectedColor } = genCartItem(rnd);

    const result = roundTrip(item);

    const ctx = `seed=${seed} input=${JSON.stringify(item)} result=${JSON.stringify(result)}`;

    // Core property: any item that has a size reads the SAME size back.
    if (expectedSize !== undefined) {
      assert.strictEqual(result.size, expectedSize, `size mismatch: ${ctx}`);
    } else {
      assert.strictEqual(result.size, undefined, `expected no size: ${ctx}`);
    }

    // Same invariant for color.
    if (expectedColor !== undefined) {
      assert.strictEqual(result.color, expectedColor, `color mismatch: ${ctx}`);
    } else {
      assert.strictEqual(result.color, undefined, `expected no color: ${ctx}`);
    }
  }
});

test('Property 18: explicit examples (snake_case, camelCase, none)', () => {
  // snake_case cart line (the shape the cart actually stores)
  assert.strictEqual(roundTrip({ productId: 1, quantity: 1, selected_size: 'M' }).size, 'M');
  // camelCase cart line
  assert.strictEqual(roundTrip({ productId: 2, quantity: 1, selectedSize: 'L' }).size, 'L');
  // size + color together
  const r = roundTrip({ productId: 3, quantity: 2, selected_size: '42', selected_color: 'Blue' });
  assert.strictEqual(r.size, '42');
  assert.strictEqual(r.color, 'Blue');
  // no variant -> no size/color
  const none = roundTrip({ productId: 4, quantity: 1 });
  assert.strictEqual(none.size, undefined);
  assert.strictEqual(none.color, undefined);
});

module.exports = { cartItemToOrderItem, mapOrderItem, roundTrip };
