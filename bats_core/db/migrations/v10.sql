-- =============================================================================
-- BATS — Migración v10: una sola fuente por métrica + MVP como columna generada
-- =============================================================================
-- 1. MVP en un solo sitio. `battle.mvp_score()` implementa la fórmula (espejo de
--    bats_core/mvp.py; tests/test_mvp.py comprueba que coinciden) y
--    fact_pokemon_performance.mvp_score pasa a ser una columna GENERADA: el ETL ya
--    no la calcula. Los pokémon de banca (was_active = FALSE) puntúan 0.
--
--    Cambiar la fórmula = nueva migración que recree la columna (DROP + ADD).
--    Un STORED generado no se recalcula solo cuando cambia el cuerpo de la función.
--
-- 2. Las vistas materializadas incluyen season_id, así que la API lee SIEMPRE la
--    vista (con o sin ?season_id=) en vez de recalcular la misma métrica sobre las
--    tablas base. Eso es lo que provocó la divergencia observada en la migración.
--    Guardan sumas crudas (rows_used, wins, total_kills...) para que reagregar
--    varias filas dé promedios exactos. season_id = 0 significa "sin temporada".
--
-- schema.sql sigue creando las versiones antiguas de las vistas (v8 les pone índices
-- y necesita que existan); esta migración las reemplaza. Idempotente: se puede
-- reaplicar. Debe correr DESPUÉS de v8.
-- =============================================================================

CREATE OR REPLACE FUNCTION battle.mvp_score(
    p_kills        INT,
    p_turns_active INT,
    p_survived     BOOLEAN,
    p_final_hit    BOOLEAN
) RETURNS NUMERIC(8,2)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT (p_kills * 2 + p_survived::INT + p_final_hit::INT + LEAST(p_turns_active, 8) * 0.25)::NUMERIC(8,2)
$$;

-- Las vistas dependen de mvp_score: se sueltan antes de tocar la columna.
DROP MATERIALIZED VIEW IF EXISTS
    battle.mv_ban_candidates, battle.mv_pick_rate, battle.mv_mvp_leaderboard,
    battle.mv_player_stats, battle.mv_bot_pokemon, battle.mv_bot_summary
CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'battle' AND table_name = 'fact_pokemon_performance'
          AND column_name = 'mvp_score' AND is_generated = 'ALWAYS'
    ) THEN
        ALTER TABLE battle.fact_pokemon_performance DROP COLUMN mvp_score;
        ALTER TABLE battle.fact_pokemon_performance
            ADD COLUMN mvp_score NUMERIC(8,2) GENERATED ALWAYS AS (
                CASE WHEN was_active
                     THEN battle.mvp_score(kills, turns_active, survived, final_hit)
                     ELSE 0 END
            ) STORED;
    END IF;
END $$;

-- ─── Pick rate ────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW battle.mv_pick_rate AS
WITH slots AS (
    SELECT COALESCE(fb.season_id, 0) AS season_id,
           df.format_name,
           COUNT(DISTINCT (fb.battle_id, p.player_id)) AS total_slots
    FROM battle.fact_battles fb
    JOIN battle.dim_formats df ON df.format_id = fb.format_id
    JOIN LATERAL (VALUES (fb.p1_id), (fb.p2_id)) AS p(player_id) ON TRUE
    JOIN battle.dim_players dpl ON dpl.player_id = p.player_id
    WHERE NOT fb.is_bot_battle AND NOT dpl.is_bot
    GROUP BY 1, 2
)
SELECT
    dp.species,
    df.format_name,
    COALESCE(fb.season_id, 0)                                        AS season_id,
    COUNT(DISTINCT (fpp.battle_id, fpp.player_id))                   AS battles_used,
    t.total_slots                                                    AS total_slots,
    COUNT(*)                                                         AS rows_used,
    COUNT(*) FILTER (WHERE fb.winner_id = fpp.player_id)             AS wins,
    SUM(fpp.kills)                                                   AS total_kills,
    SUM(fpp.mvp_score)                                               AS total_mvp_score,
    ROUND(AVG(fpp.kills), 2)                                         AS avg_kills,
    ROUND(AVG(fpp.mvp_score), 2)                                     AS avg_mvp_score,
    ROUND(100.0 * COUNT(*) FILTER (WHERE fb.winner_id = fpp.player_id)
          / NULLIF(COUNT(*), 0), 2)                                  AS win_rate_pct
FROM battle.fact_pokemon_performance fpp
JOIN battle.fact_battles fb  ON fb.battle_id  = fpp.battle_id
JOIN battle.dim_pokemon  dp  ON dp.pokemon_id = fpp.pokemon_id
JOIN battle.dim_formats  df  ON df.format_id  = fb.format_id
JOIN battle.dim_players  dpl ON dpl.player_id = fpp.player_id
JOIN slots t ON t.format_name = df.format_name AND t.season_id = COALESCE(fb.season_id, 0)
WHERE fpp.was_active = TRUE AND NOT fb.is_bot_battle AND NOT dpl.is_bot
GROUP BY dp.species, df.format_name, COALESCE(fb.season_id, 0), t.total_slots;

CREATE UNIQUE INDEX uq_mv_pick_rate ON battle.mv_pick_rate (species, format_name, season_id);

-- ─── Ranking MVP (solo pokémon que jugaron) ───────────────────────────────────
CREATE MATERIALIZED VIEW battle.mv_mvp_leaderboard AS
SELECT
    dpl.username,
    dp.species,
    df.format_name,
    COALESCE(fb.season_id, 0)   AS season_id,
    SUM(fpp.kills)              AS total_kills,
    SUM(fpp.mvp_score)          AS total_mvp_score,
    SUM(fpp.final_hit::INT)     AS final_hits,
    COUNT(*)                    AS battles_used
FROM battle.fact_pokemon_performance fpp
JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
JOIN battle.dim_pokemon  dp ON dp.pokemon_id = fpp.pokemon_id
JOIN battle.fact_battles fb ON fb.battle_id  = fpp.battle_id
JOIN battle.dim_formats  df ON df.format_id  = fb.format_id
WHERE fpp.was_active = TRUE AND NOT fb.is_bot_battle AND NOT dpl.is_bot
GROUP BY dpl.username, dp.species, df.format_name, COALESCE(fb.season_id, 0);

CREATE UNIQUE INDEX uq_mv_mvp_leaderboard
    ON battle.mv_mvp_leaderboard (username, species, format_name, season_id);

-- ─── Récord por jugador ───────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW battle.mv_player_stats AS
SELECT
    dpl.username,
    df.format_name,
    COALESCE(fb.season_id, 0)                                                 AS season_id,
    COUNT(DISTINCT fb.battle_id)                                              AS total_battles,
    COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id) AS wins,
    ROUND(
        100.0 * COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id)
        / NULLIF(COUNT(DISTINCT fb.battle_id), 0), 2
    )                                                                         AS win_rate_pct,
    COALESCE(SUM(fpp.survived::INT), 0)                                       AS total_survivors
FROM battle.dim_players dpl
JOIN battle.fact_battles fb ON fb.p1_id = dpl.player_id OR fb.p2_id = dpl.player_id
JOIN battle.dim_formats  df ON df.format_id = fb.format_id
LEFT JOIN battle.fact_pokemon_performance fpp
    ON fpp.battle_id = fb.battle_id
   AND fpp.player_id = dpl.player_id
   AND fpp.survived  = TRUE
WHERE NOT fb.is_bot_battle AND NOT dpl.is_bot
GROUP BY dpl.username, df.format_name, COALESCE(fb.season_id, 0);

CREATE UNIQUE INDEX uq_mv_player_stats ON battle.mv_player_stats (username, format_name, season_id);

-- ─── Candidatos a ban (win rate > 70%) ────────────────────────────────────────
-- battles_used va incluido: con pocas batallas un 100% no significa nada.
CREATE MATERIALIZED VIEW battle.mv_ban_candidates AS
SELECT species, format_name, season_id, battles_used, avg_kills, avg_mvp_score, win_rate_pct
FROM battle.mv_pick_rate
WHERE win_rate_pct > 70;

CREATE UNIQUE INDEX uq_mv_ban_candidates ON battle.mv_ban_candidates (species, format_name, season_id);

-- ─── Contra el bot (sin cambios de definición; se recrean por depender de mvp_score) ──
CREATE MATERIALIZED VIEW battle.mv_bot_summary AS
SELECT
    dpl.username,
    COUNT(DISTINCT fb.battle_id)                                              AS total_battles,
    COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id) AS wins,
    ROUND(
        100.0 * COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id)
        / NULLIF(COUNT(DISTINCT fb.battle_id), 0), 2
    )                                                                         AS win_rate_pct,
    ROUND(AVG(fb.total_turns), 2)                                             AS avg_turns
FROM battle.dim_players dpl
JOIN battle.fact_battles fb ON fb.p1_id = dpl.player_id OR fb.p2_id = dpl.player_id
WHERE fb.is_bot_battle AND NOT dpl.is_bot
GROUP BY dpl.username;

CREATE UNIQUE INDEX uq_mv_bot_summary ON battle.mv_bot_summary (username);

CREATE MATERIALIZED VIEW battle.mv_bot_pokemon AS
SELECT
    dp.species,
    dpl.username,
    COUNT(*)                                                                      AS times_used,
    SUM(fpp.kills)                                                                AS total_kills,
    ROUND(AVG(fpp.kills), 2)                                                      AS avg_kills,
    ROUND(AVG(fpp.mvp_score), 2)                                                  AS avg_mvp_score,
    SUM(fpp.mvp_score)                                                            AS total_mvp_score,
    COUNT(*) FILTER (WHERE fpp.survived)                                          AS times_survived,
    COUNT(*) FILTER (WHERE fpp.final_hit)                                         AS final_hits,
    ROUND(100.0 * COUNT(*) FILTER (WHERE fpp.survived) / NULLIF(COUNT(*), 0), 2) AS survival_pct
FROM battle.fact_pokemon_performance fpp
JOIN battle.fact_battles  fb  ON fb.battle_id  = fpp.battle_id
JOIN battle.dim_pokemon   dp  ON dp.pokemon_id = fpp.pokemon_id
JOIN battle.dim_players   dpl ON dpl.player_id = fpp.player_id
WHERE fb.is_bot_battle AND NOT dpl.is_bot AND fpp.was_active = TRUE
GROUP BY dp.species, dpl.username;

CREATE UNIQUE INDEX uq_mv_bot_pokemon ON battle.mv_bot_pokemon (species, username);
