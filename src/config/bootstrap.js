const pool = require("./db");
const bcrypt = require("bcryptjs");

/**
 * Crée les tables manquantes + colonnes nécessaires.
 * Idempotent (peut être relancé sans risque).
 */
async function bootstrap() {
  // 0) Tables "métier" minimales (si elles n'existent pas)
  //    NB: certaines installations ont déjà ces tables; on se contente de garantir leur existence
  //    pour éviter que les ALTER TABLE plus bas échouent.

  // Fournisseurs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fournisseurs (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL,
      ice TEXT,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Marchés
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marches (
      id SERIAL PRIMARY KEY,
      projet_id INTEGER,
      fournisseur_id INTEGER,
      numero_marche TEXT,
      objet TEXT,
      montant NUMERIC(14,2),
      statut TEXT,
      date_signature DATE,
      nature_depense TEXT,
      imputation_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Paiements
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paiements (
      id SERIAL PRIMARY KEY,
      id_marche INTEGER,
      montant NUMERIC(14,2) NOT NULL,
      date_paiement DATE NOT NULL,
      reference TEXT,
      mode TEXT,
      observation TEXT,
      imputation_id INTEGER,
      imputation_source VARCHAR(20),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // 1) Users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(80) UNIQUE NOT NULL,
      full_name VARCHAR(160),
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'USER',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Si la table existait déjà (sans certaines colonnes), on les ajoute.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(160)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  // Garantir un rôle pour les anciens enregistrements (au cas où)
  await pool.query(`UPDATE users SET role = COALESCE(role, 'USER')`);

  // 2) Permissions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module VARCHAR(50) NOT NULL,
      can_read BOOLEAN NOT NULL DEFAULT FALSE,
      can_write BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(user_id, module)
    )
  `);

  // 3) Imputations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imputations (
      id SERIAL PRIMARY KEY,
      exercice INTEGER,
      code TEXT,
      numero_article TEXT,
      numero_paragraphe TEXT,
      numero_ligne TEXT,
      nature TEXT UNIQUE,
      montant_report NUMERIC(14,2) DEFAULT 0,
      montant_consolide NUMERIC(14,2) DEFAULT 0,
      budget_nouveau NUMERIC(14,2) DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // 4) Marchés: lien vers imputations
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS nature_depense TEXT`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS imputation_id INTEGER`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS date_signature DATE`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS statut TEXT`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS objet TEXT`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS numero_marche TEXT`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS montant NUMERIC(14,2)`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS projet_id INTEGER`);
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS fournisseur_id INTEGER`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marches_imputation_fk'
      ) THEN
        ALTER TABLE marches
          ADD CONSTRAINT marches_imputation_fk
          FOREIGN KEY (imputation_id) REFERENCES imputations(id) ON DELETE SET NULL;
      END IF;
    END$$;
  `);

  // FK vers fournisseurs (optionnel)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marches_fournisseur_fk'
      ) THEN
        ALTER TABLE marches
          ADD CONSTRAINT marches_fournisseur_fk
          FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id) ON DELETE SET NULL;
      END IF;
    END$$;
  `);

  // 4b) Paiements: imputation + type (report/consolide/nouveau)
  await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS imputation_id INTEGER`);
  await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS imputation_source VARCHAR(20)`);
  await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS reference TEXT`);
  await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS mode TEXT`);
  await pool.query(`ALTER TABLE paiements ADD COLUMN IF NOT EXISTS observation TEXT`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'paiements_imputation_fk'
      ) THEN
        ALTER TABLE paiements
          ADD CONSTRAINT paiements_imputation_fk
          FOREIGN KEY (imputation_id) REFERENCES imputations(id) ON DELETE SET NULL;
      END IF;
    END$$;
  `);

  // FK paiements -> marches (optionnel)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'paiements_marche_fk'
      ) THEN
        ALTER TABLE paiements
          ADD CONSTRAINT paiements_marche_fk
          FOREIGN KEY (id_marche) REFERENCES marches(id) ON DELETE CASCADE;
      END IF;
    END$$;
  `);

  // 4c) Documents des marchés
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marche_documents (
      id SERIAL PRIMARY KEY,
      marche_id INTEGER NOT NULL REFERENCES marches(id) ON DELETE CASCADE,
      numero_marche TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      web_path TEXT NOT NULL,
      mime_type TEXT,
      file_size BIGINT,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marche_documents_marche_id ON marche_documents(marche_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marche_documents_numero ON marche_documents(numero_marche)`);

  // 4d) Bénéficiaires
  await pool.query(`
    CREATE TABLE IF NOT EXISTS beneficiaires (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      nom_benef TEXT NOT NULL,
      nom_president TEXT,
      nbre_adherent INTEGER,
      date_creation DATE,
      observations TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_beneficiaires_type ON beneficiaires(type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_beneficiaires_nom ON beneficiaires(nom_benef)`);

  // 4e) Projets -> bénéficiaires
  await pool.query(`ALTER TABLE projets ADD COLUMN IF NOT EXISTS beneficiaire_id INTEGER`);
  await pool.query(`ALTER TABLE projets ADD COLUMN IF NOT EXISTS type_beneficiaire TEXT`);
  await pool.query(`ALTER TABLE projets ADD COLUMN IF NOT EXISTS nom_beneficiaire TEXT`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'projets_beneficiaire_fk'
      ) THEN
        ALTER TABLE projets
          ADD CONSTRAINT projets_beneficiaire_fk
          FOREIGN KEY (beneficiaire_id) REFERENCES beneficiaires(id) ON DELETE SET NULL;
      END IF;
    END$$;
  `);


  // 4f) Appels d'offres (AO)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appels_offres (
      id SERIAL PRIMARY KEY,
      programme_id INTEGER NOT NULL,
      numero_ao TEXT NOT NULL,
      objet TEXT,
      date_lancement DATE,
      date_ouverture_plis DATE,
      statut TEXT DEFAULT 'BROUILLON',
      montant_estime NUMERIC(14,2) DEFAULT 0,
      observations TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS programme_id INTEGER`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS numero_ao TEXT`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS objet TEXT`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS date_lancement DATE`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS date_ouverture_plis DATE`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'BROUILLON'`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS montant_estime NUMERIC(14,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS observations TEXT`);
  await pool.query(`ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ao_programme ON appels_offres(programme_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ao_numero ON appels_offres(numero_ao)`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'appels_offres_programme_fk'
      ) THEN
        ALTER TABLE appels_offres
          ADD CONSTRAINT appels_offres_programme_fk
          FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE CASCADE;
      END IF;
    END$$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_ao_programme_numero'
      ) THEN
        ALTER TABLE appels_offres
          ADD CONSTRAINT uq_ao_programme_numero UNIQUE (programme_id, numero_ao);
      END IF;
    END$$;
  `);

  // 4g) Marchés -> AO
  await pool.query(`ALTER TABLE marches ADD COLUMN IF NOT EXISTS ao_id INTEGER`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marches_ao_id ON marches(ao_id)`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marches_ao_fk'
      ) THEN
        ALTER TABLE marches
          ADD CONSTRAINT marches_ao_fk
          FOREIGN KEY (ao_id) REFERENCES appels_offres(id) ON DELETE SET NULL;
      END IF;
    END$$;
  `);

  // 5) Admin par défaut (à changer)
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "admin12345";

  const exists = await pool.query("SELECT id FROM users WHERE username = $1", [adminUser]);
  if (exists.rowCount === 0) {
    const hash = await bcrypt.hash(adminPass, 10);
    const r = await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role)
       VALUES ($1,$2,$3,'ADMIN')
       RETURNING id`,
      [adminUser, "Administrateur", hash]
    );

    const adminId = r.rows[0].id;
    const modules = ["geoportail", "projets", "beneficiaires", "financement", "finance", "dashboard", "admin"];
    for (const m of modules) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, module, can_read, can_write)
         VALUES ($1,$2,TRUE,TRUE)
         ON CONFLICT (user_id, module) DO NOTHING`,
        [adminId, m]
      );
    }

    console.log("✅ Utilisateur admin créé (changer le mot de passe après la 1ère connexion).");
  }
}

module.exports = bootstrap;
