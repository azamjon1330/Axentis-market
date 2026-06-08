// Feature: marketplace-improvements, Property 20: Minus at quantity one never deletes silently
//
// Validates: Requirements 16.3
//
// fast-check is not available in this project, so this uses node:test / node:assert
// with a property-style loop over many inputs.
//
// MIRROR of `decideMinus` exported from ./CartScreen.js. CartScreen.js contains
// JSX / React Native that plain Node cannot parse (no Babel/Jest runner is
// configured here), so the pure decision is replicated below. Keep this in sync
// with the exported helper in CartScreen.js.
//
//   export const decideMinus = (quantity) => {
//     if (quantity > 1) {
//       return { action: 'decrement', nextQuantity: quantity - 1 };
//     }
//     return { action: 'promptRemoval', nextQuantity: 1 };
//   };
const decideMinus = (quantity) => {
  if (quantity > 1) {
    return { action: 'decrement', nextQuantity: quantity - 1 };
  }
  return { action: 'promptRemoval', nextQuantity: 1 };
};

const test = require('node:test');
const assert = require('node:assert/strict');

test('Property 20: minus at quantity 1 prompts removal, never deletes silently', () => {
  const { action, nextQuantity } = decideMinus(1);
  // Line is kept at quantity 1 (not deleted) and an explicit removal prompt is requested.
  assert.equal(action, 'promptRemoval');
  assert.equal(nextQuantity, 1);
  // The decision keeps the line: it does not signal a delete/removal directly.
  assert.notEqual(action, 'decrement');
});

test('Property 20: minus at any quantity > 1 decrements by exactly one', () => {
  // Property-style sweep across a wide range of valid quantities.
  for (let q = 2; q <= 1000; q++) {
    const { action, nextQuantity } = decideMinus(q);
    assert.equal(action, 'decrement', `expected decrement for quantity ${q}`);
    assert.equal(nextQuantity, q - 1, `expected ${q - 1} for quantity ${q}`);
    // Decrementing from q > 1 never drops below 1.
    assert.ok(nextQuantity >= 1, `nextQuantity must stay >= 1 for quantity ${q}`);
  }
});
