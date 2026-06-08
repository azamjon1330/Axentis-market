// Feature: marketplace-improvements, Property 1: Translation resolution never leaks raw keys
//
// Validates: Requirements 1.1, 1.3
//
// Property 1 (from design.md): "For any label key defined in the base language and any
// supported language, translate(key, lang) returns that language's value, or a defined
// fallback string -- never the raw key and never empty."
//
// Resolution API under test (src/utils/translations.tsx):
//   - `translations` is a Record<Language, Translations> map keyed by language ('ru' | 'uz').
//   - `useTranslation(lang)` returns `translations[lang] || translations.uz`, i.e. the table
//     used to resolve a label key. Resolving a key is therefore `useTranslation(lang)[key]`.
//   There is no separate `translate()` symbol; key resolution is a property access on the
//   table returned by `useTranslation`, with `translations.uz` acting as the table-level
//   fallback. This test exercises that real resolution path.
//
// ---------------------------------------------------------------------------------------
// Runner / dependency note:
//   The design names `fast-check` as the JS property-testing library, but `fast-check` is
//   NOT listed in package.json (the web project currently declares no test runner at all).
//   Per the task's fallback, this test therefore uses a small hand-rolled, seeded generator
//   instead of adding a new dependency, and the built-in Node test runner (`node:test` /
//   `node:assert`) which ships with the Node runtime (no install required).
//
//   This sandbox is INTEGRATIONS_ONLY with no node_modules installed, so the test is not
//   expected to execute here. In an environment with the project's TypeScript toolchain
//   available it can be run, for example, with:
//       node --import tsx --test src/utils/translations.property.test.ts
//   or under vitest (`vitest run src/utils/translations.property.test.ts`) if the team adds
//   a runner -- the assertions and generator are framework-agnostic in spirit and only rely
//   on the standard `node:test` / `node:assert` APIs.
// ---------------------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';

import { translations, useTranslation, type Language } from './translations';

// --- Hand-rolled deterministic PRNG (mulberry32) for reproducible sampling -------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

// --- The base-language key set and the supported languages -----------------------------
// The base language is the canonical, fully-populated table. 'ru' is declared first in
// translations.tsx and implements every field of the `Translations` interface, so its keys
// are the authoritative label-key set.
const BASE_LANGUAGE: Language = 'ru';
const baseKeys: string[] = Object.keys(translations[BASE_LANGUAGE]);
const supportedLanguages = Object.keys(translations) as Language[]; // ['ru', 'uz']

// --- The property predicate ------------------------------------------------------------
// A resolved value is acceptable iff it is defined, non-empty, and not the raw key string.
// Values in this table are either strings or string[] (e.g. monthsShort, daysOfWeek), so a
// "non-empty" array means length > 0 with every element a non-empty string.
function isNonEmptyValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((el) => typeof el === 'string' && el.trim().length > 0);
  }
  return false;
}

function describeFailure(key: string, lang: Language, value: unknown): string {
  return (
    `Property 1 violated -- translation resolution leaked a raw key or empty value.\n` +
    `  counterexample: { key: ${JSON.stringify(key)}, lang: ${JSON.stringify(lang)} }\n` +
    `  resolved value: ${JSON.stringify(value)}`
  );
}

// Resolve a label key the same way production code does: index the table returned by
// useTranslation(lang). useTranslation falls back to translations.uz at the table level.
function resolve(key: string, lang: Language): unknown {
  return (useTranslation(lang) as Record<string, unknown>)[key];
}

// Assert the property for a single (key, lang) sample.
function assertProperty1(key: string, lang: Language): void {
  const value = resolve(key, lang);

  // Never empty / never undefined: a defined, non-empty value (string or string[]).
  assert.ok(isNonEmptyValue(value), describeFailure(key, lang, value));

  // Never leaks the raw key itself.
  assert.notStrictEqual(value, key, describeFailure(key, lang, value));
}

// --- Property-based test: random sampling over (key x supported-language) --------------
test('Property 1: translation resolution never leaks raw keys (randomized)', () => {
  // A fixed seed keeps failures reproducible; printed below so a counterexample can be
  // replayed deterministically.
  const SEED = 0x1f2e3d4c;
  const ITERATIONS = 200; // design requires a minimum of 100 iterations
  const rng = mulberry32(SEED);

  assert.ok(baseKeys.length > 0, 'expected the base language table to define label keys');
  assert.ok(supportedLanguages.length > 0, 'expected at least one supported language');

  for (let i = 0; i < ITERATIONS; i++) {
    const key = pick(rng, baseKeys);
    const lang = pick(rng, supportedLanguages);
    try {
      assertProperty1(key, lang);
    } catch (err) {
      // Surface the failing seed alongside the counterexample for reproducibility.
      const note = `\n  (seed: 0x${SEED.toString(16)}, iteration: ${i})`;
      if (err instanceof assert.AssertionError) {
        err.message += note;
      }
      throw err;
    }
  }
});

// --- Exhaustive companion check: strengthens the property to full coverage --------------
// Random sampling can miss a single bad key; this deterministic pass guarantees that EVERY
// base key resolves to a non-empty, non-key value in EVERY supported language.
test('Property 1: translation resolution never leaks raw keys (exhaustive)', () => {
  for (const lang of supportedLanguages) {
    for (const key of baseKeys) {
      assertProperty1(key, lang);
    }
  }
});
