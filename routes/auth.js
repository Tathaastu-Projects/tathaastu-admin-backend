const express = require("express");
const router = express.Router();

// Mock login - bypass authentication
router.post("/login", (req, res) => {
  res.json({
    success: true,
    user: {
      id: "1",
      name: "Admin User",
      email: req.body.email || "admin@tathasstu.com",
      role: "admin",
    },
    token: "mock-jwt-token",
  });
});

router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

module.exports = router;

