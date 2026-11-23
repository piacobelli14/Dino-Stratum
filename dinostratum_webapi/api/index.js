const express = require("express");
const cors = require("cors");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const { pool, startup, connectionManager } = require("./config/db");
const errorLogger = require("./middleware/errorLogger");
const stratumAreas = require("./routes/stratum/areas");
const stratumIntel = require("./routes/stratum/intel");
const stratumRisk = require("./routes/stratum/risk");
const stratumLanding = require("./routes/stratum/landing");

const harvester = require("./harvester");


require("dotenv").config();

const ALLOWED_ORIGINS = [
  "https://ut-health-parallax-web-hub.vercel.app",
  "https://dino-stratum.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

const REDIRECT_MAP = {
  parallaxwebhub: "https://ut-health-parallax-web-hub.vercel.app/login",
};

const app = express();

app.set("trust proxy", 1);

app.use(express.static(path.join(__dirname, "public")));
app.use(compression());
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    optionsSuccessStatus: 200,
    methods: ["POST", "GET", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(bodyParser.json({ limit: "10mb" }));


app.use("/", stratumAreas);
app.use("/", stratumIntel);
app.use("/", stratumRisk); 
app.use("/", stratumLanding);

app.use("/", harvester.router);


app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "catchall.html"));
});

app.get("/verify", async (req, res) => {
  const { token, software } = req.query;

  if (!token) {
    return res.sendFile(path.resolve(__dirname, "public", "verify.html"));
  }

  try {
    const updateResult = await pool.query(
      `
          UPDATE users
          SET verified = TRUE,
             verification_token = NULL
          WHERE verification_token = $1
          RETURNING username
      `,
      [token]
    );

    if (updateResult.rowCount === 0) {
      return res.sendFile(path.resolve(__dirname, "public", "verify.html"));
    }

    const redirectUrl = REDIRECT_MAP[software];

    if (!redirectUrl) {
      return res
        .status(400)
        .send(
          "<html><body><h1>The provided software parameter is not recognized.</h1></body></html>"
        );
    }

    res.redirect(redirectUrl);
  } catch (error) {
    res
      .status(500)
      .send(
        "<html><body><h1>An error occurred during verification. Please try again later.</h1></body></html>"
      );
  }
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

    harvester.start();
  });

  async function gracefulShutdown(signal) {
    console.log(`${signal} received. Shutting down gracefully.`);

    await harvester.stop();

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