const { createModel } = require("../lib/fileDb");

module.exports = {
  StoreBanner: createModel("store_banners"),
  StoreBlogPost: createModel("store_blog_posts"),
  StorePage: createModel("store_pages"),
};
