package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ConfirmOrder - подтверждает заказ, создаёт продажу и уменьшает количество товаров на складе
func ConfirmOrder(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		orderID := c.Param("id")
		
		log.Printf("📦 ConfirmOrder called for orderID=%s", orderID)

		// Получаем заказ
		var order struct {
			ID          int64
			CompanyID   int64
			Items       []byte // JSONB stored as []byte
			TotalAmount float64
			Status      string
		}

		err := db.QueryRow(`
			SELECT id, company_id, items, total_amount, status
			FROM orders 
			WHERE id = $1
		`, orderID).Scan(&order.ID, &order.CompanyID, &order.Items, &order.TotalAmount, &order.Status)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}
		if err != nil {
			log.Printf("❌ ConfirmOrder: Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order"})
			return
		}

		// Проверяем что заказ ещё не подтверждён
		if order.Status == "completed" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Order already confirmed"})
			return
		}

		// Парсим items - handle both new and old double-encoded formats
		var items []map[string]interface{}
		if err := json.Unmarshal(order.Items, &items); err != nil {
			// Try double-encoded format
			var itemsString string
			if err2 := json.Unmarshal(order.Items, &itemsString); err2 == nil {
				if err3 := json.Unmarshal([]byte(itemsString), &items); err3 != nil {
					log.Printf("❌ ConfirmOrder: Failed to parse items: %v", err3)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid order items"})
					return
				}
			} else {
				log.Printf("❌ ConfirmOrder: Failed to parse items: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid order items"})
				return
			}
		}
		
		log.Printf("✅ ConfirmOrder: Parsed %d items from order", len(items))
		
		// Create enriched items array with markup information for sale record
		enrichedItems := make([]map[string]interface{}, 0, len(items))

		// Начинаем транзакцию
		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ ConfirmOrder: Failed to begin transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
		defer tx.Rollback()

		// Обновляем количество товаров и создаём продажу для каждого товара
		var totalRevenue float64
		var totalMarkup float64

		for _, item := range items {
			// Extract product ID
			var productID int64
			if idVal, ok := item["id"]; ok {
				if idFloat, ok := idVal.(float64); ok {
					productID = int64(idFloat)
				}
			}
			
			log.Printf("🔍 Item raw data: %+v", item)
			log.Printf("🔍 Extracted productID: %d", productID)
			
			if productID == 0 {
				log.Printf("⚠️ ConfirmOrder: Item missing valid ID, skipping: %+v", item)
				continue
			}
			
			// Extract quantity
			var quantity int
			if qtyVal, ok := item["quantity"]; ok {
				if qtyFloat, ok := qtyVal.(float64); ok {
					quantity = int(qtyFloat)
				}
			}
			
			log.Printf("🔍 Extracted quantity: %d", quantity)
			
			if quantity <= 0 {
				log.Printf("⚠️ ConfirmOrder: Item has invalid quantity, skipping: %+v", item)
				continue
			}
			
			// Extract prices - support both formats
			var price float64
			var priceWithMarkup float64
			
			if priceVal, ok := item["price"]; ok {
				if pFloat, ok := priceVal.(float64); ok {
					price = pFloat
				}
			}
			
			// Try price_with_markup first, fallback to total
			if pwmVal, ok := item["price_with_markup"]; ok {
				if pwmFloat, ok := pwmVal.(float64); ok {
					priceWithMarkup = pwmFloat
				}
			} else if totalVal, ok := item["total"]; ok {
				if totalFloat, ok := totalVal.(float64); ok {
					// Total is for all items, divide by quantity
					priceWithMarkup = totalFloat / float64(quantity)
				}
			}
			
			// Fallback: if no markup price, assume same as purchase price
			if priceWithMarkup == 0 {
				priceWithMarkup = price
			}
			
			markupAmount := priceWithMarkup - price
			totalRevenue += priceWithMarkup * float64(quantity)
			totalMarkup += markupAmount * float64(quantity)
			
			// Add enriched item data for sale record
			enrichedItem := map[string]interface{}{
				"productId":       productID,
				"quantity":        quantity,
				"price":           price,
				"priceWithMarkup": priceWithMarkup,
				"markupAmount":    markupAmount,
				"total":           priceWithMarkup * float64(quantity),
			}
			// Copy other fields if they exist
			if name, ok := item["productName"]; ok {
				enrichedItem["productName"] = name
			}
			enrichedItems = append(enrichedItems, enrichedItem)
			
			log.Printf("📦 Processing item: ID=%d, Qty=%d, Price=%.2f, PriceWithMarkup=%.2f, Markup=%.2f", 
				productID, quantity, price, priceWithMarkup, markupAmount)

			// Уменьшаем количество товара на складе
			result, err := tx.Exec(`
				UPDATE products 
				SET quantity = quantity - $1, updated_at = NOW()
				WHERE id = $2 AND company_id = $3 AND quantity >= $1
			`, quantity, productID, order.CompanyID)

			if err != nil {
				log.Printf("❌ ConfirmOrder: Failed to update product %d: %v", productID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to update product %d", productID)})
				return
			}

			rowsAffected, _ := result.RowsAffected()
			if rowsAffected == 0 {
				log.Printf("❌ ConfirmOrder: Insufficient quantity for product %d", productID)
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Insufficient quantity for product %d", productID)})
				return
			}

			log.Printf("✅ Product %d: decreased by %d", productID, quantity)
		}

		// Создаём одну запись продажи для всего заказа с enriched items
		enrichedItemsBytes, _ := json.Marshal(enrichedItems)
		_, err = tx.Exec(`
			INSERT INTO sales (company_id, items, total_amount, payment_method)
			VALUES ($1, $2, $3, $4)
		`, order.CompanyID, enrichedItemsBytes, totalRevenue, "cash")

		if err != nil {
			log.Printf("❌ ConfirmOrder: Failed to create sale record: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create sale record"})
			return
		}
		
		log.Printf("✅ Sale record created: revenue=%.2f, markup=%.2f", totalRevenue, totalMarkup)

		// Обновляем статус заказа
		_, err = tx.Exec(`
			UPDATE orders 
			SET status = 'completed', updated_at = NOW()
			WHERE id = $1
		`, orderID)

		if err != nil {
			log.Printf("❌ ConfirmOrder: Failed to update order status: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order status"})
			return
		}

		// Коммитим транзакцию
		if err := tx.Commit(); err != nil {
			log.Printf("❌ ConfirmOrder: Failed to commit transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to confirm order"})
			return
		}

		log.Printf("✅ Order %s confirmed successfully! Revenue: %.2f, Markup: %.2f", orderID, totalRevenue, totalMarkup)
		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"orderID":      order.ID,
			"totalRevenue": totalRevenue,
			"totalMarkup":  totalMarkup,
		})
	}
}
