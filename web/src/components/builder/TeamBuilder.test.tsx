import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "./TeamBuilder";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";

vi.mock("@/lib/dex/useLearnset", () => ({
  useLearnset: () => ({ learnset: [], error: null, retry: () => {} }),
  useLearnsets: () => ({ map: {}, pending: false, error: null, retry: () => {} }),
}));
vi.mock("@/components/builder/SetEditor", () => ({ SetEditor: () => <div>Editor</div> }));
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
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 2, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    dragonite: species("dragonite", "Dragonite", ["Dragon", "Flying"]),
    garchomp: species("garchomp", "Garchomp", ["Dragon", "Ground"]),
  },
  items: {},
};

const mon = (name: string): BuilderMon => ({ species: name, moves: [], evs: {}, ivs: {} });

describe("TeamBuilder", () => {
  it("muestra la debilidad compartida en el panel de cobertura de escritorio y en la hoja de reglas", async () => {
    const user = userEvent.setup();
    render(<TeamBuilder dex={dex} initial={[mon("Dragonite"), mon("Garchomp")]} season={{ restrictions: {} }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    const desktop = screen.getByRole("region", { name: "Cobertura de tipos" });
    expect(within(desktop).getAllByText("Hielo").length).toBeGreaterThan(0);
    expect(within(desktop).getAllByText(/Dragonite, Garchomp/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^Reglas/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("region", { name: "Cobertura de tipos" })).toBeInTheDocument();
  });

  it("la barra móvil resume la peor debilidad en una línea", () => {
    render(<TeamBuilder dex={dex} initial={[mon("Dragonite"), mon("Garchomp")]} season={{ restrictions: {} }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Reglas/ })).toHaveTextContent("2 débiles a Hielo");
  });

  it("con el equipo vacío el botón queda apagado y explica por qué", () => {
    render(<TeamBuilder dex={dex} initial={[]} season={{ restrictions: {} }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByText("El equipo está vacío")).toBeInTheDocument();
  });

  it("una regla que el servidor rechaza apaga el botón y se muestra su etiqueta", () => {
    render(<TeamBuilder dex={dex} initial={[mon("Dragonite")]} season={{ restrictions: { required_color: "Red" } }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByTestId("save-blockers")).toHaveTextContent(/color Red/);
  });

  it("tocar un motivo de bloqueo selecciona el slot culpable", async () => {
    const user = userEvent.setup();
    render(<TeamBuilder dex={dex} initial={[mon("Dragonite"), mon("Missingno")]} season={{ restrictions: {} }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Dragonite/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(screen.getByTestId("save-blockers")).getByRole("button", { name: /Missingno: 1 problema/ }));
    // En móvil, además, se abre el editor de ese slot en una hoja (deja el resto aria-hidden).
    expect(screen.getByRole("button", { name: /^MissingnoCon problemas/, hidden: true })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("el tipo del mes no apaga el botón", () => {
    render(<TeamBuilder dex={dex} initial={[mon("Dragonite")]} season={{ restrictions: {}, type_of_month: "Ice" }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });
});
