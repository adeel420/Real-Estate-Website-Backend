const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────────────────────
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Core Info ──────────────────────────────────────────────────────────────
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 3000 },

    // ── Listing Type ───────────────────────────────────────────────────────────
    listingType: {
      type: String,
      enum: ["for_sale", "for_rent"],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "apartment",
        "villa",
        "commercial",
        "residential",
        "plot",
        "house",
        "penthouse",
      ],
      required: true,
    },

    // ── Pricing ────────────────────────────────────────────────────────────────
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "PKR" },

    // ── Location ───────────────────────────────────────────────────────────────
    address: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    area: { type: String, trim: true }, // neighbourhood / sector
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        validate: {
          validator(value) {
            return (
              !value.length ||
              (value.length === 2 && value.every(Number.isFinite))
            );
          },
          message: "Location coordinates must be [lng, lat]",
        },
        default: undefined,
      },
    },

    // ── Specs ──────────────────────────────────────────────────────────────────
    size: { type: Number }, // sq ft
    beds: { type: Number, min: 0 },
    baths: { type: Number, min: 0 },
    kitchens: { type: Number, min: 0, default: 0 },
    attachedBathrooms: { type: Number, min: 0, default: 0 },
    parking: { type: Number, min: 0, default: 0 },
    floors: { type: String, trim: true },
    yearBuilt: { type: Number },

    // ── Media ──────────────────────────────────────────────────────────────────
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String }, // Cloudinary public_id for deletion
        isCover: { type: Boolean, default: false },
      },
    ],

    // ── Amenities ──────────────────────────────────────────────────────────────
    amenities: [{ type: String, trim: true }],

    // ── Lifecycle ──────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "draft",
        "submitted",
        "pending_featured_approval",
        "approved",
        "rejected",
        "archived",
        "sold",
        "rented",
        "closed",
      ],
      default: "draft",
    },
    rejectionReason: { type: String },
    featuredUntil: { type: Date }, // paid featured boost expiry
    featuredRequested: { type: Boolean, default: false },
    featuredApprovalStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    featuredRejectionReason: { type: String },
    featuredReviewNotes: { type: String },
    featuredPreviousStatus: { type: String },
    featuredRequestedAt: { type: Date },
    featuredReviewedAt: { type: Date },
    featuredReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    archivedAt: { type: Date },
    dealClosedAt: { type: Date },

    // ── Analytics ──────────────────────────────────────────────────────────────
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ── Slug generation ────────────────────────────────────────────────────────────
propertySchema.pre("validate", async function (next) {
  if (
    this.coordinates?.lat !== undefined &&
    this.coordinates?.lng !== undefined
  ) {
    this.location = {
      type: "Point",
      coordinates: [Number(this.coordinates.lng), Number(this.coordinates.lat)],
    };
  } else if (this.location?.coordinates?.length === 2) {
    this.coordinates = {
      lng: this.location.coordinates[0],
      lat: this.location.coordinates[1],
    };
  }

  if (this.isNew || this.isModified("title")) {
    const base = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const citySlug = (this.city || "property")
      .toLowerCase()
      .replace(/\s+/g, "-");
    let slug = `${base}-${citySlug}`;
    let count = 0;
    let candidate = slug;

    const PropertyModel =
      mongoose.models.Property || mongoose.model("Property", propertySchema);
    while (
      await PropertyModel.exists({ slug: candidate, _id: { $ne: this._id } })
    ) {
      count++;
      candidate = `${slug}-${count}`;
    }
    this.slug = candidate;
  }
  next();
});

// ── Auto-archive after 90 days ─────────────────────────────────────────────────
propertySchema.methods.isExpired = function () {
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  return (
    this.status === "approved" &&
    Date.now() - this.updatedAt.getTime() > ninetyDays
  );
};

// ── Indexes ────────────────────────────────────────────────────────────────────
// slug unique:true already creates an index, no need to add it again
propertySchema.index({ tenantId: 1, status: 1 });
propertySchema.index({ agentId: 1, status: 1 });
propertySchema.index({ featuredApprovalStatus: 1, featuredRequestedAt: -1 });
propertySchema.index({ city: 1, status: 1 });
propertySchema.index({ area: 1, status: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ listingType: 1, category: 1, status: 1 });
propertySchema.index({
  status: 1,
  city: 1,
  area: 1,
  price: 1,
  category: 1,
  beds: 1,
  size: 1,
});
propertySchema.index(
  { location: "2dsphere" },
  { partialFilterExpression: { "location.coordinates": { $exists: true } } },
);
propertySchema.index({ "coordinates.lng": 1, "coordinates.lat": 1, status: 1 });
propertySchema.index({ createdAt: -1 });

module.exports = mongoose.model("Property", propertySchema);
