-- =============================================================================
-- BATS Migration v2
-- Agrega season_id a fact_battles y crea fact_ban_violations.
--
-- Ejecutar UNA sola vez contra la DB existente:
--   psql bats-pkmn < bats/db/migrations/v2.sql
-- =============================================================================

-- 1. Columna season_id en fact_battles
ALTER TABLE battle.fact_battles
    ADD COLUMN IF NOT EXISTS season_id INT
        REFERENCES tournament.seasons(season_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_battles_season ON battle.fact_battles(season_id);

-- 2. Tabla de violaciones de ban
CREATE TABLE IF NOT EXISTS battle.fact_ban_violations (
    violation_id  BIGSERIAL    PRIMARY KEY,
    battle_id     VARCHAR(80)  NOT NULL REFERENCES battle.fact_battles(battle_id) ON DELETE CASCADE,
    season_id     INT          NOT NULL REFERENCES tournament.seasons(season_id),
    player_id     INT          NOT NULL REFERENCES battle.dim_players(player_id),
    pokemon_id    INT          NOT NULL REFERENCES battle.dim_pokemon(pokemon_id),
    ban_id        INT          NOT NULL REFERENCES tournament.bans(ban_id),
    was_active    BOOLEAN      NOT NULL,
    detected_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_violation UNIQUE (battle_id, player_id, pokemon_id)
);

CREATE INDEX IF NOT EXISTS idx_violations_battle ON battle.fact_ban_violations(battle_id);
CREATE INDEX IF NOT EXISTS idx_violations_season ON battle.fact_ban_violations(season_id);
CREATE INDEX IF NOT EXISTS idx_violations_player ON battle.fact_ban_violations(player_id);

-- 3. Backfill: asignar season_id a batallas existentes por rango de fechas
UPDATE battle.fact_battles fb
SET season_id = s.season_id
FROM tournament.seasons s
WHERE fb.battle_date BETWEEN s.start_date AND COALESCE(s.end_date, CURRENT_DATE)
  AND fb.season_id IS NULL;

-- 4. Detectar violaciones preexistentes
INSERT INTO battle.fact_ban_violations
    (battle_id, season_id, player_id, pokemon_id, ban_id, was_active)
SELECT
    fpp.battle_id,
    fb.season_id,
    fpp.player_id,
    fpp.pokemon_id,
    b.ban_id,
    fpp.was_active
FROM battle.fact_pokemon_performance fpp
JOIN battle.fact_battles      fb  ON fb.battle_id      = fpp.battle_id
JOIN battle.dim_players       dpl ON dpl.player_id     = fpp.player_id
JOIN battle.dim_pokemon       dp  ON dp.pokemon_id     = fpp.pokemon_id
JOIN tournament.bans          b   ON b.player_username = dpl.username
                                 AND b.season_id       = fb.season_id
                                 AND b.is_active       = TRUE
JOIN tournament.pokemon_cache pc  ON pc.pokemon_id     = b.pokemon_id
                                 AND LOWER(pc.name)    = LOWER(dp.species)
WHERE fb.season_id IS NOT NULL
ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING;
