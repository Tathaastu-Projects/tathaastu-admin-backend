const { createModel } = require("../lib/fileDb");

const Product = createModel("products", {
  virtuals: {
    discountPercent() {
      if (!this.mrp || this.mrp <= 0 || this.salePrice >= this.mrp) return 0;
      return Math.round(((this.mrp - this.salePrice) / this.mrp) * 100);
    },
    totalStock() {
      if (this.variants?.length) {
        return this.variants.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      }
      return Number(this.quantity) || 0;
    },
    isLowStock() {
      const stock = this.variants?.length
        ? this.variants.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        : Number(this.quantity) || 0;
      return stock <= (this.lowStockThreshold ?? 5);
    },
  },
});

module.exports = Product;
