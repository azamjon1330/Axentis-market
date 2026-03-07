package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GetProducts - возвращает список товаров с учетом приватности
func GetProducts(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("companyId")
		if companyID == "" {
			companyID = c.Query("companyId")
		}

		// 🔐 Параметры приватности
		userMode := c.Query("mode") // "public" или "private"
		privateCompanyID := c.Query("privateCompanyId") // ID приватной компании пользователя

		if userMode == "" {
			userMode = "public" // По умолчанию публичный режим
		}

		var rows *sql.Rows
		var err error

		if companyID == "" {
			// Все товары с фильтрацией по приватности
			if userMode == "private" && privateCompanyID != "" {
				// 🔒 ПРИВАТНЫЙ РЕЖИМ: показываем только товары связанной приватной компании
				log.Printf("🔒 GetProducts: Private mode for company %s", privateCompanyID)
				rows, err = db.Query(`
					SELECT p.id, p.company_id, p.name, p.quantity, p.price, p.markup_percent,
					       p.selling_price, p.markup_amount, p.barcode, p.barid, p.category, p.images,
					       p.description, p.color, p.size, p.brand, p.has_color_options, p.available_for_customers, p.sold_count, p.created_at, p.updated_at,
					       c.name as company_name
					FROM products p
					LEFT JOIN companies c ON p.company_id = c.id
					WHERE p.available_for_customers = true 
					  AND c.id = $1
					  AND c.mode = 'private'
					ORDER BY p.created_at DESC
				`, privateCompanyID)
			} else {
				// 🌐 ПУБЛИЧНЫЙ РЕЖИМ: показываем только товары публичных компаний
				log.Printf("🌐 GetProducts: Public mode")
				rows, err = db.Query(`
					SELECT p.id, p.company_id, p.name, p.quantity, p.price, p.markup_percent,
					       p.selling_price, p.markup_amount, p.barcode, p.barid, p.category, p.images,
					       p.description, p.color, p.size, p.brand, p.has_color_options, p.available_for_customers, p.sold_count, p.created_at, p.updated_at,
					       c.name as company_name
					FROM products p
					LEFT JOIN companies c ON p.company_id = c.id
					WHERE p.available_for_customers = true 
					  AND (c.mode = 'public' OR c.mode IS NULL)
					ORDER BY p.created_at DESC
				`)
			}
		} else {
			// Товары конкретной компании (для админ-панели компании)
			rows, err = db.Query(`
				SELECT id, company_id, name, quantity, price, markup_percent,
				       selling_price, markup_amount, barcode, barid, category, images,
				       description, color, size, brand, has_color_options, available_for_customers, sold_count, created_at, updated_at
				FROM products
				WHERE company_id = $1
				ORDER BY created_at DESC
			`, companyID)
		}

		if err != nil {
			log.Printf("❌ GetProducts error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch products"})
			return
		}
		defer rows.Close()

		products := make([]map[string]interface{}, 0)

		for rows.Next() {
			var p struct {
				ID                    int64
				CompanyID             int64
				Name                  string
				Quantity              int
				Price                 float64
				MarkupPercent         sql.NullFloat64
				SellingPrice          sql.NullFloat64
				MarkupAmount          sql.NullFloat64
				Barcode               sql.NullString
				Barid                 sql.NullString
				Category              sql.NullString
				Images                sql.NullString
				Description           sql.NullString
				Color                 sql.NullString
			Size                  sql.NullString
			Brand                 sql.NullString
			HasColorOptions       sql.NullBool
				AvailableForCustomers sql.NullBool
				SoldCount             sql.NullInt64
				CreatedAt             string
				UpdatedAt             string
				CompanyName           sql.NullString
			}

			var err error
			if companyID == "" {
				// С company_name
				err = rows.Scan(&p.ID, &p.CompanyID, &p.Name, &p.Quantity, &p.Price,
					&p.MarkupPercent, &p.SellingPrice, &p.MarkupAmount, &p.Barcode, &p.Barid,
					&p.Category, &p.Images, &p.Description, &p.Color, &p.Size, &p.Brand,
					&p.HasColorOptions, &p.AvailableForCustomers,
					&p.SoldCount, &p.CreatedAt, &p.UpdatedAt, &p.CompanyName)
			} else {
				// Без company_name
				err = rows.Scan(&p.ID, &p.CompanyID, &p.Name, &p.Quantity, &p.Price,
					&p.MarkupPercent, &p.SellingPrice, &p.MarkupAmount, &p.Barcode, &p.Barid,
					&p.Category, &p.Images, &p.Description, &p.Color, &p.Size, &p.Brand,
					&p.HasColorOptions, &p.AvailableForCustomers,
					&p.SoldCount, &p.CreatedAt, &p.UpdatedAt)
			}

			if err != nil {
				log.Printf("⚠️ Error scanning product: %v", err)
				continue
			}

			product := map[string]interface{}{
				"id":        p.ID,
				"companyId": p.CompanyID,
				"name":      p.Name,
				"quantity":  p.Quantity,
				"price":     p.Price,
			}

			if p.CompanyName.Valid {
				product["companyName"] = p.CompanyName.String
			}
			if p.MarkupPercent.Valid {
				product["markupPercent"] = p.MarkupPercent.Float64
			} else {
				product["markupPercent"] = 0
			}
			if p.SellingPrice.Valid {
				product["sellingPrice"] = p.SellingPrice.Float64
			} else {
				product["sellingPrice"] = p.Price
			}
			if p.MarkupAmount.Valid {
				product["markupAmount"] = p.MarkupAmount.Float64
			} else {
				product["markupAmount"] = 0
			}
			if p.Barcode.Valid {
				product["barcode"] = p.Barcode.String
			}
			if p.Barid.Valid {
				product["barid"] = p.Barid.String
			}
			if p.Category.Valid {
				product["category"] = p.Category.String
			}
			if p.Description.Valid {
				product["description"] = p.Description.String
			}
			if p.Color.Valid {
				product["color"] = p.Color.String
			}
			if p.Size.Valid {
				product["size"] = p.Size.String
			}
			if p.Brand.Valid {
				product["brand"] = p.Brand.String
			}
			if p.HasColorOptions.Valid {
				product["hasColorOptions"] = p.HasColorOptions.Bool
			} else {
				product["hasColorOptions"] = false
			}
			if p.AvailableForCustomers.Valid {
				product["availableForCustomers"] = p.AvailableForCustomers.Bool
			} else {
				product["availableForCustomers"] = true
			}
			if p.SoldCount.Valid {
				product["soldCount"] = p.SoldCount.Int64
			} else {
				product["soldCount"] = 0
			}

			// Парсим images
			if p.Images.Valid && p.Images.String != "" {
				var images []string
				if err := json.Unmarshal([]byte(p.Images.String), &images); err != nil {
					log.Printf("⚠️ Failed to parse images for product %d: %v", p.ID, err)
					product["images"] = []string{}
				} else {
					product["images"] = images
				}
			} else {
				product["images"] = []string{}
			}

			products = append(products, product)
		}

		c.JSON(http.StatusOK, products)
	}
}

// CreateProduct - создаёт новый товар
func CreateProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			CompanyID             int64   `json:"companyId"`
			Name                  string  `json:"name"`
			Quantity              int     `json:"quantity"`
			Price                 float64 `json:"price"`
			MarkupPercent         float64 `json:"markupPercent"`
			Barcode               string  `json:"barcode"`
			Barid                 string  `json:"barid"`
			Category              string  `json:"category"`
			Description           string  `json:"description"`
			Color                 string  `json:"color"`
			Size                  string  `json:"size"`
			Brand                 string  `json:"brand"`
			HasColorOptions       bool    `json:"hasColorOptions"`
			AvailableForCustomers bool    `json:"availableForCustomers"`
		}

		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 🔍 DEBUG: Логируем входящие данные
		log.Printf("🔍 CreateProduct request - CompanyID: %d, Name: %s, Price: %.2f, Category: %s, Brand: %s, Color: %s, Size: %s", 
			input.CompanyID, input.Name, input.Price, input.Category, input.Brand, input.Color, input.Size)

		if input.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Product name is required"})
			return
		}
		if input.Price < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Price cannot be negative"})
			return
		}
		
		// 🔍 Проверяем существует ли компания
		var companyExists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM companies WHERE id = $1)", input.CompanyID).Scan(&companyExists)
		if err != nil {
			log.Printf("❌ Error checking company existence: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
		if !companyExists {
			log.Printf("❌ Company ID %d does not exist in database!", input.CompanyID)
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Company with ID %d does not exist", input.CompanyID)})
			return
		}

		// Вставляем товар в БД
		// selling_price и markup_amount генерируются автоматически (GENERATED ALWAYS)
		var productID int64
	err = db.QueryRow(`
		INSERT INTO products (
			company_id, name, quantity, price, markup_percent, 
			barcode, barid, category,
			description, color, size, brand, has_color_options, available_for_customers, images
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, '[]')
		RETURNING id
	`, input.CompanyID, input.Name, input.Quantity, input.Price, input.MarkupPercent,
		input.Barcode, input.Barid, input.Category,
		input.Description, input.Color, input.Size, input.Brand, input.HasColorOptions, input.AvailableForCustomers).Scan(&productID)

	if err != nil {
		log.Printf("❌ CreateProduct DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create product"})
		return
	}

	log.Printf("✅ Product created: ID=%d, Name=%s, CompanyID=%d", productID, input.Name, input.CompanyID)

	// Create notifications for all subscribers of this company
	if input.AvailableForCustomers {
		go func(companyID, productID int64, productName string) {
			// Get company name for notification
			var companyName string
			err := db.QueryRow("SELECT name FROM companies WHERE id = $1", companyID).Scan(&companyName)
			if err != nil {
				log.Printf("⚠️ Failed to get company name for notifications: %v", err)
				return
			}
			
			// Send notifications to all subscribers
			if err := CreateNotificationForSubscribers(db, companyID, productID, productName, companyName); err != nil {
				log.Printf("⚠️ Failed to send notifications: %v", err)
			}
		}(input.CompanyID, productID, input.Name)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"id":      productID,
		"message": "Product created successfully",
	})
	}
}

// UpdateProduct - обновляет товар
func UpdateProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID := c.Param("id")
		
		var input struct {
			Name                  *string  `json:"name"`
			Quantity              *int     `json:"quantity"`
			Price                 *float64 `json:"price"`
			MarkupPercent         *float64 `json:"markupPercent"`
			Barcode               *string  `json:"barcode"`
			Barid                 *string  `json:"barid"`
			Category              *string  `json:"category"`
			Description           *string  `json:"description"`
			Color                 *string  `json:"color"`
			Size                  *string  `json:"size"`
			Brand                 *string  `json:"brand"`
			HasColorOptions       *bool    `json:"hasColorOptions"`
			AvailableForCustomers *bool    `json:"availableForCustomers"`
		}

		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var current struct {
			Name                  string
			Quantity              int
			Price                 float64
			MarkupPercent         float64
			Barcode               sql.NullString
			Barid                 sql.NullString
			Category              sql.NullString
			Description           sql.NullString
			Color                 sql.NullString
			Size                  sql.NullString
			Brand                 sql.NullString
			HasColorOptions       bool
			AvailableForCustomers bool
		}

		err := db.QueryRow(`
			SELECT name, quantity, price, markup_percent, barcode, barid, category, 
		       description, color, size, brand, has_color_options, available_for_customers
		FROM products WHERE id = $1
	`, productID).Scan(
		&current.Name, &current.Quantity, &current.Price, &current.MarkupPercent,
		&current.Barcode, &current.Barid, &current.Category, &current.Description,
		&current.Color, &current.Size, &current.Brand,
		&current.HasColorOptions, &current.AvailableForCustomers)

	if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}
		if err != nil {
			log.Printf("❌ UpdateProduct: Failed to get current product: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get product"})
			return
		}

		// Применяем изменения только для заданных полей
		name := current.Name
		if input.Name != nil {
			name = *input.Name
		}
		quantity := current.Quantity
		if input.Quantity != nil {
			quantity = *input.Quantity
		}
		price := current.Price
		if input.Price != nil {
			price = *input.Price
		}
		markupPercent := current.MarkupPercent
		if input.MarkupPercent != nil {
			markupPercent = *input.MarkupPercent
		}
		barcode := current.Barcode.String
		if input.Barcode != nil {
			barcode = *input.Barcode
		}
		barid := current.Barid.String
		if input.Barid != nil {
			barid = *input.Barid
		}
		category := current.Category.String
		if input.Category != nil {
			category = *input.Category
		}
		description := current.Description.String
		if input.Description != nil {
			description = *input.Description
		}
		color := current.Color.String
		if input.Color != nil {
			color = *input.Color
		}
		size := current.Size.String
		if input.Size != nil {
			size = *input.Size
		}
		brand := current.Brand.String
		if input.Brand != nil {
			brand = *input.Brand
		}
		hasColorOptions := current.HasColorOptions
		if input.HasColorOptions != nil {
			hasColorOptions = *input.HasColorOptions
		}
		availableForCustomers := current.AvailableForCustomers
		if input.AvailableForCustomers != nil {
			availableForCustomers = *input.AvailableForCustomers
		}

		// Обновляем товар
		_, err = db.Exec(`
			UPDATE products
			SET name = $1, quantity = $2, price = $3, markup_percent = $4,
			    barcode = $5, barid = $6, category = $7, description = $8,
			    color = $9, size = $10, brand = $11,
			    has_color_options = $12, available_for_customers = $13, updated_at = NOW()
			WHERE id = $14
		`, name, quantity, price, markupPercent,
		barcode, barid, category, description,
		color, size, brand,
		hasColorOptions, availableForCustomers, productID)

	if err != nil {
		log.Printf("❌ UpdateProduct DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update product"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Product updated successfully",
	})
	}
}

// DeleteProduct - удаляет товар
func DeleteProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID := c.Param("id")

		result, err := db.Exec("DELETE FROM products WHERE id = $1", productID)
		if err != nil {
			log.Printf("❌ DeleteProduct DB error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete product"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}

		log.Printf("✅ Product deleted: ID=%s", productID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Product deleted successfully",
		})
	}
}

// UploadProductImages - загружает изображения товара
func UploadProductImages(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID := c.Param("id")
		
		// Получаем multipart form
		form, err := c.MultipartForm()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid form data"})
			return
		}
		
		files := form.File["files"]
		if len(files) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No files provided"})
			return
		}
		
		// Создаем директорию uploads если её нет
		uploadsDir := "./uploads"
		if err := os.MkdirAll(uploadsDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create uploads directory"})
			return
		}
		
		// Получаем текущие изображения товара
		var currentImagesJSON sql.NullString
		err = db.QueryRow("SELECT images FROM products WHERE id = $1", productID).Scan(&currentImagesJSON)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}
		
		var currentImages []string
		if currentImagesJSON.Valid && currentImagesJSON.String != "" {
			json.Unmarshal([]byte(currentImagesJSON.String), &currentImages)
		}
		
		// Загружаем новые файлы
		var uploadedPaths []string
		for _, file := range files {
			// Генерируем уникальное имя файла
			ext := filepath.Ext(file.Filename)
			filename := fmt.Sprintf("product_%s_%d%s", productID, time.Now().UnixNano(), ext)
			filePath := fmt.Sprintf("uploads/%s", filename)
			
			// Сохраняем файл
			dst := fmt.Sprintf("./uploads/%s", filename)
			if err := c.SaveUploadedFile(file, dst); err != nil {
				log.Printf("Failed to save file %s: %v", filename, err)
				continue
			}
			
			uploadedPaths = append(uploadedPaths, filePath)
		}
		
		// Объединяем старые и новые изображения
		allImages := append(currentImages, uploadedPaths...)
		
		// Ограничиваем до 6 изображений
		if len(allImages) > 6 {
			allImages = allImages[:6]
		}
		
		// Сохраняем в базу
		imagesJSON, _ := json.Marshal(allImages)
		_, err = db.Exec("UPDATE products SET images = $1 WHERE id = $2", string(imagesJSON), productID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update product images"})
			return
		}
		
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("Uploaded %d images", len(uploadedPaths)),
			"images":  allImages,
		})
	}
}

// DeleteProductImage - удаляет изображение товара
func DeleteProductImage(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID := c.Param("id")
		
		var req struct {
			Filepath string `json:"filepath"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}
		
		// Получаем текущие изображения
		var imagesJSON sql.NullString
		err := db.QueryRow("SELECT images FROM products WHERE id = $1", productID).Scan(&imagesJSON)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}
		
		var images []string
		if imagesJSON.Valid && imagesJSON.String != "" {
			json.Unmarshal([]byte(imagesJSON.String), &images)
		}
		
		// Удаляем указанное изображение из массива
		newImages := []string{}
		for _, img := range images {
			if img != req.Filepath {
				newImages = append(newImages, img)
			}
		}
		
		// Удаляем файл с диска
		if strings.HasPrefix(req.Filepath, "uploads/") {
			filename := strings.TrimPrefix(req.Filepath, "uploads/")
			os.Remove(fmt.Sprintf("./uploads/%s", filename))
		} else if strings.HasPrefix(req.Filepath, "/uploads/") {
			// Поддержка старого формата
			filename := strings.TrimPrefix(req.Filepath, "/uploads/")
			os.Remove(fmt.Sprintf("./uploads/%s", filename))
		}
		
		// Обновляем базу
		updatedJSON, _ := json.Marshal(newImages)
		_, err = db.Exec("UPDATE products SET images = $1 WHERE id = $2", string(updatedJSON), productID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update product"})
			return
		}
		
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Image deleted",
			"images":  newImages,
		})
	}
}

// GetSimilarProducts - получение похожих товаров по ключевым словам из названия
func GetSimilarProducts(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
			return
		}

		limit := 10 // Ограничиваем количество похожих товаров
		if limitParam := c.Query("limit"); limitParam != "" {
			if parsedLimit, err := strconv.Atoi(limitParam); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}

		// Получаем текущий товар
		var currentProduct struct {
			ID          int64
			Name        string
			CompanyID   int64
			CategoryStr sql.NullString
		}

		err = db.QueryRow(`
			SELECT id, name, company_id, category
			FROM products
			WHERE id = $1
		`, productID).Scan(&currentProduct.ID, &currentProduct.Name, &currentProduct.CompanyID, &currentProduct.CategoryStr)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}
		if err != nil {
			log.Printf("❌ GetSimilarProducts: Failed to get current product: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product"})
			return
		}

		// Извлекаем ключевые слова из названия (разбиваем по пробелам, берем слова длиннее 3 символов)
		words := strings.Fields(strings.ToLower(currentProduct.Name))
		keywords := []string{}
		for _, word := range words {
			// Убираем знаки препинания
			cleanWord := strings.TrimFunc(word, func(r rune) bool {
				return !((r >= 'a' && r <= 'z') || (r >= 'а' && r <= 'я') || (r >= '0' && r <= '9'))
			})
			if len(cleanWord) >= 3 {
				keywords = append(keywords, cleanWord)
			}
		}

		if len(keywords) == 0 {
			c.JSON(http.StatusOK, []map[string]interface{}{})
			return
		}

		// Строим SQL запрос для поиска похожих товаров
		// Используем LIKE для поиска по ключевым словам
		conditions := []string{}
		args := []interface{}{productID}
		argIndex := 2

		for _, keyword := range keywords {
			conditions = append(conditions, fmt.Sprintf("LOWER(p.name) LIKE $%d", argIndex))
			args = append(args, "%"+keyword+"%")
			argIndex++
		}

		whereClause := strings.Join(conditions, " OR ")

		query := fmt.Sprintf(`
			SELECT 
				p.id, p.company_id, p.name, p.quantity, p.price, p.markup_percent,
				p.selling_price, p.markup_amount, p.barcode, p.barid, p.category, p.images,
				p.description, p.color, p.size, p.brand, p.has_color_options, p.available_for_customers, p.sold_count, 
				p.created_at, p.updated_at,
				c.name as company_name
			FROM products p
			LEFT JOIN companies c ON p.company_id = c.id
			WHERE p.id != $1 
			  AND p.available_for_customers = true
			  AND (%s)
			ORDER BY 
				CASE WHEN p.category = $%d THEN 1 ELSE 2 END,
				p.sold_count DESC,
				p.created_at DESC
			LIMIT $%d
		`, whereClause, argIndex, argIndex+1)

		// Добавляем категорию и лимит в аргументы
		categoryValue := ""
		if currentProduct.CategoryStr.Valid {
			categoryValue = currentProduct.CategoryStr.String
		}
		args = append(args, categoryValue, limit)

		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("❌ GetSimilarProducts query error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch similar products"})
			return
		}
		defer rows.Close()

		products := make([]map[string]interface{}, 0)

		for rows.Next() {
			var p struct {
				ID                    int64
				CompanyID             int64
				Name                  string
				Quantity              int
				Price                 float64
				MarkupPercent         sql.NullFloat64
				SellingPrice          sql.NullFloat64
				MarkupAmount          sql.NullFloat64
				Barcode               sql.NullString
				Barid                 sql.NullString
				Category              sql.NullString
				Images                sql.NullString
				Description           sql.NullString
				Color                 sql.NullString
				Size                  sql.NullString
				Brand                 sql.NullString
				HasColorOptions       sql.NullBool
				AvailableForCustomers sql.NullBool
				SoldCount             sql.NullInt64
				CreatedAt             string
				UpdatedAt             string
				CompanyName           sql.NullString
			}

			err := rows.Scan(&p.ID, &p.CompanyID, &p.Name, &p.Quantity, &p.Price,
				&p.MarkupPercent, &p.SellingPrice, &p.MarkupAmount, &p.Barcode, &p.Barid,
				&p.Category, &p.Images, &p.Description, &p.Color, &p.Size, &p.Brand,
				&p.HasColorOptions, &p.AvailableForCustomers,
				&p.SoldCount, &p.CreatedAt, &p.UpdatedAt, &p.CompanyName)
			if err != nil {
				log.Printf("⚠️ Error scanning similar product: %v", err)
				continue
			}

			product := map[string]interface{}{
				"id":        p.ID,
				"companyId": p.CompanyID,
				"name":      p.Name,
				"quantity":  p.Quantity,
				"price":     p.Price,
			}

			if p.MarkupPercent.Valid {
				product["markupPercent"] = p.MarkupPercent.Float64
			} else {
				product["markupPercent"] = 0
			}
			if p.SellingPrice.Valid {
				product["sellingPrice"] = p.SellingPrice.Float64
			} else {
				product["sellingPrice"] = p.Price
			}
			if p.MarkupAmount.Valid {
				product["markupAmount"] = p.MarkupAmount.Float64
			} else {
				product["markupAmount"] = 0
			}
			if p.Barcode.Valid {
				product["barcode"] = p.Barcode.String
			}
			if p.Barid.Valid {
				product["barid"] = p.Barid.String
			}
			if p.Category.Valid {
				product["category"] = p.Category.String
			}
			if p.Description.Valid {
				product["description"] = p.Description.String
			}
			if p.Color.Valid {
				product["color"] = p.Color.String
			}
			if p.Size.Valid {
				product["size"] = p.Size.String
			}
			if p.Brand.Valid {
				product["brand"] = p.Brand.String
			}
			if p.HasColorOptions.Valid {
				product["hasColorOptions"] = p.HasColorOptions.Bool
			} else {
				product["hasColorOptions"] = false
			}
			if p.AvailableForCustomers.Valid {
				product["availableForCustomers"] = p.AvailableForCustomers.Bool
			} else {
				product["availableForCustomers"] = true
			}
			if p.SoldCount.Valid {
				product["soldCount"] = p.SoldCount.Int64
			} else {
				product["soldCount"] = 0
			}

			// Парсим images
			if p.Images.Valid && p.Images.String != "" {
				var images []string
				if err := json.Unmarshal([]byte(p.Images.String), &images); err != nil {
					log.Printf("⚠️ Failed to parse images for product %d: %v", p.ID, err)
					product["images"] = []string{}
				} else {
					product["images"] = images
				}
			} else {
				product["images"] = []string{}
			}

			products = append(products, product)
		}

		c.JSON(http.StatusOK, products)
	}
}
