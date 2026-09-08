const express = require("express");
const router = express.Router();

// Mock data
let notifications = [
  {
    id: "N001",
    title: "New Course Available",
    message: "Check out our new Advanced Astrology course!",
    audience: "All Users",
    sentAt: "2025-01-15 10:30 AM",
    status: "sent",
  },
];

// Get all notifications
router.get("/", (req, res) => {
  res.json({ success: true, data: notifications });
});

// Create notification
router.post("/", (req, res) => {
  const newNotification = {
    id: `N${String(notifications.length + 1).padStart(3, "0")}`,
    sentAt: new Date().toLocaleString(),
    status: "sent",
    ...req.body,
  };
  notifications.push(newNotification);
  res.json({ success: true, data: newNotification });
});

module.exports = router;

