const { cloudinary } = require("../config/cloudinary");
const asyncHandler  = require("../utils/asyncHandler");
const AppError      = require("../utils/AppError");

// POST /api/upload/images — upload up to 10 images
exports.uploadImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError("No files uploaded.", 400);
  }

  const images = req.files.map((file, i) => ({
    url:      file.path,
    publicId: file.filename,
    isCover:  i === 0,
  }));

  res.status(201).json({ success: true, data: { images } });
});

// DELETE /api/upload/images/:publicId — delete single image from Cloudinary
exports.deleteImage = asyncHandler(async (req, res) => {
  const { publicId } = req.params;
  if (!publicId) throw new AppError("publicId is required.", 400);

  await cloudinary.uploader.destroy(publicId);
  res.json({ success: true, message: "Image deleted." });
});
