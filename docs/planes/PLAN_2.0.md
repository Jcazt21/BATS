# ESTADO DE LA EJECUCIÓN (actualizado 2026-09-20)

Leyenda: ✅ hecho y verificado · 🟡 hecho, falta verificar/pulir · ⏳ pendiente · ⛔ descartado (con motivo)

**Nada está desplegado ni commiteado.** Todo vive en el working tree de `bats/` y `pokemon-showdown/`.

## Fase A — Seguridad ✅ (código) · ⏳ configuración
- ✅ `v9.sql` (`tournament.player_accounts`), `api/auth.py` con JWKS de Supabase, `require_player`/`require_admin`, `/api/teams/me/*`, `/api/ban/me|submit` con identidad de sesión, fuera `POST /api/admin/login`. `GET /api/me`.
- ✅ Frontend: `lib/session.ts`, magic link (`SignInCard`), guard de admin real (`AdminLayout` usa `useMe`).
- ⏳ **Antes de desplegar:** definir `BATS_SUPABASE_URL` (API) y `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (front); habilitar email OTP en Supabase; crear el primer admin por SQL (comentario en `v9.sql`). Sin eso el admin queda inaccesible.

## Fase B — Backend ✅ (con desviaciones)
- ✅ B1 atomicidad (`db.execute` ya no hace commit; tests que fallan con el código viejo). B2 refresh concurrente en admin.
- ✅ B3 `v10.sql`: vistas con `season_id`; la API lee siempre las vistas (tests de paridad contra un oráculo independiente).
- ✅ B4 MVP: `bats_core/mvp.py` + `battle.mvp_score()` + columna generada. **Valores correctos de los tests: 6.75 y 1.5** (los del plan, 8.5 y 0.5, estaban mal).
- ✅ B5 poda: `watcher.py`, subcomando `watch`, imports muertos, `vercel.json` excluye lo no usado (**no probado en Vercel**).
- ⛔ B5 parcial: se conservan `run_etl` y `ingest_payload` (`db --etl` sigue documentado y los tests lo usan).
- ✅ B6 `api/common.py` (`get_active_season`, `upsert_pokemon`, `iso`, `voted_ban_names`) y `api/schemas.py` con los 14 modelos Pydantic que estaban dispersos en las rutas.
- ⛔ B7 `schema_migrations`: descartado, saltar migraciones ya aplicadas rompería las vistas porque `schema.sql` las recrea en cada apply.
- ✅ B8 ingesta: 46 → 12 queries por batalla (21 con temporada activa).
- **Orden de despliegue de v10:** primero código nuevo, luego `--apply-schema` (ver `CLAUDE.md`).

## Fase C — Motor de reglas ✅
- ✅ `bats_core/rules.py` (spec + `check_team` + `rule_checklist`), `GET /api/rules/active`, plugin `syncRules` → `active_rules.json`, `formats.ts` lee el archivo en cada validación (fallback histórico). Probado en sandbox sin tocar archivos reales de PS (equivalencia gen==5 ⇔ #494–649 verificada en 1417 especies).
- 🟡 Bot: solo avisa si el tipo del mes difiere (`rules_drift`); sus pools de `sets.py` son datos curados a mano y no se regeneran solos.
- ⏳ `npm test` completo de PS no se ejecutó (solo `tsc`, `eslint`, `node build` y los scripts de sandbox).

## Features nuevas (backend) ✅
Perfil `GET /api/players/{u}`, Pokédex `GET /api/pokedex[/{sp}]`, Ban Radar `GET /api/ban/candidates`, checklist `POST /api/teams/me/validate`, historial `GET /api/teams/me/history` (el ETL ahora escribe `roster_change_log`), `POST /api/teams/me/swap` atómico, `registration_closed` (restricción nueva; cierra el registro y publica equipos), `GET /api/admin/seasons/{id}/team-violations`.
Aclaración de dominio: una **rotación** es cambiar los 6 del lineup (la detecta el ETL), no reemplazar un pokémon del pool.

## Fase D — Frontend 2.0
- ✅ D1 tokens (`styles/tokens.css`): claro/oscuro reales, contraste AA verificado por script, tipografía con tracking por tamaño, materiales, colores de tipo únicos, reduced-motion/transparency/contrast. `ThemeProvider`.
- ✅ D2 TanStack Query (`lib/http.ts`, `lib/api.ts` reescrito, `lib/queries.ts`), `ToastProvider`.
- ✅ D3 base de motion (`lib/motion.ts`: resortes, `project`, `rubberband`), `ResponsiveSheet` arrastrable, `SegmentedControl`, `PageTransition`.
- ✅ D4 `AppShell` (barra superior translúcida + tab bar móvil), `DataList` (tabla ↔ tarjetas).
- ✅ D5/D6 páginas nuevas o reescritas: Inicio, Estadísticas, Pokédex + ficha, Perfil `/j/:user`, Bans (voto + radar + ranking en vivo), Mi equipo (paste → checklist en vivo → registro, agregar, reemplazar, historial), y en admin: Temporadas, Reglas, Jugadores, Ingestas, Fair play, Batallas, Bans, Stats·Bot.
- ✅ `lib/showdown.ts` con 13 tests (vitest). Borrado: `/ypkmn`, `App.css`, assets de Vite, `WhitelistPage`, `ETLCleanerPage`.
- ✅ Estado al parar: `tsc` limpio, `npm run build` ok, 13 tests de front ok, `npm run lint` **0 errores** (se desactivó `react-refresh/only-export-components` para `src/components/ui/**` en `web/eslint.config.js`, donde no aplica: son archivos de shadcn).
- ✅ Selector "todas las temporadas" en Estadísticas (`StatsPage.tsx`: `seasonChoice` con "active" | "all" | id, pasa `season_id` indefinido al pedirlo).
- ⏳ **Verificación visual**: nunca se ha visto renderizado. Plan: API de demo sobre `bats_demo` con `require_player` sobreescrito + Vite con alias de `@/lib/session` a una sesión falsa + capturas con Chrome headless (claro/oscuro, móvil/desktop). Revisar contraste real, tab bar, sheets, tablas en móvil.
- ⏳ Pulido pendiente: gestos de la hoja y reduced-motion sin probar en dispositivo; `PickChart` de Estadísticas; README del front sigue siendo el de Vite; `BATS_DOCS.md` y `MIGRACION_VERCEL_SUPABASE.md` sin actualizar; `BATS_API.postman_collection.json` sin los endpoints nuevos.

## Tests
`BATS_TEST_DSN=postgresql://localhost/bats_v9_test pytest` → 120 pasan (incluye los de DB). Front: `cd web && npx vitest run`.

## Estado del entorno local (efímero)
- Bases desechables creadas: `bats_v9_test` y `bats_demo` (datos sintéticos). **Borrarlas al terminar** (`dropdb`).
- `pokemon-showdown/dist/` compilado con `node build`; `active_bans.json` real intacto (backup en `/tmp/active_bans.backup.json`).
- `.env` real y `bats-pkmn`/Supabase **no se han tocado**.

---

# BATS 2.0 — Review, rediseño Apple HIG y plan de features

## Context

BATS terminó su migración a Vercel + Supabase (todas las fases salvo la 4). El resultado funciona
y está desplegado en `https://bats-kohl.vercel.app`, pero el proyecto quedó en un estado de
"post-mudanza": hay restos de la arquitectura vieja (filesystem, watcher, carpetas de logs) que
ya no aplican, la capa de auth nunca se hizo y la API está **pública con agujeros reales**, y el
frontend creció por acumulación hasta dos monolitos de ~1.000 líneas sin sistema de diseño,
sin capa de datos y sin estrategia móvil.

El 2.0 tiene tres objetivos, en este orden de dependencia:

1. **Cerrar la Fase 4** — la API expuesta hoy deja que cualquiera borre el equipo de cualquiera.
2. **Consolidar el backend** — eliminar lo que la migración dejó muerto, arreglar la atomicidad
   de las escrituras y unificar las fuentes de verdad duplicadas.
3. **Rediseñar el frontend** con principios HIG de Apple y construir las features que el modelo
   de datos **ya soporta y nadie explota**.

---

## Parte 1 — Review

### 1.1 Lo que la migración dejó muerto o desfasado

| Qué | Dónde | Estado |
|---|---|---|
| Watcher de filesystem | `bats_core/watcher.py` (122 líneas), subcomando `watch` en `bats_core/cli.py:688-703` | Reemplazado por push. La propia doc dice borrarlo |
| ETL desde disco | `bats_core/db/etl.py:611-706` (`run_etl`), `find_log_files` | Sin llamadores en la API; sigue en el bundle serverless |
| `validate_team.js` | `bats_core/validate_team.js` | Entra al bundle de Vercel (`vercel.json:11` no lo excluye) y allí es inejecutable: necesita Node + `pokemon-showdown/dist/` |
| Cache de PokéAPI en disco | `bats_core/pokeapi.py:85,152,159,194` | `/var/task` es read-only. Solo lo usa el CLI |
| ETL Cleaner "de carpetas" | `web/src/pages/admin/ETLCleanerPage.tsx` (643 líneas) | El backend ya documenta que *"no hay archivos que listar"* (`bats_core/api/routes/etl_cleaner.py:1-11`), pero la UI sigue con tabs `directories`, iconos `FolderOpen` y el tipo `EtlFileEntry`. `POST /api/admin/etl/run` devuelve un bloque `etl: {0,0,0,0}` fósil |
| `active_bans.json` como segunda fuente de verdad | `bats_core/paths.py:26`, `bats_core/bot/config.py:35`, `bot/team_builder.py:105` | La DB ya es la fuente vía `GET /api/ban/active`; el archivo persiste para PS y el bot |

### 1.2 Bugs de correctitud (no son estética)

1. **Las escrituras no son atómicas.** `db.execute()` hace commit por sentencia
   (`bats_core/db/connection.py:183`) *además* del commit del `__exit__` (`:159`). Un bloque
   `with get_db()` con varias escrituras no es una transacción. Consecuencias reales:
   - `bats_core/api/routes/ban.py:115-123` — voto y participación en dos commits: si el segundo
     falla hay un voto huérfano y el jugador puede volver a votar.
   - `bats_core/api/routes/seasons.py:220-221` — activar temporada = desactivar todas + activar una,
     en dos transacciones: hay una ventana con **cero temporadas activas** (y media API responde 503 ahí).
   - `bats_core/api/routes/teams.py:457-465` — roster y pokémon insertados uno a uno.
   - `bats_core/api/routes/admin.py:149-160` — el reset son 11 commits independientes.

2. **Refresh bloqueante en rutas admin.** `admin.py:160` y `:204` llaman
   `battle.refresh_bats_views()` (sin `CONCURRENTLY`) → lock exclusivo sobre las 6 matviews que
   bloquea todo `/api/stats/*`. La variante buena (`refresh_bats_views_concurrently`, `v8.sql:45`)
   solo se usa en `ingest.py:59` y `etl_cleaner.py:70`.

3. **Tres cálculos distintos del mismo número.** Win rate vive en la matview `mv_player_stats`
   (`schema.sql:319`), en un CTE inline (`stats.py:62-74`) y en una query completa (`stats.py:212-239`).
   Pick rate vive en `mv_pick_rate` (`schema.sql:270`) y recalculado en `stats.py:166-200` — el propio
   comentario admite *"same logic as the materialized view"*. **Esta duplicación ya produjo una
   divergencia observada** durante la migración (`MIGRACION_VERCEL_SUPABASE.md:10`).

4. **Riesgo de timeout en la ingesta.** `maxDuration: 30` con `POST /api/ingest/battle` haciendo
   decenas de queries sin batching (`etl.py:280-360`) más `_detect_team_violations`
   (`etl.py:420-593`, bucle por jugador con 3-5 queries cada uno).

5. **Frontend:** `npm run lint` falla con **12 errores**, no 4. Además de los 4 ternarios de
   `ETLCleanerPage.tsx:172,182,193,203`: `react-hooks/static-components` en `BattlesPage.tsx:175-176`
   (`TeamColumn` declarado dentro del render → se remonta y pierde estado en cada render),
   `react-hooks/set-state-in-effect` en `StatsPage.tsx:619` y `BattlesPage.tsx:77`, y 4
   `react-refresh/only-export-components` en `ui/`.

### 1.3 Seguridad — el bloqueante

- **`/api/teams/*` no tiene ninguna autenticación.** La identidad es el username en la URL:
  `teams.py:274` (`DELETE /{username}/pokemon/{id}`), `:315` (`POST /{username}/pokemon`),
  `:361` (`POST /register`). Cualquiera borra el equipo de cualquiera.
- **`POST /api/ban/submit` tampoco** (`ban.py:93`): quien conozca un username de la whitelist gasta su voto.
- **Un secreto para tres cosas** (`bats_core/api/auth.py:17-27`): `BATS_VOTER_SALT` es la contraseña
  de admin, la semilla del JWT HS256 **y** el salt de anonimización. Rotarlo invalida todos los
  `voter_hash` históricos. Default `"bats-default-salt-changeme"` congelado en import time.
- **`POST /api/admin/login` sin rate-limit** (`admin.py:52`).
- Lo bien hecho: `service_token()` (`auth.py:52-69`) falla cerrado, compara en tiempo constante y
  lee el env por request. Es el patrón a extender.

### 1.4 El hallazgo de arquitectura más importante

`tournament.seasons.restrictions` (JSONB) + `RESTRICTION_SPEC`
(`bats_core/api/routes/leaguesettings.py:33-65`) ya son **un motor de reglas configurable sin
migraciones** — el mejor patrón del repo. Pero **nadie lo consume**:

- `pokemon-showdown/config/formats.ts:51-119` hardcodea las 4 condiciones mensuales (Hielo, Gen 5,
  Egg Group Dragón, color Amarillo) en el `onValidateTeam`.
- `bats_core/bot/config.py:16` hardcodea `TYPE_OF_MONTH = "Ice"`.
- `bats_core/api/routes/teams.py:414-455` lee `restrictions` crudo con `.get()` sin pasar por
  `_normalize_restrictions`.

Son **cuatro fuentes de verdad** para las reglas de la liga, sincronizadas a mano. Cerrar ese
bucle es la palanca más grande del 2.0.

### 1.5 Datos que ya existen y nadie muestra

| Dato | Dónde | Qué desbloquea |
|---|---|---|
| Sets competitivos completos (moves, EVs, IVs, ability, nature, tera, item) | `tournament.roster_pokemon` (v3+v4) | Usage de movimientos, análisis de teambuilding, export a paste |
| `was_active = FALSE` | `battle.fact_pokemon_performance` | Distinguir **bring rate** (lo llevó) de **pick rate** real (lo sacó) |
| `mv_ban_candidates` | `schema.sql:341` — pokémon con win rate > 70% | Panel de candidatos a ban con datos, hoy matview muerta |
| `team_violations` / `fact_ban_violations` | v3 / `schema.sql:198` | Panel de fair play; el ETL ya los detecta y nadie los ve |
| `end_type = 'forfeit'`, `turns_active` | `fact_battles`, `fact_pokemon_performance` | Tasa de rendición, métricas de longevidad/pivoteo |
| `roster_change_log` | v3 | Historial de rotaciones (tabla vacía, nunca se escribe) |

### 1.6 Frontend — estado del diseño

Stack: React 19 + Vite 8 + Tailwind v4 + shadcn sobre `@base-ui/react` + Geist Variable.
Buen punto de partida; el problema es que no hay **sistema**.

- **Color:** paleta 100% gris (croma 0 en todos los `oklch`). `--chart-1..5` son cinco grises —
  inservibles para series. `:root` y `.dark` en `web/src/index.css:52-143` son **copias literales**:
  no existe tema claro. Y sin embargo `ETLCleanerPage.tsx:39-41` y `AdminLayout.tsx:175` usan
  badges de tema claro (`bg-emerald-100 text-emerald-700`) que quedan ilegibles sobre negro.
- **Tipografía:** una sola familia, `--font-heading` = `--font-sans`. Sin escala tokenizada; los
  tamaños viven inline (`text-[10px]`, `text-[11px]`…). Sin tracking por tamaño.
- **Motion:** cero librerías. Sin transiciones de ruta, sin gestos, y **ni una sola aparición de
  `prefers-reduced-motion`** en todo el proyecto.
- **Móvil:** 8 de 14 páginas tienen **0 breakpoints**, incluida `TeamRegisterPage` (1.051 líneas,
  ~31 `useState`), que es la que más se usará desde el teléfono. Las tablas se desbordan.
- **Datos:** `fetch` crudo, 49 funciones en `web/src/lib/api.ts` repitiendo el mismo bloque de error.
  Sin caché, sin deduplicación, sin `AbortController` en ninguna parte, sin `ErrorBoundary`.
  `recharts` instalado con **0 importaciones** (los gráficos son barras CSS a mano).
- **Auth:** `sessionStorage.getItem("bats_admin_token")` reimplementado en **7 páginas**, cada una
  con su `handleUnauth()`. El guard hace `navigate()` durante el render (`AdminLayout.tsx:67-70`).
- **Accesibilidad:** un único atributo ARIA en todo el código propio (`RestrictionField.tsx:69`).
  `ResetDbModal` (`StatsPage.tsx:517-548`) es un `div` posicionado: sin `role`, sin Esc, sin focus trap.
- **Rutas huérfanas:** `/ypkmn` (274 líneas de un torneo puntual, sin enlaces entrantes) y
  `/admin/leaguesettings` (funcional, pero ausente de `NAV_ITEMS`).
- **Duplicación:** `TYPE_COLORS` copiado en 7 archivos; `getPokemonSprite()` en 3; dos componentes
  distintos llamados `PokemonCard`; la whitelist implementada dos veces (`WhitelistPage` y el tab
  de `SeasonsPage`).

---

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Orden | Seguridad → backend → rediseño |
| Identidad del jugador | El admin asigna `email → username`; el jugador entra con magic link de Supabase |
| Fórmula MVP | Nueva, acotada: `(kills×2) + survived + final_hit + min(turns_active, 8) × 0.25` |
| Features | Las cuatro: motor de reglas, perfil + pokédex, ban radar, teambuilder en vivo + fair play |

**Supuestos** (corrígeme si alguno no es el que quieres):
- El rediseño cubre **público y admin**. El admin no se reescribe entero: hereda los tokens y la
  capa de datos nuevos, y solo se rehacen `ETLCleanerPage` y `SeasonsPage`.
- El roster propio siempre es visible para su dueño; los rosters ajenos solo tras cerrar el registro
  de la temporada.
- Se sigue en el plan Hobby de Vercel (cron diario, `maxDuration: 30`).

---

## Parte 2 — Plan de ejecución

### Fase A — Cerrar la Fase 4 (seguridad)

**A1. Migración `v9.sql` — `tournament.player_accounts`**

```sql
CREATE TABLE tournament.player_accounts (
    user_id    UUID PRIMARY KEY,          -- = auth.users.id de Supabase
    email      TEXT NOT NULL UNIQUE,      -- lo da de alta el admin
    username   TEXT NOT NULL UNIQUE,      -- username de Pokémon Showdown
    is_admin   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_player_accounts_username_lower
    ON tournament.player_accounts (LOWER(username));
```

`user_id` se rellena en el primer login (el email ya está, el `sub` del JWT llega entonces).
Respeta la frontera de esquemas: sin FKs hacia `battle.*`.

**A2. Reescribir `bats_core/api/auth.py`**

- **Verificación por JWKS de Supabase** (asimétrico, sin secreto compartido en Vercel):
  `https://<proyecto>.supabase.co/auth/v1/.well-known/jwks.json`, cacheado a nivel de módulo
  (sobrevive las invocaciones calientes). `python-jose` ya está en `requirements.txt`.
- `require_player` → resuelve `email` del JWT contra `player_accounts`, devuelve `{user_id, username}`.
- `require_admin` → `require_player` + `is_admin`. Bootstrap del primer admin por SQL.
- **Separar los tres usos del secreto.** `BATS_VOTER_SALT` queda **solo** como salt de anonimización
  (documentar en el `.env` que rotarlo invalida todos los `voter_hash` históricos). Se eliminan
  `verify_password()` y `create_token()` (`auth.py:25-35`) y con ellos `POST /api/admin/login`
  (`admin.py:52`) — lo reemplaza el magic link, y desaparece el brute force sin rate-limit.
- `HTTPBearer(auto_error=False)` para devolver 401 y no 403 cuando falta el header.
- **`service_token()` (`auth.py:52-69`) se conserva intacto**: es el patrón correcto y ya cubre
  `BATS_INGEST_TOKEN` y `CRON_SECRET`.

**A3. Cerrar los endpoints**

| Ruta | Antes | Después |
|---|---|---|
| `POST /api/teams/register`, `POST\|DELETE /api/teams/{username}/pokemon...` | público, identidad = URL | `require_player`; pasan a **`/api/teams/me/...`**, la identidad sale del JWT |
| `GET /api/teams/{username}` | público | propio siempre; ajeno solo con registro cerrado |
| `POST /api/ban/submit`, `/api/ban/check-user` | público | `require_player`; el `voter_hash` se deriva del username de la sesión, **nunca del body** |
| `/api/stats/*`, `/api/ban/ranking\|status\|active`, `/api/teams/active-season` | público | siguen públicos (solo lectura; `/ban/active` lo consume el plugin de PS) |

**Invariante que no se rompe:** `ban_votes` sigue sin columna de votante y el voto no se loguea
junto al username (`tests/test_ingest.py` ya lo verifica). Autenticar **quién puede votar** no es
lo mismo que registrar **qué votó**.

**A4. Frontend de sesión** — `@supabase/supabase-js`, un `SessionProvider`, y `LoginPage` pasa de
campo de contraseña a magic link. Nueva página `/admin/jugadores` (alta de `email → username`).

---

### Fase B — Consolidar el backend

**B1. Atomicidad (el bug de fondo).** Quitar el commit por sentencia de
`bats_core/db/connection.py:183`; el commit queda solo en `__exit__` (`:159`), que ya existe.
Con eso los cuatro bloques rotos (`ban.py:115-123`, `seasons.py:220-221`, `teams.py:457-465`,
`admin.py:149-160`) se vuelven atómicos **sin tocar su código**.
⚠️ Revisar el bucle de ingesta de `db/etl.py`: hoy depende del autocommit por batalla — hay que
añadir un `db.commit()` explícito por batalla para no perder el progreso parcial del `backfill`.
Borrar `db.begin()` (`connection.py:314-321`), que solo escribe un log.

**B2. Refresh no bloqueante.** `admin.py:160` y `:204` pasan a
`battle.refresh_bats_views_concurrently()` (`v8.sql:45`), la misma que ya usan `ingest.py:59` y
`etl_cleaner.py:70`.

**B3. Una sola fuente por métrica.** En `v9.sql`: añadir `season_id` a `mv_pick_rate`,
`mv_player_stats` y `mv_mvp_leaderboard` (más sus índices únicos, que `REFRESH CONCURRENTLY`
exige). Entonces borrar de `bats_core/api/routes/stats.py` el recálculo inline de pick rate
(`:166-200`) y el de leaderboard (`:212-239`) y leer siempre la matview. Despierta de paso
`mv_mvp_leaderboard`, hoy muerta. **Esto es lo que eliminó la divergencia observada** en la
migración, no un refactor cosmético.

**B4. MVP en un solo sitio.** Función `battle.mvp_score(kills, turns_active, survived, final_hit)`
`IMMUTABLE`, y `fact_pokemon_performance.mvp_score` pasa a **columna generada**
(`GENERATED ALWAYS AS (...) STORED` — requiere `DROP COLUMN` + `ADD COLUMN`, que es seguro porque
el valor es derivado, y el `ALTER` recalcula toda la tabla solo). Python deja de calcularla:
se borra el cálculo de `db/etl.py:755-757` y `metrics.py:29` importa la misma constante.
Cambiar la fórmula en el futuro = una migración, no un backfill a mano.
Actualizar `tests/test_bats.py:136-143` a los valores nuevos (`8.5` y `0.5`).

**B5. Podar lo muerto.**
- Borrar: `bats_core/watcher.py`, el subcomando `watch` (`cli.py:688-703` + argparse `:1041-1058`),
  `run_etl()`/`_log_parse_error()` (`etl.py:611-706`, `:807`), `SwapRequest` (`teams.py:45-48`) y
  su docstring mentirosa (`teams.py:8`), los `from pathlib import Path` sin usar
  (`api/crypto.py:7`, `api/db.py:7`), el alias `_ENV_FILE` (`api/db.py:13`), el bloque fósil
  `etl: {0,0,0,0}` (`etl_cleaner.py:76`) y el `ingest_payload()` duplicado (`etl.py:729-752`).
- `vercel.json:11`: reducir `includeFiles` a lo que la API realmente importa. Hoy entran al bundle
  `cli.py`, `metrics.py`, `report.py`, `pokeapi.py`, `bans.py` y `validate_team.js` — este último
  además es inejecutable allí.
- Actualizar `CLAUDE.md` y `BATS_DOCS.md`: el watcher deja de existir.

**B6. Desduplicar.** Nuevo `bats_core/api/common.py` con `get_active_season()` (hoy triplicado en
`ban.py:34`, `admin.py:36`, `teams.py:62` con tres errores distintos), `upsert_pokemon()` con una
sola firma de 6 args (en `v9` se dropea el overload de 4 de `schema.sql:512`) y un encoder JSON
que mate los ~15 `r["x"].isoformat() if r["x"] else None`. Los 14 modelos Pydantic dispersos se
mueven a `bats_core/api/schemas.py`.

**B7. Migraciones versionadas.** Tabla `schema_migrations` y `apply_migrations`
(`connection.py:276-310`) salta las ya aplicadas. Resuelve el problema de orden real: el
`DROP MATERIALIZED VIEW ... CASCADE` de `schema.sql:265` borra los índices únicos de `v8`.

**B8. Ingesta más rápida.** Batchear los inserts de `etl.py:280-360` con `execute_values` y
eliminar la query a `information_schema` de `BATSEtl.__init__` (`etl.py:66-77`). Baja el riesgo
contra el `maxDuration: 30`.

---

### Fase C — Motor de reglas único

El cambio de mayor palanca: hoy las condiciones mensuales viven en **cuatro** sitios y se
sincronizan a mano.

1. **`bats_core/rules.py` (nuevo)** — se muda ahí `RESTRICTION_SPEC`
   (`leaguesettings.py:33-65`) y se extiende con lo que `formats.ts` tiene hardcodeado:
   `required_type` (el tipo del mes), `required_generation_range`, `max_paradox`,
   `max_pseudo_legendary`, `banned_tags` (Ultra Beast), `banned_species` (Crowned/Rider).
   Un solo validador que usan la API, el ETL y el teambuilder.
2. **`GET /api/rules/active`** (público) → restricciones normalizadas + bans activos.
   `teams.py:414-455`, que hoy lee `restrictions` crudo con `.get()`, pasa por `rules.py`.
3. **Plugin de PS** — `server/chat-plugins/bats-ingest.ts`: extender el `syncBans` existente para
   escribir también `active_rules.json`. Reutiliza el mecanismo probado (timer, `FS()` relativo a
   la raíz de PS, tolerancia a fallos).
4. **`config/formats.ts`** — `onValidateTeam` genérico que lee `active_rules.json`, con **fallback
   a los valores actuales si el archivo falta**, para que un `batsurl` vacío no rompa el formato.
5. **`bats_core/bot/config.py:16`** — `TYPE_OF_MONTH` deja de ser una constante y se lee del
   mismo archivo.

Resultado: cambiar el tipo del mes pasa de editar 3 archivos en 2 repos a un select en
`/admin/leaguesettings`. La sección de `CLAUDE.md` que avisa de esa desincronización se puede borrar.

---

### Fase D — Frontend 2.0 (Apple HIG)

**D1. Fundaciones de diseño** — `web/src/styles/tokens.css`, reemplazando `web/src/index.css:52-143`.
- **Tema claro y oscuro reales** (hoy `:root` y `.dark` son copias literales). Toggle
  sistema/claro/oscuro con transición suave. Se arreglan de paso los badges de tema claro
  ilegibles sobre negro (`ETLCleanerPage.tsx:39-41`, `AdminLayout.tsx:175`).
- **Color:** neutros con croma mínimo en vez de gris puro, un acento de marca, y
  `--color-type-{18}` en un único sitio — sustituye el `TYPE_COLORS` copiado en 7 archivos.
  Paleta de charts accesible que reemplace los cinco grises de `--chart-1..5`.
- **Tipografía:** escala tokenizada con **tracking por tamaño** (display `-0.022em`, título
  `-0.01em`, cuerpo `0`, caption `+0.01em`) y leading inverso al tamaño. `--font-heading` deja de
  ser un alias de `--font-sans`. Espaciado en `rem` para que respete el tamaño de texto del sistema.
- **Materiales:** tres niveles (`thin / regular / thick`) con `backdrop-filter: blur() saturate()`
  y sombra según superficie, en vez del `backdrop-blur-md` suelto de `AdminLayout.tsx:189`.
  Nunca apilar dos superficies translúcidas claras.
- **`prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`** en la capa base.
  Hoy no hay ni una aparición de la primera en todo el proyecto.

**D2. Capa de datos y sesión**
- **TanStack Query v5**: caché, deduplicación, reintentos y cancelación. `web/src/lib/api.ts`
  (794 líneas) se parte en `lib/http.ts` — un único `request()` con el bloque de error que hoy se
  repite 49 veces — más hooks por dominio (`useStats`, `useTeam`, `useSeasons`).
- **`SessionProvider`** (Supabase) como único dueño del token: elimina los 7
  `sessionStorage.getItem` y los 7 `handleUnauth()`. Guards como `<RequireAuth>` / `<RequireAdmin>`,
  no `navigate()` dentro del render (`AdminLayout.tsx:67-70`).
- `ErrorBoundary` global + toasts. Skeletons en las 4 páginas que hoy solo dicen "Cargando…".

**D3. Motion** — `motion` (Framer Motion). Parámetros del skill de Apple:
- Default `bounce: 0, duration: 0.35` (damping 1.0). `bounce: 0.2` **solo** tras un gesto con inercia.
- Transiciones de ruta ancladas: `transform-origin` en el elemento que las disparó; entrada y
  salida por el mismo camino.
- **Sheets arrastrables** (detalle de batalla, pasos del registro en móvil): Pointer Events con
  `setPointerCapture`, tracking 1:1 respetando el offset de agarre, velocity handoff al soltar,
  proyección de momentum (`(v/1000)·d/(1−d)`, `d = 0.998`) y rubber-band en los bordes.
- Feedback en `pointerdown` (`:active { transform: scale(0.97) }`), nunca solo al soltar.

**D4. Navegación y layout**
- **Móvil: tab bar inferior translúcida** (Estadísticas · Mi equipo · Bans · Perfil).
  Desktop: el sidebar actual re-tokenizado. Nombres específicos, no "Home".
- Componente `DataList` que es `<table>` en desktop y lista de tarjetas en móvil — resuelve el
  desbordamiento de las 4 tablas y las **8 páginas con 0 breakpoints**.
- Scroll edge effect (máscara degradada) bajo la barra translúcida, en lugar de borde de 1px.

**D5. Limpieza de páginas**
- **`TeamRegisterPage.tsx`** (1.051 líneas, ~31 `useState`): `useReducer` + pasos como rutas
  anidadas (`/equipo/importar`, `/equipo/revisar`), y el parser de pastes extraído a
  `lib/showdown.ts` — testeable por fin.
- **`SeasonsPage.tsx`** (955 líneas): extraer `SeasonBansSheet` y los diálogos.
- **`ETLCleanerPage.tsx`** → reescribir como **"Ingestas"**: tabla de `etl_log` y nada más.
  Fuera el tab `directories`, los iconos `FolderOpen`, el tipo `EtlFileEntry` y el icono `Play`
  que sugiere una carga de archivos que ya no ocurre.
- Borrar: `/ypkmn` + `public/yellow-pokemon.json` (lo sustituye el Pokédex), `src/App.css`,
  `src/assets/{hero.png,react.svg,vite.svg}`, las funciones muertas `getWhitelist`/`addPlayer`/
  `removePlayer` (`lib/api.ts:60-79`) y `WhitelistPage` (queda el tab de la temporada, que es el
  que se usa). Reescribir el `README.md` genérico de Vite.
- Añadir `/admin/leaguesettings` a `NAV_ITEMS` (`AdminLayout.tsx:48-55`): hoy es inalcanzable.
- **Los 12 errores de lint a 0**, incluyendo sacar `TeamColumn` del render (`BattlesPage.tsx:93-155`).
- `ResetDbModal` (`StatsPage.tsx:517-548`) → `AlertDialog` (sin `role`, Esc ni focus trap hoy).
- Usar `recharts`, ya instalado y con 0 importaciones, para el Pokédex y el Ban Radar.

**D6. Las cuatro features**

| Ruta | Qué muestra | Endpoint nuevo |
|---|---|---|
| `/j/:username` | Récord, win rate, MVPs, pokémon más usado, racha, historial, roster | `GET /api/players/{username}` |
| `/pokedex` y `/pokedex/:species` | **Bring rate vs pick rate** (usando `was_active`), win rate, movimientos y sets más usados (de `roster_pokemon.moves`), quién lo usa | `GET /api/pokedex[/{species}]` |
| `/bans` (rediseñada) | Ban Radar con los candidatos >70% win rate + ranking de votos en vivo, progreso y cierre | `GET /api/ban/candidates` (despierta `mv_ban_candidates`) |
| `/equipo` | Checklist en vivo contra las reglas activas (1 Hielo ✓, 1 Gen 5 ✗) en vez de fallar al enviar; export a paste; historial de rotaciones | `POST /api/teams/me/validate` (reusa `rules.py`) |
| `/admin/fairplay` | `team_violations` y `fact_ban_violations`, que el ETL ya detecta en cada ingesta | `seasons.py:402` **ya existe**, solo hay que consumirlo |

Para el historial de rotaciones hay que **empezar a escribir `tournament.roster_change_log`**
(tabla v3, hoy vacía) en `teams.py` al añadir/quitar pokémon.

---

## Verificación

**Backend**
```bash
cd bats && source venv/bin/activate
pytest                                    # los 2 de TestMVPScore deben pasar con la fórmula nueva
createdb bats_v9_test
BATS_TEST_DSN=postgresql://localhost/bats_v9_test pytest tests/test_ingest.py
python -m bats_core db --apply-schema --dsn postgresql://localhost/bats_v9_test   # v9 idempotente
dropdb bats_v9_test
```
Tests nuevos a escribir: verificación de JWT contra un JWKS falso, `/api/teams/me/*` rechazando
sesión ajena, atomicidad (forzar fallo a mitad de `ban/submit` y comprobar que no queda voto
huérfano), y `rules.py` contra los mismos equipos que hoy valida `formats.ts`.

**Pokémon Showdown**
```bash
cd pokemon-showdown
cp active_bans.json /tmp/active_bans.backup.json   # syncRules lo toca
npx tsc --noEmit        # 1 error preexistente en battle-teams.ts
npx eslint server/chat-plugins/bats-ingest.ts config/formats.ts
node build && npm test
```
Validar el `onValidateTeam` genérico con `Rooms.createBattle` (`test/server/room-battle.js`;
recuerda `Chat.loadPlugins()` y que ahí `nofswriting = true`), y con un equipo que cumpla y otro
que falle cada condición. Probar también con `active_rules.json` ausente → debe caer al fallback.

**Frontend**
```bash
cd bats/web && npm run lint   # 0 errores (hoy 12)
npm run build && npm run dev
```
A mano: iPhone en horizontal y vertical para las 8 páginas que hoy no tienen breakpoints; tema
claro y oscuro; `prefers-reduced-motion: reduce` activado en el SO (las sheets deben hacer
cross-fade, no slide); navegación completa solo con teclado; axe sin violaciones críticas.

**End to end**: batalla real en PS → push → fila en Supabase → refresh → aparece en `/stats`,
`/j/:username` y `/pokedex`. Cambiar el tipo del mes en `/admin/leaguesettings` → `/hotpatch formats`
en PS → un equipo sin ese tipo debe ser rechazado.

⚠️ Nada de esto se prueba contra `bats-pkmn` ni contra Supabase: bases desechables, y respaldo de
`pokemon-showdown/active_bans.json` antes de tocar la sincronización.

## Orden

**A → B → C → D**, y dentro de D las fundaciones (D1, D2, D3) antes que las páginas (D5, D6).
La Fase A es la que desbloquea todo lo demás y la única urgente: la API ya está pública.



---

# Tareas (checklist)

`[x]` hecho y verificado · `[ ]` pendiente

## Fase A — Seguridad
- [x] A1 Migración `v9.sql`: `tournament.player_accounts`
- [x] A2 `api/auth.py`: verificación JWT por JWKS de Supabase, `require_player`, `require_admin`, 401 sin header
- [x] A2 Quitar `POST /api/admin/login` y el uso de `BATS_VOTER_SALT` como contraseña/JWT
- [x] A3 `/api/teams/me/*` con identidad de sesión (rosters ajenos solo si el registro está cerrado o eres admin)
- [x] A3 `/api/ban/me` y `/api/ban/submit` con `voter_hash` derivado de la sesión
- [x] A3 `GET /api/me`
- [x] A4 Frontend: `SessionProvider`, magic link (`SignInCard`), guard de admin real
- [x] A4 Página admin de cuentas `email → username`
- [x] Tests de auth (JWKS falso, HS256 rechazado, 401/403/503) y de rutas cerradas
- [ ] Configurar `BATS_SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y habilitar email OTP en Supabase
- [ ] Crear el primer admin por SQL (comentario en `v9.sql`)
- [ ] Probar el login real de punta a punta contra Supabase

## Fase B — Backend
- [x] B1 Atomicidad: `db.execute` sin commit por sentencia (tests que fallan con el código viejo)
- [x] B2 Refresh concurrente en las rutas admin
- [x] B3 `v10.sql`: vistas con `season_id`; `stats.py` lee siempre las vistas
- [x] B3 Tests de paridad de estadísticas contra un oráculo independiente
- [x] B4 Fórmula MVP única: `mvp.py` + `battle.mvp_score()` + columna generada
- [x] B4 Tests MVP (Python ↔ SQL) y corrección de los 2 tests que fallaban
- [x] B5 Borrar `watcher.py`, subcomando `watch`, imports muertos, `SwapRequest` y bloque fósil del ETL Cleaner
- [x] B5 Excluir del bundle de Vercel lo que la API no usa (`vercel.json`)
- [ ] B5 Probar el despliegue en Vercel con las exclusiones nuevas
- [x] B6 `api/common.py` (`get_active_season`, `upsert_pokemon`, `iso`, `voted_ban_names`)
- [x] B6 Mover los modelos Pydantic a `api/schemas.py`
- [x] B7 `schema_migrations` — descartado (rompería las vistas; ver estado arriba)
- [x] B8 Ingesta más rápida (46 → 12 consultas por batalla)
- [x] Tests de `_detect_team_violations` con rosters (`test_features.py`: `no_roster_registered`, `not_in_roster`, `rotation_exceeded`)
- [ ] Aplicar `v9` y `v10` a la DB local `bats-pkmn` y a Supabase (código nuevo primero, luego `--apply-schema`)

## Fase C — Motor de reglas
- [x] `bats_core/rules.py` (spec, `check_team`, `rule_checklist`)
- [x] `GET /api/rules/active`
- [x] Restricciones nuevas en el spec: `max_paradox`, `max_pseudo_legendary`, `registration_closed`
- [x] Plugin de PS: `syncRules` → `active_rules.json` (probado con FS y API simulados)
- [x] `formats.ts` genérico leyendo `active_rules.json`, con fallback histórico (probado en sandbox)
- [x] Bot: aviso de deriva del tipo del mes (`rules_drift`)
- [ ] Correr `npm test` completo de Pokémon Showdown
- [ ] Actualizar los pools de `bot/sets.py` cuando cambie el tipo del mes (dato curado a mano, no automatizable)
- [ ] Probar en un server de PS real: `batsurl` + `/hotpatch formats` + equipo rechazado por el tipo nuevo

## Features (backend)
- [x] Perfil `GET /api/players/{username}`
- [x] Pokédex `GET /api/pokedex` y `/api/pokedex/{species}` (pick vs bring rate, sets de rosters públicos)
- [x] Ban Radar `GET /api/ban/candidates`
- [x] Checklist `POST /api/teams/me/validate`
- [x] Historial de rotaciones (el ETL escribe `roster_change_log`) + `GET /api/teams/me/history`
- [x] `POST /api/teams/me/swap` atómico
- [x] Registro cerrado (`registration_closed`) que bloquea ediciones y publica equipos
- [x] `GET /api/admin/seasons/{id}/team-violations`
- [x] Tests de todas las anteriores (120 pytest pasan)

## Fase D — Frontend 2.0 (Apple HIG)
- [x] D1 Tokens: tema claro y oscuro reales, contraste AA verificado, tipografía con tracking por tamaño, materiales, colores de tipo únicos
- [x] D1 `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`
- [x] D1 `ThemeProvider` + selector Claro/Oscuro/Sistema sin parpadeo
- [x] D2 TanStack Query: `lib/http.ts`, `lib/api.ts` reescrito, `lib/queries.ts`
- [x] D2 Sesión única (fuera los 7 `sessionStorage` y `handleUnauth`), toasts
- [x] D3 Motion: resortes, `project`, `rubberband`, `ResponsiveSheet` arrastrable, `SegmentedControl`, `PageTransition`
- [x] D4 `AppShell` (barra superior translúcida + tab bar móvil) y `DataList` (tabla ↔ tarjetas)
- [x] D5 `parsePaste`/`toPaste` extraído a `lib/showdown.ts` con 13 tests (vitest)
- [x] D5 Borrar `/ypkmn`, `App.css`, assets de Vite, `WhitelistPage`, `ETLCleanerPage`
- [x] D5 Rutas huérfanas resueltas (Reglas en el menú admin, redirects de `/registro` y `/ypkmn`)
- [x] D6 Páginas públicas: Inicio, Estadísticas, Pokédex + ficha, Perfil, Bans, Mi equipo
- [x] D6 Páginas admin: Temporadas, Reglas, Jugadores, Ingestas, Fair play, Batallas, Bans, Stats·Bot
- [x] `tsc` limpio, `npm run build` ok, 13 tests de front ok
- [x] Lint a 0: desactivar `react-refresh/only-export-components` para `src/components/ui/**`
- [ ] Verificación visual con Chrome headless (claro/oscuro, móvil/desktop)
- [ ] Revisar el gesto de la hoja inferior y reduced-motion en dispositivo real
- [x] Selector "todas las temporadas" en Estadísticas
- [ ] axe / navegación solo con teclado en las páginas nuevas
- [ ] Reescribir el `README.md` del front (sigue siendo el de Vite)

## Documentación
- [x] `CLAUDE.md` actualizado (auth, MVP, transacciones, reglas, orden de despliegue de v10)
- [x] Estado de la ejecución al inicio de este archivo
- [ ] Actualizar `BATS_DOCS.md`
- [ ] Actualizar `MIGRACION_VERCEL_SUPABASE.md` (Fase 4 hecha en código)
- [ ] Añadir los endpoints nuevos a `BATS_API.postman_collection.json`

## Limpieza final
- [ ] `dropdb bats_v9_test` y `dropdb bats_demo`
- [ ] Revisar `git status` de `bats/` y `pokemon-showdown/` y commitear por partes
