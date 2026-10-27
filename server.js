const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { ensureStorageLayout, STORAGE_ROOT, DATA_DIR } = require("./lib/fileDb");

ensureStorageLayout();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images/videos from local disk (admin uploads + storefront URLs)
const uploadsDir = path.join(__dirname, "uploads");
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "365d",
    immutable: true,
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");
      if (filePath.endsWith(".mp4")) {
        res.setHeader("Content-Type", "video/mp4");
      }
    },
  })
);

// Also serve storage/images under /uploads for mirrored files
app.use(
  "/uploads",
  express.static(path.join(STORAGE_ROOT, "images"), {
    maxAge: "365d",
    immutable: true,
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");
    },
  })
);

console.log(`📁 File database: ${DATA_DIR}`);
console.log(`🖼️  Media storage: ${path.join(STORAGE_ROOT, "images")} (+ uploads/)`);

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

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Tathasstu Admin API is running",
    storage: "file",
    dataDir: DATA_DIR,
  });
});

// Always JSON errors for the admin UI (never Express HTML stack pages)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error("[api]", err);
  const status = Number(err.status || err.statusCode) || 500;
  const isJson =
    err instanceof SyntaxError ||
    err.type === "entity.parse.failed" ||
    /JSON|Unexpected token|in JSON/i.test(String(err.message || ""));
  res.status(isJson ? 400 : status).json({
    success: false,
    message: isJson
      ? "Invalid JSON in request body"
      : err.message || "Internal server error",
  });
});

const PORT = process.env.PORT;
if (!PORT) {
  console.error("❌ PORT is missing. Set PORT in backend/.env");
  process.exit(1);
}

const server = app.listen(Number(PORT), () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("✅ Using local file storage (no MongoDB)");
});

// Video upload + ffmpeg compress can take several minutes
server.timeout = 5 * 60 * 1000;
server.headersTimeout = 5 * 60 * 1000 + 10_000;
server.requestTimeout = 5 * 60 * 1000;
