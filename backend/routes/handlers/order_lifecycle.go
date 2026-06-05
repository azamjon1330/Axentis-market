package handlers

import (
	"database/sql"
)

// itemProductID extracts a product id from an order item map, tolerating the
// several key spellings used across the app (productId / product_id / id).
func itemProductID(item map[string]interface{}) int64 {
	for _, key := range []string{"productId", "product_id", "id"} {
		if v, ok := item[key]; ok {
			if f, ok := v.(float64); ok && f > 0 {
				return int64(f)
			}
		}
	}
	return 0
}

// itemQuantity extracts the quantity from an order item map.
func itemQuantity(item map[string]interface{}) int {
	if v, ok := item["quantity"]; ok {
		if f, ok := v.(float64); ok {
			return int(f)
		}
	}
	return 0
}

// restoreStockForItems puts stock back when a previously-confirmed order is
// cancelled. It mirrors the decrement logic (variant first, product fallback)
// and clamps sold_count at zero. Runs inside the caller's transaction.
func restoreStockForItems(tx *sql.Tx, items []map[string]interface{}) {
	for _, item := range items {
		productID := itemProductID(item)
		qty := itemQuantity(item)
		if productID == 0 || qty <= 0 {
			continue
		}
		color, _ := item["color"].(string)
		if color == "Любой" || color == "любой" {
			color = ""
		}
		size, _ := item["size"].(string)

		restored := false
		if color != "" || size != "" {
			res, err := tx.Exec(`
				UPDATE product_variants
				SET stock_quantity = stock_quantity + $1, updated_at = NOW()
				WHERE product_id = $2 AND ($3 = '' OR color = $3) AND ($4 = '' OR size = $4)
			`, qty, productID, color, size)
			if err == nil {
				if a, _ := res.RowsAffected(); a > 0 {
					restored = true
				}
			}
		}
		if restored {
			tx.Exec(`
				UPDATE products
				SET quantity   = (SELECT COALESCE(SUM(stock_quantity), 0) FROM product_variants WHERE product_id = $1),
				    sold_count = GREATEST(0, sold_count - $2),
				    updated_at = NOW()
				WHERE id = $1
			`, productID, qty)
		} else {
			tx.Exec(`
				UPDATE products
				SET quantity   = quantity + $1,
				    sold_count = GREATEST(0, sold_count - $1),
				    updated_at = NOW()
				WHERE id = $2
			`, qty, productID)
		}
	}
}

// awardCashback credits loyalty points (1% of the order total, 1 point = 1 sum)
// exactly once per order. Safe to call repeatedly — it checks for an existing
// earn transaction for the order. Runs inside the caller's transaction.
func awardCashback(tx *sql.Tx, phone string, orderID int64, amount float64) {
	points := int(amount * 0.01)
	if points <= 0 || phone == "" {
		return
	}
	var exists bool
	tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM loyalty_transactions WHERE order_id = $1 AND type = 'earn')`, orderID).Scan(&exists)
	if exists {
		return
	}
	tx.Exec(`
		INSERT INTO loyalty_accounts (user_phone, points_balance, total_earned, updated_at)
		VALUES ($1, $2, $2, NOW())
		ON CONFLICT (user_phone) DO UPDATE SET
			points_balance = loyalty_accounts.points_balance + EXCLUDED.points_balance,
			total_earned   = loyalty_accounts.total_earned + EXCLUDED.total_earned,
			updated_at     = NOW()
	`, phone, points)
	tx.Exec(`
		INSERT INTO loyalty_transactions (user_phone, points, type, order_id, description)
		VALUES ($1, $2, 'earn', $3, 'Кэшбэк за заказ')
	`, phone, points, orderID)
}

// orderStatusMessage returns a customer-facing title/message for a status, or
// empty strings for statuses that should not trigger a notification.
func orderStatusMessage(status, orderCode string) (title, message string) {
	suffix := ""
	if orderCode != "" {
		suffix = " №" + orderCode
	}
	switch status {
	case "confirmed", "processing":
		return "Заказ принят", "Ваш заказ" + suffix + " принят продавцом"
	case "shipped":
		return "Заказ в пути", "Ваш заказ" + suffix + " передан в доставку"
	case "delivered", "completed":
		return "Заказ доставлен", "Ваш заказ" + suffix + " доставлен. Спасибо за покупку!"
	case "cancelled":
		return "Заказ отменён", "Ваш заказ" + suffix + " был отменён"
	default:
		return "", ""
	}
}

// notifyOrderStatus inserts a customer notification for an order status change.
func notifyOrderStatus(tx *sql.Tx, phone string, companyID sql.NullInt64, orderCode, status string) {
	if phone == "" {
		return
	}
	title, message := orderStatusMessage(status, orderCode)
	if title == "" {
		return
	}
	var cid interface{}
	if companyID.Valid {
		cid = companyID.Int64
	}
	tx.Exec(`
		INSERT INTO notifications (user_phone, type, title, message, company_id)
		VALUES ($1, 'order_status', $2, $3, $4)
	`, phone, title, message, cid)
}
