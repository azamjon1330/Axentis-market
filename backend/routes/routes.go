package routes

import (
	"azaton-backend/config"
	"azaton-backend/routes/handlers"
	"database/sql"
	"strings"

	"github.com/gin-gonic/gin"
)

func Setup(router *gin.Engine, db *sql.DB, cfg *config.Config) {
	// CORS middleware
	router.Use(func(c *gin.Context) {
		origins := strings.Split(cfg.AllowedOrigins, ",")
		origin := c.Request.Header.Get("Origin")
		
		for _, o := range origins {
			if o == origin {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}
		
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Serve static files from uploads directory
	router.Static("/uploads", "./uploads")

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	api := router.Group("/api")
	{
		// Auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/register/user", handlers.RegisterUser(db))
			auth.POST("/login/user", handlers.LoginUser(db))
			auth.POST("/register/company", handlers.RegisterCompany(db, cfg))
			auth.POST("/login/company", handlers.LoginCompany(db, cfg))
		}

		// Products routes
		products := api.Group("/products")
		{
			products.GET("", handlers.GetProducts(db)) // Все товары или с query param companyId
			products.POST("", handlers.CreateProduct(db))
			products.PUT("/:id", handlers.UpdateProduct(db))
			products.DELETE("/:id", handlers.DeleteProduct(db))
			products.POST("/:id/images", handlers.UploadProductImages(db))
			products.DELETE("/:id/images", handlers.DeleteProductImage(db))
			products.GET("/:id/reviews", handlers.GetProductReviews(db))
			products.GET("/:id/review-stats", handlers.GetReviewStats(db))
			products.GET("/:id/similar", handlers.GetSimilarProducts(db)) // 🔍 Похожие товары
		}

		// Reviews routes
		reviews := api.Group("/reviews")
		{
			reviews.POST("", handlers.CreateReview(db))
			reviews.POST("/:id/vote", handlers.VoteReview(db)) // 👍 Лайк/дизлайк отзыва
		}

		// Companies routes
		companies := api.Group("/companies")
		{
			companies.GET("", handlers.GetCompanies(db))
			companies.GET("/:id", handlers.GetCompany(db))
			companies.POST("/:id/verify-access", handlers.VerifyAccessKey(db))
			companies.PUT("/:id", handlers.UpdateCompany(db))
			companies.DELETE("/:id", handlers.DeleteCompany(db))
			companies.POST("/:id/view", handlers.TrackCompanyView(db))
			companies.GET("/:id/stats", handlers.GetCompanyStats(db))
			companies.POST("/:id/subscribe", handlers.SubscribeToCompany(db))
			companies.POST("/:id/unsubscribe", handlers.UnsubscribeFromCompany(db))
			companies.PUT("/:id/expenses", handlers.UpdateCompanyExpenses(db))
			companies.POST("/:id/upload-logo", handlers.UploadCompanyLogo(db))
			companies.PUT("/:id/privacy", handlers.ToggleCompanyPrivacy(db)) // 🔐 Переключение приватности
			companies.PUT("/:id/delivery", handlers.ToggleCompanyDelivery(db)) // 🚚 Переключение доставки
			companies.POST("/verify-private-code", handlers.VerifyPrivateCode(db)) // 🔍 Проверка кода
			companies.POST("/:id/rate", handlers.RateCompany(db)) // ⭐ Оценка компании
		}

		// Sales routes
		sales := api.Group("/sales")
		{
			sales.GET("", handlers.GetSales(db))
			sales.POST("", handlers.CreateSale(db))
		}

		// Cash Sales routes (для панели штрих-кода)
		cashSales := api.Group("/cash-sales")
		{
			cashSales.POST("", handlers.CreateCashSale(db))
			cashSales.GET("", handlers.GetCashSales(db))
		}

		// Orders routes
		orders := api.Group("/orders")
		{
			orders.GET("", handlers.GetOrders(db))
			orders.POST("", handlers.CreateOrder(db))
			orders.POST("/:id/confirm", handlers.ConfirmOrder(db))
			orders.PATCH("/:id", handlers.UpdateOrderStatus(db)) // For cancel/status updates
			orders.PUT("/:id/status", handlers.UpdateOrderStatus(db))
		}

		// Users routes
		users := api.Group("/users")
		{
			users.POST("/check-unique", handlers.CheckUserUnique(db))
			users.GET("/count", handlers.GetUsersCount(db))
			users.GET("/:phone", handlers.GetUserByPhone(db))
			// Old cart/likes routes removed - use /api/cart and /api/favorites instead
			users.POST("/:phone/avatar", handlers.UploadUserAvatar(db))
			users.DELETE("/:phone/avatar", handlers.DeleteUserAvatar(db))
			users.GET("/:phone/profile", handlers.GetUserProfile(db))
			users.GET("/:phone/reviews", handlers.GetUserReviews(db))
			users.GET("/:phone/stats", handlers.GetUserStats(db))
			users.POST("/:phone/subscribe", handlers.ToggleSubscription(db))
			users.GET("/:phone/subscription-status/:targetPhone", handlers.CheckSubscriptionStatus(db))
			users.POST("/:phone/increment-views", handlers.IncrementProfileViews(db))
			users.GET("/:phone/default-delivery-address", handlers.GetUserDefaultDeliveryAddress(db)) // 📍 Адрес доставки по умолчанию
		}

		// Cart routes (🛒 Новый API для корзины с БД)
		cart := api.Group("/cart")
		{
			cart.GET("/:phone", handlers.GetUserCart(db))                    // Получить корзину пользователя
			cart.GET("/:phone/count", handlers.GetCartCount(db))             // Количество товаров в корзине
			cart.POST("", handlers.AddToCart(db))                            // Добавить товар в корзину (quantity += N)
			cart.POST("/set", handlers.SetCartItemQuantity(db))              // Установить точное количество (upsert, 0=удалить)
			cart.PUT("/item/:id", handlers.UpdateCartItem(db))               // Обновить количество (по DB id)
			cart.DELETE("/item/:id", handlers.RemoveFromCart(db))            // Удалить товар из корзины (по DB id)
			cart.DELETE("/item", handlers.RemoveCartItemByProduct(db))       // Удалить товар из корзины (по phone+product_id)
			cart.DELETE("/user/:phone", handlers.ClearCart(db))              // Очистить всю корзину
		}

		// Favorites routes (❤️ Новый API для избранного с БД)
		favorites := api.Group("/favorites")
		{
			favorites.GET("/:phone", handlers.GetUserFavorites(db))          // Получить избранное пользователя
			favorites.GET("/:phone/count", handlers.GetFavoritesCount(db))   // Количество избранных
			favorites.GET("/check", handlers.CheckFavoriteStatus(db))        // Проверить статус (query: phone, product_id)
			favorites.POST("", handlers.AddToFavorites(db))                  // Добавить в избранное
			favorites.POST("/toggle", handlers.ToggleFavorite(db))           // Переключить статус (toggle)
			favorites.DELETE("", handlers.RemoveFromFavorites(db))           // Удалить из избранного
			favorites.DELETE("/user/:phone", handlers.ClearFavorites(db))    // Очистить все избранное
		}

		// Payment Cards routes
		paymentCards := api.Group("/payment-cards")
		{
			paymentCards.GET("/:phone", handlers.GetUserPaymentCards(db))
			paymentCards.POST("", handlers.AddPaymentCard(db))
			paymentCards.DELETE("/:id", handlers.DeletePaymentCard(db))
			paymentCards.PUT("/:id/default", handlers.SetDefaultCard(db))
		}

		// Notifications routes
		notifications := api.Group("/notifications")
		{
			notifications.GET("", handlers.GetUserNotifications(db))
			notifications.GET("/unread-count", handlers.GetUnreadNotificationsCount(db))
			notifications.PUT("/:id/read", handlers.MarkNotificationAsRead(db))
			notifications.PUT("/mark-all-read", handlers.MarkAllNotificationsAsRead(db))
			notifications.POST("/send", handlers.SendAdminNotification(db))      // Отправка от админа
			notifications.GET("/users-list", handlers.GetAllUsersPhones(db))     // Список пользователей
			notifications.POST("/push-token", handlers.SaveExpoPushToken(db))    // Сохранение Expo Push Token
		}

		// Company Messages routes (📨 Сообщения компаниям от админа)
		companyMessages := api.Group("/company-messages")
		{
			companyMessages.POST("/send", handlers.SendMessageToCompany(db))                         // Отправить компании
			companyMessages.POST("/send-all", handlers.SendMessageToAllCompanies(db))                // Отправить всем
			companyMessages.GET("/companies", handlers.GetAllCompaniesForMessages(db))               // Список компаний
			companyMessages.GET("/company/:companyId", handlers.GetCompanyMessages(db))              // Сообщения компании
			companyMessages.GET("/company/:companyId/count", handlers.GetCompanyMessagesCount(db))   // Кол-во непрочитанных
			companyMessages.PUT("/:id/read", handlers.MarkCompanyMessageAsRead(db))                  // Отметить как прочитано
			companyMessages.PUT("/company/:companyId/read-all", handlers.MarkAllCompanyMessagesAsRead(db)) // Все прочитано
		}

		// Expenses routes
		expenses := api.Group("/expenses")
		{
			expenses.GET("", handlers.GetExpenses(db))
			expenses.POST("", handlers.CreateExpense(db))
			expenses.DELETE("/:id", handlers.DeleteExpense(db))
		}

		// Custom Expenses routes
		customExpenses := api.Group("/custom-expenses")
		{
			customExpenses.GET("", handlers.GetCustomExpenses(db))
			customExpenses.POST("", handlers.CreateCustomExpense(db))
			customExpenses.PUT("/:id", handlers.UpdateCustomExpense(db))
			customExpenses.DELETE("/:id", handlers.DeleteCustomExpense(db))
		}

		// Product Purchases routes (📦 История закупок товаров)
		productPurchases := api.Group("/product-purchases")
		{
			productPurchases.GET("", handlers.GetProductPurchases(db))                  // Список закупок
			productPurchases.POST("", handlers.CreateProductPurchase(db))              // Создание записи о закупке
			productPurchases.GET("/stats", handlers.GetProductPurchaseStats(db))       // Статистика закупок
			productPurchases.PUT("/:id", handlers.UpdateProductPurchase(db))           // Обновление закупки
			productPurchases.DELETE("/:id", handlers.DeleteProductPurchase(db))        // Удаление закупки
		}

		// Analytics routes
		analytics := api.Group("/analytics")
		{
			analytics.GET("/company/:companyId", handlers.GetCompanyAnalytics(db))
			analytics.GET("/revenue", handlers.GetRevenueAnalytics(db))
		}

		// Admin Delivery Revenue routes (💰 Доходы админа от доставки)
		adminDeliveryRevenue := api.Group("/admin-delivery-revenue")
		{
			adminDeliveryRevenue.GET("", handlers.GetAdminDeliveryRevenue(db))         // Список доходов от доставки
			adminDeliveryRevenue.GET("/stats", handlers.GetAdminDeliveryStats(db))     // Статистика доходов
		}

		// Ads routes
		ads := api.Group("/ads")
		{
			ads.GET("", handlers.GetApprovedAds(db))
			ads.POST("", handlers.CreateAd(db))
			ads.POST("/upload-image", handlers.UploadAdImage(db)) // 🆕 Загрузка изображения
			ads.PUT("/:id/moderate", handlers.ModerateAd(db))
			ads.DELETE("/:id", handlers.DeleteAd(db))
			ads.DELETE("/company/:companyId/all", handlers.DeleteAllCompanyAds(db)) // 🆕 Удаление всех реклам компании
		}

		// Categories routes (global, managed by admin)
		categories := api.Group("/categories")
		{
			categories.GET("", gin.WrapF(handlers.GetCategories(db)))
			categories.POST("", gin.WrapF(handlers.CreateCategory(db)))
			categories.PUT("/:id", gin.WrapF(handlers.UpdateCategory(db)))
			categories.DELETE("/:id", gin.WrapF(handlers.DeleteCategory(db)))
			categories.GET("/products", gin.WrapF(handlers.GetProductsByCategory(db)))
		}

		// Discounts routes
		discounts := api.Group("/discounts")
		{
			discounts.POST("", handlers.CreateDiscount(db))                       // Создание скидки компанией
			discounts.GET("/company/:companyId", handlers.GetCompanyDiscounts(db)) // Скидки компании
			discounts.GET("/all", handlers.GetAllDiscounts(db))                   // Все скидки (админ)
			discounts.GET("/approved", handlers.GetApprovedDiscounts(db))         // Одобренные скидки (клиенты)
			discounts.PUT("/:id/status", handlers.UpdateDiscountStatus(db))       // Обновление статуса (админ)
			discounts.DELETE("/:id", handlers.DeleteDiscount(db))                 // Удаление скидки
		}

		// Aggressive Discounts routes (🔥 Агрессивные скидки для распродажи)
		aggressiveDiscounts := api.Group("/aggressive-discounts")
		{
			aggressiveDiscounts.POST("", handlers.CreateAggressiveDiscount(db))                       // Создание агрессивной скидки
			aggressiveDiscounts.GET("/company/:companyId", handlers.GetCompanyAggressiveDiscounts(db)) // Агрессивные скидки компании
			aggressiveDiscounts.GET("/approved", handlers.GetApprovedAggressiveDiscounts(db))         // Одобренные агрессивные скидки
			aggressiveDiscounts.GET("/product/:productId", handlers.GetProductAggressiveDiscount(db)) // Агрессивная скидка товара
			aggressiveDiscounts.DELETE("/:id", handlers.DeleteAggressiveDiscount(db))                // Удаление агрессивной скидки
		}

		// Referral Agents routes (👥 Реферальная система)
		referrals := api.Group("/referrals")
		{
			referrals.POST("/agents", handlers.CreateReferralAgent(db))                    // Создание агента (админ)
			referrals.POST("/agents/login", handlers.LoginReferralAgent(db))               // Вход агента
			referrals.GET("/agents", handlers.GetReferralAgents(db))                       // Список агентов (админ)
			referrals.GET("/agents/:id/stats", handlers.GetReferralAgentStats(db))         // Статистика агента
			referrals.GET("/agents/:id/analytics", handlers.GetAgentFinancialAnalytics(db)) // 💰 Финансовая аналитика агента
			referrals.PUT("/agents/:id/password", handlers.UpdateReferralAgentPassword(db)) // Смена пароля агента
			referrals.DELETE("/agents/:id", handlers.DeleteReferralAgent(db))              // Удаление агента (админ)
			referrals.GET("/agents/:id/companies", handlers.GetMyReferredCompanies(db))    // Компании агента
			referrals.GET("/validate/:code", handlers.ValidateReferralCode(db))            // Проверка кода
			referrals.PUT("/companies/:id/toggle", handlers.ToggleCompanyStatus(db))       // Включить/выключить компанию
			referrals.GET("/companies/all", handlers.GetCompaniesWithReferralInfo(db))     // Компании с реф. инфо (админ)
		}
	}
}
