// Property-based test for selecting a saved address at checkout.
//
// Feature: marketplace-improvements, Property 16: Selecting a saved address
// applies it to the order.
//
// Validates: Requirements 13.2, 13.3
//
// Property 16 (design.md): For any saved address the buyer selects at checkout,
// the order's delivery fields (label, address text, coordinates, recipient)
// equal that address's fields.
//
// fast-check is NOT a dependency of Homepage/package.json and there is no jest
// RN preset configured, so this test uses the built-in node:test runner with a
// small seeded generator instead (consistent with the other Homepage property
// tests, e.g. resolveCategoryIcon.property.test.js, clampQuantity.property.test.js
// and orderListing.*.property.test.js).
//
// SavedAddressesScreen.js and CheckoutScreen.js both import React Native and
// several contexts, which cannot be loaded in plain node. The two helpers below
// are LOCAL MIRRORS of the pure navigation/route mapping in those screens:
//
//   * savedAddressToOrderParams  mirrors SavedAddressesScreen.handleSelect(addr):
//       navigation.navigate('Checkout', {
//         selectedAddress: addr.addressText,
//         selectedCoords:
//           addr.latitude != null && addr.longitude != null
//             ? { lat: addr.latitude, lng: addr.longitude }
//             : undefined,
//         selectedRecipient: addr.recipientName || undefined,
//         selectedLabel: addr.label || undefined,
//       });
//
//   * applyOrderParamsToCheckout mirrors CheckoutScreen.js's route-param effect:
//       if (route.params?.selectedCoords)    setDeliveryCoords(route.params.selectedCoords);
//       if (route.params?.selectedAddress)   setAddress(route.params.selectedAddress);
//       if (route.params?.selectedRecipient) setRecipientName(route.params.selectedRecipient);
//
// Keep these byte-for-byte equivalent to the screen logic they mirror.
//
// Run standalone with:  node --test savedAddressApply.property.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

// --- Local mirror of SavedAddressesScreen.handleSelect param mapping ---
function savedAddressToOrderParams(addr) {
  return {
    selectedAddress: addr.addressText,
    selectedCoords:
      addr.latitude != null && addr.longitude != null
        ? { lat: addr.latitude, lng: addr.longitude }
        : undefined,
    selectedRecipient: addr.recipientName || undefined,
    selectedLabel: addr.label || undefined,
  };
}

// --- Local mirror of CheckoutScreen's route-param effect ---
// Returns the next checkout state given the previous state and the nav params.
// A param is applied only when truthy (matching the `if (route.params?.x)`
// guards in CheckoutScreen.js); otherwise the previous value is retained.
function applyOrderParamsToCheckout(prev, params) {
  return {
    address: params.selectedAddress ? params.selectedAddress : prev.address,
    deliveryCoords: params.selectedCoords ? params.selectedCoords : prev.deliveryCoords,
    recipientName: params.selectedRecipient ? params.selectedRecipient : prev.recipientName,
    // selectedLabel is carried through the params untouched (CheckoutScreen
    // lists it as a dependency of the effect; it is available for display).
    selectedLabel: params.selectedLabel,
  };
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

// Generate a random saved-address object spanning the input space the
// requirement cares about: coords present/absent, recipient present/absent,
// label present/absent. addressText is always non-empty because a saved address
// always has an address (the create/edit form requires it), and the Checkout
// effect only applies a truthy selectedAddress.
function genSavedAddress(rng) {
  const hasCoords = rng() < 0.6;
  const hasRecipient = rng() < 0.6;
  const hasLabel = rng() < 0.8;

  const addressText = pick(rng, [
    'ул. Ленина, 10, кв. 25',
    'Mustaqillik ko‘chasi 5',
    'Navoi st. 1, apt 3',
    'дом 7',
    '12B Main Road',
  ]);

  // latitude/longitude can be 0 — a valid coordinate that must NOT be treated as
  // "absent" (the screen uses `!= null`, not a truthiness check).
  const lat = hasCoords ? pick(rng, [0, 41.31, -33.8688, 51.5074, 0.0]) : null;
  const lng = hasCoords ? pick(rng, [0, 69.24, 151.2093, -0.1278, 0.0]) : null;

  return {
    id: Math.floor(rng() * 100000),
    label: hasLabel ? pick(rng, ['Дом', 'Работа', 'Home', 'Office', 'Дача']) : '',
    addressText,
    latitude: lat,
    longitude: lng,
    recipientName: hasRecipient ? pick(rng, ['Иван', 'Aziz', 'John Doe', 'Мама']) : '',
    isDefault: rng() < 0.3,
  };
}

// A non-trivial "previous" checkout state so retention (when a field is absent)
// is observable and cannot accidentally coincide with the applied value.
function genPrevCheckout(rng) {
  return {
    address: pick(rng, ['', 'previous address', 'старый адрес']),
    deliveryCoords: rng() < 0.5 ? null : { lat: 12.34, lng: 56.78 },
    recipientName: pick(rng, ['', 'previous recipient', 'старый получатель']),
  };
}

const ITERATIONS = 1000;

test('Property 16: selecting a saved address applies its fields to the order', () => {
  const rng = mulberry32(0x5aed0016);

  for (let i = 0; i < ITERATIONS; i++) {
    const addr = genSavedAddress(rng);
    const prev = genPrevCheckout(rng);

    const params = savedAddressToOrderParams(addr);
    const next = applyOrderParamsToCheckout(prev, params);

    const ctx = `i=${i} addr=${JSON.stringify(addr)} prev=${JSON.stringify(prev)} => ${JSON.stringify(next)}`;

    // addressText -> address (always applied; addressText is non-empty).
    assert.equal(next.address, addr.addressText, `address must equal addressText (${ctx})`);

    // lat/lng -> deliveryCoords, or the coords are absent when not present.
    if (addr.latitude != null && addr.longitude != null) {
      assert.deepEqual(
        next.deliveryCoords,
        { lat: addr.latitude, lng: addr.longitude },
        `deliveryCoords must equal {lat,lng} (${ctx})`,
      );
    } else {
      // No coords on the address -> nothing applied -> previous coords retained.
      assert.equal(next.deliveryCoords, prev.deliveryCoords, `deliveryCoords retained when absent (${ctx})`);
    }

    // recipientName -> recipientName when present; otherwise previous retained.
    if (addr.recipientName) {
      assert.equal(next.recipientName, addr.recipientName, `recipientName must equal address recipient (${ctx})`);
    } else {
      assert.equal(next.recipientName, prev.recipientName, `recipientName retained when absent (${ctx})`);
    }

    // label is carried through the params (undefined when the address has none).
    if (addr.label) {
      assert.equal(next.selectedLabel, addr.label, `label must be carried (${ctx})`);
    } else {
      assert.equal(next.selectedLabel, undefined, `label undefined when absent (${ctx})`);
    }
  }
});

test('Property 16: explicit examples', () => {
  // Full address: coords + recipient + label all applied.
  {
    const addr = {
      label: 'Дом',
      addressText: 'ул. Ленина, 10',
      latitude: 41.31,
      longitude: 69.24,
      recipientName: 'Иван',
    };
    const params = savedAddressToOrderParams(addr);
    assert.deepEqual(params, {
      selectedAddress: 'ул. Ленина, 10',
      selectedCoords: { lat: 41.31, lng: 69.24 },
      selectedRecipient: 'Иван',
      selectedLabel: 'Дом',
    });
    const next = applyOrderParamsToCheckout(
      { address: 'old', deliveryCoords: null, recipientName: 'old' },
      params,
    );
    assert.equal(next.address, 'ул. Ленина, 10');
    assert.deepEqual(next.deliveryCoords, { lat: 41.31, lng: 69.24 });
    assert.equal(next.recipientName, 'Иван');
    assert.equal(next.selectedLabel, 'Дом');
  }

  // Coordinates of (0,0) are valid and MUST be applied (not treated as absent).
  {
    const addr = { label: '', addressText: 'Equator/Meridian', latitude: 0, longitude: 0, recipientName: '' };
    const params = savedAddressToOrderParams(addr);
    assert.deepEqual(params.selectedCoords, { lat: 0, lng: 0 });
    const next = applyOrderParamsToCheckout(
      { address: 'old', deliveryCoords: { lat: 9, lng: 9 }, recipientName: 'keep' },
      params,
    );
    assert.deepEqual(next.deliveryCoords, { lat: 0, lng: 0 });
    // No recipient on the address -> previous recipient retained.
    assert.equal(next.recipientName, 'keep');
    // No label -> carried as undefined.
    assert.equal(next.selectedLabel, undefined);
  }

  // Address without coordinates -> previous coords retained.
  {
    const addr = { label: 'Работа', addressText: 'Office st. 1', latitude: null, longitude: null, recipientName: 'Aziz' };
    const params = savedAddressToOrderParams(addr);
    assert.equal(params.selectedCoords, undefined);
    const prevCoords = { lat: 1, lng: 2 };
    const next = applyOrderParamsToCheckout(
      { address: 'old', deliveryCoords: prevCoords, recipientName: 'old' },
      params,
    );
    assert.equal(next.deliveryCoords, prevCoords);
    assert.equal(next.address, 'Office st. 1');
    assert.equal(next.recipientName, 'Aziz');
    assert.equal(next.selectedLabel, 'Работа');
  }
});
