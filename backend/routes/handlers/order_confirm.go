package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ConfirmOrder - переводит заказ в статус "В пути" и рассчитывает прибыль
// Вызывается из панели компании когда заказ передан доставщику
func ConfirmOrder(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		orderID := c.Param("id")

		log.Printf("📦 ConfirmOrder (ship) called for orderID=%s", orderID)

		var order struct {
			ID          int64
			CompanyID   int64
			Items       []byte
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

		// Принимаем только заказы со статусом confirmed (принятые)
		if order.Status == "shipped" || order.Status == "delivered" || order.Status == "completed" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Order already shipped"})
			return
		}

		// Парсим items
		var items []map[string]interface{}
		if err := json.Unmarshal(order.Items, &items); err != nil {
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

		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ ConfirmOrder: Failed to begin transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
		defer tx.Rollback()

		// Рассчитываем прибыль из items
		var totalRevenue float64
		var totalMarkup float64

		for _, item := range items {
			var productID int64
			for _, key := range []string{"productId", "product_id", "id"} {
				if idVal, ok := item[key]; ok {
					if idFloat, ok := idVal.(float64); ok && idFloat > 0 {
						productID = int64(idFloat)
						break
					}
				}
			}

			log.Printf("🔍 Item raw data: %+v", item)

			if productID == 0 {
				log.Printf("⚠️ ConfirmOrder: Item missing valid ID, skipping: %+v", item)
				continue
			}

			var quantity int
			if qtyVal, ok := item["quantity"]; ok {
				if qtyFloat, ok := qtyVal.(float64); ok {
					quantity = int(qtyFloat)
				}
			}

			if quantity <= 0 {
				log.Printf("⚠️ ConfirmOrder: Item has invalid quantity, skipping: %+v", item)
				continue
			}

			// Всегда берём актуальные цены из БД (base price и selling price)
			// Это гарантирует корректный расчёт прибыли независимо от того, что прислал клиент
			var price float64
			var priceWithMarkup float64

			dbErr := db.QueryRow(`
				SELECT price, selling_price FROM products WHERE id = $1 AND company_id = $2
			`, productID, order.CompanyID).Scan(&price, &priceWithMarkup)

			if dbErr != nil || priceWithMarkup == 0 {
				// Если не нашли в БД — берём из item как запасной вариант
				if priceVal, ok := item["price"]; ok {
					if pFloat, ok := priceVal.(float64); ok {
						price = pFloat
					}
				}
				if pwmVal, ok := item["price_with_markup"]; ok {
					if pwmFloat, ok := pwmVal.(float64); ok {
						priceWithMarkup = pwmFloat
					}
				}
				if priceWithMarkup == 0 {
					if pwmVal, ok := item["priceWithMarkup"]; ok {
						if pwmFloat, ok := pwmVal.(float64); ok {
							priceWithMarkup = pwmFloat
						}
					}
				}
				if priceWithMarkup == 0 {
					priceWithMarkup = price
				}
				log.Printf("⚠️ Product %d not in DB, using item prices: base=%.2f, selling=%.2f", productID, price, priceWithMarkup)
			} else {
				log.Printf("📊 Product %d DB prices: base=%.2f, selling=%.2f", productID, price, priceWithMarkup)
			}

			markupAmount := priceWithMarkup - price
			totalRevenue += priceWithMarkup * float64(quantity)
			totalMarkup += markupAmount * float64(quantity)

			log.Printf("📦 Item: ID=%d, Qty=%d, Price=%.2f, PriceWithMarkup=%.2f, Markup=%.2f",
				productID, quantity, price, priceWithMarkup, markupAmount)
		}

		if totalRevenue == 0 && order.TotalAmount > 0 {
			totalRevenue = order.TotalAmount
			log.Printf("⚠️ ConfirmOrder: totalRevenue was 0, falling back to order.TotalAmount=%.2f", totalRevenue)
		}

		// Обновляем markup_profit в orders и меняем статус на 'shipped' (В пути)
		_, err = tx.Exec(`
			UPDATE orders
			SET status = 'shipped', markup_profit = $2, updated_at = NOW()
			WHERE id = $1
		`, orderID, totalMarkup)

		if err != nil {
			log.Printf("❌ ConfirmOrder: Failed to update order: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to update order: %v", err)})
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("❌ ConfirmOrder: Failed to commit transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to confirm order"})
			return
		}

		log.Printf("✅ Order %s marked as shipped! Revenue: %.2f, Markup: %.2f", orderID, totalRevenue, totalMarkup)
		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"orderID":      order.ID,
			"totalRevenue": totalRevenue,
			"totalMarkup":  totalMarkup,
		})
	}
}
