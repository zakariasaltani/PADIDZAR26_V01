const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",          // adapte si besoin
  host: "localhost",
  database: "DB_MS2026",
  password: "Zitouni262015",
  port: 5432,
});

pool.on("connect", () => {
  console.log("✅ Connecté à PostgreSQL / PostGIS");
});

module.exports = pool;
