const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("beneficiaires", "read"));

router.get("/beneficiaires", async (req, res) => {
  try {
    const q = `
      SELECT id, type, nom_benef, nom_president, nbre_adherent, date_creation, observations, created_at
      FROM beneficiaires
      ORDER BY id DESC
      LIMIT 2000
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /beneficiaires:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/beneficiaires/options", async (req, res) => {
  try {
    const q = `
      SELECT id,
             COALESCE(type, 'Non défini') AS type,
             COALESCE(nom_benef, ('Bénéficiaire #' || id::text)) AS nom_benef,
             COALESCE(type, 'Non défini') || ' - ' || COALESCE(nom_benef, ('Bénéficiaire #' || id::text)) AS label
      FROM beneficiaires
      ORDER BY nom_benef ASC NULLS LAST, id DESC
      LIMIT 3000
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /beneficiaires/options:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/beneficiaires/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(
      `SELECT id, type, nom_benef, nom_president, nbre_adherent, date_creation, observations, created_at
       FROM beneficiaires WHERE id = $1`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Bénéficiaire introuvable" });
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Erreur GET /beneficiaires/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/beneficiaires", requirePermission("beneficiaires", "write"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.type || "").trim() || !String(b.nom_benef || "").trim()) {
      return res.status(400).json({ error: "type et nom_benef requis" });
    }

    const q = `
      INSERT INTO beneficiaires (type, nom_benef, nom_president, nbre_adherent, date_creation, observations)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
    `;
    const params = [
      String(b.type).trim(),
      String(b.nom_benef).trim(),
      String(b.nom_president || "").trim() || null,
      b.nbre_adherent === "" || b.nbre_adherent === null || b.nbre_adherent === undefined ? null : Number(b.nbre_adherent),
      b.date_creation || null,
      String(b.observations || "").trim() || null,
    ];

    const r = await pool.query(q, params);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    console.error("Erreur POST /beneficiaires:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/beneficiaires/:id(\\d+)", requirePermission("beneficiaires", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    if (!String(b.type || "").trim() || !String(b.nom_benef || "").trim()) {
      return res.status(400).json({ error: "type et nom_benef requis" });
    }

    const q = `
      UPDATE beneficiaires SET
        type = $1,
        nom_benef = $2,
        nom_president = $3,
        nbre_adherent = $4,
        date_creation = $5,
        observations = $6
      WHERE id = $7
      RETURNING id
    `;
    const params = [
      String(b.type).trim(),
      String(b.nom_benef).trim(),
      String(b.nom_president || "").trim() || null,
      b.nbre_adherent === "" || b.nbre_adherent === null || b.nbre_adherent === undefined ? null : Number(b.nbre_adherent),
      b.date_creation || null,
      String(b.observations || "").trim() || null,
      id,
    ];

    const r = await pool.query(q, params);
    if (r.rowCount === 0) return res.status(404).json({ error: "Bénéficiaire introuvable" });
    res.json({ status: "OK" });
  } catch (e) {
    console.error("Erreur PUT /beneficiaires/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/beneficiaires/:id(\\d+)", requirePermission("beneficiaires", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const linked = await pool.query("SELECT COUNT(*)::int AS n FROM projets WHERE beneficiaire_id = $1", [id]);
    if ((linked.rows[0]?.n || 0) > 0) {
      return res.status(400).json({ error: "Ce bénéficiaire est lié à un ou plusieurs projets." });
    }
    await pool.query("DELETE FROM beneficiaires WHERE id = $1", [id]);
    res.json({ status: "OK" });
  } catch (e) {
    console.error("Erreur DELETE /beneficiaires/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
