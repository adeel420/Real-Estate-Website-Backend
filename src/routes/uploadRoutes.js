const express     = require("express");
const router      = express.Router();
const multer      = require("multer");
const controller  = require("../controllers/uploadController");
const paymentProofController = require("../controllers/paymentProofController");
const protect     = require("../middleware/protect");
const requireRole = require("../middleware/requireRole");
const { upload, uploadPaymentProof } = require("../config/cloudinary");

// Multer error middleware — catches file size / type errors before they hit errorHandler
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File too large. Max size is 5MB per image." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ success: false, message: "Too many files. Max 10 images allowed." });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message || "Upload failed." });
  }
  next();
};

router.post(
  "/images",
  protect,
  requireRole("agent", "agency_admin", "super_admin"),
  (req, res, next) => {
    upload.array("images", 10)(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  controller.uploadImages
);

router.post(
  "/payment-proof",
  protect,
  (req, res, next) => {
    uploadPaymentProof.single("proof")(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  paymentProofController.uploadPaymentProof
);

router.delete(
  "/images/:publicId",
  protect,
  requireRole("agent", "agency_admin", "super_admin"),
  controller.deleteImage
);

module.exports = router;
