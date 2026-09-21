/** Express app for pg-intro-demo */

const express = require("express");
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db'); // Database client
const middleware = require("./middleware");
const ExpressError = require("./expressError");

const app = express();
const server = http.createServer(app);
// import BASE_URL from 
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

io.on('connection', (socket) => {

  socket.on('join_rep_room', (repId) => {
    socket.join(repId);
  });

  socket.on('disconnect', () => {
  });
});

app.use(express.json());
app.use(cors({
  origin: 'https://my-app-frontend-production-34ef.up.railway.app', // Your frontend domain
  credentials: true
}));
app.use(middleware.logger);

// Add routes from appServer.js
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

app.get('/secret', middleware.checkForPassword, (req, res, next) => {
  return res.send("I LOVE YOU <3 FOR REAL MARRY ME");
});

app.get('/private', middleware.checkForPassword, (req, res, next) => {
  return res.send("YOU HAVE REACHED THE PRIVATE PAGE.  IT IS PRIVATE.");
});

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

// Database Listener for TvDisplay with auto-reconnection
const setupDbListener = async () => {
  let client;
  try {
    client = await db.connect();
    await client.query('LISTEN game_players_changes');

    client.on('notification', (msg) => {
      if (msg.channel === 'game_players_changes') {
        try {
          if (!msg.payload) {
            io.emit('game_players_updated');
            return;
          }
          const payload = JSON.parse(msg.payload);
          const { operation, data } = payload;
          const repId = data.rep_id;

          if (repId) {
            io.to(repId).emit('game_players_delta', { operation, player: data });
          } else {
            io.emit('game_players_delta', { operation, player: data });
          }
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
  // Do not rethrow: the HTTP server should remain fully operational
  // without real-time DB notifications.
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
      ALTER TABLE que_number_table ADD COLUMN IF NOT EXISTS business VARCHAR(100);

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
    `);
  } catch (err) {
    console.error("❌ DB Migrations failed:", err);
  }
};
migrateDb();

// IMPORTANT: Use server.listen, not app.listen
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
});
