const express = require("express");
const router = express.Router();

// Mock data
let users = [
  { id: "U001", name: "John Doe", email: "john@example.com", mobile: "+1234567890", status: "active", registeredDate: "2024-12-01" },
  { id: "U002", name: "Jane Smith", email: "jane@example.com", mobile: "+1234567891", status: "active", registeredDate: "2024-11-15" },
  { id: "U003", name: "Mike Johnson", email: "mike@example.com", mobile: "+1234567892", status: "suspended", registeredDate: "2024-10-20" },
];

// Get all users
router.get("/", (req, res) => {
  const { search } = req.query;
  let filteredUsers = users;
  if (search) {
    filteredUsers = users.filter(
      (u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );
  }
  res.json({ success: true, data: filteredUsers });
});

// Get single user
router.get("/:id", (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.json({ success: true, data: user });
});

// Update user
router.put("/:id", (req, res) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  users[index] = { ...users[index], ...req.body };
  res.json({ success: true, data: users[index] });
});

// Toggle user status
router.patch("/:id/toggle-status", (req, res) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  users[index].status = users[index].status === "active" ? "suspended" : "active";
  res.json({ success: true, data: users[index] });
});

module.exports = router;

