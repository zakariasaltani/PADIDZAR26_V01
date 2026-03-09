const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const { authRequired, adminOnly } = require("../middleware/auth");

const MODULES = ["geoportail", "projets", "beneficiaires", "programmes", "financement", "finance", "dashboard", "admin"];

router.use(authRequired);
router.use(adminOnly);

/* -------- Users CRUD -------- */
router.get("/admin/users", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, username, full_name, role, is_active, created_at
       FROM users
       ORDER BY id DESC`
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /admin/users:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/users", async (req, res) => {
  try {
    const { username, full_name, password, role, is_active } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username et password requis" });

    const hash = await bcrypt.hash(password, 10);

    const r = await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role, is_active)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, username, full_name, role, is_active, created_at`,
      [username, full_name || null, hash, role || "USER", is_active === false ? false : true]
    );

    // Permissions par défaut: read-only sur tous les modules (sauf admin)
    const userId = r.rows[0].id;
    for (const m of MODULES) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, module, can_read, can_write)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, module) DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write`,
        [userId, m, m !== "admin", false]
      );
    }

    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error("Erreur POST /admin/users:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });

    const { full_name, role, is_active, password } = req.body || {};
    const fields = [];
    const vals = [];
    let i = 1;

    if (full_name !== undefined) { fields.push(`full_name = $${i++}`); vals.push(full_name || null); }
    if (role !== undefined) { fields.push(`role = $${i++}`); vals.push(role); }
    if (is_active !== undefined) { fields.push(`is_active = $${i++}`); vals.push(!!is_active); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password_hash = $${i++}`);
      vals.push(hash);
    }

    if (fields.length === 0) return res.status(400).json({ error: "Aucun champ à mettre à jour" });

    vals.push(id);
    const q = `UPDATE users SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, username, full_name, role, is_active, created_at`;
    const r = await pool.query(q, vals);
    if (r.rowCount === 0) return res.status(404).json({ error: "Utilisateur introuvable" });

    res.json(r.rows[0]);
  } catch (e) {
    console.error("Erreur PUT /admin/users/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/admin/users/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });

    const r = await pool.query("DELETE FROM users WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur DELETE /admin/users/:id:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* -------- Permissions -------- */
router.get("/admin/users/:id/permissions", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(
      `SELECT module, can_read, can_write
       FROM user_permissions
       WHERE user_id = $1
       ORDER BY module`,
      [id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error("Erreur GET /admin/users/:id/permissions:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/users/:id/permissions", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions[] requis" });

    for (const p of permissions) {
      if (!p.module) continue;
      await pool.query(
        `INSERT INTO user_permissions (user_id, module, can_read, can_write)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, module)
         DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write`,
        [userId, p.module, !!p.can_read, !!p.can_write]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Erreur PUT /admin/users/:id/permissions:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
