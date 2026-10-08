# Instrucciones — 1 oct 2026

Aplicar la migración **v11** a Supabase e importar el dex. Son los dos pasos que faltan
para que se pueda registrar un equipo en producción.

---

## Por qué

Los `POST /api/teams/me` desde `bats-kohl.vercel.app` devuelven **500**. El traceback
(`vercel logs --status-code 500`) es:

```
File "bats_core/api/routes/teams.py", line 495, in register_team
    entries = _resolve(db, body.pokemon)
File "bats_core/dex.py", line 92, in resolve_entries
    if not db.fetchone("SELECT 1 FROM tournament.dex_meta"):
psycopg2.errors.UndefinedTable: relation "tournament.dex_meta" does not exist
```

El código desplegado valida el registro contra el espejo del dex en la base
(`tournament.dex_species`) en vez de confiar en lo que manda el cliente. Esas tablas
las crea `bats_core/db/migrations/v11.sql`, que **nunca se aplicó en Supabase**.

Comprobado en el catálogo del proyecto `BATS` (`vjqichfjpjbearorihrj`): está todo hasta
v10 (`fact_ban_violations`, `roster`, `roster_lineup`, `upsert_pokemon_cache`,
`refresh_bats_views_concurrently`, `player_accounts`, `battle.mvp_score`, las matviews
y la columna generada `mvp_score`). Falta **solo v11**:

| Objeto de v11 | En Supabase |
|---|---|
| `tournament.dex_species` | ❌ |
| `tournament.dex_meta` | ❌ |
| `tournament.roster.validation_errors` / `validated_at` / `validated_commit` | ❌ |

También rompe `GET /api/dex/meta` (mismo frame en los logs).

---

## Qué ejecutar

Los dos pasos escriben en la base de **producción**. El paso 1 solo crea tablas vacías,
un índice y tres columnas (`IF NOT EXISTS` en todo): no borra ni modifica nada. El paso 2
inserta 1365 filas en una tabla recién creada.

> Se usa `BATS_SUPABASE_DSN_SESSION` (puerto `:5432`) porque el pooler de transacción
> (`:6543`) no sirve para DDL. `BATS_DB_DSN` apunta a la base local a propósito: por eso
> hay que pasar `--dsn` explícito.

### Paso 1 — aplicar v11

```bash
cd /Users/jazar/Documents/GitHub/bats && set -a && source .env && set +a && \
psql "$BATS_SUPABASE_DSN_SESSION" -v ON_ERROR_STOP=1 -f bats_core/db/migrations/v11.sql
```

Salida esperada:

```
CREATE TABLE
CREATE INDEX
CREATE TABLE
ALTER TABLE
```

### Paso 2 — importar el snapshot del dex

Sin esto las tablas quedan vacías y la API responde **503 `dex_not_loaded`** en vez de
500: sigue sin dejar registrar. El snapshot está commiteado en `web/public/dex/`.

```bash
cd /Users/jazar/Documents/GitHub/bats && source venv/bin/activate && \
set -a && source .env && set +a && \
python -m bats_core dex --import --dsn "$BATS_SUPABASE_DSN_SESSION"
```

Salida esperada:

```
Dex importado: 1365 especies (PS 54ac9188).
```

---

## Verificar

### 1. La base

```bash
cd /Users/jazar/Documents/GitHub/bats && set -a && source .env && set +a && \
psql "$BATS_SUPABASE_DSN_SESSION" -c \
"SELECT (SELECT count(*) FROM tournament.dex_species) AS especies,
        (SELECT ps_commit FROM tournament.dex_meta) AS ps_commit,
        (SELECT species_count FROM tournament.dex_meta) AS contadas;"
```

Esperado: `especies = 1365`, `ps_commit = 54ac91882`, `contadas = 1365`.

### 2. La API

```bash
curl -s https://bats-kohl.vercel.app/api/dex/meta
```

Esperado: un JSON con el commit y el conteo. Si sigue dando 500, mira los logs:

```bash
cd /Users/jazar/Documents/GitHub/bats && vercel logs --status-code 500 --since 15m --expand
```

### 3. El registro

En `bats-kohl.vercel.app` → **Mi equipo** → **Registrar equipo**. Debe pasar sin el
mensaje "El servidor tuvo un problema".

---

## Antes de registrar: dos avisos sobre ARGON

1. **Rotaciones = 0.** El equipo que registres queda fijo para toda la temporada.
   Si quieres poder cambiarlo, súbelo en `/admin/temporadas` → Editar ARGON antes de
   registrar.
2. **Hay que estar en la whitelist.** Las rutas de roster exigen estar en la whitelist
   de la temporada (`teams.py:76`, 403 `not_in_whitelist`), no solo tener cuenta.

## Equipo de prueba (cumple ARGON: ≥1 tipo Normal)

Validado contra `web/public/dex/`: movimientos en el learnset propio de cada especie,
habilidades/objetos/naturalezas válidos, EVs ≤ 510, 0 Ultra Beasts, 0 legendarios
restringidos, todos `league_legal`. Pégalo en **Importar**.

```
Ursaluna-Bloodmoon @ Leftovers
Ability: Mind's Eye
Tera Type: Normal
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
- Blood Moon
- Earth Power
- Vacuum Wave
- Calm Mind

Gholdengo @ Air Balloon
Ability: Good as Gold
Tera Type: Flying
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Make It Rain
- Shadow Ball
- Nasty Plot
- Recover

Great Tusk @ Booster Energy
Ability: Protosynthesis
Tera Type: Steel
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Headlong Rush
- Close Combat
- Ice Spinner
- Rapid Spin

Dragapult @ Choice Specs
Ability: Infiltrator
Tera Type: Ghost
EVs: 252 SpA / 4 Def / 252 Spe
Timid Nature
- Shadow Ball
- Draco Meteor
- U-turn
- Flamethrower

Primarina @ Assault Vest
Ability: Torrent
Tera Type: Water
EVs: 252 HP / 252 SpA / 4 SpD
Modest Nature
- Moonblast
- Surf
- Flip Turn
- Psychic Noise

Volcarona @ Heavy-Duty Boots
Ability: Flame Body
Tera Type: Grass
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Quiver Dance
- Fiery Dance
- Bug Buzz
- Giga Drain
```

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `psql: command not found` | sin Postgres client en PATH | `brew install libpq && brew link --force libpq` |
| El paso 1 cuelga o da timeout | estás usando el pooler `:6543` | usa `BATS_SUPABASE_DSN_SESSION` (`:5432`), no el POOLER |
| `503 dex_not_loaded` al registrar | v11 aplicada pero sin importar | corre el paso 2 |
| `422 unknown_species:<nombre>` | el nombre no está en `dex_species` | regenera el snapshot: `cd ../pokemon-showdown && node build && cd ../bats && node tools/export_dex.js`, y repite el paso 2 |
| `403 not_in_whitelist` | no estás en la whitelist de ARGON | `/admin/temporadas` → ARGON → ⋯ → whitelist |
| `409 registration_closed` | la temporada tiene el registro cerrado | apaga "Registro cerrado" en Editar ARGON |

---

## Pendientes que no entran aquí

- `max_restricted` no sale en el formulario de temporada: `DEFAULT_RESTRICTION_SPEC`
  (`web/src/lib/api.ts:227`) es una copia a mano del spec de `bats_core/rules.py` y le
  faltan `max_restricted` y `roster_enforcement`. Como ARGON nunca lo guardó, aplica su
  default: **máximo 1 legendario restringido**, en vigor aunque la UI no lo muestre.
- `POST /api/admin/seasons/{id}/whitelist` sigue aceptando cualquier username
  (`seasons.py:493` solo hace `strip().lower()`). La UI ya no deja mandar basura, pero
  el candado del servidor no existe.
