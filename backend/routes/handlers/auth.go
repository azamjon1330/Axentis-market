package handlers

import (
	"azaton-backend/config"
	"azaton-backend/middleware"
	"database/sql"
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// generateAccessKey создает 30-значный ключ доступа из цифр
func generateAccessKey() string {
	const chars = "0123456789"
	key := make([]byte, 30)
	for i := range key {
		key[i] = chars[rand.Intn(len(chars))]
	}
	return string(key)
}

// Register User
func RegisterUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Phone       string `json:"phone" binding:"required"`
			Name        string `json:"name"`
			Surname     string `json:"surname"`
			Password    string `json:"password"`
			Mode        string `json:"mode"`
			PrivateCode string `json:"privateCode"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Mode == "" {
			req.Mode = "public"
		}
		if req.Mode != "public" && req.Mode != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mode must be 'public' or 'private'"})
			return
		}

		var privateCompanyID *int64
		if req.Mode == "private" {
			if req.PrivateCode == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Private code is required for private mode"})
				return
			}
			var companyID int64
			err := db.QueryRow(`SELECT id FROM companies WHERE private_code = $1 AND mode = 'private'`, req.PrivateCode).Scan(&companyID)
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Invalid private code"})
				return
			}
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify private code"})
				return
			}
			privateCompanyID = &companyID
		}

		// Хешируем пароль если передан
		var passwordHash *string
		if req.Password != "" {
			hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
				return
			}
			h := string(hashed)
			passwordHash = &h
		}

		fullName := req.Name
		if req.Surname != "" {
			fullName = req.Name + " " + req.Surname
		}

		var userID int64
		err := db.QueryRow(`
			INSERT INTO users (phone, name, surname, password_hash, mode, private_company_id, cart, likes, receipts)
			VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
			ON CONFLICT (phone) DO UPDATE SET
				name = EXCLUDED.name,
				surname = EXCLUDED.surname,
				password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
				mode = EXCLUDED.mode,
				private_company_id = EXCLUDED.private_company_id,
				updated_at = NOW()
			RETURNING id
		`, req.Phone, fullName, req.Surname, passwordHash, req.Mode, privateCompanyID).Scan(&userID)

		if err != nil {
			log.Printf("❌ RegisterUser: Failed to create user: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}

		response := gin.H{
			"success": true,
			"user": gin.H{
				"id":      userID,
				"phone":   req.Phone,
				"name":    fullName,
				"surname": req.Surname,
				"mode":    req.Mode,
			},
		}
		if privateCompanyID != nil {
			response["user"].(gin.H)["privateCompanyId"] = *privateCompanyID
		}
		log.Printf("✅ User registered: ID=%d, Phone=%s", userID, req.Phone)
		c.JSON(http.StatusOK, response)
	}
}

// Login User
func LoginUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Phone       string `json:"phone" binding:"required"`
			Password    string `json:"password"`
			Mode        string `json:"mode"`
			PrivateCode string `json:"privateCode"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Mode == "" {
			req.Mode = "public"
		}
		if req.Mode != "public" && req.Mode != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mode must be 'public' or 'private'"})
			return
		}

		var privateCompanyID *int64
		if req.Mode == "private" {
			if req.PrivateCode == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Private code is required for private mode"})
				return
			}
			var companyID int64
			err := db.QueryRow(`SELECT id FROM companies WHERE private_code = $1 AND mode = 'private'`, req.PrivateCode).Scan(&companyID)
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Invalid private code"})
				return
			}
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify private code"})
				return
			}
			privateCompanyID = &companyID
		}

		var userID int64
		var name, surname sql.NullString
		var existingMode string
		var passwordHash sql.NullString

		err := db.QueryRow(`
			SELECT id, name, surname, mode, password_hash
			FROM users WHERE phone = $1
		`, req.Phone).Scan(&userID, &name, &surname, &existingMode, &passwordHash)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		if err != nil {
			log.Printf("❌ LoginUser: Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка входа"})
			return
		}

		// Проверяем пароль если он есть в базе
		if passwordHash.Valid && passwordHash.String != "" && req.Password != "" {
			if err := bcrypt.CompareHashAndPassword([]byte(passwordHash.String), []byte(req.Password)); err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный пароль"})
				return
			}
		} else if passwordHash.Valid && passwordHash.String != "" && req.Password == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Введите пароль"})
			return
		}

		_, _ = db.Exec(`UPDATE users SET mode = $1, private_company_id = $2, updated_at = NOW() WHERE id = $3`,
			req.Mode, privateCompanyID, userID)

		response := gin.H{
			"success": true,
			"user": gin.H{
				"id":      userID,
				"phone":   req.Phone,
				"name":    name.String,
				"surname": surname.String,
				"mode":    req.Mode,
			},
		}
		if privateCompanyID != nil {
			response["user"].(gin.H)["privateCompanyId"] = *privateCompanyID
		}
		log.Printf("✅ User logged in: ID=%d, Phone=%s", userID, req.Phone)
		c.JSON(http.StatusOK, response)
	}
}

// Register Company
func RegisterCompany(db *sql.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Name         string `json:"name" binding:"required"`
			Phone        string `json:"phone" binding:"required"`
			Password     string `json:"password" binding:"required"`
			Mode         string `json:"mode" binding:"required"`
			Description  string `json:"description"`
			AccessKey    string `json:"accessKey"`
			ReferralCode string `json:"referralCode"` // 🆕 Реферальный код
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}

		// 🔑 Генерируем access_key если не передан
		accessKey := req.AccessKey
		if accessKey == "" {
			// Генерируем 30-значный ключ из цифр
			accessKey = generateAccessKey()
			log.Printf("🔑 Generated access_key for company: %s", accessKey)
		}

		// 🆕 Проверяем реферальный код если указан
		var referralAgentID *int64
		if req.ReferralCode != "" {
			var agentID int64
			err := db.QueryRow(`
				SELECT id FROM referral_agents 
				WHERE unique_code = $1
			`, req.ReferralCode).Scan(&agentID)
			
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid referral code"})
				return
			}
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
				return
			}
			referralAgentID = &agentID
			log.Printf("✅ Company linked to referral agent ID: %d", agentID)
		}

		// Создаем компанию с реферальной информацией
		var companyID int64
		err = db.QueryRow(`
			INSERT INTO companies (
				name, phone, password_hash, mode, description, status, access_key,
				referral_code, referral_agent_id, is_enabled
			)
			VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, true)
			RETURNING id
		`, req.Name, req.Phone, string(hashedPassword), req.Mode, req.Description, 
		   accessKey, req.ReferralCode, referralAgentID).Scan(&companyID)

		if err != nil {
			log.Println("❌ Error creating company:", err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create company", "details": err.Error()})
			return
		}

		// ✅ Активируем реферального агента если это первая компания
		if referralAgentID != nil {
			_, err = db.Exec(`
				UPDATE referral_agents 
				SET is_active = true 
				WHERE id = $1 AND is_active = false
			`, *referralAgentID)
			if err != nil {
				log.Printf("⚠️ Warning: Failed to activate referral agent: %v", err)
			} else {
				log.Printf("✅ Referral agent ID=%d activated", *referralAgentID)
			}
		}

		// 🆕 Запускаем пробный период (1 месяц)
		trialEnd := time.Now().AddDate(0, 1, 0) // +1 месяц
		_, err = db.Exec(`
			UPDATE companies 
			SET trial_started_at = CURRENT_TIMESTAMP, 
			    trial_end_date = $1
			WHERE id = $2
		`, trialEnd, companyID)
		
		if err != nil {
			log.Printf("⚠️ Warning: Failed to set trial period for company %d: %v", companyID, err)
		} else {
			log.Printf("✅ Trial period set for company %d until %s", companyID, trialEnd.Format("2006-01-02"))
		}

		// Generate JWT token
		tokenString, err := middleware.GenerateToken(cfg, companyID, req.Phone, "company")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"token":   tokenString,
			"company": gin.H{
				"id":     companyID,
				"name":   req.Name,
				"phone":  req.Phone,
				"mode":   req.Mode,
				"status": "pending",
			},
		})
	}
}

// Login Company
func LoginCompany(db *sql.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Phone        string  `json:"phone" binding:"required"`
			Password     string  `json:"password" binding:"required"`
			ReferralCode *string `json:"referralCode,omitempty"` // 👥 Опциональный реферальный код
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var company struct {
			ID              int64
			Name            string
			PasswordHash    string
			Mode            string
			Status          string
			IsEnabled       *bool
			ReferralAgentID *int64 // 👥 Существующий реферальный агент
		}

		err := db.QueryRow(`
			SELECT id, name, password_hash, mode, status, is_enabled, referral_agent_id
			FROM companies WHERE phone = $1
		`, req.Phone).Scan(&company.ID, &company.Name, &company.PasswordHash, &company.Mode, &company.Status, &company.IsEnabled, &company.ReferralAgentID)
		// Проверяем пароль - сначала plain text (для legacy паролей), потом bcrypt hash.
		// SECURITY: never log the password or the stored hash.
		passwordValid := false
		log.Printf("🔐 Login attempt - Phone: %s", req.Phone)

		// Legacy plain-text password support: if it matches, transparently
		// upgrade the stored value to a bcrypt hash so the plaintext is gone
		// after the first successful login (no action required from the user).
		if company.PasswordHash == req.Password {
			passwordValid = true
			if hashed, hErr := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost); hErr == nil {
				if _, uErr := db.Exec(`UPDATE companies SET password_hash = $1 WHERE id = $2`, string(hashed), company.ID); uErr == nil {
					log.Printf("🔒 Upgraded legacy plaintext password to bcrypt for company %d", company.ID)
				}
			}
		} else if err := bcrypt.CompareHashAndPassword([]byte(company.PasswordHash), []byte(req.Password)); err == nil {
			passwordValid = true
		}

		if !passwordValid {
			log.Println("❌ Password validation failed")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// 🚫 Проверяем, не выключена ли компания
		if company.IsEnabled != nil && !*company.IsEnabled {
			log.Printf("🚫 Company %d is disabled", company.ID)
			c.JSON(http.StatusForbidden, gin.H{"error": "Company account is disabled. Please contact administrator."})
			return
		}

		// 👥 РЕФЕРАЛЬНАЯ СИСТЕМА: Обработка реферального кода при первом логине
		if req.ReferralCode != nil && *req.ReferralCode != "" && company.ReferralAgentID == nil {
			log.Printf("👥 Processing referral code for company %d: %s", company.ID, *req.ReferralCode)
			
			// Проверяем существование реферального агента по коду
			var agentID int64
			err := db.QueryRow(`
				SELECT id FROM referral_agents 
				WHERE unique_code = $1 AND is_active = true
			`, *req.ReferralCode).Scan(&agentID)
			
			if err == nil {
				// Код валиден - сохраняем связь
				_, err = db.Exec(`
					UPDATE companies 
					SET referral_agent_id = $1, 
						referral_code = $2,
						trial_started_at = COALESCE(trial_started_at, NOW()),
						trial_end_date = COALESCE(trial_end_date, NOW() + INTERVAL '1 month')
					WHERE id = $3
				`, agentID, *req.ReferralCode, company.ID)
				
				if err != nil {
					log.Printf("⚠️ Failed to save referral link: %v", err)
				} else {
					log.Printf("✅ Company %d linked to referral agent %d", company.ID, agentID)
					company.ReferralAgentID = &agentID
				}
			} else {
				log.Printf("⚠️ Invalid referral code: %s (error: %v)", *req.ReferralCode, err)
			}
		} else if req.ReferralCode != nil && *req.ReferralCode != "" && company.ReferralAgentID != nil {
			log.Printf("ℹ️ Company %d already has referral agent %d, ignoring new code", company.ID, *company.ReferralAgentID)
		}

		// Generate JWT token
		tokenString, err := middleware.GenerateToken(cfg, company.ID, req.Phone, "company")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"token":   tokenString,
			"company": gin.H{
				"id":     company.ID,
				"name":   company.Name,
				"phone":  req.Phone,
				"mode":   company.Mode,
				"status": company.Status,
			},
		})
	}
}
