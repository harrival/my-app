/** Routes for users of pg-intro-demo. */

const crypto = require("crypto");
const db = require("../db");
const express = require("express");
const router = express.Router();
const { getBusinessRecord, upsertBusinessRecord } = require("../services/businessService");

/** When a Supervisor is saved in users_table, create/link their business in business_table. */
async function linkSupervisorBusiness(tableName, row) {
  if (
    String(tableName).toLowerCase() !== "users_table" ||
    String(row?.permission_group || "").toLowerCase() !== "supervisor" ||
    !String(row?.business || "").trim()
  ) return;
  try {
    const existing = await getBusinessRecord({ business: String(row.business).trim() });
    row.business_info = await upsertBusinessRecord(
      {
        business: String(row.business).trim(),
        user_guid: existing?.user_guid || row.user_guid,
        ...(existing ? {} : {
          contact_email: row.email || "",
          contact_phone: row.phone_number || "",
          physical_address: row.address || "",
        }),
      },
      row.user_guid
    );
  } catch (err) {
    console.error("Failed to link supervisor business:", err.message);
  }
}

const SCOPED_TABLES = [
  'events_table',
  'game_players_table',
  'puzzles_type',
  'reps_table',
  'users_table',
  'customers',
  'business_settings',
  'business_templates',
  'items',
  'item_units',
  'reservations',
  'reservation_changes',
  'payments',
  'inventory_blackouts',
  'supervisor_audit_logs',
  'notification_outbox'
];

const STRICT_TENANT_TABLES = new Set([
  'business_settings',
  'business_templates',
  'items',
  'item_units',
  'reservations',
  'reservation_changes',
  'payments',
  'inventory_blackouts',
  'supervisor_audit_logs',
  'notification_outbox'
]);

function isScopedTable(tableName) {
  if (!tableName) return false;
  const lower = tableName.toLowerCase();
  return SCOPED_TABLES.includes(lower) ||
    lower === 'event_table' ||
    lower === 'puzzle_type';
}

function applyStrictTenantFilter(req, tableName, filters) {
  if (!tableName) return filters;
  const lower = tableName.toLowerCase();
  const headerBusiness = req.headers['x-tenant-business'] || req.headers['x-user-business'];
  if (STRICT_TENANT_TABLES.has(lower) && !filters.business && headerBusiness) {
    return { ...filters, business: headerBusiness };
  }
  return filters;
}

/** Get users: [user, user, user] */

/** Get all users */
router.get("/getAllInnerJoin", async function (req, res, next) {
  const { ...filters } = req.query;
  try {

    let query = `
      SELECT rp.is_active, rp.rep_guid, ct.first_name, ct.last_name, et.event_type, et.event_location, et.event_first_date, et.event_last_date
      FROM reps_table rp
      INNER JOIN users_table ct ON rp.rep = ct.user_guid
      INNER JOIN events_table et ON rp.event_id = et.event_guid
    `;
    const queryParams = [];
    const filterKeys = Object.keys(filters);

    if (filterKeys.length > 0) {
      const whereClauses = filterKeys.map((key) => {
        const value = filters[key];
        queryParams.push(value);
        return Array.isArray(value)
          ? `rp.${key} = ANY($${queryParams.length})`
          : `rp.${key} = $${queryParams.length}`;
      });
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    const results = await db.query(query, queryParams);
    return res.json(results.rows);
  } catch (err) {
    return next(err);
  }
});

/** Get items from a table with dynamic filters and limit */
router.get("/getAll", async function (req, res, next) {
  const { tableName, limit = 20, orderBy, sortBy, sortDir, ...rawFilters } = req.query;
  const filters = applyStrictTenantFilter(req, tableName, rawFilters);

  // Security: Whitelist allowed sort columns to prevent SQL injection
  const validSortColumns = ['time_used_in_sec', 'time_modified', 'time_created'];
  const requestedSort = sortBy || orderBy || null;
  const sortColumn = validSortColumns.includes(requestedSort) ? requestedSort : null;

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

    if (sortColumn) {
      query += ` ORDER BY ${sortColumn} ${direction}`;
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
  const { tableName, ...rawFilters } = req.query;
  const filters = applyStrictTenantFilter(req, tableName, rawFilters);
  try {
    if (!tableName) {
      return res.status(400).json({ error: "tableName is required" });
    }

    let query = `SELECT * FROM ${tableName}`;
    const queryParams = [];
    const filterKeys = Object.keys(filters);

    if (filterKeys.length > 0) {
      const whereClauses = [];

      for (const key of filterKeys) {
        const value = filters[key];
        if (Array.isArray(value)) {
          if (value.length >= 2) {
            const orConditions = value.map((val) => {
              queryParams.push(val);
              return `${key} = $${queryParams.length}`;
            });
            whereClauses.push(`(${orConditions.join(" OR ")})`);
          } else if (value.length === 1) {
            queryParams.push(value[0]);
            whereClauses.push(`${key} = $${queryParams.length}`);
          }
        } else {
          queryParams.push(value);
          whereClauses.push(`${key} = $${queryParams.length}`);
        }
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }
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

    let query = `
      SELECT player_guid, username, time_used, time_used_in_sec, puzzle_type, time_modified 
      FROM game_players_table 
      WHERE game_status = $1 AND DATE(time_created) = CURRENT_DATE
    `;
    const queryParams = ['Completed'];

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

    if (!tableName || !fields || typeof fields !== 'object') {
      return res.status(400).json({ error: "Invalid input data" });
    }

    const fieldNames = Object.keys(fields).join(", ");
    const values = Object.values(fields);
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");

    const query = `INSERT INTO ${tableName} (${fieldNames}) VALUES (${placeholders}) RETURNING *`;

    const result = await db.query(query, values);
    const inserted = result.rows[0];
    await linkSupervisorBusiness(tableName, inserted);

    return res.status(201).json(inserted);
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

    const updated = result.rows[0];
    await linkSupervisorBusiness(tableName, updated);
    return res.json(updated);
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

function normalizePhoneDigits(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

function hashCustomerPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyCustomerPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  if (!storedHash.includes(":")) {
    return String(password) === String(storedHash);
  }
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function toCustomerSessionProfile(customerRow) {
  const business = customerRow.business || null;
  return {
    id: customerRow.id,
    user_guid: customerRow.customer_guid,
    customer_guid: customerRow.customer_guid,
    first_name: customerRow.first_name,
    last_name: customerRow.last_name,
    email: customerRow.email,
    phone_number: customerRow.phone_number,
    address: "",
    permission_group: "Customer",
    is_admin: false,
    business,
    business_value: business || "Customer",
    sms_opt_in: Boolean(customerRow.sms_opt_in),
    account_source: "customers",
  };
}

/**
 * POST /auth/lookup
 * Dual-table sign-in lookup:
 * 1. First checks `users_table` (Staff) -> if found, returns auth_method = 'OTP_6_DIGIT'
 * 2. If not found in `users_table`, checks `customers` table -> if found, returns auth_method = 'PASSWORD'
 */
router.post("/auth/lookup", async function (req, res, next) {
  try {
    const rawIdentifier = String(
      req.body?.identifier || req.body?.phone_number || req.body?.email || ""
    ).trim();

    if (!rawIdentifier) {
      return res
        .status(400)
        .json({ error: "Please enter your phone number or email address." });
    }

    const isEmail = rawIdentifier.includes("@");
    const dbPhone = normalizePhoneDigits(rawIdentifier);

    // 1. FIRST CHECK: users_table (Staff accounts sign in with 6-digit code)
    let staffResult;
    if (isEmail) {
      staffResult = await db.query(
        `SELECT * FROM users_table WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [rawIdentifier]
      );
    } else {
      if (dbPhone.length < 7) {
        return res
          .status(400)
          .json({ error: "Please enter a valid 10-digit phone number or email." });
      }
      staffResult = await db.query(
        `SELECT * FROM users_table
         WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
            OR phone_number = $2
         LIMIT 1`,
        [dbPhone, rawIdentifier]
      );
    }

    if (staffResult.rows.length > 0) {
      const staffUser = staffResult.rows[0];
      return res.json({
        found: true,
        source: "users_table",
        auth_method: "OTP_6_DIGIT",
        account: {
          ...staffUser,
          account_source: "users_table",
        },
      });
    }

    // 2. SECOND CHECK: customers table (Customer accounts are enterprise-wide and sign in with password)
    let custResult;
    if (isEmail) {
      custResult = await db.query(
        `SELECT * FROM customers
         WHERE LOWER(email) = LOWER($1)
         ORDER BY time_modified DESC NULLS LAST, id DESC LIMIT 1`,
        [rawIdentifier]
      );
    } else {
      custResult = await db.query(
        `SELECT * FROM customers
         WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
            OR phone_number = $2
         ORDER BY time_modified DESC NULLS LAST, id DESC LIMIT 1`,
        [dbPhone, rawIdentifier]
      );
    }

    if (custResult.rows.length > 0) {
      const customerRow = custResult.rows[0];
      return res.json({
        found: true,
        source: "customers",
        auth_method: "PASSWORD",
        has_password: Boolean(customerRow.password_hash),
        account: toCustomerSessionProfile(customerRow),
      });
    }

    return res.json({
      found: false,
      source: null,
      auth_method: null,
      message: "No account found with those details. Please create an account to continue.",
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/customer/login
 * Customer signs in with password against `customers` table.
 */
router.post("/auth/customer/login", async function (req, res, next) {
  try {
    const rawIdentifier = String(
      req.body?.identifier || req.body?.phone_number || req.body?.email || ""
    ).trim();
    const password = String(req.body?.password || "");
    const customerGuid = String(req.body?.customer_guid || "").trim();

    if (!password) {
      return res.status(400).json({ error: "Password is required for customer sign in." });
    }

    let custResult;
    if (customerGuid) {
      custResult = await db.query(
        `SELECT * FROM customers WHERE customer_guid = $1 LIMIT 1`,
        [customerGuid]
      );
    } else if (rawIdentifier.includes("@")) {
      custResult = await db.query(
        `SELECT * FROM customers
         WHERE LOWER(email) = LOWER($1)
         ORDER BY time_modified DESC NULLS LAST, id DESC LIMIT 1`,
        [rawIdentifier]
      );
    } else {
      const dbPhone = normalizePhoneDigits(rawIdentifier);
      custResult = await db.query(
        `SELECT * FROM customers
         WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
            OR phone_number = $2
         ORDER BY time_modified DESC NULLS LAST, id DESC LIMIT 1`,
        [dbPhone, rawIdentifier]
      );
    }

    if (!custResult || custResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer account not found." });
    }

    const customerRow = custResult.rows[0];

    // If customer row was created earlier via guest checkout without a password, set their password now
    if (!customerRow.password_hash) {
      const newHash = hashCustomerPassword(password);
      await db.query(
        `UPDATE customers SET password_hash = $1, time_modified = CURRENT_TIMESTAMP WHERE customer_guid = $2`,
        [newHash, customerRow.customer_guid]
      );
    } else if (!verifyCustomerPassword(password, customerRow.password_hash)) {
      return res.status(401).json({ error: "Invalid password. Please try again." });
    }

    const sessionProfile = toCustomerSessionProfile(customerRow);
    userProfiles[sessionProfile.user_guid] = sessionProfile;

    return res.json({
      success: true,
      source: "customers",
      auth_method: "PASSWORD",
      profile: sessionProfile,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/customer/signup
 * Account created from Sign Up page goes strictly to `customers` table (never `users_table`).
 */
router.post("/auth/customer/signup", async function (req, res, next) {
  try {
    const first_name = String(req.body?.first_name || "").trim();
    const last_name = String(req.body?.last_name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const rawPhone = String(req.body?.phone_number || "").trim();
    const dbPhone = normalizePhoneDigits(rawPhone);
    const password = String(req.body?.password || "");
    const business = req.body?.business ? String(req.body.business).trim() : null;
    const sms_opt_in = Boolean(req.body?.sms_opt_in);

    if (!first_name || !last_name || !email || !dbPhone || !password) {
      return res.status(400).json({
        error:
          "First name, last name, email, 10-digit phone number, and password are required.",
      });
    }
    if (dbPhone.length !== 10) {
      return res
        .status(400)
        .json({ error: "Please enter a valid 10-digit phone number." });
    }
    if (password.length < 4) {
      return res
        .status(400)
        .json({ error: "Password must be at least 4 characters." });
    }

    const passwordHash = hashCustomerPassword(password);

    // Customer information is enterprise-wide (not tied to a business)
    const existingRes = await db.query(
      `SELECT * FROM customers
       WHERE LOWER(email) = LOWER($1)
          OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $2
       ORDER BY time_modified DESC NULLS LAST, id DESC
       LIMIT 1`,
      [email, dbPhone]
    );

    let customerRow;
    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (existing.password_hash) {
        return res.status(409).json({
          error:
            "An account with this email or phone number already exists. Please sign in with your password.",
        });
      }
      const updated = await db.query(
        `UPDATE customers
         SET first_name = $1,
             last_name = $2,
             email = $3,
             phone_number = $4,
             password_hash = $5,
             sms_opt_in = $6,
             time_modified = CURRENT_TIMESTAMP
         WHERE customer_guid = $7
         RETURNING *`,
        [
          first_name,
          last_name,
          email,
          dbPhone,
          passwordHash,
          sms_opt_in,
          existing.customer_guid,
        ]
      );
      customerRow = updated.rows[0];
    } else {
      const customerGuid = `cust_${Date.now().toString(36)}_${crypto
        .randomBytes(4)
        .toString("hex")}`;
      const inserted = await db.query(
        `INSERT INTO customers
          (customer_guid, business, first_name, last_name, email, phone_number, password_hash, sms_opt_in, time_created, time_modified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          customerGuid,
          business,
          first_name,
          last_name,
          email,
          dbPhone,
          passwordHash,
          sms_opt_in,
        ]
      );
      customerRow = inserted.rows[0];
    }

    const sessionProfile = toCustomerSessionProfile(customerRow);
    userProfiles[sessionProfile.user_guid] = sessionProfile;

    return res.status(201).json({
      success: true,
      created: true,
      source: "customers",
      table: "customers",
      profile: sessionProfile,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/profile/:user_guid", function (req, res, next) {
  try {
    const { user_guid } = req.params;
    const profile = req.body;
    if (!profile || Object.keys(profile).length === 0) {
      delete userProfiles[user_guid];
      return res.json({ success: true, profile: null });
    }

    // Use the value of business from the returned user object
    const businessValue = profile.business || "Standard Customer";
    profile.business_value = businessValue;

    userProfiles[user_guid] = profile;

    return res.json({ success: true, profile: userProfiles[user_guid] });
  } catch (err) {
    return next(err);
  }
});

router.get("/profile/:user_guid", async function (req, res, next) {
  try {
    const { user_guid } = req.params;

    // 1. First check users_table (Staff) so role revocations or permission_group changes apply immediately
    const result = await db.query(
      "SELECT * FROM users_table WHERE user_guid = $1",
      [user_guid]
    );

    if (result.rows.length > 0) {
      const profile = result.rows[0];
      if (profile.business) {
        try {
          profile.business_info = await getBusinessRecord({ business: profile.business });
        } catch {}
      }
      const businessValue = profile.business || "Standard Customer";
      profile.business_value = businessValue;
      profile.account_source = "users_table";
      userProfiles[user_guid] = profile;

      return res.json(profile);
    }

    // 2. If not found in users_table, check customers table
    const custResult = await db.query(
      "SELECT * FROM customers WHERE customer_guid = $1 LIMIT 1",
      [user_guid]
    );

    if (custResult.rows.length > 0) {
      const custProfile = toCustomerSessionProfile(custResult.rows[0]);
      userProfiles[user_guid] = custProfile;
      return res.json(custProfile);
    }

    if (userProfiles[user_guid]) {
      return res.json(userProfiles[user_guid]);
    }

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
      return res.json(activeUser);
    }
    return res.json(null);
  } catch (err) {
    return next(err);
  }
});

// ==========================================
// WhatsApp-Style Device Linking Endpoints
// ==========================================
const deviceLinkService = require("../services/deviceLinkService");

/** Secondary device requests a link ticket (shows QR code and pair code) */
router.post("/device-link/ticket", function (req, res, next) {
  try {
    const ticket = deviceLinkService.createTicket(req.body);
    return res.json(ticket);
  } catch (err) {
    return next(err);
  }
});

/** Check status of a pairing ticket */
router.get("/device-link/ticket/:id", function (req, res, next) {
  try {
    const ticket = deviceLinkService.findTicket(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found or expired" });
    }
    return res.json(ticket);
  } catch (err) {
    return next(err);
  }
});

/** Primary device (logged in) approves the device link */
router.post("/device-link/approve", function (req, res, next) {
  try {
    const { identifier, userGuid, deviceName, userProfile, deviceType } = req.body;
    if (!identifier || !userGuid) {
      return res.status(400).json({ error: "Missing identifier or userGuid" });
    }
    // Prevent child/linked devices from approving other devices
    if (userProfile?.isLinkedDevice) {
      return res.status(403).json({ error: "Linked (child) devices cannot authorize other devices." });
    }
    // Prevent customer accounts from linking or authorizing devices
    if (
      userProfile?.permission_group?.toLowerCase() === "customer" ||
      userProfile?.account_source === "customers"
    ) {
      return res.status(403).json({ error: "Device linking is only available for staff members." });
    }
    const result = deviceLinkService.approveTicket({
      identifier,
      userGuid,
      deviceName,
      userProfile,
      deviceType,
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/** Linked device activity heartbeat (resets 1-hour inactivity timer) */
router.post("/device-link/touch", function (req, res, next) {
  try {
    const { deviceId } = req.body;
    const status = deviceLinkService.touchActivity(deviceId);
    return res.json(status);
  } catch (err) {
    return next(err);
  }
});

/** Check if a device session is still active (used by child devices) */
router.get("/device-link/status/:deviceId", function (req, res, next) {
  try {
    const active = deviceLinkService.isDeviceActive(req.params.deviceId);
    return res.json({ active });
  } catch (err) {
    return next(err);
  }
});

/** Get all currently active linked devices for a user */
router.get("/device-link/devices/:userGuid", function (req, res, next) {
  try {
    if (req.headers["x-is-linked-device"] === "true") {
      return res.status(403).json({ error: "Linked devices cannot view linked device list." });
    }
    const devices = deviceLinkService.getLinkedDevices(req.params.userGuid);
    return res.json(devices);
  } catch (err) {
    return next(err);
  }
});

/** Primary device revokes/logs out a linked device */
router.delete("/device-link/device/:userGuid/:deviceId", function (req, res, next) {
  try {
    const { userGuid, deviceId } = req.params;
    const success = deviceLinkService.revokeDevice(userGuid, deviceId);
    return res.json({ success });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;