package handlers

import (
	"testing"
	"testing/quick"
	"time"
)

// Feature: marketplace-improvements, Property 10: Exposed subscription status
// reflects flag and expiry.
//
// These tests exercise deriveIsSubscribed, the pure Go mirror of the SQL
// subscription-derivation expression used in GetProducts/GetCompanies
// (Requirement 9.4):
//
//	is_subscribed AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
//
// Because the rule is pure, it can be validated across many randomized inputs
// without a database.

// expiryKind classifies the three meaningful shapes of subscription_expires_at
// relative to a fixed "now": absent (NULL), already elapsed (past), or still
// active (future). Generating against these classes — rather than raw
// timestamps — guarantees coverage of every branch of the derivation rule.
const (
	expiryNil = iota
	expiryPast
	expiryFuture
)

// buildExpiry turns a class selector plus a magnitude into a concrete
// *time.Time relative to now. nil models a SQL NULL expiry. past/future are
// offset by a strictly non-zero amount so boundary ambiguity (expiry == now)
// is avoided; the > comparison in the rule treats now itself as expired.
func buildExpiry(kind int, offsetSecs uint16, now time.Time) *time.Time {
	switch kind % 3 {
	case expiryPast:
		t := now.Add(-time.Duration(offsetSecs+1) * time.Second)
		return &t
	case expiryFuture:
		t := now.Add(time.Duration(offsetSecs+1) * time.Second)
		return &t
	default: // expiryNil
		return nil
	}
}

// TestProperty10_SubscriptionDerivation is the core property test.
//
// Feature: marketplace-improvements, Property 10: Exposed subscription status
// reflects flag and expiry.
//
// Validates: Requirements 9.4.
//
// For random (isSubscribed bool, expiresAt nil|past|future, now),
// deriveIsSubscribed returns true IFF isSubscribed AND (expiresAt == nil OR
// expiresAt.After(now)). The expected value is computed from the expiry class
// independently of the implementation's pointer arithmetic, so the test is a
// genuine oracle rather than a restatement of the code.
func TestProperty10_SubscriptionDerivation(t *testing.T) {
	now := time.Date(2025, 6, 1, 12, 0, 0, 0, time.UTC)

	property := func(isSubscribed bool, rawKind uint8, offsetSecs uint16) bool {
		kind := int(rawKind) % 3
		expiresAt := buildExpiry(kind, offsetSecs, now)

		got := deriveIsSubscribed(isSubscribed, expiresAt, now)

		// Independent oracle: a company is active only when the flag is set and
		// the expiry is either absent or in the future.
		expiryActive := kind == expiryNil || kind == expiryFuture
		want := isSubscribed && expiryActive

		if got != want {
			t.Logf("mismatch: isSubscribed=%v kind=%d offset=%d -> got=%v want=%v",
				isSubscribed, kind, offsetSecs, got, want)
			return false
		}
		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 10 (subscription derivation) failed: %v", err)
	}
}

// TestProperty10_FlagFalseAlwaysUnsubscribed pins the dominating clause: when
// is_subscribed is false the exposed status is false regardless of expiry.
//
// Validates: Requirements 9.4.
func TestProperty10_FlagFalseAlwaysUnsubscribed(t *testing.T) {
	now := time.Date(2025, 6, 1, 12, 0, 0, 0, time.UTC)

	property := func(rawKind uint8, offsetSecs uint16) bool {
		expiresAt := buildExpiry(int(rawKind)%3, offsetSecs, now)
		// Flag off => never subscribed, whatever the expiry.
		return deriveIsSubscribed(false, expiresAt, now) == false
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 200}); err != nil {
		t.Errorf("flag-false-always-unsubscribed property failed: %v", err)
	}
}

// TestProperty10_Examples is a small table of concrete edge cases that anchor
// the property test with human-readable expectations, including the boundary
// where expiry equals now (treated as expired by the strict > rule).
//
// Validates: Requirements 9.4.
func TestProperty10_Examples(t *testing.T) {
	now := time.Date(2025, 6, 1, 12, 0, 0, 0, time.UTC)
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)
	atNow := now

	cases := []struct {
		name         string
		isSubscribed bool
		expiresAt    *time.Time
		want         bool
	}{
		{"flag off, nil expiry", false, nil, false},
		{"flag off, future expiry", false, &future, false},
		{"flag on, nil expiry (no expiry)", true, nil, true},
		{"flag on, future expiry (active)", true, &future, true},
		{"flag on, past expiry (lapsed)", true, &past, false},
		{"flag on, expiry == now (lapsed, strict >)", true, &atNow, false},
	}

	for _, tc := range cases {
		if got := deriveIsSubscribed(tc.isSubscribed, tc.expiresAt, now); got != tc.want {
			t.Errorf("%s: deriveIsSubscribed = %v, want %v", tc.name, got, tc.want)
		}
	}
}
