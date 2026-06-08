-- +goose Up
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE product_variants DROP COLUMN IF EXISTS photos;
