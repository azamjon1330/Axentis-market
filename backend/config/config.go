package config

import "os"

type Config struct {
	Port          string
	GinMode       string
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	DBSSLMode     string
	JWTSecret     string
	JWTExpiration string
	AllowedOrigins string
}

func Load() *Config {
	return &Config{
		Port:          getEnv("PORT", "3000"),
		GinMode:       getEnv("GIN_MODE", "debug"),
		DBHost:        getEnv("DB_HOST", "localhost"),
		DBPort:        getEnv("DB_PORT", "5432"),
		DBUser:        getEnv("DB_USER", "azaton_user"),
		DBPassword:    getEnv("DB_PASSWORD", "your_secure_password_here"),
		DBName:        getEnv("DB_NAME", "azaton"),
		DBSSLMode:     getEnv("DB_SSLMODE", "disable"),
		JWTSecret:     getEnv("JWT_SECRET", "your_jwt_secret"),
		JWTExpiration: getEnv("JWT_EXPIRATION", "168h"),
		AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:5173"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
