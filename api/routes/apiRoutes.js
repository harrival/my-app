/** Routes for users of pg-intro-demo. */

const db = require("../db");
const express = require("express");
const router = express.Router();


// this version doesn't work --- db.query returns a promise,
// so we need to await it in an async function

/** Get users: [user, user, user] */

/** Get all users */
router.get("/players", async function (req, res, next) {
  try {
    const results = await db.query(`SELECT * FROM gameplayers`);
    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});
/** Get top 20 players users */
router.get("/completedPlayers", async function (req, res, next) {
  try {
    const results = await db.query(
      `SELECT playerguid, username, timeused, puzzletype 
       FROM gameplayers 
       WHERE gamestatus = $1 AND DATE(timecreated) = CURRENT_DATE 
       ORDER BY timeused ASC 
       LIMIT $2`, ['Completed', 20]);

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
    const { table, fields } = req.body;

    if (!table || !fields || typeof fields !== 'object') {
      return res.status(400).json({ error: "Invalid input data" });
    }

    const fieldNames = Object.keys(fields).join(", ");
    const values = Object.values(fields);
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");

    const query = `INSERT INTO ${table} (${fieldNames}) VALUES (${placeholders}) RETURNING *`;

    const result = await db.query(query, values);

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});


/** Update user, returning user */

router.patch("/editPlayer/:id", async function (req, res, next) {
  try {
    const { gamestatus, timeused,  timemodified} = req.body;

    const result = await db.query(
          `UPDATE gameplayers SET gamestatus=$1, timeused=$2, timemodified=$3
           WHERE playerguid = $4
           RETURNING id`,
        [gamestatus, timeused, timemodified, req.params.id]
    );

    return res.json(result.rows[0]);
  }

  catch (err) {
    return next(err);
  }
});
router.patch("/editPlayerForm/:id", async function (req, res, next) {
  try {
    const { username, email,  phonenumber, puzzletype} = req.body;

    const result = await db.query(
          `UPDATE gameplayers SET username=$1, email=$2, phonenumber=$3, puzzletype=$4
           WHERE playerguid = $5
           RETURNING id`,
        [username, email,  phonenumber, puzzletype, req.params.id]
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
        "DELETE FROM gameplayers WHERE playerguid = $1",
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