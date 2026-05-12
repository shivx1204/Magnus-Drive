-- =============================================================================
-- SUPABASE SCHEMA OVERHAUL — 26.04.2026 Inventory System
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- All operations are SAFE — they add new tables/columns without deleting existing data.
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 1: EXISTING TABLES — VERIFY / CREATE IF MISSING
-- These are the tables already in use. Running CREATE TABLE IF NOT EXISTS
-- is safe: it skips creation if the table already exists.
-- ═══════════════════════════════════════════════════════════════════

-- 1.1  PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id          text        PRIMARY KEY,
  code        text        NOT NULL,
  category    text        NOT NULL DEFAULT '',
  min_stock   integer     NOT NULL DEFAULT 0,
  order_index integer     NOT NULL DEFAULT 0
);

-- 1.2  PARTIES
CREATE TABLE IF NOT EXISTS parties (
  id    text  PRIMARY KEY,
  name  text  NOT NULL
);

-- 1.3  SALES
CREATE TABLE IF NOT EXISTS sales (
  id            text        PRIMARY KEY,
  godown        text        NOT NULL DEFAULT '1 Vasai',
  date          text        NOT NULL,
  bill          text        NOT NULL DEFAULT '',
  party         text        NOT NULL DEFAULT '',
  type          text        NOT NULL DEFAULT 'Normal',
  items         jsonb       NOT NULL DEFAULT '{}',
  scrap_provided boolean    NOT NULL DEFAULT false,
  scrap_items   jsonb       NOT NULL DEFAULT '{}',
  remark        text        NOT NULL DEFAULT ''
);

-- 1.4  PURCHASES
CREATE TABLE IF NOT EXISTS purchases (
  id      text  PRIMARY KEY,
  godown  text  NOT NULL DEFAULT '1 Vasai',
  date    text  NOT NULL,
  bill    text  NOT NULL DEFAULT '',
  party   text  NOT NULL DEFAULT '',
  type    text  NOT NULL DEFAULT 'Normal',
  items   jsonb NOT NULL DEFAULT '{}',
  remark  text  NOT NULL DEFAULT ''
);

-- 1.5  DCWR OUT
CREATE TABLE IF NOT EXISTS dcwr_out (
  id      text  PRIMARY KEY,
  godown  text  NOT NULL DEFAULT '1 Vasai',
  date    text  NOT NULL,
  challan text  NOT NULL DEFAULT '',
  party   text  NOT NULL DEFAULT '',
  remark  text  NOT NULL DEFAULT '',
  items   jsonb NOT NULL DEFAULT '{}'
);

-- 1.6  DCWR IN
CREATE TABLE IF NOT EXISTS dcwr_in (
  id          text  PRIMARY KEY,
  godown      text  NOT NULL DEFAULT '1 Vasai',
  ref_out_id  text  REFERENCES dcwr_out(id) ON DELETE CASCADE,
  date        text  NOT NULL,
  remark      text  NOT NULL DEFAULT '',
  items       jsonb NOT NULL DEFAULT '{}'
);

-- 1.7  TRANSFERS
CREATE TABLE IF NOT EXISTS transfers (
  id          text  PRIMARY KEY,
  date        text  NOT NULL,
  from_godown text  NOT NULL,
  to_godown   text  NOT NULL,
  ref_no      text  NOT NULL DEFAULT '',
  remark      text  NOT NULL DEFAULT '',
  items       jsonb NOT NULL DEFAULT '{}'
);

-- 1.8  ADJUSTMENTS
CREATE TABLE IF NOT EXISTS adjustments (
  id      text  PRIMARY KEY,
  godown  text  NOT NULL DEFAULT '1 Vasai',
  date    text  NOT NULL,
  type    text  NOT NULL DEFAULT 'Damage',
  reason  text  NOT NULL DEFAULT '',
  items   jsonb NOT NULL DEFAULT '{}'
);

-- 1.9  OPENING STOCK
CREATE TABLE IF NOT EXISTS opening_stock (
  product_id  text    NOT NULL,
  godown      text    NOT NULL DEFAULT '1 Vasai',
  qty         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, godown)
);

-- 1.10 APP SETTINGS (generic key-value store — keep this for category_order)
CREATE TABLE IF NOT EXISTS app_settings (
  key   text  PRIMARY KEY,
  value jsonb
);


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 2: NEW COLUMNS ON EXISTING TABLES
-- ADD COLUMN IF NOT EXISTS is safe: skips if column already exists.
-- ═══════════════════════════════════════════════════════════════════

-- 2.1  SALES — add third_party_source (proper column, not buried in remark)
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS third_party_source      text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS third_party_entry_id    text    DEFAULT NULL;

-- 2.2  SALES — add serial numbers JSONB column (per-product list of serial strings)
--   Format: { "product_id_abc": ["SN001","SN002"], "product_id_xyz": ["SN100"] }
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS serial_numbers_by_product jsonb DEFAULT '{}';

-- 2.3  PURCHASES — add serial numbers JSONB column  
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS serial_numbers_by_product jsonb DEFAULT '{}';


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 3: NEW TABLE — THIRD PARTY ENTRIES
-- Replaces the single JSONB blob stored in app_settings('third_party_entries').
-- Each entry is now a proper row with its own primary key and timestamps.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS third_party_entries (
  id                          text        PRIMARY KEY,
  godown                      text        NOT NULL DEFAULT 'Third Party Godown',
  date                        text        NOT NULL,
  bill                        text        NOT NULL DEFAULT '',
  party                       text        NOT NULL DEFAULT '',
  type                        text        NOT NULL DEFAULT 'Adjustment',
  status                      text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'partially_consumed' | 'closed'
  items                       jsonb       NOT NULL DEFAULT '{}',
  -- { "product_id": quantity }
  consumed_items              jsonb       NOT NULL DEFAULT '{}',
  -- Tracks how much has been consumed so far { "product_id": qty_consumed }
  consumed_by_sales           jsonb       NOT NULL DEFAULT '[]',
  -- Array: [{ "saleId": "...", "items": { "product_id": qty } }, ...]
  serial_numbers_by_product   jsonb       NOT NULL DEFAULT '{}',
  -- { "product_id": ["SN001", "SN002"] }
  remark                      text        NOT NULL DEFAULT '',
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast party lookups
CREATE INDEX IF NOT EXISTS idx_third_party_entries_party  ON third_party_entries(party);
CREATE INDEX IF NOT EXISTS idx_third_party_entries_status ON third_party_entries(status);
CREATE INDEX IF NOT EXISTS idx_third_party_entries_date   ON third_party_entries(date);


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 4: NEW TABLE — SCRAP LOGS
-- Replaces the single JSONB blob stored in app_settings('scrap_logs').
-- Each scrap entry is now a proper queryable row.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scrap_logs (
  id              text        PRIMARY KEY,
  date            text        NOT NULL,
  godown          text        NOT NULL DEFAULT '1 Vasai',
  product_id      text        REFERENCES products(id) ON DELETE SET NULL,
  items           jsonb       NOT NULL DEFAULT '{}',
  -- { "product_id": quantity } for multi-product scrap events
  qty             integer     NOT NULL DEFAULT 0,
  reason          text        NOT NULL DEFAULT 'Other',
  recoverable     boolean     NOT NULL DEFAULT false,
  remark          text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'disposed' | 'recovered'
  disposal_value  numeric(12,2) NOT NULL DEFAULT 0,
  source          text        NOT NULL DEFAULT 'manual',
  -- 'manual' | 'adjustment'
  source_ref_id   text        DEFAULT NULL,
  -- References the adjustment id that triggered this, if source='adjustment'
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for scrap logs
CREATE INDEX IF NOT EXISTS idx_scrap_logs_godown  ON scrap_logs(godown);
CREATE INDEX IF NOT EXISTS idx_scrap_logs_status  ON scrap_logs(status);
CREATE INDEX IF NOT EXISTS idx_scrap_logs_date    ON scrap_logs(date);


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 5: NEW TABLE — SERIAL NUMBERS (FLAT LOOKUP TABLE)
-- One row per serial number, linked to a sale or purchase.
-- This allows searching for any serial number across all transactions.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS serial_numbers (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  serial          text        NOT NULL,
  product_id      text        REFERENCES products(id) ON DELETE SET NULL,
  transaction_type text       NOT NULL,
  -- 'sale' | 'purchase' | 'third_party_entry'
  transaction_id  text        NOT NULL,
  -- References sales.id, purchases.id, or third_party_entries.id
  date            text        NOT NULL,
  godown          text        NOT NULL DEFAULT '',
  party           text        NOT NULL DEFAULT '',
  bill            text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast serial number search
CREATE UNIQUE INDEX IF NOT EXISTS idx_serial_numbers_serial        ON serial_numbers(serial);
CREATE INDEX       IF NOT EXISTS idx_serial_numbers_product_id     ON serial_numbers(product_id);
CREATE INDEX       IF NOT EXISTS idx_serial_numbers_transaction_id ON serial_numbers(transaction_id);


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 6: OVERHAUL — ACTIVITY LOG
-- The existing activity_log table only stores everything in a `details` text column.
-- We keep the old columns but add NEW PROPER COLUMNS for clean structured logging.
-- ═══════════════════════════════════════════════════════════════════

-- First, ensure the base table exists (in case it doesn't yet)
CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial   PRIMARY KEY,
  time        text        NOT NULL,
  user_name   text        NOT NULL DEFAULT '',
  login_id    text        NOT NULL DEFAULT '',
  role        text        NOT NULL DEFAULT '',
  action      text        NOT NULL,
  details     text        NOT NULL DEFAULT ''
);

-- Now add the new structured columns
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS module          text    DEFAULT NULL,
  -- 'sales' | 'purchases' | 'dcwr' | 'transfers' | 'adjustments' | 'scrap' | 'third_party' | 'products' | 'parties'
  ADD COLUMN IF NOT EXISTS ref_id          text    DEFAULT NULL,
  -- The internal ID of the record being acted on
  ADD COLUMN IF NOT EXISTS ref_bill        text    DEFAULT NULL,
  -- The bill/challan number visible to the user
  ADD COLUMN IF NOT EXISTS party           text    DEFAULT NULL,
  -- Party involved in the transaction
  ADD COLUMN IF NOT EXISTS godown          text    DEFAULT NULL,
  -- Godown where the action happened
  ADD COLUMN IF NOT EXISTS ip_address      text    DEFAULT NULL,
  -- Clean IP column (was embedded in details string before)
  ADD COLUMN IF NOT EXISTS before_snapshot jsonb   DEFAULT NULL,
  -- Optional: state of the record before edit/delete
  ADD COLUMN IF NOT EXISTS after_snapshot  jsonb   DEFAULT NULL,
  -- Optional: state of the record after create/edit
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

-- Indexes for activity log
CREATE INDEX IF NOT EXISTS idx_activity_log_module     ON activity_log(module);
CREATE INDEX IF NOT EXISTS idx_activity_log_ref_id     ON activity_log(ref_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_login_id   ON activity_log(login_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_action     ON activity_log(action);


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 7: RLS DISABLED
-- This app uses custom authentication (not Supabase built-in Auth).
-- RLS is intentionally left OFF so the app's service queries are not blocked.
-- Access control is handled at the application layer instead.
-- ═══════════════════════════════════════════════════════════════════

-- RLS is NOT enabled on any table in this schema.
-- (No ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
-- (No CREATE POLICY statements)


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 8: MIGRATION HELPERS
-- After you run the SQL above, run these queries in the Supabase SQL Editor
-- to migrate existing blob data into the new proper tables.
--
-- Step 8A: Migrate third_party_entries from app_settings blob → new table
-- ═══════════════════════════════════════════════════════════════════

/*
-- STEP 8A: Run this ONCE to migrate existing third_party_entries from the blob
-- It reads the JSON array stored in app_settings and inserts each element as a row.

INSERT INTO third_party_entries (
  id, godown, date, bill, party, type, status,
  items, consumed_items, consumed_by_sales,
  serial_numbers_by_product, remark, created_at
)
SELECT
  elem->>'id'                                     AS id,
  COALESCE(elem->>'godown', 'Third Party Godown') AS godown,
  elem->>'date'                                   AS date,
  COALESCE(elem->>'bill', '')                     AS bill,
  COALESCE(elem->>'party', '')                    AS party,
  COALESCE(elem->>'type', 'Adjustment')           AS type,
  COALESCE(elem->>'status', 'pending')            AS status,
  COALESCE(elem->'items', '{}')                   AS items,
  COALESCE(elem->'consumedItems', '{}')           AS consumed_items,
  COALESCE(elem->'consumedBySales', '[]')         AS consumed_by_sales,
  COALESCE(elem->'serialNumbersByProduct', '{}')  AS serial_numbers_by_product,
  COALESCE(elem->>'remark', '')                   AS remark,
  now()                                           AS created_at
FROM app_settings,
     jsonb_array_elements(value) AS elem
WHERE key = 'third_party_entries'
  AND value IS NOT NULL
  AND jsonb_typeof(value) = 'array'
ON CONFLICT (id) DO NOTHING;
*/


/*
-- STEP 8B: Run this ONCE to migrate existing scrap_logs from the blob
INSERT INTO scrap_logs (
  id, date, godown, product_id, items, qty, reason,
  recoverable, remark, status, disposal_value, source, source_ref_id, created_at
)
SELECT
  elem->>'id'                                   AS id,
  elem->>'date'                                 AS date,
  COALESCE(elem->>'godown', '1 Vasai')          AS godown,
  NULLIF(elem->>'productId', '')                AS product_id,
  COALESCE(elem->'items', '{}')                 AS items,
  COALESCE((elem->>'qty')::integer, 0)          AS qty,
  COALESCE(elem->>'reason', 'Other')            AS reason,
  COALESCE((elem->>'recoverable')::boolean, false) AS recoverable,
  COALESCE(elem->>'remark', '')                 AS remark,
  COALESCE(elem->>'status', 'pending')          AS status,
  COALESCE((elem->>'disposalValue')::numeric, 0) AS disposal_value,
  COALESCE(elem->>'source', 'manual')           AS source,
  NULLIF(elem->>'sourceRefId', '')              AS source_ref_id,
  now()                                         AS created_at
FROM app_settings,
     jsonb_array_elements(value) AS elem
WHERE key = 'scrap_logs'
  AND value IS NOT NULL
  AND jsonb_typeof(value) = 'array'
ON CONFLICT (id) DO NOTHING;
*/


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 9: USEFUL VIEWS FOR REPORTING
-- These are optional but very helpful for the Statement and Activity tabs.
-- ═══════════════════════════════════════════════════════════════════

-- View: Pending third-party stock summary (by party + product)
CREATE OR REPLACE VIEW v_third_party_pending AS
SELECT
  tpe.id             AS entry_id,
  tpe.party,
  tpe.date,
  tpe.bill,
  tpe.status,
  tpe.godown,
  prod.key           AS product_id,
  pr.code            AS product_code,
  pr.category        AS product_category,
  (prod.value::integer)                                 AS billed_qty,
  COALESCE((tpe.consumed_items ->> prod.key)::integer, 0) AS consumed_qty,
  (prod.value::integer)
    - COALESCE((tpe.consumed_items ->> prod.key)::integer, 0) AS remaining_qty
FROM third_party_entries tpe,
     jsonb_each_text(tpe.items) AS prod(key, value)
LEFT JOIN products pr ON pr.id = prod.key
WHERE tpe.status <> 'closed';

-- View: Serial number lookup (search by serial across all transaction types)
CREATE OR REPLACE VIEW v_serial_lookup AS
SELECT
  sn.serial,
  sn.transaction_type,
  sn.transaction_id,
  sn.date,
  sn.godown,
  sn.party,
  sn.bill,
  pr.code     AS product_code,
  pr.category AS product_category
FROM serial_numbers sn
LEFT JOIN products pr ON pr.id = sn.product_id;


-- ═══════════════════════════════════════════════════════════════════
-- DONE ✓
-- Summary of what was created:
--   Tables:   third_party_entries, scrap_logs, serial_numbers
--   Altered:  sales (+third_party_source, +third_party_entry_id, +serial_numbers_by_product)
--             purchases (+serial_numbers_by_product)
--             activity_log (+module, +ref_id, +ref_bill, +party, +godown, +ip_address,
--                           +before_snapshot, +after_snapshot, +created_at)
--   Views:    v_third_party_pending, v_serial_lookup
--   Indexes:  On all foreign keys and frequently filtered columns
--   RLS:      DISABLED — access control handled at application layer
-- ═══════════════════════════════════════════════════════════════════
