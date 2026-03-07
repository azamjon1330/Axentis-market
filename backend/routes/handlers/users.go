package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Check if user is unique
func CheckUserUnique(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			FirstName string `json:"firstName"`
			LastName  string `json:"lastName"`
			Phone     string `json:"phone" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Check if phone is taken
		var existingUserID int64
		var existingName sql.NullString
		err := db.QueryRow("SELECT id, name FROM users WHERE phone = $1", req.Phone).Scan(&existingUserID, &existingName)
		
		if err == nil {
			// Phone is taken, check if it's the same person
			fullName := req.FirstName + " " + req.LastName
			if existingName.String != "" && existingName.String != fullName {
				c.JSON(http.StatusOK, gin.H{
					"unique": false,
					"reason": "phone_taken",
					"existingUser": gin.H{
						"first_name": req.FirstName,
						"last_name":  req.LastName,
					},
				})
				return
			}
		} else if err != sql.ErrNoRows {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		// User is unique
		c.JSON(http.StatusOK, gin.H{"unique": true})
	}
}

// Get User Cart
func GetUserCart(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var cartStr sql.NullString
		err := db.QueryRow("SELECT cart::text FROM users WHERE phone = $1", phone).Scan(&cartStr)

		if err == sql.ErrNoRows || !cartStr.Valid || cartStr.String == "" {
			c.JSON(http.StatusOK, gin.H{})
			return
		}

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		// Parse JSON string and return as object
		var cart interface{}
		if err := json.Unmarshal([]byte(cartStr.String), &cart); err != nil {
			c.JSON(http.StatusOK, gin.H{})
			return
		}

		c.JSON(http.StatusOK, cart)
	}
}

// Save User Cart
func SaveUserCart(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		var cart interface{}

		if err := c.ShouldBindJSON(&cart); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Convert to JSON string for JSONB column
		cartJSON, err := json.Marshal(cart)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cart format"})
			return
		}

		_, err = db.Exec(`
			INSERT INTO users (phone, cart, name)
			VALUES ($1, $2::jsonb, '')
			ON CONFLICT (phone) DO UPDATE SET cart = $2::jsonb, updated_at = NOW()
		`, phone, string(cartJSON))

		if err != nil {
			log.Println("❌ Error saving cart:", err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save cart", "details": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Get User Likes
func GetUserLikes(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var likesStr sql.NullString
		err := db.QueryRow("SELECT likes::text FROM users WHERE phone = $1", phone).Scan(&likesStr)

		if err == sql.ErrNoRows || !likesStr.Valid || likesStr.String == "" {
			c.JSON(http.StatusOK, []int{})
			return
		}

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		// Parse JSON string and return as array
		var likes []int
		if err := json.Unmarshal([]byte(likesStr.String), &likes); err != nil {
			c.JSON(http.StatusOK, []int{})
			return
		}

		c.JSON(http.StatusOK, likes)
	}
}

// Save User Likes
func SaveUserLikes(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		var likes []int

		if err := c.ShouldBindJSON(&likes); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Convert to JSON string for JSONB column
		likesJSON, err := json.Marshal(likes)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid likes format"})
			return
		}

		_, err = db.Exec(`
			INSERT INTO users (phone, likes, name)
			VALUES ($1, $2::jsonb, '')
			ON CONFLICT (phone) DO UPDATE SET likes = $2::jsonb, updated_at = NOW()
		`, phone, string(likesJSON))

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save likes"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// GetUserByPhone gets user details by phone number
func GetUserByPhone(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var user struct {
			ID        int    `json:"id"`
			Phone     string `json:"phone"`
			Name      string `json:"name"`
			Role      string `json:"role"`
			AvatarURL string `json:"avatarUrl,omitempty"`
		}

		err := db.QueryRow(`
			SELECT id, phone, COALESCE(name, ''), COALESCE(role, 'user'), COALESCE(avatar_url, '')
			FROM users
			WHERE phone = $1
		`, phone).Scan(&user.ID, &user.Phone, &user.Name, &user.Role, &user.AvatarURL)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, user)
	}
}

// GetUserReviews returns all reviews made by a user
func GetUserReviews(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		// Get reviews with product and company information using reviews table
		rows, err := db.Query(`
			SELECT 
				r.id, r.product_id, r.user_phone, r.user_name, r.rating, r.comment, r.created_at,
				COALESCE(r.likes, 0) as likes, COALESCE(r.dislikes, 0) as dislikes,
				p.name as product_name, p.images as product_images, p.price, p.selling_price,
				c.name as company_name, c.id as company_id
			FROM reviews r
			JOIN products p ON r.product_id = p.id
			JOIN companies c ON p.company_id = c.id
			WHERE r.user_phone = $1
			ORDER BY r.created_at DESC
		`, phone)

		if err != nil {
			log.Printf("❌ Error fetching user reviews: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		reviews := []map[string]interface{}{}
		for rows.Next() {
			var reviewID, productID int64
			var companyID int64
			var rating, likes, dislikes int
			var userPhone, userName string
			var comment sql.NullString
			var createdAt string
			var productName string
			var productImages string
			var price, sellingPrice float64
			var companyName string

			err := rows.Scan(&reviewID, &productID, &userPhone, &userName, &rating, &comment, &createdAt,
				&likes, &dislikes, &productName, &productImages, &price, &sellingPrice, &companyName, &companyID)
			if err != nil {
				log.Printf("⚠️ Error scanning review: %v", err)
				continue
			}

			review := map[string]interface{}{
				"id":            reviewID,
				"productId":     productID,
				"userPhone":     userPhone,
				"userName":      userName,
				"rating":        rating,
				"createdAt":     createdAt,
				"likes":         likes,
				"dislikes":      dislikes,
				"productName":   productName,
				"productImages": productImages,
				"price":         price,
				"sellingPrice":  sellingPrice,
				"companyName":   companyName,
				"companyId":     companyID,
			}

			if comment.Valid {
				review["comment"] = comment.String
			}

			reviews = append(reviews, review)
		}

		c.JSON(http.StatusOK, reviews)
	}
}

// GetUserStats returns follower/following/views stats for a user
func GetUserStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var userID int
		var followersCount, followingCount, profileViews int

		err := db.QueryRow(`
			SELECT id, COALESCE(followers_count, 0), COALESCE(following_count, 0), COALESCE(profile_views, 0)
			FROM users
			WHERE phone = $1
		`, phone).Scan(&userID, &followersCount, &followingCount, &profileViews)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"following": followingCount,
			"followers": followersCount,
			"views":     profileViews,
		})
	}
}

// ToggleSubscription toggles subscription between users or user to company
func ToggleSubscription(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var req struct {
			TargetPhone string `json:"targetPhone"`
			CompanyID   *int   `json:"companyId"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get current user ID
		var userID int
		err := db.QueryRow("SELECT id FROM users WHERE phone = $1", phone).Scan(&userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		var targetUserID *int
		if req.TargetPhone != "" {
			var tid int
			err = db.QueryRow("SELECT id FROM users WHERE phone = $1", req.TargetPhone).Scan(&tid)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Target user not found"})
				return
			}
			targetUserID = &tid
		}

		// Check if subscription exists
		var existingID int
		var checkQuery string
		var checkArgs []interface{}

		if req.CompanyID != nil {
			checkQuery = "SELECT id FROM subscriptions WHERE user_id = $1 AND company_id = $2"
			checkArgs = []interface{}{userID, *req.CompanyID}
		} else if targetUserID != nil {
			checkQuery = "SELECT id FROM subscriptions WHERE user_id = $1 AND subscribed_user_id = $2"
			checkArgs = []interface{}{userID, *targetUserID}
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Must provide either targetPhone or companyId"})
			return
		}

		err = db.QueryRow(checkQuery, checkArgs...).Scan(&existingID)
		isSubscribed := err == nil

		if isSubscribed {
			// Unsubscribe
			_, err = db.Exec("DELETE FROM subscriptions WHERE id = $1", existingID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsubscribe"})
				return
			}

			// Update counts
			if req.CompanyID != nil {
				db.Exec("UPDATE companies SET followers_count = followers_count - 1 WHERE id = $1", *req.CompanyID)
			} else if targetUserID != nil {
				db.Exec("UPDATE users SET followers_count = followers_count - 1 WHERE id = $1", *targetUserID)
			}
			db.Exec("UPDATE users SET following_count = following_count - 1 WHERE id = $1", userID)

			c.JSON(http.StatusOK, gin.H{"subscribed": false})
		} else {
			// Subscribe
			var insertQuery string
			var insertArgs []interface{}

			if req.CompanyID != nil {
				insertQuery = "INSERT INTO subscriptions (user_id, company_id) VALUES ($1, $2)"
				insertArgs = []interface{}{userID, *req.CompanyID}
			} else {
				insertQuery = "INSERT INTO subscriptions (user_id, subscribed_user_id) VALUES ($1, $2)"
				insertArgs = []interface{}{userID, *targetUserID}
			}

			_, err = db.Exec(insertQuery, insertArgs...)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
				return
			}

			// Update counts
			if req.CompanyID != nil {
				db.Exec("UPDATE companies SET followers_count = followers_count + 1 WHERE id = $1", *req.CompanyID)
			} else if targetUserID != nil {
				db.Exec("UPDATE users SET followers_count = followers_count + 1 WHERE id = $1", *targetUserID)
			}
			db.Exec("UPDATE users SET following_count = following_count + 1 WHERE id = $1", userID)

			c.JSON(http.StatusOK, gin.H{"subscribed": true})
		}
	}
}

// CheckSubscriptionStatus checks if user is subscribed to another user or company
func CheckSubscriptionStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		targetPhone := c.Param("targetPhone")
		companyID := c.Query("companyId")

		var userID int
		err := db.QueryRow("SELECT id FROM users WHERE phone = $1", phone).Scan(&userID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		var isSubscribed bool
		if companyID != "" {
			// Check company subscription
			var count int
			err = db.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE user_id = $1 AND company_id = $2", 
				userID, companyID).Scan(&count)
			isSubscribed = err == nil && count > 0
		} else {
			// Check user subscription
			var targetUserID int
			err = db.QueryRow("SELECT id FROM users WHERE phone = $1", targetPhone).Scan(&targetUserID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Target user not found"})
				return
			}

			var count int
			err = db.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE user_id = $1 AND subscribed_user_id = $2",
				userID, targetUserID).Scan(&count)
			isSubscribed = err == nil && count > 0
		}

		c.JSON(http.StatusOK, gin.H{"subscribed": isSubscribed})
	}
}

// IncrementProfileViews increments the profile view count
func IncrementProfileViews(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		_, err := db.Exec("UPDATE users SET profile_views = profile_views + 1 WHERE phone = $1", phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to increment views"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// GetUserDefaultDeliveryAddress - получение адреса доставки пользователя по умолчанию
func GetUserDefaultDeliveryAddress(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var address, coordinates, recipientName sql.NullString
		
		err := db.QueryRow(`
			SELECT 
				COALESCE(default_delivery_address, ''),
				COALESCE(default_delivery_coordinates, ''),
				COALESCE(default_recipient_name, '')
			FROM users
			WHERE phone = $1
		`, phone).Scan(&address, &coordinates, &recipientName)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{
				"deliveryAddress":     "",
				"deliveryCoordinates": "",
				"recipientName":       "",
			})
			return
		}

		if err != nil {
			log.Printf("❌ GetUserDefaultDeliveryAddress error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get delivery address"})
			return
		}

		response := gin.H{
			"deliveryAddress":     address.String,
			"deliveryCoordinates": coordinates.String,
			"recipientName":       recipientName.String,
		}

		log.Printf("📍 GetUserDefaultDeliveryAddress for %s: %v", phone, response)
		c.JSON(http.StatusOK, response)
	}
}
