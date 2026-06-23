const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String },
    logo: { type: String },
    status: {
      type: String,
      enum: ["active", "suspended", "trial", "cancelled"],
      default: "trial",
    },
    subscription: {
      plan: { type: String, default: "free" },
      startDate: { type: Date },
      endDate: { type: Date },
    },
    settings: {
      maxAgents: { type: Number, default: 1 },
      maxListings: { type: Number, default: 3 },
      maxFeaturedListings: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tenant", tenantSchema);
