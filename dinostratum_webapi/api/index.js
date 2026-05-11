require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const { pool, startup, connectionManager } = require("./config/db");
const errorLogger = require("./middleware/errorLogger");

const assetRoutes = require('./routes/intelligence/assets');
const riskRoutes = require('./routes/intelligence/risk');
const intelRoutes = require('./routes/intelligence/intel');
const areasRoutes = require('./routes/intelligence/areas');

const ALLOWED_ORIGINS = [
  "https://dino-auth.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176"
];

const app = express();

app.set("trust proxy", 1);

app.use(express.static(path.join(__dirname, "public")));
app.use(compression());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  optionsSuccessStatus: 200,
  methods: ["POST", "GET", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(bodyParser.json({ limit: "10mb" }));

app.use('/', assetRoutes);
app.use('/', riskRoutes);
app.use('/', intelRoutes);
app.use('/', areasRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "catchall.html"));
});

app.get("/health/connections", async (req, res) => {
  try {
    const stats = connectionManager.getStats();
    res.json({ status: "ok", ...stats });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.use(errorLogger);

async function boot() {
  try {
    await startup();
  } catch (error) {
    console.error("Fatal: database startup failed:", error.message);
    process.exit(1);
  }

  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`Server is running on port: ${port}.`);

    connectionManager.start();
    console.log("Connection manager worker started.");
  });

  async function gracefulShutdown(signal) {
    console.log(`${signal} received. Shutting down gracefully.`);

    await connectionManager.stop();

    server.close(() => {
      pool.end(() => process.exit(0));
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000);
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

boot();

module.exports = app;