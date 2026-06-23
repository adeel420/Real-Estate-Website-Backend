const crypto = require("crypto");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const RefreshToken = require("../models/RefreshToken");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { findPlan, legacyPlan } = require("../utils/subscriptionPlans");
const {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  revokeAllUserTokens,
  revokeToken,
  REFRESH_COOKIE_NAME,
} = require("../services/tokenService");
const {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPendingApprovalToUser,
  sendPendingApprovalToAdmin,
} = require("../services/emailService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getDeviceInfo = (req) => ({
  userAgent: req.headers["user-agent"] || "unknown",
  ip: req.ip || req.connection.remoteAddress,
  deviceId: req.headers["x-device-id"] || "unknown",
});

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const resolveSignupPlan = async (slug = "free", scope = "agent") => {
  const plan = await findPlan(slug, scope);
  if (plan) return plan;
  const fallback = legacyPlan(scope, slug);
  if (fallback?.active) return fallback;
  throw new AppError("Selected subscription plan is not available.", 400);
};

const getPlanLimits = (plan) => ({
  maxAgents: plan?.maxAgents ?? plan?.limits?.maxAgents ?? 0,
  maxListings: plan?.maxListings ?? plan?.limits?.maxListings ?? 0,
  maxFeaturedListings: plan?.maxFeaturedListings ?? plan?.limits?.maxFeaturedListings ?? 0,
});

const assignPlanToUser = async (user, plan) => {
  if (!user || !plan?.slug) return user;

  const limits = getPlanLimits(plan);
  const subscription = { plan: plan.slug, startDate: new Date(), status: "active" };
  const settings = {
    maxListings: limits.maxListings,
    maxFeaturedListings: limits.maxFeaturedListings,
  };

  if (typeof user.save === "function") {
    user.subscription = subscription;
    user.settings = settings;
    await user.save({ validateBeforeSave: false });
    return user;
  }

  const userId = user._id || user.id;
  if (userId) {
    await User.findByIdAndUpdate(userId, { subscription, settings }, { runValidators: true });
  }

  return user;
};

const assignPlanToTenant = (plan) => {
  const limits = getPlanLimits(plan);

  return {
    subscription: { plan: plan.slug, startDate: new Date() },
    settings: {
      maxAgents: limits.maxAgents,
      maxListings: limits.maxListings,
      maxFeaturedListings: limits.maxFeaturedListings,
    },
  };
};

// ─── Register Buyer ───────────────────────────────────────────────────────────

exports.registerBuyer = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;

  const exists = await User.findOne({ email });
  if (exists) throw new AppError("Email already registered.", 409);

  const verificationCode = generateOTP();
  const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    role: "buyer",
    verificationCode,
    verificationCodeExpires,
  });

  try {
    await sendVerificationEmail(email, verificationCode);
  } catch (err) {
    console.warn("Failed to send verification email:", err.message);
  }

  res.status(201).json({
    success: true,
    message: "Account created. Check your email for the verification code.",
    data: { email: user.email, role: user.role },
  });
});

// ─── Register Agent (independent agent without agency) ──────────────────────

exports.registerAgent = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, whatsappNumber, password } = req.body;

  const verificationCode = generateOTP();
  const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

  const exists = await User.findOne({ email }).select("+password +verificationCode +verificationCodeExpires");
  if (exists) {
    if (exists.isVerified || exists.role !== "agent") {
      throw new AppError("Email already registered.", 409);
    }

    exists.firstName = firstName;
    exists.lastName = lastName;
    exists.phone = phone;
    exists.whatsappNumber = whatsappNumber;
    exists.password = password;
    exists.status = "pending_verification";
    exists.subscription = exists.subscription?.plan
      ? exists.subscription
      : { plan: "free", status: "pending" };
    exists.verificationCode = verificationCode;
    exists.verificationCodeExpires = verificationCodeExpires;
    await exists.save();

    try {
      await sendVerificationEmail(email, verificationCode);
    } catch (err) {
      console.warn("Failed to send verification email:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: "Verification code sent. Check your email to continue.",
      data: { email: exists.email, role: exists.role, userId: exists._id, plan: exists.subscription?.plan || "free" },
    });
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    whatsappNumber,
    password,
    role: "agent",
    tenantId: null,
    subscription: { plan: "free", status: "pending" },
    verificationCode,
    verificationCodeExpires,
  });

  try {
    await sendVerificationEmail(email, verificationCode);
  } catch (err) {
    console.warn("Failed to send verification email:", err.message);
  }

  res.status(201).json({
    success: true,
    message: "Agent account created. Check your email for the verification code.",
    data: { email: user.email, role: user.role, userId: user._id, plan: "free" },
  });
});

// ─── Register Agency (creates Tenant + agency_admin user) ────────────────────

exports.registerAgency = asyncHandler(async (req, res) => {
  const {
    agencyName, agencyEmail, agencyPhone,
    adminFirstName, adminLastName, adminEmail, adminPhone, password, plan = "free",
  } = req.body;

  // Check both emails
  const [emailExists, agencyExists] = await Promise.all([
    User.findOne({ email: adminEmail }),
    Tenant.findOne({ email: agencyEmail }),
  ]);
  if (emailExists)  throw new AppError("Admin email already registered.", 409);
  if (agencyExists) throw new AppError("Agency email already registered.", 409);

  // Create slug from agency name
  const slug = agencyName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const slugExists = await Tenant.findOne({ slug });
  const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

  // Create tenant
  let selectedPlan;
  try {
    selectedPlan = await resolveSignupPlan(plan, "agency");
  } catch {
    selectedPlan = legacyPlan("agency", "free");
  }
  const tenantPlan = assignPlanToTenant(selectedPlan);
  const tenant = await Tenant.create({
    name: agencyName,
    slug: finalSlug,
    email: agencyEmail,
    phone: agencyPhone,
    status: "trial",
    ...tenantPlan,
  });

  // Create agency_admin user linked to tenant
  const verificationCode = generateOTP();
  const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);

  const adminUser = await User.create({
    firstName: adminFirstName,
    lastName: adminLastName,
    email: adminEmail,
    phone: adminPhone,
    password,
    role: "agency_admin",
    tenantId: tenant._id,
    verificationCode,
    verificationCodeExpires,
  });

  try {
    await sendVerificationEmail(adminEmail, verificationCode);
  } catch (err) {
    console.warn("Failed to send verification email:", err.message);
  }

  res.status(201).json({
    success: true,
    message: "Agency registered. Check your email for the verification code.",
    data: { email: adminEmail, agencyName: tenant.name, tenantId: tenant._id, adminUserId: adminUser._id, plan: selectedPlan.slug },
  });
});

// ─── Verify Email ─────────────────────────────────────────────────────────────

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const user = await User.findOne({ email }).select(
    "+verificationCode +verificationCodeExpires"
  );
  if (!user) throw new AppError("User not found.", 404);
  if (user.isVerified) throw new AppError("Email already verified.", 400);
  if (!user.verificationCode || user.verificationCode !== code) {
    throw new AppError("Invalid verification code.", 400);
  }
  if (user.verificationCodeExpires < new Date()) {
    throw new AppError("Verification code expired. Request a new one.", 400);
  }

  user.isVerified = true;
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;

  if (user.role === "agent" || user.role === "agency_admin") {
    user.status = "pending_payment";
    await user.save({ validateBeforeSave: false });
  } else {
    user.status = "active";
    await user.save({ validateBeforeSave: false });
    await sendWelcomeEmail(email, `${user.firstName} ${user.lastName}`);
  }

  res.json({ success: true, message: "Email verified successfully." });
});

// â”€â”€â”€ Complete Agent Invitation â€” verifies OTP, sets password, activates tenant agent â”€â”€â”€

exports.completeAgentInvitation = asyncHandler(async (req, res) => {
  const { email, code, password, firstName, lastName, phone, whatsappNumber } = req.body;

  const user = await User.findOne({ email, role: "agent" }).select(
    "+password +verificationCode +verificationCodeExpires"
  );
  if (!user) throw new AppError("Invitation not found.", 404);
  if (!user.tenantId) throw new AppError("This invitation is not linked to an agency.", 400);
  if (user.isVerified && user.status === "active") {
    throw new AppError("Invitation has already been completed. Please sign in.", 400);
  }
  if (!user.verificationCode || user.verificationCode !== code) {
    throw new AppError("Invalid verification code.", 400);
  }
  if (user.verificationCodeExpires < new Date()) {
    throw new AppError("Verification code expired. Ask your agency admin to resend the invitation.", 400);
  }

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (phone) user.phone = phone;
  if (whatsappNumber) user.whatsappNumber = whatsappNumber;
  user.password = password;
  user.isVerified = true;
  user.status = "active";
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;
  await user.save();

  await sendWelcomeEmail(email, `${user.firstName} ${user.lastName}`);

  res.json({
    success: true,
    message: "Invitation completed. You can now sign in.",
    data: { user: user.toPublicJSON() },
  });
});

// ─── Resend Verification ──────────────────────────────────────────────────────

exports.resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email }).select("+verificationCode +verificationCodeExpires");
  if (!user) throw new AppError("User not found.", 404);
  if (user.isVerified) throw new AppError("Email already verified.", 400);

  const verificationCode = generateOTP();
  user.verificationCode = verificationCode;
  user.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  await sendVerificationEmail(email, verificationCode);

  res.json({ success: true, message: "Verification code resent." });
});

// ─── Login ────────────────────────────────────────────────────────────────────

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user with password (select: false by default)
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new AppError("Invalid credentials.", 401);

  if (!user.isVerified) {
    throw new AppError("Please verify your email before logging in.", 401);
  }
  if (user.status === "suspended") throw new AppError("Account suspended.", 403);
  if (user.status === "inactive")  throw new AppError("Account inactive.", 403);
  if (user.status === "rejected") {
    throw new AppError("Your registration was rejected. Please contact support.", 403);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new AppError("Invalid credentials.", 401);

  // Generate tokens
  const tokenPayload = { id: user._id, role: user.role, tenantId: user.tenantId };
  const accessToken  = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken({ id: user._id });

  const deviceInfo = getDeviceInfo(req);
  await saveRefreshToken({
    token: refreshToken,
    userId: user._id,
    tenantId: user.tenantId,
    deviceInfo,
  });

  // Update last login
  user.lastLogin   = new Date();
  user.lastLoginIp = deviceInfo.ip;
  await user.save({ validateBeforeSave: false });

  // Set refresh token in HttpOnly cookie
  setRefreshCookie(res, refreshToken);

  res.json({
    success: true,
    message: "Login successful.",
    data: {
      accessToken,
      user: user.toPublicJSON(),
    },
  });
});

// ─── Refresh Token ────────────────────────────────────────────────────────────

exports.refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) throw new AppError("No refresh token provided.", 401);

  // Verify JWT signature
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw new AppError("Invalid or expired refresh token.", 401);
  }

  // Find in DB
  const storedToken = await RefreshToken.findOne({ token }).populate("user");
  if (!storedToken) {
    clearRefreshCookie(res);
    throw new AppError("Refresh token not found.", 401);
  }

  // Detect reuse of a revoked token — possible token theft
  if (storedToken.isRevoked) {
    // Revoke entire family (all sessions for this user)
    await revokeAllUserTokens(storedToken.user._id);
    clearRefreshCookie(res);
    throw new AppError("Token reuse detected. All sessions revoked.", 401);
  }

  if (storedToken.expiresAt < new Date()) {
    clearRefreshCookie(res);
    throw new AppError("Refresh token expired. Please log in again.", 401);
  }

  const user = storedToken.user;
  if (!user || user.status === "suspended") {
    clearRefreshCookie(res);
    throw new AppError("Account unavailable.", 403);
  }

  // Rotate: revoke old, issue new
  const deviceInfo = getDeviceInfo(req);
  const newRefreshToken = await rotateRefreshToken({
    oldToken: token,
    userId: user._id,
    tenantId: user.tenantId,
    deviceInfo,
  });

  const newAccessToken = generateAccessToken({
    id: user._id,
    role: user.role,
    tenantId: user.tenantId,
  });

  setRefreshCookie(res, newRefreshToken);

  res.json({
    success: true,
    data: {
      accessToken: newAccessToken,
      user: user.toPublicJSON(),
    },
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

exports.logout = asyncHandler(async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];

  if (token) {
    await revokeToken(token);
  }

  clearRefreshCookie(res);

  res.json({ success: true, message: "Logged out successfully." });
});

// ─── Logout All Devices ───────────────────────────────────────────────────────

exports.logoutAll = asyncHandler(async (req, res) => {
  await revokeAllUserTokens(req.userId);
  clearRefreshCookie(res);
  res.json({ success: true, message: "Logged out from all devices." });
});

// ─── Get Current User ─────────────────────────────────────────────────────────

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new AppError("User not found.", 404);

  res.json({ success: true, data: { user: user.toPublicJSON() } });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  // Always respond 200 to prevent email enumeration
  if (!user) {
    return res.json({
      success: true,
      message: "If that email exists, a reset OTP has been sent.",
    });
  }

  const otp = generateOTP();
  user.resetPasswordOTP = otp;
  user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await user.save({ validateBeforeSave: false });

  await sendPasswordResetEmail(email, otp);

  res.json({
    success: true,
    message: "If that email exists, a reset OTP has been sent.",
  });
});

// ─── Reset Password ───────────────────────────────────────────────────────────

exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const user = await User.findOne({ email }).select(
    "+resetPasswordOTP +resetPasswordExpires"
  );
  if (!user) throw new AppError("Invalid request.", 400);
  if (!user.resetPasswordOTP) throw new AppError("No reset request found.", 400);
  if (user.resetPasswordOTP !== otp) throw new AppError("Invalid OTP.", 400);
  if (user.resetPasswordExpires < new Date()) {
    throw new AppError("OTP has expired. Request a new one.", 400);
  }

  user.password = newPassword;
  user.resetPasswordOTP = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  // Revoke all refresh tokens (force re-login on all devices)
  await revokeAllUserTokens(user._id);
  clearRefreshCookie(res);

  res.json({ success: true, message: "Password reset successful. Please log in." });
});

// ─── Get Active Sessions ──────────────────────────────────────────────────────

exports.getSessions = asyncHandler(async (req, res) => {
  const sessions = await RefreshToken.find({
    user: req.userId,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  }).select("deviceInfo createdAt expiresAt");

  res.json({ success: true, data: { sessions } });
});

// ─── Update Profile ───────────────────────────────────────────────────────────

exports.updateMe = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const user = await User.findByIdAndUpdate(
    req.userId,
    { firstName, lastName, phone },
    { new: true, runValidators: true }
  );
  res.json({ success: true, data: { user: user.toPublicJSON() } });
});

// ─── Change Password ──────────────────────────────────────────────────────────

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new AppError("currentPassword and newPassword are required.", 400);
  }

  const user = await User.findById(req.userId).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new AppError("Current password is incorrect.", 401);

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password changed successfully." });
});
