package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// Upload User Avatar
func UploadUserAvatar(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")
		
		file, err := c.FormFile("avatar")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
			return
		}

		// Create uploads directory if not exists
		uploadDir := "./uploads/avatars"
		os.MkdirAll(uploadDir, 0755)

		// Generate filename
		filename := phone + filepath.Ext(file.Filename)
		savePath := filepath.Join(uploadDir, filename)

		// Save file
		if err := c.SaveUploadedFile(file, savePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}

		// Update database
		avatarURL := "/uploads/avatars/" + filename
		_, err = db.Exec(`
			INSERT INTO users (phone, avatar_url, name)
			VALUES ($1, $2, '')
			ON CONFLICT (phone) DO UPDATE SET avatar_url = $2, updated_at = NOW()
		`, phone, avatarURL)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update database"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "avatar_url": avatarURL})
	}
}

// Delete User Avatar
func DeleteUserAvatar(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		// Get current avatar URL
		var avatarURL sql.NullString
		err := db.QueryRow("SELECT avatar_url FROM users WHERE phone = $1", phone).Scan(&avatarURL)
		
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		// Delete file if exists
		if avatarURL.Valid && avatarURL.String != "" {
			filePath := "." + avatarURL.String
			os.Remove(filePath)
		}

		// Update database
		_, err = db.Exec(`UPDATE users SET avatar_url = NULL WHERE phone = $1`, phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update database"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// Get User Profile
func GetUserProfile(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Param("phone")

		var user struct {
			ID        int64          `json:"id"`
			Phone     string         `json:"phone"`
			Name      sql.NullString `json:"name"`
			AvatarURL sql.NullString `json:"avatar_url"`
			CreatedAt string         `json:"created_at"`
		}

		err := db.QueryRow(`
			SELECT id, phone, name, avatar_url, created_at 
			FROM users WHERE phone = $1
		`, phone).Scan(&user.ID, &user.Phone, &user.Name, &user.AvatarURL, &user.CreatedAt)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		response := gin.H{
			"id":         user.ID,
			"phone":      user.Phone,
			"created_at": user.CreatedAt,
		}

		if user.Name.Valid {
			response["name"] = user.Name.String
		}
		if user.AvatarURL.Valid {
			response["avatar_url"] = user.AvatarURL.String
		}

		c.JSON(http.StatusOK, response)
	}
}

// Get Users Count (for admin panel)
func GetUsersCount(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var count int64
		err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
		
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"count": count})
	}
}
