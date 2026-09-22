-- =============================================================================
-- BATS — Migración v11: espejo del dex de Showdown y veredicto de validación
-- =============================================================================
-- El dex deja de resolverse contra PokéAPI en el cliente: se exporta del fork de
-- Showdown (tools/export_dex.js) y se importa aquí (`python -m bats_core dex --import`),
-- para que la API valide los registros con los mismos datos que el formato de PS,
-- sin confiar en lo que declare el cliente.

CREATE TABLE IF NOT EXISTS tournament.dex_species (
  species_id     VARCHAR(60)  PRIMARY KEY,          -- id de Showdown: "garchomp"
  name           VARCHAR(80)  NOT NULL,
  national_dex   INT,
  types          VARCHAR(40)  NOT NULL,             -- "Dragon / Ground" (igual que pokemon_cache)
  color          VARCHAR(20),
  generation     SMALLINT,
  egg_groups     TEXT[]       NOT NULL DEFAULT '{}',
  bst            SMALLINT     NOT NULL DEFAULT 0,
  tags           TEXT[]       NOT NULL DEFAULT '{}',
  base_species   VARCHAR(80),
  sprite_id      VARCHAR(80),
  is_restricted  BOOLEAN      NOT NULL DEFAULT FALSE,
  is_paradox     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_pseudo      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_ultra_beast BOOLEAN      NOT NULL DEFAULT FALSE,
  league_legal   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_dex_species_lower_name
  ON tournament.dex_species (LOWER(name));

-- Versión del snapshot importado (una sola fila).
CREATE TABLE IF NOT EXISTS tournament.dex_meta (
  only_row      BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (only_row),
  generated_at  TIMESTAMPTZ,
  ps_commit     VARCHAR(40),
  species_count INT         NOT NULL DEFAULT 0,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Veredicto del TeamValidator real de Showdown (lo devuelve el plugin bats-ingest).
ALTER TABLE tournament.roster
  ADD COLUMN IF NOT EXISTS validation_errors JSONB,
  ADD COLUMN IF NOT EXISTS validated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_commit  VARCHAR(40);
