package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

const geminiSystemPrompt = `You are a product inventory parser for an online store management system.
Parse the user's text (which may be in Russian, Uzbek, or mixed) and extract all products with their variants.

IMPORTANT RULES:
1. Each unique combination of (color + size + price + stockQuantity) = one variant
2. If a product has no variants mentioned, create one variant with the given price and quantity
3. "Некачественный"/"Сifatsiz" and "Качественный"/"Sifatli" should be used as the "size" field (they are quality tiers)
4. Numbers written as words (пятьдесят, yigirma, etc.) should be converted to digits
5. Currency words (сум, so'm, сўм) should be stripped from prices
6. If name is not clear, use a generic name like "Товар"
7. Return ONLY valid JSON, no markdown, no extra text

Return a JSON array with this exact structure:
[
  {
    "name": "product name",
    "category": "",
    "description": "",
    "variants": [
      {
        "color": "color or empty string",
        "size": "size/quality/weight/storage or empty string",
        "price": 120000,
        "markupPercent": 0,
        "stockQuantity": 20,
        "barcode": "",
        "barid": ""
      }
    ]
  }
]`

type geminiRequest struct {
	Contents []geminiContent `json:"contents"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// ParsedVariant represents a single SKU variant from AI parsing
type ParsedVariant struct {
	Color         string  `json:"color"`
	Size          string  `json:"size"`
	Price         float64 `json:"price"`
	MarkupPercent float64 `json:"markupPercent"`
	StockQuantity int     `json:"stockQuantity"`
	Barcode       string  `json:"barcode"`
	Barid         string  `json:"barid"`
}

// ParsedProduct represents a product with its variants from AI parsing
type ParsedProduct struct {
	Name        string          `json:"name"`
	Category    string          `json:"category"`
	Description string          `json:"description"`
	Variants    []ParsedVariant `json:"variants"`
}

// AIParseProducts calls Gemini Flash to parse free-text product descriptions
func AIParseProducts() gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Text string `json:"text"`
		}
		if err := c.BindJSON(&input); err != nil || strings.TrimSpace(input.Text) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
			return
		}

		apiKey := os.Getenv("GEMINI_API_KEY")
		if apiKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "GEMINI_API_KEY not configured"})
			return
		}

		prompt := geminiSystemPrompt + "\n\nUser text:\n" + input.Text

		reqBody := geminiRequest{
			Contents: []geminiContent{
				{Parts: []geminiPart{{Text: prompt}}},
			},
		}

		bodyBytes, err := json.Marshal(reqBody)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
			return
		}

		url := fmt.Sprintf(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=%s",
			apiKey,
		)

		resp, err := http.Post(url, "application/json", bytes.NewReader(bodyBytes))
		if err != nil {
			log.Printf("❌ Gemini API error: %v", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to reach Gemini API"})
			return
		}
		defer resp.Body.Close()

		respBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read Gemini response"})
			return
		}

		var geminiResp geminiResponse
		if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
			log.Printf("❌ Gemini response parse error: %v\nBody: %s", err, string(respBytes))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse Gemini response"})
			return
		}

		if geminiResp.Error != nil {
			log.Printf("❌ Gemini API error: %s", geminiResp.Error.Message)
			c.JSON(http.StatusBadGateway, gin.H{"error": geminiResp.Error.Message})
			return
		}

		if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "empty response from Gemini"})
			return
		}

		rawText := geminiResp.Candidates[0].Content.Parts[0].Text

		// Strip markdown code fences if present
		rawText = strings.TrimSpace(rawText)
		if strings.HasPrefix(rawText, "```") {
			lines := strings.Split(rawText, "\n")
			if len(lines) >= 3 {
				rawText = strings.Join(lines[1:len(lines)-1], "\n")
			}
		}

		var products []ParsedProduct
		if err := json.Unmarshal([]byte(rawText), &products); err != nil {
			log.Printf("❌ Failed to parse Gemini JSON output: %v\nRaw: %s", err, rawText)
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": "AI returned invalid JSON",
				"raw":   rawText,
			})
			return
		}

		log.Printf("✅ AI parsed %d products from text", len(products))
		c.JSON(http.StatusOK, gin.H{"products": products})
	}
}
