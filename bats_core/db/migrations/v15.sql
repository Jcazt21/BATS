-- =============================================================================
-- BATS — Migración v15: empates separados en el récord por jugador
-- =============================================================================
-- Showdown puede terminar una batalla en empate (sim/battle.ts, tie(): winner = ''
-- y el log escribe |tie): caída simultánea de los últimos pokémon, desempate por
-- tiempo o un >forcetie. En la base eso es fact_battles.winner_id IS NULL.
--
-- Hasta v14 la API calculaba losses = total_battles - wins, así que cada empate
-- contaba como derrota. mv_player_stats suma ahora `ties` y la API calcula
-- losses = total_battles - wins - ties. win_rate_pct NO cambia: victorias / batallas.
--
-- Misma vista que v10 más la columna `ties`. Se recrea en cada --apply-schema
-- (v10 la vuelve a crear sin `ties` justo antes; esta migración corre después).
--
-- ORDEN DE DESPLIEGUE: aplicar --apply-schema ANTES de desplegar el código nuevo.
-- El código nuevo lee `ties`; el viejo ignora la columna extra.
--
-- Idempotente.
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS battle.mv_player_stats CASCADE;

CREATE MATERIALIZED VIEW battle.mv_player_stats AS
SELECT
    dpl.username,
    df.format_name,
    COALESCE(fb.season_id, 0)                                                 AS season_id,
    COUNT(DISTINCT fb.battle_id)                                              AS total_battles,
    COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id) AS wins,
    COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id IS NULL)         AS ties,
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
