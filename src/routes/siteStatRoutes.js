const express = require("express");
const router = express.Router();
const SiteStat = require("../models/SiteStat");
const Property = require("../models/Property");
const User = require("../models/User");

router.get("/", async (req, res, next) => {
  try {
    let doc = await SiteStat.findOne();
    if (!doc) {
      doc = await SiteStat.create({
        stats: [
          { key: "propertiesListed", label: "Properties Listed", value: 1200, suffix: "+", order: 0 },
          { key: "salesVolume",      label: "Sales Volume",      value: 850,  suffix: "M", prefix: "$", order: 1 },
          { key: "expertAgents",     label: "Expert Agents",     value: 120,  suffix: "+", order: 2 },
          { key: "areasCovered",     label: "Areas Covered",     value: 40,   suffix: "+", order: 3 },
        ],
      });
    }

    const [totalListings, totalAgents] = await Promise.all([
      Property.countDocuments({ status: "approved" }),
      User.countDocuments({ role: "agent", status: "active" }),
    ]);

    const areasStat = doc.stats.find((s) => s.key === "areasCovered");

    res.json({
      success: true,
      data: {
        stats: doc.stats.sort((a, b) => a.order - b.order),
        hero: {
          totalListings,
          totalAgents,
          areasCovered: areasStat ? areasStat.value : 0,
        },
        bankDetails: doc.bankDetails || {},
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
