class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? "fail" : "error";
    this.isOperational = true; // distinguishes from programmer errors
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
