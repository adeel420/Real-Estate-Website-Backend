const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Property = require("../models/Property");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { getPlan, getPlanList, findPlan, planToPayload } = require("../utils/subscriptionPlans");
const {
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
} = require("../services/emailService");

const formatTenant = async (tenant) => {
  const [agents, listings] = await Promise.all([
    User.countDocuments({ tenantId: tenant._id, role: "agent" }),
    Property.countDocuments({ tenantId: tenant._id }),
  ]);

  return {
    id: tenant._id,
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone || "",
    plan: tenant.subscription?.plan || "free",
    status: tenant.status,
    agents,
    listings,
    maxAgents: tenant.settings?.maxAgents,
    maxListings: tenant.settings?.maxListings,
    maxFeaturedListings: tenant.settings?.maxFeaturedListings,
    joined: tenant.createdAt,
  };
};

const relativeTimestamp = (doc) => doc.updatedAt || doc.createdAt || new Date();

const formatUser = (user) => ({
  id: user._id,
  name: `${user.firstName} ${user.lastName}`.trim(),
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone || "",
  whatsappNumber: user.whatsappNumber || "",
  role: user.role,
  status: user.status,
  isVerified: user.isVerified,
  tenant: user.tenantId ? {
    id: user.tenantId._id,
    name: user.tenantId.name,
  } : null,
  city: user.city || "",
  joined: user.createdAt,
  lastLogin: user.lastLogin,
});

const formatAgentSubscription = async (agent) => {
  const listings = await Property.countDocuments({ agentId: agent._id, status: { $nin: ["archived", "closed"] } });
  const tenantPlan = agent.tenantId?.subscription?.plan;
  const plan = agent.subscription?.plan || tenantPlan || "free";
  const planConfig = await getPlan(plan, agent.tenantId ? "agency" : "agent");

  return {
    id: agent._id,
    firstName: agent.firstName,
    lastName: agent.lastName,
    email: agent.email,
    phone: agent.phone || "",
    whatsappNumber: agent.whatsappNumber || "",
    tenant: agent.tenantId?.name || null,
    status: agent.status,
    plan,
    subscription: {
      plan,
      status: agent.subscription?.status || "active",
      startDate: agent.subscription?.startDate,
      endDate: agent.subscription?.endDate,
    },
    settings: {
      maxListings: agent.settings?.maxListings ?? planConfig.maxListings,
      maxFeaturedListings: agent.settings?.maxFeaturedListings ?? planConfig.maxFeaturedListings,
    },
    listings,
    joined: agent.createdAt,
  };
};

exports.getOverview = asyncHandler(async (req, res) => {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalTenants, activeListings, newSignups, revenueAgg, recentTenants, recentProperties, recentUsers] = await Promise.all([
    Tenant.countDocuments(),
    Property.countDocuments({ status: "approved" }),
    User.countDocuments({ createdAt: { $gte: since30 } }),
    Property.aggregate([
      { $match: { status: { $in: ["sold", "rented", "closed"] } } },
      { $group: { _id: null, revenue: { $sum: "$price" } } },
    ]),
    Tenant.find().sort({ createdAt: -1 }).limit(5).lean(),
    Property.find().sort({ updatedAt: -1 }).limit(8).populate("tenantId", "name").lean(),
    User.find({ role: { $in: ["agency_admin", "agent"] } }).sort({ createdAt: -1 }).limit(8).populate("tenantId", "name").lean(),
  ]);

  const propertyActivity = recentProperties.map((property) => ({
    id: `property-${property._id}`,
    message: `${property.title} is ${property.status}`,
    target: property.tenantId?.name || property.city || "Property",
    type: property.status === "rejected" ? "error" : property.status === "submitted" ? "warning" : "info",
    createdAt: relativeTimestamp(property),
  }));

  const userActivity = recentUsers.map((user) => ({
    id: `user-${user._id}`,
    message: `${user.firstName} ${user.lastName} joined as ${user.role.replace("_", " ")}`,
    target: user.tenantId?.name || "Platform",
    type: "success",
    createdAt: user.createdAt,
  }));

  res.json({
    success: true,
    data: {
      stats: {
        totalTenants,
        activeListings,
        monthlyRevenue: revenueAgg[0]?.revenue || 0,
        newSignups,
      },
      recentTenants,
      activity: [...propertyActivity, ...userActivity]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    },
  });
});

exports.getTenants = asyncHandler(async (req, res) => {
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  const data = await Promise.all(tenants.map(formatTenant));
  res.json({ success: true, data: { tenants: data } });
});

exports.getUsers = asyncHandler(async (req, res) => {
  const { search, role, status, page = 1, limit = 50 } = req.query;
  const filter = {};

  if (role && role !== "all") filter.role = role;
  if (status && status !== "all") filter.status = status;
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("tenantId", "name")
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { users: users.map(formatUser) },
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

exports.getAgents = asyncHandler(async (req, res) => {
  const agents = await User.find({ role: "agent" })
    .sort({ createdAt: -1 })
    .populate("tenantId", "name subscription")
    .lean();

  const data = await Promise.all(agents.map(formatAgentSubscription));
  res.json({ success: true, data: { agents: data } });
});

exports.updateAgentSubscription = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!plan) throw new AppError("Plan is required.", 400);

  const planConfig = await getPlan(plan, "agent");
  const agent = await User.findOneAndUpdate(
    { _id: req.params.id, role: "agent" },
    {
      subscription: { plan, status: "active", startDate: new Date() },
      settings: { maxListings: planConfig.maxListings, maxFeaturedListings: planConfig.maxFeaturedListings },
    },
    { new: true, runValidators: true }
  ).populate("tenantId", "name subscription");

  if (!agent) throw new AppError("Agent not found.", 404);

  res.json({
    success: true,
    message: "Agent subscription updated.",
    data: { agent: await formatAgentSubscription(agent) },
  });
});

exports.updateTenant = asyncHandler(async (req, res) => {
  const allowed = ["name", "email", "phone", "status"];
  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  if (req.body.plan !== undefined) {
    const plan = await getPlan(req.body.plan, "agency");
    updates.subscription = { plan: req.body.plan, startDate: new Date() };
    updates.settings = {
      maxAgents: plan.maxAgents,
      maxListings: plan.maxListings,
      maxFeaturedListings: plan.maxFeaturedListings,
    };
  }

  const tenant = await Tenant.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!tenant) throw new AppError("Tenant not found.", 404);

  res.json({ success: true, message: "Tenant updated.", data: { tenant: await formatTenant(tenant) } });
});

exports.createTenant = asyncHandler(async (req, res) => {
  const { name, email, phone, plan = "free" } = req.body;
  if (!name || !email) throw new AppError("Agency name and email are required.", 400);

  const slugBase = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const slug = await Tenant.exists({ slug: slugBase }) ? `${slugBase}-${Date.now()}` : slugBase;
  const planConfig = await getPlan(plan, "agency");

  const tenant = await Tenant.create({
    name,
    slug,
    email,
    phone,
    status: "trial",
    subscription: { plan, startDate: new Date() },
    settings: {
      maxAgents: planConfig.maxAgents,
      maxListings: planConfig.maxListings,
      maxFeaturedListings: planConfig.maxFeaturedListings,
    },
  });

  res.status(201).json({ success: true, message: "Tenant created.", data: { tenant: await formatTenant(tenant) } });
});

exports.deleteTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status: "cancelled" }, { new: true });
  if (!tenant) throw new AppError("Tenant not found.", 404);
  res.json({ success: true, message: "Tenant cancelled.", data: { tenant: await formatTenant(tenant) } });
});

exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await getPlanList(req.query.scope);
  res.json({ success: true, data: { plans } });
});

const planBody = (body) => {
  const slug = (body.slug || body.name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    scope: body.scope,
    slug,
    name: body.name,
    description: body.description || "",
    price: Number(body.price || 0),
    billing: body.billing || "monthly",
    limits: {
      maxAgents: Number(body.maxAgents ?? body.limits?.maxAgents ?? 0),
      maxListings: Number(body.maxListings ?? body.limits?.maxListings ?? 0),
      maxFeaturedListings: Number(body.maxFeaturedListings ?? body.limits?.maxFeaturedListings ?? 0),
      maxInquiries: Number(body.maxInquiries ?? body.limits?.maxInquiries ?? 0),
      storageMb: Number(body.storageMb ?? body.limits?.storageMb ?? 0),
    },
    features: Array.isArray(body.features)
      ? body.features
      : String(body.features || "").split("\n").map((item) => item.trim()).filter(Boolean),
    flags: {
      analytics: Boolean(body.flags?.analytics ?? body.analytics),
      leadManagement: Boolean(body.flags?.leadManagement ?? body.leadManagement),
      aiFeatures: Boolean(body.flags?.aiFeatures ?? body.aiFeatures),
      branchManagement: Boolean(body.flags?.branchManagement ?? body.branchManagement),
      featuredListings: Boolean(body.flags?.featuredListings ?? body.featuredListings),
    },
    popular: Boolean(body.popular),
    active: body.active !== undefined ? Boolean(body.active) : true,
  };
};

exports.createPlan = asyncHandler(async (req, res) => {
  const payload = planBody(req.body);
  if (!["agent", "agency"].includes(payload.scope)) throw new AppError("scope must be agent or agency.", 400);
  if (!payload.slug || !payload.name) throw new AppError("Plan name and slug are required.", 400);

  const plan = await SubscriptionPlan.create(payload);
  res.status(201).json({ success: true, message: "Plan created.", data: { plan: planToPayload(plan) } });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  const payload = planBody(req.body);
  delete payload.scope;
  if (!payload.slug || !payload.name) throw new AppError("Plan name and slug are required.", 400);

  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!plan) throw new AppError("Plan not found.", 404);
  res.json({ success: true, message: "Plan updated.", data: { plan: planToPayload(plan) } });
});

exports.updatePlanStatus = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { active: Boolean(req.body.active) }, { new: true });
  if (!plan) throw new AppError("Plan not found.", 404);
  res.json({ success: true, message: "Plan status updated.", data: { plan: planToPayload(plan) } });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), active: false }, { new: true });
  if (!plan) throw new AppError("Plan not found.", 404);
  res.json({ success: true, message: "Plan deleted." });
});

exports.getSettings = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      settings: [
        { key: "platform_name", label: "Platform Name", value: "LuxEstate", type: "text" },
        { key: "support_email", label: "Support Email", value: process.env.NODEMAILER_USER || "support@luxestate.pk", type: "email" },
        { key: "max_images", label: "Max Images per Listing", value: "10", type: "number" },
        { key: "client_url", label: "Client URL", value: process.env.CLIENT_URL || "", type: "text" },
        { key: "api_env", label: "Environment", value: process.env.NODE_ENV || "development", type: "text" },
      ],
      flags: [
        { key: "featured_listings", label: "Featured Listings", description: "Allow agencies to promote listings", enabled: true },
        { key: "map_search", label: "Map Search", description: "Enable map-based property search", enabled: true },
        { key: "agent_registration", label: "Agent Self-Register", description: "Allow agents to register independently", enabled: true },
        { key: "buyer_inquiries", label: "Buyer Inquiries", description: "Enable inquiry system for buyers", enabled: true },
        { key: "visit_booking", label: "Visit Booking", description: "Allow buyers to book property visits", enabled: true },
        { key: "email_notifications", label: "Email Notifications", description: "Send automated email notifications", enabled: Boolean(process.env.NODEMAILER_USER) },
      ],
    },
  });
});

exports.getSiteStats = asyncHandler(async (req, res) => {
  const SiteStat = require("../models/SiteStat");
  let doc = await SiteStat.findOne();
  if (!doc) {
    doc = await SiteStat.create({
      stats: [
        { key: "propertiesListed", label: "Properties Listed", value: 1200, suffix: "+", order: 0 },
        { key: "salesVolume",      label: "Sales Volume",      value: 850,  suffix: "M", prefix: "$", order: 1 },
        { key: "expertAgents",     label: "Expert Agents",     value: 120,  suffix: "+", order: 2 },
        { key: "areasCovered",     label: "Areas Covered",     value: 40,   suffix: "+", order: 3 },
      ],
    });
  }
  res.json({ success: true, data: { stats: doc.stats.sort((a, b) => a.order - b.order) } });
});

exports.updateSiteStats = asyncHandler(async (req, res) => {
  const SiteStat = require("../models/SiteStat");
  const { stats } = req.body;
  if (!Array.isArray(stats) || stats.length === 0) {
    throw new AppError("Stats array is required.", 400);
  }
  for (const s of stats) {
    if (!s.key || !s.label || s.value === undefined) {
      throw new AppError("Each stat must have key, label, and value.", 400);
    }
  }
  let doc = await SiteStat.findOne();
  if (!doc) {
    doc = new SiteStat();
  }
  doc.stats = stats;
  await doc.save();
  res.json({ success: true, message: "Site stats updated.", data: { stats: doc.stats } });
});

exports.getBankDetails = asyncHandler(async (req, res) => {
  const SiteStat = require("../models/SiteStat");
  let doc = await SiteStat.findOne();
  if (!doc) {
    doc = await SiteStat.create({ stats: [] });
  }
  res.json({ success: true, data: { bankDetails: doc.bankDetails || {} } });
});

exports.updateBankDetails = asyncHandler(async (req, res) => {
  const SiteStat = require("../models/SiteStat");
  const { bankName, accountTitle, accountNumber, iban, branchCode } = req.body;
  if (!bankName || !accountTitle || !accountNumber || !iban || !branchCode) {
    throw new AppError("All bank detail fields are required.", 400);
  }
  let doc = await SiteStat.findOne();
  if (!doc) {
    doc = new SiteStat({ stats: [] });
  }
  doc.bankDetails = { bankName, accountTitle, accountNumber, iban, branchCode };
  await doc.save();
  res.json({ success: true, message: "Bank details updated.", data: { bankDetails: doc.bankDetails } });
});

exports.getAuditLogs = asyncHandler(async (req, res) => {
  const [tenants, users, properties] = await Promise.all([
    Tenant.find().sort({ updatedAt: -1 }).limit(15).lean(),
    User.find().sort({ updatedAt: -1 }).limit(15).populate("tenantId", "name").lean(),
    Property.find().sort({ updatedAt: -1 }).limit(15).populate("tenantId", "name").lean(),
  ]);

  const logs = [
    ...tenants.map((tenant) => ({
      id: `tenant-${tenant._id}`,
      action: `Tenant ${tenant.status}`,
      actor: "System",
      actorRole: "system",
      target: tenant.name,
      type: tenant.status === "suspended" || tenant.status === "cancelled" ? "suspend" : "update",
      ip: "server",
      timestamp: relativeTimestamp(tenant),
    })),
    ...users.map((user) => ({
      id: `user-${user._id}`,
      action: `${user.role.replace("_", " ")} ${user.status}`,
      actor: user.tenantId?.name || "Platform",
      actorRole: user.role,
      target: `${user.firstName} ${user.lastName}`,
      type: user.status === "active" ? "create" : "update",
      ip: "server",
      timestamp: relativeTimestamp(user),
    })),
    ...properties.map((property) => ({
      id: `property-${property._id}`,
      action: `Property ${property.status}`,
      actor: property.tenantId?.name || "Platform",
      actorRole: "agency_admin",
      target: property.title,
      type: property.status === "rejected" ? "delete" : "update",
      ip: "server",
      timestamp: relativeTimestamp(property),
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 30);

  res.json({ success: true, data: { logs } });
});

exports.getPendingApprovals = asyncHandler(async (req, res) => {
  const users = await User.find({ status: "pending_approval" })
    .sort({ updatedAt: -1 })
    .populate("tenantId", "name")
    .lean();

  const data = users.map((user) => ({
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    status: user.status,
    selectedPlan: user.selectedPlan || "",
    transactionProof: user.transactionProof || "",
    tenant: user.tenantId ? { id: user.tenantId._id, name: user.tenantId.name } : null,
    joined: user.createdAt,
    updatedAt: user.updatedAt,
  }));

  res.json({ success: true, data: { users: data } });
});

exports.approvePendingUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found.", 404);
  if (user.status !== "pending_approval") {
    throw new AppError("User is not in pending approval status.", 400);
  }

  const planSlug = user.selectedPlan || "free";
  const scope = user.role === "agency_admin" ? "agency" : "agent";
  const selectedPlan = await findPlan(planSlug, scope);

  if (user.role === "agent") {
    user.subscription = {
      plan: planSlug,
      startDate: new Date(),
      status: "active",
    };
    user.settings = {
      maxListings: selectedPlan?.maxListings ?? 3,
      maxFeaturedListings: selectedPlan?.maxFeaturedListings ?? 0,
    };
  }

  if (user.role === "agency_admin" && user.tenantId) {
    const Tenant = require("../models/Tenant");
    await Tenant.findByIdAndUpdate(user.tenantId, {
      status: "active",
      subscription: { plan: planSlug, startDate: new Date() },
      settings: {
        maxAgents: selectedPlan?.maxAgents ?? 1,
        maxListings: selectedPlan?.maxListings ?? 3,
        maxFeaturedListings: selectedPlan?.maxFeaturedListings ?? 0,
      },
    });
  }

  user.status = "active";
  user.rejectionReason = "";
  await user.save({ validateBeforeSave: false });

  await sendAccountApprovedEmail(user.email, `${user.firstName} ${user.lastName}`);

  res.json({
    success: true,
    message: "User approved successfully.",
    data: { user: user.toPublicJSON() },
  });
});

exports.rejectPendingUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    throw new AppError("Rejection reason is required.", 400);
  }

  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found.", 404);
  if (user.status !== "pending_approval") {
    throw new AppError("User is not in pending approval status.", 400);
  }

  user.status = "rejected";
  user.rejectionReason = reason.trim();
  await user.save({ validateBeforeSave: false });

  await sendAccountRejectedEmail(user.email, `${user.firstName} ${user.lastName}`, reason.trim());

  res.json({
    success: true,
    message: "User rejected.",
    data: { user: user.toPublicJSON() },
  });
});
