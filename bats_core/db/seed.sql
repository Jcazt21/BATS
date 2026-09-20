-- =============================================================================
-- BATS — Semilla de la liga (OPCIONAL, solo desarrollo local)
-- =============================================================================
-- Datos reales de la temporada Génesis: usernames de PS, voter_hash y bans.
-- NO se aplica con `--apply-schema` ni debe correr en una base pública
-- (Supabase): esos datos se migran con pg_dump/pg_restore.
-- Aplicar a mano:  psql "$BATS_DB_DSN" -f bats_core/db/seed.sql
-- =============================================================================

INSERT INTO tournament.seasons (season_name, type_of_month, start_date, is_active)
VALUES ('Génesis', 'Water', '2026-03-01', TRUE)
ON CONFLICT (season_name) DO NOTHING;

-- Pokémon baneados de la temporada Génesis
INSERT INTO tournament.pokemon_cache (name, national_dex, types, sprite_url)
VALUES
    ('Snorlax',      143,  'Normal',       'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/143.png'),
    ('Garganacl',    950,  'Rock',          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/950.png'),
    ('Flutter Mane', 987,  'Ghost / Fairy', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/987.png'),
    ('Ogerpon',      1017, 'Grass',         'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1017.png')
ON CONFLICT (name) DO NOTHING;

-- Jugadores del whitelist de la temporada Génesis
WITH s AS (SELECT season_id FROM tournament.seasons WHERE season_name = 'Génesis')
INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username, added_at)
SELECT v.voter_hash, s.season_id, v.username, v.added_at
FROM s, (VALUES
    ('089000f67961c3435d8dd7a06865c0d91293cdeff03c0ec12fdae4ed592a4e7d', 'jamblet',    '2026-03-20 10:41:28.95302-04'::TIMESTAMPTZ),
    ('91694ac6e7744fe8ff6644c1639701f2c22d036328fa46477033edfa3ef4ce09', 'jcazt69',    '2026-03-20 10:50:20.910915-04'::TIMESTAMPTZ),
    ('ddd0016c7208e6510e106a9724c0f1cc1eeb8fef5eb78369c5a2365bae04ebc2', 'papijavii',  '2026-03-20 10:41:21.904459-04'::TIMESTAMPTZ),
    ('fd4e06b187be07937f11df818673b3122b1db907df7e73934647b7c9d676e060', 'singonsito', '2026-03-20 10:41:34.562394-04'::TIMESTAMPTZ)
) AS v(voter_hash, username, added_at)
ON CONFLICT (voter_hash, season_id) DO NOTHING;

-- Bans oficiales de la temporada Génesis
WITH s AS (SELECT season_id FROM tournament.seasons WHERE season_name = 'Génesis')
INSERT INTO tournament.bans (season_id, player_username, pokemon_id, is_active)
SELECT s.season_id, v.player_username, pc.pokemon_id, TRUE
FROM s
CROSS JOIN (VALUES
    ('jamblet',    'Snorlax'),
    ('jcazt69',    'Garganacl'),
    ('papijavii',  'Flutter Mane'),
    ('singonsito', 'Ogerpon')
) AS v(player_username, pokemon_name)
JOIN tournament.pokemon_cache pc ON pc.name = v.pokemon_name
ON CONFLICT (season_id, player_username) DO NOTHING;

