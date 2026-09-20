-- BATS Migration v4: Full Showdown data on roster_pokemon
-- Adds held_item, ability, nature, tera_type, moves, evs, ivs

ALTER TABLE tournament.roster_pokemon
  ADD COLUMN IF NOT EXISTS held_item VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ability   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nature    VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tera_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS moves     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS evs       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ivs       JSONB NOT NULL DEFAULT '{}';
