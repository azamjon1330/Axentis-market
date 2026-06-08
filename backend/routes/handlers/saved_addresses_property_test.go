package handlers

import (
	"math"
	"testing"
	"testing/quick"
)

// Feature: marketplace-improvements, Property 15: Saved-address CRUD round-trips.
//
// Validates: Requirements 13.1, 13.5, 13.6.
//
// The DB-backed handlers in saved_addresses.go (Create/Update/Delete/Get) require
// Postgres, which is not available in this sandbox. To exercise the same semantics
// deterministically, this file builds a small pure in-memory model of the
// saved-address store that mirrors the handler behavior:
//
//   - Create assigns a fresh id and stores
//     {label, addressText, latitude, longitude, recipientName, isDefault};
//     when isDefault=true it clears is_default on the user's other rows
//     (CreateSavedAddress: "UPDATE saved_addresses SET is_default = FALSE ...").
//   - Update merges only the provided fields over the current row and re-applies
//     the single-default rule when isDefault becomes true
//     (UpdateSavedAddress merge + clear-default block).
//   - Delete removes a row by id, scoped to the owning user
//     (DeleteSavedAddress: "DELETE ... WHERE id = $1 AND user_id = $2").
//   - Get reads a row by id scoped to the user.
//
// The model is intentionally self-contained (no DB) per the task guidance.

// saCoord mirrors a nullable NUMERIC(9,6) coordinate column: either absent
// (null) or a value rounded to 6 decimal places, as Postgres would persist it.
type saCoord struct {
	valid bool
	value float64
}

// roundCoord6 rounds to 6 decimal places to mirror NUMERIC(9,6) persistence so
// the create/update round-trip compares values at the stored precision.
func roundCoord6(f float64) float64 {
	return math.Round(f*1e6) / 1e6
}

// newSACoord builds a coordinate from a "present" flag and a raw float. Non-finite
// inputs (NaN/Inf) are treated as absent so generated data never poisons equality.
func newSACoord(present bool, raw float64) saCoord {
	if !present || math.IsNaN(raw) || math.IsInf(raw, 0) {
		return saCoord{valid: false}
	}
	return saCoord{valid: true, value: roundCoord6(raw)}
}

func sameCoord(a, b saCoord) bool {
	if a.valid != b.valid {
		return false
	}
	if !a.valid {
		return true
	}
	return a.value == b.value
}

// saRec is one row of the modeled saved_addresses table.
type saRec struct {
	id            int64
	label         string
	addressText   string
	latitude      saCoord
	longitude     saCoord
	recipientName string
	isDefault     bool
}

// saModel mirrors saved_addresses partitioned by user. Each user's rows are an
// ordered slice; ids are globally unique and monotonically increasing, matching a
// SERIAL/identity primary key.
type saModel struct {
	nextID int64
	rows   map[uint8][]*saRec
}

func newSAModel() *saModel {
	return &saModel{nextID: 1, rows: make(map[uint8][]*saRec)}
}

// clearOtherDefaults clears is_default on every row of the user except exceptID,
// mirroring the in-transaction UPDATE the handlers run when isDefault=true.
func (m *saModel) clearOtherDefaults(user uint8, exceptID int64) {
	for _, r := range m.rows[user] {
		if r.id != exceptID {
			r.isDefault = false
		}
	}
}

// create mirrors CreateSavedAddress. label/addressText are required by the handler;
// callers pass non-empty values. Returns the new row.
func (m *saModel) create(user uint8, label, addressText, recipient string, lat, lng saCoord, isDefault bool) *saRec {
	if isDefault {
		m.clearOtherDefaults(user, 0) // 0 is never a real id
	}
	r := &saRec{
		id:            m.nextID,
		label:         label,
		addressText:   addressText,
		latitude:      lat,
		longitude:     lng,
		recipientName: recipient,
		isDefault:     isDefault,
	}
	m.nextID++
	m.rows[user] = append(m.rows[user], r)
	return r
}

// get reads a row by id scoped to the user (returns nil if absent / not owned).
func (m *saModel) get(user uint8, id int64) *saRec {
	for _, r := range m.rows[user] {
		if r.id == id {
			return r
		}
	}
	return nil
}

// saUpdatePatch is a partial update: nil fields are left unchanged, mirroring the
// pointer-based BindJSON struct in UpdateSavedAddress.
type saUpdatePatch struct {
	label       *string
	addressText *string
	latitude    *saCoord
	longitude   *saCoord
	recipient   *string
	isDefault   *bool
}

// update mirrors UpdateSavedAddress: ownership-scoped lookup, field merge, and the
// single-default re-application. Returns the updated row, or nil when not owned.
func (m *saModel) update(user uint8, id int64, p saUpdatePatch) *saRec {
	r := m.get(user, id)
	if r == nil {
		return nil // ownership mismatch -> 404, no mutation
	}
	if p.label != nil {
		r.label = *p.label
	}
	if p.addressText != nil {
		r.addressText = *p.addressText
	}
	if p.latitude != nil {
		r.latitude = *p.latitude
	}
	if p.longitude != nil {
		r.longitude = *p.longitude
	}
	if p.recipient != nil {
		r.recipientName = *p.recipient
	}
	if p.isDefault != nil {
		r.isDefault = *p.isDefault
		if r.isDefault {
			m.clearOtherDefaults(user, id)
		}
	}
	return r
}

// delete mirrors DeleteSavedAddress: removes the row by id scoped to the user.
// Returns true when a row was removed.
func (m *saModel) delete(user uint8, id int64) bool {
	rows := m.rows[user]
	for i, r := range rows {
		if r.id == id {
			m.rows[user] = append(rows[:i], rows[i+1:]...)
			return true
		}
	}
	return false
}

// defaultCount returns how many of the user's rows are marked is_default=true.
func (m *saModel) defaultCount(user uint8) int {
	n := 0
	for _, r := range m.rows[user] {
		if r.isDefault {
			n++
		}
	}
	return n
}

// atMostOneDefaultEverywhere verifies the single-default invariant across all users.
func (m *saModel) atMostOneDefaultEverywhere() bool {
	for user := range m.rows {
		if m.defaultCount(user) > 1 {
			return false
		}
	}
	return true
}

// saOp is a generated CRUD operation. testing/quick fills every exported field by
// reflection, giving randomized op sequences across multiple users.
type saOp struct {
	Kind      uint8 // 0=create, 1=update, 2=delete (mod 3 applied below)
	User      uint8 // user bucket (mod a small fan-out applied below)
	TargetSel uint8 // selects which existing row to update/delete

	Label     string
	AddrText  string
	Recipient string

	HasLat bool
	Lat    float64
	HasLng bool
	Lng    float64

	IsDefault bool

	// Update field-presence flags (partial update semantics).
	SetLabel     bool
	SetAddr      bool
	SetLat       bool
	SetLng       bool
	SetRecipient bool
	SetDefault   bool
}

const saUserFanout = 4 // number of distinct users the ops address

// nthID returns the id of the user's row at position sel%len, or (0,false) when
// the user has no rows.
func (m *saModel) nthID(user uint8, sel uint8) (int64, bool) {
	rows := m.rows[user]
	if len(rows) == 0 {
		return 0, false
	}
	return rows[int(sel)%len(rows)].id, true
}

// TestProperty15_SavedAddressCRUDRoundTrips is the core model-based property test.
//
// Feature: marketplace-improvements, Property 15: Saved-address CRUD round-trips.
//
// Validates: Requirements 13.1, 13.5, 13.6.
//
// For a randomized sequence of create/update/delete operations across several
// users it asserts, after each operation:
//   - create-then-get returns equal label/addressText/coordinates/recipient (13.1);
//   - update-then-get reflects the merged new values (13.5);
//   - delete-then-get shows the row absent from the user's list (13.6);
//   - at most one row per user has isDefault=true at all times (single-default).
func TestProperty15_SavedAddressCRUDRoundTrips(t *testing.T) {
	property := func(ops []saOp) bool {
		m := newSAModel()

		for _, op := range ops {
			user := op.User % saUserFanout

			switch op.Kind % 3 {
			case 0: // CREATE
				// label/addressText are required; force non-empty to mirror the
				// handler's "label and addressText are required" guard.
				label := "L:" + op.Label
				addr := "A:" + op.AddrText
				lat := newSACoord(op.HasLat, op.Lat)
				lng := newSACoord(op.HasLng, op.Lng)

				created := m.create(user, label, addr, op.Recipient, lat, lng, op.IsDefault)

				// create-then-get round-trip (Req 13.1).
				got := m.get(user, created.id)
				if got == nil ||
					got.label != label ||
					got.addressText != addr ||
					got.recipientName != op.Recipient ||
					!sameCoord(got.latitude, lat) ||
					!sameCoord(got.longitude, lng) {
					t.Logf("create round-trip mismatch: created=%+v got=%+v", created, got)
					return false
				}

			case 1: // UPDATE
				id, ok := m.nthID(user, op.TargetSel)
				if !ok {
					continue // nothing to update for this user yet
				}
				patch := saUpdatePatch{}
				if op.SetLabel {
					v := "L2:" + op.Label
					patch.label = &v
				}
				if op.SetAddr {
					v := "A2:" + op.AddrText
					patch.addressText = &v
				}
				if op.SetLat {
					c := newSACoord(op.HasLat, op.Lat)
					patch.latitude = &c
				}
				if op.SetLng {
					c := newSACoord(op.HasLng, op.Lng)
					patch.longitude = &c
				}
				if op.SetRecipient {
					v := op.Recipient
					patch.recipient = &v
				}
				if op.SetDefault {
					v := op.IsDefault
					patch.isDefault = &v
				}

				updated := m.update(user, id, patch)
				if updated == nil {
					t.Logf("update unexpectedly failed for owned id=%d user=%d", id, user)
					return false
				}

				// update-then-get reflects the new values (Req 13.5).
				got := m.get(user, id)
				if got == nil {
					t.Logf("update round-trip: row vanished id=%d", id)
					return false
				}
				if patch.label != nil && got.label != *patch.label {
					return false
				}
				if patch.addressText != nil && got.addressText != *patch.addressText {
					return false
				}
				if patch.latitude != nil && !sameCoord(got.latitude, *patch.latitude) {
					return false
				}
				if patch.longitude != nil && !sameCoord(got.longitude, *patch.longitude) {
					return false
				}
				if patch.recipient != nil && got.recipientName != *patch.recipient {
					return false
				}
				if patch.isDefault != nil && got.isDefault != *patch.isDefault {
					return false
				}

			case 2: // DELETE
				id, ok := m.nthID(user, op.TargetSel)
				if !ok {
					continue
				}
				if !m.delete(user, id) {
					t.Logf("delete failed for owned id=%d user=%d", id, user)
					return false
				}
				// delete-then-get shows it absent (Req 13.6).
				if m.get(user, id) != nil {
					t.Logf("deleted row still present id=%d user=%d", id, user)
					return false
				}
			}

			// Single-default invariant must hold after EVERY operation.
			if !m.atMostOneDefaultEverywhere() {
				t.Logf("more than one default for some user after op %+v", op)
				return false
			}
		}
		return true
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 300}); err != nil {
		t.Errorf("Property 15 failed: %v", err)
	}
}

// TestProperty15_DefaultPromotionClearsOthers focuses the single-default rule:
// promoting any row to default leaves exactly one default for that user.
//
// Validates: Requirements 13.1, 13.5.
func TestProperty15_DefaultPromotionClearsOthers(t *testing.T) {
	property := func(n uint8, promoteSel uint8) bool {
		count := int(n%8) + 1 // 1..8 addresses
		m := newSAModel()
		const user = uint8(0)

		// Seed several addresses, each created as default so multiple clears occur.
		for i := 0; i < count; i++ {
			m.create(user, "L", "A", "", saCoord{}, saCoord{}, true)
		}
		// After a sequence of default creates there must be exactly one default.
		if m.defaultCount(user) != 1 {
			return false
		}

		// Promote an arbitrary row to default via update; still exactly one.
		id, ok := m.nthID(user, promoteSel)
		if !ok {
			return false
		}
		yes := true
		m.update(user, id, saUpdatePatch{isDefault: &yes})
		if m.defaultCount(user) != 1 {
			return false
		}
		// The promoted row is the one that is default.
		got := m.get(user, id)
		return got != nil && got.isDefault
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 200}); err != nil {
		t.Errorf("default-promotion property failed: %v", err)
	}
}

// TestProperty15_OwnershipScoping focuses the ownership rule: get/update/delete
// against a different user never touch another user's row.
//
// Validates: Requirements 13.5, 13.6.
func TestProperty15_OwnershipScoping(t *testing.T) {
	property := func(label, addr string) bool {
		m := newSAModel()
		const owner = uint8(1)
		const other = uint8(2)

		created := m.create(owner, "L:"+label, "A:"+addr, "", saCoord{}, saCoord{}, false)

		// Another user cannot see, update, or delete the owner's row.
		if m.get(other, created.id) != nil {
			return false
		}
		newLabel := "HACKED"
		if m.update(other, created.id, saUpdatePatch{label: &newLabel}) != nil {
			return false
		}
		if m.delete(other, created.id) {
			return false
		}

		// Owner's row is intact.
		got := m.get(owner, created.id)
		return got != nil && got.label == "L:"+label && got.addressText == "A:"+addr
	}

	if err := quick.Check(property, &quick.Config{MaxCount: 200}); err != nil {
		t.Errorf("ownership-scoping property failed: %v", err)
	}
}

// TestSavedAddressModel_Examples pins concrete CRUD cases that complement the
// randomized properties.
//
// Validates: Requirements 13.1, 13.5, 13.6.
func TestSavedAddressModel_Examples(t *testing.T) {
	m := newSAModel()
	const user = uint8(0)

	// Create with coordinates and read back.
	lat := newSACoord(true, 41.311081)
	lng := newSACoord(true, 69.240562)
	a := m.create(user, "Home", "1 Main St", "Ali", lat, lng, true)
	got := m.get(user, a.id)
	if got == nil || got.label != "Home" || got.addressText != "1 Main St" ||
		!sameCoord(got.latitude, lat) || !sameCoord(got.longitude, lng) ||
		got.recipientName != "Ali" || !got.isDefault {
		t.Fatalf("create round-trip failed: %+v", got)
	}

	// Second default create clears the first one's default flag.
	b := m.create(user, "Work", "2 Office Rd", "Vali", saCoord{}, saCoord{}, true)
	if m.get(user, a.id).isDefault {
		t.Errorf("first address should no longer be default")
	}
	if !m.get(user, b.id).isDefault || m.defaultCount(user) != 1 {
		t.Errorf("exactly one default expected, got %d", m.defaultCount(user))
	}

	// Update only the label; other fields unchanged.
	newLabel := "Home (updated)"
	m.update(user, a.id, saUpdatePatch{label: &newLabel})
	if g := m.get(user, a.id); g.label != "Home (updated)" || g.addressText != "1 Main St" {
		t.Errorf("partial update failed: %+v", g)
	}

	// Delete then absent.
	if !m.delete(user, a.id) || m.get(user, a.id) != nil {
		t.Errorf("delete-then-get should be absent")
	}
}
