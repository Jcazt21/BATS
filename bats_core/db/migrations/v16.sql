-- =============================================================================
-- BATS — Migración v16: esquema `arena` (batallas nativas)
-- =============================================================================
-- Fuente de verdad de las batallas jugadas dentro de BATS (docs/planes/PLAN_BATALLAS_NATIVAS.md,
-- sección 9.1). Una batalla es `seed + input_log`; el protocolo ya emitido se guarda en
-- arena.battle_updates.
--
-- Fronteras de esquema (invariante I9):
--   · arena.* puede referenciar a tournament.* (temporadas) y NUNCA a battle.*.
--   · battle.* y tournament.* no referencian a arena.*. El vínculo con battle.fact_battles es por
--     convención: battle_id = 'arena-' || arena.battles.battle_id.
--   · arena.* no se trunca con `reset`/`clean`: es la fuente desde la que se reconstruye.
--
-- Los objetos de Supabase (realtime, anon, authenticated) son CONDICIONALES: las bases
-- desechables locales son Postgres puro. Idempotente.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS arena;

CREATE TABLE IF NOT EXISTS arena.challenges (
  challenge_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id    int  NOT NULL REFERENCES tournament.seasons(season_id),
  kind         text NOT NULL CHECK (kind IN ('league', 'sparring')),
  challenger   text NOT NULL,                    -- username en minúsculas
  challenged   text NOT NULL,
  is_test      boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  resolved_at  timestamptz,
  CHECK (challenger <> challenged)
);
-- Un solo reto pendiente por pareja, sin importar quién retó.
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenges_pair_pending
  ON arena.challenges (LEAST(challenger, challenged), GREATEST(challenger, challenged))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_challenges_challenged_pending
  ON arena.challenges (challenged) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_challenges_season ON arena.challenges (season_id);

CREATE TABLE IF NOT EXISTS arena.battles (
  battle_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenge_id   bigint REFERENCES arena.challenges(challenge_id),
  season_id      int  NOT NULL REFERENCES tournament.seasons(season_id),
  kind           text NOT NULL CHECK (kind IN ('league', 'sparring')),
  is_test        boolean NOT NULL DEFAULT false,
  format_id      text NOT NULL,                  -- 'gen9pinchesgueysleague' | 'gen9pglsparring' (para el ETL)
  rules          text NOT NULL,                  -- formato del motor, congelado (D5)
  engine_version text,                           -- lo fija el motor al iniciar
  status         text NOT NULL DEFAULT 'team_select'
                 CHECK (status IN ('team_select', 'ready', 'active', 'finished', 'aborted')),
  p1             text NOT NULL,                  -- username en minúsculas; p1 = retador
  p2             text NOT NULL,
  p1_team        jsonb,                          -- PokemonSet[]; NULL hasta que elige. SECRETO
  p2_team        jsonb,
  seed           text,                           -- SECRETO
  input_log      text[] NOT NULL DEFAULT '{}',   -- fuente de verdad. SECRETO
  p1_choice      text,                           -- elección pendiente (aún no en input_log). SECRETO
  p2_choice      text,
  p1_request     jsonb,                          -- petición vigente de cada lado. PRIVADA
  p2_request     jsonb,
  seq            int  NOT NULL DEFAULT 0,        -- nº de tandas emitidas = cursor de los clientes
  log_lines      int  NOT NULL DEFAULT 0,
  log_hash       text,                           -- sha256 del log emitido, normalizado
  turn           int  NOT NULL DEFAULT 0,
  turn_seconds   int,                            -- NULL = sin reloj
  deadline_at    timestamptz,
  winner         text,                           -- username; NULL en empate o sin terminar
  end_type       text CHECK (end_type IN ('normal', 'forfeit', 'tie')),
  end_reason     text,                           -- 'forfeit' | 'timeout' | 'engine_drift' | 'expired' | 'admin'
  ingest_status  text NOT NULL DEFAULT 'none'
                 CHECK (ingest_status IN ('none', 'pending', 'loaded', 'skipped', 'ignored', 'error')),
  ingest_attempts int NOT NULL DEFAULT 0,
  ingest_error   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (p1 <> p2)
);
CREATE INDEX IF NOT EXISTS ix_battles_p1_live ON arena.battles (p1) WHERE status IN ('team_select', 'ready', 'active');
CREATE INDEX IF NOT EXISTS ix_battles_p2_live ON arena.battles (p2) WHERE status IN ('team_select', 'ready', 'active');
CREATE INDEX IF NOT EXISTS ix_battles_deadline ON arena.battles (deadline_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_battles_ingest_pending ON arena.battles (finished_at) WHERE ingest_status = 'pending';
CREATE INDEX IF NOT EXISTS ix_battles_season ON arena.battles (season_id);
CREATE INDEX IF NOT EXISTS ix_battles_challenge ON arena.battles (challenge_id);

-- Protocolo emitido, solo-añadir. Una fila por tanda (inicio, cada resolución, final).
CREATE TABLE IF NOT EXISTS arena.battle_updates (
  battle_id  bigint NOT NULL REFERENCES arena.battles(battle_id) ON DELETE CASCADE,
  seq        int    NOT NULL,
  lines      text[] NOT NULL,                    -- crudo del simulador, con marcadores |split|
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, seq)
);

-- RLS sin políticas: la API entra como dueño y no se ve afectada; si algún día se activa la Data API,
-- nadie más lee (defensa en profundidad).
ALTER TABLE arena.challenges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena.battles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena.battle_updates  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA arena FROM anon;
    REVOKE ALL ON SCHEMA arena FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA arena FROM authenticated;
    REVOKE ALL ON SCHEMA arena FROM authenticated;
  END IF;
END $$;

-- Aviso de Realtime (D8): solo una señal, enviada desde la base dentro de la misma transacción.
-- Nunca propaga errores (I6): `realtime.send()` falla en silencio si aún no existe la partición
-- diaria de realtime.messages, y el visor sigue funcionando con polling.
CREATE OR REPLACE FUNCTION arena.notify(p_topic text, p_event text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    EXECUTE 'SELECT realtime.send($1, $2, $3, true)' USING p_payload, p_event, p_topic;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'arena.notify(%, %) falló: %', p_topic, p_event, SQLERRM;
END;
$$;

-- Lectura del canal privado: solo los temas de arena. Sin política de INSERT: ningún cliente publica.
-- No se activa RLS en realtime.messages (ya lo está) ni se crean objetos en el esquema realtime.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS arena_listen ON realtime.messages;
    CREATE POLICY arena_listen ON realtime.messages FOR SELECT TO authenticated
    USING (realtime.messages.extension = 'broadcast'
           AND ((SELECT realtime.topic()) = 'arena:lobby' OR (SELECT realtime.topic()) LIKE 'battle:%'));
  END IF;
END $$;
