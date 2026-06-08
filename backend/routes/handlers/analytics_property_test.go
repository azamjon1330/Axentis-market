package handlers

import (
	"math/rand"
	"reflect"
	"testing"
	"testing/quick"
)

// Feature: marketplace-improvements, Property 3: Product-type breakdown is complete and exact
//
// Validates: Requirements 3.1, 3.2, 3.3
//
// Property statement (design.md, Property 3):
//
//	For any multiset of sold items across orders and cash sales within a range,
//	the analytics breakdown contains exactly the distinct product types present,
//	and each type's reported `units` and `revenue` equal the sums over the items
//	of that type.
//
// This exercises the pure aggregation helper aggregateProductTypeBreakdown that
// task 8.1 extracted from GetCompanyAnalytics, across many randomized inputs.

// pbtSaleItem is a generated sold item ({Type, Quantity, Price}) used to drive
// the property test. It mirrors the {type, quantity, price} shape the handler
// feeds into aggregateProductTypeBreakdown.
type pbtSaleItem struct {
	Type     string
	Quantity int
	Price    float64
}

// pbtItemList is a slice of generated items implementing quick.Generator so we
// can intelligently constrain the input space (canonical type keys, positive
// quantities, non-negative integer prices) — keeping float arithmetic exact and
// avoiding type-normalization collapse that would make "distinct input types"
// ill-defined.
type pbtItemList []pbtSaleItem

// canonicalPBTTypes are lowercase, whitespace-free strings that normalize to
// themselves (none are synonyms handled by normalizeProductType), so the set of
// distinct generated types is well defined and equals the set of output keys.
var canonicalPBTTypes = []string{
	"futbolka", "sportivka", "kostyum", "krossovka", "shapka", "noski",
}

// Generate produces a random list of sold items. Quantities are always >= 1 so
// every generated item contributes a unit (the helper drops quantity <= 0), and
// prices are non-negative whole numbers so revenue sums are exact in float64 and
// match the helper's per-unit-price * quantity computation regardless of order.
func (pbtItemList) Generate(r *rand.Rand, size int) reflect.Value {
	n := r.Intn(size + 1) // 0..size items, allows the empty-input case too
	items := make(pbtItemList, 0, n)
	for i := 0; i < n; i++ {
		items = append(items, pbtSaleItem{
			Type:     canonicalPBTTypes[r.Intn(len(canonicalPBTTypes))],
			Quantity: 1 + r.Intn(10),         // 1..10
			Price:    float64(r.Intn(10000)), // 0..9999, integer-valued
		})
	}
	return reflect.ValueOf(items)
}

// TestProperty3_BreakdownIsCompleteAndExact is the property-based test for
// Property 3. It runs at least 100 iterations (MaxCount: 500).
func TestProperty3_BreakdownIsCompleteAndExact(t *testing.T) {
	property := func(items pbtItemList) bool {
		// Convert generated items into the map shape the helper consumes.
		mapped := make([]map[string]interface{}, 0, len(items))
		for _, it := range items {
			mapped = append(mapped, map[string]interface{}{
				"type":     it.Type,
				"quantity": float64(it.Quantity),
				"price":    it.Price,
			})
		}

		// Independently compute the expected per-type aggregation.
		expectedUnits := make(map[string]int)
		expectedRevenue := make(map[string]float64)
		for _, it := range items {
			expectedUnits[it.Type] += it.Quantity
			expectedRevenue[it.Type] += it.Price * float64(it.Quantity)
		}

		got := aggregateProductTypeBreakdown(mapped)

		// 1) Keys must be exactly the distinct types present in the input
		//    (no missing type, no extra type, no duplicate entries).
		if len(got) != len(expectedUnits) {
			return false
		}
		gotKeys := make(map[string]bool, len(got))
		for _, e := range got {
			if gotKeys[e.ProductType] {
				return false // duplicate entry for a type
			}
			gotKeys[e.ProductType] = true
		}
		for wantType := range expectedUnits {
			if !gotKeys[wantType] {
				return false // a present type is missing from the breakdown
			}
		}

		// 2) Each type's units and revenue equal the sums over its items.
		for _, e := range got {
			if e.Units != expectedUnits[e.ProductType] {
				return false
			}
			if e.Revenue != expectedRevenue[e.ProductType] {
				return false
			}
		}
		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 500}); err != nil {
		t.Fatalf("Property 3 (breakdown is complete and exact) failed: %v", err)
	}
}
