package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// 📦 PRODUCT PURCHASES HANDLERS
// Обработчики для истории закупок товаров
// ============================================================================

// CreateProductPurchase - создание новой записи о закупке товара
func CreateProductPurchase(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ [CreateProductPurchase] Invalid request: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		companyID := c.GetInt64("companyId") // From JWT middleware
		
		// Fallback: if not from JWT, try from request body
		if companyID == 0 {
			if cid, ok := req["companyId"].(float64); ok {
				companyID = int64(cid)
			}
		}
		
		log.Printf("📦 [CreateProductPurchase] Request for company %d: %+v", companyID, req)

		// Parse purchase date or use current date
		purchaseDate := time.Now()
		if dateStr, ok := req["purchaseDate"].(string); ok && dateStr != "" {
			parsedDate, err := time.Parse("2006-01-02T15:04:05Z07:00", dateStr)
			if err != nil {
				// Try alternative format
				parsedDate, err = time.Parse("2006-01-02", dateStr)
				if err == nil {
					purchaseDate = parsedDate
				}
			} else {
				purchaseDate = parsedDate
			}
		}

		// Extract fields
		productName, _ := req["productName"].(string)
		quantity := int(req["quantity"].(float64))
		purchasePrice := req["purchasePrice"].(float64)
		totalCost := req["totalCost"].(float64)
		
		// Optional fields
		var productID *int64
		if pid, ok := req["productId"].(float64); ok && pid > 0 {
			pidInt := int64(pid)
			productID = &pidInt
		}
		
		var supplier *string
		if s, ok := req["supplier"].(string); ok && s != "" {
			supplier = &s
		}
		
		var notes *string
		if n, ok := req["notes"].(string); ok && n != "" {
			notes = &n
		}

		// Insert into database
		var purchaseID int64
		err := db.QueryRow(`
			INSERT INTO product_purchases 
			(company_id, product_id, product_name, quantity, purchase_price, total_cost, supplier, notes, purchase_date, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
			RETURNING id
		`, companyID, productID, productName, quantity, purchasePrice, totalCost, supplier, notes, purchaseDate).Scan(&purchaseID)

		if err != nil {
			log.Printf("❌ [CreateProductPurchase] Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create product purchase"})
			return
		}

		log.Printf("✅ [CreateProductPurchase] Created purchase ID %d for company %d", purchaseID, companyID)
		c.JSON(http.StatusOK, gin.H{"success": true, "id": purchaseID})
	}
}

// GetProductPurchases - получение списка закупок товаров
func GetProductPurchases(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Query("companyId")
		if companyID == "" {
			companyID = c.Param("companyId")
		}
		
		// Фильтры
		startDate := c.Query("startDate")
		endDate := c.Query("endDate")
		productID := c.Query("productId")

		log.Printf("📦 [GetProductPurchases] Request for company %s, filters: startDate=%s, endDate=%s, productId=%s", 
			companyID, startDate, endDate, productID)

		query := `
			SELECT 
				id, company_id, product_id, product_name, quantity, 
				purchase_price, total_cost, supplier, notes, 
				purchase_date, created_at 
			FROM product_purchases 
			WHERE company_id = $1
		`
		
		args := []interface{}{companyID}
		argIndex := 2

		// Apply filters
		if startDate != "" {
			query += ` AND purchase_date >= $` + string(rune(argIndex+'0'))
			args = append(args, startDate)
			argIndex++
		}
		
		if endDate != "" {
			query += ` AND purchase_date <= $` + string(rune(argIndex+'0'))
			args = append(args, endDate)
			argIndex++
		}
		
		if productID != "" && productID != "0" {
			query += ` AND product_id = $` + string(rune(argIndex+'0'))
			args = append(args, productID)
			argIndex++
		}

		query += ` ORDER BY purchase_date DESC, created_at DESC`

		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("❌ [GetProductPurchases] Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get product purchases"})
			return
		}
		defer rows.Close()

		purchases := []map[string]interface{}{}
		for rows.Next() {
			var id, companyID int64
			var productID sql.NullInt64
			var productName string
			var quantity int
			var purchasePrice, totalCost float64
			var supplier, notes sql.NullString
			var purchaseDate, createdAt time.Time

			err := rows.Scan(
				&id, &companyID, &productID, &productName, &quantity,
				&purchasePrice, &totalCost, &supplier, &notes,
				&purchaseDate, &createdAt,
			)
			if err != nil {
				log.Printf("❌ [GetProductPurchases] Scan error: %v", err)
				continue
			}

			purchase := map[string]interface{}{
				"id":            id,
				"companyId":     companyID,
				"productName":   productName,
				"quantity":      quantity,
				"purchasePrice": purchasePrice,
				"totalCost":     totalCost,
				"purchaseDate":  purchaseDate.Format(time.RFC3339),
				"createdAt":     createdAt.Format(time.RFC3339),
			}

			if productID.Valid {
				purchase["productId"] = productID.Int64
			}
			if supplier.Valid {
				purchase["supplier"] = supplier.String
			}
			if notes.Valid {
				purchase["notes"] = notes.String
			}

			purchases = append(purchases, purchase)
		}

		log.Printf("✅ [GetProductPurchases] Found %d purchases for company %s", len(purchases), companyID)
		c.JSON(http.StatusOK, gin.H{"purchases": purchases})
	}
}

// GetProductPurchaseStats - получение статистики по закупкам
func GetProductPurchaseStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Query("companyId")
		if companyID == "" {
			companyID = c.Param("companyId")
		}
		
		startDate := c.Query("startDate")
		endDate := c.Query("endDate")

		log.Printf("📊 [GetProductPurchaseStats] Request for company %s, period: %s to %s", 
			companyID, startDate, endDate)

		query := `
			SELECT 
				COALESCE(COUNT(*), 0) as total_purchases,
				COALESCE(SUM(quantity), 0) as total_quantity,
				COALESCE(SUM(total_cost), 0) as total_cost
			FROM product_purchases 
			WHERE company_id = $1
		`
		
		args := []interface{}{companyID}
		argIndex := 2

		if startDate != "" {
			query += ` AND purchase_date >= $` + string(rune(argIndex+'0'))
			args = append(args, startDate)
			argIndex++
		}
		
		if endDate != "" {
			query += ` AND purchase_date <= $` + string(rune(argIndex+'0'))
			args = append(args, endDate)
		}

		var totalPurchases, totalQuantity int64
		var totalCost float64

		err := db.QueryRow(query, args...).Scan(&totalPurchases, &totalQuantity, &totalCost)
		if err != nil {
			log.Printf("❌ [GetProductPurchaseStats] Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get purchase stats"})
			return
		}

		stats := gin.H{
			"totalPurchases": totalPurchases,
			"totalQuantity":  totalQuantity,
			"totalCost":      totalCost,
		}

		log.Printf("✅ [GetProductPurchaseStats] Stats for company %s: %+v", companyID, stats)
		c.JSON(http.StatusOK, stats)
	}
}

// DeleteProductPurchase - удаление записи о закупке
func DeleteProductPurchase(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		purchaseID := c.Param("id")
		companyID := c.GetInt64("companyId") // From JWT middleware

		log.Printf("🗑️ [DeleteProductPurchase] Deleting purchase %s for company %d", purchaseID, companyID)

		// Verify ownership before deleting
		result, err := db.Exec(`
			DELETE FROM product_purchases 
			WHERE id = $1 AND company_id = $2
		`, purchaseID, companyID)

		if err != nil {
			log.Printf("❌ [DeleteProductPurchase] Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete purchase"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			log.Printf("⚠️ [DeleteProductPurchase] No purchase found with id %s for company %d", purchaseID, companyID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Purchase not found"})
			return
		}

		log.Printf("✅ [DeleteProductPurchase] Deleted purchase %s", purchaseID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// UpdateProductPurchase - обновление записи о закупке
func UpdateProductPurchase(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		purchaseID := c.Param("id")
		companyID := c.GetInt64("companyId") // From JWT middleware

		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ [UpdateProductPurchase] Invalid request: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		log.Printf("📝 [UpdateProductPurchase] Updating purchase %s for company %d: %+v", purchaseID, companyID, req)

		// Build update query dynamically based on provided fields
		updates := []string{}
		args := []interface{}{}
		argIndex := 1

		if productName, ok := req["productName"].(string); ok {
			updates = append(updates, "product_name = $"+string(rune(argIndex+'0')))
			args = append(args, productName)
			argIndex++
		}

		if quantity, ok := req["quantity"].(float64); ok {
			updates = append(updates, "quantity = $"+string(rune(argIndex+'0')))
			args = append(args, int(quantity))
			argIndex++
		}

		if purchasePrice, ok := req["purchasePrice"].(float64); ok {
			updates = append(updates, "purchase_price = $"+string(rune(argIndex+'0')))
			args = append(args, purchasePrice)
			argIndex++
		}

		if totalCost, ok := req["totalCost"].(float64); ok {
			updates = append(updates, "total_cost = $"+string(rune(argIndex+'0')))
			args = append(args, totalCost)
			argIndex++
		}

		if supplier, ok := req["supplier"].(string); ok {
			updates = append(updates, "supplier = $"+string(rune(argIndex+'0')))
			args = append(args, supplier)
			argIndex++
		}

		if notes, ok := req["notes"].(string); ok {
			updates = append(updates, "notes = $"+string(rune(argIndex+'0')))
			args = append(args, notes)
			argIndex++
		}

		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
			return
		}

		// Add purchase ID and company ID to args
		args = append(args, purchaseID, companyID)

		query := "UPDATE product_purchases SET " + updates[0]
		for i := 1; i < len(updates); i++ {
			query += ", " + updates[i]
		}
		query += " WHERE id = $" + string(rune(argIndex+'0')) + " AND company_id = $" + string(rune(argIndex+'1'))

		result, err := db.Exec(query, args...)
		if err != nil {
			log.Printf("❌ [UpdateProductPurchase] Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update purchase"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			log.Printf("⚠️ [UpdateProductPurchase] No purchase found with id %s for company %d", purchaseID, companyID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Purchase not found"})
			return
		}

		log.Printf("✅ [UpdateProductPurchase] Updated purchase %s", purchaseID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}
