/** Routes for users of pg-intro-demo. */

const db = require("../db");
const express = require("express");
const router = express.Router();

/** Get users: [user, user, user] */

/** Get all users */
router.get("/reps", async function (req, res, next) {
  try {
    const query = `
      SELECT rp.is_active, rp.rep_guid, ct.first_name, ct.last_name, et.event_type, et.event_location, et.event_first_date, et.event_last_date
      FROM reps_table rp
      INNER JOIN customers_table ct ON rp.rep = ct.customer_guid
      INNER JOIN events_table et ON rp.event_id = et.event_guid
    `;
    const results = await db.query(query);
    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});

/** Get items from a table with dynamic filters and limit */
router.get("/getAll", async function (req, res, next) {
  const { tableName, limit = 20, ...filters } = req.query;
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

    query += ` ORDER BY time_created ASC LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit);

    const results = await db.query(query, queryParams);
    return res.json(results.rows);
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
  const direction = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  try {
    const results = await db.query(
      `SELECT player_guid, username, time_used, time_used_in_sec, puzzle_type, time_modified 
       FROM game_players_table 
       WHERE game_status = $1 AND DATE(time_created) = CURRENT_DATE 
       ORDER BY ${sortColumn} ${direction}
       LIMIT $2`, ['Completed', limit]);

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
    const results = await db.query(
          `SELECT id, name, type FROM users`);
      debugger
    return res.json(results.rows);
  }

  catch (err) {
    return next(err);
  }
});


// this version has security holes --- you could inject SQL
// because the input isn't sanitized!

/** Search by user type. */

router.get("/search", async function (req, res, next) {
  try {
    const type = req.query.type;
    
    const results = await db.query(
      `SELECT id, name, type 
       FROM users
       WHERE type='${type}'`);

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
    const query = `SELECT ${fieldNames} FROM ${tableName} WHERE ${fieldNames}= ${placeholders}`;

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
      conseole.log("i ran")
      return res.status(400).json({ error: "Invalid input data" });
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
    const { game_status, time_used,  timemodified} = req.body;

    const result = await db.query(
          `UPDATE game_players_table SET game_status=$1, time_used=$2, timemodified=$3
           WHERE player_guid = $4
           RETURNING id`,
        [game_status, time_used, timemodified, req.params.id]
    );

    return res.json(result.rows[0]);
  }

  catch (err) {
    return next(err);
  }
});
router.patch("/editPlayerForm/:id", async function (req, res, next) {
  try {
    const { username, email,  phone_number, puzzle_type, time_started, time_ended, time_used, time_modified, game_status, played_date} = req.body;

    const result = await db.query(
          `UPDATE game_players_table SET username=$1, email=$2, phone_number=$3, puzzle_type=$4,
          time_started=$5, time_ended=$6, time_used=$7, time_modified=$8, game_status=$9, played_date=$10
           WHERE player_guid = $11
           RETURNING id`,
        [username, email,  phone_number, puzzle_type, time_started, time_ended, time_used, time_modified, game_status, played_date, req.params.id]
    );

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

    return res.json({message: "Deleted"});
  }

  catch (err) {
    return next(err);
  }
});
// end


module.exports = router;