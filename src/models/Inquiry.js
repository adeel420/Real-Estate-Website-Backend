const mongoose = require("mongoose");

const replySchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderRole: { type: String, enum: ["buyer", "agent", "agency_admin"], required: true },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

const inquirySchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["open", "agent_replied", "buyer_replied", "closed"], default: "open" },
    lastReplyByRole: { type: String, enum: ["buyer", "agent", "agency_admin"] },
    lastReplyAt: { type: Date },
    replies: [replySchema],
  },
  { timestamps: true }
);

inquirySchema.index({ agentId: 1, status: 1 });
inquirySchema.index({ buyerId: 1 });
inquirySchema.index({ propertyId: 1 });
inquirySchema.index({ tenantId: 1 });

module.exports = mongoose.model("Inquiry", inquirySchema);
