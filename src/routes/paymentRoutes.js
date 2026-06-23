const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { getPlanList } = require("../utils/subscriptionPlans");

const router = express.Router();

router.get("/plans", asyncHandler(async (req, res) => {
  const plans = await getPlanList(req.query.scope);
  res.json({ success: true, data: { plans: plans.filter((plan) => plan.active) } });
}));

router.post("/checkout", asyncHandler(async (req, res) => {
  const {
    planSlug,
    successUrl,
    billingInterval = "monthly",
    userId,
    tenantId,
  } = req.body;

  if (!planSlug) throw new AppError("Plan slug is required.", 400);
  if (!successUrl) throw new AppError("Success URL is required.", 400);

  const scope = tenantId ? "agency" : "agent";
  const plans = await getPlanList(scope);
  const plan = plans.find((item) => item.slug === planSlug && item.active);

  if (!plan) throw new AppError("Selected subscription plan is not available.", 400);
  if (!userId && !tenantId) throw new AppError("Checkout account reference is required.", 400);

  const basePrice = Number(plan.price || 0);
  const amount = Math.round((billingInterval === "yearly" ? basePrice * 12 : basePrice) * 100);

  res.json({
    success: true,
    message: amount > 0
      ? "Payment checkout is disabled for now. Continue with email verification."
      : "Free plan selected. Continue with email verification.",
    data: {
      url: successUrl,
      plan,
    },
  });
}));

module.exports = router;
