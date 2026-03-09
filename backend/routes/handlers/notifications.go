package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ExpoPushMessage - структура для Expo Push API
type ExpoPushMessage struct {
	To    string `json:"to"`
	Title string `json:"title"`
	Body  string `json:"body"`
	Sound string `json:"sound,omitempty"`
	Data  map[string]interface{} `json:"data,omitempty"`
}

// SendExpoPushNotification - отправить push-уведомление через Expo
func SendExpoPushNotification(tokens []string, title, body string) (int, error) {
	if len(tokens) == 0 {
		log.Printf("⚠️ No push tokens provided")
		return 0, nil
	}

	log.Printf("📲 Preparing to send Expo push notifications to %d tokens", len(tokens))

	messages := make([]ExpoPushMessage, 0, len(tokens))
	for _, token := range tokens {
		if token != "" {
			messages = append(messages, ExpoPushMessage{
				To:    token,
				Title: title,
				Body:  body,
				Sound: "default",
				Data: map[string]interface{}{
					"type": "admin_message",
				},
			})
			log.Printf("   📱 Token: %s...", token[:min(30, len(token))])
		}
	}

	if len(messages) == 0 {
		log.Printf("⚠️ No valid push tokens after filtering")
		return 0, nil
	}

	jsonData, err := json.Marshal(messages)
	if err != nil {
		log.Printf("❌ Failed to marshal Expo messages: %v", err)
		return 0, err
	}

	log.Printf("📤 Sending %d messages to Expo Push API...", len(messages))
	resp, err := http.Post(
		"https://exp.host/--/api/v2/push/send",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		log.Printf("❌ Expo Push API error: %v", err)
		return 0, err
	}
	defer resp.Body.Close()

	// Читаем ответ для логирования
	var responseBody bytes.Buffer
	responseBody.ReadFrom(resp.Body)
	
	log.Printf("✅ Expo Push response status: %s, sent %d messages", resp.Status, len(messages))
	log.Printf("📋 Expo Response: %s", responseBody.String()[:min(200, responseBody.Len())])
	
	return len(messages), nil
}

// SaveExpoPushToken - сохранить Expo Push Token пользователя
func SaveExpoPushToken(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Phone     string `json:"phone" binding:"required"`
			PushToken string `json:"pushToken" binding:"required"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Обновляем или создаём пользователя с push token
		_, err := db.Exec(`
			INSERT INTO users (phone, expo_push_token, cart, likes, receipts)
			VALUES ($1, $2, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
			ON CONFLICT (phone) DO UPDATE SET 
				expo_push_token = $2,
				updated_at = NOW()
		`, input.Phone, input.PushToken)

		if err != nil {
			log.Printf("❌ Error saving push token: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save push token"})
			return
		}

		log.Printf("✅ Push token saved for user %s: %s", input.Phone, input.PushToken[:min(30, len(input.PushToken))]+"...")
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// GetUserNotifications - получить уведомления пользователя
func GetUserNotifications(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userPhone := c.Query("phone")
		if userPhone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		rows, err := db.Query(`
			SELECT n.id, n.user_phone, n.type, n.title, n.message, 
			       n.company_id, n.product_id, n.is_read, n.created_at,
			       COALESCE(c.name, '') as company_name,
			       COALESCE(c.logo_url, '') as company_logo,
			       COALESCE(p.name, '') as product_name,
			       COALESCE(p.images, '[]') as product_images
			FROM notifications n
			LEFT JOIN companies c ON n.company_id = c.id
			LEFT JOIN products p ON n.product_id = p.id
			WHERE n.user_phone = $1
			ORDER BY n.created_at DESC
			LIMIT 50
		`, userPhone)
		if err != nil {
			log.Printf("❌ Error fetching notifications: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
			return
		}
		defer rows.Close()

		notifications := make([]map[string]interface{}, 0)
		for rows.Next() {
			var n struct {
				ID            int64
				UserPhone     string
				Type          string
				Title         string
				Message       sql.NullString
				CompanyID     sql.NullInt64
				ProductID     sql.NullInt64
				IsRead        bool
				CreatedAt     string
				CompanyName   string
				CompanyLogo   string
				ProductName   string
				ProductImages string
			}

			err := rows.Scan(&n.ID, &n.UserPhone, &n.Type, &n.Title, &n.Message,
				&n.CompanyID, &n.ProductID, &n.IsRead, &n.CreatedAt,
				&n.CompanyName, &n.CompanyLogo, &n.ProductName, &n.ProductImages)
			if err != nil {
				log.Printf("⚠️ Error scanning notification: %v", err)
				continue
			}

			notification := map[string]interface{}{
				"id":        n.ID,
				"userPhone": n.UserPhone,
				"type":      n.Type,
				"title":     n.Title,
				"isRead":    n.IsRead,
				"createdAt": n.CreatedAt,
			}

			if n.Message.Valid {
				notification["message"] = n.Message.String
			}
			if n.CompanyID.Valid {
				notification["companyId"] = n.CompanyID.Int64
				notification["companyName"] = n.CompanyName
				notification["companyLogo"] = n.CompanyLogo
			}
			if n.ProductID.Valid {
				notification["productId"] = n.ProductID.Int64
				notification["productName"] = n.ProductName
				notification["productImages"] = n.ProductImages
			}

			notifications = append(notifications, notification)
		}

		c.JSON(http.StatusOK, notifications)
	}
}

// GetUnreadNotificationsCount - получить количество непрочитанных уведомлений
func GetUnreadNotificationsCount(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userPhone := c.Query("phone")
		if userPhone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		var count int
		err := db.QueryRow(`
			SELECT COUNT(*) FROM notifications 
			WHERE user_phone = $1 AND is_read = false
		`, userPhone).Scan(&count)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count notifications"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}

// MarkNotificationAsRead - отметить уведомление как прочитанное
func MarkNotificationAsRead(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		notificationID := c.Param("id")

		_, err := db.Exec(`UPDATE notifications SET is_read = true WHERE id = $1`, notificationID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update notification"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// MarkAllNotificationsAsRead - отметить все уведомления как прочитанные
func MarkAllNotificationsAsRead(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userPhone := c.Query("phone")
		if userPhone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required"})
			return
		}

		_, err := db.Exec(`UPDATE notifications SET is_read = true WHERE user_phone = $1`, userPhone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update notifications"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// CreateNotificationForSubscribers - создать уведомление для всех подписчиков компании
func CreateNotificationForSubscribers(db *sql.DB, companyID int64, productID int64, productName string, companyName string) error {
	// Получаем всех подписчиков компании
	rows, err := db.Query(`
		SELECT user_phone FROM company_subscribers WHERE company_id = $1
	`, companyID)
	if err != nil {
		return err
	}
	defer rows.Close()

	title := "🆕 Новый товар от " + companyName
	message := productName + " добавлен в каталог!"

	for rows.Next() {
		var userPhone string
		if err := rows.Scan(&userPhone); err != nil {
			continue
		}

		// Создаём уведомление для каждого подписчика
		_, err := db.Exec(`
			INSERT INTO notifications (user_phone, type, title, message, company_id, product_id)
			VALUES ($1, 'new_product', $2, $3, $4, $5)
		`, userPhone, title, message, companyID, productID)
		if err != nil {
			log.Printf("⚠️ Failed to create notification for %s: %v", userPhone, err)
		}
	}

	log.Printf("📬 Notifications sent to subscribers of company %d for product %d", companyID, productID)
	return nil
}

// SendAdminNotification - отправить уведомление от админа (одному пользователю или всем)
func SendAdminNotification(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Title     string `json:"title"`
			Message   string `json:"message"`
			Phone     string `json:"phone"`      // Если пусто - отправить всем
			SendToAll bool   `json:"sendToAll"`  // true = всем пользователям
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		// Валидация
		if input.Title == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
			return
		}
		if input.Message == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
			return
		}

		var sentCount int
		var pushTokens []string

		if input.SendToAll {
			// Отправить всем пользователям из всех источников
			rows, err := db.Query(`
				WITH all_users AS (
					SELECT phone, COALESCE(expo_push_token, '') as push_token
					FROM users 
					WHERE phone IS NOT NULL AND phone != ''
					
					UNION
					
					SELECT DISTINCT customer_phone as phone, '' as push_token
					FROM orders
					WHERE customer_phone IS NOT NULL AND customer_phone != ''
				)
				SELECT DISTINCT phone, MAX(push_token) as push_token
				FROM all_users
				GROUP BY phone
			`)
			if err != nil {
				log.Printf("❌ Error fetching users: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
				return
			}
			defer rows.Close()

			for rows.Next() {
				var userPhone, pushToken string
				if err := rows.Scan(&userPhone, &pushToken); err != nil {
					continue
				}

				// Сохраняем в базу
				_, err := db.Exec(`
					INSERT INTO notifications (user_phone, type, title, message)
					VALUES ($1, 'admin_message', $2, $3)
				`, userPhone, input.Title, input.Message)
				if err != nil {
					log.Printf("⚠️ Failed to save notification to %s: %v", userPhone, err)				log.Printf("👀 SQL Error details: %T", err)				} else {
					sentCount++
					if pushToken != "" {
						pushTokens = append(pushTokens, pushToken)
					}
				}
			}

			log.Printf("📢 Admin notification sent to ALL users (%d recipients): %s", sentCount, input.Title)
		} else {
			// Отправить конкретному пользователю
			if input.Phone == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Phone is required for single user notification"})
				return
			}

			// Получаем push token пользователя
			var pushToken string
			db.QueryRow(`SELECT COALESCE(expo_push_token, '') FROM users WHERE phone = $1`, input.Phone).Scan(&pushToken)

			_, err := db.Exec(`
				INSERT INTO notifications (user_phone, type, title, message)
				VALUES ($1, 'admin_message', $2, $3)
			`, input.Phone, input.Title, input.Message)
			if err != nil {
				log.Printf("❌ Failed to send notification to %s: %v", input.Phone, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send notification"})
				return
			}
			sentCount = 1
			if pushToken != "" {
				pushTokens = append(pushTokens, pushToken)
			}

			log.Printf("📨 Admin notification sent to user %s: %s", input.Phone, input.Title)
		}

		// Отправляем push-уведомления через FCM (Firebase) или Expo (fallback)
		pushSent, err := SendFCMPushNotification(pushTokens, input.Title, input.Message)
		if err != nil {
			log.Printf("⚠️ Push notification error: %v", err)
		} else {
			log.Printf("📲 Push notifications sent: %d", pushSent)
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"sentCount": sentCount,
			"pushSent":  pushSent,
			"message":   "Notification sent successfully",
		})
	}
}

// GetAllUsersPhones - получить список всех телефонов пользователей (для автокомплита)
func GetAllUsersPhones(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Собираем пользователей из разных источников: users + orders + notifications
		rows, err := db.Query(`
			WITH all_users AS (
				-- Из таблицы users
				SELECT phone, COALESCE(name, '') as name 
				FROM users 
				WHERE phone IS NOT NULL AND phone != ''
				
				UNION
				
				-- Из заказов
				SELECT DISTINCT customer_phone as phone, COALESCE(customer_name, '') as name
				FROM orders
				WHERE customer_phone IS NOT NULL AND customer_phone != ''
				
				UNION
				
				-- Из уведомлений
				SELECT DISTINCT user_phone as phone, '' as name
				FROM notifications
				WHERE user_phone IS NOT NULL AND user_phone != ''
			)
			SELECT DISTINCT phone, MAX(name) as name
			FROM all_users
			GROUP BY phone
			ORDER BY name, phone
			LIMIT 500
		`)
		if err != nil {
			log.Printf("❌ Error fetching users: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
			return
		}
		defer rows.Close()

		users := make([]map[string]string, 0)
		for rows.Next() {
			var phone, name string
			if err := rows.Scan(&phone, &name); err != nil {
				continue
			}
			users = append(users, map[string]string{"phone": phone, "name": name})
		}

		log.Printf("📋 Found %d users for notifications", len(users))
		c.JSON(http.StatusOK, users)
	}
}
