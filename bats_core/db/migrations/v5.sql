-- BATS Migration v5: Roster Lineup Tracking
-- Tracks the active 6 each player is using in the current rotation

CREATE TABLE IF NOT EXISTS tournament.roster_lineup (
  roster_id  INT         NOT NULL REFERENCES tournament.roster ON DELETE CASCADE,
  pokemon_id INT         NOT NULL REFERENCES tournament.pokemon_cache,
  set_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (roster_id, pokemon_id)
);

-- Add rotation_limit_exceeded as comment (violation_type is VARCHAR, no constraint needed)
-- Valid violation_type values:
--   'not_in_roster'          – used a pokemon not in the registered pool of 8
--   'no_roster_registered'   – player has no roster at all
--   'rotation_exceeded'      – changed the active 6 but had no rotations left
