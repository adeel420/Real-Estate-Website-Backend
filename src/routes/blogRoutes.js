const express = require("express");
const router = express.Router();
const controller = require("../controllers/blogController");

router.get("/", controller.getPublishedBlogs);
router.get("/:slug", controller.getPublishedBlogBySlug);

module.exports = router;
