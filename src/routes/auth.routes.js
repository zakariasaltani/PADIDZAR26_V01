const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authRequired, JWT_SECRET } = require("../middleware/auth");

async function getUserPermissions(userId) {
  const r = await pool.query(
    `SELECT module, can_read, can_write
     FROM user_permissions
     WHERE user_id = $1`,
    [userId]
  );

  const permissions = {};
  for (const row of r.rows) {
    permissions[row.module] = { read: row.can_read, write: row.can_write };
  }
  return permissions;
}

router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username et password requis" });

    const u = await pool.query(
      `SELECT id, username, full_name, password_hash, role, is_active
       FROM users
       WHERE username = $1`,
      [username]
    );
    if (u.rowCount === 0) return res.status(401).json({ error: "Identifiants invalides" });

    const user = u.rows[0];
    if (!user.is_active) return res.status(403).json({ error: "Compte désactivé" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Identifiants invalides" });

    const permissions = await getUserPermissions(user.id);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissions },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, permissions }
    });
  } catch (e) {
    console.error("Erreur POST /auth/login:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/auth/me", authRequired, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
