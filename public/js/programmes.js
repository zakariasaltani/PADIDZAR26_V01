// public/js/programmes.js
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

async function api(url, opts) {
  const res = await authFetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

function resetForm() {
  $("id").value = "";
  $("fonds_financement_id").value = "";
  $("code").value = "";
  $("intitule").value = "";
  $("description").value = "";
  $("annee_debut").value = "";
  $("annee_fin").value = "";
  $("budget_global").value = "";
  $("formTitle").textContent = "Nouveau programme";
}

async function loadFondsDropdown() {
  const fonds = await api("/api/fonds-financement");
  const options = [`<option value="">-- Choisir --</option>`]
    .concat(fonds.map(f => `<option value="${f.id}">${esc((f.code ? f.code+" - " : "") + (f.nom || ""))}</option>`));

  $("fonds_financement_id").innerHTML = options.join("");
  $("filterFond").innerHTML = [`<option value="">Tous fonds</option>`].concat(
    fonds.map(f => `<option value="${f.id}">${esc((f.code ? f.code+" - " : "") + (f.nom || ""))}</option>`)
  ).join("");
}

function buildQuery() {
  const p = new URLSearchParams();
  const q = $("search").value.trim();
  const fid = $("filterFond").value;

  if (q) p.set("q", q);
  if (fid) p.set("fonds_financement_id", fid);

  const qs = p.toString();
  return qs ? `/api/programmes?${qs}` : `/api/programmes`;
}

async function load() {
  const rows = await api(buildQuery());
  $("tbody").innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.id)}</td>
      <td>${esc(r.code || "")}</td>
      <td>${esc(r.intitule || "")}</td>
      <td>${esc(r.fonds_nom || "")}</td>
      <td>${esc(r.annee_debut || "")} → ${esc(r.annee_fin || "")}</td>
      <td>${esc(r.budget_global ?? 0)}</td>
      <td>
        <button onclick="editItem(${r.id})">Modifier</button>
        <button class="danger" onclick="delItem(${r.id})">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

window.editItem = async (id) => {
  const r = await api(`/api/programmes/${id}`);
  $("id").value = r.id;
  $("fonds_financement_id").value = r.fonds_financement_id || "";
  $("code").value = r.code || "";
  $("intitule").value = r.intitule || "";
  $("description").value = r.description || "";
  $("annee_debut").value = r.annee_debut || "";
  $("annee_fin").value = r.annee_fin || "";
  $("budget_global").value = r.budget_global ?? 0;
  $("formTitle").textContent = `Modifier programme #${id}`;
};

window.delItem = async (id) => {
  if (!confirm("Supprimer ce programme ?")) return;
  try {
    await api(`/api/programmes/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    alert(e.message);
  }
};

$("btnSave").addEventListener("click", async () => {
  try {
    const body = {
      fonds_financement_id: $("fonds_financement_id").value || null,
      code: $("code").value.trim() || null,
      intitule: $("intitule").value.trim(),
      description: $("description").value.trim() || null,
      annee_debut: $("annee_debut").value.trim() || null,
      annee_fin: $("annee_fin").value.trim() || null,
      budget_global: $("budget_global").value.trim() || 0,
    };

    const id = $("id").value;
    if (id) {
      await api(`/api/programmes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } else {
      await api(`/api/programmes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    }

    resetForm();
    await load();
  } catch (e) {
    alert(e.message);
  }
});

$("btnCancel").addEventListener("click", resetForm);
$("btnSearch").addEventListener("click", load);
$("btnReset").addEventListener("click", () => {
  $("search").value = "";
  $("filterFond").value = "";
  load();
});

(async () => {
  try {
    await loadFondsDropdown();
    resetForm();
    await load();
  } catch (e) {
    alert(e.message);
  }
})();
