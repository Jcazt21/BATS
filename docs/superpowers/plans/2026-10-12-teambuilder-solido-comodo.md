# Teambuilder sólido y cómodo — Plan de implementación

> **Para quien ejecute esto:** usar superpowers:executing-plans o subagent-driven-development.
> Las tareas van en orden; cada una termina con test verde (`npm test` en `web/`) y commit en español
> que acaba con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Usar TDD
> (superpowers:test-driven-development). Código, comentarios y UI **en español**, 2 espacios.

## Context

La revisión del 2026-10-12 del teambuilder web (`web/src/components/builder/*`, `web/src/lib/dex/*`,
`web/src/pages/TeamPage.tsx`) encontró fallos reales y fricción al armar el equipo. El usuario
eligió dos frentes: **que sea sólido** (Fase A) y **que sea más cómodo de armar** (Fase B).
Quedan fuera: planificador de lineup, cobertura ofensiva, datos de uso de la liga, reordenar el
equipo (el servidor ordena por `added_at`, así que reordenar no persiste) y conservar
apodo/género/shiny/nivel (ni `BuilderMon` ni `PokemonPayload` los tienen).

Hallazgos que motivan cada tarea:
- `useLearnset` devuelve `[]` mientras carga y `checkSet` lo toma como "no aprende nada": salen
  errores falsos al importar. Si el fetch falla, la promesa no tiene `catch`, los errores falsos
  se quedan y no hay forma de reintentar.
- El botón Guardar solo mira `checkSet` (`teamOk`, `TeamBuilder.tsx:76`). Ignora las reglas de
  conjunto que el servidor **sí** rechaza (color, generación, egg group, item clause, no legal, UB,
  baneados) y nunca explica por qué está apagado.
- `type_of_month` es **informativo a propósito** (docstring de `bats_core/rules.py::check_team`:
  "el registro NO lo exige; lo hace Showdown"), pero el checklist lo pinta igual que una regla
  que bloquea.
- El servidor responde 422 con códigos crudos (`missing_color:red`, `banned:Garchomp`,
  `item_clause:Leftovers`) y `errorMessage` (`lib/http.ts:71`) los muestra tal cual.
- `TeamBuilder.tsx:113-131` mete `<MonCard>`, que ya es un `<li>` con botones, dentro de un
  `<li><button>`: queda un botón dentro de otro y un `li` dentro de otro.
- El equipo solo vive en `useState`: recargar, cerrar el sheet o importar un paste borra el trabajo
  sin avisar. `key={i}` en la lista.
- En `SetEditor` no se puede **vaciar** un movimiento, el objeto, la habilidad ni la naturaleza
  (`Combobox` solo elige), y un movimiento elegido sigue apareciendo en los otros slots.
- `SpeciesPicker` solo ofrece en la UI el filtro de tipo, aunque `searchSpecies` ya soporta
  gen/color/eggGroup. Corta en 60 resultados sin avisar, no ordena y solo muestra la primera regla
  que falta.

---

# Fase A — Sólido

### Task A1: Learnsets con estado de carga y error

**Files:** `web/src/lib/dex/useLearnset.ts`, `web/src/lib/dex/validate.ts`,
`web/src/components/builder/SetEditor.tsx`, `web/src/components/builder/TeamBuilder.tsx`,
`web/src/pages/TeamPage.tsx` (EditSetForm), tests: `validate.test.ts`, nuevo `useLearnset.test.ts`,
actualizar el mock de `TeamBuilder.test.tsx`.

- `checkSet(dex, learnset: string[] | null, mon)`: con `null` (aún no cargado) **omite** solo la
  comprobación "no aprende"; las demás (repetidos, >4, habilidad, objeto, EVs/IVs) siguen.
- `useLearnset(id)` → `{ learnset: string[] | null, error: Error | null, retry: () => void }`.
  `null` mientras carga. Captura el rechazo con `catch`. `retry` sube un contador del efecto;
  `learnsets.ts::loadBucket` ya borra de la caché el bucket que falló, así que reintentar vuelve
  a pedirlo.
- `useLearnsets(ids)` → `{ map, pending: boolean, error, retry }` con la misma lógica.
- `SetEditor`: si `error`, muestra junto a Movimientos "No se pudieron cargar los movimientos" con
  un botón Reintentar (mismo tono que `ErrorState` de `components/app/States`). Mientras carga, los
  combobox de movimiento quedan `disabled` con el placeholder "Cargando movimientos…".
- Tests: `checkSet` con `null` no da "no aprende"; un hook con fetch rechazado expone `error` y
  `retry` vuelve a pedir el bucket.

### Task A2: Guardado coherente con el servidor y que explique por qué no se puede

**Files:** `web/src/lib/api.ts` (`ChecklistRow`), `web/src/lib/dex/validate.ts`,
nuevo `web/src/lib/dex/blockers.ts` (+ test), `web/src/components/team/ChecklistPanel.tsx`,
`web/src/components/builder/TeamBuilder.tsx`.

- `ChecklistRow` suma `blocking?: boolean` (por defecto se trata como `true`). `checkTeam` marca
  la fila `type_of_month` con `blocking: false`. `ChecklistPanel` la pinta como informativa
  (icono de info y texto "Se exige al batallar, no al registrar") en vez de en rojo.
- `blockers.ts::saveBlockers({ team, rows, setErrors, learnsetsPending })` es una función pura que
  devuelve una lista de motivos en texto: "El equipo está vacío", "Comprobando movimientos…",
  "Garchomp: 2 problemas en el set", y la etiqueta de cada fila con `!ok && blocking !== false`.
- `TeamBuilder`: `canSave = saveBlockers(...).length === 0`. Debajo del botón deshabilitado se
  listan los motivos (`text-footnote`, como máximo 3 y luego "y N más").
- En la lista de pokémon, cada tarjeta con errores en su set lleva un punto/insignia "N problemas"
  (va con A4).
- Tests: `saveBlockers` cubre equipo vacío, learnsets pendientes, set con errores, regla de color
  que bloquea y tipo del mes que **no** bloquea. Test de `TeamBuilder`: botón deshabilitado con
  el motivo visible.

### Task A3: Errores del servidor legibles

**Files:** nuevo `web/src/lib/dex/ruleMessages.ts` (+ test), `TeamBuilder.tsx`, `TeamPage.tsx`.

- `describeRuleCode(code: string): string | null` traduce los códigos de `check_team` y de los
  endpoints de equipo: `missing_color:x`, `missing_generation:n`, `missing_egg_group:x`,
  `missing_type:x`, `item_clause:a,b`, `not_legal:...`, `ultra_beast:...`, `banned:...`,
  `max_paradox:n/m` (y pseudo/restricted). Reusa los textos de `buildHint`/`checkTeam` para que
  cliente y servidor digan lo mismo. Con un código desconocido devuelve `null`.
- `teamErrorMessage(e)`: si es `ApiError` 422 y `describeRuleCode(e.detail)` no es `null`, usa esa
  traducción; si no, `errorMessage(e)` (`lib/http.ts`). Se usa en `TeamBuilder.save` y
  `EditSetForm.save`.
- Tests: tabla de códigos → mensajes; un código desconocido cae al detalle original.

### Task A4: Lista del equipo accesible (sin botón dentro de botón)

**Files:** `web/src/components/team/MonCard.tsx`, `TeamBuilder.tsx`, test de MonCard.

- `MonCard` suma dos props opcionales: `onSelect?: () => void` y `selected?: boolean`. Con
  `onSelect`, la cabecera (sprite, nombre y tipos) se pinta como `<button aria-pressed>` y las
  `actions` quedan fuera de ese botón. Sin `onSelect` se comporta igual que hoy, así que
  `TeamPage.tsx:170` y `PlayerPage` no cambian.
- `TeamBuilder` pinta `<MonCard onSelect selected …>` directo dentro del `<ul>`, sin el
  `<li><button>` envolvente. El anillo de selección pasa a `MonCard` (`selected` → `ring-2 ring-primary`).
- Claves estables: el estado interno pasa a `{ uid: string; mon: BuilderMon }[]`
  (`crypto.randomUUID()`), y `onSave` sigue recibiendo `BuilderMon[]`.
- Test: no hay ningún `button` dentro de otro `button`; quitar un pokémon conserva la selección
  correcta.

### Task A5: No perder el trabajo

**Files:** nuevo `web/src/lib/draft.ts` (+ test), `TeamBuilder.tsx`, `PasteIO.tsx`, `TeamPage.tsx`.

- **Borrador del registro.** `draft.ts` ofrece `loadDraft(key)`, `saveDraft(key, team)` y
  `clearDraft(key)`. Usa `localStorage` dentro de `try/catch`, igual que `lib/theme.ts`, y guarda
  `{ savedAt, team }`. La clave es `bats:teambuilder:<season_id>:<username>`. `TeamBuilder` suma
  `draftKey?: string`: autoguarda con debounce de unos 500 ms, restaura al montar si `initial`
  está vacío y muestra el aviso "Recuperamos tu borrador del {fecha}" con el botón Descartar.
  Borra el borrador cuando `onSave` termina bien. Solo `Register` pasa `draftKey`.
- **Aviso al salir.** `TeamBuilder` suma `onDirtyChange?(dirty)`. En `TeamPage`, los sheets de
  Agregar y Reemplazar y el de Editar set (`EditSetForm`, que compara con el set original)
  interceptan `onOpenChange(false)` cuando hay cambios. Abren un `AlertDialog` ("¿Descartar los
  cambios?") con los componentes `alert-dialog` que ya están importados en `TeamPage`. En
  `Register`, si hay cambios sin guardar, se añade `beforeunload`.
- **Importar sin pisar.** En `PasteIO`, si el equipo no está vacío, pide confirmación en línea:
  "Esto reemplaza tus N pokémon" con los botones **Reemplazar** y **Agregar al final** (este
  último solo si cabe en `maxSize`). Además omite las especies ya presentes y lo avisa.
  `onImport` recibe `(mons, mode: "replace" | "append")`.
- Tests: `draft.ts` aguanta `localStorage` que lanza o que viene vacío; `TeamBuilder` restaura el
  borrador y lo borra al guardar; `PasteIO` ofrece "Agregar al final" solo si cabe.

---

# Fase B — Más cómodo de armar

### Task B1: Selectores que se pueden vaciar y movimientos más claros

**Files:** `web/src/components/ui/combobox.tsx`, `SetEditor.tsx`, `SetEditor.test.tsx`.

- `Combobox` suma `onClear?: () => void`. Si hay `value`, muestra un botón "×"
  (`aria-label="Quitar"`). Vale para todos los usos del Combobox; los demás no cambian.
- `SetEditor`: `onClear` en objeto, habilidad, naturaleza y en cada slot de movimiento. Al vaciar
  un slot de movimiento se quita del array sin dejar huecos.
- Cada slot filtra los movimientos ya elegidos en los otros slots.
- Ítems de movimiento: `icon` = color/insignia del tipo (clase `type-<t>` como en
  `SpeciesPicker`); `sublabel` = "Físico · 100 · 100% · STAB" (STAB si el tipo coincide con el de
  la especie); `keywords` = tipo, categoría y `shortDesc`, así que buscar "fuego" o "prioridad"
  filtra. La `shortDesc` del movimiento elegido se ve debajo del slot.
- Tests: vaciar un movimiento, el filtro de duplicados y la marca STAB.

### Task B2: Buscador de especies completo

**Files:** `web/src/lib/dex/snapshot.ts` (`searchSpecies` + sort, test), `SpeciesPicker.tsx`,
`TeamBuilder.tsx` (`buildHint` → `buildHints`).

- Filtros en la UI: generación (1–9), color y egg group como `<select>`, con los valores únicos
  sacados del dex (`useMemo`), además de los chips de tipo que ya existen. Botón "Limpiar filtros"
  con contador de filtros activos.
- "Solo legales en la liga" **activado por defecto**: las especies ilegales no se pueden registrar.
- Orden: Nombre · Nº Pokédex · BST · Velocidad. Se añade `sort?: "name" | "num" | "bst" | "spe"`
  a `searchSpecies`.
- Cuando el resultado pasa de 60, se avisa: "Mostrando 60 de N — afina la búsqueda".
- `buildHints` devuelve **todas** las reglas que faltan (tipo del mes, color, generación, egg
  group) y el picker pinta un chip por cada una.
- Tests: `searchSpecies` con sort y filtros combinados; `buildHints` con varias reglas faltantes.

### Task B3: EVs y stats más fáciles de leer

**Files:** `EVEditor.tsx`, `SetEditor.tsx`, test nuevo `EVEditor.test.tsx`.

- Presets en `EVEditor`: "Atacante físico" (252 Atk / 252 Spe / 4 HP), "Atacante especial"
  (252 SpA / 252 Spe / 4 HP), "Muro físico" (252 HP / 252 Def / 4 SpD), "Muro especial"
  (252 HP / 252 SpD / 4 Def) y "Limpiar". Cada preset reemplaza los EVs y no toca los IVs.
- El contador pasa a mostrar "quedan N" además de "total/510".
- En el resumen de stats (`SetEditor`), la stat que sube la naturaleza va en verde con ↑ y la que
  baja en rojo con ↓. Se usan tokens del tema, no colores fijos.
- Tests: aplicar un preset y el marcado ↑/↓ según la naturaleza.

---

## Funciones existentes a reutilizar

- `searchSpecies`, `speciesById`, `toId` — `web/src/lib/dex/snapshot.ts`
- `checkTeam`, `checkSet` — `web/src/lib/dex/validate.ts` (espejo de `bats_core/rules.py`: no se
  inventan reglas nuevas en el cliente)
- `loadLearnset` y la limpieza de caché ante fallo — `web/src/lib/dex/learnsets.ts`
- `errorMessage`, `ApiError` — `web/src/lib/http.ts`
- `ResponsiveSheet`, `ErrorState`, `alert-dialog`, `Combobox`, `useToast`
- El patrón de `localStorage` con `try/catch` de `web/src/lib/theme.ts`
- Clases `type-<tipo>` y `typeLabel` — `web/src/lib/pokemon-types.ts`

## Verificación

1. `cd web && npm test`: todo en verde, incluidos los tests nuevos de cada tarea.
2. `npm run lint` y `npm run build` (`tsc -b && vite build`) sin errores.
3. Manual con `npm run dev` (skill `run`):
   - Importar un paste de 6: no aparecen errores falsos de "no aprende". Con DevTools bloqueando
     `/dex/learnsets/*` sale el error con Reintentar, y al desbloquear el reintento funciona.
   - Equipo sin el color requerido: Guardar queda deshabilitado y explica el motivo; el tipo del
     mes aparece como informativo y no bloquea.
   - Forzar un 422 del servidor (por ejemplo, un baneado): el mensaje se lee en español.
   - Armar medio equipo y recargar: aparece el aviso del borrador y Descartar funciona. Cerrar el
     sheet de Agregar con cambios pide confirmación.
   - Navegar con el teclado por la lista del equipo; axe/Lighthouse no reporta controles
     interactivos anidados.
   - Vaciar un movimiento o el objeto, filtrar el picker por generación y egg group, ordenar por
     velocidad y aplicar un preset de EVs.
4. Al cerrar: actualizar la nota del proyecto en Obsidian y `Bitácora/2026-10-12.md` (o la fecha
   en que se haga).
