-- +goose Up
-- Добавить колонку expo_push_token в таблицу users для хранения push токенов
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_users_expo_push_token ON users(expo_push_token) WHERE expo_push_token IS NOT NULL;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS expo_push_token;
DROP INDEX IF EXISTS idx_users_expo_push_token;
