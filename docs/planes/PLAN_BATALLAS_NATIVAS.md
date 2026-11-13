# Arena — batallas nativas en BATS · Plan de implementación

> **Para quien ejecute esto (persona o agente):** lee primero las secciones 1 a 8 completas, una
> sola vez. Después trabaja **solo** la fase que te toque (sección 10). Cada tarea es un ciclo
> TDD (rojo → verde → refactor → commit). No saltes puertas marcadas **[HUMANO]**.
> Todo el código, comentarios, docs y textos de UI van **en español**; los identificadores
> (SQL, TypeScript, Python, rutas de API) van en inglés, igual que el resto del repo.

**Objetivo:** que las batallas de la PGL se jueguen dentro de BATS —sin server de Pokémon
Showdown, sin chat ni lobby— y que alimenten las estadísticas directamente.

**Arquitectura en una frase:** una función Node en Vercel ("el motor") usa el simulador de
Showdown como librería, guarda cada batalla en Supabase como `seed + inputLog` y la **rejuega
entera en cada petición** (10–40 ms); FastAPI sigue siendo el dueño de las reglas de liga y del
ETL; el navegador sigue el estado con las librerías `@pkmn/*` y recibe avisos por Supabase Realtime.

**Stack (no se añade nada fuera de esto):** Vercel (función Python existente + una función Node
nueva + SPA estática) · Supabase (Postgres, Auth, Realtime Broadcast, Cron/`pg_cron`, `pg_net`,
Vault) · React 19 + Vite · pytest · vitest.

**Nombre del módulo:** *Arena*. Esquema SQL `arena`, rutas `/api/arena/*` (Python) y
`/api/motor/*` (Node), páginas `/arena` y `/batalla/:id`.

---

## Estado de la ejecución

> Quien termine una tarea marca su casilla aquí y, si se desvió del plan, lo anota en la
> **Bitácora** (sección 13). Este bloque es la única fuente de verdad del avance: sobrevive a
> los reinicios de contexto.

| Fase | Rama | Estado | Puerta |
|---|---|---|---|
| 0 · Cimientos y esqueleto andante | `arena/fase-0-cimientos` | ☐ pendiente | ☐ |
| 1 · Núcleo del motor (puro) | `arena/fase-1-nucleo` | ☐ pendiente | ☐ |
| 2 · Persistencia y API del motor | `arena/fase-2-api-motor` | ☐ pendiente | ☐ |
| 3 · Liga: retos, equipo de 6 y reglas | `arena/fase-3-liga` | ☐ pendiente | ☐ |
| 4 · Ingesta: de la arena a las estadísticas | `arena/fase-4-ingesta` | ☐ pendiente | ☐ |
| 5 · Visor mínimo jugable | `arena/fase-5-visor-minimo` | ☐ pendiente | ☐ |
| 6 · Reloj, barrido y operación | `arena/fase-6-operacion` | ☐ pendiente | ☐ |
| 7 · Visor completo y repeticiones | `arena/fase-7-visor-completo` | ☐ pendiente | ☐ |
| 8 · Bot nativo *(opcional)* | `arena/fase-8-bot` | ☐ pendiente | ☐ |
| 9 · Retiro de Showdown | `arena/fase-9-retiro-ps` | ☐ pendiente | ☐ |

---

## 1. Contexto y evidencia

Hoy las batallas se juegan en un fork del server de Showdown (`../pokemon-showdown`). Un plugin
empuja cada batalla a `POST /api/ingest/battle`, y las reglas, bans y rosters viajan de vuelta por
archivos `active_*.json`. Eso obliga a mantener: el fork (368 commits detrás de upstream), tres
parches que hay que conservar en cada merge, `formats.ts`, y la paridad `canonicalSet` TS ↔ Python.

Antes de escribir este plan se midió todo lo que parecía arriesgado, sobre las **13 batallas reales**
de `../pokemon-showdown/logs` (2026-11-12):

| Qué se probó | Resultado |
|---|---|
| Rejugar una batalla completa desde `seed + inputLog` con el `dist/sim` del fork | 6–37 ms; log idéntico al real |
| Lo mismo con **`@pkmn/sim@0.11.0` de npm** (upstream actual) y el formato de liga expresado como reglas custom | 7–25 ms; **13/13 idénticas** (ignorando `\|rule\|`, `\|tier\|`, `\|t:\|` y `\|-message\|`) |
| Guardar y restaurar el estado (`State.serializeBattle`) tras cada input | idéntico; 45–61 KB por batalla. **No se usará** (ver D2) |
| `require('@pkmn/sim')` en frío / memoria | 160 ms / 240 MB RSS (local) |
| `TeamValidator` con el formato de liga | 1–3 ms |
| `@pkmn/client` + `@pkmn/view` siguiendo las 13 batallas desde la vista de **un** jugador | 13/13 sin error: estado (HP, KO), texto del log y construcción de elecciones correctos |
| Licencias | `@pkmn/*` y el simulador: MIT. El **cliente** de Showdown: AGPLv3 → no se embebe |

Hechos del simulador que condicionan el diseño (verificados leyendo `sim/battle.ts`):

- **`battle.inputLog` solo recibe las elecciones al resolverse el turno** (`commitChoices`). Mientras
  un lado ya eligió y el otro no, esa elección no está en el `inputLog`: hay que guardarla aparte.
- `battle.sendUpdates()` no se llama solo; lo hace `BattleStream`. Usando `Battle` directo hay que
  llamarlo tras cada acción.
- El log trae información privada como tríos `|split|pN` / línea secreta / línea pública. Se resuelve
  con `extractChannelMessages(texto, [canal])`: canal `1`/`2` para cada jugador, `0` para
  espectadores, `-1` omnisciente (lo que necesita el parser de BATS).
- Las peticiones (`|request|{…}`) salen por `send('sideupdate', 'p1\n|request|…')`. **No traen
  `rqid`** (eso lo añade el server de PS, no el simulador).
- `battle.choose()` devuelve `false` ante una elección inválida y emite `|error|…` por `sideupdate`;
  a veces además **reemite la petición actualizada** (p. ej. revela que estás atrapado).
- El log incluye líneas `|t:|<unix>` que cambian en cada rejugada: cualquier comparación de logs
  debe normalizarlas.
- La línea `|-message|X forfeited.` la añade el server de PS, no el simulador.

---

## 2. Decisiones de arquitectura

| # | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| D1 | El motor es **`@pkmn/sim` de npm con versión exacta**, importado desde un único archivo (`motor/src/engine/sim.ts`). | Reproducible con lockfile, sin fork ni `node build`, sin parches que conservar; verificado 13/13. Un único punto de importación permite cambiar al paquete oficial `pokemon-showdown` tocando un archivo. | Vendorizar `dist/` del fork (7 MB de JS generado en el repo; arrastra el atraso de 368 commits). |
| D2 | La fuente de verdad de una batalla es **`seed + input_log`**; cada petición rejuega desde cero. | 10–40 ms, 2–3 KB, sin estado en memoria: encaja exacto con serverless. Es lo que recomienda el propio `sim/state.ts`. La reconexión es gratis. | Estado serializado por turno (más datos, acoplado a la estructura interna del sim, no admite algunos mods). |
| D3 | Además se guarda el **protocolo ya emitido** (`arena.battle_updates`) y su hash. | Lo que los jugadores vieron no cambia nunca; servir el log no carga el simulador; y permite **detectar deriva** si un deploy cambia el motor a mitad de batalla. | Regenerar el log en cada lectura. |
| D4 | **Python es dueño de la liga; Node solo simula.** Retos, elección de 6, reglas mensuales, bans, rotaciones e ingesta viven en FastAPI (`rules.py` sigue siendo la única definición). | Elimina la duplicación de reglas en dos lenguajes, que es lo que hoy obliga a `canonicalSet`. | Reimplementar las reglas en TypeScript. |
| D5 | El formato de batalla es **un dato**: una cadena de reglas custom (`gen9nationaldexag@@@…`) construida por `rules.py` y congelada en la fila de la batalla. | Sin `formats.ts`. Un torneo con reglas propias es una fila, no un deploy. | Formatos en código. |
| D6 | **Una sola función Node** (`api/motor.ts`) con router interno; la lógica vive fuera de `api/`. | Recomendación vigente de Vercel: menos funciones, Fluid compute reutiliza instancias. | Un archivo por endpoint. |
| D7 | Concurrencia con **`SELECT … FOR UPDATE` sobre la fila de la batalla** en una transacción corta. | Dos elecciones simultáneas se serializan; funciona con el pooler en modo transacción. | Bloqueos en memoria (no existen en serverless) o advisory locks de sesión (incompatibles con el pooler). |
| D8 | **Realtime es solo una señal** (`{seq}`); los datos se piden por HTTP con la sesión. Canal privado, enviado **desde la base** con `realtime.send()` dentro de la misma transacción. | Nada secreto viaja por el canal; el aviso solo sale si el commit ocurre; si Realtime falla, el cliente hace polling y todo sigue funcionando. | Mandar el protocolo por el canal (obliga a RLS fino por jugador y filtra datos si se configura mal). |
| D9 | El cursor de concurrencia optimista es **`seq`** (nº de tandas emitidas). El cliente lo envía con cada elección. | El simulador no da `rqid`; `seq` ya existe y es monótono. | Inventar un id de petición paralelo. |
| D10 | Reloj: **fecha límite en la fila**; vence cuando alguien la reclama (el cliente del rival o el barrido). El barrido es **`pg_cron` + `pg_net`** en Supabase. | Vercel Hobby solo permite cron diario (±59 min). `pg_cron` baja a segundos y solo llama a Vercel cuando hay trabajo. | Proceso vivo con temporizadores. |
| D11 | Ingesta por **outbox**: al terminar, la fila queda `ingest_status='pending'` en la misma transacción; Python la convierte en `fact_*` con el parser y el ETL **existentes**. | Idempotente y reintentable; ni el parser ni las vistas cambian. | Que Node escriba `fact_*` (duplicaría el ETL). |
| D12 | Esquema nuevo **`arena`**, separado de `battle` y `tournament`. | `battle.*` es derivado y truncable; `arena.*` es la **fuente** desde la que se puede reconstruir (como hoy `logs/` de PS). | Meterlo en `battle` (un `reset` borraría las repeticiones). |
| D13 | Visor propio en React sobre `@pkmn/client` (estado), `@pkmn/view` (texto y elecciones) y los sprites que ya sirve `/api/sprites`. Carga perezosa. | MIT, verificado; el cliente de PS es AGPLv3 y está acoplado a su app. | Embeber el cliente de PS. |
| D14 | Todo detrás de **`BATS_ARENA_MODE`** = `off` \| `admins` \| `all`. PS sigue en producción hasta la fase 9. | Cada fase se une a `main` (que despliega a producción) sin exponer nada a medias. | Rama de larga vida. |
| D15 | El motor **no** corre en Supabase Edge Functions. | El simulador ocupa ~240 MB en memoria y 46 MB en disco; las Edge Functions permiten 256 MB de memoria, 2 s de CPU y 20 MB de función. Vercel Hobby da 2 GB / 1 vCPU. | Edge Functions (Deno). |

---

## 3. Arquitectura objetivo

```
Navegador (SPA React)
  ├─ /arena           lobby: retar, aceptar, elegir 6          ──HTTP──▶  FastAPI  /api/arena/*
  ├─ /batalla/:id     visor: @pkmn/client + @pkmn/view         ──HTTP──▶  Node     /api/motor/*
  └─ Realtime (canal privado, solo recibe {seq})               ◀──WS───  Supabase Realtime
                                                                              ▲ realtime.send()
FastAPI (api/index.py)            Node (api/motor.ts → motor/src)             │ (misma transacción)
  · retos y aceptación              · rejuega seed+input_log                  │
  · elección de 6 + rules.py        · aplica la acción bajo FOR UPDATE  ──────┤
  · formato de batalla (D5)         · guarda la tanda + avisa                 │
  · ingesta arena → fact_*          · vista por jugador (split)               ▼
        │  ▲                              │                         PostgreSQL (Supabase)
        │  └── POST /api/motor/validate-team (TeamValidator)          arena.*   fuente
        └────────────── psycopg2 ─────────┴──── pg ────────────────▶  battle.*  derivado
                                                                      tournament.* liga
Supabase Cron (pg_cron cada 30 s) ── arena.sweep() ── pg_net ──▶ /api/motor/sweep · /api/cron/arena-ingest
```

**Un turno, paso a paso** (`POST /api/motor/battles/:id/choose`):

1. Verificar el JWT de Supabase y resolver `username` en `tournament.player_accounts`.
2. `BEGIN` · `SET LOCAL lock_timeout`/`statement_timeout` · `SELECT … FROM arena.battles WHERE battle_id=$1 FOR UPDATE`.
3. Si `seq` del cliente ≠ `seq` de la fila → `409` (el cliente recarga). Sin tocar nada.
4. Rejugar `input_log`; comprobar que el hash del log coincide con `log_hash` (si no → abortar por deriva).
5. Aplicar la elección pendiente del rival (si la hay) y luego la nueva.
   - Inválida → `422` con el mensaje del simulador; si reemitió la petición, guardarla.
   - Válida y falta el rival → guardar `pN_choice`; `seq` no cambia.
   - Válida y el turno se resuelve → `input_log := battle.inputLog`, tanda nueva en
     `arena.battle_updates`, `seq+1`, peticiones nuevas, fecha límite nueva; si terminó,
     `status='finished'` e `ingest_status='pending'`.
6. `SELECT arena.notify('battle:<id>', 'update', '{"seq":N}')` · `COMMIT`.
7. Si terminó: `waitUntil(fetch('/api/ingest/arena/<id>'))`.

**Fronteras de esquema** (se añade una regla a las dos que ya existen):

- `tournament.*` — la liga. Nunca se trunca. No referencia a `battle`.
- `battle.*` — hechos derivados. Truncable. **No referencia a `arena`.**
- `arena.*` — fuente de las batallas nativas. No se trunca con `reset`/`clean`. Puede referenciar a
  `tournament` (temporada), **nunca** a `battle`. El vínculo con `battle.fact_battles` es por
  convención: `battle_id = 'arena-' || arena.battles.battle_id`.

---

## 4. Invariantes (cada uno tiene un test que lo protege)

| # | Invariante | Test que lo protege |
|---|---|---|
| I1 | Ninguna respuesta a un jugador contiene el `seed`, el `input_log`, el equipo, la petición, la elección pendiente ni las líneas secretas del rival. | `motor/test/core/view.leak.test.ts` |
| I2 | Aplicar las acciones de una en una desde la fila persistida da **el mismo log** que una batalla continua en memoria. | `motor/test/core/stateless.property.test.ts` |
| I3 | Las 13 batallas doradas se reproducen idénticas con la versión fijada del motor. | `motor/test/engine/replay.golden.test.ts` |
| I4 | Dos elecciones simultáneas producen exactamente una resolución de turno. | `motor/test/db/concurrency.test.ts` |
| I5 | La identidad sale **siempre** del JWT; nunca del body ni de la URL. | `motor/test/http/auth.test.ts`, `tests/test_arena_api.py` |
| I6 | Un fallo de Realtime no hace fallar un turno, y el visor funciona sin Realtime. | `tests/test_arena_schema.py`, `web/src/lib/arena/sync.test.ts` |
| I7 | Ingerir dos veces la misma batalla deja una sola fila en `fact_battles`. | `tests/test_arena_ingest.py` |
| I8 | Una batalla dorada ingerida por la vía de PS y por la vía de arena produce los **mismos hechos**. | `tests/test_arena_ingest_parity.py` |
| I9 | `arena` no tiene FKs hacia `battle`, ni `battle` hacia `arena`; `tournament` no referencia a ninguno de los dos. | `tests/test_arena_schema.py` |
| I10 | Las reglas de liga se definen solo en `bats_core/rules.py`. El motor no conoce tipo del mes, colores ni rotaciones. | revisión + `motor/test/no-league-rules.test.ts` (grep de términos prohibidos) |
| I11 | `pandas` sigue fuera del árbol de imports de la API; `@pkmn/*` sigue fuera del chunk principal del frontend. | test existente + `web/scripts/check-bundle.mjs` |
| I12 | Con `BATS_ARENA_MODE=off`, todas las rutas de arena y del motor (salvo `health`) responden 404. | `tests/test_arena_flags.py`, `motor/test/http/flags.test.ts` |
| I13 | Los tests **nunca** tocan la base real: la suite se niega a correr si el DSN de test es igual a `BATS_DB_DSN` o apunta a Supabase. | `motor/test/db/guard.test.ts`, `tests/arena_db.py` |
| I14 | Los votos de ban siguen anónimos: nada de arena toca `ban_votes`. | test existente |

---

## 5. Protocolo de trabajo (optimizado para agentes)

**Al empezar una sesión**

1. Leer `CLAUDE.md` (raíz del repo) y las secciones 1–8 de este documento.
2. Mirar **Estado de la ejecución** y la **Bitácora** para saber dónde quedó el trabajo.
3. `git status` y `git branch --show-current`: debes estar en la rama de la fase. Si no existe,
   créala desde `main` actualizado: `git switch main && git pull && git switch -c arena/fase-N-…`.
4. Correr la verificación de la fase **antes** de tocar nada, para partir de un estado conocido.

**Ciclo de cada tarea**

1. **Rojo.** Escribir el test que la tarea nombra. Ejecutarlo y **ver que falla por la razón
   correcta** (no por un import roto).
2. **Verde.** El mínimo código que lo hace pasar.
3. **Refactor.** Limpiar con los tests en verde.
4. **Verificar.** El comando de verificación de la fase completo, no solo el test nuevo.
5. **Commit.** Uno por tarea, en español: `feat(motor): …`, `feat(api): …`, `feat(web): …`,
   `feat(db): …`, `test(…): …`, `chore(ci): …`. **Sin líneas de atribución** (lo exige `CLAUDE.md`).
6. Marcar la tarea en este documento (mismo commit o el siguiente).

**Reglas duras**

- No escribas código de producción sin un test rojo delante. Excepción: configuración
  (`vercel.json`, CI), que se protege con tests de configuración.
- No uses la base real ni escribas archivos de `../pokemon-showdown`. Bases desechables con
  `tools/arena_testdb.sh` (fase 2). El DSN de test **nunca** es `BATS_DB_DSN`.
- No apliques migraciones a Supabase, no cambies variables de entorno de Vercel, no hagas push
  ni merge a `main`: son pasos **[HUMANO]**. Prepara el comando exacto y detente.
- No imprimas ni commitees valores de `.env`.
- No cambies las versiones fijadas de `@pkmn/*` dentro de una fase que no trate de eso.
- No amplíes el alcance: lo que no esté en la fase va a la Bitácora como propuesta.
- Si una tarea contradice al código real, **manda el código**: detente, anótalo en la Bitácora y
  propón el ajuste. No fuerces el plan.

**Cuándo parar y preguntar**

- Un test dorado (I3) deja de pasar.
- Una hipótesis marcada **[HIPÓTESIS]** resulta falsa.
- Hace falta un secreto, un permiso o una acción sobre producción.
- Tres intentos fallidos sobre el mismo problema.

**Paralelización.** Dentro de una fase, las tareas marcadas `∥` no comparten archivos y pueden
ejecutarse en paralelo (subagentes o worktrees en `.worktrees/`, que ya está en `.gitignore`).
Las demás van en orden.

**Skills útiles.** Fases con SQL: `supabase` y `supabase-postgres-best-practices`. Fases 5 y 7:
`frontend-design` o `impeccable`, respetando `docs/planes/PLAN_REDESIGN_2.0.md` y
`PLAN_PALETA.md`. Antes de usar una API de Supabase o Vercel, consultar su documentación
vigente (cambian a menudo); las referencias verificadas están en el apéndice C.

---

## 6. Ramas, despliegue y reversión

- **Una rama por fase**, creada desde `main` actualizado. Nombre fijo (tabla de estado).
- Al cerrar la fase: PR a `main` con la lista de verificación de su puerta. Merge con
  **merge commit** (`--no-ff`), no squash: conserva un commit por tarea y permite revertir la fase
  entera con `git revert -m 1 <merge>`.
- `main` despliega a producción por CI. Por eso **todo** lo de arena está detrás de
  `BATS_ARENA_MODE` (por defecto `off`) y las migraciones son solo aditivas.
- **Orden al cerrar una fase con migración** (todo [HUMANO]):
  1. Merge a `main` → CI despliega (flag en `off`: inerte).
  2. `python -m bats_core db --apply-schema --dsn "$BATS_SUPABASE_DSN_SESSION"`.
  3. Poner `BATS_ARENA_MODE=admins` en Vercel y redesplegar.
  4. Ejecutar la lista de la puerta. Si falla: `BATS_ARENA_MODE=off` (reversión inmediata, sin
     tocar código) y abrir la corrección en la misma rama.
- **Entorno de pruebas recomendado [HUMANO, fase 0]:** un segundo proyecto gratuito de Supabase
  (`bats-staging`) y las variables de entorno *Preview* de Vercel apuntando a él. Así
  `vercel deploy` (sin `--prod`) desde la rama de una fase prueba contra datos desechables. Si no
  se crea, las puertas se ejecutan en producción con `admins` y batallas marcadas `is_test`.
- **Batallas de prueba:** mientras el modo sea `admins`, toda batalla nace con `is_test=true` y
  **no se ingiere** (`ingest_status='skipped'`). Así probar en producción no ensucia las estadísticas.

---

## 7. Estrategia de pruebas

```
            E2E (1–2)            dos jugadores terminan una batalla: script HTTP + 1 spec de navegador
        Integración (decenas)    handler ↔ Postgres desechable; FastAPI ↔ Postgres; contrato Python ↔ Node
     Unidad (cientos, rápidas)   núcleo puro del motor, reglas, view-models y componentes del visor
```

| Capa | Herramienta | Dónde | Notas |
|---|---|---|---|
| Núcleo del motor | vitest | `motor/test/{engine,core}` | Sin IO. `now` y `seed` inyectados. Incluye las doradas (I3) y la prueba de propiedad (I2). |
| Motor ↔ DB | vitest + `pg` | `motor/test/db` | Se saltan sin `BATS_TEST_DSN`. Guardia I13. |
| Motor HTTP | vitest | `motor/test/http` | Llaman al `fetch` del handler con `Request` reales. JWT firmados con una clave ES256 generada en el test y un JWKS inyectado. |
| Liga e ingesta | pytest | `tests/test_arena_*.py` | Mismo patrón que `tests/test_atomicity.py`: `skipUnless(BATS_TEST_DSN)`, `dependency_overrides[auth.require_player]`. |
| Contrato Python ↔ Node | archivos JSON commiteados | `tests/fixtures/arena/` | Cada lado tiene un test contra **el mismo archivo** (formatos, sets de equipo, vistas, log de arena). |
| Visor | vitest + Testing Library | `web/src/lib/arena`, `web/src/components/arena` | Alimentado con flujos reales por jugador generados desde las doradas. Timers falsos para el reproductor y el polling. |
| Configuración | pytest | `tests/test_vercel_config.py` | Rewrites, exclusiones del bundle de Python, región. |
| E2E | script + Playwright | `motor/scripts/partida-http.ts`, `web/e2e/` | Contra servidores locales y base desechable. |

**Fixtures doradas.** `tools/arena_fixtures.mjs` lee los `.log.json` reales (ruta por
`BATS_LOGS_DIR`), elimina chat y entradas/salidas (`|c|`, `|c:|`, `|j|`, `|l|`), reescribe el
`formatid` del `>start` al formato de arena y escribe `tests/fixtures/arena/golden/<id>.json`. De
cada dorada deriva además: las tandas crudas tal como las guardaría el motor, el flujo por canal
(p1, p2, espectador) y las peticiones de cada lado. Se commitean (≈ 300 KB). Un test verifica que
regenerarlas no produce diferencias.

**Subir de versión el motor** es una tarea propia: cambiar el pin, correr las doradas. Si alguna
difiere es un cambio de mecánica upstream: se revisa a mano, se regenera a conciencia y se anota
en la Bitácora. Nunca con batallas en curso.

**CI.** Se añaden dos jobs: `motor` (tsc + vitest sin DB) e `integracion` (servicio `postgres` de
GitHub Actions, `BATS_TEST_DSN` → pytest de arena + `motor/test/db`). El job `deploy` pasa a
depender de ambos.

---

## 8. Estructura de archivos

```
package.json  package-lock.json  tsconfig.json   NUEVOS en la raíz (hoy ignorados en .gitignore)
api/
  index.py                    (existe) función Python
  motor.ts                    NUEVO  entrypoint Node: solo reexporta motor/src/http/handler
motor/
  src/
    engine/sim.ts             único import de @pkmn/sim (+ ENGINE_VERSION)
    engine/replay.ts          rejugar input_log → Battle + líneas + peticiones
    engine/format.ts          validar la cadena de formato; TeamValidator
    core/types.ts             BattleRecord, Action, Transition, Role, BattleView
    core/start.ts  apply.ts  view.ts  timer.ts  hash.ts
    db/pool.ts  repo.ts       pg + FOR UPDATE; única capa que habla SQL
    http/handler.ts  router.ts  auth.ts  errors.ts  flags.ts
    ai/                       (fase 8)
  test/                       espejo de src/
  scripts/                    partida.ts (CLI), partida-http.ts (E2E), dev-server.ts
bats_core/
  arena/                      NUEVO  flags.py, formats.py, teams.py, challenges.py, ingest.py
  api/routes/arena.py         NUEVO  /api/arena/*  y  /api/ingest/arena/*
  db/migrations/v14.sql       esquema arena           (fase 2)
  db/migrations/v15.sql       cron y barrido          (fase 6)
tests/
  test_arena_*.py   arena_db.py   fixtures/arena/{golden,contract}/
tools/
  arena_fixtures.mjs   arena_testdb.sh
web/src/
  lib/arena/                  api.ts, types.ts, tracker.ts, choices.ts, sync.ts, player.ts, clock.ts
  components/arena/           visor
  pages/ArenaPage.tsx  BatallaPage.tsx
web/e2e/                      Playwright (fase 5)
```

---

## 9. Contratos

### 9.1 Esquema `arena` (migración `v14.sql`, fase 2)

```sql
CREATE SCHEMA IF NOT EXISTS arena;

CREATE TABLE IF NOT EXISTS arena.challenges (
  challenge_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id    int  NOT NULL REFERENCES tournament.seasons(season_id),
  kind         text NOT NULL CHECK (kind IN ('league', 'sparring')),
  challenger   text NOT NULL,                    -- username en minúsculas
  challenged   text NOT NULL,
  is_test      boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  resolved_at  timestamptz,
  CHECK (challenger <> challenged)
);
-- Un solo reto pendiente por pareja, sin importar quién retó.
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenges_pair_pending
  ON arena.challenges (LEAST(challenger, challenged), GREATEST(challenger, challenged))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_challenges_challenged_pending
  ON arena.challenges (challenged) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_challenges_season ON arena.challenges (season_id);

CREATE TABLE IF NOT EXISTS arena.battles (
  battle_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenge_id   bigint REFERENCES arena.challenges(challenge_id),
  season_id      int  NOT NULL REFERENCES tournament.seasons(season_id),
  kind           text NOT NULL CHECK (kind IN ('league', 'sparring')),
  is_test        boolean NOT NULL DEFAULT false,
  format_id      text NOT NULL,                  -- 'gen9pinchesgueysleague' | 'gen9pglsparring' (para el ETL)
  rules          text NOT NULL,                  -- formato del motor, congelado (D5)
  engine_version text,                           -- lo fija el motor al iniciar
  status         text NOT NULL DEFAULT 'team_select'
                 CHECK (status IN ('team_select', 'ready', 'active', 'finished', 'aborted')),
  p1             text NOT NULL,                  -- username en minúsculas; p1 = retador
  p2             text NOT NULL,
  p1_team        jsonb,                          -- PokemonSet[]; NULL hasta que elige. SECRETO
  p2_team        jsonb,
  seed           text,                           -- SECRETO
  input_log      text[] NOT NULL DEFAULT '{}',   -- fuente de verdad. SECRETO
  p1_choice      text,                           -- elección pendiente (aún no en input_log). SECRETO
  p2_choice      text,
  p1_request     jsonb,                          -- petición vigente de cada lado. PRIVADA
  p2_request     jsonb,
  seq            int  NOT NULL DEFAULT 0,        -- nº de tandas emitidas = cursor de los clientes
  log_lines      int  NOT NULL DEFAULT 0,
  log_hash       text,                           -- sha256 del log emitido, normalizado
  turn           int  NOT NULL DEFAULT 0,
  turn_seconds   int,                            -- NULL = sin reloj
  deadline_at    timestamptz,
  winner         text,                           -- username; NULL en empate o sin terminar
  end_type       text CHECK (end_type IN ('normal', 'forfeit', 'tie')),
  end_reason     text,                           -- 'forfeit' | 'timeout' | 'engine_drift' | 'expired' | 'admin'
  ingest_status  text NOT NULL DEFAULT 'none'
                 CHECK (ingest_status IN ('none', 'pending', 'loaded', 'skipped', 'ignored', 'error')),
  ingest_attempts int NOT NULL DEFAULT 0,
  ingest_error   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (p1 <> p2)
);
CREATE INDEX IF NOT EXISTS ix_battles_p1_live ON arena.battles (p1) WHERE status IN ('team_select', 'ready', 'active');
CREATE INDEX IF NOT EXISTS ix_battles_p2_live ON arena.battles (p2) WHERE status IN ('team_select', 'ready', 'active');
CREATE INDEX IF NOT EXISTS ix_battles_deadline ON arena.battles (deadline_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_battles_ingest_pending ON arena.battles (finished_at) WHERE ingest_status = 'pending';
CREATE INDEX IF NOT EXISTS ix_battles_season ON arena.battles (season_id);
CREATE INDEX IF NOT EXISTS ix_battles_challenge ON arena.battles (challenge_id);

-- Protocolo emitido, solo-añadir. Una fila por tanda (inicio, cada resolución, final).
CREATE TABLE IF NOT EXISTS arena.battle_updates (
  battle_id  bigint NOT NULL REFERENCES arena.battles(battle_id) ON DELETE CASCADE,
  seq        int    NOT NULL,
  lines      text[] NOT NULL,                    -- crudo del simulador, con marcadores |split|
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, seq)
);
```

Además, en la misma migración (todo **condicional**, porque las bases desechables locales son
Postgres puro, sin `realtime`, `anon` ni `authenticated`):

- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` en las tres tablas, sin políticas (defensa en
  profundidad: la API entra como dueño y no se ve afectada; si algún día se activa la Data API,
  nadie más lee). `REVOKE ALL … FROM anon, authenticated` dentro de un `DO` que comprueba que los
  roles existen.
- `arena.notify(p_topic text, p_event text, p_payload jsonb)`: si
  `to_regprocedure('realtime.send(jsonb,text,text,boolean)')` no es `NULL`, ejecuta
  `realtime.send(p_payload, p_event, p_topic, true)` con `EXECUTE`; captura **cualquier** excepción
  y la degrada a `WARNING`. `SET search_path = ''`. Sin `SECURITY DEFINER`.
- Política de lectura del canal, solo si existe `realtime.messages`:
  ```sql
  CREATE POLICY arena_listen ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.messages.extension = 'broadcast'
         AND ((SELECT realtime.topic()) = 'arena:lobby' OR (SELECT realtime.topic()) LIKE 'battle:%'));
  ```
  No hay política de `INSERT`: ningún cliente puede publicar. **No** añadir
  `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` (ya está activo y la sentencia aborta
  la transacción). No crear objetos dentro del esquema `realtime` (está bloqueado desde 2026-07).

### 9.2 API del motor (Node, `/api/motor/*`)

Errores con la misma forma que FastAPI — `{"detail": "…", "code": "…"}` — para que
`web/src/lib/http.ts` funcione sin cambios.

| Método y ruta | Auth | Qué hace |
|---|---|---|
| `GET /api/motor/health` | pública | `{ok, engine, node, replay_ms}`. Rejuega una dorada mínima embebida. Única ruta viva con el flag en `off`. |
| `POST /api/motor/validate-team` | `BATS_MOTOR_TOKEN` | `{rules, team}` → `{errors: string[]}` (`TeamValidator`). La llama FastAPI. |
| `GET /api/motor/battles/:id?since=N` | jugador | `BattleView` para quien pregunta. Si la batalla está `ready`, **la inicia** (idempotente, bajo bloqueo). |
| `POST /api/motor/battles/:id/choose` | participante | `{seq, choice}` → `200 {seq, resolved}` · `409 stale` · `422 invalid_choice` |
| `POST /api/motor/battles/:id/undo` | participante | Retira la elección pendiente propia, si el simulador lo permite. |
| `POST /api/motor/battles/:id/forfeit` | participante | Rendirse. |
| `POST /api/motor/battles/:id/timeout` | participante | Reclamar el reloj vencido. El servidor verifica `now() > deadline_at`. |
| `POST /api/motor/sweep` | `CRON_SECRET` | Resuelve todas las fechas límite vencidas (fase 6). |

```ts
type Role = 'p1' | 'p2' | 'spectator';

interface BattleView {
  id: number;
  kind: 'league' | 'sparring';
  status: 'team_select' | 'ready' | 'active' | 'finished' | 'aborted';
  p1: string; p2: string;
  you: Role;
  seq: number;                                  // cursor: enviarlo en cada choose
  turn: number;
  updates: { seq: number; lines: string[] }[];  // solo seq > since, YA filtradas para tu rol
  request: unknown | null;                      // tu petición vigente; null para espectadores
  chosen: boolean;                              // ya elegiste y esperas al rival
  deadlineAt: string | null;
  serverNow: string;                            // para corregir el reloj del cliente
  winner: string | null;
  endType: 'normal' | 'forfeit' | 'tie' | null;
  endReason: string | null;
}
```

Filtrado por rol: `p1` → canal 1, `p2` → canal 2, `spectator` → canal 0. El canal `-1`
(omnisciente) **no se expone por HTTP**; solo lo usa la ingesta, que lee la base directamente.

### 9.3 API de la liga (Python, `/api/arena/*`)

| Método y ruta | Auth | Qué hace |
|---|---|---|
| `GET /api/arena/config` | jugador | `{mode, enabled, turn_seconds, challenge_ttl_seconds}` |
| `GET /api/arena/lobby` | jugador | Retos recibidos y enviados, mis batallas vivas, jugadores retables, últimas terminadas. |
| `POST /api/arena/challenges` | jugador | `{opponent, kind}` → crea el reto. |
| `POST /api/arena/challenges/{id}/accept` | retado | Acepta y crea la batalla (`team_select`) en la misma transacción. |
| `POST /api/arena/challenges/{id}/decline` · `/cancel` | retado · retador | |
| `GET /api/arena/battles/{id}/team-options` | participante | Mi pool, mi alineación actual, rotaciones restantes y checklist de reglas. |
| `POST /api/arena/battles/{id}/team` | participante | `{pokemon_ids: [6]}` → valida y congela mi equipo. Con los dos equipos: `status='ready'` + aviso. |
| `GET /api/arena/battles` | jugador | Historial paginado (para repeticiones). |
| `POST /api/ingest/arena/{id}` | `BATS_INGEST_TOKEN` | Ingiere una batalla terminada. Idempotente. |
| `GET /api/cron/arena-ingest` | `CRON_SECRET` | Ingiere todas las pendientes (respaldo). |

### 9.4 Realtime

- Temas: `battle:<id>` (evento `update`, payload `{seq}`) y `arena:lobby` (evento `changed`,
  payload `{}`). Nada más viaja por Realtime.
- Cliente: `supabase.channel('battle:42', { config: { private: true } })`, tras
  `await supabase.realtime.setAuth()`.
- Si el canal no está `SUBSCRIBED`, el cliente hace polling de `GET …?since=seq` cada 3 s
  (retroceso hasta 10 s) y siempre vuelve a pedir al recuperar foco o conexión.
- Limitación conocida de Supabase: `realtime.send()` falla en silencio si aún no existe la
  partición diaria de `realtime.messages`, que la crea la primera conexión WebSocket del día. Por
  eso `arena.notify` nunca propaga errores y el polling existe (I6).

### 9.5 Variables de entorno nuevas

| Variable | Dónde | Para qué |
|---|---|---|
| `BATS_ARENA_MODE` | Vercel (ambas funciones) y `.env` | `off` \| `admins` \| `all`. Ausente = `off`. |
| `BATS_MOTOR_TOKEN` | Vercel y `.env` | Token de servicio FastAPI → motor (`validate-team`). |
| `BATS_MOTOR_URL` | `.env` (dev) | Base del motor en local (`http://127.0.0.1:8012`). En Vercel se deriva del propio host. |
| `BATS_TZ` | Vercel y `.env` | Zona horaria para la fecha de la batalla en el ETL (ver decisión abierta A6). |

El motor reutiliza `BATS_DB_DSN` (pooler `:6543` en Vercel), `BATS_SUPABASE_URL`,
`BATS_INGEST_TOKEN` y `CRON_SECRET`.

---

## 10. Fases

Cada fase lista: objetivo, rama, tareas TDD, verificación y puerta. `∥` = paralelizable.

---

### Fase 0 — Cimientos y esqueleto andante

**Objetivo.** Probar en producción lo único que aún no está validado: que una función Node con el
simulador convive con la función Python en el mismo proyecto de Vercel, y cuánto tarda en frío.
Al terminar existe `GET /api/motor/health` en producción y nada más ha cambiado.

**Rama:** `arena/fase-0-cimientos` · **Depende de:** nada.

| # | Tarea | Rojo (test primero) | Verde |
|---|---|---|---|
| F0.1 | Andamiaje Node en la raíz | `motor/test/engine/version.test.ts`: `ENGINE_VERSION` coincide con la versión instalada de `@pkmn/sim` y el `package.json` la fija **exacta** (sin `^` ni `~`). | Quitar `/package.json`, `/package-lock.json` de `.gitignore` (dejar `/node_modules/`). `package.json` raíz: `"private": true`, `"engines": {"node": "24.x"}`, deps `@pkmn/sim@0.11.0`, `pg`, `jose`, `@vercel/functions`; dev `typescript`, `vitest`, `tsx`, `@types/node`, `@types/pg`. `tsconfig.json` (`strict`, `resolveJsonModule`, sin *path mappings*: Vercel no los soporta). Scripts `motor:test`, `motor:typecheck`. `motor/src/engine/sim.ts` como único import del simulador. |
| F0.2 ∥ | Fixtures doradas | `motor/test/fixtures.test.ts`: cada dorada cumple el esquema (id, rules, seed, inputLog, log, winner, turns, endType, p1, p2) y no contiene líneas `\|c\|`. | `tools/arena_fixtures.mjs` (sección 7). Ejecutarlo y commitear `tests/fixtures/arena/golden/*.json`. |
| F0.3 | Rejugada dorada (I3) | `motor/test/engine/replay.golden.test.ts`: para cada dorada, `replay(inputLog)` da el mismo log normalizado, ganador y nº de turnos. | `motor/src/engine/replay.ts` (apéndice A). Normalización en `core/hash.ts`: vista omnisciente, sin `\|t:\|`. |
| F0.4 | Handler y `health` | `motor/test/http/health.test.ts`: `GET /api/motor/health` → 200 con `ok`, `engine`, `replay_ms`; ruta desconocida → 404 con `{detail, code}`. | `motor/src/http/{handler,router,errors}.ts` con firma Web (`export default { fetch }`); `api/motor.ts` solo reexporta. |
| F0.5 | Flag (I12) | `motor/test/http/flags.test.ts` y `tests/test_arena_flags.py`: con `off`, todo salvo `health` → 404; `admins` deja pasar solo a `is_admin`; valor desconocido = `off`. | `motor/src/http/flags.ts`, `bats_core/arena/flags.py`. |
| F0.6 | Configuración de Vercel | `tests/test_vercel_config.py`: el rewrite `/api/motor/(.*)` → `/api/motor` va **antes** del comodín `/api/(.*)`; `excludeFiles` de `api/index.py` incluye `motor/**` y `node_modules/**`; `regions` = `["iad1"]`. | `vercel.json`: rewrite nuevo; `functions["api/motor.ts"] = {"maxDuration": 15}`; añadir `motor/**,node_modules/**,package*.json,tsconfig.json` a `excludeFiles` de Python (**si no, el bundle de Python arrastra `node_modules`**); `"regions": ["iad1"]` (junto a Supabase us-east-1); `"fluid": true`; `installCommand`: `npm ci && cd web && npm ci`. `.vercelignore`: `motor/test/`, `web/e2e/`. |
| F0.7 ∥ | CI | — (configuración) | Job `motor` en `.github/workflows/ci.yml`: Node 24, `npm ci`, `npm run motor:typecheck`, `npm run motor:test`. `deploy` pasa a depender de él. |
| F0.8 | **[HUMANO]** Entornos | — | Crear (opcional, recomendado) el proyecto `bats-staging` en Supabase y las variables *Preview* en Vercel. Definir `BATS_ARENA_MODE=off` y `BATS_MOTOR_TOKEN` en Vercel. |

**[HIPÓTESIS] que esta fase valida** (si alguna falla, parar y anotar en la Bitácora):

1. `@vercel/node` compila TypeScript importado desde fuera de `api/` y su trazador incluye
   `@pkmn/sim` sin `includeFiles`. *Plan B:* añadir `includeFiles`. *Plan C:* empaquetar con
   esbuild a un único `api/motor.js` generado en `buildCommand`.
2. Con `installCommand` propio, las dependencias de la raíz quedan disponibles para la función.
3. El arranque en frío total queda por debajo de 3 s y en caliente `replay_ms` < 100.

**Verificación**

```bash
npm run motor:typecheck && npm run motor:test
pytest tests/test_arena_flags.py tests/test_vercel_config.py
cd web && npm run build            # el frontend no debe haber cambiado
npx vercel build                   # revisar el tamaño de cada función en la salida
```

**Puerta [HUMANO]**

- [ ] `vercel deploy` (preview) responde `GET /api/motor/health` con `ok: true`.
- [ ] Tras el merge, lo mismo en producción. Anotar en la Bitácora: frío, caliente y tamaño del bundle de cada función.
- [ ] El sitio actual funciona igual (inicio, stats, equipo, login) y `/api/health` sigue respondiendo.
- [ ] El bundle de la función Python no creció.

---

### Fase 1 — Núcleo del motor (puro)

**Objetivo.** Toda la lógica de una batalla como funciones puras, sin base ni HTTP: iniciar,
aplicar una acción, calcular la vista de cada jugador, reloj. Es la fase con más tests y la más
barata de iterar.

**Rama:** `arena/fase-1-nucleo` · **Depende de:** fase 0.

Contrato central (`motor/src/core/types.ts`):

```ts
/** Lo que se persiste de una batalla (espejo de las columnas de arena.battles que usa el motor). */
interface BattleRecord {
  rules: string; seed: string | null;
  p1: Player; p2: Player;                       // { name, team: PokemonSet[] }
  inputLog: string[];
  pending: { p1: string | null; p2: string | null };
  requests: { p1: unknown | null; p2: unknown | null };
  seq: number; logLines: number; logHash: string | null; turn: number;
  status: 'ready' | 'active' | 'finished' | 'aborted';
  turnSeconds: number | null; deadlineAt: Date | null;
  winner: string | null; endType: 'normal' | 'forfeit' | 'tie' | null; endReason: string | null;
}
type Action =
  | { type: 'choose'; side: 'p1' | 'p2'; seq: number; choice: string }
  | { type: 'undo'; side: 'p1' | 'p2' }
  | { type: 'forfeit'; side: 'p1' | 'p2' }
  | { type: 'timeout' };
type Transition =
  | { ok: true; record: BattleRecord; newLines: string[] | null }   // null = no hubo tanda nueva
  | { ok: false; code: 'stale' | 'invalid_choice' | 'not_your_turn' | 'not_active' | 'not_expired' | 'engine_drift';
      detail: string; record?: BattleRecord };                      // record: si hay que persistir algo aun fallando
```

`start(record, {seed, now})` y `apply(record, action, {now})` **no hacen IO**: reciben el reloj y
la semilla. Devuelven un registro nuevo; no mutan el que reciben.

| # | Tarea | Rojo (test primero) |
|---|---|---|
| F1.1 | `start` | Da `seq=1`, `status='active'`, una tanda con `\|teampreview`, peticiones para ambos lados, `logHash` y `deadlineAt = now + turnSeconds`. Misma semilla ⇒ mismo resultado. |
| F1.2 | `apply` · elegir | (a) Primer lado elige: `pending` guardado, `seq` igual, `newLines=null`, `inputLog` **sin cambios**. (b) Segundo lado elige: turno resuelto, `seq+1`, `pending` vacío, `inputLog` creció en 2, peticiones nuevas. (c) `seq` viejo → `stale`, registro intacto. (d) Repetir la **misma** elección pendiente → `ok` sin cambios (idempotente). |
| F1.3 | `apply` · inválidas | Movimiento inexistente, cambiar a un debilitado, elegir sin petición (`wait`) → `invalid_choice` con el texto del simulador y registro intacto. Elección no disponible que reemite petición (atrapado) → falla **y** devuelve `record` con la petición actualizada. |
| F1.4 | Casos de protocolo | Orden en team preview (`team 3,1,2,4,5,6`); teracristalizar (`move 1 terastallize`); cambio forzado tras un KO (solo un lado debe elegir y el otro tiene `wait`); U-turn a mitad de turno; el último KO termina la batalla con `winner`, `endType='normal'`, `turn` correcto. |
| F1.5 | `apply` · deshacer | Con elección pendiente → se retira; sin ella → `not_your_turn`; tras resolverse el turno → no hay nada que deshacer. |
| F1.6 | `apply` · rendirse | Gana el rival, `endType='forfeit'`, `endReason='forfeit'`, se añade `\|-message\|<nombre> forfeited.` (paridad con los logs de PS), y funciona aunque haya una elección pendiente. |
| F1.7 | `timer` y `timeout` | Antes de la fecha → `not_expired`. Vencida y falta un lado → pierde ese lado (`forfeit`, `endReason='timeout'`). Faltan los dos → empate (`tie`). `turnSeconds=null` → nunca vence. |
| F1.8 | Vista por rol (I1) | `viewFor('p2', tandas)` es igual al canal 2 de la dorada y no contiene **ninguna** línea que solo exista en el canal 1; `spectator` = canal 0; `requestFor('p2')` nunca devuelve la petición de p1; la vista serializada no contiene `seed`, `inputLog`, `pending` ni equipos. |
| F1.9 | Deriva del motor | Alterar `logHash` → `apply` devuelve `engine_drift` y un registro `aborted` con `endReason='engine_drift'`. |
| F1.10 | **Propiedad: sin estado = continuo (I2)** | 200 batallas con semillas fijas y elecciones aleatorias legales derivadas de la petición: aplicar cada acción con `apply` partiendo **solo** del registro anterior serializado a JSON y vuelto a leer da el mismo log final que una `Battle` continua en memoria. |
| F1.11 ∥ | `validateTeam` y formato | Equipo legal → `[]`; movimiento ilegal, objeto repetido (Item Clause), especie baneada con `-Especie` → errores. Cadena de formato inválida → error claro. |
| F1.12 ∥ | El motor no conoce la liga (I10) | `motor/test/no-league-rules.test.ts`: en `motor/src` no aparecen `type_of_month`, `egg`, `rotation`, `paradox`, `pseudo`. |
| F1.13 | CLI de demostración | — | 

F1.13: `npm run motor:partida -- --seed <s>` juega una batalla entre dos jugadores aleatorios
usando solo `start`/`apply`/`viewFor` e imprime lo que vería p1 (texto con `@pkmn/view`, como
dependencia de desarrollo).

**Verificación:** `npm run motor:typecheck && npm run motor:test` (objetivo: < 30 s).

**Puerta**

- [ ] Todos los tests en verde, incluidas las 13 doradas y la prueba de propiedad.
- [ ] **[HUMANO]** `npm run motor:partida` muestra una batalla legible de principio a fin.
- [ ] Ningún archivo de `motor/src/core` o `engine` importa `pg`, `fetch` ni `process.env`.

---

### Fase 2 — Persistencia y API del motor

**Objetivo.** El núcleo de la fase 1 detrás de HTTP, con Postgres, autenticación y avisos. Al
terminar, dos clientes HTTP pueden jugar una batalla completa contra una base desechable.

**Rama:** `arena/fase-2-api-motor` · **Depende de:** fase 1.

| # | Tarea | Rojo (test primero) | Verde |
|---|---|---|---|
| F2.1 | Base desechable y guardia (I13) | `motor/test/db/guard.test.ts`: `assertTestDsn` lanza si el DSN es igual a `BATS_DB_DSN`, contiene `supabase` o no contiene `test`. | `tools/arena_testdb.sh up\|down`: `createdb bats_arena_test_<pid>`, aplica el esquema con `python -m bats_core db --apply-schema --dsn …`, imprime el DSN. `tests/arena_db.py` con la misma guardia para pytest. |
| F2.2 | Migración `v14.sql` | `tests/test_arena_schema.py`: aplicar dos veces no falla; existen las 3 tablas y los índices; RLS activo; I9 (consulta a `pg_constraint`: ninguna FK entre `arena` y `battle`); `arena.notify(…)` no lanza en una base sin `realtime`; los `CHECK` rechazan estados inválidos; el índice único impide dos retos pendientes entre la misma pareja en cualquier orden. | `bats_core/db/migrations/v14.sql` (sección 9.1). |
| F2.3 | Pool | `motor/test/db/pool.test.ts`: el pool es un singleton de módulo; `max` ≤ 3. | `motor/src/db/pool.ts`: `pg.Pool` (`max: 3`, `idleTimeoutMillis` corto), registrado con `attachDatabasePool` de `@vercel/functions`. Sin sentencias preparadas con nombre (pooler en modo transacción). |
| F2.4 | Repositorio con bloqueo | `motor/test/db/repo.test.ts`: `withBattleLock` hace commit al volver y rollback si la función lanza (la tanda no queda a medias); devuelve `null` si la batalla no existe; `saveTransition` inserta la tanda, actualiza la fila y llama a `arena.notify` en la **misma** transacción. | `motor/src/db/repo.ts`. `SET LOCAL lock_timeout = '3s'` y `statement_timeout = '8s'`. Mapear filas ↔ `BattleRecord` en un solo sitio. |
| F2.5 | Concurrencia (I4) | `motor/test/db/concurrency.test.ts`: p1 y p2 eligen a la vez por dos conexiones (`Promise.all`), 50 repeticiones: siempre una sola tanda nueva, `seq` sube exactamente 1, ninguna elección se pierde. Con el bloqueo tomado a mano por otra conexión, la petición responde `503 busy` (reintentable) en vez de colgarse. | — |
| F2.6 | Autenticación (I5) | `motor/test/http/auth.test.ts`: sin token → 401; firma inválida, expirado, `aud` o `iss` incorrectos → 401; email no dado de alta → 403; `user_id` de la cuenta distinto al `sub` → 403; válido → identidad `{username, isAdmin}`. Token de servicio: comparación en tiempo constante; variable sin definir → 503. | `motor/src/http/auth.ts` con `jose` (`createRemoteJWKSet` sobre `${BATS_SUPABASE_URL}/auth/v1/.well-known/jwks.json`, algoritmos ES256/RS256, `audience: 'authenticated'`). **Solo lee** `player_accounts`; no enlaza `user_id` (eso lo sigue haciendo FastAPI). Es espejo de `bats_core/api/auth.py`: mismas respuestas. |
| F2.7 | `GET /battles/:id` | Participante → su vista y su petición; otro jugador → `spectator` sin petición; `since=N` → solo tandas posteriores; inexistente → 404; batalla `ready` → la inicia y devuelve `active`; dos GET simultáneos sobre una `ready` → se inicia **una** vez. | Router + `start` bajo bloqueo. La semilla se genera aquí (`PRNG.generateSeed()`), nunca en el núcleo. |
| F2.8 | `choose` · `undo` · `forfeit` · `timeout` | No participante → 403; `stale` → 409; `invalid_choice` → 422 con el mensaje; turno resuelto → 200 `{seq, resolved: true}` y fila + tanda persistidas; `timeout` antes de tiempo → 409. Cuerpo: `choice` debe cumplir `^[a-z0-9 ,\-]{1,80}$`; JSON inválido o > 2 KB → 400. | — |
| F2.9 | Fin de batalla | Al terminar: `status='finished'`, `finished_at`, `ingest_status='pending'` (o `'skipped'` si `is_test`), y se dispara el aviso de ingesta con `waitUntil` (en el test, un `fetch` falso). | — |
| F2.10 | `validate-team` | Sin token de servicio → 401; equipo legal → `{errors: []}`. | — |
| F2.11 | Servidor local y E2E por HTTP | `motor/scripts/partida-http.ts` (se usa como test en el job `integracion`): crea una batalla `ready` por SQL en la base de test, firma dos JWT locales, y dos "jugadores" aleatorios la juegan hasta el final **solo por HTTP**; verifica que ninguno vio datos del otro. | `motor/scripts/dev-server.ts` (`node:http` → mismo `fetch`, puerto 8012, carga `.env`). Proxy en `web/vite.config.ts`: `'/api/motor'` → `BATS_MOTOR_URL`, **antes** de `'/api'`. |
| F2.12 ∥ | CI con Postgres | — | Job `integracion`: servicio `postgres:17`, crea la base, `BATS_TEST_DSN`, corre `pytest tests/test_arena_*.py` y `npm run motor:test:db`. |

**Verificación**

```bash
eval "$(tools/arena_testdb.sh up)"        # exporta BATS_TEST_DSN
npm run motor:typecheck && npm run motor:test && npm run motor:test:db
pytest tests/test_arena_schema.py tests/test_arena_flags.py
npx tsx motor/scripts/partida-http.ts
tools/arena_testdb.sh down
```

**Puerta**

- [ ] Todo lo anterior en verde, incluida la prueba de concurrencia (50/50).
- [ ] **[HUMANO]** Merge → aplicar `v14` a Supabase (y a staging) → `BATS_ARENA_MODE=admins`.
- [ ] **[HUMANO]** En producción, con un token real de admin: `GET /api/motor/battles/999999` → 404 (prueba JWT + base + flag en el entorno real). Sin token → 401.
- [ ] **[HUMANO]** En Supabase: `select arena.notify('arena:lobby','changed','{}')` no da error.

---

### Fase 3 — Liga: retos, equipo de 6 y reglas

**Objetivo.** El camino completo antes de la batalla, en FastAPI: retar, aceptar, elegir los 6 con
las reglas de la temporada y dejar la batalla `ready`. Las reglas siguen en `rules.py`.

**Rama:** `arena/fase-3-liga` · **Depende de:** fase 2.

| # | Tarea | Rojo (test primero) | Verde |
|---|---|---|---|
| F3.1 | Formato de batalla (D5) | `tests/test_arena_formats.py`: `battle_format(season, bans, kind)` produce la base `gen9nationaldexag@@@Standard NatDex,-Baton Pass,Limit One Restricted,*Sub-Legendary,*Restricted Legendary,*Mythical,Item Clause = 1,-Zacian-Crowned,-Zamazenta-Crowned,-Calyrex-Ice,-Calyrex-Shadow` más un `-<Especie>` por ban activo; es determinista (bans ordenados). Escribe/compara `tests/fixtures/arena/contract/formats.json`. **Lado Node:** `motor/test/contract/formats.test.ts` valida cada cadena de ese archivo con el motor. | `bats_core/arena/formats.py`. Las condiciones mensuales, Ultra Beasts y límites de Paradox/pseudo **no** van en la cadena: las aplica `check_team` (ya tiene `is_ultra_beast`, `DEX_LIMITS`). |
| F3.2 | Sets para el motor | `tests/test_arena_teams.py`: `roster_to_sets(entries)` convierte filas de `roster_pokemon` (held_item, ability, nature, tera_type, moves, evs, ivs) en `PokemonSet[]` con nivel 100; compara con `contract/team_sets.json`. **Lado Node:** `motor/test/contract/team_sets.test.ts`: ese archivo pasa `validateTeam` y arranca una batalla. | `bats_core/arena/teams.py`. Reutilizar `_pool_entries` de `routes/teams.py` (extraerlo si hace falta, sin cambiar su comportamiento). |
| F3.3 | Retos | `tests/test_arena_challenges.py` (DB): crear; no retarse a uno mismo; el rival debe tener cuenta y roster en la temporada activa; un solo reto pendiente por pareja (409); no retar ni ser retado con una batalla viva (409); aceptar crea la batalla en la misma transacción (si falla la creación, el reto sigue `pending`); solo el retado acepta o rechaza; solo el retador cancela; vencido → no se puede aceptar; `is_test=true` siempre que el modo sea `admins`. | `bats_core/arena/challenges.py`, rutas en `bats_core/api/routes/arena.py`, registrarlas en `api/main.py`. Cada mutación llama a `arena.notify('arena:lobby', 'changed', '{}')`. |
| F3.4 | Opciones de equipo | `GET …/team-options` devuelve el pool propio, la alineación actual (`roster_lineup`), rotaciones usadas y restantes, y el checklist de `rule_checklist(…, lineup=True)`. Un no participante → 403. | — |
| F3.5 | Elegir los 6 | `POST …/team`: exactamente 6, todos del pool propio; `check_team(lineup=True, type_of_month=…)` en `league` (sin tipo del mes en `sparring`); ninguno baneado; legalidad con el motor (`validate-team`); política de rotación (decisión abierta A1). Motor caído → 503 y nada guardado. Segundo equipo → `status='ready'` + aviso `battle:<id>`. Reenviar el mismo equipo → idempotente; cambiarlo antes de `ready` → permitido; después → 409. El equipo del rival **nunca** aparece en ninguna respuesta. | Cliente HTTP con `urllib` (sin dependencias nuevas), timeout 5 s, `Authorization: Bearer $BATS_MOTOR_TOKEN`. La llamada al motor va **fuera** de la transacción de escritura (transacciones cortas). |
| F3.6 | Lobby y config | `GET /lobby`: retos entrantes y salientes, batallas vivas, rivales retables (con roster), últimas 10 terminadas. Flag `off` → 404. | — |
| F3.7 ∥ | Informe de paridad del dex | — | `tools/arena_dex_diff.mjs`: compara `web/public/dex/` (generado del fork) con `@pkmn/sim` y lista especies, movimientos y learnsets que difieren. Solo informa; el resultado va a la Bitácora y alimenta la fase 9. |
| F3.8 | Flujo completo por HTTP | Ampliar `partida-http.ts`: reto → aceptar → dos equipos → batalla hasta el final, contra FastAPI (:8011) y el motor (:8012) locales. | — |

**Verificación**

```bash
eval "$(tools/arena_testdb.sh up)"
pytest tests/test_arena_*.py tests/test_rules.py tests/test_teamset.py
npm run motor:test && npm run motor:test:db
# con `python -m bats_core api` y `npm run motor:dev` apuntando a la base de test:
npx tsx motor/scripts/partida-http.ts --flujo-completo
```

**Puerta**

- [ ] Todo en verde; los archivos de contrato pasan en **ambos** lados.
- [ ] **[HUMANO]** En staging (o producción con `admins`): el flujo completo por HTTP termina una batalla `is_test`.
- [ ] **[HUMANO]** Revisar el informe de F3.7 y decidir si alguna diferencia bloquea.

---

### Fase 4 — Ingesta: de la arena a las estadísticas

**Objetivo.** Una batalla terminada en arena aparece en `fact_*` y en las vistas, usando el
parser y el ETL existentes, y da los mismos números que si se hubiera jugado en Showdown.

**Rama:** `arena/fase-4-ingesta` · **Depende de:** fase 3.

| # | Tarea | Rojo (test primero) | Verde |
|---|---|---|---|
| F4.1 | Arena → forma de log de PS | `tests/test_arena_ingest_parity.py` **(I8)**: para cada dorada, `parse_battle_dict(battle_to_ps_log(fila, tandas))` es igual, campo por campo (`pokemon_stats`, `winner`, `turns`, `end_type`, equipos), a `parse_battle_dict(log_original)`. | `bats_core/arena/ingest.py::battle_to_ps_log`: resuelve los `\|split\|` a la vista omnisciente (toma la línea secreta, descarta la pública) y arma `{p1, p2, winner, turns, p1team, p2team, log, endType, format}`. Las tandas de prueba salen del generador de fixtures. |
| F4.2 | Ingerir una batalla | `tests/test_arena_ingest.py` (DB): `ingest_battle(db, id)` → `loaded`, fila en `fact_battles` con `battle_id='arena-<id>'`, `format` correcto y temporada resuelta; segunda vez → `skipped` y **una** sola fila (I7); `is_test` → `skipped` sin tocar `fact_*`; < 3 turnos → `ignored`; batalla no terminada → no hace nada; error de DB → `ingest_status='error'`, `ingest_attempts+1`, mensaje guardado. Dos ingestas simultáneas no duplican (`FOR UPDATE SKIP LOCKED`). | Reutilizar `load_pushed`. Fecha = `finished_at` en `BATS_TZ`. |
| F4.3 | Endpoints | `POST /api/ingest/arena/{id}` exige `BATS_INGEST_TOKEN`; `GET /api/cron/arena-ingest` exige `CRON_SECRET` e ingiere todas las `pending`. | Rutas en `routes/arena.py`. Tras cargar, refrescar las vistas con la misma función que usa `POST /api/ingest/refresh-views`, protegida con `pg_try_advisory_xact_lock` para no solapar refrescos. |
| F4.4 | Respaldo diario | `tests/test_vercel_config.py`: existe el cron de arena. | Añadir `/api/cron/arena-ingest` a `crons` de `vercel.json` (diario; el barrido fino llega en la fase 6). |
| F4.5 | Reingesta por CLI | `python -m bats_core arena --reingest --id N` y `--all` reconstruyen los hechos desde `arena.*`; es idempotente. | Subcomando en `bats_core/cli.py`. Documentarlo en `CLAUDE.md`. |
| F4.6 | Extremo a extremo | `partida-http.ts --flujo-completo --ingesta`: tras la batalla, `GET /api/stats/…` de la base de test incluye la batalla. | — |

**Verificación:** como la fase 3, más `pytest tests/test_ingest.py tests/test_stats_views.py`
(no deben romperse).

**Puerta**

- [ ] Paridad I8 en verde para las 13 doradas.
- [ ] **[HUMANO]** En staging: una batalla no-test jugada por script aparece en las estadísticas tras la ingesta. En producción solo se verifica que una batalla `is_test` queda `skipped`.
- [ ] `clean` y `reset` siguen sin tocar `arena.*` (añadir el caso a sus tests).

---

### Fase 5 — Visor mínimo jugable

**Objetivo.** Dos personas juegan una batalla completa desde el navegador. Prioridad: correcto y
claro, no bonito. Texto primero, sin animaciones.

**Rama:** `arena/fase-5-visor-minimo` · **Depende de:** fase 4. Antes de diseñar, cargar la skill
`frontend-design` y leer `docs/planes/PLAN_REDESIGN_2.0.md`.

Dependencias nuevas de `web/` (versiones exactas): `@pkmn/client@0.7.4`, `@pkmn/view@0.7.4`,
`@pkmn/protocol@0.7.4`, `@pkmn/data`, `@pkmn/dex@0.11.0`. Todas se importan **solo** desde
`lib/arena/` y cargan en el chunk perezoso de la página de batalla.

| # | Tarea | Rojo (test primero) |
|---|---|---|
| F5.1 | `lib/arena/api.ts` y tipos | Los tipos aceptan `tests/fixtures/arena/contract/views/*.json` (generadas por el motor). Cada función llama a la ruta correcta con `auth: true`. |
| F5.2 | `tracker.ts` | Alimentado con el flujo de p1 de una dorada: al final, HP, estados y KO de ambos equipos coinciden con lo esperado; el texto del log se genera **antes** de actualizar el estado (requisito de `@pkmn/view`); alimentar dos veces la misma tanda no la duplica (idempotente por `seq`). Expone una instantánea inmutable para `useSyncExternalStore`. |
| F5.3 | `choices.ts` | Función pura `optionsFromRequest(request)` → `{kind: 'move' \| 'switch' \| 'team' \| 'wait', …}` y `toChoice(selección)`. Casos desde peticiones reales: turno normal, movimiento deshabilitado, sin PP (Struggle), atrapado, cambio forzado, tera disponible o gastada, team preview, `wait`. |
| F5.4 | `sync.ts` (I6) | Con un canal falso y timers falsos: una señal `{seq}` mayor dispara un `GET since`; señales viejas se ignoran; canal caído → polling cada 3 s con retroceso; al volver el foco se vuelve a pedir; un 409 al elegir recarga y no pierde la selección del usuario; al desmontar se cancela todo. |
| F5.5 | `ArenaPage` (lobby) | Lista retos y batallas; retar a un jugador; aceptar, rechazar y cancelar; estados vacíos y de error; se actualiza con la señal `arena:lobby`. Oculta (y la ruta redirige) si `config.enabled` es falso. |
| F5.6 | Elegir los 6 | Reutiliza `components/team/*` (`RulesBar`, `RuleErrors`, `SlotBoard`): marcar 6 del pool, checklist en vivo, aviso de rotación, enviar; "esperando al rival" tras enviar. |
| F5.7 | `BatallaPage` mínima | Cabecera (jugadores, turno), estado de ambos equipos en texto, log formateado, panel de acción según `choices.ts` (movimientos con tipo y PP, tera, cambios, orden de team preview), "esperando al rival" con deshacer, banner de resultado, rendirse con confirmación (`HoldButton` existente). Errores 422 del motor se muestran junto al panel. |
| F5.8 | Rutas y navegación | `/arena` y `/batalla/:id` en `routes.ts` (páginas perezosas) y entrada en la navegación solo si está habilitado. |
| F5.9 | Presupuesto de bundle (I11) | `web/scripts/check-bundle.mjs` (corre en CI tras `npm run build`): el chunk de entrada no contiene `@pkmn`; el chunk de batalla existe y pesa menos de un tope que se fija al medirlo (anotar en la Bitácora). |
| F5.10 | E2E de navegador | `web/e2e/batalla.spec.ts` (Playwright): dos contextos, de reto a resultado, contra servidores locales y base de test. La sesión se inyecta con un mecanismo **solo de desarrollo**, siguiendo el patrón `DEV_MOCK` de `SessionProvider.tsx` (protegido por `import.meta.env.DEV`). Un solo spec; no es una suite. |

**Verificación**

```bash
cd web && npx vitest run && npm run lint && npm run build && node scripts/check-bundle.mjs
npx playwright test          # con FastAPI, motor y Vite locales sobre la base de test
```

**Puerta [HUMANO]** (producción, `admins`, batallas `is_test`)

- [ ] Dos admins juegan una batalla completa, uno en escritorio y otro en móvil.
- [ ] Recargar la página a mitad de turno recupera el estado exacto.
- [ ] La misma cuenta en dos pestañas no rompe nada.
- [ ] Cambio forzado tras un KO, teracristalización y rendición funcionan.
- [ ] Con Realtime bloqueado (extensión o DevTools) se puede seguir jugando por polling.
- [ ] En las herramientas de red no aparece ningún dato del equipo ni de la petición del rival.

---

### Fase 6 — Reloj, barrido y operación

**Objetivo.** Que el sistema se cuide solo: turnos con reloj, batallas abandonadas, retos
vencidos, ingestas reintentadas y una página de administración. Al cerrar esta fase el modo puede
pasar a `all`.

**Rama:** `arena/fase-6-operacion` · **Depende de:** fase 5.

| # | Tarea | Rojo (test primero) | Verde |
|---|---|---|---|
| F6.1 | `POST /api/motor/sweep` | Sin `CRON_SECRET` → 401; resuelve todas las batallas `active` vencidas (más 10 s de gracia) y aborta las `team_select`/`ready` con más de 10 min; cada una bajo su propio bloqueo; una que falle no detiene las demás; limita el lote (p. ej. 25). | — |
| F6.2 | Migración `v15.sql` | `tests/test_arena_schema.py`: en una base sin `pg_cron`/`pg_net` la migración se aplica sin error y no programa nada; `arena.sweep()` existe y, sin trabajo pendiente, **no** hace ninguna llamada HTTP; vence retos (`status='expired'`) por SQL. | `arena.sweep()`: (1) vence retos; (2) si hay batallas vencidas → `net.http_post` a `/api/motor/sweep`; (3) si hay ingestas `pending` de más de 60 s → `net.http_post` a `/api/cron/arena-ingest`. URL base y secreto leídos de **Supabase Vault** (`vault.decrypted_secrets`), nunca del repo. Programar con `cron.schedule('arena-sweep', '30 seconds', 'select arena.sweep()')` dentro de un `DO` condicional. |
| F6.3 | Reloj en el cliente | `clock.test.ts`: cuenta atrás corregida con `serverNow`; al llegar a cero y faltar el rival, llama a `timeout` una vez (con retroceso si responde 409); aviso visual a 30 s y 10 s. | `lib/arena/clock.ts`, componente `TurnClock`. |
| F6.4 | Reintentos de ingesta | `tests/test_arena_ingest.py`: tras 5 intentos fallidos la batalla queda `error` y deja de reintentarse; el admin puede forzar la reingesta. | — |
| F6.5 | Administración | `/admin/arena`: batallas vivas, pendientes de ingesta y con error; abortar una batalla (`end_reason='admin'`), reingerir. Solo `is_admin`. | Rutas `/api/arena/admin/*` con `require_admin`. |
| F6.6 ∥ | Observabilidad | `motor/test/http/log.test.ts`: cada petición emite **una** línea JSON con `evt`, `battle_id`, `ms_total`, `ms_replay`, `ms_db`, `status`; nunca incluye el cuerpo, la semilla ni equipos. | `motor/src/http/log.ts`. |
| F6.7 ∥ | Prueba de carga | — | `motor/scripts/carga.ts`: 20 batallas simultáneas de jugadores aleatorios contra staging; reporta p50/p95 de `choose`. Objetivo: p95 < 800 ms en caliente. Anotar en la Bitácora. |
| F6.8 | **[HUMANO]** Secretos | — | Crear en Vault `arena_base_url` y `arena_cron_secret`; comprobar en `cron.job_run_details` que el job corre. |

**Puerta [HUMANO]**

- [ ] Dejar vencer un turno: el rival gana por tiempo sin que nadie haga nada (lo resuelve el barrido).
- [ ] Abandonar una batalla en elección de equipo: se aborta sola a los 10 minutos.
- [ ] Un reto sin responder vence solo.
- [ ] Con el sistema en reposo, `cron.job_run_details` muestra ejecuciones y Vercel **no** recibe llamadas.
- [ ] `BATS_ARENA_MODE=all` y una jornada real de sparring jugada en arena. PS sigue disponible como respaldo.

---

### Fase 7 — Visor completo y repeticiones

**Objetivo.** Que jugar en BATS se sienta mejor que en Showdown para esta liga: campo visual,
ritmo de turno y repeticiones enlazadas desde las estadísticas.

**Rama:** `arena/fase-7-visor-completo` · **Depende de:** fase 6. Cargar `frontend-design` o
`impeccable`; para el movimiento, `emil-design-eng`.

| # | Tarea | Rojo (test primero) |
|---|---|---|
| F7.1 | Reproductor por pasos | `player.test.ts` (timers falsos): las líneas de una tanda se revelan en pasos con pausas según el tipo de evento; "saltar" muestra el estado final al instante; una tanda nueva que llega durante la reproducción se encola; con `prefers-reduced-motion` no hay pausas. |
| F7.2 | Campo | Componentes `BattleField`, `MonPanel` (barra de HP con transición, estado, cambios de estadísticas), `FieldChips` (clima, terreno, trampas), `TeamStrip` (iconos, debilitados). Test de cada uno con instantáneas del tracker. |
| F7.3 | Sprites de espaldas | `tests/test_sprites.py`: `GET /api/sprites/{id}?back=1` sirve el sprite trasero con las mismas reglas de caché y de `still`. | 
| F7.4 | Panel de acción completo | Botones con color de tipo, PP, potencia y categoría (del snapshot del dex, `lib/dex/snapshot.ts`), motivo cuando está deshabilitado, atajos de teclado (1–4, T para tera, S para cambiar). |
| F7.5 | Móvil y accesibilidad | Layout en una columna a 360 px sin scroll horizontal; log con `aria-live="polite"`; foco visible; contraste AA. Ejecutar la skill `design:accessibility-review` y corregir lo que encuentre. |
| F7.6 | Repeticiones | `/batalla/:id` de una batalla terminada entra en modo repetición (vista de espectador): reproducir, pausar, paso, velocidad, ir al turno N. Enlaces desde `PlayerPage` y desde la lista de batallas. |
| F7.7 | Espectadores en vivo | Un jugador de la liga que no participa puede abrir una batalla activa y verla (canal 0). Lista "en vivo" en el lobby. |

**Puerta [HUMANO]:** sesión de juego con al menos cuatro jugadores de la liga y una lista corta
de fricciones; ninguna de severidad alta sin resolver.

---

### Fase 8 — Bot nativo *(opcional)*

**Objetivo.** Sparring contra el bot sin proceso externo: el bot decide dentro del motor, en la
misma petición en la que el humano elige. Sustituye al PGL-Bot basado en poke-env, que depende
del websocket de PS y no puede vivir en Vercel.

**Rama:** `arena/fase-8-bot` · **Depende de:** fase 6.

- F8.1 `motor/src/ai/policy.ts`: interfaz `choose(request, vistaDelBot) → choice`. La política
  solo recibe lo que vería un jugador (nunca el estado omnisciente). Test: en 200 batallas
  aleatorias nunca produce una elección inválida.
- F8.2 Política heurística v1 con `@smogon/calc` (MIT) para estimar daño: mejor movimiento,
  cambio defensivo, prioridad para rematar. Test: gana ≥ 90 % contra un jugador aleatorio en 200
  batallas con semillas fijas.
- F8.3 Exportar los pools curados de `bats_core/bot/sets.py` a JSON
  (`motor/data/bot-sets.json`) con un test de contrato; el aviso de deriva del tipo del mes
  (`rules_drift`) se conserva.
- F8.4 Integración: `kind='sparring'` contra el usuario `pgl-bot` (ya marcado `is_bot` en
  `dim_players`, así que el ETL la ignora como hoy). La elección del bot se calcula y se aplica
  en la misma transacción.

**Puerta [HUMANO]:** el bot juega una batalla completa en producción y no es trivial de ganar.

---

### Fase 9 — Retiro de Showdown

**Objetivo.** Eliminar el server de PS y todo el acoplamiento. **Solo después** de al menos una
temporada mensual completa jugada en arena sin incidentes graves.

**Rama:** `arena/fase-9-retiro-ps` · **Depende de:** fase 6 (y de la 8 si se quiere conservar el bot).

Cada punto es una tarea con sus tests actualizados:

1. **[HUMANO]** Último `python -m bats_core backfill` y copia de seguridad de `../pokemon-showdown/logs`.
2. El exportador del dex (`tools/export_dex.js`) pasa a leer de `@pkmn/sim`: una sola fuente para
   teambuilder y motor. Regenerar el snapshot, `check_dex_export.js`, `dex --import`.
3. La validación del roster al guardar usa `validate-team` del motor (síncrona) en lugar del
   veredicto asíncrono del plugin; `validated_commit` pasa a guardar la versión del motor.
4. Borrar lo que solo servía a PS: `GET /api/teams/rosters`, `POST /api/ingest/roster-validation`,
   la exportación de `active_*.json`, `bats_core/validate_team.js`, `tools/roster_parity.js`,
   `canonical_set` y sus fixtures, las rutas de PS en `paths.py`, y el PGL-Bot de poke-env si la
   fase 8 está hecha.
5. `POST /api/ingest/battle` y `backfill`: conservarlos solo si se quiere poder reingerir el
   histórico de PS; si no, borrarlos junto con sus tests.
6. Quitar `BATS_ARENA_MODE` (la arena deja de ser opcional).
7. Documentación: ambos `CLAUDE.md`, `BATS_DOCS.md`, `MIGRACION_VERCEL_SUPABASE.md`.
8. **[HUMANO]** Archivar el fork `pokemon-showdown`.

**Puerta [HUMANO]:** una semana sin PS encendido y sin incidencias.

---

## 11. Riesgos y mitigaciones

| Riesgo | Señal | Mitigación |
|---|---|---|
| Vercel no empaqueta bien la función Node | Falla la fase 0 | Planes B y C de la fase 0. Se sabe el primer día, no en la fase 5. |
| Un deploy cambia el motor con batallas en curso | `engine_drift` | Hash del log (D3) → la batalla se aborta limpia en vez de corromperse. Regla operativa: subir el motor sin batallas vivas. |
| El dex del teambuilder (fork) y el del motor (`@pkmn/sim`) difieren | Equipo que el teambuilder acepta y el motor rechaza | El motor es el juez al elegir los 6 (F3.5); informe F3.7; unificación en la fase 9. |
| Arranque en frío lento | `health` > 3 s | Fluid compute y caché de bytecode de Vercel; una sola función; medir en fase 0. Si molesta: precalentar con el propio barrido. |
| Realtime no entrega | Turnos que "no llegan" | Solo es una señal; polling y recarga al recuperar foco (I6). |
| Fuga de información oculta | — | Un único punto de filtrado (`viewFor`), test I1, el canal omnisciente no sale por HTTP, y revisión manual en la puerta de la fase 5. |
| Crecimiento de `arena.battle_updates` | ~25 KB por batalla | 10 000 batallas ≈ 250 MB. Vigilar en `/admin/arena`; si hace falta, compactar las tandas de batallas viejas en una fila. |
| Límites del plan gratuito | 200 conexiones Realtime, cron diario en Vercel | Una conexión por pestaña, canal por batalla; el cron fino vive en Supabase. |
| El alcance del visor se dispara | Fase 7 sin fin | La fase 5 ya es jugable; la 7 se corta por lista de fricciones, no por ideas. |
| Dependencia de `@pkmn/*` (terceros) | Paquete abandonado | Punto único de importación (D1); el paquete oficial `pokemon-showdown` expone la misma API. |

---

## 12. Decisiones abiertas (las toma el dueño de la liga)

| # | Pregunta | Valor por defecto del plan |
|---|---|---|
| A1 | Si elegir los 6 implica una rotación y no quedan rotaciones: ¿bloquear o solo avisar? Hoy PS no puede impedirlo y el ETL lo registra después como infracción. | `league`: bloquear. `sparring`: libre. |
| A2 | Segundos por decisión y qué pasa al vencer. | 150 s; quien no eligió pierde; si ninguno eligió, empate. |
| A3 | ¿Crear el proyecto `bats-staging` en Supabase? | Sí (recomendado). |
| A4 | ¿Las fixtures doradas (batallas reales, con usernames y apodos de la liga) pueden ir al repo? | Sí, sin chat. |
| A5 | ¿El bot (fase 8) es necesario antes de retirar PS? | No bloquea las fases 0–7. |
| A6 | Zona horaria para la fecha de la batalla. | `BATS_TZ`; definir el valor real. |
| A7 | ¿Reglas extra por temporada editables desde `/admin/leaguesettings` (cadena de reglas custom)? | Fuera de alcance inicial; el diseño (D5) ya lo permite. |

---

## 13. Bitácora

> Añadir aquí, con fecha, cada desviación del plan, medición o decisión tomada durante la
> ejecución. Formato: `AAAA-MM-DD · Fase N · qué pasó · qué se decidió`.

- 2026-11-12 · Plan · Mediciones previas (sección 1) hechas en local sobre 13 batallas reales.
  El checkout `pokemon-showdown-client` que menciona el `CLAUDE.md` de la carpeta padre ya no
  existe en disco.

---

## Apéndice A — Rejugada verificada

Forma mínima que reprodujo las 13 batallas. El archivo real (`motor/src/engine/replay.ts`) añade
tipos y la captura de mensajes.

```ts
import { Battle } from './sim';

export function replay(inputLog: string[], onSend: (type: string, data: string) => void) {
  const start = JSON.parse(inputLog[0].slice('>start '.length));
  const battle = new Battle({
    ...start,
    send: (t: string, d: string | string[]) => onSend(t, Array.isArray(d) ? d.join('\n') : d),
  });
  for (const line of inputLog.slice(1)) {
    const sp = line.indexOf(' ');
    const type = sp < 0 ? line.slice(1) : line.slice(1, sp);
    const msg = sp < 0 ? '' : line.slice(sp + 1);
    if (type === 'player') {
      const i = msg.indexOf(' ');
      battle.setPlayer(msg.slice(0, i) as 'p1' | 'p2', JSON.parse(msg.slice(i + 1)));
    } else if (type === 'p1' || type === 'p2') {
      if (msg === 'undo') battle.undoChoice(type); else battle.choose(type, msg);
    } else if (type === 'forcelose') battle.lose(msg as 'p1' | 'p2');
    else if (type === 'forcewin') battle.win(msg as 'p1' | 'p2');
    else if (type === 'forcetie') battle.win(null);
    battle.sendUpdates();              // el simulador no lo hace solo
  }
  return battle;
}
```

- `onSend('update', …)` trae las líneas nuevas (con `|split|`); `onSend('sideupdate', 'p1\n|request|{…}')`
  la petición de un lado; `'p1\n|error|…'` el rechazo de una elección.
- Vista de un jugador: `extractChannelMessages(lineas.join('\n'), [1])[1]`.
- Formato de liga verificado:
  `gen9nationaldexag@@@Standard NatDex,-Baton Pass,Limit One Restricted,*Sub-Legendary,*Restricted Legendary,*Mythical,Item Clause = 1`
  (pasarlo por `Dex.formats.validate()` antes de usarlo). `gen9nationaldex` no sirve de base:
  trae `Terastal Clause` y rechaza `Standard NatDex` por duplicada.

## Apéndice B — Seguimiento en el navegador (verificado)

```ts
import { Battle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Dex } from '@pkmn/dex';
import { Protocol } from '@pkmn/protocol';
import { LogFormatter, ChoiceBuilder } from '@pkmn/view';

const battle = new Battle(new Generations(Dex));
const formatter = new LogFormatter(0 /* perspectiva: p1 */, battle);
for (const { args, kwArgs } of Protocol.parse(lineas.join('\n'))) {
  const texto = formatter.formatText(args, kwArgs);   // SIEMPRE antes de battle.add
  battle.add(args, kwArgs);
}
battle.update(Protocol.parseRequest(JSON.stringify(request)));
// battle.p1.team[i].hp / .maxhp / .fainted / .speciesForme …
```

`@pkmn/dex` pesa ~2,3 MB sin comprimir: por eso la página de batalla es un chunk perezoso (I11).
El texto del log sale en inglés, igual que hoy en Showdown.

## Apéndice C — Referencias consultadas (2026-11-12)

- Vercel · funciones Node, firma `fetch`, lógica fuera de `api/`: `vercel.com/docs/functions/runtimes/node-js`
- Vercel · límites (Hobby: 2 GB / 1 vCPU, 300 s, 250 MB de bundle): `vercel.com/docs/functions/limitations`
- Vercel · cron en Hobby (una vez al día, ±59 min): `vercel.com/docs/cron-jobs/usage-and-pricing`
- Vercel · `waitUntil`, `attachDatabasePool`: `vercel.com/docs/functions/functions-api-reference/vercel-functions-package`
- Supabase · Broadcast desde la base (`realtime.send`), partición diaria: `supabase.com/docs/guides/realtime/broadcast`
- Supabase · autorización de Realtime (políticas sobre `realtime.messages`, `realtime.topic()`): `supabase.com/docs/guides/realtime/authorization`
- Supabase · esquema `realtime` bloqueado (2026-07-14): `supabase.com/changelog/realtime-schema-locked-down-against-modification`
- Supabase · Cron con segundos y `pg_net`: `supabase.com/docs/guides/cron/quickstart`, `supabase.com/docs/guides/database/extensions/pg_net`
- Supabase · límites de Realtime (plan gratuito: 200 conexiones, 100 mensajes/s): `supabase.com/docs/guides/realtime/limits`
- `@pkmn/sim`, `@pkmn/client`, `@pkmn/view`, `@pkmn/protocol`, `@pkmn/dex`, `@pkmn/img`: `github.com/pkmn/ps` (MIT)
- Cliente de Showdown (AGPLv3): `github.com/smogon/pokemon-showdown-client`
