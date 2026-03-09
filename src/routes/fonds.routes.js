// src/routes/fonds.routes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("financement", "read"));


function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * نفس الـhandler باش نخدمو جوج endpoints:
 * GET /api/fonds
 * GET /api/fonds-financement
 */
async function listFonds(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        id, type_source, nom, code, description,
        contact_nom, contact_tel, contact_email,
        devise, statut, date_debut, date_fin, created_at
      FROM fonds_financement
      ORDER BY created_at DESC NULLS LAST, id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("GET fonds error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

async function getFondById(req, res) {
  try {
    const id = Number(req.params.id);
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM fonds_financement WHERE id = $1`,
      [id]
    );
    if (!rowCount) return res.status(404).json({ error: "Fonds introuvable" });
    res.json(rows[0]);
  } catch (err) {
    console.error("GET fonds/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ✅ Alias routes
router.get("/fonds", listFonds);
router.get("/fonds-financement", listFonds);

router.get("/fonds/:id(\\d+)", getFondById);
router.get("/fonds-financement/:id(\\d+)", getFondById);

/* ============================== CREATE ============================== */
async function createFond(req, res) {
  try {
    const b = req.body || {};

    const type_source = cleanStr(b.type_source);
    const nom = cleanStr(b.nom);
    if (!type_source) return res.status(400).json({ error: "type_source requis" });
    if (!nom) return res.status(400).json({ error: "nom requis" });

    const code = cleanStr(b.code);
    const description = cleanStr(b.description);
    const contact_nom = cleanStr(b.contact_nom);
    const contact_tel = cleanStr(b.contact_tel);
    const contact_email = cleanStr(b.contact_email);
    const devise = cleanStr(b.devise) || "MAD";
    const statut = cleanStr(b.statut) || "ACTIF";
    const date_debut = cleanStr(b.date_debut);
    const date_fin = cleanStr(b.date_fin);

    const { rows } = await pool.query(
      `
      INSERT INTO fonds_financement
        (type_source, nom, code, description, contact_nom, contact_tel, contact_email, devise, statut, date_debut, date_fin)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
        type_source,
        nom,
        code,
        description,
        contact_nom,
        contact_tel,
        contact_email,
        devise,
        statut,
        date_debut,
        date_fin,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /api/fonds error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ============================== UPDATE ============================== */
async function updateFond(req, res) {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};

    const type_source = cleanStr(b.type_source);
    const nom = cleanStr(b.nom);
    if (!type_source) return res.status(400).json({ error: "type_source requis" });
    if (!nom) return res.status(400).json({ error: "nom requis" });

    const code = cleanStr(b.code);
    const description = cleanStr(b.description);
    const contact_nom = cleanStr(b.contact_nom);
    const contact_tel = cleanStr(b.contact_tel);
    const contact_email = cleanStr(b.contact_email);
    const devise = cleanStr(b.devise) || "MAD";
    const statut = cleanStr(b.statut) || "ACTIF";
    const date_debut = cleanStr(b.date_debut);
    const date_fin = cleanStr(b.date_fin);

    const { rows, rowCount } = await pool.query(
      `
      UPDATE fonds_financement
      SET
        type_source = $1,
        nom = $2,
        code = $3,
        description = $4,
        contact_nom = $5,
        contact_tel = $6,
        contact_email = $7,
        devise = $8,
        statut = $9,
        date_debut = $10,
        date_fin = $11
      WHERE id = $12
      RETURNING *
      `,
      [
        type_source,
        nom,
        code,
        description,
        contact_nom,
        contact_tel,
        contact_email,
        devise,
        statut,
        date_debut,
        date_fin,
        id,
      ]
    );

    if (!rowCount) return res.status(404).json({ error: "Fonds introuvable" });
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/fonds/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/* ============================== DELETE ============================== */
async function deleteFond(req, res) {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(`DELETE FROM fonds_financement WHERE id = $1`, [id]);
    if (!r.rowCount) return res.status(404).json({ error: "Fonds introuvable" });
    res.json({ status: "OK" });
  } catch (err) {
    console.error("DELETE /api/fonds/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ✅ CRUD routes (avec alias)
router.post("/fonds", createFond);
router.post("/fonds-financement", createFond);

router.put("/fonds/:id(\\d+)", updateFond);
router.put("/fonds-financement/:id(\\d+)", updateFond);

router.delete("/fonds/:id(\\d+)", deleteFond);
router.delete("/fonds-financement/:id(\\d+)", deleteFond);

module.exports = router;
