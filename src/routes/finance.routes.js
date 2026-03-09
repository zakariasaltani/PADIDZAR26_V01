const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

const uploadDir = path.join(process.cwd(), "uploads", "marches");
fs.mkdirSync(uploadDir, { recursive: true });

function safeName(v = "") {
  return String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || "";
    const base = safeName(path.basename(file.originalname || "document", ext)) || "document";
    const num = safeName(req.body?.numero_marche || "marche");
    cb(null, `${Date.now()}-${num}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

router.use(authRequired);
router.use(requirePermission("finance", "read"));

/* -------------------- LISTES (pour formulaires) -------------------- */
router.get("/finance/projets", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, code, intitule, programme_id, statut
       FROM projets
       ORDER BY id DESC
       LIMIT 2000;`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/projets:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/finance/marches", async (req, res) => {
  try {
    const { projet_id, programme_id, ao_id } = req.query;
    const params = [];
    const where = [];
    if (projet_id) {
      params.push(Number(projet_id));
      where.push(`m.projet_id = $${params.length}`);
    }
    if (programme_id) {
      params.push(Number(programme_id));
      where.push(`pr.programme_id = $${params.length}`);
    }
    if (ao_id) {
      params.push(Number(ao_id));
      where.push(`m.ao_id = $${params.length}`);
    }

    const r = await pool.query(
      `SELECT
         m.id,
         m.projet_id,
         m.ao_id,
         m.fournisseur_id,
         m.numero_marche,
         m.objet,
         m.montant,
         m.statut,
         m.date_signature,
         m.nature_depense,
         m.imputation_id,
         pr.code AS projet_code,
         pr.intitule AS projet_intitule,
         pr.programme_id,
         pg.intitule AS programme_intitule,
         ao.numero_ao,
         ao.objet AS ao_objet,
         f.nom AS fournisseur_nom,
         COALESCE(i.nature, m.nature_depense) AS imputation_nature,
         COALESCE((SELECT SUM(pa.montant) FROM paiements pa WHERE pa.id_marche = m.id), 0)::numeric(14,2) AS montant_paye,
         (COALESCE(m.montant,0) - COALESCE((SELECT SUM(pa.montant) FROM paiements pa WHERE pa.id_marche = m.id), 0))::numeric(14,2) AS reste_a_payer
       FROM marches m
       LEFT JOIN projets pr ON pr.id = m.projet_id
       LEFT JOIN programmes pg ON pg.id = pr.programme_id
       LEFT JOIN appels_offres ao ON ao.id = m.ao_id
       LEFT JOIN fournisseurs f ON f.id = m.fournisseur_id
       LEFT JOIN imputations i ON i.id = m.imputation_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY m.id DESC
       LIMIT 5000;`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/marches:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* -------------------- APPELS D'OFFRES -------------------- */
router.get("/finance/appels-offres", async (req, res) => {
  try {
    const { programme_id } = req.query || {};
    const params = [];
    const where = [];
    if (programme_id) {
      params.push(Number(programme_id));
      where.push(`ao.programme_id = $${params.length}`);
    }
    const r = await pool.query(
      `SELECT
         ao.id,
         ao.programme_id,
         ao.numero_ao,
         ao.objet,
         ao.date_lancement,
         ao.date_ouverture_plis,
         ao.statut,
         COALESCE(ao.montant_estime,0)::numeric(14,2) AS montant_estime,
         ao.observations,
         pg.code AS programme_code,
         COALESCE(pg.intitule, pg.code, ('Programme #' || ao.programme_id::text)) AS programme_label,
         COALESCE((SELECT COUNT(*) FROM marches m WHERE m.ao_id = ao.id), 0)::int AS nb_marches,
         COALESCE((SELECT SUM(m.montant) FROM marches m WHERE m.ao_id = ao.id), 0)::numeric(14,2) AS montant_marches
       FROM appels_offres ao
       LEFT JOIN programmes pg ON pg.id = ao.programme_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ao.id DESC
       LIMIT 3000;`,
      params
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/appels-offres:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/finance/appels-offres", requirePermission("finance", "write"), async (req, res) => {
  try {
    const { programme_id, numero_ao, objet, date_lancement, date_ouverture_plis, statut, montant_estime, observations } = req.body || {};
    if (!programme_id || !String(numero_ao || '').trim()) {
      return res.status(400).json({ error: "programme_id et numero_ao requis" });
    }
    const r = await pool.query(
      `INSERT INTO appels_offres (programme_id, numero_ao, objet, date_lancement, date_ouverture_plis, statut, montant_estime, observations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [Number(programme_id), String(numero_ao).trim(), objet || null, date_lancement || null, date_ouverture_plis || null, statut || 'BROUILLON', Number(montant_estime || 0), observations || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error("Erreur POST /finance/appels-offres:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/finance/appels-offres/:id", requirePermission("finance", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
    const { programme_id, numero_ao, objet, date_lancement, date_ouverture_plis, statut, montant_estime, observations } = req.body || {};
    if (!programme_id || !String(numero_ao || '').trim()) {
      return res.status(400).json({ error: "programme_id et numero_ao requis" });
    }
    const r = await pool.query(
      `UPDATE appels_offres
       SET programme_id=$1, numero_ao=$2, objet=$3, date_lancement=$4, date_ouverture_plis=$5, statut=$6, montant_estime=$7, observations=$8
       WHERE id=$9 RETURNING *`,
      [Number(programme_id), String(numero_ao).trim(), objet || null, date_lancement || null, date_ouverture_plis || null, statut || 'BROUILLON', Number(montant_estime || 0), observations || null, id]
    );
    if (!r.rowCount) return res.status(404).json({ error: "AO introuvable" });
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Erreur PUT /finance/appels-offres/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/finance/appels-offres/:id", requirePermission("finance", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
    await pool.query(`DELETE FROM appels_offres WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur DELETE /finance/appels-offres/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* -------------------- FOURNISSEURS -------------------- */
router.get("/finance/fournisseurs", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nom, ice, telephone, email
       FROM fournisseurs
       ORDER BY id DESC
       LIMIT 2000;`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/fournisseurs:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post(
  "/finance/fournisseurs",
  requirePermission("finance", "write"),
  async (req, res) => {
    try {
      const { nom, ice, telephone, email, adresse } = req.body || {};
      if (!nom || !String(nom).trim()) {
        return res.status(400).json({ error: "nom requis" });
      }

      const r = await pool.query(
        `INSERT INTO fournisseurs (nom, ice, telephone, email, adresse)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, nom, ice, telephone, email;`,
        [
          String(nom).trim(),
          ice ? String(ice).trim() : null,
          telephone ? String(telephone).trim() : null,
          email ? String(email).trim() : null,
          adresse ? String(adresse).trim() : null,
        ]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error("Erreur POST /finance/fournisseurs:", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

/* -------------------- MARCHES (CRUD) -------------------- */
router.post("/finance/marches", requirePermission("finance", "write"), async (req, res) => {
  try {
    const {
      projet_id,
      ao_id,
      fournisseur_id,
      numero_marche,
      objet,
      montant,
      statut,
      date_signature,
      nature_depense,
      imputation_id,
    } = req.body || {};

    if (!projet_id || !fournisseur_id || !numero_marche) {
      return res.status(400).json({ error: "projet_id, fournisseur_id et numero_marche requis" });
    }

    // Résoudre l'imputation: priorité à imputation_id, sinon lookup par nature_depense
    let impId = imputation_id ? Number(imputation_id) : null;
    const nature = nature_depense ? String(nature_depense).trim() : null;
    if (!impId && nature) {
      const rImp = await pool.query(`SELECT id FROM imputations WHERE nature = $1`, [nature]);
      if (rImp.rowCount > 0) impId = rImp.rows[0].id;
    }

    const r = await pool.query(
      `INSERT INTO marches (
         projet_id, ao_id, fournisseur_id, numero_marche, objet, montant, statut, date_signature, nature_depense, imputation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *;`,
      [
        Number(projet_id),
        toNumber(ao_id),
        Number(fournisseur_id),
        String(numero_marche).trim(),
        objet ? String(objet).trim() : null,
        Number(montant || 0),
        statut ? String(statut).trim() : "EN_COURS",
        date_signature || null,
        nature,
        impId,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error("Erreur POST /finance/marches:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/finance/marches/:id", requirePermission("finance", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });

    const {
      projet_id,
      ao_id,
      fournisseur_id,
      numero_marche,
      objet,
      montant,
      statut,
      date_signature,
      nature_depense,
      imputation_id,
    } = req.body || {};

    if (!projet_id || !fournisseur_id || !numero_marche) {
      return res.status(400).json({ error: "projet_id, fournisseur_id et numero_marche requis" });
    }

    let impId = imputation_id ? Number(imputation_id) : null;
    const nature = nature_depense ? String(nature_depense).trim() : null;
    if (!impId && nature) {
      const rImp = await pool.query(`SELECT id FROM imputations WHERE nature = $1`, [nature]);
      if (rImp.rowCount > 0) impId = rImp.rows[0].id;
    }

    const r = await pool.query(
      `UPDATE marches
       SET projet_id=$1, ao_id=$2, fournisseur_id=$3, numero_marche=$4, objet=$5, montant=$6, statut=$7,
           date_signature=$8, nature_depense=$9, imputation_id=$10
       WHERE id=$11
       RETURNING *;`,
      [
        Number(projet_id),
        toNumber(ao_id),
        Number(fournisseur_id),
        String(numero_marche).trim(),
        objet ? String(objet).trim() : null,
        Number(montant || 0),
        statut ? String(statut).trim() : "EN_COURS",
        date_signature || null,
        nature,
        impId,
        id,
      ]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Marché introuvable" });
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Erreur PUT /finance/marches/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* -------------------- PAIEMENTS -------------------- */
router.get("/finance/paiements", async (req, res) => {
  try {
    const { id_marche } = req.query;

    const params = [];
    const where = id_marche ? "WHERE pa.id_marche = $1" : "";
    if (id_marche) params.push(Number(id_marche));

    const q = `
      SELECT
        pa.id,
        pa.id_marche,
        pa.montant,
        pa.date_paiement,
        pa.reference,
        pa.mode,
        pa.observation,
        pa.imputation_id,
        pa.imputation_source,
        i.nature AS imputation_nature,
        m.numero_marche
      FROM paiements pa
      JOIN marches m ON m.id = pa.id_marche
      LEFT JOIN imputations i ON i.id = pa.imputation_id
      ${where}
      ORDER BY pa.date_paiement DESC, pa.id DESC
      LIMIT 2000;
    `;

    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/paiements:", e.message);
    res.status(500).json({ error: e.message });
  }
});


/* -------------------- IMPUTATIONS (lignes budgétaires) -------------------- */
router.get("/finance/imputations", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT
         id,
         exercice,
         code,
         numero_article,
         numero_paragraphe,
         numero_ligne,
         nature,
         COALESCE(montant_report,0)::numeric(14,2) AS montant_report,
         COALESCE(montant_consolide,0)::numeric(14,2) AS montant_consolide,
         COALESCE(budget_nouveau,0)::numeric(14,2) AS budget_nouveau
       FROM imputations
       ORDER BY exercice DESC NULLS LAST, id DESC
       LIMIT 5000;`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/imputations:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/finance/imputations", requirePermission("finance", "write"), async (req, res) => {
  try {
    const {
      exercice,
      code,
      numero_article,
      numero_paragraphe,
      numero_ligne,
      nature,
      montant_report,
      montant_consolide,
      budget_nouveau,
    } = req.body || {};

    if (!nature || !nature.toString().trim()) {
      return res.status(400).json({ error: "nature requis" });
    }

    const r = await pool.query(
      `INSERT INTO imputations (
         exercice, code, numero_article, numero_paragraphe, numero_ligne, nature,
         montant_report, montant_consolide, budget_nouveau
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *;`,
      [
        exercice ?? null,
        code ?? null,
        numero_article ?? null,
        numero_paragraphe ?? null,
        numero_ligne ?? null,
        nature.toString().trim(),
        Number(montant_report || 0),
        Number(montant_consolide || 0),
        Number(budget_nouveau || 0),
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error("Erreur POST /finance/imputations:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/finance/imputations/:id", requirePermission("finance", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      exercice,
      code,
      numero_article,
      numero_paragraphe,
      numero_ligne,
      nature,
      montant_report,
      montant_consolide,
      budget_nouveau,
    } = req.body || {};

    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
    if (!nature || !nature.toString().trim()) return res.status(400).json({ error: "nature requis" });

    const r = await pool.query(
      `UPDATE imputations
       SET exercice=$1, code=$2, numero_article=$3, numero_paragraphe=$4, numero_ligne=$5, nature=$6,
           montant_report=$7, montant_consolide=$8, budget_nouveau=$9
       WHERE id=$10
       RETURNING *;`,
      [
        exercice ?? null,
        code ?? null,
        numero_article ?? null,
        numero_paragraphe ?? null,
        numero_ligne ?? null,
        nature.toString().trim(),
        Number(montant_report || 0),
        Number(montant_consolide || 0),
        Number(budget_nouveau || 0),
        id,
      ]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Imputation introuvable" });
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Erreur PUT /finance/imputations/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/finance/imputations/:id", requirePermission("finance", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
    await pool.query(`DELETE FROM imputations WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur DELETE /finance/imputations/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});


router.post("/finance/paiements", requirePermission("finance", "write"), async (req, res) => {
  try {
    // accepter id_marche ou marche_id (au cas où ton HTML envoie marche_id)
    const id_marche = req.body.id_marche ?? req.body.marche_id;

    const {
      montant,
      date_paiement,
      reference,
      mode,
      observation,

      // Nouveaux champs
      imputation_id,
      imputation_nature,
      imputation_source, // REPORT | CONSOLIDE | NOUVEAU
    } = req.body || {};

    if (!id_marche || montant === undefined || montant === null || !date_paiement) {
      return res.status(400).json({ error: "id_marche (ou marche_id), montant, date_paiement requis" });
    }

    // Résoudre l'imputation (obligatoire)
    let impId = imputation_id ? Number(imputation_id) : null;

    if (!impId && imputation_nature) {
      const rImp = await pool.query(`SELECT id FROM imputations WHERE nature = $1`, [imputation_nature]);
      if (rImp.rowCount > 0) impId = rImp.rows[0].id;
    }

    // Si toujours null, on peut tenter de prendre celle du marché
    if (!impId) {
      const rM = await pool.query(`SELECT imputation_id FROM marches WHERE id = $1`, [id_marche]);
      if (rM.rowCount > 0) impId = rM.rows[0].imputation_id;
    }

    if (!impId) {
      return res.status(400).json({ error: "Imputation requise (choisir une Nature d'imputation)." });
    }

    // Type source (obligatoire)
    const src = (imputation_source || "").toString().trim().toUpperCase();
    const allowed = ["REPORT", "CONSOLIDE", "NOUVEAU"];
    if (!allowed.includes(src)) {
      return res.status(400).json({ error: "imputation_source requis: REPORT, CONSOLIDE ou NOUVEAU" });
    }

    const montantNum = Number(montant);
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      return res.status(400).json({ error: "montant invalide" });
    }

    // Charger budgets imputation
    const rBud = await pool.query(
      `SELECT
        COALESCE(montant_report,0) AS montant_report,
        COALESCE(montant_consolide,0) AS montant_consolide,
        COALESCE(budget_nouveau,0) AS budget_nouveau
       FROM imputations
       WHERE id = $1`,
      [impId]
    );
    if (rBud.rowCount === 0) return res.status(400).json({ error: "Imputation introuvable." });

    const bud = rBud.rows[0];
    const totalBudget = Number(bud.montant_report) + Number(bud.montant_consolide) + Number(bud.budget_nouveau);

    // Sommes déjà payées sur cette imputation (total + par source)
    const rSum = await pool.query(
      `SELECT
        COALESCE(SUM(montant),0) AS total,
        COALESCE(SUM(CASE WHEN imputation_source='REPORT' THEN montant ELSE 0 END),0) AS report,
        COALESCE(SUM(CASE WHEN imputation_source='CONSOLIDE' THEN montant ELSE 0 END),0) AS consolide,
        COALESCE(SUM(CASE WHEN imputation_source='NOUVEAU' THEN montant ELSE 0 END),0) AS nouveau
       FROM paiements
       WHERE imputation_id = $1`,
      [impId]
    );

    const sums = rSum.rows[0];
    const totalAfter = Number(sums.total) + montantNum;

    // 1) Interdire dépassement du total (somme des 3 montants)
    if (totalAfter > totalBudget + 1e-6) {
      return res.status(400).json({
        error: `Dépassement interdit: total paiements (${totalAfter.toFixed(2)}) > budget total imputation (${totalBudget.toFixed(2)}).`,
      });
    }

    // 2) (Plus strict, recommandé) Interdire dépassement par enveloppe choisie
    let cap = 0;
    let used = 0;
    if (src === "REPORT") {
      cap = Number(bud.montant_report);
      used = Number(sums.report);
    } else if (src === "CONSOLIDE") {
      cap = Number(bud.montant_consolide);
      used = Number(sums.consolide);
    } else {
      cap = Number(bud.budget_nouveau);
      used = Number(sums.nouveau);
    }
    if (used + montantNum > cap + 1e-6) {
      return res.status(400).json({
        error: `Dépassement interdit sur ${src}: (${(used + montantNum).toFixed(2)}) > plafond (${cap.toFixed(2)}).`,
      });
    }

    const r = await pool.query(
      `INSERT INTO paiements (id_marche, montant, date_paiement, reference, mode, observation, imputation_id, imputation_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id_marche, montantNum, date_paiement, reference || null, mode || null, observation || null, impId, src]
    );

    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error("Erreur POST /finance/paiements:", e.message);
    res.status(500).json({ error: e.message });
  }
});


/* -------------------- SYNTHESE -------------------- */
router.get("/finance/synthese", async (req, res) => {
  try {
    const { annee, date_from, date_to } = req.query;

    let wherePaiements = "";
    const params = [];

    if (annee) {
      const y = Number(annee);
      if (!Number.isFinite(y)) return res.status(400).json({ error: "annee invalide" });
      params.push(`${y}-01-01`, `${y}-12-31`);
      wherePaiements = `WHERE p.date_paiement BETWEEN $1 AND $2`;
    } else if (date_from && date_to) {
      params.push(date_from, date_to);
      wherePaiements = `WHERE p.date_paiement BETWEEN $1 AND $2`;
    } else if (date_from) {
      params.push(date_from);
      wherePaiements = `WHERE p.date_paiement >= $1`;
    } else if (date_to) {
      params.push(date_to);
      wherePaiements = `WHERE p.date_paiement <= $1`;
    }

    const q = `
      WITH t_marches AS (
        SELECT projet_id, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_marche, COUNT(*)::int AS nb_marches, COUNT(DISTINCT ao_id)::int AS nb_ao
        FROM marches
        GROUP BY projet_id
      ),
      t_paiements AS (
        SELECT m.projet_id, SUM(COALESCE(p.montant,0))::numeric(14,2) AS montant_paye
        FROM paiements p
        JOIN marches m ON m.id = p.id_marche
        ${wherePaiements}
        GROUP BY m.projet_id
      )
      SELECT
        pr.id,
        pr.programme_id,
        COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text)) AS programme_label,
        ff.nom AS fonds_nom,
        pr.code,
        pr.intitule,
        pr.statut,
        COALESCE(pr.budget_previsionnel,0)::numeric(14,2) AS budget_previsionnel,
        COALESCE(tm.montant_marche,0)::numeric(14,2) AS montant_marche,
        COALESCE(tm.nb_marches,0)::int AS nb_marches,
        COALESCE(tm.nb_ao,0)::int AS nb_ao,
        COALESCE(tp.montant_paye,0)::numeric(14,2) AS montant_paye,
        (COALESCE(tm.montant_marche,0) - COALESCE(tp.montant_paye,0))::numeric(14,2) AS reste_a_payer,
        CASE
          WHEN COALESCE(tm.montant_marche,0) > 0
          THEN ROUND((COALESCE(tp.montant_paye,0) * 100.0) / COALESCE(tm.montant_marche,0), 2)
          ELSE 0
        END AS taux_execution_paiement
      FROM projets pr
      LEFT JOIN programmes pg ON pg.id = pr.programme_id
      LEFT JOIN fonds_financement ff ON ff.id = pg.fonds_financement_id
      LEFT JOIN t_marches tm ON tm.projet_id = pr.id
      LEFT JOIN t_paiements tp ON tp.projet_id = pr.id
      ORDER BY pr.id DESC
      LIMIT 2000;
    `;

    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/synthese:", e.message);
    res.status(500).json({ error: e.message });
  }
});


/* -------------------- DOCUMENTS DES MARCHÉS -------------------- */
router.get("/finance/marche-documents", async (req, res) => {
  try {
    const { numero_marche, marche_id } = req.query || {};
    const params = [];
    const where = [];

    if (marche_id) {
      params.push(Number(marche_id));
      where.push(`md.marche_id = $${params.length}`);
    }
    if (numero_marche) {
      params.push(String(numero_marche).trim());
      where.push(`md.numero_marche = $${params.length}`);
    }

    const r = await pool.query(
      `SELECT
         md.id,
         md.marche_id,
         md.numero_marche,
         md.original_name,
         md.stored_name,
         md.web_path,
         md.mime_type,
         md.file_size,
         md.description,
         md.created_at,
         m.objet,
         pr.code AS projet_code,
         pr.intitule AS projet_intitule,
         f.nom AS fournisseur_nom
       FROM marche_documents md
       JOIN marches m ON m.id = md.marche_id
       LEFT JOIN projets pr ON pr.id = m.projet_id
       LEFT JOIN fournisseurs f ON f.id = m.fournisseur_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY md.created_at DESC, md.id DESC
       LIMIT 500;`,
      params
    );

    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /finance/marche-documents:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post(
  "/finance/marche-documents",
  requirePermission("finance", "write"),
  upload.single("document"),
  async (req, res) => {
    try {
      const numero = String(req.body?.numero_marche || "").trim();
      const description = req.body?.description ? String(req.body.description).trim() : null;

      if (!numero) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: "numero_marche requis" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "document requis" });
      }

      const m = await pool.query(
        `SELECT m.id, m.numero_marche, pr.code AS projet_code, pr.intitule AS projet_intitule, f.nom AS fournisseur_nom
         FROM marches m
         LEFT JOIN projets pr ON pr.id = m.projet_id
         LEFT JOIN fournisseurs f ON f.id = m.fournisseur_id
         WHERE TRIM(m.numero_marche) = $1
         ORDER BY m.id DESC`,
        [numero]
      );

      if (m.rowCount === 0) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Aucun marché trouvé pour ce numéro" });
      }
      if (m.rowCount > 1) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(409).json({ error: "Plusieurs marchés portent ce numéro. Merci d'unifier le numéro de marché avant upload." });
      }

      const marche = m.rows[0];
      const webPath = `/uploads/marches/${req.file.filename}`;

      const r = await pool.query(
        `INSERT INTO marche_documents (
           marche_id, numero_marche, original_name, stored_name, web_path, mime_type, file_size, description
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, marche_id, numero_marche, original_name, stored_name, web_path, mime_type, file_size, description, created_at;`,
        [
          marche.id,
          marche.numero_marche,
          req.file.originalname,
          req.file.filename,
          webPath,
          req.file.mimetype || null,
          req.file.size || 0,
          description,
        ]
      );

      res.status(201).json({ ...r.rows[0], ...marche });
    } catch (e) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error("Erreur POST /finance/marche-documents:", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

router.delete("/finance/marche-documents/:id", requirePermission("finance", "write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });

    const r = await pool.query(`DELETE FROM marche_documents WHERE id = $1 RETURNING *`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Document introuvable" });

    const filePath = path.join(process.cwd(), r.rows[0].web_path.replace(/^\//, ""));
    fs.unlink(filePath, () => {});

    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur DELETE /finance/marche-documents/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
