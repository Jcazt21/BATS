import { useState, type ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const switchLegal = () => screen.getByRole("switch", { name: "Solo legales en la liga" });
const masFiltros = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Más filtros" }));

describe("SpeciesPicker", () => {
  it("oculta por defecto las especies que no son legales en la liga", () => {
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    expect(switchLegal()).toBeChecked();
    expect(screen.queryByText("MissingNo.")).not.toBeInTheDocument();
  });

  it("'Solo legales' es un switch accesible", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await user.click(switchLegal());
    expect(switchLegal()).not.toBeChecked();
    expect(screen.getByText("MissingNo.")).toBeInTheDocument();
  });

  it("no usa <select> nativos y los filtros son chips", async () => {
    const user = userEvent.setup();
    const { container } = render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await masFiltros(user);
    expect(container.querySelector("select")).toBeNull();
    expect(within(screen.getByRole("group", { name: "Generación" })).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("filtra por generación y limpia los filtros", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await masFiltros(user);
    await user.click(within(screen.getByRole("group", { name: "Generación" })).getByRole("button", { name: "Gen 4" }));
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.queryByText("Jolteon")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Limpiar filtros/ }));
    expect(screen.getByText("Jolteon")).toBeInTheDocument();
    expect(switchLegal()).toBeChecked();
  });

  it("filtra por color y por egg group", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await masFiltros(user);
    await user.click(within(screen.getByRole("group", { name: "Color" })).getByRole("button", { name: "Yellow" }));
    expect(screen.queryByText("Garchomp")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "Color" })).getByRole("button", { name: "Yellow" }));
    await user.click(within(screen.getByRole("group", { name: "Egg group" })).getByRole("button", { name: "Dragon" }));
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
    expect(screen.queryByText("Jolteon")).not.toBeInTheDocument();
  });

  it("ordena por velocidad", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    await masFiltros(user);
    await user.click(screen.getByRole("radio", { name: "Veloc." }));
    const list = names();
    expect(list.findIndex((t) => t.includes("Jolteon"))).toBeLessThan(list.findIndex((t) => t.includes("Garchomp")));
  });

  it("no corta en 60 sin avisar: 'Ver más' muestra el resto", async () => {
    const user = userEvent.setup();
    const many = dexOf(Array.from({ length: 65 }, (_, i) => species({ id: `mon${i}`, name: `Mon ${i}`, num: i + 1 })));
    render(<SpeciesPicker dex={many} open onOpenChange={vi.fn()} onPick={vi.fn()} />);
    expect(screen.getByText(/Mostrando 60 de 65/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
    expect(screen.getByText("Mon 64")).toBeInTheDocument();
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

  it("abrir con initialFilters precarga el filtro y lo muestra como chip removible", async () => {
    const user = userEvent.setup();
    render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()} initialFilters={{ color: "yellow" }} />);
    expect(screen.queryByText("Garchomp")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar filtro Color yellow" }));
    expect(screen.getByText("Garchomp")).toBeInTheDocument();
  });

  it("una especie ya en el equipo queda deshabilitada con 'En el equipo'; un baneado dice por qué", () => {
    render(
      <SpeciesPicker
        dex={SMALL} open onOpenChange={vi.fn()} onPick={vi.fn()}
        team={[{ species: "Garchomp", moves: [], evs: {}, ivs: {} }]} banned={new Set(["jolteon"])}
      />,
    );
    expect(screen.getByRole("button", { name: /Garchomp/ })).toBeDisabled();
    expect(screen.getByText("En el equipo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jolteon/ })).toBeDisabled();
    expect(screen.getByText("Baneado esta temporada")).toBeInTheDocument();
  });

  describe("agregar y seguir (keepOpen)", () => {
    function Harness({ max = 2, onOpenChange = vi.fn() }: { max?: number; onOpenChange?: (o: boolean) => void }) {
      const [team, setTeam] = useState<{ species: string; moves: string[]; evs: Record<string, number>; ivs: Record<string, number> }[]>([]);
      return (
        <SpeciesPicker
          dex={SMALL} open keepOpen onOpenChange={onOpenChange} team={team} progress={{ count: team.length, max }}
          onPick={(sp) => setTeam((t) => [...t, { species: sp.name, moves: [], evs: {}, ivs: {} }])}
        />
      );
    }

    it("elegir una especie la agrega, confirma 'Agregado' y deja el buscador abierto", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<Harness max={3} onOpenChange={onOpenChange} />);
      expect(screen.getByRole("status")).toHaveTextContent("0/3");
      await user.click(screen.getByRole("button", { name: /Garchomp/ }));
      expect(screen.getByRole("status")).toHaveTextContent("Agregado: Garchomp");
      expect(screen.getByRole("status")).toHaveTextContent("1/3");
      expect(screen.getByRole("button", { name: /Garchomp/ })).toBeDisabled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("se cierra solo al llenar el equipo", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<Harness max={2} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /Garchomp/ }));
      await user.click(screen.getByRole("button", { name: /Jolteon/ }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("teclado", () => {
    it("↑/↓ recorre los resultados, Enter agrega y '/' enfoca la búsqueda", async () => {
      const user = userEvent.setup();
      const onPick = vi.fn();
      render(<SpeciesPicker dex={SMALL} open onOpenChange={vi.fn()} onPick={onPick} />);
      const search = screen.getByRole("textbox", { name: "Buscar especie" });
      search.focus();
      await user.keyboard("{ArrowDown}{Enter}");
      expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Garchomp" })); // nº 135 Jolteon va primero; ↓ baja a Garchomp
      onPick.mockClear();
      await user.keyboard("{ArrowUp}{Enter}");
      expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Jolteon" }));

      screen.getByRole("button", { name: "Más filtros" }).focus();
      await user.keyboard("/");
      expect(search).toHaveFocus();
      expect(search).toHaveValue("");
    });

    it("no anima al navegar con el teclado (el resaltado no tiene transición)", () => {
      const src = readFileSync(resolve(__dirname, "SpeciesPicker.tsx"), "utf8");
      expect(src).not.toMatch(/data-\[active\][^"]*transition/);
    });
  });
});
