const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authRequired, requirePermission } = require("../middleware/auth");

router.use(authRequired);
router.use(requirePermission("geoportail", "read"));

const LAYERS = [
  {
    key: "communes",
    label: "Communes",
    table: "commune_rhamna",
    popupTitle: "Commune",
    defaultVisible: true,
    style: { color: "#2563eb", weight: 2, fillOpacity: 0.05 }
  },
  {
    key: "projets",
    label: "Projets",
    table: "projets",
    popupTitle: "Projet",
    defaultVisible: true,
    style: { color: "#16a34a", weight: 2, fillOpacity: 0.4, radius: 6 }
  },
  {
    key: "beneficiaires",
    label: "Bénéficiaires",
    table: "beneficiaires",
    popupTitle: "Bénéficiaire",
    defaultVisible: true,
    style: { color: "#92400e", weight: 2, fillOpacity: 0.75, radius: 6 }
  },
  {
    key: "barrages",
    label: "Barrages",
    table: "Barrages",
    popupTitle: "Barrage",
    defaultVisible: false,
    style: { color: "#0f766e", weight: 2, fillOpacity: 0.35 }
  },
  {
    key: "les_nappes",
    label: "Les nappes",
    table: "les_nappes",
    popupTitle: "Nappe",
    defaultVisible: false,
    style: { color: "#0891b2", weight: 2, fillOpacity: 0.2 }
  },
  {
    key: "parcours_region_marrakech_safi",
    label: "Parcours Région Marrakech-Safi",
    table: "parcours_Région_Marrakech_safi",
    popupTitle: "Parcours",
    defaultVisible: false,
    style: { color: "#65a30d", weight: 2, fillOpacity: 0.2 }
  },
  {
    key: "piste_realise_dra",
    label: "Pistes réalisées DRA",
    table: "piste_réalisé_DRA",
    popupTitle: "Piste",
    defaultVisible: false,
    style: { color: "#b45309", weight: 3, fillOpacity: 0 }
  },
  {
    key: "perimetres_irrigues",
    label: "Périmètres irrigués",
    table: "Périmètres_irrigués",
    popupTitle: "Périmètre irrigué",
    defaultVisible: false,
    style: { color: "#0ea5e9", weight: 2, fillOpacity: 0.18 }
  },
  {
    key: "systemes_agroforestiers",
    label: "Systèmes agroforestiers",
    table: "systemes_agroforestiers",
    popupTitle: "Système agroforestier",
    defaultVisible: false,
    style: { color: "#15803d", weight: 2, fillOpacity: 0.22 }
  },
  {
    key: "zone_action_ormvah",
    label: "Zone d'action ORMVAH",
    table: "Zone_d'action_ORMVAH",
    popupTitle: "Zone ORMVAH",
    defaultVisible: false,
    style: { color: "#7c3aed", weight: 2, fillOpacity: 0.15 }
  },
  {
    key: "zones_ciblees_padidzar",
    label: "Zones ciblées PADIDZAR",
    table: "zones_ciblées_par_PADIDZAR_-_Sources_document_du_PADIDZAR_",
    popupTitle: "Zone ciblée PADIDZAR",
    defaultVisible: false,
    style: { color: "#dc2626", weight: 2, fillOpacity: 0.15 }
  },
  {
    key: "zones_sinistrees_haouz",
    label: "Zones sinistrées séisme du Haouz",
    table: "Zones_Sinistrées_Séisme_du_HAOUZ_",
    popupTitle: "Zone sinistrée",
    defaultVisible: false,
    style: { color: "#be123c", weight: 2, fillOpacity: 0.15 }
  }
];

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function getGeometryColumn(tableName) {
  const result = await pool.query(
    `
      SELECT f_geometry_column AS geom_col, type
      FROM public.geometry_columns
      WHERE f_table_schema = 'public' AND f_table_name = $1
      LIMIT 1
    `,
    [tableName]
  );

  if (result.rows[0]?.geom_col) {
    return {
      geomCol: result.rows[0].geom_col,
      geometryType: result.rows[0].type || null
    };
  }

  const fallback = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND udt_name = 'geometry'
      LIMIT 1
    `,
    [tableName]
  );

  if (fallback.rows[0]?.column_name) {
    return { geomCol: fallback.rows[0].column_name, geometryType: null };
  }

  return { geomCol: null, geometryType: null };
}

async function buildGeoJSON(layer) {
  const { geomCol, geometryType } = await getGeometryColumn(layer.table);
  if (!geomCol) {
    return {
      ...layer,
      geometryType: geometryType || "Unknown",
      featureCount: 0,
      type: "FeatureCollection",
      features: []
    };
  }

  const idColumnRes = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'
      LIMIT 1
    `,
    [layer.table]
  );
  const hasId = Boolean(idColumnRes.rows[0]);

  const columnsRes = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [layer.table]
  );

  const columns = columnsRes.rows
    .map((r) => r.column_name)
    .filter((col) => col !== geomCol)
    .slice(0, 15);

  const idSelect = hasId ? `${quoteIdent("id")},` : `ROW_NUMBER() OVER () AS id,`;
  const propsSelect = columns.length
    ? `jsonb_build_object(${columns
        .map((col) => `'${col}', ${quoteIdent(col)}`)
        .join(", ")}) AS properties,`
    : `jsonb_build_object() AS properties,`;

  const sql = `
    SELECT
      ${idSelect}
      ${propsSelect}
      ST_AsGeoJSON(${quoteIdent(geomCol)}) AS geometry
    FROM ${quoteIdent(layer.table)}
    WHERE ${quoteIdent(geomCol)} IS NOT NULL
  `;

  const result = await pool.query(sql);

  return {
    ...layer,
    geometryType: geometryType || "Unknown",
    featureCount: result.rowCount,
    type: "FeatureCollection",
    features: result.rows.map((row) => ({
      type: "Feature",
      geometry: JSON.parse(row.geometry),
      properties: {
        id: row.id,
        ...(row.properties || {})
      }
    }))
  };
}

router.get("/geoportal/layers", async (req, res) => {
  try {
    const items = await Promise.all(
      LAYERS.map(async (layer) => {
        const { geomCol, geometryType } = await getGeometryColumn(layer.table);
        let featureCount = 0;

        if (geomCol) {
          const q = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(layer.table)} WHERE ${quoteIdent(geomCol)} IS NOT NULL`;
          const r = await pool.query(q);
          featureCount = r.rows[0]?.count || 0;
        }

        return {
          key: layer.key,
          label: layer.label,
          table: layer.table,
          popupTitle: layer.popupTitle,
          defaultVisible: layer.defaultVisible,
          style: layer.style,
          geometryType: geometryType || "Unknown",
          featureCount,
          available: Boolean(geomCol)
        };
      })
    );

    res.json(items);
  } catch (e) {
    console.error("GET /api/geoportal/layers:", e);
    res.status(500).json({ error: "Erreur chargement liste des couches" });
  }
});

router.get("/geoportal/layers/:key", async (req, res) => {
  try {
    const layer = LAYERS.find((item) => item.key === req.params.key);
    if (!layer) {
      return res.status(404).json({ error: "Couche introuvable" });
    }

    const geojson = await buildGeoJSON(layer);
    res.json(geojson);
  } catch (e) {
    console.error(`GET /api/geoportal/layers/${req.params.key}:`, e);
    res.status(500).json({ error: `Erreur chargement couche ${req.params.key}` });
  }
});

module.exports = router;
