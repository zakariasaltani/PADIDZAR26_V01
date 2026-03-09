const $ = (sel) => document.querySelector(sel);

function setMsg(text, ok = true) {
  const el = $("#msg-fond");
  el.textContent = text || "";
  el.style.color = ok ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
}

async function fetchJSON(url) {
  const res = await authFetch(url);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
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
  if (!res.ok) throw new Error(data?.error || data?.message || text || `Erreur API (${res.status})`);
  return data;
}

let fonds = [];

function fillForm(f) {
  const form = $("#form-fond");
  form.id.value = f.id ?? "";
  form.type_source.value = f.type_source ?? "PUBLIC";
  form.nom.value = f.nom ?? "";
  form.code.value = f.code ?? "";
  form.description.value = f.description ?? "";
  form.contact_nom.value = f.contact_nom ?? "";
  form.contact_tel.value = f.contact_tel ?? "";
  form.contact_email.value = f.contact_email ?? "";
  form.devise.value = f.devise ?? "MAD";
  form.statut.value = f.statut ?? "ACTIF";
  form.date_debut.value = f.date_debut ? String(f.date_debut).slice(0,10) : "";
  form.date_fin.value = f.date_fin ? String(f.date_fin).slice(0,10) : "";

  $("#form-title").textContent = f.id ? `✏️ Modifier fond #${f.id}` : "➕ Nouveau fond";
}

function resetForm() {
  $("#form-fond").reset();
  $("#form-fond").id.value = "";
  $("#form-title").textContent = "➕ Nouveau fond";
  setMsg("");
}

function renderTable(list) {
  const tbody = $("#table-fonds tbody");
  tbody.innerHTML = list.map(f => `
    <tr>
      <td>${f.id}</td>
      <td>${f.type_source || ""}</td>
      <td>${f.nom || ""}</td>
      <td>${f.code || ""}</td>
      <td>${f.devise || ""}</td>
      <td>${f.statut || ""}</td>
      <td>${f.date_debut ? String(f.date_debut).slice(0,10) : ""} → ${f.date_fin ? String(f.date_fin).slice(0,10) : ""}</td>
      <td>
        ${f.contact_nom ? `<div><b>${f.contact_nom}</b></div>` : ""}
        ${f.contact_tel ? `<div>${f.contact_tel}</div>` : ""}
        ${f.contact_email ? `<div>${f.contact_email}</div>` : ""}
      </td>
      <td>
        <div class="actions">
          <button class="small-btn" data-action="edit" data-id="${f.id}">Modifier</button>
          <button class="small-btn danger" data-action="delete" data-id="${f.id}">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("#count-fonds").textContent = `${list.length} fond(s)`;
}

async function loadFonds() {
  fonds = await fetchJSON("/api/fonds");
  renderTable(fonds);
}

$("#btn-reset").addEventListener("click", resetForm);

$("#search-fonds").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = fonds.filter(f =>
    String(f.id).includes(q) ||
    (f.type_source || "").toLowerCase().includes(q) ||
    (f.nom || "").toLowerCase().includes(q) ||
    (f.code || "").toLowerCase().includes(q) ||
    (f.statut || "").toLowerCase().includes(q)
  );
  renderTable(filtered);
});

$("#table-fonds").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit") {
    const f = fonds.find(x => String(x.id) === String(id));
    if (f) fillForm(f);
  }

  if (action === "delete") {
    if (!confirm("Supprimer ce fond ?")) return;
    try {
      await sendJSON(`/api/fonds/${id}`, {}, "DELETE");
      setMsg("✅ Fond supprimé.", true);
      resetForm();
      await loadFonds();
    } catch (err) {
      setMsg(`❌ ${err.message}`, false);
    }
  }
});

$("#form-fond").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("Enregistrement...", true);

  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());

  // nettoyage
  body.type_source = (body.type_source || "").trim();
  body.nom = (body.nom || "").trim();
  body.code = body.code?.trim() || null;
  body.description = body.description?.trim() || null;
  body.contact_nom = body.contact_nom?.trim() || null;
  body.contact_tel = body.contact_tel?.trim() || null;
  body.contact_email = body.contact_email?.trim() || null;
  body.devise = body.devise?.trim() || "MAD";
  body.statut = body.statut || "ACTIF";
  body.date_debut = body.date_debut || null;
  body.date_fin = body.date_fin || null;

  try {
    if (body.id) {
      const id = body.id;
      delete body.id;
      await sendJSON(`/api/fonds/${id}`, body, "PUT");
      setMsg("✅ Fond modifié.", true);
    } else {
      delete body.id;
      await sendJSON("/api/fonds", body, "POST");
      setMsg("✅ Fond ajouté.", true);
    }

    resetForm();
    await loadFonds();
  } catch (err) {
    setMsg(`❌ ${err.message}`, false);
  }
});

(async function init(){
  try {
    await loadFonds();
  } catch(e) {
    console.error(e);
    alert("Erreur chargement Fonds. Vérifie l’API /api/fonds");
  }
})();
