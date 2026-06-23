const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["agent", "agency"],
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    price: { type: Number, default: 0, min: 0 },
    billing: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    limits: {
      maxAgents: { type: Number, default: 0 },
      maxListings: { type: Number, default: 0 },
      maxFeaturedListings: { type: Number, default: 0 },
      maxInquiries: { type: Number, default: 0 },
      storageMb: { type: Number, default: 0 },
    },
    features: [{ type: String, trim: true }],
    flags: {
      analytics: { type: Boolean, default: false },
      leadManagement: { type: Boolean, default: false },
      aiFeatures: { type: Boolean, default: false },
      branchManagement: { type: Boolean, default: false },
      featuredListings: { type: Boolean, default: false },
    },
    popular: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ scope: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
