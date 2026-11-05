CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
  unit_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  address_json TEXT NOT NULL,
  mcf_sku TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_customer_id TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_session_url TEXT,
  stripe_payment_intent_id TEXT,
  total_cents INTEGER,
  tax_cents INTEGER,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  reply_to TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  lease_token TEXT,
  first_attempt_at INTEGER,
  provider_id TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS store_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO store_settings(key,value) VALUES ('sales_enabled','true');
