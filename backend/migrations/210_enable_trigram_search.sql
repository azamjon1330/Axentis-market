-- Typo-tolerant product search via the pg_trgm extension. Additive — only
-- creates an extension and an index, no data or schema columns change.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category_trgm ON products USING gin (category gin_trgm_ops);
