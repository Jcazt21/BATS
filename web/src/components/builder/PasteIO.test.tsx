import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasteIO } from "./PasteIO";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";

function species(over: Partial<Species> & { id: string; name: string }): Species {
  return {
    num: 445, types: ["Dragon", "Ground"], bst: 600, baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    color: "Blue", eggGroups: ["Monster", "Dragon"], gen: 4, tags: [], abilities: ["Sand Veil", "Rough Skin"],
    spriteid: over.id, baseSpecies: over.name, forme: null, prevo: null, isNonstandard: null, restricted: false,
    paradox: false, ultraBeast: false, pseudo: true, leagueLegal: true, ...over,
  };
}

const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    garchomp: species({ id: "garchomp", name: "Garchomp" }),
    gengar: species({ id: "gengar", name: "Gengar", types: ["Ghost", "Poison"] }),
  },
  items: {},
};

// El mismo bloque que showdown.test.ts (GARCHOMP).
const GARCHOMP_PASTE = `Garchomp @ Rocky Helmet
Ability: Rough Skin
Tera Type: Steel
EVs: 252 HP / 4 Atk / 252 SpD
Impish Nature
- Earthquake
- Dragon Tail
- Stealth Rock
- Spikes`;

describe("PasteIO", () => {
  it("importa un paste válido y produce un mon resuelto contra el dex", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<PasteIO dex={DEX} team={[]} maxSize={8} onImport={onImport} />);

    await user.type(screen.getByPlaceholderText(/Garchomp @/), GARCHOMP_PASTE);
    await user.click(screen.getByRole("button", { name: /Importar/ }));

    expect(onImport).toHaveBeenCalledTimes(1);
    const [mons, mode] = onImport.mock.calls[0];
    expect(mode).toBe("replace");
    expect(mons).toHaveLength(1);
    expect(mons[0]).toMatchObject({
      species: "Garchomp", held_item: "Rocky Helmet", ability: "Rough Skin", tera_type: "Steel",
      moves: ["Earthquake", "Dragon Tail", "Stealth Rock", "Spikes"],
    });
  });

  it("marca una especie inventada sin llamar a onImport", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<PasteIO dex={DEX} team={[]} maxSize={8} onImport={onImport} />);

    await user.type(screen.getByPlaceholderText(/Garchomp @/), "Missingno\n- Tackle");
    await user.click(screen.getByRole("button", { name: /Importar/ }));

    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Missingno");
  });

  it("rechaza un paste con más pokémon que el máximo permitido", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    render(<PasteIO dex={DEX} team={[]} maxSize={1} onImport={onImport} />);

    await user.type(screen.getByPlaceholderText(/Garchomp @/), "Garchomp\n\nGarchomp");
    await user.click(screen.getByRole("button", { name: /Importar/ }));

    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/máximo es 1/);
  });

  it("el botón de importar está deshabilitado sin texto", () => {
    render(<PasteIO dex={DEX} team={[]} maxSize={8} onImport={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Importar/ })).toBeDisabled();
  });

  describe("con un equipo ya armado", () => {
    const mon = (species: string): BuilderMon => ({ species, moves: [], evs: {}, ivs: {} });

    async function paste(text: string, team: BuilderMon[], maxSize: number) {
      const user = userEvent.setup();
      const onImport = vi.fn();
      render(<PasteIO dex={DEX} team={team} maxSize={maxSize} onImport={onImport} />);
      await user.type(screen.getByPlaceholderText(/Garchomp @/), text);
      await user.click(screen.getByRole("button", { name: /Importar/ }));
      return { user, onImport };
    }

    it("pide confirmar antes de reemplazar y no importa solo", async () => {
      const { user, onImport } = await paste("Gengar", [mon("Garchomp")], 6);
      expect(onImport).not.toHaveBeenCalled();
      expect(screen.getByText(/Esto reemplaza tus 1 pokémon/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Reemplazar" }));
      expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ species: "Gengar" })], "replace");
    });

    it("ofrece Agregar al final solo si cabe", async () => {
      const { user, onImport } = await paste("Gengar", [mon("Garchomp")], 2);
      await user.click(screen.getByRole("button", { name: "Agregar al final" }));
      expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ species: "Gengar" })], "append");
    });

    it("no ofrece Agregar al final si no cabe", async () => {
      await paste("Gengar", [mon("Garchomp")], 1);
      expect(screen.getByRole("button", { name: "Reemplazar" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Agregar al final" })).toBeNull();
    });

    it("al agregar omite las especies que ya están y lo avisa", async () => {
      const { user, onImport } = await paste("Garchomp\n\nGengar", [mon("Garchomp")], 2);
      await user.click(screen.getByRole("button", { name: "Agregar al final" }));
      expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ species: "Gengar" })], "append");
      expect(screen.getByText(/Omitimos Garchomp/)).toBeInTheDocument();
    });
  });
});
