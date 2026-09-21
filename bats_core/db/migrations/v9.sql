-- =============================================================================
-- BATS — Migración v9: cuentas de jugador (Fase 4, Supabase Auth)
-- =============================================================================
-- El admin da de alta email -> username de Pokémon Showdown. El jugador entra con
-- magic link de Supabase; en el primer login se guarda su auth.users.id en user_id.
-- La API resuelve identidad y rol desde esta tabla, nunca desde el body ni la URL.
--
-- tournament no tiene FKs hacia battle (frontera de esquemas) ni hacia auth.users
-- (esa tabla no existe en un Postgres local).
--
-- Idempotente. Primer admin (una sola vez, por SQL):
--   INSERT INTO tournament.player_accounts (email, username, is_admin)
--   VALUES ('tu@correo.com', 'tu_username_de_ps', TRUE);
-- =============================================================================

CREATE TABLE IF NOT EXISTS tournament.player_accounts (
    account_id SERIAL       PRIMARY KEY,
    user_id    UUID         UNIQUE,              -- auth.users.id; NULL hasta el primer login
    email      TEXT         NOT NULL,
    username   TEXT         NOT NULL,            -- username de Pokémon Showdown
    is_admin   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_player_accounts_email_lower
    ON tournament.player_accounts (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_accounts_username_lower
    ON tournament.player_accounts (LOWER(username));
