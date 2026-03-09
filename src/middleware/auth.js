const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";

/**
 * Extrait le token JWT depuis:
 * - Header: Authorization: Bearer <token>
 */
function getToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function authRequired(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role, permissions }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

/**
 * Vérifie l'autorisation sur un module.
 * action: "read" | "write"
 * - ADMIN: autorisé partout
 * - sinon: permissions[module] = { read: boolean, write: boolean }
 */
function requirePermission(moduleName, action = "read") {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: "Non authentifié" });
    if (u.role === "ADMIN") return next();

    const perms = u.permissions || {};
    const m = perms[moduleName] || {};
    const ok = action === "write" ? !!m.write : !!m.read;

    if (!ok) return res.status(403).json({ error: "Accès refusé" });
    next();
  };
}

function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Non authentifié" });
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Réservé administrateur" });
  next();
}

module.exports = { authRequired, requirePermission, adminOnly, JWT_SECRET };
