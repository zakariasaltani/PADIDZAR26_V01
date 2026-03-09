const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("projets", "read"));


const multer = require("multer");
const XLSX = require("xlsx");

const upload = multer({ storage: multer.memoryStorage() });

function normKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

router.post("/projets/import-excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier requis (file)" });

    // Defaults envoyés depuis le formulaire (optionnel)
    const defProgrammeId = req.body.programme_id ? Number(req.body.programme_id) : null;
    const defFiliere = (req.body.filiere || "").trim() || null;
    const defStatut = (req.body.statut || "").trim() || "IMPORTED";
    const defDateDebut = (req.body.date_debut || "").trim() || null;
    const defDateFin = (req.body.date_fin || "").trim() || null;

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (raw.length === 0) return res.status(400).json({ error: "Feuille vide" });

    const rows = raw.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) out[normKey(k)] = r[k];
      return out;
    });

    let inserted = 0;
    const errors = [];

    await pool.query("BEGIN");

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // Mapping EXACT canevas
      const cin_agriculteur = String(r.cin_agriculteur || "").trim() || null;
      const nom_agriculteur = String(r.nom_agriculteur || "").trim();
      const nom_exploitation = String(r.nom_d_exploitation || "").trim() || null;

      const superficie_bour = toNum(r.superficie_totale_bour_ha);
      const superficie_irriguee = toNum(r.superficie_totale_irriguee_ha);
      const superficie_totale = toNum(r.superficie_totale);

      const commune_rurale = String(r.commune_rurale || "").trim() || null;
      const cercle = String(r.cercle || "").trim() || null;
      const douar = String(r.douar || "").trim() || null;

      const numero_dossier = String(r.numero_de_dossier || "").trim();
      const superficie_parcelle_aide = toNum(r.superficie_parcelle_objet_d_aide_ha);

      const classe_investissement = String(r.classe_d_investissement || "").trim() || null;
      const cout_investissement = toNum(r.cout_d_investissement_dh);
      const subvention = toNum(r.subvention_dh);

      const x1 = toNum(r.x1);
      const y1 = toNum(r.y1);
      const x2 = toNum(r.x2);
      const y2 = toNum(r.y2);

      if (!numero_dossier || !nom_agriculteur) {
        errors.push({ row: i + 2, error: "Numéro de dossier ou Nom agriculteur manquant" });
        continue;
      }

      // Champs "projet" ajoutés (défauts)
      const programme_id = Number.isFinite(defProgrammeId) ? defProgrammeId : null;
      const code = numero_dossier; // choix simple: code = numéro de dossier
      const intitule = nom_exploitation ? nom_exploitation : `Dossier ${numero_dossier}`;
      const filiere = defFiliere;
      const budget_previsionnel = cout_investissement; // choix: budget = coût investissement (modifiable)
      const date_debut = defDateDebut;
      const date_fin = defDateFin;
      const statut = defStatut;

      const hasPoint = x1 !== null && y1 !== null;
const hasEnv = hasPoint && x2 !== null && y2 !== null;

// ✅ Geometry générique (4326)
const geomSQL = hasEnv
  ? "ST_SetSRID(ST_MakeEnvelope($23,$24,$25,$26),4326)"
  : hasPoint
    ? "ST_SetSRID(ST_MakePoint($23,$24),4326)"
    : "NULL";


    
      
      const q = `
        INSERT INTO projets (
          programme_id, code, intitule, filiere, budget_previsionnel, date_debut, date_fin, statut,

          cin_agriculteur, nom_agriculteur, nom_exploitation,
          superficie_bour, superficie_irriguee, superficie_totale,
          commune_rurale, cercle, douar,
          numero_dossier, superficie_parcelle_aide,
          classe_investissement, cout_investissement, subvention,
          x1, y1, x2, y2,
          geom
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,

          $9,$10,$11,
          $12,$13,$14,
          $15,$16,$17,
          $18,$19,
          $20,$21,$22,
          $23,$24,$25,$26,
          ${geomSQL}
        )
      `;

      await pool.query(q, [
        programme_id, code, intitule, filiere, budget_previsionnel, date_debut, date_fin, statut,

        cin_agriculteur, nom_agriculteur, nom_exploitation,
        superficie_bour, superficie_irriguee, superficie_totale,
        commune_rurale, cercle, douar,
        numero_dossier, superficie_parcelle_aide,
        classe_investissement, cout_investissement, subvention,
        x1, y1, x2, y2,
      ]);

      inserted++;
    }

    await pool.query("COMMIT");

    res.json({
      status: "OK",
      sheet: sheetName,
      inserted,
      rejected: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error("Erreur import excel:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
