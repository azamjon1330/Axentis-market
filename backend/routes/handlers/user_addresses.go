package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type deliveryAddress struct {
	ID        int      `json:"id"`
	UserPhone string   `json:"userPhone"`
	Title     *string  `json:"title"`
	Address   string   `json:"address"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	IsDefault bool     `json:"isDefault"`
	CreatedAt string   `json:"createdAt"`
}

// GetUserAddresses GET /api/users/:phone/addresses
func GetUserAddresses(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		rows, err := db.Query(`
			SELECT id, user_phone, title, address, latitude, longitude, is_default, created_at
			FROM user_delivery_addresses
			WHERE user_phone = $1
			ORDER BY is_default DESC, created_at DESC`, phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var list []deliveryAddress
		for rows.Next() {
			var a deliveryAddress
			if err := rows.Scan(&a.ID, &a.UserPhone, &a.Title, &a.Address, &a.Latitude, &a.Longitude, &a.IsDefault, &a.CreatedAt); err != nil {
				continue
			}
			list = append(list, a)
		}
		if list == nil {
			list = []deliveryAddress{}
		}
		c.JSON(http.StatusOK, list)
	}
}

// AddUserAddress POST /api/users/:phone/addresses
func AddUserAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		var req struct {
			Title     *string  `json:"title"`
			Address   string   `json:"address" binding:"required"`
			Latitude  *float64 `json:"latitude"`
			Longitude *float64 `json:"longitude"`
			IsDefault bool     `json:"isDefault"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback()

		if req.IsDefault {
			if _, err := tx.Exec(`UPDATE user_delivery_addresses SET is_default = FALSE WHERE user_phone = $1`, phone); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}

		var a deliveryAddress
		err = tx.QueryRow(`
			INSERT INTO user_delivery_addresses (user_phone, title, address, latitude, longitude, is_default)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, user_phone, title, address, latitude, longitude, is_default, created_at`,
			phone, req.Title, req.Address, req.Latitude, req.Longitude, req.IsDefault,
		).Scan(&a.ID, &a.UserPhone, &a.Title, &a.Address, &a.Latitude, &a.Longitude, &a.IsDefault, &a.CreatedAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, a)
	}
}

// UpdateUserAddress PUT /api/users/:phone/addresses/:id
func UpdateUserAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		var req struct {
			Title     *string  `json:"title"`
			Address   *string  `json:"address"`
			Latitude  *float64 `json:"latitude"`
			Longitude *float64 `json:"longitude"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var a deliveryAddress
		err = db.QueryRow(`
			UPDATE user_delivery_addresses
			SET title = COALESCE($1, title),
			    address = COALESCE($2, address),
			    latitude = COALESCE($3, latitude),
			    longitude = COALESCE($4, longitude)
			WHERE id = $5 AND user_phone = $6
			RETURNING id, user_phone, title, address, latitude, longitude, is_default, created_at`,
			req.Title, req.Address, req.Latitude, req.Longitude, id, phone,
		).Scan(&a.ID, &a.UserPhone, &a.Title, &a.Address, &a.Latitude, &a.Longitude, &a.IsDefault, &a.CreatedAt)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, a)
	}
}

// DeleteUserAddress DELETE /api/users/:phone/addresses/:id
func DeleteUserAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		res, err := db.Exec(`DELETE FROM user_delivery_addresses WHERE id = $1 AND user_phone = $2`, id, phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// SetDefaultAddress PUT /api/users/:phone/addresses/:id/default
func SetDefaultAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer tx.Rollback()

		if _, err := tx.Exec(`UPDATE user_delivery_addresses SET is_default = FALSE WHERE user_phone = $1`, phone); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var a deliveryAddress
		err = tx.QueryRow(`
			UPDATE user_delivery_addresses SET is_default = TRUE
			WHERE id = $1 AND user_phone = $2
			RETURNING id, user_phone, title, address, latitude, longitude, is_default, created_at`,
			id, phone,
		).Scan(&a.ID, &a.UserPhone, &a.Title, &a.Address, &a.Latitude, &a.Longitude, &a.IsDefault, &a.CreatedAt)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, a)
	}
}
