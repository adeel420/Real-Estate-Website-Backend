const { z } = require("zod");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

// ─── Register Buyer ───────────────────────────────────────────────────────────
const registerBuyerSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  email: z.email("Invalid email address").toLowerCase(),
  phone: z.string().min(7, "Invalid phone number"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ─── Register Agent ───────────────────────────────────────────────────────────
const registerAgentSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  email: z.email("Invalid email address").toLowerCase(),
  phone: z.string().min(7, "Invalid phone number"),
  whatsappNumber: z.string().min(7, "Invalid WhatsApp number").trim(),
  password: passwordSchema,
  confirmPassword: z.string(),
  plan: z.string().min(1, "Plan is required").trim().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ─── Register Agency ──────────────────────────────────────────────────────────
const registerAgencySchema = z.object({
  agencyName: z.string().min(2, "Agency name is required").trim(),
  agencyEmail: z.email("Invalid agency email").toLowerCase(),
  agencyPhone: z.string().min(7, "Invalid phone number"),
  adminFirstName: z.string().min(1, "First name is required").trim(),
  adminLastName: z.string().min(1, "Last name is required").trim(),
  adminEmail: z.email("Invalid admin email").toLowerCase(),
  adminPhone: z.string().min(7, "Invalid phone number"),
  password: passwordSchema,
  confirmPassword: z.string(),
  plan: z.string().min(1, "Plan is required").trim().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ─── Login ────────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.email("Invalid email address").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address").toLowerCase(),
});

// ─── Reset Password ───────────────────────────────────────────────────────────
const resetPasswordSchema = z.object({
  email: z.email("Invalid email address").toLowerCase(),
  otp: z.string().length(6, "OTP must be 6 digits"),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const completeAgentInvitationSchema = z.object({
  email: z.email("Invalid email address").toLowerCase(),
  code: z.string().length(6, "Verification code must be 6 digits"),
  password: passwordSchema,
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required").trim().optional(),
  lastName: z.string().min(1, "Last name is required").trim().optional(),
  phone: z.string().min(7, "Invalid phone number").optional(),
  whatsappNumber: z.string().min(7, "Invalid WhatsApp number").optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// ─── Invite Agent ───────────────────────────────────────────────────────────
const inviteAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required").trim(),
  email: z.email("Invalid email address").toLowerCase(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
});

// ─── Verify Email ─────────────────────────────────────────────────────────────
const verifyEmailSchema = z.object({
  email: z.email("Invalid email address").toLowerCase(),
  code: z.string().length(6, "Verification code must be 6 digits"),
});

module.exports = {
  registerBuyerSchema,
  registerAgentSchema,
  registerAgencySchema,
  inviteAgentSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  completeAgentInvitationSchema,
  verifyEmailSchema,
};
