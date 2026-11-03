/** Routes for users of pg-intro-demo. */

const crypto = require("crypto");
const db = require("../db");
const express = require("express");
const router = express.Router();
const { getBusinessRecord, upsertBusinessRecord } = require("../services/businessService");

/** When a Business_Owner (or legacy Supervisor) is saved in users_table, create/link their business in business_table. */
async function linkSupervisorBusiness(tableName, row) {
  const normGroup = String(row?.permission_group || "").toLowerCase();
  if (
    String(tableName).toLowerCase() !== "users_table" ||
    (normGroup !== "business_owner" && normGroup !== "supervisor") ||
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
    console.error("Failed to link business owner business:", err.message);
  }
}

const SCOPED_TABLES = [
  'events_table',
  'game_players_table',
  'puzzles_type',
  'reps_table',
  'users_table',
  'roles_table',
  'business_table',
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
  const isAdmin = req.headers['x-is-admin'] === 'true' || req.headers['x-is-admin'] === '1' || req.headers['x-user-role']?.toLowerCase() === 'admin';
  // Admin user does not own a business and can view all by default
  if (isAdmin && !filters.business) {
    return filters;
  }
  const headerBusiness = req.headers['x-tenant-business'] || req.headers['x-user-business'];
  if (STRICT_TENANT_TABLES.has(lower) && !filters.business && headerBusiness) {
    return { ...filters, business: headerBusiness };
  }
  return filters;
}

/**
 * GET /api/admin/business-owners
 * Returns all Business Owners for Admin filtering.
 * Each owner includes contact and address info (no business name required on frontend).
 */
router.get("/api/admin/business-owners", async function (req, res, next) {
  try {
    const result = await db.query(`
      SELECT u.user_guid, u.first_name, u.last_name, u.email, u.phone_number, u.address, u.business,
             COALESCE(b.business_name, u.business) AS business_name,
             b.physical_address, b.contact_phone, b.contact_email, b.city, b.state, b.country
      FROM users_table u
      LEFT JOIN business_table b ON LOWER(u.business) = LOWER(b.business)
      WHERE LOWER(u.permission_group) = 'business_owner' OR LOWER(u.permission_group) = 'supervisor'
      ORDER BY u.first_name ASC, u.last_name ASC
    `);
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

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



/**
 * GET /api/roles
 * Retrieve all roles defined in roles_table (metadata-driven).
 */
router.get("/api/roles", async function (req, res, next) {
  try {
    const results = await db.query(
      "SELECT id, role, description, is_elevated FROM roles_table ORDER BY id ASC"
    );
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

    if (String(tableName).toLowerCase() === "users_table") {
      if (fields.permission_group && String(fields.permission_group).toLowerCase() === "supervisor") {
        fields.permission_group = "Business_Owner";
      }
      if (!fields.role_id && fields.permission_group) {
        try {
          const roleRes = await db.query(
            "SELECT id FROM roles_table WHERE LOWER(role) = LOWER($1) LIMIT 1",
            [fields.permission_group]
          );
          if (roleRes.rows.length > 0) {
            fields.role_id = roleRes.rows[0].id;
          }
        } catch {}
      }
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

    if (String(tableName).toLowerCase() === "users_table") {
      if (fields.permission_group && String(fields.permission_group).toLowerCase() === "supervisor") {
        fields.permission_group = "Business_Owner";
      }
      if (fields.permission_group && !fields.role_id) {
        try {
          const roleRes = await db.query(
            "SELECT id FROM roles_table WHERE LOWER(role) = LOWER($1) LIMIT 1",
            [fields.permission_group]
          );
          if (roleRes.rows.length > 0) {
            fields.role_id = roleRes.rows[0].id;
          }
        } catch {}
      }
    }

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
const activeOtps = new Map();
router._activeOtps = activeOtps;

function normalizePhoneDigits(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

function maskPhone(rawPhone) {
  const digits = normalizePhoneDigits(rawPhone);
  if (!digits || digits.length < 4) return "***-***-****";
  const last4 = digits.slice(-4);
  const prefix = digits.length >= 7 ? digits.slice(0, 3) : "***";
  return `(${prefix}) ***-${last4}`;
}

function validatePasswordStrength(password) {
  const pwd = String(password || "");
  const minLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

  const errors = [];
  if (!minLength) errors.push("Password must be at least 8 characters long.");
  if (!hasUpper) errors.push("Password must contain at least 1 uppercase letter (A-Z).");
  if (!hasLower) errors.push("Password must contain at least 1 lowercase letter (a-z).");
  if (!hasNumber) errors.push("Password must contain at least 1 number (0-9).");
  if (!hasSpecial) errors.push("Password must contain at least 1 special character (!@#$%^&*...).");

  return {
    valid: errors.length === 0,
    errors,
    checks: { minLength, hasUpper, hasLower, hasNumber, hasSpecial }
  };
}

function normalizeOtpIdentifier(identifier) {
  const raw = String(identifier || "").trim().toLowerCase();
  if (raw.includes("@")) {
    return raw;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits || raw;
}

function generateAndStoreOtp(identifier, purpose, extra = {}) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const normalized = normalizeOtpIdentifier(identifier);
  const key = `${normalized}:${purpose}`;
  activeOtps.set(key, {
    code,
    identifier: normalized,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    ...extra
  });

  const recipientLabel = extra.name ? `${extra.name} <${identifier}>` : identifier;
  const phoneLabel = extra.phone ? ` | Phone: ${extra.phone}` : "";

  console.log("====================================================");
  console.log(`📱 [DEV OTP DISPATCH] Purpose: ${purpose.toUpperCase()}`);
  console.log(`   Recipient: ${recipientLabel}${phoneLabel}`);
  console.log(`   🔐 6-DIGIT VERIFICATION PIN: ${code}`);
  console.log(`   Expires in: 10 minutes`);
  console.log("====================================================");

  return code;
}

function verifyStoredOtp(identifier, purpose, code) {
  const normalized = normalizeOtpIdentifier(identifier);
  const key = `${normalized}:${purpose}`;
  const entry = activeOtps.get(key);
  if (!entry) {
    return {
      valid: false,
      error: "No verification code was requested, or the code has expired. Please request a new code."
    };
  }
  if (Date.now() > entry.expiresAt) {
    activeOtps.delete(key);
    return {
      valid: false,
      error: "Verification code has expired. Please request a new code."
    };
  }
  if (entry.attempts >= 3) {
    activeOtps.delete(key);
    return {
      valid: false,
      error: "Too many failed attempts. Please request a new code."
    };
  }
  if (String(entry.code).trim() !== String(code).trim()) {
    entry.attempts += 1;
    const remaining = 3 - entry.attempts;
    return {
      valid: false,
      error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
    };
  }

  // Code matches! Clear the used OTP
  activeOtps.delete(key);
  return { valid: true, entry };
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

function toStaffSessionProfile(staffRow) {
  const business = staffRow.business || null;
  return {
    id: staffRow.id,
    user_guid: staffRow.user_guid,
    first_name: staffRow.first_name,
    last_name: staffRow.last_name,
    email: staffRow.email,
    phone_number: staffRow.phone_number,
    address: staffRow.address || "",
    role_id: staffRow.role_id,
    permission_group: staffRow.permission_group,
    is_admin: Boolean(staffRow.is_admin),
    business,
    business_value: business || staffRow.permission_group,
    account_source: "users_table",
  };
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
 * 1. Checks `users_table` (Staff) ->
 *    - If no password_hash: returns auth_method = 'STAFF_FIRST_TIME' and sends initial OTP
 *    - If password_hash exists: returns auth_method = 'PASSWORD' (staff password prompt)
 * 2. Checks `customers` table -> returns auth_method = 'PASSWORD'
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

    // 1. FIRST CHECK: users_table (Staff)
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
      const hasPassword = Boolean(staffUser.password_hash);
      const maskedPhone = maskPhone(staffUser.phone_number);

      if (!hasPassword) {
        // First-time staff login: Generate and send 6-digit PIN
        const code = generateAndStoreOtp(rawIdentifier, "staff_first_time", {
          userGuid: staffUser.user_guid,
          phone: staffUser.phone_number,
          name: `${staffUser.first_name || ""} ${staffUser.last_name || ""}`.trim()
        });

        return res.json({
          found: true,
          source: "users_table",
          is_staff: true,
          is_first_time: true,
          auth_method: "STAFF_FIRST_TIME",
          dev_pin: code,
          masked_phone: maskedPhone,
          account: toStaffSessionProfile(staffUser),
          message: "Welcome to Triple Great! Please set your password and enter the 6-digit verification code sent to your phone."
        });
      }

      // Returning staff login: signs in with email/phone and password
      return res.json({
        found: true,
        source: "users_table",
        is_staff: true,
        is_first_time: false,
        auth_method: "PASSWORD",
        has_password: true,
        masked_phone: maskedPhone,
        account: toStaffSessionProfile(staffUser)
      });
    }

    // 2. SECOND CHECK: customers table
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
        is_staff: false,
        is_first_time: false,
        auth_method: "PASSWORD",
        has_password: Boolean(customerRow.password_hash),
        masked_phone: maskPhone(customerRow.phone_number),
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
 * POST /auth/staff/setup-password
 * First-time staff sign-in: sets strong password and verifies 6-digit PIN.
 */
router.post("/auth/staff/setup-password", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");
    const otp = String(req.body?.otp || "").trim();
    const userGuid = String(req.body?.user_guid || "").trim();

    if (!rawIdentifier || !password || !otp) {
      return res.status(400).json({ error: "Email/phone, password, and 6-digit verification code are required." });
    }

    // 1. Force strong password
    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({
        error: pwdCheck.errors[0] || "Password does not meet complexity requirements.",
        details: pwdCheck.errors
      });
    }

    // 2. Validate OTP
    const otpCheck = verifyStoredOtp(rawIdentifier, "staff_first_time", otp);
    if (!otpCheck.valid) {
      return res.status(400).json({ error: otpCheck.error });
    }

    // 3. Find user in users_table
    let query = "SELECT * FROM users_table WHERE user_guid = $1 LIMIT 1";
    let params = [userGuid];
    if (!userGuid) {
      if (rawIdentifier.includes("@")) {
        query = "SELECT * FROM users_table WHERE LOWER(email) = LOWER($1) LIMIT 1";
        params = [rawIdentifier];
      } else {
        const dbPhone = normalizePhoneDigits(rawIdentifier);
        query = "SELECT * FROM users_table WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1 LIMIT 1";
        params = [dbPhone];
      }
    }

    const staffRes = await db.query(query, params);
    if (staffRes.rows.length === 0) {
      return res.status(404).json({ error: "Staff account not found." });
    }

    const staffUser = staffRes.rows[0];

    // Restrict staff from reusing last password
    if (
      (staffUser.password_hash && verifyCustomerPassword(password, staffUser.password_hash)) ||
      (staffUser.last_password_hash && verifyCustomerPassword(password, staffUser.last_password_hash))
    ) {
      return res.status(400).json({
        error: "You cannot reuse your last password. Please choose a different password."
      });
    }

    const newHash = hashCustomerPassword(password);
    const prevHash = staffUser.password_hash || null;

    await db.query(
      `UPDATE users_table SET password_hash = $1, last_password_hash = $2 WHERE user_guid = $3`,
      [newHash, prevHash, staffUser.user_guid]
    );

    // Record password setup in supervisor_audit_logs
    try {
      const logGuid = `audit_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const logBusiness = String(staffUser.business || "all").trim();
      const entityRole = staffUser.permission_group || "Staff";
      const entityGuid = staffUser.user_guid;
      const actorIdentifier = staffUser.email || staffUser.phone_number || entityGuid;
      const actorName = `${staffUser.first_name || ""} ${staffUser.last_name || ""}`.trim() || actorIdentifier;

      const reason = `Initial password setup via 6-digit verification code by ${actorName} (${entityRole})`;
      const beforeState = {
        role: entityRole,
        account_type: "staff",
        has_previous_password: Boolean(prevHash),
        email: staffUser.email || null,
      };
      const afterState = {
        role: entityRole,
        account_type: "staff",
        status: "password_setup_successful",
        email: staffUser.email || null,
      };

      await db.query(
        `INSERT INTO supervisor_audit_logs 
          (log_guid, business, actor_guid, action, entity_type, entity_guid, reason, before_state, after_state, time_created)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        [
          logGuid,
          logBusiness,
          actorIdentifier,
          "PASSWORD_RESET",
          entityRole,
          entityGuid,
          reason,
          JSON.stringify(beforeState),
          JSON.stringify(afterState),
        ]
      );
    } catch (auditErr) {
      console.error("⚠️ Failed to record staff setup password in supervisor_audit_logs:", auditErr.message);
    }

    const sessionProfile = toStaffSessionProfile(staffUser);
    userProfiles[sessionProfile.user_guid] = sessionProfile;

    return res.json({
      success: true,
      message: "Password created successfully!",
      profile: sessionProfile
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/login
 * Validates identifier (email or phone) and password for either staff (users_table) or customer (customers).
 * If credentials are correct, generates a 6-digit OTP verification code for 2FA, logs it in console, and returns require_2fa: true.
 */
router.post("/auth/login", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: "Email or phone number and password are required." });
    }

    const isEmail = rawIdentifier.includes("@");
    const dbPhone = normalizePhoneDigits(rawIdentifier);

    // 1. Check users_table (staff, business owners, agents, admins)
    let staffQuery, staffParams;
    if (isEmail) {
      staffQuery = "SELECT * FROM users_table WHERE LOWER(email) = LOWER($1) LIMIT 1";
      staffParams = [rawIdentifier];
    } else {
      staffQuery = `SELECT * FROM users_table
                    WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
                       OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
                       OR phone_number = $2 LIMIT 1`;
      staffParams = [dbPhone, rawIdentifier];
    }

    const staffRes = await db.query(staffQuery, staffParams);
    if (staffRes.rows.length > 0) {
      const staffUser = staffRes.rows[0];

      if (!staffUser.password_hash) {
        const code = generateAndStoreOtp(rawIdentifier, "staff_first_time", {
          userGuid: staffUser.user_guid,
          phone: staffUser.phone_number,
          name: `${staffUser.first_name || ""} ${staffUser.last_name || ""}`.trim()
        });
        return res.status(400).json({
          error: "You have not set up a password yet. Please complete your first-time onboarding setup.",
          is_first_time: true,
          dev_pin: code,
          masked_phone: maskPhone(staffUser.phone_number)
        });
      }

      if (!verifyCustomerPassword(password, staffUser.password_hash)) {
        return res.status(401).json({ error: "Invalid email/phone or password. Please try again." });
      }

      // Password verified! Generate 6-digit 2FA verification code
      const code = generateAndStoreOtp(rawIdentifier, "staff_2fa", {
        userGuid: staffUser.user_guid,
        phone: staffUser.phone_number,
        name: `${staffUser.first_name || ""} ${staffUser.last_name || ""}`.trim()
      });

      return res.json({
        require_2fa: true,
        requires_2fa: true,
        dev_pin: code,
        user_guid: staffUser.user_guid,
        source: "users_table",
        masked_phone: maskPhone(staffUser.phone_number),
        message: "Password verified! Please enter the 6-digit verification code sent to your phone."
      });
    }

    // 2. Check customers table
    let custQuery, custParams;
    if (isEmail) {
      custQuery = `SELECT * FROM customers
                   WHERE LOWER(email) = LOWER($1)
                   ORDER BY time_modified DESC NULLS LAST, id DESC LIMIT 1`;
      custParams = [rawIdentifier];
    } else {
      custQuery = `SELECT * FROM customers
                   WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
                      OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
                      OR phone_number = $2
                   ORDER BY time_modified DESC NULLS LAST, id DESC LIMIT 1`;
      custParams = [dbPhone, rawIdentifier];
    }

    const custRes = await db.query(custQuery, custParams);
    if (custRes.rows.length > 0) {
      const customerRow = custRes.rows[0];

      if (!customerRow.password_hash) {
        const newHash = hashCustomerPassword(password);
        await db.query(
          `UPDATE customers SET password_hash = $1, time_modified = CURRENT_TIMESTAMP WHERE customer_guid = $2`,
          [newHash, customerRow.customer_guid]
        );
      } else if (!verifyCustomerPassword(password, customerRow.password_hash)) {
        return res.status(401).json({ error: "Invalid email/phone or password. Please try again." });
      }

      // Password verified! Generate 6-digit 2FA verification code
      const code = generateAndStoreOtp(rawIdentifier, "customer_2fa", {
        customerGuid: customerRow.customer_guid,
        phone: customerRow.phone_number,
        email: customerRow.email,
        name: `${customerRow.first_name || ""} ${customerRow.last_name || ""}`.trim()
      });

      return res.json({
        require_2fa: true,
        requires_2fa: true,
        dev_pin: code,
        customer_guid: customerRow.customer_guid,
        user_guid: customerRow.customer_guid,
        source: "customers",
        masked_phone: maskPhone(customerRow.phone_number),
        message: "Password verified! Please enter the 6-digit verification code sent to your phone or email."
      });
    }

    return res.status(404).json({ error: "No account found with those details. Please create an account to continue." });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/verify-2fa
 * Validates 6-digit verification code after successful password submission.
 */
router.post("/auth/verify-2fa", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const userGuid = String(req.body?.user_guid || "").trim();
    const customerGuid = String(req.body?.customer_guid || "").trim();
    const source = String(req.body?.source || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!otp) {
      return res.status(400).json({ error: "6-digit verification code is required." });
    }

    if (source === "customers" || customerGuid) {
      const otpCheck = verifyStoredOtp(rawIdentifier, "customer_2fa", otp);
      if (!otpCheck.valid) {
        return res.status(400).json({ error: otpCheck.error });
      }

      const cRes = await db.query(
        `SELECT * FROM customers WHERE customer_guid = $1 LIMIT 1`,
        [customerGuid || userGuid]
      );
      if (cRes.rows.length === 0) {
        return res.status(404).json({ error: "Customer account not found." });
      }

      const sessionProfile = toCustomerSessionProfile(cRes.rows[0]);
      userProfiles[sessionProfile.user_guid] = sessionProfile;

      return res.json({
        success: true,
        source: "customers",
        profile: sessionProfile
      });
    } else {
      const otpCheck = verifyStoredOtp(rawIdentifier, "staff_2fa", otp);
      if (!otpCheck.valid) {
        return res.status(400).json({ error: otpCheck.error });
      }

      let query = "SELECT * FROM users_table WHERE user_guid = $1 LIMIT 1";
      let params = [userGuid];
      if (!userGuid) {
        if (rawIdentifier.includes("@")) {
          query = "SELECT * FROM users_table WHERE LOWER(email) = LOWER($1) LIMIT 1";
          params = [rawIdentifier];
        } else {
          const dbPhone = normalizePhoneDigits(rawIdentifier);
          query = "SELECT * FROM users_table WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1 LIMIT 1";
          params = [dbPhone];
        }
      }

      const staffRes = await db.query(query, params);
      if (staffRes.rows.length === 0) {
        return res.status(404).json({ error: "Staff account not found." });
      }

      const staffUser = staffRes.rows[0];
      const sessionProfile = toStaffSessionProfile(staffUser);
      userProfiles[sessionProfile.user_guid] = sessionProfile;

      return res.json({
        success: true,
        source: "users_table",
        profile: sessionProfile
      });
    }
  } catch (err) {
    return next(err);
  }
});

router.post("/auth/customer/verify-2fa", async function (req, res, next) {
  req.body = { ...req.body, source: "customers" };
  return router.handle(req, res, next);
});

/**
 * POST /auth/staff/login
 * Staff signs in with identifier + password.
 * On success, generates and sends a 6-digit PIN for 2FA.
 */
router.post("/auth/staff/login", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: "Email or phone number and password are required." });
    }

    const isEmail = rawIdentifier.includes("@");
    let query, params;
    if (isEmail) {
      query = "SELECT * FROM users_table WHERE LOWER(email) = LOWER($1) LIMIT 1";
      params = [rawIdentifier];
    } else {
      const dbPhone = normalizePhoneDigits(rawIdentifier);
      query = `SELECT * FROM users_table
               WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
                  OR phone_number = $2 LIMIT 1`;
      params = [dbPhone, rawIdentifier];
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff account not found." });
    }

    const staffUser = result.rows[0];

    // If staff has no password yet, direct them to setup
    if (!staffUser.password_hash) {
      return res.status(400).json({
        error: "You have not set up a password yet. Please complete your first-time onboarding setup.",
        is_first_time: true
      });
    }

    // Verify password
    if (!verifyCustomerPassword(password, staffUser.password_hash)) {
      return res.status(401).json({ error: "Invalid password. Please try again or reset your password." });
    }

    // Password verified! Requirement: "if user is a staff send 6 digit pin to phone number. remember we still console log our pin since this is under development."
    const code = generateAndStoreOtp(rawIdentifier, "staff_2fa", {
      userGuid: staffUser.user_guid,
      phone: staffUser.phone_number,
      name: `${staffUser.first_name || ""} ${staffUser.last_name || ""}`.trim()
    });

    return res.json({
      require_2fa: true,
      requires_2fa: true,
      dev_pin: code,
      user_guid: staffUser.user_guid,
      masked_phone: maskPhone(staffUser.phone_number),
      message: "Password verified! Please enter the 6-digit verification code sent to your phone."
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/staff/verify-2fa
 * Validates 6-digit PIN for staff sign-in 2FA.
 */
router.post("/auth/staff/verify-2fa", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const userGuid = String(req.body?.user_guid || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!otp) {
      return res.status(400).json({ error: "6-digit verification code is required." });
    }

    const otpCheck = verifyStoredOtp(rawIdentifier, "staff_2fa", otp);
    if (!otpCheck.valid) {
      return res.status(400).json({ error: otpCheck.error });
    }

    let query = "SELECT * FROM users_table WHERE user_guid = $1 LIMIT 1";
    let params = [userGuid];
    if (!userGuid) {
      if (rawIdentifier.includes("@")) {
        query = "SELECT * FROM users_table WHERE LOWER(email) = LOWER($1) LIMIT 1";
        params = [rawIdentifier];
      } else {
        const dbPhone = normalizePhoneDigits(rawIdentifier);
        query = "SELECT * FROM users_table WHERE REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1 LIMIT 1";
        params = [dbPhone];
      }
    }

    const staffRes = await db.query(query, params);
    if (staffRes.rows.length === 0) {
      return res.status(404).json({ error: "Staff account not found." });
    }

    const staffUser = staffRes.rows[0];
    const sessionProfile = toStaffSessionProfile(staffUser);
    userProfiles[sessionProfile.user_guid] = sessionProfile;

    return res.json({
      success: true,
      profile: sessionProfile
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/resend-otp
 * Resend a new 6-digit PIN for first-time setup, 2FA, or password reset.
 */
router.post("/auth/resend-otp", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const purpose = String(req.body?.purpose || "staff_2fa").trim();

    if (!rawIdentifier) {
      return res.status(400).json({ error: "Identifier is required." });
    }

    const isEmail = rawIdentifier.includes("@");
    let phone = "", name = "";

    if (isEmail) {
      const uRes = await db.query("SELECT * FROM users_table WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1", [rawIdentifier]);
      if (uRes.rows.length > 0) {
        phone = uRes.rows[0].phone_number;
        name = `${uRes.rows[0].first_name || ""} ${uRes.rows[0].last_name || ""}`.trim();
      } else {
        const cRes = await db.query("SELECT * FROM customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1", [rawIdentifier]);
        if (cRes.rows.length > 0) {
          phone = cRes.rows[0].phone_number;
          name = `${cRes.rows[0].first_name || ""} ${cRes.rows[0].last_name || ""}`.trim();
        }
      }
    } else {
      const dbPhone = normalizePhoneDigits(rawIdentifier);
      const uRes = await db.query(
        `SELECT * FROM users_table 
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
            OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
            OR phone_number = $2
         LIMIT 1`,
        [dbPhone, rawIdentifier]
      );
      if (uRes.rows.length > 0) {
        phone = uRes.rows[0].phone_number;
        name = `${uRes.rows[0].first_name || ""} ${uRes.rows[0].last_name || ""}`.trim();
      } else {
        const cRes = await db.query(
          `SELECT * FROM customers 
           WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
              OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
              OR phone_number = $2
           LIMIT 1`,
          [dbPhone, rawIdentifier]
        );
        if (cRes.rows.length > 0) {
          phone = cRes.rows[0].phone_number;
          name = `${cRes.rows[0].first_name || ""} ${cRes.rows[0].last_name || ""}`.trim();
        }
      }
    }

    const code = generateAndStoreOtp(rawIdentifier, purpose, { phone, name });

    return res.json({
      success: true,
      dev_pin: code,
      masked_phone: maskPhone(phone || rawIdentifier),
      message: "A new 6-digit verification code has been dispatched."
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /auth/forgot-password
 * Initiates password reset by sending a 6-digit PIN to validate account ownership.
 */
router.post("/auth/forgot-password", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    console.log(`\n🔍 [AUTH FORGOT-PASSWORD] Requested password reset for: "${rawIdentifier}"`);

    if (!rawIdentifier) {
      return res.status(400).json({ error: "Please enter your email address or phone number." });
    }

    const isEmail = rawIdentifier.includes("@");
    let userRow = null;
    let source = null;

    // Check staff in users_table
    if (isEmail) {
      const sRes = await db.query(
        "SELECT * FROM users_table WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1",
        [rawIdentifier]
      );
      if (sRes.rows.length > 0) {
        userRow = sRes.rows[0];
        source = "users_table";
      }
    } else {
      const dbPhone = normalizePhoneDigits(rawIdentifier);
      const sRes = await db.query(
        `SELECT * FROM users_table 
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
            OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
            OR phone_number = $2
         LIMIT 1`,
        [dbPhone, rawIdentifier]
      );
      if (sRes.rows.length > 0) {
        userRow = sRes.rows[0];
        source = "users_table";
      }
    }

    // Check customers table
    if (!userRow) {
      if (isEmail) {
        const cRes = await db.query(
          "SELECT * FROM customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1",
          [rawIdentifier]
        );
        if (cRes.rows.length > 0) {
          userRow = cRes.rows[0];
          source = "customers";
        }
      } else {
        const dbPhone = normalizePhoneDigits(rawIdentifier);
        const cRes = await db.query(
          `SELECT * FROM customers 
           WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
              OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
              OR phone_number = $2
           LIMIT 1`,
          [dbPhone, rawIdentifier]
        );
        if (cRes.rows.length > 0) {
          userRow = cRes.rows[0];
          source = "customers";
        }
      }
    }

    if (!userRow) {
      console.warn(`⚠️ [AUTH FORGOT-PASSWORD] No account found in users_table or customers for: "${rawIdentifier}"`);
      return res.status(404).json({ error: "No account found with this email or phone number." });
    }

    console.log(`✅ [AUTH FORGOT-PASSWORD] Found ${source} account for "${rawIdentifier}" (${userRow.first_name} ${userRow.last_name})`);

    // Generate 6-digit PIN for password reset
    const code = generateAndStoreOtp(rawIdentifier, "password_reset", {
      source,
      userGuid: userRow.user_guid || userRow.customer_guid,
      phone: userRow.phone_number,
      name: `${userRow.first_name || ""} ${userRow.last_name || ""}`.trim()
    });

    return res.json({
      success: true,
      source,
      dev_pin: code,
      masked_phone: maskPhone(userRow.phone_number),
      message: "A 6-digit verification code has been sent to your phone/email to verify ownership of your account."
    });
  } catch (err) {
    console.error("❌ [AUTH FORGOT-PASSWORD] Error:", err);
    return next(err);
  }
});

/**
 * POST /auth/verify-reset-code
 * Verifies the 6-digit PIN before allowing the user to set a new password.
 */
router.post("/auth/verify-reset-code", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!rawIdentifier || !otp) {
      return res.status(400).json({ error: "Identifier and 6-digit verification code are required." });
    }

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "Please enter a valid 6-digit numeric verification code." });
    }

    const normalized = normalizeOtpIdentifier(rawIdentifier);
    const key = `${normalized}:password_reset`;
    const entry = activeOtps.get(key);

    if (!entry) {
      return res.status(400).json({
        error: "No verification code was requested, or the code has expired. Please request a new code."
      });
    }

    if (Date.now() > entry.expiresAt) {
      activeOtps.delete(key);
      return res.status(400).json({
        error: "Verification code has expired. Please request a new code."
      });
    }

    if (entry.attempts >= 3) {
      activeOtps.delete(key);
      return res.status(400).json({
        error: "Too many failed attempts. Please request a new code."
      });
    }

    if (String(entry.code).trim() !== String(otp).trim()) {
      entry.attempts += 1;
      const remaining = 3 - entry.attempts;
      return res.status(400).json({
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
      });
    }

    // Code matches! Mark as verified and generate a secure reset token
    const resetToken = crypto.randomBytes(24).toString("hex");
    entry.verified = true;
    entry.resetToken = resetToken;
    entry.verifiedAt = Date.now();

    console.log(`✅ [AUTH VERIFY-RESET-CODE] Identity verified for: "${rawIdentifier}"`);

    return res.json({
      success: true,
      reset_token: resetToken,
      message: "Identity verified successfully. You may now enter your new password."
    });
  } catch (err) {
    console.error("❌ [AUTH VERIFY-RESET-CODE] Error:", err);
    return next(err);
  }
});

/**
 * POST /auth/reset-password
 * Completes password reset by validating 6-digit PIN and enforcing strong password.
 */
router.post("/auth/reset-password", async function (req, res, next) {
  try {
    const rawIdentifier = String(req.body?.identifier || "").trim();
    const otp = String(req.body?.otp || "").trim();
    const resetToken = String(req.body?.reset_token || "").trim();
    const newPassword = String(req.body?.new_password || "");

    if (!rawIdentifier || (!otp && !resetToken) || !newPassword) {
      return res.status(400).json({ error: "Identifier, verification confirmation, and new password are required." });
    }

    // 1. Force strong password
    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({
        error: pwdCheck.errors[0] || "Password does not meet complexity requirements.",
        details: pwdCheck.errors
      });
    }

    // 2. Validate OTP / verification status
    const normalized = normalizeOtpIdentifier(rawIdentifier);
    const key = `${normalized}:password_reset`;
    const entry = activeOtps.get(key);

    let otpValid = false;
    let otpError = "Verification code has expired or is invalid. Please request a new code.";

    if (entry) {
      if (Date.now() > entry.expiresAt) {
        activeOtps.delete(key);
        otpError = "Verification code has expired. Please request a new code.";
      } else if (entry.verified && ((resetToken && entry.resetToken === resetToken) || (otp && String(entry.code).trim() === otp))) {
        otpValid = true;
      } else {
        const otpCheck = verifyStoredOtp(rawIdentifier, "password_reset", otp);
        if (otpCheck.valid) {
          otpValid = true;
        } else {
          otpError = otpCheck.error;
        }
      }
    } else {
      // Fallback check
      const otpCheck = verifyStoredOtp(rawIdentifier, "password_reset", otp);
      if (otpCheck.valid) {
        otpValid = true;
      } else {
        otpError = otpCheck.error;
      }
    }

    if (!otpValid) {
      return res.status(400).json({ error: otpError });
    }

    // 3. Find account in users_table or customers
    const isEmail = rawIdentifier.includes("@");
    let targetType = null; // 'staff' | 'customer'
    let account = null;

    if (isEmail) {
      const uRes = await db.query(
        "SELECT * FROM users_table WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1",
        [rawIdentifier]
      );
      if (uRes.rows.length > 0) {
        targetType = "staff";
        account = uRes.rows[0];
      }
    } else {
      const dbPhone = normalizePhoneDigits(rawIdentifier);
      const uRes = await db.query(
        `SELECT * FROM users_table 
         WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
            OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
         LIMIT 1`,
        [dbPhone]
      );
      if (uRes.rows.length > 0) {
        targetType = "staff";
        account = uRes.rows[0];
      }
    }

    if (!account) {
      if (isEmail) {
        const cRes = await db.query(
          "SELECT * FROM customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1",
          [rawIdentifier]
        );
        if (cRes.rows.length > 0) {
          targetType = "customer";
          account = cRes.rows[0];
        }
      } else {
        const dbPhone = normalizePhoneDigits(rawIdentifier);
        const cRes = await db.query(
          `SELECT * FROM customers 
           WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = RIGHT($1, 10)
              OR REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
           LIMIT 1`,
          [dbPhone]
        );
        if (cRes.rows.length > 0) {
          targetType = "customer";
          account = cRes.rows[0];
        }
      }
    }

    if (!account) {
      return res.status(404).json({ error: "Account could not be found to reset password." });
    }

    // 4. RESTRICT USER FROM REUSING LAST PASSWORD
    const isReusingCurrent = account.password_hash && verifyCustomerPassword(newPassword, account.password_hash);
    const isReusingPrevious = account.last_password_hash && verifyCustomerPassword(newPassword, account.last_password_hash);

    if (isReusingCurrent || isReusingPrevious) {
      return res.status(400).json({
        error: "You cannot reuse your last password. Please choose a different password."
      });
    }

    // 5. Update password hash and preserve previous password in last_password_hash
    const newHash = hashCustomerPassword(newPassword);
    const prevHash = account.password_hash || null;

    let sessionProfile;

    if (targetType === "staff") {
      const uRes = await db.query(
        `UPDATE users_table SET password_hash = $1, last_password_hash = $2 WHERE user_guid = $3 RETURNING *`,
        [newHash, prevHash, account.user_guid]
      );
      const updatedStaff = uRes.rows[0] || account;
      sessionProfile = toStaffSessionProfile(updatedStaff);
    } else {
      const cRes = await db.query(
        `UPDATE customers SET password_hash = $1, last_password_hash = $2, time_modified = CURRENT_TIMESTAMP WHERE customer_guid = $3 RETURNING *`,
        [newHash, prevHash, account.customer_guid]
      );
      const updatedCust = cRes.rows[0] || account;
      sessionProfile = toCustomerSessionProfile(updatedCust);
    }

    // Register active session profile so user is immediately signed in
    userProfiles[sessionProfile.user_guid] = sessionProfile;

    // 6. Record password reset in supervisor_audit_logs
    try {
      const logGuid = `audit_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const logBusiness = String(account.business || (targetType === "customer" ? "customers" : "all")).trim();
      const entityRole = targetType === "customer" 
        ? "Customer" 
        : (account.permission_group || "Staff");
      const entityGuid = targetType === "customer" ? account.customer_guid : account.user_guid;
      const actorIdentifier = account.email || account.phone_number || entityGuid;
      const actorName = `${account.first_name || ""} ${account.last_name || ""}`.trim() || actorIdentifier;

      const reason = `Password reset via 6-digit verification code by ${actorName} (${entityRole})`;
      const beforeState = {
        role: entityRole,
        account_type: targetType,
        has_previous_password: Boolean(prevHash),
        email: account.email || null,
        phone_number: account.phone_number || null,
      };
      const afterState = {
        role: entityRole,
        account_type: targetType,
        status: "password_reset_successful",
        reset_method: resetToken ? "verified_reset_token" : "verified_otp",
        email: account.email || null,
        phone_number: account.phone_number || null,
      };

      await db.query(
        `INSERT INTO supervisor_audit_logs 
          (log_guid, business, actor_guid, action, entity_type, entity_guid, reason, before_state, after_state, time_created)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        [
          logGuid,
          logBusiness,
          actorIdentifier,
          "PASSWORD_RESET",
          entityRole,
          entityGuid,
          reason,
          JSON.stringify(beforeState),
          JSON.stringify(afterState),
        ]
      );
    } catch (auditErr) {
      console.error("⚠️ Failed to record password reset in supervisor_audit_logs:", auditErr.message);
    }

    // Clear active OTP / resetToken session after successful reset
    activeOtps.delete(key);

    return res.json({
      success: true,
      message: "Your password has been successfully reset! You are now signed in.",
      profile: sessionProfile
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
    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({
        error: pwdCheck.errors[0] || "Password does not meet complexity requirements.",
        details: pwdCheck.errors
      });
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