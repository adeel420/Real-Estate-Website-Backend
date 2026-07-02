require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const authRoutes = require("./src/routes/authRoutes");
const propertyRoutes = require("./src/routes/propertyRoutes");
const agentRoutes = require("./src/routes/agentRoutes");
const uploadRoutes = require("./src/routes/uploadRoutes");
const inquiryRoutes = require("./src/routes/inquiryRoutes");
const appointmentRoutes = require("./src/routes/appointmentRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const areaRoutes = require("./src/routes/areaRoutes");
const blogRoutes = require("./src/routes/blogRoutes");
const siteStatRoutes = require("./src/routes/siteStatRoutes");
const subscriptionPlanRoutes = require("./src/routes/subscriptionPlanRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const errorHandler = require("./src/middleware/errorHandler");
const AppError = require("./src/utils/AppError");

const app = express();

// ─── Cached DB connection (Vercel serverless pattern) ────────────────────────
let dbPromise = null;
const connectDB = () => {
  if (!dbPromise) {
    dbPromise = mongoose
      .connect(process.env.MONGO_URL)
      .then(() => {
        console.log("Connected to MongoDB");
      })
      .catch((err) => {
        console.error("MongoDB connection failed:", err.message);
        dbPromise = null;
      });
  }
  return dbPromise;
};

// Middleware to wait for DB on all API routes (except health)
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  connectDB().then(next).catch(next);
});
app.set("trust proxy", 1);
const { ipKeyGenerator } = rateLimit;

const rateLimitKeyGenerator = (req) =>
  ipKeyGenerator(
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown",
  );

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true, // required for HttpOnly cookies
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
  }),
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 1000 : 100,
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 200 : 20,
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many auth attempts. Please try again later.",
  },
});

app.use(globalLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/areas", areaRoutes);
app.use("/api/site-stats", siteStatRoutes);

// Health check
app.get("/api/health", (req, res) =>
  res.json({
    success: true,
    message: "Server is running.",
    env: process.env.NODE_ENV,
  }),
);

// 404 handler
app.all("*", (req, res, next) =>
  next(new AppError(`Route ${req.originalUrl} not found.`, 404)),
);

// ─── Centralized Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

// Export for Vercel serverless
module.exports = app;

// Start listening only when not on Vercel
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8080;
  connectDB().then(() => {
    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`)
    );
  });
}
