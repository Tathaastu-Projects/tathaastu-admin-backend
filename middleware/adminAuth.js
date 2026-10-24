const jwt = require("jsonwebtoken");
const AdminUser = require("../models/AdminUser");

const ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || "tathaastu-admin-secret";

function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: String(admin._id),
      email: admin.email,
      role: admin.role || "admin",
      typ: "admin",
    },
    ADMIN_JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES || "7d" }
  );
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return String(req.headers["x-admin-token"] || "").trim();
}

function publicAdmin(admin) {
  return {
    id: String(admin._id),
    name: admin.name || "",
    email: admin.email || "",
    role: admin.role || "admin",
    isActive: admin.isActive !== false,
    isDefault: Boolean(admin.isDefault),
    createdAt: admin.createdAt || null,
  };
}

async function requireAdminAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Login required" });
    }
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    if (payload?.typ !== "admin") {
      return res.status(401).json({ success: false, message: "Invalid admin token" });
    }
    const admin = await AdminUser.findById(payload.sub);
    if (!admin || admin.isActive === false) {
      return res.status(401).json({ success: false, message: "Admin account inactive or missing" });
    }
    req.adminUser = admin;
    req.adminTokenPayload = payload;
    return next();
  } catch (_err) {
    return res.status(401).json({ success: false, message: "Login required" });
  }
}

module.exports = {
  ADMIN_JWT_SECRET,
  signAdminToken,
  requireAdminAuth,
  publicAdmin,
  getBearerToken,
};
