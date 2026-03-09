const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("dashboard", "read"));


// Helper: table exists
async function tableExists(tableName) {
  const q = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists
  `;
  const r = await pool.query(q, [tableName]);
  return r.rows[0].exists;
}

router.get("/kpi", async (req, res) => {
  try {
    // Communes : garder l'ancien comportement si la table existe
    let communes = null;
    if (await tableExists("commune_rhamna")) {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM commune_rhamna");
      communes = r.rows[0].n;
    }

    // Projets : préférer la table 'projets' (nouveau module)
    let projets = null;
    if (await tableExists("projets")) {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM projets");
      projets = r.rows[0].n;
    } else if (await tableExists("projets_rhamna")) {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM projets_rhamna");
      projets = r.rows[0].n;
    }

    res.json({ communes, projets });
  } catch (err) {
    console.error("GET /kpi error:", err);
    res.status(500).json({ error: "Erreur KPI" });
  }
});

module.exports = router;
