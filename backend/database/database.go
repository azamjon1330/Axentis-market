package database

import (
	"azaton-backend/config"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "github.com/lib/pq"
)

func Connect(cfg *config.Config) (*sql.DB, error) {
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBSSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	log.Println("✅ Database connected successfully")
	return db, nil
}

func Migrate(db *sql.DB) error {
	schema := `
	-- Extensions
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
	CREATE EXTENSION IF NOT EXISTS "pgcrypto";

	-- Companies table
	CREATE TABLE IF NOT EXISTS companies (
		id BIGSERIAL PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		phone VARCHAR(20) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		access_key VARCHAR(30) UNIQUE,
		mode VARCHAR(10) DEFAULT 'public' CHECK (mode IN ('public', 'private')),
		status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
		logo_url TEXT,
		address TEXT,
		description TEXT,
		latitude NUMERIC(10, 8),
		longitude NUMERIC(11, 8),
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_companies_phone ON companies(phone);
	CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
	CREATE INDEX IF NOT EXISTS idx_companies_mode ON companies(mode);
	CREATE INDEX IF NOT EXISTS idx_companies_location ON companies(latitude, longitude);

	-- Products table
	CREATE TABLE IF NOT EXISTS products (
		id BIGSERIAL PRIMARY KEY,
		company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
		price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
		markup_percent NUMERIC(5, 2) DEFAULT 0 CHECK (markup_percent >= 0),
		selling_price NUMERIC(12, 2) GENERATED ALWAYS AS (price + (price * markup_percent / 100)) STORED,
		markup_amount NUMERIC(12, 2) GENERATED ALWAYS AS (price * markup_percent / 100) STORED,
		barcode VARCHAR(100),
		barid VARCHAR(100),
		category VARCHAR(100),
		images JSONB DEFAULT '[]'::jsonb,
		has_color_options BOOLEAN DEFAULT FALSE,
		available_for_customers BOOLEAN DEFAULT TRUE,
		sold_count INTEGER DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
	CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
	CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

	-- Sales table
	CREATE TABLE IF NOT EXISTS sales (
		id BIGSERIAL PRIMARY KEY,
		company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		items JSONB NOT NULL,
		total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
		payment_method VARCHAR(20) DEFAULT 'cash',
		created_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_sales_company_id ON sales(company_id);
	CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);

	-- Orders table
	CREATE TABLE IF NOT EXISTS orders (
		id BIGSERIAL PRIMARY KEY,
		company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		customer_name VARCHAR(255) NOT NULL,
		customer_phone VARCHAR(20) NOT NULL,
		address TEXT,
		items JSONB NOT NULL,
		total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
		status VARCHAR(20) DEFAULT 'pending',
		comment TEXT,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	-- Add order_code column if it doesn't exist
	DO $$
	BEGIN
		IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
		               WHERE table_name='orders' AND column_name='order_code') THEN
			ALTER TABLE orders ADD COLUMN order_code VARCHAR(6) UNIQUE;
		END IF;
	END $$;

	CREATE INDEX IF NOT EXISTS idx_orders_company_id ON orders(company_id);
	CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
	CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);

	-- Users table (for customers)
	CREATE TABLE IF NOT EXISTS users (
		id BIGSERIAL PRIMARY KEY,
		phone VARCHAR(20) UNIQUE NOT NULL,
		name VARCHAR(255),
		cart JSONB DEFAULT '{}'::jsonb,
		likes JSONB DEFAULT '[]'::jsonb,
		receipts JSONB DEFAULT '[]'::jsonb,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	-- Add avatar_url column if it doesn't exist
	DO $$
	BEGIN
		IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
		               WHERE table_name='users' AND column_name='avatar_url') THEN
			ALTER TABLE users ADD COLUMN avatar_url TEXT;
		END IF;
	END $$;

	CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

	-- Expenses table
	CREATE TABLE IF NOT EXISTS expenses (
		id BIGSERIAL PRIMARY KEY,
		company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
		category VARCHAR(100),
		description TEXT,
		expense_date DATE DEFAULT CURRENT_DATE,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON expenses(company_id);
	CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

	-- Custom Expenses table (recurring monthly expenses with daily proration)
	CREATE TABLE IF NOT EXISTS custom_expenses (
		id BIGSERIAL PRIMARY KEY,
		company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		expense_name VARCHAR(255) NOT NULL,
		amount NUMERIC(12, 2) DEFAULT 0,
		monthly_amount NUMERIC(12, 2) DEFAULT 0,
		description TEXT,
		expense_date DATE DEFAULT CURRENT_DATE,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_custom_expenses_company_id ON custom_expenses(company_id);

	-- Add view_count to companies if not exists
	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns 
			WHERE table_name = 'companies' AND column_name = 'view_count'
		) THEN
			ALTER TABLE companies ADD COLUMN view_count INTEGER DEFAULT 0;
		END IF;
	END $$;

	-- Add sold_count to products if not exists
	DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns 
			WHERE table_name = 'products' AND column_name = 'sold_count'
		) THEN
			ALTER TABLE products ADD COLUMN sold_count INTEGER DEFAULT 0;
		END IF;
	END $$;

	-- Company subscribers table
	CREATE TABLE IF NOT EXISTS company_subscribers (
		id SERIAL PRIMARY KEY,
		company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		user_phone VARCHAR(50) NOT NULL,
		subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(company_id, user_phone)
	);

	CREATE INDEX IF NOT EXISTS idx_company_subscribers_company ON company_subscribers(company_id);
	CREATE INDEX IF NOT EXISTS idx_company_subscribers_user ON company_subscribers(user_phone);

	-- Global categories table (managed by admin)
	CREATE TABLE IF NOT EXISTS categories (
		id SERIAL PRIMARY KEY,
		name VARCHAR(100) NOT NULL UNIQUE,
		icon VARCHAR(10) DEFAULT '📦',
		description TEXT,
		is_active BOOLEAN DEFAULT true,
		sort_order INT DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
	CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

	-- Notifications table
	CREATE TABLE IF NOT EXISTS notifications (
		id BIGSERIAL PRIMARY KEY,
		user_phone VARCHAR(20) NOT NULL,
		type VARCHAR(50) NOT NULL DEFAULT 'new_product',
		title VARCHAR(255) NOT NULL,
		message TEXT,
		company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
		product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
		is_read BOOLEAN DEFAULT false,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_notifications_user_phone ON notifications(user_phone);
	CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
	CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
	`

	_, err := db.Exec(schema)
	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	log.Println("✅ Database migrations completed")

	// Run SQL migration files from migrations folder
	migrationsDir := "./migrations"
	if err := runMigrationFiles(db, migrationsDir); err != nil {
		return fmt.Errorf("failed to run migration files: %w", err)
	}

	return nil
}

// runMigrationFiles executes all .sql files in the migrations directory
func runMigrationFiles(db *sql.DB, dir string) error {
	files, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			log.Println("⚠️  Migrations directory not found, skipping file migrations")
			return nil
		}
		return err
	}

	// Sort files to ensure consistent execution order
	var sqlFiles []string
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".sql") {
			sqlFiles = append(sqlFiles, file.Name())
		}
	}
	sort.Strings(sqlFiles)

	for _, fileName := range sqlFiles {
		filePath := filepath.Join(dir, fileName)
		content, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", fileName, err)
		}

		// Strip goose Down section to prevent DROP TABLE from executing
		sqlContent := string(content)
		if idx := strings.Index(sqlContent, "-- +goose Down"); idx != -1 {
			sqlContent = sqlContent[:idx]
		}
		// Also strip goose Up marker (it's just a comment, but be explicit)
		sqlContent = strings.ReplaceAll(sqlContent, "-- +goose Up", "")

		_, err = db.Exec(sqlContent)
		if err != nil {
			// Skip "already exists" errors — idempotent migrations
			errMsg := err.Error()
			if strings.Contains(errMsg, "already exists") || strings.Contains(errMsg, "duplicate") {
				log.Printf("⚠️  Skipping migration %s (already applied): %v", fileName, err)
			} else {
				return fmt.Errorf("failed to execute migration %s: %w", fileName, err)
			}
		}

		log.Printf("✅ Executed migration: %s", fileName)
	}

	if len(sqlFiles) > 0 {
		log.Printf("✅ All %d migration files executed successfully", len(sqlFiles))
	}

	return nil
}
