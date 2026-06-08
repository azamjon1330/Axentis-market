// Feature: marketplace-improvements, Property 14: Active photo set follows variant selection
//
// Validates: Requirements 12.2, 12.4
//
// This is a property-based test. The project has no property-testing library
// (fast-check is NOT a dependency in Homepage/package.json) and no test runner
// configured, so this test uses node's built-in `node:test` + `node:assert`
// together with a small deterministic, seeded pseudo-random generator. Run with:
//   node --test src/screens/Product/activePhotoSet.property.test.js
//
// ---------------------------------------------------------------------------
// The pure selector below is a faithful mirror of the task 22.1 gallery effect
// in Homepage/src/screens/Product/ProductDetailScreen.js, which computes the
// active gallery photo set on every selection/product change:
//
//   const variantPhotos = selectedVariant?.photos?.length > 0 ? selectedVariant.photos : null;
//   const colorVariant = (!variantPhotos && selectedColor)
//     ? variants.find(v => v.color === selectedColor && v.photos?.length > 0)
//     : null;
//   const colorPhotos = colorVariant?.photos?.length > 0 ? colorVariant.photos : null;
//   const defaultPhotos = product?.images?.length > 0 ? product.images : [];
//   const nextPhotos = variantPhotos || colorPhotos || defaultPhotos;
//
// Priority: (1) selected variant's own photos, else (2) photos of any variant
// matching the selected color, else (3) the product's default set (product.images).
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert');

// Pure mirror of the ProductDetailScreen 22.1 effect (see header comment).
function activePhotoSet({ selectedVariant, selectedColor, variants, productImages }) {
  const variantPhotos = selectedVariant?.photos?.length > 0 ? selectedVariant.photos : null;
  const colorVariant = (!variantPhotos && selectedColor)
    ? (variants || []).find(v => v.color === selectedColor && v.photos?.length > 0)
    : null;
  const colorPhotos = colorVariant?.photos?.length > 0 ? colorVariant.photos : null;
  const defaultPhotos = productImages?.length > 0 ? productImages : [];
  return variantPhotos || colorPhotos || defaultPhotos;
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

function randInt(rand, n) {
  return Math.floor(rand() * n);
}

// Build a labeled photo array (or empty). `tag` makes arrays identity-checkable.
function makePhotos(rand, tag) {
  const len = randInt(rand, 4); // 0..3
  const arr = [];
  for (let i = 0; i < len; i++) arr.push(`${tag}-photo-${i}.jpg`);
  return arr;
}

// Generate a random product: a set of variants (some with photos, some without),
// a default product.images set, and a random selection (variant/color/none).
function genCase(rand) {
  const productImages = makePhotos(rand, 'default');

  const variantCount = randInt(rand, 5); // 0..4 variants
  const variants = [];
  for (let i = 0; i < variantCount; i++) {
    const color = COLORS[randInt(rand, COLORS.length)];
    // ~half the variants carry photos, the rest are empty/absent.
    const roll = rand();
    let photos;
    if (roll < 0.4) photos = makePhotos(rand, `v${i}-${color}`).length ? makePhotos(rand, `v${i}-${color}`) : [`v${i}-${color}-p.jpg`];
    else if (roll < 0.8) photos = [];
    else photos = undefined; // exercise missing photos field
    variants.push({ id: i, color, size: `S${i}`, photos });
  }

  // Random selection mode:
  //   0 -> no selection
  //   1 -> a selected variant (one of the variants, if any)
  //   2 -> only a color selected
  const mode = randInt(rand, 3);
  let selectedVariant = null;
  let selectedColor = null;
  if (mode === 1 && variants.length > 0) {
    selectedVariant = variants[randInt(rand, variants.length)];
    // The screen also tracks color when a variant is chosen; include it sometimes.
    if (rand() < 0.5) selectedColor = selectedVariant.color;
  } else if (mode === 2) {
    // Pick a color that may or may not match a variant.
    selectedColor = COLORS[randInt(rand, COLORS.length)];
  }

  return { selectedVariant, selectedColor, variants, productImages };
}

test('Property 14: active photo set follows variant selection priority', () => {
  const ITERATIONS = 1000;
  const rand = mulberry32(0x5eed14a7);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const c = genCase(rand);
    const result = activePhotoSet(c);

    const defaultSet = c.productImages?.length > 0 ? c.productImages : [];

    if (c.selectedVariant?.photos?.length > 0) {
      // (1) Selected variant with photos -> exactly its photos.
      assert.strictEqual(
        result,
        c.selectedVariant.photos,
        `iter ${iter}: selected variant with photos should win`
      );
    } else if (
      !(c.selectedVariant?.photos?.length > 0) &&
      c.selectedColor &&
      c.variants.some(v => v.color === c.selectedColor && v.photos?.length > 0)
    ) {
      // (2) No usable variant photos, color selected, a matching variant has
      //     photos -> the FIRST matching variant's photos (Array.find order).
      const expected = c.variants.find(
        v => v.color === c.selectedColor && v.photos?.length > 0
      ).photos;
      assert.strictEqual(
        result,
        expected,
        `iter ${iter}: first color-matching variant's photos should win`
      );
    } else if (defaultSet.length > 0) {
      // (3a) Otherwise, when the product has default images -> exactly that set.
      assert.strictEqual(
        result,
        c.productImages,
        `iter ${iter}: default product images should be used`
      );
    } else {
      // (3b) No usable variant/color/default photos -> a fresh empty array.
      //      (The selector returns a new [] when product.images is empty, so we
      //      assert structural emptiness, not reference identity.)
      assert.deepStrictEqual(
        result,
        [],
        `iter ${iter}: empty default should yield an empty array`
      );
    }

    // Invariant: the selector always returns an array.
    assert.ok(Array.isArray(result), `iter ${iter}: result must be an array`);
  }
});

test('Property 14: explicit representative examples', () => {
  const vRed = { id: 1, color: 'Red', size: 'M', photos: ['red-1.jpg', 'red-2.jpg'] };
  const vBlueNoPhotos = { id: 2, color: 'Blue', size: 'M', photos: [] };
  const vGreen = { id: 3, color: 'Green', size: 'L', photos: ['green-1.jpg'] };
  const variants = [vRed, vBlueNoPhotos, vGreen];
  const productImages = ['default-1.jpg', 'default-2.jpg'];

  // Selected variant with photos -> its photos.
  assert.strictEqual(
    activePhotoSet({ selectedVariant: vRed, selectedColor: 'Red', variants, productImages }),
    vRed.photos
  );

  // Selected variant without photos but color matches a photo-bearing variant.
  // (selectedVariant has no photos, so we fall through to color match.)
  assert.strictEqual(
    activePhotoSet({ selectedVariant: vBlueNoPhotos, selectedColor: 'Green', variants, productImages }),
    vGreen.photos
  );

  // Only color selected, matching variant has photos -> that variant's photos.
  assert.strictEqual(
    activePhotoSet({ selectedVariant: null, selectedColor: 'Green', variants, productImages }),
    vGreen.photos
  );

  // Only color selected, matching variant has NO photos -> default set.
  assert.strictEqual(
    activePhotoSet({ selectedVariant: null, selectedColor: 'Blue', variants, productImages }),
    productImages
  );

  // Color selected but no matching variant -> default set.
  assert.strictEqual(
    activePhotoSet({ selectedVariant: null, selectedColor: 'Yellow', variants, productImages }),
    productImages
  );

  // Nothing selected -> default set (product.images).
  assert.strictEqual(
    activePhotoSet({ selectedVariant: null, selectedColor: null, variants, productImages }),
    productImages
  );

  // Nothing selected and no product images -> empty array.
  assert.deepStrictEqual(
    activePhotoSet({ selectedVariant: null, selectedColor: null, variants, productImages: [] }),
    []
  );
});

module.exports = { activePhotoSet };
