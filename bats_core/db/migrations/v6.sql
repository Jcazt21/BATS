-- BATS Migration v6: Tournament Restrictions
-- Adds required_color, required_generation, item_clause to seasons
-- Adds color, generation to pokemon_cache
-- Updates upsert_pokemon_cache stored procedure

-- Season restriction columns
ALTER TABLE tournament.seasons
  ADD COLUMN IF NOT EXISTS required_color      VARCHAR(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS required_generation SMALLINT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS item_clause         BOOLEAN     NOT NULL DEFAULT FALSE;

-- Pokemon metadata columns
ALTER TABLE tournament.pokemon_cache
  ADD COLUMN IF NOT EXISTS color      VARCHAR(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS generation SMALLINT    DEFAULT NULL;

-- Drop old overloads and replace with updated function
DROP FUNCTION IF EXISTS tournament.upsert_pokemon_cache(varchar, integer, varchar, text);
DROP FUNCTION IF EXISTS tournament.upsert_pokemon_cache(varchar, smallint, varchar, text);

CREATE OR REPLACE FUNCTION tournament.upsert_pokemon_cache(
  p_name         VARCHAR,
  p_national_dex INT,
  p_types        VARCHAR,
  p_sprite_url   TEXT,
  p_color        VARCHAR  DEFAULT NULL,
  p_generation   SMALLINT DEFAULT NULL
) RETURNS INT AS $$
DECLARE v_id INT;
BEGIN
  INSERT INTO tournament.pokemon_cache
      (name, national_dex, types, sprite_url, color, generation)
  VALUES
      (p_name, p_national_dex, p_types, p_sprite_url, p_color, p_generation)
  ON CONFLICT (name) DO UPDATE SET
      national_dex = EXCLUDED.national_dex,
      types        = EXCLUDED.types,
      sprite_url   = EXCLUDED.sprite_url,
      color        = COALESCE(EXCLUDED.color,      tournament.pokemon_cache.color),
      generation   = COALESCE(EXCLUDED.generation, tournament.pokemon_cache.generation)
  RETURNING pokemon_id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Valid required_color values: black, blue, brown, gray, green, pink, purple, red, white, yellow
-- Valid required_generation values: 1–9 (NULL = no restriction)
