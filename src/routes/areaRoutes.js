const express     = require("express");
const router      = express.Router();
const controller  = require("../controllers/areaController");
const protect     = require("../middleware/protect");
const requireRole = require("../middleware/requireRole");

// Public
router.get("/",        controller.getAreas);
router.get("/:slug",   controller.getAreaBySlug);

// Super admin
router.get("/admin/all",    protect, requireRole("super_admin"), controller.adminGetAreas);
router.post("/admin",       protect, requireRole("super_admin"), controller.adminCreateArea);
router.patch("/admin/:id",  protect, requireRole("super_admin"), controller.adminUpdateArea);
router.delete("/admin/:id", protect, requireRole("super_admin"), controller.adminDeleteArea);

module.exports = router;
