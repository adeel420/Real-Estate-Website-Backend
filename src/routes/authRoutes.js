const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const protect        = require("../middleware/protect");
const requireRole    = require("../middleware/requireRole");
const validate       = require("../middleware/validate");
const {
  registerBuyerSchema,
  registerAgentSchema,
  registerAgencySchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  completeAgentInvitationSchema,
  verifyEmailSchema,
} = require("../validators/authValidators");

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post("/register/buyer",   validate(registerBuyerSchema),   authController.registerBuyer);
router.post("/register/agent",   validate(registerAgentSchema),   authController.registerAgent);
router.post("/register/agency",  validate(registerAgencySchema),  authController.registerAgency);
router.post("/verify-email",     validate(verifyEmailSchema),     authController.verifyEmail);
router.post("/complete-agent-invitation", validate(completeAgentInvitationSchema), authController.completeAgentInvitation);
router.post("/resend-verification", authController.resendVerification);
router.post("/login",            validate(loginSchema),           authController.login);
router.post("/refresh",                                           authController.refreshToken);
router.post("/forgot-password",  validate(forgotPasswordSchema),  authController.forgotPassword);
router.post("/reset-password",   validate(resetPasswordSchema),   authController.resetPassword);

// ─── Protected Routes (require valid access token) ────────────────────────────
router.post("/logout",           protect, authController.logout);
router.post("/logout-all",       protect, authController.logoutAll);
router.get("/me",                protect, authController.getMe);
router.patch("/me",              protect, authController.updateMe);
router.patch("/change-password", protect, authController.changePassword);
router.get("/sessions",          protect, authController.getSessions);

// ─── Super Admin Only ─────────────────────────────────────────────────────────
// Example: router.get("/users", protect, requireRole("super_admin"), listAllUsers);

module.exports = router;
