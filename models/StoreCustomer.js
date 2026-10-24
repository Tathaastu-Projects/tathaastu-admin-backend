const bcrypt = require("bcryptjs");
const { createModel } = require("../lib/fileDb");

const StoreCustomer = createModel("store_customers", {
  methods: {
    comparePassword(plain) {
      return bcrypt.compare(String(plain || ""), this.passwordHash);
    },
  },
  statics: {
    async hashPassword(plain) {
      return bcrypt.hash(String(plain || ""), 10);
    },
  },
});

module.exports = StoreCustomer;
