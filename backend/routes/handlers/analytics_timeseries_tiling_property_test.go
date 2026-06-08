package handlers

import (
	"testing"
	"testing/quick"
	"time"
)

// Feature: marketplace-improvements, Property 4: Time-series buckets tile only
// the selected range at the correct granularity.
//
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5.
//
// These tests exercise the pure bucketing helpers implemented in task 9.1
// (analytics_timeseries.go), namely:
//
//	timeseriesBucketDuration(rangeType) (time.Duration, bool)
//	computeTimeseriesBuckets(rangeType, from, to) ([]time.Time, error)
//	bucketTimeseriesEvents(events, bucketStarts, bucketSize) []TimeseriesBucket
//
// Because the tiling/granularity logic is DB/HTTP-free it is validated across
// many randomized ranges of every type without a database.

// property4RangeTypes is the closed set of supported range types, each with its
// contractually-fixed bucket size (Req 4.2–4.5). This serves as an independent
// oracle for "the bucket size matches the range type" rather than re-deriving it
// from the implementation under test.
var property4RangeTypes = []struct {
	rangeType  string
	bucketSize time.Duration
}{
	{"daily", time.Hour},           // Req 4.2: daily -> 1h
	{"weekly", 12 * time.Hour},     // Req 4.3: weekly -> 12h
	{"monthly", 24 * time.Hour},    // Req 4.4: monthly -> 1d
	{"yearly", 7 * 24 * time.Hour}, // Req 4.5: yearly -> 1w
}

// property4CeilDiv returns ceil(total / size) using integer math, the number of
// buckets needed to fully cover the range (so a partial final bucket is still
// represented — zero-fill within range only, Req 4.1).
func property4CeilDiv(total, size time.Duration) int {
	return int((total + size - 1) / size)
}

// TestProperty4_BucketTilingAndGranularity is the core property test.
//
// Feature: marketplace-improvements, Property 4: Time-series buckets tile only
// the selected range at the correct granularity.
//
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5.
//
// For a random range of each type and a random window [from, to) (including
// windows whose length is NOT an exact multiple of the bucket size, to exercise
// the partial final bucket), it asserts:
//
//   - the bucket size matches the range type (Req 4.2–4.5);
//   - every produced current-series bucket start lies within [from, to);
//   - buckets tile the range contiguously: consecutive starts differ by exactly
//     the bucket size, with no gaps/overlaps;
//   - the buckets cover the range: the last start + one bucket >= to, while the
//     last start itself is < to (only the selected range is tiled, Req 4.1);
//   - bucketTimeseriesEvents yields exactly one plotted point per start, labeled
//     with that start instant.
func TestProperty4_BucketTilingAndGranularity(t *testing.T) {
	base := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	property := func(rawRange uint8, rawFromHours uint16, rawWholeBuckets uint8, rawRemainderFrac uint8) bool {
		spec := property4RangeTypes[int(rawRange)%len(property4RangeTypes)]
		rangeType := spec.rangeType
		expectedSize := spec.bucketSize

		// (a) Bucket size matches the range type (independent oracle).
		size, ok := timeseriesBucketDuration(rangeType)
		if !ok || size != expectedSize {
			t.Logf("bucket size mismatch for %q: got %v ok=%v, want %v", rangeType, size, ok, expectedSize)
			return false
		}

		// Build a window [from, to). The span is a whole number of buckets plus a
		// fractional remainder in [0, size) so non-aligned ranges (partial final
		// bucket) are covered too.
		from := base.Add(time.Duration(rawFromHours) * time.Hour)
		wholeBuckets := int(rawWholeBuckets)%24 + 1 // 1..24 full buckets
		remainder := time.Duration(int64(size) * int64(rawRemainderFrac) / 256)
		span := time.Duration(wholeBuckets)*size + remainder
		to := from.Add(span)

		starts, err := computeTimeseriesBuckets(rangeType, from, to)
		if err != nil {
			t.Logf("computeTimeseriesBuckets error for %q: %v", rangeType, err)
			return false
		}

		// Expected bucket count is ceil(span/size).
		wantCount := property4CeilDiv(span, size)
		if len(starts) != wantCount {
			t.Logf("count mismatch range=%q span=%v size=%v: got %d want %d", rangeType, span, size, len(starts), wantCount)
			return false
		}
		if wantCount == 0 {
			return false // span is always > 0 by construction
		}

		// First bucket starts exactly at `from`.
		if !starts[0].Equal(from) {
			t.Logf("first start %v != from %v", starts[0], from)
			return false
		}

		// Contiguous tiling: consecutive starts differ by exactly the bucket size,
		// and every start lies within [from, to).
		for i, s := range starts {
			if s.Before(from) || !s.Before(to) {
				t.Logf("start[%d]=%v outside [from=%v, to=%v)", i, s, from, to)
				return false
			}
			if i > 0 {
				gap := s.Sub(starts[i-1])
				if gap != size {
					t.Logf("non-contiguous: start[%d]-start[%d]=%v want %v", i, i-1, gap, size)
					return false
				}
			}
		}

		// Coverage: last start + one bucket reaches or passes `to` (no gap at the
		// end), while the last start itself is strictly before `to` (we tile only
		// the selected range).
		last := starts[len(starts)-1]
		if last.Add(size).Before(to) {
			t.Logf("range not fully covered: last %v + size %v < to %v", last, size, to)
			return false
		}
		if !last.Before(to) {
			t.Logf("last start %v not before to %v", last, to)
			return false
		}

		// bucketTimeseriesEvents produces exactly one point per start, labeled by
		// that start (zero-filled, no events supplied).
		buckets := bucketTimeseriesEvents(nil, starts, size)
		if len(buckets) != len(starts) {
			t.Logf("bucket count %d != starts %d", len(buckets), len(starts))
			return false
		}
		for i := range buckets {
			wantLabel := starts[i].UTC().Format(time.RFC3339)
			if buckets[i].Bucket != wantLabel {
				t.Logf("bucket[%d] label %q != %q", i, buckets[i].Bucket, wantLabel)
				return false
			}
			if buckets[i].Orders != 0 || buckets[i].Revenue != 0 {
				t.Logf("bucket[%d] not zero-filled: %+v", i, buckets[i])
				return false
			}
		}
		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 4 (bucket tiling and granularity) failed: %v", err)
	}
}

// TestProperty4_EventsLandInTheirBucket complements the tiling check: an event
// at an arbitrary instant strictly inside the range is attributed to exactly the
// bucket whose half-open interval [start, start+size) contains it, and to no
// other bucket. This pins "no overlaps" from the consumer's perspective.
//
// Feature: marketplace-improvements, Property 4: Time-series buckets tile only
// the selected range at the correct granularity.
//
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5.
func TestProperty4_EventsLandInTheirBucket(t *testing.T) {
	base := time.Date(2025, 3, 10, 0, 0, 0, 0, time.UTC)

	property := func(rawRange uint8, rawWholeBuckets uint8, rawOffsetSecs uint32) bool {
		spec := property4RangeTypes[int(rawRange)%len(property4RangeTypes)]
		rangeType := spec.rangeType
		size := spec.bucketSize

		from := base
		wholeBuckets := int(rawWholeBuckets)%24 + 1
		span := time.Duration(wholeBuckets) * size
		to := from.Add(span)

		starts, err := computeTimeseriesBuckets(rangeType, from, to)
		if err != nil || len(starts) == 0 {
			return false
		}

		// Place a single event at a deterministic instant strictly within [from, to).
		offset := time.Duration(uint64(rawOffsetSecs)*uint64(time.Second)) % span
		eventTime := from.Add(offset)
		if !eventTime.Before(to) { // guard the modulo edge
			eventTime = to.Add(-time.Nanosecond)
		}

		buckets := bucketTimeseriesEvents(
			[]TimeseriesEvent{{Timestamp: eventTime, Orders: 1, Revenue: 100}},
			starts, size,
		)

		// Independent oracle: index = floor((eventTime - from) / size).
		wantIdx := int(eventTime.Sub(from) / size)
		if wantIdx < 0 || wantIdx >= len(buckets) {
			t.Logf("oracle index %d out of range (len=%d)", wantIdx, len(buckets))
			return false
		}

		// Exactly the target bucket received the event; all others are zero.
		for i, b := range buckets {
			if i == wantIdx {
				if b.Orders != 1 || b.Revenue != 100 {
					t.Logf("target bucket[%d] = %+v, want orders=1 revenue=100", i, b)
					return false
				}
			} else if b.Orders != 0 || b.Revenue != 0 {
				t.Logf("non-target bucket[%d] = %+v, want zero", i, b)
				return false
			}
		}
		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 4 (events land in their bucket) failed: %v", err)
	}
}

// TestProperty4_BucketSizeMatchesRange is a small explicit table anchoring the
// granularity contract (Req 4.2–4.5) with human-readable expectations, and
// confirming unknown ranges are rejected.
//
// Validates: Requirements 4.2, 4.3, 4.4, 4.5.
func TestProperty4_BucketSizeMatchesRange(t *testing.T) {
	for _, spec := range property4RangeTypes {
		got, ok := timeseriesBucketDuration(spec.rangeType)
		if !ok {
			t.Errorf("%s: timeseriesBucketDuration returned ok=false", spec.rangeType)
			continue
		}
		if got != spec.bucketSize {
			t.Errorf("%s: bucket size = %v, want %v", spec.rangeType, got, spec.bucketSize)
		}
	}

	if _, ok := timeseriesBucketDuration("hourly"); ok {
		t.Errorf("unknown range %q should be rejected", "hourly")
	}
}
