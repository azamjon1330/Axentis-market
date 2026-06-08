package handlers

import (
	"testing"
	"testing/quick"
)

// Feature: marketplace-improvements, Property 24: At most one persisted default
// variant per product.
//
// These tests exercise the pure decision core resolveDefaultVariant, which the
// DB-backed SetDefaultVariant handler delegates to. The handler persists the
// decision on products.default_variant_id — a single nullable scalar column —
// so "at most one default per product" is structurally guaranteed; the model
// below mirrors that single-scalar store and verifies the set/reject/clear rules.

// i64p returns a pointer to the given int64 (a nullable variant id).
func i64p(v int64) *int64 { return &v }

// sameOptional reports whether two nullable variant ids are equal (both nil, or
// both non-nil with the same value).
func sameOptional(a, b *int64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// TestProperty24_DefaultVariantPersistence is the core model-based property test.
//
// Feature: marketplace-improvements, Property 24: At most one persisted default
// variant per product.
//
// Validates: Requirements 18.1, 18.4.
//
// A single nullable scalar `store` models products.default_variant_id. For a
// randomized sequence of set/clear operations against a generated set of
// belonging variant ids, the following invariants must hold after every op:
//   - setting to a belonging variant then reading returns that variant;
//   - setting to a non-belonging variant leaves the stored value unchanged
//     (request rejected);
//   - a null request clears the default;
//   - the store is always a single scalar (at most one default) — guaranteed
//     by construction since `store` is one *int64.
func TestProperty24_DefaultVariantPersistence(t *testing.T) {
	property := func(belongRaw []int64, opsRaw []int64) bool {
		// Build the set of variant ids that belong to the product. Normalize to
		// the range 1..1000 so ids are never zero (zero is our "clear" sentinel).
		belongs := make(map[int64]bool)
		for _, b := range belongRaw {
			id := b
			if id < 0 {
				id = -id
			}
			id = id%1000 + 1 // 1..1000
			belongs[id] = true
		}

		// Model store: a single nullable scalar (mirrors products.default_variant_id).
		var store *int64

		for _, op := range opsRaw {
			// op == 0 => request null (clear). Otherwise request a variant id in
			// 1..1100, so some requested ids fall OUTSIDE the belong set above and
			// must be rejected.
			var requested *int64
			if op != 0 {
				id := op
				if id < 0 {
					id = -id
				}
				id = id%1100 + 1 // 1..1100
				requested = i64p(id)
			}

			requestedBelongs := requested != nil && belongs[*requested]

			// Snapshot the prior value by copy so a rejection can be checked against it.
			var beforeVal *int64
			if store != nil {
				v := *store
				beforeVal = &v
			}

			next, ok := resolveDefaultVariant(store, requested, requestedBelongs)
			if ok {
				store = next
			}
			// When !ok the handler performs no write, so `store` is left unchanged.

			switch {
			case requested == nil:
				// Null clears the default and is always accepted.
				if !ok || store != nil {
					t.Logf("clear failed: ok=%v store=%v", ok, store)
					return false
				}
			case requestedBelongs:
				// Setting to a belonging variant then reading returns that variant.
				if !ok || store == nil || *store != *requested {
					t.Logf("set-belonging failed: requested=%v store=%v ok=%v", *requested, store, ok)
					return false
				}
			default:
				// Non-belonging request must be rejected and leave the value unchanged.
				if ok {
					t.Logf("non-belonging request unexpectedly accepted: requested=%v", *requested)
					return false
				}
				if !sameOptional(store, beforeVal) {
					t.Logf("rejected request mutated store: before=%v after=%v", beforeVal, store)
					return false
				}
			}

			// "At most one default": store is a single *int64 — it holds either 0
			// or 1 value at any time, never more. This holds by construction.
		}
		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 300}); err != nil {
		t.Errorf("Property 24 failed: %v", err)
	}
}

// TestProperty24_RoundTripBelonging focuses the round-trip invariant: for any
// belonging variant id, set-then-read returns exactly that id regardless of the
// prior stored value.
//
// Validates: Requirements 18.1, 18.4.
func TestProperty24_RoundTripBelonging(t *testing.T) {
	property := func(prior int64, target int64) bool {
		current := i64p(prior)
		requested := i64p(target)

		// The requested variant belongs to the product.
		next, ok := resolveDefaultVariant(current, requested, true)
		return ok && next != nil && *next == target
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 300}); err != nil {
		t.Errorf("round-trip-belonging property failed: %v", err)
	}
}

// TestProperty24_RejectLeavesUnchanged focuses the rejection invariant: a
// non-belonging request returns the existing value and is not accepted, so the
// persisted default is unchanged.
//
// Validates: Requirements 18.1.
func TestProperty24_RejectLeavesUnchanged(t *testing.T) {
	property := func(prior int64, target int64) bool {
		current := i64p(prior)
		requested := i64p(target)

		// The requested variant does NOT belong to the product.
		next, ok := resolveDefaultVariant(current, requested, false)
		// Rejected, and the returned "next" is the unchanged current value.
		return !ok && sameOptional(next, current)
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 300}); err != nil {
		t.Errorf("reject-leaves-unchanged property failed: %v", err)
	}
}

// TestResolveDefaultVariant_Examples pins concrete clear/set/reject cases that
// complement the randomized properties above.
//
// Validates: Requirements 18.1, 18.4.
func TestResolveDefaultVariant_Examples(t *testing.T) {
	cases := []struct {
		name      string
		current   *int64
		requested *int64
		belongs   bool
		wantNext  *int64
		wantOK    bool
	}{
		{"clear when null requested (had value)", i64p(7), nil, false, nil, true},
		{"clear when null requested (already null)", nil, nil, false, nil, true},
		{"set belonging from null", nil, i64p(5), true, i64p(5), true},
		{"set belonging replacing existing", i64p(2), i64p(9), true, i64p(9), true},
		{"reject non-belonging keeps existing", i64p(3), i64p(99), false, i64p(3), false},
		{"reject non-belonging keeps null", nil, i64p(99), false, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			next, ok := resolveDefaultVariant(tc.current, tc.requested, tc.belongs)
			if ok != tc.wantOK {
				t.Errorf("ok = %v, want %v", ok, tc.wantOK)
			}
			if !sameOptional(next, tc.wantNext) {
				t.Errorf("next = %v, want %v", next, tc.wantNext)
			}
		})
	}
}
