const express = require("express");
const router = express.Router();

// Mock data
let events = [
  {
    id: "E001",
    title: "Full Moon Meditation",
    description: "Join us for a guided meditation session",
    date: "2025-01-20",
    time: "7:00 PM",
    link: "https://meet.google.com/abc-xyz",
  },
];

// Get all events
router.get("/", (req, res) => {
  res.json({ success: true, data: events });
});

// Create event
router.post("/", (req, res) => {
  const newEvent = {
    id: `E${String(events.length + 1).padStart(3, "0")}`,
    ...req.body,
  };
  events.push(newEvent);
  res.json({ success: true, data: newEvent });
});

// Update event
router.put("/:id", (req, res) => {
  const index = events.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }
  events[index] = { ...events[index], ...req.body };
  res.json({ success: true, data: events[index] });
});

// Delete event
router.delete("/:id", (req, res) => {
  const index = events.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }
  events.splice(index, 1);
  res.json({ success: true, message: "Event deleted successfully" });
});

module.exports = router;

