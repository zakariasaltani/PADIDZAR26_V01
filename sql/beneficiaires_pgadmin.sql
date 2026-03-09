-- Table des bénéficiaires
CREATE TABLE IF NOT EXISTS beneficiaires (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  nom_benef TEXT NOT NULL,
  nom_president TEXT,
  nbre_adherent INTEGER,
  date_creation DATE,
  observations TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiaires_type ON beneficiaires(type);
CREATE INDEX IF NOT EXISTS idx_beneficiaires_nom ON beneficiaires(nom_benef);

-- Colonnes supplémentaires dans projets
ALTER TABLE projets ADD COLUMN IF NOT EXISTS beneficiaire_id INTEGER;
ALTER TABLE projets ADD COLUMN IF NOT EXISTS type_beneficiaire TEXT;
ALTER TABLE projets ADD COLUMN IF NOT EXISTS nom_beneficiaire TEXT;

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
