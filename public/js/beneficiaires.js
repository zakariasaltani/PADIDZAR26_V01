const $ = (sel) => document.querySelector(sel);

function setMsg(text, ok = true) {
  const el = $("#msg-benef");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = ok ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
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

let beneficiaires = [];

function renderTable(list) {
  const tbody = $("#table-beneficiaires tbody");
  tbody.innerHTML = list.map(b => `
    <tr>
      <td>${b.id}</td>
      <td>${b.type || ""}</td>
      <td><strong>${b.nom_benef || ""}</strong></td>
      <td>${b.nom_president || ""}</td>
      <td>${b.nbre_adherent ?? ""}</td>
      <td>${b.date_creation ? String(b.date_creation).slice(0,10) : ""}</td>
      <td>${b.observations || ""}</td>
      <td>
        <div class="actions">
          <button class="small-btn" data-action="edit" data-id="${b.id}">Modifier</button>
          <button class="small-btn danger" data-action="delete" data-id="${b.id}">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join("");
  $("#count-benef").textContent = `${list.length} bénéficiaire(s)`;
}

function resetForm() {
  const f = $("#form-beneficiaire");
  f.reset();
  f.id.value = "";
  $("#form-title").textContent = "➕ Nouveau bénéficiaire";
  setMsg("");
}

function fillForm(b) {
  const f = $("#form-beneficiaire");
  f.id.value = b.id || "";
  f.type.value = b.type || "";
  f.nom_benef.value = b.nom_benef || "";
  f.nom_president.value = b.nom_president || "";
  f.nbre_adherent.value = b.nbre_adherent ?? "";
  f.date_creation.value = b.date_creation ? String(b.date_creation).slice(0,10) : "";
  f.observations.value = b.observations || "";
  $("#form-title").textContent = `✏️ Modifier bénéficiaire #${b.id}`;
}

function matches(b, q) {
  q = q.toLowerCase();
  return [b.type, b.nom_benef, b.nom_president, b.observations].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
}

async function loadBeneficiaires() {
  beneficiaires = await fetchJSON("/api/beneficiaires");
  renderTable(beneficiaires);
}

$("#btn-reset")?.addEventListener("click", resetForm);
$("#search-benef")?.addEventListener("input", (e) => {
  const q = e.target.value.trim();
  renderTable(!q ? beneficiaires : beneficiaires.filter(b => matches(b, q)));
});

$("#table-beneficiaires")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  const item = beneficiaires.find(x => x.id === id);
  if (!item) return;

  if (action === "edit") {
    fillForm(item);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (action === "delete") {
    if (!confirm("Supprimer ce bénéficiaire ?")) return;
    try {
      await sendJSON(`/api/beneficiaires/${id}`, {}, "DELETE");
      setMsg("✅ Supprimé.", true);
      resetForm();
      await loadBeneficiaires();
    } catch (err) {
      setMsg(`❌ ${err.message}`, false);
    }
  }
});

$("#form-beneficiaire")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    type: f.type.value.trim(),
    nom_benef: f.nom_benef.value.trim(),
    nom_president: f.nom_president.value.trim() || null,
    nbre_adherent: f.nbre_adherent.value === "" ? null : Number(f.nbre_adherent.value),
    date_creation: f.date_creation.value || null,
    observations: f.observations.value.trim() || null,
  };

  try {
    if (f.id.value) {
      await sendJSON(`/api/beneficiaires/${f.id.value}`, body, "PUT");
      setMsg("✅ Bénéficiaire modifié.", true);
    } else {
      await sendJSON("/api/beneficiaires", body, "POST");
      setMsg("✅ Bénéficiaire ajouté.", true);
    }
    resetForm();
    await loadBeneficiaires();
  } catch (err) {
    setMsg(`❌ ${err.message}`, false);
  }
});

(async function init(){
  try {
    await loadBeneficiaires();
  } catch (e) {
    console.error(e);
    alert("Erreur chargement bénéficiaires.");
  }
})();
