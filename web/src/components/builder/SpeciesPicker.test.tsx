import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpeciesPicker } from "./SpeciesPicker";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";

vi.mock("@/components/app/ResponsiveSheet", () => ({
  ResponsiveSheet: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));
vi.mock("@/components/app/PokemonSprite", () => ({ PokemonSprite: () => null }));

function species(over: Partial<Species> & { id: string; name: string }): Species {
  return {
    num: 1, types: ["Normal"], bst: 300, baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 },
    color: "Brown", eggGroups: ["Field"], gen: 1, tags: [], abilities: [], spriteid: over.id, baseSpecies: over.name,
    forme: null, prevo: null, isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true, ...over,
  };
}

function dexOf(list: Species[]): DexEssentials {
  return {
    meta: { generated_at: "x", ps_commit: "x", counts: { species: list.length, moves: 0 }, formats: { league: "x", sparring: "x" } },
    species: Object.fromEntries(list.map((s) => [s.id, s])),
    items: {},
  };
}

const SMALL = dexOf([
  species({ id: "garchomp", name: "Garchomp", num: 445, gen: 4, color: "Blue", eggGroups: ["Monster", "Dragon"], baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } }),
  species({ id: "jolteon", name: "Jolteon", num: 135, gen: 1, color: "Yellow", baseStats: { hp: 65, atk: 65, def: 60, spa: 110, spd: 95, spe: 130 } }),
  species({ id: "missingno", name: "MissingNo.", num: 0, leagueLegal: false }),
]);

const names = () => screen.getAllByRole("listitem").map((li) => li.textContent ?? "");

describe("SpeciesPicker", () => {
  it("oculta por defecto las especies que no son legales en la liga", () => {
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByLabelText("Solo legales en la liga")).toBeChecked();
    expect(screen.queryByText("MissingNo.")).not.toBeInTheDocument();
  });

  it("filtra por generación y limpia los filtros", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Generación"), "4");
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.queryByText("Jolteon")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Limpiar filtros/ }));
    expect(screen.getByText("Jolteon")).toBeInTheDocument();
    expect(screen.getByLabelText("Solo legales en la liga")).toBeChecked();
  });

  it("filtra por color y por egg group", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Color"), "Yellow");
    expect(screen.queryByText("Garchomp")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Color"), "");
    await user.selectOptions(screen.getByLabelText("Egg group"), "Dragon");
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.queryByText("Jolteon")).not.toBeInTheDocument();
  });

  it("ordena por velocidad", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("Ordenar por"), "spe");
    const list = names();
    expect(list.findIndex((t) => t.includes("Jolteon"))).toBeLessThan(list.findIndex((t) => t.includes("Garchomp")));
  });

  it("avisa cuando hay más resultados de los que se muestran", () => {
    const many = dexOf(Array.from({ length: 65 }, (_, i) => species({ id: `mon${i}`, name: `Mon ${i}`, num: i + 1 })));
    render(<SpeciesPicker dex={many} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByText(/Mostrando 60 de 65/)).toBeInTheDocument();
  });

  it("muestra un atajo por cada regla que falta y aplica su filtro", async () => {
    const user = userEvent.setup();
    render(
      <SpeciesPicker
        dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()}
        hints={[
          { label: "Te falta un pokémon de color Yellow", filters: { color: "Yellow" } },
          { label: "Te falta un pokémon de la generación 4", filters: { gen: 4 } },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Lo que le falta al equipo" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    await user.click(within(group).getByRole("button", { name: /color Yellow/ }));
    expect(screen.getByText("Jolteon")).toBeInTheDocument();
    expect(screen.queryByText("Garchomp")).not.toBeInTheDocument();
  });
});
