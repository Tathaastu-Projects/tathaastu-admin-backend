const express = require("express");
const { buildSolutionPPT } = require("../lib/pptTemplate");
const router = express.Router();

// Mock data
let queries = [
  { id: "Q001", clientName: "John Doe", queryType: "Astrology", date: "2025-01-15", status: "pending", assignedTo: "Astrologer A", clientEmail: "john@example.com" },
  { id: "Q002", clientName: "Jane Smith", queryType: "Numerology", date: "2025-01-15", status: "in-progress", assignedTo: "Numerologist B", clientEmail: "jane@example.com", solution: { status: "draft", createdAt: "2025-01-15", updatedAt: "2025-01-15" } },
  { id: "Q003", clientName: "Mike Johnson", queryType: "Tarot", date: "2025-01-14", status: "completed", assignedTo: "Tarot Reader C", clientEmail: "mike@example.com", solution: { status: "completed", createdAt: "2025-01-14", updatedAt: "2025-01-14" } },
];

// Store for PPT solutions
let solutions = {};


// Get all queries
router.get("/", (req, res) => {
  res.json({ success: true, data: queries });
});

// Get completed solutions for dashboard download list
router.get("/solutions/completed", (req, res) => {
  const completed = queries
    .filter((q) => q.solution?.status === "completed" && solutions[q.id])
    .map((q) => ({
      id: q.id,
      clientName: q.clientName,
      clientEmail: q.clientEmail || "",
      queryType: q.queryType,
      date: q.date,
      solutionUpdatedAt: q.solution?.updatedAt,
      pptData: solutions[q.id],
    }));

  res.json({ success: true, data: completed });
});

// Public endpoint for submitting queries from website
router.post("/public", (req, res) => {
  try {
    const { firstName, lastName, email, enquiryTopics, enquiryType, message, phone, priority, source } = req.body;

    // Validation
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: firstName, lastName, and email are required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email format" 
      });
    }

    // Create query with mapped fields
    const newQuery = {
      id: `Q${String(queries.length + 1).padStart(3, "0")}`,
      clientName: `${firstName} ${lastName}`,
      clientEmail: email,
      queryType: enquiryType || "General",
      date: new Date().toISOString().split("T")[0],
      status: "pending",
      message: message || "",
      phone: phone || "",
      priority: priority || "normal",
      source: source || "website",
      enquiryTopics: enquiryTopics || [],
      firstName: firstName,
      lastName: lastName,
      enquiryType: enquiryType,
      createdAt: new Date().toISOString(),
    };

    queries.push(newQuery);

    console.log(`✅ New public query received: ${newQuery.id} from ${email}`);

    res.status(201).json({ 
      success: true, 
      message: "Query submitted successfully",
      data: newQuery 
    });
  } catch (error) {
    console.error("❌ Error processing public query:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error while processing query",
      error: error.message 
    });
  }
});

// Get meta data for enquiry options (must be before /:id route)
router.get("/meta/enquiry-options", (req, res) => {
  try {
    const enquiryOptions = {
      enquiryTypes: [
        "Astrology",
        "Numerology",
        "Tarot",
        "Palmistry",
        "Vastu",
        "Spiritual Healing",
        "Crystal Healing",
        "Reiki",
        "Meditation",
        "General",
      ],
      enquiryTopics: [
        "Career & Business",
        "Love & Relationships",
        "Health & Wellness",
        "Finance & Wealth",
        "Education & Learning",
        "Family & Home",
        "Travel & Relocation",
        "Spiritual Growth",
        "Personal Development",
        "Other",
      ],
      priorities: ["low", "normal", "high", "urgent"],
      sources: ["website", "phone", "email", "walk-in", "referral"],
    };

    res.json({ success: true, data: enquiryOptions });
  } catch (error) {
    console.error("❌ Error fetching enquiry options:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching enquiry options",
      error: error.message,
    });
  }
});

// Get Solution History for a client (must be before /:id route)
router.get("/client/:email/history", (req, res) => {
  const { email } = req.params;
  const clientQueries = queries.filter((q) => q.clientEmail === email);
  const history = clientQueries
    .filter((q) => q.solution)
    .map((q) => ({
      queryId: q.id,
      queryType: q.queryType,
      date: q.date,
      solution: solutions[q.id] || null,
      solutionStatus: q.solution,
    }));

  res.json({ success: true, data: history });
});

// Get single query
router.get("/:id", (req, res) => {
  const query = queries.find((q) => q.id === req.params.id);
  if (!query) {
    return res.status(404).json({ success: false, message: "Query not found" });
  }
  res.json({ success: true, data: query });
});

// Create query
router.post("/", (req, res) => {
  const newQuery = {
    id: `Q${String(queries.length + 1).padStart(3, "0")}`,
    ...req.body,
  };
  queries.push(newQuery);
  res.json({ success: true, data: newQuery });
});

// Update query
router.put("/:id", (req, res) => {
  const index = queries.findIndex((q) => q.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Query not found" });
  }
  queries[index] = { ...queries[index], ...req.body };
  res.json({ success: true, data: queries[index] });
});

// Delete query
router.delete("/:id", (req, res) => {
  const index = queries.findIndex((q) => q.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Query not found" });
  }
  queries.splice(index, 1);
  // Also delete associated solution
  delete solutions[req.params.id];
  res.json({ success: true, message: "Query deleted successfully" });
});

// Save PPT Solution
router.post("/:id/solution", (req, res) => {
  const { id } = req.params;
  const { pptData, status } = req.body;
  
  const query = queries.find((q) => q.id === id);
  if (!query) {
    return res.status(404).json({ success: false, message: "Query not found" });
  }

  // Save solution data
  solutions[id] = {
    ...pptData,
    status,
    createdAt: solutions[id]?.createdAt || new Date().toISOString().split("T")[0],
    updatedAt: new Date().toISOString().split("T")[0],
  };

  // Update query with solution status
  const queryIndex = queries.findIndex((q) => q.id === id);
  queries[queryIndex] = {
    ...queries[queryIndex],
    solution: {
      status,
      createdAt: solutions[id].createdAt,
      updatedAt: solutions[id].updatedAt,
    },
    status: status === "completed" ? "completed" : queries[queryIndex].status,
  };

  // Mock email sending for completed solutions
  if (status === "completed" && query.clientEmail) {
    console.log(`📧 Mock: Sending PPT solution to ${query.clientEmail} for query ${id}`);
  }

  res.json({
    success: true,
    message: status === "completed" ? "Solution saved and sent to client" : "Solution saved as draft",
    data: solutions[id],
  });
});

// Get PPT Solution
router.get("/:id/solution", (req, res) => {
  const { id } = req.params;
  const solution = solutions[id];
  
  if (!solution) {
    return res.status(404).json({ success: false, message: "Solution not found" });
  }

  res.json({ success: true, data: solution });
});

// Download PPT solution file
router.get("/:id/solution/ppt", async (req, res) => {
  const { id } = req.params;
  const solution = solutions[id];
  const query = queries.find((q) => q.id === id);

  if (!solution || !query) {
    return res.status(404).json({ success: false, message: "Solution not found" });
  }

  try {
    const pptBuffer = await buildSolutionPPT(id, solution);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename=\"${id}-solution.pptx\"`);
    return res.send(pptBuffer);
  } catch (error) {
    console.error("❌ Error generating PPT:", error);
    return res.status(500).json({ success: false, message: "Failed to generate PPT" });
  }
});

module.exports = router;

