const db = require("../db");
const ExpressError = require("../expressError");
const { generateGuid, recordSupervisorAuditLog } = require("./dynamicSettingsService");

/**
 * Business registry backed by `business_table`.
 * A Supervisor created in users_table gets a row here linked by user_guid.
 * Core info fields are mirrored into business_settings so existing settings consumers stay in sync.
 */

const INFO_FIELDS = [
  "business_name",
  "contact_email",
  "contact_phone",
  "country",
  "state",
  "city",
  "physical_address",
  "postal_code",
  "timezone",
  "currency",
  "summary",
];

const TENANT_TABLES = [
  "users_table",
  "events_table",
  "puzzles_type",
  "reps_table",
  "game_players_table",
  "business_settings",
  "business_templates",
  "items",
  "item_units",
  "reservations",
  "reservation_changes",
  "payments",
  "inventory_blackouts",
  "supervisor_audit_logs",
  "notification_outbox",
];

function prettifySlug(slug) {
  return String(slug || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function attachHasInfo(record) {
  if (!record) return record;
  const hasInfo = Boolean(
    record.physical_address ||
    record.contact_email ||
    record.contact_phone ||
    record.city ||
    record.state ||
    record.postal_code ||
    record.country ||
    record.summary ||
    (record.business_name &&
      record.business_name.trim().toLowerCase() !== String(record.business || "").trim().toLowerCase() &&
      record.business_name.trim().toLowerCase() !== prettifySlug(record.business).toLowerCase())
  );
  return { ...record, has_info: hasInfo };
}

async function findBusiness(client, { businessGuid, business, userGuid }) {
  if (businessGuid) {
    const r = await client.query(`SELECT * FROM business_table WHERE business_guid = $1 LIMIT 1`, [businessGuid]);
    if (r.rows[0]) return r.rows[0];
  }
  if (business) {
    const r = await client.query(`SELECT * FROM business_table WHERE LOWER(business) = LOWER($1) LIMIT 1`, [business]);
    if (r.rows[0]) return r.rows[0];
  }
  if (userGuid) {
    const r = await client.query(
      `SELECT * FROM business_table WHERE user_guid = $1 ORDER BY time_modified DESC NULLS LAST LIMIT 1`,
      [userGuid]
    );
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

/** Create the business row if missing (used for lazy backfill). */
async function ensureBusinessRecord(business, userGuid = null) {
  const slug = String(business || "").trim();
  if (!slug) return null;
  const existing = await findBusiness(db, { business: slug });
  if (existing) {
    if (userGuid && !existing.user_guid) {
      const r = await db.query(
        `UPDATE business_table SET user_guid = $1, time_modified = CURRENT_TIMESTAMP WHERE business_guid = $2 RETURNING *`,
        [userGuid, existing.business_guid]
      );
      return r.rows[0];
    }
    return existing;
  }
  return upsertBusinessRecord({ business: slug, user_guid: userGuid }, userGuid || "system");
}

/** Get a business by slug or by linked supervisor user_guid. */
async function getBusinessRecord({ business = null, userGuid = null } = {}) {
  const found = await findBusiness(db, { business, userGuid });
  if (found) return attachHasInfo(found);

  if (!business && userGuid) {
    const u = await db.query(`SELECT business FROM users_table WHERE user_guid = $1 LIMIT 1`, [userGuid]);
    business = u.rows[0]?.business || null;
  }
  const ensured = business ? await ensureBusinessRecord(business, userGuid) : null;
  return ensured ? attachHasInfo(ensured) : null;
}

/** Create or update business info; keeps users_table + business_settings synchronized. */
async function upsertBusinessRecord(payload = {}, actorGuid = "supervisor") {
  const target = String(payload.target_business || payload.business || "").trim();
  const newSlug = String(payload.business || target).trim();
  const userGuid = payload.user_guid ? String(payload.user_guid).trim() : null;
  if (!newSlug) throw new ExpressError("Business identifier is required.", 400);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await findBusiness(client, {
      businessGuid: payload.business_guid,
      business: target,
      userGuid: target ? null : userGuid,
    });

    // Resolve each info field: payload value > existing value > default
    const pick = (key, fallback = "") =>
      payload[key] !== undefined ? String(payload[key] ?? "").trim() : existing?.[key] ?? fallback;

    const values = {
      business_name: pick("business_name", prettifySlug(newSlug)) || prettifySlug(newSlug),
      contact_email: pick("contact_email"),
      contact_phone: pick("contact_phone"),
      country: pick("country"),
      state: pick("state"),
      city: pick("city"),
      physical_address: pick("physical_address"),
      postal_code: pick("postal_code"),
      timezone: pick("timezone", "America/Los_Angeles") || "America/Los_Angeles",
      currency: (pick("currency", "USD") || "USD").toUpperCase(),
      summary: pick("summary"),
    };
    const isActive = payload.is_active !== undefined ? Boolean(payload.is_active) : existing?.is_active !== false;

    let saved;
    if (existing) {
      const r = await client.query(
        `UPDATE business_table SET
           business = $1, user_guid = COALESCE($2, user_guid),
           business_name = $3, contact_email = $4, contact_phone = $5,
           country = $6, state = $7, city = $8, physical_address = $9,
           postal_code = $10, timezone = $11, currency = $12,
           summary = $13, is_active = $14, time_modified = CURRENT_TIMESTAMP
         WHERE business_guid = $15 RETURNING *`,
        [newSlug, userGuid, ...INFO_FIELDS.map((k) => values[k]), isActive, existing.business_guid]
      );
      saved = r.rows[0];

      // Slug rename: propagate to every tenant-scoped table so URLs keep working
      if (existing.business.toLowerCase() !== newSlug.toLowerCase()) {
        for (const tbl of TENANT_TABLES) {
          await client.query(`UPDATE ${tbl} SET business = $1 WHERE LOWER(business) = LOWER($2)`, [
            newSlug,
            existing.business,
          ]);
        }
      }
    } else {
      const r = await client.query(
        `INSERT INTO business_table
           (business_guid, business, user_guid, business_name, contact_email, contact_phone,
            country, state, city, physical_address, postal_code, timezone, currency,
            summary, is_active, time_created, time_modified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         RETURNING *`,
        [generateGuid("biz"), newSlug, userGuid, ...INFO_FIELDS.map((k) => values[k]), isActive]
      );
      saved = r.rows[0];
    }

    if (saved.user_guid) {
      await client.query(`UPDATE users_table SET business = $1 WHERE user_guid = $2`, [saved.business, saved.user_guid]);
    }

    for (const key of INFO_FIELDS) {
      await client.query(
        `INSERT INTO business_settings (business, setting_key, setting_value, time_modified)
         VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (business, setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value, time_modified = CURRENT_TIMESTAMP`,
        [saved.business, key, JSON.stringify(saved[key] ?? "")]
      );
    }

    await recordSupervisorAuditLog(client, {
      business: saved.business,
      actorGuid: actorGuid || saved.user_guid || "supervisor",
      action: existing ? "BUSINESS_INFO_UPDATE" : "BUSINESS_CREATED",
      entityType: "business_table",
      entityGuid: saved.business_guid,
      reason: existing ? "Updated business information" : "Business created",
      beforeState: existing,
      afterState: saved,
    });

    await client.query("COMMIT");
    return attachHasInfo(saved);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** All active businesses (backfills any business found on supervisors or items). */
async function listAllBusinesses() {
  const missing = await db.query(
    `SELECT DISTINCT TRIM(t.business) AS business FROM (
       SELECT business FROM users_table WHERE LOWER(COALESCE(permission_group,'')) IN ('business_owner', 'supervisor')
       UNION SELECT business FROM items WHERE is_active = TRUE
     ) t
     WHERE t.business IS NOT NULL AND TRIM(t.business) <> ''
       AND NOT EXISTS (SELECT 1 FROM business_table b WHERE LOWER(b.business) = LOWER(TRIM(t.business)))`
  );
  for (const r of missing.rows) {
    try { await ensureBusinessRecord(r.business); } catch (e) { console.error("Business backfill failed:", e.message); }
  }

  const res = await db.query(
    `SELECT * FROM business_table WHERE is_active IS NOT FALSE
     ORDER BY COALESCE(NULLIF(business_name, ''), business) ASC`
  );
  return res.rows;
}

module.exports = {
  INFO_FIELDS,
  ensureBusinessRecord,
  getBusinessRecord,
  upsertBusinessRecord,
  listAllBusinesses,
};

