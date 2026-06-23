/**
 * Wraps an async route handler and forwards any thrown error to Express
 * next(err), which is picked up by the centralized error handler.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
