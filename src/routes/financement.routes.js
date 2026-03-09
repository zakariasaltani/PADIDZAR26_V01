// src/routes/financement.routes.js
// Endpoints "financement" (compatibilité) :
// - /api/financement/fonds  -> lecture fonds_financement
// - /api/financement/assign-programme -> associer/désassocier un programme à un fond
//
// NB: L'UI principale des fonds utilise /api/fonds (src/routes/fonds.routes.js).

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("financement", "read"));


function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ======================= FONDS (lecture) ======================= */

router.get("/financement/fonds", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id, type_source, nom, code, description,
        contact_nom, contact_tel, contact_email,
        devise, statut, date_debut, date_fin, created_at
      FROM fonds_financement
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 2000
      `
    );
    res.json(rows);
  } catch (e) {
    console.error("Erreur GET /financement/fonds:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ======================= ASSIGN PROGRAMME -> FOND ======================= */

router.post("/financement/assign-programme", requirePermission("financement", "write"), async (req, res) => {
  try {
    const programme_id = toIntOrNull(req.body?.programme_id);
    const fond_id = toIntOrNull(req.body?.fond_id);

    if (!programme_id) {
      return res.status(400).json({ error: "programme_id requis" });
    }

    const r = await pool.query(
      `
      UPDATE programmes
      SET fonds_financement_id = $1
      WHERE id = $2
      RETURNING id, fonds_financement_id
      `,
      [fond_id, programme_id]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Programme introuvable" });
    res.json({ status: "OK", programme: r.rows[0] });
  } catch (e) {
    console.error("Erreur POST /financement/assign-programme:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
