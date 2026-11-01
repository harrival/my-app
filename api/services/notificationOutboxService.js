const db = require("../db");
const ExpressError = require("../expressError");
const {
  generateGuid,
  getBusinessSettings,
  getBusinessTemplates,
  ensureBusinessTemplatesInitialized,
  interpolateTemplate,
  formatCents,
} = require("./dynamicSettingsService");

// Simulated provider outage state to verify Section 8.2:
// "Outages in external communication providers never roll back customer reservations."
const providerState = {
  emailOutage: false,
  smsOutage: false,
  failNextCount: 0,
};

function getProviderStatus() {
  return { ...providerState };
}

function setProviderOutageState({
  emailOutage,
  smsOutage,
  failNextCount,
} = {}) {
  if (emailOutage !== undefined) providerState.emailOutage = Boolean(emailOutage);
  if (smsOutage !== undefined) providerState.smsOutage = Boolean(smsOutage);
  if (failNextCount !== undefined) {
    providerState.failNextCount = Math.max(0, Number(failNextCount) || 0);
  }
  return getProviderStatus();
}

/**
 * Pluggable EmailProvider interface (Mock / SMTP / SendGrid).
 */
const EmailProvider = {
  async send({ business, to, subject, body, outbox_guid }) {
    if (providerState.emailOutage) {
      throw new Error("Simulated EmailProvider outage (SMTP connection refused)");
    }
    if (providerState.failNextCount > 0) {
      providerState.failNextCount -= 1;
      throw new Error("Simulated transient EmailProvider delivery failure");
    }
    return {
      provider: process.env.EMAIL_PROVIDER || "mock_email",
      provider_message_id: `email_${business}_${outbox_guid}_${Date.now()}`,
      recipient: to,
      subject,
      body,
    };
  },
};

/**
 * Pluggable SmsProvider interface (Mock / Twilio).
 */
const SmsProvider = {
  async send({ business, to, body, outbox_guid }) {
    if (providerState.smsOutage) {
      throw new Error("Simulated SmsProvider outage (SMS gateway 503 Unavailable)");
    }
    if (providerState.failNextCount > 0) {
      providerState.failNextCount -= 1;
      throw new Error("Simulated transient SmsProvider delivery failure");
    }
    return {
      provider: process.env.SMS_PROVIDER || "mock_sms",
      provider_message_id: `sms_${business}_${outbox_guid}_${Date.now()}`,
      recipient: to,
      body,
    };
  },
};

/**
 * Extract YYYY-MM-DD start and end dates from a PostgreSQL daterange string like "[2026-11-15,2026-11-19)".
 */
function parseRangeStrings(rangeStr) {
  if (!rangeStr || typeof rangeStr !== "string") {
    return { startDate: "", endDate: "" };
  }
  const match = /^[\[(](\d{4}-\d{2}-\d{2}),\s*(\d{4}-\d{2}-\d{2})[\])]/.exec(
    rangeStr.trim()
  );
  if (!match) return { startDate: "", endDate: "" };
  return { startDate: match[1], endDate: match[2] };
}

/**
 * Section 8.2 Outbox Pattern Delivery Guarantee #1:
 * Insert PENDING notification records into `notification_outbox` inside the SAME database transaction
 * (`client`) as the reservation mutation.
 */
async function enqueueLifecycleNotificationsInTx(
  client,
  business,
  {
    reservation,
    customer = null,
    eventType,
    extraVars = {},
  } = {}
) {
  const runner = client || db;
  await ensureBusinessTemplatesInitialized(business);
  const { settings } = await getBusinessSettings(business);
  const templates = await getBusinessTemplates(business, eventType);

  let resolvedCustomer = customer;
  if (!resolvedCustomer && reservation?.customer_guid) {
    const cRes = await runner.query(
      `SELECT * FROM customers WHERE customer_guid = $1 LIMIT 1`,
      [reservation.customer_guid]
    );
    resolvedCustomer = cRes.rows[0] || null;
  }

  let itemName = reservation?.item_name || extraVars.item_name || "Rental Item";
  if (!reservation?.item_name && reservation?.item_guid) {
    const iRes = await runner.query(
      `SELECT name FROM items WHERE item_guid = $1 AND LOWER(business) = LOWER($2) LIMIT 1`,
      [reservation.item_guid, business]
    );
    if (iRes.rows[0]?.name) {
      itemName = iRes.rows[0].name;
    }
  }

  const parsedRange = parseRangeStrings(
    reservation?.date_range_text ||
      (reservation?.date_range ? String(reservation.date_range) : "")
  );

  const currency = settings.currency || "USD";
  const manageToken = reservation?.manage_token || "";
  const manageUrl = `/book/${encodeURIComponent(business)}?manage_token=${encodeURIComponent(
    manageToken
  )}`;

  const fullCustomerName = resolvedCustomer
    ? `${resolvedCustomer.first_name || ""} ${resolvedCustomer.last_name || ""}`.trim() ||
      "Customer"
    : "Customer";

  const formattedTotal = formatCents(reservation?.total_cents || 0, currency);
  const formattedRefund = formatCents(reservation?.refund_cents || 0, currency);
  const formattedFee = formatCents(reservation?.fee_cents || 0, currency);

  // Complete Section 8.1 Variable Token dictionary
  const variables = {
    business_name: settings.business_name,
    contact_email: settings.contact_email,
    contact_phone: settings.contact_phone,
    support_phone: settings.contact_phone,
    physical_address: settings.physical_address,
    pickup_address: settings.physical_address,
    cutoff_hours: settings.free_change_cutoff_hours,
    late_fee_percent: settings.late_fee_percentage,
    customer_name: fullCustomerName,
    customer_first_name: resolvedCustomer?.first_name || "Customer",
    customer_last_name: resolvedCustomer?.last_name || "",
    item_name: itemName,
    start_date: parsedRange.startDate || reservation?.start_date || "",
    end_date: parsedRange.endDate || reservation?.end_date || "",
    old_start_date: extraVars.old_start_date || parsedRange.startDate || "",
    new_start_date: extraVars.new_start_date || parsedRange.startDate || "",
    new_end_date: extraVars.new_end_date || parsedRange.endDate || "",
    added_days_count: extraVars.added_days_count ?? 0,
    removed_days_count: extraVars.removed_days_count ?? 0,
    total_paid: formattedTotal,
    total_amount: formattedTotal,
    new_total: formattedTotal,
    refund_amount: formattedRefund,
    fee_charged: formattedFee,
    fee_amount: formattedFee,
    extra_charge: formatCents(0, currency),
    amount_charged: formatCents(0, currency),
    refund_eta_days: "3-5",
    manage_url: manageUrl,
    ...extraVars,
  };

  const insertedOutboxRows = [];

  for (const tpl of templates) {
    if (!tpl.is_active) continue;
    if (tpl.channel === "EMAIL" && !settings.email_enabled) continue;
    if (
      tpl.channel === "SMS" &&
      (!settings.sms_enabled || !resolvedCustomer?.sms_opt_in)
    ) {
      continue;
    }

    const recipient =
      tpl.channel === "SMS"
        ? resolvedCustomer?.phone_number || "000-000-0000"
        : resolvedCustomer?.email || "customer@example.com";

    const renderedSubject = tpl.subject
      ? interpolateTemplate(tpl.subject, variables)
      : null;
    const preRenderedBody = interpolateTemplate(tpl.body_template, variables);
    const outboxGuid = generateGuid("out");

    const insertRes = await runner.query(
      `INSERT INTO notification_outbox
        (outbox_guid, business, reservation_guid, recipient, channel, template_type,
         payload, rendered_body, status, attempts, time_created)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7::jsonb, $8, 'PENDING', 0, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        outboxGuid,
        business,
        reservation?.reservation_guid || null,
        recipient,
        tpl.channel,
        eventType,
        JSON.stringify({
          subject: renderedSubject,
          variables,
        }),
        preRenderedBody,
      ]
    );

    insertedOutboxRows.push(insertRes.rows[0]);
  }

  return insertedOutboxRows;
}

/**
 * Section 8.2 Outbox Pattern Delivery Guarantee #2 & #3:
 * Background Outbox Worker that fetches PENDING records, loads the business's custom template
 * from `business_templates`, interpolates variables, and hands off to `EmailProvider` / `SmsProvider`.
 * Outages in external providers NEVER roll back customer reservations; failed deliveries are marked `FAILED`
 * in `notification_outbox` with `error_message` for inspection and retry.
 */
async function processNotificationOutbox({
  business = null,
  outboxGuids = null,
  limit = 50,
} = {}) {
  const params = [];
  const clauses = [];

  if (Array.isArray(outboxGuids) && outboxGuids.length > 0) {
    params.push(outboxGuids);
    clauses.push(`outbox_guid = ANY($${params.length})`);
  } else {
    clauses.push(`status = 'PENDING'`);
  }

  if (business) {
    params.push(business);
    clauses.push(`LOWER(business) = LOWER($${params.length})`);
  }

  params.push(Math.min(Number(limit) || 50, 200));

  const pendingRes = await db.query(
    `SELECT *
     FROM notification_outbox
     WHERE ${clauses.join(" AND ")}
     ORDER BY time_created ASC
     LIMIT $${params.length}`,
    params
  );

  const processed = [];

  for (const row of pendingRes.rows) {
    try {
      // Load the business's latest custom template from business_templates
      const templates = await getBusinessTemplates(row.business, row.template_type);
      const matchingTemplate = templates.find(
        (t) => t.channel === row.channel
      );

      const variables = row.payload?.variables || {};
      const subjectTemplate =
        matchingTemplate?.subject || row.payload?.subject || null;
      const bodyTemplate =
        matchingTemplate?.body_template || row.rendered_body || "";

      const renderedSubject = subjectTemplate
        ? interpolateTemplate(subjectTemplate, variables)
        : null;
      const renderedBody = interpolateTemplate(bodyTemplate, variables);

      let deliveryResult;
      if (row.channel === "SMS") {
        deliveryResult = await SmsProvider.send({
          business: row.business,
          to: row.recipient,
          body: renderedBody,
          outbox_guid: row.outbox_guid,
        });
      } else {
        deliveryResult = await EmailProvider.send({
          business: row.business,
          to: row.recipient,
          subject: renderedSubject,
          body: renderedBody,
          outbox_guid: row.outbox_guid,
        });
      }

      const updatedPayload = {
        ...(row.payload || {}),
        subject: renderedSubject,
        variables,
      };

      const sentRes = await db.query(
        `UPDATE notification_outbox
         SET status = 'SENT',
             rendered_body = $1,
             payload = $2::jsonb,
             attempts = COALESCE(attempts, 0) + 1,
             provider_message_id = $3,
             error_message = NULL,
             sent_at = CURRENT_TIMESTAMP
         WHERE outbox_guid = $4
         RETURNING *`,
        [
          renderedBody,
          JSON.stringify(updatedPayload),
          deliveryResult.provider_message_id,
          row.outbox_guid,
        ]
      );

      processed.push(sentRes.rows[0]);
    } catch (providerErr) {
      // Provider failure is isolated — reservation remains committed, outbox records FAILED
      const failedRes = await db.query(
        `UPDATE notification_outbox
         SET status = 'FAILED',
             attempts = COALESCE(attempts, 0) + 1,
             error_message = $1
         WHERE outbox_guid = $2
         RETURNING *`,
        [providerErr.message || "Provider delivery error", row.outbox_guid]
      );
      processed.push(failedRes.rows[0]);
    }
  }

  return processed;
}

/**
 * Trigger `booking.reminder_48h` notifications for CONFIRMED reservations starting within
 * the tenant's configured `reminder_lead_hours` (default 48h) from `now`.
 */
async function dispatchUpcomingReminders({ business = null, now = new Date() } = {}) {
  const params = [];
  let bizFilter = "";
  if (business) {
    params.push(business);
    bizFilter = ` AND LOWER(r.business) = LOWER($1)`;
  }

  const resQuery = await db.query(
    `SELECT
       r.*,
       r.date_range::text AS date_range_text,
       i.name AS item_name,
       c.customer_guid,
       c.first_name,
       c.last_name,
       c.email,
       c.phone_number,
       c.sms_opt_in
     FROM reservations r
     LEFT JOIN items i ON i.item_guid = r.item_guid
     LEFT JOIN customers c ON c.customer_guid = r.customer_guid
     WHERE r.status = 'CONFIRMED'
     ${bizFilter}`,
    params
  );

  const enqueuedAll = [];

  for (const r of resQuery.rows) {
    const { settings } = await getBusinessSettings(r.business);
    const leadHours = Number(settings.reminder_lead_hours ?? 48);
    const parsed = parseRangeStrings(r.date_range_text);
    if (!parsed.startDate) continue;

    const startMs = Date.parse(`${parsed.startDate}T00:00:00.000Z`);
    const hoursUntilStart = (startMs - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilStart > 0 && hoursUntilStart <= leadHours) {
      // Check if reminder was already queued for this reservation
      const existingReminder = await db.query(
        `SELECT 1 FROM notification_outbox
         WHERE reservation_guid = $1 AND template_type = 'booking.reminder_48h'
         LIMIT 1`,
        [r.reservation_guid]
      );
      if (existingReminder.rows.length === 0) {
        const queued = await enqueueLifecycleNotificationsInTx(db, r.business, {
          reservation: r,
          customer: {
            customer_guid: r.customer_guid,
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone_number: r.phone_number,
            sms_opt_in: r.sms_opt_in,
          },
          eventType: "booking.reminder_48h",
        });
        enqueuedAll.push(...queued);
      }
    }
  }

  if (enqueuedAll.length > 0) {
    return processNotificationOutbox({
      outboxGuids: enqueuedAll.map((o) => o.outbox_guid),
    });
  }

  return [];
}

/**
 * List `notification_outbox` entries for a business tenant (or all tenants in dev outbox).
 */
async function listNotificationOutbox({
  business = null,
  status = null,
  channel = null,
  template_type = null,
  limit = 100,
} = {}) {
  const params = [];
  const clauses = ["1=1"];

  if (business) {
    params.push(business);
    clauses.push(`LOWER(business) = LOWER($${params.length})`);
  }
  if (status) {
    params.push(String(status).toUpperCase());
    clauses.push(`UPPER(status) = $${params.length}`);
  }
  if (channel) {
    params.push(String(channel).toUpperCase());
    clauses.push(`UPPER(channel) = $${params.length}`);
  }
  if (template_type) {
    params.push(String(template_type).trim());
    clauses.push(`template_type = $${params.length}`);
  }

  params.push(Math.min(Number(limit) || 100, 250));

  const res = await db.query(
    `SELECT *
     FROM notification_outbox
     WHERE ${clauses.join(" AND ")}
     ORDER BY time_created DESC
     LIMIT $${params.length}`,
    params
  );

  return res.rows;
}

/**
 * Retry a FAILED or PENDING outbox notification (or all failed notifications for a tenant).
 */
async function retryOutboxNotifications(business, { outbox_guid = null } = {}) {
  const params = [business];
  let guidClause = `AND status IN ('FAILED', 'PENDING')`;
  if (outbox_guid) {
    params.push(outbox_guid);
    guidClause = `AND outbox_guid = $2`;
  }

  const resetRes = await db.query(
    `UPDATE notification_outbox
     SET status = 'PENDING',
         error_message = NULL
     WHERE LOWER(business) = LOWER($1)
       ${guidClause}
     RETURNING outbox_guid`,
    params
  );

  if (resetRes.rows.length === 0) {
    throw new ExpressError("No matching outbox notifications found to retry", 404);
  }

  const guids = resetRes.rows.map((r) => r.outbox_guid);
  return processNotificationOutbox({ business, outboxGuids: guids });
}

module.exports = {
  EmailProvider,
  SmsProvider,
  getProviderStatus,
  setProviderOutageState,
  enqueueLifecycleNotificationsInTx,
  processNotificationOutbox,
  dispatchUpcomingReminders,
  listNotificationOutbox,
  retryOutboxNotifications,
};

