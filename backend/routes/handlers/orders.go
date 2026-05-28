package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Get Orders
func GetOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Query("companyId")
		customerPhone := c.Query("customer_phone")

		log.Printf("📦 GetOrders called for companyId=%s customerPhone=%s", companyID, customerPhone)

		// Инициализируем пустой массив чтобы избежать null
		orders := make([]map[string]interface{}, 0)

		var rows *sql.Rows
		var err error

		if customerPhone != "" {
			// Mobile app: filter by customer phone
			rows, err = db.Query(`
				SELECT id, customer_name, customer_phone, address, items,
				       total_amount, delivery_cost, delivery_type, recipient_name,
				       delivery_address, delivery_coordinates, markup_profit, status, comment, order_code, created_at
				FROM orders
				WHERE customer_phone = $1
				ORDER BY created_at DESC
			`, customerPhone)
		} else {
			// Company panel: filter by company id
			rows, err = db.Query(`
				SELECT id, customer_name, customer_phone, address, items,
				       total_amount, delivery_cost, delivery_type, recipient_name,
				       delivery_address, delivery_coordinates, markup_profit, status, comment, order_code, created_at
				FROM orders
				WHERE company_id = $1
				ORDER BY created_at DESC
			`, companyID)
		}

		if err != nil {
			log.Printf("❌ GetOrders: Ошибка запроса БД: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var o struct {
				ID                  int64
				CustomerName        string
				CustomerPhone       string
				Address             sql.NullString
				Items               []byte // Use []byte to read JSONB directly
				TotalAmount         float64
				DeliveryCost        float64
				DeliveryType        sql.NullString
				RecipientName       sql.NullString
				DeliveryAddress     sql.NullString
				DeliveryCoordinates sql.NullString
				MarkupProfit        float64
				Status              string
				Comment             sql.NullString
				OrderCode           sql.NullString
				CreatedAt           string
			}

			if err := rows.Scan(&o.ID, &o.CustomerName, &o.CustomerPhone, &o.Address,
				&o.Items, &o.TotalAmount, &o.DeliveryCost, &o.DeliveryType, &o.RecipientName,
				&o.DeliveryAddress, &o.DeliveryCoordinates, &o.MarkupProfit, &o.Status, &o.Comment, &o.OrderCode, &o.CreatedAt); err != nil {
				log.Printf("⚠️ Error scanning order: %v", err)
				continue
			}

		// Parse items JSON
		var itemsArray []map[string]interface{}
		if len(o.Items) > 0 {
			// Try to unmarshal directly as JSON array
			if err := json.Unmarshal(o.Items, &itemsArray); err != nil {
				// Try to unmarshal as string first (double-encoded JSON)
				var itemsString string
				if err2 := json.Unmarshal(o.Items, &itemsString); err2 == nil {
					// Successfully got a string, now parse it as JSON
					if err3 := json.Unmarshal([]byte(itemsString), &itemsArray); err3 == nil {
						log.Printf("✅ Parsed double-encoded items for order %d", o.ID)
					} else {
						log.Printf("⚠️ Failed to parse double-encoded items for order %d: %v", o.ID, err3)
						log.Printf("   Raw items data: %s", string(o.Items))
						itemsArray = []map[string]interface{}{}
					}
				} else {
					log.Printf("⚠️ Failed to parse items JSON for order %d: %v", o.ID, err)
					log.Printf("   Raw items data: %s", string(o.Items))
					itemsArray = []map[string]interface{}{}
				}
			}
		} else {
			itemsArray = []map[string]interface{}{}
		}

		order := map[string]interface{}{
			"id":             o.ID,
			"customerName":   o.CustomerName,
			"customerPhone":  o.CustomerPhone,
			"items":          itemsArray,
			"delivery_cost":  o.DeliveryCost,  // ✅ Use snake_case for frontend compatibility
			"deliveryCost":   o.DeliveryCost,  // Keep camelCase for backward compatibility
			"total_amount":   o.TotalAmount,   // ✅ Use snake_case for frontend compatibility
			"totalAmount":    o.TotalAmount,   // Keep camelCase for backward compatibility
			"markup_profit":  o.MarkupProfit,  // ✅ Use snake_case for frontend compatibility
			"markupProfit":   o.MarkupProfit,  // Keep camelCase for backward compatibility
			"status":         o.Status,
			"created_at":     o.CreatedAt,     // ✅ Use snake_case for frontend compatibility
			"createdAt":      o.CreatedAt,     // Keep camelCase for backward compatibility
		}

		if o.DeliveryType.Valid {
			order["deliveryType"] = o.DeliveryType.String
		} else {
			order["deliveryType"] = "pickup"
		}

		if o.RecipientName.Valid {
			order["recipientName"] = o.RecipientName.String
		}

		if o.DeliveryAddress.Valid {
			order["deliveryAddress"] = o.DeliveryAddress.String
		}

		if o.DeliveryCoordinates.Valid {
			order["deliveryCoordinates"] = o.DeliveryCoordinates.String
		}

		if o.Address.Valid {
			order["address"] = o.Address.String
		} else {
			order["address"] = ""
		}
		
		if o.Comment.Valid {
			order["comment"] = o.Comment.String
		} else {
			order["comment"] = ""
		}
		
		if o.OrderCode.Valid {
			order["orderCode"] = o.OrderCode.String
		} else {
			order["orderCode"] = ""
		}

		orders = append(orders, order)
	}

	log.Printf("📦 GetOrders: Найдено %d заказов для companyId=%s", len(orders), companyID)
	if len(orders) > 0 {
		log.Printf("   Пример первого заказа: ID=%v, Code=%v, Customer=%v", 
			orders[0]["id"], orders[0]["orderCode"], orders[0]["customerName"])
	}

	c.JSON(http.StatusOK, orders)
	}
}

// Create Order
func CreateOrder(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ CreateOrder: Ошибка парсинга JSON: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Логируем входящий запрос
		log.Printf("📦 CreateOrder: Получен запрос:")
		log.Printf("   CompanyID: %v (тип: %T)", req["companyId"], req["companyId"])
		log.Printf("   CustomerName: %v", req["customerName"])
		log.Printf("   CustomerPhone: %v", req["customerPhone"])
		log.Printf("   Address: %v", req["address"])
		log.Printf("   Items: %v", req["items"])
		log.Printf("   TotalAmount: %v (тип: %T)", req["totalAmount"], req["totalAmount"])
		log.Printf("   Comment: %v", req["comment"])

		// Преобразование companyId в int64
		var companyID int64
		switch v := req["companyId"].(type) {
		case float64:
			companyID = int64(v)
		case string:
			parsed, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				log.Printf("❌ CreateOrder: Не удалось преобразовать companyId: %v", err)
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid companyId format"})
				return
			}
			companyID = parsed
		case int:
			companyID = int64(v)
		case int64:
			companyID = v
		default:
			log.Printf("❌ CreateOrder: Неизвестный тип companyId: %T", v)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid companyId type"})
			return
		}

		// Обработка totalAmount
		var totalAmount float64
		switch v := req["totalAmount"].(type) {
		case float64:
			totalAmount = v
		case int:
			totalAmount = float64(v)
		case string:
			parsed, err := strconv.ParseFloat(v, 64)
			if err != nil {
				log.Printf("❌ CreateOrder: Не удалось преобразовать totalAmount: %v", err)
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid totalAmount format"})
				return
			}
			totalAmount = parsed
		default:
			log.Printf("❌ CreateOrder: Неизвестный тип totalAmount: %T", v)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid totalAmount type"})
			return
		}

		// Обработка deliveryCost (стоимость доставки)
		var deliveryCost float64
		if req["deliveryCost"] != nil {
			switch v := req["deliveryCost"].(type) {
			case float64:
				deliveryCost = v
			case int:
				deliveryCost = float64(v)
			case string:
				parsed, err := strconv.ParseFloat(v, 64)
				if err == nil {
					deliveryCost = parsed
				}
			}
		}
		log.Printf("   DeliveryCost: %.2f", deliveryCost)

		// Обработка delivery_type, recipient_name, delivery_address, delivery_coordinates
		deliveryType := "pickup"
		if req["deliveryType"] != nil {
			deliveryType = fmt.Sprintf("%v", req["deliveryType"])
		}

		recipientName := ""
		if req["recipientName"] != nil {
			recipientName = fmt.Sprintf("%v", req["recipientName"])
		}

		deliveryAddress := ""
		if req["deliveryAddress"] != nil {
			deliveryAddress = fmt.Sprintf("%v", req["deliveryAddress"])
		}

		deliveryCoordinates := ""
		if req["deliveryCoordinates"] != nil {
			deliveryCoordinates = fmt.Sprintf("%v", req["deliveryCoordinates"])
		}

		// Установка значений по умолчанию
		address := ""
		if req["address"] != nil {
			address = fmt.Sprintf("%v", req["address"])
		}

		comment := ""
		if req["comment"] != nil {
			comment = fmt.Sprintf("%v", req["comment"])
		}

		customerName := fmt.Sprintf("%v", req["customerName"])
		customerPhone := fmt.Sprintf("%v", req["customerPhone"])
		
		// Parse items - frontend sends JSON string already
		var itemsArray []map[string]interface{}
		if req["items"] != nil {
			switch v := req["items"].(type) {
			case string:
				// Frontend sends JSON string - parse it to validate and store as JSONB
				if err := json.Unmarshal([]byte(v), &itemsArray); err != nil {
					log.Printf("❌ CreateOrder: Invalid items JSON string: %v", err)
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid items format"})
					return
				}
			case []interface{}:
				// Direct array - marshal and unmarshal to get proper map structure
				itemsBytes, _ := json.Marshal(v)
				if err := json.Unmarshal(itemsBytes, &itemsArray); err != nil {
					log.Printf("❌ CreateOrder: Invalid items array: %v", err)
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid items format"})
					return
				}
			default:
				log.Printf("❌ CreateOrder: Unsupported items type: %T", v)
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid items format"})
				return
			}
		} else {
			itemsArray = []map[string]interface{}{}
		}
		
		log.Printf("✅ CreateOrder: Parsed %d items", len(itemsArray))

	// Calculate markup profit — ALWAYS look up actual variant price from DB
	// Frontend may send product-level min price instead of the selected variant's price,
	// so we use selling_price as a fingerprint to find the exact variant.
	var markupProfit float64
	for _, item := range itemsArray {
		quantity := 0.0
		frontendBase := 0.0
		frontendSelling := 0.0

		if q, ok := item["quantity"].(float64); ok { quantity = q }
		if p, ok := item["price"].(float64); ok { frontendBase = p }
		if pwm, ok := item["price_with_markup"].(float64); ok {
			frontendSelling = pwm
		} else if pwm, ok := item["priceWithMarkup"].(float64); ok {
			frontendSelling = pwm
		}

		if quantity <= 0 {
			continue
		}

		var productId int64
		if pid, ok := item["productId"].(float64); ok {
			productId = int64(pid)
		} else if pid, ok := item["product_id"].(float64); ok {
			productId = int64(pid)
		}

		basePrice := frontendBase
		priceWithMarkup := frontendSelling

		if productId > 0 {
			color, _ := item["color"].(string)
			size, _ := item["size"].(string)
			var dbBase, dbSelling float64

			// Step 1: Match variant by selling_price fingerprint (identifies exact variant)
			// This handles the case where frontend sends product-level min price but customer
			// actually bought a more expensive variant.
			if frontendSelling > 0 {
				db.QueryRow(`
					SELECT price, selling_price
					FROM product_variants
					WHERE product_id = $1
					  AND selling_price > price
					  AND ABS(selling_price - $2) < 1.0
					ORDER BY ABS(selling_price - $2) ASC
					LIMIT 1
				`, productId, frontendSelling).Scan(&dbBase, &dbSelling)
			}

			// Step 2: Match by color AND size (when size is provided)
			if dbBase == 0 && size != "" && size != "Любой" && size != "Any" {
				db.QueryRow(`
					SELECT price, selling_price
					FROM product_variants
					WHERE product_id = $1
					  AND selling_price > price
					  AND ($2 = '' OR color = $2)
					  AND size = $3
					ORDER BY id ASC LIMIT 1
				`, productId, color, size).Scan(&dbBase, &dbSelling)
			}

			// Step 3: Match by color only (if unique variant or best match)
			if dbBase == 0 && color != "" && color != "Любой" && color != "Any" {
				db.QueryRow(`
					SELECT price, selling_price
					FROM product_variants
					WHERE product_id = $1
					  AND selling_price > price
					  AND color = $2
					ORDER BY id ASC LIMIT 1
				`, productId, color).Scan(&dbBase, &dbSelling)
			}

			// Step 4: Any variant with markup
			if dbBase == 0 {
				db.QueryRow(`
					SELECT price, selling_price
					FROM product_variants
					WHERE product_id = $1 AND selling_price > price
					ORDER BY price ASC LIMIT 1
				`, productId).Scan(&dbBase, &dbSelling)
			}

			// Step 5: Product-level fallback (no variants)
			if dbBase == 0 {
				db.QueryRow(`
					SELECT price,
						COALESCE(
							NULLIF(selling_price, 0),
							price * (1.0 + COALESCE(markup_percent, 0) / 100.0)
						)
					FROM products WHERE id = $1
				`, productId).Scan(&dbBase, &dbSelling)
			}

			if dbBase > 0 && dbSelling > dbBase {
				basePrice = dbBase
				priceWithMarkup = dbSelling
			}
		}

		if priceWithMarkup > basePrice {
			markupProfit += (priceWithMarkup - basePrice) * quantity
		}
	}

	log.Printf("💰 CreateOrder: Calculated markup_profit: %.2f", markupProfit)

	// Generate unique order code
	var orderCode string
	var exists bool
	rand.Seed(time.Now().UnixNano())
		
		for {
			// Генерируем 6-значное число (100000 - 999999)
			orderCode = fmt.Sprintf("%06d", rand.Intn(900000)+100000)
			
			// Проверяем существование
			err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM orders WHERE order_code = $1)", orderCode).Scan(&exists)
			if err != nil || !exists {
				break
			}
		}

		log.Printf("📦 CreateOrder: Подготовлены данные для вставки:")
		log.Printf("   CompanyID: %d", companyID)
		log.Printf("   CustomerName: %s", customerName)
		log.Printf("   CustomerPhone: %s", customerPhone)
		log.Printf("   Address: %s", address)
		log.Printf("   TotalAmount: %.2f", totalAmount)
		log.Printf("   OrderCode: %s", orderCode)

	// Marshal itemsArray to JSONB
	itemsBytes, _ := json.Marshal(itemsArray)
	
	var orderID int64
	err := db.QueryRow(`
		INSERT INTO orders (company_id, customer_name, customer_phone, address, 
	                   items, total_amount, delivery_cost, delivery_type, recipient_name, 
	                   delivery_address, delivery_coordinates, markup_profit, comment, order_code, status)
	VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	RETURNING id
`, companyID, customerName, customerPhone, address,
	itemsBytes, totalAmount, deliveryCost, deliveryType, recipientName, 
	deliveryAddress, deliveryCoordinates, markupProfit, comment, orderCode, "pending").Scan(&orderID)
	
	if err != nil {
		log.Printf("❌ CreateOrder: Ошибка создания заказа: %v", err)
		log.Printf("   - customerPhone: %s", customerPhone)
		log.Printf("   - address: %s", address)
		log.Printf("   - items: %s", string(itemsBytes))
		log.Printf("   - totalAmount: %.2f", totalAmount)
		log.Printf("   - comment: %s", comment)
		log.Printf("   - orderCode: %s", orderCode)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create order: %v", err)})
		return
	}

	log.Printf("✅ Order created successfully: ID=%d, Code=%s, CompanyID=%d", orderID, orderCode, companyID)
	
	// 💰 Сохранить доход админа от доставки (если доставка была)
	if deliveryCost > 0 {
		_, err := db.Exec(`
			INSERT INTO admin_delivery_revenue (order_id, company_id, delivery_cost, customer_phone, delivery_type, delivery_address, delivery_coordinates)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, orderID, companyID, deliveryCost, customerPhone, deliveryType, deliveryAddress, deliveryCoordinates)
		
		if err != nil {
			log.Printf("⚠️ Failed to save admin delivery revenue: %v", err)
		} else {
			log.Printf("💰 Admin delivery revenue saved: %.2f sum", deliveryCost)
		}
	}
	
	// 📍 Сохранить адрес доставки пользователя для будущих заказов (если доставка была)
	if deliveryType == "delivery" && deliveryAddress != "" {
		_, err := db.Exec(`
			UPDATE users 
			SET default_delivery_address = $1,
			    default_delivery_coordinates = $2,
			    default_recipient_name = $3,
			    updated_at = NOW()
			WHERE phone = $4
		`, deliveryAddress, deliveryCoordinates, recipientName, customerPhone)
		
		if err != nil {
			log.Printf("⚠️ Failed to save user default delivery address: %v", err)
		} else {
			log.Printf("📍 User default delivery address saved for phone: %s", customerPhone)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{"success": true, "id": orderID, "orderCode": orderCode, "createdAt": time.Now().Format(time.RFC3339)})
	}
}

// Update Order Status
func UpdateOrderStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
			return
		}
		defer tx.Rollback()

		// Read current status and items before updating
		var currentStatus string
		var itemsJSON []byte
		if err := tx.QueryRow(`SELECT status, items FROM orders WHERE id = $1`, id).Scan(&currentStatus, &itemsJSON); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}

		// Update the status
		if _, err := tx.Exec(`UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1`, id, req.Status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order"})
			return
		}

		// Decrement stock once: only when transitioning from pending → any confirmed state
		confirmedStatuses := map[string]bool{
			"confirmed": true, "processing": true,
			"shipped": true, "delivered": true, "completed": true,
		}
		if currentStatus == "pending" && confirmedStatuses[req.Status] {
			var items []map[string]interface{}
			if err := json.Unmarshal(itemsJSON, &items); err == nil {
				for _, item := range items {
					var productId int64
					quantity := 1
					if pid, ok := item["productId"].(float64); ok {
						productId = int64(pid)
					} else if pid, ok := item["product_id"].(float64); ok {
						productId = int64(pid)
					} else if pid, ok := item["id"].(float64); ok {
						productId = int64(pid)
					}
					if q, ok := item["quantity"].(float64); ok {
						quantity = int(q)
					}
					if productId > 0 {
						// Try to decrement specific variant if color/size is known
						color, _ := item["color"].(string)
						if color == "Любой" || color == "любой" {
							color = ""
						}
						size, _ := item["size"].(string)
						variantDecremented := false
						if color != "" || size != "" {
							res, err := tx.Exec(`
								UPDATE product_variants
								SET stock_quantity = GREATEST(0, stock_quantity - $1),
								    updated_at     = NOW()
								WHERE product_id = $2
								  AND ($3 = '' OR color = $3)
								  AND ($4 = '' OR size  = $4)
							`, quantity, productId, color, size)
							if err == nil {
								if affected, _ := res.RowsAffected(); affected > 0 {
									variantDecremented = true
								}
							}
						}
						if variantDecremented {
							// Sync parent product quantity from variants
							if _, err := tx.Exec(`
								UPDATE products
								SET quantity   = (SELECT COALESCE(SUM(stock_quantity), 0) FROM product_variants WHERE product_id = $1),
								    sold_count = sold_count + $2,
								    updated_at = NOW()
								WHERE id = $1
							`, productId, quantity); err != nil {
								log.Printf("⚠️ UpdateOrderStatus: product sync failed for product %d: %v", productId, err)
							}
						} else {
							// No variant info — decrement product quantity directly
							if _, err := tx.Exec(`
								UPDATE products
								SET quantity   = GREATEST(0, quantity - $1),
								    sold_count = sold_count + $1,
								    updated_at = NOW()
								WHERE id = $2
							`, quantity, productId); err != nil {
								log.Printf("⚠️ UpdateOrderStatus: stock update failed for product %d: %v", productId, err)
							}
						}
					}
				}
				log.Printf("📦 UpdateOrderStatus: stock decremented for order %s → status=%s", id, req.Status)
			}
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}
