const bcrypt = require("bcryptjs");
const { createModel } = require("../lib/fileDb");

const AdminUser = createModel("admin_users", {
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

module.exports = AdminUser;
