package handlers

import (
	"fmt"
	"time"
)

// This file contains the pure, DB/HTTP-free helpers backing the granularity-aware
// analytics time-series endpoint (Requirement 4). The HTTP handler
// (GetCompanyTimeseries in analytics.go) keeps its SQL thin and pushes all
// bucketing/alignment logic into these helpers so they can be property-tested in
// isolation (tasks 9.2 / 9.3).

// TimeseriesEvent is a single sale/order occurrence on the time-line: a
// timestamp plus the order count and revenue it contributes. The handler maps
// each orders/sales row to one event (Orders = 1, Revenue = total_amount); the
// helpers then fold events into a fixed bucket array.
type TimeseriesEvent struct {
	Timestamp time.Time
	Orders    int
	Revenue   float64
}

// TimeseriesBucket is one plotted point: the bucket's start (ISO-8601, UTC) and
// the aggregated orders + revenue that fall inside it. Empty buckets are present
// with zero values (zero-fill within range).
type TimeseriesBucket struct {
	Bucket  string  `json:"bucket"`
	Orders  int     `json:"orders"`
	Revenue float64 `json:"revenue"`
}

// timeseriesBucketDuration maps a range type to its fixed bucket size
// (Requirements 4.2–4.5):
//
//	daily   -> 1 hour
//	weekly  -> 12 hours
//	monthly -> 1 day (24 hours)
//	yearly  -> 1 week (7 days)
//
// The second return value is false for an unrecognized range type.
func timeseriesBucketDuration(rangeType string) (time.Duration, bool) {
	switch rangeType {
	case "daily":
		return time.Hour, true
	case "weekly":
		return 12 * time.Hour, true
	case "monthly":
		return 24 * time.Hour, true
	case "yearly":
		return 7 * 24 * time.Hour, true
	default:
		return 0, false
	}
}

// timeseriesGranularityLabel returns the human/axis-friendly granularity string
// surfaced in the response `granularity` field so the web chart can format its
// X-axis ticks. Returns "" for an unrecognized range type.
func timeseriesGranularityLabel(rangeType string) string {
	switch rangeType {
	case "daily":
		return "hour"
	case "weekly":
		return "12-hour"
	case "monthly":
		return "day"
	case "yearly":
		return "week"
	default:
		return ""
	}
}

// previousPeriodRange computes the equal-length range immediately preceding
// [from, to): from' = from - (to-from), to' = from (Requirement 4.7). The
// returned range has exactly the same length as the input range, so it buckets
// into the same number of buckets and stays index-aligned with the current
// series (Requirement 4.6).
func previousPeriodRange(from, to time.Time) (time.Time, time.Time) {
	span := to.Sub(from)
	return from.Add(-span), from
}

// computeTimeseriesBuckets returns the ordered bucket-start instants that tile
// [from, to) for the given range type. The bucket count is
// ceil((to-from)/bucketSize) so the whole range is covered (zero-fill within the
// range only); every returned start lies within [from, to). An empty slice is
// returned when the range is empty (to <= from). An error is returned for an
// unrecognized range type.
func computeTimeseriesBuckets(rangeType string, from, to time.Time) ([]time.Time, error) {
	size, ok := timeseriesBucketDuration(rangeType)
	if !ok {
		return nil, fmt.Errorf("invalid range %q", rangeType)
	}
	if !to.After(from) {
		return []time.Time{}, nil
	}

	total := to.Sub(from)
	// Ceiling division so a partial final bucket is still represented.
	count := int((total + size - 1) / size)

	starts := make([]time.Time, count)
	for i := 0; i < count; i++ {
		starts[i] = from.Add(time.Duration(i) * size)
	}
	return starts, nil
}

// bucketTimeseriesEvents folds events into a fixed array of buckets defined by
// bucketStarts (assumed contiguous, ascending, each bucketSize apart). The
// result has exactly len(bucketStarts) entries in the same order, with empty
// buckets zero-filled. Events before the first bucket start or at/after the end
// of the last bucket are ignored (they fall outside the plotted range). Bucket
// labels are the ISO-8601 UTC representation of each start instant.
//
// This is the core function tasks 9.2 / 9.3 property-test for tiling,
// in-range placement, and index alignment.
func bucketTimeseriesEvents(events []TimeseriesEvent, bucketStarts []time.Time, bucketSize time.Duration) []TimeseriesBucket {
	buckets := make([]TimeseriesBucket, len(bucketStarts))
	for i, start := range bucketStarts {
		buckets[i] = TimeseriesBucket{
			Bucket:  start.UTC().Format(time.RFC3339),
			Orders:  0,
			Revenue: 0,
		}
	}

	if len(bucketStarts) == 0 || bucketSize <= 0 {
		return buckets
	}

	from := bucketStarts[0]
	for _, e := range events {
		if e.Timestamp.Before(from) {
			continue
		}
		idx := int(e.Timestamp.Sub(from) / bucketSize)
		if idx < 0 || idx >= len(buckets) {
			continue
		}
		buckets[idx].Orders += e.Orders
		buckets[idx].Revenue += e.Revenue
	}
	return buckets
}
