DROP TABLE IF EXISTS notification_outbox CASCADE;
DROP TABLE IF EXISTS supervisor_audit_logs CASCADE;
DROP TABLE IF EXISTS inventory_blackouts CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reservation_changes CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS item_units CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS business_templates CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS game_players_table CASCADE;
DROP TABLE IF EXISTS reps_table CASCADE;
DROP TABLE IF EXISTS puzzles_type CASCADE;
DROP TABLE IF EXISTS events_table CASCADE;
DROP TABLE IF EXISTS business_table CASCADE;
DROP TABLE IF EXISTS users_table CASCADE;
DROP TABLE IF EXISTS roles_table CASCADE;

CREATE TABLE IF NOT EXISTS roles_table (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    is_elevated BOOLEAN DEFAULT false,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles_table (role, description, is_elevated) VALUES
    ('Admin', 'System Administrator with full access', true),
    ('Business_Owner', 'Business Owner with location management access', true),
    ('Agent', 'Operational staff and customer check-in agent', true),
    ('Customer', 'Public customer account', false)
ON CONFLICT (role) DO UPDATE SET
    description = EXCLUDED.description,
    is_elevated = EXCLUDED.is_elevated;

CREATE TABLE IF NOT EXISTS users_table (
    id SERIAL,
    user_guid VARCHAR(50) PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100),
    phone_number VARCHAR(15),
    address VARCHAR(255),
    role_id INTEGER REFERENCES roles_table(id) ON DELETE SET NULL,
    permission_group VARCHAR(50) DEFAULT 'Customer' REFERENCES roles_table(role) ON UPDATE CASCADE,
    password_hash TEXT,
    last_password_hash TEXT,
    is_admin BOOLEAN DEFAULT false,
    business VARCHAR(100),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_table_role_id ON users_table(role_id);
CREATE INDEX IF NOT EXISTS idx_users_table_permission_group ON users_table(permission_group);

CREATE TABLE IF NOT EXISTS business_table (
    id SERIAL,
    business_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) UNIQUE NOT NULL,
    user_guid VARCHAR(50) REFERENCES users_table(user_guid) ON DELETE SET NULL,
    business_name VARCHAR(150),
    contact_email VARCHAR(100),
    contact_phone VARCHAR(30),
    country VARCHAR(100),
    state VARCHAR(100),
    city VARCHAR(100),
    physical_address VARCHAR(255),
    postal_code VARCHAR(30),
    timezone VARCHAR(60) DEFAULT 'America/Los_Angeles',
    currency VARCHAR(10) DEFAULT 'USD',
    summary TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_business_table_user_guid ON business_table(user_guid);

CREATE TABLE IF NOT EXISTS events_table (
    id SERIAL,
    event_guid VARCHAR(50) PRIMARY KEY,
    event_type VARCHAR(100),
    event_location VARCHAR(100),
    event_first_date DATE,
    event_last_date DATE,
    is_active BOOLEAN DEFAULT true,
    event_type_created_by VARCHAR(50),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    business VARCHAR(100),
    FOREIGN KEY (event_type_created_by) REFERENCES users_table(user_guid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS puzzles_type (
    id SERIAL,
    puzzle_type_guid VARCHAR(10) PRIMARY KEY,
    puzzle_name VARCHAR(10),
    is_archived BOOLEAN,
    puzzle_type_created_by VARCHAR(50),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    business VARCHAR(100),
    FOREIGN KEY (puzzle_type_created_by) REFERENCES users_table(user_guid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reps_table (
    id SERIAL,
    rep_guid VARCHAR(50) PRIMARY KEY,
    rep VARCHAR(50),
    event_id VARCHAR(50),
    is_active BOOLEAN,
    business VARCHAR(100),
    FOREIGN KEY (rep) REFERENCES users_table(user_guid) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_players_table (
    id SERIAL,
    player_guid VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50),
    email VARCHAR(100),
    phone_number VARCHAR(15),
    puzzle_type VARCHAR(20),
    game_status VARCHAR(20),
    time_started TIME,
    time_ended TIME,
    time_used TIME,
    time_used_in_sec INTEGER,
    time_created TIMESTAMP,
    time_modified TIMESTAMP,
    rep_id VARCHAR(50),
    event_id VARCHAR(50),
    played_date DATE,
    business VARCHAR(100),
    FOREIGN KEY (rep_id) REFERENCES reps_table(rep_guid) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events_table(event_guid) ON DELETE CASCADE
);

-- 1. Create the notification function
CREATE OR REPLACE FUNCTION notify_game_players_changes() RETURNS trigger AS $$
DECLARE
  payload TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload := json_build_object(
      'operation', TG_OP,
      'data', row_to_json(OLD)
    )::text;
  ELSE
    payload := json_build_object(
      'operation', TG_OP,
      'data', row_to_json(NEW)
    )::text;
  END IF;
  
  PERFORM pg_notify('game_players_changes', payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach it to the table for all modifications
DROP TRIGGER IF EXISTS game_players_changes_trigger ON game_players_table;
CREATE TRIGGER game_players_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON game_players_table
FOR EACH ROW EXECUTE FUNCTION notify_game_players_changes();

-- ============================================================================
-- Triple Great: Multi-Tenant Enterprise Reservation & Dynamic Settings Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Dedicated Customers Table (Customer information is enterprise-wide and not tied to a single business)
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL,
    customer_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    password_hash TEXT,
    last_password_hash TEXT,
    sms_opt_in BOOLEAN DEFAULT FALSE,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 2. Business Dynamic Settings Table (Zero Hardcoded Logic)
CREATE TABLE IF NOT EXISTS business_settings (
    id SERIAL,
    business VARCHAR(100) NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value JSONB NOT NULL,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business, setting_key)
);

-- 3. Dynamic Message Templates (Email & SMS per Business)
CREATE TABLE IF NOT EXISTS business_templates (
    id SERIAL,
    template_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    channel VARCHAR(10) NOT NULL,
    subject VARCHAR(200),
    body_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business, event_type, channel)
);

-- 4. Item Catalog (Configured via Supervisor Panel)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL,
    item_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    daily_rate_cents INTEGER NOT NULL,
    images JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_items_business ON items(business);

-- 5. Physical Serialized Units Linked to Items
CREATE TABLE IF NOT EXISTS item_units (
    id SERIAL,
    unit_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    item_guid VARCHAR(50) NOT NULL,
    serial_number VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_guid) REFERENCES items(item_guid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_units_item ON item_units(item_guid);
CREATE INDEX IF NOT EXISTS idx_units_business ON item_units(business);

-- 6. Reservations (Multi-Tenant, PostgreSQL GIST Exclusion Protected)
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL,
    reservation_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    item_guid VARCHAR(50) NOT NULL,
    unit_guid VARCHAR(50) NOT NULL,
    customer_guid VARCHAR(50) NOT NULL,
    date_range DATERANGE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'HOLD',
    hold_expires_at TIMESTAMP WITH TIME ZONE,
    subtotal_cents INTEGER NOT NULL,
    tax_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    fee_cents INTEGER DEFAULT 0,
    refund_cents INTEGER DEFAULT 0,
    manage_token VARCHAR(100),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by VARCHAR(50),
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_guid) REFERENCES items(item_guid),
    FOREIGN KEY (unit_guid) REFERENCES item_units(unit_guid),
    FOREIGN KEY (customer_guid) REFERENCES customers(customer_guid)
);
CREATE INDEX IF NOT EXISTS idx_reservations_business ON reservations(business);
CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_guid);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_active_reservations'
    ) THEN
        ALTER TABLE reservations ADD CONSTRAINT no_overlapping_active_reservations
            EXCLUDE USING gist (unit_guid WITH =, date_range WITH &&)
            WHERE (status IN ('HOLD', 'CONFIRMED'));
    END IF;
END $$;

-- 7. Reservation Changes Log (Reschedules, Add Days, Remove Days)
CREATE TABLE IF NOT EXISTS reservation_changes (
    id SERIAL,
    change_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    reservation_guid VARCHAR(50) NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    old_range DATERANGE NOT NULL,
    new_range DATERANGE NOT NULL,
    old_unit_guid VARCHAR(50),
    new_unit_guid VARCHAR(50),
    fee_cents INTEGER DEFAULT 0,
    extra_charge_cents INTEGER DEFAULT 0,
    refund_cents INTEGER DEFAULT 0,
    fees_waived BOOLEAN DEFAULT FALSE,
    actor_guid VARCHAR(50) NOT NULL,
    reason TEXT,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_guid) REFERENCES reservations(reservation_guid) ON DELETE CASCADE
);

-- 8. Ledger of Payments & Refunds
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL,
    payment_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    reservation_guid VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    amount_cents INTEGER NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_ref VARCHAR(100),
    status VARCHAR(20) NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    attempts INTEGER DEFAULT 1,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_guid) REFERENCES reservations(reservation_guid) ON DELETE CASCADE
);

-- 9. Inventory Blackout Dates
CREATE TABLE IF NOT EXISTS inventory_blackouts (
    id SERIAL,
    blackout_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    item_guid VARCHAR(50),
    date_range DATERANGE NOT NULL,
    reason TEXT NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_blackouts_business ON inventory_blackouts(business);

-- 10. Supervisor Audit Logs (Viewable in Admin Control Panel)
CREATE TABLE IF NOT EXISTS supervisor_audit_logs (
    id SERIAL,
    log_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100),
    actor_guid VARCHAR(150) NOT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_guid VARCHAR(150) NOT NULL,
    reason TEXT,
    before_state JSONB,
    after_state JSONB,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_business ON supervisor_audit_logs(business);

-- 11. Transactional Notification Outbox
CREATE TABLE IF NOT EXISTS notification_outbox (
    id SERIAL,
    outbox_guid VARCHAR(50) PRIMARY KEY,
    business VARCHAR(100) NOT NULL,
    reservation_guid VARCHAR(50),
    recipient VARCHAR(100) NOT NULL,
    channel VARCHAR(10) NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    rendered_body TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    provider_message_id VARCHAR(100),
    error_message TEXT,
    time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_outbox_business_status ON notification_outbox(business, status);

-- Story INV-102 Multi-Tenant Demo Seed:
-- alpha_rentals has 3 serialized units of Item X; beta_rentals has 2 serialized units of Item X
INSERT INTO items (item_guid, business, name, description, daily_rate_cents, images, is_active)
VALUES
  ('item_alpha_x', 'alpha_rentals', 'Item X — Pro Event Sound System', 'Flagship rental kit scoped strictly to alpha_rentals (3 serialized units)', 10000, '[]'::jsonb, TRUE),
  ('item_beta_x', 'beta_rentals', 'Item X — Pro Event Sound System', 'Flagship rental kit scoped strictly to beta_rentals (2 serialized units)', 10000, '[]'::jsonb, TRUE)
ON CONFLICT (item_guid) DO NOTHING;

INSERT INTO item_units (unit_guid, business, item_guid, serial_number, is_active)
VALUES
  ('unit_alpha_x_1', 'alpha_rentals', 'item_alpha_x', 'ALPHA-SN-001', TRUE),
  ('unit_alpha_x_2', 'alpha_rentals', 'item_alpha_x', 'ALPHA-SN-002', TRUE),
  ('unit_alpha_x_3', 'alpha_rentals', 'item_alpha_x', 'ALPHA-SN-003', TRUE),
  ('unit_beta_x_1', 'beta_rentals', 'item_beta_x', 'BETA-SN-001', TRUE),
  ('unit_beta_x_2', 'beta_rentals', 'item_beta_x', 'BETA-SN-002', TRUE)
ON CONFLICT (unit_guid) DO NOTHING;

