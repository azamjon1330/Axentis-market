package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GetProductVariants returns all variants for a product
func GetProductVariants(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
			return
		}

		rows, err := db.Query(`
			SELECT id, product_id, color, size, price, markup_percent,
			       selling_price, stock_quantity, barcode, sku, barid, description, created_at, updated_at
			FROM product_variants
			WHERE product_id = $1
			ORDER BY id ASC
		`, productID)
		if err != nil {
			log.Printf("❌ GetProductVariants error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch variants"})
			return
		}
		defer rows.Close()

		variants := make([]map[string]interface{}, 0)
		for rows.Next() {
			var v struct {
				ID            int64
				ProductID     int64
				Color         sql.NullString
				Size          sql.NullString
				Price         float64
				MarkupPercent sql.NullFloat64
				SellingPrice  sql.NullFloat64
				StockQuantity int
				Barcode       sql.NullString
				SKU           sql.NullString
				Barid         sql.NullString
				Description   sql.NullString
				CreatedAt     string
				UpdatedAt     string
			}
			if err := rows.Scan(
				&v.ID, &v.ProductID, &v.Color, &v.Size, &v.Price, &v.MarkupPercent,
				&v.SellingPrice, &v.StockQuantity, &v.Barcode, &v.SKU, &v.Barid,
				&v.Description, &v.CreatedAt, &v.UpdatedAt,
			); err != nil {
				log.Printf("⚠️ Error scanning variant: %v", err)
				continue
			}

			variant := map[string]interface{}{
				"id":            v.ID,
				"productId":     v.ProductID,
				"stockQuantity": v.StockQuantity,
				"price":         v.Price,
				"createdAt":     v.CreatedAt,
				"updatedAt":     v.UpdatedAt,
			}
			if v.Color.Valid {
				variant["color"] = v.Color.String
			}
			if v.Size.Valid {
				variant["size"] = v.Size.String
			}
			if v.MarkupPercent.Valid {
				variant["markupPercent"] = v.MarkupPercent.Float64
			} else {
				variant["markupPercent"] = 0
			}
			if v.SellingPrice.Valid {
				variant["sellingPrice"] = v.SellingPrice.Float64
			} else {
				variant["sellingPrice"] = v.Price
			}
			if v.Barcode.Valid {
				variant["barcode"] = v.Barcode.String
			}
			if v.SKU.Valid {
				variant["sku"] = v.SKU.String
			}
			if v.Barid.Valid {
				variant["barid"] = v.Barid.String
			}
			if v.Description.Valid {
				variant["description"] = v.Description.String
			}
			variants = append(variants, variant)
		}

		c.JSON(http.StatusOK, variants)
	}
}

// CreateProductVariant adds a new variant to a product
func CreateProductVariant(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
			return
		}

		var input struct {
			Color         string  `json:"color"`
			Size          string  `json:"size"`
			Price         float64 `json:"price"`
			MarkupPercent float64 `json:"markupPercent"`
			StockQuantity int     `json:"stockQuantity"`
			Barcode       string  `json:"barcode"`
			SKU           string  `json:"sku"`
			Barid         string  `json:"barid"`
			Description   string  `json:"description"`
		}
		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Verify product exists
		var exists bool
		if err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)", productID).Scan(&exists); err != nil || !exists {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}

		var variantID int64
		err = db.QueryRow(`
			INSERT INTO product_variants (product_id, color, size, price, markup_percent, stock_quantity, barcode, sku, barid, description)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id
		`, productID,
			nullableString(input.Color), nullableString(input.Size),
			input.Price, input.MarkupPercent, input.StockQuantity,
			nullableString(input.Barcode), nullableString(input.SKU), nullableString(input.Barid),
			nullableString(input.Description),
		).Scan(&variantID)
		if err != nil {
			log.Printf("❌ CreateProductVariant DB error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create variant"})
			return
		}

		// Keep parent product's quantity in sync (sum of all variant stock)
		syncProductQuantity(db, productID)

		log.Printf("✅ Variant created: ID=%d for product=%d", variantID, productID)
		c.JSON(http.StatusOK, gin.H{"success": true, "id": variantID})
	}
}

// UpdateProductVariant updates a single variant
func UpdateProductVariant(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
			return
		}
		variantID, err := strconv.ParseInt(c.Param("variantId"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid variant ID"})
			return
		}

		var input struct {
			Color         *string  `json:"color"`
			Size          *string  `json:"size"`
			Price         *float64 `json:"price"`
			MarkupPercent *float64 `json:"markupPercent"`
			StockQuantity *int     `json:"stockQuantity"`
			Barcode       *string  `json:"barcode"`
			SKU           *string  `json:"sku"`
			Barid         *string  `json:"barid"`
			Description   *string  `json:"description"`
		}
		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Fetch current values
		var cur struct {
			Color         sql.NullString
			Size          sql.NullString
			Price         float64
			MarkupPercent float64
			StockQuantity int
			Barcode       sql.NullString
			SKU           sql.NullString
			Barid         sql.NullString
			Description   sql.NullString
		}
		err = db.QueryRow(`
			SELECT color, size, price, markup_percent, stock_quantity, barcode, sku, barid, description
			FROM product_variants WHERE id = $1 AND product_id = $2
		`, variantID, productID).Scan(
			&cur.Color, &cur.Size, &cur.Price, &cur.MarkupPercent, &cur.StockQuantity,
			&cur.Barcode, &cur.SKU, &cur.Barid, &cur.Description,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Variant not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch variant"})
			return
		}

		// Apply patches
		color := cur.Color.String
		if input.Color != nil {
			color = *input.Color
		}
		size := cur.Size.String
		if input.Size != nil {
			size = *input.Size
		}
		price := cur.Price
		if input.Price != nil {
			price = *input.Price
		}
		markupPercent := cur.MarkupPercent
		if input.MarkupPercent != nil {
			markupPercent = *input.MarkupPercent
		}
		stockQuantity := cur.StockQuantity
		if input.StockQuantity != nil {
			stockQuantity = *input.StockQuantity
		}
		barcode := cur.Barcode.String
		if input.Barcode != nil {
			barcode = *input.Barcode
		}
		sku := cur.SKU.String
		if input.SKU != nil {
			sku = *input.SKU
		}
		barid := cur.Barid.String
		if input.Barid != nil {
			barid = *input.Barid
		}
		description := cur.Description.String
		if input.Description != nil {
			description = *input.Description
		}

		_, err = db.Exec(`
			UPDATE product_variants
			SET color = $1, size = $2, price = $3, markup_percent = $4,
			    stock_quantity = $5, barcode = $6, sku = $7, barid = $8,
			    description = $9, updated_at = NOW()
			WHERE id = $10 AND product_id = $11
		`, nullableString(color), nullableString(size), price, markupPercent,
			stockQuantity, nullableString(barcode), nullableString(sku), nullableString(barid),
			nullableString(description), variantID, productID)
		if err != nil {
			log.Printf("❌ UpdateProductVariant DB error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update variant"})
			return
		}

		syncProductQuantity(db, productID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Variant updated"})
	}
}

// DeleteProductVariant removes a variant
func DeleteProductVariant(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
			return
		}
		variantID, err := strconv.ParseInt(c.Param("variantId"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid variant ID"})
			return
		}

		result, err := db.Exec("DELETE FROM product_variants WHERE id = $1 AND product_id = $2", variantID, productID)
		if err != nil {
			log.Printf("❌ DeleteProductVariant DB error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete variant"})
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Variant not found"})
			return
		}

		syncProductQuantity(db, productID)
		log.Printf("✅ Variant deleted: ID=%d from product=%d", variantID, productID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Variant deleted"})
	}
}

// nullableString converts an empty string to nil (for nullable DB columns)
func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// syncProductQuantity updates the parent product's quantity, min price, and min selling_price from variants
func syncProductQuantity(db *sql.DB, productID int64) {
	_, err := db.Exec(`
		UPDATE products
		SET quantity      = (SELECT COALESCE(SUM(stock_quantity), 0) FROM product_variants WHERE product_id = $1),
		    price         = COALESCE((SELECT MIN(price) FROM product_variants WHERE product_id = $1 AND price > 0), price),
		    selling_price = COALESCE((SELECT MIN(selling_price) FROM product_variants WHERE product_id = $1 AND selling_price > 0), selling_price),
		    updated_at    = NOW()
		WHERE id = $1
	`, productID)
	if err != nil {
		log.Printf("⚠️ syncProductQuantity error for product %d: %v", productID, err)
	}
}
