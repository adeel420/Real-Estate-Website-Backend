const mongoose = require("mongoose");

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, required: true, trim: true, maxlength: 500 },
    content: { type: String, required: true, trim: true, maxlength: 20000 },
    author: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    image: { type: String, required: true, trim: true },
    readTime: { type: String, trim: true, maxlength: 40 },
    featured: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
    },
    publishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

blogSchema.pre("validate", async function (next) {
  if (!this.publishedAt && this.status === "published") {
    this.publishedAt = new Date();
  }

  if (this.isModified("status") && this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  if (this.isNew || this.isModified("title")) {
    const base = slugify(this.title) || "blog";
    let candidate = base;
    let count = 0;
    const BlogModel = mongoose.models.Blog || mongoose.model("Blog", blogSchema);

    while (await BlogModel.exists({ slug: candidate, _id: { $ne: this._id } })) {
      count += 1;
      candidate = `${base}-${count}`;
    }

    this.slug = candidate;
  }

  next();
});

blogSchema.index({ status: 1, featured: -1, publishedAt: -1 });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Blog", blogSchema);
