# Cobertura de tipos + carga perezosa del dex — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un panel de cobertura de tipos / debilidades compartidas al team builder, y dejar de bloquear la carga inicial de `/equipo` con datos (`moves.json`, `natures.json`, `abilities.json`) que solo hacen falta al editar el set de un pokémon concreto.

**Architecture:**
- **Carga perezosa (Tasks 1-4):** el snapshot del dex se parte en `DexEssentials` (meta + species + items — lo que necesitan el picker, la lista y las reglas) y `DexDetails` (moves + natures — solo lo que usa `SetEditor`). `abilities.json` se deja de pedir: no lo consume nadie (`dex.abilities` no aparece en ningún componente). `SetEditor` pasa a pedir sus propios `DexDetails` vía un hook de React Query en vez de recibirlos por props, así el picker y la lista del equipo quedan interactivos sin esperar a `moves.json` (170KB). Esto se hace primero porque el resto del builder pasa a tipar su `dex` como `DexEssentials`.
- **Cobertura (Tasks 5-7):** motor puro (`lib/dex/coverage.ts`) que cruza los tipos del equipo (ya sobre `DexEssentials`) contra una tabla de efectividad estándar hardcodeada, más un panel de UI (`TypeCoveragePanel`) que se monta junto al `ChecklistPanel` existente en `TeamBuilder`. No toca backend ni el snapshot del dex.

**Tech Stack:** React + TypeScript, TanStack Query, Vitest + Testing Library (ya en uso en `bats/web`).

**Spec:** No hay spec architectural — se acordó directamente en brainstorming (alcance acotado, sin doc de diseño separado).

## Global Constraints

- Todo el código, comentarios y texto de UI **en español** (convención del repo, ver `CLAUDE.md`).
- Este cambio es exclusivo de la rama `dev` (ya activa) — no tocar `main`.
- `checkTeam`/`checkSet` en `lib/dex/validate.ts` son el espejo del cliente de `bats_core/rules.py`; esta plan NO cambia ninguna regla, solo el tipo de `dex` que reciben (de `Dex` a `DexEssentials`, ambos ya cubren lo que usan: `species` e `items`).
- Ningún archivo de este plan requiere tocar el backend (`bats_core/`) ni Showdown (`pokemon-showdown/`).
- Ejecutar todos los comandos de verificación desde `bats/web/`.
- **Orden de tareas no es negociable:** Tasks 1-4 (carga perezosa) tienen que ir antes que Tasks 5-7 (cobertura), porque el motor de cobertura tipa su parámetro `dex` como `DexEssentials`, que no existe hasta la Task 1.

---

### Task 1: Partir el snapshot del dex en `DexEssentials` / `DexDetails`

**Files:**
- Modify: `web/src/lib/dex/snapshot.ts`
- Modify: `web/src/lib/dex/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `export interface DexEssentials { meta: DexMeta; species: Record<string, Species>; items: Record<string, Item>; }`
  - `export interface DexDetails { moves: Record<string, Move>; natures: Record<string, Nature>; }`
  - `export type Dex = DexEssentials & DexDetails;` (se mantiene para tipar fixtures de test)
  - `loadDexEssentials(): Promise<DexEssentials>` y `loadDexDetails(): Promise<DexDetails>`, memoizados por separado, ambos comparten `meta.json` vía una caché interna (`loadMeta()`, no exportada).
  - `__resetDexForTests()` limpia las tres cachés.
  - `speciesById(dex: DexEssentials, nameOrId: string)` y `searchSpecies(dex: DexEssentials, ...)` (antes recibían `Dex`; `DexEssentials` es lo único que usan y `Dex` lo sigue satisfaciendo).
  - Se elimina `Ability`, `abilities` y `loadDex()`/`useDex()` (nadie los necesita tras esta tarea y la Task 2).
- Consumido por: Task 2 (`queries.ts`), Task 3 (`SetEditor.tsx`), Task 4 (resto de consumidores), Task 5 (`coverage.ts`).

- [ ] **Step 1: Reescribir el test del loader**

Reemplazar `web/src/lib/dex/snapshot.test.ts` completo:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDexForTests, loadDexDetails, loadDexEssentials, searchSpecies, speciesById, toId } from "./snapshot";
import { __resetLearnsetsForTests, loadLearnset } from "./learnsets";

const META = {
  generated_at: "2026-09-21T00:00:00.000Z",
  ps_commit: "abc1234",
  counts: { species: 2, moves: 1 },
  formats: { league: "gen9pinchesgueysleague", sparring: "gen9pglsparring" },
};

const SPECIES = {
  garchomp: {
    id: "garchomp", name: "Garchomp", num: 445, types: ["Dragon", "Ground"], bst: 600,
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 }, color: "Blue",
    eggGroups: ["Monster", "Dragon"], gen: 4, tags: [], abilities: ["Sand Veil", "Rough Skin"],
    spriteid: "garchomp", baseSpecies: "Garchomp", forme: null, prevo: "Gabite", isNonstandard: null,
    restricted: false, paradox: false, ultraBeast: false, pseudo: true, leagueLegal: true,
  },
  urshifurapidstrike: {
    id: "urshifurapidstrike", name: "Urshifu-Rapid-Strike", num: 892, types: ["Fighting", "Water"],
    bst: 550, baseStats: { hp: 100, atk: 130, def: 100, spa: 63, spd: 60, spe: 97 }, color: "Gray",
    eggGroups: ["Undiscovered"], gen: 8, tags: ["Sub-Legendary"], abilities: ["Unseen Fist"],
    spriteid: "urshifu-rapidstrike", baseSpecies: "Urshifu", forme: "Rapid-Strike", prevo: "Kubfu",
    isNonstandard: null, restricted: true, paradox: false, ultraBeast: false, pseudo: false,
    leagueLegal: true,
  },
};

const MOVES = {
  earthquake: {
    id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100,
    accuracy: 100, pp: 10, priority: 0, shortDesc: "Hits adjacent Pokemon.",
  },
};

const FILES: Record<string, unknown> = {
  "/dex/meta.json": META,
  [`/dex/species.json?v=${encodeURIComponent(META.generated_at)}`]: SPECIES,
  [`/dex/moves.json?v=${encodeURIComponent(META.generated_at)}`]: MOVES,
  [`/dex/items.json?v=${encodeURIComponent(META.generated_at)}`]: {},
  [`/dex/natures.json?v=${encodeURIComponent(META.generated_at)}`]: { impish: { name: "Impish", plus: "def", minus: "spa" } },
  "/dex/learnsets/g.json": { garchomp: ["earthquake", "dragontail"] },
  "/dex/learnsets/u.json": { urshifurapidstrike: ["closecombat", "surgingstrikes"] },
};

function installFetchMock() {
  let calls = 0;
  const seen: string[] = [];
  const fetchMock = vi.fn((url: string) => {
    calls++;
    seen.push(url);
    if (!(url in FILES)) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(FILES[url]) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls: () => calls, seen };
}

describe("loadDexEssentials", () => {
  beforeEach(() => {
    __resetDexForTests();
    __resetLearnsetsForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carga meta, species e items", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(dex.meta.ps_commit).toBe("abc1234");
    expect(dex.species.garchomp.name).toBe("Garchomp");
    expect(dex.items).toEqual({});
  });

  it("un solo fetch por archivo aunque se llame dos veces", async () => {
    const { fetchMock } = installFetchMock();
    await loadDexEssentials();
    await loadDexEssentials();
    // meta + species + items = 3 archivos, una vez cada uno.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("especie inexistente por nombre o id devuelve null", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(speciesById(dex, "Missingno")).toBeNull();
  });

  it("resuelve por nombre, id y forma", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(speciesById(dex, "garchomp")?.name).toBe("Garchomp");
    expect(speciesById(dex, "Garchomp")?.id).toBe("garchomp");
    expect(speciesById(dex, "Urshifu-Rapid-Strike")?.baseSpecies).toBe("Urshifu");
  });
});

describe("loadDexDetails", () => {
  beforeEach(() => {
    __resetDexForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carga moves y natures", async () => {
    installFetchMock();
    const details = await loadDexDetails();
    expect(details.moves.earthquake.basePower).toBe(100);
    expect(details.natures.impish.plus).toBe("def");
  });

  it("comparte el fetch de meta.json con loadDexEssentials", async () => {
    const { seen } = installFetchMock();
    await Promise.all([loadDexEssentials(), loadDexDetails()]);
    expect(seen.filter((u) => u === "/dex/meta.json").length).toBe(1);
    // meta (compartido) + species + items + moves + natures = 5 archivos.
    expect(seen.length).toBe(5);
  });
});

describe("searchSpecies", () => {
  it("busca por nombre y combina filtros", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(searchSpecies(dex, "gar").map((s) => s.id)).toEqual(["garchomp"]);
    expect(searchSpecies(dex, "", { type: "Water" }).map((s) => s.id)).toEqual(["urshifurapidstrike"]);
    expect(searchSpecies(dex, "", { type: "Water", gen: 4 })).toEqual([]);
    expect(searchSpecies(dex, "", { onlyLegal: true }).length).toBe(2);
  });
});

describe("toId", () => {
  it.each([
    ["Mr. Mime", "mrmime"], ["Urshifu-Rapid-Strike", "urshifurapidstrike"], [undefined, ""],
  ])("%s -> %s", (input, expected) => expect(toId(input as string)).toBe(expected));
});

describe("loadLearnset", () => {
  beforeEach(() => __resetLearnsetsForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("carga el bucket de la especie y cachea por bucket", async () => {
    const { fetchMock } = installFetchMock();
    expect(await loadLearnset("Garchomp")).toEqual(["earthquake", "dragontail"]);
    await loadLearnset("garchomp");
    expect(fetchMock).toHaveBeenCalledTimes(1); // mismo bucket, un solo fetch
    expect(await loadLearnset("Urshifu-Rapid-Strike")).toEqual(["closecombat", "surgingstrikes"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // bucket distinto
  });

  it("especie sin entrada en su bucket devuelve []", async () => {
    installFetchMock();
    expect(await loadLearnset("Gabite")).toEqual([]); // bucket "g" existe, pero sin "gabite"
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd web && npx vitest run src/lib/dex/snapshot.test.ts`
Expected: FAIL — `loadDexEssentials`/`loadDexDetails` no existen todavía.

- [ ] **Step 3: Reescribir el loader en `snapshot.ts`**

Reemplazar desde la interfaz `Ability` (línea 55) hasta el final de `loadDex`/`__resetDexForTests` (línea 116) — es decir, todo el bloque entre `export interface Nature` (línea 62) y el cierre de `__resetDexForTests` — por:

```ts
export interface Nature {
  name: string;
  plus: string | null;
  minus: string | null;
}

/** Lo que necesitan el picker, la lista del equipo y las reglas de temporada: nunca bloquea en moves/natures. */
export interface DexEssentials {
  meta: DexMeta;
  species: Record<string, Species>;
  items: Record<string, Item>;
}

/** Solo lo que usa SetEditor para pintar el formulario de un set (movimientos y naturalezas). */
export interface DexDetails {
  moves: Record<string, Move>;
  natures: Record<string, Nature>;
}

export type Dex = DexEssentials & DexDetails;

const DEX_BASE = "/dex";

let metaCache: Promise<DexMeta> | null = null;
let essentialsCache: Promise<DexEssentials> | null = null;
let detailsCache: Promise<DexDetails> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

/** `meta.json`, compartido por loadDexEssentials y loadDexDetails: un solo fetch aunque se llamen juntos. */
function loadMeta(): Promise<DexMeta> {
  if (!metaCache) {
    metaCache = fetchJson<DexMeta>(`${DEX_BASE}/meta.json`);
    metaCache.catch(() => {
      metaCache = null;
    });
  }
  return metaCache;
}

/**
 * Especies + objetos: lo que necesita el picker/lista del equipo y `checkTeam`/`checkSet` para
 * validar en vivo. Memoizado: un solo fetch por archivo mientras dure la sesión.
 */
export function loadDexEssentials(): Promise<DexEssentials> {
  if (!essentialsCache) {
    essentialsCache = (async () => {
      const meta = await loadMeta();
      const v = encodeURIComponent(meta.generated_at);
      const [species, items] = await Promise.all([
        fetchJson<Record<string, Species>>(`${DEX_BASE}/species.json?v=${v}`),
        fetchJson<Record<string, Item>>(`${DEX_BASE}/items.json?v=${v}`),
      ]);
      return { meta, species, items };
    })();
    essentialsCache.catch(() => {
      essentialsCache = null;
    });
  }
  return essentialsCache;
}

/**
 * Movimientos + naturalezas: solo los pide SetEditor, en paralelo con loadDexEssentials pero sin
 * bloquearlo — así el picker/lista del equipo no esperan por moves.json (170KB).
 */
export function loadDexDetails(): Promise<DexDetails> {
  if (!detailsCache) {
    detailsCache = (async () => {
      const meta = await loadMeta();
      const v = encodeURIComponent(meta.generated_at);
      const [moves, natures] = await Promise.all([
        fetchJson<Record<string, Move>>(`${DEX_BASE}/moves.json?v=${v}`),
        fetchJson<Record<string, Nature>>(`${DEX_BASE}/natures.json?v=${v}`),
      ]);
      return { moves, natures };
    })();
    detailsCache.catch(() => {
      detailsCache = null;
    });
  }
  return detailsCache;
}

/** Solo para tests: limpia las tres cachés memoizadas entre casos. */
export function __resetDexForTests(): void {
  metaCache = null;
  essentialsCache = null;
  detailsCache = null;
}
```

Y actualizar las firmas de `speciesById` y `searchSpecies` (más abajo en el mismo archivo) de `dex: Dex` a `dex: DexEssentials` — solo el tipo del parámetro cambia, el cuerpo de ambas funciones queda igual:

```ts
export function speciesById(dex: DexEssentials, nameOrId: string): Species | null {
  return dex.species[toId(nameOrId)] ?? null;
}
```

```ts
export function searchSpecies(dex: DexEssentials, query: string, filters: SpeciesFilters = {}): Species[] {
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd web && npx vitest run src/lib/dex/snapshot.test.ts`
Expected: PASS (todos los `describe` de arriba).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dex/snapshot.ts web/src/lib/dex/snapshot.test.ts
git commit -m "refactor(dex): partir el snapshot en essentials/details y dejar de pedir abilities.json"
```

---

### Task 2: Hooks de React Query y firma de `checkTeam`/`checkSet`

**Files:**
- Modify: `web/src/lib/queries.ts:8,140`
- Modify: `web/src/lib/dex/validate.ts:10-11,71,177,259`

**Interfaces:**
- Consumes: `DexEssentials`, `DexDetails`, `loadDexEssentials`, `loadDexDetails` de `./snapshot` (Task 1).
- Produces: `useDexEssentials()` y `useDexDetails()` (reemplazan a `useDex()`, que se elimina); `checkTeam(dex: DexEssentials, ...)` y `checkSet(dex: DexEssentials, ...)` (antes `dex: Dex`). Consumido por Task 3 y Task 4.

- [ ] **Step 1: Actualizar `queries.ts`**

Cambiar el import (línea 8):

```ts
import { loadDexEssentials, loadDexDetails } from "@/lib/dex/snapshot";
```

Y reemplazar la línea 140 (`export const useDex = ...`) por:

```ts
export const useDexEssentials = () =>
  useQuery({ queryKey: ["dex", "essentials"], queryFn: loadDexEssentials, staleTime: Infinity, gcTime: Infinity });

export const useDexDetails = () =>
  useQuery({ queryKey: ["dex", "details"], queryFn: loadDexDetails, staleTime: Infinity, gcTime: Infinity });
```

- [ ] **Step 2: Actualizar `validate.ts`**

Cambiar el import de tipos (línea 11):

```ts
import type { DexEssentials, Species } from "./snapshot";
```

Y las tres firmas que usan `dex: Dex` (líneas 71, 177, 259) por `dex: DexEssentials`:

```ts
function resolveEntries(dex: DexEssentials, team: BuilderMon[]): { entries: Entry[]; unknown: string[] } {
```

```ts
export function checkTeam(
  dex: DexEssentials,
  team: BuilderMon[],
  season: RuleSeason,
  banned: Set<string> = new Set(),
  lineup = false,
): CheckTeamResult {
```

```ts
export function checkSet(dex: DexEssentials, learnset: string[], mon: BuilderMon): string[] {
```

El cuerpo de las tres funciones no cambia (ya solo usan `dex.species`/`dex.items`).

- [ ] **Step 3: Verificar en modo watch que no queden referencias rotas**

Run: `cd web && npx tsc -b`
Expected: errores en los consumidores todavía no migrados (`TeamBuilder.tsx`, `SpeciesPicker.tsx`, `PasteIO.tsx`, `SetEditor.tsx`, `TeamPage.tsx`, `LeagueSettingsPage.tsx`) — se resuelven en las Tasks 3 y 4. Confirmar que los errores son solo en esos archivos y solo por `Dex`/`useDex` ya no exportados o por tipos incompatibles, nada en `queries.ts` ni `validate.ts`.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/queries.ts web/src/lib/dex/validate.ts
git commit -m "refactor(dex): useDexEssentials/useDexDetails y checkTeam/checkSet sobre DexEssentials"
```

---

### Task 3: `SetEditor` pide sus propios `DexDetails`

**Files:**
- Modify: `web/src/components/builder/SetEditor.tsx`
- Modify: `web/src/components/builder/SetEditor.test.tsx`

**Interfaces:**
- Consumes: `useDexDetails` de `@/lib/queries` (Task 2), `DexEssentials` de `@/lib/dex/snapshot` (Task 1), `Skeleton` de `@/components/ui/skeleton`, `ErrorState` de `@/components/app/States` (ambos ya existen y se usan así en `TeamPage.tsx`).
- Produces: `SetEditor({ mon, dex, onChange, errors }: { mon: BuilderMon; dex: DexEssentials; onChange; errors? })` — mismo nombre de prop `dex`, pero ahora tipado `DexEssentials`; ya no requiere `moves`/`natures` en el objeto que le pasan. Consumido por Task 4 (`TeamPage.tsx`, uso directo en `EditSetForm`) y Task 7 (integrado dentro de `TeamBuilder`).

- [ ] **Step 1: Actualizar el test para envolver en `QueryClientProvider` y mockear `DexDetails`**

Reemplazar `web/src/components/builder/SetEditor.test.tsx` completo:

```tsx
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetEditor } from "./SetEditor";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import { __resetDexForTests } from "@/lib/dex/snapshot";
import { __resetLearnsetsForTests } from "@/lib/dex/learnsets";
import type { BuilderMon } from "@/lib/dex/validate";

function species(over: Partial<Species> & { id: string; name: string }): Species {
  return {
    num: 1, types: ["Dragon", "Ground"], bst: 600, baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    color: "Blue", eggGroups: ["Monster", "Dragon"], gen: 4, tags: [], abilities: ["Sand Veil", "Rough Skin"],
    spriteid: over.id, baseSpecies: over.name, forme: null, prevo: null, isNonstandard: null, restricted: false,
    paradox: false, ultraBeast: false, pseudo: true, leagueLegal: true, ...over,
  };
}

const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: { garchomp: species({ id: "garchomp", name: "Garchomp" }) },
  items: { leftovers: { id: "leftovers", name: "Leftovers", desc: "" } },
};

const baseMon = (over: Partial<BuilderMon> = {}): BuilderMon => ({
  species: "garchomp", held_item: null, ability: null, nature: null, tera_type: null,
  moves: [], evs: {}, ivs: {}, ...over,
});

function installFetchMock() {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/dex/learnsets/g.json") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ garchomp: ["earthquake", "dragontail"] }) } as Response);
    }
    if (url === "/dex/meta.json") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(DEX.meta) } as Response);
    }
    if (url.startsWith("/dex/moves.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          earthquake: { id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100, accuracy: 100, pp: 10, priority: 0, shortDesc: "" },
          dragontail: { id: "dragontail", name: "Dragon Tail", type: "Dragon", category: "Physical", basePower: 60, accuracy: 90, pp: 10, priority: -6, shortDesc: "" },
        }),
      } as Response);
    }
    if (url.startsWith("/dex/natures.json")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          impish: { name: "Impish", plus: "def", minus: "spa" },
          timid: { name: "Timid", plus: "spe", minus: "atk" },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  }));
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SetEditor", () => {
  beforeEach(() => {
    __resetDexForTests();
    __resetLearnsetsForTests();
    installFetchMock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no ofrece un movimiento fuera del learnset", async () => {
    const user = userEvent.setup();
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    const [firstMoveCombo] = await screen.findAllByPlaceholderText(/Movimiento 1/);
    await user.type(firstMoveCombo, "Psychic"); // no está en el learnset de Garchomp
    expect(await screen.findByText("Sin movimientos legales que coincidan")).toBeInTheDocument();
    await user.clear(firstMoveCombo);
    await user.type(firstMoveCombo, "Earthquake");
    expect(await screen.findByRole("option", { name: /Earthquake/ })).toBeInTheDocument();
  });

  it("muestra el error de EVs junto al EVEditor", async () => {
    renderWithClient(
      <SetEditor
        mon={baseMon({ evs: { HP: 252, Atk: 252, Def: 252 } })}
        dex={DEX}
        onChange={vi.fn()}
        errors={["El total de EVs no puede pasar de 510 (tiene 756)."]}
      />,
    );
    expect(await screen.findByText(/no puede pasar de 510/)).toBeInTheDocument();
  });

  it("cambiar la naturaleza actualiza el resumen de stats", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [mon, setMon] = useState<BuilderMon>(baseMon());
      return <SetEditor mon={mon} dex={DEX} onChange={setMon} />;
    }
    renderWithClient(<Wrapper />);
    const summary = await screen.findByLabelText("Resumen de stats");
    const before = summary.textContent;

    const natureCombo = await screen.findByPlaceholderText("Elegir naturaleza");
    await user.click(natureCombo);
    await user.click(await screen.findByRole("option", { name: /Impish/ }));

    expect(screen.getByLabelText("Resumen de stats").textContent).not.toBe(before);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd web && npx vitest run src/components/builder/SetEditor.test.tsx`
Expected: FAIL — `SetEditor` todavía espera `dex.moves`/`dex.natures` por props, no via `useDexDetails`.

- [ ] **Step 3: Reescribir `SetEditor.tsx` para pedir sus propios `DexDetails`**

Cambiar los imports (líneas 1-8):

```tsx
import { useMemo, type ReactNode } from "react";
import { EVEditor } from "@/components/builder/EVEditor";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/app/States";
import { useLearnset } from "@/lib/dex/useLearnset";
import { useDexDetails } from "@/lib/queries";
import type { DexEssentials } from "@/lib/dex/snapshot";
import { speciesById, toId } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";
import { POKEMON_TYPES, typeLabel } from "@/lib/pokemon-types";
```

Cambiar la interfaz `Props` (líneas 10-15):

```tsx
interface Props {
  mon: BuilderMon;
  dex: DexEssentials;
  onChange: (mon: BuilderMon) => void;
  errors?: string[];
}
```

Al principio del cuerpo de `SetEditor` (después de `const learnset = useLearnset(species?.id ?? null);`, línea 48), agregar la carga de detalles y sus estados de espera/error, ANTES de los `useMemo` de `itemItems`/`natureItems`/`moveItems`/`abilityItems` (que pasan a usar `details.data`):

```tsx
export function SetEditor({ mon, dex, onChange, errors = [] }: Props) {
  const species = speciesById(dex, mon.species);
  const learnset = useLearnset(species?.id ?? null);
  const details = useDexDetails();

  const itemItems: ComboboxItem[] = useMemo(
    () => Object.values(dex.items).map((it) => ({ id: it.id, label: it.name })),
    [dex],
  );
  const natureItems: ComboboxItem[] = useMemo(
    () => Object.values(details.data?.natures ?? {}).map((n) => ({
      id: toId(n.name), label: n.name, sublabel: n.plus && n.minus ? `+${n.plus} / −${n.minus}` : "Neutra",
    })),
    [details.data],
  );
  const moveItems: ComboboxItem[] = useMemo(
    () => learnset
      .map((id) => details.data?.moves[id])
      .filter((mv): mv is NonNullable<typeof mv> => !!mv)
      .map((mv) => ({
        id: mv.id, label: mv.name,
        sublabel: `${mv.type} · ${mv.category}${mv.category === "Status" ? "" : ` · ${mv.basePower}`}`,
      })),
    [learnset, details.data],
  );
  const abilityItems: ComboboxItem[] = useMemo(
    () => (species?.abilities ?? []).map((a) => ({ id: toId(a), label: a })),
    [species],
  );

  if (!species) {
    return <p className="text-footnote text-muted-foreground">Elige una especie para editar su set.</p>;
  }

  if (details.isPending) {
    return <div className="flex flex-col gap-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-32" /></div>;
  }
  if (details.isError) {
    return <ErrorState error={details.error} onRetry={() => details.refetch()} />;
  }
  const dexDetails = details.data;
```

Y en el resto del componente, cambiar cada referencia a `dex.moves`/`dex.natures` por `dexDetails.moves`/`dexDetails.natures`:

- Línea `const move = dex.moves[moveId];` dentro de `setMove` → `const move = dexDetails.moves[moveId];`
- Línea `const nature = mon.nature ? dex.natures[toId(mon.nature)] : null;` → `const nature = mon.nature ? dexDetails.natures[toId(mon.nature)] : null;`

El resto del archivo (cálculo de `stats`, JSX de los campos, `ErrorList`, etc.) no cambia.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd web && npx vitest run src/components/builder/SetEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/builder/SetEditor.tsx web/src/components/builder/SetEditor.test.tsx
git commit -m "refactor(teambuilder): SetEditor pide sus propios DexDetails en vez de recibirlos por props"
```

---

### Task 4: Migrar el resto de consumidores de `Dex` a `DexEssentials`

**Files:**
- Modify: `web/src/components/builder/TeamBuilder.tsx:10,17-18`
- Modify: `web/src/components/builder/SpeciesPicker.tsx:8,21`
- Modify: `web/src/components/builder/PasteIO.tsx:4,11`
- Modify: `web/src/components/builder/PasteIO.test.tsx:5,16-19`
- Modify: `web/src/pages/TeamPage.tsx:20,43,94,119,266`
- Modify: `web/src/pages/admin/LeagueSettingsPage.tsx:11,19`
- Modify: `web/src/lib/dex/validate.test.ts` (revisar fixture `DEX`, no requiere cambios — ver Step 6)

**Interfaces:**
- Consumes: `DexEssentials` de `@/lib/dex/snapshot` (Task 1), `useDexEssentials` de `@/lib/queries` (Task 2).
- Produces: nada nuevo — cierra la migración de la parte de carga perezosa. Ningún archivo del proyecto sigue importando `useDex` ni tipando algo como `Dex` fuera de los tests. Deja a `TeamBuilder` con `dex: DexEssentials`, que es lo que consume la Task 7.

- [ ] **Step 1: `TeamBuilder.tsx`**

Cambiar el import de tipo (línea 10):

```ts
import type { DexEssentials } from "@/lib/dex/snapshot";
```

Y la prop `dex` en `Props` (línea 18):

```ts
interface Props {
  dex: DexEssentials;
  ...
```

- [ ] **Step 2: `SpeciesPicker.tsx`**

Cambiar el import (línea 8):

```ts
import type { DexEssentials, Species, SpeciesFilters } from "@/lib/dex/snapshot";
```

Y la prop `dex` (línea 21):

```ts
dex: DexEssentials;
```

- [ ] **Step 3: `PasteIO.tsx`**

Cambiar el import (línea 4):

```ts
import type { DexEssentials } from "@/lib/dex/snapshot";
```

Y la prop `dex` (línea 11):

```ts
dex: DexEssentials;
```

Actualizar también `PasteIO.test.tsx`: cambiar el import (línea 5) a `import type { DexEssentials, Species } from "@/lib/dex/snapshot";`, tipar el fixture como `const DEX: DexEssentials = {` y quitar `moves: {}, items: {}, abilities: {}, natures: {},` dejando solo `items: {},`:

```ts
const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: { garchomp: species({ id: "garchomp", name: "Garchomp" }) },
  items: {},
};
```

- [ ] **Step 4: `TeamPage.tsx`**

Cambiar el import de tipo (línea 20):

```ts
import type { DexEssentials } from "@/lib/dex/snapshot";
```

Cambiar el import de hooks (línea 26, dentro del bloque `useActiveSeason, useAddPokemon, ...`): reemplazar `useDex` por `useDexEssentials` en la lista.

Cambiar cada firma `dex: Dex` por `dex: DexEssentials` en:
- `toPayload(dex: Dex, mon: BuilderMon)` (línea 43) → `toPayload(dex: DexEssentials, mon: BuilderMon)`
- `const dex = useDex();` (línea 57) → `const dex = useDexEssentials();`
- `function Register({ dex, maxSize }: { dex: Dex; maxSize: number })` (línea 94) → `{ dex: DexEssentials; maxSize: number }`
- `function RosterView({ closed, dex }: { closed: boolean; dex: Dex })` (línea 119) → `{ closed: boolean; dex: DexEssentials }`
- `function EditSetForm({ dex, pokemon, onDone }: { dex: Dex; pokemon: RosterPokemon; onDone: () => void })` (línea 266) → `{ dex: DexEssentials; ... }`

Nada más cambia: todos los usos de `dex` en este archivo (`speciesById`, `checkSet`, pasarlo a `<TeamBuilder>` y `<SetEditor>`) ya solo tocan `species`/`items`.

- [ ] **Step 5: `LeagueSettingsPage.tsx`**

Cambiar el import (línea 11):

```ts
import { useAdminMutation, useDexEssentials, useDexMeta, useLeagueSettings } from "@/lib/queries";
```

Y la línea 19:

```ts
const staticDex = useDexEssentials();
```

- [ ] **Step 6: `validate.test.ts`**

Este archivo tipa su fixture como `const DEX: Dex = {...}` con `moves`/`natures` incluidos — sigue siendo válido porque `checkTeam`/`checkSet` ahora piden `DexEssentials` y un `Dex` completo lo satisface (tiene de sobra). **No requiere cambios.** Confirmar corriendo sus tests en el Step 7.

- [ ] **Step 7: Compilar y correr toda la suite de frontend**

Run: `cd web && npx tsc -b`
Expected: 0 errores.

Run: `cd web && npx vitest run`
Expected: todos los tests pasan, incluidos `snapshot.test.ts`, `SetEditor.test.tsx`, `PasteIO.test.tsx`, `validate.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/builder/TeamBuilder.tsx web/src/components/builder/SpeciesPicker.tsx \
  web/src/components/builder/PasteIO.tsx web/src/components/builder/PasteIO.test.tsx \
  web/src/pages/TeamPage.tsx web/src/pages/admin/LeagueSettingsPage.tsx
git commit -m "refactor(teambuilder): migrar consumidores de Dex a DexEssentials"
```

---

### Task 5: Motor de cobertura de tipos (`lib/dex/coverage.ts`)

**Files:**
- Create: `web/src/lib/dex/coverage.ts`
- Test: `web/src/lib/dex/coverage.test.ts`

**Interfaces:**
- Consumes: `PokemonType`, `POKEMON_TYPES`, `parseTypes` de `@/lib/pokemon-types`; `DexEssentials`, `Species` y `speciesById` de `./snapshot` (Task 1); `BuilderMon` de `./validate`.
- Produces: `multiplierAgainst(attack: PokemonType, defendTypes: PokemonType[]): number` y `computeTypeCoverage(dex: DexEssentials, team: BuilderMon[]): CoverageRow[]`, donde:
  ```ts
  export interface CoverageRow {
    type: PokemonType;
    weak: string[];
    resist: string[];
    immune: string[];
    sharedWeakness: boolean;
  }
  ```
  Usados por la Task 6 (`TypeCoveragePanel`) y la Task 7 (`TeamBuilder`).

- [ ] **Step 1: Escribir el test de la tabla de efectividad y `multiplierAgainst`**

```ts
// web/src/lib/dex/coverage.test.ts
import { describe, expect, it } from "vitest";
import { computeTypeCoverage, multiplierAgainst } from "./coverage";
import type { BuilderMon } from "./validate";
import type { DexEssentials, Species } from "./snapshot";

function species(over: Partial<Species> & { id: string; name: string; types: string[] }): Species {
  return {
    num: 1, bst: 300, baseStats: { hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 },
    color: "Red", eggGroups: ["Field"], gen: 1, tags: [], abilities: [], spriteid: over.id,
    baseSpecies: over.name, forme: null, prevo: null, isNonstandard: null, restricted: false,
    paradox: false, ultraBeast: false, pseudo: false, leagueLegal: true, ...over,
  };
}

describe("multiplierAgainst", () => {
  it("multiplica cuando ambos tipos son débiles al ataque", () => {
    expect(multiplierAgainst("ice", ["dragon", "flying"])).toBe(4);
  });
  it("combina resistencia doble", () => {
    expect(multiplierAgainst("fire", ["fire", "water"])).toBe(0.25);
  });
  it("inmunidad anula el resto", () => {
    expect(multiplierAgainst("ground", ["flying", "normal"])).toBe(0);
  });
  it("neutral cuando no hay relación especial", () => {
    expect(multiplierAgainst("normal", ["water"])).toBe(1);
  });
});

describe("computeTypeCoverage", () => {
  const DEX: DexEssentials = {
    meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
    species: {
      dragonite: species({ id: "dragonite", name: "Dragonite", types: ["Dragon", "Flying"] }),
      garchomp: species({ id: "garchomp", name: "Garchomp", types: ["Dragon", "Ground"] }),
      corviknight: species({ id: "corviknight", name: "Corviknight", types: ["Flying", "Steel"] }),
    },
    items: {},
  };
  const mon = (species: string): BuilderMon => ({
    species, held_item: null, ability: null, nature: null, tera_type: null, moves: [], evs: {}, ivs: {},
  });

  it("marca debilidad compartida cuando 2+ pokémon reciben 2x o más", () => {
    const rows = computeTypeCoverage(DEX, [mon("dragonite"), mon("garchomp")]);
    const ice = rows.find((r) => r.type === "ice")!;
    expect(ice.weak).toEqual(["Dragonite", "Garchomp"]);
    expect(ice.sharedWeakness).toBe(true);
  });

  it("no marca debilidad compartida con un solo pokémon afectado", () => {
    const rows = computeTypeCoverage(DEX, [mon("dragonite"), mon("corviknight")]);
    const ice = rows.find((r) => r.type === "ice")!;
    expect(ice.weak).toEqual(["Dragonite"]);
    expect(ice.sharedWeakness).toBe(false);
  });

  it("ignora especies que no existen en el dex", () => {
    const rows = computeTypeCoverage(DEX, [mon("missingno")]);
    expect(rows.every((r) => r.weak.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd web && npx vitest run src/lib/dex/coverage.test.ts`
Expected: FAIL — `Cannot find module './coverage'`.

- [ ] **Step 3: Implementar la tabla de efectividad y las funciones**

```ts
// web/src/lib/dex/coverage.ts
/**
 * Cobertura de tipos del equipo: tabla de efectividad estándar (gen 6+, con Hada) hardcodeada
 * porque el snapshot del dex no trae type chart. Puro y sin red: solo cruza `sp.types` contra
 * el ataque de cada uno de los 18 tipos.
 */
import { parseTypes, POKEMON_TYPES, type PokemonType } from "@/lib/pokemon-types";
import type { DexEssentials, Species } from "./snapshot";
import { speciesById } from "./snapshot";
import type { BuilderMon } from "./validate";

const SUPER_EFFECTIVE: Record<PokemonType, PokemonType[]> = {
  normal: [], fire: ["grass", "ice", "bug", "steel"], water: ["fire", "ground", "rock"],
  electric: ["water", "flying"], grass: ["water", "ground", "rock"], ice: ["grass", "ground", "flying", "dragon"],
  fighting: ["normal", "ice", "rock", "dark", "steel"], poison: ["grass", "fairy"],
  ground: ["fire", "electric", "poison", "rock", "steel"], flying: ["grass", "fighting", "bug"],
  psychic: ["fighting", "poison"], bug: ["grass", "psychic", "dark"], rock: ["fire", "ice", "flying", "bug"],
  ghost: ["psychic", "ghost"], dragon: ["dragon"], dark: ["psychic", "ghost"], steel: ["ice", "rock", "fairy"],
  fairy: ["fighting", "dragon", "dark"],
};

const NOT_VERY_EFFECTIVE: Record<PokemonType, PokemonType[]> = {
  normal: ["rock", "steel"], fire: ["fire", "water", "rock", "dragon"], water: ["water", "grass", "dragon"],
  electric: ["electric", "grass", "dragon"], grass: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
  ice: ["fire", "water", "ice", "steel"], fighting: ["poison", "flying", "psychic", "bug", "fairy"],
  poison: ["poison", "ground", "rock", "ghost"], ground: ["grass", "bug"], flying: ["electric", "rock", "steel"],
  psychic: ["psychic", "steel"], bug: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
  rock: ["fighting", "ground", "steel"], ghost: ["dark"], dragon: ["steel"], dark: ["fighting", "dark", "fairy"],
  steel: ["fire", "water", "electric", "steel"], fairy: ["fire", "poison", "steel"],
};

const NO_EFFECT: Record<PokemonType, PokemonType[]> = {
  normal: ["ghost"], fire: [], water: [], electric: ["ground"], grass: [], ice: [],
  fighting: ["ghost"], poison: ["steel"], ground: ["flying"], flying: [], psychic: ["dark"], bug: [],
  rock: [], ghost: ["normal"], dragon: ["fairy"], dark: [], steel: [], fairy: [],
};

function multiplierAgainstType(attack: PokemonType, defend: PokemonType): number {
  if (NO_EFFECT[attack].includes(defend)) return 0;
  if (SUPER_EFFECTIVE[attack].includes(defend)) return 2;
  if (NOT_VERY_EFFECTIVE[attack].includes(defend)) return 0.5;
  return 1;
}

/** Multiplicador de un tipo de ataque contra uno o dos tipos defensivos (se multiplican entre sí). */
export function multiplierAgainst(attack: PokemonType, defendTypes: PokemonType[]): number {
  return defendTypes.reduce((acc, t) => acc * multiplierAgainstType(attack, t), 1);
}

export interface CoverageRow {
  type: PokemonType;
  /** Nombres de especie que reciben 2x o más de este tipo de ataque. */
  weak: string[];
  /** Nombres de especie que resisten (menos de 1x, sin ser inmunes). */
  resist: string[];
  /** Nombres de especie inmunes (0x). */
  immune: string[];
  /** true cuando 2 o más pokémon del equipo comparten la debilidad. */
  sharedWeakness: boolean;
}

/** Una fila por cada uno de los 18 tipos de ataque, con qué miembros del equipo pega fuerte, resiste o esquiva. */
export function computeTypeCoverage(dex: DexEssentials, team: BuilderMon[]): CoverageRow[] {
  const mons = team
    .map((m) => speciesById(dex, m.species))
    .filter((sp): sp is Species => !!sp);

  return POKEMON_TYPES.map((type) => {
    const weak: string[] = [];
    const resist: string[] = [];
    const immune: string[] = [];
    for (const sp of mons) {
      const defendTypes = parseTypes(sp.types.join(" / "));
      const mult = multiplierAgainst(type, defendTypes);
      if (mult === 0) immune.push(sp.name);
      else if (mult >= 2) weak.push(sp.name);
      else if (mult < 1) resist.push(sp.name);
    }
    return { type, weak, resist, immune, sharedWeakness: weak.length >= 2 };
  });
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd web && npx vitest run src/lib/dex/coverage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dex/coverage.ts web/src/lib/dex/coverage.test.ts
git commit -m "feat(teambuilder): motor de cobertura de tipos y debilidades compartidas"
```

---

### Task 6: Panel de UI (`TypeCoveragePanel`)

**Files:**
- Create: `web/src/components/team/TypeCoveragePanel.tsx`
- Test: `web/src/components/team/TypeCoveragePanel.test.tsx`

**Interfaces:**
- Consumes: `CoverageRow` de `@/lib/dex/coverage` (Task 5), `TypeBadge` de `@/components/app/TypeBadge` (ya existe, usa `type-<slug>` de `index.css`).
- Produces: `TypeCoveragePanel({ rows, empty }: { rows: CoverageRow[]; empty?: boolean }): JSX.Element`, consumido por la Task 7.

- [ ] **Step 1: Escribir el test**

```tsx
// web/src/components/team/TypeCoveragePanel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeCoveragePanel } from "./TypeCoveragePanel";
import type { CoverageRow } from "@/lib/dex/coverage";
import { POKEMON_TYPES, type PokemonType } from "@/lib/pokemon-types";

function emptyRows(): CoverageRow[] {
  return POKEMON_TYPES.map((type) => ({ type, weak: [], resist: [], immune: [], sharedWeakness: false }));
}

function withWeakness(type: PokemonType, weak: string[]): CoverageRow[] {
  return emptyRows().map((r) => (r.type === type ? { ...r, weak, sharedWeakness: weak.length >= 2 } : r));
}

describe("TypeCoveragePanel", () => {
  it("muestra el estado vacío cuando no hay pokémon", () => {
    render(<TypeCoveragePanel rows={emptyRows()} empty />);
    expect(screen.getByText(/Agrega pokémon para ver su cobertura/)).toBeInTheDocument();
  });

  it("muestra el estado sin debilidades compartidas", () => {
    render(<TypeCoveragePanel rows={emptyRows()} />);
    expect(screen.getByText(/Sin debilidades compartidas/)).toBeInTheDocument();
  });

  it("lista las especies débiles de un tipo compartido", () => {
    render(<TypeCoveragePanel rows={withWeakness("ice", ["Dragonite", "Garchomp"])} />);
    expect(screen.getByText(/Dragonite, Garchomp/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd web && npx vitest run src/components/team/TypeCoveragePanel.test.tsx`
Expected: FAIL — `Cannot find module './TypeCoveragePanel'`.

- [ ] **Step 3: Implementar el componente**

```tsx
// web/src/components/team/TypeCoveragePanel.tsx
import { TypeBadge } from "@/components/app/TypeBadge";
import type { CoverageRow } from "@/lib/dex/coverage";

/**
 * Tipos de ataque que golpean con 2x o más a dos o más pokémon del equipo a la vez.
 * Complementa a ChecklistPanel: eso valida reglas de temporada, esto avisa de huecos
 * defensivos que el equipo comparte (sin mirar movimientos, solo tipos de especie).
 */
export function TypeCoveragePanel({ rows, empty }: { rows: CoverageRow[]; empty?: boolean }) {
  const shared = rows.filter((r) => r.sharedWeakness).sort((a, b) => b.weak.length - a.weak.length);

  return (
    <section aria-label="Cobertura de tipos" className="flex flex-col gap-2">
      <h3 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">
        Debilidades compartidas
      </h3>
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {empty ? (
          <p className="px-4 py-3 text-subhead text-muted-foreground">Agrega pokémon para ver su cobertura.</p>
        ) : shared.length === 0 ? (
          <p className="px-4 py-3 text-subhead text-muted-foreground">
            Sin debilidades compartidas: ningún tipo golpea con fuerza a 2 o más de tus pokémon a la vez.
          </p>
        ) : (
          <ul aria-live="polite" className="[&>li+li]:border-t [&>li+li]:border-separator">
            {shared.map((r) => (
              <li key={r.type} className="flex items-start gap-3 px-4 py-3">
                <TypeBadge type={r.type} />
                <span className="min-w-0 flex-1 text-footnote text-destructive">Débil: {r.weak.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd web && npx vitest run src/components/team/TypeCoveragePanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/team/TypeCoveragePanel.tsx web/src/components/team/TypeCoveragePanel.test.tsx
git commit -m "feat(teambuilder): panel de debilidades de tipo compartidas"
```

---

### Task 7: Conectar el panel a `TeamBuilder`

**Files:**
- Modify: `web/src/components/builder/TeamBuilder.tsx`

**Interfaces:**
- Consumes: `computeTypeCoverage` (Task 5), `TypeCoveragePanel` (Task 6). `TeamBuilder` ya tipa su prop `dex` como `DexEssentials` desde la Task 4, que es justo lo que pide `computeTypeCoverage`.
- Produces: nada nuevo para otras tareas — es el punto de integración final.

- [ ] **Step 1: Importar y calcular la cobertura**

En `web/src/components/builder/TeamBuilder.tsx`, agregar el import junto a los demás de `@/lib/dex/*` (línea 13):

```ts
import { checkSet, checkTeam, type BuilderMon, type RuleSeason } from "@/lib/dex/validate";
import { computeTypeCoverage } from "@/lib/dex/coverage";
```

y añadir `useMemo` a la import de React (línea 1):

```ts
import { useMemo, useState } from "react";
```

Dentro del componente, junto a `const { rows } = checkTeam(...)` (línea 65), agregar:

```ts
const coverage = useMemo(() => computeTypeCoverage(dex, team), [dex, team]);
```

- [ ] **Step 2: Importar `TypeCoveragePanel` y montarlo junto al `ChecklistPanel`**

Import (junto a `ChecklistPanel`, línea 4):

```ts
import { ChecklistPanel } from "@/components/team/ChecklistPanel";
import { TypeCoveragePanel } from "@/components/team/TypeCoveragePanel";
```

Reemplazar el bloque de escritorio (líneas 161-164):

```tsx
      {/* Escritorio: reglas siempre visibles. */}
      <div className="hidden sm:block">
        <ChecklistPanel rows={rows} empty={team.length === 0} />
      </div>
```

por:

```tsx
      {/* Escritorio: reglas y cobertura siempre visibles. */}
      <div className="hidden flex-col gap-4 sm:flex">
        <ChecklistPanel rows={rows} empty={team.length === 0} />
        <TypeCoveragePanel rows={coverage} empty={team.length === 0} />
      </div>
```

Y dentro del `CollapsibleContent` móvil (líneas 173-175):

```tsx
          <CollapsibleContent className="max-h-[50vh] overflow-y-auto px-4 pb-4">
            <ChecklistPanel rows={rows} empty={team.length === 0} />
          </CollapsibleContent>
```

por:

```tsx
          <CollapsibleContent className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto px-4 pb-4">
            <ChecklistPanel rows={rows} empty={team.length === 0} />
            <TypeCoveragePanel rows={coverage} empty={team.length === 0} />
          </CollapsibleContent>
```

- [ ] **Step 3: Verificar manualmente**

Run: `cd web && npx tsc -b`
Expected: sin errores nuevos.

Run: `cd web && npx vitest run`
Expected: todo pasa (no hay test de `TeamBuilder.tsx` en sí; esto solo confirma que no rompiste nada).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/builder/TeamBuilder.tsx
git commit -m "feat(teambuilder): mostrar debilidades compartidas junto al checklist"
```

---

### Task 8: Verificación de punta a punta

**Files:** ninguno (solo comandos).

- [ ] **Step 1: Lint, typecheck, tests y build completos**

Run (desde `web/`):

```bash
cd web
npx tsc -b
npm run lint            # los 4 errores preexistentes de ETLCleanerPage siguen ahí, nada nuevo
npx vitest run
npm run build
```

Expected: `tsc` y `vitest` en verde; `lint` sin errores nuevos fuera de los 4 preexistentes; `build` termina sin fallar.

- [ ] **Step 2: Probar manualmente en el navegador**

Run: `npm run dev` (con `python -m bats_core api` corriendo aparte, como describe `PLAN_TEAMBUILDER.md`).

En `/equipo`, con una temporada activa:
1. Confirmar que el picker de especies abre y filtra sin demora perceptible (essentials).
2. Agregar 2 pokémon con un tipo débil compartido (p. ej. Dragonite + Garchomp, débiles a Hielo) y confirmar que aparece "Debilidades compartidas" con Hielo listado.
3. Abrir el editor de set de un pokémon recién agregado y confirmar que movimientos/naturaleza cargan (puede haber un parpadeo breve del skeleton si la red es lenta) y que el learnset sigue filtrando igual que antes.
4. En las devtools → Network, confirmar que `abilities.json` ya NO se pide.

- [ ] **Step 3: Commit final si hubo ajustes**

Solo si el Step 2 reveló algo que corregir; si todo pasó en los pasos anteriores, no hay nada que commitear aquí.
