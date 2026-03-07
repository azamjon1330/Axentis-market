package handlers

import (
	"azaton-backend/config"
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Register User
func RegisterUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Phone       string `json:"phone" binding:"required"`
			Name        string `json:"name"`
			Mode        string `json:"mode"` // "public" или "private"
			PrivateCode string `json:"privateCode"` // Код приватной компании (если mode = "private")
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Устанавливаем mode по умолчанию на "public", если не указан
		if req.Mode == "" {
			req.Mode = "public"
		}

		// Проверяем режим
		if req.Mode != "public" && req.Mode != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mode must be 'public' or 'private'"})
			return
		}

		var privateCompanyID *int64

		// Если режим приватный, проверяем код и получаем ID компании
		if req.Mode == "private" {
			if req.PrivateCode == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Private code is required for private mode"})
				return
			}

			var companyID int64
			err := db.QueryRow(`
				SELECT id FROM companies 
				WHERE private_code = $1 AND mode = 'private'
			`, req.PrivateCode).Scan(&companyID)

			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Invalid private code"})
				return
			}

			if err != nil {
				log.Printf("❌ RegisterUser: Failed to verify private code: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify private code"})
				return
			}

			privateCompanyID = &companyID
			log.Printf("✅ User registering with private company ID: %d", companyID)
		}

		var userID int64
		err := db.QueryRow(`
			INSERT INTO users (phone, name, mode, private_company_id, cart, likes, receipts)
			VALUES ($1, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
			ON CONFLICT (phone) DO UPDATE SET 
				name = EXCLUDED.name, 
				mode = EXCLUDED.mode, 
				private_company_id = EXCLUDED.private_company_id,
				updated_at = NOW()
			RETURNING id
		`, req.Phone, req.Name, req.Mode, privateCompanyID).Scan(&userID)

		if err != nil {
			log.Printf("❌ RegisterUser: Failed to create user: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}

		response := gin.H{
			"success": true,
			"user": gin.H{
				"id":    userID,
				"phone": req.Phone,
				"name":  req.Name,
				"mode":  req.Mode,
			},
		}

		if privateCompanyID != nil {
			response["user"].(gin.H)["privateCompanyId"] = *privateCompanyID
		}

		log.Printf("✅ User registered: ID=%d, Phone=%s, Mode=%s", userID, req.Phone, req.Mode)
		c.JSON(http.StatusOK, response)
	}
}

// Login User
func LoginUser(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Phone       string `json:"phone" binding:"required"`
			Mode        string `json:"mode"` // "public" или "private"
			PrivateCode string `json:"privateCode"` // Код приватной компании (если mode = "private")
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Устанавливаем mode по умолчанию на "public", если не указан
		if req.Mode == "" {
			req.Mode = "public"
		}

		// Проверяем режим
		if req.Mode != "public" && req.Mode != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Mode must be 'public' or 'private'"})
			return
		}

		var privateCompanyID *int64

		// Если режим приватный, проверяем код и получаем ID компании
		if req.Mode == "private" {
			if req.PrivateCode == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Private code is required for private mode"})
				return
			}

			var companyID int64
			err := db.QueryRow(`
				SELECT id FROM companies 
				WHERE private_code = $1 AND mode = 'private'
			`, req.PrivateCode).Scan(&companyID)

			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Invalid private code"})
				return
			}

			if err != nil {
				log.Printf("❌ LoginUser: Failed to verify private code: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify private code"})
				return
			}

			privateCompanyID = &companyID
		}

		var userID int64
		var name sql.NullString
		var existingMode string
		var existingCompanyID sql.NullInt64

		err := db.QueryRow(`
			SELECT id, name, mode, private_company_id 
			FROM users 
			WHERE phone = $1
		`, req.Phone).Scan(&userID, &name, &existingMode, &existingCompanyID)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if err != nil {
			log.Printf("❌ LoginUser: Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to login"})
			return
		}

		// Обновляем режим и компанию пользователя при логине
		_, err = db.Exec(`
			UPDATE users 
			SET mode = $1, private_company_id = $2, updated_at = NOW() 
			WHERE id = $3
		`, req.Mode, privateCompanyID, userID)

		if err != nil {
			log.Printf("❌ LoginUser: Failed to update user mode: %v", err)
		}

		response := gin.H{
			"success": true,
			"user": gin.H{
				"id":    userID,
				"phone": req.Phone,
				"name":  name.String,
				"mode":  req.Mode,
			},
		}

		if privateCompanyID != nil {
			response["user"].(gin.H)["privateCompanyId"] = *privateCompanyID
		}

		log.Printf("✅ User logged in: ID=%d, Phone=%s, Mode=%s", userID, req.Phone, req.Mode)
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
		   req.AccessKey, req.ReferralCode, referralAgentID).Scan(&companyID)

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
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"companyId": companyID,
			"phone":     req.Phone,
			"exp":       time.Now().Add(168 * time.Hour).Unix(),
		})

		tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
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
			Phone    string `json:"phone" binding:"required"`
			Password string `json:"password" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var company struct {
			ID           int64
			Name         string
			PasswordHash string
			Mode         string
			Status       string
		IsEnabled    *bool
	}

	err := db.QueryRow(`
		SELECT id, name, password_hash, mode, status, is_enabled
		FROM companies WHERE phone = $1
	`, req.Phone).Scan(&company.ID, &company.Name, &company.PasswordHash, &company.Mode, &company.Status, &company.IsEnabled)
		// Проверяем пароль - сначала plain text (для простых паролей), потом bcrypt hash
		passwordValid := false
		log.Printf("🔐 Login attempt - Phone: %s, Input: %s, DB Hash: %s", 
			req.Phone, req.Password, company.PasswordHash)
		
		// Сначала проверяем plain text (если пароль не хешированный)
		if company.PasswordHash == req.Password {
			passwordValid = true
			log.Println("✅ Plain text password match")
		} else if err := bcrypt.CompareHashAndPassword([]byte(company.PasswordHash), []byte(req.Password)); err == nil {
			passwordValid = true
			log.Println("✅ Hashed password match")
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

		// Generate JWT token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"companyId": company.ID,
			"phone":     req.Phone,
			"exp":       time.Now().Add(168 * time.Hour).Unix(),
		})

		tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
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
