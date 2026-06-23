const AppError = require("../utils/AppError");

// ─── Specific Error Transformers ──────────────────────────────────────────────

const handleCastError = (err) =>
  new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return new AppError(`${field} already exists.`, 409);
};

const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message).join(", ");
  return new AppError(messages, 400);
};

const handleJWTError = () =>
  new AppError("Invalid token. Please log in again.", 401);

const handleJWTExpired = () =>
  new AppError("Token expired. Please log in again.", 401);

// ─── Response Senders ─────────────────────────────────────────────────────────

const sendDevError = (err, res) => {
  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 100 && err.statusCode < 600
    ? err.statusCode
    : 500;
  // Hide stack for expected auth errors (401/403) to reduce console noise
  const isExpectedAuthError = statusCode === 401 || statusCode === 403;
  res.status(statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    ...(isExpectedAuthError ? {} : { stack: err.stack, error: err }),
  });
};

const sendProdError = (err, res) => {
  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 100 && err.statusCode < 600
    ? err.statusCode
    : 500;
  if (err.isOperational) {
    res.status(statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
    });
  } else {
    console.error("UNHANDLED ERROR:", err);
    res.status(500).json({
      success: false,
      status: "error",
      message: "Something went wrong. Please try again later.",
    });
  }
};

// ─── Main Error Handler ───────────────────────────────────────────────────────

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status     = err.status     || "error";

  if (process.env.NODE_ENV === "development") {
    sendDevError(err, res);
  } else {
    let error = Object.assign(Object.create(Object.getPrototypeOf(err)), err);
    error.message = err.message;

    if (error.name === "CastError")              error = handleCastError(error);
    if (error.code === 11000)                    error = handleDuplicateKey(error);
    if (error.name === "ValidationError")        error = handleValidationError(error);
    if (error.name === "JsonWebTokenError")      error = handleJWTError();
    if (error.name === "TokenExpiredError")      error = handleJWTExpired();

    sendProdError(error, res);
  }
};

module.exports = errorHandler;
