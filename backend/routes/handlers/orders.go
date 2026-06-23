package handlers

import (
	"context"
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

// --- Типы для списка заказов ---

// OrderListItem — набор полей для списка заказов.
type OrderListItem struct {
	ID                  int64           `json:"id"`
	OrderCode           string          `json:"order_code"`
	Status              string          `json:"status"`
	TotalAmount         float64         `json:"total_amount"`
	DeliveryCost        float64         `json:"delivery_cost"`
	DeliveryType        string          `json:"delivery_type"`
	CustomerName        string          `json:"customer_name"`
	CustomerPhone       string          `json:"customer_phone"`
	RecipientName       string          `json:"recipient_name"`
	DeliveryAddress     string          `json:"delivery_address"`
	DeliveryCoordinates string          `json:"delivery_coordinates"`
	MarkupProfit        float64         `json:"markup_profit"`
	Items               json.RawMessage `json:"items"`
	CreatedAt           string          `json:"created_at"`
}

// OrdersPage — ответ пагинации.
type OrdersPage struct {
	Orders     []OrderListItem `json:"orders"`
	PageSize   int             `json:"page_size"`
	HasMore    bool            `json:"has_more"`
	NextCursor int64           `json:"next_cursor,omitempty"` // cursor mode
	Total      int             `json:"total,omitempty"`       // offset mode
	Page       int             `json:"page,omitempty"`        // offset mode
}

const (
	ordersDefaultPageSize = 20
	ordersMaxPageSize     = 100
	ordersQueryTimeout    = 5 * time.Second
)

func parseOrdersPageSize(c *gin.Context) int {
	v, err := strconv.Atoi(c.Query("page_size"))
	if err != nil || v <= 0 {
		return ordersDefaultPageSize
	}
	if v > ordersMaxPageSize {
		return ordersMaxPageSize
	}
	return v
}

// checkStockAvailable locks the relevant stock rows inside the transaction and
// verifies enough quantity is available to fulfil `qty` of a product line.
//
// The FOR UPDATE locks serialize concurrent order confirmations: the second
// transaction blocks until the first commits, then sees the reduced stock — so
// the same unit can no longer be sold twice (the overselling race).
//
// It is intentionally conservative: it only reports a shortage when it can
// positively measure one (matching variant rows, or a product-level quantity).
// If it cannot determine the stock for a line, it returns ok=true so legitimate
// orders are never falsely blocked.
func checkStockAvailable(tx *sql.Tx, productID int64, color, size string, qty int) (ok bool, productName string) {
	if color == "Любой" || color == "любой" {
		color = ""
	}

	// Prefer variant-level stock when matching variants exist. Lock the rows
	// first (FOR UPDATE is not allowed alongside SUM), then total them in Go.
	rows, err := tx.Query(`
		SELECT stock_quantity FROM product_variants
		WHERE product_id = $1
		  AND ($2 = '' OR color = $2)
		  AND ($3 = '' OR size  = $3)
		FOR UPDATE
	`, productID, color, size)
	if err == nil {
		variantCount := 0
		variantStock := 0
		for rows.Next() {
			var s sql.NullInt64
			if err := rows.Scan(&s); err == nil {
				variantCount++
				variantStock += int(s.Int64)
			}
		}
		rows.Close()
		if variantCount > 0 {
			if variantStock < qty {
				var name string
				tx.QueryRow(`SELECT name FROM products WHERE id = $1`, productID).Scan(&name)
				return false, name
			}
			return true, ""
		}
	}

	// Fall back to product-level quantity (products without variants).
	var productQty sql.NullInt64
	var name string
	if err := tx.QueryRow(`SELECT quantity, name FROM products WHERE id = $1 FOR UPDATE`, productID).Scan(&productQty, &name); err == nil {
		if productQty.Valid && int(productQty.Int64) < qty {
			return false, name
		}
	}
	return true, ""
}

// GetOrders — production-ready handler с cursor pagination.
//
// Query params:
//   customer_phone  — фильтр по телефону (мобильное приложение)
//   company_id      — фильтр по компании (panель компании); принимает и companyId
//   cursor          — ID последнего заказа предыдущей страницы (cursor mode)
//   page            — номер страницы, начиная с 1 (offset mode)
//   page_size       — размер страницы (default 20, max 100)
//   mode            — "cursor" (default) | "offset"
//
// items в список НЕ включены. Используйте GET /orders/:id для получения деталей.
func GetOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), ordersQueryTimeout)
		defer cancel()

		customerPhone := c.Query("customer_phone")
		companyIDStr := c.Query("company_id")
		if companyIDStr == "" {
			companyIDStr = c.Query("companyId")
		}

		if customerPhone == "" && companyIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "customer_phone or company_id required"})
			return
		}

		pageSize := parseOrdersPageSize(c)

		if c.Query("mode") == "offset" {
			getOrdersOffset(ctx, c, db, customerPhone, companyIDStr, pageSize)
		} else {
			getOrdersCursor(ctx, c, db, customerPhone, companyIDStr, pageSize)
		}
	}
}

// getOrdersCursor — cursor-based pagination.
// Использует id DESC как cursor: стабильный, уникальный, уже индексирован PK.
// Оптимальный выбор для 1M+ строк — O(1) независимо от глубины страницы.
func getOrdersCursor(ctx context.Context, c *gin.Context, db *sql.DB, customerPhone, companyIDStr string, pageSize int) {
	var cursor int64
	if cur := c.Query("cursor"); cur != "" {
		cursor, _ = strconv.ParseInt(cur, 10, 64)
	}

	// Запрашиваем pageSize+1 чтобы определить has_more без COUNT(*)
	fetch := pageSize + 1

	const selectCols = `
		SELECT id,
		       COALESCE(order_code, '')                AS order_code,
		       status,
		       total_amount,
		       delivery_cost,
		       COALESCE(delivery_type, 'pickup')       AS delivery_type,
		       COALESCE(customer_name, '')             AS customer_name,
		       COALESCE(customer_phone, '')            AS customer_phone,
		       COALESCE(recipient_name, '')            AS recipient_name,
		       COALESCE(delivery_address, '')          AS delivery_address,
		       COALESCE(delivery_coordinates, '')      AS delivery_coordinates,
		       COALESCE(markup_profit, 0)              AS markup_profit,
		       COALESCE(items, '[]'::jsonb)            AS items,
		       created_at
		FROM orders`

	var (
		rows *sql.Rows
		err  error
	)

	if customerPhone != "" {
		if cursor > 0 {
			rows, err = db.QueryContext(ctx, selectCols+`
				WHERE customer_phone = $1 AND id < $2
				ORDER BY id DESC LIMIT $3
			`, customerPhone, cursor, fetch)
		} else {
			rows, err = db.QueryContext(ctx, selectCols+`
				WHERE customer_phone = $1
				ORDER BY id DESC LIMIT $2
			`, customerPhone, fetch)
		}
	} else {
		companyID, err2 := strconv.ParseInt(companyIDStr, 10, 64)
		if err2 != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
			return
		}
		if cursor > 0 {
			rows, err = db.QueryContext(ctx, selectCols+`
				WHERE company_id = $1 AND id < $2
				ORDER BY id DESC LIMIT $3
			`, companyID, cursor, fetch)
		} else {
			rows, err = db.QueryContext(ctx, selectCols+`
				WHERE company_id = $1
				ORDER BY id DESC LIMIT $2
			`, companyID, fetch)
		}
	}

	if err != nil {
		log.Printf("❌ getOrdersCursor: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch orders"})
		return
	}
	defer rows.Close()

	orders := make([]OrderListItem, 0, pageSize)
	for rows.Next() {
		var o OrderListItem
		if err := rows.Scan(
			&o.ID, &o.OrderCode, &o.Status,
			&o.TotalAmount, &o.DeliveryCost, &o.DeliveryType,
			&o.CustomerName, &o.CustomerPhone,
			&o.RecipientName, &o.DeliveryAddress, &o.DeliveryCoordinates,
			&o.MarkupProfit, &o.Items, &o.CreatedAt,
		); err != nil {
			log.Printf("⚠️ getOrdersCursor scan: %v", err)
			continue
		}
		orders = append(orders, o)
	}

	if err := rows.Err(); err != nil {
		log.Printf("❌ getOrdersCursor rows.Err: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "row iteration error"})
		return
	}

	var nextCursor int64
	hasMore := len(orders) > pageSize
	if hasMore {
		orders = orders[:pageSize]
		nextCursor = orders[len(orders)-1].ID
	}

	log.Printf("📦 getOrdersCursor: returned %d orders (has_more=%v)", len(orders), hasMore)
	c.JSON(http.StatusOK, OrdersPage{
		Orders:     orders,
		PageSize:   pageSize,
		HasMore:    hasMore,
		NextCursor: nextCursor,
	})
}

// getOrdersOffset — LIMIT/OFFSET pagination с COUNT(*).
// Использовать только если фронтенд требует номера страниц ("страница 3 из 15").
// При таблице 1M+ строк COUNT(*) становится дорогим (Sequential Scan).
func getOrdersOffset(ctx context.Context, c *gin.Context, db *sql.DB, customerPhone, companyIDStr string, pageSize int) {
	page := 1
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	offset := (page - 1) * pageSize

	const selectCols = `
		SELECT id,
		       COALESCE(order_code, '')                AS order_code,
		       status,
		       total_amount,
		       delivery_cost,
		       COALESCE(delivery_type, 'pickup')       AS delivery_type,
		       COALESCE(customer_name, '')             AS customer_name,
		       COALESCE(customer_phone, '')            AS customer_phone,
		       COALESCE(recipient_name, '')            AS recipient_name,
		       COALESCE(delivery_address, '')          AS delivery_address,
		       COALESCE(delivery_coordinates, '')      AS delivery_coordinates,
		       COALESCE(markup_profit, 0)              AS markup_profit,
		       COALESCE(items, '[]'::jsonb)            AS items,
		       created_at
		FROM orders`

	var (
		rows  *sql.Rows
		err   error
		total int
	)

	if customerPhone != "" {
		_ = db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM orders WHERE customer_phone = $1`, customerPhone,
		).Scan(&total)

		rows, err = db.QueryContext(ctx, selectCols+`
			WHERE customer_phone = $1
			ORDER BY id DESC LIMIT $2 OFFSET $3
		`, customerPhone, pageSize, offset)
	} else {
		companyID, err2 := strconv.ParseInt(companyIDStr, 10, 64)
		if err2 != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
			return
		}
		_ = db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM orders WHERE company_id = $1`, companyID,
		).Scan(&total)

		rows, err = db.QueryContext(ctx, selectCols+`
			WHERE company_id = $1
			ORDER BY id DESC LIMIT $2 OFFSET $3
		`, companyID, pageSize, offset)
	}

	if err != nil {
		log.Printf("❌ getOrdersOffset: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch orders"})
		return
	}
	defer rows.Close()

	orders := make([]OrderListItem, 0, pageSize)
	for rows.Next() {
		var o OrderListItem
		if err := rows.Scan(
			&o.ID, &o.OrderCode, &o.Status,
			&o.TotalAmount, &o.DeliveryCost, &o.DeliveryType,
			&o.CustomerName, &o.CustomerPhone,
			&o.RecipientName, &o.DeliveryAddress, &o.DeliveryCoordinates,
			&o.MarkupProfit, &o.Items, &o.CreatedAt,
		); err != nil {
			log.Printf("⚠️ getOrdersOffset scan: %v", err)
			continue
		}
		orders = append(orders, o)
	}

	if err := rows.Err(); err != nil {
		log.Printf("❌ getOrdersOffset rows.Err: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "row iteration error"})
		return
	}

	log.Printf("📦 getOrdersOffset: page=%d total=%d returned=%d", page, total, len(orders))
	c.JSON(http.StatusOK, OrdersPage{
		Orders:   orders,
		PageSize: pageSize,
		HasMore:  offset+pageSize < total,
		Total:    total,
		Page:     page,
	})
}

// GetOrderByID returns a single order. The mobile app's order-detail screen
// calls GET /orders/:id; without this route it 404'd and showed "Заказ не
// найден". Returns the same shape as the list items.
func GetOrderByID(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var o struct {
			ID                  int64
			CustomerName        string
			CustomerPhone       string
			Address             sql.NullString
			Items               []byte
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

		err := db.QueryRow(`
			SELECT id, customer_name, customer_phone, address, items,
			       total_amount, delivery_cost, delivery_type, recipient_name,
			       delivery_address, delivery_coordinates, markup_profit, status, comment, order_code, created_at
			FROM orders WHERE id = $1
		`, id).Scan(&o.ID, &o.CustomerName, &o.CustomerPhone, &o.Address, &o.Items,
			&o.TotalAmount, &o.DeliveryCost, &o.DeliveryType, &o.RecipientName,
			&o.DeliveryAddress, &o.DeliveryCoordinates, &o.MarkupProfit, &o.Status, &o.Comment, &o.OrderCode, &o.CreatedAt)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}
		if err != nil {
			log.Printf("❌ GetOrderByID: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order"})
			return
		}

		// Parse items (handles direct array and double-encoded string).
		var itemsArray []map[string]interface{}
		if len(o.Items) > 0 {
			if err := json.Unmarshal(o.Items, &itemsArray); err != nil {
				var itemsString string
				if err2 := json.Unmarshal(o.Items, &itemsString); err2 == nil {
					json.Unmarshal([]byte(itemsString), &itemsArray)
				}
			}
		}
		if itemsArray == nil {
			itemsArray = []map[string]interface{}{}
		}

		order := map[string]interface{}{
			"id":            o.ID,
			"customerName":  o.CustomerName,
			"customerPhone": o.CustomerPhone,
			"items":         itemsArray,
			"delivery_cost": o.DeliveryCost,
			"deliveryCost":  o.DeliveryCost,
			"total_amount":  o.TotalAmount,
			"totalAmount":   o.TotalAmount,
			"markup_profit": o.MarkupProfit,
			"markupProfit":  o.MarkupProfit,
			"status":        o.Status,
			"created_at":    o.CreatedAt,
			"createdAt":     o.CreatedAt,
			"deliveryType":  ternStr(o.DeliveryType, "pickup"),
			"recipientName": o.RecipientName.String,
			"deliveryAddress": o.DeliveryAddress.String,
			"deliveryCoordinates": o.DeliveryCoordinates.String,
			"address":       o.Address.String,
			"comment":       o.Comment.String,
			"orderCode":     o.OrderCode.String,
			"order_code":    o.OrderCode.String,
		}
		c.JSON(http.StatusOK, order)
	}
}

// ternStr returns the NullString value or a fallback when null/empty.
func ternStr(s sql.NullString, fallback string) string {
	if s.Valid && s.String != "" {
		return s.String
	}
	return fallback
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

	// Soft stock pre-check — reject if a specific variant clearly has insufficient stock.
	// This gives the customer an immediate error before the order is even created.
	// The hard check with FOR UPDATE locks happens again at confirmation time.
	for _, item := range itemsArray {
		var productId int64
		if pid, ok := item["productId"].(float64); ok {
			productId = int64(pid)
		} else if pid, ok := item["product_id"].(float64); ok {
			productId = int64(pid)
		} else if pid, ok := item["id"].(float64); ok {
			productId = int64(pid)
		}
		if productId == 0 {
			continue
		}
		qty := 0
		if q, ok := item["quantity"].(float64); ok {
			qty = int(q)
		}
		if qty <= 0 {
			continue
		}
		itemColor, _ := item["color"].(string)
		if itemColor == "Любой" || itemColor == "любой" {
			itemColor = ""
		}
		itemSize, _ := item["size"].(string)

		if itemColor != "" || itemSize != "" {
			// Check variant-level stock
			var variantStock sql.NullInt64
			_ = db.QueryRow(`
				SELECT COALESCE(SUM(stock_quantity), 0) FROM product_variants
				WHERE product_id = $1
				  AND ($2 = '' OR color = $2)
				  AND ($3 = '' OR size  = $3)
			`, productId, itemColor, itemSize).Scan(&variantStock)

			if variantStock.Valid && int(variantStock.Int64) < qty {
				var pName string
				_ = db.QueryRow(`SELECT name FROM products WHERE id = $1`, productId).Scan(&pName)
				log.Printf("🚫 CreateOrder: insufficient variant stock for product %d (%s), need %d, have %d",
					productId, pName, qty, variantStock.Int64)
				c.JSON(http.StatusConflict, gin.H{
					"error":   fmt.Sprintf("Недостаточно товара на складе: %s (доступно %d шт.)", pName, variantStock.Int64),
					"product": pName,
				})
				return
			}
		} else {
			// No variant specified — check total product quantity
			var productQty sql.NullInt64
			var pName string
			_ = db.QueryRow(`SELECT quantity, name FROM products WHERE id = $1`, productId).Scan(&productQty, &pName)
			if productQty.Valid && int(productQty.Int64) < qty {
				log.Printf("🚫 CreateOrder: insufficient product stock for product %d (%s), need %d, have %d",
					productId, pName, qty, productQty.Int64)
				c.JSON(http.StatusConflict, gin.H{
					"error":   fmt.Sprintf("Недостаточно товара на складе: %s (доступно %d шт.)", pName, productQty.Int64),
					"product": pName,
				})
				return
			}
		}
	}

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

// MarkOrderDelivered is called by the courier panel to mark a shipped delivery
// order as completed. It reuses the full UpdateOrderStatus pipeline so cashback,
// notifications, and push are all fired exactly once.
func MarkOrderDelivered(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		// Verify the order exists and is in 'shipped' state with delivery_type='delivery'
		var currentStatus, customerPhone string
		var companyID sql.NullInt64
		var totalAmount float64
		var orderCode sql.NullString
		var itemsJSON []byte
		if err := db.QueryRow(`
			SELECT status, customer_phone, company_id, total_amount, order_code, items
			FROM orders WHERE id = $1
		`, id).Scan(&currentStatus, &customerPhone, &companyID, &totalAmount, &orderCode, &itemsJSON); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}

		if currentStatus != "shipped" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Only shipped orders can be marked as delivered"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
			return
		}
		defer tx.Rollback()

		if _, err := tx.Exec(`UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order"})
			return
		}

		// Award cashback on delivery (once per order).
		if oid, perr := strconv.ParseInt(id, 10, 64); perr == nil {
			awardCashback(tx, customerPhone, oid, totalAmount)
		}

		notifyOrderStatus(tx, customerPhone, companyID, orderCode.String, "completed")

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit"})
			return
		}

		sendOrderStatusPush(db, customerPhone, orderCode.String, "completed")
		log.Printf("✅ MarkOrderDelivered: order %s marked as completed", id)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// GetShippedDeliveryOrders returns all orders with status=shipped and delivery_type=delivery
// for the courier panel.
func GetShippedDeliveryOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(`
			SELECT id, customer_name, customer_phone, delivery_address, delivery_coordinates,
			       total_amount, order_code, created_at
			FROM orders
			WHERE status = 'shipped' AND delivery_type = 'delivery'
			ORDER BY created_at ASC
		`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
			return
		}
		defer rows.Close()

		result := make([]map[string]interface{}, 0)
		for rows.Next() {
			var o struct {
				ID          int64
				CustomerName string
				CustomerPhone string
				DeliveryAddress sql.NullString
				DeliveryCoordinates sql.NullString
				TotalAmount float64
				OrderCode   sql.NullString
				CreatedAt   string
			}
			if err := rows.Scan(&o.ID, &o.CustomerName, &o.CustomerPhone,
				&o.DeliveryAddress, &o.DeliveryCoordinates,
				&o.TotalAmount, &o.OrderCode, &o.CreatedAt); err != nil {
				continue
			}
			result = append(result, map[string]interface{}{
				"id":                   o.ID,
				"customer_name":        o.CustomerName,
				"customer_phone":       o.CustomerPhone,
				"delivery_address":     o.DeliveryAddress.String,
				"delivery_coordinates": o.DeliveryCoordinates.String,
				"total_amount":         o.TotalAmount,
				"order_code":           o.OrderCode.String,
				"created_at":           o.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, result)
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

		// Read current status and order data before updating
		var currentStatus string
		var itemsJSON []byte
		var customerPhone string
		var companyID sql.NullInt64
		var totalAmount float64
		var orderCode sql.NullString
		if err := tx.QueryRow(`
			SELECT status, items, customer_phone, company_id, total_amount, order_code
			FROM orders WHERE id = $1
		`, id).Scan(&currentStatus, &itemsJSON, &customerPhone, &companyID, &totalAmount, &orderCode); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}

		// Update the status
		if _, err := tx.Exec(`UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1`, id, req.Status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order"})
			return
		}

		// Parse items once — used by both the decrement and the cancel-restore paths.
		var parsedItems []map[string]interface{}
		_ = json.Unmarshal(itemsJSON, &parsedItems)

		// Decrement stock once: only when transitioning from pending → any confirmed state
		confirmedStatuses := map[string]bool{
			"confirmed": true, "processing": true,
			"shipped": true, "delivered": true, "completed": true,
		}
		if currentStatus == "pending" && confirmedStatuses[req.Status] {
			{
				items := parsedItems
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

						// Lock stock rows and reject if there is not enough to
						// fulfil this line — prevents overselling under concurrent
						// confirmations.
						if available, name := checkStockAvailable(tx, productId, color, size, quantity); !available {
							log.Printf("🚫 UpdateOrderStatus: insufficient stock for product %d (%s), need %d", productId, name, quantity)
							c.JSON(http.StatusConflict, gin.H{
								"error":   "Недостаточно товара на складе: " + name,
								"product": name,
							})
							return
						}

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

		// 🔄 Cancelling a previously-confirmed order: put the stock back.
		if req.Status == "cancelled" && confirmedStatuses[currentStatus] {
			restoreStockForItems(tx, parsedItems)
			log.Printf("↩️ UpdateOrderStatus: stock restored for cancelled order %s", id)
		}

		// ⭐ Cashback on delivery/completion (once per order).
		if (req.Status == "delivered" || req.Status == "completed") &&
			currentStatus != "delivered" && currentStatus != "completed" {
			if oid, perr := strconv.ParseInt(id, 10, 64); perr == nil {
				awardCashback(tx, customerPhone, oid, totalAmount)
			}
		}

		// 🔔 Notify the customer about the status change.
		if req.Status != currentStatus {
			notifyOrderStatus(tx, customerPhone, companyID, orderCode.String, req.Status)
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
			return
		}

		// 📲 Real push to the customer's phone (Expo), after the commit so the
		// network call never blocks the transaction or the API response.
		if req.Status != currentStatus {
			sendOrderStatusPush(db, customerPhone, orderCode.String, req.Status)
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}
