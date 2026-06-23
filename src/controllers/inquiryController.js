const Inquiry = require("../models/Inquiry");
const Property = require("../models/Property");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const {
  sendInquiryNotificationToAgent,
  sendInquiryReplyToAgent,
  sendInquiryReplyToBuyer,
} = require("../services/emailService");

// POST /api/inquiries — buyer sends inquiry
exports.createInquiry = asyncHandler(async (req, res) => {
  const { propertyId, message } = req.body;
  if (!propertyId || !message) throw new AppError("propertyId and message are required.", 400);

  const property = await Property.findOne({ _id: propertyId, status: "approved" });
  if (!property) throw new AppError("Property not found.", 404);

  const inquiry = await Inquiry.create({
    propertyId,
    tenantId: property.tenantId,
    agentId: property.agentId,
    buyerId: req.userId,
    message,
    status: "open",
    lastReplyByRole: "buyer",
    lastReplyAt: new Date(),
  });

  // Increment property inquiry count
  Property.findByIdAndUpdate(propertyId, { $inc: { inquiries: 1 } }).exec();

  // Send email to agent (fire and forget)
  const [agent, buyer] = await Promise.all([
    User.findById(property.agentId).select("firstName lastName email phone"),
    User.findById(req.userId).select("firstName lastName email phone"),
  ]);
  if (agent && buyer) {
    Promise.allSettled([
      sendInquiryNotificationToAgent(agent.email, {
        agentName: `${agent.firstName} ${agent.lastName}`,
        buyerName: `${buyer.firstName} ${buyer.lastName}`,
        buyerEmail: buyer.email,
        buyerPhone: buyer.phone,
        propertyTitle: property.title,
        message,
      }),
    ]);
  }

  res.status(201).json({ success: true, data: { inquiry } });
});

// GET /api/inquiries/agent — agent sees all inquiries for their listings
exports.getAgentInquiries = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { agentId: req.userId };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Inquiry.countDocuments(filter);

  const inquiries = await Inquiry.find(filter)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("buyerId", "firstName lastName email phone")
    .populate("propertyId", "title slug images city")
    .lean();

  res.json({
    success: true,
    data: { inquiries },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// GET /api/inquiries/buyer — buyer sees their own inquiries
exports.getBuyerInquiries = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const total = await Inquiry.countDocuments({ buyerId: req.userId });

  const inquiries = await Inquiry.find({ buyerId: req.userId })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("agentId", "firstName lastName email phone")
    .populate("propertyId", "title slug images city")
    .lean();

  res.json({
    success: true,
    data: { inquiries },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// POST /api/inquiries/:id/reply — agent or buyer adds a reply
exports.replyToInquiry = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message) throw new AppError("message is required.", 400);

  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new AppError("Inquiry not found.", 404);

  // Only the agent or the buyer involved can reply
  const isAgent = inquiry.agentId.toString() === req.userId;
  const isBuyer = inquiry.buyerId.toString() === req.userId;
  if (!isAgent && !isBuyer) throw new AppError("Not authorized.", 403);
  if (inquiry.status === "closed") throw new AppError("Cannot reply to a closed inquiry.", 400);

  inquiry.replies.push({ senderId: req.userId, senderRole: req.user.role, message });
  inquiry.status = isAgent ? "agent_replied" : "buyer_replied";
  inquiry.lastReplyByRole = req.user.role;
  inquiry.lastReplyAt = new Date();
  await inquiry.save();

  if (isAgent) {
    const [agent, buyer, property] = await Promise.all([
      User.findById(inquiry.agentId).select("firstName lastName"),
      User.findById(inquiry.buyerId).select("firstName lastName email"),
      require("../models/Property").findById(inquiry.propertyId).select("title"),
    ]);
    if (agent && buyer && property) {
      Promise.allSettled([
        sendInquiryReplyToBuyer(buyer.email, {
          buyerName: `${buyer.firstName} ${buyer.lastName}`,
          agentName: `${agent.firstName} ${agent.lastName}`,
          propertyTitle: property.title,
          replyMessage: message,
        }),
      ]);
    }
  } else {
    const [agent, buyer, property] = await Promise.all([
      User.findById(inquiry.agentId).select("firstName lastName email"),
      User.findById(inquiry.buyerId).select("firstName lastName"),
      require("../models/Property").findById(inquiry.propertyId).select("title"),
    ]);
    if (agent && buyer && property) {
      Promise.allSettled([
        sendInquiryReplyToAgent(agent.email, {
          agentName: `${agent.firstName} ${agent.lastName}`,
          buyerName: `${buyer.firstName} ${buyer.lastName}`,
          propertyTitle: property.title,
          replyMessage: message,
        }),
      ]);
    }
  }

  const populatedInquiry = await Inquiry.findById(inquiry._id)
    .populate("buyerId", "firstName lastName email phone")
    .populate("agentId", "firstName lastName email phone")
    .populate("propertyId", "title slug images city")
    .lean();

  res.json({ success: true, data: { inquiry: populatedInquiry } });
});

// PATCH /api/inquiries/:id/close — agent closes inquiry
exports.closeInquiry = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findOne({ _id: req.params.id, agentId: req.userId });
  if (!inquiry) throw new AppError("Inquiry not found.", 404);

  inquiry.status = "closed";
  await inquiry.save();

  res.json({ success: true, message: "Inquiry closed." });
});
