# Plan TDD: rediseño de `/equipo` (el teambuilder) — "mesa del entrenador"

> **Estado (2026-10-26):** E0–E7 implementados y en verde (`npm test` 720, `npm run lint`, `npm run build`). **E8 pendiente** (QA manual en navegador: `/equipo` exige sesión de Supabase). Desviaciones respecto al plan:
> - E0: `checkSet` conserva su firma (`string[]`) y se añadió `checkSetProblems` (con `field`/`code`); no había tabla duplicada de efectividades en `pokemon-types.ts` (ya estaba solo en `coverage.ts`). El check de `nature` no existe (el dex esencial no trae naturalezas); sí `tera`.
> - E2: el indicador de selección transiciona por CSS, no con `layoutId`: dentro de un hijo de `AnimatePresence` frena la salida del slot (cubierto en `styles/builder-guard.test.ts`).
> - E4: las secciones son encabezados fijos (Básico / Movimientos / Entrenamiento), no colapsables; el editor móvil abre en `ResponsiveSheet` al tocar un slot.
> - E6: el paso a `RosterView` ya lo hacía `TeamPage` (toast "Equipo registrado" + `Reveal`); no se tocó.
> - E7: **no** se consolidaron las dos tarjetas de "Rotaciones" ni se unificó "Mi equipo"/"Equipo" (la etiqueta del tab vive en `AppShell.tsx`, con cambios locales sin commitear).

> Al aprobar: copiar este archivo a `bats/PLAN_EQUIPO_2.0.md` (mismo nivel que `PLAN_REDESIGN_2.0.md`) y marcar ahí el avance.

## Context
`/equipo` funciona (dex local, validación en vivo, borrador, paste), pero se siente como un formulario largo y no como una mesa de trabajo. Mapa del estado actual (`TeamPage.tsx`, `components/builder/*`, `components/team/*`):

- **Todo compite a la vez.** Lista de tarjetas altas + `SetEditor` (6 campos, resumen de stats, 6 sliders) + textarea de paste siempre visible + checklist + cobertura. El botón "Registrar equipo" queda al final de la página, lejos de donde se edita.
- **El picker es un viaje de ida y vuelta.** Hoja de pantalla completa que se abre y se cierra por cada Pokémon, 4 `<select>` nativos como filtros, tope de 60 resultados, sin "agregar y seguir".
- **Las reglas importantes casi no se ven.** El tipo del mes es un icono gris ("se exige al batallar"); los motivos de bloqueo son texto pequeño bajo el botón; los errores de set se reparten por regex sobre texto en español (`SetEditor.tsx:144-150`), así que naturaleza y tera nunca pintan su error.
- **Cobertura pobre.** Solo "debilidades compartidas"; `computeTypeCoverage` (`lib/dex/coverage.ts`) ya calcula más y no se usa.
- **Bug móvil.** La barra "N de M reglas" (`TeamBuilder.tsx:224`, `z-10`) queda tapada por el `TabBar` (`AppShell.tsx:188`, `z-40`); dentro de las hojas el `fixed` queda atrapado por el `transform`.
- **Incoherencias menores.** Tera es `<select>` nativo mientras el resto es `Combobox`; IVs ocultos tras un enlace; "Solo legales" es un checkbox sin estilo; título "Mi equipo" vs tab "Equipo"; código muerto (`useTeamChecklist`, `validateTeam`, `getActiveRules`, `PendingDot`).

**Dirección (respuestas del usuario):** el flujo principal es **armar desde cero, pieza por pieza**. Siempre visibles, sin abrir nada: **reglas del mes**, **cobertura de tipos** y **los 6 slots de un vistazo**. Persiste la dirección del proyecto: Apple HIG / iOS 27, fluidez primero, mobile-first, motion sutil. Esta sesión **solo documenta el plan**; no se implementa nada.

Skills al implementar: `impeccable` (leer craft-floor antes de cualquier edición UI), `emil-design-eng`, `apple-design`, y `review-animations` si existe en esa sesión (si no, el review de motion se hace con la tabla Before/After de `emil-design-eng`).

## Concepto: "mesa del entrenador"
Piensa como un entrenador: lo primero que quiere saber es *¿qué me falta?* y *¿dónde estoy débil?*; lo segundo, afinar un Pokémon sin perder de vista el resto.

**Escritorio (≥1024px)** — dos zonas y un riel:
```
┌ Barra de reglas (sticky, arriba) ─────────────────────────────┐
│ ✓ Tipo Hielo   ✗ Gen 5 falta   ✓ Egg Dragón   ✓ Amarillo  4/6 │
├───────────────┬───────────────────────────────────────────────┤
│ SLOTS (6)     │ EDITOR del slot seleccionado                  │
│ ▣ ▣ ▣ ▣ ▢ ▢   │ Pokémon · Objeto · Habilidad · Tera · Nat.    │
│ filas compact │ Movimientos (4)   ·   EVs/IVs   ·   Stats     │
│ + cobertura   │                                               │
│ de tipos      │                                               │
├───────────────┴───────────────────────────────────────────────┤
│ Importar / Copiar          [ Registrar equipo ]  (bloqueos →) │
└───────────────────────────────────────────────────────────────┘
```
**Móvil (<768px):** tira horizontal de 6 slots arriba (sprite + estado, con snap), editor debajo en secciones, y una **barra inferior sticky por encima del `TabBar`** con el chip de reglas (abre una hoja con reglas + cobertura) y el botón de guardar.

**Principios de decisión**
1. Un slot vacío es un objetivo, no un vacío: slot punteado "+" que abre el picker en modo *agregar y seguir*.
2. Las reglas se muestran como **estado + acción** ("Falta Gen 5 → Buscar"), no como lista de errores. El tipo del mes pasa de informativo a destacado (primera chip, con el color del mes).
3. Cada error vive junto a su campo y lleva **código estructurado**, no regex.
4. Lo que se hace 6 veces (agregar, moverse entre slots) no se anima con ceremonia; lo que se hace una vez (registrar, quitar) sí tiene feedback. Atajos de teclado sin animación (`emil-design-eng`).

## Fuera de alcance (decisión explícita)
- Que el **servidor** aplique el tipo del mes al registrar (hoy `register_team` no pasa `type_of_month` a `check_team`) y devuelva todas las violaciones en vez de la primera. Es una decisión de reglas de liga, no de UI; el rediseño solo hace visible el estado.
- Sprites locales en vez de `img.pokemondb.net`.
- Cambios al dex, a `rules.py` o a `formats.ts` (paridad `canonicalSet` intacta).
- Stats/velocidad como panel siempre visible (no se marcó); el resumen de stats queda dentro del editor.

## Reglas del plan
- Cada **paquete (E#)** cabe en una sesión. Orden E0 → E8; un commit por paquete (o por tarea si es grande). Si un paquete se desborda, se parte en E#a / E#b.
- **TDD**: por tarea, 🔴 test que falla → 🟢 código mínimo → 🔵 refactor en verde. Sin código de producción sin test rojo previo (salvo `[manual]`, que se verifica en el navegador en E8).
- Infra existente: Vitest + jsdom + Testing Library + user-event; helpers `renderWithProviders` y `mockReducedMotion` en `web/src/lib/test-utils.tsx`; guardas en `styles/*.test.ts` (`motion-guard`, `overlays-guard`, `reduced-motion`, `tokens`). Comando: `cd web && npm test`; al cerrar cada paquete también `npm run lint` y `npm run build`.
- **Qué se testea en jsdom:** comportamiento, roles/ARIA, teclado, presencia de estados (loading/empty/error), orden del DOM, clases/atributos, guardas de fuente. Fluidez, layout real, z-index efectivo y táctil → E8.
- Convenciones: UI en español; reutilizar `lib/motion.ts` (springs), `press`, `material-*`, `States.tsx`, `Group`, `Collapsible`, `ResponsiveSheet`, `Combobox`, `SegmentedControl`, `TypeBadge`, `PokemonSprite`, `Reveal`; no duplicar springs ni easings; tokens de duración/easing de P0 del Redesign 2.0.
- No tocar `lib/dex/validate.ts` más allá de lo que pide cada tarea: es espejo de `rules.py`; sus 28 tests deben seguir verdes.

## Mapa de paquetes
| E | Tema | Depende de |
| --- | --- | --- |
| E0 | Base: errores estructurados, cobertura completa, helpers de estado de slot | — |
| E1 | Barra de reglas viva (escritorio + hoja móvil) y bug de z-index | E0 |
| E2 | Slots: tablero de 6 (filas compactas / tira móvil) y slot vacío | E0 |
| E3 | Picker "agregar y seguir" con filtros en chips | E2 |
| E4 | Editor de set por secciones (tera, IVs, errores por campo) | E0, E2 |
| E5 | Cobertura de tipos completa (debilidad · resistencia · inmunidad) | E0, E1 |
| E6 | Barra de acción: guardar con motivos clicables, importar/copiar | E1, E4 |
| E7 | Motion de la mesa y limpieza (código muerto, textos, borrador en contexto) | E1–E6 |
| E8 | QA en navegador + cierre de motion | todos |

---

## E0 — Base: errores estructurados, cobertura completa, estado de slot
**Objetivo:** que la UI nueva consuma datos ya ordenados (códigos, no regex; cobertura completa; estado por slot) sin cambiar lo que valida.

- [x] 🔴 Test `lib/dex/validate.test.ts`: `checkSet` devuelve problemas con `{ field: 'item'|'ability'|'nature'|'tera'|'moves'|'evs'|'ivs', code, message }`; los mensajes existentes no cambian (los 28 tests actuales siguen verdes).
- [x] 🟢 Extender el tipo de retorno de `checkSet` conservando `message`; añadir `field`/`code`.
- [x] 🔴 Test `lib/dex/slotStatus.test.ts` (nuevo): `slotStatus(mon, problems, learnsetState)` → `empty | incomplete | error | ready` (incompleto = sin 4 moves, sin objeto o sin habilidad; error = hay problemas; listo = completo y sin problemas; learnset pendiente cuenta como `incomplete`).
- [x] 🟢 Crear `lib/dex/slotStatus.ts`.
- [x] 🔴 Test `lib/dex/coverage.test.ts`: `computeTypeCoverage` expone por tipo atacante `{ weak, resist, immune }` por integrante y totales (reutiliza lo que ya calcula; sin tabla duplicada).
- [x] 🟢 Ajustar `coverage.ts` y eliminar la tabla duplicada de `pokemon-types.ts` (una sola fuente).
- [x] 🔴 Test `lib/dex/ruleStatus.test.ts` (nuevo): `ruleStatus(checklistRow)` → `{ state: 'pass'|'fail'|'info', label, action? }` con la acción sugerida (`type_of_month` → "Buscar tipo X", `required_generation` → "Buscar Gen N", etc.). El tipo del mes es `fail` (no `info`) si ningún integrante lo cumple.
- [x] 🟢 Crear `lib/dex/ruleStatus.ts` reutilizando `ruleMessages.ts` y `hints.ts`.

**Archivos:** `lib/dex/{validate,coverage,hints,ruleMessages}.ts`, `lib/dex/{slotStatus,ruleStatus}.ts` (+tests), `lib/pokemon-types.ts`.
**Aceptación:** `npm test` verde; sin cambios visuales; una sola tabla de efectividades.

## E1 — Barra de reglas viva y bug de z-index
**Objetivo:** el entrenador ve de un vistazo qué cumple y qué le falta, con una acción por cada falta; en móvil nunca queda tapada.

- [x] 🔴 Test `components/team/RulesBar.test.tsx` (nuevo): una chip por regla del mes con estado (`pass`/`fail`/`info`) como icono + texto (no solo color); el tipo del mes va primero y con el acento del mes; contador "N/M"; `role="status"` y `aria-live="polite"` solo en el contador.
- [x] 🟢 Crear `RulesBar.tsx` (sustituye a `ChecklistPanel` en el builder; `ChecklistPanel` se borra en E7 si nada más lo usa).
- [x] 🔴 Test: cada chip `fail` con acción es un botón (≥44px) que dispara `onAction(rule)` (abre el picker con el filtro correspondiente, ver E3); chips `pass` no son interactivas.
- [x] 🟢 Implementar con `ruleStatus` (E0).
- [x] 🔴 Test: escritorio = barra sticky bajo el header; móvil = chip único "N/M reglas" que abre `ResponsiveSheet` con la lista completa y las acciones.
- [x] 🟢 Implementar con `ResponsiveSheet`; barra móvil con `bottom` = alto del `TabBar` + `env(safe-area-inset-bottom)`.
- [x] 🔴 Test guarda de fuente (`styles/overlays-guard.test.ts`): ningún `fixed bottom-0` con `z-` menor a `z-40` en `components/builder|team`; el contenedor de la barra móvil no está dentro de un ancestro con `transform` (la hoja de agregar/reemplazar usa la barra en línea, no `fixed`).
- [x] 🟢 Corregir `TeamBuilder.tsx:224` y el modo contexto de las hojas.
- [x] 🔵 `Reveal`/cross-fade 150ms al cambiar pass↔fail; con reduced-motion, sin movimiento.

**Archivos:** `components/team/RulesBar.tsx` (+test), `components/builder/TeamBuilder.tsx`, `styles/overlays-guard.test.ts`.
**Aceptación:** tests verdes; el estado del tipo del mes es visible sin abrir nada; ninguna barra tapada por el `TabBar`.

## E2 — Slots: el tablero de 6
**Objetivo:** ver el equipo completo de un vistazo y moverse entre integrantes con un toque o una tecla.

- [x] 🔴 Test `components/team/SlotBoard.test.tsx` (nuevo): renderiza exactamente `maxSize` slots; los ocupados muestran sprite, nombre, tipos (`TypeBadge`) y un indicador de estado (`slotStatus`: icono + `aria-label`, no solo color); los vacíos son botones punteados "Agregar Pokémon".
- [x] 🟢 Crear `SlotBoard.tsx` (filas compactas en escritorio, tira horizontal con `scroll-snap` en móvil).
- [x] 🔴 Test: `role="listbox"`/`option` o grupo de botones con `aria-pressed`; flechas ↑/↓ (←/→ en la tira) cambian la selección; Enter abre el editor en móvil; foco visible.
- [x] 🟢 Implementar con roving tabindex.
- [x] 🔴 Test: menú por slot (Copiar set · Cambiar por otro · Quitar) reutiliza `MonActions`; "Quitar" pide confirmación solo si el set tiene contenido.
- [x] 🟢 Reutilizar `MonActions` (≥44px).
- [x] 🔴 Test: reordenar con teclado (Alt+↑/↓) y anunciarlo con `aria-live`; sin arrastre en esta versión.
- [x] 🟢 Implementar reorden (el orden alimenta el lineup de 6 de Showdown).
- [x] 🔵 `MonCard` queda para el roster registrado (`RosterView`); el builder usa `SlotBoard`.

**Archivos:** `components/team/{SlotBoard,MonActions}.tsx` (+tests), `components/builder/TeamBuilder.tsx`.
**Aceptación:** tests verdes; los 6 slots caben sin desplazar en 390px (tira) y en 1280px (columna); selección operable por teclado.

## E3 — Picker "agregar y seguir"
**Objetivo:** llenar varios slots seguidos sin reabrir nada, y encontrar rápido lo que pide la regla que falta.

- [x] 🔴 Test `SpeciesPicker.test.tsx`: en modo `keepOpen` elegir una especie la agrega al siguiente slot vacío, muestra un chip "Agregado ✓" y deja el picker abierto; el contador "N/6" se actualiza; al llegar a `maxSize` se cierra solo.
- [x] 🟢 Prop `keepOpen` y retorno del slot destino.
- [x] 🔴 Test: filtros (tipo, gen, color, egg group) como chips/`SegmentedControl` con ≥44px de hit-area, no `<select>` nativos; "Solo legales" es un switch accesible (`role="switch"`).
- [x] 🟢 Reemplazar los controles por chips + `Collapsible` "Más filtros".
- [x] 🔴 Test: abrir desde una chip de regla fallida (`onAction` de E1) precarga el filtro correspondiente y lo muestra como chip removible.
- [x] 🟢 Cablear `ruleStatus.action` → `initialFilters`.
- [x] 🔴 Test: resultados con lista virtual simple o "Ver más" (no corta en 60 sin avisar); resultado ya en el equipo aparece deshabilitado con "En el equipo"; baneados con motivo.
- [x] 🟢 Implementar.
- [x] 🔴 Test: teclado: ↑/↓ recorre, Enter agrega, Escape cierra, `/` enfoca la búsqueda; sin animación al navegar por teclado.
- [x] 🟢 Implementar.

**Archivos:** `components/builder/SpeciesPicker.tsx` (+test), `lib/dex/hints.ts`.
**Aceptación:** tests verdes; añadir 6 Pokémon sin cerrar el picker; sin `<select>` nativo en el flujo.

## E4 — Editor de set por secciones
**Objetivo:** afinar un Pokémon sin scroll infinito y con cada error junto a su campo.

- [x] 🔴 Test `SetEditor.test.tsx`: secciones "Básico" (objeto, habilidad, naturaleza, tera), "Movimientos" y "Entrenamiento" (EVs/IVs); los errores salen por `field` (E0): un error de `nature` o `tera` se pinta en su campo (hoy no ocurre); sin regex.
- [x] 🟢 Reemplazar el reparto por regex (`SetEditor.tsx:144-150`) por `problems.filter(p => p.field === …)`.
- [x] 🔴 Test: tera es `Combobox` con chips de tipo (no `<select>` nativo); la opción por defecto dice "Tipo primario (Fuego)" como valor explícito, no como placeholder ambiguo.
- [x] 🟢 Implementar.
- [x] 🔴 Test: IVs visibles como fila compacta con atajo "0 Atk / 0 Spe" (presets) en vez de enlace oculto; `EVEditor` conserva sus 3 tests.
- [x] 🟢 Implementar manteniendo los presets de EVs.
- [x] 🔴 Test: resumen de stats (nivel 100 con naturaleza) pegado al bloque de EVs, con la barra de total 510 siempre visible y `aria-live` al pasar del límite.
- [x] 🟢 Reubicar el resumen.
- [x] 🔴 Test: movimientos: slot vacío = "+ Movimiento" (abre el combobox con foco), repetidos deshabilitados, STAB marcado con texto además de color.
- [x] 🟢 Ajustes.
- [x] 🔴 Test: móvil: el editor abre en `ResponsiveSheet` al tocar un slot (tira) y escritorio lo muestra en la columna derecha; cambiar de slot conserva la sección abierta.
- [x] 🟢 Implementar.

**Archivos:** `components/builder/{SetEditor,EVEditor}.tsx` (+tests), `lib/dex/validate.ts` (solo vía E0).
**Aceptación:** tests verdes; ningún `<select>` nativo en el editor; todo error aparece junto a su campo.

## E5 — Cobertura de tipos completa
**Objetivo:** responder "¿dónde soy débil, qué resisto, qué me golpea sin respuesta?" siempre a la vista.

- [x] 🔴 Test `TypeCoveragePanel.test.tsx`: tira de 18 tipos con el conteo de integrantes débiles/resistentes/inmunes por tipo; rojo/verde **con icono o signo** (▲/▼/0), no solo color; los tipos con ≥2 débiles y 0 resistentes se marcan "sin respuesta".
- [x] 🟢 Reescribir el panel sobre `computeTypeCoverage` (E0).
- [x] 🔴 Test: tocar un tipo muestra qué integrantes lo afectan (popover/disclosure accesible, no tooltip).
- [x] 🟢 Implementar.
- [x] 🔴 Test: ubicación: escritorio bajo los slots (columna izquierda); móvil dentro de la hoja de reglas (E1) con resumen de una línea en la barra ("2 débiles a Tierra").
- [x] 🟢 Montar en ambas zonas.
- [x] 🔴 Test: con equipo vacío muestra estado vacío explicativo, no una tira apagada.
- [x] 🟢 Implementar con `EmptyState`.

**Archivos:** `components/team/TypeCoveragePanel.tsx` (+test), `lib/dex/coverage.ts`.
**Aceptación:** tests verdes; una sola fuente de efectividades; cobertura visible en escritorio sin abrir nada.

## E6 — Barra de acción: guardar, importar, copiar
**Objetivo:** saber siempre cuánto falta para poder registrar y por qué no se puede, con un toque para ir a arreglarlo.

- [x] 🔴 Test `components/builder/ActionBar.test.tsx` (nuevo): botón "Registrar equipo" con el primer bloqueo visible en la misma barra ("Falta 1 Pokémon", "Revisa 2 sets"); tocar el motivo selecciona el slot/regla culpable (`onJump`).
- [x] 🟢 Crear `ActionBar.tsx` fijo al pie del builder (escritorio) y sobre el `TabBar` (móvil, ver E1).
- [x] 🔴 Test: `blockers.ts` devuelve motivos con destino (`{ message, target: { slot?, field?, rule? } }`); los textos existentes no cambian.
- [x] 🟢 Extender `blockers.ts`.
- [x] 🔴 Test: "Importar" y "Copiar equipo" viven en un menú (`DropdownMenu`) de la barra; el textarea de paste solo aparece dentro de su hoja; la elección Reemplazar/Agregar se conserva (los 8 tests de `PasteIO` siguen verdes).
- [x] 🟢 Mover `PasteIO` a una hoja.
- [x] 🔴 Test: registrar con éxito → feedback de confirmación con `role="status"` y paso a `RosterView` con `Reveal`; error del servidor (`detail=code`) se traduce con `ruleMessages` y se muestra en la barra, no solo en un toast.
- [x] 🟢 Implementar.
- [x] 🔴 Test: `beforeunload` y el aviso de borrador recuperado siguen funcionando (los 10 tests de `TeamBuilder.draft` verdes).
- [x] 🟢 Reubicar el aviso de borrador como banda descartable sobre el tablero.

**Archivos:** `components/builder/{ActionBar,PasteIO,TeamBuilder}.tsx`, `lib/dex/blockers.ts`, `pages/TeamPage.tsx` (+tests).
**Aceptación:** tests verdes; el botón de guardar nunca queda lejos del editor; cada bloqueo lleva a su causa.

## E7 — Motion de la mesa y limpieza
**Objetivo:** que la mesa se sienta viva sin ruido, y dejar el código sin restos.

- [x] 🔴 Test `SlotBoard.motion.test.tsx`: agregar un slot entra con fade 150ms + `translateY` 4px (`AnimatePresence`, `layout="position"`, springs de `lib/motion.ts`); quitar sale más rápido que entra; con `mockReducedMotion(true)` solo fades.
- [x] 🟢 Implementar.
- [x] 🔴 Test guarda: nada del builder usa `transition-all`, `ease-in`, `scale(0)`, ni duraciones >300ms; el cambio de slot seleccionado por teclado no anima el contenido del editor.
- [x] 🟢 Corregir hallazgos.
- [x] 🔴 Test: el indicador de slot seleccionado usa `layoutId` (patrón de `SegmentedControl`) y `:active` con `press`.
- [x] 🟢 Implementar.
- [x] 🔴 Test grep: `useTeamChecklist`, `validateTeam`, `getActiveRules`, `PendingDot` y `ChecklistPanel` no se importan en ningún lado → borrar si es cierto.
- [x] 🟢 Eliminar código muerto; unificar título "Mi equipo" y tab "Equipo"; consolidar las dos tarjetas de "Rotaciones".
- [x] 🔵 Borrador (`lib/draft.ts`) también para agregar/reemplazar (clave con contexto), para que el descarte de hojas no pierda trabajo.

**Archivos:** `components/team/*`, `components/builder/*`, `lib/queries.ts`, `lib/api.ts`, `pages/TeamPage.tsx` (+tests).
**Aceptación:** tests verdes; guarda sin excepciones; sin código muerto.

## E8 — QA en navegador y cierre de motion
**Objetivo:** validar lo que jsdom no ve.

- [ ] [manual] `npm run dev`; con claude-in-chrome recorrer `/equipo` a 390px y 1280px, claro/oscuro, sin equipo / borrador / registrado.
- [ ] [manual] Armar 6 Pokémon con "agregar y seguir"; provocar cada regla fallida y comprobar que la acción lleva a la causa.
- [ ] [manual] Móvil: la barra inferior queda sobre el `TabBar`, no se tapa con teclado abierto ni en las hojas de agregar/reemplazar.
- [ ] [manual] `prefers-reduced-motion`, throttling de red (dex y learnsets lentos: skeleton, sin vacíos falsos) y teclado completo (foco visible, atajos sin animación).
- [ ] Revisión de movimiento sobre el diff completo con `emil-design-eng` (tabla Before/After); corregir en **un** lote; una segunda verificación y cierre. Correr `impeccable detect` sobre los archivos cambiados una sola vez.
- [ ] `npm test`, `npm run lint` y `npm run build` verdes (el lint tiene 4 errores preexistentes en `ETLCleanerPage`; no deben aumentar).

**Archivos:** ninguno nuevo (correcciones puntuales).
**Aceptación:** checklist completo; sin hallazgos "feel-breaking".

## Riesgos y decisiones abiertas
- **Reglas de liga vs. UI.** Marcar el tipo del mes como `fail` puede alarmar a quien lo ve rojo y aun así puede registrar (el servidor no lo exige). Mitigación: copy "Se exige al batallar" junto al estado; si luego el servidor lo exige, solo cambia el texto.
- **`checkSet` con `field`/`code`** toca el espejo de `rules.py`: se mantiene `message` idéntico y los 28 tests de `validate.test.ts` son la red de seguridad.
- **Reorden de slots** cambia el lineup; confirmar que `toPayload` conserva el orden al guardar (test en E2).
- **Hojas con `transform`** rompen `position: fixed`: por eso E1 manda la barra en línea dentro de las hojas.

## Verificación global
`cd web && npm test && npm run lint && npm run build`; luego E8 en navegador.
