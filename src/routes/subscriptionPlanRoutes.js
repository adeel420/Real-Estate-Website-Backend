const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Property = require("../models/Property");
const protect = require("../middleware/protect");
const { findPlan, getPlan, getPlanList } = require("../utils/subscriptionPlans");

const router = express.Router();

router.get("/", asyncHandler(async (req, res) => {
  const { scope } = req.query;
  const allowedScopes = ["agent", "agency"];

  if (scope && !allowedScopes.includes(scope)) {
    throw new AppError("Invalid plan scope.", 400);
  }

  const plans = (await getPlanList(scope)).filter((plan) => plan.active);

  res.json({
    success: true,
    data: { plans },
  });
}));

router.get("/my", protect, asyncHandler(async (req, res) => {
  if (!["agent", "agency_admin"].includes(req.user.role)) {
    throw new AppError("Only agents and agencies have subscription plans.", 403);
  }

  const scope = req.user.role === "agency_admin" ? "agency" : "agent";
  let planSlug = "free";
  let limits = { maxListings: 3, maxFeaturedListings: 0 };
  let listingCount = 0;
  let featuredCount = 0;

  if (req.user.role === "agency_admin" && req.user.tenantId) {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (tenant) {
      planSlug = tenant.subscription?.plan || "free";
      limits = {
        maxListings: tenant.settings?.maxListings ?? 3,
        maxFeaturedListings: tenant.settings?.maxFeaturedListings ?? 0,
      };
    }
    listingCount = await Property.countDocuments({
      tenantId: req.user.tenantId,
      status: { $nin: ["archived", "closed"] },
    });
  } else {
    planSlug = req.user.subscription?.plan || "free";
    limits = {
      maxListings: req.user.settings?.maxListings ?? 3,
      maxFeaturedListings: req.user.settings?.maxFeaturedListings ?? 0,
    };
    listingCount = await Property.countDocuments({
      agentId: req.userId,
      status: { $nin: ["archived", "closed"] },
    });
  }

  const plan = await getPlan(planSlug, scope);

  res.json({
    success: true,
    data: {
      plan: plan || { slug: planSlug, name: "Free", price: 0 },
      limits,
      usage: {
        listings: listingCount,
      },
      billing: "monthly",
    },
  });
}));

router.post("/select", protect, asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!plan) throw new AppError("Plan is required.", 400);

  const user = await User.findById(req.userId);
  if (!user) throw new AppError("User not found.", 404);
  if (!user.isVerified) throw new AppError("Please verify your email first.", 403);

  if (user.role === "agent") {
    const selectedPlan = await findPlan(plan, "agent");
    if (!selectedPlan) throw new AppError("Selected subscription plan is not available.", 400);

    user.selectedPlan = selectedPlan.slug;
    if (user.status === "pending_verification" || user.status === "pending_payment") {
      user.status = "pending_payment";
    }
    await user.save({ validateBeforeSave: false });

    return res.json({
      success: true,
      message: "Plan selected. Please upload payment proof.",
      data: { plan: selectedPlan.slug, nextStep: "payment-proof" },
    });
  }

  if (user.role === "agency_admin") {
    const selectedPlan = await findPlan(plan, "agency");
    if (!selectedPlan) throw new AppError("Selected subscription plan is not available.", 400);

    user.selectedPlan = selectedPlan.slug;
    if (user.status === "pending_verification" || user.status === "pending_payment") {
      user.status = "pending_payment";
    }
    await user.save({ validateBeforeSave: false });

    return res.json({
      success: true,
      message: "Plan selected. Please upload payment proof.",
      data: { plan: selectedPlan.slug, nextStep: "payment-proof" },
    });
  }

  throw new AppError("Subscription plans are only available for agents and agencies.", 403);
}));

router.post("/upgrade", protect, asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!plan) throw new AppError("Plan is required.", 400);

  const user = await User.findById(req.userId);
  if (!user) throw new AppError("User not found.", 404);
  if (!["active", "pending_approval"].includes(user.status)) throw new AppError("Your account must be active to upgrade.", 403);

  const scope = user.role === "agency_admin" ? "agency" : "agent";
  const selectedPlan = await findPlan(plan, scope);
  if (!selectedPlan) throw new AppError("Selected subscription plan is not available.", 400);

  user.selectedPlan = selectedPlan.slug;
  user.status = "pending_approval";
  user.transactionProof = undefined;
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: "Upgrade requested. Please upload payment proof.",
    data: { plan: selectedPlan.slug, nextStep: "payment-proof" },
  });
}));

module.exports = router;
