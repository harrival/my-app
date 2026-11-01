const express = require("express");
const router = express.Router();
const db = require("../db");
const ExpressError = require("../expressError");
const {
  resolveTenant,
  resolveSessionIdentity,
  requireSupervisor,
} = require("../middleware");
const {
  DYNAMIC_SETTINGS_CATALOG,
  generateGuid,
  recordSupervisorAuditLog,
  getBusinessSettings,
  getBusinessSettingsCatalogWithValues,
  getPublicBusinessConfig,
  updateBusinessSettings,
  getBusinessTemplates,
  upsertBusinessTemplate,
  previewBusinessTemplate,
} = require("../services/dynamicSettingsService");
const {
  getBusinessRecord,
  upsertBusinessRecord,
  listAllBusinesses,
} = require("../services/businessService");
const {
  recordCustomerForTransaction,
  listBusinessCustomers,
  getCustomerWithReservations,
  verifyCustomerRegistryDecoupling,
} = require("../services/customerTransactionService");
const {
  getClockState,
  setClockOffsetHours,
  sweepExpiredHolds,
  parseAndValidateDateRange,
  checkItemAvailability,
  evaluateReservationQuote,
  createCheckoutHold,
  releaseCheckoutHold,
  expireReservationHoldNow,
  confirmReservationCheckout,
  processPaymentWebhook,
  executeReservationCancellation,
  executeReservationLifecycleChange,
  listBusinessReservations,
  getReservationByManageToken,
  seedDemoMultiTenantInventory,
} = require("../services/reservationPolicyEngine");
const {
  NOTIFICATION_EVENT_SPECS,
  getProviderStatus,
  setProviderOutageState,
  processNotificationOutbox,
  dispatchUpcomingReminders,
  listNotificationOutbox,
  retryOutboxNotifications,
} = require("../services/notificationOutboxService");
const {
  verifyProductionGuardrail,
  setFailNextPayment,
  getFailNextPaymentState,
  getPaymentProvider,
  getEmailProvider,
  getSmsProvider,
  getClock,
  requireNonProduction,
} = require("../services/providerFactory");
const {
  runVerificationChecklist,
} = require("../services/verificationChecklistService");

let ioInstance = null;
function setIo(io) {
  ioInstance = io;
}

function broadcastSettingsUpdate(business, settings) {
  if (ioInstance && business) {
    ioInstance.to(business).emit("settings_updated", settings);
  }
}

// ============================================================================
// 1. SettingsContext Compatibility Endpoints (/settings/:business)
// ============================================================================

router.get("/settings/:business", resolveTenant, async (req, res, next) => {
  try {
    const data = await getBusinessSettings(req.business);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

router.put(
  "/settings/:business",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const business = req.business;
      const partial = req.body?.settings || req.body || {};
      const actorGuid =
        req.actor?.user_guid ||
        req.body?.modifiedBy ||
        req.headers["x-user-guid"] ||
        "supervisor";

      const updated = await updateBusinessSettings(
        business,
        partial,
        actorGuid,
        req.body?.reason || "Updated business settings"
      );

      broadcastSettingsUpdate(business, updated.settings);
      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================================
// 2. Public Enterprise Business Directory & Multi-Tenant Booking Ingress API
// ============================================================================

/** GET /api/directory/businesses - public directory from business_table */
router.get("/api/directory/businesses", async (req, res, next) => {
  try {
    return res.json({ businesses: await listAllBusinesses() });
  } catch (err) { return next(err); }
});

router.get("/api/businesses", async (req, res, next) => {
  try {
    return res.json({ businesses: await listAllBusinesses() });
  } catch (err) { return next(err); }
});

/** GET /api/business/by-user/:user_guid - business linked to a Supervisor */
router.get("/api/business/by-user/:user_guid", async (req, res, next) => {
  try {
    const record = await getBusinessRecord({ userGuid: String(req.params.user_guid || "").trim() });
    return res.json({ business: record });
  } catch (err) { return next(err); }
});

/** GET /api/business/:business - full business info */
router.get("/api/business/:business", async (req, res, next) => {
  try {
    const business = String(req.params.business || "").trim();
    const userGuid = req.query.user_guid ? String(req.query.user_guid).trim() : null;
    return res.json({ business: await getBusinessRecord({ business, userGuid }) });
  } catch (err) { return next(err); }
});

async function afterBusinessSave(saved) {
  if (ioInstance && saved?.business) {
    const { settings } = await getBusinessSettings(saved.business);
    broadcastSettingsUpdate(saved.business, settings);
    ioInstance.emit("business_updated", saved);
  }
}

/** POST /api/business - create/link a business */
router.post("/api/business", async (req, res, next) => {
  try {
    const actor = req.body?.user_guid || req.headers["x-user-guid"] || "supervisor";
    const saved = await upsertBusinessRecord(req.body || {}, actor);
    await afterBusinessSave(saved);
    return res.status(201).json({ business: saved });
  } catch (err) { return next(err); }
});

/** PUT /api/business/:business - update business info */
router.put("/api/business/:business", async (req, res, next) => {
  try {
    const target = String(req.params.business || "").trim();
    const actor = req.body?.user_guid || req.headers["x-user-guid"] || "supervisor";
    const saved = await upsertBusinessRecord(
      { ...(req.body || {}), target_business: target, business: req.body?.business || target },
      actor
    );
    await afterBusinessSave(saved);
    return res.json({ business: saved });
  } catch (err) { return next(err); }
});

/**
 * GET /api/:business/session-role
 * Universal identity & role classification endpoint (re-checks users_table when x-user-guid is present).
 * Users whose permission_group is NOT in ('Admin', 'Supervisor', 'Agent') and !is_admin
 * (or who are unauthenticated) are classified as Customers.
 */
router.get(
  "/api/:business/session-role",
  resolveTenant,
  resolveSessionIdentity,
  async (req, res, next) => {
    try {
      return res.json({
        tenant_business: req.business,
        decoupled_customer_table: true,
        ...req.identity,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/customers/transaction-profile
 * Every transaction is recorded as an independent customer transaction in `customers`
 * with zero foreign key or link to `users_table`.
 */
router.post(
  "/api/:business/customers/transaction-profile",
  resolveTenant,
  resolveSessionIdentity,
  async (req, res, next) => {
    try {
      const prefill = req.identity?.customer_prefill || {};
      const result = await recordCustomerForTransaction(db, {
        business: req.business,
        first_name: req.body?.first_name || prefill.first_name,
        last_name: req.body?.last_name || prefill.last_name,
        email: req.body?.email || prefill.email,
        phone_number: req.body?.phone_number || prefill.phone_number,
        sms_opt_in: Boolean(req.body?.sms_opt_in),
      });

      return res.status(result.created ? 201 : 200).json({
        ...result,
        decoupled_from_users_table: true,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/config
 * Returns public business profile, dynamic policies, pricing/tax, and currency/timezone.
 */
router.get("/api/:business/config", resolveTenant, async (req, res, next) => {
  try {
    const config = await getPublicBusinessConfig(req.business);
    return res.json(config);
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/:business/items
 * Lists active catalog items and active unit counts strictly scoped to :business.
 */
router.get("/api/:business/items", resolveTenant, async (req, res, next) => {
  try {
    const queryItems = async () =>
      db.query(
        `SELECT
           i.*,
           COUNT(u.unit_guid) FILTER (WHERE u.is_active = TRUE)::int AS active_units_count
         FROM items i
         LEFT JOIN item_units u
           ON u.item_guid = i.item_guid AND LOWER(u.business) = LOWER(i.business)
         WHERE LOWER(i.business) = LOWER($1) AND i.is_active = TRUE
         GROUP BY i.id, i.item_guid
         ORDER BY i.time_created DESC`,
        [req.business]
      );

    let result = await queryItems();
    const lowerBiz = String(req.business || "").toLowerCase();
    if (
      result.rows.length === 0 &&
      (lowerBiz === "alpha_rentals" || lowerBiz === "beta_rentals")
    ) {
      await seedDemoMultiTenantInventory();
      result = await queryItems();
    }
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/:business/demo/seed-inv-102
 * Story INV-102 Scenario 1: Idempotently seeds alpha_rentals (3 units of Item X)
 * and beta_rentals (2 units of Item X + blackout) to verify strict tenant isolation.
 */
router.post(
  "/api/:business/demo/seed-inv-102",
  resolveTenant,
  async (req, res, next) => {
    try {
      const seeded = await seedDemoMultiTenantInventory();
      return res.json(seeded);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/items/:id/availability
 * Tenant-scoped availability, blackout check, and dynamic pricing calculation.
 */
router.get(
  "/api/:business/items/:id/availability",
  resolveTenant,
  async (req, res, next) => {
    try {
      const { start_date, end_date, exclude_reservation_guid } = req.query;
      const availability = await checkItemAvailability(
        req.business,
        req.params.id,
        start_date,
        end_date,
        { excludeReservationGuid: exclude_reservation_guid || null }
      );
      return res.json(availability);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/reservations
 * List reservations for this business tenant (sweeping any expired holds first).
 */
router.get(
  "/api/:business/reservations",
  resolveTenant,
  async (req, res, next) => {
    try {
      const list = await listBusinessReservations(req.business, {
        status: req.query.status || null,
        limit: req.query.limit || 50,
        customerGuid: req.query.customer_guid || null,
      });
      return res.json(list);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/reservations/hold
 * Action 1: Create an atomic Checkout Hold for settings.hold_ttl_seconds.
 */
router.post(
  "/api/:business/reservations/hold",
  resolveTenant,
  resolveSessionIdentity,
  async (req, res, next) => {
    try {
      const prefill = req.identity?.customer_prefill || {};
      const customer = {
        first_name: req.body?.customer?.first_name || prefill.first_name || "Checkout",
        last_name: req.body?.customer?.last_name || prefill.last_name || "Guest",
        email: req.body?.customer?.email || prefill.email,
        phone_number: req.body?.customer?.phone_number || prefill.phone_number || "0000000000",
        sms_opt_in: Boolean(req.body?.customer?.sms_opt_in),
      };

      const holdResult = await createCheckoutHold(req.business, {
        item_guid: req.body?.item_guid,
        start_date: req.body?.start_date,
        end_date: req.body?.end_date,
        customer,
      });

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "HOLD_CREATED",
          reservation: holdResult.reservation,
        });
      }

      return res.status(201).json(holdResult);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * DELETE /api/:business/reservations/:id/hold
 * Release temporary checkout hold early.
 */
router.delete(
  "/api/:business/reservations/:id/hold",
  resolveTenant,
  async (req, res, next) => {
    try {
      const released = await releaseCheckoutHold(req.business, req.params.id);
      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "HOLD_RELEASED",
          reservation: released,
        });
      }
      return res.json({ released: true, reservation: released });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/checkout/process
 * Process payment, register/link decoupled customer in `customers`, and confirm hold.
 */
router.post(
  "/api/:business/checkout/process",
  resolveTenant,
  resolveSessionIdentity,
  async (req, res, next) => {
    try {
      const prefill = req.identity?.customer_prefill || {};
      const rawCust = req.body?.customer || {};
      const customer = {
        first_name: rawCust.first_name || req.body?.first_name || prefill.first_name,
        last_name: rawCust.last_name || req.body?.last_name || prefill.last_name,
        email: rawCust.email || req.body?.email || prefill.email,
        phone_number: rawCust.phone_number || req.body?.phone_number || prefill.phone_number,
        sms_opt_in: Boolean(rawCust.sms_opt_in ?? req.body?.sms_opt_in),
      };

      const confirmed = await confirmReservationCheckout(req.business, {
        reservation_guid: req.body?.reservation_guid,
        item_guid: req.body?.item_guid,
        start_date: req.body?.start_date,
        end_date: req.body?.end_date,
        customer,
        payment_provider: req.body?.payment_provider || "mock",
      });

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "CONFIRMED",
          reservation: confirmed.reservation,
        });
      }

      return res.status(201).json(confirmed);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/reservations/:id/expire-hold
 * Story INV-102 Scenario 2: Immediately expires a HOLD reservation (simulating the countdown timer hitting 0s)
 * so the unit returns to the available pool.
 */
router.post(
  "/api/:business/reservations/:id/expire-hold",
  resolveTenant,
  async (req, res, next) => {
    try {
      const expired = await expireReservationHoldNow(
        req.business,
        req.params.id
      );
      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "HOLD_EXPIRED",
          reservation: expired.reservation,
        });
      }
      return res.json(expired);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/payments/webhook
 * Section 11.1: Stripe / Mock payment success & decline webhook dispatcher.
 */
router.post(
  "/api/:business/payments/webhook",
  resolveTenant,
  async (req, res, next) => {
    try {
      const result = await processPaymentWebhook(req.business, req.body || {});
      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: `WEBHOOK_${result.outcome}`,
          reservation: result.reservation,
        });
      }
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/reservations/:id/quote
 * Section 4.1 Policy Engine Quote Calculator for CANCEL, RESCHEDULE, ADD_DAYS, or REMOVE_DAYS.
 */
router.get(
  "/api/:business/reservations/:id/quote",
  resolveTenant,
  async (req, res, next) => {
    try {
      const quote = await evaluateReservationQuote(
        req.business,
        req.params.id,
        {
          action: req.query.action || "CANCEL",
          new_start_date: req.query.new_start_date,
          new_end_date: req.query.new_end_date,
          days_to_add: req.query.days_to_add,
          days_to_remove: req.query.days_to_remove,
          supervisor_override: req.query.supervisor_override === "true",
          waive_fee: req.query.waive_fee === "true",
          override_now: req.query.override_now || null,
        }
      );
      return res.json(quote);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/reservations/:id/cancel
 * Self-service cancellation evaluated against dynamic cutoff_hours and late_fee_percentage.
 */
router.post(
  "/api/:business/reservations/:id/cancel",
  resolveTenant,
  async (req, res, next) => {
    try {
      const result = await executeReservationCancellation(
        req.business,
        req.params.id,
        {
          actor_guid: req.body?.actor_guid || "customer_self_service",
          supervisor_override: false,
          waive_fee: false,
          reason: req.body?.reason || "Customer self-service cancellation",
          override_now: req.body?.override_now || null,
        }
      );

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "CANCELLED",
          reservation: result.reservation,
        });
      }

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/reservations/:id/reschedule
 * Self-service reschedule (same duration).
 */
router.post(
  "/api/:business/reservations/:id/reschedule",
  resolveTenant,
  async (req, res, next) => {
    try {
      const result = await executeReservationLifecycleChange(
        req.business,
        req.params.id,
        {
          action: "RESCHEDULE",
          new_start_date: req.body?.new_start_date,
          new_end_date: req.body?.new_end_date,
          actor_guid: req.body?.actor_guid || "customer_self_service",
          supervisor_override: false,
          waive_fee: false,
          reason: req.body?.reason || "Customer self-service reschedule",
          override_now: req.body?.override_now || null,
        }
      );

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "RESCHEDULED",
          reservation: result.reservation,
        });
      }

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/reservations/:id/add-days
 * Self-service date extension ($0 change fee, charges delta_days * daily_rate + tax).
 */
router.post(
  "/api/:business/reservations/:id/add-days",
  resolveTenant,
  async (req, res, next) => {
    try {
      const result = await executeReservationLifecycleChange(
        req.business,
        req.params.id,
        {
          action: "ADD_DAYS",
          new_start_date: req.body?.new_start_date,
          new_end_date: req.body?.new_end_date,
          days_to_add: req.body?.days_to_add,
          actor_guid: req.body?.actor_guid || "customer_self_service",
          supervisor_override: false,
          waive_fee: false,
          reason: req.body?.reason || "Customer self-service add days",
          override_now: req.body?.override_now || null,
        }
      );

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "DAYS_ADDED",
          reservation: result.reservation,
        });
      }

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/:business/reservations/:id/remove-days
 * Self-service date reduction (removed portion evaluated against cancellation policy).
 */
router.post(
  "/api/:business/reservations/:id/remove-days",
  resolveTenant,
  async (req, res, next) => {
    try {
      const result = await executeReservationLifecycleChange(
        req.business,
        req.params.id,
        {
          action: "REMOVE_DAYS",
          new_start_date: req.body?.new_start_date,
          new_end_date: req.body?.new_end_date,
          days_to_remove: req.body?.days_to_remove,
          actor_guid: req.body?.actor_guid || "customer_self_service",
          supervisor_override: false,
          waive_fee: false,
          reason: req.body?.reason || "Customer self-service remove days",
          override_now: req.body?.override_now || null,
        }
      );

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "DAYS_REMOVED",
          reservation: result.reservation,
        });
      }

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/manage/:token
 * Story CUST-100 & Section 11.1: Authenticate guest access for a single reservation
 * via its tokenized self-service management link without any users_table account.
 */
router.get(
  "/api/:business/manage/:token",
  resolveTenant,
  async (req, res, next) => {
    try {
      const data = await getReservationByManageToken(
        req.business,
        req.params.token
      );
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/customers/registry-status
 * Story CUST-100: Verifies that `customers` has zero foreign keys or columns linking to `users_table`
 * and optionally looks up a tenant-scoped customer record + reservations by `email` or `customer_guid`.
 */
router.get(
  "/api/:business/customers/registry-status",
  resolveTenant,
  async (req, res, next) => {
    try {
      const schemaProof = await verifyCustomerRegistryDecoupling(req.business);
      let customerLookup = null;
      if (req.query.email || req.query.customer_guid) {
        try {
          customerLookup = await getCustomerWithReservations(req.business, {
            email: req.query.email,
            customer_guid: req.query.customer_guid,
          });
        } catch (lookupErr) {
          if (lookupErr.status !== 404) throw lookupErr;
        }
      }
      return res.json({
        ...schemaProof,
        customer_lookup: customerLookup,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ============================================================================
// 3. Supervisor Control Panel Multi-Tenant API (/api/admin/:business/*)
// ============================================================================

/**
 * GET /api/admin/:business/settings
 * Read dynamic settings, catalog metadata, & templates for the supervisor's tenant.
 */
router.get(
  "/api/admin/:business/settings",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const { catalog, settings, time_modified } =
        await getBusinessSettingsCatalogWithValues(req.business);
      const templates = await getBusinessTemplates(req.business);
      return res.json({
        business: req.business,
        catalog,
        settings,
        templates,
        time_modified,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/:business/settings/catalog
 * Returns the Section 3.1 Dynamic Settings Catalog paired with the business's persisted values.
 */
router.get(
  "/api/:business/settings/catalog",
  resolveTenant,
  async (req, res, next) => {
    try {
      const data = await getBusinessSettingsCatalogWithValues(req.business);
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PUT /api/admin/:business/settings
 * Update dynamic business profile, policies, pricing, taxes, and notification switches.
 */
router.put(
  "/api/admin/:business/settings",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const partial = req.body?.settings || req.body || {};
      const reason =
        req.body?.reason || "Updated settings via Supervisor Control Panel";
      const updated = await updateBusinessSettings(
        req.business,
        partial,
        req.actor?.user_guid,
        reason
      );

      broadcastSettingsUpdate(req.business, updated.settings);
      return res.json({
        business: req.business,
        ...updated,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/templates
 * List all editable notification templates (Email & SMS) for this business tenant.
 */
router.get(
  "/api/admin/:business/templates",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const templates = await getBusinessTemplates(req.business);
      return res.json(templates);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/templates/preview
 * Render a live preview of a template using the tenant's dynamic settings and sample variables.
 */
router.post(
  "/api/admin/:business/templates/preview",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const preview = await previewBusinessTemplate(req.business, req.body || {});
      return res.json(preview);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/templates/:event
 * Read Email & SMS templates for a specific lifecycle event (e.g. booking.confirmed).
 */
router.get(
  "/api/admin/:business/templates/:event",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const templates = await getBusinessTemplates(
        req.business,
        req.params.event
      );
      return res.json(templates);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * PUT /api/admin/:business/templates/:event
 * Update an Email or SMS template for a lifecycle event and record an audit log entry.
 */
router.put(
  "/api/admin/:business/templates/:event",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const eventType = req.params.event;
      const channel = req.body?.channel || "EMAIL";
      const reason =
        req.body?.reason || `Updated ${channel} template for ${eventType}`;

      const updated = await upsertBusinessTemplate(
        req.business,
        eventType,
        channel,
        req.body,
        req.actor?.user_guid,
        reason
      );

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("templates_updated", updated);
      }

      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/outbox
 * Story NTF-301: Inspect transactional notification_outbox records, Section 8.1 event matrix,
 * and EmailProvider / SmsProvider health status for this business tenant.
 */
router.get(
  "/api/admin/:business/outbox",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const items = await listNotificationOutbox(req.business, {
        status: req.query.status || null,
        channel: req.query.channel || null,
        template_type: req.query.template_type || null,
        limit: req.query.limit || 50,
      });
      return res.json({
        business: req.business,
        story_id: "NTF-301",
        provider_status: getProviderStatus(),
        event_specs: NOTIFICATION_EVENT_SPECS,
        outbox: items,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/outbox/process
 * Story NTF-301 Section 8.2: Run the background outbox worker or retry FAILED / specific outbox notifications.
 */
router.post(
  "/api/admin/:business/outbox/process",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const outboxGuids = Array.isArray(req.body?.outbox_guids)
        ? req.body.outbox_guids
        : req.body?.outbox_guid
        ? [req.body.outbox_guid]
        : [];

      const result =
        req.body?.retry_failed || outboxGuids.length > 0
          ? await retryOutboxNotifications(req.business, outboxGuids)
          : await processNotificationOutbox({
              business: req.business,
              limit: req.body?.limit || 50,
            });

      return res.json({
        business: req.business,
        story_id: "NTF-301",
        provider_status: getProviderStatus(),
        ...result,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/outbox/reminders
 * Story NTF-301 Section 8.1: Trigger the `booking.reminder_48h` worker for upcoming CONFIRMED reservations
 * within `settings.reminder_lead_hours`.
 */
router.post(
  "/api/admin/:business/outbox/reminders",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const clock = getClockState();
      const nowToUse = req.body?.override_now
        ? new Date(req.body.override_now)
        : new Date(clock.now_iso);
      const result = await dispatchUpcomingReminders({
        business: req.business,
        now: nowToUse,
      });
      return res.json({
        business: req.business,
        story_id: "NTF-301",
        evaluated_at: nowToUse.toISOString(),
        ...result,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/outbox/provider-status
 * Story NTF-301 Section 8.2: Toggle simulated EmailProvider / SmsProvider outage to verify that
 * external provider outages never roll back committed customer reservations.
 */
router.post(
  "/api/admin/:business/outbox/provider-status",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const status = setProviderOutageState({
        email_outage: req.body?.email_outage,
        sms_outage: req.body?.sms_outage,
      });
      return res.json({
        business: req.business,
        story_id: "NTF-301",
        provider_status: status,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/items
 * List all items and serialized units for this business tenant.
 */
router.get(
  "/api/admin/:business/items",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const itemsRes = await db.query(
        `SELECT * FROM items WHERE LOWER(business) = LOWER($1) ORDER BY time_created DESC`,
        [req.business]
      );
      const unitsRes = await db.query(
        `SELECT * FROM item_units WHERE LOWER(business) = LOWER($1) ORDER BY time_created ASC`,
        [req.business]
      );

      const unitsByItem = {};
      for (const unit of unitsRes.rows) {
        if (!unitsByItem[unit.item_guid]) {
          unitsByItem[unit.item_guid] = [];
        }
        unitsByItem[unit.item_guid].push(unit);
      }

      const items = itemsRes.rows.map((item) => ({
        ...item,
        units: unitsByItem[item.item_guid] || [],
      }));

      return res.json(items);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/items
 * Create a tenant-scoped catalog item and optional initial serialized units.
 */
router.post(
  "/api/admin/:business/items",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    const client = await db.connect();
    try {
      const {
        name,
        description = "",
        daily_rate_cents,
        images = [],
        serial_numbers = [],
      } = req.body || {};

      if (!name || daily_rate_cents === undefined) {
        throw new ExpressError("name and daily_rate_cents are required", 400);
      }

      const itemGuid = generateGuid("item");
      await client.query("BEGIN");

      const itemRes = await client.query(
        `INSERT INTO items
          (item_guid, business, name, description, daily_rate_cents, images, is_active)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)
         RETURNING *`,
        [
          itemGuid,
          req.business,
          name.trim(),
          description,
          Number(daily_rate_cents),
          JSON.stringify(Array.isArray(images) ? images : []),
        ]
      );

      const createdUnits = [];
      if (Array.isArray(serial_numbers)) {
        for (const sn of serial_numbers) {
          if (!sn || !String(sn).trim()) continue;
          const unitGuid = generateGuid("unit");
          const uRes = await client.query(
            `INSERT INTO item_units (unit_guid, business, item_guid, serial_number, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING *`,
            [unitGuid, req.business, itemGuid, String(sn).trim()]
          );
          createdUnits.push(uRes.rows[0]);
        }
      }

      await recordSupervisorAuditLog(client, {
        business: req.business,
        actorGuid: req.actor?.user_guid,
        action: "ITEM_CREATED",
        entityType: "items",
        entityGuid: itemGuid,
        reason: `Created catalog item '${name.trim()}' with ${createdUnits.length} unit(s)`,
        beforeState: null,
        afterState: { ...itemRes.rows[0], units: createdUnits },
      });

      await client.query("COMMIT");
      return res.status(201).json({
        ...itemRes.rows[0],
        units: createdUnits,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  }
);

/**
 * PUT /api/admin/:business/items/:id
 * Story ADM-201 & Section 11.2: Edit item catalog metadata (name, description, daily_rate_cents, images, is_active).
 */
router.put(
  "/api/admin/:business/items/:id",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const beforeRes = await client.query(
        `SELECT * FROM items WHERE item_guid = $1 AND LOWER(business) = LOWER($2) LIMIT 1`,
        [req.params.id, req.business]
      );
      if (beforeRes.rows.length === 0) {
        throw new ExpressError("Catalog item not found for this business tenant", 404);
      }
      const beforeState = beforeRes.rows[0];
      const name =
        req.body?.name !== undefined ? String(req.body.name).trim() : beforeState.name;
      const description =
        req.body?.description !== undefined
          ? String(req.body.description)
          : beforeState.description;
      const dailyRateCents =
        req.body?.daily_rate_cents !== undefined
          ? Number(req.body.daily_rate_cents)
          : beforeState.daily_rate_cents;
      const images =
        req.body?.images !== undefined && Array.isArray(req.body.images)
          ? req.body.images
          : beforeState.images || [];
      const isActive =
        req.body?.is_active !== undefined
          ? Boolean(req.body.is_active)
          : beforeState.is_active;

      const updatedRes = await client.query(
        `UPDATE items
         SET name = $1,
             description = $2,
             daily_rate_cents = $3,
             images = $4::jsonb,
             is_active = $5,
             time_modified = CURRENT_TIMESTAMP
         WHERE item_guid = $6 AND LOWER(business) = LOWER($7)
         RETURNING *`,
        [
          name,
          description,
          dailyRateCents,
          JSON.stringify(images),
          isActive,
          req.params.id,
          req.business,
        ]
      );

      await recordSupervisorAuditLog(client, {
        business: req.business,
        actorGuid: req.actor?.user_guid,
        action: "ITEM_UPDATED",
        entityType: "items",
        entityGuid: req.params.id,
        reason: req.body?.reason || `Updated catalog item '${name}'`,
        beforeState,
        afterState: updatedRes.rows[0],
      });

      await client.query("COMMIT");
      return res.json(updatedRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/admin/:business/items/:id/units
 * Story ADM-201 & Section 11.2: Add physical serialized inventory unit(s) to an item.
 */
router.post(
  "/api/admin/:business/items/:id/units",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const itemRes = await client.query(
        `SELECT * FROM items WHERE item_guid = $1 AND LOWER(business) = LOWER($2) LIMIT 1`,
        [req.params.id, req.business]
      );
      if (itemRes.rows.length === 0) {
        throw new ExpressError("Catalog item not found for this business tenant", 404);
      }

      const rawSerials = Array.isArray(req.body?.serial_numbers)
        ? req.body.serial_numbers
        : req.body?.serial_number
        ? [req.body.serial_number]
        : [];
      const serials = rawSerials
        .map((s) => String(s || "").trim())
        .filter(Boolean);

      if (serials.length === 0) {
        throw new ExpressError("At least one serial_number is required", 400);
      }

      const createdUnits = [];
      for (const sn of serials) {
        const unitGuid = generateGuid("unit");
        const uRes = await client.query(
          `INSERT INTO item_units (unit_guid, business, item_guid, serial_number, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           RETURNING *`,
          [unitGuid, req.business, req.params.id, sn]
        );
        createdUnits.push(uRes.rows[0]);
      }

      await recordSupervisorAuditLog(client, {
        business: req.business,
        actorGuid: req.actor?.user_guid,
        action: "UNIT_ADDED",
        entityType: "item_units",
        entityGuid: req.params.id,
        reason:
          req.body?.reason ||
          `Added ${createdUnits.length} serialized unit(s) (${serials.join(", ")})`,
        beforeState: null,
        afterState: createdUnits,
      });

      await client.query("COMMIT");
      return res.status(201).json({
        item_guid: req.params.id,
        added_units: createdUnits,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/admin/:business/items/:id/units/:unitId (and /api/admin/:business/items/:id/units)
 * Story ADM-201 & Section 11.2: Deactivate a physical serialized inventory unit.
 */
router.delete(
  ["/api/admin/:business/items/:id/units/:unitId", "/api/admin/:business/items/:id/units"],
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    const client = await db.connect();
    try {
      const unitGuid = req.params.unitId || req.body?.unit_guid || req.query?.unit_guid;
      if (!unitGuid) {
        throw new ExpressError("unit_guid is required to deactivate a unit", 400);
      }

      await client.query("BEGIN");
      const beforeRes = await client.query(
        `SELECT * FROM item_units
         WHERE unit_guid = $1 AND item_guid = $2 AND LOWER(business) = LOWER($3)
         LIMIT 1`,
        [unitGuid, req.params.id, req.business]
      );
      if (beforeRes.rows.length === 0) {
        throw new ExpressError("Serialized unit not found for this item and tenant", 404);
      }

      const updatedRes = await client.query(
        `UPDATE item_units
         SET is_active = FALSE
         WHERE unit_guid = $1 AND item_guid = $2 AND LOWER(business) = LOWER($3)
         RETURNING *`,
        [unitGuid, req.params.id, req.business]
      );

      await recordSupervisorAuditLog(client, {
        business: req.business,
        actorGuid: req.actor?.user_guid,
        action: "UNIT_DEACTIVATED",
        entityType: "item_units",
        entityGuid: unitGuid,
        reason:
          req.body?.reason ||
          `Deactivated serialized unit ${beforeRes.rows[0].serial_number}`,
        beforeState: beforeRes.rows[0],
        afterState: updatedRes.rows[0],
      });

      await client.query("COMMIT");
      return res.json({
        deactivated: true,
        unit: updatedRes.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/admin/:business/audit-logs
 * Story ADM-201 Scenario 5: Query tenant-scoped supervisor audit logs with filtering by
 * date range (`start_date`, `end_date`), actor (`actor_guid`), and action type (`action`).
 */
router.get(
  "/api/admin/:business/audit-logs",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const {
        action,
        actor_guid,
        start_date,
        end_date,
        limit = 100,
      } = req.query;
      const params = [req.business];
      const clauses = ["LOWER(business) = LOWER($1)"];

      if (action && String(action).trim()) {
        const cleanAction = String(action).trim().toUpperCase();
        if (cleanAction === "POLICY_UPDATE" || cleanAction === "SETTINGS_UPDATE") {
          clauses.push(`action IN ('SETTINGS_UPDATE', 'POLICY_UPDATE')`);
        } else {
          params.push(cleanAction);
          clauses.push(`UPPER(action) = $${params.length}`);
        }
      }
      if (actor_guid && String(actor_guid).trim()) {
        params.push(`%${String(actor_guid).trim().toLowerCase()}%`);
        clauses.push(`LOWER(actor_guid) LIKE $${params.length}`);
      }
      if (start_date && String(start_date).trim()) {
        params.push(`${String(start_date).trim()}T00:00:00.000Z`);
        clauses.push(`time_created >= $${params.length}::timestamptz`);
      }
      if (end_date && String(end_date).trim()) {
        params.push(`${String(end_date).trim()}T23:59:59.999Z`);
        clauses.push(`time_created <= $${params.length}::timestamptz`);
      }

      params.push(Math.min(Number(limit) || 100, 200));
      const result = await db.query(
        `SELECT *
         FROM supervisor_audit_logs
         WHERE ${clauses.join(" AND ")}
         ORDER BY time_created DESC
         LIMIT $${params.length}`,
        params
      );

      return res.json(result.rows);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * Helper to inspect Section 10 Harmonized Enterprise Data Schema in PostgreSQL.
 */
async function inspectHarmonizedEnterpriseSchema() {
  const section10Tables = [
    "customers",
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
  const legacyTables = [
    "users_table",
    "events_table",
    "puzzles_type",
    "reps_table",
    "game_players_table",
  ];
  const allTables = [...section10Tables, ...legacyTables];

  const colsRes = await db.query(
    `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
       AND column_name = 'business'
     ORDER BY table_name ASC`,
    [allTables]
  );

  const gistRes = await db.query(
    `SELECT conname, pg_get_constraintdef(oid) AS constraint_def
     FROM pg_constraint
     WHERE conname = 'no_overlapping_active_reservations'
     LIMIT 1`
  );

  const idxRes = await db.query(
    `SELECT indexname, tablename
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])
     ORDER BY tablename ASC, indexname ASC`,
    [section10Tables]
  );

  const byTable = {};
  for (const row of colsRes.rows) {
    byTable[row.table_name] = row;
  }

  return {
    section: "10. Harmonized Enterprise Data Schema (data.sql Extension)",
    section_10_tables: section10Tables.map((tableName, idx) => ({
      number: idx + 1,
      table_name: tableName,
      exists: Boolean(byTable[tableName]),
      business_column: byTable[tableName]
        ? `${byTable[tableName].data_type}(${byTable[tableName].character_maximum_length || 100})`
        : null,
      is_nullable: byTable[tableName]?.is_nullable || null,
    })),
    legacy_tables_harmonized: legacyTables.map((tableName) => ({
      table_name: tableName,
      has_business_column: Boolean(byTable[tableName]),
    })),
    gist_exclusion_constraint: gistRes.rows[0] || null,
    indexes: idxRes.rows,
  };
}

/**
 * GET /api/admin/:business/tenant-overview
 * Returns multi-tenant partition metrics and Section 10 schema verification for the current business tenant.
 */
router.get(
  "/api/admin/:business/tenant-overview",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const [countsQuery, schemaStatus] = await Promise.all([
        db.query(
          `SELECT
             (SELECT COUNT(*)::int FROM items WHERE LOWER(business) = LOWER($1)) AS items_count,
             (SELECT COUNT(*)::int FROM item_units WHERE LOWER(business) = LOWER($1)) AS units_count,
             (SELECT COUNT(*)::int FROM customers WHERE LOWER(business) = LOWER($1)) AS customers_count,
             (SELECT COUNT(*)::int FROM reservations WHERE LOWER(business) = LOWER($1)) AS reservations_count,
             (SELECT COUNT(*)::int FROM reservation_changes WHERE LOWER(business) = LOWER($1)) AS reservation_changes_count,
             (SELECT COUNT(*)::int FROM payments WHERE LOWER(business) = LOWER($1)) AS payments_count,
             (SELECT COUNT(*)::int FROM inventory_blackouts WHERE LOWER(business) = LOWER($1)) AS blackouts_count,
             (SELECT COUNT(*)::int FROM supervisor_audit_logs WHERE LOWER(business) = LOWER($1)) AS audit_logs_count,
             (SELECT COUNT(*)::int FROM notification_outbox WHERE LOWER(business) = LOWER($1)) AS outbox_count,
             (SELECT COUNT(*)::int FROM business_templates WHERE LOWER(business) = LOWER($1)) AS templates_count,
             (SELECT COUNT(*)::int FROM business_settings WHERE LOWER(business) = LOWER($1)) AS configured_settings_count`,
          [req.business]
        ),
        inspectHarmonizedEnterpriseSchema(),
      ]);

      return res.json({
        business: req.business,
        actor: req.actor,
        metrics: countsQuery.rows[0],
        schema_status: schemaStatus,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/schema-status
 * Section 10: Inspect Harmonized Enterprise Data Schema (`data.sql` Extension) status in PostgreSQL.
 */
router.get(
  "/api/admin/:business/schema-status",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const schemaStatus = await inspectHarmonizedEnterpriseSchema();
      return res.json({
        business: req.business,
        ...schemaStatus,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/customers
 * List independent customer records scoped strictly to :business.
 */
router.get(
  "/api/admin/:business/customers",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const customers = await listBusinessCustomers(req.business, {
        email: req.query.email,
        limit: req.query.limit,
      });
      return res.json(customers);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/reservations
 * Search, filter, and inspect customer bookings for this business tenant.
 */
router.get(
  "/api/admin/:business/reservations",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const reservations = await listBusinessReservations(req.business, {
        status: req.query.status || null,
        search: req.query.search || null,
        limit: req.query.limit || 100,
      });
      return res.json(reservations);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/reservations/:id/override
 * Supervisor override (cancel after start, reschedule, add/remove days, or fee-waiver + reason).
 */
router.post(
  "/api/admin/:business/reservations/:id/override",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const action = String(req.body?.action || "CANCEL").toUpperCase();
      const waiveFee = Boolean(req.body?.waive_fee);
      const reason =
        req.body?.reason || `Supervisor override (${action})`;

      let result;
      if (action === "CANCEL") {
        result = await executeReservationCancellation(
          req.business,
          req.params.id,
          {
            actor_guid: req.actor?.user_guid || "supervisor",
            supervisor_override: true,
            waive_fee: waiveFee,
            reason,
            override_now: req.body?.override_now || null,
          }
        );
      } else {
        result = await executeReservationLifecycleChange(
          req.business,
          req.params.id,
          {
            action,
            new_start_date: req.body?.new_start_date,
            new_end_date: req.body?.new_end_date,
            actor_guid: req.actor?.user_guid || "supervisor",
            supervisor_override: true,
            waive_fee: waiveFee,
            reason,
            override_now: req.body?.override_now || null,
          }
        );
      }

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: `SUPERVISOR_${action}`,
          reservation: result.reservation,
        });
      }

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/reservations/manual
 * Section 11.2: Create manual booking (offline cash / payment link options) and record in supervisor_audit_logs.
 */
router.post(
  "/api/admin/:business/reservations/manual",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const {
        item_guid,
        start_date,
        end_date,
        customer = {},
        payment_option = "OFFLINE_CASH",
        reason = "Manual booking created via Supervisor Control Panel",
      } = req.body || {};

      const confirmed = await confirmReservationCheckout(req.business, {
        item_guid,
        start_date,
        end_date,
        customer,
        payment_provider:
          String(payment_option).toUpperCase() === "PAYMENT_LINK"
            ? "payment_link"
            : "offline_cash",
      });

      await recordSupervisorAuditLog(db, {
        business: req.business,
        actorGuid: req.actor?.user_guid || "supervisor",
        action: "MANUAL_RESERVATION",
        entityType: "reservations",
        entityGuid: confirmed.reservation.reservation_guid,
        reason,
        beforeState: null,
        afterState: {
          reservation: confirmed.reservation,
          payment_option,
        },
      });

      if (ioInstance && req.business) {
        ioInstance.to(req.business).emit("reservations_updated", {
          action: "MANUAL_CONFIRMED",
          reservation: confirmed.reservation,
        });
      }

      return res.status(201).json(confirmed);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/admin/:business/refunds/queue
 * Section 11.2: Inspect refunds and failed/pending payment records for this business tenant.
 */
router.get(
  "/api/admin/:business/refunds/queue",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const resQuery = await db.query(
        `SELECT p.*, r.customer_guid, r.status AS reservation_status
         FROM payments p
         LEFT JOIN reservations r ON r.reservation_guid = p.reservation_guid
         WHERE LOWER(p.business) = LOWER($1)
           AND (p.type = 'REFUND' OR p.status IN ('FAILED', 'PENDING', 'MANUAL'))
         ORDER BY p.time_created DESC
         LIMIT 100`,
        [req.business]
      );
      return res.json(resQuery.rows);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/refunds/queue
 * Section 11.2: Retry a failed refund or mark it resolved manually (`status = 'MANUAL'` or `'SUCCEEDED'`).
 */
router.post(
  "/api/admin/:business/refunds/queue",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    const client = await db.connect();
    try {
      const {
        payment_guid,
        resolution = "MANUAL",
        reason = "Supervisor resolved refund in queue",
      } = req.body || {};

      if (!payment_guid) {
        throw new ExpressError("payment_guid is required", 400);
      }

      await client.query("BEGIN");
      const beforeRes = await client.query(
        `SELECT * FROM payments WHERE payment_guid = $1 AND LOWER(business) = LOWER($2) LIMIT 1`,
        [payment_guid, req.business]
      );
      if (beforeRes.rows.length === 0) {
        throw new ExpressError("Payment/refund record not found for this business", 404);
      }

      const nextStatus =
        String(resolution).toUpperCase() === "RETRY" ? "SUCCEEDED" : "MANUAL";

      const updatedRes = await client.query(
        `UPDATE payments
         SET status = $1,
             attempts = COALESCE(attempts, 1) + 1
         WHERE payment_guid = $2 AND LOWER(business) = LOWER($3)
         RETURNING *`,
        [nextStatus, payment_guid, req.business]
      );

      await recordSupervisorAuditLog(client, {
        business: req.business,
        actorGuid: req.actor?.user_guid || "supervisor",
        action: "REFUND_QUEUE_RESOLVED",
        entityType: "payments",
        entityGuid: payment_guid,
        reason,
        beforeState: beforeRes.rows[0],
        afterState: updatedRes.rows[0],
      });

      await client.query("COMMIT");
      return res.json(updatedRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/admin/:business/blackouts
 * List inventory blackout windows for this business tenant.
 */
router.get(
  "/api/admin/:business/blackouts",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT b.*, b.date_range::text AS date_range_text, i.name AS item_name
         FROM inventory_blackouts b
         LEFT JOIN items i ON i.item_guid = b.item_guid
         WHERE LOWER(b.business) = LOWER($1)
         ORDER BY b.time_created DESC`,
        [req.business]
      );
      return res.json(result.rows);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/:business/blackouts
 * Create a tenant-scoped blackout window (with active reservation conflict detection) and log to supervisor_audit_logs.
 */
router.post(
  "/api/admin/:business/blackouts",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    const client = await db.connect();
    try {
      const {
        item_guid = null,
        start_date,
        end_date,
        reason,
        force_override = false,
      } = req.body || {};
      if (!reason || !String(reason).trim()) {
        throw new ExpressError("reason is required to create a blackout", 400);
      }
      const range = parseAndValidateDateRange(start_date, end_date);
      const blackoutGuid = generateGuid("blk");

      await client.query("BEGIN");

      // Conflict detection against active HOLD or CONFIRMED reservations in this tenant
      const conflictParams = [req.business, range.pgDateRange];
      let itemFilter = "";
      if (item_guid) {
        conflictParams.push(item_guid);
        itemFilter = ` AND item_guid = $3`;
      }
      const conflictsRes = await client.query(
        `SELECT reservation_guid, item_guid, unit_guid, status, date_range::text AS date_range
         FROM reservations
         WHERE LOWER(business) = LOWER($1)
           AND status IN ('HOLD', 'CONFIRMED')
           AND date_range && $2::daterange
           ${itemFilter}`,
        conflictParams
      );

      if (conflictsRes.rows.length > 0 && !force_override) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: {
            message: `Blackout conflicts with ${conflictsRes.rows.length} active reservation(s). Pass force_override: true to override.`,
            status: 409,
          },
          conflicting_reservations: conflictsRes.rows,
        });
      }

      const insertRes = await client.query(
        `INSERT INTO inventory_blackouts
          (blackout_guid, business, item_guid, date_range, reason, created_by, time_created)
         VALUES ($1, $2, $3, $4::daterange, $5, $6, CURRENT_TIMESTAMP)
         RETURNING *, date_range::text AS date_range_text`,
        [
          blackoutGuid,
          req.business,
          item_guid || null,
          range.pgDateRange,
          String(reason).trim(),
          req.actor?.user_guid || "supervisor",
        ]
      );

      await recordSupervisorAuditLog(client, {
        business: req.business,
        actorGuid: req.actor?.user_guid || "supervisor",
        action: "BLACKOUT_CREATED",
        entityType: "inventory_blackouts",
        entityGuid: blackoutGuid,
        reason: String(reason).trim(),
        beforeState: null,
        afterState: {
          ...insertRes.rows[0],
          conflicts_overridden: conflictsRes.rows.length,
        },
      });

      await client.query("COMMIT");
      return res.status(201).json({
        ...insertRes.rows[0],
        conflicting_reservations: conflictsRes.rows,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      return next(err);
    } finally {
      client.release();
    }
  }
);

// ============================================================================
// 4. Story DEV-401 & Section 11.3: Development & QA Tooling API (/dev/*)
//    Automatically blocked when NODE_ENV === 'production'
// ============================================================================

/**
 * GET /dev/providers
 * Story DEV-401 Section 9.1: Inspect Provider Factory (getPaymentProvider, getEmailProvider,
 * getSmsProvider, getClock) and Production Guardrail status.
 */
router.get("/dev/providers", requireNonProduction, async (req, res, next) => {
  try {
    const outageState = getProviderStatus();
    const clockState = getClockState();
    const guardrail = verifyProductionGuardrail(req.query || {});
    return res.json({
      story_id: "DEV-401",
      factory: {
        payment_provider: getPaymentProvider(),
        email_provider: getEmailProvider(outageState),
        sms_provider: getSmsProvider(outageState),
        clock_provider: getClock(clockState),
      },
      fail_next_payment: getFailNextPaymentState(),
      outage_simulation: outageState,
      production_guardrail: guardrail,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /dev/clock
 * Story DEV-401 & Section 11.3: Inspect simulated system time (`offsetHours`).
 */
router.get("/dev/clock", requireNonProduction, (req, res) => {
  const clockState = getClockState();
  return res.json({
    story_id: "DEV-401",
    provider: getClock(clockState),
    ...clockState,
  });
});

/**
 * POST /dev/clock
 * Story DEV-401 & Section 11.3: Advance or set simulated time (`offsetHours` or `deltaHours`)
 * to test 7-day cancellation cutoffs, automated reminders, and hold expirations in seconds.
 */
router.post("/dev/clock", requireNonProduction, async (req, res, next) => {
  try {
    const current = getClockState();
    let targetOffsetHours = current.offset_hours;

    if (req.body?.reset === true) {
      targetOffsetHours = 0;
    } else if (req.body?.offsetHours !== undefined) {
      targetOffsetHours = Number(req.body.offsetHours);
    } else if (req.body?.offset_hours !== undefined) {
      targetOffsetHours = Number(req.body.offset_hours);
    } else if (req.body?.deltaHours !== undefined) {
      targetOffsetHours = current.offset_hours + Number(req.body.deltaHours);
    } else if (req.body?.delta_hours !== undefined) {
      targetOffsetHours = current.offset_hours + Number(req.body.delta_hours);
    }

    const updatedClock = setClockOffsetHours(targetOffsetHours);
    // Automatically sweep any holds that expired as a result of time travel
    const expiredHolds = await sweepExpiredHolds(db, req.body?.business || null);

    return res.json({
      story_id: "DEV-401",
      provider: getClock(updatedClock),
      ...updatedClock,
      swept_expired_holds_count: expiredHolds.length,
      swept_expired_holds: expiredHolds,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET & POST /dev/payments/fail-next
 * Story DEV-401 & Section 11.3: Force next mock payment or refund to decline.
 */
router.get("/dev/payments/fail-next", requireNonProduction, (req, res) => {
  return res.json({
    story_id: "DEV-401",
    payment_provider: getPaymentProvider(),
    ...getFailNextPaymentState(),
  });
});

router.post("/dev/payments/fail-next", requireNonProduction, (req, res) => {
  const failNext =
    req.body?.fail_next !== undefined ? Boolean(req.body.fail_next) : true;
  const reason = req.body?.reason || null;
  const state = setFailNextPayment(failNext, reason);
  return res.json({
    story_id: "DEV-401",
    payment_provider: getPaymentProvider(),
    ...state,
  });
});

/**
 * POST /dev/jobs/:name/run
 * Story DEV-401 & Section 11.3: Manually trigger sweeper, reminder, outbox, or refund worker.
 */
router.post("/dev/jobs/:name/run", requireNonProduction, async (req, res, next) => {
  try {
    const jobName = String(req.params.name || "").trim().toLowerCase();
    const business = req.body?.business || req.query?.business || null;
    const clock = getClockState();

    if (jobName === "sweeper" || jobName === "hold-sweeper" || jobName === "holds") {
      const swept = await sweepExpiredHolds(db, business);
      return res.json({
        story_id: "DEV-401",
        job: "sweeper",
        evaluated_at: clock.now_iso,
        swept_count: swept.length,
        swept_reservations: swept,
      });
    }

    if (
      jobName === "reminder" ||
      jobName === "reminders" ||
      jobName === "reminder_48h"
    ) {
      const reminderResult = await dispatchUpcomingReminders({
        business,
        now: new Date(clock.now_iso),
      });
      return res.json({
        story_id: "DEV-401",
        job: "reminder",
        evaluated_at: clock.now_iso,
        ...reminderResult,
      });
    }

    if (jobName === "outbox" || jobName === "notifications") {
      const outboxResult = await processNotificationOutbox({
        business,
        limit: Number(req.body?.limit) || 50,
      });
      return res.json({
        story_id: "DEV-401",
        job: "outbox",
        evaluated_at: clock.now_iso,
        ...outboxResult,
      });
    }

    if (jobName === "refund" || jobName === "refunds" || jobName === "refund-worker") {
      const params = [];
      let bizFilter = "";
      if (business) {
        params.push(business);
        bizFilter = ` AND LOWER(business) = LOWER($1)`;
      }
      const refundRes = await db.query(
        `UPDATE payments
         SET status = 'SUCCEEDED',
             attempts = COALESCE(attempts, 1) + 1
         WHERE type = 'REFUND'
           AND status IN ('FAILED', 'PENDING')
           ${bizFilter}
         RETURNING *`,
        params
      );
      return res.json({
        story_id: "DEV-401",
        job: "refund",
        evaluated_at: clock.now_iso,
        processed_refunds_count: refundRes.rows.length,
        processed_refunds: refundRes.rows,
      });
    }

    throw new ExpressError(
      `Unknown job '${jobName}'. Supported jobs: sweeper, reminder, outbox, refund`,
      400
    );
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /dev/outbox
 * Story DEV-401 & Section 11.3: Render HTML inspector (or JSON when ?format=json / Accept: application/json)
 * of queued/sent customer emails & SMS with clickable tokenized guest management links.
 */
router.get("/dev/outbox", requireNonProduction, async (req, res, next) => {
  try {
    const business = req.query.business || null;
    const status = req.query.status || null;
    const channel = req.query.channel || null;
    const limit = req.query.limit || 100;

    const items = await listNotificationOutbox(business, {
      status,
      channel,
      limit,
    });
    const clock = getClockState();
    const outageState = getProviderStatus();

    const wantsJson =
      req.query.format === "json" ||
      (req.headers.accept &&
        req.headers.accept.includes("application/json") &&
        !req.headers.accept.includes("text/html"));

    if (wantsJson) {
      return res.json({
        story_id: "DEV-401",
        clock,
        provider_status: outageState,
        count: items.length,
        outbox: items,
      });
    }

    const escapeHtml = (str) =>
      String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const rowsHtml = items
      .map((item) => {
        const subject = item.payload?.subject || "(SMS / No Subject)";
        const manageUrl = item.payload?.variables?.manage_url || null;
        return `
          <tr>
            <td><code>${escapeHtml(item.outbox_guid)}</code><br/><small>${escapeHtml(
          new Date(item.time_created).toISOString()
        )}</small></td>
            <td><strong>${escapeHtml(item.business)}</strong></td>
            <td><span class="pill">${escapeHtml(item.channel)}</span></td>
            <td><code>${escapeHtml(item.template_type)}</code></td>
            <td>${escapeHtml(item.recipient)}</td>
            <td><span class="status status-${escapeHtml(
              String(item.status).toLowerCase()
            )}">${escapeHtml(item.status)}</span> (attempts: ${escapeHtml(
          item.attempts
        )})</td>
            <td>
              <div><strong>${escapeHtml(subject)}</strong></div>
              <pre>${escapeHtml(item.rendered_body || "")}</pre>
              ${
                manageUrl
                  ? `<div style="margin-top:6px;"><a href="${escapeHtml(
                      manageUrl
                    )}" class="link-btn">🔗 Open Tokenized Guest Management Link (${escapeHtml(
                      manageUrl
                    )})</a></div>`
                  : ""
              }
              ${
                item.error_message
                  ? `<div style="color:#991b1b;font-weight:bold;margin-top:4px;">Error: ${escapeHtml(
                      item.error_message
                    )}</div>`
                  : ""
              }
            </td>
          </tr>
        `;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>DEV-401 Outbox Inspector (/dev/outbox)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4fbf2; color: #163013; margin: 0; padding: 24px; }
    .header { background: #fff; border: 1px solid #cce5c8; border-radius: 12px; padding: 18px 22px; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; color: #174b0f; font-size: 1.4rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #cce5c8; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #e4f2e1; text-align: left; vertical-align: top; font-size: 0.88rem; }
    th { background: #eaf7e7; color: #174b0f; font-weight: 700; }
    pre { background: #f8fcf7; border: 1px solid #d5ead1; border-radius: 8px; padding: 10px; white-space: pre-wrap; margin: 6px 0 0; font-size: 0.82rem; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e3f5df; color: #174b0f; font-weight: 700; font-size: 0.75rem; }
    .status { font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; }
    .status-sent { background: #dcfce7; color: #166534; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .link-btn { display: inline-block; padding: 6px 10px; background: #246a19; color: #fff; text-decoration: none; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Story DEV-401 — Local Notification Outbox Inspector (/dev/outbox)</h1>
    <p style="margin:0;">Simulated Clock: <code>${escapeHtml(
      clock.now_iso
    )}</code> (Offset: <strong>${escapeHtml(
      clock.offset_hours
    )}h</strong>) • Total Messages: <strong>${items.length}</strong> • <a href="/dev/outbox?format=json">View Raw JSON</a></p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Outbox GUID / Created</th>
        <th>Tenant</th>
        <th>Channel</th>
        <th>Event Type</th>
        <th>Recipient</th>
        <th>Delivery Status</th>
        <th>Rendered Message &amp; Tokenized Guest Self-Service Link</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="7">No notifications in notification_outbox yet.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    return next(err);
  }
});

// ============================================================================
// 5. Section 11 API Specification Summary & Live Route Registry Verifier
// ============================================================================

const SECTION_11_API_SPEC = {
  "11.1_public_booking_portal_api": [
    {
      method: "GET",
      path: "/api/:business/config",
      auth: "Public",
      purpose: "Returns public business info, taxes, policies, announcements",
    },
    {
      method: "GET",
      path: "/api/:business/items",
      auth: "Public",
      purpose: "List active items and catalog metadata",
    },
    {
      method: "GET",
      path: "/api/:business/items/:id/availability",
      auth: "Public",
      purpose: "Date range availability calculation & disabled dates",
    },
    {
      method: "POST",
      path: "/api/:business/reservations/hold",
      auth: "Public",
      purpose: "Creates 10-minute inventory hold on a unit",
    },
    {
      method: "DELETE",
      path: "/api/:business/reservations/:id/hold",
      auth: "Hold Owner",
      purpose: "Release temporary checkout hold early",
    },
    {
      method: "POST",
      path: "/api/:business/checkout/process",
      auth: "Public",
      purpose: "Process payment, register/link customer, confirm hold",
    },
    {
      method: "POST",
      path: "/api/:business/payments/webhook",
      auth: "Signature",
      purpose: "Stripe / Mock payment success & decline webhook",
    },
    {
      method: "GET",
      path: "/api/:business/reservations/:id/quote",
      auth: "Token/Auth",
      purpose: "Calculate fees/refunds for cancel/reschedule/add/remove",
    },
    {
      method: "POST",
      path: "/api/:business/reservations/:id/cancel",
      auth: "Token/Auth",
      purpose: "Self-service cancellation",
    },
    {
      method: "POST",
      path: "/api/:business/reservations/:id/reschedule",
      auth: "Token/Auth",
      purpose: "Self-service reschedule (same duration)",
    },
    {
      method: "POST",
      path: "/api/:business/reservations/:id/add-days",
      auth: "Token/Auth",
      purpose: "Self-service date extension",
    },
    {
      method: "POST",
      path: "/api/:business/reservations/:id/remove-days",
      auth: "Token/Auth",
      purpose: "Self-service date reduction",
    },
    {
      method: "GET",
      path: "/api/:business/manage/:token",
      auth: "Token Link",
      purpose: "Authenticate guest access for single reservation",
    },
  ],
  "11.2_supervisor_administration_api": [
    {
      method: "GET/PUT",
      path: "/api/admin/:business/settings",
      auth: "requireSupervisor",
      purpose: "Read / update dynamic business profile, policies, and taxes",
    },
    {
      method: "GET/PUT",
      path: "/api/admin/:business/templates/:event",
      auth: "requireSupervisor",
      purpose: "Read / edit email & SMS template text and variables",
    },
    {
      method: "GET/POST",
      path: "/api/admin/:business/items",
      auth: "requireSupervisor",
      purpose: "Item catalog CRUD (create items, edit daily rates, upload images)",
    },
    {
      method: "POST/DEL",
      path: "/api/admin/:business/items/:id/units",
      auth: "requireSupervisor",
      purpose: "Add or deactivate physical serialized inventory units",
    },
    {
      method: "GET/POST",
      path: "/api/admin/:business/blackouts",
      auth: "requireSupervisor",
      purpose: "List or create date blackouts with conflict detection",
    },
    {
      method: "GET",
      path: "/api/admin/:business/reservations",
      auth: "requireSupervisor",
      purpose: "Search, filter, and inspect customer bookings",
    },
    {
      method: "POST",
      path: "/api/admin/:business/reservations/manual",
      auth: "requireSupervisor",
      purpose: "Create booking (offline cash / payment link options)",
    },
    {
      method: "POST",
      path: "/api/admin/:business/reservations/:id/override",
      auth: "requireSupervisor",
      purpose: "Supervisor override (cancel/reschedule with fee-waiver + reason)",
    },
    {
      method: "GET",
      path: "/api/admin/:business/audit-logs",
      auth: "requireSupervisor",
      purpose: "Query supervisor action logs with filtering and JSON diffs",
    },
    {
      method: "GET/POST",
      path: "/api/admin/:business/refunds/queue",
      auth: "requireSupervisor",
      purpose: "Inspect and retry failed refunds or mark resolved manually",
    },
  ],
  "11.3_development_and_qa_tooling_api": [
    {
      method: "GET",
      path: "/dev/outbox",
      auth: "NODE_ENV !== 'production'",
      purpose: "Render HTML inspector of queued/sent customer emails & SMS",
    },
    {
      method: "GET/POST",
      path: "/dev/clock",
      auth: "NODE_ENV !== 'production'",
      purpose: "Inspect or advance simulated time (offsetHours)",
    },
    {
      method: "POST",
      path: "/dev/payments/fail-next",
      auth: "NODE_ENV !== 'production'",
      purpose: "Force next mock payment or refund to decline",
    },
    {
      method: "POST",
      path: "/dev/jobs/:name/run",
      auth: "NODE_ENV !== 'production'",
      purpose: "Manually trigger sweeper, reminder, or refund worker",
    },
  ],
};

function buildLiveRouteVerification() {
  const registeredRoutes = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      const methods = Object.keys(layer.route.methods || {}).map((m) =>
        m.toUpperCase()
      );
      for (const p of paths) {
        registeredRoutes.push({ path: p, methods });
      }
    }
  }
  return {
    section: "11. API Specification Summary",
    specification: SECTION_11_API_SPEC,
    registered_express_routes_count: registeredRoutes.length,
    registered_express_routes: registeredRoutes,
  };
}

router.get("/api/:business/api-spec", resolveTenant, (req, res) => {
  return res.json({
    business: req.business,
    ...buildLiveRouteVerification(),
  });
});

router.get("/dev/api-spec", requireNonProduction, (req, res) => {
  return res.json(buildLiveRouteVerification());
});

// ============================================================================
// 6. Section 12: Verification Checklist & Guardrails Endpoints
// ============================================================================

router.get(
  "/api/admin/:business/verification-checklist",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const report = await runVerificationChecklist(req.business);
      return res.json(report);
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/api/admin/:business/verification-checklist/run",
  resolveTenant,
  requireSupervisor,
  async (req, res, next) => {
    try {
      const report = await runVerificationChecklist(req.business);
      return res.json(report);
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/dev/verification-checklist",
  requireNonProduction,
  async (req, res, next) => {
    try {
      const report = await runVerificationChecklist(
        req.query.business || "alpha_rentals"
      );
      return res.json(report);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = { router, setIo };

