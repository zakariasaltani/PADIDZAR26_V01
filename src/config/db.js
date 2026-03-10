
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if(!connectionString){
  throw new Error("DATABASE_URL manquante");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on("connect", ()=>{
  console.log("Connecté à PostgreSQL / Neon");
});

module.exports = pool;
