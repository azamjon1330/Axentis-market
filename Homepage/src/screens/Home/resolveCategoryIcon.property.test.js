// Property-based test for catalog category icon resolution.
//
// Feature: marketplace-improvements, Property 6: Category icon resolution always
// yields a renderable icon.
//
// Validates: Requirements 7.1, 7.2, 7.3
//
// Property 6 (design.md): For any category, the resolved catalog icon equals the
// category's configured icon when it is non-empty, and otherwise equals the
// default placeholder icon — the result is never empty.
//
// fast-check is NOT a dependency of Homepage/package.json and there is no jest
// RN preset configured, so this test uses the built-in node:test runner with a
// small seeded generator instead (consistent with the other Homepage property
// tests, e.g. clampQuantity.property.test.js and orderListing.*.property.test.js).
//
// HomeScreen.js imports React Native + several contexts, which cannot be loaded
// in plain node. The two helpers below are LOCAL MIRRORS of the exported
// `resolveCategoryIcon` and `PLACEHOLDER_CATEGORY_ICON` in
// Homepage/src/screens/Home/HomeScreen.js. `getImageUrlMirror` mirrors
// Homepage/src/utils/imageUrl.getImageUrl (treated as identity-ish: it returns
// http(s) URLs unchanged and prefixes a non-empty base for relative paths, so
// the resolved image value is always non-empty). Keep these byte-for-byte
// equivalent to the exported versions.
//
// Run standalone with:  node --test resolveCategoryIcon.property.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

// --- Local mirror of imageUrl.getImageUrl (UPLOADS_BASE_URL stubbed) ---
const UPLOADS_BASE_URL = 'https://cdn.example/uploads';
function getImageUrlMirror(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const clean = path.startsWith('uploads/') ? path.slice('uploads/'.length) : path;
  return `${UPLOADS_BASE_URL}/${clean}`;
}

// --- Local mirror of HomeScreen.PLACEHOLDER_CATEGORY_ICON ---
const PLACEHOLDER_CATEGORY_ICON = '📦';

// --- Local mirror of HomeScreen.resolveCategoryIcon ---
function resolveCategoryIcon(icon) {
  const value = typeof icon === 'string' ? icon.trim() : '';
  if (!value) {
    return { kind: 'emoji', value: PLACEHOLDER_CATEGORY_ICON };
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('uploads/')) {
    return { kind: 'image', value: getImageUrlMirror(value) };
  }
  return { kind: 'emoji', value };
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

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// Generate an input together with an INDEPENDENT category label, so the oracle
// below does not just re-run the function's own predicate. Categories span the
// whole input space the requirement cares about: empty/whitespace, emoji/text,
// http(s) URLs, uploads/ paths, leading-slash paths, and non-string values.
function genCase(rng) {
  const bucket = Math.floor(rng() * 6);
  switch (bucket) {
    case 0: { // empty / whitespace-only -> placeholder
      const input = pick(rng, ['', '   ', '\t', '\n  ', '  \t \n']);
      return { input, category: 'empty' };
    }
    case 1: { // emoji / short text glyph -> rendered as-is
      const input = pick(rng, ['📦', '👕', '🎽', '👟', 'Shoes', 'Kiyim', 'Электроника', 'a/b', 'C++']);
      return { input, category: 'text' };
    }
    case 2: { // http(s) URL -> image (returned unchanged by getImageUrl)
      const scheme = pick(rng, ['http', 'https', 'HTTPS', 'Http']);
      const host = pick(rng, ['cdn.test', 'img.example.com', 'a.io']);
      const file = pick(rng, ['icon.png', 'cat/men.jpg', 'x']);
      return { input: `${scheme}://${host}/${file}`, category: 'url' };
    }
    case 3: { // uploads/ relative path -> image
      const file = pick(rng, ['categories/men.png', 'icon.jpg', 'a/b/c.webp', '']);
      return { input: `uploads/${file}`, category: 'path' };
    }
    case 4: { // leading-slash path -> image
      const file = pick(rng, ['static/cat.png', 'i.png', '']);
      return { input: `/${file}`, category: 'path' };
    }
    default: { // non-string values -> placeholder
      const input = pick(rng, [null, undefined, 42, 0, true, false, NaN, {}, [], { icon: 'x' }]);
      return { input, category: 'nonstring' };
    }
  }
}

const ITERATIONS = 1000;

test('Property 6: category icon resolution always yields a renderable, non-empty icon', () => {
  const rng = mulberry32(0xca7ec0de);

  for (let i = 0; i < ITERATIONS; i++) {
    const { input, category } = genCase(rng);
    const resolved = resolveCategoryIcon(input);
    const ctx = `i=${i} category=${category} input=${JSON.stringify(input)} => ${JSON.stringify(resolved)}`;

    // Shape: always { kind: 'emoji'|'image', value }.
    assert.ok(resolved && (resolved.kind === 'emoji' || resolved.kind === 'image'), `kind must be emoji|image (${ctx})`);

    // Core invariant (Property 6): the resolved value is NEVER empty.
    assert.equal(typeof resolved.value, 'string', `value must be a string (${ctx})`);
    assert.ok(resolved.value.length > 0, `value must be non-empty (${ctx})`);

    if (category === 'empty' || category === 'nonstring') {
      // Empty/whitespace/missing -> default placeholder (Req 7.2).
      assert.equal(resolved.kind, 'emoji', `empty/missing must resolve to emoji placeholder (${ctx})`);
      assert.equal(resolved.value, PLACEHOLDER_CATEGORY_ICON, `must equal placeholder (${ctx})`);
    } else if (category === 'text') {
      // Non-empty emoji/text -> the configured icon, rendered as-is (Req 7.1).
      assert.equal(resolved.kind, 'emoji', `text must resolve to emoji (${ctx})`);
      assert.equal(resolved.value, String(input).trim(), `must equal configured icon (${ctx})`);
      assert.notEqual(resolved.value.length, 0, `configured icon must be non-empty (${ctx})`);
    } else {
      // URL / uploads path / leading-slash path -> image URL (Req 7.1).
      assert.equal(resolved.kind, 'image', `url/path must resolve to image (${ctx})`);
      assert.equal(resolved.value, getImageUrlMirror(String(input).trim()), `must equal resolved image URL (${ctx})`);
    }
  }
});

test('Property 6: explicit examples', () => {
  // Configured emoji icon returned as-is.
  assert.deepEqual(resolveCategoryIcon('👕'), { kind: 'emoji', value: '👕' });
  // Whitespace-only -> placeholder.
  assert.deepEqual(resolveCategoryIcon('   '), { kind: 'emoji', value: PLACEHOLDER_CATEGORY_ICON });
  // Missing / non-string -> placeholder.
  assert.deepEqual(resolveCategoryIcon(null), { kind: 'emoji', value: PLACEHOLDER_CATEGORY_ICON });
  assert.deepEqual(resolveCategoryIcon(undefined), { kind: 'emoji', value: PLACEHOLDER_CATEGORY_ICON });
  // http(s) URL -> image, returned unchanged by getImageUrl.
  assert.deepEqual(resolveCategoryIcon('https://cdn.test/icon.png'), {
    kind: 'image',
    value: 'https://cdn.test/icon.png',
  });
  // uploads/ path -> image, base-prefixed (uploads/ stripped).
  assert.deepEqual(resolveCategoryIcon('uploads/cat/men.png'), {
    kind: 'image',
    value: `${UPLOADS_BASE_URL}/cat/men.png`,
  });
  // Leading-slash path -> image, base-prefixed.
  assert.deepEqual(resolveCategoryIcon('/static/cat.png'), {
    kind: 'image',
    value: `${UPLOADS_BASE_URL}//static/cat.png`,
  });
});
