const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("dashboard", "read"));

function asInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function columnExists(table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
    [table, column]
  );
  return r.rowCount > 0;
}

async function getGeometryColumn(table) {
  const g = await pool.query(
    `SELECT f_geometry_column AS geom_col FROM public.geometry_columns WHERE f_table_schema='public' AND f_table_name=$1 LIMIT 1`,
    [table]
  );
  if (g.rows[0]?.geom_col) return g.rows[0].geom_col;
  const f = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND udt_name='geometry' LIMIT 1`,
    [table]
  );
  return f.rows[0]?.column_name || null;
}

async function getCommuneTableInfo() {
  const tables = ["commune_rhamna", "communes", "commune", "communes_ms", "communes_marrakech_safi"];
  for (const table of tables) {
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
      [table]
    );
    if (!exists.rowCount) continue;
    const geomCol = await getGeometryColumn(table);
    if (!geomCol) continue;
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table]
    );
    const candidates = ["commune", "nom", "name", "libelle", "commune_rurale", "nom_commune"];
    const labelCol = candidates.find((c) => cols.rows.some((r) => r.column_name === c)) || null;
    return { table, geomCol, labelCol };
  }
  return null;
}

function buildFilterClause(q = {}, params = []) {
  const where = [];
  const programmeId = q.programme_id ? asInt(q.programme_id) : null;
  const projetId = q.projet_id ? asInt(q.projet_id) : null;
  const aoId = q.ao_id ? asInt(q.ao_id) : null;
  const marcheId = q.marche_id ? asInt(q.marche_id) : null;
  const exercice = q.exercice ? asInt(q.exercice) : null;
  const commune = q.commune ? String(q.commune).trim() : null;
  const statut = q.statut ? String(q.statut).trim() : null;
  const dateFrom = q.date_from ? String(q.date_from).trim() : null;
  const dateTo = q.date_to ? String(q.date_to).trim() : null;

  if (programmeId) {
    params.push(programmeId);
    where.push(`pr.programme_id = $${params.length}`);
  }
  if (projetId) {
    params.push(projetId);
    where.push(`pr.id = $${params.length}`);
  }
  if (aoId) {
    params.push(aoId);
    where.push(`m.ao_id = $${params.length}`);
  }
  if (marcheId) {
    params.push(marcheId);
    where.push(`m.id = $${params.length}`);
  }
  if (statut) {
    params.push(statut);
    where.push(`UPPER(COALESCE(pr.statut,'')) = UPPER($${params.length})`);
  }
  if (commune) {
    params.push(commune);
    where.push(`TRIM(UPPER(COALESCE(pr.commune_rurale,''))) = TRIM(UPPER($${params.length}))`);
  }
  if (exercice) {
    params.push(exercice);
    where.push(`EXTRACT(YEAR FROM COALESCE(pa.date_paiement, m.date_signature, pr.date_debut, pr.date_fin, NOW())) = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`COALESCE(pa.date_paiement, m.date_signature, pr.date_debut, pr.date_fin, NOW()::date) >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`COALESCE(pa.date_paiement, m.date_signature, pr.date_debut, pr.date_fin, NOW()::date) <= $${params.length}`);
  }

  return {
    where,
    params,
    filters: {
      programme_id: programmeId,
      projet_id: projetId,
      ao_id: aoId,
      marche_id: marcheId,
      exercice,
      commune,
      statut,
      date_from: dateFrom,
      date_to: dateTo
    }
  };
}

async function getReportData(query) {
  const params = [];
  const { where, filters } = buildFilterClause(query, params);
  const sql = `
    WITH pay AS (
      SELECT id_marche, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_paye, MAX(date_paiement) AS derniere_date_paiement
      FROM paiements
      GROUP BY id_marche
    )
    SELECT
      pg.id AS programme_id,
      COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text)) AS programme,
      pg.code AS programme_code,
      pr.id AS projet_id,
      pr.code AS projet_code,
      pr.intitule AS projet_intitule,
      pr.statut,
      COALESCE(pr.budget_previsionnel,0)::numeric(14,2) AS budget_previsionnel,
      COALESCE(pr.commune_rurale,'') AS commune_rurale,
      COALESCE(pr.type_beneficiaire,'') AS type_beneficiaire,
      COALESCE(b.nom_benef, pr.nom_beneficiaire, pr.nom_agriculteur, '') AS beneficiaire,
      ao.id AS ao_id,
      COALESCE(ao.numero_ao,'') AS numero_ao,
      COALESCE(ao.objet,'') AS ao_objet,
      COALESCE(ao.statut,'') AS ao_statut,
      m.id AS marche_id,
      COALESCE(m.numero_marche,'') AS numero_marche,
      COALESCE(m.objet,'') AS marche_objet,
      COALESCE(m.statut,'') AS marche_statut,
      m.date_signature,
      COALESCE(m.montant,0)::numeric(14,2) AS marche_montant,
      COALESCE(pay.montant_paye,0)::numeric(14,2) AS montant_paye,
      (COALESCE(m.montant,0) - COALESCE(pay.montant_paye,0))::numeric(14,2) AS reste_a_payer,
      pay.derniere_date_paiement,
      COALESCE(f.nom,'') AS fournisseur,
      EXTRACT(YEAR FROM COALESCE(pay.derniere_date_paiement, m.date_signature, pr.date_debut, pr.date_fin, NOW()))::int AS exercice
    FROM projets pr
    LEFT JOIN programmes pg ON pg.id = pr.programme_id
    LEFT JOIN beneficiaires b ON b.id = pr.beneficiaire_id
    LEFT JOIN marches m ON m.projet_id = pr.id
    LEFT JOIN appels_offres ao ON ao.id = m.ao_id
    LEFT JOIN pay ON pay.id_marche = m.id
    LEFT JOIN paiements pa ON pa.id_marche = m.id
    LEFT JOIN fournisseurs f ON f.id = m.fournisseur_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY
      pg.id, pg.intitule, pg.code,
      pr.id, pr.code, pr.intitule, pr.statut, pr.budget_previsionnel, pr.commune_rurale, pr.type_beneficiaire,
      b.nom_benef, pr.nom_beneficiaire, pr.nom_agriculteur,
      ao.id, ao.numero_ao, ao.objet, ao.statut,
      m.id, m.numero_marche, m.objet, m.statut, m.date_signature, m.montant,
      pay.montant_paye, pay.derniere_date_paiement,
      f.nom
    ORDER BY pg.id DESC NULLS LAST, pr.id DESC, ao.id DESC NULLS LAST, m.id DESC NULLS LAST
    LIMIT 20000
  `;
  const { rows } = await pool.query(sql, params);

  const totals = rows.reduce((acc, r) => {
    acc.projets.add(r.projet_id);
    if (r.marche_id) acc.marches.add(r.marche_id);
    if (r.ao_id) acc.aos.add(r.ao_id);
    if (r.programme_id) acc.programmes.add(r.programme_id);
    if (r.commune_rurale) acc.communes.add(r.commune_rurale);
    acc.budgetTotal += Number(r.budget_previsionnel || 0);
    acc.marchesTotal += Number(r.marche_montant || 0);
    acc.paiementsTotal += Number(r.montant_paye || 0);
    return acc;
  }, { projets: new Set(), marches: new Set(), aos: new Set(), programmes: new Set(), communes: new Set(), budgetTotal: 0, marchesTotal: 0, paiementsTotal: 0 });

  return {
    filters,
    summary: {
      nb_programmes: totals.programmes.size,
      nb_projets: totals.projets.size,
      nb_ao: totals.aos.size,
      nb_marches: totals.marches.size,
      nb_communes: totals.communes.size,
      budget_total: Number(totals.budgetTotal.toFixed(2)),
      marches_total: Number(totals.marchesTotal.toFixed(2)),
      paiements_total: Number(totals.paiementsTotal.toFixed(2)),
      reste_total: Number((totals.marchesTotal - totals.paiementsTotal).toFixed(2))
    },
    rows
  };
}

async function getCommuneFeaturesByNames(names) {
  const info = await getCommuneTableInfo();
  if (!info || !names?.length || !info.labelCol) return { type: 'FeatureCollection', features: [] };
  const sql = `
    SELECT ${quoteIdent(info.labelCol)} AS commune, ST_AsGeoJSON(${quoteIdent(info.geomCol)})::json AS geometry
    FROM ${quoteIdent(info.table)}
    WHERE TRIM(UPPER(COALESCE(${quoteIdent(info.labelCol)}, ''))) = ANY($1)
  `;
  const { rows } = await pool.query(sql, [names.map((v) => String(v).trim().toUpperCase())]);
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { commune: r.commune } }))
  };
}

async function getFilteredMap(query) {
  const params = [];
  const { where } = buildFilterClause(query, params);
  const hasGeom = await columnExists('projets', 'geom');
  const whereMap = [...where];
  whereMap.push('pr.geom IS NOT NULL');
  const projectGeo = hasGeom
    ? await pool.query(`
        WITH pay AS (
          SELECT id_marche, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_paye
          FROM paiements GROUP BY id_marche
        )
        SELECT DISTINCT ON (pr.id)
          pr.id,
          pr.code,
          pr.intitule,
          pr.commune_rurale,
          COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text)) AS programme,
          COALESCE(ao.numero_ao,'') AS numero_ao,
          COALESCE(m.numero_marche,'') AS numero_marche,
          COALESCE(m.montant,0)::numeric(14,2) AS marche_montant,
          COALESCE(pay.montant_paye,0)::numeric(14,2) AS montant_paye,
          ST_AsGeoJSON(pr.geom)::json AS geometry
        FROM projets pr
        LEFT JOIN programmes pg ON pg.id = pr.programme_id
        LEFT JOIN marches m ON m.projet_id = pr.id
        LEFT JOIN appels_offres ao ON ao.id = m.ao_id
        LEFT JOIN pay ON pay.id_marche = m.id
        LEFT JOIN paiements pa ON pa.id_marche = m.id
        ${whereMap.length ? 'WHERE ' + whereMap.join(' AND ') : ''}
        ORDER BY pr.id, COALESCE(m.montant,0) DESC, m.id DESC NULLS LAST
        LIMIT 5000
      `, params)
    : { rows: [] };

  const communeNames = [...new Set(projectGeo.rows.map((r) => r.commune_rurale).filter(Boolean))];
  if (query.commune && !communeNames.length) communeNames.push(query.commune);
  const communes = await getCommuneFeaturesByNames(communeNames);

  return {
    projets: {
      type: 'FeatureCollection',
      features: projectGeo.rows.map((r) => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          id: r.id,
          code: r.code,
          intitule: r.intitule,
          commune_rurale: r.commune_rurale,
          programme: r.programme,
          numero_ao: r.numero_ao,
          numero_marche: r.numero_marche,
          marche_montant: Number(r.marche_montant || 0),
          montant_paye: Number(r.montant_paye || 0)
        }
      }))
    },
    communes
  };
}

router.get('/filter-options', async (_req, res) => {
  try {
    const [programmes, projets, aos, marches, communes, exercices] = await Promise.all([
      pool.query(`SELECT id, COALESCE(intitule, code, ('Programme #' || id::text)) AS label FROM programmes ORDER BY id DESC LIMIT 1000`),
      pool.query(`SELECT id, programme_id, COALESCE(code || ' — ', '') || COALESCE(intitule, ('Projet #' || id::text)) AS label FROM projets ORDER BY id DESC LIMIT 3000`),
      pool.query(`SELECT id, programme_id, COALESCE(numero_ao, ('AO #' || id::text)) AS label FROM appels_offres ORDER BY id DESC LIMIT 3000`),
      pool.query(`SELECT id, projet_id, ao_id, COALESCE(numero_marche, ('Marché #' || id::text)) AS label FROM marches ORDER BY id DESC LIMIT 3000`),
      pool.query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(commune_rurale),''),'') AS commune FROM projets WHERE COALESCE(NULLIF(TRIM(commune_rurale),''),'') <> '' ORDER BY commune`),
      pool.query(`
        SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(pa.date_paiement, m.date_signature, pr.date_debut, pr.date_fin, NOW()))::int AS exercice
        FROM projets pr
        LEFT JOIN marches m ON m.projet_id = pr.id
        LEFT JOIN paiements pa ON pa.id_marche = m.id
        ORDER BY exercice DESC
      `)
    ]);
    res.json({
      programmes: programmes.rows,
      projets: projets.rows,
      aos: aos.rows,
      marches: marches.rows,
      communes: communes.rows.map((r) => r.commune),
      exercices: exercices.rows.map((r) => r.exercice).filter(Boolean)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/overview', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH pay AS (
        SELECT id_marche, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_paye FROM paiements GROUP BY id_marche
      )
      SELECT
        (SELECT COUNT(*)::int FROM programmes) AS nb_programmes,
        (SELECT COUNT(*)::int FROM projets) AS nb_projets,
        (SELECT COUNT(*)::int FROM appels_offres) AS nb_ao,
        (SELECT COUNT(*)::int FROM marches) AS nb_marches,
        (SELECT COUNT(*)::int FROM paiements) AS nb_paiements,
        (SELECT COALESCE(SUM(budget_previsionnel),0)::numeric(14,2) FROM projets) AS budget_total,
        (SELECT COALESCE(SUM(montant),0)::numeric(14,2) FROM marches) AS engagements_total,
        (SELECT COALESCE(SUM(montant),0)::numeric(14,2) FROM paiements) AS paiements_total,
        (SELECT COALESCE(SUM(m.montant),0)::numeric(14,2) - COALESCE(SUM(p.montant_paye),0)::numeric(14,2)
           FROM marches m LEFT JOIN pay p ON p.id_marche = m.id) AS reste_total
    `);
    res.json(rows[0] || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/programmes', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH t_projets AS (
        SELECT programme_id,
               COUNT(*)::int AS n_projets,
               SUM(CASE WHEN UPPER(COALESCE(statut,''))='TERMINE' THEN 1 ELSE 0 END)::int AS n_termine,
               SUM(CASE WHEN UPPER(COALESCE(statut,''))='EN_COURS' THEN 1 ELSE 0 END)::int AS n_en_cours,
               COUNT(DISTINCT NULLIF(TRIM(commune_rurale),''))::int AS n_communes
        FROM projets GROUP BY programme_id
      ),
      t_ao AS (
        SELECT programme_id, COUNT(*)::int AS n_ao
        FROM appels_offres GROUP BY programme_id
      ),
      t_marches AS (
        SELECT pr.programme_id,
               SUM(COALESCE(m.montant,0))::numeric(14,2) AS montant_marche
        FROM marches m JOIN projets pr ON pr.id = m.projet_id GROUP BY pr.programme_id
      ),
      t_paiements AS (
        SELECT pr.programme_id,
               SUM(COALESCE(pa.montant,0))::numeric(14,2) AS montant_paye
        FROM paiements pa
        JOIN marches m ON m.id = pa.id_marche
        JOIN projets pr ON pr.id = m.projet_id
        GROUP BY pr.programme_id
      )
      SELECT pg.id, pg.code, pg.intitule,
             COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text)) AS programme,
             COALESCE(pg.budget_global,0)::numeric(14,2) AS budget_global,
             ff.nom AS fonds_nom, ff.devise AS fonds_devise,
             COALESCE(tp.n_projets,0)::int AS n_projets,
             COALESCE(tp.n_termine,0)::int AS n_termine,
             COALESCE(tp.n_en_cours,0)::int AS n_en_cours,
             COALESCE(tp.n_communes,0)::int AS n_communes,
             COALESCE(ta.n_ao,0)::int AS n_ao,
             COALESCE(tm.montant_marche,0)::numeric(14,2) AS montant_marche,
             COALESCE(tpa.montant_paye,0)::numeric(14,2) AS montant_paye,
             (COALESCE(tm.montant_marche,0) - COALESCE(tpa.montant_paye,0))::numeric(14,2) AS reste_a_payer,
             CASE WHEN COALESCE(tp.n_projets,0)>0 THEN ROUND((COALESCE(tp.n_termine,0) * 100.0) / tp.n_projets, 2) ELSE 0 END AS taux_achevement_projets
      FROM programmes pg
      LEFT JOIN fonds_financement ff ON ff.id = pg.fonds_financement_id
      LEFT JOIN t_projets tp ON tp.programme_id = pg.id
      LEFT JOIN t_ao ta ON ta.programme_id = pg.id
      LEFT JOIN t_marches tm ON tm.programme_id = pg.id
      LEFT JOIN t_paiements tpa ON tpa.programme_id = pg.id
      ORDER BY pg.id DESC
      LIMIT 5000
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/projets', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH t_m AS (
        SELECT projet_id,
               COUNT(DISTINCT ao_id)::int AS n_ao,
               SUM(COALESCE(montant,0))::numeric(14,2) AS montant_marche
        FROM marches GROUP BY projet_id
      ),
      t_p AS (
        SELECT m.projet_id, SUM(COALESCE(pa.montant,0))::numeric(14,2) AS montant_paye
        FROM paiements pa JOIN marches m ON m.id = pa.id_marche GROUP BY m.projet_id
      )
      SELECT pr.id, pr.programme_id, pr.code, pr.intitule, pr.statut,
             COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text)) AS programme,
             COALESCE(pr.budget_previsionnel,0)::numeric(14,2) AS budget_previsionnel,
             COALESCE(t.n_ao,0)::int AS n_ao,
             COALESCE(t.montant_marche,0)::numeric(14,2) AS montant_marche,
             COALESCE(tp.montant_paye,0)::numeric(14,2) AS montant_paye,
             (COALESCE(t.montant_marche,0) - COALESCE(tp.montant_paye,0))::numeric(14,2) AS reste_a_payer,
             COALESCE(pr.commune_rurale,'') AS commune_rurale
      FROM projets pr
      LEFT JOIN programmes pg ON pg.id = pr.programme_id
      LEFT JOIN t_m t ON t.projet_id = pr.id
      LEFT JOIN t_p tp ON tp.projet_id = pr.id
      ORDER BY pr.id DESC
      LIMIT 5000
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/marches', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH t_p AS (
        SELECT id_marche, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_paye
        FROM paiements GROUP BY id_marche
      )
      SELECT m.id, m.numero_marche, m.objet, m.statut, m.date_signature,
             COALESCE(m.montant,0)::numeric(14,2) AS montant,
             COALESCE(tp.montant_paye,0)::numeric(14,2) AS montant_paye,
             (COALESCE(m.montant,0) - COALESCE(tp.montant_paye,0))::numeric(14,2) AS reste_a_payer,
             COALESCE(f.nom,'') AS fournisseur,
             pr.id AS projet_id, pr.code AS projet_code,
             COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text)) AS programme,
             COALESCE(ao.numero_ao,'') AS numero_ao,
             pr.programme_id
      FROM marches m
      LEFT JOIN t_p tp ON tp.id_marche = m.id
      LEFT JOIN fournisseurs f ON f.id = m.fournisseur_id
      LEFT JOIN projets pr ON pr.id = m.projet_id
      LEFT JOIN programmes pg ON pg.id = pr.programme_id
      LEFT JOIN appels_offres ao ON ao.id = m.ao_id
      ORDER BY m.id DESC
      LIMIT 5000
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/beneficiaires', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(type,'—') AS type,
             COALESCE(nom_benef,'—') AS nom,
             COALESCE(nom_president,'') AS nom_president,
             COALESCE(nbre_adherent,0)::int AS nbre_adherent,
             date_creation,
             COALESCE(observations,'') AS observations
      FROM beneficiaires
      ORDER BY id DESC
      LIMIT 5000
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/fournisseurs', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH t_m AS (
        SELECT fournisseur_id, COUNT(*)::int AS n_marches, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_marche
        FROM marches GROUP BY fournisseur_id
      ),
      t_p AS (
        SELECT m.fournisseur_id, SUM(COALESCE(pa.montant,0))::numeric(14,2) AS montant_paye
        FROM paiements pa JOIN marches m ON m.id = pa.id_marche GROUP BY m.fournisseur_id
      )
      SELECT f.id, f.nom, f.ice, f.telephone, f.email,
             COALESCE(t.n_marches,0)::int AS n_marches,
             COALESCE(t.montant_marche,0)::numeric(14,2) AS montant_marche,
             (COALESCE(t.montant_marche,0) - COALESCE(tp.montant_paye,0))::numeric(14,2) AS reste
      FROM fournisseurs f
      LEFT JOIN t_m t ON t.fournisseur_id = f.id
      LEFT JOIN t_p tp ON tp.fournisseur_id = f.id
      ORDER BY t.montant_marche DESC NULLS LAST, f.id DESC
      LIMIT 5000
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/charts/projets-par-statut', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT COALESCE(NULLIF(TRIM(statut),''),'NON_DEFINI') AS statut, COUNT(*)::int AS total FROM projets GROUP BY 1 ORDER BY total DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/charts/budget-par-programme', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(pg.intitule, pg.code, ('Programme #' || pg.id::text), 'Sans programme') AS programme,
             COALESCE(SUM(pr.budget_previsionnel),0)::numeric(14,2) AS budget_total
      FROM projets pr LEFT JOIN programmes pg ON pg.id = pr.programme_id
      GROUP BY 1 ORDER BY budget_total DESC LIMIT 12
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/charts/engagement-paiement', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(m.montant),0)::numeric(14,2) AS engagements,
        COALESCE((SELECT SUM(montant) FROM paiements),0)::numeric(14,2) AS paiements,
        (COALESCE(SUM(m.montant),0) - COALESCE((SELECT SUM(montant) FROM paiements),0))::numeric(14,2) AS reste
      FROM marches m
    `);
    res.json(rows[0] || { engagements: 0, paiements: 0, reste: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/charts/investissements-par-commune', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(NULLIF(TRIM(pr.commune_rurale),''),'Sans commune') AS commune,
             COALESCE(SUM(m.montant),0)::numeric(14,2) AS montant
      FROM projets pr
      LEFT JOIN marches m ON m.projet_id = pr.id
      GROUP BY 1
      ORDER BY montant DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/charts/marches-par-ao', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(ao.numero_ao, 'Sans AO') AS ao,
             COUNT(m.id)::int AS total,
             COALESCE(SUM(m.montant),0)::numeric(14,2) AS montant
      FROM marches m
      LEFT JOIN appels_offres ao ON ao.id = m.ao_id
      GROUP BY 1
      ORDER BY montant DESC, total DESC
      LIMIT 12
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/map/projets-geojson', async (_req, res) => {
  try {
    const data = await getFilteredMap({});
    res.json(data.projets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/map/filtered-geojson', async (req, res) => {
  try {
    const data = await getFilteredMap(req.query || {});
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/programmes/:id/details', async (req, res) => {
  try {
    const programmeId = asInt(req.params.id);
    if (!programmeId) return res.status(400).json({ error: 'ID programme invalide' });
    const programme = await pool.query(`SELECT pg.id, pg.code, pg.intitule, COALESCE(pg.budget_global,0)::numeric(14,2) AS budget_global, ff.nom AS fonds_nom, ff.devise AS fonds_devise FROM programmes pg LEFT JOIN fonds_financement ff ON ff.id = pg.fonds_financement_id WHERE pg.id = $1`, [programmeId]);
    if (!programme.rowCount) return res.status(404).json({ error: 'Programme introuvable' });
    const projets = await pool.query(`
      WITH t_m AS (SELECT projet_id, SUM(COALESCE(montant,0))::numeric(14,2) AS montant_marche FROM marches GROUP BY projet_id)
      SELECT pr.id, pr.code, pr.intitule, pr.statut, COALESCE(pr.budget_previsionnel,0)::numeric(14,2) AS budget_previsionnel, COALESCE(t.montant_marche,0)::numeric(14,2) AS montant_marche, COALESCE(pr.commune_rurale,'') AS commune_rurale
      FROM projets pr LEFT JOIN t_m t ON t.projet_id = pr.id WHERE pr.programme_id = $1 ORDER BY pr.id DESC`, [programmeId]);
    const marches = await pool.query(`
      SELECT m.id, m.numero_marche, COALESCE(m.montant,0)::numeric(14,2) AS montant, m.date_signature, COALESCE(f.nom,'') AS fournisseur, pr.id AS projet_id, pr.code AS projet_code
      FROM marches m LEFT JOIN fournisseurs f ON f.id = m.fournisseur_id LEFT JOIN projets pr ON pr.id = m.projet_id WHERE pr.programme_id = $1 ORDER BY m.id DESC`, [programmeId]);
    res.json({ programme: programme.rows[0], projets: projets.rows, marches: marches.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/report', async (req, res) => {
  try {
    res.json(await getReportData(req.query || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/report.csv', async (req, res) => {
  try {
    const data = await getReportData(req.query || {});
    const lines = [[
      'Programme', 'Projet', 'AO', 'Statut projet', 'Commune', 'Type bénéficiaire', 'Bénéficiaire', 'Marché', 'Objet marché', 'Statut marché', 'Fournisseur', 'Montant marché', 'Montant payé', 'Reste', 'Exercice', 'Date signature'
    ].join(',')];
    data.rows.forEach((r) => {
      lines.push([
        csvEscape(r.programme),
        csvEscape(`${r.projet_code || ''} ${r.projet_intitule || ''}`.trim()),
        csvEscape(r.numero_ao),
        csvEscape(r.statut),
        csvEscape(r.commune_rurale),
        csvEscape(r.type_beneficiaire),
        csvEscape(r.beneficiaire),
        csvEscape(r.numero_marche),
        csvEscape(r.marche_objet),
        csvEscape(r.marche_statut),
        csvEscape(r.fournisseur),
        csvEscape(r.marche_montant),
        csvEscape(r.montant_paye),
        csvEscape(r.reste_a_payer),
        csvEscape(r.exercice),
        csvEscape(r.date_signature ? String(r.date_signature).slice(0, 10) : '')
      ].join(','));
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rapport_dashboard.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/technical-sheet-data', async (req, res) => {
  try {
    const report = await getReportData(req.query || {});
    const map = await getFilteredMap(req.query || {});
    res.json({ ...report, map });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
