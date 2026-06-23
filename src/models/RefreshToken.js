const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    // Device/session fingerprint
    deviceInfo: {
      userAgent: { type: String },
      ip: { type: String },
      deviceId: { type: String }, // client-generated unique device ID
    },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
    replacedByToken: { type: String, default: null }, // token rotation chain
  },
  { timestamps: true }
);

// Auto-delete expired tokens via TTL index
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for fast lookup by user (list all sessions)
refreshTokenSchema.index({ user: 1, isRevoked: 1 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
