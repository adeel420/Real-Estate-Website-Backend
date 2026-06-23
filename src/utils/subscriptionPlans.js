const SubscriptionPlan = require("../models/SubscriptionPlan");

const DEFAULT_PLAN_LIMITS = {
  agency: {
    free: {
      name: "Free",
      price: 0,
      billing: "monthly",
      maxAgents: 1,
      maxListings: 3,
      maxFeaturedListings: 0,
      features: ["1 Agent", "3 Listings", "Basic Dashboard", "Email Support"],
      popular: false,
      active: true,
    },
    basic: {
      name: "Starter",
      price: 4999,
      billing: "monthly",
      maxAgents: 3,
      maxListings: 20,
      maxFeaturedListings: 1,
      features: ["3 Agents", "20 Listings", "1 Featured Listing", "Basic Analytics", "Email Support"],
      popular: false,
      active: true,
    },
    pro: {
      name: "Pro",
      price: 14999,
      billing: "monthly",
      maxAgents: 15,
      maxListings: 150,
      maxFeaturedListings: 5,
      features: ["15 Agents", "150 Listings", "5 Featured Listings", "Advanced Analytics", "Priority Support"],
      popular: true,
      active: true,
    },
    enterprise: {
      name: "Enterprise",
      price: 39999,
      billing: "monthly",
      maxAgents: 999,
      maxListings: 999,
      maxFeaturedListings: 999,
      features: ["Unlimited Agents", "Unlimited Listings", "Unlimited Featured Listings", "Full Analytics", "Dedicated Support", "Custom Branding", "API Access"],
      popular: false,
      active: true,
    },
  },
  agent: {
    free: {
      name: "Free",
      price: 0,
      billing: "monthly",
      maxAgents: 0,
      maxListings: 3,
      maxFeaturedListings: 0,
      features: ["3 Listings", "Basic Profile", "Email Support"],
      popular: false,
      active: true,
    },
    basic: {
      name: "Basic",
      price: 1999,
      billing: "monthly",
      maxAgents: 0,
      maxListings: 10,
      maxFeaturedListings: 1,
      features: ["10 Listings", "1 Featured Listing", "Basic Analytics", "Email Support"],
      popular: false,
      active: true,
    },
    pro: {
      name: "Professional",
      price: 4999,
      billing: "monthly",
      maxAgents: 0,
      maxListings: 40,
      maxFeaturedListings: 5,
      features: ["40 Listings", "5 Featured Listings", "Advanced Analytics", "Priority Support"],
      popular: true,
      active: true,
    },
    enterprise: {
      name: "Premium",
      price: 9999,
      billing: "monthly",
      maxAgents: 0,
      maxListings: 100,
      maxFeaturedListings: 15,
      features: ["100 Listings", "15 Featured Listings", "Full Analytics", "Priority Support"],
      popular: false,
      active: true,
    },
  },
};

const legacyPlan = (scope = "agency", slug = "free") => {
  const plan = DEFAULT_PLAN_LIMITS[scope]?.[slug] || DEFAULT_PLAN_LIMITS[scope]?.free || DEFAULT_PLAN_LIMITS.agency.free;
  return {
    id: slug,
    slug,
    scope,
    ...plan,
    limits: {
      maxAgents: plan.maxAgents,
      maxListings: plan.maxListings,
      maxFeaturedListings: plan.maxFeaturedListings || 0,
      maxInquiries: 0,
      storageMb: 0,
    },
    flags: {
      analytics: plan.features.some((f) => /analytics/i.test(f)),
      leadManagement: plan.features.some((f) => /lead/i.test(f)),
      aiFeatures: plan.features.some((f) => /ai/i.test(f)),
      branchManagement: scope === "agency" && slug === "enterprise",
      featuredListings: (plan.maxFeaturedListings || 0) > 0,
    },
  };
};

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

let _seeded = false;

const ensurePlanIndexes = async () => {
  try {
    await SubscriptionPlan.createCollection();
  } catch {
    // Collection may already exist — ignore
  }

  try {
    const indexes = await SubscriptionPlan.collection.indexes();
    const hasLegacySlugIndex = indexes.some((index) => index.name === "slug_1" && index.unique);

    if (hasLegacySlugIndex) {
      await SubscriptionPlan.collection.dropIndex("slug_1");
    }

    await SubscriptionPlan.syncIndexes();
  } catch (err) {
    console.warn("Failed to sync subscription plan indexes:", err.message);
  }
};

const seedDefaultPlans = async () => {
  if (_seeded) return;
  await ensurePlanIndexes();

  const toDoc = (scope, slug, plan) => ({
    scope,
    slug,
    name: plan.name,
    price: plan.price,
    billing: plan.billing,
    limits: {
      maxAgents: plan.maxAgents,
      maxListings: plan.maxListings,
      maxFeaturedListings: plan.maxFeaturedListings || 0,
      maxInquiries: 0,
      storageMb: 0,
    },
    features: plan.features,
    flags: legacyPlan(scope, slug).flags,
    popular: plan.popular,
    active: plan.active,
  });

  for (const scope of Object.keys(DEFAULT_PLAN_LIMITS)) {
    for (const [slug, plan] of Object.entries(DEFAULT_PLAN_LIMITS[scope])) {
      try {
        let existing = await SubscriptionPlan.findOne({ scope, slug, deletedAt: { $exists: false } });
        const doc = toDoc(scope, slug, plan);

        if (!existing) {
          existing = await SubscriptionPlan.findOne({ scope, slug });
          if (existing) {
            existing.deletedAt = undefined;
            existing.active = true;
            Object.assign(existing, doc);
            await existing.save();
          } else {
            await SubscriptionPlan.create(doc);
          }
          continue;
        }

        const hasOldAgencyName = /^Agency\s/i.test(existing.name || "");
        if (hasOldAgencyName) {
          Object.assign(existing, doc);
          await existing.save();
        }
      } catch (err) {
        console.warn(`seedDefaultPlans: failed to seed ${scope}/${slug}:`, err.message);
      }
    }
  }

  _seeded = true;
};

const getPlan = async (slug = "free", scope = "agency") => {
  try {
    const plan = await SubscriptionPlan.findOne({ slug, scope, deletedAt: { $exists: false } }).lean();
    if (plan) return planToPayload(plan);
  } catch (err) {
    console.warn("getPlan: DB query failed, using fallback:", err.message);
  }
  return legacyPlan(scope, slug);
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
    console.warn("findPlan: DB query failed, using fallback:", err.message);
  }

  const fallback = DEFAULT_PLAN_LIMITS[scope]?.[planSlug];
  return fallback?.active ? legacyPlan(scope, planSlug) : null;
};

const getPlanList = async (scope) => {
  try {
    const filter = { deletedAt: { $exists: false } };
    if (scope) filter.scope = scope;
    const plans = await SubscriptionPlan.find(filter).sort({ scope: 1, price: 1, createdAt: 1 }).lean();
    if (plans.length) return plans.map(planToPayload);
  } catch (err) {
    console.warn("getPlanList: DB query failed, using fallback:", err.message);
  }

  const scopes = scope ? [scope] : Object.keys(DEFAULT_PLAN_LIMITS);
  const result = [];
  for (const s of scopes) {
    for (const slug of Object.keys(DEFAULT_PLAN_LIMITS[s] || {})) {
      const plan = legacyPlan(s, slug);
      if (plan.active) result.push(plan);
    }
  }
  return result;
};

module.exports = { DEFAULT_PLAN_LIMITS, legacyPlan, getPlan, findPlan, getPlanList, planToPayload, seedDefaultPlans };

