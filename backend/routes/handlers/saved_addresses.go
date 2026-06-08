package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Saved delivery addresses CRUD (Requirement 13).
//
// All endpoints are scoped to a user resolved by phone (consistent with the other
// /api/users/:phone handlers, which map phone -> users.id via
// `SELECT id FROM users WHERE phone = $1`). Ownership is enforced on every mutation:
// an address must belong to the resolved user, otherwise the request is rejected
// with HTTP 404 and performs NO mutation (Error Handling table: "Saved address not
// owned by user -> 404/403, no mutation").
//
// Persistence uses the saved_addresses table from migration 214:
//   id, user_id, label, address_text, latitude, longitude, recipient_name,
//   is_default, created_at, updated_at.

// resolveUserIDByPhone maps a phone number to users.id, mirroring how the other
// user handlers resolve the principal. Returns sql.ErrNoRows when no user matches.
func resolveUserIDByPhone(db *sql.DB, phone string) (int64, error) {
	var userID int64
	err := db.QueryRow("SELECT id FROM users WHERE phone = $1", phone).Scan(&userID)
	return userID, err
}

// savedAddressRow holds a scanned saved_addresses row and builds its JSON
// representation via toJSON. The coordinate columns are nullable (NUMERIC(9,6))
// and recipient_name is optional; they are emitted as null when absent.
type savedAddressRow struct {
	ID            int64
	Label         string
	AddressText   string
	Latitude      sql.NullFloat64
	Longitude     sql.NullFloat64
	RecipientName sql.NullString
	IsDefault     bool
	CreatedAt     sql.NullString
	UpdatedAt     sql.NullString
}

func (r savedAddressRow) toJSON() gin.H {
	out := gin.H{
		"id":          r.ID,
		"label":       r.Label,
		"addressText": r.AddressText,
		"isDefault":   r.IsDefault,
	}
	if r.Latitude.Valid {
		out["latitude"] = r.Latitude.Float64
	} else {
		out["latitude"] = nil
	}
	if r.Longitude.Valid {
		out["longitude"] = r.Longitude.Float64
	} else {
		out["longitude"] = nil
	}
	if r.RecipientName.Valid {
		out["recipientName"] = r.RecipientName.String
	} else {
		out["recipientName"] = nil
	}
	if r.CreatedAt.Valid {
		out["createdAt"] = r.CreatedAt.String
	}
	if r.UpdatedAt.Valid {
		out["updatedAt"] = r.UpdatedAt.String
	}
	return out
}

// GetSavedAddresses handles GET /api/users/:phone/addresses — list the user's
// saved addresses (default first, then most recently created).
func GetSavedAddresses(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		userID, err := resolveUserIDByPhone(db, phone)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		if err != nil {
			log.Printf("❌ GetSavedAddresses user lookup error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		rows, err := db.Query(`
			SELECT id, label, address_text, latitude, longitude, recipient_name,
			       is_default, created_at, updated_at
			FROM saved_addresses
			WHERE user_id = $1
			ORDER BY is_default DESC, created_at DESC, id DESC
		`, userID)
		if err != nil {
			log.Printf("❌ GetSavedAddresses query error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch addresses"})
			return
		}
		defer rows.Close()

		addresses := make([]gin.H, 0)
		for rows.Next() {
			var r savedAddressRow
			if err := rows.Scan(
				&r.ID, &r.Label, &r.AddressText, &r.Latitude, &r.Longitude,
				&r.RecipientName, &r.IsDefault, &r.CreatedAt, &r.UpdatedAt,
			); err != nil {
				log.Printf("⚠️ Error scanning saved address: %v", err)
				continue
			}
			addresses = append(addresses, r.toJSON())
		}

		c.JSON(http.StatusOK, addresses)
	}
}

// CreateSavedAddress handles POST /api/users/:phone/addresses.
// Body: { label, addressText, latitude, longitude, recipientName, isDefault }.
// When isDefault=true, the user's other rows have is_default cleared in the same
// transaction so at most one default exists per user (Requirement 13.1).
func CreateSavedAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		userID, err := resolveUserIDByPhone(db, phone)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		if err != nil {
			log.Printf("❌ CreateSavedAddress user lookup error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		var input struct {
			Label         string   `json:"label"`
			AddressText   string   `json:"addressText"`
			Latitude      *float64 `json:"latitude"`
			Longitude     *float64 `json:"longitude"`
			RecipientName string   `json:"recipientName"`
			IsDefault     bool     `json:"isDefault"`
		}
		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if input.Label == "" || input.AddressText == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "label and addressText are required"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ CreateSavedAddress begin tx error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
		defer tx.Rollback()

		// Clearing other defaults and inserting the new row happen atomically so a
		// failure never leaves two defaults behind.
		if input.IsDefault {
			if _, err := tx.Exec(
				`UPDATE saved_addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1`,
				userID,
			); err != nil {
				log.Printf("❌ CreateSavedAddress clear-default error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save address"})
				return
			}
		}

		var newID int64
		err = tx.QueryRow(`
			INSERT INTO saved_addresses
			    (user_id, label, address_text, latitude, longitude, recipient_name, is_default)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`, userID, input.Label, input.AddressText, input.Latitude, input.Longitude,
			nullableString(input.RecipientName), input.IsDefault,
		).Scan(&newID)
		if err != nil {
			log.Printf("❌ CreateSavedAddress insert error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save address"})
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("❌ CreateSavedAddress commit error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save address"})
			return
		}

		log.Printf("✅ Saved address created: ID=%d for user=%d", newID, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "id": newID})
	}
}

// UpdateSavedAddress handles PUT /api/users/:phone/addresses/:addressId.
// Updates label / coordinates / address text / recipient / isDefault. Ownership is
// enforced: the address must belong to the resolved user, otherwise the request is
// rejected with HTTP 404 and NO mutation occurs (Requirement 13.5).
func UpdateSavedAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		addressID, err := strconv.ParseInt(c.Param("addressId"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid address ID"})
			return
		}

		userID, err := resolveUserIDByPhone(db, phone)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		if err != nil {
			log.Printf("❌ UpdateSavedAddress user lookup error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		// Partial update: only fields present in the body are changed. Pointers
		// distinguish "absent" (nil) from "explicitly set".
		var input struct {
			Label         *string  `json:"label"`
			AddressText   *string  `json:"addressText"`
			Latitude      *float64 `json:"latitude"`
			Longitude     *float64 `json:"longitude"`
			RecipientName *string  `json:"recipientName"`
			IsDefault     *bool    `json:"isDefault"`
		}
		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ UpdateSavedAddress begin tx error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
		defer tx.Rollback()

		// Fetch current values AND enforce ownership in one step: the WHERE clause
		// requires both id and user_id to match, so a foreign address yields
		// ErrNoRows and no mutation is performed.
		var cur savedAddressRow
		err = tx.QueryRow(`
			SELECT id, label, address_text, latitude, longitude, recipient_name, is_default
			FROM saved_addresses
			WHERE id = $1 AND user_id = $2
		`, addressID, userID).Scan(
			&cur.ID, &cur.Label, &cur.AddressText, &cur.Latitude, &cur.Longitude,
			&cur.RecipientName, &cur.IsDefault,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Address not found"})
			return
		}
		if err != nil {
			log.Printf("❌ UpdateSavedAddress fetch error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update address"})
			return
		}

		// Merge patches over current values.
		label := cur.Label
		if input.Label != nil {
			label = *input.Label
		}
		addressText := cur.AddressText
		if input.AddressText != nil {
			addressText = *input.AddressText
		}
		var latitude interface{}
		if input.Latitude != nil {
			latitude = *input.Latitude
		} else if cur.Latitude.Valid {
			latitude = cur.Latitude.Float64
		}
		var longitude interface{}
		if input.Longitude != nil {
			longitude = *input.Longitude
		} else if cur.Longitude.Valid {
			longitude = cur.Longitude.Float64
		}
		recipientName := cur.RecipientName.String
		if input.RecipientName != nil {
			recipientName = *input.RecipientName
		}
		isDefault := cur.IsDefault
		if input.IsDefault != nil {
			isDefault = *input.IsDefault
		}

		// When promoting this address to default, clear the flag on the user's other
		// rows in the same transaction (Requirement 13.1 — single default per user).
		if isDefault {
			if _, err := tx.Exec(
				`UPDATE saved_addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1 AND id <> $2`,
				userID, addressID,
			); err != nil {
				log.Printf("❌ UpdateSavedAddress clear-default error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update address"})
				return
			}
		}

		if _, err := tx.Exec(`
			UPDATE saved_addresses
			SET label = $1, address_text = $2, latitude = $3, longitude = $4,
			    recipient_name = $5, is_default = $6, updated_at = NOW()
			WHERE id = $7 AND user_id = $8
		`, label, addressText, latitude, longitude, nullableString(recipientName),
			isDefault, addressID, userID); err != nil {
			log.Printf("❌ UpdateSavedAddress update error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update address"})
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("❌ UpdateSavedAddress commit error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update address"})
			return
		}

		log.Printf("✅ Saved address updated: ID=%d for user=%d", addressID, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Address updated"})
	}
}

// DeleteSavedAddress handles DELETE /api/users/:phone/addresses/:addressId.
// Removes the address from the user's saved list. Ownership is enforced via the
// WHERE clause (id AND user_id); a foreign or missing address affects no rows and
// returns HTTP 404 with no mutation (Requirement 13.6).
func DeleteSavedAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		addressID, err := strconv.ParseInt(c.Param("addressId"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid address ID"})
			return
		}

		userID, err := resolveUserIDByPhone(db, phone)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		if err != nil {
			log.Printf("❌ DeleteSavedAddress user lookup error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		result, err := db.Exec(
			`DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2`,
			addressID, userID,
		)
		if err != nil {
			log.Printf("❌ DeleteSavedAddress delete error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete address"})
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Address not found"})
			return
		}

		log.Printf("✅ Saved address deleted: ID=%d for user=%d", addressID, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Address deleted"})
	}
}
