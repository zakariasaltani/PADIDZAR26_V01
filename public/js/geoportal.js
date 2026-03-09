const map = L.map("map", { preferCanvas: true }).setView([31.85, -7.95], 8);

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
});

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles &copy; Esri", maxZoom: 19 }
);

osm.addTo(map);

const baseMaps = {
  "OpenStreetMap": osm,
  "Satellite (Esri)": esriSat,
};
const overlayMaps = {};
const layerRegistry = new Map();
let layersMeta = [];
let layersControl = L.control.layers(baseMaps, overlayMaps, { position: "topright", collapsed: false }).addTo(map);

L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

const coordsControl = L.control({ position: "bottomright" });
coordsControl.onAdd = function () {
  const div = L.DomUtil.create("div", "coords-indicator");
  div.innerHTML = "Lat: — | Lng: —";
  return div;
};
coordsControl.addTo(map);

map.on("mousemove", (e) => {
  const div = document.querySelector(".coords-indicator");
  if (div) {
    div.innerHTML = `Lat: ${e.latlng.lat.toFixed(5)} | Lng: ${e.latlng.lng.toFixed(5)}`;
  }
});

const infoControl = L.control({ position: "topleft" });
infoControl.onAdd = function () {
  const div = L.DomUtil.create("div", "geoportal-panel");
  div.innerHTML = `
    <div class="panel-title">Couches géographiques</div>
    <div id="geoportal-status" class="panel-status">Chargement des couches…</div>
    <div id="legend-body" class="legend-body"></div>
  `;
  return div;
};
infoControl.addTo(map);

function $(sel) {
  return document.querySelector(sel);
}

function setStatus(message, isError = false) {
  const el = $("#geoportal-status");
  if (!el) return;
  el.textContent = message;
  el.className = `panel-status${isError ? " error" : ""}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPopup(meta, props) {
  const entries = Object.entries(props || {}).filter(([, value]) => value !== null && value !== "");
  const titleValue =
    props.nom ||
    props.name ||
    props.nom_benef ||
    props.code ||
    props.intitule ||
    props.numero_marche ||
    meta.label;

  const rows = entries.slice(0, 10).map(([key, value]) => `
    <tr>
      <th>${escapeHtml(key)}</th>
      <td>${escapeHtml(value)}</td>
    </tr>
  `).join("");

  return `
    <div class="popup-card">
      <div class="popup-title">${escapeHtml(meta.popupTitle || meta.label)}</div>
      <div class="popup-subtitle">${escapeHtml(titleValue)}</div>
      <table class="popup-table">${rows || "<tr><td>Aucune donnée</td></tr>"}</table>
    </div>
  `;
}

function createLeafletLayer(meta, geojson) {
  const style = meta.style || {};
  const geometryType = (geojson.geometryType || meta.geometryType || "").toLowerCase();
  const isPoint = geometryType.includes("point") || geometryType.includes("multipoint");
  const isLine = geometryType.includes("line");

  return L.geoJSON(geojson, {
    style: () => ({
      color: style.color || "#2563eb",
      weight: style.weight || (isLine ? 3 : 2),
      fillColor: style.color || "#2563eb",
      fillOpacity: typeof style.fillOpacity === "number" ? style.fillOpacity : (isLine ? 0 : 0.15),
    }),
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
      radius: style.radius || 6,
      color: style.color || "#2563eb",
      weight: 2,
      fillColor: style.color || "#2563eb",
      fillOpacity: typeof style.fillOpacity === "number" ? style.fillOpacity : 0.75,
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopup(meta, feature.properties));
      layer.on("mouseover", () => {
        if (layer.setStyle) {
          layer.setStyle({ weight: (style.weight || 2) + 1, fillOpacity: Math.min((style.fillOpacity ?? 0.2) + 0.1, 0.9) });
        }
      });
      layer.on("mouseout", () => {
        if (layer.setStyle) {
          layer.setStyle({
            color: style.color || "#2563eb",
            weight: style.weight || 2,
            fillColor: style.color || "#2563eb",
            fillOpacity: typeof style.fillOpacity === "number" ? style.fillOpacity : (isLine ? 0 : 0.15),
          });
        }
      });
    }
  });
}

async function fetchJSON(url) {
  const res = await authFetch(url);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data.error || text || `Erreur API (${res.status})`);
  return data;
}

async function loadLayer(meta, shouldZoom = false) {
  if (layerRegistry.has(meta.key)) {
    return layerRegistry.get(meta.key);
  }

  const geojson = await fetchJSON(`/api/geoportal/layers/${meta.key}`);
  const leafletLayer = createLeafletLayer(meta, geojson);
  overlayMaps[meta.label] = leafletLayer;
  layerRegistry.set(meta.key, leafletLayer);
  layersControl.remove();
  layersControl = L.control.layers(baseMaps, overlayMaps, { position: "topright", collapsed: false }).addTo(map);

  if (meta.defaultVisible) {
    leafletLayer.addTo(map);
  }

  if (shouldZoom) {
    try {
      const bounds = leafletLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    } catch {}
  }

  refreshLegend();
  return leafletLayer;
}

function refreshLegend() {
  const body = $("#legend-body");
  if (!body) return;

  body.innerHTML = layersMeta
    .filter((meta) => meta.available)
    .map((meta) => {
      const layer = layerRegistry.get(meta.key);
      const active = layer && map.hasLayer(layer);
      return `
        <div class="legend-item ${active ? 'active' : ''}">
          <span class="legend-swatch" style="background:${meta.style?.color || '#2563eb'}"></span>
          <div class="legend-text">
            <div class="legend-name">${escapeHtml(meta.label)}</div>
            <div class="legend-meta">${escapeHtml(meta.geometryType || 'N/A')} · ${meta.featureCount || 0} objet(s)</div>
          </div>
        </div>
      `;
    })
    .join("");
}

map.on("overlayadd", refreshLegend);
map.on("overlayremove", refreshLegend);

async function initGeoportal() {
  try {
    layersMeta = await fetchJSON("/api/geoportal/layers");
    const availableLayers = layersMeta.filter((item) => item.available);

    if (!availableLayers.length) {
      setStatus("Aucune couche géométrique disponible.", true);
      refreshLegend();
      return;
    }

    setStatus(`${availableLayers.length} couche(s) disponible(s).`);

    let firstVisibleLoaded = false;
    for (const meta of availableLayers) {
      await loadLayer(meta, meta.defaultVisible && !firstVisibleLoaded);
      if (meta.defaultVisible && !firstVisibleLoaded) {
        firstVisibleLoaded = true;
      }
    }

    refreshLegend();
  } catch (e) {
    console.error(e);
    setStatus(e.message || "Erreur de chargement du géoportail.", true);
  }
}

initGeoportal();
