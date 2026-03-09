const $ = (sel) => document.querySelector(sel);

function setMsg(text, ok = true) {
  const el = $("#msg-projet");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = ok ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
}

function setImportMsg(text, ok = true) {
  const el = $("#msg-import");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = ok ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
}

function parseFrNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(v) {
  const n = parseFrNumber(v) ?? 0;
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchJSON(url) {
  const res = await authFetch(url);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || data?.message || text || "Erreur API");
  return data;
}

async function sendJSON(url, body, method="POST") {
  const res = await authFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || data?.message || text || "Erreur API");
  return data;
}

const map = L.map("map").setView([32.5, -7.5], 8);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: { polyline:false, circle:false, circlemarker:false, rectangle:true, marker:true, polygon:true }
});
map.addControl(drawControl);

function setGeom(geojsonOrNull) {
  const input = document.querySelector('input[name="geom"]');
  const status = $("#geom-status");
  if (!geojsonOrNull) {
    input.value = "";
    status.textContent = "Aucune";
    return;
  }
  input.value = JSON.stringify(geojsonOrNull);
  status.textContent = geojsonOrNull.type || "OK";
}

function clearDraw() {
  drawnItems.clearLayers();
  setGeom(null);
}

map.on(L.Draw.Event.CREATED, function (event) {
  clearDraw();
  const layer = event.layer;
  drawnItems.addLayer(layer);
  const gj = layer.toGeoJSON();
  setGeom(gj.geometry);
});
map.on("draw:edited", function () {
  const layers = drawnItems.getLayers();
  if (layers.length > 0) setGeom(layers[0].toGeoJSON().geometry);
});
map.on("draw:deleted", clearDraw);

async function loadProgrammes() {
  try {
    const progs = await fetchJSON("/api/programmes");
    const select = $("#programme_id");
    const selectImport = $("#import_programme_id");
    const html = `<option value="">-- Aucun --</option>` + progs.map(p => `<option value="${p.id}">${p.label}</option>`).join("");
    if (select) select.innerHTML = html;
    if (selectImport) selectImport.innerHTML = html;
  } catch (e) {
    console.warn("Impossible de charger /api/programmes:", e.message);
  }
}

async function loadBeneficiaires() {
  try {
    const list = await fetchJSON("/api/beneficiaires/options");
    const select = $("#beneficiaire_id");
    if (!select) return;
    select.innerHTML = `<option value="">-- Aucun --</option>` + list.map(b => `<option value="${b.id}" data-type="${(b.type||'').replace(/"/g,'&quot;')}">${b.label}</option>`).join("");
  } catch (e) {
    console.warn("Impossible de charger /api/beneficiaires/options:", e.message);
  }
}

$("#beneficiaire_id")?.addEventListener("change", (e) => {
  const opt = e.target.selectedOptions?.[0];
  const typeInput = $("#type_beneficiaire");
  const nomInput = $("#nom_beneficiaire");
  if (!opt || !opt.value) return;
  if (typeInput && !typeInput.value) typeInput.value = opt.dataset.type || "";
  if (nomInput) nomInput.value = opt.textContent.replace(/^.*? - /, "");
});

let projets = [];

function renderTable(list) {
  const tbody = $("#table-projets tbody");
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>${p.code || ""}</td>
      <td>
        <div style="font-weight:600">${p.intitule || ""}</div>
        <div style="color:var(--muted); font-size:12px;">
          ${p.commune_rurale ? `Commune: ${p.commune_rurale} • ` : ""}
          ${p.numero_dossier ? `Dossier: ${p.numero_dossier} • ` : ""}
          ${p.type_beneficiaire ? `Type: ${p.type_beneficiaire}` : ""}
        </div>
      </td>
      <td>${p.beneficiaire_label || p.nom_beneficiaire || p.nom_agriculteur || ""}</td>
      <td>${p.statut || ""}</td>
      <td>${formatMoney(p.budget_previsionnel)}</td>
      <td>${formatMoney(p.cout_investissement)}</td>
      <td>${formatMoney(p.subvention)}</td>
      <td>
        <div class="actions">
          <button class="small-btn" data-action="zoom" data-id="${p.id}">Voir</button>
          <button class="small-btn" data-action="edit" data-id="${p.id}">Modifier</button>
          <button class="small-btn danger" data-action="delete" data-id="${p.id}">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join("");
  $("#count-projets").textContent = `${list.length} projet(s)`;
}

function projectMatches(p, q) {
  q = q.toLowerCase();
  return [p.code, p.intitule, p.numero_dossier, p.commune_rurale, p.cercle, p.douar, p.type_beneficiaire, p.nom_beneficiaire, p.beneficiaire_label]
    .filter(Boolean)
    .some(v => String(v).toLowerCase().includes(q));
}

async function loadProjets() {
  projets = await fetchJSON("/api/projets");
  renderTable(projets);
}

function fillForm(p) {
  const f = $("#form-projet");
  f.id.value = p.id || "";
  f.programme_id.value = p.programme_id || "";
  f.beneficiaire_id.value = p.beneficiaire_id || "";
  f.type_beneficiaire.value = p.type_beneficiaire || "";
  f.nom_beneficiaire.value = p.nom_beneficiaire || p.beneficiaire_label || "";
  f.code.value = p.code || "";
  f.intitule.value = p.intitule || "";
  f.filiere.value = p.filiere || "";
  f.budget_previsionnel.value = p.budget_previsionnel || "";
  f.date_debut.value = p.date_debut ? String(p.date_debut).slice(0,10) : "";
  f.date_fin.value = p.date_fin ? String(p.date_fin).slice(0,10) : "";
  f.statut.value = p.statut || "EN_COURS";
  f.nom_exploitation.value = p.nom_exploitation || "";
  f.superficie_bour.value = p.superficie_bour || "";
  f.superficie_irriguee.value = p.superficie_irriguee || "";
  f.superficie_totale.value = p.superficie_totale || "";
  f.commune_rurale.value = p.commune_rurale || "";
  f.cercle.value = p.cercle || "";
  f.douar.value = p.douar || "";
  f.numero_dossier.value = p.numero_dossier || "";
  f.superficie_parcelle_aide.value = p.superficie_parcelle_aide || "";
  f.classe_investissement.value = p.classe_investissement || "";
  f.cout_investissement.value = p.cout_investissement || "";
  f.subvention.value = p.subvention || "";
  f.x1.value = p.x1 || "";
  f.y1.value = p.y1 || "";
  f.x2.value = p.x2 || "";
  f.y2.value = p.y2 || "";

  clearDraw();
  if (p.geometry) {
    const layer = L.geoJSON({ type: "Feature", geometry: p.geometry, properties: {} });
    layer.eachLayer((l) => drawnItems.addLayer(l));
    try { map.fitBounds(layer.getBounds(), { maxZoom: 15 }); } catch {}
    setGeom(p.geometry);
  }
  $("#form-title").textContent = `✏️ Modifier projet #${p.id}`;
}

function resetForm() {
  const f = $("#form-projet");
  f.reset();
  f.id.value = "";
  clearDraw();
  $("#form-title").textContent = "➕ Nouveau projet";
  setMsg("");
}

$("#btn-reset")?.addEventListener("click", resetForm);
$("#search-projets")?.addEventListener("input", (e) => {
  const q = e.target.value.trim();
  renderTable(!q ? projets : projets.filter(p => projectMatches(p, q)));
});

$("#table-projets")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  const p = projets.find(x => x.id === id);
  if (!p) return;

  if (action === "zoom") {
    if (p.geometry) {
      clearDraw();
      const layer = L.geoJSON({ type: "Feature", geometry: p.geometry, properties: {} });
      layer.eachLayer((l) => drawnItems.addLayer(l));
      try { map.fitBounds(layer.getBounds(), { maxZoom: 15 }); } catch {}
      setGeom(p.geometry);
    }
    fillForm(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (action === "edit") {
    fillForm(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (action === "delete") {
    if (!confirm("Supprimer ?")) return;
    try {
      await sendJSON(`/api/projets/${id}`, {}, "DELETE");
      setMsg("✅ Supprimé.", true);
      resetForm();
      await loadProjets();
    } catch (err) {
      setMsg(`❌ ${err.message}`, false);
    }
  }
});

$("#form-projet")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("Enregistrement...", true);
  const form = e.target;

  const body = {
    programme_id: form.programme_id.value ? Number(form.programme_id.value) : null,
    beneficiaire_id: form.beneficiaire_id.value ? Number(form.beneficiaire_id.value) : null,
    type_beneficiaire: form.type_beneficiaire.value.trim() || null,
    nom_beneficiaire: form.nom_beneficiaire.value.trim() || null,
    code: form.code.value.trim(),
    intitule: form.intitule.value.trim(),
    filiere: form.filiere.value.trim() || null,
    budget_previsionnel: parseFrNumber(form.budget_previsionnel.value),
    date_debut: form.date_debut.value || null,
    date_fin: form.date_fin.value || null,
    statut: form.statut.value || "EN_COURS",
    nom_exploitation: form.nom_exploitation.value.trim() || null,
    superficie_bour: parseFrNumber(form.superficie_bour.value),
    superficie_irriguee: parseFrNumber(form.superficie_irriguee.value),
    superficie_totale: parseFrNumber(form.superficie_totale.value),
    commune_rurale: form.commune_rurale.value.trim() || null,
    cercle: form.cercle.value.trim() || null,
    douar: form.douar.value.trim() || null,
    numero_dossier: form.numero_dossier.value.trim() || null,
    superficie_parcelle_aide: parseFrNumber(form.superficie_parcelle_aide.value),
    classe_investissement: form.classe_investissement.value.trim() || null,
    cout_investissement: parseFrNumber(form.cout_investissement.value),
    subvention: parseFrNumber(form.subvention.value),
    x1: parseFrNumber(form.x1.value),
    y1: parseFrNumber(form.y1.value),
    x2: parseFrNumber(form.x2.value),
    y2: parseFrNumber(form.y2.value),
    geom: form.geom.value ? JSON.parse(form.geom.value) : null,
  };

  try {
    if (form.id.value) {
      await sendJSON(`/api/projets/${form.id.value}`, body, "PUT");
      setMsg("✅ Modifié.", true);
    } else {
      await sendJSON("/api/projets", body, "POST");
      setMsg("✅ Ajouté.", true);
    }
    resetForm();
    await loadProjets();
  } catch (err) {
    setMsg(`❌ ${err.message}`, false);
  }
});

$("#form-import")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("#file-excel")?.files?.[0];
  if (!file) return setImportMsg("❌ Choisis un fichier .xlsx", false);
  setImportMsg("Import en cours...", true);

  const fd = new FormData();
  fd.append("file", file);
  fd.append("programme_id", $("#import_programme_id")?.value || "");
  fd.append("filiere", $("#import_filiere")?.value || "");
  fd.append("statut", $("#import_statut")?.value || "IMPORTED");
  fd.append("date_debut", $("#import_date_debut")?.value || "");
  fd.append("date_fin", $("#import_date_fin")?.value || "");

  try {
    const res = await authFetch("/api/projets/import-excel", { method:"POST", body: fd });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok) throw new Error(data?.error || text || "Erreur import");
    setImportMsg(`✅ Import terminé. Insérés: ${data.inserted} | Rejetés: ${data.rejected}`, true);
    await loadProjets();
  } catch (err) {
    setImportMsg(`❌ ${err.message}`, false);
  }
});

(async function init(){
  try {
    await loadProgrammes();
    await loadBeneficiaires();
    await loadProjets();
  } catch (e) {
    console.error(e);
    alert("Erreur chargement projets/bénéficiaires/programmes.");
  }
})();
