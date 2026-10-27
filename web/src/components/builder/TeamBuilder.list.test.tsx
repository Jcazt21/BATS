import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abrirMenu } from "@/lib/test-utils";
import { TeamBuilder } from "./TeamBuilder";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";

// SlotBoard NO se mockea: aquí se prueba el marcado real de la lista.
vi.mock("@/lib/dex/useLearnset", () => ({
  useLearnset: () => ({ learnset: [], error: null, retry: () => {} }),
  useLearnsets: () => ({ map: {}, pending: false, error: null, retry: () => {} }),
}));
vi.mock("@/components/builder/SetEditor", () => ({
  SetEditor: ({ mon }: { mon: BuilderMon }) => <div data-testid="editor">{mon.species}</div>,
}));
vi.mock("@/components/builder/SpeciesPicker", () => ({ SpeciesPicker: () => null }));

function species(id: string, name: string, types: string[]): Species {
  return {
    id, name, types, num: 1, bst: 300, baseStats: {}, color: "Blue", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true,
  };
}

const dex: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 3, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    dragonite: species("dragonite", "Dragonite", ["Dragon", "Flying"]),
    garchomp: species("garchomp", "Garchomp", ["Dragon", "Ground"]),
    gengar: species("gengar", "Gengar", ["Ghost", "Poison"]),
  },
  items: {},
};

const mon = (name: string): BuilderMon => ({ species: name, moves: [], evs: {}, ivs: {} });
const initial = [mon("Dragonite"), mon("Garchomp"), mon("Gengar")];

function renderBuilder(onSave = vi.fn()) {
  render(<TeamBuilder dex={dex} initial={initial} season={{ restrictions: {} }}
    banned={new Set()} maxSize={6} onSave={onSave} />);
}

/** Simula una pantalla ancha (≥768px) o angosta; devuelve cómo deshacerlo. */
function viewport(wide: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes("min-width: 768px"), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

describe("TeamBuilder: editor según el ancho", () => {
  it("escritorio: el editor ocupa la columna derecha y cambiar de slot cambia el editor", async () => {
    const restore = viewport(true);
    const user = userEvent.setup();
    renderBuilder();
    expect(screen.getByTestId("editor")).toHaveTextContent("Dragonite");
    await user.click(screen.getByRole("button", { name: /^Garchomp/ }));
    expect(screen.getByTestId("editor")).toHaveTextContent("Garchomp");
    restore();
  });

  it("móvil: el editor no se pinta hasta tocar un slot y entonces abre en una hoja", async () => {
    const restore = viewport(false);
    const user = userEvent.setup();
    renderBuilder();
    expect(screen.queryByTestId("editor")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Garchomp/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("editor")).toHaveTextContent("Garchomp");
    restore();
  });
});

describe("TeamBuilder: lista del equipo", () => {
  let restore: () => void;
  beforeEach(() => { restore = viewport(true); });
  afterEach(() => restore());

  it("no hay botones anidados ni listas dentro de listas", () => {
    renderBuilder();
    const list = screen.getByRole("list", { name: "Pokémon del equipo" });
    for (const b of within(list).getAllByRole("button")) {
      expect(b.parentElement?.closest("button")).toBeNull();
    }
    expect(list.querySelector("li li")).toBeNull();
    expect(list.querySelector("button button")).toBeNull();
  });

  it("quitar un pokémon anterior al seleccionado conserva el mismo seleccionado", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: /^Gengar/ }));
    expect(screen.getByTestId("editor")).toHaveTextContent("Gengar");
    const list = screen.getByRole("list", { name: "Pokémon del equipo" });
    await abrirMenu(within(list).getAllByRole("button", { name: /Más acciones/ })[0]);
    await user.click(screen.getByRole("menuitem", { name: /Quitar/ }));
    expect(screen.getByTestId("editor")).toHaveTextContent("Gengar");
    expect(screen.getByRole("button", { name: /^Gengar/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("onSave recibe BuilderMon[] planos", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderBuilder(onSave);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });
});
