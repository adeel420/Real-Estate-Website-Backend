const Property = require("../models/Property");
const mongoose = require("mongoose");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { propertyQuerySchema, mapSearchQuerySchema } = require("../validators/propertyValidators");
const { getPlan } = require("../utils/subscriptionPlans");
const { sendPropertyApprovalRequestEmail } = require("../services/emailService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildSortQuery = (sort) => {
  switch (sort) {
    case "price_asc": return { price: 1 };
    case "price_desc": return { price: -1 };
    case "oldest": return { createdAt: 1 };
    default: return { createdAt: -1 };
  }
};

const getTenantAgentIds = async (tenantId) => {
  const agents = await User.find({ tenantId, role: "agent" }).select("_id").lean();
  return agents.map((agent) => agent._id);
};

const FEATURED_DURATION_DAYS = 30;

const getSubscriptionContext = async (user) => {
  if (user.tenantId) {
    const tenant = await Tenant.findById(user.tenantId);
    if (!tenant) throw new AppError("Tenant not found.", 404);
    const plan = await getPlan(tenant.subscription?.plan || "free", "agency");
    return { scope: "agency", tenant, plan };
  }

  const dbUser = await User.findById(user._id || user.id);
  const plan = await getPlan(dbUser?.subscription?.plan || "free", "agent");
  return { scope: "agent", user: dbUser, plan };
};

const countActiveFeatured = async ({ scope, tenant, user }) => {
  const filter = {
    $or: [
      { featuredUntil: { $gt: new Date() } },
      { featuredApprovalStatus: "pending" },
    ],
  };
  if (scope === "agency") filter.tenantId = tenant._id;
  else filter.agentId = user._id;
  return Property.countDocuments(filter);
};

const ensureFeaturedAllowed = async (user) => {
  const context = await getSubscriptionContext(user);
  const limit = context.plan.maxFeaturedListings ?? context.plan.limits?.maxFeaturedListings ?? 0;
  if (limit <= 0) throw new AppError("Your current subscription does not allow featured properties.", 403);

  const activeFeatured = await countActiveFeatured(context);
  if (activeFeatured >= limit) {
    throw new AppError(`Your current plan allows ${limit} featured listing(s). Upgrade your plan to request more.`, 403);
  }
};

const notifySuperAdminsForApproval = async ({ property, submitter, featured = false }) => {
  const admins = await User.find({ role: "super_admin", status: "active" }).select("email firstName lastName").lean();
  await Promise.allSettled(admins.map((admin) => sendPropertyApprovalRequestEmail(admin.email, {
    propertyTitle: property.title,
    city: property.city,
    submitterName: `${submitter.firstName || ""} ${submitter.lastName || ""}`.trim() || submitter.email,
    submitterRole: submitter.role,
    featured,
  })));
};

const applyFeaturedRequest = (property, wantsFeatured) => {
  if (wantsFeatured) {
    property.featuredRequested = true;
    property.featuredApprovalStatus = "pending";
    property.featuredRequestedAt = new Date();
    property.featuredRejectionReason = undefined;
    property.featuredReviewNotes = undefined;
    property.featuredPreviousStatus = property.status;
    property.status = "pending_featured_approval";
    return;
  }

  if (wantsFeatured === false) {
    property.featuredRequested = false;
    property.featuredApprovalStatus = "none";
    property.featuredRequestedAt = undefined;
    property.featuredRejectionReason = undefined;
    property.featuredReviewNotes = undefined;
    property.featuredPreviousStatus = undefined;
    property.featuredUntil = undefined;
  }
};

const mapSearchCache = new Map();
const MAP_CACHE_TTL_MS = 20 * 1000;
const MAP_CACHE_MAX_KEYS = 250;

const getCacheKey = (query) => JSON.stringify(Object.keys(query).sort().reduce((acc, key) => {
  acc[key] = query[key];
  return acc;
}, {}));

const getCachedMapSearch = (key) => {
  const cached = mapSearchCache.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    mapSearchCache.delete(key);
    return null;
  }
  return cached.payload;
};

const setCachedMapSearch = (key, payload) => {
  if (mapSearchCache.size >= MAP_CACHE_MAX_KEYS) {
    mapSearchCache.delete(mapSearchCache.keys().next().value);
  }
  mapSearchCache.set(key, { payload, expiresAt: Date.now() + MAP_CACHE_TTL_MS });
};

const parseBounds = ({ west, south, east, north }) => {
  if (south >= north) throw new AppError("Invalid map bounds.", 400);
  if (west <= east) {
    return {
      $geoWithin: {
        $geometry: {
          type: "Polygon",
          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ]],
        },
      },
    };
  }
  return {
    $geoWithin: {
      $geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[west, south], [180, south], [180, north], [west, north], [west, south]]],
          [[[-180, south], [east, south], [east, north], [-180, north], [-180, south]]],
        ],
      },
    },
  };
};

const buildMapFilter = (query) => {
  const filter = {
    status: "approved",
    $or: [
      { "location.coordinates": parseBounds(query) },
      {
        "coordinates.lng": { $gte: query.west <= query.east ? query.west : -180, $lte: query.east },
        "coordinates.lat": { $gte: query.south, $lte: query.north },
      },
      ...(query.west > query.east ? [{
        "coordinates.lng": { $gte: query.west, $lte: 180 },
        "coordinates.lat": { $gte: query.south, $lte: query.north },
      }] : []),
    ],
  };

  const category = query.category || query.propertyType;
  const area = query.phase || query.area;

  if (query.city) filter.city = { $regex: query.city, $options: "i" };
  if (area) filter.area = { $regex: area, $options: "i" };
  if (category) filter.category = category;
  if (query.listingType) filter.listingType = query.listingType;
  if (query.beds !== undefined) filter.beds = { $gte: query.beds };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }
  if (query.minSize !== undefined || query.maxSize !== undefined) {
    filter.size = {};
    if (query.minSize !== undefined) filter.size.$gte = query.minSize;
    if (query.maxSize !== undefined) filter.size.$lte = query.maxSize;
  }

  return filter;
};

// ─── GET /api/properties — Public listing with filters + pagination ────────────

exports.getProperties = asyncHandler(async (req, res) => {
  const parsed = propertyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const msg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join(", ");
    throw new AppError(msg || "Invalid query parameters.", 400);
  }

  const {
    page, limit, city, area, category, listingType,
    minPrice, maxPrice, beds, minSize, maxSize,
    sort, featured,
  } = parsed.data;

  const filter = { status: "approved" };

  if (city) filter.city = { $regex: city, $options: "i" };
  if (area) filter.area = { $regex: area, $options: "i" };
  if (category) filter.category = category;
  if (listingType) filter.listingType = listingType;
  if (beds !== undefined) filter.beds = beds;
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }
  if (minSize !== undefined || maxSize !== undefined) {
    filter.size = {};
    if (minSize !== undefined) filter.size.$gte = minSize;
    if (maxSize !== undefined) filter.size.$lte = maxSize;
  }
  if (featured) filter.featuredUntil = { $gt: new Date() };

  const skip = (page - 1) * limit;
  const total = await Property.countDocuments(filter);

  const properties = await Property.find(filter)
    .sort(buildSortQuery(sort))
    .skip(skip)
    .limit(limit)
    .populate("agentId", "firstName lastName email phone")
    .populate("tenantId", "name slug logo")
    .lean();

  res.json({
    success: true,
    data: { properties },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// GET /api/properties/map-search — visible-bounds property search for map UI
exports.getMapSearchProperties = asyncHandler(async (req, res) => {
  const parsed = mapSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const msg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join(", ");
    throw new AppError(msg || "Invalid map search query.", 400);
  }

  const query = parsed.data;
  const cacheKey = getCacheKey(query);
  const cached = getCachedMapSearch(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    return res.json(cached);
  }

  const skip = (query.page - 1) * query.limit;
  const filter = buildMapFilter(query);

  const [result] = await Property.aggregate([
    { $match: filter },
    { $sort: { featuredUntil: -1, createdAt: -1 } },
    {
      $facet: {
        properties: [
          { $skip: skip },
          { $limit: query.limit },
          {
            $project: {
              _id: 1,
              slug: 1,
              title: 1,
              listingType: 1,
              category: 1,
              price: 1,
              currency: 1,
              address: 1,
              city: 1,
              area: 1,
              size: 1,
              beds: 1,
              baths: 1,
              images: { $slice: ["$images", 1] },
              location: 1,
              coordinates: 1,
              featuredUntil: 1,
              createdAt: 1,
            },
          },
        ],
        meta: [{ $count: "total" }],
      },
    },
  ]).allowDiskUse(true);

  const total = result?.meta?.[0]?.total || 0;
  const payload = {
    success: true,
    data: { properties: result?.properties || [] },
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };

  setCachedMapSearch(cacheKey, payload);
  res.set("Cache-Control", "public, max-age=20, stale-while-revalidate=60");
  res.set("X-Cache", "MISS");
  res.json(payload);
});

// ─── GET /api/properties/:slug — Public single property ───────────────────────

exports.getPropertyBySlug = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ slug: req.params.slug, status: "approved" })
    .populate("agentId", "firstName lastName email phone avatar city")
    .populate("tenantId", "name slug logo")
    .lean();

  if (!property) throw new AppError("Property not found.", 404);

  // Increment view count (fire and forget)
  Property.findByIdAndUpdate(property._id, { $inc: { views: 1 } }).exec();

  res.json({ success: true, data: { property } });
});

// ─── POST /api/properties — Agent creates a draft ─────────────────────────────

exports.createProperty = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId || req.tenantId || null;
  const shouldQueueForApproval = Boolean(tenantId);

  if (tenantId) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new AppError("Tenant not found.", 404);
    const plan = await getPlan(tenant.subscription?.plan || "free", "agency");
    const listingCount = await Property.countDocuments({
      tenantId,
      status: { $nin: ["archived", "closed"] },
    });
    const maxListings = tenant.settings?.maxListings ?? plan.maxListings ?? 3;
    if (listingCount >= maxListings) {
      throw new AppError(`Your current plan allows ${maxListings} active listing(s). Upgrade your plan to add more properties.`, 403);
    }
  } else {
    const { plan } = await getSubscriptionContext(req.user);
    const listingCount = await Property.countDocuments({
      agentId: req.userId,
      status: { $nin: ["archived", "closed"] },
    });
    if (listingCount >= (plan.maxListings || 3)) {
      throw new AppError(`Your current plan allows ${plan.maxListings || 3} active listing(s). Upgrade your plan to add more properties.`, 403);
    }
  }

  const { featured, ...propertyBody } = req.body;
  if (featured) await ensureFeaturedAllowed(req.user);

  const property = await Property.create({
    ...propertyBody,
    featuredRequested: Boolean(featured),
    featuredApprovalStatus: featured ? "pending" : "none",
    featuredRequestedAt: featured ? new Date() : undefined,
    agentId: req.userId,
    tenantId,
    status: featured ? "pending_featured_approval" : shouldQueueForApproval ? "submitted" : "draft",
  });

  if (shouldQueueForApproval || featured) {
    await notifySuperAdminsForApproval({ property, submitter: req.user, featured: Boolean(featured) });
  }

  res.status(201).json({
    success: true,
    message: shouldQueueForApproval
      ? "Property created and submitted for approval."
      : "Property created as draft.",
    data: { property },
  });
});

// ─── PUT /api/properties/:id — Agent updates own property (any status) ────────

exports.updateProperty = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, agentId: req.userId });
  if (!property) throw new AppError("Property not found.", 404);

  if (["sold", "rented", "closed"].includes(property.status)) {
    throw new AppError("Closed deals cannot be edited.", 400);
  }

  // If approved/submitted, editing resets status back to draft for re-review
  const needsReReview = ["approved", "submitted"].includes(property.status);

  const { featured, ...updates } = req.body;
  if (featured) await ensureFeaturedAllowed(req.user);
  Object.assign(property, updates);
  applyFeaturedRequest(property, featured);

  if (needsReReview) {
    property.status = "draft";
  }

  await property.save();

  res.json({
    success: true,
    message: needsReReview
      ? "Property updated and moved back to draft for re-review."
      : "Property updated.",
    data: { property },
  });
});

// ─── DELETE /api/properties/:id — Agent deletes own property (any status) ─────

exports.deleteProperty = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };

  if (req.user.role === "agency_admin") {
    filter.tenantId = req.user.tenantId;
  } else {
    filter.agentId = req.userId;
  }

  const property = await Property.findOneAndDelete(filter);
  if (!property) throw new AppError("Property not found.", 404);

  res.json({ success: true, message: "Property deleted." });
});

// ─── PATCH /api/properties/:id/submit — Agent submits draft for review ────────

exports.submitProperty = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, agentId: req.userId });
  if (!property) throw new AppError("Property not found.", 404);

  if (!["draft", "rejected"].includes(property.status)) {
    throw new AppError("Only draft or rejected properties can be submitted.", 400);
  }

  if (!property.images || property.images.length === 0) {
    throw new AppError("At least one image is required before submitting.", 400);
  }

  property.status = "submitted";
  if (!property.tenantId && req.user.tenantId) {
    property.tenantId = req.user.tenantId;
  }
  property.rejectionReason = undefined;
  await property.save();

  res.json({ success: true, message: "Property submitted for review.", data: { property } });
});

// ─── PATCH /api/properties/:id/review — Agency admin approves or rejects ──────

exports.reviewProperty = asyncHandler(async (req, res) => {
  const { action, rejectionReason } = req.body;

  const tenantAgentIds = await getTenantAgentIds(req.tenantId);
  const property = await Property.findOne({
    _id: req.params.id,
    $or: [
      { tenantId: req.tenantId },
      { tenantId: null, agentId: { $in: tenantAgentIds } },
      { tenantId: { $exists: false }, agentId: { $in: tenantAgentIds } },
    ],
  });
  if (!property) throw new AppError("Property not found.", 404);

  if (property.status !== "submitted") {
    throw new AppError("Only submitted properties can be reviewed.", 400);
  }

  if (action === "approve") {
    property.status = "approved";
    property.rejectionReason = undefined;
  } else {
    property.status = "rejected";
    property.rejectionReason = rejectionReason;
  }

  if (!property.tenantId) {
    property.tenantId = req.tenantId;
  }
  await property.save();

  res.json({
    success: true,
    message: `Property ${action === "approve" ? "approved" : "rejected"}.`,
    data: { property },
  });
});

// ─── PATCH /api/properties/admin/:id/review — Super admin approves or rejects ──

exports.adminReviewProperty = asyncHandler(async (req, res) => {
  const { action, rejectionReason } = req.body;

  const property = await Property.findById(req.params.id);
  if (!property) throw new AppError("Property not found.", 404);

  if (property.status !== "submitted") {
    throw new AppError("Only submitted properties can be reviewed.", 400);
  }

  if (action === "approve") {
    property.status = "approved";
    property.rejectionReason = undefined;
  } else {
    property.status = "rejected";
    property.rejectionReason = rejectionReason;
  }

  await property.save();
  await property.populate("agentId", "firstName lastName email");
  await property.populate("tenantId", "name slug");

  res.json({
    success: true,
    message: `Property ${action === "approve" ? "approved" : "rejected"}.`,
    data: { property },
  });
});

// ─── PATCH /api/properties/:id/deal — Agent marks a closed deal
exports.markPropertyDeal = asyncHandler(async (req, res) => {
  const { action } = req.body;

  const filter = { _id: req.params.id };
  if (req.user.role === "agency_admin") {
    filter.tenantId = req.user.tenantId;
  } else {
    filter.agentId = req.userId;
  }

  const property = await Property.findOne(filter);
  if (!property) throw new AppError("Property not found.", 404);

  if (action === "available") {
    if (property.status !== "rented") {
      throw new AppError("Only rented listings can be made available again.", 400);
    }
    property.status = "approved";
    property.dealClosedAt = undefined;
    await property.save();

    return res.json({
      success: true,
      message: "Property is available for rent again.",
      data: { property },
    });
  }

  if (["sold", "rented"].includes(action) && property.status !== "approved") {
    throw new AppError("Only approved listings can be marked as sold or rented.", 400);
  }
  if (action === "closed" && !["sold", "rented"].includes(property.status)) {
    throw new AppError("Only sold or rented listings can be closed.", 400);
  }

  property.status = action;
  property.dealClosedAt = new Date();
  await property.save();

  res.json({
    success: true,
    message: `Property marked as ${action}.`,
    data: { property },
  });
});

// GET /api/properties/admin/featured-approvals — Super admin reviews featured requests
exports.getFeaturedApprovals = asyncHandler(async (req, res) => {
  const { status = "pending", page = 1, limit = 50 } = req.query;
  const filter = {};

  if (status && status !== "all") {
    filter.featuredApprovalStatus = status;
  } else {
    filter.featuredRequested = true;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [properties, total] = await Promise.all([
    Property.find(filter)
      .sort({ featuredRequestedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("agentId", "firstName lastName email phone")
      .populate("tenantId", "name slug logo")
      .lean(),
    Property.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { properties },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// GET /api/properties/admin/approvals — Super admin reviews submitted tenant listings
exports.getAdminPropertyApprovals = asyncHandler(async (req, res) => {
  const { status = "submitted", page = 1, limit = 50 } = req.query;
  const filter = {};
  if (status && status !== "all") filter.status = status;
  else filter.status = { $in: ["submitted", "approved", "rejected"] };

  const skip = (Number(page) - 1) * Number(limit);
  const [properties, total] = await Promise.all([
    Property.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("agentId", "firstName lastName email phone")
      .populate("tenantId", "name slug logo")
      .lean(),
    Property.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { properties },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// PATCH /api/properties/admin/approvals/:id — Super admin approves/rejects tenant listing
exports.reviewAdminPropertyApproval = asyncHandler(async (req, res) => {
  const { action, rejectionReason } = req.body;
  const property = await Property.findById(req.params.id);
  if (!property) throw new AppError("Property not found.", 404);
  if (property.status !== "submitted") {
    throw new AppError("Only submitted properties can be reviewed.", 400);
  }

  if (action === "approve") {
    property.status = "approved";
    property.rejectionReason = undefined;
  } else {
    property.status = "rejected";
    property.rejectionReason = rejectionReason;
  }

  await property.save();
  res.json({
    success: true,
    message: `Property ${action === "approve" ? "approved" : "rejected"}.`,
    data: { property },
  });
});

// PATCH /api/properties/admin/featured-approvals/:id — Super admin approves/rejects featured boost
exports.reviewFeaturedApproval = asyncHandler(async (req, res) => {
  const { action, rejectionReason, notes } = req.body;
  const property = await Property.findById(req.params.id);
  if (!property) throw new AppError("Property not found.", 404);
  if (property.featuredApprovalStatus !== "pending") {
    throw new AppError("Only pending featured requests can be reviewed.", 400);
  }

  property.featuredRequested = true;
  property.featuredApprovalStatus = action === "approve" ? "approved" : "rejected";
  property.featuredReviewedAt = new Date();
  property.featuredReviewedBy = req.userId;
  property.featuredReviewNotes = notes;

  if (action === "approve") {
    property.featuredUntil = new Date(Date.now() + FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000);
    property.featuredRejectionReason = undefined;
    property.status = property.featuredPreviousStatus && property.featuredPreviousStatus !== "pending_featured_approval"
      ? property.featuredPreviousStatus
      : "approved";
  } else {
    property.featuredUntil = undefined;
    property.featuredRejectionReason = rejectionReason;
    property.status = property.featuredPreviousStatus && property.featuredPreviousStatus !== "pending_featured_approval"
      ? property.featuredPreviousStatus
      : "rejected";
  }

  await property.save();

  res.json({
    success: true,
    message: action === "approve" ? "Featured request approved." : "Featured request rejected.",
    data: { property },
  });
});

// ─── GET /api/properties/agency/summary — Tenant summary for agency admin
exports.getTenantPropertySummary = asyncHandler(async (req, res) => {
  const tenantId = new mongoose.Types.ObjectId(req.tenantId);

  const summary = await Property.aggregate([
    { $match: { tenantId } },
    {
      $group: {
        _id: null,
        activeProperties: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
        pendingApproval: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
        sold: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
        rented: { $sum: { $cond: [{ $eq: ["$status", "rented"] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $in: ["$status", ["sold", "rented", "closed"]] }, "$price", 0] } },
      }
    },
  ]);

  const totals = summary[0] || {
    activeProperties: 0,
    pendingApproval: 0,
    sold: 0,
    rented: 0,
    closed: 0,
    revenue: 0,
  };

  const closedDeals = totals.sold + totals.rented + totals.closed;
  const pipelineSize = totals.activeProperties + totals.pendingApproval + closedDeals;
  const performance = pipelineSize ? Math.round((closedDeals / pipelineSize) * 100) : 0;
  const commission = Number((totals.revenue * 0.03).toFixed(0));

  res.json({
    success: true,
    data: {
      ...totals,
      closedDeals,
      commission,
      performance,
    },
  });
});

// ─── GET /api/properties/agent/my — Agent's own listings ──────────────────────

exports.getMyProperties = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { agentId: req.userId };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Property.countDocuments(filter);

  const properties = await Property.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  res.json({
    success: true,
    data: { properties },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── GET /api/properties/agency/all — Agency admin sees all tenant listings ───

exports.getTenantProperties = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const tenantAgentIds = await getTenantAgentIds(req.tenantId);
  const filter = {
    $or: [
      { tenantId: req.tenantId },
      { tenantId: null, agentId: { $in: tenantAgentIds } },
      { tenantId: { $exists: false }, agentId: { $in: tenantAgentIds } },
    ],
  };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Property.countDocuments(filter);

  const properties = await Property.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("agentId", "firstName lastName email")
    .lean();

  res.json({
    success: true,
    data: { properties },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── GET /api/properties/admin/all — Super admin sees all properties ───────────

exports.getAllProperties = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, tenantId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Property.countDocuments(filter);

  const properties = await Property.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("agentId", "firstName lastName email")
    .populate("tenantId", "name slug")
    .lean();

  res.json({
    success: true,
    data: { properties },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

exports.adminDeleteProperty = asyncHandler(async (req, res) => {
  const property = await Property.findByIdAndDelete(req.params.id);
  if (!property) throw new AppError("Property not found.", 404);

  res.json({
    success: true,
    message: "Property deleted.",
    data: { id: req.params.id },
  });
});

exports.adminToggleFeatured = asyncHandler(async (req, res) => {
  const { featured = true, days = FEATURED_DURATION_DAYS } = req.body;
  const property = await Property.findById(req.params.id);
  if (!property) throw new AppError("Property not found.", 404);

  if (featured) {
    const durationDays = Math.max(1, Math.min(Number(days) || FEATURED_DURATION_DAYS, 365));
    property.featuredRequested = true;
    property.featuredApprovalStatus = "approved";
    property.featuredRequestedAt = property.featuredRequestedAt || new Date();
    property.featuredReviewedAt = new Date();
    property.featuredReviewedBy = req.userId;
    property.featuredReviewNotes = "Marked featured by super admin.";
    property.featuredRejectionReason = undefined;
    property.featuredUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    if (property.status === "pending_featured_approval") {
      property.status = property.featuredPreviousStatus && property.featuredPreviousStatus !== "pending_featured_approval"
        ? property.featuredPreviousStatus
        : "approved";
    }
  } else {
    property.featuredUntil = undefined;
    property.featuredReviewedAt = new Date();
    property.featuredReviewedBy = req.userId;
    if (property.featuredApprovalStatus === "pending" || property.status === "pending_featured_approval") {
      property.featuredApprovalStatus = "rejected";
      property.featuredRequested = true;
      property.featuredRejectionReason = "Rejected by super admin.";
      property.featuredReviewNotes = "Featured request rejected by super admin.";
      property.status = property.featuredPreviousStatus && property.featuredPreviousStatus !== "pending_featured_approval"
        ? property.featuredPreviousStatus
        : "rejected";
    } else {
      property.featuredApprovalStatus = "none";
      property.featuredRequested = false;
      property.featuredReviewNotes = "Featured removed by super admin.";
    }
  }

  await property.save();
  await property.populate("agentId", "firstName lastName email");
  await property.populate("tenantId", "name slug");

  res.json({
    success: true,
    message: featured ? "Property marked as featured." : "Featured removed.",
    data: { property },
  });
});



