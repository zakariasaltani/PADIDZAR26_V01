// src/routes/programmes.routes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("programmes", "read"));


function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/programmes
 * Optional query params:
 *  - q : search in code/intitule/description
 *  - fonds_financement_id : filter
 */
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const fid = req.query.fonds_financement_id ? Number(req.query.fonds_financement_id) : null;

    const where = [];
    const params = [];
    let i = 1;

    if (q) {
      where.push(`(
        p.code ILIKE $${i} OR
        p.intitule ILIKE $${i} OR
        COALESCE(p.description,'') ILIKE $${i}
      )`);
      params.push(`%${q}%`);
      i++;
    }

    if (Number.isFinite(fid) && fid > 0) {
      where.push(`p.fonds_financement_id = $${i}`);
      params.push(fid);
      i++;
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        p.id,
        COALESCE(p.intitule, p.code, ('Programme #' || p.id::text)) AS label,
        p.code,
        p.intitule,
        p.description,
        p.annee_debut,
        p.annee_fin,
        p.budget_global,
        p.fonds_financement_id,

        f.nom AS fonds_nom,
        f.code AS fonds_code,
        f.type_source AS fonds_type_source,
        f.devise AS fonds_devise,
        f.statut AS fonds_statut
      FROM programmes p
      LEFT JOIN fonds_financement f
        ON f.id = p.fonds_financement_id
      ${whereSQL}
      ORDER BY p.id DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/programmes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/programmes/:id
 */
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows, rowCount } = await pool.query(
      `
      SELECT
        p.*,
        f.nom AS fonds_nom,
        f.code AS fonds_code
      FROM programmes p
      LEFT JOIN fonds_financement f ON f.id = p.fonds_financement_id
      WHERE p.id = $1
      `,
      [id]
    );

    if (!rowCount) return res.status(404).json({ error: "Programme introuvable" });
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /api/programmes/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/programmes
 */
router.post("/", requirePermission("programmes", "write"), async (req, res) => {
  try {
    const b = req.body || {};

    if (!b.intitule || !String(b.intitule).trim()) {
      return res.status(400).json({ error: "intitule requis" });
    }

    const fonds_financement_id =
      b.fonds_financement_id === null || b.fonds_financement_id === "" ? null : Number(b.fonds_financement_id);

    const code = (b.code || "").trim() || null;
    const intitule = String(b.intitule).trim();
    const description = (b.description || "").trim() || null;
    const annee_debut = b.annee_debut ? Number(b.annee_debut) : null;
    const annee_fin = b.annee_fin ? Number(b.annee_fin) : null;
    const budget_global = toNum(b.budget_global) ?? 0;

    const { rows } = await pool.query(
      `
      INSERT INTO programmes
        (fonds_financement_id, code, intitule, description, annee_debut, annee_fin, budget_global)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [fonds_financement_id, code, intitule, description, annee_debut, annee_fin, budget_global]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /api/programmes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/programmes/:id
 */
router.put("/:id(\\d+)", requirePermission("programmes", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};

    if (!b.intitule || !String(b.intitule).trim()) {
      return res.status(400).json({ error: "intitule requis" });
    }

    const fonds_financement_id =
      b.fonds_financement_id === null || b.fonds_financement_id === "" ? null : Number(b.fonds_financement_id);

    const code = (b.code || "").trim() || null;
    const intitule = String(b.intitule).trim();
    const description = (b.description || "").trim() || null;
    const annee_debut = b.annee_debut ? Number(b.annee_debut) : null;
    const annee_fin = b.annee_fin ? Number(b.annee_fin) : null;
    const budget_global = toNum(b.budget_global) ?? 0;

    const { rows, rowCount } = await pool.query(
      `
      UPDATE programmes
      SET
        fonds_financement_id = $1,
        code = $2,
        intitule = $3,
        description = $4,
        annee_debut = $5,
        annee_fin = $6,
        budget_global = $7
      WHERE id = $8
      RETURNING *
      `,
      [fonds_financement_id, code, intitule, description, annee_debut, annee_fin, budget_global, id]
    );

    if (!rowCount) return res.status(404).json({ error: "Programme introuvable" });
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/programmes/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/programmes/:id
 */
router.delete("/:id(\\d+)", requirePermission("programmes", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(`DELETE FROM programmes WHERE id = $1`, [id]);
    if (!r.rowCount) return res.status(404).json({ error: "Programme introuvable" });
    res.json({ status: "OK" });
  } catch (err) {
    console.error("DELETE /api/programmes/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
