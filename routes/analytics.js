const express = require("express");
const router = express.Router();

// Mock analytics data
router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      userGrowth: [
        { month: "Jan", users: 1200 },
        { month: "Feb", users: 1900 },
        { month: "Mar", users: 3000 },
        { month: "Apr", users: 4500 },
        { month: "May", users: 6000 },
        { month: "Jun", users: 8500 },
      ],
      revenue: [
        { month: "Jan", revenue: 45000 },
        { month: "Feb", revenue: 52000 },
        { month: "Mar", revenue: 68000 },
        { month: "Apr", revenue: 75000 },
        { month: "May", revenue: 92000 },
        { month: "Jun", revenue: 110000 },
      ],
      courseSales: [
        { name: "Advanced Astrology", sales: 245 },
        { name: "Numerology Mastery", sales: 189 },
        { name: "Tarot Reading", sales: 312 },
        { name: "Palmistry Guide", sales: 156 },
      ],
      queryCategories: [
        { name: "Astrology", value: 35 },
        { name: "Numerology", value: 25 },
        { name: "Tarot", value: 20 },
        { name: "Palmistry", value: 15 },
        { name: "Vastu", value: 5 },
      ],
    },
  });
});

module.exports = router;

