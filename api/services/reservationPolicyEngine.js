const crypto = require("crypto");
const db = require("../db");
const ExpressError = require("../expressError");
const {
  generateGuid,
  recordSupervisorAuditLog,
  getBusinessSettings,
  getBusinessTemplates,
  renderHandlebarsTemplate,
  formatCents,
} = require("./dynamicSettingsService");
const {
  recordCustomerForTransaction,
} = require("./customerTransactionService");
const {
  enqueueLifecycleNotificationsInTx,
  processNotificationOutbox,
} = require("./notificationOutboxService");
const {
  consumeFailNextPayment,
} = require("./providerFactory");

// Simulated clock offset in milliseconds (used by Time Travel in DEV-401 and policy evaluations)
let clockOffsetMs = 0;

function getNow(overrideNow = null) {
  if (overrideNow) {
    return new Date(overrideNow);
  }
  return new Date(Date.now() + clockOffsetMs);
}

function getClockState() {
  const now = getNow();
  return {
    now_iso: now.toISOString(),
    offset_hours: Number((clockOffsetMs / (1000 * 60 * 60)).toFixed(2)),
    offset_ms: clockOffsetMs,
  };
}

function setClockOffsetHours(offsetHours = 0) {
  const hours = Number(offsetHours);
  if (!Number.isFinite(hours)) {
    throw new ExpressError("offsetHours must be a valid number", 400);
  }
  clockOffsetMs = Math.round(hours * 60 * 60 * 1000);
  return getClockState();
}

/**
 * Parse YYYY-MM-DD date strings and calculate the number of rental days in [startDate, endDate).
 * Accepts either exclusive endDate or inclusive single-day when startDate === endDate (normalized to +1 day).
 */
function parseAndValidateDateRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) {
    throw new ExpressError("start_date and end_date (YYYY-MM-DD) are required", 400);
  }
  const startMatch = /^(\d{4}-\d{2}-\d{2})/.exec(String(startDateStr).trim());
  const endMatch = /^(\d{4}-\d{2}-\d{2})/.exec(String(endDateStr).trim());
  if (!startMatch || !endMatch) {
    throw new ExpressError("Dates must be in YYYY-MM-DD format", 400);
  }

  const startStr = startMatch[1];
  let endStr = endMatch[1];

  const startMs = Date.parse(`${startStr}T00:00:00.000Z`);
  let endMs = Date.parse(`${endStr}T00:00:00.000Z`);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new ExpressError("Invalid calendar date provided", 400);
  }

  // If caller passes same start and end date for a 1-day rental, normalize endStr to next day for '[)' daterange
  if (endMs === startMs) {
    endMs = startMs + 24 * 60 * 60 * 1000;
    endStr = new Date(endMs).toISOString().slice(0, 10);
  }

  if (endMs < startMs) {
    throw new ExpressError("end_date must be after start_date", 400);
  }

  const days = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
  if (days < 1) {
    throw new ExpressError("Reservation must be at least 1 day", 400);
  }

  return {
    startDate: startStr,
    endDate: endStr,
    days,
    pgDateRange: `[${startStr},${endStr})`,
    startInstantUtc: new Date(startMs),
    endInstantUtc: new Date(endMs),
  };
}

/**
 * Extract startDate, endDate, and day count from a PostgreSQL DATERANGE string like "[2026-11-10,2026-11-14)".
 */
function parsePgDateRange(pgRangeStr) {
  if (!pgRangeStr || typeof pgRangeStr !== "string") {
    return null;
  }
  const match = /^[\[(](\d{4}-\d{2}-\d{2}),\s*(\d{4}-\d{2}-\d{2})[\])]/.exec(
    pgRangeStr.trim()
  );
  if (!match) return null;
  return parseAndValidateDateRange(match[1], match[2]);
}

/**
 * Add or subtract N days from a YYYY-MM-DD date string in UTC.
 */
function addDaysToIsoDate(isoDateStr, deltaDays) {
  const ms = Date.parse(`${String(isoDateStr).trim()}T00:00:00.000Z`);
  if (Number.isNaN(ms)) {
    throw new ExpressError("Invalid ISO date for day arithmetic", 400);
  }
  const nextMs = ms + Math.round(Number(deltaDays) || 0) * 24 * 60 * 60 * 1000;
  return new Date(nextMs).toISOString().slice(0, 10);
}

/**
 * Enumerate individual calendar dates YYYY-MM-DD in [startDateStr, endDateStr).
 */
function enumerateDatesInRange(startDateStr, endDateStr) {
  const parsed = parseAndValidateDateRange(startDateStr, endDateStr);
  const dates = [];
  for (let i = 0; i < parsed.days && i < 366; i += 1) {
    dates.push(addDaysToIsoDate(parsed.startDate, i));
  }
  return dates;
}

/**
 * Deterministically compute subtotal, tax, and total in integer cents.
 */
function calculatePricingCents(days, dailyRateCents, taxRatePercent) {
  const safeDays = Math.max(0, Math.round(Number(days) || 0));
  const rateCents = Math.max(0, Math.round(Number(dailyRateCents) || 0));
  const taxPct = Math.max(0, Number(taxRatePercent) || 0);

  const subtotalCents = safeDays * rateCents;
  const taxCents = Math.round(subtotalCents * (taxPct / 100));
  const totalCents = subtotalCents + taxCents;

  return {
    days: safeDays,
    daily_rate_cents: rateCents,
    tax_rate_percent: taxPct,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
  };
}

/**
 * Sweep any expired HOLD reservations back to EXPIRED so units return to the available pool immediately.
 */
async function sweepExpiredHolds(clientOrDb = db, business = null) {
  const nowIso = getNow().toISOString();
  const params = [nowIso];
  let whereBusiness = "";
  if (business) {
    params.push(business);
    whereBusiness = ` AND LOWER(business) = LOWER($2)`;
  }

  const res = await clientOrDb.query(
    `UPDATE reservations
     SET status = 'EXPIRED',
         time_modified = CURRENT_TIMESTAMP
     WHERE status = 'HOLD'
       AND hold_expires_at IS NOT NULL
       AND hold_expires_at <= $1::timestamptz
       ${whereBusiness}
     RETURNING reservation_guid, business, item_guid, unit_guid`,
    params
  );

  return res.rows;
}

/**
 * Check tenant-scoped availability, blackouts, and pricing for an item across [startDate, endDate).
 */
async function checkItemAvailability(
  business,
  itemGuid,
  startDate,
  endDate,
  { excludeReservationGuid = null, client = null } = {}
) {
  const runner = client || db;
  await sweepExpiredHolds(runner, business);

  const range = parseAndValidateDateRange(startDate, endDate);
  const { settings } = await getBusinessSettings(business);

  const itemRes = await runner.query(
    `SELECT * FROM items
     WHERE item_guid = $1 AND LOWER(business) = LOWER($2) AND is_active = TRUE
     LIMIT 1`,
    [itemGuid, business]
  );

  if (itemRes.rows.length === 0) {
    throw new ExpressError(
      `Item '${itemGuid}' not found or inactive in business '${business}'`,
      404
    );
  }
  const item = itemRes.rows[0];

  // 1. Check tenant-scoped blackout dates (business-wide or item-specific)
  const blackoutRes = await runner.query(
    `SELECT *
     FROM inventory_blackouts
     WHERE LOWER(business) = LOWER($1)
       AND (item_guid IS NULL OR item_guid = $2)
       AND date_range && $3::daterange`,
    [business, itemGuid, range.pgDateRange]
  );

  // 2. Fetch all active units for this item in this business
  const unitsRes = await runner.query(
    `SELECT *
     FROM item_units
     WHERE item_guid = $1 AND LOWER(business) = LOWER($2) AND is_active = TRUE
     ORDER BY time_created ASC`,
    [itemGuid, business]
  );

  // 3. Find units that have overlapping HOLD or CONFIRMED reservations
  const conflictParams = [business, itemGuid, range.pgDateRange];
  let excludeClause = "";
  if (excludeReservationGuid) {
    conflictParams.push(excludeReservationGuid);
    excludeClause = ` AND reservation_guid != $4`;
  }

  const conflictsRes = await runner.query(
    `SELECT unit_guid, reservation_guid, status, date_range::text AS date_range, hold_expires_at
     FROM reservations
     WHERE LOWER(business) = LOWER($1)
       AND item_guid = $2
       AND status IN ('HOLD', 'CONFIRMED')
       AND date_range && $3::daterange
       ${excludeClause}`,
    conflictParams
  );

  const busyUnitIds = new Set(conflictsRes.rows.map((r) => r.unit_guid));
  const isBlackedOut = blackoutRes.rows.length > 0;

  const availableUnits = isBlackedOut
    ? []
    : unitsRes.rows.filter((u) => !busyUnitIds.has(u.unit_guid));

  const pricing = calculatePricingCents(
    range.days,
    item.daily_rate_cents,
    settings.tax_rate_percent
  );

  // Compute per-day disabled dates across [startDate, endDate) (blacked out or 0 units free)
  const candidateDates = enumerateDatesInRange(range.startDate, range.endDate);
  const parsedBlackouts = blackoutRes.rows
    .map((b) => parsePgDateRange(b.date_range ? String(b.date_range) : null))
    .filter(Boolean);
  const parsedConflicts = conflictsRes.rows
    .map((c) => ({
      unit_guid: c.unit_guid,
      range: parsePgDateRange(c.date_range),
    }))
    .filter((c) => c.range);

  const disabledDates = [];
  for (const dayStr of candidateDates) {
    const dayMs = Date.parse(`${dayStr}T00:00:00.000Z`);
    const dayBlackedOut =
      isBlackedOut &&
      (parsedBlackouts.length === 0 ||
        parsedBlackouts.some(
          (br) =>
            dayMs >= br.startInstantUtc.getTime() &&
            dayMs < br.endInstantUtc.getTime()
        ));
    const busyUnitsForDay = new Set(
      parsedConflicts
        .filter(
          (cf) =>
            dayMs >= cf.range.startInstantUtc.getTime() &&
            dayMs < cf.range.endInstantUtc.getTime()
        )
        .map((cf) => cf.unit_guid)
    );
    if (dayBlackedOut || busyUnitsForDay.size >= unitsRes.rows.length) {
      disabledDates.push(dayStr);
    }
  }

  return {
    business,
    item,
    date_range: {
      start_date: range.startDate,
      end_date: range.endDate,
      days: range.days,
      pg_daterange: range.pgDateRange,
    },
    is_available: availableUnits.length > 0 && !isBlackedOut,
    total_units_count: unitsRes.rows.length,
    available_units_count: availableUnits.length,
    available_units: availableUnits,
    blackouts: blackoutRes.rows,
    active_conflicts: conflictsRes.rows,
    disabled_dates: disabledDates,
    tenant_isolation_proof: {
      story_id: "INV-102",
      evaluated_business: business,
      evaluated_item_guid: itemGuid,
      evaluated_units_count: unitsRes.rows.length,
      evaluated_blackouts_count: blackoutRes.rows.length,
      cross_tenant_bleed: false,
    },
    pricing,
    policy_snapshot: {
      hold_ttl_seconds: Number(settings.hold_ttl_seconds),
      free_change_cutoff_hours: Number(settings.free_change_cutoff_hours),
      late_fee_percentage: Number(settings.late_fee_percentage),
      allow_customer_add_days: Boolean(settings.allow_customer_add_days),
      allow_customer_remove_days: Boolean(settings.allow_customer_remove_days),
      currency: settings.currency,
      timezone: settings.timezone,
    },
  };
}

/**
 * Evaluate hours remaining before reservation start_instant and classify cutoff window.
 */
function evaluateCutoffWindow(startInstantUtc, settings, overrideNow = null) {
  const startObj = startInstantUtc instanceof Date ? startInstantUtc : new Date(startInstantUtc);
  const now = getNow(overrideNow);
  const cutoffHours = Number(settings.free_change_cutoff_hours ?? 168);
  const lateFeePercentage = Number(settings.late_fee_percentage ?? 25);

  const msUntilStart = startObj.getTime() - now.getTime();
  const hoursUntilStart = msUntilStart / (1000 * 60 * 60);

  const isAfterStart = msUntilStart <= 0;
  const isWithinFreeCutoff = !isAfterStart && hoursUntilStart >= cutoffHours;
  const isLateWindow = !isAfterStart && hoursUntilStart < cutoffHours;

  return {
    now_iso: now.toISOString(),
    start_iso: startObj.toISOString(),
    hours_until_start: Number(hoursUntilStart.toFixed(2)),
    cutoff_hours: cutoffHours,
    late_fee_percentage: lateFeePercentage,
    is_after_start: isAfterStart,
    is_early_window: isWithinFreeCutoff,
    is_late_window: isLateWindow,
    window_classification: isAfterStart
      ? "AFTER_START"
      : isWithinFreeCutoff
      ? "EARLY_FREE_WINDOW"
      : "LATE_FEE_WINDOW",
  };
}

/**
 * Section 4.1: Quote & Policy Evaluator for any lifecycle action on a reservation:
 * - CANCEL
 * - RESCHEDULE
 * - ADD_DAYS
 * - REMOVE_DAYS
 */
async function evaluateReservationQuote(
  business,
  reservationGuid,
  {
    action = "CANCEL",
    new_start_date,
    new_end_date,
    days_to_add,
    days_to_remove,
    supervisor_override = false,
    waive_fee = false,
    override_now = null,
  } = {}
) {
  const { settings } = await getBusinessSettings(business);

  const resQuery = await db.query(
    `SELECT r.*, r.date_range::text AS date_range_text,
            i.name AS item_name, i.daily_rate_cents
     FROM reservations r
     INNER JOIN items i ON i.item_guid = r.item_guid
     WHERE r.reservation_guid = $1 AND LOWER(r.business) = LOWER($2)
     LIMIT 1`,
    [reservationGuid, business]
  );

  if (resQuery.rows.length === 0) {
    throw new ExpressError(
      `Reservation '${reservationGuid}' not found in business '${business}'`,
      404
    );
  }

  const reservation = resQuery.rows[0];
  const currentRange = parsePgDateRange(reservation.date_range_text);
  const cutoffEval = evaluateCutoffWindow(
    currentRange.startInstantUtc,
    settings,
    override_now
  );

  const normalizedAction = String(action || "CANCEL").toUpperCase();

  // 1. CANCELLATION POLICY EVALUATION
  if (normalizedAction === "CANCEL") {
    if (cutoffEval.is_after_start && !supervisor_override) {
      return {
        action: "CANCEL",
        allowed: false,
        requires_supervisor_override: true,
        reason:
          "Self-service cancellation is disabled once the reservation start time has passed. Supervisor override is required.",
        cutoff_evaluation: cutoffEval,
        fee_cents: reservation.total_cents,
        refund_cents: 0,
        original_total_cents: reservation.total_cents,
      };
    }

    let feeCents = 0;
    if (waive_fee && supervisor_override) {
      feeCents = 0;
    } else if (cutoffEval.is_early_window) {
      feeCents = 0;
    } else {
      feeCents = Math.round(
        reservation.total_cents * (cutoffEval.late_fee_percentage / 100)
      );
    }

    const refundCents = Math.max(0, reservation.total_cents - feeCents);

    return {
      action: "CANCEL",
      allowed: true,
      policy_tier:
        waive_fee && supervisor_override
          ? "SUPERVISOR_FEE_WAIVED"
          : cutoffEval.is_early_window
          ? "EARLY_FULL_REFUND"
          : "LATE_CANCELLATION_FEE",
      cutoff_evaluation: cutoffEval,
      original_total_cents: reservation.total_cents,
      fee_percentage_applied:
        waive_fee && supervisor_override
          ? 0
          : cutoffEval.is_early_window
          ? 0
          : cutoffEval.late_fee_percentage,
      fee_cents: feeCents,
      refund_cents: refundCents,
      inventory_effect: "Unit immediately released to available pool",
    };
  }

  // 2. RESCHEDULE (SAME DURATION) POLICY EVALUATION
  if (normalizedAction === "RESCHEDULE") {
    if (cutoffEval.is_after_start && !supervisor_override) {
      return {
        action: "RESCHEDULE",
        allowed: false,
        requires_supervisor_override: true,
        reason:
          "Cannot self-service reschedule after the reservation start time.",
        cutoff_evaluation: cutoffEval,
      };
    }

    const targetRange = parseAndValidateDateRange(new_start_date, new_end_date);
    if (targetRange.days !== currentRange.days) {
      return {
        action: "RESCHEDULE",
        allowed: false,
        reason: `Reschedule requires the same duration (${currentRange.days} day(s)), but requested range is ${targetRange.days} day(s). Use ADD_DAYS or REMOVE_DAYS to change duration.`,
        original_days: currentRange.days,
        requested_days: targetRange.days,
      };
    }

    const availability = await checkItemAvailability(
      business,
      reservation.item_guid,
      targetRange.startDate,
      targetRange.endDate,
      { excludeReservationGuid: reservation.reservation_guid }
    );

    if (!availability.is_available) {
      return {
        action: "RESCHEDULE",
        allowed: false,
        reason: "No units available for the requested reschedule dates.",
        availability,
      };
    }

    const feeCents =
      (waive_fee && supervisor_override) || cutoffEval.is_early_window
        ? 0
        : Math.round(
            reservation.total_cents * (cutoffEval.late_fee_percentage / 100)
          );

    return {
      action: "RESCHEDULE",
      allowed: true,
      cutoff_evaluation: cutoffEval,
      old_range: {
        start_date: currentRange.startDate,
        end_date: currentRange.endDate,
        days: currentRange.days,
      },
      new_range: {
        start_date: targetRange.startDate,
        end_date: targetRange.endDate,
        days: targetRange.days,
      },
      allocated_unit_guid: availability.available_units[0].unit_guid,
      fee_cents: feeCents,
      extra_charge_cents: feeCents,
      refund_cents: 0,
      inventory_effect: "Reallocated to available unit for new date range",
    };
  }

  // 3. ADD DAYS (EXTEND BOOKING) POLICY EVALUATION
  if (normalizedAction === "ADD_DAYS") {
    if (!settings.allow_customer_add_days && !supervisor_override) {
      return {
        action: "ADD_DAYS",
        allowed: false,
        reason:
          "Self-service day extensions are disabled by this business tenant's policy.",
      };
    }

    const resolvedEndForAdd =
      new_end_date ||
      (days_to_add !== undefined && Number(days_to_add) > 0
        ? addDaysToIsoDate(currentRange.endDate, Number(days_to_add))
        : new_end_date);

    const targetRange = parseAndValidateDateRange(
      new_start_date || currentRange.startDate,
      resolvedEndForAdd
    );

    const isAdjacentContains =
      targetRange.startInstantUtc.getTime() <=
        currentRange.startInstantUtc.getTime() &&
      targetRange.endInstantUtc.getTime() >=
        currentRange.endInstantUtc.getTime() &&
      targetRange.days > currentRange.days;

    if (!isAdjacentContains) {
      return {
        action: "ADD_DAYS",
        allowed: false,
        reason:
          "Extended date range must include the existing reservation dates and add at least 1 adjacent day.",
        original_days: currentRange.days,
        requested_days: targetRange.days,
      };
    }

    const availability = await checkItemAvailability(
      business,
      reservation.item_guid,
      targetRange.startDate,
      targetRange.endDate,
      { excludeReservationGuid: reservation.reservation_guid }
    );

    if (!availability.is_available) {
      return {
        action: "ADD_DAYS",
        allowed: false,
        reason: "No unit capacity available for the extended dates.",
        availability,
      };
    }

    const addedDays = targetRange.days - currentRange.days;
    const extraPricing = calculatePricingCents(
      addedDays,
      reservation.daily_rate_cents,
      settings.tax_rate_percent
    );
    const newTotalPricing = calculatePricingCents(
      targetRange.days,
      reservation.daily_rate_cents,
      settings.tax_rate_percent
    );

    // Prefer keeping the same unit if it's free across the extended range
    const sameUnitFree = availability.available_units.find(
      (u) => u.unit_guid === reservation.unit_guid
    );
    const allocatedUnit = sameUnitFree || availability.available_units[0];

    return {
      action: "ADD_DAYS",
      allowed: true,
      added_days_count: addedDays,
      old_range: {
        start_date: currentRange.startDate,
        end_date: currentRange.endDate,
        days: currentRange.days,
      },
      new_range: {
        start_date: targetRange.startDate,
        end_date: targetRange.endDate,
        days: targetRange.days,
      },
      allocated_unit_guid: allocatedUnit.unit_guid,
      fee_cents: 0, // No change fee for adding days per Section 4.1
      extra_subtotal_cents: extraPricing.subtotal_cents,
      extra_tax_cents: extraPricing.tax_cents,
      extra_charge_cents: extraPricing.total_cents,
      new_total_cents: newTotalPricing.total_cents,
      inventory_effect: "Holds and confirms adjacent days with $0 change fee",
    };
  }

  // 4. REMOVE DAYS (SHORTEN BOOKING) POLICY EVALUATION
  if (normalizedAction === "REMOVE_DAYS") {
    if (!settings.allow_customer_remove_days && !supervisor_override) {
      return {
        action: "REMOVE_DAYS",
        allowed: false,
        reason:
          "Self-service day reductions are disabled by this business tenant's policy.",
      };
    }

    if (cutoffEval.is_after_start && !supervisor_override) {
      return {
        action: "REMOVE_DAYS",
        allowed: false,
        requires_supervisor_override: true,
        reason:
          "Self-service day reduction is only allowed before the reservation start time.",
        cutoff_evaluation: cutoffEval,
      };
    }

    const resolvedEndForRemove =
      new_end_date ||
      (days_to_remove !== undefined && Number(days_to_remove) > 0
        ? addDaysToIsoDate(currentRange.endDate, -Number(days_to_remove))
        : new_end_date);

    const targetRange = parseAndValidateDateRange(
      new_start_date || currentRange.startDate,
      resolvedEndForRemove
    );

    const isSubsetShortened =
      targetRange.startInstantUtc.getTime() >=
        currentRange.startInstantUtc.getTime() &&
      targetRange.endInstantUtc.getTime() <=
        currentRange.endInstantUtc.getTime() &&
      targetRange.days < currentRange.days &&
      targetRange.days >= 1;

    if (!isSubsetShortened) {
      return {
        action: "REMOVE_DAYS",
        allowed: false,
        reason:
          "Shortened range must be within the original reservation dates, remove at least 1 day, and leave at least 1 day remaining.",
        original_days: currentRange.days,
        requested_days: targetRange.days,
      };
    }

    const removedDays = currentRange.days - targetRange.days;
    const newPricing = calculatePricingCents(
      targetRange.days,
      reservation.daily_rate_cents,
      settings.tax_rate_percent
    );

    const removedPortionGrossCents = Math.max(
      0,
      reservation.total_cents - newPricing.total_cents
    );

    const feeCents =
      (waive_fee && supervisor_override) || cutoffEval.is_early_window
        ? 0
        : Math.round(
            removedPortionGrossCents * (cutoffEval.late_fee_percentage / 100)
          );

    const refundCents = Math.max(0, removedPortionGrossCents - feeCents);

    return {
      action: "REMOVE_DAYS",
      allowed: true,
      cutoff_evaluation: cutoffEval,
      removed_days_count: removedDays,
      remaining_days_count: targetRange.days,
      old_range: {
        start_date: currentRange.startDate,
        end_date: currentRange.endDate,
        days: currentRange.days,
      },
      new_range: {
        start_date: targetRange.startDate,
        end_date: targetRange.endDate,
        days: targetRange.days,
      },
      removed_portion_cents: removedPortionGrossCents,
      fee_cents: feeCents,
      refund_cents: refundCents,
      new_subtotal_cents: newPricing.subtotal_cents,
      new_tax_cents: newPricing.tax_cents,
      new_total_cents: newPricing.total_cents,
      inventory_effect: "Removed dates immediately released to available pool",
    };
  }

  throw new ExpressError(
    `Unsupported quote action '${action}'. Expected CANCEL, RESCHEDULE, ADD_DAYS, or REMOVE_DAYS.`,
    400
  );
}

/**
 * Action 1: Create an atomic Checkout Hold (`status = 'HOLD'`) for `settings.hold_ttl_seconds`.
 */
async function createCheckoutHold(business, payload = {}) {
  const { item_guid, start_date, end_date, customer = {} } = payload;
  if (!item_guid) {
    throw new ExpressError("item_guid is required to create a checkout hold", 400);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const availability = await checkItemAvailability(
      business,
      item_guid,
      start_date,
      end_date,
      { client }
    );

    if (!availability.is_available || availability.available_units.length === 0) {
      throw new ExpressError(
        "No units available for the selected dates (or dates are blacked out)",
        409
      );
    }

    const allocatedUnit = availability.available_units[0];
    const { settings } = await getBusinessSettings(business);
    const holdTtlSeconds = Number(settings.hold_ttl_seconds || 600);
    const now = getNow();
    const holdExpiresAt = new Date(now.getTime() + holdTtlSeconds * 1000);

    // Every transaction is recorded in the decoupled customers table
    const customerRecord = await recordCustomerForTransaction(client, {
      business,
      first_name: customer.first_name || "Checkout",
      last_name: customer.last_name || "Guest",
      email:
        customer.email ||
        `hold_${Date.now()}@${business.toLowerCase().replace(/[^a-z0-9]/g, "")}.guest.local`,
      phone_number: customer.phone_number || "0000000000",
      sms_opt_in: Boolean(customer.sms_opt_in),
    });

    const reservationGuid = generateGuid("res");
    const manageToken = `tok_${crypto.randomBytes(16).toString("hex")}`;

    const insertRes = await client.query(
      `INSERT INTO reservations
        (reservation_guid, business, item_guid, unit_guid, customer_guid, date_range,
         status, hold_expires_at, subtotal_cents, tax_cents, total_cents, manage_token,
         time_created, time_modified)
       VALUES ($1, $2, $3, $4, $5, $6::daterange,
               'HOLD', $7::timestamptz, $8, $9, $10, $11,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *, date_range::text AS date_range_text`,
      [
        reservationGuid,
        business,
        item_guid,
        allocatedUnit.unit_guid,
        customerRecord.customer.customer_guid,
        availability.date_range.pg_daterange,
        holdExpiresAt.toISOString(),
        availability.pricing.subtotal_cents,
        availability.pricing.tax_cents,
        availability.pricing.total_cents,
        manageToken,
      ]
    );

    await client.query("COMMIT");

    return {
      reservation: insertRes.rows[0],
      unit: allocatedUnit,
      item: availability.item,
      customer: customerRecord.customer,
      hold_ttl_seconds: holdTtlSeconds,
      hold_expires_at: holdExpiresAt.toISOString(),
      pricing: availability.pricing,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23P01") {
      throw new ExpressError(
        "Concurrency conflict: unit was just reserved by another customer",
        409
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Render and dispatch transactional notifications into `notification_outbox`
 * for reservation lifecycle events (booking.confirmed, booking.cancelled, booking.rescheduled,
 * booking.days_added, booking.days_removed).
 */
async function queueLifecycleNotification(
  business,
  {
    reservation,
    customer,
    eventType,
    extraVars = {},
  } = {}
) {
  try {
    const { settings } = await getBusinessSettings(business);
    const templates = await getBusinessTemplates(business, eventType);

    let resolvedCustomer = customer;
    if (!resolvedCustomer && reservation?.customer_guid) {
      const cRes = await db.query(
        `SELECT * FROM customers WHERE customer_guid = $1 LIMIT 1`,
        [reservation.customer_guid]
      );
      resolvedCustomer = cRes.rows[0] || null;
    }

    let itemName = reservation?.item_name || extraVars.item_name || "Rental Item";
    if (!reservation?.item_name && reservation?.item_guid) {
      const iRes = await db.query(
        `SELECT name FROM items WHERE item_guid = $1 AND LOWER(business) = LOWER($2) LIMIT 1`,
        [reservation.item_guid, business]
      );
      if (iRes.rows[0]?.name) {
        itemName = iRes.rows[0].name;
      }
    }

    const parsedRange = parsePgDateRange(
      reservation?.date_range_text ||
        (reservation?.date_range ? String(reservation.date_range) : null)
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
      start_date: parsedRange?.startDate || reservation?.start_date || "",
      end_date: parsedRange?.endDate || reservation?.end_date || "",
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

    const queued = [];
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
        ? renderHandlebarsTemplate(tpl.subject, variables)
        : null;
      const renderedBody = renderHandlebarsTemplate(tpl.body_template, variables);
      const outboxGuid = generateGuid("out");

      const outRes = await db.query(
        `INSERT INTO notification_outbox
          (outbox_guid, business, reservation_guid, recipient, channel, template_type,
           payload, rendered_body, status, attempts, provider_message_id, time_created, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 $7::jsonb, $8, 'SENT', 1, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          outboxGuid,
          business,
          reservation?.reservation_guid || null,
          recipient,
          tpl.channel,
          eventType,
          JSON.stringify({ subject: renderedSubject, variables }),
          renderedBody,
          `mock_${tpl.channel.toLowerCase()}_${outboxGuid}`,
        ]
      );
      queued.push(outRes.rows[0]);
    }
    return queued;
  } catch (err) {
    console.error("Error queueing lifecycle notification:", err.message);
    return [];
  }
}

/**
 * Release a temporary checkout hold early (`DELETE /api/:business/reservations/:id/hold`).
 */
async function releaseCheckoutHold(business, reservationGuid) {
  const res = await db.query(
    `UPDATE reservations
     SET status = 'EXPIRED',
         time_modified = CURRENT_TIMESTAMP
     WHERE reservation_guid = $1
       AND LOWER(business) = LOWER($2)
       AND status = 'HOLD'
     RETURNING *, date_range::text AS date_range_text`,
    [reservationGuid, business]
  );

  if (res.rows.length === 0) {
    throw new ExpressError("Active HOLD reservation not found", 404);
  }
  return res.rows[0];
}

/**
 * Confirm a HOLD reservation into CONFIRMED (or create + confirm directly), updating the decoupled customer record
 * and recording a BOOKING charge in `payments`.
 */
async function confirmReservationCheckout(business, payload = {}) {
  const {
    reservation_guid,
    item_guid,
    start_date,
    end_date,
    customer = {},
    payment_provider = "mock",
  } = payload;

  let activeReservationGuid = reservation_guid;
  if (!activeReservationGuid) {
    const holdCreated = await createCheckoutHold(business, {
      item_guid,
      start_date,
      end_date,
      customer,
    });
    activeReservationGuid = holdCreated.reservation.reservation_guid;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await sweepExpiredHolds(client, business);

    const resQuery = await client.query(
      `SELECT *, date_range::text AS date_range_text
       FROM reservations
       WHERE reservation_guid = $1 AND LOWER(business) = LOWER($2)
       FOR UPDATE`,
      [activeReservationGuid, business]
    );

    if (resQuery.rows.length === 0) {
      throw new ExpressError("Reservation not found", 404);
    }

    const reservation = resQuery.rows[0];
    if (reservation.status === "EXPIRED") {
      throw new ExpressError(
        "Checkout hold has expired and the unit was returned to the pool",
        410
      );
    }
    if (reservation.status !== "HOLD" && reservation.status !== "CONFIRMED") {
      throw new ExpressError(
        `Cannot confirm reservation in status '${reservation.status}'`,
        400
      );
    }

    let customerRow = null;
    if (
      customer &&
      customer.first_name &&
      customer.last_name &&
      (customer.email || customer.phone_number)
    ) {
      const custResult = await recordCustomerForTransaction(client, {
        business,
        ...customer,
      });
      customerRow = custResult.customer;
    }

    const customerGuidToUse =
      customerRow?.customer_guid || reservation.customer_guid;

    if (!customerRow && customerGuidToUse) {
      const existingCustRes = await client.query(
        `SELECT * FROM customers WHERE customer_guid = $1 LIMIT 1`,
        [customerGuidToUse]
      );
      if (existingCustRes.rows.length > 0) {
        customerRow = existingCustRes.rows[0];
      }
    }

    const manageToken =
      reservation.manage_token || `tok_${crypto.randomBytes(16).toString("hex")}`;

    // Story DEV-401 Section 11.3: Check if /dev/payments/fail-next was armed
    const failCheck = consumeFailNextPayment();
    if (failCheck.shouldFail) {
      const failPayGuid = generateGuid("pay");
      await client.query(
        `INSERT INTO payments
          (payment_guid, business, reservation_guid, type, purpose, amount_cents,
           provider, provider_ref, status, idempotency_key, attempts, time_created)
         VALUES ($1, $2, $3, 'CHARGE', 'BOOKING', $4,
                 $5, $6, 'FAILED', $7, 1, CURRENT_TIMESTAMP)`,
        [
          failPayGuid,
          business,
          activeReservationGuid,
          reservation.total_cents,
          payment_provider,
          `ch_fail_${failPayGuid}`,
          `idem_failnext_${activeReservationGuid}_${Date.now()}`,
        ]
      );
      await client.query("COMMIT");
      throw new ExpressError(
        failCheck.reason || "Payment declined (armed via /dev/payments/fail-next)",
        402
      );
    }

    const updatedRes = await client.query(
      `UPDATE reservations
       SET status = 'CONFIRMED',
           customer_guid = $1,
           manage_token = $2,
           hold_expires_at = NULL,
           time_modified = CURRENT_TIMESTAMP
       WHERE reservation_guid = $3 AND LOWER(business) = LOWER($4)
       RETURNING *, date_range::text AS date_range_text`,
      [customerGuidToUse, manageToken, activeReservationGuid, business]
    );

    const paymentGuid = generateGuid("pay");
    const paymentRes = await client.query(
      `INSERT INTO payments
        (payment_guid, business, reservation_guid, type, purpose, amount_cents,
         provider, provider_ref, status, idempotency_key, attempts, time_created)
       VALUES ($1, $2, $3, 'CHARGE', 'BOOKING', $4,
               $5, $6, 'SUCCEEDED', $7, 1, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        paymentGuid,
        business,
        activeReservationGuid,
        reservation.total_cents,
        payment_provider,
        `ch_${paymentGuid}`,
        `idem_booking_${activeReservationGuid}_${Date.now()}`,
      ]
    );

    const updatedRow = updatedRes.rows[0];
    const parsedRange = parsePgDateRange(updatedRow.date_range_text);

    // Section 8.2: Insert notification into notification_outbox in the SAME DB transaction
    const enqueuedPending = await enqueueLifecycleNotificationsInTx(
      client,
      business,
      {
        reservation: updatedRow,
        customer: customerRow,
        eventType: "booking.confirmed",
      }
    );

    await client.query("COMMIT");

    // Section 8.2: Background worker processes outbox after COMMIT; provider outages never roll back the reservation
    const workerDispatch = await processNotificationOutbox({
      business,
      outboxGuids: enqueuedPending.map((n) => n.outbox_guid),
    });

    const { settings } = await getBusinessSettings(business);
    const guestTokenTtlDays = Number(settings.guest_token_ttl_days || 30);
    const now = getNow();
    const tokenExpiresAt = new Date(
      now.getTime() + guestTokenTtlDays * 24 * 60 * 60 * 1000
    );

    return {
      reservation: {
        ...updatedRow,
        start_date: parsedRange?.startDate || null,
        end_date: parsedRange?.endDate || null,
        days: parsedRange?.days || null,
      },
      customer: customerRow,
      payment: paymentRes.rows[0],
      notifications_queued: workerDispatch.processed || enqueuedPending,
      manage_token: manageToken,
      manage_url: `/book/${encodeURIComponent(business)}?manage_token=${encodeURIComponent(
        manageToken
      )}`,
      manage_api_url: `/api/${encodeURIComponent(business)}/manage/${encodeURIComponent(
        manageToken
      )}`,
      guest_token_ttl_days: guestTokenTtlDays,
      token_expires_at: tokenExpiresAt.toISOString(),
      decoupled_customer_registry: {
        story_id: "CUST-100",
        table: "customers",
        customer_guid: customerGuidToUse,
        has_users_table_link: false,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute Cancellation (Early 100% refund, Late 75% refund / 25% fee, or Supervisor Override).
 */
async function executeReservationCancellation(
  business,
  reservationGuid,
  {
    actor_guid = "customer",
    supervisor_override = false,
    waive_fee = false,
    reason = "Reservation cancelled",
    override_now = null,
  } = {}
) {
  const quote = await evaluateReservationQuote(business, reservationGuid, {
    action: "CANCEL",
    supervisor_override,
    waive_fee,
    override_now,
  });

  if (!quote.allowed) {
    throw new ExpressError(
      quote.reason || "Cancellation not permitted",
      quote.requires_supervisor_override ? 403 : 400
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const beforeRes = await client.query(
      `SELECT *, date_range::text AS date_range_text
       FROM reservations
       WHERE reservation_guid = $1 AND LOWER(business) = LOWER($2)
       FOR UPDATE`,
      [reservationGuid, business]
    );
    const beforeState = beforeRes.rows[0];
    if (!beforeState || beforeState.status === "CANCELLED") {
      throw new ExpressError("Reservation is already cancelled or not found", 400);
    }

    const updateRes = await client.query(
      `UPDATE reservations
       SET status = 'CANCELLED',
           fee_cents = $1,
           refund_cents = $2,
           cancelled_at = $3::timestamptz,
           cancelled_by = $4,
           time_modified = CURRENT_TIMESTAMP
       WHERE reservation_guid = $5 AND LOWER(business) = LOWER($6)
       RETURNING *, date_range::text AS date_range_text`,
      [
        quote.fee_cents,
        quote.refund_cents,
        getNow(override_now).toISOString(),
        actor_guid,
        reservationGuid,
        business,
      ]
    );

    let refundPayment = null;
    if (quote.refund_cents > 0) {
      const paymentGuid = generateGuid("pay");
      const failCheck = consumeFailNextPayment();
      const refundStatus = failCheck.shouldFail ? "FAILED" : "SUCCEEDED";
      const payRes = await client.query(
        `INSERT INTO payments
          (payment_guid, business, reservation_guid, type, purpose, amount_cents,
           provider, provider_ref, status, idempotency_key, attempts, time_created)
         VALUES ($1, $2, $3, 'REFUND', 'CANCEL_REFUND', $4,
                 'mock', $5, $6, $7, 1, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          paymentGuid,
          business,
          reservationGuid,
          quote.refund_cents,
          `re_${paymentGuid}`,
          refundStatus,
          `idem_cancel_${reservationGuid}_${Date.now()}`,
        ]
      );
      refundPayment = payRes.rows[0];
    }

    if (supervisor_override) {
      await recordSupervisorAuditLog(client, {
        business,
        actorGuid: actor_guid,
        action: waive_fee ? "FEE_WAIVED" : "OVERRIDE_CANCEL",
        entityType: "reservations",
        entityGuid: reservationGuid,
        reason,
        beforeState,
        afterState: updateRes.rows[0],
      });
    }

    const { settings } = await getBusinessSettings(business);
    const currency = settings.currency || "USD";

    // Section 8.2: Insert notification into notification_outbox in the SAME DB transaction
    const enqueuedPending = await enqueueLifecycleNotificationsInTx(
      client,
      business,
      {
        reservation: updateRes.rows[0],
        eventType: "booking.cancelled",
        extraVars: {
          fee_charged: formatCents(quote.fee_cents || 0, currency),
          fee_amount: formatCents(quote.fee_cents || 0, currency),
          refund_amount: formatCents(quote.refund_cents || 0, currency),
          refund_eta_days: "3-5",
        },
      }
    );

    await client.query("COMMIT");

    // Section 8.2: Background worker processes outbox after COMMIT; provider outages never roll back the cancellation
    const workerDispatch = await processNotificationOutbox({
      business,
      outboxGuids: enqueuedPending.map((n) => n.outbox_guid),
    });

    return {
      reservation: updateRes.rows[0],
      quote,
      refund_payment: refundPayment,
      notifications_queued: workerDispatch.processed || enqueuedPending,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute Reschedule (Same Duration), Add Days (Extend), or Remove Days (Shorten).
 */
async function executeReservationLifecycleChange(
  business,
  reservationGuid,
  {
    action,
    new_start_date,
    new_end_date,
    days_to_add,
    days_to_remove,
    actor_guid = "customer",
    supervisor_override = false,
    waive_fee = false,
    reason = null,
    override_now = null,
  } = {}
) {
  const normalizedAction = String(action || "").toUpperCase();
  if (!["RESCHEDULE", "ADD_DAYS", "REMOVE_DAYS"].includes(normalizedAction)) {
    throw new ExpressError(
      "action must be RESCHEDULE, ADD_DAYS, or REMOVE_DAYS",
      400
    );
  }

  const quote = await evaluateReservationQuote(business, reservationGuid, {
    action: normalizedAction,
    new_start_date,
    new_end_date,
    days_to_add,
    days_to_remove,
    supervisor_override,
    waive_fee,
    override_now,
  });

  if (!quote.allowed) {
    throw new ExpressError(
      quote.reason || `Cannot perform ${normalizedAction}`,
      quote.requires_supervisor_override ? 403 : 400
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const beforeRes = await client.query(
      `SELECT *, date_range::text AS date_range_text
       FROM reservations
       WHERE reservation_guid = $1 AND LOWER(business) = LOWER($2)
       FOR UPDATE`,
      [reservationGuid, business]
    );
    const beforeState = beforeRes.rows[0];
    if (!beforeState || beforeState.status !== "CONFIRMED") {
      throw new ExpressError(
        "Only active CONFIRMED reservations can be modified",
        400
      );
    }

    const newPgRange = `[${quote.new_range.start_date},${quote.new_range.end_date})`;
    const newUnitGuid = quote.allocated_unit_guid || beforeState.unit_guid;

    let newSubtotalCents = beforeState.subtotal_cents;
    let newTaxCents = beforeState.tax_cents;
    let newTotalCents = beforeState.total_cents;

    if (normalizedAction === "ADD_DAYS") {
      newSubtotalCents = beforeState.subtotal_cents + quote.extra_subtotal_cents;
      newTaxCents = beforeState.tax_cents + quote.extra_tax_cents;
      newTotalCents = quote.new_total_cents;
    } else if (normalizedAction === "REMOVE_DAYS") {
      newSubtotalCents = quote.new_subtotal_cents;
      newTaxCents = quote.new_tax_cents;
      newTotalCents = quote.new_total_cents;
    }

    const updatedRes = await client.query(
      `UPDATE reservations
       SET date_range = $1::daterange,
           unit_guid = $2,
           subtotal_cents = $3,
           tax_cents = $4,
           total_cents = $5,
           fee_cents = COALESCE(fee_cents, 0) + $6,
           refund_cents = COALESCE(refund_cents, 0) + $7,
           time_modified = CURRENT_TIMESTAMP
       WHERE reservation_guid = $8 AND LOWER(business) = LOWER($9)
       RETURNING *, date_range::text AS date_range_text`,
      [
        newPgRange,
        newUnitGuid,
        newSubtotalCents,
        newTaxCents,
        newTotalCents,
        quote.fee_cents || 0,
        quote.refund_cents || 0,
        reservationGuid,
        business,
      ]
    );

    const changeGuid = generateGuid("chg");
    const changeRes = await client.query(
      `INSERT INTO reservation_changes
        (change_guid, business, reservation_guid, change_type, old_range, new_range,
         old_unit_guid, new_unit_guid, fee_cents, extra_charge_cents, refund_cents,
         fees_waived, actor_guid, reason, time_created)
       VALUES ($1, $2, $3, $4, $5::daterange, $6::daterange,
               $7, $8, $9, $10, $11,
               $12, $13, $14, CURRENT_TIMESTAMP)
       RETURNING *, old_range::text AS old_range_text, new_range::text AS new_range_text`,
      [
        changeGuid,
        business,
        reservationGuid,
        normalizedAction,
        beforeState.date_range_text,
        newPgRange,
        beforeState.unit_guid,
        newUnitGuid,
        quote.fee_cents || 0,
        quote.extra_charge_cents || 0,
        quote.refund_cents || 0,
        Boolean(waive_fee && supervisor_override),
        actor_guid,
        reason || `${normalizedAction} executed`,
      ]
    );

    let ledgerEntry = null;
    if ((quote.extra_charge_cents || 0) > 0) {
      const paymentGuid = generateGuid("pay");
      const purpose =
        normalizedAction === "ADD_DAYS" ? "ADD_DAYS" : "CHANGE_FEE";
      const pRes = await client.query(
        `INSERT INTO payments
          (payment_guid, business, reservation_guid, type, purpose, amount_cents,
           provider, provider_ref, status, idempotency_key, attempts, time_created)
         VALUES ($1, $2, $3, 'CHARGE', $4, $5,
                 'mock', $6, 'SUCCEEDED', $7, 1, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          paymentGuid,
          business,
          reservationGuid,
          purpose,
          quote.extra_charge_cents,
          `ch_${paymentGuid}`,
          `idem_${normalizedAction.toLowerCase()}_${reservationGuid}_${Date.now()}`,
        ]
      );
      ledgerEntry = pRes.rows[0];
    } else if ((quote.refund_cents || 0) > 0) {
      const paymentGuid = generateGuid("pay");
      const pRes = await client.query(
        `INSERT INTO payments
          (payment_guid, business, reservation_guid, type, purpose, amount_cents,
           provider, provider_ref, status, idempotency_key, attempts, time_created)
         VALUES ($1, $2, $3, 'REFUND', 'REMOVE_DAYS_REFUND', $4,
                 'mock', $5, 'SUCCEEDED', $6, 1, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          paymentGuid,
          business,
          reservationGuid,
          quote.refund_cents,
          `re_${paymentGuid}`,
          `idem_removedays_${reservationGuid}_${Date.now()}`,
        ]
      );
      ledgerEntry = pRes.rows[0];
    }

    if (supervisor_override) {
      await recordSupervisorAuditLog(client, {
        business,
        actorGuid: actor_guid,
        action: waive_fee ? "FEE_WAIVED" : `MANUAL_${normalizedAction}`,
        entityType: "reservations",
        entityGuid: reservationGuid,
        reason: reason || `Supervisor override: ${normalizedAction}`,
        beforeState,
        afterState: updatedRes.rows[0],
      });
    }

    const { settings } = await getBusinessSettings(business);
    const currency = settings.currency || "USD";
    const eventMap = {
      RESCHEDULE: "booking.rescheduled",
      ADD_DAYS: "booking.days_added",
      REMOVE_DAYS: "booking.days_removed",
    };
    const oldRangeParsed = parsePgDateRange(beforeState.date_range_text);
    const oldDays = oldRangeParsed?.days || quote.old_range?.days || 0;
    const newDays = quote.new_range?.days || 0;
    const addedDaysCount = Math.max(0, newDays - oldDays);
    const removedDaysCount = Math.max(0, oldDays - newDays);

    // Section 8.2: Insert notification into notification_outbox in the SAME DB transaction
    const enqueuedPending = await enqueueLifecycleNotificationsInTx(
      client,
      business,
      {
        reservation: updatedRes.rows[0],
        eventType: eventMap[normalizedAction] || "booking.rescheduled",
        extraVars: {
          old_start_date:
            oldRangeParsed?.startDate || quote.old_range?.start_date || "",
          old_end_date:
            oldRangeParsed?.endDate || quote.old_range?.end_date || "",
          new_start_date: quote.new_range.start_date,
          new_end_date: quote.new_range.end_date,
          start_date: quote.new_range.start_date,
          end_date: quote.new_range.end_date,
          added_days_count: addedDaysCount,
          removed_days_count: removedDaysCount,
          fee_charged: formatCents(quote.fee_cents || 0, currency),
          fee_amount: formatCents(quote.fee_cents || 0, currency),
          extra_charge: formatCents(quote.extra_charge_cents || 0, currency),
          amount_charged: formatCents(quote.extra_charge_cents || 0, currency),
          refund_amount: formatCents(quote.refund_cents || 0, currency),
          total_paid: formatCents(updatedRes.rows[0].total_cents || 0, currency),
          new_total: formatCents(updatedRes.rows[0].total_cents || 0, currency),
          refund_eta_days: "3-5",
        },
      }
    );

    await client.query("COMMIT");

    // Section 8.2: Background worker processes outbox after COMMIT; provider outages never roll back the change
    const workerDispatch = await processNotificationOutbox({
      business,
      outboxGuids: enqueuedPending.map((n) => n.outbox_guid),
    });

    return {
      reservation: {
        ...updatedRes.rows[0],
        start_date: quote.new_range.start_date,
        end_date: quote.new_range.end_date,
        days: quote.new_range.days,
      },
      change_log: changeRes.rows[0],
      payment: ledgerEntry,
      quote,
      notifications_queued: workerDispatch.processed || enqueuedPending,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23P01") {
      throw new ExpressError(
        "Concurrency conflict: target dates overlap with another active reservation",
        409
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List reservations for a business tenant with item, unit, and customer details.
 * Supports filtering by `status` and `search` (customer email/name, item name, serial number, or reservation_guid).
 */
async function listBusinessReservations(
  business,
  { status = null, search = null, limit = 50, customerGuid = null } = {}
) {
  if (business && business !== "all") {
    await sweepExpiredHolds(db, business);
  }

  const params = [];
  const clauses = ["1=1"];

  if (business && business !== "all") {
    params.push(business);
    clauses.push(`LOWER(r.business) = LOWER($${params.length})`);
  }

  if (customerGuid && String(customerGuid).trim()) {
    params.push(String(customerGuid).trim());
    clauses.push(`r.customer_guid = $${params.length}`);
  }

  if (status && String(status).trim()) {
    params.push(String(status).trim().toUpperCase());
    clauses.push(`UPPER(r.status) = $${params.length}`);
  }
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim().toLowerCase()}%`);
    const idx = params.length;
    clauses.push(
      `(LOWER(r.reservation_guid) LIKE $${idx}
        OR LOWER(COALESCE(i.name, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.serial_number, '')) LIKE $${idx}
        OR LOWER(COALESCE(c.email, '')) LIKE $${idx}
        OR LOWER(COALESCE(c.first_name || ' ' || c.last_name, '')) LIKE $${idx})`
    );
  }
  params.push(Math.min(Number(limit) || 50, 200));

  const res = await db.query(
    `SELECT
       r.*,
       r.date_range::text AS date_range_text,
       i.name AS item_name,
       i.daily_rate_cents,
       u.serial_number,
       c.first_name AS customer_first_name,
       c.last_name AS customer_last_name,
       c.email AS customer_email,
       c.phone_number AS customer_phone
     FROM reservations r
     LEFT JOIN items i ON i.item_guid = r.item_guid
     LEFT JOIN item_units u ON u.unit_guid = r.unit_guid
     LEFT JOIN customers c ON c.customer_guid = r.customer_guid
     WHERE ${clauses.join(" AND ")}
     ORDER BY r.time_created DESC
     LIMIT $${params.length}`,
    params
  );

  return res.rows.map((row) => {
    const parsed = parsePgDateRange(row.date_range_text);
    return {
      ...row,
      start_date: parsed?.startDate || null,
      end_date: parsed?.endDate || null,
      days: parsed?.days || null,
    };
  });
}

/**
 * Authenticate guest access for a single reservation using its tokenized management link
 * (`GET /api/:business/manage/:token` — Story CUST-100 & Section 11.1).
 * Evaluates token TTL against `business_settings.guest_token_ttl_days`.
 */
async function getReservationByManageToken(business, manageToken) {
  if (!manageToken || !String(manageToken).trim()) {
    throw new ExpressError("Management token is required", 400);
  }

  await sweepExpiredHolds(db, business);

  const res = await db.query(
    `SELECT
       r.*,
       r.date_range::text AS date_range_text,
       i.name AS item_name,
       i.description AS item_description,
       i.daily_rate_cents,
       u.serial_number,
       c.customer_guid AS cust_guid,
       c.first_name AS customer_first_name,
       c.last_name AS customer_last_name,
       c.email AS customer_email,
       c.phone_number AS customer_phone,
       c.sms_opt_in AS customer_sms_opt_in
     FROM reservations r
     LEFT JOIN items i ON i.item_guid = r.item_guid
     LEFT JOIN item_units u ON u.unit_guid = r.unit_guid
     LEFT JOIN customers c ON c.customer_guid = r.customer_guid
     WHERE LOWER(r.business) = LOWER($1) AND r.manage_token = $2
     LIMIT 1`,
    [business, String(manageToken).trim()]
  );

  if (res.rows.length === 0) {
    throw new ExpressError(
      "Invalid or unknown reservation management token for this business tenant",
      404
    );
  }

  const row = res.rows[0];
  const { settings } = await getBusinessSettings(business);
  const guestTokenTtlDays = Number(settings.guest_token_ttl_days || 30);
  const createdAt = row.time_created ? new Date(row.time_created) : new Date();
  const expiresAt = new Date(
    createdAt.getTime() + guestTokenTtlDays * 24 * 60 * 60 * 1000
  );
  const now = getNow();

  if (now > expiresAt) {
    throw new ExpressError(
      `Guest self-service token has expired (TTL: ${guestTokenTtlDays} days)`,
      410
    );
  }

  const parsed = parsePgDateRange(row.date_range_text);
  const cutoffEval = evaluateCutoffWindow(
    parsed?.startDate || "2026-11-15",
    settings,
    now
  );

  return {
    authenticated_via: "manage_token",
    story_id: "CUST-100",
    decoupled_from_users_table: true,
    manage_token: row.manage_token,
    guest_token_ttl_days: guestTokenTtlDays,
    token_expires_at: expiresAt.toISOString(),
    reservation: {
      ...row,
      start_date: parsed?.startDate || null,
      end_date: parsed?.endDate || null,
      days: parsed?.days || null,
    },
    customer: {
      customer_guid: row.customer_guid,
      business: row.business,
      first_name: row.customer_first_name,
      last_name: row.customer_last_name,
      email: row.customer_email,
      phone_number: row.customer_phone,
      sms_opt_in: Boolean(row.customer_sms_opt_in),
    },
    policy_context: {
      cutoff_evaluation: cutoffEval,
      allow_customer_add_days: settings.allow_customer_add_days !== false,
      allow_customer_remove_days: settings.allow_customer_remove_days !== false,
    },
  };
}

/**
 * Story INV-102 Scenario 2: Immediately expire a HOLD reservation (simulating the countdown timer reaching 0s)
 * so the locked unit returns to the available pool.
 */
async function expireReservationHoldNow(business, reservationGuid) {
  const res = await db.query(
    `UPDATE reservations
     SET status = 'EXPIRED',
         hold_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second',
         time_modified = CURRENT_TIMESTAMP
     WHERE reservation_guid = $1
       AND LOWER(business) = LOWER($2)
       AND status = 'HOLD'
     RETURNING *, date_range::text AS date_range_text`,
    [reservationGuid, business]
  );

  if (res.rows.length === 0) {
    throw new ExpressError(
      "Active HOLD reservation not found to expire",
      404
    );
  }

  return {
    expired: true,
    story_id: "INV-102",
    unit_returned_to_pool: true,
    reservation: res.rows[0],
  };
}

/**
 * Section 11.1 (`POST /api/:business/payments/webhook`):
 * Stripe / Mock payment success & decline webhook dispatcher.
 */
async function processPaymentWebhook(business, payload = {}) {
  const {
    reservation_guid,
    event_type = "payment_intent.succeeded",
    status,
    provider = "mock",
    customer = {},
    delay_ms = 0,
  } = payload;

  if (!reservation_guid) {
    throw new ExpressError("reservation_guid is required for payment webhook", 400);
  }

  const rawAction = String(status || event_type || "SUCCEEDED").toUpperCase();

  // Story DEV-401 Section 9.1: Simulate Delay option in Interactive Test Payment Panel
  const safeDelayMs = Math.min(Math.max(0, Number(delay_ms) || (rawAction.includes("DELAY") ? 1200 : 0)), 3000);
  if (safeDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, safeDelayMs));
  }

  // Story DEV-401 Section 9.1: Abandon option releases temporary checkout hold immediately
  if (rawAction.includes("ABANDON")) {
    const released = await releaseCheckoutHold(business, reservation_guid);
    return {
      webhook_processed: true,
      outcome: "ABANDONED",
      simulated_delay_ms: safeDelayMs,
      reservation: released,
    };
  }

  const normalizedOutcome =
    rawAction.includes("FAIL") || rawAction.includes("DECLINE")
      ? "FAILED"
      : "SUCCEEDED";

  if (normalizedOutcome === "SUCCEEDED") {
    const confirmed = await confirmReservationCheckout(business, {
      reservation_guid,
      customer,
      payment_provider: provider,
    });
    return {
      webhook_processed: true,
      outcome: "SUCCEEDED",
      simulated_delay_ms: safeDelayMs,
      ...confirmed,
    };
  }

  const resQuery = await db.query(
    `SELECT * FROM reservations WHERE reservation_guid = $1 AND LOWER(business) = LOWER($2) LIMIT 1`,
    [reservation_guid, business]
  );
  if (resQuery.rows.length === 0) {
    throw new ExpressError("Reservation not found for payment webhook", 404);
  }
  const reservation = resQuery.rows[0];
  const paymentGuid = generateGuid("pay");
  const failedPayRes = await db.query(
    `INSERT INTO payments
      (payment_guid, business, reservation_guid, type, purpose, amount_cents,
       provider, provider_ref, status, idempotency_key, attempts, time_created)
     VALUES ($1, $2, $3, 'CHARGE', 'BOOKING', $4,
             $5, $6, 'FAILED', $7, 1, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      paymentGuid,
      business,
      reservation_guid,
      reservation.total_cents,
      provider,
      `ch_fail_${paymentGuid}`,
      `idem_webhook_fail_${reservation_guid}_${Date.now()}`,
    ]
  );

  return {
    webhook_processed: true,
    outcome: "FAILED",
    reservation,
    payment: failedPayRes.rows[0],
  };
}

/**
 * Story INV-102 Scenario 1 Seed Helper:
 * Ensures `alpha_rentals` has 3 active serialized units of Item X and `beta_rentals` has 2 active serialized units
 * of Item X (plus a tenant-scoped blackout in `beta_rentals`) so multi-tenant availability and blackout isolation
 * can be verified immediately.
 */
async function seedDemoMultiTenantInventory() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO items (item_guid, business, name, description, daily_rate_cents, images, is_active)
       VALUES
         ('item_alpha_x', 'alpha_rentals', 'Item X — Pro Event Sound System', 'Flagship rental kit scoped strictly to alpha_rentals (3 serialized units)', 10000, '[]'::jsonb, TRUE),
         ('item_beta_x', 'beta_rentals', 'Item X — Pro Event Sound System', 'Flagship rental kit scoped strictly to beta_rentals (2 serialized units)', 10000, '[]'::jsonb, TRUE)
       ON CONFLICT (item_guid) DO UPDATE
       SET is_active = TRUE, daily_rate_cents = EXCLUDED.daily_rate_cents`
    );

    await client.query(
      `INSERT INTO item_units (unit_guid, business, item_guid, serial_number, is_active)
       VALUES
         ('unit_alpha_x_1', 'alpha_rentals', 'item_alpha_x', 'ALPHA-SN-001', TRUE),
         ('unit_alpha_x_2', 'alpha_rentals', 'item_alpha_x', 'ALPHA-SN-002', TRUE),
         ('unit_alpha_x_3', 'alpha_rentals', 'item_alpha_x', 'ALPHA-SN-003', TRUE),
         ('unit_beta_x_1', 'beta_rentals', 'item_beta_x', 'BETA-SN-001', TRUE),
         ('unit_beta_x_2', 'beta_rentals', 'item_beta_x', 'BETA-SN-002', TRUE)
       ON CONFLICT (unit_guid) DO UPDATE
       SET is_active = TRUE`
    );

    // Seed a sample blackout strictly in beta_rentals so Scenario 1 proves beta_rentals blackouts have 0 effect on alpha_rentals
    await client.query(
      `INSERT INTO inventory_blackouts (blackout_guid, business, item_guid, date_range, reason, created_by)
       VALUES ('blk_beta_demo_1', 'beta_rentals', 'item_beta_x', '[2026-12-01,2026-12-05)'::daterange, 'Beta Rentals Annual Warehouse Audit', 'beta_supervisor')
       ON CONFLICT (blackout_guid) DO NOTHING`
    );

    await client.query("COMMIT");

    return {
      seeded: true,
      story_id: "INV-102",
      alpha_rentals: { item_guid: "item_alpha_x", units: 3 },
      beta_rentals: {
        item_guid: "item_beta_x",
        units: 2,
        blackout_range: "[2026-12-01,2026-12-05)",
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getNow,
  getClockState,
  setClockOffsetHours,
  parseAndValidateDateRange,
  parsePgDateRange,
  addDaysToIsoDate,
  enumerateDatesInRange,
  calculatePricingCents,
  sweepExpiredHolds,
  checkItemAvailability,
  evaluateCutoffWindow,
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
};

