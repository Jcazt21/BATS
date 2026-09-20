-- =============================================================================
-- BATS — Roles y permisos (OPCIONAL, solo Postgres local/self-hosted)
-- =============================================================================
-- NO usar en Supabase: no se puede crear roles LOGIN arbitrarios y la
-- contraseña de ejemplo es pública. Cambia 'cambiar_en_produccion' antes de
-- aplicarlo en cualquier base alcanzable desde la red.
-- Sustituye <DB> por el nombre de tu base en el ALTER DATABASE del final.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bats_app') THEN
        CREATE ROLE bats_app LOGIN PASSWORD 'cambiar_en_produccion';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bats_etl') THEN
        CREATE ROLE bats_etl LOGIN PASSWORD 'cambiar_en_produccion';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA battle, tournament TO bats_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA battle TO bats_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA tournament TO bats_app;
GRANT DELETE ON tournament.ban_whitelist, tournament.bans, tournament.seasons TO bats_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA battle, tournament TO bats_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA battle, tournament TO bats_app;

GRANT USAGE ON SCHEMA battle TO bats_etl;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA battle TO bats_etl;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA battle TO bats_etl;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA battle TO bats_etl;
GRANT USAGE ON SCHEMA tournament TO bats_etl;
GRANT SELECT ON ALL TABLES IN SCHEMA tournament TO bats_etl;

ALTER DATABASE "<DB>" SET search_path = battle, tournament, public;
