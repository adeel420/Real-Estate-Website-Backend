const SubscriptionPlan = require("../models/SubscriptionPlan");

const planToPayload = (plan) => ({
  id: plan.slug,
  _id: plan._id,
  slug: plan.slug,
  scope: plan.scope,
  name: plan.name,
  description: plan.description || "",
  price: plan.price || 0,
  billing: plan.billing || "monthly",
  maxAgents: plan.limits?.maxAgents || 0,
  maxListings: plan.limits?.maxListings || 0,
  maxFeaturedListings: plan.limits?.maxFeaturedListings || 0,
  maxInquiries: plan.limits?.maxInquiries || 0,
  storageMb: plan.limits?.storageMb || 0,
  limits: plan.limits || {},
  features: plan.features || [],
  flags: plan.flags || {},
  popular: Boolean(plan.popular),
  active: Boolean(plan.active),
});

const getPlan = async (slug = "free", scope = "agency") => {
  try {
    const plan = await SubscriptionPlan.findOne({ slug, scope, deletedAt: { $exists: false } }).lean();
    if (plan) return planToPayload(plan);
  } catch (err) {
    console.warn("getPlan: DB query failed:", err.message);
  }
  return null;
};

const findPlan = async (slug = "free", scope = "agency") => {
  const planSlug = String(slug || "free").toLowerCase();

  try {
    const plan = await SubscriptionPlan.findOne({
      slug: planSlug,
      scope,
      deletedAt: { $exists: false },
    }).lean();

    if (plan) {
      const payload = planToPayload(plan);
      if (payload.active) return payload;
      return null;
    }
  } catch (err) {
    console.warn("findPlan: DB query failed:", err.message);
  }

  return null;
};

const getPlanList = async (scope) => {
  try {
    const filter = { deletedAt: { $exists: false } };
    if (scope) filter.scope = scope;
    const plans = await SubscriptionPlan.find(filter).sort({ scope: 1, price: 1, createdAt: 1 }).lean();
    return plans.map(planToPayload);
  } catch (err) {
    console.warn("getPlanList: DB query failed:", err.message);
    return [];
  }
};

module.exports = { getPlan, findPlan, getPlanList, planToPayload };

