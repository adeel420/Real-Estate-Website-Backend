const express = require("express");
const router = express.Router();
const controller = require("../controllers/agentController");
const protect = require("../middleware/protect");
const requireRole = require("../middleware/requireRole");
const tenantGuard = require("../middleware/tenantGuard");
const validate = require("../middleware/validate");
const { inviteAgentSchema } = require("../validators/authValidators");

// Public
router.get("/", controller.getAgents);

// Agency admin routes
router.get("/agency/list", protect, requireRole("agency_admin"), tenantGuard, controller.getAgencyAgents);
router.post("/invite", protect, requireRole("agency_admin"), tenantGuard, validate(inviteAgentSchema), controller.inviteAgent);
router.patch("/agency/:id/status", protect, requireRole("agency_admin"), tenantGuard, controller.updateAgencyAgentStatus);
router.patch("/agency/:id", protect, requireRole("agency_admin"), tenantGuard, controller.updateAgencyAgent);

// Agent updates own profile — MUST be before /:id to avoid Express treating "profile" as an id
router.patch("/profile", protect, requireRole("agent", "agency_admin"), controller.updateAgentProfile);

// Public agent profile & direct message
router.get("/:id", controller.getAgentById);
router.post("/:id/message", controller.sendDirectMessage);

module.exports = router;
