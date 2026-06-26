/** Initialize the database schema from data.sql on app startup. */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function initializeDatabase() {
  const sqlPath = path.join(__dirname, "data.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const connectionString =
    process.env.DATABASE_URL || "postgresql:///triplegreatedb";

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("🗄️  Running database initialization from data.sql...");
    await client.query(sql);
    console.log("✅ Database schema initialized successfully.");
  } catch (err) {
    console.error("⚠️  Database initialization error:", err.message);
    // Don't crash the app — schema may already exist or be partially applied
  } finally {
    await client.end();
  }
}

module.exports = { initializeDatabase };
