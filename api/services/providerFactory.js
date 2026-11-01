const ExpressError = require("../expressError");

/**
 * Story DEV-401 — Developer Experience, Mock Providers & Time Travel
 * Section 9.1: Provider Factory (env-driven) & Production Guardrail
 */

let failNextPaymentState = {
  fail_next: false,
  reason: "Mock payment declined via /dev/payments/fail-next",
  updated_at: null,
};

/**
 * Production Guardrail (Section 9.1):
 * If `NODE_ENV=production`, the application refuses to start if any mock provider or dev route is enabled.
 */
function verifyProductionGuardrail({
  nodeEnv = process.env.NODE_ENV || "development",
  paymentProvider = process.env.PAYMENT_PROVIDER ||
    (String(nodeEnv).toLowerCase() === "production" ? "stripe" : "mock"),
  emailProvider = process.env.EMAIL_PROVIDER ||
    (String(nodeEnv).toLowerCase() === "production" ? "sendgrid" : "mailpit"),
  smsProvider = process.env.SMS_PROVIDER ||
    (String(nodeEnv).toLowerCase() === "production" ? "twilio" : "console"),
  clockProvider = process.env.CLOCK_PROVIDER ||
    (String(nodeEnv).toLowerCase() === "production" ? "system" : "offset"),
  enableDevRoutes = process.env.ENABLE_DEV_ROUTES,
} = {}) {
  const isProd = String(nodeEnv).toLowerCase() === "production";
  const mockProvidersActive = [];

  if (String(paymentProvider).toLowerCase() === "mock") {
    mockProvidersActive.push("PAYMENT_PROVIDER=mock (MockPaymentProvider)");
  }
  if (
    ["mailpit", "console", "mock"].includes(String(emailProvider).toLowerCase())
  ) {
    mockProvidersActive.push(`EMAIL_PROVIDER=${emailProvider} (Mailpit/Console)`);
  }
  if (
    ["console", "memory", "mock"].includes(String(smsProvider).toLowerCase())
  ) {
    mockProvidersActive.push(`SMS_PROVIDER=${smsProvider} (Console/Memory SMS)`);
  }
  if (String(clockProvider).toLowerCase() === "offset") {
    mockProvidersActive.push("CLOCK_PROVIDER=offset (OffsetClock)");
  }
  if (String(enableDevRoutes).toLowerCase() === "true") {
    mockProvidersActive.push("ENABLE_DEV_ROUTES=true");
  }

  const wouldRefuseStartupInProd = isProd && mockProvidersActive.length > 0;

  return {
    node_env: nodeEnv,
    is_production: isProd,
    dev_routes_enabled: !isProd && enableDevRoutes !== "false",
    mock_providers_active: mockProvidersActive,
    would_refuse_startup_in_production: wouldRefuseStartupInProd,
    guardrail_rule:
      "If NODE_ENV=production, application refuses to start if any mock provider or dev route is enabled.",
  };
}

function assertProductionGuardrail(overrides = {}) {
  const check = verifyProductionGuardrail(overrides);
  if (check.would_refuse_startup_in_production) {
    throw new Error(
      `[DEV-401 PRODUCTION GUARDRAIL] Refusing to start in NODE_ENV=production with mock providers/dev routes enabled: ${check.mock_providers_active.join(
        ", "
      )}`
    );
  }
  return check;
}

function setFailNextPayment(failNext = true, reason = null) {
  failNextPaymentState = {
    fail_next: Boolean(failNext),
    reason:
      reason ||
      (failNext
        ? "Forced decline via /dev/payments/fail-next"
        : "Normal mock payment processing"),
    updated_at: new Date().toISOString(),
  };
  return { ...failNextPaymentState };
}

function getFailNextPaymentState() {
  return { ...failNextPaymentState };
}

function consumeFailNextPayment() {
  if (!failNextPaymentState.fail_next) {
    return { shouldFail: false, reason: null };
  }
  const reason = failNextPaymentState.reason;
  failNextPaymentState = {
    fail_next: false,
    reason: "Consumed by payment attempt",
    updated_at: new Date().toISOString(),
  };
  return { shouldFail: true, reason };
}

/**
 * getPaymentProvider() — returns MockPaymentProvider or StripePaymentProvider based on PAYMENT_PROVIDER env.
 */
function getPaymentProvider() {
  const mode = String(process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
  if (mode === "stripe") {
    return {
      name: "StripePaymentProvider",
      mode: "stripe",
      is_mock: false,
      supported_test_actions: [],
    };
  }
  return {
    name: "MockPaymentProvider",
    mode: "mock",
    is_mock: true,
    fail_next: failNextPaymentState.fail_next,
    supported_test_actions: ["SUCCESS", "DECLINE", "SIMULATE_DELAY", "ABANDON"],
  };
}

/**
 * getEmailProvider() — returns Mailpit/Console or SendGridProvider based on EMAIL_PROVIDER env.
 */
function getEmailProvider(outageState = {}) {
  const mode = String(process.env.EMAIL_PROVIDER || "mailpit").toLowerCase();
  if (mode === "sendgrid") {
    return {
      name: "SendGridProvider",
      mode: "sendgrid",
      is_mock: false,
      healthy: !outageState.email_outage,
    };
  }
  return {
    name: "Mailpit / Console",
    mode: "mailpit",
    is_mock: true,
    inspector_path: "/dev/outbox",
    healthy: !outageState.email_outage,
  };
}

/**
 * getSmsProvider() — returns Console/Memory SMS or TwilioProvider based on SMS_PROVIDER env.
 */
function getSmsProvider(outageState = {}) {
  const mode = String(process.env.SMS_PROVIDER || "console").toLowerCase();
  if (mode === "twilio") {
    return {
      name: "TwilioProvider",
      mode: "twilio",
      is_mock: false,
      healthy: !outageState.sms_outage,
    };
  }
  return {
    name: "Console / Memory SMS",
    mode: "console",
    is_mock: true,
    inspector_path: "/dev/outbox",
    healthy: !outageState.sms_outage,
  };
}

/**
 * getClock() — returns OffsetClock or SystemClock based on CLOCK_PROVIDER env.
 */
function getClock(clockState = {}) {
  const mode = String(process.env.CLOCK_PROVIDER || "offset").toLowerCase();
  if (mode === "system") {
    return {
      name: "SystemClock",
      mode: "system",
      is_mock: false,
      ...clockState,
    };
  }
  return {
    name: "OffsetClock",
    mode: "offset",
    is_mock: true,
    endpoint: "/dev/clock",
    ...clockState,
  };
}

/**
 * Middleware that blocks `/dev/*` routes if NODE_ENV === 'production'.
 */
function requireNonProduction(req, res, next) {
  if (String(process.env.NODE_ENV).toLowerCase() === "production") {
    return next(
      new ExpressError(
        "DEV-401 Production Guardrail: /dev/* routes are disabled in production",
        403
      )
    );
  }
  return next();
}

module.exports = {
  verifyProductionGuardrail,
  assertProductionGuardrail,
  setFailNextPayment,
  getFailNextPaymentState,
  consumeFailNextPayment,
  getPaymentProvider,
  getEmailProvider,
  getSmsProvider,
  getClock,
  requireNonProduction,
};
