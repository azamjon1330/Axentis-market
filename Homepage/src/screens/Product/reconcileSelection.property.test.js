// Feature: marketplace-improvements, Property 17: Variant selection survives product refresh
//
// Validates: Requirements 14.1, 14.2
//
// This is a property-based test. The project has no property-testing library
// (fast-check is NOT a dependency in Homepage/package.json) and no test runner
// configured, so this test uses node's built-in `node:test` + `node:assert`
// together with a small deterministic, seeded pseudo-random generator. Run with:
//   node --test src/screens/Product/reconcileSelection.property.test.js
//
// ---------------------------------------------------------------------------
// The pure function below is a faithful mirror of the task 23.1 "stable variant
// selection across product/variant refresh" effect in
// Homepage/src/screens/Product/ProductDetailScreen.js. That [variants]-keyed
// effect re-resolves the buyer's selection whenever the variants array refreshes
// (loadAll re-runs, polling, etc.) WITHOUT clobbering the active selection:
//
//   const colorStillExists = color ? variants.some(v => v.color === color) : true;
//   const nextColor = colorStillExists ? color : null;
//
//   const sizeStillExists = size
//     ? variants.some(v => (nextColor ? v.color === nextColor : true) && v.size === size)
//     : true;
//   const nextSize = sizeStillExists ? size : null;
//
//   let nextVariant = null;
//   if (nextSize) {
//     nextVariant = variants.find(v => v.color === nextColor && v.size === nextSize)
//       ?? variants.find(v => v.size === nextSize)
//       ?? null;
//   }
//
// Logic: keep selectedColor iff it still exists in the NEW variants; keep
// selectedSize iff it still exists for the (kept) color; re-resolve the variant
// object from the NEW variants array; only prune values that disappeared.
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert');

// Pure mirror of the ProductDetailScreen 23.1 effect (see header comment).
// reconcileSelection({ color, size }, newVariants) => { color, size, variant }
function reconcileSelection({ color, size }, newVariants) {
  const variants = newVariants || [];

  // Preserve color only if it still exists in the refreshed variants.
  const colorStillExists = color ? variants.some(v => v.color === color) : true;
  const nextColor = colorStillExists ? (color ?? null) : null;

  // Preserve size only if it still exists for the (kept) color.
  const sizeStillExists = size
    ? variants.some(v => (nextColor ? v.color === nextColor : true) && v.size === size)
    : true;
  const nextSize = sizeStillExists ? (size ?? null) : null;

  // Re-resolve the variant object from the NEW variants array.
  let nextVariant = null;
  if (nextSize) {
    nextVariant = variants.find(v => v.color === nextColor && v.size === nextSize)
      ?? variants.find(v => v.size === nextSize)
      ?? null;
  }

  return { color: nextColor, size: nextSize, variant: nextVariant };
}

// --- Deterministic seeded PRNG (mulberry32) so runs are reproducible. ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['Red', 'Blue', 'Green', 'Black', 'White'];
const SIZES = ['S', 'M', 'L', 'XL'];

function randInt(rand, n) {
  return Math.floor(rand() * n);
}

// Generate a random set of variants. A small color/size pool guarantees
// frequent collisions (same size across colors) so the size-preservation edge
// cases are actually exercised.
function genVariants(rand) {
  const count = randInt(rand, 6); // 0..5 variants
  const variants = [];
  for (let i = 0; i < count; i++) {
    variants.push({
      id: i,
      color: COLORS[randInt(rand, COLORS.length)],
      size: SIZES[randInt(rand, SIZES.length)],
    });
  }
  return variants;
}

// Generate a prior (color,size) selection, biased to cover all scenarios:
//   mode 0 -> an existing (color,size) pair (scenario a: survives refresh)
//   mode 1 -> existing color, but a size not present for that color (scenario c)
//   mode 2 -> a color that is absent from the variants (scenario b)
//   mode 3 -> fully random (may be null / absent / present)
function genSelection(rand, variants) {
  const mode = randInt(rand, 4);

  if (mode === 0 && variants.length > 0) {
    const v = variants[randInt(rand, variants.length)];
    return { color: v.color, size: v.size };
  }

  if (mode === 1 && variants.length > 0) {
    const v = variants[randInt(rand, variants.length)];
    const sizesForColor = new Set(variants.filter(x => x.color === v.color).map(x => x.size));
    const missingSize = SIZES.find(s => !sizesForColor.has(s)) ?? 'ZZZ';
    return { color: v.color, size: missingSize };
  }

  if (mode === 2) {
    const presentColors = new Set(variants.map(v => v.color));
    const absentColor = COLORS.find(c => !presentColors.has(c)) ?? 'NoSuchColor';
    return { color: absentColor, size: SIZES[randInt(rand, SIZES.length)] };
  }

  // mode 3: fully random, sometimes null
  const color = rand() < 0.2 ? null : COLORS[randInt(rand, COLORS.length)];
  const size = rand() < 0.2 ? null : SIZES[randInt(rand, SIZES.length)];
  return { color, size };
}

test('Property 17: variant selection survives product refresh (and prunes only what disappeared)', () => {
  const ITERATIONS = 2000;
  const rand = mulberry32(0x17abcdef);

  // Coverage counters so we can confirm each scenario was actually generated.
  let coveredSurvive = 0; // (a)
  let coveredColorGone = 0; // (b)
  let coveredSizeGoneForColor = 0; // (c)

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const variants = genVariants(rand);
    const prior = genSelection(rand, variants);
    const { color, size } = prior;
    const r = reconcileSelection(prior, variants);

    const pairExists =
      color != null && size != null &&
      variants.some(v => v.color === color && v.size === size);
    const colorExists = color != null && variants.some(v => v.color === color);

    // (a) Survives refresh: if the selected (color,size) still exists in the NEW
    //     variants, color & size are unchanged AND variant is the matching object
    //     drawn FROM the new variants (Req 14.1, 14.2).
    if (pairExists) {
      coveredSurvive++;
      assert.strictEqual(r.color, color, `iter ${iter}: surviving color must be unchanged`);
      assert.strictEqual(r.size, size, `iter ${iter}: surviving size must be unchanged`);
      assert.ok(r.variant, `iter ${iter}: a surviving selection must resolve a variant`);
      assert.strictEqual(r.variant.color, color, `iter ${iter}: resolved variant color must match`);
      assert.strictEqual(r.variant.size, size, `iter ${iter}: resolved variant size must match`);
      assert.ok(variants.includes(r.variant), `iter ${iter}: variant must reference the NEW array`);
    }

    // (b) Color disappeared -> color is pruned to null. (Per the 23.1 logic the
    //     size is then only retained if it still exists on some remaining
    //     variant; otherwise it too is pruned.)
    if (color != null && !colorExists) {
      coveredColorGone++;
      assert.strictEqual(r.color, null, `iter ${iter}: vanished color must be pruned to null`);
      const sizeStillSomewhere = size != null && variants.some(v => v.size === size);
      if (!sizeStillSomewhere) {
        assert.strictEqual(r.size, null, `iter ${iter}: vanished size must be pruned to null`);
        assert.strictEqual(r.variant, null, `iter ${iter}: no variant when size is gone`);
      } else {
        assert.strictEqual(r.size, size, `iter ${iter}: size present elsewhere is retained`);
      }
    }

    // (c) Color still exists but the selected size disappeared FOR THAT COLOR ->
    //     size pruned to null, color kept.
    if (colorExists && size != null && !variants.some(v => v.color === color && v.size === size)) {
      coveredSizeGoneForColor++;
      assert.strictEqual(r.color, color, `iter ${iter}: existing color must be kept`);
      assert.strictEqual(r.size, null, `iter ${iter}: size gone for color must be pruned`);
      assert.strictEqual(r.variant, null, `iter ${iter}: no variant when size pruned`);
    }

    // (d) Reconciled values always reference the NEW variants array: any
    //     non-null resolved variant must be an element of `variants`.
    if (r.variant != null) {
      assert.ok(variants.includes(r.variant), `iter ${iter}: resolved variant must come from NEW variants`);
    }

    // Structural invariant: result fields are never undefined.
    assert.ok('color' in r && 'size' in r && 'variant' in r, `iter ${iter}: shape must be { color, size, variant }`);
    assert.notStrictEqual(r.color, undefined, `iter ${iter}: color must be value or null`);
    assert.notStrictEqual(r.size, undefined, `iter ${iter}: size must be value or null`);
  }

  // Make sure the generator actually exercised every scenario the property
  // describes; otherwise the test would be vacuously passing.
  assert.ok(coveredSurvive > 0, 'expected some survives-refresh cases');
  assert.ok(coveredColorGone > 0, 'expected some color-disappeared cases');
  assert.ok(coveredSizeGoneForColor > 0, 'expected some size-gone-for-color cases');
});

test('Property 17: explicit representative examples', () => {
  const red_M = { id: 1, color: 'Red', size: 'M' };
  const red_L = { id: 2, color: 'Red', size: 'L' };
  const blue_M = { id: 3, color: 'Blue', size: 'M' };

  // (a) Selected (Red, M) still present after refresh -> unchanged, variant from new array.
  const newVariants1 = [{ id: 11, color: 'Red', size: 'M' }, { id: 12, color: 'Blue', size: 'M' }];
  const r1 = reconcileSelection({ color: 'Red', size: 'M' }, newVariants1);
  assert.strictEqual(r1.color, 'Red');
  assert.strictEqual(r1.size, 'M');
  assert.strictEqual(r1.variant, newVariants1[0]); // re-resolved FROM the NEW array (id 11, not 1)
  assert.ok(newVariants1.includes(r1.variant));

  // (b) Color disappeared entirely (Red gone, and size M no longer anywhere) -> all pruned.
  const r2 = reconcileSelection({ color: 'Red', size: 'M' }, [{ id: 21, color: 'Green', size: 'L' }]);
  assert.deepStrictEqual(r2, { color: null, size: null, variant: null });

  // (c) Color kept (Red exists) but size L for Red disappeared -> size pruned, color kept.
  const r3 = reconcileSelection({ color: 'Red', size: 'L' }, [{ id: 31, color: 'Red', size: 'M' }]);
  assert.strictEqual(r3.color, 'Red');
  assert.strictEqual(r3.size, null);
  assert.strictEqual(r3.variant, null);

  // (b-variant) Color disappeared but the size survives on another color -> size retained,
  //             variant re-resolved by size from the NEW array (mirrors `?? find(size)`).
  const newVariants4 = [{ id: 41, color: 'Blue', size: 'M' }];
  const r4 = reconcileSelection({ color: 'Red', size: 'M' }, newVariants4);
  assert.strictEqual(r4.color, null);
  assert.strictEqual(r4.size, 'M');
  assert.strictEqual(r4.variant, newVariants4[0]);
  assert.ok(newVariants4.includes(r4.variant));

  // Nothing selected -> nothing resolved.
  assert.deepStrictEqual(
    reconcileSelection({ color: null, size: null }, [red_M, red_L, blue_M]),
    { color: null, size: null, variant: null }
  );

  // Empty refreshed variants -> everything pruned.
  assert.deepStrictEqual(
    reconcileSelection({ color: 'Red', size: 'M' }, []),
    { color: null, size: null, variant: null }
  );
});

module.exports = { reconcileSelection };
