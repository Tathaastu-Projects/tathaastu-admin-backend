const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: "Home" },
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: "India" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const storeCustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: "", trim: true, index: true },
    passwordHash: { type: String, required: true },
    addresses: { type: [addressSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

storeCustomerSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(String(plain || ""), this.passwordHash);
};

storeCustomerSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(String(plain || ""), 10);
};

module.exports =
  mongoose.models.StoreCustomer || mongoose.model("StoreCustomer", storeCustomerSchema);
