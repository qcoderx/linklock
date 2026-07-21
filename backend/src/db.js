import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { config } from './config.js';

fs.mkdirSync(config.paths.data, { recursive: true });
fs.mkdirSync(config.paths.uploads, { recursive: true });

export const db = new DatabaseSync(config.paths.db);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id                     TEXT PRIMARY KEY,
  ref                    TEXT UNIQUE NOT NULL,          -- human ref, e.g. order-893
  item_description       TEXT NOT NULL,
  amount                 REAL NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'NGN',
  buyer_contact          TEXT,
  vendor_name            TEXT,
  vendor_bank_code       TEXT NOT NULL,
  vendor_account_number  TEXT NOT NULL,
  vendor_account_name    TEXT,
  state                  TEXT NOT NULL DEFAULT 'CREATED',
  account_mode           TEXT NOT NULL DEFAULT 'SIMULATION', -- LIVE | SIMULATION
  va_bank_name           TEXT,
  va_bank_code           TEXT,
  va_account_number      TEXT,
  va_account_name        TEXT,
  va_reference           TEXT,                          -- accountReference sent to Monnify
  dispatch_reference     TEXT,
  amount_paid            REAL,
  payment_reference      TEXT,
  buyer_source_account   TEXT,
  buyer_source_bank_code TEXT,
  buyer_source_name      TEXT,
  delivery_window_expires_at INTEGER,
  released_at            INTEGER,
  reversed_at            INTEGER,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
CREATE INDEX IF NOT EXISTS idx_orders_va_ref ON orders(va_reference);
CREATE INDEX IF NOT EXISTS idx_orders_window ON orders(delivery_window_expires_at);

CREATE TABLE IF NOT EXISTS evidence (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  side          TEXT NOT NULL,                          -- VENDOR | BUYER
  media_type    TEXT NOT NULL DEFAULT 'image',
  stored_file   TEXT NOT NULL,                          -- filename under /uploads
  note          TEXT,
  ai_assessment TEXT,                                   -- JSON string
  captured_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_order ON evidence(order_id);

-- Money movements. idempotency_key is UNIQUE so duplicate webhooks / retries never double-count.
CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,                       -- LOCK | RELEASE | REVERSAL
  amount            REAL NOT NULL,
  monnify_reference TEXT,
  idempotency_key   TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL,                       -- PENDING | SUCCESS | FAILED
  detail            TEXT,                                -- JSON string
  occurred_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txn_order ON transactions(order_id);

CREATE TABLE IF NOT EXISTS disputes (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  opened_by      TEXT NOT NULL DEFAULT 'BUYER',
  reason         TEXT,
  vendor_response TEXT,                                  -- ACCEPT | CONTEST | null
  ai_comparison  TEXT,                                   -- JSON string
  state          TEXT NOT NULL DEFAULT 'OPEN',           -- OPEN | UNDER_REVIEW | RESOLVED
  human_decision TEXT,                                   -- RELEASE | REVERSE | SPLIT | null
  resolution_note TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disputes_order ON disputes(order_id);

-- The chat messages LinkLock "sends" (safe-to-ship, said-No ping, confirm link).
-- In production these go out over SMS/WhatsApp; here they are recorded and shown in the UI.
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  audience   TEXT NOT NULL,                              -- VENDOR | BUYER
  kind       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);

-- Append-only audit trail of every state transition.
CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  from_state TEXT,
  to_state   TEXT,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_order ON events(order_id);
`);

export function now() {
  return Date.now();
}
