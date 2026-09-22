import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasteIO } from "./PasteIO";
import type { Dex, Species } from "@/lib/dex/snapshot";

function species(over: Partial<Species> & { id: string; name: string }): Species {
  return {
    num: 445, types: ["Dragon", "Ground"], bst: 600, baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    color: "Blue", eggGroups: ["Monster", "Dragon"], gen: 4, tags: [], abilities: ["Sand Veil", "Rough Skin"],
    spriteid: over.id, baseSpecies: over.name, forme: null, prevo: null, isNonstandard: null, restricted: false,
    paradox: false, ultraBeast: false, pseudo: true, leagueLegal: true, ...over,
  };
}

const DEX: Dex = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: { garchomp: species({ id: "garchomp", name: "Garchomp" }) },
  moves: {}, items: {}, abilities: {}, natures: {},
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
    const [mons] = onImport.mock.calls[0];
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
});
