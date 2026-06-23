const AppError = require("../utils/AppError");

/**
 * requireRole(...roles) — must be used AFTER protect middleware.
 * Usage: router.get("/admin", protect, requireRole("super_admin"), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Not authenticated.", 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(
      new AppError(
        `Role '${req.user.role}' is not authorized for this action.`,
        403
      )
    );
  }
  next();
};

module.exports = requireRole;
