const express = require("express");
const AdminUser = require("../models/AdminUser");
const { ensureDefaultAdmin } = require("../lib/ensureDefaultAdmin");
const {
  signAdminToken,
  requireAdminAuth,
  publicAdmin,
} = require("../middleware/adminAuth");

const router = express.Router();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// Ensure default admin exists when auth routes load / on first login
ensureDefaultAdmin().catch((err) => {
  console.error("Failed to seed default admin:", err.message);
});

router.post("/login", async (req, res) => {
  try {
    await ensureDefaultAdmin();

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const admin = await AdminUser.findOne({ email });
    if (!admin || admin.isActive === false) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const ok = await admin.comparePassword(password);
    if (!ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = signAdminToken(admin);
    res.json({
      success: true,
      data: {
        user: publicAdmin(admin),
        token,
      },
      // legacy shape used by older frontend
      user: publicAdmin(admin),
      token,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", requireAdminAuth, async (req, res) => {
  res.json({ success: true, data: publicAdmin(req.adminUser) });
});

/** List admin panel users (who can log in) */
router.get("/admins", requireAdminAuth, async (_req, res) => {
  try {
    const admins = await AdminUser.find({}).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      data: admins.map((row) => publicAdmin(row)),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load admin users" });
  }
});

/** Create a new admin panel user */
router.post("/admins", requireAdminAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "admin").trim() || "admin";

    if (!name || !email || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password (min 6 chars) are required",
      });
    }

    const exists = await AdminUser.findOne({ email });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "An admin with this email already exists",
      });
    }

    const passwordHash = await AdminUser.hashPassword(password);
    const admin = await AdminUser.create({
      name,
      email,
      passwordHash,
      role,
      isActive: true,
      isDefault: false,
    });

    res.status(201).json({
      success: true,
      data: publicAdmin(admin),
      message: "Admin user created",
    });
  } catch (error) {
    console.error("Create admin error:", error);
    res.status(500).json({ success: false, message: "Failed to create admin user" });
  }
});

router.patch("/admins/:id/toggle-status", requireAdminAuth, async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    if (admin.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Default admin account cannot be suspended",
      });
    }
    if (String(admin._id) === String(req.adminUser._id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot suspend your own account",
      });
    }
    admin.isActive = admin.isActive === false;
    await admin.save();
    res.json({ success: true, data: publicAdmin(admin) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update admin" });
  }
});

router.delete("/admins/:id", requireAdminAuth, async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    if (admin.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Default admin account cannot be deleted",
      });
    }
    if (String(admin._id) === String(req.adminUser._id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Admin user deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete admin" });
  }
});

module.exports = router;
