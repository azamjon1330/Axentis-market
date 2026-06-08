package handlers

import (
	"math/rand"
	"reflect"
	"testing"
	"testing/quick"
	"time"
)

// Feature: marketplace-improvements, Property 5: Exactly two equal-length, index-aligned comparison series
//
// Validates: Requirements 4.6, 4.7
//
// Property statement (design.md, Property 5):
//
//	For any valid time-series request, the response contains exactly two series
//	(Current_Period and Previous_Period) of equal length and aligned by bucket
//	index, where the previous range is [from-(to-from), from) — equal in length
//	and immediately preceding the current range.
//
// This exercises the pure helpers task 9.1 extracted into analytics_timeseries.go
// and used by GetCompanyTimeseries:
//
//	timeseriesBucketDuration(rangeType)           -> fixed bucket size per range
//	computeTimeseriesBuckets(rangeType, from, to) -> current-series bucket starts
//	previousPeriodRange(from, to)                 -> [from-(to-from), from)
//	bucketTimeseriesEvents(events, starts, size)  -> folded fixed-length series
//
// The test reconstructs the exact alignment composition GetCompanyTimeseries
// performs (previousStarts[i] = currentStarts[i] - span) and asserts the
// two-series invariants across many randomized valid requests.

// property5RangeTypes are the four valid range types; each maps to a fixed
// bucket granularity via timeseriesBucketDuration.
var property5RangeTypes = []string{"daily", "weekly", "monthly", "yearly"}

// property5Request is a generated valid time-series request: a range type plus a
// non-empty [From, To) window. It implements quick.Generator so the input space
// is constrained to *valid* requests (recognized range, To strictly after From,
// and a bounded bucket count) — invalid requests are out of scope for Property 5,
// which speaks to "any valid time-series request".
type property5Request struct {
	RangeType string
	From      time.Time
	To        time.Time
}

// Generate builds a random valid request. The span is chosen as a whole number
// of buckets (1..150) plus a sub-bucket remainder in [0, size), so the generator
// covers both exact multiples and partial-final-bucket spans (exercising the
// ceiling division in computeTimeseriesBuckets) while keeping the bucket count
// bounded for fast iteration.
func (property5Request) Generate(r *rand.Rand, _ int) reflect.Value {
	rangeType := property5RangeTypes[r.Intn(len(property5RangeTypes))]
	size, _ := timeseriesBucketDuration(rangeType)

	// A stable but arbitrary base instant, jittered by up to ~1000 hours so the
	// window does not always start on a bucket boundary.
	base := time.Date(2023, time.January, 1, 0, 0, 0, 0, time.UTC)
	from := base.Add(time.Duration(r.Intn(1000)) * time.Hour).
		Add(time.Duration(r.Intn(60)) * time.Minute)

	numBuckets := 1 + r.Intn(150) // 1..150 whole buckets
	remainder := time.Duration(0)
	if size > time.Nanosecond {
		remainder = time.Duration(r.Int63n(int64(size))) // [0, size)
	}
	span := time.Duration(numBuckets)*size + remainder
	to := from.Add(span)

	return reflect.ValueOf(property5Request{
		RangeType: rangeType,
		From:      from,
		To:        to,
	})
}

// generateProperty5Events produces a few random events scattered across both the
// current and previous windows so bucketTimeseriesEvents does real folding work
// (the length/alignment invariants must hold regardless of event placement).
func generateProperty5Events(r *rand.Rand, from, to time.Time) []TimeseriesEvent {
	span := to.Sub(from)
	prevFrom := from.Add(-span)
	n := r.Intn(20) // 0..19 events
	events := make([]TimeseriesEvent, 0, n)
	fullSpan := to.Sub(prevFrom) // covers previous + current windows
	for i := 0; i < n; i++ {
		offset := time.Duration(r.Int63n(int64(fullSpan)))
		events = append(events, TimeseriesEvent{
			Timestamp: prevFrom.Add(offset),
			Orders:    1,
			Revenue:   float64(r.Intn(1000)),
		})
	}
	return events
}

// TestProperty5_TwoEqualLengthAlignedSeries is the property-based test for
// Property 5. It runs at least 100 iterations (MaxCount: 500).
func TestProperty5_TwoEqualLengthAlignedSeries(t *testing.T) {
	r := rand.New(rand.NewSource(1))

	property := func(req property5Request) bool {
		bucketSize, ok := timeseriesBucketDuration(req.RangeType)
		if !ok {
			return false // generator only emits valid range types
		}

		// --- Reconstruct GetCompanyTimeseries' alignment composition ---------
		currentStarts, err := computeTimeseriesBuckets(req.RangeType, req.From, req.To)
		if err != nil {
			return false
		}

		span := req.To.Sub(req.From)
		prevFrom, prevTo := previousPeriodRange(req.From, req.To)

		// previousStarts is built exactly as the handler does it: each current
		// bucket start shifted back by one full span.
		previousStarts := make([]time.Time, len(currentStarts))
		for i, s := range currentStarts {
			previousStarts[i] = s.Add(-span)
		}

		currentEvents := generateProperty5Events(r, req.From, req.To)
		previousEvents := generateProperty5Events(r, prevFrom, prevTo)

		current := bucketTimeseriesEvents(currentEvents, currentStarts, bucketSize)
		previous := bucketTimeseriesEvents(previousEvents, previousStarts, bucketSize)

		// --- Property 5 invariants -------------------------------------------

		// (a) Previous range is exactly [from-(to-from), from): equal length and
		//     immediately preceding the current range (Requirement 4.7).
		if !prevTo.Equal(req.From) {
			return false // previous range must end exactly where current begins
		}
		if !prevFrom.Equal(req.From.Add(-span)) {
			return false // previous range must start one full span before `from`
		}
		if prevTo.Sub(prevFrom) != span {
			return false // previous range length must equal current range length
		}

		// (b) Exactly two series of equal length (Requirement 4.6).
		if len(current) != len(previous) {
			return false
		}
		// A valid (non-empty) request always yields at least one bucket.
		if len(current) == 0 {
			return false
		}

		// (c) The previous series is bucketed identically: previousStarts must
		//     equal the buckets computeTimeseriesBuckets would produce for the
		//     previous range — i.e. identical granularity and count.
		expectedPrevStarts, err := computeTimeseriesBuckets(req.RangeType, prevFrom, prevTo)
		if err != nil {
			return false
		}
		if len(expectedPrevStarts) != len(previousStarts) {
			return false
		}
		for i := range previousStarts {
			if !previousStarts[i].Equal(expectedPrevStarts[i]) {
				return false
			}
		}

		// (d) Index alignment: for every bucket index i, the previous bucket
		//     instant is exactly one span before the current bucket instant, so
		//     position i in `current` corresponds to position i in `previous`
		//     (Requirement 4.6). Alignment is checked on the underlying bucket
		//     start instants (exact), while each emitted label is verified to be
		//     the UTC RFC3339 rendering of its start — mirroring how
		//     bucketTimeseriesEvents builds the response (RFC3339 carries
		//     second-precision, so label arithmetic is intentionally avoided).
		for i := range current {
			if !previousStarts[i].Add(span).Equal(currentStarts[i]) {
				return false
			}
			if current[i].Bucket != currentStarts[i].UTC().Format(time.RFC3339) {
				return false
			}
			if previous[i].Bucket != previousStarts[i].UTC().Format(time.RFC3339) {
				return false
			}
		}

		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 500, Rand: r}); err != nil {
		t.Fatalf("Property 5 (exactly two equal-length, index-aligned comparison series) failed: %v", err)
	}
}
