# Estadísticas 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/stats` y `/stats/pokemon/:species` con el lenguaje visual del Inicio y sumar empates separados, forma/racha, cara a cara, supervivencia por especie y ranking de coleccionistas.

**Architecture:** El backend gana una migración (`v15`, empates en `mv_player_stats`) y tres datos nuevos. Forma/racha, cara a cara y supervivencia salen en vivo de `battle.fact_*`, igual que `recent-battles` y `_brought`. Coleccionistas devuelve los avistamientos crudos de `tournament.pokedex_seen` y el cliente calcula el progreso con `buildCollection` + `collectionProgress`, la misma función de la Pokédex. El frontend reorganiza `StatsPage` en un bento de la liga (`MagicBento`) más tres pestañas.

**Tech Stack:** FastAPI + psycopg (PostgreSQL), pytest. React 19 + Vite + Tailwind 4, TanStack Query, recharts 3, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-estadisticas-design.md`

## Global Constraints

- Rama: `feat/estadisticas-2` desde `main`. Commits en español con estilo `feat(api): …` / `feat(web): …`, **sin** atribución a Claude (nada de `Co-Authored-By`).
- Código, docs y copy de UI en español neutro.
- **Sin carta holográfica** (`PokemonHolo`, `HoloCard`) en Estadísticas.
- Tarjetas = `components/effects/MagicBento.tsx` (borde con brillo + spotlight en hover). Números grandes con `font-card-mono … tabular`. Cabecera de tarjeta igual a `Seccion` de `HomeBento.tsx`.
- Sin colores sueltos fuera de `web/src/styles/tokens.css` (`cleanup.test.ts`). Animaciones de 300 ms o menos (`motion-guard.test.ts`). Respetar `prefers-reduced-motion`. Targets táctiles de 44 px o más. Sin scroll horizontal a 390 px.
- Endpoints públicos de `/api/stats` sin auth. Usernames normalizados con `strip().lower()`. No depender del `search_path` (siempre `battle.` / `tournament.`). `pandas` fuera del árbol de imports de la API.
- Sin FKs de `tournament.*` hacia `battle.*`. Migración nueva = `bats_core/db/migrations/v15.sql`, idempotente.
- Tests de DB solo contra base desechable: `BATS_TEST_DSN=postgresql://localhost/<db_desechable> pytest`. Nunca la base real ni Supabase.
- Cada endpoint nuevo o cambiado se documenta en `docs/BATS_DOCS.md` y `docs/BATS_API.postman_collection.json` y se agrega a `web/dev-mocks/mock-api.ts` + `web/dev-mocks/data.json`.
- "Batalla de liga" en todo lo nuevo = `NOT fb.is_bot_battle AND NOT p1.is_bot AND NOT p2.is_bot` (mismo filtro que `recent-battles`), con `?season_id=` opcional sobre `fb.season_id`.
- Resultado de un jugador en una batalla: `"W"` si `winner_id = player_id`, `"T"` si `winner_id IS NULL`, `"L"` en otro caso. La UI los muestra como **V / E / D**.
- `win_rate_pct` mantiene su definición: victorias / batallas (los empates cuentan en el denominador).

## Review Focus

1. **Temporada sin batallas** (recién creada): bento, dispersión, forma, cara a cara y tablas muestran estado vacío, sin `NaN`, `undefined%` ni excepciones. → tests en Task 6 y Task 8.
2. **Jugador con menos de 5 batallas o con una sola:** la forma muestra solo las que hay y la racha vale 1. → test en Task 2.
3. **Empates reales** (`winner = ""` en el payload): suman en E, no en D; cortan la racha; cuentan en el cara a cara. → tests en Task 1, Task 2 y Task 3.
4. **Cara a cara con el mismo jugador dos veces, mayúsculas mezcladas o un jugador inexistente:** responde 400, normaliza y responde 404, respectivamente. La UI no deja elegir el mismo jugador en ambos lados. → tests en Task 3 y Task 7.
5. **Especies con forma** (`Scizor-Mega`): la supervivencia se busca por nombre normalizado, el enlace de la dispersión abre la ficha correcta y el conteo de coleccionistas agrupa formas igual que la Pokédex. → tests en Task 4, Task 8 y Task 9.

---

### Task 1: Empates separados en la clasificación y el perfil (v15)

**Files:**
- Create: `bats_core/db/migrations/v15.sql`
- Modify: `bats_core/api/routes/stats.py` (`get_leaderboard`, ~líneas 171-195)
- Modify: `bats_core/api/routes/players.py` (consulta `record` ~línea 73, dict `record` ~línea 136)
- Modify: `web/src/lib/api.ts` (`LeaderboardEntry`, `PlayerProfile.record`)
- Modify: `web/dev-mocks/data.json` (agregar `ties` al leaderboard y al `record` de los jugadores)
- Modify: `CLAUDE.md`, `docs/BATS_DOCS.md`, `docs/MIGRACION_VERCEL_SUPABASE.md` (orden de despliegue de v15)
- Test: `tests/test_stats_views.py`

**Interfaces:**
- Produces: `battle.mv_player_stats.ties BIGINT`. `GET /api/stats/leaderboard` → cada fila agrega `ties: int` y `losses = total_battles - wins - ties`. `GET /api/players/{u}` → `record.ties: int` y `record.losses` sin empates. TS: `LeaderboardEntry.ties: number`, `PlayerProfile.record.ties: number`.

- [ ] **Step 1: Write the failing test.** En `TestStatsDesdeVistas.setUpClass`, agregar al `plan` una batalla de temporada 0, formato `gen9testa`, fecha `2031-01-09`, con `winner = ""` (empate). Ajustar el oráculo para contar empates. Nuevos tests:
  - `test_leaderboard_separa_empates`: para Ash y Gary, `ties == 1`, `losses == total_battles - wins - 1` y `win_rate_pct ≈ 100*wins/total_battles`.
  - `test_perfil_separa_empates`: `GET /api/players/ash` → `record["ties"] == 1` y `record["losses"] == battles - wins - 1`.
- [ ] **Step 2: Run** `BATS_TEST_DSN=postgresql://localhost/bats_test pytest tests/test_stats_views.py -v`. Expected: los tests nuevos fallan (`KeyError: 'ties'`).
- [ ] **Step 3: Write `v15.sql`.** `DROP MATERIALIZED VIEW IF EXISTS battle.mv_player_stats CASCADE;` y luego recrear la vista exactamente igual que en `v10.sql` (mismas columnas y mismo `GROUP BY`) más `COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id IS NULL) AS ties`. Recrear `uq_mv_player_stats`. Encabezado con comentario: qué cambia y "aplicar `--apply-schema` ANTES de desplegar el código nuevo (el código nuevo lee `ties`; el viejo ignora la columna extra)". Verificar que `battle.refresh_bats_views*()` (v8) siga refrescándola: itera por nombre, así que no cambia.
- [ ] **Step 4: Update the API.** Leaderboard: `SUM(ties) AS ties` y `SUM(total_battles) - SUM(wins) - SUM(ties) AS losses`. Perfil: sumar `ties` en la consulta `record` y devolver `"ties"` y `"losses": battles - wins - ties`. Tipos TS y `data.json` del mock.
- [ ] **Step 5: Run** el mismo comando de pytest. Expected: PASS. Correr también `pytest` completo (sin DSN, los de DB se saltan) para confirmar que no se rompió nada.
- [ ] **Step 6: Docs.** En `CLAUDE.md` (sección Base de datos) agregar una línea: "**Orden de despliegue de v15:** primero `--apply-schema` y después el código (el código nuevo lee `mv_player_stats.ties`)". Lo mismo en `MIGRACION_VERCEL_SUPABASE.md`. Agregar `ties` en `BATS_DOCS.md` (leaderboard, perfil, `mv_player_stats`).
- [ ] **Step 7: Commit** `feat(api): la clasificación y el perfil separan empates de derrotas (v15)`.

### Task 2: Forma y racha en la clasificación

**Files:**
- Create: `bats_core/api/form.py`
- Modify: `bats_core/api/routes/stats.py` (`get_leaderboard`)
- Modify: `web/src/lib/api.ts`, `web/dev-mocks/data.json`, `docs/BATS_DOCS.md`, `docs/BATS_API.postman_collection.json`
- Test: `tests/test_form.py` (unitario, sin DB) y `tests/test_stats_views.py`

**Interfaces:**
- Produces (Python): `Result = Literal["W", "L", "T"]`. `result_for(winner_id: int | None, player_id: int) -> Result`. `form(results_newest_first: list[Result], n: int = 5) -> list[Result]` (devuelve de la más vieja a la más nueva). `streak(results_newest_first: list[Result]) -> dict` → `{"type": Result | None, "length": int}`.
- Produces (API): cada fila del leaderboard agrega `form: list["W"|"L"|"T"]` (hasta 5, de la más vieja a la más nueva) y `streak: {"type": "W"|"L"|"T"|null, "length": int}`.
- Produces (TS): `type MatchResult = "W" | "L" | "T"`. `LeaderboardEntry.form: MatchResult[]` y `LeaderboardEntry.streak: { type: MatchResult | null; length: number }`.

- [ ] **Step 1: Write failing unit tests** en `tests/test_form.py`:
  - `streak(["W","W","L"]) == {"type": "W", "length": 2}`
  - `streak(["T","W"]) == {"type": "T", "length": 1}` (el empate corta)
  - `streak([]) == {"type": None, "length": 0}`
  - `form(["W","L","T","W","W","L","L"]) == ["W","W","T","L","W"]`
  - `form(["L"]) == ["L"]`
  - `result_for(None, 3) == "T"`, `result_for(3, 3) == "W"`, `result_for(4, 3) == "L"`
- [ ] **Step 2: Run** `pytest tests/test_form.py -v`. Expected: FAIL (`ModuleNotFoundError: bats_core.api.form`).
- [ ] **Step 3: Implement** `bats_core/api/form.py` con las tres funciones puras.
- [ ] **Step 4: Run** `pytest tests/test_form.py -v`. Expected: PASS.
- [ ] **Step 5: Write failing DB test** `test_leaderboard_forma_y_racha` en `tests/test_stats_views.py`: con el `plan` de Task 1 (que incluye el empate del 2031-01-09), para `?season_id=` de la temporada 0, la forma de Ash coincide con un oráculo calculado en Python (orden `battle_date DESC`) y `streak` también. Sin `season_id`, se toman todas las batallas.
- [ ] **Step 6: Implement in `get_leaderboard`.** Después de leer la vista, una segunda consulta sobre `battle.fact_battles` (filtro de liga + temporada) que traiga `p1.username, p2.username, fb.winner_id, fb.p1_id, fb.p2_id`, ordenada por `fb.battle_date DESC, fb.logged_at DESC`. Agrupar en Python por username en minúsculas usando `result_for`, y adjuntar `form` y `streak` **solo a los jugadores que ya están en las filas de la vista** (los demás no aparecen). Si un jugador de la vista no tiene batallas vivas (vista adelantada), queda con `form: []` y `streak: {"type": None, "length": 0}`.
- [ ] **Step 7: Run** pytest de `tests/test_stats_views.py`. Expected: PASS.
- [ ] **Step 8:** Tipos TS, mock (`form` y `streak` en cada fila de `leaderboard` de `data.json`), docs y Postman.
- [ ] **Step 9: Commit** `feat(api): forma reciente y racha de cada jugador en la clasificación`.

### Task 3: Endpoint de cara a cara

**Files:**
- Modify: `bats_core/api/routes/stats.py` (nuevo `get_head_to_head`, antes de la sección del bot)
- Modify: `web/src/lib/api.ts`, `web/src/lib/queries.ts`, `web/dev-mocks/mock-api.ts`, `web/dev-mocks/data.json`, `docs/BATS_DOCS.md`, `docs/BATS_API.postman_collection.json`
- Test: `tests/test_head_to_head.py` (DB, mismo patrón de `setUpClass`/`tearDownClass` que `test_stats_views.py`)

**Interfaces:**
- Consumes: `result_for` de `bats_core/api/form.py`.
- Produces (API): `GET /api/stats/head-to-head?a=<user>&b=<user>&season_id=<opt>&limit=<5, 1..20>` →
  ```json
  {"a": "ash", "b": "gary", "wins_a": 3, "wins_b": 1, "ties": 1,
   "battles": [{"battle_id": "...", "date": "2031-01-09", "winner": "ash" | null, "turns": 12}],
   "top_killer": {"a": {"species": "Gengar", "kills": 4} | null, "b": {...} | null}}
  ```
  `battles` va de la más reciente a la más vieja. `winner` va en minúsculas o `null` si hubo empate. `top_killer` sale de `battle.fact_pokemon_performance` (solo `was_active`) en esas batallas: la especie con más KOs de cada uno, y si empatan en KOs gana la de nombre alfabéticamente menor. Si el jugador no hizo KOs, va `null`.
  Errores: `a == b` (tras normalizar) → 400 `"Elige dos jugadores distintos."`. Un jugador inexistente en `battle.dim_players` (no bot) → 404 `"Jugador no encontrado."`.
- Produces (TS): `interface HeadToHead` con esa forma. `getHeadToHead(a: string, b: string, seasonId?: number)`. `useHeadToHead(a?: string, b?: string, s?: SeasonArg)` con `enabled: !!a && !!b && a !== b && s !== null` y query key `["stats", "h2h", a, b, s ?? "all"]`.

- [ ] **Step 1: Write failing tests** en `tests/test_head_to_head.py`. Datos: 5 batallas Ash–Gary en temporada A (3 gana Ash, 1 gana Gary, 1 empate) y 1 en temporada B. Tests:
  - `test_historial_y_orden`: con `season_id=A`, `wins_a == 3`, `wins_b == 1`, `ties == 1` y `battles` en orden de fecha descendente.
  - `test_simetria`: `a=gary&b=ash` invierte `wins_a`/`wins_b`.
  - `test_mayusculas`: `a=ASH&b=Gary` da lo mismo que en minúsculas.
  - `test_mismo_jugador_400` y `test_jugador_inexistente_404`.
  - `test_sin_enfrentamientos`: con un tercer jugador que nunca jugó contra Ash, devuelve ceros, `battles == []` y ambos `top_killer` `null`.
  - `test_limit`: `limit=2` devuelve 2 batallas pero los conteos siguen siendo los totales.
  - `test_top_killer`: coincide con un oráculo sobre las filas de `fact_pokemon_performance`.
- [ ] **Step 2: Run** `BATS_TEST_DSN=… pytest tests/test_head_to_head.py -v`. Expected: FAIL (404 en la ruta).
- [ ] **Step 3: Implement** `get_head_to_head(a: str, b: str, season_id: Optional[int] = None, limit: int = Query(5, ge=1, le=20))` en `stats.py`.
- [ ] **Step 4: Run** los tests. Expected: PASS.
- [ ] **Step 5:** Cliente TS, hook, ruta en el mock (`/^\/api\/stats\/head-to-head$/`, que lea `a`/`b` de la query y devuelva un objeto de `data.json` o uno vacío), docs y Postman.
- [ ] **Step 6: Commit** `feat(api): endpoint de cara a cara entre dos jugadores`.

### Task 4: Supervivencia por especie

**Files:**
- Modify: `bats_core/api/routes/pokemon_stats.py` (helper nuevo junto a `_brought`, más `list_pokedex` y `get_pokedex_entry`)
- Modify: `web/src/lib/api.ts` (`PokedexRow`, `PokedexEntry`), `web/dev-mocks/data.json`, `docs/BATS_DOCS.md`
- Test: el test de DB existente de `/api/stats/pokemon` (localizar con `grep -rn "api/stats/pokemon" tests/`; si no hay, crear `tests/test_pokemon_stats.py` con el patrón de `test_stats_views.py`)

**Interfaces:**
- Produces: `_survival(db, season_id: Optional[int], species_norm: Optional[str] = None) -> dict[str, tuple[int, int]]` (especie → `(sobrevivió, apariciones)`), sobre `battle.fact_pokemon_performance` con `was_active`, filtro de liga y temporada, igual que `_brought`. Los dos endpoints agregan `survival_pct: float | null` (`_pct(sobrevivió, apariciones)`). TS: `PokedexRow.survival_pct: number | null` y `PokedexEntry.survival_pct: number | null`.

- [ ] **Step 1: Write failing test** `test_supervivencia_por_especie`: para una especie del `SAMPLE_BATTLE_JSON`, `survival_pct` de la lista y de la ficha coincide con un oráculo (`100*survived/appearances`, `was_active`). La ficha pedida con otra grafía (`get /api/stats/pokemon/{nombre en mayúsculas}`) da el mismo valor.
- [ ] **Step 2: Run** pytest sobre ese archivo. Expected: FAIL (`KeyError: 'survival_pct'`).
- [ ] **Step 3: Implement** `_survival` y agregar `survival_pct` a los dos endpoints. En la ficha, filtrar por `NORM.format(col='dp.species') = %s`, como `_brought`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Tipos, mock y docs.
- [ ] **Step 6: Commit** `feat(api): supervivencia por especie en las stats de pokémon`.

### Task 5: Endpoint de coleccionistas

**Files:**
- Modify: `bats_core/api/routes/player_pokedex.py` (router aparte `stats_router = APIRouter(prefix="/api/stats", tags=["stats"])` con `GET /collectors`; registrarlo en `bats_core/api/main.py`)
- Modify: `web/src/lib/api.ts`, `web/src/lib/queries.ts`, `web/dev-mocks/mock-api.ts`, `web/dev-mocks/data.json`, `docs/BATS_DOCS.md`, `docs/BATS_API.postman_collection.json`
- Test: `tests/test_player_pokedex.py`

**Interfaces:**
- Produces (API): `GET /api/stats/collectors` → `[{"username": "ash", "seen": [PokedexSighting…]}]`, mismo formato de `seen` que `/api/players/{u}/pokedex` (extraer el mapeo de fila a un helper `_sighting(row) -> dict` compartido). Solo jugadores con al menos un avistamiento, ordenados por username. Sin `season_id`.
- Produces (TS): `interface CollectorEntry { username: string; seen: PokedexSighting[] }`. `getCollectors()` y `useCollectors()` con key `["stats", "collectors"]`.

- [ ] **Step 1: Write failing test** `test_collectors`: con avistamientos de dos jugadores sembrados como en los tests existentes del archivo, la respuesta trae los dos con sus `seen` iguales a lo que devuelve `/api/players/{u}/pokedex`, y un jugador sin avistamientos no aparece.
- [ ] **Step 2: Run.** Expected: FAIL (404).
- [ ] **Step 3: Implement** el router y registrarlo.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5:** Cliente, hook, mock, docs y Postman.
- [ ] **Step 6: Commit** `feat(api): ranking de coleccionistas con los avistamientos de cada jugador`.

### Task 6: Bento de la liga y nueva estructura de `/stats`

**Files:**
- Create: `web/src/lib/layout.ts` (exporta `WIDE_ROW`, movido desde `HomePage.tsx`, y `HomePage` lo importa)
- Create: `web/src/components/stats/StatsBento.tsx`
- Modify: `web/src/pages/StatsPage.tsx`
- Test: `web/src/components/stats/StatsBento.test.tsx`, `web/src/pages/StatsPage.test.tsx`

**Interfaces:**
- Consumes: `useBattlesPerDay(days?, s?)` (existe, `queries.ts:79`), `useLeaderboard`, `useSummary`, `useMvp` y `usePokemonStats` con la misma `season` de hoy. `BentoCurve`, `BentoBars`, `MagicBento`, `PokemonArtwork`.
- Produces: `StatsBento(props: { summary?: LeagueSummary; summaryLoading?: boolean; leaderboard?: LeaderboardEntry[]; perDay?: BattlesPerDay; topPokemon?: PokedexRow; mvp?: MvpEntry; temporada: SeasonChoice; dexNum: (s: string) => number | undefined })`. `StatsPage` deja pestañas con valores `"jugadores" | "pokemon" | "coleccionistas"` y renderiza `<StatsBento>` donde hoy están los `StatTile`.

Composición del bento (12 columnas, `rowHeight` 128, como `HomeBento`):
- Batallas: `BentoCurve` con total y `variacionSemanal`, colSpan 6 y rowSpan 2.
- Win rate: `BentoBars` de los 8 mejores, colSpan 6 y rowSpan 2.
- Pokémon más usado: el primero por `used`, con artwork, pick rate y win rate, enlace a la ficha con `?temporada=` si no es la activa. colSpan 4 y rowSpan 2.
- MVP: el primero de `mvp`, con artwork, jugador, KOs y puntaje. colSpan 4 y rowSpan 2.
- Cifras: jugadores, turnos por batalla y mejor win rate (con la pista "mín. 3 batallas"), en números `font-card-mono`. colSpan 4 y rowSpan 2.

La pestaña **Pokémon** también lleva el top MVP completo (lista compacta, decisión del plan). Todo dentro del `Reveal` y con la opacidad de `refreshing` que hay hoy. La página usa `WIDE_ROW`.

- [ ] **Step 1: Write failing tests:**
  - `StatsBento.test.tsx`: con datos, renderiza "Batallas", el nombre del pokémon más usado enlazado a `/stats/pokemon/<especie>` y el MVP. Con `temporada = 2`, el enlace lleva `?temporada=2`.
  - **Temporada vacía** (`summary` en cero, listas vacías): muestra los textos vacíos ("Aún no hay batallas." / "Aún no hay jugadores.") y ningún texto `NaN` ni `undefined` (`expect(container.textContent).not.toMatch(/NaN|undefined/)`).
  - `StatsPage.test.tsx`: existen las pestañas "Jugadores", "Pokémon" y "Coleccionistas" y ya no existe "Tabla". Ajustar los tests existentes de Tabla/MVP/Uso a las pestañas nuevas, sin borrar los casos de selector de temporada, `refreshing` ni `ResetButton`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/components/stats src/pages/StatsPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `layout.ts`, `StatsBento` y la reestructuración de `StatsPage`. Las pestañas Jugadores/Pokémon/Coleccionistas siguen mostrando su contenido actual (clasificación, uso y el estado vacío de Coleccionistas) hasta que las tareas 7 a 9 las completen.
- [ ] **Step 4: Run** los tests. Expected: PASS. Correr también `npx vitest run src/pages/HomePage.test.tsx` (por el `WIDE_ROW` movido).
- [ ] **Step 5: Commit** `feat(web): bento de la liga y pestañas nuevas en Estadísticas`.

### Task 7: Pestaña Jugadores (V/D/E, forma, racha y cara a cara)

**Files:**
- Create: `web/src/components/stats/FormDots.tsx`, `web/src/components/stats/HeadToHead.tsx`
- Modify: `web/src/pages/StatsPage.tsx` (columnas de la clasificación)
- Test: `web/src/components/stats/FormDots.test.tsx`, `web/src/components/stats/HeadToHead.test.tsx`, `web/src/pages/StatsPage.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardEntry.form/streak/ties` (Tasks 1 y 2), `useHeadToHead` (Task 3), `useMe`, `Combobox`.
- Produces: `FormDots({ form }: { form: MatchResult[] })`: puntitos con color por resultado más la letra V/E/D (no solo color) y `aria-label` "Forma: V, V, D, E, V" de la más vieja a la más nueva. `streakLabel(s: LeaderboardEntry["streak"]): string` → `"3V"`, `"1E"`, `"2D"` o `"—"`. `HeadToHead({ players, me, season }: { players: LeaderboardEntry[]; me?: string; season: SeasonArg })`.

Columnas nuevas de la clasificación: **E** (empates) entre Derrotas y Win rate, **Forma** (oculta en móvil) y **Racha**. En móvil la Racha queda visible y la Forma se oculta.

`HeadToHead` es una tarjeta `MagicBento` de una sola celda (o la misma superficie y hover) debajo de la clasificación, con:
- Dos `Combobox`. Las opciones salen de `players` y la opción elegida en un lado se excluye del otro.
- Preselección: si `me` está en `players`, `me` contra el primero de la clasificación que no sea `me`. Si no, el primero contra el segundo. Con menos de 2 jugadores, no se renderiza.
- Marcador grande `3 – 1` con "1 empate" debajo, las últimas batallas con ganador, turnos y `haceCuanto(date)`, y el `top_killer` de cada uno con `PokemonArtwork`.
- Si `battles` está vacío: `EmptyState` con el título "Todavía no se enfrentaron".

- [ ] **Step 1: Write failing tests:**
  - `FormDots`: `["W","L","T"]` renderiza las letras V, D y E en ese orden y `aria-label` "Forma: V, D, E". `streakLabel({type:"T",length:1}) === "1E"` y `streakLabel({type:null,length:0}) === "—"`.
  - `HeadToHead`: preselecciona `me` contra el líder. El jugador elegido en A no aparece en las opciones de B. Muestra "3 – 1" y "1 empate" con datos del mock del hook. Con `battles: []` muestra "Todavía no se enfrentaron". Con un solo jugador no renderiza nada.
  - `StatsPage`: la clasificación muestra la columna E con el valor de `ties` y la racha "2V" para una fila con `streak {type:"W",length:2}`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/components/stats src/pages/StatsPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): forma, racha, empates y cara a cara en la pestaña Jugadores`.

### Task 8: Pestaña Pokémon (dispersión uso vs. win rate y supervivencia)

**Files:**
- Create: `web/src/components/stats/UsageScatter.tsx`
- Delete: `web/src/components/stats/PokemonUsageChart.tsx`, `PokemonUsageChart.test.tsx` y `usage-chart-data.ts` (y su test, si existe) cuando nadie más los importe
- Modify: `web/src/components/stats/PokemonUsageTable.tsx` (columna Supervivencia), `web/src/pages/StatsPage.tsx`
- Test: `web/src/components/stats/UsageScatter.test.tsx`, `web/src/components/stats/PokemonUsageTable.test.tsx`

**Interfaces:**
- Consumes: `PokedexRow.survival_pct` (Task 4).
- Produces: `UsageScatter({ rows, temporada }: { rows: PokedexRow[]; temporada: SeasonChoice })`: `ScatterChart` de recharts con X = `pick_pct` (%) e Y = `win_rate_pct` (%), `ReferenceLine y={50}`, tooltip con especie, pick, win rate y batallas (`used`), y clic o Enter en un punto que navega a `/stats/pokemon/<especie>` (+`?temporada=`). Las filas con `win_rate_pct == null` o `pick_pct == null` se excluyen. Va dentro de `<figure aria-label="Uso contra win rate de los pokémon">` con un `<figcaption>` de una línea que explique cómo leerlo. Colores solo con `var(--chart-*)` y `var(--…)`.

Se quita el `SegmentedControl` Gráfico/Lista (decisión del plan). La pestaña muestra la dispersión, después el top MVP (lo mueve Task 6) y después la tabla. La dispersión solo aparece con al menos 1 punto válido. Si no hay ninguno, va solo la tabla con su estado vacío.

- [ ] **Step 1: Write failing tests:**
  - `UsageScatter`: renderiza la `figure` con su `aria-label`. Excluye la fila con `win_rate_pct: null` (función pura exportada `scatterPoints(rows)` probada directamente: devuelve 2 de 3). `scatterPoints` conserva `species` con forma (`"Scizor-Mega"`) y `fichaHref("Scizor-Mega", 2) === "/stats/pokemon/Scizor-Mega?temporada=2"`.
  - `PokemonUsageTable`: existe la columna "Supervivencia" y muestra `pct(survival_pct, 1)`. Con `null` muestra "—" o lo que ya haga `pct` con `null` (verificar en `lib/format.ts`).
  - Mantener las guardas de fuente del gráfico viejo (`TICK_CAPTION`/`TICK_FOOTNOTE` de `lib/chart`) aplicadas a la dispersión.
- [ ] **Step 2: Run** `cd web && npx vitest run src/components/stats`. Expected: FAIL.
- [ ] **Step 3: Implement** y borrar lo viejo que quede sin uso (`grep -rn "PokemonUsageChart\|usageChartData" web/src` debe salir vacío).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): dispersión uso contra win rate y supervivencia en la pestaña Pokémon`.

### Task 9: Pestaña Coleccionistas

**Files:**
- Create: `web/src/components/stats/CollectorsRanking.tsx`
- Modify: `web/src/pages/StatsPage.tsx`
- Test: `web/src/components/stats/CollectorsRanking.test.tsx`

**Interfaces:**
- Consumes: `useCollectors` (Task 5), `useDexEssentials`, `buildCollection(dex, seen)` y `collectionProgress(cells)` de `web/src/lib/dex/collection.ts`.
- Produces: `CollectorsRanking()`: lista ordenada por `progress.discovered` (desempate: `seen` descendente y después username), con posición, `PlayerAvatar`, nombre, `discovered / total`, `Meter` de progreso y la última especie vista (`progress.last`), si existe. Cada fila enlaza a `/j/<username>/pokedex`. Arriba va la nota: "La Pokédex es por cuenta: no cambia con la temporada." Los estados de carga, error y vacío usan `States`. El vacío dice "Nadie ha descubierto pokémon todavía".

- [ ] **Step 1: Write failing tests:**
  - Con un dex de prueba que tenga `Scizor` y `Scizor-Mega` (mismo `num`) y una preevolución (`Scyther`): un jugador que vio `scizor` y `scizormega` cuenta lo mismo que `collectionProgress(buildCollection(dex, seen)).discovered`. O sea, 1 por número más la preevolución, **no 2 filas**.
  - El orden sale por `discovered` descendente.
  - El enlace va a `/j/ash/pokedex`.
  - La nota de "no cambia con la temporada" está visible.
  - Con lista vacía, muestra el estado vacío.
- [ ] **Step 2: Run** `cd web && npx vitest run src/components/stats/CollectorsRanking.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** y conectarlo en la pestaña.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): ranking de coleccionistas en Estadísticas`.

### Task 10: Ficha del Pokémon con el estilo del Inicio

**Files:**
- Modify: `web/src/pages/PokemonStatsPage.tsx`
- Test: `web/src/pages/PokemonStatsPage.test.tsx`

**Interfaces:**
- Consumes: `PokedexEntry.survival_pct` (Task 4), `PokemonArtwork`, `MagicBento`, `WIDE_ROW` (Task 6).

Cambios:
- Cabecera con `PokemonArtwork` grande (sobre una superficie `bg-secondary` redondeada, como en `HomeBento`) en lugar de `PokemonSprite` de 112.
- Las cifras van en un `MagicBento`: Pick rate, Bring rate, Win rate, MVP medio y **Supervivencia**, con número `font-card-mono` de 40 a 56 px y la pista debajo.
- "Quién lo usa" y "Sets registrados" pasan a celdas grandes del mismo bento (o a la misma superficie con hover), con la cabecera tipo `Seccion`.
- Se conservan el aviso "Se lleva más de lo que sale", el botón de volver, el 404, el `?temporada=` y la regla de sets privados. Sin holo.

- [ ] **Step 1: Write failing tests:** muestra "Supervivencia" con `pct(survival_pct, 1)`. No hay ningún elemento de `PokemonHolo` (`queryByTestId`/clase que use la holo). Los tests existentes (404, sets privados, aviso, temporada) siguen pasando sin cambiar su intención.
- [ ] **Step 2: Run** `cd web && npx vitest run src/pages/PokemonStatsPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): la ficha de estadísticas del pokémon adopta el estilo del Inicio`.

### Task 11: Verificación final

- [ ] **Step 1:** Backend: `pytest` y `BATS_TEST_DSN=postgresql://localhost/<db_desechable> pytest`. Expected: todo pasa.
- [ ] **Step 2:** Frontend: `cd web && npx vitest run && npm run build && npm run lint`. Expected: tests y build en verde. Lint con solo los 4 errores preexistentes de `ETLCleanerPage`.
- [ ] **Step 3:** `node tools/roster_parity.js` no aplica (no se tocó `canonicalSet`). Saltarlo y decirlo.
- [ ] **Step 4: Manual.** `cd web && npm run dev:mock` y revisar `/stats` (las 3 pestañas), `/stats/pokemon/<especie>` y `/` (el Inicio no cambió) a 390 px y 1280 px, en claro y oscuro: sin scroll horizontal, hover con brillo en las tarjetas y transición al cambiar de temporada.
- [ ] **Step 5:** Recordar en el resumen final el **orden de despliegue de v15**: `--apply-schema` en Supabase (con `--dsn` de sesión) **antes** de mergear y desplegar el código.
