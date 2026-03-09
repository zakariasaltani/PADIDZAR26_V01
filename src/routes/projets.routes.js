const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("projets", "read"));

function isNum(v) {
  const n = Number(v);
  return Number.isFinite(n);
}

router.get("/programmes", async (req, res) => {
  try {
    const q = `
      SELECT id, COALESCE(intitule, code, ('Programme #' || id::text)) AS label
      FROM programmes
      ORDER BY id DESC
      LIMIT 500
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /programmes:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/projets", async (req, res) => {
  try {
    const q = `
      SELECT
        p.id,
        p.programme_id,
        p.beneficiaire_id,
        p.type_beneficiaire,
        p.nom_beneficiaire,
        COALESCE(b.nom_benef, p.nom_beneficiaire, p.nom_agriculteur) AS beneficiaire_label,
        p.code,
        p.intitule,
        p.filiere,
        p.budget_previsionnel,
        p.date_debut,
        p.date_fin,
        p.statut,
        p.cin_agriculteur,
        p.nom_agriculteur,
        p.nom_exploitation,
        p.superficie_bour,
        p.superficie_irriguee,
        p.superficie_totale,
        p.commune_rurale,
        p.cercle,
        p.douar,
        p.numero_dossier,
        p.superficie_parcelle_aide,
        p.classe_investissement,
        p.cout_investissement,
        p.subvention,
        p.x1, p.y1, p.x2, p.y2,
        ST_AsGeoJSON(p.geom) AS geometry
      FROM projets p
      LEFT JOIN beneficiaires b ON b.id = p.beneficiaire_id
      ORDER BY p.id DESC
      LIMIT 2000
    `;
    const r = await pool.query(q);
    res.json(r.rows.map((p) => ({ ...p, geometry: p.geometry ? JSON.parse(p.geometry) : null })));
  } catch (e) {
    console.error("Erreur GET /projets:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/projets/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const q = `
      SELECT
        p.id,
        p.programme_id,
        p.beneficiaire_id,
        p.type_beneficiaire,
        p.nom_beneficiaire,
        COALESCE(b.nom_benef, p.nom_beneficiaire, p.nom_agriculteur) AS beneficiaire_label,
        p.code,
        p.intitule,
        p.filiere,
        p.budget_previsionnel,
        p.date_debut,
        p.date_fin,
        p.statut,
        p.cin_agriculteur,
        p.nom_agriculteur,
        p.nom_exploitation,
        p.superficie_bour,
        p.superficie_irriguee,
        p.superficie_totale,
        p.commune_rurale,
        p.cercle,
        p.douar,
        p.numero_dossier,
        p.superficie_parcelle_aide,
        p.classe_investissement,
        p.cout_investissement,
        p.subvention,
        p.x1, p.y1, p.x2, p.y2,
        ST_AsGeoJSON(p.geom) AS geometry
      FROM projets p
      LEFT JOIN beneficiaires b ON b.id = p.beneficiaire_id
      WHERE p.id = $1
    `;
    const r = await pool.query(q, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Projet introuvable" });
    const p = r.rows[0];
    p.geometry = p.geometry ? JSON.parse(p.geometry) : null;
    res.json(p);
  } catch (e) {
    console.error("Erreur GET /projets/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/projets", requirePermission("projets", "write"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.code || !b.intitule) return res.status(400).json({ error: "code et intitule requis" });

    const hasGeom = !!b.geom;
    const hasPoint = isNum(b.x1) && isNum(b.y1);
    const hasEnv = hasPoint && isNum(b.x2) && isNum(b.y2);

    const geomSQL = hasGeom
      ? "ST_SetSRID(ST_GeomFromGeoJSON($30), 4326)"
      : hasEnv
        ? "ST_SetSRID(ST_MakeEnvelope($26,$27,$28,$29), 4326)"
        : hasPoint
          ? "ST_SetSRID(ST_MakePoint($26,$27), 4326)"
          : "NULL";

    const q = `
      INSERT INTO projets (
        programme_id, beneficiaire_id, type_beneficiaire, nom_beneficiaire,
        code, intitule, filiere, budget_previsionnel, date_debut, date_fin, statut,
        cin_agriculteur, nom_agriculteur, nom_exploitation,
        superficie_bour, superficie_irriguee, superficie_totale,
        commune_rurale, cercle, douar,
        numero_dossier, superficie_parcelle_aide,
        classe_investissement, cout_investissement, subvention,
        x1, y1, x2, y2, geom
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,
        $15,$16,$17,
        $18,$19,$20,
        $21,$22,
        $23,$24,$25,
        $26,$27,$28,$29,
        ${geomSQL}
      )
      RETURNING id
    `;

    const params = [
      b.programme_id ?? null,
      b.beneficiaire_id ?? null,
      b.type_beneficiaire ?? null,
      b.nom_beneficiaire ?? null,
      b.code,
      b.intitule,
      b.filiere ?? null,
      b.budget_previsionnel ?? null,
      b.date_debut ?? null,
      b.date_fin ?? null,
      b.statut ?? "EN_COURS",
      b.cin_agriculteur ?? null,
      b.nom_agriculteur ?? null,
      b.nom_exploitation ?? null,
      b.superficie_bour ?? null,
      b.superficie_irriguee ?? null,
      b.superficie_totale ?? null,
      b.commune_rurale ?? null,
      b.cercle ?? null,
      b.douar ?? null,
      b.numero_dossier ?? null,
      b.superficie_parcelle_aide ?? null,
      b.classe_investissement ?? null,
      b.cout_investissement ?? null,
      b.subvention ?? null,
      hasPoint ? Number(b.x1) : null,
      hasPoint ? Number(b.y1) : null,
      hasEnv ? Number(b.x2) : null,
      hasEnv ? Number(b.y2) : null,
      hasGeom ? b.geom : null,
    ];

    const r = await pool.query(q, params);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    console.error("Erreur POST /projets:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/projets/:id(\\d+)", requirePermission("projets", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    if (!b.code || !b.intitule) return res.status(400).json({ error: "code et intitule requis" });

    const hasGeom = !!b.geom;
    const hasPoint = isNum(b.x1) && isNum(b.y1);
    const hasEnv = hasPoint && isNum(b.x2) && isNum(b.y2);

    const geomSQL = hasGeom
      ? "ST_SetSRID(ST_GeomFromGeoJSON($30), 4326)"
      : hasEnv
        ? "ST_SetSRID(ST_MakeEnvelope($26,$27,$28,$29), 4326)"
        : hasPoint
          ? "ST_SetSRID(ST_MakePoint($26,$27), 4326)"
          : "geom";

    const q = `
      UPDATE projets SET
        programme_id=$1,
        beneficiaire_id=$2,
        type_beneficiaire=$3,
        nom_beneficiaire=$4,
        code=$5,
        intitule=$6,
        filiere=$7,
        budget_previsionnel=$8,
        date_debut=$9,
        date_fin=$10,
        statut=$11,
        cin_agriculteur=$12,
        nom_agriculteur=$13,
        nom_exploitation=$14,
        superficie_bour=$15,
        superficie_irriguee=$16,
        superficie_totale=$17,
        commune_rurale=$18,
        cercle=$19,
        douar=$20,
        numero_dossier=$21,
        superficie_parcelle_aide=$22,
        classe_investissement=$23,
        cout_investissement=$24,
        subvention=$25,
        x1=$26, y1=$27, x2=$28, y2=$29,
        geom=${geomSQL}
      WHERE id=$31
      RETURNING id
    `;

    const params = [
      b.programme_id ?? null,
      b.beneficiaire_id ?? null,
      b.type_beneficiaire ?? null,
      b.nom_beneficiaire ?? null,
      b.code,
      b.intitule,
      b.filiere ?? null,
      b.budget_previsionnel ?? null,
      b.date_debut ?? null,
      b.date_fin ?? null,
      b.statut ?? "EN_COURS",
      b.cin_agriculteur ?? null,
      b.nom_agriculteur ?? null,
      b.nom_exploitation ?? null,
      b.superficie_bour ?? null,
      b.superficie_irriguee ?? null,
      b.superficie_totale ?? null,
      b.commune_rurale ?? null,
      b.cercle ?? null,
      b.douar ?? null,
      b.numero_dossier ?? null,
      b.superficie_parcelle_aide ?? null,
      b.classe_investissement ?? null,
      b.cout_investissement ?? null,
      b.subvention ?? null,
      hasPoint ? Number(b.x1) : null,
      hasPoint ? Number(b.y1) : null,
      hasEnv ? Number(b.x2) : null,
      hasEnv ? Number(b.y2) : null,
      hasGeom ? b.geom : null,
      id,
    ];

    const r = await pool.query(q, params);
    if (r.rowCount === 0) return res.status(404).json({ error: "Projet introuvable" });
    res.json({ status: "OK" });
  } catch (e) {
    console.error("Erreur PUT /projets/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/projets/:id(\\d+)", requirePermission("projets", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM projets WHERE id=$1", [id]);
    res.json({ status: "OK" });
  } catch (e) {
    console.error("Erreur DELETE /projets/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
