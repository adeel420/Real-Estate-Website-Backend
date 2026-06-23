const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:     { type: String, required: true },
    password:  { type: String, required: true, minlength: 8, select: false },

    role: {
      type: String,
      enum: ["super_admin", "agency_admin", "agent", "buyer"],
      required: true,
    },

    // Multi-tenant: every user belongs to a tenant (null for super_admin)
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },

    // Account lifecycle
    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "pending_verification", "pending_payment", "pending_approval", "rejected"],
      default: "pending_verification",
    },

    // Email verification
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, select: false },
    verificationCodeExpires: { type: Date, select: false },

    // Password reset
    resetPasswordOTP: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // Agent profile fields (only for role: agent)
    bio:          { type: String, default: "" },
    city:         { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    specialties:  { type: [String], default: [] },
    languages:    { type: [String], default: [] },
    experience:   { type: Number, default: 0 },
    responseTime: { type: String, default: "< 24 hours" },
    avatar:       { type: String, default: "" },

    subscription: {
      plan: { type: String, default: "free" },
      startDate: { type: Date },
      endDate: { type: Date },
      status: { type: String, enum: ["active", "expired", "cancelled", "pending", "trialing", "suspended"], default: "active" },
    },
    settings: {
      maxListings: { type: Number, default: 3 },
      maxFeaturedListings: { type: Number, default: 0 },
    },

    // Payment proof & approval flow
    selectedPlan: { type: String, default: "" },
    transactionProof: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },

    // Session tracking
    lastLogin: { type: Date },
    lastLoginIp: { type: String },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Safe public profile (strip sensitive fields)
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    phone: this.phone,
    role: this.role,
    tenantId: this.tenantId,
    status: this.status,
    isVerified: this.isVerified,
    selectedPlan: this.selectedPlan,
    transactionProof: this.transactionProof,
    rejectionReason: this.rejectionReason,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
    // agent profile
    bio: this.bio,
    city: this.city,
    whatsappNumber: this.whatsappNumber,
    specialties: this.specialties,
    languages: this.languages,
    experience: this.experience,
    responseTime: this.responseTime,
    avatar: this.avatar,
  };
};

// Compound index: email lookup is already covered by unique:true above
userSchema.index({ tenantId: 1, role: 1 });

module.exports = mongoose.model("User", userSchema);
