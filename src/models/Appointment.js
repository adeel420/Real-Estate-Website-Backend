const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: "Tenant",   default: null },
    agentId:    { type: mongoose.Schema.Types.ObjectId, ref: "User",     required: true },
    buyerId:    { type: mongoose.Schema.Types.ObjectId, ref: "User",     required: true },

    date:      { type: Date,   required: true },
    timeSlot:  { type: String, required: true }, // e.g. "10:00 AM"
    message:   { type: String, trim: true, maxlength: 500 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "rescheduled", "completed", "cancelled"],
      default: "pending",
    },

    // Agent sets new date/time when rescheduling
    rescheduledDate:     { type: Date },
    rescheduledTimeSlot: { type: String },
    rescheduleNote:      { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

appointmentSchema.index({ agentId: 1, status: 1 });
appointmentSchema.index({ buyerId: 1 });
appointmentSchema.index({ propertyId: 1 });
appointmentSchema.index({ tenantId: 1 });
appointmentSchema.index({ date: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
