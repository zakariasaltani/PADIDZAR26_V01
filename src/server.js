require("dotenv").config();
const app = require("./app");
const bootstrap = require("./config/bootstrap");

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await bootstrap();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Serveur lancé sur le port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Impossible de démarrer le serveur :", err.message);
    process.exit(1);
  }
}

start();
