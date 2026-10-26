# Plan TDD: rediseño UX/UI y motion del front BATS (`web/`)

## Context
El front (React 19, Vite, Tailwind 4, motion, shadcn/base-ui) tiene buenos fundamentos (tokens oklch, springs en `lib/motion.ts`, `press`, `material-*`, `--ease-ios`) pero se aplican de forma desigual: estados de carga que renderizan `null`, targets táctiles de 28-32px, reduced-motion parcial, estados que "saltan" sin transición, Home/Bans/Pokédex con jerarquía débil. Dirección (memoria del proyecto): Apple HIG / iOS 27, fluidez primero, mobile-first, animaciones sutiles y smooth. Esta sesión **solo documenta el plan**; no se implementa nada.

Skills al implementar: `impeccable` (leer craft-floor antes de cualquier edición UI), `emil-design-eng`, `apple-design`, `review-animations` (cierre de cada paquete con motion).

## Reglas del plan
- Cada **paquete (P#)** cabe en una sesión. Orden de ejecución P0 → P12; un commit por paquete (o por tarea si es grande). Si un paquete se desborda, se parte en P#a / P#b antes de continuar.
- **TDD**: por tarea, 🔴 escribir test que falla → 🟢 código mínimo → 🔵 refactor con tests en verde. No se escribe código de producción sin test rojo previo (salvo tareas marcadas `[manual]`, que se verifican en el navegador en P12).
- Infra existente: Vitest + jsdom + Testing Library + user-event, setup en `web/vitest.setup.ts`, config en `web/vite.config.ts` (`test`), ejemplo de estilo en `web/src/components/ui/combobox.test.tsx`. Comando: `cd web && npm test`; además `npm run lint` y `npm run build` al cerrar cada paquete.
- **Qué se testea en jsdom**: comportamiento, roles/ARIA, clases/atributos, presencia de skeleton/empty/error, navegación, teclado, y "guardas de fuente" (tests que leen CSS/TSX como texto y fallan si reaparecen `transition-all`, `ease-in`, `scale(0)`, duraciones >300ms). Lo visual/temporal real (fluidez, 60fps, layout) no se testea en jsdom → P12.
- Convenciones: UI en español; reutilizar `lib/motion.ts`, `press`, `material-*`, `States.tsx`, `DataList`, `SegmentedControl`, `ResponsiveSheet`; no duplicar springs ni easings.

## Mapa de paquetes
| P | Tema | Depende de |
| --- | --- | --- |
| P0 | Infra de tests + tokens de motion + guardas | — |
| P1 | Targets táctiles y reduced-motion global | P0 |
| P2 | Skeleton y transición carga → contenido | P0 |
| P3 | Motion de overlays y primitivas (toast, sheet, dialog, tooltip, collapsible, meter, tabs) | P0, P1 |
| P4 | Mi equipo A: carga y acciones por Pokémon | P1, P2 |
| P5 | Mi equipo B: resumen, reglas, add/remove, checklist | P3, P4 |
| P6 | Bans | P2, P3 |
| P7 | Pokédex y ficha de especie | P2 |
| P8 | Home | P2 |
| P9 | Stats | P2, P3 |
| P10 | Jugador y Blog | P2 |
| P11 | Navegación móvil, estados globales, limpieza | P1 |
| P12 | QA en navegador + review-animations final | todos |

---

## P0 — Infra de tests, tokens de motion y guardas
**Objetivo:** dejar helpers de test y tokens de motion únicos para que el resto del plan sea testeable y cohesivo.

- [x] 🔴 Test `lib/test-utils.test.tsx`: `renderWithProviders` envuelve en `QueryClientProvider` + `MemoryRouter`; `mockReducedMotion(true)` hace que `matchMedia('(prefers-reduced-motion: reduce)').matches` sea `true`.
- [x] 🟢 Crear `lib/test-utils.tsx` con ambos helpers (y mock de `matchMedia` si `vitest.setup.ts` no lo trae).
- [x] 🔴 Test `styles/tokens.test.ts` (lee `tokens.css` como texto): existen `--ease-out`, `--ease-ios`, `--duration-fast: 120ms`, `--duration-base: 200ms`, `--duration-slow: 300ms`.
- [x] 🟢 Añadir esos tokens en `styles/tokens.css` (junto a `--ease-ios`, línea ~175).
- [x] 🔴 Test `styles/motion-guard.test.ts`: recorre `src/**/*.{tsx,css}` (excluye `components/ui/sidebar.tsx`, `pages/admin/**`, `LandingPage`, `Scanner`) y falla ante `transition-all`, `ease-in`(no `ease-in-out`), `scale(0)`/`zoom-in-0`, `duration-500`+.
- [x] 🟢 Dejar la guarda en rojo conocido: lista de excepciones explícita con TODO por archivo; cada paquete posterior elimina su excepción.
- [x] 🔵 Documentar en `web/README` (sección "Motion") los tokens y la guarda.

**Archivos:** `web/src/lib/test-utils.tsx` (+test), `web/src/styles/tokens.css`, `web/src/styles/tokens.test.ts`, `web/src/styles/motion-guard.test.ts`, `web/vitest.setup.ts`.
**Aceptación:** `npm test` verde; tokens existen; la guarda lista las violaciones pendientes como excepciones nombradas.

## P1 — Targets táctiles y reduced-motion global
**Objetivo:** todo control pulsable tiene ≥44px de área táctil y la preferencia de reduced-motion se respeta en animaciones **y** transiciones.

- [x] 🔴 Test `ui/button.test.tsx`: variantes `xs` e `icon-xs` exponen hit-area ≥44px (clase de hit-area `before:` / `min-h` documentada) sin cambiar el tamaño visual.
- [x] 🟢 Ajustar `ui/button.tsx:25` (cva) con pseudo-elemento de hit-area.
- [x] 🔴 Test `components/app/SegmentedControl.test.tsx`: cada opción tiene hit-area ≥44px, `role="radio"`/`tab` correcto, flechas cambian selección.
- [x] 🟢 Ajustar `SegmentedControl.tsx` (`min-h-8` → visual 32px + hit-area 44px).
- [x] 🔴 Test `styles/reduced-motion.test.ts` (texto de `tokens.css`/`index.css`): bloque `@media (prefers-reduced-motion: reduce)` incluye `transition-duration` ≈0 para transform, `.press:active{transform:none}`, `animate-pulse`/`animate-spin` sin movimiento.
- [x] 🟢 Implementar el bloque en `tokens.css` (~350-356) y `index.css:51-56`.
- [x] 🔴 Test `components/app/Meter.test.tsx`: con `mockReducedMotion(true)` no tiene clase de transición; con motion normal usa `duration-300 ease-ios` (no `duration-500 ease-out`).
- [x] 🟢 Corregir `Meter.tsx:23`.
- [x] 🔵 Quitar de la guarda (P0) las excepciones resueltas.

**Archivos:** `ui/button.tsx`, `components/app/{SegmentedControl,Meter}.tsx`, `styles/tokens.css`, `index.css`, tests nuevos junto a cada uno.
**Aceptación:** tests verdes; `Meter` ≤300ms; reduced-motion cubre transiciones; sin cambios visuales visibles a 100% de zoom.

## P2 — Skeleton y transición carga → contenido
**Objetivo:** ninguna vista muestra `null`, vacío engañoso o salto brusco mientras carga; el contenido entra con fade corto.

- [x] 🔴 Test `ui/skeleton.test.tsx`: `Skeleton` es `aria-hidden`, usa pulso lento (>=1.5s) y se detiene con reduced-motion.
- [x] 🟢 Ajustar `ui/skeleton.tsx:7`.
- [x] 🔴 Test `components/app/Reveal.test.tsx` (nuevo): `<Reveal>` aplica `animate-in fade-in-0 duration-200` al montar y nada si ya estaba montado (no re-anima en refetch).
- [x] 🟢 Crear `components/app/Reveal.tsx` (envoltorio mínimo, usa tokens P0).
- [x] 🔴 Test `components/app/States.test.tsx`: `EmptyState`/`ErrorState` ya existentes + nuevo `LoadingState` (skeleton genérico de lista) con roles `status`/`alert`.
- [x] 🟢 Añadir `LoadingState` a `States.tsx`.
- [x] 🔴 Test `components/app/Group.test.tsx`: `Group` acepta `loading` y `empty` y renderiza skeleton / `EmptyState` en vez de lista vacía.
- [x] 🟢 Implementar props en `Group` (`loading`, `loadingRows`, `empty`); `GroupRow` no necesitó cambios: el esqueleto es `LoadingState`.

**Archivos:** `ui/skeleton.tsx`, `components/app/{Reveal,States,Group}.tsx` (+tests).
**Aceptación:** tests verdes; API de `Group` documentada; sin cambios de página aún (se consumen en P4-P10).

## P3 — Motion de overlays y primitivas
**Objetivo:** toasts, sheets, dialogs, tooltips, collapsibles y tabs se mueven con curvas/duraciones correctas, salida más rápida que entrada, interrumpibles y accesibles.

- [ ] 🔴 Test `components/app/Toaster.test.tsx`: `useToast` muestra, apila y cierra; timer **se pausa en hover/focus** y se limpia al desmontar (fake timers); nueva entrada usa `transform` string (no `y`/`scale`).
- [ ] 🟢 Refactor `Toaster.tsx:97,114-118`: `transform: translateY(-12px) scale(.96)`, salida direccional, cleanup de timers.
- [ ] 🔴 Test guarda: `ui/sheet.tsx` no contiene `transition ` genérico; usa `transition-[transform,opacity]` y salida `duration-200`.
- [ ] 🟢 Ajustar `ui/sheet.tsx:56`.
- [ ] 🔴 Test guarda: `ui/dialog.tsx:56`, `ui/alert-dialog.tsx:53` tienen salida más corta que entrada (`data-closed:duration-100/120`).
- [ ] 🟢 Ajustar ambos.
- [ ] 🔴 Test `ui/tooltip.test.tsx`: sin selectores `data-[state=delayed-open]`; segundo tooltip se abre sin delay ni animación (`data-instant`).
- [ ] 🟢 Limpiar `tooltip.tsx:51` e implementar skip-delay (`Tooltip.Provider` con delay group).
- [ ] 🔴 Test `ui/collapsible.test.tsx`: abrir/cerrar alterna `aria-expanded` y clase de animación grid-rows; chevron con `duration-200 ease-ios`.
- [ ] 🟢 Implementar patrón `grid-template-rows 0fr→1fr` en `ui/collapsible.tsx` y chevron en `TeamBuilder.tsx:224`.
- [ ] 🔴 Test `ui/tabs.test.tsx`: indicador activo usa `layoutId` (reutiliza patrón de `SegmentedControl`); cambio por teclado funciona.
- [ ] 🟢 Reescribir indicador en `ui/tabs.tsx:59-62`.
- [ ] 🔵 Migrar `HoldButton.css` / `BranchedMenu.css` a los tokens de P0; quitar excepciones de la guarda.

**Archivos:** `components/app/Toaster.tsx`, `ui/{sheet,dialog,alert-dialog,tooltip,collapsible,tabs}.tsx`, `components/app/{HoldButton,BranchedMenu}.css`, `components/team/TeamBuilder.tsx` (solo chevron).
**Aceptación:** tests verdes; guarda sin excepciones para estos archivos; `review-animations` sobre el diff sin "feel-breaking".

## P4 — Mi equipo A: carga y acciones por Pokémon
**Objetivo:** `/equipo` nunca queda en blanco y cada Pokémon se gestiona con una acción principal clara y targets de 44px.

- [ ] 🔴 Test `pages/TeamPage.test.tsx`: mientras carga sesión/dex/equipo se ve `LoadingState` (no `body = null`, `TeamPage.tsx` ~370).
- [ ] 🟢 Reemplazar `null` por skeleton con `Reveal` al resolver.
- [ ] 🔴 Test `components/team/MonCard.test.tsx`: tarjeta expone botón principal "Editar" (≥44px) y menú "Más" con Copiar / Cambiar / Quitar; "Quitar" pide confirmación.
- [ ] 🟢 Reestructurar `MonCard.tsx` (acciones xs → principal + `DropdownMenu`).
- [ ] 🔴 Test: menú "Más" operable por teclado (Enter/flechas/Escape devuelve foco).
- [ ] 🟢 Ajustes de foco.
- [ ] 🔴 Test: confirmación de descarte solo aparece si hay cambios sin guardar.
- [ ] 🟢 Condicionar el `AlertDialog` de descarte.

**Archivos:** `pages/TeamPage.tsx`, `components/team/MonCard.tsx` (+tests), `components/app/States.tsx`.
**Aceptación:** tests verdes; sin estado en blanco; 1 acción visible + menú por tarjeta.

## P5 — Mi equipo B: resumen, reglas, add/remove, checklist
**Objetivo:** el usuario entiende de un vistazo si su equipo es válido y por qué, y los cambios del equipo se animan con suavidad.

- [ ] 🔴 Test `components/team/TeamSummary.test.tsx` (nuevo): chip "Válido / N errores", cobertura de tipos (usa `TypeBadge`), estados loading/vacío.
- [ ] 🟢 Crear `TeamSummary.tsx` y montarlo al inicio de `TeamPage`.
- [ ] 🔴 Test `components/team/RuleErrors.test.tsx`: errores de validación como lista (`role="list"`), cada uno con acción ("Ir al set"); entra con `fade-in-0` 150ms (`TeamBuilder.tsx:234,241`, `PasteIO.tsx:131`).
- [ ] 🟢 Implementar y reemplazar la caja de texto.
- [ ] 🔴 Test `RotationRules` (prosa `TeamPage.tsx` ~530): colapsado por defecto, 3 puntos clave visibles, expandible por teclado.
- [ ] 🟢 Convertir a `Collapsible` (P3).
- [ ] 🔴 Test `MonCard` list: al quitar un Pokémon desaparece con `AnimatePresence` (queda en DOM hasta `onExitComplete`), `layout="position"`; con reduced-motion sin movimiento.
- [ ] 🟢 Animar add/remove (fade 150ms + `translateY` 4px) usando springs de `lib/motion.ts`.
- [ ] 🔴 Test `ChecklistPanel.test.tsx`: estado pendiente es icono estático (sin `animate-pulse`); pass↔fail hace cross-fade 150ms.
- [ ] 🟢 Ajustar `ChecklistPanel.tsx:13,35`.
- [ ] 🔴 Test `RestrictionField.test.tsx`: switch con `duration-200 ease-ios` (`:61`).
- [ ] 🟢 Ajustar.

**Archivos:** `pages/TeamPage.tsx`, `components/team/{TeamSummary,RuleErrors,ChecklistPanel,RestrictionField,MonCard,TeamBuilder,PasteIO}.tsx` (+tests).
**Aceptación:** tests verdes; flujo registrar/editar sin saltos; `review-animations` limpio en el diff.

## P6 — Bans
**Objetivo:** votar es la acción dominante en móvil y la página nunca muestra vacío falso mientras carga.

- [ ] 🔴 Test `components/ban/VoteFlow.test.tsx`: durante verificación de sesión muestra skeleton (no `null`, `VoteFlow.tsx:38,51`).
- [ ] 🟢 Implementar skeleton.
- [ ] 🔴 Test: buscador muestra sugerencias/populares antes de escribir; filtros "≥1/3/5" con unidad ("votos").
- [ ] 🟢 Implementar.
- [ ] 🔴 Test: confirmación de voto cross-fade a estado "Voto enviado" (`VoteFlow.tsx:94`), anunciado con `role="status"`.
- [ ] 🟢 Implementar con `Reveal`.
- [ ] 🔴 Test `pages/BansPage.test.tsx`: orden DOM = (estado compacto, VoteFlow, ranking, radar); ranking en carga muestra skeleton, no "Aún no hay votos".
- [ ] 🟢 Reordenar/unificar títulos (`Group` vs `h2`), umbral 70% desde config/constante compartida.

**Archivos:** `pages/BansPage.tsx`, `components/ban/VoteFlow.tsx` (+tests).
**Aceptación:** tests verdes; sin vacío falso; umbral en un solo lugar.

## P7 — Pokédex y ficha de especie
**Objetivo:** encontrar una especie rápido (filtros, links reales) y entender sus datos sin ruido.

- [ ] 🔴 Test `pages/PokedexPage.test.tsx`: filtro por tipo reduce filas; filtro persiste en query string; selector de temporada.
- [ ] 🟢 Implementar filtros con `SegmentedControl`/chips.
- [ ] 🔴 Test `components/app/DataList.test.tsx`: fila renderiza `<a href>` en la celda de nombre (click medio/Ctrl abre pestaña); Enter y Space activan en tabla y cards (`DataList.tsx` ~151).
- [ ] 🟢 Implementar links reales y teclado.
- [ ] 🔴 Test: cards móviles muestran `Meter`; definición pick/bring accesible (tooltip/disclosure, no caption).
- [ ] 🟢 Implementar.
- [ ] 🔴 Test `pages/PokedexEntryPage.test.tsx`: sets bloqueados → `EmptyState` explicativo; rankings truncados a 5 con "Ver más".
- [ ] 🟢 Implementar con `Collapsible`.
- [ ] 🔴 Test: stagger 30ms máx. 8 filas solo en primera carga (no al ordenar/filtrar).
- [ ] 🟢 Implementar (clase de stagger controlada por flag `firstLoad`).

**Archivos:** `pages/{PokedexPage,PokedexEntryPage}.tsx`, `components/app/DataList.tsx` (+tests).
**Aceptación:** tests verdes; filas son links; sin re-animación al filtrar.

## P8 — Home
**Objetivo:** la portada responde "¿qué hago ahora?" con estado personal y el tipo del mes como protagonista.

- [ ] 🔴 Test `pages/HomePage.test.tsx`: con sesión muestra tarjeta personal (récord, estado de equipo, ban abierto); sin sesión, CTA de entrar.
- [ ] 🟢 Implementar tarjeta personal.
- [ ] 🔴 Test: tipo del mes aparece en el hero (antes del leaderboard); tiles son links a su detalle; sin subtítulo genérico.
- [ ] 🟢 Reordenar secciones, links en `StatTile`.
- [ ] 🔴 Test: leaderboard y MVP vacíos muestran `EmptyState`; cargando, skeleton.
- [ ] 🟢 Implementar con `Group loading/empty` (P2).
- [ ] 🔴 Test guarda: `HomePage.tsx:101` hover con movimiento usa `@media (hover:hover) and (pointer:fine)`.
- [ ] 🟢 Corregir; unificar `gap-8`.

**Archivos:** `pages/HomePage.tsx`, `components/app/StatTile.tsx` (+tests).
**Aceptación:** tests verdes; foco visible en tarjetas-link.

## P9 — Stats
**Objetivo:** la página larga se vuelve navegable y la tabla es usable en móvil.

- [ ] 🔴 Test `pages/StatsPage.test.tsx`: selector de temporada es `SegmentedControl`/menú accesible (no `<select>` nativo, `:187`); cambiar temporada muestra estado refreshing y luego `Reveal`.
- [ ] 🟢 Implementar.
- [ ] 🔴 Test: navegación interna (Tabla · MVP · Uso) con tabs de P3; contenido de cada tab se monta al seleccionar.
- [ ] 🟢 Implementar.
- [ ] 🔴 Test: en móvil, orden por chip ("Ordenar por") y cards con rank + `Meter`.
- [ ] 🟢 Implementar en `DataList` (opción `mobileSort`).
- [ ] 🔴 Test: gráfico usa también patrón/forma además de color (win rate ≥50%) y tick sizes desde tokens.
- [ ] 🟢 Implementar.

**Archivos:** `pages/StatsPage.tsx`, `components/app/DataList.tsx` (+tests).
**Aceptación:** tests verdes; `StatsPage` sigue sirviendo a admin sin regresión.

## P10 — Jugador y Blog
**Objetivo:** perfil y noticias consistentes con el resto del sistema.

- [ ] 🔴 Test `pages/PlayerPage.test.tsx`: `PageHeader` alineado a la grilla (no anidado en flex); batallas recientes son links a `BattleDetail`; back vuelve a la página previa (`navigate(-1)` con fallback `/stats`); selector de temporada.
- [ ] 🟢 Implementar.
- [ ] 🔴 Test `pages/BlogPage.test.tsx`: spotlight sin `blur-3xl`/`-mx-3`; filas con foco visible; estados loading/empty.
- [ ] 🟢 Implementar con tokens (`bg-primary/..` sin blur hardcodeado).
- [ ] 🔴 Test: posts muestran tags; guarda de hover.
- [ ] 🟢 Implementar.

**Archivos:** `pages/{PlayerPage,BlogPage,BlogPostPage}.tsx` (+tests).
**Aceptación:** tests verdes.

## P11 — Navegación móvil, estados globales y limpieza
**Objetivo:** navegar con una mano sin saturación y sin código muerto.

- [ ] 🔴 Test `components/app/AppShell.test.tsx`: tab bar con ≤5 destinos, labels cortos, cada tab ≥44px, `aria-current`, re-tap en activa hace scroll top.
- [ ] 🟢 Reorganizar `AppShell.tsx:160` (fusionar/“Más”).
- [ ] 🔴 Test `PageTransition.test.tsx`: no anima entre rutas hermanas de primer nivel ni en back/forward; sí en entrada a detalle; reduced-motion = fade.
- [ ] 🟢 Ajustar `PageTransition.tsx:65`.
- [ ] 🔴 Test: búsqueda global (atajo `/` o botón) abre `Combobox` de especies/jugadores; sin animación de apertura vía teclado.
- [ ] 🟢 Implementar reutilizando `ui/combobox.tsx`.
- [ ] 🔴 Test: estado offline/error de red muestra `ErrorState` con "Reintentar"; onboarding de primera visita se muestra una vez (localStorage con try/catch).
- [ ] 🟢 Implementar.
- [ ] 🔴 Test: `LandingPage`, `Scanner` y dependencia `ogl` no se importan en ningún lado (grep-test) → borrar.
- [ ] 🟢 Eliminar archivos y dependencia; `npm run build` verde.

**Archivos:** `components/app/{AppShell,PageTransition}.tsx`, `pages/LandingPage.tsx` y `Scanner` (borrar), `package.json`.
**Aceptación:** tests verdes; bundle sin `ogl`.

## P12 — QA en navegador y cierre de motion
**Objetivo:** validar lo que jsdom no ve: fluidez, layout, táctil y contraste.

- [ ] [manual] `npm run dev`; con claude-in-chrome revisar Home, Equipo (con/sin sesión), Bans, Pokédex + ficha, Stats, Jugador a 390px y 1280px, claro/oscuro.
- [ ] [manual] Activar `prefers-reduced-motion` y recorrer los mismos flujos: sin movimiento, solo fades.
- [ ] [manual] Throttling de red: sin flashes vacíos; skeleton → contenido con fade.
- [ ] [manual] Teclado: foco visible, sin animaciones en atajos.
- [ ] Ejecutar `review-animations` sobre el diff completo; corregir en **un** lote; una segunda verificación y cierre.
- [ ] `npm test`, `npm run lint`, `npm run build` verdes; la guarda de P0 sin excepciones.

**Archivos:** ninguno nuevo (correcciones puntuales).
**Aceptación:** checklist anterior completo; sin hallazgos "feel-breaking".

## Verificación global
`cd web && npm test && npm run lint && npm run build`; luego P12 en navegador.
