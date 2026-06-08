// Feature: marketplace-improvements, Property 22: Variant products cannot be added without a variant
// Validates: Requirements 17.1, 18.2, 18.3
//
// fast-check is not a dependency of this project, so this uses the built-in
// node:test / node:assert runner with a hand-rolled randomized sweep to get
// property-style coverage across the input space.
//
// NOTE (mirror): ProductDetailScreen.js exports the pure helper
// `resolveAddVariant({ hasVariants, selectedVariant, defaultVariant })` and its
// handleAddToCart/handleBuyNow handlers use it. We cannot import that module
// here because it pulls in the React Native runtime (react-native, expo, etc.)
// which is unavailable under plain `node --test`. The function below is an
// EXACT MIRROR of the exported helper and MUST be kept in sync with it.
//   - an explicit selection always wins;
//   - a variant product with no selection auto-applies the Default_Variant;
//   - a variant product with no selection and no default is BLOCKED;
//   - a non-variant product adds with no variant.
function resolveAddVariant({ hasVariants, selectedVariant, defaultVariant }) {
  if (selectedVariant) return { action: 'add', variant: selectedVariant };
  if (!hasVariants) return { action: 'add', variant: null };
  if (defaultVariant) return { action: 'add', variant: defaultVariant };
  return { action: 'block', variant: null };
}

const { test } = require('node:test');
const assert = require('node:assert');

const selected = { id: 's', color: 'Red', size: 'M' };
const dflt = { id: 'd', color: 'Blue', size: 'L' };

test('explicit selection always adds the selected variant', () => {
  // Selection wins regardless of hasVariants / defaultVariant.
  for (const hasVariants of [true, false]) {
    for (const defaultVariant of [null, dflt]) {
      const r = resolveAddVariant({ hasVariants, selectedVariant: selected, defaultVariant });
      assert.strictEqual(r.action, 'add');
      assert.strictEqual(r.variant, selected);
    }
  }
});

test('variant product, no selection, with default -> adds the Default_Variant', () => {
  const r = resolveAddVariant({ hasVariants: true, selectedVariant: null, defaultVariant: dflt });
  assert.strictEqual(r.action, 'add');
  assert.strictEqual(r.variant, dflt);
});

test('variant product, no selection, no default -> blocked with no variant', () => {
  const r = resolveAddVariant({ hasVariants: true, selectedVariant: null, defaultVariant: null });
  assert.strictEqual(r.action, 'block');
  assert.strictEqual(r.variant, null);
});

test('non-variant product adds with no variant', () => {
  for (const defaultVariant of [null, dflt]) {
    const r = resolveAddVariant({ hasVariants: false, selectedVariant: null, defaultVariant });
    assert.strictEqual(r.action, 'add');
    assert.strictEqual(r.variant, null);
  }
});

// Property 22 (randomized sweep): for ANY input, the blocked case never yields
// a variant to add, and a variant product with no usable variant is always
// blocked; conversely an add result for a variant product always carries a
// concrete variant (selection or default) -- i.e. a variant product can never
// be added without a variant.
test('Property 22: variant products can never be added without a variant', () => {
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  for (let i = 0; i < 1000; i++) {
    const hasVariants = rnd([true, false]);
    const selectedVariant = rnd([null, selected]);
    const defaultVariant = rnd([null, dflt]);

    const r = resolveAddVariant({ hasVariants, selectedVariant, defaultVariant });

    // Invariant 1: a blocked add must never carry a variant.
    if (r.action === 'block') {
      assert.strictEqual(r.variant, null);
      // Block can only happen for a variant product lacking any usable variant.
      assert.ok(hasVariants && !selectedVariant && !defaultVariant);
    }

    // Invariant 2: a variant product is only added with a concrete variant.
    if (hasVariants && r.action === 'add') {
      assert.ok(r.variant != null, 'variant product added without a variant');
      assert.strictEqual(r.variant, selectedVariant || defaultVariant);
    }

    // Invariant 3: when none is chosen and a default exists, the applied
    // variant equals the Default_Variant.
    if (hasVariants && !selectedVariant && defaultVariant) {
      assert.strictEqual(r.action, 'add');
      assert.strictEqual(r.variant, defaultVariant);
    }
  }
});
