package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Get Company Analytics
func GetCompanyAnalytics(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("companyId")

		// Get total products
		var totalProducts int
		db.QueryRow("SELECT COUNT(*) FROM products WHERE company_id = $1", companyID).Scan(&totalProducts)

		// Get total inventory value
		var inventoryValue float64
		db.QueryRow("SELECT COALESCE(SUM(price * quantity), 0) FROM products WHERE company_id = $1", companyID).Scan(&inventoryValue)

// Get total sales and markup profit from orders AND sales (cash sales)
	var totalSales float64
	var salesCount int
	var totalMarkup float64
	
	// Прибыль и выручка из подтвержденных заказов
	var ordersSales, ordersMarkup float64
	var ordersCount int
	db.QueryRow(`
		SELECT COALESCE(SUM(total_amount), 0), COUNT(*), COALESCE(SUM(markup_profit), 0) 
		FROM orders 
		WHERE company_id = $1 AND status = 'completed'
	`, companyID).Scan(&ordersSales, &ordersCount, &ordersMarkup)
	
	// Прибыль и выручка из кассовых продаж
	var cashSales, cashMarkup float64
	var cashCount int
	db.QueryRow(`
		SELECT COALESCE(SUM(total_amount), 0), COUNT(*), COALESCE(SUM(markup_profit), 0) 
		FROM sales 
		WHERE company_id = $1
	`, companyID).Scan(&cashSales, &cashCount, &cashMarkup)
	
	// Суммируем все продажи
	totalSales = ordersSales + cashSales
	salesCount = ordersCount + cashCount
	totalMarkup = ordersMarkup + cashMarkup
	
	log.Printf("📊 [GetCompanyAnalytics] Orders: revenue=%.2f, profit=%.2f, count=%d", ordersSales, ordersMarkup, ordersCount)
	log.Printf("📊 [GetCompanyAnalytics] Cash Sales: revenue=%.2f, profit=%.2f, count=%d", cashSales, cashMarkup, cashCount)
	log.Printf("📊 [GetCompanyAnalytics] TOTAL: revenue=%.2f, profit=%.2f, count=%d", totalSales, totalMarkup, salesCount)

		// Get total expenses
		var totalExpenses float64
		db.QueryRow("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE company_id = $1", companyID).Scan(&totalExpenses)

		// Calculate cost of goods sold (COGS)
		costOfGoodsSold := totalSales - totalMarkup

		// ✅ НОВОЕ: Получаем список подтвержденных заказов с items для frontend аналитики
		type Order struct {
		ID                  int64           `json:"id"`
		OrderCode           string          `json:"order_code"`
		CustomerName        string          `json:"customer_name"`
		CustomerPhone       string          `json:"customer_phone"`
		Status              string          `json:"status"`
		TotalAmount         float64         `json:"total_amount"`
		DeliveryCost        float64         `json:"delivery_cost"`
		DeliveryType        string          `json:"delivery_type"`
		RecipientName       string          `json:"recipient_name,omitempty"`
		DeliveryAddress     string          `json:"delivery_address,omitempty"`
		DeliveryCoordinates string          `json:"delivery_coordinates,omitempty"`
		MarkupProfit        float64         `json:"markup_profit"`
		Items               json.RawMessage `json:"items"`
		CreatedAt           string          `json:"created_at"`
	}

	ordersQuery := `
		SELECT id, order_code, customer_name, customer_phone, status, total_amount, 
		       delivery_cost, delivery_type, recipient_name, delivery_address, delivery_coordinates,
		       markup_profit, items, created_at
		FROM orders
		WHERE company_id = $1 AND status = 'completed'
		ORDER BY created_at DESC
	`

	ordersRows, err := db.Query(ordersQuery, companyID)
	orders := []Order{}
	if err != nil {
		log.Printf("❌ [GetCompanyAnalytics] Error querying orders: %v", err)
	} else {
		defer ordersRows.Close()
		for ordersRows.Next() {
			var order Order
			var deliveryType, recipientName, deliveryAddress, deliveryCoordinates sql.NullString
			if err := ordersRows.Scan(&order.ID, &order.OrderCode, &order.CustomerName, &order.CustomerPhone,
				&order.Status, &order.TotalAmount, &order.DeliveryCost, &deliveryType, &recipientName,
				&deliveryAddress, &deliveryCoordinates, &order.MarkupProfit, &order.Items, &order.CreatedAt); err != nil {
				log.Printf("❌ Error scanning order: %v", err)
				continue
			}
			
			// Handle nullable fields
			if deliveryType.Valid {
				order.DeliveryType = deliveryType.String
			}
			if recipientName.Valid {
				order.RecipientName = recipientName.String
			}
			if deliveryAddress.Valid {
				order.DeliveryAddress = deliveryAddress.String
			}
			if deliveryCoordinates.Valid {
				order.DeliveryCoordinates = deliveryCoordinates.String
			}
			
			orders = append(orders, order)
		}
	}

	// ✅ Добавляем логирование для отладки
	log.Printf("📊 [GetCompanyAnalytics] companyId=%s, totalSales=%.2f, totalMarkup=%.2f, salesCount=%d, completed orders=%d, timestamp=%d", 
		companyID, totalSales, totalMarkup, salesCount, len(orders), time.Now().Unix())

	analytics := map[string]interface{}{
			"totalProducts":      totalProducts,
			"inventoryValue":     inventoryValue,
			"totalRevenue":       totalSales,      // Выручка (total_amount)
			"totalSales":         totalSales,      // Для обратной совместимости
			"totalMarkup":        totalMarkup,     // Прибыль от наценки
			"totalMarkupProfit":  totalMarkup,     // Для обратной совместимости с frontend
			"costOfGoodsSold":    costOfGoodsSold, // Себестоимость проданных товаров
			"salesCount":         salesCount,
			"ordersCount":        ordersCount,
			"totalExpenses":      totalExpenses,
			"netProfit":          totalMarkup - totalExpenses, // Чистая прибыль = наценка - расходы
			"orders":             orders,                      // ✅ Список подтвержденных заказов для аналитики
		}

		c.JSON(http.StatusOK, analytics)
	}
}

// Get Revenue Analytics
func GetRevenueAnalytics(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Query("companyId")

		query := `
			SELECT 
				DATE(created_at) as date,
				SUM(total_amount) as revenue,
				COUNT(*) as count
			FROM sales
			WHERE company_id = $1
			GROUP BY DATE(created_at)
			ORDER BY date DESC
			LIMIT 30
		`

		rows, err := db.Query(query, companyID)
		if err != nil {
			log.Printf("❌ Error getting revenue: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get revenue"})
			return
		}
		defer rows.Close()

		data := []map[string]interface{}{}
		for rows.Next() {
			var date string
			var revenue float64
			var count int

			rows.Scan(&date, &revenue, &count)
			data = append(data, map[string]interface{}{
				"date":    date,
				"revenue": revenue,
				"count":   count,
			})
		}

		c.JSON(http.StatusOK, data)
	}
}
