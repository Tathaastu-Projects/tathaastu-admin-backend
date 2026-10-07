const jwt = require("jsonwebtoken");
const StoreCustomer = require("../models/StoreCustomer");

const STORE_JWT_SECRET = process.env.STORE_JWT_SECRET || process.env.JWT_SECRET || "tathaastu-store-secret";

function signCustomerToken(customer) {
  return jwt.sign(
    {
      sub: String(customer._id),
      email: customer.email,
      name: customer.name,
      typ: "store_customer",
    },
    STORE_JWT_SECRET,
    { expiresIn: process.env.STORE_JWT_EXPIRES || "30d" }
  );
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return String(req.headers["x-store-token"] || "").trim();
}

async function optionalStoreAuth(req, _res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      req.storeCustomer = null;
      return next();
    }
    const payload = jwt.verify(token, STORE_JWT_SECRET);
    if (payload?.typ !== "store_customer") {
      req.storeCustomer = null;
      return next();
    }
    const customer = await StoreCustomer.findById(payload.sub).select("-passwordHash");
    req.storeCustomer = customer && customer.isActive ? customer : null;
    return next();
  } catch (_err) {
    req.storeCustomer = null;
    return next();
  }
}

async function requireStoreAuth(req, res, next) {
  await optionalStoreAuth(req, res, async () => {
    if (!req.storeCustomer) {
      return res.status(401).json({ success: false, message: "Login required" });
    }
    return next();
  });
}

module.exports = {
  STORE_JWT_SECRET,
  signCustomerToken,
  optionalStoreAuth,
  requireStoreAuth,
  getBearerToken,
};
