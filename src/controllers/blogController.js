const Blog = require("../models/Blog");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

const publicProjection = "-createdBy -updatedBy -__v";

const normalizeBlogPayload = (body) => {
  const payload = {
    title: body.title,
    excerpt: body.excerpt,
    content: body.content,
    author: body.author,
    category: body.category,
    image: body.image,
    readTime: body.readTime,
    featured: Boolean(body.featured),
    status: body.status || "published",
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  return payload;
};

exports.getPublishedBlogs = asyncHandler(async (req, res) => {
  const { category, featured, limit = 100 } = req.query;
  const filter = { status: "published" };

  if (category && category !== "All") filter.category = category;
  if (featured === "true") filter.featured = true;

  const blogs = await Blog.find(filter)
    .select(publicProjection)
    .sort({ featured: -1, publishedAt: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 200))
    .lean();

  const categories = await Blog.distinct("category", { status: "published" });

  res.json({
    success: true,
    data: {
      blogs,
      categories: categories.sort((a, b) => a.localeCompare(b)),
    },
  });
});

exports.getPublishedBlogBySlug = asyncHandler(async (req, res) => {
  const blog = await Blog.findOne({ slug: req.params.slug, status: "published" })
    .select(publicProjection)
    .lean();

  if (!blog) throw new AppError("Blog not found.", 404);

  res.json({ success: true, data: { blog } });
});

exports.adminGetBlogs = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 100 } = req.query;
  const filter = {};
  if (status && status !== "all") filter.status = status;

  const pageNumber = Number(page) || 1;
  const limitNumber = Math.min(Number(limit) || 100, 200);
  const skip = (pageNumber - 1) * limitNumber;

  const [blogs, total] = await Promise.all([
    Blog.find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate("createdBy", "firstName lastName email")
      .lean(),
    Blog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { blogs },
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
  });
});

exports.adminCreateBlog = asyncHandler(async (req, res) => {
  const payload = normalizeBlogPayload(req.body);
  const blog = await Blog.create({
    ...payload,
    createdBy: req.userId,
    updatedBy: req.userId,
    publishedAt: payload.status === "published" ? new Date() : undefined,
  });

  res.status(201).json({
    success: true,
    message: "Blog created.",
    data: { blog },
  });
});

exports.adminUpdateBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) throw new AppError("Blog not found.", 404);

  const wasDraft = blog.status !== "published";
  Object.assign(blog, normalizeBlogPayload(req.body), { updatedBy: req.userId });

  if (wasDraft && blog.status === "published") {
    blog.publishedAt = new Date();
  }

  await blog.save();

  res.json({
    success: true,
    message: "Blog updated.",
    data: { blog },
  });
});

exports.adminDeleteBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findByIdAndDelete(req.params.id);
  if (!blog) throw new AppError("Blog not found.", 404);

  res.json({
    success: true,
    message: "Blog deleted.",
    data: { id: req.params.id },
  });
});
