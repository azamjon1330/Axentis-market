package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// CartItem - структура товара в корзине
type CartItem struct {
	ID            int       `json:"id"`
	UserPhone     string    `json:"user_phone"`
	ProductID     int64     `json:"product_id"`
	Quantity      int       `json:"quantity"`
	SelectedColor string    `json:"selected_color,omitempty"`
	SelectedSize  string    `json:"selected_size,omitempty"`
	AddedAt       time.Time `json:"added_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	
	// Дополнительная информация о товаре (для удобства фронтенда)
	ProductName   string    `json:"product_name,omitempty"`
	ProductPrice  float64   `json:"product_price,omitempty"`
	ProductImages []string  `json:"product_images,omitempty"`
}

// GetUserCart - получить корзину пользователя
func GetUserCart(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		rows, err := db.Query(`
			SELECT 
				ci.id, ci.user_phone, ci.product_id, ci.quantity, 
				COALESCE(ci.selected_color, '') as selected_color,
				COALESCE(ci.selected_size, '') as selected_size,
				ci.added_at, ci.updated_at,
				p.name, p.selling_price, COALESCE(p.images::text, '[]') as images
			FROM cart_items ci
			JOIN products p ON ci.product_id = p.id
			WHERE ci.user_phone = $1
			ORDER BY ci.added_at DESC
		`, phone)

		if err != nil {
			log.Printf("❌ Error fetching cart: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch cart"})
			return
		}
		defer rows.Close()

		items := make([]CartItem, 0)
		for rows.Next() {
			var item CartItem
			var imagesJSON string
			err := rows.Scan(
				&item.ID, &item.UserPhone, &item.ProductID, &item.Quantity,
				&item.SelectedColor, &item.SelectedSize,
				&item.AddedAt, &item.UpdatedAt,
				&item.ProductName, &item.ProductPrice, &imagesJSON,
			)
			if err != nil {
				continue
			}
			// Парсим JSON массив изображений (упрощенно)
			item.ProductImages = []string{}
			items = append(items, item)
		}

		log.Printf("🛒 Cart loaded for %s: %d items", phone, len(items))
		c.JSON(http.StatusOK, items)
	}
}

// AddToCart - добавить товар в корзину
func AddToCart(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserPhone     string `json:"user_phone"`
			ProductID     int64  `json:"product_id"`
			Quantity      int    `json:"quantity"`
			SelectedColor string `json:"selected_color"`
			SelectedSize  string `json:"selected_size"`
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
		if input.Quantity <= 0 {
			input.Quantity = 1
		}

		// Проверяем существование товара
		var productExists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)", input.ProductID).Scan(&productExists)
		if err != nil || !productExists {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}

		colorVal := input.SelectedColor
		sizeVal := input.SelectedSize

		// Проверяем — есть ли уже такой товар в корзине
		var existingID int
		checkErr := db.QueryRow(`
			SELECT id FROM cart_items 
			WHERE user_phone = $1 AND product_id = $2 
			AND COALESCE(selected_color, '') = $3 
			AND COALESCE(selected_size, '') = $4
		`, input.UserPhone, input.ProductID, colorVal, sizeVal).Scan(&existingID)

		var itemID int
		if checkErr == sql.ErrNoRows {
			// Вставляем новый товар
			err = db.QueryRow(`
				INSERT INTO cart_items (user_phone, product_id, quantity, selected_color, selected_size)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id
			`, input.UserPhone, input.ProductID, input.Quantity, colorVal, sizeVal).Scan(&itemID)
		} else if checkErr == nil {
			// Обновляем количество существующего
			err = db.QueryRow(`
				UPDATE cart_items SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
				WHERE id = $2 RETURNING id
			`, input.Quantity, existingID).Scan(&itemID)
		} else {
			err = checkErr
		}

		if err != nil {
			log.Printf("❌ Error adding to cart: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add to cart"})
			return
		}

		log.Printf("✅ Added to cart: user=%s, product=%d, qty=%d", input.UserPhone, input.ProductID, input.Quantity)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"id":      itemID,
			"message": "Added to cart successfully",
		})
	}
}

// UpdateCartItem - обновить количество товара в корзине
func UpdateCartItem(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		itemID := c.Param("id")

		var input struct {
			Quantity int `json:"quantity"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		if input.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Quantity must be greater than 0"})
			return
		}

		result, err := db.Exec(`
			UPDATE cart_items 
			SET quantity = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
		`, input.Quantity, itemID)

		if err != nil {
			log.Printf("❌ Error updating cart item: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update cart item"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Cart item not found"})
			return
		}

		log.Printf("✅ Updated cart item %s: quantity=%d", itemID, input.Quantity)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// RemoveFromCart - удалить товар из корзины
func RemoveFromCart(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		itemID := c.Param("id")

		result, err := db.Exec("DELETE FROM cart_items WHERE id = $1", itemID)
		if err != nil {
			log.Printf("❌ Error removing from cart: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove from cart"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Cart item not found"})
			return
		}

		log.Printf("✅ Removed cart item %s", itemID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// SetCartItemQuantity - установить точное количество товара (upsert). Если quantity=0 — удаляет.
// Тело: { user_phone, product_id, quantity }
func SetCartItemQuantity(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserPhone string `json:"user_phone"`
			ProductID int64  `json:"product_id"`
			Quantity  int    `json:"quantity"`
		}
		if err := c.ShouldBindJSON(&input); err != nil || input.UserPhone == "" || input.ProductID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user_phone, product_id and quantity are required"})
			return
		}

		if input.Quantity <= 0 {
			// quantity=0 → удаляем
			result, err := db.Exec(
				"DELETE FROM cart_items WHERE user_phone = $1 AND product_id = $2",
				input.UserPhone, input.ProductID,
			)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove cart item"})
				return
			}
			rows, _ := result.RowsAffected()
			log.Printf("✅ SetCartItemQty=0 (DELETE) user=%s product=%d removed=%d", input.UserPhone, input.ProductID, rows)
			c.JSON(http.StatusOK, gin.H{"success": true, "action": "deleted"})
			return
		}

		// Upsert: обновить если есть, вставить если нет
		_, err := db.Exec(`
			INSERT INTO cart_items (user_phone, product_id, quantity)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_phone, product_id)
			DO UPDATE SET quantity = $3, updated_at = CURRENT_TIMESTAMP
		`, input.UserPhone, input.ProductID, input.Quantity)

		if err != nil {
			// Fallback: попробуем UPDATE + INSERT отдельно
			res, updateErr := db.Exec(
				"UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE user_phone = $2 AND product_id = $3",
				input.Quantity, input.UserPhone, input.ProductID,
			)
			if updateErr != nil {
				log.Printf("❌ SetCartItemQty error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set cart item quantity"})
				return
			}
			rowsUpdated, _ := res.RowsAffected()
			if rowsUpdated == 0 {
				// Не было строки — вставляем
				_, insertErr := db.Exec(
					"INSERT INTO cart_items (user_phone, product_id, quantity) VALUES ($1, $2, $3)",
					input.UserPhone, input.ProductID, input.Quantity,
				)
				if insertErr != nil {
					log.Printf("❌ SetCartItemQty insert error: %v", insertErr)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to insert cart item"})
					return
				}
			}
		}

		log.Printf("✅ SetCartItemQty user=%s product=%d qty=%d", input.UserPhone, input.ProductID, input.Quantity)
		c.JSON(http.StatusOK, gin.H{"success": true, "action": "upserted", "quantity": input.Quantity})
	}
}

// RemoveCartItemByProduct - удалить товар из корзины по user_phone + product_id (без необходимости знать DB row id)
func RemoveCartItemByProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserPhone string `json:"user_phone"`
			ProductID int64  `json:"product_id"`
		}
		if err := c.ShouldBindJSON(&input); err != nil || input.UserPhone == "" || input.ProductID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user_phone and product_id are required"})
			return
		}

		result, err := db.Exec(
			"DELETE FROM cart_items WHERE user_phone = $1 AND product_id = $2",
			input.UserPhone, input.ProductID,
		)
		if err != nil {
			log.Printf("❌ Error removing cart item by product: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove cart item"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		log.Printf("✅ Removed cart item for %s product %d (%d rows)", input.UserPhone, input.ProductID, rowsAffected)
		c.JSON(http.StatusOK, gin.H{"success": true, "removed": rowsAffected})
	}
}

// ClearCart - очистить всю корзину пользователя
func ClearCart(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		result, err := db.Exec("DELETE FROM cart_items WHERE user_phone = $1", phone)
		if err != nil {
			log.Printf("❌ Error clearing cart: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear cart"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		log.Printf("🗑️ Cleared cart for %s: %d items removed", phone, rowsAffected)
		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"items_removed": rowsAffected,
		})
	}
}

// GetCartCount - получить количество товаров в корзине
func GetCartCount(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		var count int
		err := db.QueryRow(`
			SELECT COALESCE(SUM(quantity), 0) 
			FROM cart_items 
			WHERE user_phone = $1
		`, phone).Scan(&count)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get cart count"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}
