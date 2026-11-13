-- =============================================================================
-- BATS — Migración v13: Pokédex por cuenta
-- =============================================================================
-- Cada fila = una especie que un jugador vio salir al campo en una batalla de
-- liga (propia o del rival). Se escribe al cargar la batalla (BATSEtl.load_battle)
-- y gana el primer avistamiento. El frontend agrupa por número nacional y deduce
-- las preevoluciones con el dex estático.
--
-- Vive en tournament.* (nunca se trunca en cascada) porque battle.* es efímero.
-- Sin FKs hacia battle.* (frontera de esquemas) ni hacia player_accounts: un
-- jugador puede ver pokémon antes de que el admin le cree la cuenta.
-- username y opponent van en minúsculas; el rename de cuentas los actualiza
-- (_rename_username_cascade en api/routes/admin.py).
--
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tournament.pokedex_seen (
  username      TEXT         NOT NULL,
  species_id    VARCHAR(60)  NOT NULL,   -- id de Showdown: "scizormega"
  species       VARCHAR(80)  NOT NULL,   -- nombre tal como vino: "Scizor-Mega"
  first_seen_at TIMESTAMPTZ  NOT NULL,
  battle_id     VARCHAR(80)  NOT NULL,
  opponent      TEXT         NOT NULL,
  PRIMARY KEY (username, species_id)
);

CREATE INDEX IF NOT EXISTS idx_pokedex_seen_recent
  ON tournament.pokedex_seen (username, first_seen_at DESC);
