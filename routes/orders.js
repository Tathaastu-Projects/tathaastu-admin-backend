const express = require("express");
const router = express.Router();

// Mock data
let orders = [
  { id: "ORD001", user: "John Doe", course: "Advanced Astrology", amount: 2999, status: "completed", date: "2025-01-15" },
  { id: "ORD002", user: "Jane Smith", course: "Numerology Mastery", amount: 1999, status: "pending", date: "2025-01-14" },
  { id: "ORD003", user: "Mike Johnson", course: "Tarot Reading Basics", amount: 1499, status: "completed", date: "2025-01-13" },
];

// Get all orders
router.get("/", (req, res) => {
  const { status } = req.query;
  let filteredOrders = orders;
  if (status && status !== "all") {
    filteredOrders = orders.filter((o) => o.status === status);
  }
  res.json({ success: true, data: filteredOrders });
});

// Get single order
router.get("/:id", (req, res) => {
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  res.json({ success: true, data: order });
});

module.exports = router;

