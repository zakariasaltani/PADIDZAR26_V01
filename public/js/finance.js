/* -------------------- Helpers -------------------- */
const $ = (sel) => document.querySelector(sel);

function setMsg(id, txt, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = txt || "";
  el.style.color = ok ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
}

function money(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

async function fetchJSON(url) {
  const res = await authFetch(url);

  // ✅ Cas "accès interdit"
  if (res.status === 403) {
    // Affiche le message au centre (si forbidden.js est chargé)
    if (typeof showForbidden === "function") {
      showForbidden("L’accès à cette section vous est interdit");
    } else {
      // fallback si forbidden.js n'est pas inclus
      document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
          <h2>L’accès à cette section vous est interdit</h2>
        </div>
      `;
    }
    // Stopper le flux normal: on lance une erreur "silencieuse"
    const err = new Error("FORBIDDEN");
    err.code = 403;
    throw err;
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}

  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
  return data;
}



async function postJSON(url, body) {
  const res = await authFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
  return data;
}

async function putJSON(url, body) {
  const res = await authFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
  return data;
}

async function postFormData(url, formData) {
  const res = await authFetch(url, { method: "POST", body: formData });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
  return data;
}

/* -------------------- Tabs -------------------- */
function activateFinanceTab(tab) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`panel-${tab}`)?.classList.add("active");
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => activateFinanceTab(btn.dataset.tab));
});

/* -------------------- State -------------------- */
let projets = [];
let fournisseurs = [];
let appelsOffres = [];
let marches = [];
let paiements = [];
let synthese = [];
let marcheDocuments = [];
let editingMarcheId = null;
let fonds = [];
let programmes = [];
let editingProgrammeId = null;

let imputations = [];
let editingImputationId = null;

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* -------------------- Programmes (dans Gestion financière) -------------------- */
function renderProgrammes(list) {
  const tbody = document.querySelector("#table-programmes tbody");
  if (!tbody) return;

  tbody.innerHTML = list.map((p) => `
    <tr>
      <td>${p.id}</td>
      <td>${p.code || ""}</td>
      <td>
        <div style="font-weight:600">${p.intitule || ""}</div>
        <div style="color:var(--muted); font-size:12px;">${p.description || ""}</div>
      </td>
      <td>${p.fonds_nom || ""}</td>
      <td>${p.annee_debut || ""} → ${p.annee_fin || ""}</td>
      <td>${money(p.budget_global)} MAD</td>
      <td>
        <button class="small-btn" data-edit-programme="${p.id}">Modifier</button>
        <button class="small-btn danger" data-delete-programme="${p.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");

  const c = document.getElementById("count-programmes");
  if (c) c.textContent = `${list.length} programme(s)`;
}

async function loadFondsForProgrammes() {
  fonds = await fetchJSON("/api/fonds");

  const sel = document.getElementById("select-fonds-programme");
  const filter = document.getElementById("filter-fonds-programmes");

  const opts = (fonds || []).map((f) => {
    const label = `${f.nom || ""}${f.code ? ` (${f.code})` : ""}`;
    return `<option value="${f.id}">${label}</option>`;
  }).join("");

  if (sel) sel.innerHTML = `<option value="">-- Aucun --</option>` + opts;
  if (filter) filter.innerHTML = `<option value="">Tous les fonds</option>` + opts;
}

async function loadProgrammes() {
  programmes = await fetchJSON("/api/programmes");
  renderProgrammes(programmes);
  fillProgrammeAoSelects();
  fillAoSelects();
}

function resetProgrammeForm() {
  const form = document.getElementById("form-programme");
  if (!form) return;
  form.reset();
  form.id.value = "";
  editingProgrammeId = null;
  const t = document.getElementById("programme-form-title");
  if (t) t.textContent = "➕ Ajouter / Modifier un programme";
  setMsg("msg-programme", "");
}

document.getElementById("btn-programme-reset")?.addEventListener("click", resetProgrammeForm);

document.getElementById("search-programmes")?.addEventListener("input", (e) => {
  const q = (e.target.value || "").toLowerCase().trim();
  const fondId = document.getElementById("filter-fonds-programmes")?.value || "";

  const filtered = (programmes || []).filter((p) => {
    const matchText =
      String(p.id).includes(q) ||
      (p.code || "").toLowerCase().includes(q) ||
      (p.intitule || "").toLowerCase().includes(q) ||
      (p.fonds_nom || "").toLowerCase().includes(q);
    const matchFond = !fondId || String(p.fonds_financement_id || "") === String(fondId);
    return matchText && matchFond;
  });

  renderProgrammes(filtered);
});

document.getElementById("filter-fonds-programmes")?.addEventListener("change", () => {
  const q = document.getElementById("search-programmes")?.value || "";
  document.getElementById("search-programmes")?.dispatchEvent(new Event("input"));
});

document.getElementById("table-programmes")?.addEventListener("click", async (e) => {
  const btnEdit = e.target.closest("button[data-edit-programme]");
  const btnDel = e.target.closest("button[data-delete-programme]");

  if (btnEdit) {
    const id = btnEdit.getAttribute("data-edit-programme");
    const p = (programmes || []).find((x) => String(x.id) === String(id));
    if (!p) return;

    editingProgrammeId = p.id;

    const form = document.getElementById("form-programme");
    form.id.value = p.id;
    form.fonds_financement_id.value = p.fonds_financement_id || "";
    form.code.value = p.code || "";
    form.intitule.value = p.intitule || "";
    form.description.value = p.description || "";
    form.annee_debut.value = p.annee_debut || "";
    form.annee_fin.value = p.annee_fin || "";
    form.budget_global.value = p.budget_global ?? "";

    const t = document.getElementById("programme-form-title");
    if (t) t.textContent = `✏️ Modifier programme #${p.id}`;
    setMsg("msg-programme", `Mode modification: Programme #${p.id}`, true);
  }

  if (btnDel) {
    const id = btnDel.getAttribute("data-delete-programme");
    if (!confirm("Supprimer ce programme ? (Les projets liés garderont programme_id mais deviendra invalide si pas de contrainte FK)") ) return;
    try {
      await authFetch(`/api/programmes/${id}`, { method: "DELETE" });
      // L'API /api/programmes renvoie JSON, mais on reste tolérant
      await loadProgrammes();
      setMsg("msg-programme", "✅ Programme supprimé.", true);
      resetProgrammeForm();
    } catch (err) {
      setMsg("msg-programme", `❌ ${err.message}`, false);
    }
  }
});

document.getElementById("form-programme")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-programme", "Enregistrement...", true);

  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());

  const payload = {
    fonds_financement_id: body.fonds_financement_id ? Number(body.fonds_financement_id) : null,
    code: (body.code || "").trim() || null,
    intitule: (body.intitule || "").trim(),
    description: (body.description || "").trim() || null,
    annee_debut: (body.annee_debut || "").trim() || null,
    annee_fin: (body.annee_fin || "").trim() || null,
    budget_global: toNum(body.budget_global) ?? 0,
  };

  try {
    if (body.id) {
      await putJSON(`/api/programmes/${body.id}`, payload);
      setMsg("msg-programme", "✅ Programme modifié.", true);
    } else {
      await postJSON("/api/programmes", payload);
      setMsg("msg-programme", "✅ Programme ajouté.", true);
    }

    resetProgrammeForm();
    await loadProgrammes();
  } catch (err) {
    setMsg("msg-programme", `❌ ${err.message}`, false);
  }
});


/* -------------------- Appels d'offres -------------------- */
let editingAoId = null;

function fillProgrammeAoSelects() {
  const opts = (programmes || []).map((p) => `<option value="${p.id}">${(p.code || 'PRG')} - ${p.intitule || ''}</option>`).join('');
  const s1 = document.getElementById('select-programme-ao');
  const s2 = document.getElementById('filter-programme-ao');
  if (s1) s1.innerHTML = `<option value="">-- Sélectionner --</option>` + opts;
  if (s2) s2.innerHTML = `<option value="">Tous les programmes</option>` + opts;
}

function fillAoSelects() {
  const current = document.getElementById('select-ao-marche')?.value || '';
  const filterProgramme = document.getElementById('filter-programme-ao')?.value || '';
  const rows = filterProgramme ? appelsOffres.filter((a) => String(a.programme_id || '') === String(filterProgramme)) : appelsOffres;
  const opts = rows.map((a) => `<option value="${a.id}">${a.numero_ao || ''} | ${a.programme_label || ''}</option>`).join('');
  const s = document.getElementById('select-ao-marche');
  const f = document.getElementById('filter-ao-marches');
  if (s) { s.innerHTML = `<option value="">-- Aucun --</option>` + opts; if (current) s.value = current; }
  if (f) f.innerHTML = `<option value="">Tous les AO</option>` + appelsOffres.map((a) => `<option value="${a.id}">${a.numero_ao || ''}</option>`).join('');
}

function renderAppelsOffres(list) {
  const tbody = document.querySelector('#table-ao tbody');
  if (!tbody) return;
  tbody.innerHTML = list.map((a) => `
    <tr>
      <td>${a.id}</td>
      <td><b>${a.numero_ao || ''}</b><div style="color:var(--muted); font-size:12px;">${a.statut || ''}</div></td>
      <td>${a.programme_label || ''}</td>
      <td>${a.objet || ''}</td>
      <td>${a.date_lancement ? String(a.date_lancement).slice(0,10) : ''}<div style="color:var(--muted); font-size:12px;">${a.date_ouverture_plis ? 'Ouverture: ' + String(a.date_ouverture_plis).slice(0,10) : ''}</div></td>
      <td>${money(a.montant_estime)} MAD</td>
      <td>${a.nb_marches || 0}<div style="color:var(--muted); font-size:12px;">${money(a.montant_marches)} MAD</div></td>
      <td><button class="small-btn" data-edit-ao="${a.id}">Modifier</button><button class="small-btn danger" data-del-ao="${a.id}">Supprimer</button></td>
    </tr>`).join('');
  const c = document.getElementById('count-ao');
  if (c) c.textContent = `${list.length} AO`;
}

async function loadAppelsOffres(programmeId = '') {
  const url = programmeId ? `/api/finance/appels-offres?programme_id=${encodeURIComponent(programmeId)}` : '/api/finance/appels-offres';
  appelsOffres = await fetchJSON(url);
  renderAppelsOffres(appelsOffres);
  fillAoSelects();
}

function resetAoForm() {
  editingAoId = null;
  const f = document.getElementById('form-ao');
  if (!f) return;
  f.reset();
  if (f.id) f.id.value = '';
  const t = document.getElementById('ao-form-title');
  if (t) t.textContent = "➕ Ajouter / Modifier un appel d'offres";
  setMsg('msg-ao', '');
}

document.getElementById('btn-ao-reset')?.addEventListener('click', resetAoForm);

document.getElementById('form-ao')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg('msg-ao', 'Enregistrement...', true);
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.programme_id = Number(body.programme_id);
  body.montant_estime = Number(body.montant_estime || 0);
  try {
    if (body.id) {
      await putJSON(`/api/finance/appels-offres/${body.id}`, body);
      setMsg('msg-ao', '✅ AO modifié.', true);
    } else {
      await postJSON('/api/finance/appels-offres', body);
      setMsg('msg-ao', '✅ AO ajouté.', true);
    }
    resetAoForm();
    await loadAppelsOffres(document.getElementById('filter-programme-ao')?.value || '');
  } catch (err) {
    setMsg('msg-ao', `❌ ${err.message}`, false);
  }
});

document.getElementById('table-ao')?.addEventListener('click', async (e) => {
  const edit = e.target.closest('button[data-edit-ao]');
  const del = e.target.closest('button[data-del-ao]');
  if (edit) {
    const id = edit.getAttribute('data-edit-ao');
    const a = appelsOffres.find((x) => String(x.id) === String(id));
    if (!a) return;
    editingAoId = a.id;
    const f = document.getElementById('form-ao');
    f.id.value = a.id;
    f.programme_id.value = a.programme_id || '';
    f.numero_ao.value = a.numero_ao || '';
    f.objet.value = a.objet || '';
    f.date_lancement.value = a.date_lancement ? String(a.date_lancement).slice(0,10) : '';
    f.date_ouverture_plis.value = a.date_ouverture_plis ? String(a.date_ouverture_plis).slice(0,10) : '';
    f.statut.value = a.statut || 'BROUILLON';
    f.montant_estime.value = a.montant_estime ?? '';
    f.observations.value = a.observations || '';
    document.getElementById('ao-form-title').textContent = `✏️ Modifier AO #${a.id}`;
    activateFinanceTab('ao');
  }
  if (del) {
    const id = del.getAttribute('data-del-ao');
    if (!confirm('Supprimer cet AO ?')) return;
    const res = await authFetch(`/api/finance/appels-offres/${id}`, { method: 'DELETE' });
    const tx = await res.text(); let data={}; try{data=tx?JSON.parse(tx):{}}catch{}
    if (!res.ok) return alert(data?.error || tx || 'Erreur suppression');
    await loadAppelsOffres(document.getElementById('filter-programme-ao')?.value || '');
  }
});

/* -------------------- Projets -------------------- */
async function loadProjets() {
  projets = await fetchJSON("/api/finance/projets");

  const selProjets = $("#select-projets");
  const filterProjets = $("#filter-projet-marches");

  const options = projets.map((p) => {
    const label = `${p.code || "—"} | ${p.intitule || ""} (ID:${p.id})`;
    return `<option value="${p.id}">${label}</option>`;
  }).join("");

  selProjets.innerHTML = options;
  filterProjets.innerHTML = `<option value="">Tous les projets</option>` + options;
}

/* -------------------- Fournisseurs -------------------- */
function renderFournisseurs(list) {
  const tbody = $("#table-fournisseurs tbody");
  tbody.innerHTML = list.map((f) => `
    <tr>
      <td>${f.id}</td>
      <td>${f.nom || ""}</td>
      <td>${f.ice || ""}</td>
      <td>${f.telephone || ""}</td>
      <td>${f.email || ""}</td>
    </tr>
  `).join("");
  $("#count-fournisseurs").textContent = `${list.length} fournisseur(s)`;
}


/* -------------------- Imputations -------------------- */
function fillImputationSelect() {
  // Pour le formulaire Marché (valeur = nature)
  const selNature = document.getElementById("select-imputations");
  if (selNature) {
    const current = selNature.value;
    selNature.innerHTML =
      `<option value="">-- Sélectionner --</option>` +
      imputations
        .map(
          (i) =>
            `<option value="${(i.nature || "").replaceAll('"', "&quot;")}">${
              i.exercice ? i.exercice + " - " : ""
            }${i.nature || ""}</option>`
        )
        .join("");
    if (current) selNature.value = current;
  }

  // Pour le formulaire Paiement (valeur = id, mais l'utilisateur choisit la Nature)
  const selPaiement = document.getElementById("select-imputation-paiement");
  if (selPaiement) {
    const current2 = selPaiement.value;
    selPaiement.innerHTML =
      `<option value="">-- Sélectionner --</option>` +
      imputations
        .map((i) => {
          const label = `${i.exercice ? i.exercice + " - " : ""}${i.nature || ""}`;
          return `<option value="${i.id}">${label}</option>`;
        })
        .join("");
    if (current2) selPaiement.value = current2;
  }
}

function renderImputations(list) {
  const tbody = document.querySelector("#table-imputations tbody");
  if (!tbody) return;

  tbody.innerHTML = list.map(i => `
    <tr>
      <td>${i.exercice ?? ""}</td>
      <td>${i.code ?? ""}</td>
      <td>${i.numero_article ?? ""}</td>
      <td>${i.numero_paragraphe ?? ""}</td>
      <td>${i.numero_ligne ?? ""}</td>
      <td><b>${i.nature ?? ""}</b></td>
      <td>${money(i.montant_report)} </td>
      <td>${money(i.montant_consolide)} </td>
      <td>${money(i.budget_nouveau)} </td>
      <td style="white-space:nowrap">
        <button class="small-btn" data-edit-imputation="${i.id}">Modifier</button>
        <button class="small-btn" data-del-imputation="${i.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

async function loadImputations() {
  imputations = await fetchJSON("/api/finance/imputations");
  renderImputations(imputations);
  fillImputationSelect();
}

function resetImputationForm() {
  editingImputationId = null;
  const f = document.getElementById("form-imputation");
  if (!f) return;
  f.reset();
  setMsg("msg-imputation", "");
  const title = document.getElementById("imputation-form-title");
  if (title) title.textContent = "➕ Ajouter / Modifier une imputation";
}

document.getElementById("btn-imputation-reset")?.addEventListener("click", resetImputationForm);

document.getElementById("form-imputation")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-imputation", "Enregistrement...", true);

  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.exercice = body.exercice ? Number(body.exercice) : null;
  body.montant_report = body.montant_report ? Number(body.montant_report) : 0;
  body.montant_consolide = body.montant_consolide ? Number(body.montant_consolide) : 0;
  body.budget_nouveau = body.budget_nouveau ? Number(body.budget_nouveau) : 0;

  try {
    if (editingImputationId) {
      await putJSON(`/api/finance/imputations/${editingImputationId}`, body);
      setMsg("msg-imputation", `✅ Imputation #${editingImputationId} modifiée.`, true);
    } else {
      await postJSON("/api/finance/imputations", body);
      setMsg("msg-imputation", "✅ Imputation ajoutée.", true);
    }
    resetImputationForm();
    await loadImputations();
    await loadMarches(document.getElementById("filter-projet-marches")?.value || "");
  } catch (err) {
    setMsg("msg-imputation", "❌ " + err.message, false);
  }
});

document.getElementById("table-imputations")?.addEventListener("click", async (e) => {
  const btnEdit = e.target.closest("button[data-edit-imputation]");
  const btnDel = e.target.closest("button[data-del-imputation]");

  if (btnEdit) {
    const id = Number(btnEdit.dataset.editImputation);
    const it = imputations.find(x => x.id === id);
    if (!it) return;

    editingImputationId = id;
    document.getElementById("imputation-form-title").textContent = `✏️ Modifier imputation #${id}`;

    const f = document.getElementById("form-imputation");
    f.querySelector('input[name="exercice"]').value = it.exercice ?? "";
    f.querySelector('input[name="code"]').value = it.code ?? "";
    f.querySelector('input[name="numero_article"]').value = it.numero_article ?? "";
    f.querySelector('input[name="numero_paragraphe"]').value = it.numero_paragraphe ?? "";
    f.querySelector('input[name="numero_ligne"]').value = it.numero_ligne ?? "";
    f.querySelector('input[name="nature"]').value = it.nature ?? "";
    f.querySelector('input[name="montant_report"]').value = money(it.montant_report);
    f.querySelector('input[name="montant_consolide"]').value = money(it.montant_consolide);
    f.querySelector('input[name="budget_nouveau"]').value = money(it.budget_nouveau);
    setMsg("msg-imputation", "⚠️ La Nature doit rester unique.", true);
  }

  if (btnDel) {
    const id = Number(btnDel.dataset.delImputation);
    if (!confirm("Supprimer cette imputation ?")) return;
    try {
      await (await authFetch(`/api/finance/imputations/${id}`, { method: "DELETE" })).json().catch(()=>({}));
      await loadImputations();
    } catch (err) {
      alert("Erreur: " + err.message);
    }
  }
});

async function loadFournisseurs() {
  fournisseurs = await fetchJSON("/api/finance/fournisseurs");
  renderFournisseurs(fournisseurs);

  const sel = $("#select-fournisseurs");
  sel.innerHTML = fournisseurs.map(f => `<option value="${f.id}">${f.nom}</option>`).join("");
}

$("#form-fournisseur").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-fournisseur", "Enregistrement...", true);

  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());

  try {
    await postJSON("/api/finance/fournisseurs", body);
    e.target.reset();
    setMsg("msg-fournisseur", "✅ Fournisseur ajouté.", true);
    await loadFournisseurs();
  } catch (err) {
    setMsg("msg-fournisseur", `❌ ${err.message}`, false);
  }
});

/* -------------------- Marchés -------------------- */
function marcheLabel(m) {
  const proj = `${m.projet_code || ""} - ${m.projet_intitule || ""}`.trim();
  return `${m.numero_marche || ""} | ${proj} | ${m.fournisseur_nom || ""}`;
}

function renderMarches(list) {
  const tbody = $("#table-marches tbody");
  tbody.innerHTML = list.map(m => `
    <tr>
      <td>${m.id}</td>
      <td>${m.numero_marche || ""}</td>
      <td>${(m.projet_code || "")}
        <div style="color:var(--muted); font-size:12px;">${m.projet_intitule || ""}</div>
      </td>
      <td>${m.numero_ao || ""}<div style="color:var(--muted); font-size:12px;">${m.ao_objet || ""}</div></td>
      <td>${m.fournisseur_nom || ""}</td>
      <td>${m.nature_depense || m.imputation_nature || ""}</td>
      <td>${money(m.montant)} MAD<div style="color:var(--muted); font-size:12px;">Payé: ${money(m.montant_paye)} / Reste: ${money(m.reste_a_payer)}</div></td>
      <td>${m.statut || ""}</td>
      <td>${m.date_signature ? String(m.date_signature).slice(0,10) : ""}</td>
      <td>
        <button class="small-btn" data-edit-marche="${m.id}">Modifier</button>
        <button class="small-btn" data-open-docs="${m.id}">Docs</button>
      </td>
    </tr>
  `).join("");

  $("#count-marches").textContent = `${list.length} marché(s)`;

  // Remplir selects marchés (paiements)
  const selMarches = $("#select-marches");
  const filterMarches = $("#filter-marche-paiements");
  const opts = list.map(m => `<option value="${m.id}">${marcheLabel(m)}</option>`).join("");

  selMarches.innerHTML = opts;
  filterMarches.innerHTML = `<option value="">Tous les marchés</option>` + opts;

  const dataList = document.getElementById("liste-numero-marches");
  if (dataList) {
    dataList.innerHTML = list.map(m => `<option value="${m.numero_marche || ""}">${marcheLabel(m)}</option>`).join("");
  }
}

async function loadMarches(projetId = "", aoId = "") {
  const params = new URLSearchParams();
  if (projetId) params.set('projet_id', projetId);
  if (aoId) params.set('ao_id', aoId);
  const url = params.toString() ? `/api/finance/marches?${params.toString()}` : "/api/finance/marches";
  marches = await fetchJSON(url);
  renderMarches(marches);
}

$("#form-marche").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-marche", "Enregistrement...", true);

  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());

  body.projet_id = Number(body.projet_id);
  body.ao_id = body.ao_id ? Number(body.ao_id) : null;
  body.fournisseur_id = Number(body.fournisseur_id);
  body.montant = Number(body.montant);
  if (body.imputation_id !== undefined) body.imputation_id = Number(body.imputation_id);

  try {
    if (editingMarcheId) {
      await putJSON(`/api/finance/marches/${editingMarcheId}`, body);
      setMsg("msg-marche", `✅ Marché #${editingMarcheId} modifié.`, true);
      editingMarcheId = null;
    } else {
      await postJSON("/api/finance/marches", body);
      setMsg("msg-marche", "✅ Marché ajouté.", true);
    }

    e.target.reset();
    const projetId = $("#filter-projet-marches").value || "";
    const aoId = $("#filter-ao-marches")?.value || "";
    await loadMarches(projetId, aoId);
  } catch (err) {
    setMsg("msg-marche", `❌ ${err.message}`, false);
  }
});

$("#table-marches").addEventListener("click", async (e) => {
  const btnEdit = e.target.closest("button[data-edit-marche]");
  const btnDocs = e.target.closest("button[data-open-docs]");

  if (btnEdit) {
    const id = btnEdit.getAttribute("data-edit-marche");
    const m = marches.find(x => String(x.id) === String(id));
    if (!m) return;

    editingMarcheId = m.id;

    const form = $("#form-marche");
    form.projet_id.value = m.projet_id;
    form.fournisseur_id.value = m.fournisseur_id;
    if (form.ao_id) form.ao_id.value = m.ao_id || "";
    form.numero_marche.value = m.numero_marche || "";
    form.objet.value = m.objet || "";
    form.montant.value = m.montant ?? "";
    form.date_signature.value = m.date_signature ? String(m.date_signature).slice(0,10) : "";
    form.statut.value = m.statut || "EN_COURS";
    if (form.nature_depense) form.nature_depense.value = m.nature_depense || m.imputation_nature || "";

    setMsg("msg-marche", `Mode modification: Marché #${m.id}`, true);
    return;
  }

  if (btnDocs) {
    const id = btnDocs.getAttribute("data-open-docs");
    const m = marches.find(x => String(x.id) === String(id));
    if (!m) return;
    activateFinanceTab("documents");
    const input = document.getElementById("doc-numero-marche");
    if (input) input.value = m.numero_marche || "";
    document.getElementById("search-marche-documents").value = m.numero_marche || "";
    await loadMarcheDocuments(m.numero_marche || "");
  }
});


/* -------------------- Documents des marchés -------------------- */
function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

function renderMarcheDocuments(list) {
  const tbody = document.querySelector("#table-marche-documents tbody");
  if (!tbody) return;

  tbody.innerHTML = list.map((d) => `
    <tr>
      <td>${d.id}</td>
      <td>${d.numero_marche || ""}</td>
      <td>${d.projet_code || ""}<div style="color:var(--muted); font-size:12px;">${d.projet_intitule || ""}</div></td>
      <td>${d.fournisseur_nom || ""}</td>
      <td>
        <a href="${d.web_path}" target="_blank" rel="noreferrer">${d.original_name || "document"}</a>
      </td>
      <td>${d.description || ""}</td>
      <td>${formatFileSize(d.file_size)}</td>
      <td>${d.created_at ? String(d.created_at).slice(0,10) : ""}</td>
      <td>
        <a class="small-btn" href="${d.web_path}" target="_blank" rel="noreferrer">Ouvrir</a>
        <button class="small-btn danger" data-delete-marche-document="${d.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");

  document.getElementById("count-marche-documents").textContent = `${list.length} document(s)`;
}

async function loadMarcheDocuments(numeroMarche = "") {
  const url = numeroMarche
    ? `/api/finance/marche-documents?numero_marche=${encodeURIComponent(numeroMarche)}`
    : "/api/finance/marche-documents";
  marcheDocuments = await fetchJSON(url);
  renderMarcheDocuments(marcheDocuments);
}

document.getElementById("form-marche-document")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-marche-document", "Téléversement en cours...", true);

  const formData = new FormData(e.target);
  try {
    const data = await postFormData("/api/finance/marche-documents", formData);
    setMsg("msg-marche-document", `✅ Document ajouté au marché ${data.numero_marche}.`, true);
    e.target.reset();
    const numero = data.numero_marche || "";
    document.getElementById("doc-numero-marche").value = numero;
    document.getElementById("search-marche-documents").value = numero;
    await loadMarcheDocuments(numero);
    activateFinanceTab("documents");
  } catch (err) {
    setMsg("msg-marche-document", `❌ ${err.message}`, false);
  }
});

document.getElementById("search-marche-documents")?.addEventListener("input", (e) => {
  const q = (e.target.value || "").toLowerCase().trim();
  renderMarcheDocuments(
    marcheDocuments.filter((d) =>
      (d.numero_marche || "").toLowerCase().includes(q) ||
      (d.projet_code || "").toLowerCase().includes(q) ||
      (d.projet_intitule || "").toLowerCase().includes(q) ||
      (d.fournisseur_nom || "").toLowerCase().includes(q) ||
      (d.original_name || "").toLowerCase().includes(q) ||
      (d.description || "").toLowerCase().includes(q)
    )
  );
});

document.getElementById("btn-refresh-marche-documents")?.addEventListener("click", async () => {
  const numero = document.getElementById("doc-numero-marche")?.value || document.getElementById("search-marche-documents")?.value || "";
  try {
    await loadMarcheDocuments(numero);
  } catch (e) {
    alert(e.message);
  }
});

document.getElementById("table-marche-documents")?.addEventListener("click", async (e) => {
  const btnDel = e.target.closest("button[data-delete-marche-document]");
  if (!btnDel) return;
  const id = btnDel.getAttribute("data-delete-marche-document");
  if (!confirm("Supprimer ce document ?")) return;
  try {
    const res = await authFetch(`/api/finance/marche-documents/${id}`, { method: "DELETE" });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
    const numero = document.getElementById("doc-numero-marche")?.value || document.getElementById("search-marche-documents")?.value || "";
    await loadMarcheDocuments(numero);
  } catch (err) {
    alert(err.message);
  }
});

/* -------------------- Paiements -------------------- */
function paiementMatchLabel(p) {
  return `${p.numero_marche || ""} (marché #${p.id_marche})`;
}

function renderPaiements(list) {
  const tbody = $("#table-paiements tbody");
  const srcLabel = (s) => {
    const v = (s || "").toString().toUpperCase();
    if (v === "REPORT") return "Report";
    if (v === "CONSOLIDE") return "Consolidé";
    if (v === "NOUVEAU") return "Nouveau";
    return v;
  };

  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>${paiementMatchLabel(p)}</td>
      <td>${p.imputation_nature || ""}</td>
      <td>${srcLabel(p.imputation_source)}</td>
      <td>${money(p.montant)} MAD</td>
      <td>${String(p.date_paiement).slice(0,10)}</td>
      <td>${p.mode || ""}</td>
      <td>${p.reference || ""}</td>
    </tr>
  `).join("");

  $("#count-paiements").textContent = `${list.length} paiement(s)`;
}

async function loadPaiements(marcheId = "") {
  const url = marcheId
    ? `/api/finance/paiements?id_marche=${encodeURIComponent(marcheId)}`
    : "/api/finance/paiements";
  paiements = await fetchJSON(url);
  renderPaiements(paiements);
}

$("#form-paiement").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-paiement", "Enregistrement...", true);

  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());

  // Standardiser pour la DB : id_marche
  body.id_marche = body.id_marche ?? body.marche_id;
  body.montant = Number(body.montant);
  if (body.imputation_id !== undefined) body.imputation_id = Number(body.imputation_id);

  try {
    await postJSON("/api/finance/paiements", body);
    e.target.reset();
    setMsg("msg-paiement", "✅ Paiement ajouté.", true);
    const marcheId = $("#filter-marche-paiements").value || "";
    await loadPaiements(marcheId);
  } catch (err) {
    setMsg("msg-paiement", `❌ ${err.message}`, false);
  }
});

/* -------------------- Synthèse -------------------- */
function pctBadge(v) {
  const n = Number(v ?? 0);
  let cls = "bad";
  if (n >= 80) cls = "good";
  else if (n >= 40) cls = "warn";
  return `<span class="badge ${cls}">${n.toFixed(2)}%</span>`;
}

function renderSynthese(list) {
  const tbody = $("#table-synthese tbody");
  tbody.innerHTML = list.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${s.code || ""}</td>
      <td>${s.programme_label || ""}</td>
      <td>${s.fonds_nom || ""}</td>
      <td>${s.intitule || ""}</td>
      <td>${s.statut || ""}</td>
      <td>${money(s.budget_previsionnel)} MAD</td>
      <td>${s.nb_ao || 0}</td>
      <td>${s.nb_marches || 0}</td>
      <td>${money(s.montant_marche)} MAD</td>
      <td>${money(s.montant_paye)} MAD</td>
      <td>${money(s.reste_a_payer)} MAD</td>
      <td>${pctBadge(s.taux_execution_paiement)}</td>
      <td><a href="projets.html?id=${s.id}" style="text-decoration:none">📌 Projet</a></td>
    </tr>
  `).join("");

  $("#count-synthese").textContent = `${list.length} projet(s)`;
}

function buildSyntheseQuery() {
  const annee = $("#filter-annee")?.value || "";
  const date_from = $("#filter-date-from")?.value || "";
  const date_to = $("#filter-date-to")?.value || "";

  const params = new URLSearchParams();
  if (annee) params.set("annee", annee);
  if (date_from) params.set("date_from", date_from);
  if (date_to) params.set("date_to", date_to);

  const qs = params.toString();
  return qs ? `/api/finance/synthese?${qs}` : "/api/finance/synthese";
}

async function loadSynthese() {
  const url = buildSyntheseQuery();
  synthese = await fetchJSON(url);
  renderSynthese(synthese);
}

/* -------------------- Events filters & search -------------------- */
document.getElementById('search-ao')?.addEventListener('input', (e) => {
  const q = (e.target.value || '').toLowerCase().trim();
  renderAppelsOffres(appelsOffres.filter((a) =>
    String(a.id).includes(q) ||
    (a.numero_ao || '').toLowerCase().includes(q) ||
    (a.programme_label || '').toLowerCase().includes(q) ||
    (a.objet || '').toLowerCase().includes(q) ||
    (a.statut || '').toLowerCase().includes(q)
  ));
});

document.getElementById('filter-programme-ao')?.addEventListener('change', async (e) => {
  await loadAppelsOffres(e.target.value || '');
});

$("#search-fournisseurs").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderFournisseurs(
    fournisseurs.filter(f =>
      (f.nom || "").toLowerCase().includes(q) ||
      (f.ice || "").toLowerCase().includes(q) ||
      (f.telephone || "").toLowerCase().includes(q) ||
      (f.email || "").toLowerCase().includes(q)
    )
  );
});

$("#filter-projet-marches").addEventListener("change", async (e) => {
  await loadMarches(e.target.value || "", document.getElementById('filter-ao-marches')?.value || "");
});

document.getElementById('filter-ao-marches')?.addEventListener('change', async (e) => {
  await loadMarches(document.getElementById('filter-projet-marches')?.value || '', e.target.value || '');
});

$("#search-marches").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderMarches(
    marches.filter(m =>
      (m.numero_marche || "").toLowerCase().includes(q) ||
      (m.fournisseur_nom || "").toLowerCase().includes(q) ||
      (m.numero_ao || "").toLowerCase().includes(q) ||
      (m.projet_code || "").toLowerCase().includes(q) ||
      (m.projet_intitule || "").toLowerCase().includes(q) ||
      (m.objet || "").toLowerCase().includes(q)
    )
  );
});

$("#filter-marche-paiements").addEventListener("change", async (e) => {
  await loadPaiements(e.target.value || "");
});

$("#search-paiements").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderPaiements(
    paiements.filter(p =>
      String(p.id).includes(q) ||
      (p.numero_marche || "").toLowerCase().includes(q) ||
      (p.reference || "").toLowerCase().includes(q) ||
      (p.mode || "").toLowerCase().includes(q)
    )
  );
});

$("#search-synthese")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderSynthese(
    synthese.filter(s =>
      String(s.id).includes(q) ||
      (s.code || "").toLowerCase().includes(q) ||
      (s.programme_label || "").toLowerCase().includes(q) ||
      (s.fonds_nom || "").toLowerCase().includes(q) ||
      (s.intitule || "").toLowerCase().includes(q) ||
      (s.statut || "").toLowerCase().includes(q)
    )
  );
});

$("#btn-refresh-synthese")?.addEventListener("click", async () => {
  try { await loadSynthese(); } catch (e) { alert(e.message); }
});

$("#btn-print")?.addEventListener("click", () => window.print());

$("#btn-export-csv")?.addEventListener("click", () => {
  const rows = synthese.map(s => ({
    id: s.id,
    code: s.code,
    programme: s.programme_label,
    fonds: s.fonds_nom,
    intitule: s.intitule,
    statut: s.statut,
    budget_previsionnel: s.budget_previsionnel,
    montant_marche: s.montant_marche,
    montant_paye: s.montant_paye,
    reste_a_payer: s.reste_a_payer,
    taux_execution_paiement: s.taux_execution_paiement
  }));

  const headers = Object.keys(rows[0] || {});
  const csv = [
    headers.join(";"),
    ...rows.map(r => headers.map(h => String(r[h] ?? "").replaceAll(";", ",")).join(";"))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "synthese_financiere.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* -------------------- Init -------------------- */
(async function init() {
  try {
    await loadFondsForProgrammes();
    await loadProgrammes();
    await loadImputations();
    await loadProjets();
    await loadFournisseurs();
    await loadAppelsOffres('');
    await loadMarches("", "");
    await loadMarcheDocuments("");
    await loadPaiements("");
    await loadSynthese();
  } catch (e) {
  // ✅ si accès interdit, on NE montre PAS l'erreur générique
  if (e?.isForbidden || e?.code === 403 || e?.message === "FORBIDDEN") return;

  console.error(e);
  showError("Erreur de chargement des données Finance. Vérifie l’API /api/finance/*.");
}

})();
