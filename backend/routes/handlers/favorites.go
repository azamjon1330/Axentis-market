package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// FavoriteItem - структура избранного товара
type FavoriteItem struct {
	ID        int       `json:"id"`
	UserPhone string    `json:"user_phone"`
	ProductID int64     `json:"product_id"`
	AddedAt   time.Time `json:"added_at"`
	
	// Дополнительная информация о товаре
	ProductName   string   `json:"product_name,omitempty"`
	ProductPrice  float64  `json:"product_price,omitempty"`
	ProductImages []string `json:"product_images,omitempty"`
}

// GetUserFavorites - получить избранные товары пользователя
func GetUserFavorites(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		rows, err := db.Query(`
			SELECT 
				f.id, f.user_phone, f.product_id, f.added_at,
				p.name, p.selling_price, COALESCE(p.images::text, '[]') as images
			FROM user_favorites f
			JOIN products p ON f.product_id = p.id
			WHERE f.user_phone = $1
			ORDER BY f.added_at DESC
		`, phone)

		if err != nil {
			log.Printf("❌ Error fetching favorites: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch favorites"})
			return
		}
		defer rows.Close()

		items := make([]FavoriteItem, 0)
		for rows.Next() {
			var item FavoriteItem
			var imagesJSON string
			err := rows.Scan(
				&item.ID, &item.UserPhone, &item.ProductID, &item.AddedAt,
				&item.ProductName, &item.ProductPrice, &imagesJSON,
			)
			if err != nil {
				continue
			}
			item.ProductImages = []string{}
			items = append(items, item)
		}

		log.Printf("❤️ Favorites loaded for %s: %d items", phone, len(items))
		c.JSON(http.StatusOK, items)
	}
}

// AddToFavorites - добавить товар в избранное
func AddToFavorites(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserPhone string `json:"user_phone"`
			ProductID int64  `json:"product_id"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		// Валидация
		if input.UserPhone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User phone is required"})
			return
		}
		if input.ProductID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Product ID is required"})
			return
		}

		// Проверяем существование товара
		var productExists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)", input.ProductID).Scan(&productExists)
		if err != nil || !productExists {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}

		// Добавляем в избранное (игнорируем если уже есть)
		var itemID int
		err = db.QueryRow(`
			INSERT INTO user_favorites (user_phone, product_id)
			VALUES ($1, $2)
			ON CONFLICT (user_phone, product_id) DO NOTHING
			RETURNING id
		`, input.UserPhone, input.ProductID).Scan(&itemID)

		if err != nil {
			// Если товар уже в избранном, возвращаем успех
			if err == sql.ErrNoRows {
				c.JSON(http.StatusOK, gin.H{
					"success": true,
					"message": "Already in favorites",
				})
				return
			}
			log.Printf("❌ Error adding to favorites: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add to favorites"})
			return
		}

		log.Printf("✅ Added to favorites: user=%s, product=%d", input.UserPhone, input.ProductID)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"id":      itemID,
			"message": "Added to favorites successfully",
		})
	}
}

// RemoveFromFavorites - удалить товар из избранного
func RemoveFromFavorites(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserPhone string `json:"user_phone"`
			ProductID int64  `json:"product_id"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		if input.UserPhone == "" || input.ProductID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User phone and product ID are required"})
			return
		}

		result, err := db.Exec(`
			DELETE FROM user_favorites 
			WHERE user_phone = $1 AND product_id = $2
		`, input.UserPhone, input.ProductID)

		if err != nil {
			log.Printf("❌ Error removing from favorites: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove from favorites"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Favorite not found"})
			return
		}

		log.Printf("✅ Removed from favorites: user=%s, product=%d", input.UserPhone, input.ProductID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// ToggleFavorite - переключить статус товара в избранном
func ToggleFavorite(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserPhone string `json:"user_phone"`
			ProductID int64  `json:"product_id"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		if input.UserPhone == "" || input.ProductID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User phone and product ID are required"})
			return
		}

		// Проверяем существует ли в избранном
		var exists bool
		err := db.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM user_favorites 
				WHERE user_phone = $1 AND product_id = $2
			)
		`, input.UserPhone, input.ProductID).Scan(&exists)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check favorite status"})
			return
		}

		if exists {
			// Удаляем из избранного
			_, err = db.Exec(`
				DELETE FROM user_favorites 
				WHERE user_phone = $1 AND product_id = $2
			`, input.UserPhone, input.ProductID)
			
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove from favorites"})
				return
			}

			log.Printf("❤️‍🩹 Removed from favorites: user=%s, product=%d", input.UserPhone, input.ProductID)
			c.JSON(http.StatusOK, gin.H{
				"success":    true,
				"is_favorite": false,
				"message":    "Removed from favorites",
			})
		} else {
			// Добавляем в избранное
			_, err = db.Exec(`
				INSERT INTO user_favorites (user_phone, product_id)
				VALUES ($1, $2)
			`, input.UserPhone, input.ProductID)
			
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add to favorites"})
				return
			}

			log.Printf("❤️ Added to favorites: user=%s, product=%d", input.UserPhone, input.ProductID)
			c.JSON(http.StatusOK, gin.H{
				"success":    true,
				"is_favorite": true,
				"message":    "Added to favorites",
			})
		}
	}
}

// CheckFavoriteStatus - проверить статус товара в избранном
func CheckFavoriteStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Query("phone")
		productID := c.Query("product_id")

		if phone == "" || productID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone and product_id are required"})
			return
		}

		var isFavorite bool
		err := db.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM user_favorites 
				WHERE user_phone = $1 AND product_id = $2
			)
		`, phone, productID).Scan(&isFavorite)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check favorite status"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"is_favorite": isFavorite})
	}
}

// GetFavoritesCount - получить количество избранных товаров
func GetFavoritesCount(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		var count int
		err := db.QueryRow(`
			SELECT COUNT(*) 
			FROM user_favorites 
			WHERE user_phone = $1
		`, phone).Scan(&count)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get favorites count"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}

// ClearFavorites - очистить все избранные товары пользователя
func ClearFavorites(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		result, err := db.Exec("DELETE FROM user_favorites WHERE user_phone = $1", phone)
		if err != nil {
			log.Printf("❌ Error clearing favorites: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear favorites"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		log.Printf("🗑️ Cleared favorites for %s: %d items removed", phone, rowsAffected)
		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"items_removed": rowsAffected,
		})
	}
}
