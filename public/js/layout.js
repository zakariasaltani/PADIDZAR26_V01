async function loadNavbar() {
  try {
    const res = await fetch("/partials/navbar.html");
    const html = await res.text();

    const slot = document.getElementById("navbar-slot");
    if (!slot) return;

    slot.innerHTML = html;

    // Highlight du lien actif
    const current = window.location.pathname.split("/").pop() || "index.html";
    const links = slot.querySelectorAll(".links a");
    links.forEach(a => {
      const href = a.getAttribute("href");
      if (href === current) a.classList.add("active");
    });

    // User info + permissions
    const stored = localStorage.getItem("user");
    let user = null;
    try { user = stored ? JSON.parse(stored) : null; } catch {}

    // Bouton logout
    const btnLogout = slot.querySelector("#btn-logout");
    if (btnLogout) btnLogout.addEventListener("click", (e) => { e.preventDefault(); logout(); });

    // Affichage nom utilisateur
    const userLabel = slot.querySelector("#user-label");
    if (userLabel && user) userLabel.textContent = user.full_name || user.username;

    // Masquer les liens non autorisés (sauf ADMIN)
    const perms = user?.permissions || {};
    const isAdmin = user?.role === "ADMIN";

    slot.querySelectorAll("a[data-module]").forEach(a => {
      const mod = a.getAttribute("data-module");
      if (isAdmin) return;
      const p = perms[mod];
      if (!p || !p.read) a.style.display = "none";
    });

    // Charger les KPI (auth)
    try {
      const kpiRes = await authFetch("/api/kpi");
      const kpi = await kpiRes.json();

      const elCommunes = slot.querySelector("#kpi-communes");
      if (elCommunes) elCommunes.textContent = kpi.communes ?? "—";

      const elProjets = slot.querySelector("#kpi-projets");
      if (elProjets) elProjets.textContent = (kpi.projets === null ? "N/A" : kpi.projets);
    } catch (e) {
      console.error("Erreur chargement KPI", e);
    }

  } catch (e) {
    console.error("Erreur chargement navbar", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  requireAuth();
  loadNavbar();
});
