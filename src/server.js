const express = require("express");
const { neon } = require("@neondatabase/serverless");

const app = express();

app.get("/api/health", async (req, res) => {
  try {

    const sql = neon(process.env.DATABASE_URL);

    const result = await sql`SELECT NOW() as time`;

    res.json({
      status: "ok",
      database: "connected",
      time: result[0].time
    });

  } catch (err) {

    res.status(500).json({
      status: "error",
      message: err.message
    });

  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

