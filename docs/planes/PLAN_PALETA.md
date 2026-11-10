# Paleta "Tipo del mes vivo" — plan TDD con evidencia visual

> Leyenda (la misma de `PLAN_REDESIGN_2.0.md`): 🔴 test que falla primero · 🟢 implementación mínima para pasar · 🔵 refactor/limpieza · 📸 evidencia con Claude in Chrome · ✅ criterio de aceptación.
> Una fase = un commit en `redesign-2.0`. No se pasa a la siguiente con checks sin marcar.

> **Estado:** F1–F5 implementadas y commiteadas; F0/F6 parciales (ver `docs/evidencia-paleta/EVIDENCIA_PALETA.md`, incluye desviaciones); F7: vitest, build y lint verdes.

## Context
La paleta actual (`web/src/styles/tokens.css`) es Apple HIG literal: neutros gris-azulado (hue 264, chroma ≈ 0.005), acento `systemBlue` (`oklch(.55 .2 258)`), estados de sistema y `--chart-1..6` genéricos. Es el "azul + gris" por defecto de una app generada por IA y no dice nada de la liga. Lo único con identidad son los 18 `--type-*`, hoy solo en etiquetas.

Decisiones del usuario: dirección **Tipo del mes vivo**; alcance **solo tokens de color** (sin tipografía, materiales, radios ni layout).

Idea: base cálida fija (papel/tinta) + acento primario = color del `type_of_month` de la temporada activa (`useActiveSeason().data.type_of_month`, ej. `"Ice"` → `--type-ice`). Rojo laca Pokédex como respaldo sin temporada y como marca (favicon, theme-color).

## Diseño de la paleta (valores de partida; se afinan contra el test de contraste)
- **Neutros claro:** `background oklch(.962 .012 85)`, `card .985 .007 85`, `foreground oklch(.22 .03 45)`, `muted-foreground oklch(.46 .02 60)`.
- **Neutros oscuro (grafito cálido):** `background oklch(.16 .012 50)`, `card .205 .014 50`, `popover .24`, `foreground oklch(.95 .012 85)`.
- **Acento dinámico:** `[data-month-type="<tipo>"]` define `--month-h/-c/-l` y `--month-fg`; `--primary`, `--ring`, `--sidebar-primary`, `--info`-no (info es fijo) se derivan. Sin atributo: laca `oklch(.5 .18 27)`. Tipos claros (electric, ice, fairy, steel, flying, ground, bug, grass…) usan L alto + texto tinta.
- **Semánticos fijos:** success = verde LCD Pokédex (h≈145); warning = oro de liga (h≈80–85); destructive = laca (h≈28); info = azul linterna apagado (h≈235, c ≤ .09, para no chocar con mes Agua).
- **Gráficos:** `chart-1 = var(--primary)`; `chart-2..6` fijos (laca, oro, LCD, glaciar, uva-fantasma/brasa), distinguibles entre sí y sobre `card`. Se respetan `chart-6` (≥50 %) y `chart-1` (rayado) de `StatsPage.tsx:152-170`.
- No cambian: nombres shadcn, `--type-*`, motion, tipografía, blur/saturate de materiales (solo sus colores).

## Convenciones de evidencia (Claude in Chrome)
- Carpeta de reporte: `bats/docs/evidencia-paleta/` con `EVIDENCIA_PALETA.md` (tabla de la matriz con ✅/❌ y lecturas numéricas) + los GIF que se puedan guardar con `gif_creator` (nombres: `paleta_cambio-de-mes.gif`, `paleta_claro-oscuro.gif`).
- Las capturas de `computer` se ven en la conversación; **no hay garantía de que se guarden como archivo**. Por eso cada captura va acompañada de una **lectura numérica** hecha con `javascript_tool` (`getComputedStyle` de `--primary`, `--background`, contraste calculado) que sí queda escrita en `EVIDENCIA_PALETA.md`.
- Setup de sesión: `tabs_context_mcp` → `tabs_create_mcp` (pestaña nueva, no reutilizar) → `navigate` a `http://localhost:5173`. API en :8001 ya corriendo; `npm run dev` en `bats/web`.
- Cambiar tema: `javascript_tool` → `document.documentElement.classList.toggle('dark')`. Cambiar mes: `document.documentElement.dataset.monthType = 'fire'`. Viewports: `resize_window` 390×844 (móvil) y 1280×800 (escritorio).
- Revisar `read_console_messages` (patrón `error|warn`) en cada página: ✅ cero errores nuevos.
- No disparar diálogos del navegador (`alert/confirm`); el Admin requiere sesión: si el magic link no está disponible, queda fuera de la matriz y se anota.

---

## F0 — Línea base "antes" (sin tocar código)
- [ ] 📸 Capturar Home, Stats, Equipo, Pokédex en claro/oscuro × móvil/escritorio con la paleta actual (8 combinaciones por página, mínimo Home y Stats completas).
- [ ] 📸 Lectura numérica: `getComputedStyle(document.documentElement)` de `--primary`, `--background`, `--card`, `--foreground` (claro y oscuro) → tabla "antes" en `EVIDENCIA_PALETA.md`.
- [ ] Commit aparte con el estado de `npm test` previo (línea base de fallos preexistentes: 4 de lint en ETLCleanerPage).
- ✅ Existe `EVIDENCIA_PALETA.md` con la sección "Antes" completa.

## F1 — Neutros cálidos y contraste (tokens base)
- [ ] 🔴 En `web/src/styles/tokens.test.ts`: helper que parsea `oklch(...)` desde `leerFuente("styles/tokens.css")` y calcula ratio de contraste (conversión OKLCH→sRGB).
- [ ] 🔴 Test: para claro y oscuro, `foreground/background`, `card-foreground/card`, `muted-foreground/background`, `popover-foreground/popover`, `secondary-foreground/secondary`, `accent-foreground/accent` ≥ 4.5:1.
- [ ] 🔴 Test: ningún neutro (`background`, `card`, `muted`, `sidebar`) conserva hue 264 (anti-regresión del azul Apple); el bloque `prefers-contrast: more` tampoco.
- [ ] 🟢 Reescribir neutros de `:root`, `.dark`, `sidebar-*`, `material-*`, bordes/sombras y el bloque `prefers-contrast: more`.
- [ ] 🔵 `index.html:8-9` `theme-color` a los nuevos fondos (papel / grafito).
- [ ] 📸 Home + Stats claro/oscuro, móvil/escritorio; lectura numérica de neutros; `read_console_messages`.
- ✅ Tests F1 verdes; ningún texto pierde legibilidad en las capturas; fondos cálidos visibles (no gris-azulado) en ambos temas.

## F2 — Semánticos y gráficos
- [ ] 🔴 Test: `success/warning/destructive/info` y sus `*-soft`: texto sobre `*-soft` ≥ 4.5:1 y color sobre `card` ≥ 3:1 (UI), claro y oscuro.
- [ ] 🔴 Test: `chart-1..6` ≥ 3:1 sobre `card` en ambos temas y a pares con ΔE (distancia OKLab) ≥ umbral mínimo → distinguibles.
- [ ] 🔴 Test: `PlayerAvatar` TONES (`chart-n/15` sobre `chart-n`) cumple ≥ 4.5:1 en ambos temas.
- [ ] 🟢 Nuevos `success/warning/destructive/info`, `*-soft` y `chart-*`; `chart-1 = var(--primary)`.
- [ ] 📸 Stats (barras ≥50 % y rayado), avatares en Home/Ranking, toasts de éxito/error (disparar uno de cada con `javascript_tool` solo si existe helper de test; si no, anotar).
- ✅ Gráfico de Stats sigue legible sin depender solo del color (patrón rayado intacto); avatares distinguibles.

## F3 — Acento dinámico por tipo (18 bloques)
- [ ] 🔴 Test: existen 18 `[data-month-type="…"]` y sus nombres == lista de `--type-*`.
- [ ] 🔴 Test: para cada tipo × {claro, oscuro}, `primary/primary-foreground` ≥ 4.5:1 y `primary/background` ≥ 3:1; `ring/background` ≥ 3:1.
- [ ] 🔴 Test: sin atributo, `--primary` = laca por defecto (respaldo).
- [ ] 🟢 Bloques por tipo en `tokens.css` + derivación de `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring`, `::selection` (ya usa `var(--primary)`).
- [ ] 🔵 Afinar L/C de los tipos que fallen (eléctrico, hielo, hada…) hasta que pasen; documentar el override en comentario.
- [ ] 📸 Home en claro/oscuro con `monthType` = `ice`, `fire`, `grass`, `electric`, `dark` y sin atributo (6 × 2 temas, escritorio; móvil para `ice` y `electric`). Lectura numérica del `--primary` en cada uno.
- [ ] 📸 `gif_creator` (`paleta_cambio-de-mes.gif`): recorrido por los 6 meses con frames extra antes/después.
- ✅ Los 18 tipos pasan contraste; botón primario, foco (`:focus-visible`), selección de texto y pestañas activas cambian de color al cambiar el atributo; el bloque `electric` muestra texto oscuro legible.

## F4 — `MonthTheme` (cableado a la temporada activa)
- [ ] 🔴 `web/src/components/MonthTheme.test.tsx`: con `useActiveSeason` mockeado `{type_of_month:"Ice"}` → `<html data-month-type="ice">`.
- [ ] 🔴 Tests: valor desconocido/`null`/sin temporada → sin atributo; al desmontar se limpia; `localStorage` que lanza no rompe el render; si `localStorage` guarda `fire`, `main.tsx` lo aplica antes del primer render (función pura `aplicarMesGuardado()` testeable).
- [ ] 🟢 Crear `MonthTheme.tsx`, montarlo en `App.tsx`, persistir último valor (try/catch), aplicar en `main.tsx` antes de renderizar.
- [ ] 🔵 Sin animación del cambio (ocurre ~1 vez al mes; regla de frecuencia de emil-design-eng). Verificar que `motion-guard.test.ts` sigue verde.
- [ ] 📸 Con la API real (:8001): confirmar que el atributo coincide con la temporada activa; recargar con red lenta/`localStorage` presente → sin parpadeo del azul/laca en el primer frame (captura inmediata tras `navigate`).
- ✅ El mes mostrado en el hero (tipo del mes) y el color de acento coinciden; sin temporada activa la app usa laca y no da error.

## F5 — Colores fuera del sistema y marca
- [ ] 🔴 Test (en `cleanup.test.ts`): ningún `#hex`/`rgb()` en `src/**` salvo `tokens.css` y los logos de Google en `SignInCard.tsx` (lista blanca explícita).
- [ ] 🟢 `HoldButton.tsx/.css` (`#5227ff`, `#27272a`, `#f5f5f5`) y `BranchedMenu.tsx/.css` (`#f5f5f5`, `#3f3f46`) → `var(--primary)`, `var(--card)`, `var(--foreground)`, `var(--border)`; `favicon.svg` a laca.
- [ ] 🔵 Revisar los ~38 usos de `bg-primary/text-primary/border-primary/ring-primary` por contraste con el nuevo matiz; sin tocar layout.
- [ ] 📸 HoldButton y BranchedMenu en la página donde se usan (claro/oscuro, mes `ice` y `fire`); pestaña del navegador con el nuevo favicon.
- ✅ Test de hex en verde; ninguna página muestra el violeta `#5227ff` ni grises zinc.

## F6 — Recorrido final de evidencia (una sola ronda por lotes)
- [ ] 📸 Matriz: Home, Stats, Equipo, Pokédex, Bans, Jugador, Blog × {claro, oscuro} × {390 px, 1280 px} con mes `ice`. (Admin solo si hay sesión.)
- [ ] 📸 Estados: foco con teclado (Tab) en un botón y un input, `:hover` en escritorio, estado deshabilitado, skeleton, error y vacío.
- [ ] 📸 `prefers-contrast: more` y `prefers-reduced-transparency` (emulación vía DevTools si la extensión lo permite; si no, anotar "no verificable por la extensión").
- [ ] 📸 `gif_creator` (`paleta_claro-oscuro.gif`): alternancia de tema con View Transitions.
- [ ] Rellenar `EVIDENCIA_PALETA.md`: tabla página × tema × viewport con ✅/❌, lecturas numéricas "antes/después", lista de problemas y su corrección (un solo lote de correcciones, máximo una segunda ronda).
- [ ] `impeccable detect --json` sobre los archivos tocados, una vez.
- ✅ Todas las celdas de la matriz ✅ o con excepción justificada; `read_console_messages` sin errores nuevos; contraste leído en vivo ≥ AA en los elementos revisados.

## F7 — Puertas de salida
- [ ] `cd bats/web && npx vitest run` verde.
- [ ] `npm run build` (`tsc -b && vite build`) verde.
- [ ] `npm run lint`: solo los 4 errores preexistentes de ETLCleanerPage.
- [ ] Actualizar `PLAN_REDESIGN_2.0.md` (nueva sección "Paleta" con enlace a este plan y a `EVIDENCIA_PALETA.md`).
- [ ] Commit(s) en `redesign-2.0` (no `git push`; sigue pendiente).
- ✅ Criterio global: ningún token de color con hue 264, 18 meses accesibles, evidencia visual y numérica archivada.

## Archivos críticos
`web/src/styles/tokens.css`, `web/src/styles/tokens.test.ts`, `web/src/styles/cleanup.test.ts`, `web/src/components/MonthTheme.tsx` (+test), `web/src/App.tsx`, `web/src/main.tsx`, `web/index.html`, `web/public/favicon.svg`, `web/src/components/app/{HoldButton,BranchedMenu}.{tsx,css}`, `web/src/components/app/PlayerAvatar.tsx` (solo verificación), `web/src/pages/StatsPage.tsx` (solo verificación), `bats/docs/evidencia-paleta/EVIDENCIA_PALETA.md`.
Reutilizar: `leerFuente` (`styles/source.ts`), `useActiveSeason` (`lib/queries.ts:84`), pares `--type-*-fg` ya validados.

## Fuera de alcance
Tipografía, materiales/blur, radios, layout, P12 (QA final y animaciones) y `git push`.
