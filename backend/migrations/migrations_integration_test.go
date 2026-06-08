package main

// Integration test for migrations 211–214 (marketplace-improvements spec, task 1.5).
//
// It verifies that the four additive migrations apply (goose Up) and roll back
// (goose Down) cleanly against a real PostgreSQL database:
//
//	211 → product_variants.photos              (Requirements 12.1)
//	212 → products.default_variant_id          (Requirements 18.4)
//	213 → companies.is_subscribed + .subscription_expires_at (Requirements 9.4)
//	214 → saved_addresses table                (Requirements 13.1)
//
// The migration files in this directory carry goose-style "-- +goose Up" /
// "-- +goose Down" markers but are normally executed by a custom runner
// (database.Migrate -> runMigrationFiles) that only runs the Up section. This
// test parses both sections itself so it can exercise Up and Down symmetrically.
//
// The test is gated behind the TEST_DATABASE_URL environment variable. When it is
// unset (e.g. in CI without a Postgres service, or in an offline sandbox) the test
// skips instead of failing, mirroring the additive/backward-compatible philosophy
// of the migrations themselves. Provide a disposable Postgres, e.g.:
//
//	TEST_DATABASE_URL="postgres://user:pass@localhost:5432/azaton_test?sslmode=disable" \
//	    go test ./migrations/ -run TestMigrations211To214ApplyAndRollback -v
//
// To stay non-destructive the test runs entirely inside a throwaway schema
// (created at start, dropped at end) on a single pinned connection, so it never
// touches the public schema or any real data in the target database.

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// migrationFiles lists the four migrations under test, in apply order.
var migrationFiles = []string{
	"211_add_photos_to_product_variants.sql",
	"212_add_default_variant_to_products.sql",
	"213_add_subscription_to_companies.sql",
	"214_create_saved_addresses_table.sql",
}

// prerequisiteSchema creates the minimal base tables the migrations depend on
// (foreign-key / ALTER targets). Defined locally so the test is self-contained
// and does not require the full application schema to be present first.
const prerequisiteSchema = `
CREATE TABLE IF NOT EXISTS companies (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS product_variants (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    images JSONB NOT NULL DEFAULT '[]'::jsonb
);
`

// parseGoose splits a goose migration file into its Up and Down SQL sections.
func parseGoose(content string) (up, down string) {
	const upMarker = "-- +goose Up"
	const downMarker = "-- +goose Down"

	if di := strings.Index(content, downMarker); di != -1 {
		up = content[:di]
		down = content[di+len(downMarker):]
	} else {
		up = content
	}
	up = strings.ReplaceAll(up, upMarker, "")
	return strings.TrimSpace(up), strings.TrimSpace(down)
}

// migrationsDir returns the absolute path to the directory containing this test
// file, which is also where the .sql migration files live. Using runtime.Caller
// makes the lookup independent of the working directory the test is invoked from.
func migrationsDir(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to determine current file path")
	}
	return filepath.Dir(thisFile)
}

func readMigration(t *testing.T, dir, name string) (up, down string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		t.Fatalf("failed to read migration %s: %v", name, err)
	}
	up, down = parseGoose(string(content))
	if up == "" {
		t.Fatalf("migration %s has an empty Up section", name)
	}
	if down == "" {
		t.Fatalf("migration %s has an empty Down section", name)
	}
	return up, down
}

func exec(t *testing.T, ctx context.Context, conn *sql.Conn, label, query string) {
	t.Helper()
	if _, err := conn.ExecContext(ctx, query); err != nil {
		t.Fatalf("%s failed: %v\n--- SQL ---\n%s", label, err, query)
	}
}

// columnExists reports whether table.column exists in the connection's current schema.
func columnExists(t *testing.T, ctx context.Context, conn *sql.Conn, table, column string) bool {
	t.Helper()
	var exists bool
	err := conn.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = current_schema()
			  AND table_name = $1
			  AND column_name = $2
		)`, table, column).Scan(&exists)
	if err != nil {
		t.Fatalf("column existence check for %s.%s failed: %v", table, column, err)
	}
	return exists
}

// tableExists reports whether the table exists in the connection's current schema.
func tableExists(t *testing.T, ctx context.Context, conn *sql.Conn, table string) bool {
	t.Helper()
	var exists bool
	err := conn.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = current_schema()
			  AND table_name = $1
		)`, table).Scan(&exists)
	if err != nil {
		t.Fatalf("table existence check for %s failed: %v", table, err)
	}
	return exists
}

// assertSchemaObjects checks every column/table introduced by 211–214. want=true
// asserts they exist (post-Up); want=false asserts they are gone (post-Down).
func assertSchemaObjects(t *testing.T, ctx context.Context, conn *sql.Conn, want bool) {
	t.Helper()
	phase := "after Up"
	if !want {
		phase = "after Down"
	}

	checkCol := func(table, column string) {
		if got := columnExists(t, ctx, conn, table, column); got != want {
			t.Errorf("%s: column %s.%s exists=%v, want %v", phase, table, column, got, want)
		}
	}

	// 211 — per-variant photos
	checkCol("product_variants", "photos")
	// 212 — product default variant
	checkCol("products", "default_variant_id")
	// 213 — company subscription
	checkCol("companies", "is_subscribed")
	checkCol("companies", "subscription_expires_at")
	// 214 — saved delivery addresses
	if got := tableExists(t, ctx, conn, "saved_addresses"); got != want {
		t.Errorf("%s: table saved_addresses exists=%v, want %v", phase, got, want)
	}
}

func TestMigrations211To214ApplyAndRollback(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping migration integration test (set it to a disposable Postgres DSN to run)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("failed to reach test database: %v", err)
	}

	// Pin a single connection so SET search_path and all DDL share one session.
	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatalf("failed to acquire connection: %v", err)
	}
	defer conn.Close()

	// Isolate everything in a throwaway schema so the test never mutates real data.
	schema := fmt.Sprintf("mig_test_%d", time.Now().UnixNano())
	exec(t, ctx, conn, "create schema", fmt.Sprintf("CREATE SCHEMA %s", schema))
	defer func() {
		// Best-effort cleanup; use a fresh context in case the test one expired.
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancelCleanup()
		if _, derr := conn.ExecContext(cleanupCtx, fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema)); derr != nil {
			t.Logf("warning: failed to drop test schema %s: %v", schema, derr)
		}
	}()
	exec(t, ctx, conn, "set search_path", fmt.Sprintf("SET search_path TO %s", schema))

	// Prerequisite base tables the migrations reference.
	exec(t, ctx, conn, "prerequisite schema", prerequisiteSchema)

	dir := migrationsDir(t)

	// Load Up/Down SQL for every migration up front so a malformed file fails fast.
	ups := make(map[string]string, len(migrationFiles))
	downs := make(map[string]string, len(migrationFiles))
	for _, name := range migrationFiles {
		up, down := readMigration(t, dir, name)
		ups[name] = up
		downs[name] = down
	}

	// Apply Up in ascending order (211 → 214).
	for _, name := range migrationFiles {
		exec(t, ctx, conn, "apply Up "+name, ups[name])
	}
	assertSchemaObjects(t, ctx, conn, true)

	// Roll back Down in descending order (214 → 211).
	for i := len(migrationFiles) - 1; i >= 0; i-- {
		name := migrationFiles[i]
		exec(t, ctx, conn, "apply Down "+name, downs[name])
	}
	assertSchemaObjects(t, ctx, conn, false)
}
