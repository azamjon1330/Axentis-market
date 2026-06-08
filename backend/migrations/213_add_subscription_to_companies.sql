-- +goose Up
-- Company subscription (paid ranking): a company can hold a paid/designated
-- subscription that grants its products elevated ranking in Buyer_App listings.
-- Additive and backward compatible — existing companies default to not subscribed.
-- A company counts as actively subscribed when
--   is_subscribed = TRUE AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW()).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_subscribed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Partial index keeps lookups of subscribed companies cheap without bloating
-- the index with the (overwhelmingly common) non-subscribed rows.
CREATE INDEX IF NOT EXISTS idx_companies_subscription ON companies(is_subscribed) WHERE is_subscribed = TRUE;

-- +goose Down
DROP INDEX IF EXISTS idx_companies_subscription;
ALTER TABLE companies DROP COLUMN IF EXISTS is_subscribed;
ALTER TABLE companies DROP COLUMN IF EXISTS subscription_expires_at;
