/**
 * Comprehensive Test Data Seeder for Triple Great
 *
 * Populates:
 * 1. Roles in roles_table (Admin, Business_Owner, Agent, Customer)
 * 2. Test users for ALL roles in users_table (with foreign key role_id & permission_group)
 * 3. Dedicated customer accounts in customers table (with scrypt password hashes)
 * 4. Multiple businesses in business_table (alpha_rentals, beta_rentals)
 * 5. Full business setup for alpha_rentals:
 *    - Business settings (tax, deposit, hours, printer, payment methods)
 *    - Business message templates (booking confirmation, reminders, cancellations)
 *    - Events in events_table
 *    - Representatives in reps_table
 *    - Active players in game_players_table
 * 6. Inventories:
 *    - Items in items table with pricing, description, and status
 *    - Physical serialized units in item_units table
 * 7. Transactions:
 *    - Reservations (confirmed, hold) with PostgreSQL DATERANGE & exclusion safety
 *    - Ledger payments (charges, settled)
 *    - Supervisor audit logs
 *    - Notification outbox entries
 */

const crypto = require("crypto");
const db = require("./db");

function hashCustomerPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

async function seed() {
  console.log("🚀 Starting database seeding for all roles, businesses, inventories, and transactions...");
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // ------------------------------------------------------------------------
    // 1. ROLES TABLE
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding roles_table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles_table (
          id SERIAL PRIMARY KEY,
          role VARCHAR(50) UNIQUE NOT NULL,
          description VARCHAR(255),
          is_elevated BOOLEAN DEFAULT false,
          time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO roles_table (role, description, is_elevated) VALUES
          ('Admin', 'System Administrator with full system-wide access', true),
          ('Business_Owner', 'Business Owner with location and inventory management access', true),
          ('Agent', 'Operational staff and customer check-in agent', true),
          ('Customer', 'Public customer account for equipment reservations', false)
      ON CONFLICT (role) DO UPDATE SET
          description = EXCLUDED.description,
          is_elevated = EXCLUDED.is_elevated;
    `);

    const rolesRes = await client.query("SELECT id, role FROM roles_table");
    const roleMap = {};
    for (const r of rolesRes.rows) {
      roleMap[r.role] = r.id;
    }

    // ------------------------------------------------------------------------
    // 2. TEST USERS FOR ALL ROLES IN users_table
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding users_table for ALL roles...");
    const testUsers = [
      {
        user_guid: "usr_admin_alex",
        first_name: "Alex",
        last_name: "Admin",
        email: "admin@triplegreat.com",
        phone_number: "2135550100",
        address: "100 Enterprise Way, Los Angeles, CA",
        role: "Admin",
        is_admin: true,
        business: null
      },
      {
        user_guid: "usr_owner_sarah",
        first_name: "Sarah",
        last_name: "Alpha",
        email: "owner.alpha@triplegreat.com",
        phone_number: "2135550101",
        address: "100 Enterprise Way, Suite 100, Los Angeles, CA",
        role: "Business_Owner",
        is_admin: false,
        business: "alpha_rentals"
      },
      {
        user_guid: "usr_owner_marcus",
        first_name: "Marcus",
        last_name: "Beta",
        email: "owner.beta@triplegreat.com",
        phone_number: "2125550102",
        address: "500 7th Ave, New York, NY",
        role: "Business_Owner",
        is_admin: false,
        business: "beta_rentals"
      },
      {
        user_guid: "usr_agent_brian",
        first_name: "Brian",
        last_name: "Agent",
        email: "agent.alpha@triplegreat.com",
        phone_number: "2135550103",
        address: "100 Enterprise Way, Suite 100, Los Angeles, CA",
        role: "Agent",
        is_admin: false,
        business: "alpha_rentals"
      },
      {
        user_guid: "usr_agent_chloe",
        first_name: "Chloe",
        last_name: "Agent",
        email: "agent.beta@triplegreat.com",
        phone_number: "2125550104",
        address: "500 7th Ave, New York, NY",
        role: "Agent",
        is_admin: false,
        business: "beta_rentals"
      },
      {
        user_guid: "usr_cust_ian",
        first_name: "Ian",
        last_name: "Customer",
        email: "customer.user@triplegreat.com",
        phone_number: "2135551009",
        address: "789 Pine St, Los Angeles, CA",
        role: "Customer",
        is_admin: false,
        business: "alpha_rentals",
        password_hash: hashCustomerPassword("TripleGreat@2026!")
      },
      {
        user_guid: "usr_new_staff",
        first_name: "New",
        last_name: "Staff",
        email: "new.staff@triplegreat.com",
        phone_number: "2135550198",
        address: "100 Enterprise Way, Los Angeles, CA",
        role: "Agent",
        is_admin: false,
        business: "alpha_rentals",
        password_hash: null // Unset: triggers first-time setup with strong password and OTP validation!
      }
    ];

    // Remove overlapping emails from users_table so customer portal users are purely in customers table
    await client.query("DELETE FROM users_table WHERE email IN ('customer.dave@example.com', 'customer.emma@example.com')");

    const defaultStaffPasswordHash = hashCustomerPassword("TripleGreat@2026!");

    for (const u of testUsers) {
      const roleId = roleMap[u.role] || null;
      const pwdHash = u.password_hash !== undefined ? u.password_hash : defaultStaffPasswordHash;
      await client.query(`
        INSERT INTO users_table (user_guid, first_name, last_name, email, phone_number, address, role_id, permission_group, is_admin, business, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (user_guid) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          address = EXCLUDED.address,
          role_id = EXCLUDED.role_id,
          permission_group = EXCLUDED.permission_group,
          is_admin = EXCLUDED.is_admin,
          business = EXCLUDED.business,
          password_hash = COALESCE(users_table.password_hash, EXCLUDED.password_hash);
      `, [u.user_guid, u.first_name, u.last_name, u.email, u.phone_number, u.address, roleId, u.role, u.is_admin, u.business, pwdHash]);
    }

    // ------------------------------------------------------------------------
    // 3. DEDICATED CUSTOMERS TABLE (Enterprise-wide customer registry)
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding customers table with password logins...");
    const customerPasswordHash = hashCustomerPassword("password123");

    const customersToSeed = [
      {
        customer_guid: "cust_dave",
        business: "alpha_rentals",
        first_name: "David",
        last_name: "Miller",
        email: "customer.dave@example.com",
        phone_number: "2135551001",
        sms_opt_in: true
      },
      {
        customer_guid: "cust_emma",
        business: "alpha_rentals",
        first_name: "Emma",
        last_name: "Watson",
        email: "customer.emma@example.com",
        phone_number: "2135551002",
        sms_opt_in: true
      },
      {
        customer_guid: "cust_michael",
        business: "beta_rentals",
        first_name: "Michael",
        last_name: "Scott",
        email: "customer.michael@example.com",
        phone_number: "2125552003",
        sms_opt_in: false
      }
    ];

    for (const c of customersToSeed) {
      await client.query(`
        INSERT INTO customers (customer_guid, business, first_name, last_name, email, phone_number, password_hash, sms_opt_in)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (customer_guid) DO UPDATE SET
          business = EXCLUDED.business,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          password_hash = EXCLUDED.password_hash,
          sms_opt_in = EXCLUDED.sms_opt_in;
      `, [c.customer_guid, c.business, c.first_name, c.last_name, c.email, c.phone_number, customerPasswordHash, c.sms_opt_in]);
    }

    // ------------------------------------------------------------------------
    // 4. BUSINESSES IN business_table
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding business_table...");
    const businessesToSeed = [
      {
        business_guid: "biz_alpha_rentals",
        business: "alpha_rentals",
        user_guid: "usr_owner_sarah",
        business_name: "Alpha Rentals — Downtown Los Angeles",
        contact_email: "info@alpharentals.com",
        contact_phone: "+1 (213) 555-0199",
        country: "United States",
        state: "California",
        city: "Los Angeles",
        physical_address: "100 Enterprise Way, Suite 100, Los Angeles, CA",
        postal_code: "90015",
        timezone: "America/Los_Angeles",
        currency: "USD",
        summary: "Full-service event, audio, lighting, and outdoor adventure equipment rentals.",
        is_active: true
      },
      {
        business_guid: "biz_beta_rentals",
        business: "beta_rentals",
        user_guid: "usr_owner_marcus",
        business_name: "Beta Rentals — Midtown Manhattan",
        contact_email: "info@betarentals.com",
        contact_phone: "+1 (212) 555-0144",
        country: "United States",
        state: "New York",
        city: "New York City",
        physical_address: "500 7th Ave, New York, NY",
        postal_code: "10018",
        timezone: "America/New_York",
        currency: "USD",
        summary: "Production lighting, pro audio, and metropolitan event equipment.",
        is_active: true
      }
    ];

    for (const b of businessesToSeed) {
      await client.query(`
        INSERT INTO business_table (
          business_guid, business, user_guid, business_name, contact_email,
          contact_phone, country, state, city, physical_address, postal_code,
          timezone, currency, summary, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (business_guid) DO UPDATE SET
          business = EXCLUDED.business,
          user_guid = EXCLUDED.user_guid,
          business_name = EXCLUDED.business_name,
          contact_email = EXCLUDED.contact_email,
          contact_phone = EXCLUDED.contact_phone,
          country = EXCLUDED.country,
          state = EXCLUDED.state,
          city = EXCLUDED.city,
          physical_address = EXCLUDED.physical_address,
          postal_code = EXCLUDED.postal_code,
          timezone = EXCLUDED.timezone,
          currency = EXCLUDED.currency,
          summary = EXCLUDED.summary,
          is_active = EXCLUDED.is_active;
      `, [
        b.business_guid, b.business, b.user_guid, b.business_name, b.contact_email,
        b.contact_phone, b.country, b.state, b.city, b.physical_address, b.postal_code,
        b.timezone, b.currency, b.summary, b.is_active
      ]);
    }

    // ------------------------------------------------------------------------
    // 5. FULL SETUP FOR alpha_rentals (Settings, Templates, Events, Reps, Players)
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding business_settings for alpha_rentals...");
    const settings = [
      {
        business: "alpha_rentals",
        key: "tax_rate",
        value: { rate: 0.095, label: "California LA County Sales Tax (9.5%)" }
      },
      {
        business: "alpha_rentals",
        key: "deposit_percentage",
        value: { percentage: 25, required: true }
      },
      {
        business: "alpha_rentals",
        key: "cancellation_fee_cents",
        value: { amount_cents: 2500, policy: "Cancellations with less than 24h notice incur a $25 fee" }
      },
      {
        business: "alpha_rentals",
        key: "operating_hours",
        value: {
          monday: { open: "08:00", close: "20:00" },
          tuesday: { open: "08:00", close: "20:00" },
          wednesday: { open: "08:00", close: "20:00" },
          thursday: { open: "08:00", close: "20:00" },
          friday: { open: "08:00", close: "21:00" },
          saturday: { open: "09:00", close: "21:00" },
          sunday: { open: "10:00", close: "18:00" }
        }
      },
      {
        business: "alpha_rentals",
        key: "printer_config",
        value: {
          enabled: true,
          printer_name: "Front Desk Thermal Receipt",
          paper_width_mm: 80,
          auto_print_on_checkout: true
        }
      },
      {
        business: "alpha_rentals",
        key: "payment_methods",
        value: { accepted: ["card", "apple_pay", "google_pay", "cash"] }
      }
    ];

    for (const s of settings) {
      await client.query(`
        INSERT INTO business_settings (business, setting_key, setting_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (business, setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          time_modified = CURRENT_TIMESTAMP;
      `, [s.business, s.key, JSON.stringify(s.value)]);
    }

    console.log("➡️ Seeding business_settings for beta_rentals...");
    const betaSettings = [
      { business: "beta_rentals", key: "business_name", value: "Beta Rentals — Midtown Manhattan" },
      { business: "beta_rentals", key: "contact_email", value: "info@betarentals.com" },
      { business: "beta_rentals", key: "contact_phone", value: "+1 (212) 555-0144" },
      { business: "beta_rentals", key: "physical_address", value: "500 7th Ave, New York, NY" },
      { business: "beta_rentals", key: "timezone", value: "America/New_York" },
      { business: "beta_rentals", key: "currency", value: "USD" },
      { business: "beta_rentals", key: "hold_ttl_seconds", value: 600 },
      { business: "beta_rentals", key: "free_change_cutoff_hours", value: 168 },
      { business: "beta_rentals", key: "late_fee_percentage", value: 25 },
      { business: "beta_rentals", key: "allow_customer_add_days", value: true },
      { business: "beta_rentals", key: "allow_customer_remove_days", value: true },
      { business: "beta_rentals", key: "guest_token_ttl_days", value: 30 },
      { business: "beta_rentals", key: "tax_rate_percent", value: 8.875 },
      { business: "beta_rentals", key: "require_full_payment", value: true },
      { business: "beta_rentals", key: "sms_enabled", value: true },
      { business: "beta_rentals", key: "email_enabled", value: true },
      { business: "beta_rentals", key: "reminder_lead_hours", value: 48 },
    ];
    for (const s of betaSettings) {
      await client.query(`
        INSERT INTO business_settings (business, setting_key, setting_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (business, setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          time_modified = CURRENT_TIMESTAMP;
      `, [s.business, s.key, JSON.stringify(s.value)]);
    }

    console.log("➡️ Seeding business_templates for alpha_rentals...");
    const templates = [
      {
        template_guid: "tpl_alpha_confirm_email",
        business: "alpha_rentals",
        event_type: "booking.confirmed",
        channel: "EMAIL",
        subject: "Your Triple Great Reservation Confirmation — {{business_name}}",
        body_template: "Hello {{customer_name}},\n\nYour reservation (ID: {{reservation_guid}}) for {{item_name}} is confirmed!\n\nRental Period: {{start_date}} to {{end_date}}\nTotal Paid: ${{total_amount}}\nManage your reservation anytime at: {{manage_url}}\n\nThank you for choosing Alpha Rentals!"
      },
      {
        template_guid: "tpl_alpha_confirm_sms",
        business: "alpha_rentals",
        event_type: "booking.confirmed",
        channel: "SMS",
        subject: null,
        body_template: "Alpha Rentals: Confirmed! Your {{item_name}} is reserved for {{start_date}}. Manage: {{manage_url}}"
      },
      {
        template_guid: "tpl_alpha_reminder_email",
        business: "alpha_rentals",
        event_type: "booking.reminder_48h",
        channel: "EMAIL",
        subject: "Reminder: Your Alpha Rentals Pickup is Tomorrow",
        body_template: "Hi {{customer_name}},\n\nJust a reminder that your rental of {{item_name}} begins tomorrow at our Downtown LA location.\nPickup Address: 100 Enterprise Way, Suite 100, Los Angeles, CA.\nSee you soon!"
      }
    ];

    for (const t of templates) {
      await client.query(`
        INSERT INTO business_templates (template_guid, business, event_type, channel, subject, body_template, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        ON CONFLICT (business, event_type, channel) DO UPDATE SET
          subject = EXCLUDED.subject,
          body_template = EXCLUDED.body_template,
          is_active = TRUE;
      `, [t.template_guid, t.business, t.event_type, t.channel, t.subject, t.body_template]);
    }

    console.log("➡️ Seeding events_table & reps_table...");
    await client.query(`
      INSERT INTO events_table (event_guid, event_type, event_location, event_first_date, event_last_date, is_active, event_type_created_by, business)
      VALUES (
        'evt_alpha_expo',
        'Downtown LA Summer Sound Expo 2026',
        'Los Angeles Convention Center, South Hall',
        '2026-06-01',
        '2026-08-31',
        TRUE,
        'usr_owner_sarah',
        'alpha_rentals'
      )
      ON CONFLICT (event_guid) DO UPDATE SET
        event_type = EXCLUDED.event_type,
        event_location = EXCLUDED.event_location,
        event_first_date = EXCLUDED.event_first_date,
        event_last_date = EXCLUDED.event_last_date,
        is_active = TRUE,
        business = EXCLUDED.business;

      INSERT INTO reps_table (rep_guid, rep, event_id, is_active, business)
      VALUES ('rep_alpha_brian', 'usr_agent_brian', 'evt_alpha_expo', TRUE, 'alpha_rentals')
      ON CONFLICT (rep_guid) DO UPDATE SET
        rep = EXCLUDED.rep,
        event_id = EXCLUDED.event_id,
        is_active = TRUE,
        business = EXCLUDED.business;

      INSERT INTO game_players_table (player_guid, username, email, phone_number, puzzle_type, game_status, time_used_in_sec, rep_id, event_id, played_date, business)
      VALUES
        ('ply_01', 'AlphaGamer1', 'player1@example.com', '2135559001', 'Puzzle_A', 'FINISHED', 142, 'rep_alpha_brian', 'evt_alpha_expo', CURRENT_DATE, 'alpha_rentals'),
        ('ply_02', 'SpeedyRacer', 'speedy@example.com', '2135559002', 'Puzzle_B', 'PLAYING', 85, 'rep_alpha_brian', 'evt_alpha_expo', CURRENT_DATE, 'alpha_rentals'),
        ('ply_03', 'PuzzleMaster', 'puzzle@example.com', '2135559003', 'Puzzle_A', 'WAITING', 0, 'rep_alpha_brian', 'evt_alpha_expo', CURRENT_DATE, 'alpha_rentals')
      ON CONFLICT (player_guid) DO NOTHING;
    `);

    // ------------------------------------------------------------------------
    // 6. INVENTORIES (Items & Serialized Item Units)
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding inventory items...");
    const items = [
      {
        item_guid: "item_alpha_sound",
        business: "alpha_rentals",
        name: "Triple Great Pro Audio Sound System & Wireless Mics",
        description: "Professional 2000W sound system with dual wireless mics, 6-channel Bluetooth mixer, and road cases.",
        daily_rate_cents: 15000,
        images: []
      },
      {
        item_guid: "item_alpha_projector",
        business: "alpha_rentals",
        name: "4K Laser Projector & 120-Inch Portable Screen",
        description: "Ultra-bright 5000-lumen 4K HDR event projector with fold-out high-gain 120-inch portable screen.",
        daily_rate_cents: 12000,
        images: []
      },
      {
        item_guid: "item_alpha_ebike",
        business: "alpha_rentals",
        name: "High-Performance All-Terrain Electric Mountain Bike",
        description: "Full-suspension e-bike with 50-mile range battery, hydraulic disc brakes, helmet and charger kit included.",
        daily_rate_cents: 7500,
        images: []
      },
      {
        item_guid: "item_alpha_tent",
        business: "alpha_rentals",
        name: "Commercial Heavy-Duty Canopy Event Tent (20x20)",
        description: "Commercial-grade waterproof event canopy with detachable sidewalls, ground stakes, and weight sandbags.",
        daily_rate_cents: 9500,
        images: []
      },
      {
        item_guid: "item_beta_sound",
        business: "beta_rentals",
        name: "Metropolitan Stage Sound Rig",
        description: "High-output NYC stage sound rig for concert halls and metropolitan event spaces.",
        daily_rate_cents: 18000,
        images: []
      },
      {
        item_guid: "item_beta_lighting",
        business: "beta_rentals",
        name: "DMX Controlled Stage Lighting Array",
        description: "Programmable RGBW moving-head lighting array with wireless DMX controller.",
        daily_rate_cents: 11000,
        images: []
      }
    ];

    for (const it of items) {
      await client.query(`
        INSERT INTO items (item_guid, business, name, description, daily_rate_cents, images, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        ON CONFLICT (item_guid) DO UPDATE SET
          business = EXCLUDED.business,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          daily_rate_cents = EXCLUDED.daily_rate_cents,
          images = EXCLUDED.images,
          is_active = TRUE;
      `, [it.item_guid, it.business, it.name, it.description, it.daily_rate_cents, JSON.stringify(it.images)]);
    }

    console.log("➡️ Seeding serialized item_units...");
    const units = [
      // alpha sound system units
      { unit_guid: "unit_alpha_sound_1", business: "alpha_rentals", item_guid: "item_alpha_sound", serial_number: "ALPHA-SND-001" },
      { unit_guid: "unit_alpha_sound_2", business: "alpha_rentals", item_guid: "item_alpha_sound", serial_number: "ALPHA-SND-002" },
      { unit_guid: "unit_alpha_sound_3", business: "alpha_rentals", item_guid: "item_alpha_sound", serial_number: "ALPHA-SND-003" },

      // alpha projector units
      { unit_guid: "unit_alpha_prj_1", business: "alpha_rentals", item_guid: "item_alpha_projector", serial_number: "ALPHA-PRJ-001" },
      { unit_guid: "unit_alpha_prj_2", business: "alpha_rentals", item_guid: "item_alpha_projector", serial_number: "ALPHA-PRJ-002" },

      // alpha ebike units
      { unit_guid: "unit_alpha_ebk_1", business: "alpha_rentals", item_guid: "item_alpha_ebike", serial_number: "ALPHA-EBK-001" },
      { unit_guid: "unit_alpha_ebk_2", business: "alpha_rentals", item_guid: "item_alpha_ebike", serial_number: "ALPHA-EBK-002" },
      { unit_guid: "unit_alpha_ebk_3", business: "alpha_rentals", item_guid: "item_alpha_ebike", serial_number: "ALPHA-EBK-003" },
      { unit_guid: "unit_alpha_ebk_4", business: "alpha_rentals", item_guid: "item_alpha_ebike", serial_number: "ALPHA-EBK-004" },

      // alpha tent units
      { unit_guid: "unit_alpha_tnt_1", business: "alpha_rentals", item_guid: "item_alpha_tent", serial_number: "ALPHA-TNT-001" },
      { unit_guid: "unit_alpha_tnt_2", business: "alpha_rentals", item_guid: "item_alpha_tent", serial_number: "ALPHA-TNT-002" },

      // beta sound units
      { unit_guid: "unit_beta_snd_1", business: "beta_rentals", item_guid: "item_beta_sound", serial_number: "BETA-SND-001" },
      { unit_guid: "unit_beta_snd_2", business: "beta_rentals", item_guid: "item_beta_sound", serial_number: "BETA-SND-002" },

      // beta lighting units
      { unit_guid: "unit_beta_lgt_1", business: "beta_rentals", item_guid: "item_beta_lighting", serial_number: "BETA-LGT-001" },
      { unit_guid: "unit_beta_lgt_2", business: "beta_rentals", item_guid: "item_beta_lighting", serial_number: "BETA-LGT-002" },
      { unit_guid: "unit_beta_lgt_3", business: "beta_rentals", item_guid: "item_beta_lighting", serial_number: "BETA-LGT-003" }
    ];

    for (const u of units) {
      await client.query(`
        INSERT INTO item_units (unit_guid, business, item_guid, serial_number, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (unit_guid) DO UPDATE SET
          business = EXCLUDED.business,
          item_guid = EXCLUDED.item_guid,
          serial_number = EXCLUDED.serial_number,
          is_active = TRUE;
      `, [u.unit_guid, u.business, u.item_guid, u.serial_number]);
    }

    // ------------------------------------------------------------------------
    // 7. TRANSACTIONS & RESERVATIONS
    // ------------------------------------------------------------------------
    console.log("➡️ Seeding reservations & payments...");
    const reservations = [
      {
        reservation_guid: "res_alpha_confirmed_01",
        business: "alpha_rentals",
        item_guid: "item_alpha_sound",
        unit_guid: "unit_alpha_sound_1",
        customer_guid: "cust_dave",
        start_date: "2026-11-07",
        end_date: "2026-11-09",
        status: "CONFIRMED",
        subtotal_cents: 30000,
        tax_cents: 2850,
        total_cents: 32850,
        manage_token: "tok_alpha_dave_sound_01"
      },
      {
        reservation_guid: "res_alpha_confirmed_02",
        business: "alpha_rentals",
        item_guid: "item_alpha_projector",
        unit_guid: "unit_alpha_prj_1",
        customer_guid: "cust_emma",
        start_date: "2026-11-14",
        end_date: "2026-11-16",
        status: "CONFIRMED",
        subtotal_cents: 24000,
        tax_cents: 2280,
        total_cents: 26280,
        manage_token: "tok_alpha_emma_prj_01"
      },
      {
        reservation_guid: "res_alpha_hold_01",
        business: "alpha_rentals",
        item_guid: "item_alpha_ebike",
        unit_guid: "unit_alpha_ebk_1",
        customer_guid: "cust_dave",
        start_date: "2026-11-20",
        end_date: "2026-11-22",
        status: "HOLD",
        subtotal_cents: 15000,
        tax_cents: 1425,
        total_cents: 16425,
        manage_token: "tok_alpha_dave_ebk_01"
      }
    ];

    for (const r of reservations) {
      const holdExpiresAt = r.status === "HOLD" ? new Date(Date.now() + 2 * 3600 * 1000).toISOString() : null;
      await client.query(`
        INSERT INTO reservations (
          reservation_guid, business, item_guid, unit_guid, customer_guid,
          date_range, status, hold_expires_at, subtotal_cents, tax_cents,
          total_cents, manage_token
        ) VALUES (
          $1, $2, $3, $4, $5,
          daterange($6, $7, '[)'),
          $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (reservation_guid) DO UPDATE SET
          business = EXCLUDED.business,
          item_guid = EXCLUDED.item_guid,
          unit_guid = EXCLUDED.unit_guid,
          customer_guid = EXCLUDED.customer_guid,
          date_range = EXCLUDED.date_range,
          status = EXCLUDED.status,
          hold_expires_at = EXCLUDED.hold_expires_at,
          subtotal_cents = EXCLUDED.subtotal_cents,
          tax_cents = EXCLUDED.tax_cents,
          total_cents = EXCLUDED.total_cents,
          manage_token = EXCLUDED.manage_token;
      `, [
        r.reservation_guid, r.business, r.item_guid, r.unit_guid, r.customer_guid,
        r.start_date, r.end_date, r.status, holdExpiresAt, r.subtotal_cents, r.tax_cents,
        r.total_cents, r.manage_token
      ]);
    }

    console.log("➡️ Seeding payments (ledger transactions)...");
    const payments = [
      {
        payment_guid: "pay_alpha_01_initial",
        business: "alpha_rentals",
        reservation_guid: "res_alpha_confirmed_01",
        type: "CHARGE",
        purpose: "INITIAL_BOOKING",
        amount_cents: 32850,
        provider: "STRIPE",
        provider_ref: "ch_3MxyzAlphaSound01",
        status: "SETTLED",
        idempotency_key: "idemp_pay_alpha_01"
      },
      {
        payment_guid: "pay_alpha_02_initial",
        business: "alpha_rentals",
        reservation_guid: "res_alpha_confirmed_02",
        type: "CHARGE",
        purpose: "INITIAL_BOOKING",
        amount_cents: 26280,
        provider: "STRIPE",
        provider_ref: "ch_3MxyzAlphaPrj02",
        status: "SETTLED",
        idempotency_key: "idemp_pay_alpha_02"
      }
    ];

    for (const p of payments) {
      await client.query(`
        INSERT INTO payments (
          payment_guid, business, reservation_guid, type, purpose,
          amount_cents, provider, provider_ref, status, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (payment_guid) DO UPDATE SET
          business = EXCLUDED.business,
          reservation_guid = EXCLUDED.reservation_guid,
          type = EXCLUDED.type,
          purpose = EXCLUDED.purpose,
          amount_cents = EXCLUDED.amount_cents,
          provider = EXCLUDED.provider,
          provider_ref = EXCLUDED.provider_ref,
          status = EXCLUDED.status;
      `, [
        p.payment_guid, p.business, p.reservation_guid, p.type, p.purpose,
        p.amount_cents, p.provider, p.provider_ref, p.status, p.idempotency_key
      ]);
    }

    console.log("➡️ Seeding supervisor_audit_logs & notification_outbox...");
    await client.query(`
      INSERT INTO supervisor_audit_logs (log_guid, business, actor_guid, action, entity_type, entity_guid, reason, before_state, after_state)
      VALUES
        (
          'log_alpha_01',
          'alpha_rentals',
          'usr_owner_sarah',
          'SETTING_UPDATED',
          'business_settings',
          'operating_hours',
          'Configured standard operating hours (8:00 AM - 8:00 PM)',
          NULL,
          '{"configured_by": "Sarah Alpha"}'::jsonb
        ),
        (
          'log_alpha_02',
          'alpha_rentals',
          'system',
          'RESERVATION_CONFIRMED',
          'reservation',
          'res_alpha_confirmed_01',
          'Full checkout payment received via Stripe',
          '{"status": "HOLD"}'::jsonb,
          '{"status": "CONFIRMED", "amount_cents": 32850}'::jsonb
        )
      ON CONFLICT (log_guid) DO NOTHING;

      INSERT INTO notification_outbox (outbox_guid, business, reservation_guid, recipient, channel, template_type, payload, rendered_body, status, attempts)
      VALUES
        (
          'outbox_alpha_01',
          'alpha_rentals',
          'res_alpha_confirmed_01',
          'customer.dave@example.com',
          'EMAIL',
          'booking_confirmation',
          '{"customer_name": "David Miller", "total_cents": 32850}'::jsonb,
          'Your Triple Great Reservation Confirmation — Alpha Rentals Downtown LA. Total: $328.50.',
          'SENT',
          1
        ),
        (
          'outbox_alpha_02',
          'alpha_rentals',
          'res_alpha_confirmed_01',
          '2135551001',
          'SMS',
          'booking_confirmation',
          '{"customer_name": "David Miller"}'::jsonb,
          'Alpha Rentals: Confirmed! Your Pro Sound System is reserved for 2026-11-07.',
          'SENT',
          1
        ),
        (
          'outbox_alpha_03',
          'alpha_rentals',
          'res_alpha_confirmed_02',
          'customer.emma@example.com',
          'EMAIL',
          'booking_confirmation',
          '{"customer_name": "Emma Watson", "total_cents": 26280}'::jsonb,
          'Your Triple Great Reservation Confirmation — Alpha Rentals Downtown LA. Total: $262.80.',
          'SENT',
          1
        )
      ON CONFLICT (outbox_guid) DO NOTHING;
    `);

    await client.query("COMMIT");
    console.log("✅ Database seeding completed successfully!");
    console.log(`
========================================================================
🎉 TEST CREDENTIALS & DEMO DATA SUMMARY:
========================================================================
1. ADMIN ACCOUNT:
   - Email: admin@triplegreat.com (or Phone: 2135550100)
   - Role: Admin (Full system access)
   - Password: TripleGreat@2026!
   - 2FA Method: 6-digit PIN sent to phone & console.logged

2. BUSINESS OWNER ACCOUNTS:
   - Email: owner.alpha@triplegreat.com (or Phone: 2135550101)
     Role: Business_Owner for 'alpha_rentals' (Full Setup)
   - Email: owner.beta@triplegreat.com (or Phone: 2125550102)
     Role: Business_Owner for 'beta_rentals'
   - Password: TripleGreat@2026!
   - 2FA Method: 6-digit PIN sent to phone & console.logged

3. AGENT (OPERATIONS / CHECK-IN) ACCOUNTS:
   - Email: agent.alpha@triplegreat.com (or Phone: 2135550103)
     Role: Agent for 'alpha_rentals'
   - Email: agent.beta@triplegreat.com (or Phone: 2125550104)
     Role: Agent for 'beta_rentals'
   - Password: TripleGreat@2026!
   - 2FA Method: 6-digit PIN sent to phone & console.logged

4. FIRST-TIME STAFF ONBOARDING TEST ACCOUNT:
   - Email: new.staff@triplegreat.com (or Phone: 2135559090)
     Role: Agent for 'alpha_rentals'
   - Flow: On first sign in, prompts user to set strong password,
     dispatches 6-digit PIN to phone & console.logs PIN, validates PIN.

5. CUSTOMER ACCOUNTS (Bookings & Self-Service Portal):
   - Email: customer.dave@example.com (or Phone: 2135551001)
     Password: password123 (Full booking history & reservations)
   - Email: customer.emma@example.com (or Phone: 2135551002)
     Password: password123 (Confirmed reservation & manage token)
   - Method: Password login or self-service reservation manage token

6. BUSINESSES CONFIGURED:
   - alpha_rentals: "Alpha Rentals — Downtown Los Angeles" (FULL SETUP)
     * 4 Items, 11 Serialized Units
     * Operating Hours, 9.5% Tax, 25% Deposit, $25 Cancellation Fee
     * 3 Reservations (2 Confirmed, 1 Hold)
     * 2 Settled Payment Transactions
     * Event & Representative assigned
     * 3 Active Game Players
   - beta_rentals: "Beta Rentals — Midtown Manhattan"
     * 2 Items, 5 Serialized Units
========================================================================
    `);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seeding failed, rolled back:", err);
    throw err;
  } finally {
    client.release();
    if (require.main === module) {
      process.exit(0);
    }
  }
}

if (require.main === module) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed };
