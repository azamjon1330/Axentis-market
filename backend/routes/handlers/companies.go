package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

// Get Companies
func GetCompanies(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Для админ панели показываем все компании, для пользователей - только approved
		query := `
			SELECT id, name, phone, password_hash, access_key, mode, private_code, status, logo_url, address, description, products_description, latitude, longitude, delivery_enabled, is_enabled
			FROM companies
			ORDER BY created_at DESC
		`

		rows, err := db.Query(query)

		if err != nil {
			log.Printf("❌ GetCompanies: Failed to query companies: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch companies"})
			return
		}
		defer rows.Close()

		companies := make([]map[string]interface{}, 0)
		for rows.Next() {
			var comp struct {
				ID                  int64
				Name                string
				Phone               string
				PasswordHash        string
				AccessKey           sql.NullString
				Mode                string
				PrivateCode         sql.NullString
				Status              string
				LogoURL             sql.NullString
				Address             sql.NullString
				Description         sql.NullString
				ProductsDescription sql.NullString
				Latitude            sql.NullFloat64
				Longitude           sql.NullFloat64
				DeliveryEnabled     bool
				IsEnabled           sql.NullBool
			}

			if err := rows.Scan(&comp.ID, &comp.Name, &comp.Phone, &comp.PasswordHash, &comp.AccessKey, &comp.Mode, &comp.PrivateCode, &comp.Status,
				&comp.LogoURL, &comp.Address, &comp.Description, &comp.ProductsDescription, &comp.Latitude, &comp.Longitude, &comp.DeliveryEnabled, &comp.IsEnabled); err != nil {
				log.Printf("❌ GetCompanies: Failed to scan row: %v", err)
				continue
			}

			company := map[string]interface{}{
				"id":              comp.ID,
				"name":            comp.Name,
				"phone":           comp.Phone,
				"mode":            comp.Mode,
				"status":          comp.Status,
				"deliveryEnabled": comp.DeliveryEnabled,
			}

			// Возвращаем пароль для админ-панели (plaintext если не bcrypt, иначе маркер)
			company["password"] = comp.PasswordHash
			if comp.AccessKey.Valid {
				company["accessKey"] = comp.AccessKey.String
			}
			if comp.PrivateCode.Valid {
				company["privateCode"] = comp.PrivateCode.String
			}
			if comp.LogoURL.Valid {
				company["logoUrl"] = comp.LogoURL.String
			}
			if comp.Address.Valid {
				company["address"] = comp.Address.String
			}
			if comp.Description.Valid {
				company["description"] = comp.Description.String
			}
			if comp.ProductsDescription.Valid {
				company["productsDescription"] = comp.ProductsDescription.String
			}
			if comp.Latitude.Valid {
				company["latitude"] = comp.Latitude.Float64
			}
			if comp.Longitude.Valid {
				company["longitude"] = comp.Longitude.Float64
			}
			if comp.IsEnabled.Valid {
				company["is_enabled"] = comp.IsEnabled.Bool
			}

			companies = append(companies, company)
		}

		log.Printf("✅ GetCompanies: Returning %d companies", len(companies))
		c.JSON(http.StatusOK, companies)
	}
}

// Get Single Company
func GetCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var company struct {
			ID                  int64
			Name                string
			Phone               string
			Mode                string
			Status              string
			LogoURL             sql.NullString
			Address             sql.NullString
			Description         sql.NullString
			ProductsDescription sql.NullString
			Latitude            sql.NullFloat64
			Longitude           sql.NullFloat64
			DeliveryEnabled     bool
		}

		err := db.QueryRow(`
			SELECT id, name, phone, mode, status, logo_url, address, description, products_description, latitude, longitude, delivery_enabled
			FROM companies WHERE id = $1
		`, id).Scan(&company.ID, &company.Name, &company.Phone, &company.Mode, &company.Status,
			&company.LogoURL, &company.Address, &company.Description, &company.ProductsDescription, &company.Latitude, &company.Longitude, &company.DeliveryEnabled)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Company not found"})
			return
		}

		result := map[string]interface{}{
			"id":              company.ID,
			"name":            company.Name,
			"phone":           company.Phone,
			"mode":            company.Mode,
			"status":          company.Status,
			"deliveryEnabled": company.DeliveryEnabled,
		}

		if company.LogoURL.Valid {
			result["logoUrl"] = company.LogoURL.String
		}
		if company.Address.Valid {
			result["address"] = company.Address.String
		}
		if company.Description.Valid {
			result["description"] = company.Description.String
		}
		if company.ProductsDescription.Valid {
			result["productsDescription"] = company.ProductsDescription.String
		}
		if company.Latitude.Valid {
			result["latitude"] = company.Latitude.Float64
		}
		if company.Longitude.Valid {
			result["longitude"] = company.Longitude.Float64
		}

		// Получаем средний рейтинг компании
		var avgRating float64
		var ratingCount int
		err = db.QueryRow(`
			SELECT COALESCE(AVG(rating), 0), COUNT(*) 
			FROM company_ratings 
			WHERE company_id = $1
		`, id).Scan(&avgRating, &ratingCount)

		if err == nil {
			result["averageRating"] = avgRating
			result["ratingCount"] = ratingCount
		}

		log.Printf("📤 GetCompany: Returning company %s, logoUrl=%v, rating=%.2f (%d)", id, result["logoUrl"], avgRating, ratingCount)
		c.JSON(http.StatusOK, result)
	}
}

// ToggleCompanyDelivery - включает/выключает доставку для конкретной компании
func ToggleCompanyDelivery(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		var req struct {
			DeliveryEnabled bool `json:"deliveryEnabled"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err := db.Exec(`
			UPDATE companies
			SET delivery_enabled = $1, updated_at = NOW()
			WHERE id = $2
		`, req.DeliveryEnabled, companyID)

		if err != nil {
			log.Printf("❌ ToggleCompanyDelivery: Failed to update delivery setting: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update delivery setting"})
			return
		}

		log.Printf("✅ ToggleCompanyDelivery: Company %s delivery_enabled set to %v", companyID, req.DeliveryEnabled)
		c.JSON(http.StatusOK, gin.H{"success": true, "deliveryEnabled": req.DeliveryEnabled})
	}
}

// Update Company
func UpdateCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var req struct {
			Name                string   `json:"name"`
			Phone               string   `json:"phone"`
			Password            string   `json:"password"`
			AccessKey           string   `json:"access_key"`
			Description         string   `json:"description"`
			Address             string   `json:"address"`
			ProductsDescription string   `json:"productsDescription"`
			Latitude            *float64 `json:"latitude"`
			Longitude           *float64 `json:"longitude"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Строим динамический запрос в зависимости от переданных полей
		query := "UPDATE companies SET updated_at = NOW()"
		args := []interface{}{}
		argCount := 1

		if req.Name != "" {
			query += fmt.Sprintf(", name = $%d", argCount)
			args = append(args, req.Name)
			argCount++
		}
		if req.Phone != "" {
			query += fmt.Sprintf(", phone = $%d", argCount)
			args = append(args, req.Phone)
			argCount++
		}
		if req.Password != "" {
			// Храним пароль в открытом виде (для отображения в админ панели)
			query += fmt.Sprintf(", password_hash = $%d", argCount)
			args = append(args, req.Password)
			argCount++
		}
		if req.AccessKey != "" {
			query += fmt.Sprintf(", access_key = $%d", argCount)
			args = append(args, req.AccessKey)
			argCount++
		}
		if req.Description != "" {
			query += fmt.Sprintf(", description = $%d", argCount)
			args = append(args, req.Description)
			argCount++
		}
		if req.Address != "" {
			query += fmt.Sprintf(", address = $%d", argCount)
			args = append(args, req.Address)
			argCount++
		}
		if req.ProductsDescription != "" {
			query += fmt.Sprintf(", products_description = $%d", argCount)
			args = append(args, req.ProductsDescription)
			argCount++
		}
		if req.Latitude != nil {
			query += fmt.Sprintf(", latitude = $%d", argCount)
			args = append(args, *req.Latitude)
			argCount++
		}
		if req.Longitude != nil {
			query += fmt.Sprintf(", longitude = $%d", argCount)
			args = append(args, *req.Longitude)
			argCount++
		}

		query += fmt.Sprintf(" WHERE id = $%d", argCount)
		args = append(args, id)

		log.Printf("📝 UpdateCompany: Executing query with %d params for company %s", len(args), id)
		_, err := db.Exec(query, args...)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update company"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Delete Company
func DeleteCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		// Prevent deleting main company (id = 1)
		if id == "1" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete main company"})
			return
		}

		_, err := db.Exec("DELETE FROM companies WHERE id = $1", id)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete company"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Verify Access Key
func VerifyAccessKey(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var requestBody struct {
			AccessKey string `json:"accessKey"`
		}

		if err := c.ShouldBindJSON(&requestBody); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		// Query company from database
		var company struct {
			ID          int64
			Name        string
			Phone       string
			AccessKey   sql.NullString
			Mode        string
			Status      string
			LogoURL     sql.NullString
			Address     sql.NullString
			Description sql.NullString
		}

		query := `
			SELECT id, name, phone, access_key, mode, status, logo_url, address, description
			FROM companies
			WHERE id = $1
		`

		err := db.QueryRow(query, id).Scan(
			&company.ID, &company.Name, &company.Phone, &company.AccessKey,
			&company.Mode, &company.Status, &company.LogoURL, &company.Address, &company.Description,
		)

		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Company not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch company"})
			return
		}

		// Verify access key
		if !company.AccessKey.Valid || requestBody.AccessKey != company.AccessKey.String {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid access key"})
			return
		}

		// Return company data
		result := map[string]interface{}{
			"id":     company.ID,
			"name":   company.Name,
			"phone":  company.Phone,
			"mode":   company.Mode,
			"status": company.Status,
		}

		if company.LogoURL.Valid {
			result["logoUrl"] = company.LogoURL.String
		}
		if company.Address.Valid {
			result["address"] = company.Address.String
		}
		if company.Description.Valid {
			result["description"] = company.Description.String
		}

		c.JSON(http.StatusOK, result)
	}
}

// Track Company View
func TrackCompanyView(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		// Увеличиваем счетчик просмотров
		_, err := db.Exec(`
			UPDATE companies 
			SET view_count = COALESCE(view_count, 0) + 1 
			WHERE id = $1
		`, companyID)

		if err != nil {
			log.Printf("❌ TrackCompanyView: Failed to update view count: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to track view"})
			return
		}

		log.Printf("✅ TrackCompanyView: View tracked for company %s", companyID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Get Company Stats
func GetCompanyStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		var stats struct {
			Views               int
			Subscribers         int
			TotalProducts       int
			TotalSales          int
			EmployeeExpenses    float64
			ElectricityExpenses float64
			PurchaseCosts       float64
		}

		// Получаем статистику компании включая затраты
		err := db.QueryRow(`
			SELECT 
				COALESCE(view_count, 0)
			FROM companies 
			WHERE id = $1
		`, companyID).Scan(&stats.Views)

		if err != nil {
			log.Printf("❌ GetCompanyStats: Failed to get company data: %v", err)
			stats.Views = 0
			stats.EmployeeExpenses = 0
			stats.ElectricityExpenses = 0
			stats.PurchaseCosts = 0
		}

		// Получаем количество подписчиков
		err = db.QueryRow(`
			SELECT COUNT(*) 
			FROM company_subscribers 
			WHERE company_id = $1
		`, companyID).Scan(&stats.Subscribers)

		if err != nil {
			log.Printf("❌ GetCompanyStats: Failed to get subscribers: %v", err)
			stats.Subscribers = 0
		}

		// Получаем количество товаров
		err = db.QueryRow(`
			SELECT COUNT(*) 
			FROM products 
			WHERE company_id = $1
		`, companyID).Scan(&stats.TotalProducts)

		if err != nil {
			log.Printf("❌ GetCompanyStats: Failed to get total products: %v", err)
			stats.TotalProducts = 0
		}

// Получаем количество продаж (онлайн заказы кроме pending)
	err = db.QueryRow(`
		SELECT COUNT(*) 
		FROM orders 
		WHERE company_id = $1 AND status IN ('confirmed', 'completed', 'rejected')
		`, companyID).Scan(&stats.TotalSales)

		if err != nil {
			log.Printf("❌ GetCompanyStats: Failed to get total sales: %v", err)
			stats.TotalSales = 0
		}

		// Получаем средний рейтинг компании
		var avgRating float64
		var ratingCount int
		err = db.QueryRow(`
			SELECT COALESCE(AVG(rating), 0), COUNT(*) 
			FROM company_ratings 
			WHERE company_id = $1
		`, companyID).Scan(&avgRating, &ratingCount)

		if err != nil {
			log.Printf("❌ GetCompanyStats: Failed to get rating: %v", err)
			avgRating = 0
			ratingCount = 0
		}

		log.Printf("✅ GetCompanyStats: Company %s has %d views, %d subscribers, %d products, %d sales, rating %.2f (%d)",
			companyID, stats.Views, stats.Subscribers, stats.TotalProducts, stats.TotalSales, avgRating, ratingCount)
		c.JSON(http.StatusOK, gin.H{
			"views":               stats.Views,
			"subscribers":         stats.Subscribers,
			"total_products":      stats.TotalProducts,
			"total_sales":         stats.TotalSales,
			"employeeExpenses":    stats.EmployeeExpenses,
			"electricityExpenses": stats.ElectricityExpenses,
			"purchaseCosts":       stats.PurchaseCosts,
			"averageRating":       avgRating,
			"ratingCount":         ratingCount,
		})
	}
}

// Subscribe to Company
func SubscribeToCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		var req struct {
			UserPhone string `json:"userPhone"`
		}

		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		// Вставляем подписку (игнорируем если уже есть)
		_, err := db.Exec(`
			INSERT INTO company_subscribers (company_id, user_phone, subscribed_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (company_id, user_phone) DO NOTHING
		`, companyID, req.UserPhone)

		if err != nil {
			log.Printf("❌ SubscribeToCompany: Failed to subscribe: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
			return
		}

		log.Printf("✅ SubscribeToCompany: User %s subscribed to company %s", req.UserPhone, companyID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Unsubscribe from Company
func UnsubscribeFromCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		var req struct {
			UserPhone string `json:"userPhone"`
		}

		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		// Удаляем подписку
		_, err := db.Exec(`
			DELETE FROM company_subscribers 
			WHERE company_id = $1 AND user_phone = $2
		`, companyID, req.UserPhone)

		if err != nil {
			log.Printf("❌ UnsubscribeFromCompany: Failed to unsubscribe: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsubscribe"})
			return
		}

		log.Printf("✅ UnsubscribeFromCompany: User %s unsubscribed from company %s", req.UserPhone, companyID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Update Company Expenses
func UpdateCompanyExpenses(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		var req struct {
			EmployeeExpenses    float64 `json:"employeeExpenses"`
			ElectricityExpenses float64 `json:"electricityExpenses"`
			PurchaseCosts       float64 `json:"purchaseCosts"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ UpdateCompanyExpenses: Invalid request body: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		_, err := db.Exec(`
			UPDATE companies 
			SET updated_at = NOW()
			WHERE id = $1
		`, companyID)

		if err != nil {
			log.Printf("❌ UpdateCompanyExpenses: Failed to update expenses: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update expenses"})
			return
		}

		log.Printf("✅ UpdateCompanyExpenses: Updated expenses for company %s", companyID)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// UploadCompanyLogo - загружает логотип компании
func UploadCompanyLogo(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		file, err := c.FormFile("file")
		if err != nil {
			log.Printf("❌ UploadCompanyLogo: Failed to get file: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
			return
		}

		// Generate unique filename
		ext := filepath.Ext(file.Filename)
		newFilename := fmt.Sprintf("company_%s_logo_%d%s", companyID, time.Now().Unix(), ext)
		uploadPath := filepath.Join("uploads", "logos", newFilename)

		// Ensure directory exists
		if err := os.MkdirAll(filepath.Dir(uploadPath), 0755); err != nil {
			log.Printf("❌ UploadCompanyLogo: Failed to create directory: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
			return
		}

		// Save file
		if err := c.SaveUploadedFile(file, uploadPath); err != nil {
			log.Printf("❌ UploadCompanyLogo: Failed to save file: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}

		// Generate URL
		logoURL := fmt.Sprintf("/uploads/logos/%s", newFilename)

		// Update company logo in database
		_, err = db.Exec(`
			UPDATE companies 
			SET logo_url = $1, updated_at = NOW() 
			WHERE id = $2
		`, logoURL, companyID)

		if err != nil {
			log.Printf("❌ UploadCompanyLogo: Failed to update database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update logo"})
			return
		}

		log.Printf("✅ UploadCompanyLogo: Logo uploaded for company %s: %s", companyID, logoURL)
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"logo_url": logoURL,
		})
	}
}

// 🔐 ToggleCompanyPrivacy - переключает режим компании (public/private)
// При переключении на private генерирует уникальный код (5-6 цифр)
// При переключении на public удаляет код
func ToggleCompanyPrivacy(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("id")

		var req struct {
			Mode string `json:"mode" binding:"required"` // "public" или "private"
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Mode != "public" && req.Mode != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mode must be 'public' or 'private'"})
			return
		}

		log.Printf("🔐 ToggleCompanyPrivacy: Company %s switching to %s mode", companyID, req.Mode)

		var privateCode *string
		if req.Mode == "private" {
			// Генерируем уникальный код (5-6 цифр)
			code := generatePrivateCode(db)
			privateCode = &code
			log.Printf("🔐 Generated private code: %s", code)
		}

		// Обновляем режим и код компании
		_, err := db.Exec(`
			UPDATE companies 
			SET mode = $1, private_code = $2, updated_at = NOW() 
			WHERE id = $3
		`, req.Mode, privateCode, companyID)

		if err != nil {
			log.Printf("❌ ToggleCompanyPrivacy: Failed to update company: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update company mode"})
			return
		}

		response := gin.H{
			"success": true,
			"mode":    req.Mode,
		}

		if privateCode != nil {
			response["privateCode"] = *privateCode
		}

		log.Printf("✅ ToggleCompanyPrivacy: Company %s switched to %s mode", companyID, req.Mode)
		c.JSON(http.StatusOK, response)
	}
}

// generatePrivateCode - генерирует уникальный код для приватной компании
func generatePrivateCode(db *sql.DB) string {
	rand.Seed(time.Now().UnixNano())

	for {
		// Генерируем случайное число от 10000 до 999999 (5-6 цифр)
		code := fmt.Sprintf("%d", rand.Intn(990000)+10000)

		// Проверяем уникальность
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM companies WHERE private_code = $1)", code).Scan(&exists)

		if err != nil || !exists {
			return code
		}
	}
}

// 🔍 VerifyPrivateCode - проверяет код приватной компании
func VerifyPrivateCode(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			PrivateCode string `json:"privateCode" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var companyID int64
		var companyName string
		var logoURL sql.NullString

		err := db.QueryRow(`
			SELECT id, name, logo_url 
			FROM companies 
			WHERE private_code = $1 AND mode = 'private'
		`, req.PrivateCode).Scan(&companyID, &companyName, &logoURL)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Invalid private code"})
			return
		}

		if err != nil {
			log.Printf("❌ VerifyPrivateCode: Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify code"})
			return
		}

		response := gin.H{
			"success":   true,
			"companyId": companyID,
			"name":      companyName,
		}

		if logoURL.Valid {
			response["logoUrl"] = logoURL.String
		}

		c.JSON(http.StatusOK, response)
	}
}

// RateCompany - поставить оценку компании
func RateCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyIDStr := c.Param("id")

		var req struct {
			UserPhone string `json:"user_phone" binding:"required"`
			Rating    int    `json:"rating" binding:"required,min=1,max=5"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ RateCompany: Invalid request: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
			return
		}

		log.Printf("⭐ RateCompany called for company %s by user %s (rating: %d)",
			companyIDStr, req.UserPhone, req.Rating)

		// Вставляем или обновляем оценку
		_, err := db.Exec(`
			INSERT INTO company_ratings (company_id, user_phone, rating, updated_at) 
			VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
			ON CONFLICT (company_id, user_phone) 
			DO UPDATE SET rating = $3, updated_at = CURRENT_TIMESTAMP
		`, companyIDStr, req.UserPhone, req.Rating)

		if err != nil {
			log.Printf("❌ RateCompany: Failed to save rating: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save rating"})
			return
		}

		// Получаем обновленный средний рейтинг
		var avgRating float64
		var ratingCount int
		err = db.QueryRow(`
			SELECT COALESCE(AVG(rating), 0), COUNT(*) 
			FROM company_ratings 
			WHERE company_id = $1
		`, companyIDStr).Scan(&avgRating, &ratingCount)

		if err != nil {
			log.Printf("❌ RateCompany: Failed to get average rating: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get rating"})
			return
		}

		log.Printf("✅ RateCompany: Rating saved. New average: %.2f (%d ratings)", avgRating, ratingCount)
		c.JSON(http.StatusOK, gin.H{
			"message":      "Rating saved successfully",
			"averageRating": avgRating,
			"ratingCount":   ratingCount,
		})
	}
}
