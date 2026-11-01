const crypto = require("crypto");
const db = require("../db");
const ExpressError = require("../expressError");

/**
 * Section 3.1: Dynamic Settings Catalog (Configured per Business)
 * Zero business constants are hardcoded in application logic; this catalog defines
 * schema metadata, validation rules, and initial database seed fallbacks for new tenants.
 */
const DYNAMIC_SETTINGS_CATALOG = [
  // Category: Business Info
  {
    category: "Business Info",
    key: "business_name",
    type: "string",
    description: "Public legal or brand name",
    defaultFallback: (business) =>
      business
        ? business
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : "Triple Great Business",
  },
  {
    category: "Business Info",
    key: "contact_email",
    type: "string",
    description: "Customer support email",
    defaultFallback: (business) =>
      `support@${(business || "tenant").toLowerCase().replace(/[^a-z0-9]/g, "")}.example.com`,
  },
  {
    category: "Business Info",
    key: "contact_phone",
    type: "string",
    description: "Support phone number",
    defaultFallback: () => "+1 (800) 555-0199",
  },
  {
    category: "Business Info",
    key: "physical_address",
    type: "string",
    description: "Pickup / store address",
    defaultFallback: () => "100 Enterprise Way, Suite 100",
  },
  {
    category: "Business Info",
    key: "timezone",
    type: "string",
    description: "Operating timezone for day boundaries & cutoffs",
    defaultFallback: () => "America/Los_Angeles",
  },
  {
    category: "Business Info",
    key: "currency",
    type: "string",
    description: "Currency code",
    defaultFallback: () => "USD",
  },

  // Category: Policy Engine
  {
    category: "Policy Engine",
    key: "hold_ttl_seconds",
    type: "number",
    min: 30,
    max: 86400,
    description: "Checkout inventory lock duration",
    defaultFallback: () => 600,
  },
  {
    category: "Policy Engine",
    key: "free_change_cutoff_hours",
    type: "number",
    min: 0,
    max: 8760,
    description: "Self-service 100% refund cutoff window",
    defaultFallback: () => 168,
  },
  {
    category: "Policy Engine",
    key: "late_fee_percentage",
    type: "number",
    min: 0,
    max: 100,
    description: "Fee percentage retained within cutoff",
    defaultFallback: () => 25,
  },
  {
    category: "Policy Engine",
    key: "allow_customer_add_days",
    type: "boolean",
    description: "Enable self-service day extensions",
    defaultFallback: () => true,
  },
  {
    category: "Policy Engine",
    key: "allow_customer_remove_days",
    type: "boolean",
    description: "Enable self-service day reductions",
    defaultFallback: () => true,
  },
  {
    category: "Policy Engine",
    key: "guest_token_ttl_days",
    type: "number",
    min: 1,
    max: 365,
    description: "Validity duration of tokenized guest links",
    defaultFallback: () => 30,
  },

  // Category: Pricing & Tax
  {
    category: "Pricing & Tax",
    key: "tax_rate_percent",
    type: "number",
    min: 0,
    max: 100,
    description: "Sales tax percentage added at checkout",
    defaultFallback: () => 8.25,
  },
  {
    category: "Pricing & Tax",
    key: "require_full_payment",
    type: "boolean",
    description: "Full payment at booking flag",
    defaultFallback: () => true,
  },

  // Category: Notifications
  {
    category: "Notifications",
    key: "sms_enabled",
    type: "boolean",
    description: "Master SMS notification switch for tenant",
    defaultFallback: () => true,
  },
  {
    category: "Notifications",
    key: "email_enabled",
    type: "boolean",
    description: "Master Email notification switch for tenant",
    defaultFallback: () => true,
  },
  {
    category: "Notifications",
    key: "reminder_lead_hours",
    type: "number",
    min: 1,
    max: 720,
    description: "Pre-reservation reminder lead time",
    defaultFallback: () => 48,
  },

  // Category: Hardware (SettingsContext QR Label Printer)
  {
    category: "Hardware",
    key: "printer",
    type: "json",
    description: "Label paper dimensions for QR ticket printing",
    defaultFallback: () => ({
      paperWidthIn: 4,
      paperHeightIn: 3,
    }),
  },
];

const CATALOG_BY_KEY = new Map(
  DYNAMIC_SETTINGS_CATALOG.map((item) => [item.key, item])
);

const TEMPLATE_TOKENS_BY_EVENT = {
  "booking.confirmed": [
    "{{business_name}}",
    "{{customer_name}}",
    "{{item_name}}",
    "{{start_date}}",
    "{{end_date}}",
    "{{total_amount}}",
    "{{manage_url}}",
    "{{support_phone}}",
  ],
  "booking.rescheduled": [
    "{{business_name}}",
    "{{customer_name}}",
    "{{old_start_date}}",
    "{{new_start_date}}",
    "{{fee_amount}}",
    "{{manage_url}}",
  ],
  "booking.days_added": [
    "{{business_name}}",
    "{{customer_name}}",
    "{{added_days_count}}",
    "{{new_end_date}}",
    "{{amount_charged}}",
    "{{manage_url}}",
  ],
  "booking.days_removed": [
    "{{business_name}}",
    "{{customer_name}}",
    "{{removed_days_count}}",
    "{{refund_amount}}",
    "{{fee_amount}}",
    "{{new_total}}",
  ],
  "booking.cancelled": [
    "{{business_name}}",
    "{{customer_name}}",
    "{{refund_amount}}",
    "{{fee_amount}}",
    "{{refund_eta_days}}",
  ],
  "booking.reminder_48h": [
    "{{business_name}}",
    "{{customer_name}}",
    "{{pickup_address}}",
    "{{start_date}}",
    "{{support_phone}}",
  ],
};

const DEFAULT_TEMPLATES = [
  {
    event_type: "booking.confirmed",
    channel: "EMAIL",
    subject: "Reservation Confirmed — {{business_name}}",
    body_template:
      "Hi {{customer_name}},\n\nYour reservation for {{item_name}} from {{start_date}} to {{end_date}} is confirmed.\nTotal Paid: {{total_amount}}\nManage your booking: {{manage_url}}\nQuestions? Call {{support_phone}}.",
  },
  {
    event_type: "booking.confirmed",
    channel: "SMS",
    subject: null,
    body_template:
      "{{business_name}}: Confirmed {{item_name}} ({{start_date}} - {{end_date}}). Total: {{total_amount}}. Manage: {{manage_url}}",
  },
  {
    event_type: "booking.rescheduled",
    channel: "EMAIL",
    subject: "Reservation Rescheduled — {{business_name}}",
    body_template:
      "Hi {{customer_name}},\n\nYour booking with {{business_name}} has been moved from {{old_start_date}} to {{new_start_date}}.\nChange Fee: {{fee_amount}}\nManage your booking: {{manage_url}}",
  },
  {
    event_type: "booking.rescheduled",
    channel: "SMS",
    subject: null,
    body_template:
      "{{business_name}}: Booking rescheduled from {{old_start_date}} to {{new_start_date}} (Fee: {{fee_amount}}). Manage: {{manage_url}}",
  },
  {
    event_type: "booking.days_added",
    channel: "EMAIL",
    subject: "Reservation Extended — {{business_name}}",
    body_template:
      "Hi {{customer_name}},\n\nAdded {{added_days_count}} day(s) to your reservation with {{business_name}}.\nNew end date: {{new_end_date}}\nAmount charged: {{amount_charged}}\nManage: {{manage_url}}",
  },
  {
    event_type: "booking.days_added",
    channel: "SMS",
    subject: null,
    body_template:
      "{{business_name}}: Added {{added_days_count}} day(s). New end: {{new_end_date}}. Charged: {{amount_charged}}. Manage: {{manage_url}}",
  },
  {
    event_type: "booking.days_removed",
    channel: "EMAIL",
    subject: "Reservation Shortened — {{business_name}}",
    body_template:
      "Hi {{customer_name}},\n\nRemoved {{removed_days_count}} day(s) from your reservation with {{business_name}}.\nRefund: {{refund_amount}} (Fee: {{fee_amount}})\nNew Total: {{new_total}}",
  },
  {
    event_type: "booking.days_removed",
    channel: "SMS",
    subject: null,
    body_template:
      "{{business_name}}: Removed {{removed_days_count}} day(s). Refund: {{refund_amount}} (Fee: {{fee_amount}}). New Total: {{new_total}}.",
  },
  {
    event_type: "booking.cancelled",
    channel: "EMAIL",
    subject: "Reservation Cancelled — {{business_name}}",
    body_template:
      "Hi {{customer_name}},\n\nYour reservation with {{business_name}} has been cancelled.\nRefund: {{refund_amount}} (Fee retained: {{fee_amount}})\nEstimated refund arrival: {{refund_eta_days}} business days.",
  },
  {
    event_type: "booking.cancelled",
    channel: "SMS",
    subject: null,
    body_template:
      "{{business_name}}: Reservation cancelled. Refund: {{refund_amount}} (Fee: {{fee_amount}}), ETA {{refund_eta_days}} days.",
  },
  {
    event_type: "booking.reminder_48h",
    channel: "EMAIL",
    subject: "Upcoming Reservation Reminder — {{business_name}}",
    body_template:
      "Hi {{customer_name}},\n\nReminder that your reservation with {{business_name}} starts on {{start_date}}.\nPickup address: {{pickup_address}}\nSupport phone: {{support_phone}}",
  },
  {
    event_type: "booking.reminder_48h",
    channel: "SMS",
    subject: null,
    body_template:
      "{{business_name}} Reminder: Your reservation starts {{start_date}} at {{pickup_address}}. Help: {{support_phone}}",
  },
];

function generateGuid(prefix = "guid") {
  const rand = crypto.randomBytes(8).toString("hex");
  return `${prefix}_${Date.now()}_${rand}`;
}

/**
 * Build the initial seed settings object for a given business tenant.
 */
function buildFallbackSettings(business) {
  const settings = {};
  for (const entry of DYNAMIC_SETTINGS_CATALOG) {
    settings[entry.key] = entry.defaultFallback(business);
  }
  return settings;
}

/**
 * Validate and normalize a partial settings update against DYNAMIC_SETTINGS_CATALOG.
 */
function validateAndNormalizeSettings(partialSettings, existingPrinter = { paperWidthIn: 4, paperHeightIn: 3 }) {
  if (!partialSettings || typeof partialSettings !== "object") {
    throw new ExpressError("settings payload must be a valid JSON object", 400);
  }

  const normalized = {};
  for (const [key, rawValue] of Object.entries(partialSettings)) {
    const meta = CATALOG_BY_KEY.get(key);
    if (!meta) {
      // Allow forward-compatible custom tenant keys stored as JSONB
      normalized[key] = rawValue;
      continue;
    }

    if (meta.type === "string") {
      normalized[key] = String(rawValue ?? "").trim();
    } else if (meta.type === "number") {
      const num = Number(rawValue);
      if (!Number.isFinite(num)) {
        throw new ExpressError(`Setting '${key}' must be a valid number`, 400);
      }
      if (meta.min !== undefined && num < meta.min) {
        throw new ExpressError(`Setting '${key}' must be >= ${meta.min}`, 400);
      }
      if (meta.max !== undefined && num > meta.max) {
        throw new ExpressError(`Setting '${key}' must be <= ${meta.max}`, 400);
      }
      normalized[key] = num;
    } else if (meta.type === "boolean") {
      if (typeof rawValue === "string") {
        normalized[key] = rawValue.toLowerCase() === "true" || rawValue === "1";
      } else {
        normalized[key] = Boolean(rawValue);
      }
    } else if (key === "printer") {
      if (!rawValue || typeof rawValue !== "object") {
        throw new ExpressError("Setting 'printer' must be an object with paperWidthIn and paperHeightIn", 400);
      }
      const w = Number(rawValue.paperWidthIn ?? existingPrinter.paperWidthIn ?? 4);
      const h = Number(rawValue.paperHeightIn ?? existingPrinter.paperHeightIn ?? 3);
      if (!Number.isFinite(w) || w < 1 || w > 12 || !Number.isFinite(h) || h < 1 || w > 12) {
        throw new ExpressError("Printer paper dimensions must be between 1 and 12 inches", 400);
      }
      normalized.printer = { paperWidthIn: w, paperHeightIn: h };
    } else {
      normalized[key] = rawValue;
    }
  }

  return normalized;
}

/**
 * Write an immutable supervisor audit log entry scoped to `business`.
 */
async function recordSupervisorAuditLog(
  clientOrDb,
  {
    business,
    actorGuid,
    action,
    entityType,
    entityGuid,
    reason = null,
    beforeState = null,
    afterState = null,
  }
) {
  const logGuid = generateGuid("audit");
  const query = `
    INSERT INTO supervisor_audit_logs
      (log_guid, business, actor_guid, action, entity_type, entity_guid, reason, before_state, after_state, time_created)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    RETURNING *
  `;
  const values = [
    logGuid,
    business,
    actorGuid || "supervisor",
    action,
    entityType,
    entityGuid,
    reason,
    beforeState ? JSON.stringify(beforeState) : null,
    afterState ? JSON.stringify(afterState) : null,
  ];
  const res = await clientOrDb.query(query, values);
  return res.rows[0];
}

/**
 * Ensure all catalog setting keys exist in `business_settings` for `business`.
 * This guarantees zero hardcoded runtime constants: every setting is persisted in PostgreSQL per business.
 */
async function ensureBusinessSettingsInitialized(business) {
  if (!business) return;
  const existingRes = await db.query(
    `SELECT setting_key FROM business_settings WHERE LOWER(business) = LOWER($1)`,
    [business]
  );
  const existingKeys = new Set(existingRes.rows.map((r) => r.setting_key));
  const defaults = buildFallbackSettings(business);

  const missingEntries = Object.entries(defaults).filter(
    ([key]) => !existingKeys.has(key)
  );
  if (missingEntries.length === 0) return;

  for (const [key, val] of missingEntries) {
    await db.query(
      `INSERT INTO business_settings (business, setting_key, setting_value, time_modified)
       VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (business, setting_key) DO NOTHING`,
      [business, key, JSON.stringify(val)]
    );
  }
}

/**
 * Ensure all lifecycle event templates exist in `business_templates` for `business`.
 */
async function ensureBusinessTemplatesInitialized(business) {
  if (!business) return;
  const existingRes = await db.query(
    `SELECT event_type, channel FROM business_templates WHERE LOWER(business) = LOWER($1)`,
    [business]
  );
  const existingPairs = new Set(
    existingRes.rows.map((r) => `${r.event_type}:${r.channel.toUpperCase()}`)
  );

  for (const tpl of DEFAULT_TEMPLATES) {
    const pairKey = `${tpl.event_type}:${tpl.channel.toUpperCase()}`;
    if (existingPairs.has(pairKey)) continue;

    const templateGuid = generateGuid("tpl");
    await db.query(
      `INSERT INTO business_templates
        (template_guid, business, event_type, channel, subject, body_template, is_active, time_modified)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (business, event_type, channel) DO NOTHING`,
      [
        templateGuid,
        business,
        tpl.event_type,
        tpl.channel.toUpperCase(),
        tpl.subject,
        tpl.body_template,
      ]
    );
  }
}

/**
 * Load all dynamic settings for a specific business tenant from `business_settings`.
 */
async function getBusinessSettings(business) {
  const fallbacks = buildFallbackSettings(business);
  if (!business) {
    return { settings: fallbacks, time_modified: null };
  }

  await ensureBusinessSettingsInitialized(business);

  const result = await db.query(
    `SELECT setting_key, setting_value, time_modified
     FROM business_settings
     WHERE LOWER(business) = LOWER($1)`,
    [business]
  );

  const merged = { ...fallbacks };
  let latestModified = null;

  for (const row of result.rows) {
    const key = row.setting_key;
    const val = row.setting_value;
    if (key === "printer" && val && typeof val === "object") {
      merged.printer = { ...fallbacks.printer, ...val };
    } else {
      merged[key] = val;
    }
    if (
      row.time_modified &&
      (!latestModified || new Date(row.time_modified) > new Date(latestModified))
    ) {
      latestModified = row.time_modified;
    }
  }

  return {
    settings: merged,
    time_modified: latestModified,
  };
}

/**
 * Return the structured catalog definition paired with the tenant's current database values.
 */
async function getBusinessSettingsCatalogWithValues(business) {
  const { settings, time_modified } = await getBusinessSettings(business);
  const catalog = DYNAMIC_SETTINGS_CATALOG.map((item) => ({
    category: item.category,
    key: item.key,
    type: item.type,
    min: item.min,
    max: item.max,
    description: item.description,
    default_fallback: item.defaultFallback(business),
    current_value: settings[item.key],
  }));

  return {
    business,
    catalog,
    settings,
    time_modified,
  };
}

/**
 * Return the public-facing tenant configuration for `/api/:business/config`.
 */
async function getPublicBusinessConfig(business) {
  const { settings, time_modified } = await getBusinessSettings(business);
  return {
    business,
    business_name: settings.business_name,
    contact_email: settings.contact_email,
    contact_phone: settings.contact_phone,
    physical_address: settings.physical_address,
    timezone: settings.timezone,
    currency: settings.currency,
    policies: {
      hold_ttl_seconds: Number(settings.hold_ttl_seconds),
      free_change_cutoff_hours: Number(settings.free_change_cutoff_hours),
      late_fee_percentage: Number(settings.late_fee_percentage),
      allow_customer_add_days: Boolean(settings.allow_customer_add_days),
      allow_customer_remove_days: Boolean(settings.allow_customer_remove_days),
      guest_token_ttl_days: Number(settings.guest_token_ttl_days),
    },
    pricing: {
      tax_rate_percent: Number(settings.tax_rate_percent),
      require_full_payment: Boolean(settings.require_full_payment),
    },
    notifications: {
      sms_enabled: Boolean(settings.sms_enabled),
      email_enabled: Boolean(settings.email_enabled),
      reminder_lead_hours: Number(settings.reminder_lead_hours),
    },
    announcements: settings.announcement_banner || "",
    printer: settings.printer,
    time_modified,
  };
}

/**
 * Update one or more setting keys for a business tenant atomically and record a supervisor audit log.
 */
async function updateBusinessSettings(
  business,
  partialSettings,
  actorGuid = "supervisor",
  reason = "Updated dynamic business settings"
) {
  if (!business) {
    throw new ExpressError("business is required to update settings", 400);
  }

  const before = await getBusinessSettings(business);
  const normalizedUpdates = validateAndNormalizeSettings(
    partialSettings,
    before.settings.printer
  );

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const [key, valueToStore] of Object.entries(normalizedUpdates)) {
      await client.query(
        `INSERT INTO business_settings (business, setting_key, setting_value, time_modified)
         VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (business, setting_key)
         DO UPDATE SET
           setting_value = EXCLUDED.setting_value,
           time_modified = CURRENT_TIMESTAMP`,
        [business, key, JSON.stringify(valueToStore)]
      );
    }

    const afterResult = await client.query(
      `SELECT setting_key, setting_value, time_modified
       FROM business_settings
       WHERE LOWER(business) = LOWER($1)`,
      [business]
    );

    const fallbacks = buildFallbackSettings(business);
    const afterSettings = { ...fallbacks };
    let latestModified = new Date().toISOString();

    for (const row of afterResult.rows) {
      if (
        row.setting_key === "printer" &&
        row.setting_value &&
        typeof row.setting_value === "object"
      ) {
        afterSettings.printer = { ...fallbacks.printer, ...row.setting_value };
      } else {
        afterSettings[row.setting_key] = row.setting_value;
      }
      if (row.time_modified) {
        latestModified = row.time_modified;
      }
    }

    await recordSupervisorAuditLog(client, {
      business,
      actorGuid,
      action: "SETTINGS_UPDATE",
      entityType: "business_settings",
      entityGuid: business,
      reason,
      beforeState: before.settings,
      afterState: afterSettings,
    });

    await client.query("COMMIT");

    return {
      settings: afterSettings,
      time_modified: latestModified,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve notification templates for a business from `business_templates`.
 */
async function getBusinessTemplates(business, eventFilter = null) {
  await ensureBusinessTemplatesInitialized(business);

  const params = [business];
  let query = `SELECT * FROM business_templates WHERE LOWER(business) = LOWER($1)`;
  if (eventFilter) {
    params.push(eventFilter);
    query += ` AND event_type = $2`;
  }
  query += ` ORDER BY event_type ASC, channel ASC`;

  const result = await db.query(query, params);
  return result.rows.map((row) => ({
    ...row,
    available_tokens: TEMPLATE_TOKENS_BY_EVENT[row.event_type] || [],
  }));
}

/**
 * Update or create a specific notification template in `business_templates` and log to `supervisor_audit_logs`.
 */
async function upsertBusinessTemplate(
  business,
  eventType,
  channel,
  payload,
  actorGuid = "supervisor",
  reason = "Updated notification template"
) {
  if (!business || !eventType || !channel) {
    throw new ExpressError("business, eventType, and channel are required", 400);
  }
  const normalizedChannel = String(channel).trim().toUpperCase();
  if (!["EMAIL", "SMS"].includes(normalizedChannel)) {
    throw new ExpressError("channel must be EMAIL or SMS", 400);
  }
  if (!payload || typeof payload.body_template !== "string" || !payload.body_template.trim()) {
    throw new ExpressError("body_template is required", 400);
  }

  await ensureBusinessTemplatesInitialized(business);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const beforeRes = await client.query(
      `SELECT * FROM business_templates
       WHERE LOWER(business) = LOWER($1) AND event_type = $2 AND channel = $3
       LIMIT 1`,
      [business, eventType, normalizedChannel]
    );
    const beforeState = beforeRes.rows[0] || null;
    const templateGuid = beforeState?.template_guid || generateGuid("tpl");
    const subject =
      normalizedChannel === "EMAIL"
        ? String(payload.subject ?? beforeState?.subject ?? "").trim()
        : null;
    const bodyTemplate = String(payload.body_template).trim();
    const isActive =
      payload.is_active !== undefined ? Boolean(payload.is_active) : true;

    const upsertRes = await client.query(
      `INSERT INTO business_templates
        (template_guid, business, event_type, channel, subject, body_template, is_active, time_modified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (business, event_type, channel)
       DO UPDATE SET
         subject = EXCLUDED.subject,
         body_template = EXCLUDED.body_template,
         is_active = EXCLUDED.is_active,
         time_modified = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        templateGuid,
        business,
        eventType,
        normalizedChannel,
        subject,
        bodyTemplate,
        isActive,
      ]
    );

    const afterState = upsertRes.rows[0];

    await recordSupervisorAuditLog(client, {
      business,
      actorGuid,
      action: "TEMPLATE_UPDATE",
      entityType: "business_templates",
      entityGuid: afterState.template_guid,
      reason,
      beforeState,
      afterState,
    });

    await client.query("COMMIT");

    return {
      ...afterState,
      available_tokens: TEMPLATE_TOKENS_BY_EVENT[eventType] || [],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function formatCents(cents = 0, currency = "USD") {
  const num = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(num);
  } catch {
    return `$${num.toFixed(2)}`;
  }
}

/**
 * Render a template string by interpolating {{variable}} tokens with tenant settings + sample/event variables.
 */
function interpolateTemplate(text, variables = {}) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token) => {
    return variables[token] !== undefined && variables[token] !== null
      ? String(variables[token])
      : `{{${token}}}`;
  });
}

async function previewBusinessTemplate(business, { subject, body_template, sample_vars = {} }) {
  const { settings } = await getBusinessSettings(business);
  const mergedVars = {
    business_name: settings.business_name,
    support_phone: settings.contact_phone,
    contact_phone: settings.contact_phone,
    contact_email: settings.contact_email,
    pickup_address: settings.physical_address,
    physical_address: settings.physical_address,
    cutoff_hours: settings.free_change_cutoff_hours,
    late_fee_percent: settings.late_fee_percentage,
    customer_name: "Alex Rivera",
    customer_first_name: "Alex",
    customer_last_name: "Rivera",
    item_name: "Pro Adventure Kayak",
    start_date: "2026-11-10",
    end_date: "2026-11-14",
    old_start_date: "2026-11-10",
    new_start_date: "2026-11-18",
    new_end_date: "2026-11-16",
    added_days_count: 2,
    removed_days_count: 1,
    total_amount: "$324.75",
    total_paid: "$324.75",
    amount_charged: "$108.25",
    extra_charge: "$108.25",
    refund_amount: "$243.56",
    fee_amount: "$81.19",
    fee_charged: "$81.19",
    new_total: "$216.50",
    refund_eta_days: "3-5",
    manage_url: `https://triplegreat.local/book/${business}?manage_token=tok_sample123`,
    ...sample_vars,
  };

  return {
    rendered_subject: subject ? interpolateTemplate(subject, mergedVars) : null,
    rendered_body: interpolateTemplate(body_template, mergedVars),
    variables_used: mergedVars,
  };
}

module.exports = {
  DYNAMIC_SETTINGS_CATALOG,
  TEMPLATE_TOKENS_BY_EVENT,
  buildFallbackSettings,
  validateAndNormalizeSettings,
  generateGuid,
  formatCents,
  recordSupervisorAuditLog,
  ensureBusinessSettingsInitialized,
  ensureBusinessTemplatesInitialized,
  getBusinessSettings,
  getBusinessSettingsCatalogWithValues,
  getPublicBusinessConfig,
  updateBusinessSettings,
  getBusinessTemplates,
  upsertBusinessTemplate,
  interpolateTemplate,
  renderHandlebarsTemplate: interpolateTemplate,
  previewBusinessTemplate,
};
