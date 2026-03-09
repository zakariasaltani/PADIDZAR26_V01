const $ = (sel) => document.querySelector(sel);

let dashProgrammes = [];
let dashProjets = [];
let dashMarches = [];
let dashBeneficiaires = [];
let dashFournisseurs = [];
let filterOptions = { programmes: [], projets: [], aos: [], marches: [], communes: [], exercices: [] };
let reportData = null;
let map = null;
let mapBase = null;
let mapProjetsLayer = null;
let mapCommunesLayer = null;
let chartStatut = null;
let chartBudget = null;
let chartFinance = null;
let chartCommunes = null;
let chartAO = null;
let modalChartStatut = null;
let modalChartBudgets = null;
let modalData = null;

function money(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0,00";
}

async function fetchJSON(url) {
  const res = await authFetch(url);
  if (res.status === 403) {
    if (typeof showForbidden === "function") showForbidden("L’accès à cette section vous est interdit");
    const err = new Error("FORBIDDEN");
    err.code = 403;
    throw err;
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
  return data;
}

function pctBadge(v) {
  const n = Number(v ?? 0);
  let cls = "bad";
  if (n >= 80) cls = "good";
  else if (n >= 40) cls = "warn";
  return `<span class="badge ${cls}">${n.toFixed(2)}%</span>`;
}

function htmlEscape(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getReportParams() {
  const params = new URLSearchParams();
  [["programme_id", "#f-programme"], ["projet_id", "#f-projet"], ["ao_id", "#f-ao"], ["marche_id", "#f-marche"], ["exercice", "#f-exercice"], ["commune", "#f-commune"], ["statut", "#f-statut"], ["date_from", "#f-date-from"], ["date_to", "#f-date-to"]].forEach(([key, sel]) => {
    const val = $(sel)?.value;
    if (val) params.set(key, val);
  });
  return params;
}

function setSelectOptions(sel, items, placeholder, getValue = (x) => x.id ?? x, getLabel = (x) => x.label ?? x) {
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => `<option value="${htmlEscape(getValue(item))}">${htmlEscape(getLabel(item))}</option>`).join("");
}

function applyDependentFilters() {
  const programmeId = $("#f-programme")?.value || "";
  const projetId = $("#f-projet")?.value || "";
  const aoId = $("#f-ao")?.value || "";

  const projets = programmeId
    ? filterOptions.projets.filter((p) => String(p.programme_id || "") === String(programmeId))
    : filterOptions.projets;
  setSelectOptions($("#f-projet"), projets, "Tous projets");
  if (projetId && projets.some((p) => String(p.id) === String(projetId))) $("#f-projet").value = projetId;

  const aos = programmeId
    ? filterOptions.aos.filter((a) => String(a.programme_id || "") === String(programmeId))
    : filterOptions.aos;
  setSelectOptions($("#f-ao"), aos, "Tous AO");
  if (aoId && aos.some((a) => String(a.id) === String(aoId))) $("#f-ao").value = aoId;

  const marches = aoId
    ? filterOptions.marches.filter((m) => String(m.ao_id || "") === String(aoId))
    : projetId
      ? filterOptions.marches.filter((m) => String(m.projet_id || "") === String(projetId))
      : filterOptions.marches;
  const currentMarche = $("#f-marche")?.value || "";
  setSelectOptions($("#f-marche"), marches, "Tous marchés");
  if (currentMarche && marches.some((m) => String(m.id) === String(currentMarche))) $("#f-marche").value = currentMarche;
}

function renderProgrammes(list) {
  const tbody = $("#table-dash-programmes tbody");
  if (!tbody) return;
  tbody.innerHTML = list.map((p) => `
    <tr>
      <td>${p.id}</td>
      <td><div style="font-weight:700">${htmlEscape(p.programme)}</div><div class="hint">${htmlEscape(p.code || "")}</div></td>
      <td>${htmlEscape(p.fonds_nom || "")}</td>
      <td>${p.n_projets || 0}</td>
      <td>${p.n_ao || 0}</td>
      <td>${pctBadge(p.taux_achevement_projets)}</td>
      <td>${p.n_communes || 0} commune(s)</td>
      <td>${money(p.budget_global)} ${htmlEscape(p.fonds_devise || "MAD")}</td>
      <td>${money(p.montant_marche)} MAD</td>
      <td>${money(p.montant_paye)} MAD</td>
      <td>${money(p.reste_a_payer)} MAD</td>
      <td><button class="btn-secondary" onclick="openProgrammeDetails(${p.id})">Voir</button></td>
    </tr>
  `).join("");
  $("#count-dash-programmes").textContent = `${list.length} programme(s)`;
}

function renderProjets(list) {
  const tbody = $("#table-dash-projets tbody");
  if (!tbody) return;
  tbody.innerHTML = list.map((p) => `
    <tr>
      <td>${p.id}</td>
      <td>${htmlEscape(p.code || "")}</td>
      <td>${htmlEscape(p.intitule || "")}</td>
      <td>${htmlEscape(p.statut || "")}</td>
      <td>${htmlEscape(p.programme || "")}</td>
      <td>${htmlEscape(p.commune_rurale || "")}</td>
      <td>${p.n_ao || 0}</td>
      <td>${money(p.budget_previsionnel)} MAD</td>
      <td>${money(p.montant_marche)} MAD</td>
      <td>${money(p.montant_paye)} MAD</td>
      <td>${money(p.reste_a_payer)} MAD</td>
    </tr>
  `).join("");
  $("#count-dash-projets").textContent = `${list.length} projet(s)`;
}

function renderMarches(list) {
  const tbody = $("#table-dash-marches tbody");
  if (!tbody) return;
  tbody.innerHTML = list.map((m) => `
    <tr>
      <td>${m.id}</td>
      <td>${htmlEscape(m.numero_ao || "")}</td>
      <td>${htmlEscape(m.numero_marche || "")}</td>
      <td>${htmlEscape(m.projet_code || "")}</td>
      <td>${htmlEscape(m.programme || "")}</td>
      <td>${htmlEscape(m.fournisseur || "")}</td>
      <td>${money(m.montant)} MAD</td>
      <td>${money(m.montant_paye)} MAD</td>
      <td>${money(m.reste_a_payer)} MAD</td>
      <td>${htmlEscape(m.statut || "")}</td>
      <td>${m.date_signature ? String(m.date_signature).slice(0, 10) : ""}</td>
    </tr>
  `).join("");
  $("#count-dash-marches").textContent = `${list.length} marché(s)`;
}

function renderBeneficiaires(list) {
  const tbody = $("#table-dash-beneficiaires tbody");
  if (!tbody) return;
  tbody.innerHTML = list.map((b) => `
    <tr>
      <td>${htmlEscape(b.type || "")}</td>
      <td>${htmlEscape(b.nom || "")}</td>
      <td>${htmlEscape(b.nom_president || "")}</td>
      <td>${b.nbre_adherent || 0}</td>
      <td>${b.date_creation ? String(b.date_creation).slice(0, 10) : ""}</td>
      <td>${htmlEscape(b.observations || "")}</td>
    </tr>
  `).join("");
  $("#count-dash-beneficiaires").textContent = `${list.length} bénéficiaire(s)`;
}

function renderFournisseurs(list) {
  const tbody = $("#table-dash-fournisseurs tbody");
  if (!tbody) return;
  tbody.innerHTML = list.map((f) => `
    <tr>
      <td>${f.id}</td>
      <td>${htmlEscape(f.nom || "")}</td>
      <td>${htmlEscape(f.ice || "")}</td>
      <td>${f.n_marches || 0}</td>
      <td>${money(f.montant_marche)} MAD</td>
      <td>${money(f.reste)} MAD</td>
      <td>${htmlEscape(f.telephone || "")}</td>
      <td>${htmlEscape(f.email || "")}</td>
    </tr>
  `).join("");
  $("#count-dash-fournisseurs").textContent = `${list.length} fournisseur(s)`;
}

async function computeKpis() {
  const overview = await fetchJSON("/api/dashboard/overview");
  $("#kpi-programmes").textContent = overview.nb_programmes || dashProgrammes.length;
  $("#kpi-projets").textContent = overview.nb_projets || dashProjets.length;
  $("#kpi-ao").textContent = overview.nb_ao || 0;
  $("#kpi-marches").textContent = overview.nb_marches || dashMarches.length;
  $("#kpi-total-marches").textContent = money(overview.engagements_total || 0);
  $("#kpi-paiements").textContent = money(overview.paiements_total || 0);
}

function buildSimpleChart(target, type, labels, values, options = {}) {
  if (!target) return null;
  return new Chart(target, {
    type,
    data: { labels, datasets: [{ data: values }] },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      ...options
    }
  });
}

async function renderCharts() {
  const [statuts, budgets, finance, communes, aos] = await Promise.all([
    fetchJSON("/api/dashboard/charts/projets-par-statut"),
    fetchJSON("/api/dashboard/charts/budget-par-programme"),
    fetchJSON("/api/dashboard/charts/engagement-paiement"),
    fetchJSON("/api/dashboard/charts/investissements-par-commune"),
    fetchJSON("/api/dashboard/charts/marches-par-ao")
  ]);

  if (chartStatut) chartStatut.destroy();
  chartStatut = buildSimpleChart($("#chart-projets-statut"), "doughnut", statuts.map((x) => x.statut), statuts.map((x) => x.total));

  if (chartBudget) chartBudget.destroy();
  chartBudget = buildSimpleChart($("#chart-budget-programme"), "bar", budgets.map((x) => x.programme), budgets.map((x) => Number(x.budget_total || 0)), {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  });

  if (chartFinance) chartFinance.destroy();
  chartFinance = buildSimpleChart($("#chart-finance"), "bar", ["Engagements", "Paiements", "Reste"], [Number(finance.engagements || 0), Number(finance.paiements || 0), Number(finance.reste || 0)], {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  });

  if (chartCommunes) chartCommunes.destroy();
  chartCommunes = buildSimpleChart($("#chart-communes"), "bar", communes.map((x) => x.commune), communes.map((x) => Number(x.montant || 0)), {
    indexAxis: "y",
    plugins: { legend: { display: false } }
  });

  if (chartAO) chartAO.destroy();
  chartAO = new Chart($("#chart-ao"), {
    type: "bar",
    data: {
      labels: aos.map((x) => x.ao),
      datasets: [
        { label: "Nombre marchés", data: aos.map((x) => Number(x.total || 0)), yAxisID: "y" },
        { label: "Montant", data: aos.map((x) => Number(x.montant || 0)), yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } } }
    }
  });
}

function projectPointStyle(feature, latlng) {
  const montant = Number(feature?.properties?.marche_montant || 0);
  const radius = montant > 0 ? Math.max(6, Math.min(18, Math.round(Math.log10(montant + 1) * 3.5))) : 6;
  return L.circleMarker(latlng, {
    radius,
    color: "#1f7a3d",
    fillColor: "#3d9b4f",
    fillOpacity: 0.75,
    weight: 2
  });
}

function initMap() {
  if (map) {
    map.remove();
    map = null;
  }
  map = L.map("dash-map", { zoomControl: true });
  mapBase = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  map.setView([31.9, -7.9], 8);
  mapCommunesLayer = L.geoJSON([], {
    style: () => ({ color: "#8b5e34", weight: 2, fillColor: "#d8c4ab", fillOpacity: 0.12 }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      layer.bindPopup(`<b>Commune</b><br>${htmlEscape(p.commune || "")}`);
    }
  }).addTo(map);
  mapProjetsLayer = L.geoJSON([], {
    style: () => ({ color: "#1f7a3d", weight: 2, fillOpacity: 0.35 }),
    pointToLayer: projectPointStyle,
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      layer.bindPopup(`
        <b>${htmlEscape(p.code || "Projet")}</b><br>
        ${htmlEscape(p.intitule || "")}<br>
        <b>Programme :</b> ${htmlEscape(p.programme || "")}<br>
        <b>Commune :</b> ${htmlEscape(p.commune_rurale || "")}<br>
        <b>AO :</b> ${htmlEscape(p.numero_ao || "—")}<br>
        <b>Marché :</b> ${htmlEscape(p.numero_marche || "—")}<br>
        <b>Engagement :</b> ${money(p.marche_montant)} MAD<br>
        <b>Paiement :</b> ${money(p.montant_paye)} MAD
      `);
    }
  }).addTo(map);
  setTimeout(() => map.invalidateSize(), 100);
}

async function loadFilteredMap() {
  const params = getReportParams();
  const data = await fetchJSON(`/api/dashboard/map/filtered-geojson?${params.toString()}`);
  if (!map) return;

  mapProjetsLayer.clearLayers();
  mapCommunesLayer.clearLayers();

  if (data.communes?.features?.length) mapCommunesLayer.addData(data.communes);
  if (data.projets?.features?.length) mapProjetsLayer.addData(data.projets);

  $("#map-hint").textContent = `${data.projets?.features?.length || 0} projet(s) • ${data.communes?.features?.length || 0} commune(s)`;

  setTimeout(() => {
    map.invalidateSize();
    const hasCommunes = mapCommunesLayer.getLayers().length > 0;
    const hasProjets = mapProjetsLayer.getLayers().length > 0;
    if (hasCommunes) {
      const bounds = mapCommunesLayer.getBounds();
      if (bounds.isValid()) return map.fitBounds(bounds.pad(0.15));
    }
    if (hasProjets) {
      const bounds = mapProjetsLayer.getBounds();
      if (bounds.isValid()) return map.fitBounds(bounds.pad(0.20));
    }
    map.setView([31.9, -7.9], 8);
  }, 180);
}

function bindSearch(inputId, source, renderer, fields) {
  $(inputId)?.addEventListener("input", (e) => {
    const q = String(e.target.value || "").trim().toLowerCase();
    if (!q) return renderer(source);
    renderer(source.filter((row) => fields.some((f) => String(row[f] || "").toLowerCase().includes(q))));
  });
}

function closeModal() {
  const modal = $("#modal-details");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function openModal() {
  const modal = $("#modal-details");
  if (modal) {
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
  }
}

function renderModalProgramme(filterProjetId = "") {
  if (!modalData) return;
  const projets = filterProjetId ? modalData.projets.filter((p) => String(p.id) === String(filterProjetId)) : modalData.projets;
  const marches = filterProjetId ? modalData.marches.filter((m) => String(m.projet_id) === String(filterProjetId)) : modalData.marches;

  $("#table-prog-projets tbody").innerHTML = projets.map((p) => `
    <tr><td>${p.id}</td><td>${htmlEscape(p.code || "")}</td><td>${htmlEscape(p.intitule || "")}</td><td>${htmlEscape(p.statut || "")}</td><td>${money(p.budget_previsionnel)} MAD</td><td>${money(p.montant_marche)} MAD</td><td>${htmlEscape(p.commune_rurale || "")}</td></tr>
  `).join("");
  $("#table-prog-marches tbody").innerHTML = marches.map((m) => `
    <tr><td>${m.id}</td><td>${htmlEscape(m.numero_marche || "")}</td><td>${htmlEscape(m.projet_code || "")}</td><td>${htmlEscape(m.fournisseur || "")}</td><td>${money(m.montant)} MAD</td><td>${m.date_signature ? String(m.date_signature).slice(0,10) : ""}</td></tr>
  `).join("");

  const byStatut = {};
  projets.forEach((p) => { const s = (p.statut || "NON_DEFINI").trim(); byStatut[s] = (byStatut[s] || 0) + 1; });
  if (modalChartStatut) modalChartStatut.destroy();
  modalChartStatut = buildSimpleChart($("#chart-prog-statut"), "doughnut", Object.keys(byStatut), Object.values(byStatut));
  if (modalChartBudgets) modalChartBudgets.destroy();
  modalChartBudgets = buildSimpleChart($("#chart-prog-budgets"), "bar", projets.map((p) => p.code || `#${p.id}`), projets.map((p) => Number(p.budget_previsionnel || 0)), { plugins: { legend: { display: false } } });
}

window.openProgrammeDetails = async (programmeId) => {
  try {
    modalData = await fetchJSON(`/api/dashboard/programmes/${programmeId}/details`);
    const pg = modalData.programme;
    $("#modal-title").textContent = `Programme : ${pg.intitule || pg.code || ""}`;
    $("#modal-sub").textContent = `Fonds : ${pg.fonds_nom || "-"} • Budget : ${money(pg.budget_global)} ${pg.fonds_devise || "MAD"}`;
    const sel = $("#modal-projet-filter");
    if (sel) {
      sel.innerHTML = `<option value="">Tous projets</option>` + modalData.projets.map((p) => `<option value="${p.id}">${htmlEscape((p.code ? p.code + ' — ' : '') + (p.intitule || ''))}</option>`).join("");
      sel.onchange = () => renderModalProgramme(sel.value);
    }
    renderModalProgramme("");
    openModal();
  } catch (e) {
    alert(`Erreur détails programme : ${e.message}`);
  }
};

async function generateReport() {
  const params = getReportParams();
  reportData = await fetchJSON(`/api/dashboard/report?${params.toString()}`);
  $("#btn-csv").href = `/api/dashboard/report.csv?${params.toString()}`;
  $("#report-summary").textContent = `Programmes : ${reportData.summary.nb_programmes} • Projets : ${reportData.summary.nb_projets} • AO : ${reportData.summary.nb_ao} • Marchés : ${reportData.summary.nb_marches} • Communes : ${reportData.summary.nb_communes} • Budget : ${money(reportData.summary.budget_total)} MAD • Engagements : ${money(reportData.summary.marches_total)} MAD • Paiements : ${money(reportData.summary.paiements_total)} MAD • Reste : ${money(reportData.summary.reste_total)} MAD`;
  $("#table-report tbody").innerHTML = reportData.rows.map((r) => `
    <tr>
      <td>${htmlEscape(r.programme || "")}</td>
      <td>${htmlEscape((r.projet_code ? r.projet_code + ' — ' : '') + (r.projet_intitule || ''))}</td>
      <td>${htmlEscape(r.numero_ao || "")}</td>
      <td>${htmlEscape(r.statut || "")}</td>
      <td>${htmlEscape(r.commune_rurale || "")}</td>
      <td>${htmlEscape(r.numero_marche || "")}</td>
      <td>${htmlEscape(r.fournisseur || "")}</td>
      <td>${money(r.marche_montant)} MAD</td>
      <td>${money(r.montant_paye)} MAD</td>
      <td>${money(r.reste_a_payer)} MAD</td>
      <td>${r.date_signature ? String(r.date_signature).slice(0,10) : ""}</td>
    </tr>
  `).join("");
  await loadFilteredMap();
}

function openTechnicalSheet() {
  const params = getReportParams();
  window.open(`/fiche-technique.html?${params.toString()}`, "_blank");
}

async function exportDashboardPdf() {
  if (!window.html2canvas || !window.jspdf) {
    alert("Librairies PDF non chargées.");
    return;
  }
  const root = document.getElementById("dashboard-export-root");
  const canvas = await html2canvas(root, { scale: 1.5, useCORS: true, backgroundColor: "#f3f4ee" });
  const imgData = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 14;
  const imgHeight = canvas.height * imgWidth / canvas.width;
  let y = 7;
  let remaining = imgHeight;
  pdf.addImage(imgData, "PNG", 7, y, imgWidth, imgHeight);
  remaining -= (pageHeight - 14);
  while (remaining > 0) {
    pdf.addPage();
    y = remaining - imgHeight + 7;
    pdf.addImage(imgData, "PNG", 7, y, imgWidth, imgHeight);
    remaining -= (pageHeight - 14);
  }
  pdf.save("dashboard_v4_marrakech_safi.pdf");
}

async function loadOptions() {
  filterOptions = await fetchJSON("/api/dashboard/filter-options");
  setSelectOptions($("#f-programme"), filterOptions.programmes, "Tous programmes");
  setSelectOptions($("#f-exercice"), filterOptions.exercices, "Tous exercices", (x) => x, (x) => x);
  setSelectOptions($("#f-commune"), filterOptions.communes, "Toutes communes", (x) => x, (x) => x);
  applyDependentFilters();
}

function installTabs() {
  document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById(`panel-${btn.dataset.tab}`);
    if (panel) panel.classList.add("active");
  }));
}

async function init() {
  if (!window.L) throw new Error("Leaflet n'est pas chargé. Vérifie l'inclusion de leaflet.js dans dashboard.html");
  installTabs();
  initMap();

  [dashProgrammes, dashProjets, dashMarches, dashBeneficiaires, dashFournisseurs] = await Promise.all([
    fetchJSON("/api/dashboard/programmes"),
    fetchJSON("/api/dashboard/projets"),
    fetchJSON("/api/dashboard/marches"),
    fetchJSON("/api/dashboard/beneficiaires"),
    fetchJSON("/api/dashboard/fournisseurs")
  ]);

  renderProgrammes(dashProgrammes);
  renderProjets(dashProjets);
  renderMarches(dashMarches);
  renderBeneficiaires(dashBeneficiaires);
  renderFournisseurs(dashFournisseurs);
  await computeKpis();
  await renderCharts();
  await loadOptions();
  await generateReport();

  bindSearch("#search-programmes", dashProgrammes, renderProgrammes, ["programme", "code", "fonds_nom"]);
  bindSearch("#search-projets", dashProjets, renderProjets, ["code", "intitule", "programme", "commune_rurale"]);
  bindSearch("#search-marches", dashMarches, renderMarches, ["numero_marche", "numero_ao", "programme", "projet_code", "fournisseur"]);
  bindSearch("#search-beneficiaires", dashBeneficiaires, renderBeneficiaires, ["type", "nom", "nom_president"]);
  bindSearch("#search-fournisseurs", dashFournisseurs, renderFournisseurs, ["nom", "ice", "telephone", "email"]);

  $("#f-programme")?.addEventListener("change", applyDependentFilters);
  $("#f-projet")?.addEventListener("change", applyDependentFilters);
  $("#f-ao")?.addEventListener("change", applyDependentFilters);
  $("#btn-report")?.addEventListener("click", () => generateReport().catch((e) => { if (e.message !== "FORBIDDEN") alert(e.message); }));
  $("#btn-tech-sheet")?.addEventListener("click", openTechnicalSheet);
  $("#btn-print")?.addEventListener("click", () => window.print());
  $("#btn-export-pdf")?.addEventListener("click", () => exportDashboardPdf().catch((e) => alert(e.message)));
  $("#btn-modal-close")?.addEventListener("click", closeModal);
  $("#modal-details")?.addEventListener("click", (e) => { if (e.target.id === "modal-details" || e.target.classList.contains("modal-backdrop")) closeModal(); });
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => {
    if (e.message !== "FORBIDDEN") alert(`Erreur dashboard : ${e.message}`);
  });
});
