const Area        = require("../models/Area");
const asyncHandler = require("../utils/asyncHandler");
const AppError     = require("../utils/AppError");

// GET /api/areas — public list
exports.getAreas = asyncHandler(async (req, res) => {
  const areas = await Area.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json({ success: true, data: { areas } });
});

// GET /api/areas/:slug — public single
exports.getAreaBySlug = asyncHandler(async (req, res) => {
  const area = await Area.findOne({ slug: req.params.slug, isActive: true }).lean();
  if (!area) throw new AppError("Area not found.", 404);
  res.json({ success: true, data: { area } });
});

// GET /api/areas/admin/all — super admin all (including inactive)
exports.adminGetAreas = asyncHandler(async (req, res) => {
  const areas = await Area.find().sort({ name: 1 }).lean();
  res.json({ success: true, data: { areas } });
});

// POST /api/areas/admin — super admin create
exports.adminCreateArea = asyncHandler(async (req, res) => {
  const { name, city = "Lahore", description, images, stats, mapLat, mapLng, mapZoom, highlights, faqs, priceTables } = req.body;
  if (!name) throw new AppError("Area name is required.", 400);

  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const exists = await Area.findOne({ slug });
  const finalSlug = exists ? `${slug}-${Date.now()}` : slug;

  const area = await Area.create({ name, slug: finalSlug, city, description, images: images || [], stats: stats || {}, mapLat, mapLng, mapZoom, highlights: highlights || [], faqs: faqs || [], priceTables: priceTables || [] });
  res.status(201).json({ success: true, data: { area } });
});

// PATCH /api/areas/admin/:id — super admin update
exports.adminUpdateArea = asyncHandler(async (req, res) => {
  const area = await Area.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!area) throw new AppError("Area not found.", 404);
  res.json({ success: true, data: { area } });
});

// DELETE /api/areas/admin/:id — super admin delete (permanent)
exports.adminDeleteArea = asyncHandler(async (req, res) => {
  const area = await Area.findByIdAndDelete(req.params.id);
  if (!area) throw new AppError("Area not found.", 404);
  res.json({ success: true, message: "Area deleted." });
});
