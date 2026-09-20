-- BATS Migration v7: Consolidate restrictions to JSONB
-- Replaces individual restriction columns with a single JSONB column.
-- Future restrictions can be added without schema migrations.

ALTER TABLE tournament.seasons
  ADD COLUMN IF NOT EXISTS restrictions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Migrate data from v6 individual columns (if any was set)
UPDATE tournament.seasons
SET restrictions = jsonb_strip_nulls(jsonb_build_object(
  'required_color',      required_color,
  'required_generation', required_generation,
  'item_clause',         CASE WHEN item_clause THEN TRUE ELSE NULL END
));

-- Drop individual restriction columns added in v6
ALTER TABLE tournament.seasons
  DROP COLUMN IF EXISTS required_color,
  DROP COLUMN IF EXISTS required_generation,
  DROP COLUMN IF EXISTS item_clause;

-- Comment: restrictions JSONB schema (all keys optional):
-- {
--   "required_color":      "blue" | "red" | ... (PokeAPI color names),
--   "required_generation": 1–9,
--   "item_clause":         true
-- }
