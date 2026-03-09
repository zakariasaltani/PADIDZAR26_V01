-- Ajout du lien AO dans les marchés
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
);

ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS programme_id INTEGER;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS numero_ao TEXT;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS objet TEXT;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS date_lancement DATE;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS date_ouverture_plis DATE;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'BROUILLON';
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS montant_estime NUMERIC(14,2) DEFAULT 0;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'appels_offres_programme_fk'
    ) THEN
        ALTER TABLE appels_offres
            ADD CONSTRAINT appels_offres_programme_fk
            FOREIGN KEY (programme_id)
            REFERENCES programmes(id)
            ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_ao_programme_numero'
    ) THEN
        ALTER TABLE appels_offres
            ADD CONSTRAINT uq_ao_programme_numero UNIQUE (programme_id, numero_ao);
    END IF;
END $$;

ALTER TABLE marches ADD COLUMN IF NOT EXISTS ao_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'marches_ao_fk'
    ) THEN
        ALTER TABLE marches
            ADD CONSTRAINT marches_ao_fk
            FOREIGN KEY (ao_id)
            REFERENCES appels_offres(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ao_programme ON appels_offres(programme_id);
CREATE INDEX IF NOT EXISTS idx_ao_numero ON appels_offres(numero_ao);
CREATE INDEX IF NOT EXISTS idx_marches_ao_id ON marches(ao_id);
