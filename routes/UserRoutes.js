const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const { sendVerificationCode, welcomeCode } = require("../middleware/email");
const { jwtAuthMiddleware, generateToken } = require("../middleware/jwt");
const router = express.Router();
const saltRounds = 10;

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, confirmPassword, role } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword || !role) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Valid roles check
    const validRoles = ["buyer", "agent", "agency_admin", "super_admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role selected" });
    }

    // Check if email already exists
    const existEmail = await User.findOne({ email });
    if (existEmail) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create new user
    const user = new User({ 
      firstName, 
      lastName, 
      email, 
      phone, 
      password, 
      role,
      verificationCode 
    });
    
    await user.save();

    // Send verification email
    await sendVerificationCode(email, verificationCode);

    res.status(201).json({
      success: true,
      message: "Account created successfully. Please check your email for verification code",
      data: {
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    if (!email || !password || !role) {
      return res.status(400).json({ error: "Email, password, and role are required" });
    }

    // Find user by email and role
    const user = await User.findOne({ email, role });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials or role" });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(400).json({ 
        error: "Please verify your email first",
        needsVerification: true,
        email: user.email
      });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = generateToken({ 
      id: user._id, 
      email: user.email, 
      role: user.role 
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role
        }
      }
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify Email Route
router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required" });
    }

    const user = await User.findOne({ 
      email, 
      verificationCode: code.toString() 
    });
    
    if (!user) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    // Mark user as verified
    user.isVerified = true;
    user.verificationCode = undefined;
    await user.save();

    // Send welcome email
    await welcomeCode(user.email, `${user.firstName} ${user.lastName}`);

    res.status(200).json({
      success: true,
      message: "Email verified successfully"
    });
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Resend Verification Code Route
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = verificationCode;
    await user.save();

    // Send verification email
    await sendVerificationCode(email, verificationCode);

    res.status(200).json({
      success: true,
      message: "Verification code sent successfully"
    });
  } catch (err) {
    console.error("Resend Verification Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Forgot Password Route
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = otpExpiry;
    await user.save({ validateBeforeSave: false });

    // Send OTP email
    await sendVerificationCode(email, otp);

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent to your email"
    });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset Password Route
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    if (!user.resetPasswordOTP || !user.resetPasswordExpires) {
      return res.status(400).json({ error: "Password reset not requested" });
    }

    if (user.resetPasswordOTP !== otp.toString()) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Update password
    user.password = newPassword; // Will be hashed by pre-save middleware
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful"
    });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get User Profile Route
router.get("/profile", jwtAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: "User ID is missing" });
    }

    const user = await User.findById(userId).select("-password -verificationCode -resetPasswordOTP");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error("Profile Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update Profile Route
router.put("/profile", jwtAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { firstName, lastName, phone } = req.body;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: "First name, last name, and phone are required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, phone, updatedAt: Date.now() },
      { new: true, select: "-password -verificationCode -resetPasswordOTP" }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user
    });
  } catch (err) {
    console.error("Update Profile Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Change Password Route
router.put("/change-password", jwtAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword; // Will be hashed by pre-save middleware
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (err) {
    console.error("Change Password Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Logout Route (Optional - for token blacklisting if needed)
router.post("/logout", jwtAuthMiddleware, async (req, res) => {
  try {
    // In a stateless JWT system, logout is typically handled on the frontend
    // by removing the token from storage. However, you can implement token
    // blacklisting here if needed.
    
    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (err) {
    console.error("Logout Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;