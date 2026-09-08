const express = require("express");
const router = express.Router();

// Mock data
let courses = [
  { id: "C001", title: "Advanced Astrology", category: "Astrology", price: 2999, discountPrice: 1999, enrollments: 245 },
  { id: "C002", title: "Numerology Mastery", category: "Numerology", price: 1999, discountPrice: 1499, enrollments: 189 },
  { id: "C003", title: "Tarot Reading Basics", category: "Tarot", price: 1499, enrollments: 312 },
];

// Get all courses
router.get("/", (req, res) => {
  const { category } = req.query;
  let filteredCourses = courses;
  if (category && category !== "All") {
    filteredCourses = courses.filter((c) => c.category === category);
  }
  res.json({ success: true, data: filteredCourses });
});

// Get single course
router.get("/:id", (req, res) => {
  const course = courses.find((c) => c.id === req.params.id);
  if (!course) {
    return res.status(404).json({ success: false, message: "Course not found" });
  }
  res.json({ success: true, data: course });
});

// Create course
router.post("/", (req, res) => {
  const newCourse = {
    id: `C${String(courses.length + 1).padStart(3, "0")}`,
    enrollments: 0,
    ...req.body,
  };
  courses.push(newCourse);
  res.json({ success: true, data: newCourse });
});

// Update course
router.put("/:id", (req, res) => {
  const index = courses.findIndex((c) => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Course not found" });
  }
  courses[index] = { ...courses[index], ...req.body };
  res.json({ success: true, data: courses[index] });
});

// Delete course
router.delete("/:id", (req, res) => {
  const index = courses.findIndex((c) => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Course not found" });
  }
  courses.splice(index, 1);
  res.json({ success: true, message: "Course deleted successfully" });
});

module.exports = router;

