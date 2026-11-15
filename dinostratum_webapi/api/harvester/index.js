const engine = require("./engine");

const DOMAINS = [
  require("./modules/stratum/risk")
];

engine.registerDomains(DOMAINS);

module.exports = {
  router: engine.router,
  start: engine.start,
  stop: engine.stop,
  status: engine.status
};

if (require.main === module) {
  const shutdown = async () => {
    await engine.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  engine.start({ mode: "worker" }).catch(() => process.exit(1));
}