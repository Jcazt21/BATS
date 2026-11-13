-- =============================================================================
-- BATS — Migración v13: sprite de entrenador del carnet
-- =============================================================================
-- `avatar` es el id de un sprite de entrenador de Showdown (bats_core/trainers.py).
-- NULL = sin elegir: el carnet muestra las iniciales. La API valida el valor contra el
-- catálogo al escribirlo, por eso no hay CHECK en la base (el catálogo crece sin migrar).
-- Vive en tournament.player_accounts: no toca el esquema battle.

ALTER TABLE tournament.player_accounts
  ADD COLUMN IF NOT EXISTS avatar VARCHAR(40);
