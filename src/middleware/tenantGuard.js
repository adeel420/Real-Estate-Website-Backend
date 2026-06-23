const AppError = require("../utils/AppError");
const Tenant = require("../models/Tenant");
const asyncHandler = require("../utils/asyncHandler");

/**
 * tenantGuard — must be used AFTER protect middleware.
 *
 * 1. super_admin: bypasses tenant filtering (can see all tenants).
 * 2. All other roles: injects req.tenantId from the user's tenantId field.
 *    Also validates the tenant is active.
 *
 * Downstream controllers use `req.tenantId` to scope all DB queries.
 */
const tenantGuard = asyncHandler(async (req, res, next) => {
  // super_admin operates across all tenants
  if (req.user.role === "super_admin") {
    req.tenantId = null; // no filter applied
    return next();
  }

  const tenantId = req.user.tenantId;
  if (!tenantId) {
    throw new AppError("User is not associated with any tenant.", 403);
  }

  // Validate tenant exists and is active
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError("Tenant not found.", 404);
  if (tenant.status === "suspended") {
    throw new AppError("Your agency account has been suspended.", 403);
  }
  if (tenant.status === "cancelled") {
    throw new AppError("Your agency subscription has been cancelled.", 403);
  }

  req.tenantId = tenantId.toString();
  req.tenant   = tenant;
  next();
});

module.exports = tenantGuard;
