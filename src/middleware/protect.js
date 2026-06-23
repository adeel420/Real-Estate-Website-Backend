const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { verifyAccessToken } = require("../services/tokenService");
const User = require("../models/User");

/**
 * protect — verifies the JWT access token on every protected route.
 * Attaches req.user (full document) and req.userId.
 */
const protect = asyncHandler(async (req, res, next) => {
  // 1. Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Access denied. No token provided.", 401);
  }

  const token = authHeader.split(" ")[1];

  // 2. Verify signature + expiry
  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new AppError("Access token expired.", 401);
    }
    throw new AppError("Invalid access token.", 401);
  }

  // 3. Confirm user still exists and is active
  const user = await User.findById(decoded.id).select("+password");
  if (!user) throw new AppError("User no longer exists.", 401);
  if (user.status === "suspended") throw new AppError("Account suspended.", 403);
  if (user.status === "inactive")  throw new AppError("Account inactive.", 403);

  // 4. Attach to request
  req.user   = user;
  req.userId = user._id.toString();
  next();
});

module.exports = protect;
