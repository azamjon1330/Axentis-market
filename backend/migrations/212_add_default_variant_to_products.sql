-- +goose Up
-- Product default variant: a company can designate one variant per product to be
-- auto-selected when a buyer adds the product to cart or uses Buy Now.
-- Additive and backward compatible — existing products default to NULL.
-- ON DELETE SET NULL clears (rather than orphans) the pointer when the variant is removed.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS default_variant_id BIGINT
    REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_default_variant ON products(default_variant_id);

-- +goose Down
ALTER TABLE products DROP COLUMN IF EXISTS default_variant_id;
