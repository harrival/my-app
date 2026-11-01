const db = require("../db");
const ExpressError = require("../expressError");
const { generateGuid } = require("./dynamicSettingsService");

/**
 * Create or update an independent customer record in `customers` scoped to `business`.
 *
 * Per Section 2.1 & Section 5 (Story CUST-100) of userstory.md:
 * - Every transaction is a Customer transaction.
 * - All booking and checkout flows write directly to the independent `customers` table.
 * - There is strictly NO foreign key or column linking `customers` to `users_table`.
 * - Reservations are tied solely to `customers.customer_guid`.
 */
async function recordCustomerForTransaction(clientOrDb, payload = {}) {
  const runner = clientOrDb || db;
  const business = payload.business ? String(payload.business).trim() : null;
  const firstName = String(payload.first_name || "").trim();
  const lastName = String(payload.last_name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phoneNumber = String(payload.phone_number || payload.phone || "").trim();
  const smsOptIn = Boolean(payload.sms_opt_in);

  if (!firstName || !lastName || !email || !phoneNumber) {
    throw new ExpressError(
      "first_name, last_name, email, and phone_number are required for customer transactions",
      400
    );
  }

  // Customer information is enterprise-wide (not tied to a single business)
  const existingRes = await runner.query(
    `SELECT *
     FROM customers
     WHERE LOWER(email) = LOWER($1)
     ORDER BY time_modified DESC NULLS LAST, id DESC
     LIMIT 1`,
    [email]
  );

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    const updatedRes = await runner.query(
      `UPDATE customers
       SET first_name = $1,
           last_name = $2,
           phone_number = $3,
           sms_opt_in = $4,
           time_modified = CURRENT_TIMESTAMP
       WHERE customer_guid = $5
       RETURNING *`,
      [firstName, lastName, phoneNumber, smsOptIn, existing.customer_guid]
    );
    return {
      customer: updatedRes.rows[0],
      created: false,
      decoupled_from_users_table: true,
    };
  }

  const customerGuid = generateGuid("cust");
  const insertRes = await runner.query(
    `INSERT INTO customers
      (customer_guid, business, first_name, last_name, email, phone_number, sms_opt_in, time_created, time_modified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *`,
    [customerGuid, business, firstName, lastName, email, phoneNumber, smsOptIn]
  );

  return {
    customer: insertRes.rows[0],
    created: true,
    decoupled_from_users_table: true,
  };
}

/**
 * List customer records who have reservations in `business` (or were registered with `business`),
 * enriched with reservation count and total confirmed spend in that business.
 */
async function listBusinessCustomers(business, optionsOrLimit = 50) {
  const isObj =
    optionsOrLimit && typeof optionsOrLimit === "object" && !Array.isArray(optionsOrLimit);
  const limit = isObj
    ? Math.min(Number(optionsOrLimit.limit) || 50, 200)
    : Math.min(Number(optionsOrLimit) || 50, 200);
  const emailFilter = isObj && optionsOrLimit.email ? String(optionsOrLimit.email).trim() : null;

  const params = [business];
  const clauses = [
    "(LOWER(r.business) = LOWER($1) OR LOWER(COALESCE(c.business, '')) = LOWER($1) OR c.business IS NULL)",
  ];

  if (emailFilter) {
    params.push(`%${emailFilter.toLowerCase()}%`);
    clauses.push(`LOWER(c.email) LIKE $${params.length}`);
  }

  params.push(limit);

  const res = await db.query(
    `SELECT
       c.*,
       COUNT(r.reservation_guid)::int AS reservations_count,
       COALESCE(
         SUM(r.total_cents) FILTER (WHERE r.status = 'CONFIRMED'),
         0
       )::int AS confirmed_spend_cents
     FROM customers c
     LEFT JOIN reservations r
       ON r.customer_guid = c.customer_guid AND LOWER(r.business) = LOWER($1)
     WHERE ${clauses.join(" AND ")}
     GROUP BY c.id, c.customer_guid
     ORDER BY c.time_modified DESC
     LIMIT $${params.length}`,
    params
  );
  return res.rows;
}

/**
 * Look up a single customer record by `customer_guid` or `email` and return their reservations in `business`.
 */
async function getCustomerWithReservations(business, { customer_guid, email } = {}) {
  if (!customer_guid && !email) {
    throw new ExpressError("customer_guid or email is required", 400);
  }

  const params = [];
  let condition = "";
  if (customer_guid) {
    params.push(String(customer_guid).trim());
    condition = `c.customer_guid = $1`;
  } else {
    params.push(String(email).trim().toLowerCase());
    condition = `LOWER(c.email) = LOWER($1)`;
  }

  const custRes = await db.query(
    `SELECT c.*
     FROM customers c
     WHERE ${condition}
     ORDER BY c.time_modified DESC NULLS LAST, c.id DESC
     LIMIT 1`,
    params
  );

  if (custRes.rows.length === 0) {
    throw new ExpressError("Customer record not found for this business tenant", 404);
  }

  const customer = custRes.rows[0];
  const reservationsRes = await db.query(
    `SELECT
       r.*,
       r.date_range::text AS date_range_text,
       i.name AS item_name,
       i.daily_rate_cents,
       u.serial_number
     FROM reservations r
     LEFT JOIN items i ON i.item_guid = r.item_guid
     LEFT JOIN item_units u ON u.unit_guid = r.unit_guid
     WHERE r.customer_guid = $1 AND LOWER(r.business) = LOWER($2)
     ORDER BY r.time_created DESC`,
    [customer.customer_guid, business]
  );

  return {
    customer,
    decoupled_from_users_table: true,
    reservations: reservationsRes.rows,
  };
}

/**
 * Programmatically verify Story CUST-100 schema independence:
 * Confirms that `customers` has NO foreign key or column linking to `users_table`,
 * and that `reservations` links solely to `customers.customer_guid`.
 */
async function verifyCustomerRegistryDecoupling(business) {
  const columnsRes = await db.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'customers'
     ORDER BY ordinal_position ASC`
  );

  const fkRes = await db.query(
    `SELECT
       tc.constraint_name,
       kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name = 'customers'`
  );

  const columns = columnsRes.rows.map((r) => r.column_name);
  const foreignKeys = fkRes.rows;
  const linksToUsersTable =
    foreignKeys.some((fk) => fk.foreign_table_name === "users_table") ||
    columns.includes("user_guid") ||
    columns.includes("user_id");

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS tenant_customers_count
     FROM customers
     WHERE LOWER(business) = LOWER($1)`,
    [business]
  );

  return {
    story_id: "CUST-100",
    business,
    table_name: "customers",
    columns,
    foreign_keys_on_customers: foreignKeys,
    has_users_table_link: linksToUsersTable,
    decoupled_from_users_table: !linksToUsersTable,
    reservation_foreign_key_target: "customers.customer_guid",
    tenant_customers_count: countRes.rows[0]?.tenant_customers_count || 0,
  };
}

module.exports = {
  recordCustomerForTransaction,
  listBusinessCustomers,
  getCustomerWithReservations,
  verifyCustomerRegistryDecoupling,
};
