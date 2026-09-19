CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_courier TEXT NOT NULL CHECK (preferred_courier IN ('LBC', 'J&T Express')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  street TEXT NOT NULL,
  barangay TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS pickup_locations (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  branch_address TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS one_default_address_per_buyer
  ON addresses (buyer_id) WHERE is_default;

CREATE UNIQUE INDEX IF NOT EXISTS one_default_pickup_per_buyer
  ON pickup_locations (buyer_id) WHERE is_default;

CREATE INDEX IF NOT EXISTS buyers_name_search ON buyers (LOWER(name));
CREATE INDEX IF NOT EXISTS addresses_buyer_id ON addresses (buyer_id);
CREATE INDEX IF NOT EXISTS pickup_locations_buyer_id ON pickup_locations (buyer_id);
