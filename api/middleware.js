const ExpressError = require("./expressError");
const db = require("./db");

const ELEVATED_ROLES = ["admin", "supervisor", "agent"];

function logger(req, res, next) {
  console.log(`RECEIVED a ${req.method} request to ${req.path}.`);
  return next();
}

function checkForPassword(req, res, next) {
  try {
    if (req.query.password !== "monkeybreath") {
      throw new ExpressError("Missing Password", 402);
    } else {
      return next();
    }
  } catch (e) {
    return next(e);
  }
}

/**
 * Normalize a business identifier string.
 */
function normalizeBusiness(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract tenant subdomain if present (e.g., alpha.localhost or alpha.triplegreat.com)
 */
function extractSubdomainBusiness(hostname) {
  if (!hostname || typeof hostname !== "string") return null;
  const cleanHost = hostname.split(":")[0].toLowerCase();
  if (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost.endsWith(".up.railway.app") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(cleanHost)
  ) {
    return null;
  }
  const parts = cleanHost.split(".");
  if (parts.length >= 3 && parts[0] !== "www" && parts[0] !== "api") {
    return parts[0];
  }
  return null;
}

/**
 * Classify user role:
 * - isAdmin: permission_group === 'Admin' or is_admin === true
 * - isSupervisor: permission_group === 'Supervisor'
 * - isAgent: permission_group === 'Agent'
 * - isCustomer: not Admin, Supervisor, or Agent
 */
function classifyRole(permissionGroup, isAdminFlag) {
  const isAdmin =
    permissionGroup === "Admin" || Boolean(isAdminFlag);
  const isSupervisor = permissionGroup === "Supervisor";
  const isAgent = permissionGroup === "Agent";
  const isElevated = isAdmin || isSupervisor || isAgent;

  let effectiveRole = "Customer";
  if (isAdmin) effectiveRole = "Admin";
  else if (isSupervisor) effectiveRole = "Supervisor";
  else if (isAgent) effectiveRole = "Agent";

  return {
    isAdmin,
    isSupervisor,
    isAgent,
    isElevated,
    isCustomer: !isElevated,
    effectiveRole,
  };
}

/**
 * Tenant Context Middleware:
 * Resolves the active business tenant from route params, headers, query, body, or subdomain.
 */
function resolveTenant(req, res, next) {
  const rawBusiness =
    req.params?.business ||
    req.headers["x-tenant-business"] ||
    req.query?.business ||
    req.body?.business ||
    req.headers["x-user-business"] ||
    extractSubdomainBusiness(req.hostname);

  const business = normalizeBusiness(rawBusiness);
  req.business = business;
  req.tenant = { business };
  return next();
}

/**
 * Server-Side Authorization & Tenant Isolation Middleware (`requireSupervisor`):
 * Enforces:
 *   1. Valid staff/supervisor credentials (401 Unauthorized if missing)
 *   2. (permission_group IN ('Admin', 'Supervisor', 'Agent') OR is_admin = true)
 *   3. Strict tenant isolation: user.business === targetBusiness (403 Forbidden on mismatch)
 *   4. Re-checks database role when user_guid is present so revocations apply immediately.
 */
async function requireSupervisor(req, res, next) {
  try {
    const targetBusiness = normalizeBusiness(
      req.params?.business || req.business || req.query?.business || req.body?.business
    );

    if (!targetBusiness) {
      throw new ExpressError("Target business tenant is required", 400);
    }

    req.business = targetBusiness;

    const userGuid =
      req.headers["x-user-guid"] ||
      req.body?.modifiedBy ||
      req.body?.actor_guid ||
      req.query?.user_guid ||
      null;

    const headerRole = req.headers["x-user-role"] || "";
    const headerBusiness = normalizeBusiness(req.headers["x-user-business"]);
    const headerIsAdmin =
      req.headers["x-is-admin"] === "true" || req.headers["x-is-admin"] === "1";

    let resolvedProfile = null;

    // Re-check database role when userGuid is available so revocations take effect immediately
    if (userGuid) {
      const dbResult = await db.query(
        `SELECT user_guid, first_name, last_name, email, permission_group, is_admin, business
         FROM users_table
         WHERE user_guid = $1
         LIMIT 1`,
        [userGuid]
      );
      if (dbResult.rows.length > 0) {
        resolvedProfile = dbResult.rows[0];
      }
    }

    // Fallback to header credentials if user row isn't found in DB (e.g. seeded session)
    if (!resolvedProfile && (headerRole || headerBusiness || headerIsAdmin)) {
      resolvedProfile = {
        user_guid: userGuid || "session_actor",
        permission_group: headerRole,
        is_admin: headerIsAdmin,
        business: headerBusiness,
      };
    }

    if (!resolvedProfile) {
      throw new ExpressError("Authentication required to access supervisor resources", 401);
    }

    const { isElevated } = classifyRole(
      resolvedProfile.permission_group,
      resolvedProfile.is_admin
    );

    if (!isElevated) {
      throw new ExpressError(
        "Forbidden: Customer accounts cannot access supervisor control panel resources",
        403
      );
    }

    const actorBusiness = normalizeBusiness(resolvedProfile.business || headerBusiness);
    if (!actorBusiness || actorBusiness.toLowerCase() !== targetBusiness.toLowerCase()) {
      throw new ExpressError(
        `Forbidden: Cross-tenant access denied for business '${targetBusiness}'`,
        403
      );
    }

    req.actor = {
      user_guid: resolvedProfile.user_guid || userGuid || "supervisor",
      permission_group: resolvedProfile.permission_group,
      is_admin: Boolean(resolvedProfile.is_admin),
      business: actorBusiness,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Universal Identity & Role Classification Middleware (`resolveSessionIdentity`):
 * Active across public and administrative endpoints.
 * Re-checks `users_table` when `x-user-guid` is provided so role revocations apply immediately.
 * Any user whose `permission_group` is NOT in ('Admin', 'Supervisor', 'Agent') and !is_admin
 * (or any unauthenticated visitor) is classified as a Customer.
 */
async function resolveSessionIdentity(req, res, next) {
  try {
    const userGuid =
      req.headers["x-user-guid"] ||
      req.query?.user_guid ||
      req.body?.user_guid ||
      null;

    const headerRole = req.headers["x-user-role"] || "";
    const headerBusiness = normalizeBusiness(req.headers["x-user-business"]);
    const headerIsAdmin =
      req.headers["x-is-admin"] === "true" || req.headers["x-is-admin"] === "1";

    let dbProfile = null;
    if (userGuid) {
      const dbResult = await db.query(
        `SELECT user_guid, first_name, last_name, email, phone_number, permission_group, is_admin, business
         FROM users_table
         WHERE user_guid = $1
         LIMIT 1`,
        [userGuid]
      );
      if (dbResult.rows.length > 0) {
        dbProfile = dbResult.rows[0];
      } else {
        const custResult = await db.query(
          `SELECT customer_guid, first_name, last_name, email, phone_number, business
           FROM customers
           WHERE customer_guid = $1
           LIMIT 1`,
          [userGuid]
        );
        if (custResult.rows.length > 0) {
          const c = custResult.rows[0];
          dbProfile = {
            user_guid: c.customer_guid,
            customer_guid: c.customer_guid,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
            phone_number: c.phone_number,
            permission_group: "Customer",
            is_admin: false,
            business: c.business,
          };
        }
      }
    }

    const activeProfile =
      dbProfile ||
      (headerRole || headerBusiness || headerIsAdmin
        ? {
            user_guid: userGuid || null,
            first_name: "",
            last_name: "",
            email: "",
            phone_number: "",
            permission_group: headerRole || "Customer",
            is_admin: headerIsAdmin,
            business: headerBusiness,
          }
        : null);

    const { isElevated, isCustomer, effectiveRole } = classifyRole(
      activeProfile?.permission_group,
      activeProfile?.is_admin
    );

    const targetBusiness = normalizeBusiness(req.params?.business || req.business);
    const assignedBusiness = normalizeBusiness(activeProfile?.business);
    const isSupervisorForTenant = Boolean(
      isElevated &&
        assignedBusiness &&
        targetBusiness &&
        assignedBusiness.toLowerCase() === targetBusiness.toLowerCase()
    );

    req.identity = {
      authenticated: Boolean(activeProfile),
      user_guid: activeProfile?.user_guid || null,
      business: assignedBusiness,
      permission_group: activeProfile?.permission_group || "Customer",
      is_admin: Boolean(activeProfile?.is_admin),
      is_elevated_staff: isElevated,
      is_customer: isCustomer,
      classified_as: isCustomer ? "Customer" : "Staff",
      effective_role: effectiveRole,
      is_supervisor_for_tenant: isSupervisorForTenant,
      customer_prefill:
        activeProfile && isCustomer
          ? {
              first_name: activeProfile.first_name || "",
              last_name: activeProfile.last_name || "",
              email: activeProfile.email || "",
              phone_number: activeProfile.phone_number || "",
            }
          : null,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  logger,
  checkForPassword,
  normalizeBusiness,
  classifyRole,
  resolveTenant,
  resolveSessionIdentity,
  requireSupervisor,
};
