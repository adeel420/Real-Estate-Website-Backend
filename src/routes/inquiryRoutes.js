const express     = require("express");
const router      = express.Router();
const controller  = require("../controllers/inquiryController");
const protect     = require("../middleware/protect");
const requireRole = require("../middleware/requireRole");

router.post("/",              protect, requireRole("buyer"),                        controller.createInquiry);
router.get("/agent",          protect, requireRole("agent", "agency_admin"),        controller.getAgentInquiries);
router.get("/buyer",          protect, requireRole("buyer"),                        controller.getBuyerInquiries);
router.post("/:id/reply",     protect, requireRole("buyer", "agent", "agency_admin"), controller.replyToInquiry);
router.patch("/:id/close",    protect, requireRole("agent", "agency_admin"),        controller.closeInquiry);

module.exports = router;
