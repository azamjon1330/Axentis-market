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

// Photo-limit invariants (Requirement 12). Enforced in handlers, not SQL.
const (
	maxVariantPhotos    = 4  // ≤4 photos per variant (product_variants.photos)
	maxDefaultSetPhotos = 6  // ≤6 in the default set (products.images)
	maxProductPhotos    = 20 // ≤20 total per product (images + all variant photos)
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
			       selling_price, stock_quantity, barcode, sku, barid, description, photos, created_at, updated_at
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
				Photos        sql.NullString
				CreatedAt     string
				UpdatedAt     string
			}
			if err := rows.Scan(
				&v.ID, &v.ProductID, &v.Color, &v.Size, &v.Price, &v.MarkupPercent,
				&v.SellingPrice, &v.StockQuantity, &v.Barcode, &v.SKU, &v.Barid,
				&v.Description, &v.Photos, &v.CreatedAt, &v.UpdatedAt,
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
			// Per-variant photos (Requirement 12.1) — always an array
			photos := []string{}
			if v.Photos.Valid && v.Photos.String != "" {
				if err := json.Unmarshal([]byte(v.Photos.String), &photos); err != nil {
					photos = []string{}
				}
			}
			variant["photos"] = photos
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

// syncProductQuantity updates the parent product's quantity, price, and markup_percent from variants.
// selling_price and markup_amount in products are GENERATED ALWAYS columns — they auto-update
// when price or markup_percent changes, so they must NOT be set directly.
func syncProductQuantity(db *sql.DB, productID int64) {
	_, err := db.Exec(`
		UPDATE products
		SET quantity       = (SELECT COALESCE(SUM(stock_quantity), 0) FROM product_variants WHERE product_id = $1),
		    price          = COALESCE((SELECT MIN(price) FROM product_variants WHERE product_id = $1 AND price > 0), price),
		    markup_percent = COALESCE(
		        (SELECT markup_percent
		         FROM product_variants
		         WHERE product_id = $1 AND markup_percent > 0
		         ORDER BY price ASC
		         LIMIT 1),
		        markup_percent
		    ),
		    updated_at     = NOW()
		WHERE id = $1
	`, productID)
	if err != nil {
		log.Printf("⚠️ syncProductQuantity error for product %d: %v", productID, err)
	}
}

// countProductImages returns the number of photos in the product's default set
// (products.images, a JSON-array string column).
func countProductImages(db *sql.DB, productID int64) (int, error) {
	var imagesJSON sql.NullString
	if err := db.QueryRow(`SELECT images FROM products WHERE id = $1`, productID).Scan(&imagesJSON); err != nil {
		return 0, err
	}
	if !imagesJSON.Valid || imagesJSON.String == "" {
		return 0, nil
	}
	var images []string
	if err := json.Unmarshal([]byte(imagesJSON.String), &images); err != nil {
		return 0, nil
	}
	return len(images), nil
}

// sumVariantPhotos returns the total number of photos across all variants of a product.
func sumVariantPhotos(db *sql.DB, productID int64) (int, error) {
	var total int
	err := db.QueryRow(
		`SELECT COALESCE(SUM(jsonb_array_length(photos)), 0) FROM product_variants WHERE product_id = $1`,
		productID,
	).Scan(&total)
	return total, err
}

// checkPhotoLimits is the pure decision core for the photo-limit invariants
// (Requirement 12.1, 12.3, 12.5, 12.6). Given the photo counts already present,
// it decides whether adding `incoming` photos to a single variant is allowed:
//
//   - per-variant cap: currentVariantPhotos + incoming must stay ≤ maxVariantPhotos (4)
//   - product-total cap: defaultSetCount + otherVariantsTotal + currentVariantPhotos +
//     incoming must stay ≤ maxProductPhotos (20)
//
// where:
//   - currentVariantPhotos = photos already on the target variant
//   - defaultSetCount       = photos in the product default set (products.images)
//   - otherVariantsTotal    = photos across all OTHER variants of the product
//
// It returns a descriptive error (the exact message surfaced to the client) when a
// limit would be exceeded, and nil when the addition is allowed. Having no DB
// dependency makes the decision logic directly testable.
func checkPhotoLimits(currentVariantPhotos, defaultSetCount, otherVariantsTotal, incoming int) error {
	// 1. per-variant cap
	if currentVariantPhotos+incoming > maxVariantPhotos {
		return fmt.Errorf("variant photo limit is %d (have %d, adding %d)", maxVariantPhotos, currentVariantPhotos, incoming)
	}

	// 2. product-wide cap: len(products.images) + Σ len(variant.photos)
	productTotal := defaultSetCount + otherVariantsTotal + currentVariantPhotos
	if productTotal+incoming > maxProductPhotos {
		return fmt.Errorf("product photo limit is %d (have %d, adding %d)", maxProductPhotos, productTotal, incoming)
	}
	return nil
}

// validatePhotoLimits enforces the photo-limit invariants for adding `incoming`
// photos to a specific variant (Requirement 12.1, 12.5, 12.6):
//   - ≤4 photos per variant (product_variants.photos)
//   - ≤20 total per product (len(products.images) + Σ variant photos)
//
// It reads the current counts from the database and delegates the decision to the
// pure helper checkPhotoLimits, returning a descriptive error when a limit would be
// exceeded so the caller can reject the request with HTTP 400 and perform NO
// partial write.
func validatePhotoLimits(db *sql.DB, productID, variantID int64, incoming int) error {
	// Photos already on the target variant.
	var current int
	if err := db.QueryRow(
		`SELECT COALESCE(jsonb_array_length(photos), 0) FROM product_variants WHERE id = $1 AND product_id = $2`,
		variantID, productID,
	).Scan(&current); err != nil {
		return err
	}

	defaultSetCount, err := countProductImages(db, productID)
	if err != nil {
		return err
	}
	// sumVariantPhotos covers ALL variants (including the target); the pure helper
	// expects the OTHER variants' total separately, so subtract the current one.
	variantTotal, err := sumVariantPhotos(db, productID)
	if err != nil {
		return err
	}
	otherVariantsTotal := variantTotal - current

	return checkPhotoLimits(current, defaultSetCount, otherVariantsTotal, incoming)
}

// UploadVariantPhotos handles POST /api/products/:id/variants/:variantId/photos.
// Multipart upload using the same `files` field convention as UploadProductImages.
// Limits are validated BEFORE any file is written, so an over-limit request is
// rejected with HTTP 400 and performs no partial write (Requirement 12.6).
func UploadVariantPhotos(db *sql.DB) gin.HandlerFunc {
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

		// Verify the variant belongs to the product and fetch its current photos.
		var photosJSON sql.NullString
		err = db.QueryRow(
			`SELECT photos FROM product_variants WHERE id = $1 AND product_id = $2`,
			variantID, productID,
		).Scan(&photosJSON)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Variant not found"})
			return
		}
		if err != nil {
			log.Printf("❌ UploadVariantPhotos lookup error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch variant"})
			return
		}

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

		// Enforce limits BEFORE writing anything (no partial write on over-limit).
		if err := validatePhotoLimits(db, productID, variantID, len(files)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		uploadsDir := "./uploads"
		if err := os.MkdirAll(uploadsDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create uploads directory"})
			return
		}

		var currentPhotos []string
		if photosJSON.Valid && photosJSON.String != "" {
			json.Unmarshal([]byte(photosJSON.String), &currentPhotos)
		}

		var uploadedPaths []string
		for _, file := range files {
			ext := filepath.Ext(file.Filename)
			filename := fmt.Sprintf("variant_%d_%d%s", variantID, time.Now().UnixNano(), ext)
			filePath := fmt.Sprintf("uploads/%s", filename)
			dst := fmt.Sprintf("./uploads/%s", filename)
			if err := c.SaveUploadedFile(file, dst); err != nil {
				log.Printf("Failed to save variant photo %s: %v", filename, err)
				continue
			}
			uploadedPaths = append(uploadedPaths, filePath)
		}

		allPhotos := append(currentPhotos, uploadedPaths...)
		photosOut, _ := json.Marshal(allPhotos)
		if _, err := db.Exec(
			`UPDATE product_variants SET photos = $1, updated_at = NOW() WHERE id = $2 AND product_id = $3`,
			string(photosOut), variantID, productID,
		); err != nil {
			log.Printf("❌ UploadVariantPhotos update error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update variant photos"})
			return
		}

		log.Printf("✅ Uploaded %d photos to variant=%d (product=%d)", len(uploadedPaths), variantID, productID)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("Uploaded %d photos", len(uploadedPaths)),
			"photos":  allPhotos,
		})
	}
}

// DeleteVariantPhoto handles DELETE /api/products/:id/variants/:variantId/photos.
// Removes a single photo from the variant by URL (`url`) or by zero-based `index`.
func DeleteVariantPhoto(db *sql.DB) gin.HandlerFunc {
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

		var req struct {
			URL   string `json:"url"`
			Index *int   `json:"index"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}
		if req.URL == "" && req.Index == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Provide a photo url or index to remove"})
			return
		}

		var photosJSON sql.NullString
		err = db.QueryRow(
			`SELECT photos FROM product_variants WHERE id = $1 AND product_id = $2`,
			variantID, productID,
		).Scan(&photosJSON)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Variant not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch variant"})
			return
		}

		var photos []string
		if photosJSON.Valid && photosJSON.String != "" {
			json.Unmarshal([]byte(photosJSON.String), &photos)
		}

		// Determine which photo to remove.
		removed := ""
		newPhotos := make([]string, 0, len(photos))
		if req.Index != nil {
			idx := *req.Index
			if idx < 0 || idx >= len(photos) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Photo index out of range"})
				return
			}
			removed = photos[idx]
			for i, p := range photos {
				if i != idx {
					newPhotos = append(newPhotos, p)
				}
			}
		} else {
			found := false
			for _, p := range photos {
				if p == req.URL && !found {
					removed = p
					found = true
					continue
				}
				newPhotos = append(newPhotos, p)
			}
			if !found {
				c.JSON(http.StatusNotFound, gin.H{"error": "Photo not found in variant"})
				return
			}
		}

		photosOut, _ := json.Marshal(newPhotos)
		if _, err := db.Exec(
			`UPDATE product_variants SET photos = $1, updated_at = NOW() WHERE id = $2 AND product_id = $3`,
			string(photosOut), variantID, productID,
		); err != nil {
			log.Printf("❌ DeleteVariantPhoto update error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update variant photos"})
			return
		}

		// Best-effort removal of the file from disk.
		if removed != "" {
			trimmed := strings.TrimPrefix(strings.TrimPrefix(removed, "/"), "uploads/")
			if trimmed != removed && trimmed != "" {
				os.Remove(fmt.Sprintf("./uploads/%s", trimmed))
			}
		}

		log.Printf("✅ Removed photo from variant=%d (product=%d)", variantID, productID)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Photo removed",
			"photos":  newPhotos,
		})
	}
}

// resolveDefaultVariant is the pure decision core for setting a product's default
// variant (Requirement 18.1, 18.4). Given the currently persisted default
// (`current`), the `requested` value from the request body, and whether the
// requested variant actually belongs to the product (`requestedBelongs`), it
// returns the next value to persist and whether the request is accepted:
//
//   - requested == nil                -> (nil, true)        clear the default
//   - requested != nil && belongs      -> (requested, true)  set the default
//   - requested != nil && !belongs     -> (current, false)   reject; leave unchanged
//
// Because products.default_variant_id is a single nullable scalar column, at most
// one default is ever stored per product (Property 24); this helper only decides
// what that single value becomes. Having no DB dependency makes it directly testable.
func resolveDefaultVariant(current, requested *int64, requestedBelongs bool) (next *int64, ok bool) {
	if requested == nil {
		return nil, true // null clears the default
	}
	if requestedBelongs {
		return requested, true // set to a variant that belongs to the product
	}
	return current, false // reject: leave the existing value unchanged
}

// SetDefaultVariant handles PUT /api/products/:id/default-variant.
// Body: { "variantId": <id|null> }.
//   - A non-null variantId must belong to the product; otherwise the request is
//     rejected with HTTP 400 and products.default_variant_id is left unchanged
//     (Requirement 18.1).
//   - A null variantId clears the default (sets products.default_variant_id = NULL).
//
// The designation is persisted on products.default_variant_id (Requirement 18.4).
func SetDefaultVariant(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product ID"})
			return
		}

		// variantId is nullable: a null/omitted value clears the default.
		var input struct {
			VariantID *int64 `json:"variantId"`
		}
		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Verify the product exists.
		var productExists bool
		if err := db.QueryRow(
			`SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID,
		).Scan(&productExists); err != nil {
			log.Printf("❌ SetDefaultVariant product lookup error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch product"})
			return
		}
		if !productExists {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
			return
		}

		// Determine whether a non-null requested variant belongs to this product.
		// (For a null request this stays false and is ignored by the decision core.)
		var requestedBelongs bool
		if input.VariantID != nil {
			if err := db.QueryRow(
				`SELECT EXISTS(SELECT 1 FROM product_variants WHERE id = $1 AND product_id = $2)`,
				*input.VariantID, productID,
			).Scan(&requestedBelongs); err != nil {
				log.Printf("❌ SetDefaultVariant variant lookup error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch variant"})
				return
			}
		}

		// Pure decision core (Property 24): clear (nil), set (requested), or reject.
		// `current` is only returned on the reject path, which performs no write, so
		// passing nil is sufficient — the handler never persists the rejected value.
		next, ok := resolveDefaultVariant(nil, input.VariantID, requestedBelongs)
		if !ok {
			// Leave default_variant_id unchanged (Requirement 18.1).
			c.JSON(http.StatusBadRequest, gin.H{"error": "Variant does not belong to this product"})
			return
		}

		if next == nil {
			// Clear the default variant.
			if _, err := db.Exec(
				`UPDATE products SET default_variant_id = NULL, updated_at = NOW() WHERE id = $1`,
				productID,
			); err != nil {
				log.Printf("❌ SetDefaultVariant clear error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear default variant"})
				return
			}
			log.Printf("✅ Cleared default variant for product=%d", productID)
			c.JSON(http.StatusOK, gin.H{"success": true, "defaultVariantId": nil})
			return
		}

		// Persist the single default-variant designation (Requirement 18.4).
		if _, err := db.Exec(
			`UPDATE products SET default_variant_id = $1, updated_at = NOW() WHERE id = $2`,
			*next, productID,
		); err != nil {
			log.Printf("❌ SetDefaultVariant update error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set default variant"})
			return
		}

		log.Printf("✅ Set default variant=%d for product=%d", *next, productID)
		c.JSON(http.StatusOK, gin.H{"success": true, "defaultVariantId": *next})
	}
}
