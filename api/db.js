/** Database setup for users. */

const { Pool } = require("pg");

let DB_URI;

if (process.env.NODE_ENV === "test") {
  DB_URI = "postgresql:///triplegreatedb_test";
} else {
  DB_URI = process.env.DATABASE_URL || "postgresql:///triplegreatedb";
}

const db = new Pool({
  connectionString: DATABASE_URL,
  ...(process.env.DATABASE_URL && {
    ssl: { rejectUnauthorized: false }
  })
});

// Test connection and handle errors
db.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = db;
