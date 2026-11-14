# Estadísticas 2.0: diseño

Fecha: 2026-11-13 · Estado: borrador para aprobación

## Intención

Hoy el Inicio es lo mejor de BATS a nivel visual, y Estadísticas se queda corta. `/stats` muestra un encabezado, 4 `StatTile` planos y 3 pestañas (Tabla, MVP y Uso) con tablas genéricas. La ficha `/stats/pokemon/:species` tiene un sprite chico, tiles y listas. Ninguna de las dos usa el lenguaje del Inicio.

El objetivo es doble:

1. **Diseño:** que Estadísticas se vea y se sienta como el Inicio.
2. **Datos:** sumar las métricas que hacen interesante seguir la liga (forma, racha, cara a cara, supervivencia, uso contra win rate) y traer lo que quedó pendiente de la Pokédex: el **ranking de coleccionistas**.

## Objetivos

- Rediseñar `/stats` y `/stats/pokemon/:species` con el lenguaje visual del Inicio (`HomeBento` y `MagicBento`).
- Agregar a la API los datos nuevos que hacen falta y mostrarlos.
- Mobile-first y, en escritorio, el mismo ancho amplio del Inicio (`WIDE_ROW` en `HomePage.tsx`).

## No objetivos

- **Sin carta holográfica** (`PokemonHolo` y `HoloCard`) en Estadísticas, ni en `/stats` ni en la ficha. Lo decidió el usuario para no saturar la página.
- No se toca la Pokédex (`/pokedex`), el Inicio ni el perfil `/j/:username`, salvo que hagan falta enlaces hacia o desde Estadísticas.
- No cambia la fórmula de MVP ni las reglas del dominio.
- No se toca el panel de admin, salvo que `StatsPage` con `showAdminControls` (el `ResetButton`) siga funcionando.

## Antiobjetivos (si pasa esto, fracasamos)

- Que la página quede saturada: demasiadas tarjetas, efectos o gráficos compitiendo.
- Que en el celular se vuelva una pared de tablas o haya scroll horizontal.
- Que se pierda lo que hoy funciona: selector de temporada, transición suave al cambiarla (`Reveal` y `settledSid`), orden en móvil, gráfico accesible, enlaces a la ficha conservando la temporada (`?temporada=`) y estados de carga, error y vacío.

## Lenguaje visual (lo que se hereda del Inicio)

- **Tarjetas bento** de `components/effects/MagicBento.tsx`: superficie, borde, brillo de borde y spotlight que sigue al cursor en el hover. Lo pidió explícitamente el usuario: "el diseño de los cards y el hover que tienen".
- **Números grandes** en `font-card-mono` y `tabular`, como "Jugadores" en `HomeBento`.
- **Mini-gráficos** `BentoCurve` (curva) y `BentoBars` (barras), y la cabecera `Seccion` (título más enlace, con línea fina).
- Artwork con `PokemonArtwork` en lugar de sprites chicos cuando el Pokémon es protagonista.
- Se respetan las guardas existentes: sin colores sueltos fuera de `tokens.css` (`cleanup.test.ts`), animaciones de 300 ms o menos (`motion-guard.test.ts`), `prefers-reduced-motion` y targets táctiles de 44 px o más.

## Estructura de `/stats`

**Encabezado:** `PageHeader` con `SeasonSelect` (y el `ResetButton` en admin), como hoy.

**Bento de la liga** (filtrado por temporada):
- Batallas por día: `BentoCurve` con el total y la variación semanal (`/api/stats/battles-per-day`).
- Win rate por jugador: `BentoBars` (leaderboard).
- Pokémon más usado: artwork grande, pick rate y win rate (`/api/stats/pokemon`). Enlaza a su ficha.
- MVP de la temporada: el primero de `/api/stats/mvp`, con artwork, jugador, KOs y puntaje.
- Las cifras del resumen actual (batallas, jugadores, turnos por batalla, mejor win rate) se integran en estas tarjetas o en tarjetas chicas. No quedan como `StatTile` planos sueltos.

**Pestañas debajo del bento:** **Jugadores**, **Pokémon** y **Coleccionistas**.

### Pestaña Jugadores

- **Clasificación:** la tabla actual (V, D, win rate con `Meter`, supervivientes) más:
  - **Forma:** últimas 5 batallas como puntitos V/D/E, la más reciente a la derecha. El resultado tiene texto accesible y no depende solo del color.
  - **Racha actual:** por ejemplo "3V" o "2D". Un empate corta la racha.
- **Cara a cara:** se eligen dos jugadores y se ve:
  - Historial entre ellos (V–D–E).
  - Sus últimas batallas entre sí: ganador, turnos y fecha (con `haceCuanto`).
  - De cada uno, el Pokémon que más KOs hizo en esos duelos.
  - Estado vacío si nunca se enfrentaron.
  - Por defecto se preseleccionan los dos primeros de la clasificación. Si hay sesión, el jugador con sesión contra el primero que no sea él.
- El MVP (top de pokémon por jugador) que hoy es pestaña pasa a esta pestaña o a la de Pokémon. Lo decide el builder (ver "Decisiones del builder").

### Pestaña Pokémon

- **Uso vs. win rate:** gráfico de dispersión con recharts (ya instalado). X = pick rate, Y = win rate, línea de referencia en 50 % de win rate, y tooltip con nombre y cifras. Se puede tocar un punto para ir a la ficha. Necesita una alternativa accesible: la tabla de abajo cumple ese rol y el `figure` lleva `aria-label`.
- **Tabla de uso:** la `PokemonUsageTable` actual (buscador, filtro de tipo, enlaces a la ficha) más la columna **Supervivencia** (% de veces que terminó la batalla vivo cuando salió al campo).
- El gráfico de barras actual (`PokemonUsageChart`) lo reemplaza la dispersión. El selector Gráfico/Lista puede quedarse o desaparecer (ver "Decisiones del builder").

### Pestaña Coleccionistas

- Ranking de jugadores por especies descubiertas en su Pokédex (`tournament.pokedex_seen`): posición, avatar, nombre, cantidad de especies y una barra de progreso sobre el total del dex.
- **No depende de la temporada.** La Pokédex es por cuenta. La pestaña lo aclara con una línea ("La Pokédex es por cuenta: no cambia con la temporada") y el selector de temporada no la afecta.
- Cada fila enlaza a `/j/:username/pokedex`.
- Extra opcional: la última especie descubierta por cada jugador.

## Ficha `/stats/pokemon/:species`

- Cabecera con **artwork grande** (`PokemonArtwork`), número de Pokédex y tipos. Sin carta holográfica.
- Las cifras (pick rate, bring rate, win rate, MVP medio y ahora **supervivencia**) en tarjetas bento con números grandes en lugar de `StatTile`.
- Se mantienen el aviso "Se lleva más de lo que sale", "Quién lo usa" y "Sets registrados" (con su regla de privacidad), con el estilo de tarjeta bento.
- Conserva el `?temporada=` como hoy.

## Datos nuevos (backend)

Contexto: `recent-battles` y `battles-per-day` ya consultan `battle.fact_battles` directamente. Las vistas materializadas no tienen orden por batalla.

1. **Forma y racha por jugador:** las últimas 5 batallas (V/D/E, de la más vieja a la más nueva) y la racha actual, filtradas por temporada, sin bots y con el mismo criterio de "batalla de liga" que la clasificación. Puede ser un campo nuevo del leaderboard o un endpoint aparte. Tiene que ser consistente con los jugadores del leaderboard.
2. **Cara a cara:** endpoint con dos usernames y temporada opcional que devuelve el historial V–D–E, las últimas N batallas entre ellos y el Pokémon con más KOs de cada uno en esos duelos (de `fact_pokemon_performance`). Los usernames se normalizan a minúsculas.
3. **Supervivencia por especie:** `survived` sobre las apariciones con `was_active` (no bot, temporada), en `/api/stats/pokemon` y `/api/stats/pokemon/{species}`.
4. **Ranking de coleccionistas:** conteo por jugador en `tournament.pokedex_seen` más el total de especies del dex para la barra. Sin temporada.

Reglas que hay que respetar: los endpoints públicos van sin auth, como el resto de `/api/stats`. No se crean FKs de `tournament` hacia `battle`. No se depende del `search_path`. `pandas` queda fuera del árbol de imports de la API. Lo nuevo se agrega a `docs/BATS_DOCS.md`, `docs/BATS_API.postman_collection.json` y al mock de desarrollo (`dev:mock`) para que la página se pueda ver sin backend. Cada endpoint lleva su test en pytest (los de DB se saltan sin `BATS_TEST_DSN`) y cada componente nuevo su test en vitest.

## Decisiones tomadas

- **Del usuario:** sin holo. Sí al diseño y al hover de las tarjetas bento. Incluir el ranking de coleccionistas. Incluir el cara a cara.
- **Mías (revisables):** el selector de temporada se queda y filtra todo menos Coleccionistas. Bento arriba y tres pestañas abajo (Jugadores, Pokémon, Coleccionistas). Mobile-first con ancho amplio en escritorio. La dispersión reemplaza al gráfico de barras.

## Empates (decisión del usuario)

En Showdown una batalla puede terminar en empate (`sim/battle.ts`, `tie()`: `winner = ''`, log `|tie`). Pasa con caídas simultáneas de los últimos Pokémon, con el desempate por tiempo o con un `>forcetie`. Hoy la clasificación calcula `losses = total_battles - wins` (`bats_core/api/routes/stats.py`), así que cada empate se cuenta como derrota.

**Decisión:** la clasificación separa los empates en **V / D / E**.
- Migración `v15.sql`, idempotente, que recrea `battle.mv_player_stats` con una columna de empates (`winner_id IS NULL`). Hay que revisar si `win_rate_pct` o `summary.top_win_rate` cambian de definición: se mantiene `victorias / batallas`.
- El leaderboard devuelve `ties`, y `losses` pasa a ser las derrotas reales.
- Forma, racha y cara a cara usan esta misma definición. El empate corta la racha.
- Orden de despliegue: código nuevo y enseguida `--apply-schema`, igual que con v10. Hay que confirmar que el código nuevo tolere la vista vieja durante esa ventana, o documentar el orden inverso si no la tolera.
- El mismo cálculo `battles - wins` está en el perfil (`bats_core/api/routes/players.py`, `"losses"`). También se corrige ahí, para que perfil y clasificación coincidan. Las stats del bot (`/api/stats/bot/summary`) quedan fuera. Se actualiza el mock de desarrollo.

## Decisiones tomadas tras la revisión (mías, revisables)

- **Conteo de coleccionistas = el mismo que la Pokédex.** El número de cada jugador tiene que coincidir con el que ve en su propia Pokédex (`collectionProgress` en `web/src/lib/dex/collection.ts`: formas agrupadas por número de Pokédex, cuenta las evoluciones relacionadas y el total son números de Pokédex). Un `COUNT(*)` sobre `pokedex_seen` no sirve. El backend devuelve las especies vistas por jugador y el cliente calcula el progreso con la misma función.
- **Frescura de forma y racha:** se calculan en vivo desde `fact_battles`, como `recent-battles`, solo para los jugadores que aparecen en la clasificación. Pueden adelantarse unas horas a las columnas V/D (que salen de las vistas materializadas). Se acepta.
- **Quién aparece en Coleccionistas:** todo jugador con al menos una especie vista. Todos jugaron batallas, así que tienen perfil público y `/j/:username/pokedex` funciona.

## Decisiones del builder

- Composición exacta del bento (spans y tamaños) y en qué pestaña queda el top MVP.
- Si se queda el selector Gráfico/Lista en Pokémon.
- Forma del contrato de los endpoints nuevos (endpoint aparte o campo extra) y si la supervivencia se calcula con consulta directa o ampliando una vista materializada. Si implica migración, va como `v15.sql`, idempotente, y obliga a `--apply-schema`.
- Cómo se ve el selector de dos jugadores del cara a cara (reutilizar `Combobox`, como el selector de jugador de la Pokédex, es lo esperable).
