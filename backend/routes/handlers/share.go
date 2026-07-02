package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Страницы шаринга: nginx проксирует https://axentis.uz/product/123 и
// /company/45 на эти обработчики. Боты соцсетей (Telegram, Instagram,
// WhatsApp) читают OG-теги и показывают карточку с фото и ценой; живой
// человек мгновенно перенаправляется на витрину (hash-роут SPA). У кого
// установлено приложение — ссылку перехватывают App Links, и открывается
// приложение, до браузера дело не доходит.

func shareBaseURL(c *gin.Context) string {
	host := c.Request.Host
	if host == "" {
		host = "axentis.uz"
	}
	return "https://" + host
}

// absoluteImageURL превращает относительный путь /uploads/… в абсолютный URL.
func absoluteImageURL(base, path string) string {
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http") {
		return path
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return base + path
}

func writeSharePage(c *gin.Context, title, description, image, redirect string) {
	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>%s — Axentis Market</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Axentis Market">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
%s<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=%s">
<script>window.location.replace(%q);</script>
</head>
<body>Открываем Axentis Market…</body>
</html>`,
		html.EscapeString(title), html.EscapeString(title), html.EscapeString(description),
		func() string {
			if image == "" {
				return ""
			}
			return fmt.Sprintf("<meta property=\"og:image\" content=\"%s\">\n", html.EscapeString(image))
		}(),
		html.EscapeString(redirect), redirect)
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(page))
}

// ShareProduct — GET /share/product/:id
func ShareProduct(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		base := shareBaseURL(c)
		redirect := base + "/#product-" + id

		var name string
		var imagesJSON sql.NullString
		var price sql.NullFloat64
		var companyName sql.NullString
		err := db.QueryRow(`
			SELECT p.name, p.images::text,
			       COALESCE(NULLIF(p.selling_price, 0), p.price * (1.0 + COALESCE(p.markup_percent, 0) / 100.0)),
			       c.name
			FROM products p LEFT JOIN companies c ON c.id = p.company_id
			WHERE p.id = $1
		`, id).Scan(&name, &imagesJSON, &price, &companyName)
		if err != nil {
			c.Redirect(http.StatusFound, redirect)
			return
		}

		image := ""
		if imagesJSON.Valid {
			var imgs []string
			if json.Unmarshal([]byte(imagesJSON.String), &imgs) == nil && len(imgs) > 0 {
				image = absoluteImageURL(base, imgs[0])
			}
		}
		desc := fmt.Sprintf("%s сум", formatShareNumber(price.Float64))
		if companyName.Valid && companyName.String != "" {
			desc += " · " + companyName.String
		}
		writeSharePage(c, name, desc, image, redirect)
	}
}

// ShareCompany — GET /share/company/:id
func ShareCompany(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		base := shareBaseURL(c)
		redirect := base + "/#company-" + id

		var name string
		var logo, description sql.NullString
		err := db.QueryRow(`
			SELECT name, logo_url, description FROM companies WHERE id = $1
		`, id).Scan(&name, &logo, &description)
		if err != nil {
			c.Redirect(http.StatusFound, redirect)
			return
		}

		desc := "Магазин на Axentis Market"
		if description.Valid && description.String != "" {
			desc = description.String
		}
		writeSharePage(c, name, desc, absoluteImageURL(base, logo.String), redirect)
	}
}

// formatShareNumber — 1234567.0 → «1 234 567» для описания в OG-карточке.
func formatShareNumber(n float64) string {
	s := fmt.Sprintf("%.0f", n)
	out := ""
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out += " "
		}
		out += string(ch)
	}
	return out
}
