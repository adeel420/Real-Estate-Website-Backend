const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema(
  {
    agentId:  { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },

    // 0=Sun, 1=Mon ... 6=Sat
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    slots:     [{ type: String, trim: true }], // ["09:00 AM", "10:00 AM", ...]
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

availabilitySchema.index({ agentId: 1, dayOfWeek: 1 }, { unique: true });

module.exports = mongoose.model("Availability", availabilitySchema);
