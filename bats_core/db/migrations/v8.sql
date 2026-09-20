-- =============================================================================
-- BATS — Migración v8: ingesta por push + refresh concurrente de vistas
-- =============================================================================
-- Contexto (migración a Vercel + Supabase):
--   * La ingesta ya no lee archivos: PS empuja cada batalla por HTTPS. La
--     idempotencia se decide por battle_id, así que se indexa.
--   * refresh_bats_views() usa REFRESH sin CONCURRENTLY: toma un lock exclusivo
--     y bloquea las lecturas de /api/stats/* mientras dura. Además se llamaba en
--     cada corrida del ETL. Ahora la ingesta NO refresca; un cron periódico
--     llama a refresh_bats_views_concurrently().
--
-- Idempotente (IF NOT EXISTS / OR REPLACE). Se aplica después de schema.sql:
-- schema.sql recrea las vistas con DROP ... CASCADE, lo que elimina sus índices,
-- y esta migración los vuelve a crear.
-- =============================================================================

-- ─── Idempotencia de la ingesta por battle_id ─────────────────────────────────
-- (file_path sigue siendo la clave única; para batallas empujadas vale
--  'push:<battle_id>'. Ver bats_core/db/etl.py::PUSH_KEY_PREFIX)
CREATE INDEX IF NOT EXISTS idx_etl_battle_id ON battle.etl_log (battle_id);

-- ─── Índices únicos requeridos por REFRESH ... CONCURRENTLY ───────────────────
-- Cada uno coincide con el GROUP BY de su vista, por lo que es único por
-- construcción.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_pick_rate
    ON battle.mv_pick_rate (species, format_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_mvp_leaderboard
    ON battle.mv_mvp_leaderboard (username, species, format_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_player_stats
    ON battle.mv_player_stats (username, format_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_ban_candidates
    ON battle.mv_ban_candidates (species, format_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_bot_summary
    ON battle.mv_bot_summary (username);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_bot_pokemon
    ON battle.mv_bot_pokemon (species, username);

-- ─── Refresh sin bloquear lecturas ────────────────────────────────────────────
-- Una vista creada WITH NO DATA (base recién inicializada) no admite CONCURRENTLY
-- hasta que se puebla una vez: en ese caso se hace el refresh normal.
-- Orden importa: mv_ban_candidates se alimenta de mv_pick_rate.
CREATE OR REPLACE FUNCTION battle.refresh_bats_views_concurrently()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_name TEXT;
    v_populated BOOLEAN;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'mv_pick_rate', 'mv_mvp_leaderboard', 'mv_player_stats',
        'mv_ban_candidates', 'mv_bot_summary', 'mv_bot_pokemon'
    ] LOOP
        SELECT ispopulated INTO v_populated
        FROM pg_matviews
        WHERE schemaname = 'battle' AND matviewname = v_name;

        IF v_populated THEN
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY battle.%I', v_name);
        ELSE
            EXECUTE format('REFRESH MATERIALIZED VIEW battle.%I', v_name);
        END IF;
    END LOOP;
END;
$$;
