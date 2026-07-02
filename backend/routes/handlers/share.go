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

// writeSharePage отдаёт страницу шаринга. Логика «как у Яндекс Маркета»:
// сначала пробуем открыть установленное приложение по схеме axentis://
// (appLink); если через ~1.4с страница всё ещё видима — приложения нет,
// уходим на сайт. Боты соцсетей JS не выполняют и просто читают OG-теги.
func writeSharePage(c *gin.Context, title, description, image, redirect, appLink string) {
	page := fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s — Axentis Market</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Axentis Market">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
%s<meta name="twitter:card" content="summary_large_image">
<script>
(function () {
  var web = %q;
  var app = %q;
  // Если приложение открылось — вкладка уходит в фон и таймер отменяется.
  var t = setTimeout(function () { window.location.replace(web); }, 1400);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearTimeout(t);
  });
  window.addEventListener('pagehide', function () { clearTimeout(t); });
  if (app) {
    try { window.location.href = app; } catch (e) { /* сразу на сайт */ }
  } else {
    clearTimeout(t);
    window.location.replace(web);
  }
})();
</script>
</head>
<body style="background:#08090D;color:#9CA3AF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
Открываем Axentis Market…
</body>
</html>`,
		html.EscapeString(title), html.EscapeString(title), html.EscapeString(description),
		func() string {
			if image == "" {
				return ""
			}
			return fmt.Sprintf("<meta property=\"og:image\" content=\"%s\">\n", html.EscapeString(image))
		}(),
		redirect, appLink)
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
		writeSharePage(c, name, desc, image, redirect, "axentis://product/"+id)
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
		writeSharePage(c, name, desc, absoluteImageURL(base, logo.String), redirect, "axentis://company/"+id)
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
