const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Property = require("../models/Property");
const Tenant = require("../models/Tenant");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const {
  sendAgentInvitationEmail,
  sendAgentDirectMessage,
} = require("../services/emailService");

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─── GET /api/agents — Public list of all agents ─────────────────────────────

exports.getAgents = asyncHandler(async (req, res) => {
  const { city, specialty, search, page = 1, limit = 20 } = req.query;

  const filter = { role: "agent", status: "active", isVerified: true };

  if (city) filter.city = { $regex: city, $options: "i" };
  if (specialty) filter.specialties = { $in: [new RegExp(specialty, "i")] };
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { city: { $regex: search, $options: "i" } },
      { specialties: { $in: [new RegExp(search, "i")] } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await User.countDocuments(filter);

  const agents = await User.find(filter)
    .select("firstName lastName email phone whatsappNumber city bio specialties languages experience responseTime avatar role createdAt")
    .sort({ experience: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  // Attach property counts
  const agentIds = agents.map((a) => a._id);
  const counts = await Property.aggregate([
    { $match: { agentId: { $in: agentIds } } },
    { $group: { _id: "$agentId", total: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c]));

  const result = agents.map((a) => {
    const c = countMap[a._id.toString()] || { total: 0, approved: 0 };
    return { ...a, totalListings: c.total, activeListings: c.approved };
  });

  res.json({
    success: true,
    data: { agents: result },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ─── POST /api/agents/invite — Agency admin invites a new agent ─────────────

exports.inviteAgent = asyncHandler(async (req, res) => {
  const { name, email, phone, whatsappNumber } = req.body;
  const tenantId = req.tenantId || req.user.tenantId;

  if (!tenantId) {
    throw new AppError("Agency tenant context is required.", 400);
  }

  const [firstName, ...rest] = name.trim().split(" ");
  const lastName = rest.join(" ").trim() || "Agent";

  const verificationCode = generateOTP();
  const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
  const tempPassword = crypto.randomBytes(12).toString("hex");

  const existingUser = await User.findOne({ email }).select("+verificationCode +verificationCodeExpires");
  if (existingUser) {
    const sameAgencyPendingAgent =
      existingUser.role === "agent" &&
      existingUser.tenantId?.toString() === tenantId.toString() &&
      !existingUser.isVerified &&
      existingUser.status === "pending_verification";

    if (!sameAgencyPendingAgent) {
      throw new AppError("Email already registered.", 409);
    }

    existingUser.firstName = firstName;
    existingUser.lastName = lastName;
    existingUser.phone = phone?.trim() || existingUser.phone || "0000000000";
    existingUser.whatsappNumber = whatsappNumber?.trim() || existingUser.whatsappNumber || "";
    existingUser.password = tempPassword;
    existingUser.verificationCode = verificationCode;
    existingUser.verificationCodeExpires = verificationCodeExpires;
    await existingUser.save();

    try {
      await sendAgentInvitationEmail(email, verificationCode, `${firstName} ${lastName}`.trim());
    } catch {
      throw new AppError("Could not send invitation email. Please check mail settings and try again.", 502);
    }

    return res.json({
      success: true,
      message: "Agent invitation resent.",
      data: { agent: existingUser.toPublicJSON() },
    });
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError("Tenant not found.", 404);
  const agentCount = await User.countDocuments({ tenantId, role: "agent" });
  if (agentCount >= (tenant.settings?.maxAgents || 1)) {
    throw new AppError(`Your current plan allows ${tenant.settings?.maxAgents || 1} agent(s). Upgrade your plan to invite more agents.`, 403);
  }

  const agent = await User.create({
    firstName,
    lastName,
    email,
    phone: phone?.trim() || "0000000000",
    whatsappNumber: whatsappNumber?.trim() || "",
    password: tempPassword,
    role: "agent",
    tenantId,
    status: "pending_verification",
    isVerified: false,
    verificationCode,
    verificationCodeExpires,
  });

  try {
    await sendAgentInvitationEmail(email, verificationCode, `${firstName} ${lastName}`.trim());
  } catch (error) {
    await User.findByIdAndDelete(agent._id);
    throw new AppError("Could not send invitation email. Please check mail settings and try again.", 502);
  }

  res.status(201).json({
    success: true,
    message: "Agent invitation sent.",
    data: { agent: agent.toPublicJSON() },
  });
});

// â”€â”€â”€ GET /api/agents/agency/list â€” Agency admin team list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.getAgencyAgents = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.user.tenantId;
  if (!tenantId) throw new AppError("Agency tenant context is required.", 400);

  const agents = await User.find({ tenantId, role: "agent" })
    .select("firstName lastName email phone whatsappNumber status isVerified createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const counts = await Property.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), agentId: { $in: agents.map((agent) => agent._id) } } },
    { $group: { _id: "$agentId", listings: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((item) => [item._id.toString(), item.listings]));

  res.json({
    success: true,
    data: {
      agents: agents.map((agent) => ({
        ...agent,
        listings: countMap[agent._id.toString()] || 0,
      })),
    },
  });
});

// â”€â”€â”€ PATCH /api/agents/agency/:id/status â€” Agency admin activates/deactivates agent â”€â”€â”€â”€

exports.updateAgencyAgentStatus = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.user.tenantId;
  const { status } = req.body;

  if (!["active", "inactive", "suspended"].includes(status)) {
    throw new AppError("Invalid agent status.", 400);
  }

  const agent = await User.findOneAndUpdate(
    { _id: req.params.id, tenantId, role: "agent" },
    { status },
    { new: true, runValidators: true }
  );
  if (!agent) throw new AppError("Agent not found.", 404);

  res.json({
    success: true,
    message: "Agent status updated.",
    data: { agent: agent.toPublicJSON() },
  });
});

// â”€â”€â”€ PATCH /api/agents/agency/:id â€” Agency admin edits agent details â”€â”€â”€â”€

exports.updateAgencyAgent = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.user.tenantId;
  const allowed = ["firstName", "lastName", "phone", "whatsappNumber", "city", "bio", "specialties", "languages", "experience", "responseTime", "avatar"];
  const updates = {};

  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  if (updates.firstName !== undefined && !String(updates.firstName).trim()) {
    throw new AppError("First name is required.", 400);
  }
  if (updates.lastName !== undefined && !String(updates.lastName).trim()) {
    throw new AppError("Last name is required.", 400);
  }

  const agent = await User.findOneAndUpdate(
    { _id: req.params.id, tenantId, role: "agent" },
    updates,
    { new: true, runValidators: true }
  );
  if (!agent) throw new AppError("Agent not found.", 404);

  res.json({
    success: true,
    message: "Agent details updated.",
    data: { agent: agent.toPublicJSON() },
  });
});

// ─── GET /api/agents/:id — Public agent profile ───────────────────────────────

exports.getAgentById = asyncHandler(async (req, res) => {
  const agent = await User.findOne({
    _id: req.params.id,
    role: "agent",
    status: "active",
    isVerified: true,
  })
    .select("firstName lastName email phone whatsappNumber city bio specialties languages experience responseTime avatar role createdAt")
    .lean();

  if (!agent) throw new AppError("Agent not found.", 404);

  // Approved listings
  const listings = await Property.find({ agentId: agent._id, status: "approved" })
    .select("title city area price listingType category images slug beds baths size views")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  // Stats
  const [totalDeals, activeListings] = await Promise.all([
    Property.countDocuments({ agentId: agent._id, status: { $in: ["approved", "archived"] } }),
    Property.countDocuments({ agentId: agent._id, status: "approved" }),
  ]);

  res.json({
    success: true,
    data: {
      agent: {
        ...agent,
        totalDeals,
        activeListings,
      },
      listings,
    },
  });
});

// ─── POST /api/agents/:id/message — Public direct message to agent ──────────

exports.sendDirectMessage = asyncHandler(async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !message) {
    throw new AppError("name and message are required.", 400);
  }
  if (!email && !phone) {
    throw new AppError("Please provide an email or phone number.", 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Please provide a valid email address.", 400);
  }

  const agent = await User.findOne({
    _id: req.params.id,
    role: "agent",
    status: "active",
    isVerified: true,
  }).select("firstName lastName email");

  if (!agent) throw new AppError("Agent not found.", 404);

  await sendAgentDirectMessage(agent.email, {
    agentName: `${agent.firstName} ${agent.lastName}`,
    senderName: name,
    senderEmail: email,
    senderPhone: phone,
    message,
  });

  res.status(201).json({ success: true, message: "Message sent to agent." });
});

// ─── PATCH /api/agents/profile — Agent updates own profile ───────────────────

exports.updateAgentProfile = asyncHandler(async (req, res) => {
  const allowed = ["bio", "city", "specialties", "languages", "experience", "responseTime", "avatar", "phone", "whatsappNumber"];
  const updates = {};
  allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });

  const user = await User.findByIdAndUpdate(req.userId, updates, { new: true, runValidators: true });
  if (!user) throw new AppError("User not found.", 404);

  res.json({ success: true, message: "Profile updated.", data: { user: user.toPublicJSON() } });
});
