const $ = (sel) => document.querySelector(sel);

function setMsg(id, txt, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = txt || "";
  el.style.color = ok ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
}

async function fetchJSON(url) {
  const res = await authFetch(url);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || text || `Erreur API (${res.status})`);
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
  if (!res.ok) throw new Error(data?.error || text || `Erreur API (${res.status})`);
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
  if (!res.ok) throw new Error(data?.error || text || `Erreur API (${res.status})`);
  return data;
}

async function del(url) {
  const res = await authFetch(url, { method: "DELETE" });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(data?.error || text || `Erreur API (${res.status})`);
  return data;
}

let users = [];
let selectedUserId = null;

/* Users list */
async function loadUsers() {
  users = await fetchJSON("/api/admin/users");
  const tb = $("#table-users tbody");
  tb.innerHTML = "";
  users.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.full_name || ""}</td>
      <td>${u.role}</td>
      <td>${u.is_active ? "Oui" : "Non"}</td>
      <td style="white-space:nowrap">
        <button class="btn-secondary" data-act="edit" data-id="${u.id}">Modifier</button>
        <button class="btn-secondary" data-act="perms" data-id="${u.id}">Permissions</button>
        <button class="btn-secondary" data-act="del" data-id="${u.id}">Supprimer</button>
      </td>
    `;
    tb.appendChild(tr);
  });
}

/* Form user */
function resetUserForm() {
  $("#user-form-title").textContent = "➕ Ajouter un utilisateur";
  const f = $("#form-user");
  f.reset();
  f.querySelector('input[name="id"]').value = "";
  f.querySelector('input[name="username"]').disabled = false;
  setMsg("msg-user", "");
}

$("#btn-user-reset")?.addEventListener("click", resetUserForm);

$("#form-user")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("msg-user", "Enregistrement...");

  try {
    const fd = new FormData(e.target);
    const id = fd.get("id");
    const body = {
      username: fd.get("username"),
      full_name: fd.get("full_name"),
      role: fd.get("role"),
      is_active: fd.get("is_active") === "true",
      password: fd.get("password"),
    };

    if (!id) {
      await postJSON("/api/admin/users", body);
      setMsg("msg-user", "✅ Utilisateur créé");
    } else {
      // update (username non modifiable)
      const upd = {
        full_name: body.full_name,
        role: body.role,
        is_active: body.is_active,
        password: body.password || undefined,
      };
      await putJSON(`/api/admin/users/${id}`, upd);
      setMsg("msg-user", "✅ Utilisateur mis à jour");
    }

    resetUserForm();
    await loadUsers();
  } catch (err) {
    setMsg("msg-user", "❌ " + err.message, false);
  }
});

/* Table actions */
$("#table-users")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const act = btn.dataset.act;
  const id = btn.dataset.id;

  if (act === "edit") {
    const u = users.find(x => String(x.id) === String(id));
    if (!u) return;
    $("#user-form-title").textContent = `✏️ Modifier utilisateur #${u.id}`;
    const f = $("#form-user");
    f.querySelector('input[name="id"]').value = u.id;
    f.querySelector('input[name="username"]').value = u.username;
    f.querySelector('input[name="username"]').disabled = true;
    f.querySelector('input[name="full_name"]').value = u.full_name || "";
    f.querySelector('select[name="role"]').value = u.role;
    f.querySelector('select[name="is_active"]').value = String(!!u.is_active);
    f.querySelector('input[name="password"]').value = "";
    setMsg("msg-user", "⚠️ Laisser le mot de passe vide pour ne pas le changer.", true);
  }

  if (act === "del") {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await del(`/api/admin/users/${id}`);
      await loadUsers();
    } catch (err) {
      alert("Erreur: " + err.message);
    }
  }

  if (act === "perms") {
    selectedUserId = id;
    await openPerms(id);
  }
});

/* Permissions */
async function openPerms(userId) {
  $("#perm-card").style.display = "block";
  $("#perm-title").textContent = `🔧 Permissions utilisateur #${userId}`;
  await loadPerms(userId);
}

async function loadPerms(userId) {
  setMsg("msg-perm", "");
  const rows = await fetchJSON(`/api/admin/users/${userId}/permissions`);
  const tb = $("#table-perms tbody");
  tb.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.module}</td>
      <td><input type="checkbox" data-mod="${r.module}" data-field="can_read" ${r.can_read ? "checked" : ""}></td>
      <td><input type="checkbox" data-mod="${r.module}" data-field="can_write" ${r.can_write ? "checked" : ""}></td>
    `;
    tb.appendChild(tr);
  });
}

$("#btn-perm-refresh")?.addEventListener("click", () => selectedUserId && loadPerms(selectedUserId));

$("#btn-perm-save")?.addEventListener("click", async () => {
  if (!selectedUserId) return;
  try {
    const perm = [];
    $("#table-perms tbody").querySelectorAll("tr").forEach(tr => {
      const mod = tr.querySelector("input")?.dataset.mod;
      const read = tr.querySelector('input[data-field="can_read"]')?.checked;
      const write = tr.querySelector('input[data-field="can_write"]')?.checked;
      perm.push({ module: mod, can_read: !!read, can_write: !!write });
    });

    await putJSON(`/api/admin/users/${selectedUserId}/permissions`, { permissions: perm });
    setMsg("msg-perm", "✅ Permissions enregistrées");

    // Si on modifie son propre user, rafraîchir le cache local
    const me = JSON.parse(localStorage.getItem("user") || "null");
    if (me && String(me.id) === String(selectedUserId)) {
      const meRes = await fetchJSON("/api/auth/me");
      localStorage.setItem("user", JSON.stringify(meRes.user));
    }
  } catch (err) {
    setMsg("msg-perm", "❌ " + err.message, false);
  }
});

$("#btn-perm-close")?.addEventListener("click", () => {
  $("#perm-card").style.display = "none";
  selectedUserId = null;
});

/* Init */
(async function init() {
  try {
    await loadUsers();
  } catch (e) {
    alert("Accès refusé ou erreur API. " + e.message);
  }
})();
