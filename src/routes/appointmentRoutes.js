const express     = require("express");
const router      = express.Router();
const controller  = require("../controllers/appointmentController");
const protect     = require("../middleware/protect");
const requireRole = require("../middleware/requireRole");
const tenantGuard = require("../middleware/tenantGuard");

router.post("/",                          protect, requireRole("buyer"),                 controller.createAppointment);
router.get("/agent", protect, requireRole("agent", "agency_admin"), controller.getAgentAppointments);
router.get("/buyer",                      protect, requireRole("buyer"),                 controller.getBuyerAppointments);
router.patch("/:id/status",               protect, requireRole("agent", "agency_admin"), controller.updateAppointmentStatus);
router.patch("/:id/reschedule",           protect, requireRole("agent", "agency_admin"), controller.rescheduleAppointment);
router.get("/availability/:agentId",      controller.getAgentAvailability);
router.put("/availability", protect, requireRole("agent", "agency_admin"), controller.setAvailability);

module.exports = router;
