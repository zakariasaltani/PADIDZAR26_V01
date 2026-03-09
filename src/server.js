const app = require("./app");
const bootstrap = require("./config/bootstrap");

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await bootstrap();
    app.listen(PORT, () => {
      console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("❌ Impossible de démarrer le serveur :", e.message);
    process.exit(1);
  }
}

start();
