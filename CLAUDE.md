# CLAUDE.md

BATS es el sistema de estadísticas y administración de la liga **PGL (PinchesGueys League)**: backend Python (FastAPI + ETL + parser + PGL-Bot), frontend React + Vite y PostgreSQL (Supabase en producción). Se alimenta de un server de Pokémon Showdown que vive en otro checkout (`../pokemon-showdown`).

## Commits y PRs

**Attributes: off.** No agregues líneas de atribución a Claude en los commits ni en los PRs (nada de `Co-Authored-By`, `Claude-Session` ni "Generated with Claude Code"). Mensajes en español, estilo `feat(web): …` / `fix(api): …`.

## Estructura

```
bats_core/            backend: api/ (FastAPI), db/ (schema.sql + migrations v*.sql), parser, etl, cli, bot/
api/index.py          entrypoint de Vercel (solo reexporta bats_core.api.main:app)
web/                  frontend React + Vite (SPA)
tests/                pytest
tools/                export_dex.js, check_dex_export.js, roster_parity.js
vercel.json           SPA estática + función Python
MIGRACION_VERCEL_SUPABASE.md   plan y estado de la migración
```

## Documentación — léela antes de tocar BATS

- `MIGRACION_VERCEL_SUPABASE.md`: empieza por "Estado de la ejecución".
- `BATS_DOCS.md`: módulos, rutas, esquema de DB, fórmulas. **Parcialmente desactualizado** (watcher, Docker, endpoints de carpetas del ETL Cleaner); si choca con el código, manda el código.
- `PLAN_TEAMBUILDER.md`: orden de despliegue del dex.

## Comandos

### Backend (desde la raíz, con `source venv/bin/activate`)
```bash
python -m bats_core api                    # FastAPI :8001 (dev)
python -m bats_core db --apply-schema      # schema.sql + migraciones + vistas. Idempotente
python -m bats_core backfill               # reenvía logs de PS a la API (BATS_API_URL + BATS_INGEST_TOKEN). Idempotente
python -m bats_core db --etl               # carga logs directo a la DB
python -m bats_core dex --import           # web/public/dex/*.json -> tournament.dex_species
python -m bats_core ban ...                # registrar/revocar/listar bans
python -m bats_core bot                    # PGL-Bot (requiere requirements-dev.txt)
python -m bats_core clean ...              # borra batallas de un formato
python -m bats_core reset                  # reset TOTAL de la DB — destructivo
pytest                                     # los tests de DB se saltan sin BATS_TEST_DSN
BATS_TEST_DSN=postgresql://localhost/<db_desechable> pytest
```
`requirements.txt` = lo que instala Vercel. `requirements-dev.txt` agrega pandas, rich, pytest, poke-env. **`pandas` no debe entrar al árbol de imports de la API** (hay un test).

### Dex de Showdown (necesita `node build` en `../pokemon-showdown`)
```bash
node tools/export_dex.js          # PS -> web/public/dex/*.json (se commitea)
node tools/check_dex_export.js
node tools/roster_parity.js       # canonicalSet (TS) vs canonical_set (Python)
```

### Frontend (desde `web/`)
```bash
npm run dev      # :5173, proxya /api -> localhost:8001 (BATS_API_URL lo cambia)
npm run build    # tsc -b && vite build
npm run lint     # 4 errores preexistentes en ETLCleanerPage
npx vitest run
```

## Base de datos

- `schema.sql` + `migrations/v2…v10.sql` reconstruyen la base desde cero; `--apply-schema` es reaplicable.
- `seed.sql` y `roles.sql` son opcionales y **solo para Postgres local**; no los apliques en Supabase.
- **Supabase** (proyecto `BATS`, us-east-1): strings en `.env` como `BATS_SUPABASE_DSN_POOLER` (`:6543`, Vercel) y `BATS_SUPABASE_DSN_SESSION` (`:5432`, migraciones/`pg_dump`). **`BATS_DB_DSN` apunta a la DB local a propósito**: `reset`, `clean` y los tests la usan por defecto. Para operar sobre Supabase pasa `--dsn` explícito. Sin RLS (Data API desactivada).
- **La API lee siempre las vistas materializadas** (con o sin `?season_id=`); `season_id = 0` = "sin temporada". Se refrescan con `POST /api/ingest/refresh-views` y un cron diario. **La ingesta NO las refresca.**
- **Orden de despliegue de v10:** primero el código nuevo y enseguida `--apply-schema` (el código nuevo ya no inserta `mvp_score`, que ahora es columna generada).
- **Transacciones:** `db.execute()` NO hace commit. Un bloque `with get_db()` es una transacción (commit al salir, rollback ante excepción); fuera de un `with` llama `db.commit()`.
- No dependas del `search_path`.

## Reglas del dominio

- **Esquemas:** `battle.*` es efímero y puede truncarse; `tournament.*` (seasons, bans, votos, whitelist) **nunca** se trunca en cascada y no tiene FKs hacia `battle`. Al agregar tablas respeta esa frontera.
- **Una sola fórmula de MVP:** `(kills × 2) + survived + final_hit + min(turns_active, 8) × 0.25`, banca = 0. Vive en `bats_core/mvp.py` y en `battle.mvp_score()` (SQL, `v10.sql`); `tests/test_mvp.py` comprueba que coinciden. Cambiarla = nueva migración que recree la columna generada + actualizar `mvp.py`.
- **ETL idempotente por `battle_id`** (PK de `fact_battles`). En `battle.etl_log` la clave única es `file_path` (ruta absoluta) o `push:<battle_id>`. El parser descarta logs de menos de 3 turnos y devuelve `None` ante JSON corrupto.
- **Votos de ban anónimos por diseño:** `api/crypto.py` guarda `SHA-256(BATS_VOTER_SALT + username)`; `ban_votes` no referencia al votante (hay un test). No agregues columna de usuario ni loguees el username junto al voto. Un jugador = máximo 1 ban activo por temporada.
- **Reglas del torneo:** viven en `bats_core/rules.py` (`RESTRICTION_SPEC`, `check_team`). Si Showdown también debe aplicar una, hay que leerla en `validateLeagueTeam` de `../pokemon-showdown/config/formats.ts`. `canonicalSet` (TS) es espejo exacto de `bats_core/teamset.py::canonical_set`; `roster_parity.js` lo verifica. El PGL-Bot es la excepción: sus pools (`bot/sets.py`) están curados a mano para un tipo del mes (`bot/config.py`).
- **El dex de Showdown es la fuente de verdad del teambuilder** (`web/src/lib/dex/snapshot.ts`, sin PokéAPI). `web/src/lib/pokeapi.ts` queda solo para el flujo de votación de bans (`components/ban/VoteFlow.tsx`).
- **Seguridad:** magic link de Supabase Auth; la API verifica el JWT con el JWKS del proyecto (`api/auth.py`) y resuelve rol en `tournament.player_accounts` (`v9.sql`). `/api/teams/me/*` y `/api/ban/me|submit` toman la identidad de la sesión, nunca del body. Necesita `BATS_SUPABASE_URL` (API) y `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (frontend); sin ellas las rutas protegidas responden 503. Tokens de servicio: `BATS_INGEST_TOKEN`, `CRON_SECRET`.

## Contacto con Showdown (por filesystem, rutas en `bats_core/paths.py`)

El server de PS empuja cada batalla a `POST /api/ingest/battle` (plugin `bats-ingest`); el `.log.json` de disco queda de respaldo y se recupera con `backfill`. El plugin escribe `active_bans.json`, `active_rules.json` y `active_rosters.json` en la raíz de PS: **no los edites a mano**. `dist/sim/*` de PS lo cargan `validate_team.js` y las herramientas del dex. Rutas sobrescribibles en `.env`: `BATS_PS_DIR`, `BATS_LOGS_DIR`, `BATS_ACTIVE_BANS_FILE`, `BATS_ACTIVE_RULES_FILE`, `BATS_ACTIVE_ROSTERS_FILE`.

## Convenciones

- Código, docs y mensajes al usuario **en español**. Frontend: Vite/ESLint 9, 2 espacios.
- Secretos en `.env` (`BATS_DB_DSN`, `BATS_VOTER_SALT`, `BATS_SUPABASE_URL`, `BATS_API_HOST/PORT`; en Vercel además `BATS_INGEST_TOKEN`, `CRON_SECRET`). No los commitees ni imprimas sus valores.
- `reset` y `clean` borran datos de verdad — confirma antes de correrlos.
- **Al probar, nunca uses tu base real ni escribas archivos reales de PS.** Usa bases desechables (`createdb`/`dropdb`) y respalda o redirige (`BATS_PS_DIR` temporal) los `active_*.json`.
