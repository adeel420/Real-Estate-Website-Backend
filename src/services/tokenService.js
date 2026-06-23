const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");

// ─── Token Generation ────────────────────────────────────────────────────────

const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });

const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
  });

// ─── Persist Refresh Token to DB ─────────────────────────────────────────────

const saveRefreshToken = async ({ token, userId, tenantId, deviceInfo }) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  return RefreshToken.create({
    token,
    user: userId,
    tenant: tenantId || null,
    deviceInfo,
    expiresAt,
  });
};

// ─── Rotate Refresh Token ─────────────────────────────────────────────────────
// Revokes the old token, saves the new one, returns new token string

const rotateRefreshToken = async ({ oldToken, userId, tenantId, deviceInfo }) => {
  // Mark old token as revoked and record what replaced it
  const newTokenString = generateRefreshToken({ id: userId });

  await RefreshToken.findOneAndUpdate(
    { token: oldToken },
    { isRevoked: true, replacedByToken: newTokenString }
  );

  await saveRefreshToken({
    token: newTokenString,
    userId,
    tenantId,
    deviceInfo,
  });

  return newTokenString;
};

// ─── Verify Tokens ────────────────────────────────────────────────────────────

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = "refreshToken";

const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,                                      // not accessible via JS
    secure: process.env.NODE_ENV === "production",       // HTTPS only in prod
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,                   // 7 days in ms
    path: "/",
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
  });
};

// ─── Revoke All Sessions for a User ──────────────────────────────────────────

const revokeAllUserTokens = (userId) =>
  RefreshToken.updateMany({ user: userId, isRevoked: false }, { isRevoked: true });

// ─── Revoke Single Token ──────────────────────────────────────────────────────

const revokeToken = (token) =>
  RefreshToken.findOneAndUpdate({ token }, { isRevoked: true });

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  revokeAllUserTokens,
  revokeToken,
  REFRESH_COOKIE_NAME,
};
