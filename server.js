const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { streamStoredFile, importUploadFolder } = require("./lib/storedFiles");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const filename = path.basename(decodeURIComponent(req.path || ""));
  streamStoredFile(filename, req, res)
    .then((sent) => {
      if (!sent && !res.headersSent) next();
    })
    .catch(() => {
      if (!res.headersSent) next();
    });
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB Connection
// mongodb+srv:// needs DNS SRV lookups. Some ISP resolvers return ESERVFAIL /
// ECONNREFUSED for Atlas — prefer public DNS so Node can resolve the cluster.
dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()]);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/tathasstu-admin";

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB connected successfully");
    const uploadsRoot = path.join(__dirname, "uploads");
    const added = await importUploadFolder(path.join(uploadsRoot, "banners"))
      + await importUploadFolder(path.join(uploadsRoot, "products"))
      + await importUploadFolder(path.join(uploadsRoot, "featured"))
      + await importUploadFolder(path.join(uploadsRoot, "testimonials"));
    if (added) console.log(`Stored ${added} upload file(s) in MongoDB`);
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/queries", require("./routes/queries"));
app.use("/api/users", require("./routes/users"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/events", require("./routes/events"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/remedies", require("./routes/remedies"));
app.use("/api/products", require("./routes/products"));
app.use("/api/store", require("./routes/store"));
app.use("/api/store", require("./routes/storePhaseC"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Tathasstu Admin API is running" });
});

const PORT = process.env.PORT;
if (!PORT) {
  console.error("❌ PORT is missing. Set PORT in backend/.env");
  process.exit(1);
}

app.listen(Number(PORT), () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

