-- =============================================================================
-- BATS — Schema principal v2
-- =============================================================================
-- battle     → datos de batallas (efímero, truncatable)
-- tournament → bans, votaciones y temporadas (permanente, nunca truncar en cascada)
--
-- Reglas de aislamiento:
--   * tournament NO tiene FKs apuntando a battle.
--   * Los metadatos de pokémon de torneo viven en tournament.pokemon_cache,
--     independiente de battle.dim_pokemon.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS battle;
CREATE SCHEMA IF NOT EXISTS tournament;

-- tournament.seasons va primero: battle.fact_battles.season_id la referencia.
-- -----------------------------------------------------------------------------
-- tournament.seasons
-- Cada temporada del torneo. Solo una puede estar activa a la vez.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament.seasons (
    season_id       SERIAL       PRIMARY KEY,
    season_name     VARCHAR(100) NOT NULL,
    type_of_month   VARCHAR(20)  NOT NULL,
    start_date      DATE         NOT NULL,
    end_date        DATE,
    is_active       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_season_name UNIQUE (season_name)
);

-- =============================================================================
-- SCHEMA: battle
-- =============================================================================

CREATE TABLE IF NOT EXISTS battle.dim_players (
    player_id   SERIAL       PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL,
    is_bot      BOOLEAN      NOT NULL DEFAULT FALSE,
    first_seen  DATE,
    last_seen   DATE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_players_username UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS battle.dim_formats (
    format_id   SERIAL       PRIMARY KEY,
    format_name VARCHAR(80)  NOT NULL,
    gen         SMALLINT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_formats_name UNIQUE (format_name)
);

CREATE TABLE IF NOT EXISTS battle.dim_pokemon (
    pokemon_id  SERIAL      PRIMARY KEY,
    species     VARCHAR(60) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pokemon_species UNIQUE (species)
);

CREATE TABLE IF NOT EXISTS battle.fact_battles (
    battle_id       VARCHAR(80)  PRIMARY KEY,
    format_id       INT          NOT NULL REFERENCES battle.dim_formats(format_id),
    battle_date     DATE         NOT NULL,
    p1_id           INT          NOT NULL REFERENCES battle.dim_players(player_id),
    p2_id           INT          NOT NULL REFERENCES battle.dim_players(player_id),
    winner_id       INT          REFERENCES battle.dim_players(player_id),
    total_turns     SMALLINT     NOT NULL CHECK (total_turns >= 1),
    end_type        VARCHAR(20)  NOT NULL DEFAULT 'normal'
                                 CHECK (end_type IN ('normal', 'forfeit', 'tie')),
    is_bot_battle   BOOLEAN      NOT NULL DEFAULT FALSE,
    season_id       INT          REFERENCES tournament.seasons(season_id) ON DELETE SET NULL,
    logged_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battle.fact_pokemon_performance (
    perf_id         BIGSERIAL    PRIMARY KEY,
    battle_id       VARCHAR(80)  NOT NULL REFERENCES battle.fact_battles(battle_id) ON DELETE CASCADE,
    player_id       INT          NOT NULL REFERENCES battle.dim_players(player_id),
    pokemon_id      INT          NOT NULL REFERENCES battle.dim_pokemon(pokemon_id),
    kills           SMALLINT     NOT NULL DEFAULT 0 CHECK (kills >= 0),
    turns_active    SMALLINT     NOT NULL DEFAULT 0 CHECK (turns_active >= 0),
    survived        BOOLEAN      NOT NULL DEFAULT TRUE,
    final_hit       BOOLEAN      NOT NULL DEFAULT FALSE,
    mvp_score       NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    was_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_perf_battle_player_pokemon UNIQUE (battle_id, player_id, pokemon_id)
);

CREATE TABLE IF NOT EXISTS battle.etl_log (
    log_id          BIGSERIAL   PRIMARY KEY,
    file_path       TEXT        NOT NULL,
    file_size       BIGINT,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    battle_id       VARCHAR(80),
    status          VARCHAR(20) NOT NULL DEFAULT 'ok'
                                CHECK (status IN ('ok', 'error', 'skipped')),
    error_msg       TEXT,
    CONSTRAINT uq_etl_file_path UNIQUE (file_path)
);

-- =============================================================================
-- SCHEMA: tournament
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tournament.pokemon_cache
-- Metadatos de pokémon usados en votaciones y bans.
-- Fuente única de verdad para datos display del torneo (aislado de battle.*).
-- Se upsertea automáticamente cuando un jugador vota o el admin registra un ban.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament.pokemon_cache (
    pokemon_id   SERIAL       PRIMARY KEY,
    name         VARCHAR(60)  NOT NULL,   -- nombre display, ej: "Flutter Mane"
    national_dex SMALLINT,
    types        VARCHAR(60),             -- "Fire / Flying"
    sprite_url   TEXT,
    cached_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pokemon_cache_name UNIQUE (name)
);

-- -----------------------------------------------------------------------------
-- tournament.ban_whitelist
-- Jugadores autorizados a votar, por temporada.
-- Cada temporada tiene su propio set de jugadores habilitados.
-- El username se guarda en texto para gestión del admin; el hash garantiza
-- que el sistema de votación no pueda correlacionar hash-voto.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament.ban_whitelist (
    voter_hash  CHAR(64)    NOT NULL,   -- SHA-256(SALT + username.lower())
    season_id   INT         NOT NULL REFERENCES tournament.seasons(season_id) ON DELETE CASCADE,
    username    VARCHAR(50) NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (voter_hash, season_id)
);

-- -----------------------------------------------------------------------------
-- tournament.ban_participation
-- Registra que un hash ya ejerció su voto en una temporada concreta.
-- NO almacena qué votó — solo que votó.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament.ban_participation (
    voter_hash  CHAR(64)    NOT NULL,
    season_id   INT         NOT NULL,
    voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (voter_hash, season_id),
    FOREIGN KEY (voter_hash, season_id)
        REFERENCES tournament.ban_whitelist (voter_hash, season_id)
        ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- tournament.ban_votes
-- Los votos de ban anónimos. Sin ninguna referencia al votante.
-- Referencia a pokemon_cache para evitar duplicación de metadatos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament.ban_votes (
    vote_id    SERIAL      PRIMARY KEY,
    season_id  INT         NOT NULL REFERENCES tournament.seasons(season_id) ON DELETE CASCADE,
    pokemon_id INT         NOT NULL REFERENCES tournament.pokemon_cache(pokemon_id),
    voted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- SIN voter_hash → imposible vincular voto con votante
);

-- -----------------------------------------------------------------------------
-- tournament.bans
-- Bans oficiales confirmados por el admin.
-- Cada jugador puede tener máximo 1 ban activo por temporada.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament.bans (
    ban_id          SERIAL      PRIMARY KEY,
    season_id       INT         NOT NULL REFERENCES tournament.seasons(season_id) ON DELETE RESTRICT,
    player_username VARCHAR(50) NOT NULL,
    pokemon_id      INT         NOT NULL REFERENCES tournament.pokemon_cache(pokemon_id),
    banned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    revoked_at      TIMESTAMPTZ,
    CONSTRAINT uq_ban_player_season UNIQUE (season_id, player_username)
);

-- =============================================================================
-- ÍNDICES
-- =============================================================================

-- battle
CREATE INDEX IF NOT EXISTS idx_battles_date    ON battle.fact_battles(battle_date);
CREATE INDEX IF NOT EXISTS idx_battles_season  ON battle.fact_battles(season_id);
CREATE INDEX IF NOT EXISTS idx_battles_format  ON battle.fact_battles(format_id);
CREATE INDEX IF NOT EXISTS idx_battles_p1      ON battle.fact_battles(p1_id);
CREATE INDEX IF NOT EXISTS idx_battles_p2      ON battle.fact_battles(p2_id);
CREATE INDEX IF NOT EXISTS idx_battles_bot     ON battle.fact_battles(is_bot_battle) WHERE is_bot_battle = TRUE;

-- -----------------------------------------------------------------------------
-- battle.fact_ban_violations
-- Registra cada vez que un jugador usa (o lleva en banca) un pokémon que tiene
-- baneado en la temporada activa. Se pobla automáticamente durante el ETL.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battle.fact_ban_violations (
    violation_id  BIGSERIAL    PRIMARY KEY,
    battle_id     VARCHAR(80)  NOT NULL REFERENCES battle.fact_battles(battle_id) ON DELETE CASCADE,
    season_id     INT          NOT NULL REFERENCES tournament.seasons(season_id),
    player_id     INT          NOT NULL REFERENCES battle.dim_players(player_id),
    pokemon_id    INT          NOT NULL REFERENCES battle.dim_pokemon(pokemon_id),
    ban_id        INT          NOT NULL REFERENCES tournament.bans(ban_id),
    was_active    BOOLEAN      NOT NULL,   -- TRUE: lo usó en batalla; FALSE: solo lo llevó
    detected_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_violation UNIQUE (battle_id, player_id, pokemon_id)
);
CREATE INDEX IF NOT EXISTS idx_violations_battle  ON battle.fact_ban_violations(battle_id);
CREATE INDEX IF NOT EXISTS idx_violations_season  ON battle.fact_ban_violations(season_id);
CREATE INDEX IF NOT EXISTS idx_violations_player  ON battle.fact_ban_violations(player_id);

CREATE INDEX IF NOT EXISTS idx_perf_battle     ON battle.fact_pokemon_performance(battle_id);
CREATE INDEX IF NOT EXISTS idx_perf_player     ON battle.fact_pokemon_performance(player_id);
CREATE INDEX IF NOT EXISTS idx_perf_pokemon    ON battle.fact_pokemon_performance(pokemon_id);
CREATE INDEX IF NOT EXISTS idx_etl_status      ON battle.etl_log(status);
CREATE INDEX IF NOT EXISTS idx_players_bot     ON battle.dim_players(is_bot) WHERE is_bot = TRUE;

-- tournament
CREATE INDEX IF NOT EXISTS idx_seasons_active     ON tournament.seasons(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_whitelist_season   ON tournament.ban_whitelist(season_id);
CREATE INDEX IF NOT EXISTS idx_participation_hash ON tournament.ban_participation(voter_hash);
CREATE INDEX IF NOT EXISTS idx_votes_season       ON tournament.ban_votes(season_id);
CREATE INDEX IF NOT EXISTS idx_votes_pokemon      ON tournament.ban_votes(pokemon_id);
CREATE INDEX IF NOT EXISTS idx_bans_season        ON tournament.bans(season_id);
CREATE INDEX IF NOT EXISTS idx_bans_active        ON tournament.bans(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- VISTAS: tournament
-- =============================================================================

CREATE OR REPLACE VIEW tournament.v_active_bans AS
SELECT
    b.ban_id,
    b.player_username       AS banned_by_player,
    pc.name                 AS pokemon,
    pc.types                AS types,
    pc.sprite_url,
    pc.national_dex,
    b.banned_at,
    s.season_name,
    s.type_of_month
FROM tournament.bans b
JOIN tournament.seasons       s  ON s.season_id  = b.season_id
JOIN tournament.pokemon_cache pc ON pc.pokemon_id = b.pokemon_id
WHERE b.is_active = TRUE;

CREATE OR REPLACE VIEW tournament.v_ban_ranking AS
SELECT
    v.season_id,
    pc.name                                                        AS pokemon_name,
    pc.types                                                       AS pokemon_types,
    pc.sprite_url,
    pc.national_dex,
    COUNT(*)                                                       AS total_votes,
    RANK() OVER (PARTITION BY v.season_id ORDER BY COUNT(*) DESC) AS ranking
FROM tournament.ban_votes     v
JOIN tournament.pokemon_cache pc ON pc.pokemon_id = v.pokemon_id
GROUP BY v.season_id, pc.pokemon_id, pc.name, pc.types, pc.sprite_url, pc.national_dex;

-- =============================================================================
-- VISTAS MATERIALIZADAS: battle
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS battle.mv_ban_candidates CASCADE;
DROP MATERIALIZED VIEW IF EXISTS battle.mv_player_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS battle.mv_mvp_leaderboard CASCADE;
DROP MATERIALIZED VIEW IF EXISTS battle.mv_pick_rate CASCADE;

CREATE MATERIALIZED VIEW IF NOT EXISTS battle.mv_pick_rate AS
WITH total_slots_per_format AS (
    SELECT df.format_name,
           COUNT(DISTINCT (fb.battle_id, p.player_id)) AS total_slots
    FROM battle.fact_battles fb
    JOIN battle.dim_formats df ON df.format_id = fb.format_id
    JOIN LATERAL (VALUES (fb.p1_id), (fb.p2_id)) AS p(player_id) ON TRUE
    JOIN battle.dim_players dpl ON dpl.player_id = p.player_id
    WHERE NOT fb.is_bot_battle AND NOT dpl.is_bot
    GROUP BY df.format_name
)
SELECT
    dp.species,
    df.format_name,
    COUNT(DISTINCT (fpp.battle_id, fpp.player_id))   AS battles_used,
    t.total_slots                                    AS total_slots,
    ROUND(AVG(fpp.kills), 2)                         AS avg_kills,
    ROUND(AVG(fpp.mvp_score), 2)                     AS avg_mvp_score,
    ROUND(
        100.0 * COUNT(CASE WHEN fb.winner_id = fpp.player_id THEN 1 END)
        / NULLIF(COUNT(*), 0), 2
    )                                                AS win_rate_pct
FROM battle.fact_pokemon_performance fpp
JOIN battle.fact_battles fb  ON fb.battle_id  = fpp.battle_id
JOIN battle.dim_pokemon  dp  ON dp.pokemon_id = fpp.pokemon_id
JOIN battle.dim_formats  df  ON df.format_id  = fb.format_id
JOIN total_slots_per_format t ON t.format_name = df.format_name
JOIN battle.dim_players  dpl ON dpl.player_id = fpp.player_id
WHERE fpp.was_active = TRUE AND NOT fb.is_bot_battle AND NOT dpl.is_bot
GROUP BY dp.species, df.format_name, t.total_slots
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS battle.mv_mvp_leaderboard AS
SELECT
    dpl.username,
    dp.species,
    df.format_name,
    SUM(fpp.kills)      AS total_kills,
    SUM(fpp.mvp_score)  AS total_mvp_score,
    COUNT(*)            AS battles_used
FROM battle.fact_pokemon_performance fpp
JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
JOIN battle.dim_pokemon  dp ON dp.pokemon_id = fpp.pokemon_id
JOIN battle.fact_battles fb  ON fb.battle_id = fpp.battle_id
JOIN battle.dim_formats  df  ON df.format_id = fb.format_id
WHERE NOT fb.is_bot_battle AND NOT dpl.is_bot
GROUP BY dpl.username, dp.species, df.format_name
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS battle.mv_player_stats AS
SELECT
    dpl.username,
    df.format_name,
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
GROUP BY dpl.username, df.format_name
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS battle.mv_ban_candidates AS
SELECT species, format_name, battles_used, avg_kills, avg_mvp_score, win_rate_pct
FROM battle.mv_pick_rate
WHERE win_rate_pct > 70
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS battle.mv_bot_pokemon CASCADE;
DROP MATERIALIZED VIEW IF EXISTS battle.mv_bot_summary CASCADE;

CREATE MATERIALIZED VIEW IF NOT EXISTS battle.mv_bot_summary AS
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
GROUP BY dpl.username
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS battle.mv_bot_pokemon AS
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
GROUP BY dp.species, dpl.username
WITH NO DATA;

-- =============================================================================
-- FUNCIONES
-- =============================================================================

CREATE OR REPLACE FUNCTION battle.refresh_bats_views()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW battle.mv_pick_rate;
    REFRESH MATERIALIZED VIEW battle.mv_mvp_leaderboard;
    REFRESH MATERIALIZED VIEW battle.mv_player_stats;
    REFRESH MATERIALIZED VIEW battle.mv_ban_candidates;
    REFRESH MATERIALIZED VIEW battle.mv_bot_summary;
    REFRESH MATERIALIZED VIEW battle.mv_bot_pokemon;
END;
$$;

-- -----------------------------------------------------------------------------
-- battle.scan_ban_violations
-- Escanea fact_pokemon_performance buscando pokémon baneados por temporada.
-- Idempotente: ON CONFLICT DO NOTHING. Puede pasarse un season_id específico
-- o NULL para escanear todas las temporadas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION battle.scan_ban_violations(p_season_id INT DEFAULT NULL)
RETURNS TABLE(inserted BIGINT) LANGUAGE plpgsql AS $$
DECLARE
    v_count BIGINT;
BEGIN
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
    JOIN battle.fact_battles       fb  ON fb.battle_id    = fpp.battle_id
    JOIN battle.dim_players        dpl ON dpl.player_id   = fpp.player_id
    JOIN battle.dim_pokemon        dp  ON dp.pokemon_id   = fpp.pokemon_id
    JOIN tournament.bans           b   ON b.player_username = dpl.username
                                      AND b.season_id       = fb.season_id
                                      AND b.is_active       = TRUE
    JOIN tournament.pokemon_cache  pc  ON pc.pokemon_id    = b.pokemon_id
                                      AND LOWER(pc.name)   = LOWER(dp.species)
    WHERE fb.season_id IS NOT NULL
      AND (p_season_id IS NULL OR fb.season_id = p_season_id)
    ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    inserted := v_count;
    RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------
-- battle.backfill_seasons
-- Asigna season_id a batallas existentes según rango de fechas de la temporada.
-- Ejecutar manualmente después de crear/migrar temporadas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION battle.backfill_seasons()
RETURNS TABLE(updated_count BIGINT) LANGUAGE plpgsql AS $$
DECLARE
    v_count BIGINT;
BEGIN
    UPDATE battle.fact_battles fb
    SET season_id = s.season_id
    FROM tournament.seasons s
    WHERE fb.battle_date BETWEEN s.start_date AND COALESCE(s.end_date, CURRENT_DATE)
      AND fb.season_id IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    updated_count := v_count;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION battle.clean_bot_battles()
RETURNS TABLE(deleted_battles BIGINT, deleted_performances BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
    v_battles      BIGINT;
    v_performances BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_battles
    FROM battle.fact_battles WHERE is_bot_battle = TRUE;

    SELECT COUNT(*) INTO v_performances
    FROM battle.fact_pokemon_performance fpp
    JOIN battle.fact_battles fb ON fb.battle_id = fpp.battle_id
    WHERE fb.is_bot_battle = TRUE;

    DELETE FROM battle.etl_log
    WHERE battle_id IN (
        SELECT battle_id FROM battle.fact_battles WHERE is_bot_battle = TRUE
    );

    DELETE FROM battle.fact_battles WHERE is_bot_battle = TRUE;

    deleted_battles      := v_battles;
    deleted_performances := v_performances;
    RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------
-- tournament.can_vote
-- TRUE si el hash está en el whitelist de la temporada y aún no ha votado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tournament.can_vote(p_voter_hash CHAR(64), p_season_id INT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM tournament.ban_whitelist
            WHERE voter_hash = p_voter_hash AND season_id = p_season_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM tournament.ban_participation
            WHERE voter_hash = p_voter_hash AND season_id = p_season_id
        );
$$;

-- -----------------------------------------------------------------------------
-- tournament.upsert_pokemon_cache
-- Inserta o actualiza metadatos de pokémon. Retorna el pokemon_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tournament.upsert_pokemon_cache(
    p_name         VARCHAR(60),
    p_national_dex INTEGER,
    p_types        VARCHAR(60),
    p_sprite_url   TEXT
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_id INT;
BEGIN
    INSERT INTO tournament.pokemon_cache (name, national_dex, types, sprite_url)
    VALUES (p_name, p_national_dex, p_types, p_sprite_url)
    ON CONFLICT (name) DO UPDATE SET
        national_dex = EXCLUDED.national_dex,
        types        = EXCLUDED.types,
        sprite_url   = EXCLUDED.sprite_url,
        cached_at    = NOW()
    RETURNING pokemon_id INTO v_id;
    RETURN v_id;
END;
$$;

-- =============================================================================
-- DATOS DE SISTEMA
-- (La semilla de la liga vive en seed.sql; los roles en roles.sql)
-- =============================================================================

INSERT INTO battle.dim_players (username, is_bot, first_seen, last_seen)
VALUES ('PGL-Bot', TRUE, CURRENT_DATE, CURRENT_DATE)
ON CONFLICT (username) DO UPDATE SET is_bot = TRUE;
