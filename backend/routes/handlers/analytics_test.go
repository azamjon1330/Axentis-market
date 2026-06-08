package handlers

import (
	"reflect"
	"testing"
)

// TestAggregateProductTypeBreakdown_AllTypesPresent verifies the core bug fix
// (Req 3.1, 3.2): every product type with recorded sales appears as a distinct
// entry, not just one (the prior bug surfaced only "futbolka").
func TestAggregateProductTypeBreakdown_AllTypesPresent(t *testing.T) {
	items := []map[string]interface{}{
		{"type": "futbolka", "quantity": float64(2), "price": float64(100)},
		{"type": "sportivka", "quantity": float64(1), "price": float64(250)},
		{"type": "kostyum", "quantity": float64(3), "price": float64(500)},
		{"type": "krossovka", "quantity": float64(1), "price": float64(900)},
	}

	got := aggregateProductTypeBreakdown(items)

	if len(got) != 4 {
		t.Fatalf("expected 4 distinct product types, got %d: %+v", len(got), got)
	}

	seen := map[string]bool{}
	for _, e := range got {
		seen[e.ProductType] = true
	}
	for _, want := range []string{"futbolka", "sportivka", "kostyum", "krossovka"} {
		if !seen[want] {
			t.Errorf("expected product type %q to be present in breakdown", want)
		}
	}
}

// TestAggregateProductTypeBreakdown_SumsUnitsAndRevenue verifies units and
// revenue are summed per type (Req 3.1) and that the marked-up selling price is
// preferred for revenue.
func TestAggregateProductTypeBreakdown_SumsUnitsAndRevenue(t *testing.T) {
	items := []map[string]interface{}{
		{"type": "futbolka", "quantity": float64(2), "price": float64(100), "price_with_markup": float64(150)},
		{"type": "futbolka", "quantity": float64(3), "price": float64(100), "price_with_markup": float64(150)},
		{"type": "kostyum", "quantity": float64(1), "price": float64(500)},
	}

	got := aggregateProductTypeBreakdown(items)

	byType := map[string]ProductTypeBreakdownEntry{}
	for _, e := range got {
		byType[e.ProductType] = e
	}

	futbolka, ok := byType["futbolka"]
	if !ok {
		t.Fatal("futbolka missing from breakdown")
	}
	if futbolka.Units != 5 {
		t.Errorf("futbolka units = %d, want 5", futbolka.Units)
	}
	// (2+3) units * 150 selling price = 750
	if futbolka.Revenue != 750 {
		t.Errorf("futbolka revenue = %v, want 750", futbolka.Revenue)
	}

	kostyum, ok := byType["kostyum"]
	if !ok {
		t.Fatal("kostyum missing from breakdown")
	}
	if kostyum.Units != 1 || kostyum.Revenue != 500 {
		t.Errorf("kostyum = %+v, want units=1 revenue=500", kostyum)
	}
}

// TestAggregateProductTypeBreakdown_OmitsEmptyAndUntyped verifies that items
// without a usable type are skipped and absent types are not zero-filled
// (Req 3.2, 3.3).
func TestAggregateProductTypeBreakdown_OmitsEmptyAndUntyped(t *testing.T) {
	items := []map[string]interface{}{
		{"type": "futbolka", "quantity": float64(1), "price": float64(100)},
		{"quantity": float64(5), "price": float64(100)},               // no type -> skipped
		{"type": "  ", "quantity": float64(2), "price": float64(100)}, // blank -> skipped
	}

	got := aggregateProductTypeBreakdown(items)
	if len(got) != 1 {
		t.Fatalf("expected only 1 typed entry, got %d: %+v", len(got), got)
	}
	if got[0].ProductType != "futbolka" {
		t.Errorf("expected futbolka, got %q", got[0].ProductType)
	}
}

// TestAggregateProductTypeBreakdown_Empty verifies an empty input yields an
// empty (non-nil) breakdown.
func TestAggregateProductTypeBreakdown_Empty(t *testing.T) {
	got := aggregateProductTypeBreakdown(nil)
	if got == nil {
		t.Fatal("expected non-nil empty slice")
	}
	if len(got) != 0 {
		t.Errorf("expected empty breakdown, got %+v", got)
	}
}

// TestNormalizeProductType verifies type-key normalization collapses synonyms
// and casing to canonical keys.
func TestNormalizeProductType(t *testing.T) {
	cases := map[string]string{
		"Futbolka":   "futbolka",
		"  FUTBOLKA": "futbolka",
		"футболка":   "futbolka",
		"t-shirt":    "futbolka",
		"спортивка":  "sportivka",
		"костюм":     "kostyum",
		"suit":       "kostyum",
		"кроссовки":  "krossovka",
		"sneakers":   "krossovka",
		"":           "",
		"   ":        "",
		"unknown":    "unknown",
	}
	for in, want := range cases {
		if got := normalizeProductType(in); got != want {
			t.Errorf("normalizeProductType(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestAggregateProductTypeBreakdown_StringEncodedFields verifies tolerance of
// string-encoded quantity/price values as they can appear in stored JSON.
func TestAggregateProductTypeBreakdown_StringEncodedFields(t *testing.T) {
	items := []map[string]interface{}{
		{"type": "futbolka", "quantity": "4", "price": "120"},
	}
	got := aggregateProductTypeBreakdown(items)
	want := []ProductTypeBreakdownEntry{{ProductType: "futbolka", Units: 4, Revenue: 480}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v, want %+v", got, want)
	}
}
