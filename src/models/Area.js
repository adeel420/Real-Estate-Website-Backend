const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    city:        { type: String, required: true, trim: true, default: "Lahore" },
    description: { type: String, trim: true, maxlength: 500000 },
    images:      [{ url: String, publicId: String, isCover: { type: Boolean, default: false } }],

    // Stats manually set by super admin
    stats: {
      houses:      { type: Number, default: 0 },
      apartments:  { type: Number, default: 0 },
      commercials: { type: Number, default: 0 },
      plots:       { type: Number, default: 0 },
      villas:      { type: Number, default: 0 },
      parks:       { type: Number, default: 0 },
      schools:     { type: Number, default: 0 },
      hospitals:   { type: Number, default: 0 },
      mosques:     { type: Number, default: 0 },
      restaurants: { type: Number, default: 0 },
      banks:       { type: Number, default: 0 },
      malls:       { type: Number, default: 0 },
    },

    // Map center coordinates
    mapLat: { type: Number },
    mapLng: { type: Number },
    mapZoom: { type: Number, default: 14 },

    highlights: [{ type: String, trim: true }],
    isActive:   { type: Boolean, default: true },

    faqs: [{
      question: { type: String, trim: true },
      answer:   { type: String, trim: true },
    }],

    priceTables: [{
      title:       { type: String, trim: true },
      description: { type: String, trim: true },
      rows: [{
        areaSize:    { type: String, trim: true },
        priceRange:  { type: String, trim: true },
        link:        { type: String, trim: true },
        category:    { type: String, trim: true },   // e.g. "residential", "commercial"
        listingType: { type: String, trim: true },   // e.g. "for_sale", "for_rent"
      }],
    }],
  },
  { timestamps: true }
);

areaSchema.index({ city: 1, isActive: 1 });

module.exports = mongoose.model("Area", areaSchema);
