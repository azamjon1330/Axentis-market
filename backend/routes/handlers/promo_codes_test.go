package handlers

import (
	"database/sql"
	"math/rand"
	"reflect"
	"testing"
	"testing/quick"
)

// Feature: marketplace-improvements, Property 25: Promo discount is bounded and
// consistent.
//
// These tests exercise the pure helper computeDiscount, which decides the
// discount granted for a promo code given its type ("fixed"/"percent"), value,
// the order total, and an optional percent cap (sql.NullFloat64). Because the
// helper is pure, the property below can be validated across many randomized
// inputs without a database.

// promoInput is a smart generator for computeDiscount arguments. It constrains
// inputs to the realistic space the helper operates over (non-negative,
// finite amounts) while still exercising both the accept side (discount fits)
// and the clamp side (fixed value larger than the order, percent over the cap,
// percent over 100%, zero/invalid cap).
type promoInput struct {
	discountType string
	value        float64
	orderAmount  float64
	maxDiscount  sql.NullFloat64
}

// Generate implements quick.Generator, producing well-formed promo inputs.
func (promoInput) Generate(rng *rand.Rand, _ int) reflect.Value {
	in := promoInput{}

	// Randomly pick a discount type. Anything that is not "fixed" is treated as
	// "percent" by computeDiscount, mirroring CreatePromoCode's normalization.
	if rng.Intn(2) == 0 {
		in.discountType = "fixed"
	} else {
		in.discountType = "percent"
	}

	// Order amount is always >= 0 (orders never have a negative total).
	in.orderAmount = rng.Float64() * 100000.0 // 0 .. 100000

	if in.discountType == "fixed" {
		// Fixed value may exceed the order amount so the [0, orderAmount] clamp
		// is exercised.
		in.value = rng.Float64() * 120000.0 // 0 .. 120000
	} else {
		// Percent value may exceed 100 so the order-amount clamp is exercised.
		in.value = rng.Float64() * 150.0 // 0 .. 150 (%)
	}

	// maxDiscount: invalid (NULL), valid-zero (treated as "no cap" by the
	// helper), or valid-positive (an enforced cap).
	switch rng.Intn(3) {
	case 0:
		in.maxDiscount = sql.NullFloat64{Valid: false}
	case 1:
		in.maxDiscount = sql.NullFloat64{Valid: true, Float64: 0}
	default:
		in.maxDiscount = sql.NullFloat64{Valid: true, Float64: rng.Float64() * 50000.0}
	}

	return reflect.ValueOf(in)
}

// eps absorbs benign floating-point rounding in the bound comparisons.
const eps = 1e-9

// TestProperty25_PromoDiscountBounded is the core property test.
//
// Feature: marketplace-improvements, Property 25: Promo discount is bounded and
// consistent.
//
// Validates: Requirements 21.2, 21.3.
//
// For random discount types, values, order amounts (>= 0), and caps:
//   - 0 <= discount <= orderAmount;
//   - for a percent discount with a valid positive cap, discount <= cap;
//   - finalAmount = orderAmount - discount lies in [0, orderAmount].
func TestProperty25_PromoDiscountBounded(t *testing.T) {
	property := func(in promoInput) bool {
		discount := computeDiscount(in.discountType, in.value, in.orderAmount, in.maxDiscount)

		// 1. Discount is bounded to [0, orderAmount].
		if discount < -eps || discount > in.orderAmount+eps {
			t.Logf("discount out of [0, orderAmount]: type=%s value=%v order=%v cap=%+v -> discount=%v",
				in.discountType, in.value, in.orderAmount, in.maxDiscount, discount)
			return false
		}

		// 2. Percent discounts with a valid positive cap never exceed the cap.
		if in.discountType == "percent" && in.maxDiscount.Valid && in.maxDiscount.Float64 > 0 {
			if discount > in.maxDiscount.Float64+eps {
				t.Logf("percent discount exceeds cap: value=%v order=%v cap=%v -> discount=%v",
					in.value, in.orderAmount, in.maxDiscount.Float64, discount)
				return false
			}
		}

		// 3. finalAmount = orderAmount - discount is within [0, orderAmount].
		finalAmount := in.orderAmount - discount
		if finalAmount < -eps || finalAmount > in.orderAmount+eps {
			t.Logf("finalAmount out of [0, orderAmount]: order=%v discount=%v -> final=%v",
				in.orderAmount, discount, finalAmount)
			return false
		}

		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 25 failed: %v", err)
	}
}

// TestComputeDiscount_Examples documents concrete cases that pin the exact
// boundaries (fixed clamp, percent cap, zero/invalid cap, zero order), to
// complement the randomized property above.
func TestComputeDiscount_Examples(t *testing.T) {
	cases := []struct {
		name         string
		discountType string
		value        float64
		orderAmount  float64
		maxDiscount  sql.NullFloat64
		want         float64
	}{
		{"fixed within order", "fixed", 30, 100, sql.NullFloat64{}, 30},
		{"fixed clamped to order", "fixed", 250, 100, sql.NullFloat64{}, 100},
		{"percent no cap", "percent", 10, 200, sql.NullFloat64{}, 20},
		{"percent capped", "percent", 50, 200, sql.NullFloat64{Valid: true, Float64: 30}, 30},
		{"percent cap above raw is inert", "percent", 10, 200, sql.NullFloat64{Valid: true, Float64: 500}, 20},
		{"percent zero cap treated as no cap", "percent", 10, 200, sql.NullFloat64{Valid: true, Float64: 0}, 20},
		{"percent over 100 clamped to order", "percent", 150, 200, sql.NullFloat64{}, 200},
		{"zero order yields zero discount", "fixed", 50, 0, sql.NullFloat64{}, 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeDiscount(tc.discountType, tc.value, tc.orderAmount, tc.maxDiscount)
			if got != tc.want {
				t.Errorf("computeDiscount(%q, %v, %v, %+v) = %v, want %v",
					tc.discountType, tc.value, tc.orderAmount, tc.maxDiscount, got, tc.want)
			}
			// Invariant: result is always within [0, orderAmount].
			if got < 0 || got > tc.orderAmount {
				t.Errorf("result %v not within [0, %v]", got, tc.orderAmount)
			}
		})
	}
}
