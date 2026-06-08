-- +goose Up
-- Saved delivery addresses: a one-to-many table letting a buyer persist and label
-- multiple delivery addresses (with optional map coordinates) for reuse at checkout.
-- Additive and backward compatible — the legacy users.default_delivery_* columns
-- (migration 112) remain; new saved addresses are authoritative going forward.
-- user_id ON DELETE CASCADE removes a user's addresses when the user is deleted.
CREATE TABLE IF NOT EXISTS saved_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(100) NOT NULL,
    address_text TEXT NOT NULL,
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    recipient_name VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_addresses_user ON saved_addresses(user_id);

-- +goose Down
DROP TABLE IF EXISTS saved_addresses;
