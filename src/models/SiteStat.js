const mongoose = require("mongoose");

const statItemSchema = new mongoose.Schema({
  key:      { type: String, required: true },
  label:    { type: String, required: true },
  value:    { type: Number, required: true, default: 0 },
  prefix:   { type: String, default: "" },
  suffix:   { type: String, default: "+" },
  order:    { type: Number, default: 0 },
}, { _id: false });

const bankDetailSchema = new mongoose.Schema({
  bankName:        { type: String, default: "" },
  accountTitle:    { type: String, default: "" },
  accountNumber:   { type: String, default: "" },
  iban:            { type: String, default: "" },
  branchCode:      { type: String, default: "" },
}, { _id: false });

const siteStatSchema = new mongoose.Schema({
  stats: [statItemSchema],
  bankDetails: { type: bankDetailSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model("SiteStat", siteStatSchema);
