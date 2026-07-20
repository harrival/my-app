/** Routes for users of pg-intro-demo. */

const db = require("../db");
const express = require("express");
const router = express.Router();

const SCOPED_TABLES = [
  'events_table',
  'game_players_table',
  'puzzles_type',
  'que_number_table',
  'reps_table',
  'users_table'
];

function isScopedTable(tableName) {
  if (!tableName) return false;
  const lower = tableName.toLowerCase();
  return SCOPED_TABLES.includes(lower) ||
    lower === 'event_table' ||
    lower === 'puzzle_type';
}

/** Get users: [user, user, user] */

/** Get all users */
router.get("/reps", async function (req, res, next) {
  try {
    const userRole = req.headers['x-user-role'];
    const userBusiness = req.headers['x-user-business'];

    let query = `
      SELECT rp.is_active, rp.rep_guid, ct.first_name, ct.last_name, et.event_type, et.event_location, et.event_first_date, et.event_last_date
      FROM reps_table rp
      INNER JOIN users_table ct ON rp.rep = ct.user_guid
      INNER JOIN events_table et ON rp.event_id = et.event_guid
    `;
    const queryParams = [];

    if (userRole === 'Supervisor' && userBusiness) {
      query += ` WHERE rp.business = $1`;
      queryParams.push(userBusiness);
    }

    const results = await db.query(query, queryParams);
    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});

/** Get items from a table with dynamic filters and limit */
router.get("/getAll", async function (req, res, next) {
  const { tableName, limit = 20, orderBy, sortDir, ...filters } = req.query;
  // Security: Validate sort direction
  const direction = (sortDir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  try {

    let query = `SELECT * FROM ${tableName}`;
    const queryParams = [];
    const filterKeys = Object.keys(filters);

    if (filterKeys.length > 0) {
      const whereClauses = filterKeys.map((key) => {
        const value = filters[key];
        queryParams.push(value);
        // Use ANY($n) for array values to support OR logic on a single column
        return Array.isArray(value)
          ? `${key} = ANY($${queryParams.length})`
          : `${key} = $${queryParams.length}`;
      });
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy} ${direction}`;
    }

    query += ` LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit);

    const results = await db.query(query, queryParams);
    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});

/** Get a single item from a table with dynamic filters */
router.get("/getOne", async function (req, res, next) {
  const { tableName, ...filters } = req.query;
  try {
    if (!tableName) {
      return res.status(400).json({ error: "tableName is required" });
    }

    const userRole = req.headers['x-user-role'];
    const userBusiness = req.headers['x-user-business'];

    if (userRole === 'Supervisor' && isScopedTable(tableName) && userBusiness) {
      filters.business = userBusiness;
    }

    let query = `SELECT * FROM ${tableName}`;
    const queryParams = [];
    const filterKeys = Object.keys(filters);

    if (filterKeys.length > 0) {
      const whereClauses = filterKeys.map((key, idx) => {
        queryParams.push(filters[key]);
        return `${key} = $${idx + 1}`;
      });
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    query += " LIMIT 1";

    const results = await db.query(query, queryParams);
    return res.json(results.rows[0] || null);
  } catch (err) {
    return next(err);
  }
});

/** Get completed players with dynamic sorting and limit */
router.get("/completedPlayers", async function (req, res, next) {
  const { limit, sortBy, sortDir } = req.query;

  // Security: Whitelist allowed sort columns to prevent SQL injection
  const validSortColumns = ['time_used_in_sec', 'time_modified', 'time_created'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'time_modified';

  // Security: Validate sort direction
  const direction = (sortDir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  try {
    const userRole = req.headers['x-user-role'];
    const userBusiness = req.headers['x-user-business'];

    let query = `
      SELECT player_guid, username, time_used, time_used_in_sec, puzzle_type, time_modified 
      FROM game_players_table 
      WHERE game_status = $1 AND DATE(time_created) = CURRENT_DATE
    `;
    const queryParams = ['Completed'];

    if (userRole === 'Supervisor' && userBusiness) {
      query += ` AND business = $2`;
      queryParams.push(userBusiness);
    }

    query += ` ORDER BY ${sortColumn} ${direction} LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit);

    const results = await db.query(query, queryParams);

    if (!results.rows || results.rows.length === 0) {
      return res.status(404).json({ error: "No completed players found" });
    }
    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});

/** (Fixed) Get users: [user, user, user] */

router.get("/", async function (req, res, next) {
  try {
    return res.json({ status: "ok", message: "API is running" });
  }

  catch (err) {
    return next(err);
  }
});


// this version has security holes --- you could inject SQL
// because the input isn't sanitized!

/** Search by user permission group. */

router.get("/search", async function (req, res, next) {
  try {
    const group = req.query.group;

    const results = await db.query(
      `SELECT id, user_guid, first_name, last_name, permission_group 
       FROM users_table
       WHERE permission_group='${group}'`);

    return res.json(results.rows);
  }

  catch (err) {
    return next(err);
  }
});


// fixed version that uses parameterized query

// (Fixed) Search by user type. */

router.get("/dbsearch", async function (req, res, next) {
  try {
    const { tableName, fields } = req.query;

    if (!tableName || !fields) {
      return res.status(400).json({ error: "Missing required query parameters" });
    }

    const fieldNames = Object.keys(fields).join(", ");
    const values = Object.values(fields);
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
    const query = `SELECT ${fieldNames} FROM ${tableName} 
    WHERE ${fieldNames}= ${placeholders} AND DATE(time_created) = CURRENT_DATE AND game_status = 'Created'`;

    const results = await db.query(query, values);

    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});



/** Create new user, return user */

router.post("/addToTable", async function (req, res, next) {
  try {
    const { tableName, fields } = req.body;
    console.log(fields);
    console.log(tableName);

    if (!tableName || !fields || typeof fields !== 'object') {
      return res.status(400).json({ error: "Invalid input data" });
    }

    const userRole = req.headers['x-user-role'];
    const userBusiness = req.headers['x-user-business'];
    if (userRole === 'Supervisor' && isScopedTable(tableName) && userBusiness) {
      fields.business = userBusiness;
    }

    const fieldNames = Object.keys(fields).join(", ");
    const values = Object.values(fields);
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");

    const query = `INSERT INTO ${tableName} (${fieldNames}) VALUES (${placeholders}) RETURNING *`;

    const result = await db.query(query, values);

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});


/** Update user, returning user */

router.patch("/editPlayer/:id", async function (req, res, next) {
  try {
    const { id } = req.params;
    const fields = req.body;
    const queryParams = [];
    let querySet = [];

    for (const key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        queryParams.push(fields[key]);
        querySet.push(`${key}=$${queryParams.length}`);
      }
    }

    if (querySet.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    queryParams.push(id);
    const query = `UPDATE game_players_table SET ${querySet.join(", ")} WHERE player_guid = $${queryParams.length} RETURNING id`;
    const result = await db.query(query, queryParams);

    return res.json(result.rows[0]);
  }

  catch (err) {
    return next(err);
  }
});

router.patch("/editPlayerForm/:id", async function (req, res, next) {
  try {
    const { id } = req.params;
    // Default to player table settings if not provided
    const {
      tableName = "game_players_table",
      idColumn = "player_guid",
      ...fields
    } = req.body;

    const queryParams = [];
    let querySet = [];
    let paramIdx = 1;

    for (const key in fields) {
      if (fields.hasOwnProperty(key)) {
        queryParams.push(fields[key]);
        querySet.push(`${key}=$${paramIdx}`);
        paramIdx++;
      }
    }

    if (querySet.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    queryParams.push(id); // Add player_guid to the end of params

    const query = `UPDATE ${tableName} SET ${querySet.join(", ")} WHERE ${idColumn} = $${paramIdx} RETURNING *`;
    const result = await db.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    return res.json(result.rows[0]);
  }

  catch (err) {
    return next(err);
  }
});


/** Delete user, returning {message: "Deleted"} */

router.delete("/deletePlayer/:id", async function (req, res, next) {
  try {
    const result = await db.query(
      "DELETE FROM game_players_table WHERE player_guid = $1",
      [req.params.id]
    );

    return res.json({ message: "Deleted" });
  }

  catch (err) {
    return next(err);
  }
});
const userProfiles = {};

router.post("/profile/:user_guid", function (req, res, next) {
  try {
    const { user_guid } = req.params;
    const profile = req.body;
    if (!profile || Object.keys(profile).length === 0) {
      delete userProfiles[user_guid];
      console.log(`❌ Cleared profile for user_guid: ${user_guid}. Active profiles:`, Object.keys(userProfiles));
      return res.json({ success: true, profile: null });
    }

    // Use the value of business from the returned user object
    const businessValue = profile.business || "Standard Customer";
    profile.business_value = businessValue;

    userProfiles[user_guid] = profile;
    console.log(`💾 Storing profile for user_guid: ${user_guid}. Current userProfiles keys:`, Object.keys(userProfiles));
    console.log("👤 Full profile contents:", JSON.stringify(profile, null, 2));

    return res.json({ success: true, profile: userProfiles[user_guid] });
  } catch (err) {
    return next(err);
  }
});

router.get("/profile/:user_guid", async function (req, res, next) {
  try {
    const { user_guid } = req.params;
    if (userProfiles[user_guid]) {
      console.log(`🔍 GET /profile/${user_guid} (from memory) - Returning:`, userProfiles[user_guid]);
      return res.json(userProfiles[user_guid]);
    }

    // Fallback: fetch from database and restore cache
    console.log(`🔍 GET /profile/${user_guid} not in memory, querying database...`);
    const result = await db.query(
      "SELECT * FROM users_table WHERE user_guid = $1",
      [user_guid]
    );

    if (result.rows.length > 0) {
      const profile = result.rows[0];
      const businessValue = profile.business || "Standard Customer";
      profile.business_value = businessValue;
      userProfiles[user_guid] = profile;

      console.log(`💾 Restored profile from DB for user_guid: ${user_guid}`);
      return res.json(profile);
    }

    console.log(`🔍 GET /profile/${user_guid} - Not found in memory or database.`);
    return res.json(null);
  } catch (err) {
    return next(err);
  }
});

router.get("/active-profile/:business", function (req, res, next) {
  try {
    const { business } = req.params;
    // Find an active profile in userProfiles matching the business (case-insensitive)
    const activeUser = Object.values(userProfiles).find(
      (profile) => profile.business && profile.business.toLowerCase() === business.toLowerCase()
    );
    if (activeUser) {
      console.log(`🔍 GET /active-profile/${business} - Found active session for user_guid: ${activeUser.user_guid}`);
      return res.json(activeUser);
    }
    console.log(`🔍 GET /active-profile/${business} - No active session found.`);
    return res.json(null);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;