package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// SearchProducts is a typo-tolerant, relevance-ranked product search across all
// public products. It combines a substring match (ILIKE) with trigram
// similarity (pg_trgm) so small typos still find the right product, and ranks
// exact/substring matches above fuzzy ones, then by popularity (sold_count).
//
// Additive: a new endpoint that leaves the existing GetProducts listing intact.
func SearchProducts(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		q := strings.TrimSpace(c.Query("q"))
		if q == "" {
			c.JSON(http.StatusOK, []interface{}{})
			return
		}
		limit := 30
		if l := c.Query("limit"); l != "" {
			if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
				limit = v
			}
		}

		rows, err := db.Query(`
			SELECT p.id, p.company_id, p.name, p.quantity,
			       COALESCE(
			           NULLIF((SELECT MIN(pv.selling_price) FROM product_variants pv WHERE pv.product_id = p.id AND pv.selling_price > 0), 0),
			           NULLIF(p.selling_price, 0),
			           p.price * (1.0 + COALESCE(p.markup_percent, 0) / 100.0)
			       ) AS selling_price,
			       p.images, p.category, p.brand, COALESCE(p.sold_count, 0), p.created_at,
			       c.name AS company_name,
			       GREATEST(
			           word_similarity($1, p.name),
			           CASE WHEN p.name ILIKE '%' || $1 || '%' THEN 0.95 ELSE 0 END,
			           CASE WHEN COALESCE(p.category, '') ILIKE '%' || $1 || '%' THEN 0.6 ELSE 0 END,
			           CASE WHEN COALESCE(p.brand, '') ILIKE '%' || $1 || '%' THEN 0.6 ELSE 0 END
			       ) AS rank
			FROM products p
			LEFT JOIN companies c ON p.company_id = c.id
			WHERE p.available_for_customers = TRUE
			  AND (c.mode = 'public' OR c.mode IS NULL)
			  AND p.name NOT LIKE '__CATEGORY_MARKER__%'
			  AND (
			        p.name ILIKE '%' || $1 || '%'
			     OR word_similarity($1, p.name) > 0.3
			     OR COALESCE(p.category, '') ILIKE '%' || $1 || '%'
			     OR COALESCE(p.brand, '') ILIKE '%' || $1 || '%'
			  )
			ORDER BY rank DESC, sold_count DESC
			LIMIT $2
		`, q, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
			return
		}
		defer rows.Close()

		results := make([]gin.H, 0)
		for rows.Next() {
			var (
				id, companyID int64
				name          string
				quantity      int
				selling       sql.NullFloat64
				images        sql.NullString
				category      sql.NullString
				brand         sql.NullString
				soldCount     int
				createdAt     string
				companyName   sql.NullString
				rank          float64
			)
			if err := rows.Scan(&id, &companyID, &name, &quantity, &selling, &images,
				&category, &brand, &soldCount, &createdAt, &companyName, &rank); err != nil {
				continue
			}
			results = append(results, gin.H{
				"id":          id,
				"company_id":  companyID,
				"name":        name,
				"quantity":    quantity,
				"price":       selling.Float64,
				"images":      images.String,
				"category":    category.String,
				"brand":       brand.String,
				"sold_count":  soldCount,
				"created_at":  createdAt,
				"companyName": companyName.String,
			})
		}
		c.JSON(http.StatusOK, results)
	}
}

// GetCompanyQuestions lists product questions for a whole company (for the
// seller's "answer questions" panel). ?unanswered=true filters to open ones.
func GetCompanyQuestions(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		companyID := c.Param("companyId")
		onlyUnanswered := c.Query("unanswered") == "true"

		query := `
			SELECT q.id, q.product_id, p.name, COALESCE(q.user_name, ''), q.question,
			       COALESCE(q.answer, ''), q.is_answered, q.created_at
			FROM product_questions q
			LEFT JOIN products p ON q.product_id = p.id
			WHERE q.company_id = $1`
		if onlyUnanswered {
			query += ` AND q.is_answered = FALSE`
		}
		query += ` ORDER BY q.created_at DESC LIMIT 200`

		rows, err := db.Query(query, companyID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch questions"})
			return
		}
		defer rows.Close()

		list := make([]gin.H, 0)
		for rows.Next() {
			var (
				id, productID int64
				productName   sql.NullString
				userName      string
				question      string
				answer        string
				isAnswered    bool
				createdAt     string
			)
			if err := rows.Scan(&id, &productID, &productName, &userName, &question, &answer, &isAnswered, &createdAt); err != nil {
				continue
			}
			list = append(list, gin.H{
				"id": id, "productId": productID, "productName": productName.String,
				"userName": userName, "question": question, "answer": answer,
				"isAnswered": isAnswered, "createdAt": createdAt,
			})
		}
		c.JSON(http.StatusOK, list)
	}
}
