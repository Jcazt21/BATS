-- BATS Migration v3: Team Tracking System
-- Adds roster management and team violation detection

-- ── Extend seasons with league rule columns ────────────────────────────────────
ALTER TABLE tournament.seasons
  ADD COLUMN IF NOT EXISTS max_team_size    SMALLINT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_team_changes SMALLINT NOT NULL DEFAULT 4;

-- ── Player roster per season ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament.roster (
  roster_id     SERIAL      PRIMARY KEY,
  season_id     INT         NOT NULL REFERENCES tournament.seasons ON DELETE RESTRICT,
  username      VARCHAR(50) NOT NULL,
  changes_used  SMALLINT    NOT NULL DEFAULT 0,
  is_locked     BOOLEAN     NOT NULL DEFAULT FALSE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_roster_season_player UNIQUE (season_id, username)
);

-- ── Pokémon slots in each roster ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament.roster_pokemon (
  roster_pokemon_id SERIAL PRIMARY KEY,
  roster_id         INT NOT NULL REFERENCES tournament.roster ON DELETE CASCADE,
  pokemon_id        INT NOT NULL REFERENCES tournament.pokemon_cache,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_roster_pokemon UNIQUE (roster_id, pokemon_id)
);

-- ── Audit log of every swap ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament.roster_change_log (
  change_id          SERIAL      PRIMARY KEY,
  roster_id          INT         NOT NULL REFERENCES tournament.roster ON DELETE CASCADE,
  season_id          INT         NOT NULL REFERENCES tournament.seasons,
  change_number      SMALLINT    NOT NULL,
  removed_pokemon_id INT         REFERENCES tournament.pokemon_cache,
  added_pokemon_id   INT         REFERENCES tournament.pokemon_cache,
  changed_by         VARCHAR(20) NOT NULL DEFAULT 'player',
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note               TEXT
);

-- ── ETL-detected team violations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament.team_violations (
  violation_id   SERIAL      PRIMARY KEY,
  battle_id      VARCHAR(64) NOT NULL REFERENCES battle.fact_battles ON DELETE CASCADE,
  season_id      INT         NOT NULL REFERENCES tournament.seasons,
  player_id      INT         NOT NULL REFERENCES battle.dim_players,
  pokemon_id     INT         NOT NULL REFERENCES battle.dim_pokemon,
  roster_id      INT         REFERENCES tournament.roster,
  violation_type VARCHAR(30) NOT NULL,  -- 'not_in_roster' | 'no_roster_registered'
  was_active     BOOLEAN     NOT NULL DEFAULT FALSE,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_team_violation UNIQUE (battle_id, player_id, pokemon_id)
);
