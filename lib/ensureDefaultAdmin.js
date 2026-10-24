const AdminUser = require("../models/AdminUser");

const DEFAULT_ADMIN_EMAIL = "admin@abhimantritstore.com";
const DEFAULT_ADMIN_PASSWORD = "Admin@123";
const DEFAULT_ADMIN_NAME = "Abhimantrit Admin";

/**
 * Ensures the default admin login always exists.
 * Email matching is case-insensitive (stored lowercase).
 */
async function ensureDefaultAdmin() {
  const email = DEFAULT_ADMIN_EMAIL;
  const existing = await AdminUser.findOne({ email });
  if (existing) {
    if (existing.isActive === false) {
      existing.isActive = true;
      await existing.save();
    }
    return existing;
  }

  const passwordHash = await AdminUser.hashPassword(DEFAULT_ADMIN_PASSWORD);
  const admin = await AdminUser.create({
    name: DEFAULT_ADMIN_NAME,
    email,
    passwordHash,
    role: "admin",
    isActive: true,
    isDefault: true,
  });
  console.log(`✅ Default admin ready: ${email}`);
  return admin;
}

module.exports = {
  ensureDefaultAdmin,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_NAME,
};
