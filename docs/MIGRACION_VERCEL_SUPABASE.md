# Migrar BATS a Vercel + Supabase

## Estado de la ejecución (actualizado)

> **v15 (empates en `mv_player_stats`):** en Supabase correr `--apply-schema` con el DSN de sesión **antes** de desplegar el código que lee `ties`.

**Hecho y verificado** (los números son de pruebas reales contra los 13 logs de la liga, en bases desechables; tu DB local `bats-pkmn` no se tocó):

| Fase | Estado | Verificación |
|---|---|---|
| 0 — Repo propio + `bats_core/` | Hecho | 42 tests pasan (los 2 que fallan ya fallaban: fórmula MVP) |
| 1 — Schema portable + **datos en Supabase** | **Hecho y aplicado** (proyecto `BATS`, us-east-1, Postgres 17.6) | Base vacía → estructura idéntica a `bats-pkmn` (273 líneas de firma) + solo las 8 líneas de `v8`. Datos migrados con `pg_dump`/`pg_restore`: 18 tablas con conteos iguales, 189 filas de contenido comparadas sin diferencias, secuencias correctas. La API a través del transaction pooler (`:6543`) devuelve lo mismo que tu DB local en 9 de 10 endpoints; el décimo (`pickrate`) difiere porque **la vista materializada de tu DB local está desactualizada** (Supabase coincide con un recálculo fresco) |
| 2.1 — ETL sin filesystem | Hecho | `parse_battle_file` == `parse_battle_dict` == foto de referencia en los 13 logs; datos cargados idénticos a los de tu DB real (12 batallas, 152 filas) |
| 2.2 — Refresh de vistas | Hecho | `CONCURRENTLY`: 0.07s con un lector con la vista abierta (uno bloqueante esperaría todo el `pg_sleep`) |
| 2.3 — Sin escritura a disco | Hecho | `active_bans.json` intacto tras votar; ETL Cleaner reducido a DB |
| 3 — Ingesta por push | Hecho | Batalla **real** de PS → hook → API real → fila en la DB |
| 5 — Frontend + despliegue | **Desplegado** en https://bats-kohl.vercel.app | Frontend y rutas SPA (200), API leyendo Supabase por el pooler `:6543` (~0.2–0.3 s), escritura real (batalla nueva `loaded`, reenvío `skipped`, 14 filas de rendimiento), `backfill` de los 13 logs (13 omitidas, 0 fallidas), refresh por token de ingesta y por `CRON_SECRET` (200), 5/5 rechazos de autenticación correctos. Datos de prueba borrados (Supabase = 12 batallas, 12 `etl_log`) |
| **4 — Supabase Auth** | **Pendiente** | Ver "Decisiones abiertas" |

**Cambios respecto al plan original** (descubiertos al ejecutar):

1. **`onBattleEnd` NO tiene el log completo.** El plan asumía que `logData` estaba listo ahí; en realidad `log`, `endType` y `format` se agregan dentro de `logBattle`. Se agregó un hook `onBattleLogged` (2 líneas en `server/room-battle.ts` y 1 en `server/chat.ts`) que entrega el mismo objeto que se escribe a disco y hereda sus reglas (`noLog`, ranked, `logchallenges`).
2. **`schema.sql` no se podía aplicar en una base vacía** (`fact_battles` referenciaba `tournament.seasons` antes de crearla). Además mezclaba DDL con roles de contraseña conocida (`cambiar_en_produccion`), datos reales de la liga y un `ALTER DATABASE "bats-pkmn"` hardcodeado. Ahora: DDL ordenado en `schema.sql`; `seed.sql` y `roles.sql` son opcionales y **no** se aplican en Supabase.
3. **Idempotencia sin cambiar `etl_log.file_path`.** `fact_battles.battle_id` ya era PK. Las batallas empujadas usan la clave `push:<battle_id>` y `load_battle` deduplica también por `battle_id`. Migración `v8.sql` solo agrega un índice.
4. **Refresh de vistas sin cron frecuente.** El plan proponía Vercel Cron cada pocos minutos, pero el plan Hobby solo permite crons diarios. El plugin de PS pide el refresh con debounce (30s) tras cargar batallas (`POST /api/ingest/refresh-views`); el cron queda como respaldo diario.
5. **`pandas` sí estaba en el árbol de imports** (`cli.py` lo importa a nivel módulo; el análisis previo decía lo contrario). Se resolvió moviendo `find_log_files` a `parser.py`; hay un test que falla si la API vuelve a importarlo.
6. **Los errores 500 filtraban mensajes internos de la DB** (`detail: str(exc)`). Ahora devuelven un mensaje genérico. CORS pasó de `*` a opt-in por `BATS_CORS_ORIGINS` (mismo origen en Vercel).
7. **Estructura:** `web/` dentro del repo en vez de `src/` en la raíz.

**Pendiente — necesita cosas tuyas:**

1. ~~Crear el proyecto Supabase~~ — **Hecho.** Credenciales en `bats/.env` (`BATS_SUPABASE_DSN_POOLER` para Vercel, `BATS_SUPABASE_DSN_SESSION` para migraciones). Data API desactivada a propósito: las tablas no tienen RLS. Plan Free: el proyecto **se pausa tras 7 días sin actividad**.
2. **Aplicar `v8.sql` a tu DB local** si quieres seguir usándola (hoy no lo tiene; lo ejercita `--apply-schema`).
3. **Fase 4 (auth):** ver decisiones abiertas. **Urgente: la API ya es pública** y la contraseña de admin sigue siendo `BATS_VOTER_SALT`.
4. ~~Desplegar en Vercel~~ — hecho (variables: `BATS_DB_DSN` = pooler de Supabase, `BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`, `CRON_SECRET`).
5. **En el server de PS** (`config/config.js`): `batsurl`, `batsingesttoken`. Tras validar el push en vivo, se puede borrar `watcher.py` y el subcomando `watch`.

**Decisiones abiertas de la Fase 4** (no las tomé por ti):

- **Identidad del jugador.** Hoy cualquiera escribe un username de PS y puede editar ese roster: no hay verificación. Con Supabase Auth hay que decidir cómo se vincula una cuenta a un username (¿el admin asigna email→username en la whitelist? ¿el jugador reclama uno y el admin aprueba?). Afecta `tournament.player_accounts`, `TeamRegisterPage` y las rutas `/api/teams/*`.
- **Admin.** Propongo un claim en `app_metadata` (`role: "admin"`) verificado con el JWKS de Supabase.
- El `BATS_VOTER_SALT` hoy también es la contraseña de admin y el secreto del JWT (`auth.py:17-27`). Mientras no se haga la Fase 4, **no expongas esta API a internet con datos reales**.

---

## Context

BATS hoy solo funciona con tu Mac encendida. El acoplamiento entre Pokémon Showdown y BATS es **un volumen de archivos compartido**: PS escribe `logs/<YYYY-MM>/<formato>/<fecha>/<id>.log.json` y un watcher de `watchdog` los detecta y dispara el ETL. Eso obliga a que el server de PS, el backend Python y Postgres vivan en la misma máquina.

El objetivo es que la web (stats, registro de equipos, votación de bans) esté disponible siempre, sin depender de tu máquina, moviendo la DB a Supabase y la API + SPA a Vercel.

**El problema central:** Vercel no tiene filesystem escribible ni procesos long-running. El watcher, el ETL que escanea `logs/`, y el `write_text()` de `active_bans.json` son incompatibles por definición. La solución no es portar el watcher — es **invertir la dirección del flujo**: que PS empuje cada batalla por HTTPS al terminar.

Eso además desbloquea la decisión que dejaste pendiente (dónde correr PS): con ingesta por push, PS solo necesita salida a internet. Puede quedarse en tu Mac hoy y mudarse a un VPS después sin tocar BATS.

### Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Alcance de Supabase | Solo Postgres gestionado. FastAPI sobrevive, desplegado en Vercel |
| Ingesta de logs | Push desde PS en `onBattleEnd` |
| Auth | Supabase Auth (admin **y** jugadores), RLS por fases |
| Endpoints públicos | Se cierran en esta migración |
| ETL Cleaner | Se reduce a operaciones de DB |
| Entorno local | Se abandona Docker/nginx; la nube es el único entorno |
| PGL-Bot | Fuera de alcance, se queda junto al server de PS |

---

## Arquitectura destino

```
PS server (tu Mac hoy, VPS mañana)
  │ onBattleEnd → snapshot de logData
  │ POST /api/ingest/battle   (Bearer BATS_INGEST_TOKEN)
  ▼
Vercel  ── un solo proyecto, mismo origen ──────────┐
  │  api/index.py   → FastAPI (función Python)      │
  │  dist/          → SPA React (estático + CDN)    │
  └──────────────────┬─────────────────────────────-┘
                     │ psycopg2 → Supavisor :6543 (transaction mode)
                     ▼
              Supabase Postgres
              battle.* / tournament.*
                     ▲
                     │ JWT verificado vía JWKS
              Supabase Auth (admin + jugadores)
```

Un solo proyecto de Vercel sirviendo SPA y API desde el mismo origen **elimina CORS por completo** — hoy el backend corre con `allow_origins=["*"]` ([api/main.py:26-31](api/main.py#L26-L31)), que se puede borrar.

---

## Fase 0 — Extraer BATS a su propio repo

Hoy `bats/` vive *untracked* dentro del fork de Pokémon Showdown y `bats-web/` tiene su propio `.git`. Vercel despliega desde un repo, y no quieres que construya un fork de PS de 400MB.

**Crear un repo nuevo** (o renombrar el de `bats-web`) con la estructura que exige el runtime Python de Vercel:

```
bats/
├── api/index.py          # from bats_core.api.main import app
├── bats_core/            # ex bats/ — api/, db/, parser.py
├── src/                  # ex bats-web/src/
├── public/
├── requirements.txt      # completo (ver Fase 2)
├── vercel.json
└── package.json
```

Qué **no** se mueve, se queda en el fork de PS junto al bot:
- `bats/bot/`, `bats/validate_team.js`, `bats/pokeapi.py`, `bats/metrics.py`, `bats/report.py`
- `bats/watcher.py` → **se borra**, lo reemplaza el push
- `bats/cli.py` → se conserva recortado como herramienta local (aplicar schema, backfill), no se despliega

Gotcha a verificar al desplegar: el runtime Python de Vercel no siempre incluye paquetes hermanos al entrypoint. Si `bats_core` no se importa, declararlo en `vercel.json` con `functions: { "api/index.py": { "includeFiles": "bats_core/**" } }`.

---

## Fase 1 — Supabase

1. Proyecto nuevo. **Elegir la misma región que las funciones de Vercel** — si no, cada round-trip a la DB cruza continentes, y el ETL hace decenas de queries por batalla.
2. Aplicar [db/schema.sql](db/schema.sql) + las migraciones `v2`–`v7`. Es idempotente (`IF NOT EXISTS` en todo).
3. Migrar los datos actuales con `pg_dump`/`pg_restore` de `bats-pkmn` local.
4. Usar el **connection string de transaction mode (`:6543`, Supavisor)**, no el directo `:5432`. Es lo indicado para serverless, que abre muchas conexiones cortas. Transaction mode no soporta prepared statements — psycopg2 no los usa por defecto, así que es compatible, pero hay que verificarlo bajo carga.
5. `BATS_DB_DSN` como env var en Vercel, con `sslmode=require`.

`db/connection.py` no necesita cambios estructurales: abre y cierra conexión por bloque `with` ([connection.py:126-151](db/connection.py#L126-L151)), que es exactamente el patrón que quiere el pooler. Sí hay que **quitar el DSN por defecto hardcodeado** (`connection.py:40`) para que falle ruidosamente si falta la env var en lugar de intentar conectarse a localhost.

### Migración de schema nueva (`v8.sql`)

El ETL usa `file_path` (ruta absoluta del log) como clave de idempotencia en `battle.etl_log`, con `ON CONFLICT (file_path)` en todos los upserts ([etl.py:225-232](db/etl.py#L225-L232), `:344-352`, `:728-737`). Sin archivos, esa clave deja de existir.

- Añadir `battle_id TEXT UNIQUE` a `battle.etl_log`, hacer `file_path` nullable
- Backfill de `battle_id` desde los `file_path` existentes
- Tabla `tournament.player_accounts (user_id uuid PK, ps_username text unique, voter_hash text)` para la Fase 4

---

## Fase 2 — Adaptar el backend a serverless

### 2.1 Desacoplar el ETL del filesystem

Es el cambio de más riesgo. La lógica de negocio (`BATSEtl.load_battle`, [etl.py:153](db/etl.py#L153)) ya opera sobre un objeto `BattleData` — solo la *entrada* está atada al disco:

- `parser.py:291-296` deduce `date`, `format` y `battle_id` **de la ruta del archivo**, no del JSON
- `_get_file_size` ([etl.py:708-713](db/etl.py#L708-L713)) hace `Path(...).stat()`

Trabajo:
- Extraer `parse_battle_dict(data: dict, battle_id: str, date: str, fmt: str) -> BattleData` de `parse_battle_file`. `parse_battle_file` pasa a ser un wrapper que lee el archivo y llama a la nueva función (sigue sirviendo para el backfill local).
- `load_battle` recibe `battle_id` en lugar de `file_path` como clave de dedupe; `_is_already_processed` ([etl.py:143-149](db/etl.py#L143-L149)) consulta por `battle_id`.
- `_get_file_size` devuelve `None` cuando no hay archivo.

### 2.2 Sacar el refresh de matviews del camino crítico

[schema.sql:389-397](db/schema.sql#L389-L397) — `battle.refresh_bats_views()` refresca **6 materialized views** y el ETL la llama al final de cada corrida ([etl.py:669](db/etl.py#L669)). Con ingesta por batalla eso es carísimo, y `REFRESH MATERIALIZED VIEW` sin `CONCURRENTLY` toma lock exclusivo y **bloquea las lecturas** de `/api/stats/*`.

- La ingesta **no** refresca views.
- Añadir `REFRESH ... CONCURRENTLY` (requiere un índice UNIQUE por matview) en una función nueva.
- Refrescar desde un **Vercel Cron** cada N minutos, en un endpoint protegido.

Esto importa por el timeout: el plan gratuito de Vercel corta a **10s**; Pro da 60s. Una batalla son decenas de queries sin batching ([etl.py:171-331](db/etl.py#L171-L331)) — entra en 10s si la región coincide, pero no si además refresca views.

### 2.3 Quitar las escrituras a disco

- **`ban.py:59-75`** — `_export_active_bans_json()` hace `write_text()` sobre el repo, y se llama desde el endpoint público `POST /api/ban/submit` ([ban.py:146](api/routes/ban.py#L146)). **Rompe en Vercel.** Se borra y se reemplaza por `GET /api/ban/active` que devuelve la misma lista como JSON. Del lado de PS, el plugin la consulta al arrancar y cada N minutos y escribe el `active_bans.json` local que ya leen [bot/config.py:33](bot/config.py#L33) y `config/formats.ts`.
- **`etl_cleaner.py`** — se recorta a operaciones de DB: listar y borrar filas de `etl_log`/`fact_battles`. Se eliminan `/directories`, `/directory`, los `unlink()` (`:191`, `:345-347`) y el `Path(...).exists()` por fila (`:281`). `POST /run` deja de escanear `logs/` y se convierte en el trigger de reproceso desde la DB.
- **`api/main.py:56-69`** — borrar `serve()` entero (arranca el thread de watchdog + uvicorn). En Vercel el entrypoint solo exporta `app`.
- `load_dotenv()` apuntando a `<repo>/.env` (`main.py:15`, `db.py:11`, `crypto.py:10`) — en Vercel no hay `.env`; que sea condicional para no romper en local.

### 2.4 requirements.txt

Hoy está incompleto: **faltan `fastapi`, `uvicorn` y `python-jose`**, que solo se instalan en el `Dockerfile:13`. Y sobran para la API: `pandas` (~70-130MB), `rich` y `watchdog`.

Buena noticia verificada: **`pandas` no está en el árbol de imports de `api/main.py`** — solo lo usan `metrics.py` y `report.py`, que se quedan fuera. El bundle queda muy por debajo del límite de 500MB.

---

## Fase 3 — Ingesta push desde Pokémon Showdown

### Endpoint nuevo

`POST /api/ingest/battle`, autenticado con **un token de servicio** (`BATS_INGEST_TOKEN`), no con Supabase Auth — quien llama es una máquina, no una persona.

Body: `{ battle_id, format, date, log }`. Handler: `parse_battle_dict(...)` → `load_battle(...)`. Idempotente por `battle_id`, así que reintentar es seguro.

### Plugin nuevo en el fork de PS

`server/chat-plugins/bats-ingest.ts`, sobre `onBattleEnd` ([room-battle.ts:847](../pokemon-showdown/server/room-battle.ts#L847)).

**Dos detalles que hay que hacer bien:**

1. **`Chat.runHandlers` es fire-and-forget** (`void h.call(...)`, [chat.ts:2103-2109](../pokemon-showdown/server/chat.ts#L2103-L2109)) y `logBattle()` pone `this.logData = null` en `room-battle.ts:897`. Si el handler hace `await fetch(...)` y *después* lee `battle.logData`, va a encontrar `null`. **Hay que snapshotear `logData` de forma síncrona, antes del primer `await`.**

2. `onBattleEnd` se dispara **antes** de que se escriba el `.log.json`, así que el archivo en disco sigue generándose (`Config.logchallenges = true`, [config.js:421](../pokemon-showdown/config/config.js#L421)) y funciona como **respaldo natural**: si la API está caída, el log no se pierde.

3. Reintento con backoff, y un comando `python -m bats backfill --logs-dir logs` que lee los `.log.json` de disco y los reenvía al endpoint. Es la red de seguridad para cuando PS corre sin internet.

Config nueva en `config/config.js`: `exports.batsingesturl` y `exports.batsingesttoken`.

> Nota aparte: [battle-teams.ts](../pokemon-showdown/server/chat-plugins/battle-teams.ts) **no hace nada hoy** — `Config.usepostgres` no está definido, así que `start()` hace `return` en `:77`. O se conecta a Supabase, o se borra. Recomiendo borrarlo: el push de la Fase 3 puede incluir los equipos packed y deja esa tabla redundante.

---

## Fase 4 — Auth: Supabase Auth + cierre de endpoints

### Lo que hay hoy (y por qué urge cambiarlo)

[api/auth.py:17-27](api/auth.py#L17-L27):

```python
_SALT   = os.environ.get("BATS_VOTER_SALT", "bats-default-salt-changeme")
_SECRET = hashlib.sha256(_SALT.encode()).hexdigest()

def verify_password(password: str) -> bool:
    return hmac.compare_digest(password, _SALT)
```

**La contraseña de admin *es* el salt de anonimización de votantes**, y el secreto que firma los JWT se deriva de ella. Un solo secreto para tres cosas, con un default inseguro que se congela en import time. En LAN es tolerable; público en internet, no.

Además `/api/teams/*` no pide token: `DELETE /api/teams/{username}/pokemon/{id}` identifica al jugador **solo por el username en la URL**.

### Cambio

- Verificar JWT de Supabase vía **JWKS asimétrico** (`https://<proj>.supabase.co/auth/v1/.well-known/jwks.json`) en lugar del HS256 casero. Evita tener el secreto de firma en Vercel.
- `require_admin`: JWT válido + claim de rol admin.
- `require_player`: JWT válido; las escrituras de `/api/teams/*` comprueban que el `ps_username` de la ruta corresponde al `user_id` del token vía `tournament.player_accounts`.
- `BATS_VOTER_SALT` queda **solo** para `crypto.hash_username` ([crypto.py:15-17](api/crypto.py#L15-L17)), que es su único propósito legítimo.

### Invariante de anonimato — no romper

`ban_votes` guarda `(season_id, pokemon_id)` **sin ninguna referencia al votante**; quién participó vive aparte en `ban_participation(voter_hash)`. Esa separación es la que hace anónimo el voto.

Al añadir `player_accounts`, **`ban_votes` no debe recibir jamás una columna de usuario**. La garantía se mantiene igual que hoy: se sabe *quién votó*, nunca *qué votó*.

### RLS — con honestidad

RLS solo protege de verdad si quien consulta la DB lleva la identidad del usuario. Con FastAPI delante usando una conexión privilegiada, **las políticas se saltan y RLS no aporta nada**. Dos pasos:

1. **Ahora:** Supabase Auth como proveedor de identidad; la autorización la sigue aplicando FastAPI. Esto ya elimina el problema del secreto compartido y cierra `/api/teams/*`.
2. **Después:** rol `bats_api` sin privilegios + `SET LOCAL request.jwt.claims` por transacción, y políticas sobre `player_accounts`, `roster*` y `ban_*`. Ahí RLS empieza a valer.

Meter RLS en el paso 1 sin propagar claims sería teatro de seguridad. Lo separo a propósito.

---

## Fase 5 — Frontend y despliegue

Las **47 llamadas** de [src/lib/api.ts](web/src/lib/api.ts) mantienen rutas (`/api/...`) y formato de error (`detail` de FastAPI). Cambia poco:

- `VITE_API_URL` pasa a `""` (mismo origen) → adiós CORS.
- Añadir `@supabase/supabase-js`. `adminLogin()` ([api.ts:42-52](web/src/lib/api.ts#L42-L52)) → `signInWithPassword`. El token sale de la sesión de Supabase en vez de `sessionStorage["bats_admin_token"]` (`LoginPage.tsx:20`, `AdminLayout.tsx:60-63`), con refresh automático.
- `TeamRegisterPage.tsx` gana login de jugador.
- `ETLCleanerPage.tsx` pierde la UI de archivos y directorios.
- Borrar `Dockerfile`, `nginx.conf`, `.dockerignore` en ambos lados.
- `vercel.json`: build del SPA + `api/index.py`, `maxDuration` en el endpoint de ingesta, y el cron del refresh de matviews.

Env vars en Vercel: `BATS_DB_DSN` (Supavisor :6543), `BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

---

## Verificación

Cada fase se puede probar por separado — no hay big bang.

1. **Schema en Supabase**: aplicar schema + `v8`, correr `pytest bats/test_bats.py` apuntando `BATS_DB_DSN` a Supabase.
2. **ETL desacoplado (lo más crítico)**: `parse_battle_dict` sobre un `.log.json` real de `logs/2026-04/gen9pinchesgueysleague/` debe producir el **mismo `BattleData`** que `parse_battle_file` sobre el mismo archivo. Test de regresión.
3. **Idempotencia**: `POST /api/ingest/battle` dos veces con el mismo `battle_id` → una sola fila en `fact_battles`, sin error.
4. **Backfill**: cargar el histórico de `logs/` contra Supabase y comparar totales (batallas, `fact_pokemon_performance`) contra la DB local. Deben cuadrar.
5. **Push end-to-end**: levantar PS local apuntando a la API desplegada, jugar una batalla, ver la fila aparecer en Supabase.
   - Y el caso feo: con la API apagada, la batalla debe seguir escribiendo su `.log.json` y recuperarse con `backfill`.
6. **Auth**: sin token → 401 en rutas admin. Con token de jugador A, `DELETE /api/teams/B/pokemon/1` → 403.
7. **Anonimato**: después de votar, verificar que ninguna columna de `ban_votes` permite llegar al votante.
8. **Timeouts**: medir `POST /api/ingest/battle` y `/api/stats/*` en Vercel. Si la ingesta pasa de ~8s, hay que colocar mejor las regiones o pasar a Pro.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| ETL desacoplado altera datos sutilmente | Test de equivalencia (verificación #2) antes de migrar nada |
| Timeout de 10s en plan gratuito | Sacar el refresh de matviews; colocar Vercel y Supabase en la misma región; Pro si hace falta |
| Push perdido si la API está caída | El `.log.json` se sigue escribiendo; `backfill` lo recupera |
| `logData` nulo por leerlo tras un `await` | Snapshot síncrono en el handler (Fase 3) |
| Agotar conexiones de Supabase | Supavisor transaction mode `:6543`, no conexión directa |
| Coste de Supabase al crecer | El plan gratuito da 500MB; hoy son pocos miles de filas |

## Fuera de alcance

PGL-Bot (se queda con PS), `metrics.py`/`report.py` (legacy pandas), RLS con propagación de claims (Fase 4 paso 2), y decidir dónde hostear PS — que después de esto deja de ser urgente.

## Nota

`CLAUDE.md` afirma que el plugin `battle-teams` escribe equipos a Postgres. Es falso: `Config.usepostgres` no existe. Lo corrijo al empezar.
