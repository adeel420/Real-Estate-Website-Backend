const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminController");
const blogController = require("../controllers/blogController");
const protect = require("../middleware/protect");
const requireRole = require("../middleware/requireRole");

router.use(protect, requireRole("super_admin"));

router.get("/overview", controller.getOverview);
router.get("/tenants", controller.getTenants);
router.get("/users", controller.getUsers);
router.get("/agents", controller.getAgents);
router.patch("/agents/:id", controller.updateAgentSubscription);
router.post("/tenants", controller.createTenant);
router.patch("/tenants/:id", controller.updateTenant);
router.delete("/tenants/:id", controller.deleteTenant);
router.get("/plans", controller.getPlans);
router.post("/plans", controller.createPlan);
router.patch("/plans/:id", controller.updatePlan);
router.patch("/plans/:id/status", controller.updatePlanStatus);
router.delete("/plans/:id", controller.deletePlan);
router.get("/site-stats", controller.getSiteStats);
router.put("/site-stats", controller.updateSiteStats);
router.get("/settings", controller.getSettings);
router.get("/audit-logs", controller.getAuditLogs);
router.get("/blogs", blogController.adminGetBlogs);
router.post("/blogs", blogController.adminCreateBlog);
router.patch("/blogs/:id", blogController.adminUpdateBlog);
router.delete("/blogs/:id", blogController.adminDeleteBlog);

router.get("/pending-approvals", controller.getPendingApprovals);
router.post("/pending-approvals/:id/approve", controller.approvePendingUser);
router.post("/pending-approvals/:id/reject", controller.rejectPendingUser);
router.get("/bank-details", controller.getBankDetails);
router.put("/bank-details", controller.updateBankDetails);

module.exports = router;
