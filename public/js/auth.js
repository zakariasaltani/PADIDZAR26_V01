// Auth helpers (JWT stocké en localStorage)
function getToken() {
  return localStorage.getItem("token") || "";
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = options.headers ? { ...options.headers } : {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

function requireAuth() {
  const token = getToken();
  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (!token && page !== "login.html") {
    window.location.href = "login.html";
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}
