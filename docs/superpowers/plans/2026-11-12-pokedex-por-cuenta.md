# Pokédex por cuenta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la Pokédex en una colección por cuenta ("¿Quién es ese Pokémon?"), donde cada jugador descubre especies al verlas en batallas de liga, y mudar las estadísticas de uso que hoy muestra la Pokédex a Estadísticas.

**Architecture:** El backend solo guarda los hechos: qué especie vio cada username, cuándo y en qué batalla (`tournament.pokedex_seen`, escrita en `BATSEtl.load_battle`). Todo lo derivado se calcula en el frontend, a partir del snapshot estático del dex (`web/public/dex/species.json`): la agrupación por número nacional, el descubrimiento por preevolución, los filtros y el progreso. Las estadísticas por especie se mueven de `/api/pokedex` a `/api/stats/pokemon`.

**Tech Stack:** Python 3.12 + FastAPI + psycopg2 + PostgreSQL (pytest); React + Vite + TypeScript + Tailwind + React Query (vitest + Testing Library).

**Spec:** Este documento. La sección "Decisiones" recoge lo acordado con el usuario el 2026-11-12.

## Decisiones (spec)

- **D1.** Una Pokédex por cuenta, que no depende de la temporada ni del mes. Los datos se guardan.
- **D2.** Arranca en cero: no se carga el historial de `battle.*`.
- **D3.** Solo cuentan los Pokémon que **salieron al campo** (`was_active = TRUE`), tanto los propios como los del rival.
- **D4.** Solo cuentan las batallas de **liga** (formato `gen9pinchesgueysleague`). El sparring y las batallas contra el bot no cuentan.
- **D5.** Hay una casilla por número de Pokédex nacional (1025). Ver una forma (Scizor-Mega, Raichu-Alola) descubre la casilla de su número.
- **D6.** Ver una especie descubre también toda su cadena de **preevoluciones**, siguiendo `prevo` (Charizard → Charmeleon → Charmander). La regla va solo hacia atrás.
- **D7.** Se distinguen "visto en batalla" y "descubierto por evolución": un indicador sutil en la casilla, y en la ficha el texto "Descubierto al ver a {especie}".
- **D8.** La Pokédex es pública: se ve desde el perfil de cada jugador. Sin sesión, `/pokedex` muestra la grilla en siluetas y una invitación a iniciar sesión.
- **D9.** Arriba de la grilla hay un buscador y filtros (estado, tipo, generación). **El buscador encuentra por nombre solo a los descubiertos**; por número encuentra a todos.
- **D10.** A la derecha va un anillo de progreso con `143 / 1025` en el centro. Debajo, una card con el desglose (vistos en batalla y por evolución), el último descubierto ("hace 2 días, contra ronny") y el progreso por generación.
- **D11.** La Pokédex actual se fusiona en la pestaña **"Uso"** de Estadísticas, con todas las columnas y los filtros de tipo y temporada. La ficha por especie se muda a `/stats/pokemon/:species`.
- **D12.** La casilla descubierta se abre como un **modal sobre la grilla, con animación**. La URL pasa a ser `/pokedex/:species` (se puede compartir, y "atrás" lo cierra). En el celular se abre como hoja desde abajo. El modal muestra los datos de la especie, el resumen de estadísticas de torneo y un link "Ver estadísticas completas".
- **D13.** La silueta usa `PokemonSilhouette` con el token `--silhouette`: claro `oklch(0.58 0.02 60)`, oscuro `oklch(0.40 0.012 70)`. Ya existe en el branch `feat/pokedex-silhouette`.

## Global Constraints

- Sin colores sueltos (`#hex`, `rgb()`) fuera de `web/src/styles/tokens.css`: lo exige `src/styles/cleanup.test.ts`. Los números de Pokédex se arman con `` `#${String(n).padStart(3, "0")}` ``, nunca como literal `#007`.
- Las animaciones duran **300 ms o menos** (`duration-300` como máximo): lo exige `src/styles/motion-guard.test.ts`. La animación del modal respeta `prefers-reduced-motion`.
- `tournament.*` no tiene FKs hacia `battle.*` (frontera de esquemas, ver `CLAUDE.md`). La tabla nueva tampoco las tiene.
- Las migraciones son idempotentes (`CREATE ... IF NOT EXISTS`). La siguiente es `bats_core/db/migrations/v13.sql`.
- Los usernames se guardan en minúsculas (`strip().lower()`), igual que `_rename_username_cascade`.
- Los IDs de especie usan `to_id()` de `bats_core/teamset.py` en el backend y `toId` del dex en el frontend: `"Scizor-Mega"` → `"scizormega"`.
- La copia de UI va en español neutro, como el resto de la app.
- Los tests de DB se saltan sin `BATS_TEST_DSN`. Para correrlos hace falta un Postgres desechable: `BATS_TEST_DSN=postgresql://localhost/bats_test`.

## Review Focus

1. **Formas que comparten número** (megas, regionales, Gigantamax): ver `Charizard-Mega-X` descubre la casilla #6. La ficha lista las formas vistas y no duplica la casilla. → test en Task 4.
2. **Batalla reingestada o duplicada:** volver a cargar la misma batalla no cambia `first_seen_at` ni `battle_id` (gana el primer avistamiento). → test en Task 2.
3. **Especie de la batalla que no existe en el snapshot** (nombre raro o forma nueva): se ignora en la grilla sin romper la página, y no cuenta en el progreso. → test en Task 4.
4. **Cambio de nombre de jugador:** su Pokédex sigue al nombre nuevo, y si el nombre nuevo ya tenía avistamientos se fusionan conservando la fecha más antigua. → test en Task 1.
5. **El buscador filtra información:** buscar `charizard` sin haberlo descubierto no devuelve nada, pero `6` o `#006` sí devuelve la casilla (en silueta). → test en Task 4.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `bats_core/db/migrations/v13.sql` (nuevo) | Tabla `tournament.pokedex_seen` |
| `bats_core/api/routes/admin.py` | `_rename_username_cascade` incluye `pokedex_seen` |
| `bats_core/db/etl.py` | `BATSEtl._record_pokedex_seen()`, llamado en `load_battle` antes del commit |
| `bats_core/league.py` (nuevo) | `LEAGUE_FORMAT = "gen9pinchesgueysleague"`; `bot/config.py` lo reutiliza |
| `bats_core/api/routes/player_pokedex.py` (nuevo) | `GET /api/players/{username}/pokedex` |
| `bats_core/api/routes/pokedex.py` → `pokemon_stats.py` | Las mismas stats, con prefijo `/api/stats/pokemon` |
| `web/src/lib/dex/collection.ts` (nuevo) | Lógica pura: casillas, preevoluciones, filtros y progreso |
| `web/src/pages/PokedexPage.tsx` (reescrita) | Grilla, buscador, filtros, anillo y card de progreso |
| `web/src/components/pokedex/*` (nuevo) | `DexCell`, `ProgressRing`, `ProgressCard`, `DexEntryModal` |
| `web/src/pages/PokemonStatsPage.tsx` (antes `PokedexEntryPage.tsx`) | Ficha de stats en `/stats/pokemon/:species` |
| `web/src/pages/StatsPage.tsx` | La pestaña "Uso" usa `PokedexRow` con filtros |
| `web/dev-mocks/*` | Rutas mock nuevas y renombradas |

---

### Task 1: Tabla `tournament.pokedex_seen` y cambio de nombre en cascada

**Files:**
- Create: `bats_core/db/migrations/v13.sql`
- Modify: `bats_core/api/routes/admin.py` (`_rename_username_cascade`, línea 35)
- Test: `tests/test_pokedex_seen.py`

**Interfaces:**
- Produces: la tabla

```sql
tournament.pokedex_seen (
  username      TEXT         NOT NULL,   -- minúsculas
  species_id    VARCHAR(60)  NOT NULL,   -- to_id(dim_pokemon.species), p.ej. "scizormega"
  species       VARCHAR(80)  NOT NULL,   -- nombre tal como vino ("Scizor-Mega")
  first_seen_at TIMESTAMPTZ  NOT NULL,
  battle_id     VARCHAR(80)  NOT NULL,
  opponent      TEXT         NOT NULL,   -- minúsculas
  PRIMARY KEY (username, species_id)
)
```

con un índice en `(username, first_seen_at DESC)`.

- [ ] **Step 1: Write the failing tests** (clase `TestPokedexSeenSchema`, se salta sin `BATS_TEST_DSN`):
  - `test_aplica_la_migracion_dos_veces`: `apply_migrations` dos veces no falla, y la tabla existe con la PK `(username, species_id)`.
  - `test_rename_mueve_los_avistamientos`: con filas de `ana`, `_rename_username_cascade(db, "Ana", "Bea")` deja todas las filas con `username = 'bea'`.
  - `test_rename_fusiona_conservando_el_mas_antiguo`: si `ana` vio `garchomp` el 2026-11-02 y `bea` el 2026-11-05, después del rename queda una sola fila de `bea` con fecha 2026-11-02.
  - `test_rename_actualiza_opponent`: las filas de otros jugadores con `opponent = 'ana'` pasan a `'bea'`.
- [ ] **Step 2: Run** `BATS_TEST_DSN=... pytest tests/test_pokedex_seen.py -v`. Expected: FAIL (la tabla no existe).
- [ ] **Step 3: Implementar.** Crear `v13.sql`. En `_rename_username_cascade`, la fusión se hace así:
  1. `INSERT ... SELECT` de las filas viejas con el nombre nuevo, con `ON CONFLICT (username, species_id) DO UPDATE` que conserva el `first_seen_at` menor (y su `battle_id` y `opponent`).
  2. `DELETE` de las filas viejas.
  3. `UPDATE ... SET opponent = new WHERE opponent = old`.

  Todo va en la misma transacción del llamador.
- [ ] **Step 4: Run** los tests. Expected: PASS. Correr también `pytest tests/test_admin_players.py`, que cubre el rename existente.
- [ ] **Step 5: Commit** `feat(db): tabla tournament.pokedex_seen para la Pokédex por cuenta`

### Task 2: Registrar avistamientos al cargar una batalla

**Files:**
- Create: `bats_core/league.py`
- Modify: `bats_core/bot/config.py:33` (importa `LEAGUE_FORMAT`), `bats_core/db/etl.py` (nuevo paso 7b, entre las líneas 300 y 305)
- Test: `tests/test_pokedex_seen.py` (clase `TestRecordPokedexSeen`)

**Interfaces:**
- Consumes: la tabla de la Task 1.
- Produces: `BATSEtl._record_pokedex_seen(self, battle_id: str, format_name: str, is_bot_battle: bool) -> int`, que devuelve las filas insertadas. Se llama desde `load_battle` antes del commit, dentro de la misma transacción.

- [ ] **Step 1: Write the failing tests.** Cargar batallas con el fixture o parser que ya usa `tests/test_ingest.py`:
  - `test_cada_jugador_ve_sus_activos_y_los_del_rival`: p1 = `ana` (activos Garchomp y Scizor-Mega; Heatran en banca), p2 = `bea` (activo Weavile). Resultado: `ana` tiene {garchomp, scizormega, weavile}; `bea` tiene {garchomp, scizormega, weavile}; nadie tiene heatran.
  - `test_guarda_rival_y_batalla`: la fila de `ana`/weavile tiene `opponent = 'bea'`, el `battle_id` de la batalla y `first_seen_at` = fecha de la batalla.
  - `test_ignora_sparring`: con formato `gen9pglsparring` no inserta nada.
  - `test_ignora_batallas_contra_el_bot`: con `is_bot_battle = TRUE` no inserta nada.
  - `test_gana_el_primer_avistamiento`: una segunda batalla posterior donde `ana` vuelve a ver a weavile no cambia `battle_id` ni `first_seen_at`.
  - `test_reingesta_idempotente`: cargar dos veces la misma batalla no duplica filas ni falla.
- [ ] **Step 2: Run** `pytest tests/test_pokedex_seen.py -k Record -v`. Expected: FAIL (el método no existe).
- [ ] **Step 3: Implementar** `_record_pokedex_seen`:
  - Retorna 0 si `format_name != LEAGUE_FORMAT` o si `is_bot_battle`.
  - Con un solo `INSERT ... SELECT` sobre `battle.fact_pokemon_performance` (con JOIN a `fact_battles`, `dim_pokemon` y `dim_players`) filtrado por `battle_id` y `was_active`, produce una fila por cada jugador × cada especie activa de cualquiera de los dos lados, con `ON CONFLICT DO NOTHING`.
  - `species_id` se calcula en SQL con `regexp_replace(lower(species), '[^a-z0-9]', '', 'g')`, el mismo `NORM` que usa la ruta de stats.
- [ ] **Step 4: Run** los tests de esta Task, más `pytest tests/test_ingest.py tests/test_bats.py`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(etl): registra los pokémon vistos en batallas de liga`

### Task 3: API pública `GET /api/players/{username}/pokedex`

**Files:**
- Create: `bats_core/api/routes/player_pokedex.py`
- Modify: `bats_core/api/main.py` (`include_router`)
- Test: `tests/test_player_pokedex.py`

**Interfaces:**
- Produces: la respuesta (sin auth)

```json
{ "username": "ana",
  "seen": [ { "species_id": "scizormega", "species": "Scizor-Mega",
              "first_seen_at": "2026-11-10T22:15:00Z", "battle_id": "...", "opponent": "bea" } ] }
```

  `seen` va ordenado por `first_seen_at DESC`. El username de la URL no distingue mayúsculas.

- [ ] **Step 1: Write the failing tests:**
  - `test_devuelve_los_avistamientos_ordenados`: el más reciente va primero.
  - `test_no_distingue_mayusculas`: `/api/players/ANA/pokedex` es igual a `/api/players/ana/pokedex`.
  - `test_jugador_con_cuenta_sin_avistamientos`: devuelve 200 con `seen: []`.
  - `test_jugador_inexistente`: un username que no está en `player_accounts` ni en `pokedex_seen` devuelve 404 con `detail`.
  - `test_es_publica`: funciona sin token.
- [ ] **Step 2: Run** `pytest tests/test_player_pokedex.py -v`. Expected: FAIL (404 de ruta).
- [ ] **Step 3: Implementar** el router con prefijo `/api/players` y registrarlo en `main.py` antes de `players.router` si hay conflicto de rutas.
- [ ] **Step 4: Run** los tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): endpoint público de la Pokédex de cada jugador`

### Task 4: Lógica de la colección en el frontend (pura)

**Files:**
- Create: `web/src/lib/dex/collection.ts`, `web/src/lib/dex/collection.test.ts`
- Modify: `web/src/lib/api.ts` (tipo `PlayerPokedex` y `getPlayerPokedex(username)`), `web/src/lib/queries.ts` (`usePlayerPokedex(username?: string)`, deshabilitada sin username)

**Interfaces:**
- Consumes: `DexEssentials` y `Species` de `lib/dex/snapshot.ts`, y la respuesta de la Task 3.
- Produces:

```ts
type DexStatus = "seen" | "evolution" | "unknown";
interface DexCell {
  num: number;                 // 1..1025
  species: Species;            // especie base del número (forme === null)
  status: DexStatus;
  seenForms: string[];         // nombres de formas vistas en batalla (status "seen")
  firstSeen?: { at: string; battleId: string; opponent: string; species: string };
  via?: string;                // status "evolution": nombre de la especie vista que lo descubrió
}
function buildCollection(dex: DexEssentials, seen: PlayerPokedex["seen"]): DexCell[];          // ordenado por num
interface DexFilters { query: string; status: "all" | "discovered" | DexStatus; type: PokemonType | null; gen: number | null }
function filterCollection(cells: DexCell[], f: DexFilters): DexCell[];
interface DexProgress { discovered: number; total: number; seen: number; evolution: number;
                        byGen: { gen: number; discovered: number; total: number }[]; last?: DexCell }
function collectionProgress(cells: DexCell[]): DexProgress;
```

- [ ] **Step 1: Write the failing tests** (`collection.test.ts`, con un mini-dex armado en el test):
  - `una casilla por número`: con un dex que tiene `charizard`, `charizardmegax` y `charizardmegay`, sale una sola casilla `num 6`, y `total` es la cantidad de `num > 0` distintos.
  - `ver una forma descubre su número`: ver `Charizard-Mega-X` deja la casilla 6 en `seen`, con `seenForms: ["Charizard-Mega-X"]`.
  - `descubre preevoluciones hacia atrás`: ver `Charizard` deja 5 y 4 en `evolution` con `via: "Charizard"`, y no toca nada hacia adelante.
  - `visto gana sobre evolución`: si se vio Charmander y también Charizard, la 4 queda en `seen`.
  - `prevo de una forma regional`: ver `Raichu-Alola` descubre la 25 (Pikachu) por evolución.
  - `especie desconocida se ignora`: `{"species_id":"fakemon"}` no rompe ni suma al progreso.
  - `buscar por nombre solo encuentra descubiertos`: con Charizard sin descubrir, `query "chari"` devuelve `[]`; con Charizard descubierto, lo devuelve.
  - `buscar por número encuentra cualquiera`: `"6"`, `"#006"` y `"006"` devuelven la casilla 6 aunque esté `unknown`.
  - `filtros de estado, tipo y generación` se combinan (AND). El filtro `discovered` incluye `seen` y `evolution`.
  - `progreso`: `discovered = seen + evolution`, `byGen` suma bien, y `last` es la casilla con el `firstSeen.at` más reciente.
- [ ] **Step 2: Run** `npx vitest run src/lib/dex/collection.test.ts`. Expected: FAIL (el módulo no existe).
- [ ] **Step 3: Implementar.** La base de cada número es la especie con ese `num` y `forme === null`. Las preevoluciones se resuelven subiendo por `prevo` hasta `null`, pasando por `speciesById` para tolerar nombres con formas.
- [ ] **Step 4: Run** los tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): lógica de la colección de la Pokédex por cuenta`

### Task 5: Mudar las estadísticas por especie a Estadísticas

**Files:**
- Rename: `bats_core/api/routes/pokedex.py` → `pokemon_stats.py` (prefijo `/api/stats/pokemon`), y su `include_router` en `main.py`
- Rename: `web/src/pages/PokedexEntryPage.tsx` → `PokemonStatsPage.tsx` (y su test)
- Modify: `web/src/lib/api.ts` (`getPokemonStats`, `getPokemonStatsEntry` con las rutas nuevas), `web/src/lib/queries.ts`, `web/src/routes.ts`, `web/src/App.tsx` (ruta `/stats/pokemon/:species`), `web/src/pages/StatsPage.tsx` (pestaña "Uso")
- Modify: los links a fichas de especie en `MvpList.tsx`, `GlobalSearch.tsx`, `BansPage.tsx`, `PlayerPage.tsx` y `StatsPage.tsx`, que pasan a `/stats/pokemon/:species`
- Modify: `web/dev-mocks/mock-api.ts` (renombrar las rutas `/api/pokedex*` → `/api/stats/pokemon*`)
- Test: tests existentes de `tests/` que usen `/api/pokedex`, más `StatsPage`, `PokemonStatsPage.test.tsx` y `GlobalSearch.test.tsx`

**Interfaces:**
- Produces: `GET /api/stats/pokemon` → `PokedexList` y `GET /api/stats/pokemon/{species}` → `PokedexEntry`, con las mismas formas que hoy. En el frontend, `usePokemonStats(season?)` y `usePokemonStatsEntry(species, season?)` reemplazan a `usePokedex` y `usePokedexEntry`. La Task 7 usa `usePokemonStatsEntry` para el resumen del modal.

- [ ] **Step 1: Update tests first.** En los tests de backend y frontend que apuntan a `/api/pokedex*`, cambiar a las rutas nuevas. Agregar un test a `StatsPage` que verifique que "Uso" muestra las columnas pick %, bring %, win rate, kills y MVP, que filtra por tipo, y que cada fila enlaza a `/stats/pokemon/{species}`.
- [ ] **Step 2: Run** `pytest` y `npx vitest run`. Expected: FAIL en los tests tocados.
- [ ] **Step 3: Implementar** el rename y la pestaña "Uso". La tabla de `PokedexPage` actual (columnas y filtro de tipo) pasa a "Uso", y `getPickRate` deja de usarse en "Uso". `/pokedex/:species` deja de apuntar a la ficha de stats; la Task 7 le da su nuevo destino.
- [ ] **Step 4: Run** `pytest`, `npx vitest run`, `npm run lint` y `npm run build`. Expected: PASS (salvo los 4 errores de lint preexistentes en `ETLCleanerPage`).
- [ ] **Step 5: Commit** `refactor: muda las estadísticas por especie de la Pokédex a Estadísticas`

### Task 6: Nueva página de la Pokédex (grilla, buscador, filtros y progreso)

**Files:**
- Rewrite: `web/src/pages/PokedexPage.tsx`, `web/src/pages/PokedexPage.test.tsx`
- Create: `web/src/components/pokedex/DexCell.tsx`, `ProgressRing.tsx`, `ProgressCard.tsx`
- Modify: `web/src/App.tsx` (ruta `/j/:username/pokedex`; quitar `/dev/silueta`), `web/src/pages/PlayerPage.tsx` (link "Ver Pokédex" con el contador)
- Delete: `web/src/pages/SilhouetteDemoPage.tsx`
- Modify: `web/dev-mocks/data.json` y `mock-api.ts` (ruta `/api/players/:u/pokedex` con avistamientos de ejemplo para `jazar`)

**Interfaces:**
- Consumes: `buildCollection`, `filterCollection` y `collectionProgress` (Task 4); `usePlayerPokedex` (Task 4); `PokemonSilhouette` (D13).
- Produces: `PokedexPage({ username }: { username?: string })`. Sin `username` usa el de la sesión. `DexCell` recibe `cell: DexCell` y `onOpen(cell)`, y solo es clickeable si `status !== "unknown"`.

- [ ] **Step 1: Write the failing tests** (`PokedexPage.test.tsx`, con React Query y el dex mockeados como en los tests actuales):
  - `muestra una casilla por número con su #NNN`: las no descubiertas muestran silueta y `???`.
  - `las descubiertas muestran sprite y nombre`, con un indicador distinto para `seen` y `evolution` (por `aria-label`: "Visto en batalla" / "Descubierto por evolución").
  - `el anillo muestra discovered / total`, por ejemplo `3 / 1025`.
  - `la card muestra el desglose, el último descubierto y el progreso por generación`.
  - `el buscador no revela no descubiertos`: escribir `charizard` sin tenerlo muestra el estado vacío.
  - `sin sesión`: la grilla en siluetas y el CTA "Inicia sesión para ver tu Pokédex".
  - `perfil ajeno`: `/j/ronny/pokedex` muestra la Pokédex de ronny con su nombre en el encabezado.
- [ ] **Step 2: Run** `npx vitest run src/pages/PokedexPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - La grilla tiene que ser responsive y sin scroll horizontal. Para 1025 casillas conviene `content-visibility: auto` en cada una, y las imágenes con `loading="lazy"`.
  - El anillo es un SVG con `stroke-dasharray`, con colores de tokens.
  - Los filtros reutilizan `TypeFilter` y el `Input` existentes.
- [ ] **Step 4: Run** `npx vitest run`, `npm run lint` y `npm run build`. Expected: PASS. Revisar `/pokedex` con `npm run dev:mock` en los dos temas y a ancho de celular.
- [ ] **Step 5: Commit** `feat(web): Pokédex por cuenta con grilla de siluetas, buscador y progreso`

### Task 7: Modal de la ficha con URL y animación

**Files:**
- Create: `web/src/components/pokedex/DexEntryModal.tsx`, `DexEntryModal.test.tsx`
- Modify: `web/src/App.tsx` (rutas `/pokedex/:species` y `/j/:username/pokedex/:species`, que renderizan la grilla con el modal abierto), `web/src/pages/PokedexPage.tsx`

**Interfaces:**
- Consumes: `DexCell` (Task 4); `usePokemonStatsEntry(species)` (Task 5).
- Produces: `DexEntryModal({ cell, onClose }: { cell: DexCell; onClose: () => void })`.

- [ ] **Step 1: Write the failing tests:**
  - `abrir una casilla navega a /pokedex/charizard y muestra el modal`; cerrar o volver atrás regresa a `/pokedex` sin perder el scroll.
  - `entrar directo a /pokedex/charizard abre el modal sobre la grilla`.
  - `muestra el origen`: "Visto en batalla contra bea · {fecha}" para `seen`, o "Descubierto al ver a Charizard" para `evolution`.
  - `muestra datos de la especie`: tipos, stats base, habilidades y las formas vistas.
  - `resumen de torneo` (pick %, win rate, avg MVP) y el link "Ver estadísticas completas" a `/stats/pokemon/charizard`.
  - `una casilla unknown no abre`, y `/pokedex/{no-descubierto}` redirige a `/pokedex` sin revelar la especie.
- [ ] **Step 2: Run** `npx vitest run src/components/pokedex`. Expected: FAIL.
- [ ] **Step 3: Implementar** con el `Dialog` de `components/ui`. En el celular usa la variante de hoja inferior que ya se use en la app; si no existe, el `Dialog` anclado abajo. La animación de entrada (escala + fundido) dura como máximo `duration-300` y se desactiva con `useReducedMotion`.
- [ ] **Step 4: Run** `npx vitest run`, `npm run lint` y `npm run build`. Expected: PASS. Revisión visual con `dev:mock`.
- [ ] **Step 5: Commit** `feat(web): ficha de la Pokédex en modal con URL propia`

### Task 8: Documentación

**Files:**
- Modify: `CLAUDE.md` (la tabla nueva en "Esquemas" y el endpoint), `docs/BATS_DOCS.md` (endpoints `/api/stats/pokemon*` y `/api/players/{username}/pokedex`), `docs/BATS_API.postman_collection.json`

- [ ] **Step 1:** Documentar `tournament.pokedex_seen`, las reglas D3, D4 y D6, y los endpoints nuevos y renombrados.
- [ ] **Step 2:** Verificar que el JSON de Postman sigue siendo válido: `python3 -m json.tool docs/BATS_API.postman_collection.json > /dev/null`.
- [ ] **Step 3: Commit** `docs: Pokédex por cuenta y rutas de estadísticas por especie`

---

## Fuera de alcance

- Silueta generada en el servidor (anti-trampa): la versión CSS revela el sprite a quien inspeccione la red. Se acepta para un minijuego de liga.
- Cargar el historial de batallas viejas (D2).
- Logros o notificaciones por descubrimiento.
