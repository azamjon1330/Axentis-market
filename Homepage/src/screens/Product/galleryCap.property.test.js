// Feature: marketplace-improvements, Property 12: Gallery renders at most six photos
//
// Validates: Requirements 11.1
//
// This is a property-based test. The project has no property-testing library
// (fast-check is not a dependency in Homepage/package.json) and no test runner
// configured, so this test uses node's built-in `node:test` + `node:assert`
// together with a small deterministic, seeded pseudo-random generator. Run with:
//   node --test src/screens/Product/galleryCap.property.test.js
//
// The rule under test mirrors ProductDetailScreen.js line ~166:
//   const galleryImages = (galleryPhotos || []).slice(0, 6);
// i.e. the gallery renders at most six photos, taken as a prefix of the input.

const test = require('node:test');
const assert = require('node:assert');

const GALLERY_CAP = 6;

// Pure mirror of the ProductDetailScreen gallery cap logic:
//   `const galleryImages = (galleryPhotos || []).slice(0, 6);`
// (see Homepage/src/screens/Product/ProductDetailScreen.js).
function cappedGallery(photos) {
  return (photos || []).slice(0, GALLERY_CAP);
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

// Generate a random photo array. With small probability return null/undefined
// to exercise the nullish-input path. Lengths intentionally include values
// well above the cap of 6.
function genPhotos(rand, maxLen) {
  const roll = rand();
  if (roll < 0.05) return null;
  if (roll < 0.1) return undefined;
  const len = Math.floor(rand() * (maxLen + 1)); // 0..maxLen inclusive
  const arr = [];
  for (let i = 0; i < len; i++) {
    arr.push({ id: i, url: `https://example.com/photo-${i}.jpg` });
  }
  return arr;
}

test('Property 12: gallery renders at most six photos (min(length, 6))', () => {
  const ITERATIONS = 500;
  const MAX_LEN = 30; // includes many cases > 6
  const rand = mulberry32(0x12345678);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const input = genPhotos(rand, MAX_LEN);
    const result = cappedGallery(input);
    const inputLen = (input || []).length;
    const expectedLen = Math.min(inputLen, GALLERY_CAP);

    // 1. result length === min(length, 6)
    assert.strictEqual(
      result.length,
      expectedLen,
      `length mismatch: input length ${inputLen} -> expected ${expectedLen}, got ${result.length}`
    );

    // 2. never more than 6
    assert.ok(result.length <= GALLERY_CAP, `rendered ${result.length} > ${GALLERY_CAP}`);

    // 3. result is a prefix of the input (same elements, same order)
    const source = input || [];
    for (let i = 0; i < result.length; i++) {
      assert.strictEqual(result[i], source[i], `element ${i} is not a faithful prefix of input`);
    }
  }
});

test('Property 12: explicit boundary examples', () => {
  assert.strictEqual(cappedGallery(null).length, 0);
  assert.strictEqual(cappedGallery(undefined).length, 0);
  assert.strictEqual(cappedGallery([]).length, 0);
  assert.strictEqual(cappedGallery([1, 2, 3]).length, 3); // below cap
  assert.strictEqual(cappedGallery([1, 2, 3, 4, 5, 6]).length, 6); // exactly cap
  assert.strictEqual(cappedGallery([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).length, 6); // above cap
  assert.deepStrictEqual(cappedGallery([1, 2, 3, 4, 5, 6, 7]), [1, 2, 3, 4, 5, 6]); // prefix
});

module.exports = { cappedGallery, GALLERY_CAP };
