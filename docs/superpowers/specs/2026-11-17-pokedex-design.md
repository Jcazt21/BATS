# Pokédex 2.0: diseño

Fecha: 2026-11-17 · Estado: borrador para aprobación

## Intención

Inicio y Estadísticas ya tienen un lenguaje visual propio (`MagicBento`, números grandes en `font-card-mono`, brillo y spotlight, entrada animada). La Pokédex (`/pokedex` y `/j/:username/pokedex`) se quedó atrás: casillas planas (`bg-card` con borde), un panel lateral de tarjetas sueltas y un modal de ficha que, comparado con el Inicio, "está muy flojo".

Para el usuario la Pokédex es **un minijuego**: coleccionar pokémon viéndolos salir al campo en batallas de liga. La ficha tiene que dar ganas de abrir cada pokémon. Lo especial de cada uno no sale de arte nuevo, sino de **tu historia con ese pokémon**: cuándo y contra quién lo descubriste, cuántos KOs hizo contigo, tu MVP y tu mejor batalla. Eso no lo tiene ningún otro jugador.

Hay dos frentes:

1. **Diseño:** la página y el modal con el acabado de Inicio y Estadísticas, incluido el responsive compacto del teléfono que tiene Estadísticas.
2. **Datos:** un backend nuevo que dé las estadísticas de un jugador por especie.

## Objetivos

- Refinar la página de la Pokédex **sin cambiar su maqueta** (el usuario la aprobó tal cual): grilla con filtros y panel lateral en escritorio, tira compacta en el teléfono.
- Rediseñar el modal de ficha (`DexEntryModal`) como una mezcla de "carta que gira" y "mosaicos bento", compacto en PC.
- Agregar a la API las estadísticas del jugador por especie y mostrarlas en la ficha.
- Que `npm run dev:mock` siga funcionando con todo lo nuevo (el usuario desarrolla sin DB local).

## No objetivos

- No cambia la maqueta de la página: ni el orden de las piezas ni el modelo de filtros y paginación.
- No cambian las reglas de descubrimiento (`tournament.pokedex_seen`, visto en batalla y por evolución) ni la fórmula de MVP.
- No se toca el Inicio, Estadísticas ni la ficha `/stats/pokemon/:species`, salvo los enlaces que ya existen.
- Sin arte dibujado a mano por pokémon.

## Antiobjetivos (si pasa esto, fracasamos)

- Que el modal en PC quede grande o con scroll. El usuario lo marcó explícitamente: "el modal es muy grande en pc".
- Que la ficha repita la misma información en la carta y en los mosaicos.
- Que en el teléfono haya scroll horizontal o se vuelva una pared de tarjetas.
- Que se pierda lo que hoy funciona: abrir la ficha por URL (`/pokedex/:species`), no revelar por URL una casilla sin descubrir, la Pokédex pública de otro jugador, los filtros, la paginación, el anillo de progreso y los estados de carga, error y vacío.

## Lenguaje visual (heredado de Inicio y Estadísticas)

- **Mosaicos con el componente real `components/effects/MagicBento.tsx`**, no una imitación: brillo de borde con el color del mes, spotlight que sigue al cursor y entrada animada. El usuario pidió "el mismo efecto que el home y estadísticas con respecto al glass effect".
- **Números grandes** en `font-card-mono` y `tabular`.
- **La carta es la holográfica real (`components/home/PokemonHolo.tsx`)**, la misma que ya usa el modal de hoy con el set más usado de la liga (`leagueSetCard`).
- Se respetan las guardas existentes: sin colores sueltos fuera de `tokens.css` (`cleanup.test.ts`), animaciones de 300 ms o menos (`motion-guard.test.ts`), `prefers-reduced-motion` y targets táctiles de 44 px o más.

## La ficha del pokémon (modal)

Aprobada a partir de los mockups `modal-mezcla.html` y `modal-compacto.html` (visual companion).

### PC

- Modal de unos **600 px de ancho, sin scroll** (hoy es `sm:max-w-3xl`, unos 768 px).
- **Izquierda: una sola carta `PokemonHolo` que gira** al tocarla o hacer clic. Debajo, una pista corta: "Toca para ver tu historia".
  - **Frente:** el set más usado en la liga, como hoy, con su pie ("Set más usado en la liga · N jugadores" o "Todavía sin sets públicos en la liga").
  - **Reverso: tu historia** con ese pokémon:
    - primer avistamiento: fecha y rival (o, si lo descubriste por evolución, a quién viste);
    - tu mejor batalla con él: KOs, MVP, rival y fecha;
    - las formas vistas;
    - sus habilidades.
- **Derecha, de arriba abajo:**
  - Encabezado: número `#006`, nombre y badges de tipo.
  - Fila de 3 mosaicos con brillo: **tus KOs, tu MVP y tus batallas** con ese pokémon.
  - Un mosaico de una línea, **"En la liga"**: pick %, win rate y MVP medio (los mismos datos que hoy muestra `TournamentSummary`).
  - Mosaico **"Stats base"**: las 6 stats en 2 columnas de 3 barras.
  - Enlace "Ver estadísticas completas" a `/stats/pokemon/:species`.
- Cada parte va en un solo lugar: la historia en la carta, los números en los mosaicos.

### Teléfono

Sigue siendo la hoja inferior arrastrable (`ResponsiveSheet`):

- la carta arriba (se toca para girarla);
- tus 3 números en una fila;
- "En la liga" en una línea;
- "Stats base" plegado (se despliega al tocarlo).

### Tres casos según tu relación con el pokémon

`tournament.pokedex_seen` registra las especies que salieron al campo **de los dos lados** (las tuyas y las del rival; ver `_record_pokedex_seen` en `bats_core/db/etl.py`). Muchas casillas descubiertas son pokémon que solo enfrentaste. La ficha cambia según el caso (aprobado por el usuario):

1. **Lo usaste** (salió al campo en tu equipo al menos una vez): los 3 mosaicos son tus KOs, tu MVP y tus batallas con él, y el reverso muestra tu mejor batalla.
2. **Solo lo enfrentaste** (salió al campo en el equipo rival y nunca en el tuyo): los 3 mosaicos pasan a ser **"Lo enfrentaste N veces · te hizo X KOs · le ganaste Y"**. El reverso muestra contra quién fue la primera vez y deja fuera "tu mejor batalla".
3. **Por evolución** (nunca salió al campo en tus batallas): los mosaicos muestran un texto como "sin batallas todavía" en vez de números vacíos, y el reverso dice a quién viste para descubrirlo. *(Decisión de Claude.)*

Si lo usaste **y** también lo enfrentaste, gana el caso 1. *(Decisión de Claude: lo propio es lo más valioso de la ficha.)*

Definiciones del caso 2 (decisión de Claude): "lo enfrentaste" = batallas de liga en las que esa especie (cualquier forma de la casilla) salió al campo del lado rival; "te hizo X KOs" = suma de los `kills` de esas filas rivales; "le ganaste" = esas batallas que ganaste vos.

### Pokédex de otro jugador

En `/j/:username/pokedex` la ficha muestra la historia y los números **de ese jugador**, no los tuyos. El reverso dice "Su Charizard" o usa el nombre del jugador; en la tuya, "Tu Charizard". *(Decisión de Claude: la Pokédex de otro ya es pública.)*

## La página de la Pokédex

Aprobada a partir del mockup `grilla-refinada.html`. Misma maqueta, acabado nuevo.

### PC

- **Panel lateral en mosaicos `MagicBento`:**
  - selector de jugador (`PlayerPicker`);
  - anillo de progreso (`ProgressRing`) dentro de un mosaico con brillo;
  - mosaico nuevo **"Último descubierto"**: sprite, nombre y hace cuánto (sale del avistamiento más reciente; la API ya los ordena así);
  - desglose (lo que hoy muestra `ProgressCard`).
- **Casillas descubiertas (`DexCell`):** fondo con un halo radial del color de su tipo principal. Al pasar el cursor, brillo y una leve elevación. Siguen mostrando el indicador de origen (visto o por evolución).
- **Casillas sin descubrir:** silueta apagada, más oscuras, para que contraste lo que te falta.
- **Etiqueta "NUEVO"** en las casillas descubiertas en los últimos 7 días (por `first_seen_at`).
- Encabezado y barra de filtros con el estilo de Estadísticas.

### Teléfono (compacto, como Estadísticas)

- Una tira con el anillo chico, "212 / 925", el último descubierto y el selector de jugador.
- Búsqueda y un botón "Filtros" con el contador de filtros activos (la hoja de filtros móvil que ya existe).
- Grilla de 3 columnas con casillas más chicas.

## Datos: estadísticas del jugador por especie (backend nuevo)

Hoy `GET /api/players/{username}/pokedex` solo devuelve el primer avistamiento por especie (`species_id`, `species`, `first_seen_at`, `battle_id`, `opponent`).

Hace falta, por jugador y por especie:

- batallas en las que salió al campo;
- KOs totales;
- MVP total (suma de `mvp_score`);
- su mejor batalla: la de mayor `mvp_score`, con sus KOs, MVP, rival, fecha y `battle_id`;
- del lado rival (caso 2 de la ficha): batallas en las que lo enfrentaste, KOs que te hizo y cuántas de esas ganaste.

Fuente: `battle.fact_pokemon_performance` unida con `battle.fact_battles`, con el mismo criterio que `pokedex_seen`: solo formato de liga, sin batallas contra el bot y solo filas con `was_active`. Abarca todas las temporadas (la Pokédex no depende de la temporada).

Cosas a tener en cuenta:

- **Las formas.** Las filas de rendimiento son por forma (Charizard-Mega-Y, Charizard). Una casilla de la Pokédex agrupa todas las formas de un número. La ficha suma las formas de esa casilla y la mejor batalla es la mejor entre todas.
- **`battle.*` es efímero** y puede truncarse; `tournament.pokedex_seen` no. Si se trunca `battle.*`, las estadísticas quedan en 0 pero el descubrimiento se conserva. La ficha tiene que tolerarlo (es el mismo caso que "por evolución").
- **Renombres de cuenta: se acepta el hueco por ahora (decisión del usuario).** Un renombre (`_rename_username_cascade` en `bats_core/api/routes/admin.py`) pasa `pokedex_seen` al nombre nuevo, pero no toca `battle.*`, que conserva el nick viejo de Showdown. Las estadísticas se buscan por el nombre actual en `battle.dim_players`, así que las batallas anteriores al renombre no cuentan: la ficha las trata como el caso de `battle.*` truncado. Sin migración ni tabla de alias.
- La Pokédex de un jugador es pública, así que estas estadísticas también lo son. No exponen nada nuevo: son agregados de batallas ya públicas.

## Lo que queda para el que construye

- **La forma del endpoint:** uno nuevo, o ampliar la respuesta de `/pokedex`. Una sola llamada con todas las especies del jugador, o una por especie al abrir la ficha. La ficha tiene que cargar rápido al abrirse y la grilla no debe ponerse más lenta.
- Cómo se anima el giro de la carta (respetando los 300 ms y `prefers-reduced-motion`) y si recuerda la cara entre aperturas.
- Los datos de `web/dev-mocks/data.json` y la ruta en `mock-api.ts` para el endpoint nuevo.
- Los tests: endpoint (con `BATS_TEST_DSN`), componentes con vitest y las guardas existentes en verde.
- Actualizar la parte de la Pokédex en `docs/BATS_DOCS.md` y la colección de Postman si se agrega un endpoint.
