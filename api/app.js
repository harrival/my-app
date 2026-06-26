/** Express app for pg-intro-demo */

const express = require("express");
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db'); // Database client
const middleware = require("./middleware");
const userRoutes = require("./userRoutes");
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

app.use(express.json());
app.use(cors());
app.use(middleware.logger);

// Mount userRoutes
app.use('/players', userRoutes);

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
app.use(function(req, res, next) {
  const err = new ExpressError("Not Found", 404);
  return next(err);
});

/** general error handler */
app.use(function(err, req, res, next) {
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
        console.log("🔔 DB Change detected! Emitting refresh to all TvDisplays.");
        io.emit('game_players_updated');
      }
    });

    client.on('error', (err) => {
      console.error('Postgres listener client error:', err);
      client.release();
      setTimeout(setupDbListener, 5000); // Try to reconnect
    });

    console.log("🚀 PostgreSQL is now WATCHING 'game_players_changes'");
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

// IMPORTANT: Use server.listen, not app.listen
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server + WebSocket running on http://localhost:${PORT}`);
});
