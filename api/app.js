/** Express app for pg-intro-demo */

const express = require("express");
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db'); // Database client
const middleware = require("./middleware");
const ExpressError = require("./expressError");
const { assertProductionGuardrail } = require("./services/providerFactory");

// Story DEV-401 Section 9.1 Production Guardrail:
// If NODE_ENV=production, refuse to start if any mock provider or dev route is enabled.
assertProductionGuardrail();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with robust settings for multi-device testing
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  path: "/socket.io/"
});

const deviceLinkService = require('./services/deviceLinkService');
deviceLinkService.setIo(io);

io.on('connection', (socket) => {
  socket.on('join_rep_room', (repId) => {
    socket.join(repId);
  });

  socket.on('join_business_room', (business) => {
    socket.join(business);
  });

  socket.on('join_ticket_room', (ticketId) => {
    socket.join(`ticket_${ticketId}`);
  });

  socket.on('join_device_room', (deviceId) => {
    socket.join(`device_${deviceId}`);
  });

  socket.on('join_user_room', (userGuid) => {
    socket.join(`user_${userGuid}`);
  });

  socket.on('device_activity', (deviceId) => {
    deviceLinkService.touchActivity(deviceId);
  });

  socket.on('game_players_changed', () => {
    io.emit('game_players_updated');
  });

  socket.on('disconnect', () => {
  });
});

const allowedOrigins = [
  'https://my-app-frontend-production-34ef.up.railway.app',
];

if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

app.use(express.json());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.up.railway.app')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(middleware.logger);

// Add routes from appServer.js
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// 1. MULTI-TENANT ARCHITECTURE & DYNAMIC SETTINGS ROUTES
try {
  const tenantRoutes = require("./routes/tenantRoutes");
  tenantRoutes.setIo(io);
  app.use("/", tenantRoutes.router);
} catch (err) {
  console.error("CRITICAL ERROR: Could not load routes from ./routes/tenantRoutes", err);
  throw err;
}

// 2. GENERAL ROUTER (After specific routes to avoid 404 stealing)
try {
  const uRoutes = require("./routes/apiRoutes");
  app.use("/", uRoutes);
} catch (err) {
  console.error("CRITICAL ERROR: Could not load routes from ./routes/apiRoutes");
  console.error("Please verify that the file exists at /Users/harrival/Desktop/my-app/api/routes/apiRoutes.js");
  console.error("Technical details:", err.message);
  // We let it throw here so nodemon shows the error clearly
  throw err;
}

/** 404 handler */
app.use(function (req, res, next) {
  const err = new ExpressError("Not Found", 404);
  return next(err);
});

/** general error handler */
app.use(function (err, req, res, next) {
  let status = err.status || 500;
  return res.status(status).json({
    error: {
      message: err.message,
      status: status
    }
  });
});

// Database Listener for PlayersMonitor with auto-reconnection
const setupDbListener = async () => {
  let client;
  try {
    client = await db.connect();
    await client.query('LISTEN game_players_changes');

    client.on('notification', (msg) => {
      if (msg.channel === 'game_players_changes') {
        try {
          // Always emit game_players_updated so that all monitors, TV screens, and builder components refresh!
          io.emit('game_players_updated');

          if (!msg.payload) {
            return;
          }
          const payload = JSON.parse(msg.payload);
          const { operation, data } = payload;
          const repId = data.rep_id;
          const business = data.business;

          if (business) {
            io.to(business).emit('game_players_delta', { operation, player: data });
          }
          if (repId) {
            io.to(repId).emit('game_players_delta', { operation, player: data });
          }
          io.emit('game_players_delta', { operation, player: data });
        } catch (err) {
          console.error("Error parsing PG notification payload:", err);
          io.emit('game_players_updated');
        }
      }
    });

    client.on('error', (err) => {
      console.error('Postgres listener client error:', err);
      client.release();
      setTimeout(setupDbListener, 5000); // Try to reconnect
    });

  } catch (err) {
    console.error('❌ Failed to setup DB listener:', err);
    if (client) client.release();
    setTimeout(setupDbListener, 5000);
  }
};

setupDbListener().catch((err) => {
  console.error('❌ Unhandled error in setupDbListener — DB listener will not be active:', err);
});

// Database Migrations (Run on startup)
const migrateDb = async () => {
  try {
    await db.query(`
      ALTER TABLE users_table ADD COLUMN IF NOT EXISTS business VARCHAR(100);
      ALTER TABLE events_table ADD COLUMN IF NOT EXISTS business VARCHAR(100);
      ALTER TABLE puzzles_type ADD COLUMN IF NOT EXISTS business VARCHAR(100);
      ALTER TABLE reps_table ADD COLUMN IF NOT EXISTS business VARCHAR(100);
      ALTER TABLE game_players_table ADD COLUMN IF NOT EXISTS business VARCHAR(100);

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
      ALTER TABLE business_table DROP COLUMN IF EXISTS website;


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

      DROP TRIGGER IF EXISTS game_players_changes_trigger ON game_players_table;
      CREATE TRIGGER game_players_changes_trigger
      AFTER INSERT OR UPDATE OR DELETE ON game_players_table
      FOR EACH ROW EXECUTE FUNCTION notify_game_players_changes();

      CREATE TABLE IF NOT EXISTS customers (
          id SERIAL,
          customer_guid VARCHAR(50) PRIMARY KEY,
          business VARCHAR(100),
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          email VARCHAR(100) NOT NULL,
          phone_number VARCHAR(20) NOT NULL,
          password_hash TEXT,
          sms_opt_in BOOLEAN DEFAULT FALSE,
          time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE customers ALTER COLUMN business DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

      CREATE TABLE IF NOT EXISTS business_settings (
          id SERIAL,
          business VARCHAR(100) NOT NULL,
          setting_key VARCHAR(50) NOT NULL,
          setting_value JSONB NOT NULL,
          time_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (business, setting_key)
      );

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
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS manage_token VARCHAR(100);

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

      CREATE TABLE IF NOT EXISTS supervisor_audit_logs (
          id SERIAL,
          log_guid VARCHAR(50) PRIMARY KEY,
          business VARCHAR(100) NOT NULL,
          actor_guid VARCHAR(50) NOT NULL,
          action VARCHAR(50) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          entity_guid VARCHAR(50) NOT NULL,
          reason TEXT,
          before_state JSONB,
          after_state JSONB,
          time_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_business ON supervisor_audit_logs(business);

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
    `);

    try {
      await db.query(`
        CREATE EXTENSION IF NOT EXISTS btree_gist;
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
      `);
    } catch (gistErr) {
      console.warn("⚠️ Could not apply btree_gist exclusion constraint (non-fatal):", gistErr.message);
    }
  } catch (err) {
    console.error("❌ DB Migrations failed:", err);
  }
};
migrateDb();

// IMPORTANT: Use server.listen, not app.listen
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
