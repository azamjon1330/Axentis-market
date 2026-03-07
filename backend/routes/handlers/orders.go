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

		log.Printf("📦 GetOrders called for companyId=%s", companyID)

		// Инициализируем пустой массив чтобы избежать null
		orders := make([]map[string]interface{}, 0)

		rows, err := db.Query(`
			SELECT id, customer_name, customer_phone, address, items, 
		       total_amount, delivery_cost, delivery_type, recipient_name, 
		       delivery_address, delivery_coordinates, markup_profit, status, comment, order_code, created_at
			FROM orders
			WHERE company_id = $1
			ORDER BY created_at DESC
		`, companyID)

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

	// Calculate markup profit
	var markupProfit float64
	for _, item := range itemsArray {
		quantity := 0.0
		basePrice := 0.0
		priceWithMarkup := 0.0
		
		// Get quantity
		if q, ok := item["quantity"].(float64); ok {
			quantity = q
		}
		
		// Get base price
		if p, ok := item["price"].(float64); ok {
			basePrice = p
		}
		
		// Get price with markup
		if pwm, ok := item["price_with_markup"].(float64); ok {
			priceWithMarkup = pwm
		} else if pwm, ok := item["priceWithMarkup"].(float64); ok {
			priceWithMarkup = pwm
		}
		
		// Calculate markup profit for this item
		if priceWithMarkup > 0 && basePrice > 0 {
			itemMarkup := (priceWithMarkup - basePrice) * quantity
			markupProfit += itemMarkup
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

		_, err := db.Exec(`
			UPDATE orders SET status = $2, updated_at = NOW()
			WHERE id = $1
		`, id, req.Status)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}
