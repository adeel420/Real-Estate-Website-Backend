const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const {
  sendPendingApprovalToUser,
  sendPendingApprovalToAdmin,
} = require("../services/emailService");

exports.uploadPaymentProof = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Please upload a transaction proof image.", 400);

  const user = await User.findById(req.userId);
  if (!user) throw new AppError("User not found.", 404);

  if (user.status !== "pending_payment" && user.status !== "pending_verification" && user.status !== "pending_approval") {
    throw new AppError("Payment proof can only be uploaded when account is pending payment.", 400);
  }

  user.transactionProof = req.file.path;
  user.status = "pending_approval";
  await user.save({ validateBeforeSave: false });

  try {
    await sendPendingApprovalToUser(user.email, `${user.firstName} ${user.lastName}`);
  } catch (emailErr) {
    console.error("Failed to send pending approval email to user:", emailErr.message);
  }
  try {
    await sendPendingApprovalToAdmin(user);
  } catch (emailErr) {
    console.error("Failed to send pending approval email to admin:", emailErr.message);
  }

  res.json({
    success: true,
    message: "Payment proof uploaded. Your account will be reviewed within 24 hours.",
    data: { user: user.toPublicJSON() },
  });
});
