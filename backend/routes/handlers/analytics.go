package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
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

		// Get total inventory value (from product_variants for accuracy)
		var inventoryValue float64
		db.QueryRow(`
			SELECT COALESCE(SUM(pv.price * pv.stock_quantity), 0)
			FROM product_variants pv
			JOIN products p ON p.id = pv.product_id
			WHERE p.company_id = $1
		`, companyID).Scan(&inventoryValue)

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
		WHERE company_id = $1 AND status NOT IN ('pending', 'cancelled')
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
		WHERE company_id = $1 AND status NOT IN ('pending', 'cancelled')
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

		// ✅ НОВОЕ (Req 3.1–3.3): Полная разбивка продаж по типам товаров.
		// Собираем позиции (items) из подтвержденных заказов И кассовых продаж,
		// группируем по типу товара (item->>'type') и нормализуем ключи типов.
		// Это устраняет баг, когда в аналитике отображался только один тип (futbolka).
		breakdownItems := make([]map[string]interface{}, 0)

		// 1) Позиции из подтвержденных заказов (orders уже отфильтрованы по
		//    status NOT IN ('pending','cancelled') выше).
		for _, order := range orders {
			if len(order.Items) == 0 {
				continue
			}
			var orderItems []map[string]interface{}
			if err := json.Unmarshal(order.Items, &orderItems); err != nil {
				log.Printf("⚠️ [GetCompanyAnalytics] Failed to parse order items for breakdown (order %d): %v", order.ID, err)
				continue
			}
			breakdownItems = append(breakdownItems, orderItems...)
		}

		// 2) Позиции из кассовых продаж (sales).
		salesItemRows, salesErr := db.Query(`SELECT items FROM sales WHERE company_id = $1`, companyID)
		if salesErr != nil {
			log.Printf("⚠️ [GetCompanyAnalytics] Failed to query sales items for breakdown: %v", salesErr)
		} else {
			defer salesItemRows.Close()
			for salesItemRows.Next() {
				var rawItems []byte
				if err := salesItemRows.Scan(&rawItems); err != nil {
					log.Printf("⚠️ [GetCompanyAnalytics] Failed to scan sale items: %v", err)
					continue
				}
				if len(rawItems) == 0 {
					continue
				}
				var saleItems []map[string]interface{}
				if err := json.Unmarshal(rawItems, &saleItems); err != nil {
					log.Printf("⚠️ [GetCompanyAnalytics] Failed to parse sale items for breakdown: %v", err)
					continue
				}
				breakdownItems = append(breakdownItems, saleItems...)
			}
		}

		productTypeBreakdown := aggregateProductTypeBreakdown(breakdownItems)

		// ✅ Добавляем логирование для отладки
		log.Printf("📊 [GetCompanyAnalytics] companyId=%s, totalSales=%.2f, totalMarkup=%.2f, salesCount=%d, completed orders=%d, productTypes=%d, timestamp=%d",
			companyID, totalSales, totalMarkup, salesCount, len(orders), len(productTypeBreakdown), time.Now().Unix())

		analytics := map[string]interface{}{
			"totalProducts":        totalProducts,
			"inventoryValue":       inventoryValue, // Себестоимость товаров на складе (из вариантов)
			"inventoryCost":        inventoryValue, // Alias для фронтенда
			"totalRevenue":         totalSales,
			"totalSales":           totalSales,
			"totalMarkup":          totalMarkup,
			"totalMarkupProfit":    totalMarkup,
			"costOfGoodsSold":      costOfGoodsSold,
			"salesCount":           salesCount,
			"ordersCount":          ordersCount,
			"totalExpenses":        totalExpenses,
			"netProfit":            totalMarkup - totalExpenses,
			"orders":               orders,
			"productTypeBreakdown": productTypeBreakdown,
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

// GetCompanyTimeseries serves the granularity-aware Orders & Revenue time-series
// used by the web analytics chart (Requirement 4).
//
//	GET /api/analytics/company/:companyId/timeseries?range=<daily|weekly|monthly|yearly>&from=<iso>&to=<iso>
//
// It aggregates orders + cash sales over [from, to), buckets them by the range's
// fixed granularity (daily->1h, weekly->12h, monthly->1d, yearly->1w), zero-fills
// empty buckets within the range only, and returns two index-aligned series:
// `current` over [from, to) and `previous` over the equal-length range
// immediately preceding it ([from-(to-from), from)).
//
// The SQL is intentionally thin (it only pulls {created_at, total_amount} rows);
// all bucketing/alignment logic lives in the pure helpers in
// analytics_timeseries.go so it can be property-tested in isolation.
func GetCompanyTimeseries(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("companyId")

		rangeType := c.Query("range")
		if rangeType == "" {
			rangeType = "daily"
		}
		bucketSize, ok := timeseriesBucketDuration(rangeType)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "invalid range; expected one of daily|weekly|monthly|yearly",
			})
			return
		}

		// Resolve the [from, to) window. Both are optional; when omitted we fall
		// back to a sensible default span for the range ending at now.
		to, err := parseTimeseriesBound(c.Query("to"), time.Now().UTC())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid 'to' timestamp; expected RFC3339"})
			return
		}
		from, err := parseTimeseriesBound(c.Query("from"), to.Add(-defaultRangeSpan(rangeType)))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid 'from' timestamp; expected RFC3339"})
			return
		}
		if !to.After(from) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "'to' must be after 'from'"})
			return
		}

		// Current-period buckets tile [from, to).
		currentStarts, err := computeTimeseriesBuckets(rangeType, from, to)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Previous period: equal length, immediately preceding, and index-aligned
		// to the current buckets (same count, each shifted back by the span).
		prevFrom, prevTo := previousPeriodRange(from, to)
		previousStarts := make([]time.Time, len(currentStarts))
		span := to.Sub(from)
		for i, s := range currentStarts {
			previousStarts[i] = s.Add(-span)
		}

		currentEvents, err := queryTimeseriesEvents(db, companyID, from, to)
		if err != nil {
			log.Printf("❌ [GetCompanyTimeseries] current events query failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load time-series"})
			return
		}
		previousEvents, err := queryTimeseriesEvents(db, companyID, prevFrom, prevTo)
		if err != nil {
			log.Printf("❌ [GetCompanyTimeseries] previous events query failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load time-series"})
			return
		}

		current := bucketTimeseriesEvents(currentEvents, currentStarts, bucketSize)
		previous := bucketTimeseriesEvents(previousEvents, previousStarts, bucketSize)

		c.JSON(http.StatusOK, gin.H{
			"granularity": timeseriesGranularityLabel(rangeType),
			"current":     current,
			"previous":    previous,
		})
	}
}

// parseTimeseriesBound parses an RFC3339 timestamp, returning fallback (in UTC)
// when the raw value is empty. The parsed time is normalized to UTC so bucketing
// math is timezone-stable.
func parseTimeseriesBound(raw string, fallback time.Time) (time.Time, error) {
	if raw == "" {
		return fallback.UTC(), nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, err
	}
	return t.UTC(), nil
}

// defaultRangeSpan is the default window length used when `from`/`to` are not
// supplied, chosen to produce a natural number of buckets for each range type.
func defaultRangeSpan(rangeType string) time.Duration {
	switch rangeType {
	case "daily":
		return 24 * time.Hour
	case "weekly":
		return 7 * 24 * time.Hour
	case "monthly":
		return 30 * 24 * time.Hour
	case "yearly":
		return 365 * 24 * time.Hour
	default:
		return 24 * time.Hour
	}
}

// queryTimeseriesEvents pulls one TimeseriesEvent per confirmed order and per
// cash sale for the company within [start, end). Each row contributes Orders=1
// and Revenue=total_amount; the (pure) bucketing helpers handle the rest. This
// is the only DB-touching part of the time-series path and is kept deliberately
// thin.
func queryTimeseriesEvents(db *sql.DB, companyID string, start, end time.Time) ([]TimeseriesEvent, error) {
	const query = `
		SELECT created_at, total_amount FROM orders
		WHERE company_id = $1 AND status NOT IN ('pending', 'cancelled')
		  AND created_at >= $2 AND created_at < $3
		UNION ALL
		SELECT created_at, total_amount FROM sales
		WHERE company_id = $1
		  AND created_at >= $2 AND created_at < $3
	`

	rows, err := db.Query(query, companyID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]TimeseriesEvent, 0)
	for rows.Next() {
		var createdAt time.Time
		var amount float64
		if err := rows.Scan(&createdAt, &amount); err != nil {
			return nil, err
		}
		events = append(events, TimeseriesEvent{
			Timestamp: createdAt.UTC(),
			Orders:    1,
			Revenue:   amount,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

// ProductTypeBreakdownEntry is one row of the per-product-type sales breakdown
// returned by GetCompanyAnalytics (Requirement 3).
type ProductTypeBreakdownEntry struct {
	ProductType string  `json:"productType"`
	Units       int     `json:"units"`
	Revenue     float64 `json:"revenue"`
}

// aggregateProductTypeBreakdown is a pure aggregation helper (kept free of any
// DB/HTTP dependency for testability). It takes the union of order items and
// cash-sale items, groups them by normalized product type, and returns one entry
// per type that has recorded sales.
//
// Behavior (Requirements 3.1–3.3):
//   - Every product type present in the items is represented exactly once.
//   - Types with no items are omitted entirely (no zero-fill).
//   - `Units` is the sum of item quantities for the type.
//   - `Revenue` is the sum of (unit selling price * quantity) for the type.
//   - Items without a usable product type are skipped (they cannot be bucketed).
//
// First-seen ordering is preserved so the output is deterministic for a given
// input ordering (Go map iteration order is otherwise random).
func aggregateProductTypeBreakdown(items []map[string]interface{}) []ProductTypeBreakdownEntry {
	type accumulator struct {
		units   int
		revenue float64
	}

	agg := make(map[string]*accumulator)
	order := make([]string, 0)

	for _, item := range items {
		if item == nil {
			continue
		}

		productType := normalizeProductType(itemProductType(item))
		if productType == "" {
			// No recorded type for this item — cannot attribute it to a type bucket.
			continue
		}

		quantity := itemQuantity(item)
		if quantity <= 0 {
			continue
		}
		revenue := itemUnitPrice(item) * float64(quantity)

		entry, exists := agg[productType]
		if !exists {
			entry = &accumulator{}
			agg[productType] = entry
			order = append(order, productType)
		}
		entry.units += quantity
		entry.revenue += revenue
	}

	result := make([]ProductTypeBreakdownEntry, 0, len(order))
	for _, productType := range order {
		result = append(result, ProductTypeBreakdownEntry{
			ProductType: productType,
			Units:       agg[productType].units,
			Revenue:     agg[productType].revenue,
		})
	}
	return result
}

// normalizeProductType canonicalizes a raw product-type string so that variant
// spellings (case, surrounding whitespace, Russian/English synonyms) collapse to
// a single stable key such as "futbolka", "sportivka", "kostyum", "krossovka".
// Returns "" when there is no meaningful type.
func normalizeProductType(raw string) string {
	t := strings.ToLower(strings.TrimSpace(raw))
	if t == "" {
		return ""
	}

	switch t {
	case "футболка", "tshirt", "t-shirt", "tee", "t shirt":
		return "futbolka"
	case "спортивка", "спортивная", "sportswear", "sportwear", "sport":
		return "sportivka"
	case "костюм", "suit":
		return "kostyum"
	case "кроссовки", "кроссовка", "sneakers", "sneaker", "krossovki":
		return "krossovka"
	}
	return t
}

// itemProductType extracts the product type from an item JSON object. The
// canonical field is `type` (item->>'type'); camelCase / snake_case fallbacks are
// accepted for robustness across the various item shapes in the codebase.
func itemProductType(item map[string]interface{}) string {
	for _, key := range []string{"type", "productType", "product_type", "category"} {
		if v, ok := item[key]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return s
			}
		}
	}
	return ""
}

// itemQuantity reads the item quantity, tolerating the JSON number/string shapes
// that appear in stored items. Defaults to 1 when absent.
func itemQuantity(item map[string]interface{}) int {
	v, ok := item["quantity"]
	if !ok {
		return 1
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			f, _ := n.Float64()
			return int(f)
		}
		return int(i)
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(n)); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(strings.TrimSpace(n), 64); err == nil {
			return int(f)
		}
	}
	return 1
}

// itemUnitPrice reads the per-unit selling price for an item, preferring the
// marked-up selling price and falling back to the base price. Line-total fields
// are intentionally NOT used here (they already incorporate quantity).
func itemUnitPrice(item map[string]interface{}) float64 {
	for _, key := range []string{"price_with_markup", "priceWithMarkup", "sellingPrice", "price"} {
		if v := numericField(item, key); v > 0 {
			return v
		}
	}
	return 0
}

// numericField reads a numeric value from an item field, tolerating number and
// string encodings. Returns 0 when missing or unparseable.
func numericField(item map[string]interface{}, key string) float64 {
	v, ok := item[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(n), 64); err == nil {
			return f
		}
	}
	return 0
}
