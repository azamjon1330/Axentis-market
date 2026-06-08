/**
 * Feature: marketplace-improvements, Property 11: Uzbek label coverage is complete
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 *
 * Property 11 (design.md): "For any required product-card, home-card, or selection
 * label key, the Uzbek (`uz`) translation table contains a non-empty value."
 *
 * Approach (and why it is NOT tautological):
 *   LanguageContext.js imports React Native + AsyncStorage, so it cannot be `require`d
 *   in a plain Node process. Replicating the `uz` keyset inside the test would be
 *   tautological (the test would only check itself). Instead we read the ACTUAL
 *   LanguageContext.js source from disk and extract the real `translations` object
 *   literal (it is a pure object of string values with no references to the imported
 *   modules), then evaluate that literal. Every assertion therefore runs against the
 *   exact `ru`/`uz` maps that ship at runtime — if a required `uz` value is missing or
 *   empty in the source, this test fails.
 *
 * Two complementary checks:
 *   1. REQUIRED_KEYS: the explicit product-card / home-card / selection keys added by
 *      task 20.1 (plus the pre-existing card keys) each have a non-empty `uz` string.
 *   2. Complete coverage: EVERY key present in `ru` also has a non-empty `uz` value.
 *
 * Property-based execution is hand-rolled (no fast-check / no test runner is present in
 * Homepage/package.json): a deterministic generator samples keys across many iterations
 * and asserts the invariant holds for each sampled key.
 *
 * Run with:  node --test src/context/uzbekCoverage.property.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

// --- Load the real translations object from LanguageContext.js source ----------------

const SRC_PATH = path.join(__dirname, 'LanguageContext.js');

function extractTranslations(source) {
  const marker = 'const translations =';
  const markerIdx = source.indexOf(marker);
  assert.ok(markerIdx !== -1, 'Could not locate `const translations =` in LanguageContext.js');

  // Find the opening brace of the object literal and balance braces, ignoring
  // brace characters that appear inside string literals.
  const openIdx = source.indexOf('{', markerIdx);
  assert.ok(openIdx !== -1, 'Could not locate opening brace of translations object');

  let depth = 0;
  let endIdx = -1;
  let stringQuote = null;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (stringQuote) {
      if (ch === stringQuote && prev !== '\\') stringQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      stringQuote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  assert.ok(endIdx !== -1, 'Could not find matching closing brace for translations object');

  const objLiteral = source.slice(openIdx, endIdx + 1);
  // The literal contains only string values + line comments — safe to evaluate.
  // eslint-disable-next-line no-eval
  const obj = eval('(' + objLiteral + ')');
  assert.ok(obj && typeof obj === 'object', 'Parsed translations is not an object');
  return obj;
}

const source = fs.readFileSync(SRC_PATH, 'utf8');
const translations = extractTranslations(source);
const ru = translations.ru || {};
const uz = translations.uz || {};

// Required product-card / home-card / selection label keys.
// (Keys added by task 20.1 plus the pre-existing card/selection keys per the task spec.)
const REQUIRED_KEYS = [
  // home-card labels (Req 10.2)
  'topCompanies',
  // product-card labels (Req 10.1)
  'priceFrom',
  'topBadge',
  // selection label & text (Req 10.3)
  'colorLabel',
  'sizeLabel',
  'chooseVariant',
  'chooseColorAndSize',
  'chooseSize',
  'outOfStockShort',
  'buyNow',
  // pre-existing card keys
  'sum',
  'searchPlaceholder',
  'notFound',
  'noProducts',
  'catalogTitle',
  'allProducts',
];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// --- Deterministic PRNG so the property run is reproducible ---------------------------

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// --- Sanity: extraction actually produced both maps ----------------------------------

test('sanity: ru and uz translation maps parsed from source are non-empty', () => {
  assert.ok(Object.keys(ru).length > 0, 'ru map should not be empty');
  assert.ok(Object.keys(uz).length > 0, 'uz map should not be empty');
});

// --- Property 11 (required keys), example-style exhaustive check ----------------------

test('Property 11: every REQUIRED key has a non-empty uz value (exhaustive)', () => {
  const missing = REQUIRED_KEYS.filter((k) => !isNonEmptyString(uz[k]));
  assert.deepStrictEqual(
    missing,
    [],
    `Required keys missing a non-empty uz value: ${missing.join(', ')}`
  );
});

// --- Property 11 (complete coverage): every ru key has a non-empty uz value ----------

test('Property 11: every key present in ru has a non-empty uz value (complete coverage)', () => {
  const missing = Object.keys(ru).filter((k) => !isNonEmptyString(uz[k]));
  assert.deepStrictEqual(
    missing,
    [],
    `Keys present in ru but missing a non-empty uz value: ${missing.join(', ')}`
  );
});

// --- Property 11 as a hand-rolled property test (randomized sampling) ----------------

test('Property 11 (property-based): sampled label keys always have a non-empty uz value', () => {
  const ITERATIONS = 300;
  const rng = makeRng(0xC0FFEE);
  const ruKeys = Object.keys(ru);
  // Pool = required card/selection keys + all base-language keys (complete-coverage clause).
  const pool = Array.from(new Set([...REQUIRED_KEYS, ...ruKeys]));
  assert.ok(pool.length > 0, 'key pool should not be empty');

  for (let i = 0; i < ITERATIONS; i++) {
    const key = pool[Math.floor(rng() * pool.length)];
    assert.ok(
      isNonEmptyString(uz[key]),
      `uz translation for "${key}" must be a non-empty string (got: ${JSON.stringify(uz[key])})`
    );
  }
});
